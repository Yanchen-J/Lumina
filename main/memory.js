// 长期记忆模块（双层：跨角色共享 + 单角色专属）
// 跨角色共享: memories/_shared.json
// 单角色专属: memories/<modelId>.json
// 一次 LLM 提取同时产出两类，再分别合并/淘汰
const fs = require('fs');
const path = require('path');
const llmModule = require('./llm');

let memDir = null;
const SHARED_ID = '_shared';

function init(userDataPath) {
  memDir = path.join(userDataPath, 'memories');
  if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
}

function sanitize(id) {
  return String(id || 'default').replace(/[^a-zA-Z0-9_\-一-龥]/g, '_');
}

function fileFor(id) {
  return path.join(memDir, sanitize(id) + '.json');
}

function emptyMem(id) {
  return { id, facts: [], lastExtractionAt: 0, msgsSinceExtraction: 0 };
}

function load(id) {
  if (!memDir) return emptyMem(id);
  try {
    const obj = JSON.parse(fs.readFileSync(fileFor(id), 'utf-8'));
    if (!Array.isArray(obj.facts)) obj.facts = [];
    return obj;
  } catch (e) {
    return emptyMem(id);
  }
}

function save(id, data) {
  if (!memDir) return;
  try {
    fs.writeFileSync(fileFor(id), JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[memory] save failed:', e.message);
  }
}

// 注入：返回 shared + specific 合并的文本，加入 system prompt
function inject(modelId) {
  const shared = load(SHARED_ID).facts || [];
  const specific = load(modelId).facts || [];
  if (!shared.length && !specific.length) return '';
  const blocks = [];
  if (shared.length) {
    blocks.push('[关于主人的长期记忆，请自然融入回复，不要直接复述]');
    for (const f of shared) blocks.push('- ' + f.text);
  }
  if (specific.length) {
    blocks.push('[你（当前角色）格外记得的事]');
    for (const f of specific) blocks.push('- ' + f.text);
  }
  return '\n\n' + blocks.join('\n');
}

function clearShared() { try { fs.unlinkSync(fileFor(SHARED_ID)); } catch (e) {} }
function clearSpecific(modelId) { try { fs.unlinkSync(fileFor(modelId)); } catch (e) {} }

function get(modelId) {
  return {
    shared: load(SHARED_ID),
    specific: load(modelId),
  };
}

function noteUserMessage(modelId) {
  // 计数挂在 shared 上，所有角色共享一个节奏
  const mem = load(SHARED_ID);
  mem.msgsSinceExtraction = (mem.msgsSinceExtraction || 0) + 1;
  save(SHARED_ID, mem);
  return mem.msgsSinceExtraction;
}

async function extract(modelId, characterName, memoryFocus, conversation, llmCfg, maxFacts = 30, extractMaxTokens) {
  const shared = load(SHARED_ID);
  const specific = load(modelId);
  const recent = (conversation || []).slice(-16);
  if (recent.length < 2) return { shared, specific };

  const convText = recent
    .map(m => (m.role === 'user' ? '主人' : '桌宠') + ': ' + (m.content || ''))
    .join('\n');
  const sharedText = shared.facts.length
    ? shared.facts.map(f => '- ' + f.text).join('\n')
    : '(暂无)';
  const specificText = specific.facts.length
    ? specific.facts.map(f => '- ' + f.text).join('\n')
    : '(暂无)';

  const focusText = (memoryFocus || '').trim() || '（无特别关注，仅记通用事实）';
  const sysPrompt = `你是对话记忆提取助手。从「主人」和「桌宠」的对话中提取关于主人的稳定事实。

事实分两类输出:
1. shared: 任何角色都应该知道的通用事实（基础信息、人际、宠物、长期偏好、工作生活基本盘、长期计划）
2. specific: 仅当前角色「${characterName}」特别关注的事实
   当前角色的关注重点: ${focusText}

规则:
- 每条事实是一句陈述，主语「主人」，10-30 字
- 忽略一次性琐事
- 不要重复"已有事实"里已有的内容
- shared 最多 6 条，specific 最多 4 条
- 输出严格 JSON，不要 markdown 代码块，不要多余文字
- 格式: {"shared":[{"text":"主人..."}],"specific":[{"text":"主人..."}]}
- 如果某类没有可提取的，对应数组为 []`;

  const userPrompt = `已有 shared 事实:
${sharedText}

已有 specific 事实 (角色: ${characterName}):
${specificText}

对话:
${convText}

请按上述 JSON 格式提取。`;

  let raw;
  try {
    // 提取需要足够 token 输出 JSON。优先用调用方传入值，否则沿用 llmCfg
    const extractCfg = extractMaxTokens
      ? { ...llmCfg, maxTokens: extractMaxTokens }
      : llmCfg;
    const timeoutMs = (llmCfg.timeoutSeconds || 60) * 1000;
    raw = await llmModule.chat(extractCfg, [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt },
    ], { timeoutMs });
  } catch (e) {
    console.error('[memory] extract LLM call failed:', e.message);
    return { shared, specific };
  }
  console.log('[memory] extract raw output:', (raw || '').slice(0, 400));
  console.log('[memory] extract input convText:', convText.slice(0, 300));

  let parsed = null;
  try {
    const cleaned = (raw || '')
      .replace(/```json|```/g, '')
      .trim()
      .replace(/^[^{]*(\{)/, '$1')
      .replace(/(\})[^}]*$/, '$1');
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn('[memory] LLM 输出非 JSON, 跳过. raw=', (raw || '').slice(0, 500));
    // 仍然清零计数以免反复重试
    shared.msgsSinceExtraction = 0;
    save(SHARED_ID, shared);
    return { shared, specific };
  }

  const now = Date.now();
  const sharedNew = Array.isArray(parsed && parsed.shared) ? parsed.shared : [];
  const specificNew = Array.isArray(parsed && parsed.specific) ? parsed.specific : [];

  appendFacts(shared, sharedNew, maxFacts, now);
  appendFacts(specific, specificNew, maxFacts, now);

  shared.lastExtractionAt = now;
  shared.msgsSinceExtraction = 0;
  specific.lastExtractionAt = now;

  save(SHARED_ID, shared);
  save(modelId, specific);
  return { shared, specific };
}

