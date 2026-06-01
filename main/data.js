// 用户数据导出 / 重置
const fs = require('fs');
const path = require('path');
const { createZip } = require('./zip');

let dataDir = null;

function init(userDataPath) {
  dataDir = userDataPath;
}

// 导出全部用户数据为 zip Buffer。注意 apiKey 已是密文，不会泄露
async function exportZip() {
  const zip = createZip();

  // 顶层文件
  const topFiles = [
    'settings.json',
    'chat_cache.json',
    'collection.json',
    'todos.json',
    'anniversaries.json',
  ];
  for (const f of topFiles) {
    const p = path.join(dataDir, f);
    if (fs.existsSync(p)) {
      zip.addFile(f, fs.readFileSync(p));
    }
  }

  // 子目录递归
  for (const d of ['memories', 'diaries', 'tarot']) {
    const fullDir = path.join(dataDir, d);
    if (fs.existsSync(fullDir)) {
      zip.addDir(fullDir, d);
    }
  }

  // 加一个 README 说明文件
  const readme = `Desktop Pet Live2D - 用户数据导出
导出时间: ${new Date().toISOString()}

包含内容：
- settings.json          全局设置（含加密的 API Key，仅在导出机器上能解密）
- memories/              长期记忆（共享层 + 各角色专属层）
- diaries/               每日日记（pet + user 两段）
- tarot/                 每日塔罗记录
- collection.json        口袋图鉴
- todos.json             待办
- anniversaries.json     纪念日
- chat_cache.json        最近 80 轮对话缓存

恢复方法：解压后把所有文件放回 %APPDATA%\\desktop-pet-live2d\\
注意：API Key 用 Electron safeStorage 加密，仅原导出机器的同一用户能解密。
新机器/新账户上需要重新填写 API Key。
`;
  zip.addFile('README.txt', readme);

  return zip.build();
}

// 重置全部用户数据：删除所有可恢复的子目录和文件，但保留目录本身
// 返回删除的项目数
function resetAll() {
  if (!dataDir) throw new Error('未初始化');
  const targets = [
    'settings.json', 'chat_cache.json', 'collection.json',
    'todos.json', 'anniversaries.json',
  ];
  const targetDirs = ['memories', 'diaries', 'tarot'];

  let count = 0;
  for (const f of targets) {
    const p = path.join(dataDir, f);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); count++; } catch (e) { console.error('[data] delete failed:', p, e.message); }
    }
  }
  for (const d of targetDirs) {
    const p = path.join(dataDir, d);
    if (fs.existsSync(p)) {
      try { fs.rmSync(p, { recursive: true, force: true }); count++; }
      catch (e) { console.error('[data] rmdir failed:', p, e.message); }
    }
  }
  return count;
}

module.exports = { init, exportZip, resetAll };
