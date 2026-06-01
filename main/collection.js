// 口袋图鉴模块
// userData/collection.json: { items: [...], lastRebuildAt }
// item: {
//   id, title, category, emoji, description,
//   factTexts: [...],     // 来自长期记忆，构建依据
//   snippets: [...],      // 关联对话片段
//   firstAt, lastAt
// }
const fs = require('fs');
const path = require('path');
const llmModule = require('./llm');

const CATEGORIES = ['人物', '宠物', '食物', '地点', '物件', '习惯', '兴趣', '工作', '其他'];

let dataPath = null;

function init(userDataPath) {
  dataPath = path.join(userDataPath, 'collection.json');
}

function load() {
  if (!dataPath) return { items: [], lastRebuildAt: 0 };
  try {
    const obj = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    if (!obj.items) obj.items = [];
    return obj;
  } catch (e) {
    return { items: [], lastRebuildAt: 0 };
  }
}

function save(obj) {
  if (!dataPath) return;
  try { fs.writeFileSync(dataPath, JSON.stringify(obj, null, 2)); }
  catch (e) { console.error('[collection] save failed:', e.message); }
}

function list() { return load(); }
function get(id) {
  const data = load();
  return data.items.find(i => i.id === id) || null;
}
function clear() { save({ items: [], lastRebuildAt: 0 }); return true; }

function uid() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

