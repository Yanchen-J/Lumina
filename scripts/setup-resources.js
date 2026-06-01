#!/usr/bin/env node
// ============================================================
// Desktop Pet Live2D - 统一资源下载脚本
// Unified resource downloader
//
// 用途：拉取所有不进 git 的资源
//   1. lib/                       第三方运行时（PixiJS / pixi-live2d-display / Cubism Core）
//   2. models/Hiyori/              Hiyori 官方示例模型
//   3. assets/tarot/images/        78 张 Rider-Waite 塔罗牌图（公共领域）
//
// 用法：
//   npm run setup
//   或：node scripts/setup-resources.js [--only=lib|hiyori|tarot]
// ============================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'lib');
const HIYORI_DIR = path.join(ROOT, 'models', 'Hiyori');
const TAROT_DIR = path.join(ROOT, 'assets', 'tarot', 'images');

// CLI 选项
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1] : null;

// ============================================================
// 共用工具
// ============================================================

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 简单 GET，自动跟随 301/302
function fetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const get = (u, redirects = 0) => {
      if (redirects > 5) return reject(new Error('too many redirects'));
      https.get(u, {
        headers: { 'User-Agent': 'desktop-pet-live2d-setup/1.0', ...headers },
      }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

// 下载到文件，可选最小字节校验
async function downloadFile(url, dest, opts = {}) {
  const { minSize = 1024, retries = 3, retryDelay = 5000, headers, label } = opts;
  if (fs.existsSync(dest) && fs.statSync(dest).size >= minSize) {
    return { skipped: true, size: fs.statSync(dest).size };
  }
  ensureDir(path.dirname(dest));
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const buf = await fetchBuffer(url, headers || {});
      if (buf.length < minSize) {
        throw new Error(`only ${buf.length} bytes (expected ≥${minSize})`);
      }
      fs.writeFileSync(dest, buf);
      return { downloaded: true, size: buf.length };
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const wait = retryDelay * attempt;
        process.stdout.write(` ⟳`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

// ============================================================
// Step 1：lib/ 下的 4 个 JS 文件
// ============================================================

const LIB_FILES = [
  {
    name: 'pixi.min.js',
    url: 'https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js',
    minSize: 400 * 1024,
    desc: 'PixiJS v6.5.10',
  },
  {
    name: 'index.min.js',
    url: 'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/index.min.js',
    minSize: 100 * 1024,
    desc: 'pixi-live2d-display 0.4.0 UMD',
  },
  {
    name: 'live2dcubismcore.min.js',
    url: 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
    minSize: 150 * 1024,
    desc: 'Live2D Cubism 4 Core (官方)',
  },
  {
    name: 'live2d.min.js',
    url: 'https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js',
    minSize: 100 * 1024,
    desc: 'Cubism 2 runtime',
  },
];

async function downloadLib() {
  console.log('\n[1/3] 第三方运行时 → lib/');
  ensureDir(LIB_DIR);
  let ok = 0, fail = 0;
  for (const f of LIB_FILES) {
    const dest = path.join(LIB_DIR, f.name);
    process.stdout.write(`  ${f.name.padEnd(28)} ${f.desc.padEnd(40)}`);
    try {
      const r = await downloadFile(f.url, dest, { minSize: f.minSize });
      console.log(` ${r.skipped ? '已存在' : '✓'} ${fmtBytes(r.size)}`);
      ok++;
    } catch (e) {
      console.log(' ✗', e.message);
      fail++;
    }
  }
  return { ok, fail };
}

// ============================================================
// Step 2：models/Hiyori/ Live2D 官方示例
// ============================================================

const HIYORI_REPO = 'Live2D/CubismWebSamples';
const HIYORI_REF = 'develop';
const HIYORI_BASE_PATH = 'Samples/Resources/Hiyori';

async function fetchJsonRaw(url) {
  const buf = await fetchBuffer(url);
  return JSON.parse(buf.toString('utf-8'));
}

async function walkGitHub(repo, ref, remotePath, localDir) {
  ensureDir(localDir);
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${remotePath}?ref=${ref}`;
  const entries = await fetchJsonRaw(apiUrl);
  if (!Array.isArray(entries)) {
    throw new Error('GitHub API returned non-array (likely rate-limited): ' + JSON.stringify(entries).slice(0, 100));
  }
  let downloaded = 0, skipped = 0;
  for (const e of entries) {
    if (e.type === 'file') {
      const dest = path.join(localDir, e.name);
      process.stdout.write(`  ${path.relative(ROOT, dest).padEnd(50)}`);
      try {
        const r = await downloadFile(e.download_url, dest, { minSize: 100 });
        console.log(` ${r.skipped ? '已存在' : '✓'} ${fmtBytes(r.size)}`);
        if (r.skipped) skipped++; else downloaded++;
      } catch (err) {
        console.log(' ✗', err.message);
      }
    } else if (e.type === 'dir') {
      const sub = await walkGitHub(repo, ref, e.path, path.join(localDir, e.name));
      downloaded += sub.downloaded;
      skipped += sub.skipped;
    }
  }
  return { downloaded, skipped };
}

async function downloadHiyori() {
  console.log('\n[2/3] Hiyori Live2D 模型 → models/Hiyori/');
  try {
    const r = await walkGitHub(HIYORI_REPO, HIYORI_REF, HIYORI_BASE_PATH, HIYORI_DIR);
    return { ok: r.downloaded + r.skipped, fail: 0 };
  } catch (e) {
    console.log('  ✗ 失败:', e.message);
    return { ok: 0, fail: 1 };
  }
}

// ============================================================
// Step 3：78 张塔罗牌图（Rider-Waite，公共领域）
// ============================================================

function buildTarotFileList() {
  const major = [
    'RWS_Tarot_00_Fool.jpg', 'RWS_Tarot_01_Magician.jpg', 'RWS_Tarot_02_High_Priestess.jpg',
    'RWS_Tarot_03_Empress.jpg', 'RWS_Tarot_04_Emperor.jpg', 'RWS_Tarot_05_Hierophant.jpg',
    'RWS_Tarot_06_Lovers.jpg', 'RWS_Tarot_07_Chariot.jpg', 'RWS_Tarot_08_Strength.jpg',
    'RWS_Tarot_09_Hermit.jpg', 'RWS_Tarot_10_Wheel_of_Fortune.jpg', 'RWS_Tarot_11_Justice.jpg',
    'RWS_Tarot_12_Hanged_Man.jpg', 'RWS_Tarot_13_Death.jpg', 'RWS_Tarot_14_Temperance.jpg',
    'RWS_Tarot_15_Devil.jpg', 'RWS_Tarot_16_Tower.jpg', 'RWS_Tarot_17_Star.jpg',
    'RWS_Tarot_18_Moon.jpg', 'RWS_Tarot_19_Sun.jpg', 'RWS_Tarot_20_Judgement.jpg',
    'RWS_Tarot_21_World.jpg',
  ];
  const minor = [];
  for (const s of ['Wands', 'Cups', 'Swords', 'Pents']) {
    for (let i = 1; i <= 14; i++) minor.push(`${s}${String(i).padStart(2, '0')}.jpg`);
  }
  return [...major, ...minor];
}

function wikiFilePathUrl(filename) {
  return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(filename);
}

// 兜底：抓 Commons HTML 页面拿真实 thumb URL（FilePath 重定向被限流时用）
async function wikiThumbViaScrape(filename) {
  const pageUrl = 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(filename);
  const html = (await fetchBuffer(pageUrl, { 'User-Agent': 'Mozilla/5.0' })).toString('utf-8');
  const re = new RegExp(`https://upload\\.wikimedia\\.org/wikipedia/commons/[^"]+${filename.replace(/\./g, '\\.')}`, 'g');
  const m = html.match(re);
  if (!m || !m.length) return null;
  // 优先 thumb（更小，下载快）
  const thumb = m.find(u => u.includes('/thumb/'));
  return thumb || m[0];
}

async function downloadOneTarotCard(filename, dest) {
  // 主路径：FilePath 重定向
  try {
    const r = await downloadFile(wikiFilePathUrl(filename), dest, {
      minSize: 50 * 1024,
      retries: 1,
      retryDelay: 0,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return r;
  } catch (e) {
    // 兜底：抓 HTML 拿 thumb URL
    await sleep(3000);
    const url = await wikiThumbViaScrape(filename);
    if (!url) throw new Error('无法找到图片 URL');
    return await downloadFile(url, dest, {
      minSize: 50 * 1024,
      retries: 2,
      retryDelay: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://commons.wikimedia.org/' },
    });
  }
}

async function downloadTarot() {
  console.log('\n[3/3] 塔罗牌图（78 张 Rider-Waite，公共领域）→ assets/tarot/images/');
  ensureDir(TAROT_DIR);
  const files = buildTarotFileList();
  let ok = 0, fail = 0, skipped = 0;
  const failed = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const dest = path.join(TAROT_DIR, f);
    process.stdout.write(`  [${String(i + 1).padStart(2, '0')}/78] ${f.padEnd(35)}`);
    try {
      const r = await downloadOneTarotCard(f, dest);
      if (r.skipped) {
        console.log(' 已存在');
        skipped++;
      } else {
        console.log(' ✓', fmtBytes(r.size));
        ok++;
        // 限流防御：每张牌之间等 400ms
        await sleep(400);
      }
    } catch (e) {
      console.log(' ✗', e.message);
      fail++;
      failed.push(f);
    }
  }
  if (failed.length) {
    console.log('\n  ⚠ 失败的塔罗牌：', failed.join(', '));
    console.log('    再跑一次 npm run setup 会自动重试这些');
  }
  return { ok: ok + skipped, fail };
}

// ============================================================
// 主流程
// ============================================================

(async () => {
  console.log('=== Desktop Pet Live2D - 资源下载 ===');
  if (only) console.log('仅下载:', only);

  const summary = [];
  if (!only || only === 'lib')    summary.push(['lib',    await downloadLib()]);
  if (!only || only === 'hiyori') summary.push(['hiyori', await downloadHiyori()]);
  if (!only || only === 'tarot')  summary.push(['tarot',  await downloadTarot()]);

  console.log('\n=== 完成 ===');
  let totalFail = 0;
  for (const [name, r] of summary) {
    console.log(`  ${name.padEnd(8)} ok=${r.ok} fail=${r.fail}`);
    totalFail += r.fail;
  }
  if (totalFail > 0) {
    console.log('\n部分资源下载失败。可能原因：');
    console.log('  - 网络不稳定 / GitHub API 限流（每小时 60 次匿名请求）');
    console.log('  - jsDelivr 在某些地区不稳定，可考虑临时切换 VPN');
    console.log('  - 再跑一次 npm run setup 会从断点继续，已下的不会重下');
    process.exit(1);
  }
  console.log('\n现在可以运行：npm install && npm start');
})().catch(e => { console.error('\n[fatal]', e); process.exit(1); });
