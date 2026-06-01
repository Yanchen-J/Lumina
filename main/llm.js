// LLM provider 抽象 (Ollama / OpenAI-compatible)
// 支持 AbortSignal 取消 + 超时 + 流式不支持（保留 stream:false）
const https = require('https');
const http = require('http');

// 当前活跃请求的 abort registry（按 reqId 索引）
// 让外部 IPC 可以通过 reqId 取消正在跑的 LLM 调用
const activeRequests = new Map();

async function chat(cfg, messages, options = {}) {
  if (!cfg || !cfg.enabled) throw new Error('LLM 未启用');
  if (cfg.provider === 'ollama') return chatOllama(cfg, messages, options);
  if (cfg.provider === 'openai-compatible' || cfg.provider === 'openai') return chatOpenAI(cfg, messages, options);
  throw new Error('未知 provider: ' + cfg.provider);
}

async function chatOllama(cfg, messages, options) {
  const base = (cfg.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const url = base + '/api/chat';
  const body = {
    model: cfg.model,
    messages,
    stream: false,
    options: {
      num_predict: cfg.maxTokens || 200,
      temperature: cfg.temperature ?? 0.8,
    },
  };
  const resp = await postJson(url, body, {}, options);
  if (!resp || !resp.message) throw new Error('Ollama 返回格式异常');
  return resp.message.content || '';
}

async function chatOpenAI(cfg, messages, options) {
  const base = (cfg.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
  const url = /\/v\d+\/(chat\/completions|messages)$/.test(base)
    ? base
    : base + '/v1/chat/completions';
  const body = {
    model: cfg.model,
    messages,
    max_tokens: cfg.maxTokens || 200,
    temperature: cfg.temperature ?? 0.8,
    stream: false,
  };
  const headers = {};
  if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
  const resp = await postJson(url, body, headers, options);
  const choice = resp && resp.choices && resp.choices[0];
  if (!choice || !choice.message) throw new Error('OpenAI 兼容接口返回格式异常: ' + JSON.stringify(resp).slice(0, 200));
  return choice.message.content || '';
}

// options: { reqId, timeoutMs (default 60000) }
function postJson(url, body, headers = {}, options = {}) {
  const { reqId, timeoutMs = 60000 } = options;
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(new Error('无效 URL: ' + url)); }
    const lib = u.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body), 'utf-8');
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        ...headers,
      },
      timeout: timeoutMs,
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        if (reqId) activeRequests.delete(reqId);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(buf)); }
          catch (e) { reject(new Error('解析响应失败: ' + buf.slice(0, 200))); }
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + buf.slice(0, 300)));
        }
      });
    });
    req.on('error', e => {
      if (reqId) activeRequests.delete(reqId);
      reject(e);
    });
    req.on('timeout', () => req.destroy(new Error('请求超时（默认 60s）')));
    if (reqId) {
      activeRequests.set(reqId, req);
    }
    req.write(data);
    req.end();
  });
}

// 外部调用：取消某个 reqId 对应的请求
function abort(reqId) {
  const req = activeRequests.get(reqId);
  if (!req) return false;
  try { req.destroy(new Error('用户取消')); } catch (e) {}
  activeRequests.delete(reqId);
  return true;
}

module.exports = { chat, abort };
