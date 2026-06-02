const { app, BrowserWindow, Menu, Tray, ipcMain, screen, powerMonitor, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const settings = require('./main/settings');
const llm = require('./main/llm');
const models = require('./main/models');
const memory = require('./main/memory');
const diary = require('./main/diary');
const reminders = require('./main/reminders');
const collection = require('./main/collection');
const tarot = require('./main/tarot');
const data = require('./main/data');

const MODELS_DIR = path.join(__dirname, 'models');

let petWindow = null;
let settingsWindow = null;
let diaryWindow = null;
let remindersWindow = null;
let collectionWindow = null;
let tarotWindow = null;
let tray = null;
let activityTimer = null;
let activeWinFn = null;

function createPetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winW = 380;
  const winH = 600;

  petWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: width - winW - 20,
    y: height - winH - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // 本地应用：允许 file:// 协议下 fetch 模型文件
    },
  });

  petWindow.setMenu(null);
  petWindow.loadFile(path.join('renderer', 'index.html'));
  // 锁死页面缩放因子。否则在高刷屏 + 高 DPI 缩放下，
  // setBounds 频繁触发 Chromium 重算 zoomFactor，
  // DOM 元素（气泡/菜单/聊天框）会跟着抖动 + 漂移 + 累积变大。
  petWindow.webContents.on('did-finish-load', () => {
    petWindow.webContents.setZoomFactor(1);
    petWindow.webContents.setVisualZoomLevelLimits(1, 1);
  });
  // 拦截 Ctrl+滚轮 / 触摸板手势缩放，防止用户或系统误触发
  petWindow.webContents.on('zoom-changed', () => {
    petWindow.webContents.setZoomFactor(1);
  });
  // petWindow.webContents.openDevTools({ mode: 'detach' });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 760,
    title: '桌宠设置',
    resizable: true,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join('renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function createDiaryWindow() {
  if (diaryWindow && !diaryWindow.isDestroyed()) {
    diaryWindow.focus();
    return;
  }
  diaryWindow = new BrowserWindow({
    width: 980,
    height: 680,
    title: '桌宠日记',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,   // 允许 file:// 协议加载 Live2D 模型
    },
  });
  diaryWindow.setMenu(null);
  diaryWindow.loadFile(path.join('renderer', 'diary.html'));
  diaryWindow.on('closed', () => { diaryWindow = null; });
}

