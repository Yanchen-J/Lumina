// Settings 持久化 (userData/settings.json)
// 注意：llm.apiKey 用 Electron safeStorage 加密存储（不可用时降级明文）
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const DEFAULT_SETTINGS = {
  currentModel: 'Hiyori',
  firstRun: true,           // 首次启动后置 false，桌宠会引导一次后不再提示
  llm: {
    enabled: false,
    provider: 'ollama',                   // 'ollama' | 'openai-compatible'
    baseUrl: 'http://localhost:11434',
    apiKey: '',
    model: 'qwen2.5:7b',
    maxTokens: 200,
    temperature: 0.8,
    timeoutSeconds: 60,                   // 所有 LLM 调用的超时秒数（聊天/日记/塔罗/记忆共用）
  },
  memory: {
    enabled: false,
    maxFacts: 30,
    extractEvery: 8,            // 每 N 条用户消息后台触发一次事实提取
    extractMaxTokens: 1000,     // 提取调用的最大 tokens（独立于聊天）
    consolidateMaxTokens: 1500, // 整理调用的最大 tokens
  },
  diary: {
    autoGenerate: false,
    autoGenerateTime: '22:30',
    maxTokens: 1500,
  },
  collection: {
    autoGenerate: false,
    autoEveryNTurns: 20,
    maxTokens: 2500,
    minSnippets: 1,
    maxSnippets: 3,
  },
  voice: {
    muted: false,        // 全局静音；勾上后即使角色开了 voiceEnabled 也不响
  },
};

let settingsPath = null;
let cache = null;

function mergeDeep(a, b) {
  if (b === null || b === undefined) return a;
  if (typeof a !== 'object' || a === null) return b;
  const out = Array.isArray(a) ? [...a] : { ...a };
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') {
      out[k] = mergeDeep(a[k], b[k]);
    } else {
      out[k] = b[k];
    }
  }
  return out;
}

// 加密标记前缀，识别"这是加密过的"——避免反复加密或把已加密 base64 当明文 key 使用
const ENC_PREFIX = 'enc:v1:';

function isEncryptionAvailable() {
  try { return safeStorage.isEncryptionAvailable(); }
  catch (e) { return false; }
}

function encryptKey(plain) {
  if (!plain) return '';
  if (plain.startsWith(ENC_PREFIX)) return plain; // 已加密，幂等
  if (!isEncryptionAvailable()) return plain;     // 系统不支持，明文存
  try {
    const buf = safeStorage.encryptString(plain);
    return ENC_PREFIX + buf.toString('base64');
  } catch (e) {
    console.warn('[settings] encryptString failed:', e.message);
    return plain;
  }
}

function decryptKey(stored) {
  if (!stored) return '';
  if (!stored.startsWith(ENC_PREFIX)) return stored; // 明文（旧版本/未支持时）
  if (!isEncryptionAvailable()) {
    console.warn('[settings] decryption unavailable, returning empty for safety');
    return '';
  }
  try {
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  } catch (e) {
    console.warn('[settings] decryptString failed:', e.message);
    return '';
  }
}

function init(userDataPath) {
  settingsPath = path.join(userDataPath, 'settings.json');
  load();
}

function load() {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    cache = mergeDeep(DEFAULT_SETTINGS, JSON.parse(raw));
  } catch (e) {
    cache = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    persist();
  }
  return cache;
}

// 对外提供：返回带解密后明文 apiKey 的设置（供运行时 LLM 调用 / settings UI）
function get() {
  if (!cache) load();
  // 浅拷贝 + 解密 apiKey，原 cache 保持加密形态
  const out = { ...cache, llm: { ...cache.llm } };
  if (out.llm && out.llm.apiKey) {
    out.llm.apiKey = decryptKey(out.llm.apiKey);
  }
  return out;
}

function update(next) {
  if (!cache) load();
  // 把传入的明文 apiKey 加密后再写入 cache
  if (next && next.llm && typeof next.llm.apiKey === 'string') {
    next = {
      ...next,
      llm: { ...next.llm, apiKey: encryptKey(next.llm.apiKey) },
    };
  }
  cache = mergeDeep(cache, next);
  persist();
  // 返回时同 get()——把 apiKey 解密给调用方
  return get();
}

function persist() {
  if (!settingsPath) return;
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('[settings] save failed:', e.message);
  }
}

module.exports = { init, get, update };