async function rebuild({ allFacts, recentChat, llmCfg, maxTokens, minSnippets, maxSnippets, excludeTitles }) {
  if (!llmCfg || !llmCfg.enabled) throw new Error('LLM 未启用');
  if (!allFacts || allFacts.length === 0) {
    return { items: [], skipped: true, reason: '还没有任何长期记忆，先聊一会儿吧~' };
  }
  // 过滤词：角色名 + 与角色互动的常见动词。LLM 输出后过滤，老卡片合并时也过滤
  const excludeSet = new Set((excludeTitles || []).map(s => String(s).trim()).filter(Boolean));

  const min = Math.max(1, minSnippets || 1);
  const max = Math.max(min, maxSnippets || 3);

  const factsText = allFacts.map((f, i) => (i + 1) + '. ' + f).join('\n');
  // 给对话加索引，让 LLM 能引用。每条标注是哪个角色聊的，避免混淆。
  // 助手回复用具体角色名（如"我(Hiyori)"/"我(小埋)"）便于 LLM 区分场景
  const chatIndexed = (recentChat || []).slice(-50)
    .map((m, i) => {
      const speaker = m.role === 'user'
        ? '主人'
        : '我' + (m.modelId ? `(${m.modelId})` : '');
      return `[${i}] ${speaker}: ${(m.content || '').slice(0, 150)}`;
    })
    .join('\n');

  // 把老卡片的现状告诉 LLM，让它做"增量补充"而不是"重写"
  const oldData = load();
  const oldCardsText = oldData.items.length
    ? oldData.items.map(it =>
        `- 「${it.title}」(${it.category} ${it.emoji || ''}): ${it.description || '(无描述)'}`
      ).join('\n')
    : '(暂无)';

  const sysPrompt = `你是"口袋图鉴"整理助手。从主人的长期记忆事实中提取**值得收藏的实体**，整理成卡片图鉴。

类别（必须从中选一个）: ${CATEGORIES.join(' / ')}
emoji 选择请贴合实体（人物用 👤👩👨, 宠物用对应动物 🐱🐶🐰, 食物用具体食物 🍞🥛🍓, 地点 📍, 物件 📦, 习惯 ⏰, 兴趣 🎮, 工作 💼, 其他 ✨ 等）

提取规则:
- 每条事实判断是否承载某个"实体"。例如"主人养了只叫豆子的猫" → 实体「豆子」(category=宠物)
- 同一实体多条事实合并到一张卡片
- 模糊的、瞬时的、过于宽泛的不收（"主人最近很忙" 这种不算实体）
- 最多输出 30 张卡片

**关键：不要把桌宠角色当成"实体"收录**
- 对话里"我(Hiyori)" / "我(小埋)" 是不同的桌宠角色，**它们本身不是实体**，不要给她们建图鉴卡片
- 桌宠和主人之间的具体互动（如"梳头"、"打闹"）也不是实体；只在它们指代某个真实物品/人/活动时才算
- 例：对话里"小埋说想给主人梳头" → 这不是实体「梳头」也不是实体「小埋」，跳过
- 例：对话里提到"主人的朋友周研每周三去咖啡厅" → 实体「周研」(人物)，"咖啡厅"如果反复提及可能算地点

**重要：增量更新而非重写**
- 下方"已有图鉴卡片"列出了之前积累的卡片和它们当前的 description
- 如果你提取的实体在已有卡片中（同名 title），description 必须**在老 description 基础上自然补充新信息**，不要丢失老内容
  · 例如老的是"主人的高中同学，做产品经理"，新事实是"换工作去了字节"，新 description 应该是"主人的高中同学，原本做产品经理，最近换工作去了字节"
- 如果是全新实体，写 30-80 字的初始描述
- description 总长不超过 240 字，超出请精炼但保留关键信息
- category 和 emoji 不要无谓地变更已有卡片的（除非明显错了）

**对话片段选择**：对话已编号 [0][1]...，每张卡片输出 snippetIndices 数组（最少 ${min} 条，最多 ${max} 条），挑选**最能体现这个实体**的对话索引。如果对话里完全没提到该实体，snippetIndices 留空数组。

严格输出 JSON 数组，不要 markdown 代码块、不要前缀后缀:
[
  {"title":"豆子","category":"宠物","emoji":"🐱","description":"...","factIndices":[1,3],"snippetIndices":[5,12]}
]
其中 factIndices 是事实编号（1-based），snippetIndices 是对话编号（0-based）。`;

  const userPrompt = `主人的长期记忆事实（${allFacts.length} 条）:
${factsText}

最近的对话片段（已编号，共 ${(recentChat || []).slice(-50).length} 条）:
${chatIndexed || '(无)'}

已有图鉴卡片（请在它们的 description 基础上增量补充）:
${oldCardsText}

请输出整理后的图鉴 JSON 数组（包含同名卡片的更新版 + 新发现的卡片）。`;

  const cfg = { ...llmCfg, maxTokens: Math.max(maxTokens || 0, 2000) };
  const raw = await llmModule.chat(cfg, [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: userPrompt },
  ], { timeoutMs: (cfg.timeoutSeconds || 60) * 1000 });

  let parsed = parseJsonArray(raw);
  if (!parsed) throw new Error('LLM 输出无法解析为 JSON 数组：' + (raw || '').slice(0, 200));

  const old = oldData;   // 复用上面的 load
  const oldByTitle = new Map(old.items.map(i => [i.title, i]));
  const now = Date.now();
  // 用 Map 做合并：先放老卡片，再用新输出覆盖/追加
  // 这样 LLM 没在这次提到的老卡片仍然保留
  const merged = new Map();
  let cleanedCount = 0;
  for (const it of old.items) {
    if (isExcludedTitle(it.title, excludeSet)) {
      cleanedCount++;
      continue;   // 老卡片如果是角色名/互动行为，整理时顺手清掉
    }
    merged.set(it.title, it);
  }
  const chatSlice = (recentChat || []).slice(-50);
  let updatedCount = 0;
  let addedCount = 0;

  for (const c of parsed) {
    if (!c || typeof c.title !== 'string') continue;
    const title = c.title.trim().slice(0, 40);
    if (!title) continue;
    if (isExcludedTitle(title, excludeSet)) continue;   // 跳过角色名/互动行为
    const category = CATEGORIES.includes(c.category) ? c.category : '其他';
    const emoji = (typeof c.emoji === 'string' && c.emoji.trim()) ? c.emoji.trim().slice(0, 6) : '✨';
    const description = String(c.description || '').trim().slice(0, 240);
    const idxs = Array.isArray(c.factIndices) ? c.factIndices : [];
    const factTexts = idxs
      .map(i => parseInt(i, 10) - 1)
      .filter(i => i >= 0 && i < allFacts.length)
      .map(i => allFacts[i]);

    // 用 LLM 选出的 snippetIndices 提取对话
    const newSnippets = [];
    const snipIdxs = Array.isArray(c.snippetIndices) ? c.snippetIndices : [];
    for (const idx of snipIdxs) {
      const i = parseInt(idx, 10);
      if (i >= 0 && i < chatSlice.length) {
        const m = chatSlice[i];
        newSnippets.push({ role: m.role, content: (m.content || '').slice(0, 200) });
      }
      if (newSnippets.length >= max) break;
    }

    const existed = oldByTitle.get(title);
    if (existed) {
      // 同名卡片：合并 facts + snippets（去重），description 已由 LLM 增量补充
      const factSet = new Set(existed.factTexts || []);
      const mergedFacts = [...(existed.factTexts || [])];
      for (const f of factTexts) {
        if (!factSet.has(f)) { mergedFacts.push(f); factSet.add(f); }
      }
      // snippets 用 role+content 字符串去重
      const snipKey = s => s.role + '|' + s.content;
      const snipSet = new Set((existed.snippets || []).map(snipKey));
      const mergedSnippets = [...(existed.snippets || [])];
      for (const s of newSnippets) {
        if (!snipSet.has(snipKey(s))) {
          mergedSnippets.push(s);
          snipSet.add(snipKey(s));
        }
      }
      // snippets 上限策略：超出时保留首尾（最早 1 条 + 最新 max-1 条），中间挤掉
      // 这样既能看到"最初聊到这个实体"的对话，又能看到"最近的对话"
      let finalSnippets;
      if (mergedSnippets.length <= max) {
        finalSnippets = mergedSnippets;
      } else if (max <= 1) {
        finalSnippets = [mergedSnippets[mergedSnippets.length - 1]];
      } else {
        finalSnippets = [mergedSnippets[0], ...mergedSnippets.slice(-(max - 1))];
      }

      merged.set(title, {
        id: existed.id,
        title, category, emoji, description,
        factTexts: mergedFacts,
        snippets: finalSnippets,
        firstAt: existed.firstAt || now,
        lastAt: now,
      });
      updatedCount++;
    } else {
      merged.set(title, {
        id: uid(),
        title, category, emoji, description, factTexts,
        snippets: newSnippets,
        firstAt: now,
        lastAt: now,
      });
      addedCount++;
    }
  }

  const newItems = Array.from(merged.values());
  // 按 lastAt 倒序：最近更新的排前面
  newItems.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

  const data = { items: newItems, lastRebuildAt: now };
  save(data);
  console.log('[collection] rebuild merged: total=' + newItems.length + ' added=' + addedCount + ' updated=' + updatedCount + ' kept=' + (old.items.length - updatedCount - cleanedCount) + ' cleaned=' + cleanedCount);
  return data;
}