function createRemindersWindow(initialTab) {
  if (remindersWindow && !remindersWindow.isDestroyed()) {
    remindersWindow.focus();
    if (initialTab) remindersWindow.webContents.send('reminders:switch-tab', initialTab);
    return;
  }
  remindersWindow = new BrowserWindow({
    width: 640,
    height: 720,
    title: '便签 & 纪念日',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  remindersWindow.setMenu(null);
  remindersWindow.loadFile(path.join('renderer', 'reminders.html'));
  remindersWindow.on('closed', () => { remindersWindow = null; });
  if (initialTab) {
    remindersWindow.webContents.once('did-finish-load', () => {
      remindersWindow.webContents.send('reminders:switch-tab', initialTab);
    });
  }
}

function createCollectionWindow() {
  if (collectionWindow && !collectionWindow.isDestroyed()) {
    collectionWindow.focus();
    return;
  }
  collectionWindow = new BrowserWindow({
    width: 980,
    height: 660,
    title: '口袋图鉴',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  collectionWindow.setMenu(null);
  collectionWindow.loadFile(path.join('renderer', 'collection.html'));
  collectionWindow.on('closed', () => { collectionWindow = null; });
}

function createTarotWindow() {
  if (tarotWindow && !tarotWindow.isDestroyed()) {
    tarotWindow.focus();
    return;
  }
  tarotWindow = new BrowserWindow({
    width: 540,
    height: 720,
    title: '🔮 今日塔罗',
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,   // 允许 file:// 加载牌图
    },
  });
  tarotWindow.setMenu(null);
  tarotWindow.loadFile(path.join('renderer', 'tarot.html'));
  tarotWindow.on('closed', () => { tarotWindow = null; });
}

function togglePetVisibility() {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (petWindow.isVisible()) {
    petWindow.hide();
  } else {
    petWindow.show();
    petWindow.focus();
  }
}

// 生成 16x16 粉色圆点 PNG 给托盘用
// 不依赖外部图片文件，程序运行时合成
function makeTrayIcon() {
  const zlib = require('zlib');
  const W = 16, H = 16;
  // 构造 RGBA 数据：粉色圆点（#ff5d9a）+ 透明背景
  const cx = 7.5, cy = 7.5, r = 6.5;
  const data = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    data[y * (1 + W * 4)] = 0;   // PNG filter byte
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const off = y * (1 + W * 4) + 1 + x * 4;
      if (dist <= r - 0.5) {
        // 实心
        data[off] = 0xff; data[off + 1] = 0x5d; data[off + 2] = 0x9a; data[off + 3] = 0xff;
      } else if (dist <= r + 0.5) {
        // 边缘抗锯齿
        const a = Math.max(0, Math.min(1, r + 0.5 - dist));
        data[off] = 0xff; data[off + 1] = 0x5d; data[off + 2] = 0x9a; data[off + 3] = Math.round(255 * a);
      }
    }
  }
  // PNG 三个 chunk: IHDR / IDAT / IEND
  const chunk = (type, payload) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(payload.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, payload])), 0);
    return Buffer.concat([len, t, payload, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;   // bitDepth
  ihdr[9] = 6;   // colorType RGBA
  // 10/11/12 = 0 默认
  const idat = chunk('IDAT', zlib.deflateSync(data));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    idat,
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return nativeImage.createFromBuffer(png);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function createTray() {
  try {
    const icon = makeTrayIcon();
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: '显示 / 隐藏', click: togglePetVisibility },
      { label: '设置...', click: createSettingsWindow },
      { type: 'separator' },
      { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setToolTip('Live2D 桌面宠物（左键唤出 / Ctrl+Alt+P 快捷键）');
    tray.setContextMenu(contextMenu);
    // 左键点击托盘图标：切换显示/隐藏。Windows 上 click 事件就是左键单击
    tray.on('click', togglePetVisibility);
  } catch (e) {
    console.error('[tray] failed:', e.message);
  }
}

app.whenReady().then(() => {
  settings.init(app.getPath('userData'));
  memory.init(app.getPath('userData'));
  diary.init(app.getPath('userData'));
  reminders.init(app.getPath('userData'));
  collection.init(app.getPath('userData'));
  tarot.init(app.getPath('userData'), path.join(__dirname, 'assets', 'tarot'));
  data.init(app.getPath('userData'));
  chatCachePath = path.join(app.getPath('userData'), 'chat_cache.json');
  loadChatCache();
  syncCharacterBirthdays();
  createPetWindow();
  createTray();
  startActivityPolling();

  // 全局快捷键 Ctrl+Alt+P 切换显示/隐藏
  // 是兜底入口，万一托盘图标找不到（被系统隐藏到溢出区）也能唤出
  try {
    const ok = globalShortcut.register('CommandOrControl+Alt+P', togglePetVisibility);
    if (!ok) console.warn('[shortcut] Ctrl+Alt+P 注册失败（可能被其它程序占用）');
  } catch (e) {
    console.warn('[shortcut] register failed:', e.message);
  }
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (e) {}
});

// 把所有角色 pet.config.json 里的 birthday 自动同步到纪念日表
// 标题用 "<角色名> 的生日"，已经存在的不重复加
function syncCharacterBirthdays() {
  try {
    const list = models.scan(MODELS_DIR);
    const existing = reminders.listAnniversaries();
    for (const m of list) {
      const bday = m.config && m.config.birthday;
      if (!bday) continue;
      const match = /^(\d{1,2})-(\d{1,2})$/.exec(String(bday).trim());
      if (!match) continue;
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) continue;
      const title = (m.config.displayName || m.id) + ' 的生日';
      if (existing.some(a => a.title === title)) continue;
      reminders.addAnniversary({
        title,
        type: '生日',
        month, day,
        year: null,
        notes: '由角色配置自动登记',
        remindDaysBefore: [3, 1],
      });
      console.log('[birthday] registered:', title, month + '-' + day);
    }
  } catch (e) {
    console.warn('[birthday] sync failed:', e.message);
  }
}

// ========== IPC: 窗口控制 ==========
ipcMain.on('pet:quit', () => { app.isQuitting = true; app.quit(); });
ipcMain.on('pet:hide', () => petWindow && petWindow.hide());
ipcMain.on('pet:open-settings', createSettingsWindow);
ipcMain.on('pet:focus', () => {
  if (!petWindow) return;
  if (!petWindow.isVisible()) petWindow.show();
  petWindow.focus();
});
ipcMain.on('pet:set-ignore-mouse', (_e, ignore) => {
  if (petWindow) petWindow.setIgnoreMouseEvents(ignore, { forward: true });
});

// ========== IPC: 拖拽窗口 ==========
// 用 screen.getCursorScreenPoint() 而不是渲染器传来的 e.screenX，
// 因为后者在 HiDPI 下是逻辑像素，setBounds 需要 DIP 一致的坐标
let dragOffset = null;
let dragRaf = null;
let pendingMove = null;

ipcMain.on('pet:drag-start', () => {
  if (!petWindow) return;
  const pt = screen.getCursorScreenPoint();
  const [wx, wy] = petWindow.getPosition();
  dragOffset = { dx: pt.x - wx, dy: pt.y - wy };
});

ipcMain.on('pet:drag-move', () => {
  if (!petWindow || !dragOffset) return;
  if (pendingMove) return;
  pendingMove = true;
  setImmediate(() => {
    pendingMove = false;
    if (!petWindow || !dragOffset || petWindow.isDestroyed()) return;
    const pt = screen.getCursorScreenPoint();
    const b = petWindow.getBounds();
    petWindow.setBounds({
      x: pt.x - dragOffset.dx,
      y: pt.y - dragOffset.dy,
      width: b.width,
      height: b.height,
    }, false);
  });
});

ipcMain.on('pet:drag-end', () => { dragOffset = null; });

// 切换角色时根据配置调整窗口尺寸
ipcMain.on('pet:resize-window', (_e, { width, height }) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  const w = Math.max(200, Math.min(1200, Math.round(width)));
  const h = Math.max(200, Math.min(1400, Math.round(height)));
  const b = petWindow.getBounds();
  // 保持窗口右下角在原位置（小生物从右下角"长大/缩小"，不至于飞走）
  petWindow.setBounds({
    x: b.x + (b.width - w),
    y: b.y + (b.height - h),
    width: w,
    height: h,
  }, false);
});

