// 塔罗牌模块：每天为每个角色固定抽一张牌（同一天 + 同一角色 = 同一张），
// LLM 用角色 personality 给一段口吻化的解读。
const fs = require('fs');
const path = require('path');
const llmModule = require('./llm');

let tarotDir = null;       // userData/tarot
let cardsData = null;      // 加载自 assets/tarot/cards.json
let assetsDir = null;      // 项目里的 assets/tarot 目录

function init(userDataPath, projectAssetsDir) {
  tarotDir = path.join(userDataPath, 'tarot');
  if (!fs.existsSync(tarotDir)) fs.mkdirSync(tarotDir, { recursive: true });
  assetsDir = projectAssetsDir;
  try {
    const raw = fs.readFileSync(path.join(assetsDir, 'cards.json'), 'utf-8');
    cardsData = JSON.parse(raw);
  } catch (e) {
    console.error('[tarot] cards.json 加载失败:', e.message);
    cardsData = { cards: [] };
  }
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 简单的字符串 hash → 32 位整数，用于"同日同角色固定一张"
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function fileFor(date, modelId) {
  return path.join(tarotDir, `${date}__${sanitizeId(modelId)}.json`);
}
function sanitizeId(id) {
  return String(id || 'default').replace(/[^a-zA-Z0-9_\-一-龥]/g, '_');
}

function getToday(modelId) {
  const date = localDateStr(new Date());
  const f = fileFor(date, modelId);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch (e) {}
  }
  return null;
}

function pickTodayCard(modelId, dateStr, attempt = 0) {
  if (!cardsData || !cardsData.cards.length) return null;
  const cards = cardsData.cards;
  const baseKey = dateStr + '|' + modelId + '|' + attempt;
  // 两个独立 hash：idx 决定哪张牌，reversed 决定正逆位。
  // 之前用同一个 seed 同时算两者会导致它们关联（78 = 2 × 39 → 低位耦合），
  // 某些 key 组合下逆位概率明显偏离 50%。改成各自独立 hash 解耦。
  const seedIdx = hashString(baseKey + '|idx');
  const seedRev = hashString(baseKey + '|rev');
  const idx = seedIdx % cards.length;
  const reversed = (seedRev & 1) === 1;
  return { card: cards[idx], reversed };
}

// 调 LLM 用角色口吻解读
async function interpret({ modelId, characterName, personality, llmCfg, maxTokens, redrawAttempt }) {
  if (!llmCfg || !llmCfg.enabled) throw new Error('LLM 未启用');
  const date = localDateStr(new Date());
  // 已抽过 → 直接返回缓存（除非是重抽）
  if (!redrawAttempt) {
    const cached = getToday(modelId);
    if (cached) return cached;
  }

  const draw = pickTodayCard(modelId, date, redrawAttempt || 0);
  if (!draw) throw new Error('cards.json 未加载');
  const { card, reversed } = draw;
  const keywords = (reversed ? card.reversed : card.upright) || [];
  const orientationLabel = reversed ? '逆位' : '正位';

  const sysPrompt = `你是「${characterName}」，正在为「主人」解读今天抽到的塔罗牌。

角色人设（保持你的语气、口吻、颜文字）:
${(personality || '').trim()}

任务:
- 用你这个角色的视角和语气，给主人解读今天的塔罗
- 不要只复述关键词，要结合主人最近的状态做"今日提示"
- 不超过 80 字
- 输出三段：① 一句开场白（你的反应）② 牌的核心含义（用你的话说）③ 给主人的具体小建议

输出格式（严格 JSON，无 markdown 代码块、无前后多余文字）:
{"intro":"...","meaning":"...","advice":"..."}`;

  const userPrompt = `今日抽到: ${card.name}（${card.nameEn}）${orientationLabel}
关键词: ${keywords.join('、')}
日期: ${date}

请输出今日塔罗解读 JSON。`;

  const cfg = { ...llmCfg, maxTokens: Math.max(maxTokens || 0, 600) };
  const raw = await llmModule.chat(cfg, [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: userPrompt },
  ], { timeoutMs: (cfg.timeoutSeconds || 60) * 1000 });

  let parsed = null;
  try {
    const cleaned = (raw || '').replace(/```json|```/g, '').trim()
      .replace(/^[^{]*(\{)/, '$1').replace(/(\})[^}]*$/, '$1');
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // fallback：把整段当 meaning
    parsed = { intro: '', meaning: (raw || '').trim().slice(0, 200), advice: '' };
  }

  const entry = {
    date,
    modelId,
    characterName,
    cardId: card.id,
    cardName: card.name,
    cardNameEn: card.nameEn,
    cardFile: card.file,
    reversed,
    keywords,
    intro: (parsed.intro || '').trim(),
    meaning: (parsed.meaning || '').trim(),
    advice: (parsed.advice || '').trim(),
    redrawAttempt: redrawAttempt || 0,    // 第几次抽（0 = 当日初次）
    createdAt: Date.now(),
  };
  // 写缓存
  try {
    fs.writeFileSync(fileFor(date, modelId), JSON.stringify(entry, null, 2));
  } catch (e) {
    console.warn('[tarot] save failed:', e.message);
  }
  return entry;
}

// 强制重抽（次日才允许，或用户手动重置当天）
function clearToday(modelId) {
  const date = localDateStr(new Date());
  try { fs.unlinkSync(fileFor(date, modelId)); } catch (e) {}
}

// 给前端拿牌图绝对路径
function imagePath(file) {
  if (!assetsDir || !file) return '';
  return path.join(assetsDir, 'images', file);
}

module.exports = { init, getToday, interpret, clearToday, imagePath };