// 单卡删除
function deleteItem(id) {
  const data = load();
  const before = data.items.length;
  data.items = data.items.filter(it => it.id !== id);
  if (data.items.length === before) return false;
  save(data);
  return true;
}

function parseJsonArray(raw) {
  if (!raw) return null;
  let trimmed = String(raw).replace(/```json|```/g, '').trim();
  // 截到第一个 [ 与最后一个 ]
  const first = trimmed.indexOf('[');
  const last = trimmed.lastIndexOf(']');
  if (first >= 0 && last > first) trimmed = trimmed.slice(first, last + 1);
  try { const arr = JSON.parse(trimmed); if (Array.isArray(arr)) return arr; } catch (e) {}
  // 修裸换行
  try {
    const fixed = escapeInnerWhitespace(trimmed);
    const arr = JSON.parse(fixed);
    if (Array.isArray(arr)) return arr;
  } catch (e) {}
  return null;
}

function escapeInnerWhitespace(s) {
  let out = '', inStr = false, escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escape) { out += ch; escape = false; continue; }
      if (ch === '\\') { out += ch; escape = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

module.exports = { init, list, get, rebuild, clear, deleteItem, CATEGORIES };

// 判断标题是否应排除（精确等于角色名，或前缀含动作词如"给 X" "和 X"）
function isExcludedTitle(title, excludeSet) {
  if (!title || !excludeSet || excludeSet.size === 0) return false;
  const t = title.trim();
  if (excludeSet.has(t)) return true;
  // 含动作前缀
  const prefixes = ['给', '和', '陪', '跟'];
  for (const name of excludeSet) {
    for (const p of prefixes) {
      if (t.includes(p + name)) return true;
    }
  }
  return false;
}