// ========== IPC: 设置 ==========
ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:save', (_e, next) => {
  const updated = settings.update(next);
  // 广播给所有窗口（特别是 pet 窗口）
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('settings:update', updated);
  }
  return updated;
});

// ========== IPC: 模型 ==========
ipcMain.handle('models:list', () => models.scan(MODELS_DIR));
ipcMain.handle('models:update-config', (_e, { modelId, patch }) => {
  const next = models.updateConfig(MODELS_DIR, modelId, patch);
  // 通知 pet 窗口刷新当前角色配置（如果改的就是当前的）
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('models:config-updated', modelId);
  }
  return next;
});
ipcMain.handle('models:reset-personality', (_e, modelId) => {
  const next = models.resetPersonality(MODELS_DIR, modelId);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('models:config-updated', modelId);
  }
  return next;
});
ipcMain.handle('models:default-config', () => models.DEFAULT_CONFIG);
ipcMain.handle('models:switch', (_e, id) => {
  const updated = settings.update({ currentModel: id });
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('models:switched', id);
  }
  return updated;
});

// ========== IPC: LLM ==========
ipcMain.handle('llm:chat', async (_e, { messages, personality, modelId, reqId }) => {
  const s = settings.get();
  const cfg = s.llm;
  console.log('[llm:chat] enter, modelId=', modelId, 'memory.enabled=', s.memory && s.memory.enabled);
  if (!cfg.enabled) throw new Error('LLM 未启用，请右键 → 设置 中开启');

  // 拼 system prompt: personality + 记忆库
  let systemContent = personality || '';
  if (s.memory && s.memory.enabled && modelId) {
    const memoryText = memory.inject(modelId);
    systemContent += memoryText;
    console.log('[llm:chat] memory injected (' + memoryText.length + ' chars):',
      memoryText ? memoryText.slice(0, 200) : '(empty)');
  }
  const withSystem = systemContent
    ? [{ role: 'system', content: systemContent }, ...messages]
    : messages;

  const reply = await llm.chat(cfg, withSystem, { reqId, timeoutMs: (cfg.timeoutSeconds || 60) * 1000 });
  console.log('[llm:chat] got reply length=', (reply || '').length);

  // 后台异步提取事实（不阻塞当前响应）
  if (s.memory && s.memory.enabled && modelId) {
    const n = memory.noteUserMessage(modelId);
    console.log('[memory] msgsSinceExtraction=', n, 'threshold=', s.memory.extractEvery || 8);
    if (n >= (s.memory.extractEvery || 8)) {
      const fullConv = [...messages, { role: 'assistant', content: reply }];
      const maxFacts = s.memory.maxFacts || 30;
      // 取角色配置（displayName + memoryFocus）
      const allModels = models.scan(MODELS_DIR);
      const info = allModels.find(m => m.id === modelId);
      const charName = (info && info.config.displayName) || modelId;
      const focus = (info && info.config.memoryFocus) || '';
      console.log('[memory] triggering extract for', modelId);
      setImmediate(() => {
        memory.extract(modelId, charName, focus, fullConv, cfg, maxFacts, (s.memory && s.memory.extractMaxTokens) || 1000)
          .then((m) => {
            console.log('[memory] extract done, shared=', m.shared.facts.length, 'specific=', m.specific.facts.length);
            for (const win of BrowserWindow.getAllWindows()) {
              if (!win.isDestroyed()) win.webContents.send('memory:updated', modelId);
            }
          })
          .catch(e => console.error('[memory] background extract failed:', e.message));
      });
    }
  } else {
    console.log('[llm:chat] memory not enabled or no modelId, skip extract');
  }

  return reply;
});