function appendFacts(memObj, incoming, maxFacts, now) {
  const existing = new Set(memObj.facts.map(f => f.text));
  for (const nf of incoming) {
    if (!nf || typeof nf.text !== 'string') continue;
    const text = nf.text.trim();
    if (text.length < 2 || text.length > 80) continue;
    if (existing.has(text)) continue;
    memObj.facts.push({
      id: 'f_' + now + '_' + Math.random().toString(36).slice(2, 6),
      text,
      createdAt: now,
    });
    existing.add(text);
  }
  if (memObj.facts.length > maxFacts) {
    memObj.facts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    memObj.facts = memObj.facts.slice(0, maxFacts);
  }
}

// 整理：让 LLM 把现有事实库做去重/合并/删过时，不引入新信息
async function consolidate(modelId, characterName, llmCfg, consolidateMaxTokens) {
  const shared = load(SHARED_ID);
  const specific = load(modelId);
  const beforeCounts = { shared: shared.facts.length, specific: specific.facts.length };
  if (beforeCounts.shared + beforeCounts.specific === 0) {
    return { before: beforeCounts, after: beforeCounts, changed: false };
  }

  const sharedText = shared.facts.length
    ? shared.facts.map((f, i) => (i + 1) + '. ' + f.text).join('\n')
    : '(空)';
  const specificText = specific.facts.length
    ? specific.facts.map((f, i) => (i + 1) + '. ' + f.text).join('\n')
    : '(空)';

  const sysPrompt = `你是记忆整理助手。下面是关于「主人」的两类长期记忆：跨角色共享 + 当前角色「${characterName}」专属。

任务:
- 合并表达相同含义的条目（如"主人养了只叫豆子的猫" 与 "主人有只小猫叫豆子" 保留一条）
- 删除明显过时或自相矛盾的（保留较具体/较新的版本）
- 保留所有彼此独立、不重复的事实
- 不要凭空创造原文本里没有的事实
- 不要改变事实的原意，仅做整理

严格输出 JSON: {"shared":[{"text":"..."}],"specific":[{"text":"..."}]}
直接输出 JSON，不要 markdown 代码块，不要多余文字。`;

  const userPrompt = `当前 shared 共 ${beforeCounts.shared} 条:
${sharedText}

当前 specific (角色: ${characterName}) 共 ${beforeCounts.specific} 条:
${specificText}

请输出整理后的 JSON。`;

  let raw;
  try {
    const consolidateCfg = consolidateMaxTokens
      ? { ...llmCfg, maxTokens: consolidateMaxTokens }
      : llmCfg;
    const timeoutMs = (llmCfg.timeoutSeconds || 60) * 1000;
    raw = await llmModule.chat(consolidateCfg, [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt },
    ], { timeoutMs });
  } catch (e) {
    throw new Error('整理失败：' + (e.message || e));
  }

  let parsed = null;
  try {
    const cleaned = (raw || '')
      .replace(/```json|```/g, '')
      .trim()
      .replace(/^[^{]*(\{)/, '$1')
      .replace(/(\})[^}]*$/, '$1');
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('整理失败：LLM 输出非 JSON');
  }

  const newShared = Array.isArray(parsed && parsed.shared) ? parsed.shared : null;
  const newSpecific = Array.isArray(parsed && parsed.specific) ? parsed.specific : null;
  if (!newShared || !newSpecific) {
    throw new Error('整理失败：LLM 输出格式异常');
  }

  // 防御：整理后**任何一边**都不能凭空被清空（除非原本就空）
  // 之前用 && 是 bug — LLM 偶尔会把整个 specific 输出成空数组，
  // 导致当前角色专属记忆被无声覆盖。改成 || 后任一空就拒绝。
  if ((beforeCounts.shared > 0 && newShared.length === 0) ||
      (beforeCounts.specific > 0 && newSpecific.length === 0)) {
    const which = newShared.length === 0 ? '共享层' : '当前角色专属层';
    throw new Error(`整理失败：LLM 想清空 ${which}，已拒绝（保留原记忆不变）`);
  }

  const now = Date.now();
  shared.facts = rebuildFacts(shared.facts, newShared, now);
  specific.facts = rebuildFacts(specific.facts, newSpecific, now);
  save(SHARED_ID, shared);
  save(modelId, specific);

  const after = { shared: shared.facts.length, specific: specific.facts.length };
  return { before: beforeCounts, after, changed: true };
}

// 整理后回填：尽量保留旧条目的 createdAt（避免淘汰逻辑误判）
function rebuildFacts(oldFacts, newItems, now) {
  const result = [];
  for (const ni of newItems) {
    if (!ni || typeof ni.text !== 'string') continue;
    const text = ni.text.trim();
    if (text.length < 2 || text.length > 80) continue;
    // 找原条目（精确匹配优先，再退化为 substring 双向匹配）
    let matched = oldFacts.find(o => o.text === text);
    if (!matched) {
      matched = oldFacts.find(o => o.text.includes(text) || text.includes(o.text));
    }
    result.push({
      id: matched ? matched.id : ('f_' + now + '_' + Math.random().toString(36).slice(2, 6)),
      text,
      createdAt: matched ? (matched.createdAt || now) : now,
    });
  }
  return result;
}

module.exports = { init, inject, get, clearShared, clearSpecific, noteUserMessage, extract, consolidate };
