// 桌宠日记模块
// 按日期存 userData/diaries/<YYYY-MM-DD>.json，每天一个文件
// 新结构：{ date, pet: {...} | null, user: {...} | null }
//   pet:  { body, mood, emoji, characterName, modelId, createdAt, sparseContext, contextSummary }
//   user: { body, mood, emoji, createdAt, updatedAt }
// 旧结构（顶层有 body 字段）会在 get() / listAll() 懒迁移到新结构
const fs = require('fs');
const path = require('path');
const llmModule = require('./llm');

let diaryDir = null;

function init(userDataPath) {
  diaryDir = path.join(userDataPath, 'diaries');
  if (!fs.existsSync(diaryDir)) fs.mkdirSync(diaryDir, { recursive: true });
}

function fileFor(date) {
  return path.join(diaryDir, date + '.json');
}

function todayStr() {
  // 用本地时区，不要用 toISOString()——它是 UTC，凌晨/早晨会差一天
  return localDateStr(new Date());
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function exists(date) {
  if (!diaryDir) return false;
  return fs.existsSync(fileFor(date || todayStr()));
}

// 是否存在 pet 写的部分（控制"今日日记"按钮是否提示覆盖）
function petExists(date) {
  const f = readFile(date);
  return !!(f && f.pet && f.pet.body);
}

function userExists(date) {
  const f = readFile(date);
  return !!(f && f.user && f.user.body);
}

function readFile(date) {
  if (!diaryDir) return null;
  try {
    return JSON.parse(fs.readFileSync(fileFor(date || todayStr()), 'utf-8'));
  } catch (e) {
    return null;
  }
}

// 把旧结构（顶层 body）懒迁移到新结构
function normalize(raw, date) {
  if (!raw) return { date, pet: null, user: null };
  // 新结构
  if (raw.pet || raw.user) {
    return { date: raw.date || date, pet: raw.pet || null, user: raw.user || null };
  }
  // 旧结构：把顶层视为 pet
  if (raw.body) {
    return {
      date: raw.date || date,
      pet: {
        body: raw.body,
        mood: raw.mood || '',
        emoji: raw.emoji || DEFAULT_EMOJI,
        characterName: raw.characterName || '',
        modelId: raw.modelId || '',
        createdAt: raw.createdAt || 0,
        sparseContext: raw.sparseContext,
        contextSummary: raw.contextSummary,
      },
      user: null,
    };
  }
  return { date: raw.date || date, pet: null, user: null };
}

function get(date) {
  const d = date || todayStr();
  return normalize(readFile(d), d);
}

function getToday() { return get(todayStr()); }

function fmtMin(ms) {
  const m = Math.round((ms || 0) / 60000);
  if (m < 60) return m + ' 分钟';
  return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
}

function buildContext(ctx) {
  const lines = [];
  const t = (ctx && ctx.time) || {};
  const totalActivity = (t.working || 0) + (t.slacking || 0) + (t.afk || 0) + (t.idle || 0);
  const hasActivity = totalActivity > 5 * 60 * 1000; // 至少 5 分钟

  if (hasActivity) {
    lines.push('【今日活动统计】');
    if (t.working) lines.push('- 工作时长: ' + fmtMin(t.working));
    if (t.slacking) lines.push('- 摸鱼时长: ' + fmtMin(t.slacking));
    if (t.afk) lines.push('- 离开时长: ' + fmtMin(t.afk));
    if (t.idle) lines.push('- 闲置时长: ' + fmtMin(t.idle));
  }

  const apps = (ctx && ctx.topApps) || [];
  const appLines = [];
  for (const [name, ms] of apps) {
    if (ms < 60 * 1000) continue;     // 不到 1 分钟不写
    appLines.push('- ' + name.replace(/\.exe$/i, '') + ': ' + fmtMin(ms));
  }
  if (appLines.length) {
    lines.push('');
    lines.push('【今日主要使用的应用】');
    lines.push(...appLines);
  }

  const events = (ctx && ctx.events) || [];
  if (events.length) {
    lines.push('');
    lines.push('【今日值得记录的事件】');
    for (const e of events) lines.push('- ' + e);
  }

  const conv = (ctx && ctx.recentChat) || [];
  if (conv.length) {
    lines.push('');
    lines.push('【今日和主人的部分对话】');
    for (const m of conv.slice(-12)) {
      lines.push((m.role === 'user' ? '主人' : '我') + ': ' + (m.content || '').slice(0, 100));
    }
  }

  const facts = (ctx && ctx.facts) || [];
  if (facts.length) {
    lines.push('');
    lines.push('【关于主人的长期记忆（可挑相关的提及）】');
    for (const f of facts.slice(0, 20)) lines.push('- ' + f);
  }

  const annivs = (ctx && ctx.anniversaries) || [];
  if (annivs.length) {
    lines.push('');
    lines.push('【今天的特别日子】');
    for (const a of annivs) {
      const yearsTxt = a.yearsPassed ? `（第 ${a.yearsPassed} 年）` : '';
      lines.push(`- ${a.type || ''} · ${a.title}${yearsTxt}${a.notes ? ' — ' + a.notes : ''}`);
    }
    lines.push('（请在日记里自然地体现今天是这些特别日子，不要写成报告）');
  }

  // 判断信息是否稀薄
  const sparse = !hasActivity && appLines.length === 0 && events.length === 0
    && conv.length === 0 && facts.length === 0 && annivs.length === 0;
  if (sparse) {
    lines.push('（今天关于主人的可观察信息很少。请把篇幅更多放在你自己的胡思乱想、内心独白、对小事的感想、白日梦——不要硬挤主人相关的内容。）');
  }

  return { text: lines.join('\n'), sparse };
}

const ALLOWED_EMOJIS = ['😊', '🥰', '😌', '😴', '😟', '😭', '😤', '🤔', '😎', '😋', '🙂', '😔', '😄', '🥲', '😇', '🤗', '😅', '😪'];
const DEFAULT_EMOJI = '🙂';

function listAll() {
  if (!diaryDir) return [];
  let files;
  try { files = fs.readdirSync(diaryDir); } catch (e) { return []; }
  const out = [];
  for (const f of files) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
    const date = f.replace(/\.json$/, '');
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(diaryDir, f), 'utf-8')); }
    catch (e) { continue; }
    const entry = normalize(raw, date);
    out.push({
      date: entry.date,
      hasPet: !!(entry.pet && entry.pet.body),
      hasUser: !!(entry.user && entry.user.body),
      pet: entry.pet ? {
        emoji: entry.pet.emoji || DEFAULT_EMOJI,
        mood: entry.pet.mood || '',
        characterName: entry.pet.characterName || '',
        modelId: entry.pet.modelId || '',
      } : null,
      user: entry.user ? {
        emoji: entry.user.emoji || DEFAULT_EMOJI,
        mood: entry.user.mood || '',
      } : null,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// 用户保存自己写的日记
function saveUser(date, { body, mood, emoji }) {
  if (!diaryDir) return null;
  const d = date || todayStr();
  const cleanBody = String(body || '').trim();
  if (!cleanBody) throw new Error('日记内容不能为空');
  let e = (emoji || '').trim();
  if (!ALLOWED_EMOJIS.includes(e)) e = DEFAULT_EMOJI;
  const cleanMood = String(mood || '').trim().slice(0, 8);

  const file = normalize(readFile(d), d);
  const now = Date.now();
  file.user = {
    body: cleanBody,
    mood: cleanMood,
    emoji: e,
    createdAt: (file.user && file.user.createdAt) || now,
    updatedAt: now,
  };
  saveFile(d, file);
  return file;
}

function deleteUser(date) {
  if (!diaryDir) return null;
  const d = date || todayStr();
  const file = normalize(readFile(d), d);
  file.user = null;
  // 如果连 pet 也没有就把整个文件删了
  if (!file.pet) {
    try { fs.unlinkSync(fileFor(d)); } catch (e) {}
    return null;
  }
  saveFile(d, file);
  return file;
}

function saveFile(date, file) {
  try {
    fs.writeFileSync(fileFor(date), JSON.stringify(file, null, 2));
  } catch (e) {
    console.error('[diary] save failed:', e.message);
  }
}

async function generate({ date, modelId, characterName, personality, llmCfg, ctx, overwrite, maxTokens }) {
  if (!llmCfg || !llmCfg.enabled) throw new Error('LLM 未启用');
  const d = date || todayStr();
  if (!overwrite && petExists(d)) {
    const existing = get(d);
    return { date: d, entry: existing, alreadyExists: true };
  }

  const built = buildContext(ctx);
  const contextText = built.text;
  const wordHint = built.sparse ? '120-280 字' : '250-450 字';

  const sysPrompt = `你是「${characterName}」，正在写自己的日记并打上心情标签。
这是**你自己**的日记本，不是给主人看的报告。

角色人设（务必保持语气、用词、颜文字风格一致）:
${(personality || '').trim()}

写作要求:
- 第一人称日记体，自然分段
- **不要每段都提主人**——日记是你自己的内心独白。可以写自己的胡思乱想、当下的小情绪、对某件事的感想、对一个东西的好奇、做的小白日梦、对未来的小计划，不一定都和主人有关
- 主人**自然出现就好**（比如"今天主人好像很忙"），不要硬塞、不要每段都"主人主人"开头
- 写作的素材分两类：
  · 关于主人的可观察资料（活动数据、对话片段、长期记忆）：可以基于这些联想和延伸，不要照搬列表
  · 你自己作为这个角色的脑内活动：想到了什么、好奇什么、回忆起什么、突然冒出的念头
- 体现你这个角色的性格（开朗/温柔/吐槽/慵懒按角色而定）
- 长度 ${wordHint}，中文，少量颜文字 OK
- 如果今天关于主人的素材很少，那就**写更多自己的东西**——你今天看到的桌面光线、自己做的小白日梦、忽然想到的一个问题、对某种食物的渴望，都行
- 同时给今天打"心情"标签（2-4 个中文字，例: 温暖 / 平静 / 担心 / 想念 / 兴奋 / 满足 / 疲惫 / 失落 / 好奇 / 慵懒）
- 从下列 emoji 中选**最贴合**心情的一个: ${ALLOWED_EMOJIS.join(' ')}

参考语气示例（仅示意，请用你自己的角色风格重写）:
"今天的云特别软，看着看着就走神了。突然好奇主人小时候有没有也这样发呆过呢——啊，又跑题了。
中午主人一直在敲键盘，我猜大概又是那个 bug 在折磨他吧。我也想帮忙呀，可惜我只能在旁边发呆。
说起来，最近好像有点想吃布丁了。不知道为什么，明明我又不能真的吃……(´-ω-\`)"

严格输出 JSON（不要 markdown 代码块、不要任何额外文字）:
{"body":"日记正文（可含换行）","mood":"心情标签","emoji":"🥰"}`;

  const userPrompt = `今天的日期: ${d}

以下是今天关于主人的可观察资料:

${contextText}

请输出今天的日记 JSON。`;

  console.log('[diary] === prompt (sparse=' + built.sparse + ') ===');
  console.log(userPrompt);

  // 日记需要足够 token 才能写完整。优先用日记专属设置，回退到聊天设置，再回退到 1500
  const diaryMax = maxTokens || llmCfg.maxTokens || 1500;
  const diaryCfg = { ...llmCfg, maxTokens: diaryMax };
  const timeoutMs = (llmCfg.timeoutSeconds || 60) * 1000;
  const raw = await llmModule.chat(diaryCfg, [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: userPrompt },
  ], { timeoutMs });

  console.log('[diary] === raw LLM output ===');
  console.log(raw);
  console.log('[diary] === end ===');

  let parsed = robustParse(raw);
  let parseDegraded = false;
  if (!parsed) {
    // 第 4 级兜底：LLM 完全没遵守 JSON 格式（本地小模型常见）。
    // 检查文本里是否真的写了 "body" 字段名 — 没有就当它写了纯日记正文。
    if (raw && !/"body"\s*:/i.test(raw)) {
      console.warn('[diary] LLM 未输出 JSON 字段，按纯正文兜底');
      parsed = { body: String(raw).trim(), mood: '', emoji: DEFAULT_EMOJI };
      parseDegraded = true;
    } else {
      console.warn('[diary] 全部解析方式失败，原始返回前 300 字:', (raw || '').slice(0, 300));
      throw new Error('LLM 输出格式坏了：' + (raw || '(空)').slice(0, 160));
    }
  }

  let body = (parsed.body || '').trim();
  // 去掉某些模型偶尔在正文里残留的 ```json / ``` 围栏
  body = body.replace(/^```\w*\s*/m, '').replace(/```\s*$/m, '').trim();
  if (!body) {
    throw new Error('LLM 没生成日记正文。原始返回：' + (raw || '').slice(0, 200));
  }
  const mood = (parsed.mood || '').trim().slice(0, 8);
  let emoji = (parsed.emoji || '').trim();
  if (!ALLOWED_EMOJIS.includes(emoji)) emoji = DEFAULT_EMOJI;

  const petEntry = {
    body,
    mood,
    emoji,
    characterName,
    modelId,
    createdAt: Date.now(),
    sparseContext: built.sparse,
    contextSummary: {
      time: ctx && ctx.time,
      topApps: ctx && ctx.topApps,
    },
  };
  // 写入新结构（保留同日 user 部分）
  const file = normalize(readFile(d), d);
  file.pet = petEntry;
  saveFile(d, file);
  // 兼容旧调用者：返回 { date, entry } 时 entry 给 pet 部分
  return { date: d, entry: petEntry, alreadyExists: false };
}

module.exports = {
  init, exists, get, getToday, listAll, generate,
  petExists, userExists, saveUser, deleteUser,
  ALLOWED_EMOJIS,
};

// ========== 健壮 JSON 解析 ==========
// LLM 经常把 body 里写真实换行符（裸 \n）导致 JSON.parse 失败；
// 或者 maxTokens 不够把输出截断在字符串中间。多级 fallback。
function robustParse(raw) {
  if (!raw) return null;
  let trimmed = String(raw)
    .replace(/```json|```/g, '')
    .trim();
  // 截取从第一个 { 到最后一个 } 之间
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0) trimmed = trimmed.slice(firstBrace);
  if (lastBrace > firstBrace) trimmed = trimmed.slice(0, lastBrace - firstBrace + 1);

  // 1) 严格解析
  try { return JSON.parse(trimmed); } catch (e) {}

  // 2) 把 JSON 字符串内部的裸换行符 / 制表符转义掉再试
  try {
    const fixed = escapeInnerWhitespace(trimmed);
    return JSON.parse(fixed);
  } catch (e) {}

  // 3) 修复"被截断"的 JSON：如果开头有 { 但结尾不闭合，自动补上 "} 再试
  try {
    let repaired = escapeInnerWhitespace(trimmed);
    if (!repaired.endsWith('}')) {
      // 计数引号判断是否在字符串中间
      let inStr = false, escape = false;
      for (const ch of repaired) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') inStr = !inStr;
      }
      if (inStr) repaired += '"';
      repaired += '}';
    }
    return JSON.parse(repaired);
  } catch (e) {}

  // 4) 字段级正则提取
  const out = {};
  // body 可能没闭合（截断）— 用贪婪到最后一个引号或字符串末尾
  let bodyMatch = trimmed.match(/"body"\s*:\s*"([\s\S]*?)"\s*,\s*"mood"/);
  if (!bodyMatch) bodyMatch = trimmed.match(/"body"\s*:\s*"([\s\S]*?)"(?:\s*[,}])/);
  if (!bodyMatch) bodyMatch = trimmed.match(/"body"\s*:\s*"([\s\S]*)$/); // 截断兜底
  if (bodyMatch) out.body = unescapeJsonString(bodyMatch[1].replace(/"$/, ''));
  const moodMatch = trimmed.match(/"mood"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  if (moodMatch) out.mood = unescapeJsonString(moodMatch[1]);
  const emojiMatch = trimmed.match(/"emoji"\s*:\s*"([^"]*)"/);
  if (emojiMatch) out.emoji = emojiMatch[1];

  if (out.body) return out;
  return null;
}

// 把"在字符串字面量内部"的裸换行/制表符替换为 \n / \t
function escapeInnerWhitespace(s) {
  let out = '';
  let inStr = false;
  let escape = false;
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
      if (ch === '"') { inStr = true; }
      out += ch;
    }
  }
  return out;
}

function unescapeJsonString(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