ipcMain.handle('llm:test', async () => {
  const s = settings.get();
  const cfg = { ...s.llm, enabled: true };
  return await llm.chat(cfg, [
    { role: 'user', content: '请用一句中文打个招呼，不超过 15 个字。' },
  ]);
});
ipcMain.on('llm:abort', (_e, reqId) => {
  if (reqId) llm.abort(reqId);
});

// ========== IPC: 数据导出 / 重置 ==========
const { dialog } = require('electron');
ipcMain.handle('data:export', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const def = `desktop-pet-data-${new Date().toISOString().slice(0, 10)}.zip`;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出用户数据',
    defaultPath: def,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  // 强制保证 LLM api key 已加密落盘
  settings.update({});
  const buf = await data.exportZip();
  fs.writeFileSync(filePath, buf);
  return { canceled: false, filePath, size: buf.length };
});
ipcMain.handle('data:reset', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showMessageBox(win, {
    type: 'warning',
    title: '重置应用',
    message: '确定要清除所有数据吗？',
    detail: '这会删除：长期记忆、所有日记、塔罗记录、口袋图鉴、待办、纪念日、设置（含 API Key）。\n\n建议先「导出全部数据」备份。\n\n此操作不可恢复。',
    buttons: ['取消', '我要清空所有数据'],
    defaultId: 0,
    cancelId: 0,
  });
  if (r.response !== 1) return { canceled: true };
  const count = data.resetAll();
  // 让 settings 重新加载默认值
  settings.init(app.getPath('userData'));
  // 广播让所有窗口刷新
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('settings:update', settings.get());
  }
  return { canceled: false, count };
});

// ========== IPC: 关于 / 工具 ==========
const { shell } = require('electron');
ipcMain.handle('about:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  platform: process.platform,
  arch: process.arch,
  userDataPath: app.getPath('userData'),
}));
ipcMain.on('shell:open-userdata', () => {
  shell.openPath(app.getPath('userData'));
});
ipcMain.on('shell:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});

// ========== IPC: 记忆 ==========
ipcMain.handle('memory:get', (_e, modelId) => memory.get(modelId));
ipcMain.handle('memory:clear', (_e, { modelId, scope }) => {
  if (scope === 'shared') memory.clearShared();
  else if (scope === 'specific') memory.clearSpecific(modelId);
  else if (scope === 'both') { memory.clearShared(); memory.clearSpecific(modelId); }
  else memory.clearSpecific(modelId);
  return true;
});
ipcMain.handle('memory:extract-now', async (_e, { modelId, conversation }) => {
  const s = settings.get();
  if (!s.llm.enabled) throw new Error('LLM 未启用');
  const allModels = models.scan(MODELS_DIR);
  const info = allModels.find(m => m.id === modelId);
  const charName = (info && info.config.displayName) || modelId;
  const focus = (info && info.config.memoryFocus) || '';
  return await memory.extract(modelId, charName, focus, conversation, s.llm, (s.memory && s.memory.maxFacts) || 30, (s.memory && s.memory.extractMaxTokens) || 1000);
});
ipcMain.handle('memory:consolidate', async (_e, modelId) => {
  const s = settings.get();
  if (!s.llm.enabled) throw new Error('LLM 未启用，整理需要 LLM');
  const allModels = models.scan(MODELS_DIR);
  const info = allModels.find(m => m.id === modelId);
  const charName = (info && info.config.displayName) || modelId;
  const result = await memory.consolidate(modelId, charName, s.llm, (s.memory && s.memory.consolidateMaxTokens) || 1500);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('memory:updated', modelId);
  }
  return result;
});

// ========== IPC: 日记 ==========
ipcMain.handle('diary:exists-today', () => diary.petExists());
ipcMain.handle('diary:get', (_e, date) => diary.get(date));
ipcMain.handle('diary:list-all', () => diary.listAll());
ipcMain.handle('diary:emojis', () => diary.ALLOWED_EMOJIS);
ipcMain.on('diary:open-window', createDiaryWindow);
ipcMain.handle('diary:save-user', (_e, { date, body, mood, emoji }) => {
  const file = diary.saveUser(date, { body, mood, emoji });
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('diary:updated');
  }
  return file;
});
ipcMain.handle('diary:delete-user', (_e, date) => {
  const file = diary.deleteUser(date);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('diary:updated');
  }
  return file;
});

// ========== IPC: 便签 + 纪念日 ==========
ipcMain.on('reminders:open-window', (_e, tab) => createRemindersWindow(tab));

ipcMain.handle('todos:list', () => reminders.listTodos());
ipcMain.handle('todos:add', (_e, data) => {
  const r = reminders.addTodo(data);
  broadcastRemindersUpdate();
  return r;
});
ipcMain.handle('todos:update', (_e, { id, patch }) => {
  const r = reminders.updateTodo(id, patch);
  broadcastRemindersUpdate();
  return r;
});
ipcMain.handle('todos:delete', (_e, id) => {
  reminders.deleteTodo(id);
  broadcastRemindersUpdate();
  return true;
});
ipcMain.handle('todos:check', (_e, { id, completed }) => {
  const r = reminders.checkTodo(id, completed);
  broadcastRemindersUpdate();
  return r;
});
ipcMain.handle('todos:upcoming', (_e, windowMinutes) => reminders.upcomingTodos(windowMinutes));

ipcMain.handle('anniv:list', () => reminders.listAnniversaries());
ipcMain.handle('anniv:add', (_e, data) => {
  const r = reminders.addAnniversary(data);
  broadcastRemindersUpdate();
  return r;
});
ipcMain.handle('anniv:update', (_e, { id, patch }) => {
  const r = reminders.updateAnniversary(id, patch);
  broadcastRemindersUpdate();
  return r;
});
ipcMain.handle('anniv:delete', (_e, id) => {
  reminders.deleteAnniversary(id);
  broadcastRemindersUpdate();
  return true;
});
ipcMain.handle('anniv:today', () => reminders.todaysAnniversaries());
ipcMain.handle('anniv:upcoming', () => reminders.upcomingAnniversaries());

// ========== 当前对话缓存（持久化到 userData/chat_cache.json） ==========
let chatCache = [];
let chatCachePath = null;
let chatCacheSaveTimer = null;
let collectionTurnCounter = 0;

function loadChatCache() {
  if (!chatCachePath) return;
  try {
    const raw = fs.readFileSync(chatCachePath, 'utf-8');
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.messages)) chatCache = obj.messages.slice(-80);
    if (Number.isFinite(obj.collectionTurnCounter)) collectionTurnCounter = obj.collectionTurnCounter;
  } catch (e) { /* 文件不存在或损坏，从空开始 */ }
}

function saveChatCacheDebounced() {
  if (chatCacheSaveTimer) clearTimeout(chatCacheSaveTimer);
  chatCacheSaveTimer = setTimeout(saveChatCacheNow, 1000);
}

function saveChatCacheNow() {
  if (chatCacheSaveTimer) { clearTimeout(chatCacheSaveTimer); chatCacheSaveTimer = null; }
  if (!chatCachePath) return;
  try {
    fs.writeFileSync(chatCachePath, JSON.stringify({
      messages: chatCache,
      collectionTurnCounter,
    }, null, 2));
  } catch (e) { console.error('[chatCache] save failed:', e.message); }
}

// 收集所有角色名（含 modelId 和 displayName）作为图鉴排除标题
// 防止 LLM 把"小埋"或"和小埋玩"等错误归为实体
function collectExcludeTitles(allModels) {
  const set = new Set();
  for (const m of allModels) {
    if (m.id) set.add(m.id);
    if (m.config && m.config.displayName) set.add(m.config.displayName);
  }
  return Array.from(set);
}

function maybeAutoRebuildCollection() {
  const s = settings.get();
  if (!s.collection || !s.collection.autoGenerate) return;
  const threshold = s.collection.autoEveryNTurns || 20;
  if (collectionTurnCounter < threshold) return;
  collectionTurnCounter = 0;
  saveChatCacheNow(); // 立即保存计数器归零
  console.log('[collection] auto rebuild triggered');
  // 后台异步整理，不阻塞前端
  setImmediate(async () => {
    try {
      const allModels = models.scan(MODELS_DIR);
      const seen = new Set();
      const allFacts = [];
      const sharedMem = memory.get('__shared_dummy__');
      if (sharedMem.shared && sharedMem.shared.facts) {
        for (const f of sharedMem.shared.facts) {
          if (!seen.has(f.text)) { seen.add(f.text); allFacts.push(f.text); }
        }
      }
      for (const m of allModels) {
        const memData = memory.get(m.id);
        if (memData.specific && memData.specific.facts) {
          for (const f of memData.specific.facts) {
            if (!seen.has(f.text)) { seen.add(f.text); allFacts.push(f.text); }
          }
        }
      }
      const result = await collection.rebuild({
        allFacts,
        recentChat: chatCache,
        llmCfg: s.llm,
        maxTokens: s.collection.maxTokens || 2500,
        minSnippets: s.collection.minSnippets || 1,
        maxSnippets: s.collection.maxSnippets || 3,
        excludeTitles: collectExcludeTitles(allModels),
      });
      console.log('[collection] auto rebuild done, items=', result.items ? result.items.length : 0);
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('collection:updated');
      }
    } catch (e) {
      console.error('[collection] auto rebuild failed:', e.message);
    }
  });
}

ipcMain.on('chat:cache', (_e, messages) => {
  if (!Array.isArray(messages)) return;
  const oldUserCount = chatCache.filter(m => m.role === 'user').length;
  chatCache = messages.slice(-80);
  const newUserCount = chatCache.filter(m => m.role === 'user').length;
  // 增量 user 轮数
  if (newUserCount > oldUserCount) {
    collectionTurnCounter += (newUserCount - oldUserCount);
    maybeAutoRebuildCollection();
  }
  saveChatCacheDebounced();
});

// ========== IPC: 口袋图鉴 ==========
ipcMain.on('collection:open-window', createCollectionWindow);

// ========== IPC: 塔罗 ==========
const { pathToFileURL } = require('url');
ipcMain.on('tarot:open-window', createTarotWindow);
ipcMain.handle('tarot:get-today', (_e, modelId) => {
  const t = tarot.getToday(modelId);
  if (!t) return null;
  return { ...t, imageUrl: pathToFileURL(tarot.imagePath(t.cardFile)).href };
});
ipcMain.handle('tarot:draw', async (_e, { modelId, force }) => {
  const s = settings.get();
  if (!s.llm.enabled) throw new Error('LLM 未启用，塔罗解读需要 LLM');
  // 计算下一次 redrawAttempt（force 时基于当前缓存的 attempt + 1）
  let redrawAttempt = 0;
  if (force) {
    const cur = tarot.getToday(modelId);
    redrawAttempt = (cur && Number.isFinite(cur.redrawAttempt) ? cur.redrawAttempt : 0) + 1;
    tarot.clearToday(modelId);
  }
  const allModels = models.scan(MODELS_DIR);
  const info = allModels.find(m => m.id === modelId);
  const characterName = (info && info.config.displayName) || modelId;
  const personality = (info && info.config.personality) || '';
  const r = await tarot.interpret({
    modelId, characterName, personality,
    llmCfg: s.llm,
    maxTokens: 600,
    redrawAttempt,
  });
  return { ...r, imageUrl: pathToFileURL(tarot.imagePath(r.cardFile)).href };
});
ipcMain.handle('collection:list', () => collection.list());
ipcMain.handle('collection:get', (_e, id) => collection.get(id));
ipcMain.handle('collection:clear', () => collection.clear());
ipcMain.handle('collection:delete', (_e, id) => {
  const ok = collection.deleteItem(id);
  if (ok) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('collection:updated');
    }
  }
  return ok;
});
ipcMain.handle('collection:rebuild', async (_e, { recentChat }) => {
  const s = settings.get();
  if (!s.llm.enabled) throw new Error('LLM 未启用，整理图鉴需要 LLM');
  // 聚合所有模型的记忆事实
  const allModels = models.scan(MODELS_DIR);
  const seen = new Set();
  const allFacts = [];
  // 共享层
  const sharedMem = memory.get('__shared_dummy__'); // 任何 modelId 都能拿 shared
  if (sharedMem.shared && sharedMem.shared.facts) {
    for (const f of sharedMem.shared.facts) {
      if (!seen.has(f.text)) { seen.add(f.text); allFacts.push(f.text); }
    }
  }
  // 每个角色的 specific
  for (const m of allModels) {
    const memData = memory.get(m.id);
    if (memData.specific && memData.specific.facts) {
      for (const f of memData.specific.facts) {
        if (!seen.has(f.text)) { seen.add(f.text); allFacts.push(f.text); }
      }
    }
  }
  // recentChat 优先用调用方传的（pet 窗口 conversation），否则用主进程缓存
  const chat = (Array.isArray(recentChat) && recentChat.length)
    ? recentChat
    : chatCache;
  console.log('[collection] rebuild facts=', allFacts.length, 'chatSnippets=', chat.length);
  const result = await collection.rebuild({
    allFacts,
    recentChat: chat,
    llmCfg: s.llm,
    maxTokens: s.collection.maxTokens || 2500,
    minSnippets: s.collection.minSnippets || 1,
    maxSnippets: s.collection.maxSnippets || 3,
    excludeTitles: collectExcludeTitles(allModels),
  });
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('collection:updated');
  }
  return result;
});

function broadcastRemindersUpdate() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('reminders:updated');
  }
}
ipcMain.handle('diary:generate', async (_e, { modelId, ctx, overwrite }) => {
  const s = settings.get();
  if (!s.llm.enabled) throw new Error('LLM 未启用，写日记需要 LLM');
  const allModels = models.scan(MODELS_DIR);
  const info = allModels.find(m => m.id === modelId);
  const characterName = (info && info.config.displayName) || modelId;
  const personality = (info && info.config.personality) || '';
  const mem = memory.get(modelId);
  const facts = [
    ...((mem.shared && mem.shared.facts) || []),
    ...((mem.specific && mem.specific.facts) || []),
  ].map(f => f.text);
  const anniversaries = reminders.todaysAnniversaries();
  const ctxWithFacts = { ...ctx, facts, anniversaries };
  const result = await diary.generate({
    modelId, characterName, personality,
    llmCfg: s.llm,
    ctx: ctxWithFacts,
    overwrite: !!overwrite,
    maxTokens: (s.diary && s.diary.maxTokens) || 1500,
  });
  // 通知日记窗口刷新
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('diary:updated');
  }
  return result;
});

// ========== 系统活动感知 ==========
async function loadActiveWin() {
  if (activeWinFn) return activeWinFn;
  try {
    const mod = await import('active-win');
    activeWinFn = mod.default || mod.activeWindow || mod;
    return activeWinFn;
  } catch (e) {
    console.error('[activity] active-win load failed:', e.message);
    return null;
  }
}

async function pollActivity() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const idle = powerMonitor.getSystemIdleTime();
  let processName = '';
  let title = '';
  try {
    const getActive = await loadActiveWin();
    if (getActive) {
      const info = await getActive();
      if (info) {
        processName = (info.owner && info.owner.name) || '';
        title = info.title || '';
      }
    }
  } catch (e) {}
  petWindow.webContents.send('activity:update', { processName, title, idle, ts: Date.now() });
}

function startActivityPolling() {
  setTimeout(pollActivity, 1500);
  activityTimer = setInterval(pollActivity, 4000);
}

app.on('before-quit', () => {
  if (activityTimer) clearInterval(activityTimer);
  saveChatCacheNow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
