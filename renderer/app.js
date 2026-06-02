// Live2D 桌宠 渲染层
// 依赖（已通过 <script> 加载）: window.PIXI, window.PIXI.live2d, window.Live2DCubismCore

const canvas = document.getElementById('live2d-canvas');
const statusEl = document.getElementById('status');
const ctxMenu = document.getElementById('ctx-menu');
const bubble = document.getElementById('speech-bubble');
const bubbleText = document.getElementById('speech-text');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatClose = document.getElementById('chat-close');
const chatTitle = document.getElementById('chat-title');

let app = null;
let model = null;
let baseModelWidth = 0;     // 模型在 scale=1 时的几何宽度（fitModel 基准，避免读 model.width 累积放大）
let baseModelHeight = 0;
let currentLines = null;    // 当前角色的台词库（指向 model.config.lines || DEFAULT_LINES）
let currentMotionGroups = null;  // { tap_body: [...], idle: [...] } — 来自 model.json
let currentModelDir = null;      // 当前模型所在目录（拼 voice 文件相对路径用）
let currentVoiceEnabled = false; // 当前角色是否允许语音播放
let currentVoiceAudio = null;    // 正在播放的 Audio 对象，便于打断

// 全局静音劫持：pixi-live2d-display 内部用 HTMLAudioElement 自动播 motion 的 sound 字段，
// 不暴露开关。最稳的办法是 patch Audio.prototype.play，全局静音时直接吃掉所有播放请求。
// 我们手动播的也走这条路径，所以一并被控制 — 单一开关治所有音频。
(function patchAudioForGlobalMute() {
  const origPlay = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function () {
    if (currentSettings && currentSettings.voice && currentSettings.voice.muted) {
      // 立即暂停防止已经在播的继续，并返回 resolved promise 避免调用方 catch
      try { this.pause(); this.currentTime = 0; } catch (e) {}
      return Promise.resolve();
    }
    return origPlay.apply(this, arguments);
  };
})();

async function loadModelMotionGroups(info) {
  currentMotionGroups = null;
  currentModelDir = null;
  currentVoiceEnabled = !!info.config.voiceEnabled;
  try {
    const url = info.url; // file:///D:/.../model.json 或 .model3.json
    const resp = await fetch(url);
    if (!resp.ok) return;
    const json = await resp.json();
    // Cubism 2: motions 顶层；Cubism 4: FileReferences.Motions
    if (json.motions) {
      currentMotionGroups = json.motions;
    } else if (json.FileReferences && json.FileReferences.Motions) {
      currentMotionGroups = json.FileReferences.Motions;
    }
    // 计算模型目录（去掉 model.json 那段）
    currentModelDir = url.replace(/\/[^/]+$/, '/');
  } catch (e) {
    console.warn('[motion] load groups failed:', e.message);
  }
}
let availableModels = [];      // [{id, url, config}]
let currentModelId = null;
let currentPersonality = '';
let currentSettings = null;

// ========== 工具 ==========
function setStatus(text, hide = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle('hidden', hide);
}
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 本地时区的 YYYY-MM-DD（不用 toISOString，它是 UTC 凌晨/早晨会差一天）
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 取台词：优先当前角色配置里的，没有则回退到默认
function pickLine(category) {
  const arr = (currentLines && currentLines[category]) || DEFAULT_LINES[category] || [];
  if (!arr.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

// ========== 对话气泡 ==========
let bubbleHideTimer = null;
function showSpeech(text, duration = 3500) {
  if (!text) return;
  bubbleText.textContent = text;
  bubble.classList.remove('hidden', 'fading');
  bubble.style.animation = 'none';
  void bubble.offsetWidth;
  bubble.style.animation = '';
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer);
  bubbleHideTimer = setTimeout(() => {
    bubble.classList.add('fading');
    setTimeout(() => bubble.classList.add('hidden'), 300);
  }, duration);
}

// ========== Live2D 初始化 / 切换 ==========
async function initLive2D() {
  if (!window.PIXI || !window.PIXI.live2d) {
    setStatus('PIXI / pixi-live2d-display 未加载');
    return;
  }
  try { PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker); } catch (e) {}
  app = new PIXI.Application({
    view: canvas,
    // 不用 resizeTo: window —— 它每帧 ticker 自检尺寸，
    // 高刷屏 + setBounds 期间 window inner 尺寸会瞬时抖动 1-2px，
    // 触发 PIXI 内部 resize → 重算渲染分辨率 → 视觉抖动 + 累积放大
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // 我们手动控制 resize：debounce 之后才 fit，拖动期间完全不 fit
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (drag.active) return;        // 拖动中直接忽略
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      app.renderer.resize(window.innerWidth, window.innerHeight);
      fitModel();
    }, 100);
  });

  // 先拉模型列表 + 设置
  availableModels = await window.petAPI.listModels();
  currentSettings = await window.petAPI.getSettings();
  const preferred = currentSettings.currentModel || (availableModels[0] && availableModels[0].id);
  await loadModelById(preferred);
  setupInteractions();

  // 启动问候
  // 优先级：生日 > 首启引导 > 普通 greet
  // settings.firstRun === true 说明从未见过引导
  const todayBirthday = isCharacterBirthdayToday();
  if (todayBirthday) {
    setTimeout(() => {
      showSpeech(pickBirthdayGreeting(), 9000);
    }, 800);
  } else if (currentSettings && currentSettings.firstRun) {
    setTimeout(() => {
      const llmOn = currentSettings.llm && currentSettings.llm.enabled;
      const guide = llmOn
        ? '欢迎主人~ 我已经准备好聊天啦，左键点我，右键看看菜单 (◕‿◕)'
        : '欢迎主人~ 我现在还不会聊天哦\n右键 → ⚙️ 设置 启用 LLM 后我就活过来啦 (◕‿◕)';
      showSpeech(guide, 9000);
    }, 800);
    // 标记已见过引导
    if (window.petAPI && window.petAPI.markGuideSeen) {
      window.petAPI.markGuideSeen().catch(() => {});
    }
  } else {
    setTimeout(() => showSpeech(pickLine('greet'), 3500), 800);
  }
}

// ========== 生日特别行为 ==========
// pet.config.json 里的 birthday: "MM-DD"——当天有特殊招呼 + 头顶飘 🎂
function isCharacterBirthdayToday() {
  const info = availableModels.find(m => m.id === currentModelId);
  const bday = info && info.config && info.config.birthday;
  if (!bday) return false;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(bday).trim());
  if (!m) return false;
  const today = new Date();
  return today.getMonth() + 1 === parseInt(m[1], 10) && today.getDate() === parseInt(m[2], 10);
}

function pickBirthdayGreeting() {
  const info = availableModels.find(m => m.id === currentModelId);
  const name = (info && info.config.displayName) || '我';
  // 角色配置里可以定义 birthdayLines 自定义；没定义用通用模板
  const custom = info && info.config.lines && info.config.lines.birthday;
  if (Array.isArray(custom) && custom.length) return pickRandom(custom);
  // 通用 fallback
  return `嘿嘿，主人~ 今天是 ${name} 的生日哦 (≧▽≦) 🎂`;
}

async function loadModelById(id) {
  const info = availableModels.find(m => m.id === id) || availableModels[0];
  if (!info) {
    setStatus('未找到任何模型');
    return;
  }
  if (model) {
    try { app.stage.removeChild(model); model.destroy({ children: true, texture: true, baseTexture: true }); } catch (e) {}
    model = null;
  }
  setStatus('加载 ' + info.config.displayName + '...');
  try {
    model = await PIXI.live2d.Live2DModel.from(info.url, { autoInteract: false });
  } catch (e) {
    console.error(e);
    setStatus('模型加载失败：' + (e && e.message ? e.message : e));
    return;
  }
  app.stage.addChild(model);
  currentModelId = info.id;
  currentPersonality = info.config.personality || '';
  currentLines = info.config.lines || null;     // 角色台词库覆盖
  // 加载模型自带的 motion group 列表（tap_body / tap_head / shake 等），点击时随机用
  await loadModelMotionGroups(info);
  // 调整窗口大小到角色配置的尺寸
  if (window.petAPI && window.petAPI.resizeWindow) {
    const w = info.config.windowWidth || 380;
    const h = info.config.windowHeight || 600;
    window.petAPI.resizeWindow(w, h);
  }
  // 缓存模型的原始尺寸（scale=1 时的几何宽高），fitModel 始终用这个算
  // 不能用 model.width / model.height — 它们受当前 scale 影响，
  // 在高频 resize 时会读到上一次缩放后的值，导致每帧累积放大
  model.scale.set(1);
  baseModelWidth = model.width;
  baseModelHeight = model.height;
  // 等下一帧让窗口 resize 完成后再 fit
  setTimeout(fitModel, 80);
  setStatus('', true);
  chatTitle.textContent = '和 ' + info.config.displayName + ' 聊天';
  console.log('[live2d] loaded', info.id, 'baseSize=', baseModelWidth, 'x', baseModelHeight);
}

function fitModel() {
  if (!model || !app || !baseModelWidth || !baseModelHeight) return;
  // 拖动期间不要 fit —— 高刷屏上 setBounds 会让 window inner 尺寸瞬时抖动，
  // PIXI resizeTo:window 触发 resize 事件，这里又被调用，scale 在抖动中累积漂移。
  if (drag.active) return;
  const info = availableModels.find(m => m.id === currentModelId);
  const scaleFactor = (info && info.config.scaleFactor) || 1.0;
  const verticalOffset = (info && info.config.verticalOffset) || 0;
  // 顶部保留 120px 给气泡
  const topReserve = 120;
  const margin = 16;
  const availW = app.screen.width - margin * 2;
  const availH = app.screen.height - topReserve - margin;
  const s = Math.min(availW / baseModelWidth, availH / baseModelHeight) * scaleFactor;
  model.scale.set(s);
  model.anchor.set(0.5, 0.5);
  model.position.set(app.screen.width / 2, topReserve + availH / 2 + verticalOffset);
  positionBubble();
}

// 鼠标穿透：模型实际渲染范围外的区域不响应交互，事件透过去到桌面/下层窗口。
// 关键：UI 元素（气泡/聊天框/菜单）的悬停/打开期间不能穿透，否则点不到它们。
let mouseIgnored = false;
function updateMousePassThrough(x, y) {
  if (!model || !window.petAPI) return;
  // 任意 UI 元素打开时，整个窗口都接收鼠标事件（即使指针在透明区也不穿透）
  const uiOpen =
    !chatPanel.classList.contains('hidden') ||
    !ctxMenu.classList.contains('hidden') ||
    !bubble.classList.contains('hidden') ||
    drag.active;
  let shouldIgnore = false;
  if (!uiOpen) {
    const b = model.getBounds();
    // 给一点 padding 防止边缘锯齿处误判
    const pad = 8;
    const inside = x >= b.x - pad && x <= b.x + b.width + pad
                && y >= b.y - pad && y <= b.y + b.height + pad;
    shouldIgnore = !inside;
  }
  if (shouldIgnore !== mouseIgnored) {
    mouseIgnored = shouldIgnore;
    window.petAPI.setIgnoreMouse(shouldIgnore);
  }
}

// 把气泡箭头锚定在人物头发顶端上方一点点
// HAIR_OFFSET 是从模型 bounding box 顶部向下的像素偏移，
// 因为多数 Live2D 模型的画布上方留有空白；调大让气泡更靠近头发
function positionBubble() {
  if (!model || !bubble) return;
  const info = availableModels.find(m => m.id === currentModelId);
  const hairOffset = (info && info.config.hairOffset != null) ? info.config.hairOffset : 50;
  const bounds = model.getBounds();
  const arrowTipY = bounds.y + hairOffset;
  const arrowHeight = 10;
  const bubbleBottomY = arrowTipY - arrowHeight;
  const fromBottom = Math.max(0, window.innerHeight - bubbleBottomY);
  bubble.style.bottom = fromBottom + 'px';
  bubble.style.top = 'auto';
}

// ========== 鼠标 / 拖拽 / 右键 ==========
const drag = { active: false, startX: 0, startY: 0, moved: false };
const DRAG_THRESHOLD = 5;

function setupInteractions() {
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    drag.active = true; drag.moved = false;
    drag.startX = e.screenX; drag.startY = e.screenY;
    window.petAPI.dragStart(e.screenX, e.screenY);
  });
  window.addEventListener('mousemove', (e) => {
    if (drag.active) {
      if (!drag.moved && Math.hypot(e.screenX - drag.startX, e.screenY - drag.startY) > DRAG_THRESHOLD) {
        drag.moved = true;
        canvas.classList.add('dragging');
      }
      if (drag.moved) window.petAPI.dragMove(e.screenX, e.screenY);
    } else if (model) {
      model.focus(e.clientX, e.clientY);
      // 鼠标在模型实际渲染范围外时点击穿透到底层窗口
      updateMousePassThrough(e.clientX, e.clientY);
    }
  });
  window.addEventListener('mouseup', () => {
    if (!drag.active) return;
    drag.active = false;
    canvas.classList.remove('dragging');
    window.petAPI.dragEnd();
    if (!drag.moved && model) {
      tryTapMotion();
      showSpeech(pickLine('tap'), 2500);
    }
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });
  document.addEventListener('click', (e) => {
    if (!ctxMenu.contains(e.target)) hideContextMenu();
  });

  chatClose.addEventListener('click', closeChat);
  chatSend.addEventListener('click', sendChatMessage);
  setupSlashCommands();
  // 历史回溯按钮
  const historyBtn = document.getElementById('chat-history-btn');
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      if (historyMode) exitHistoryMode();
      else enterHistoryMode();
    });
  }
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
  // 点击面板任何位置都把焦点拉回输入框（防御性）
  chatPanel.addEventListener('mousedown', (e) => {
    if (e.target === chatInput || e.target === chatSend || e.target === chatClose) return;
    setTimeout(() => chatInput.focus(), 0);
  });
}

function tryTapMotion(opts) {
  if (!model) return;
  const voiceProb = (opts && typeof opts.voiceProb === 'number') ? opts.voiceProb : 1;
  // 70% 几率 tap_body / 30% tap_head（如果该模型有）
  const candidates = [];
  if (currentMotionGroups) {
    if (currentMotionGroups.tap_head && Math.random() < 0.3) candidates.push('tap_head');
    if (currentMotionGroups.tap_body) candidates.push('tap_body');
    if (currentMotionGroups.shake && Math.random() < 0.15) candidates.push('shake');
  }
  // 通用 fallback 名（Cubism 4 模型可能用 TapBody / Tap 之类）
  candidates.push('TapBody', 'Tap', 'tap_body', 'tap');
  for (const g of candidates) {
    try {
      const idx = pickMotionIndex(g);
      const r = model.motion(g, idx);
      Promise.resolve(r).then(found => {
        if (found) {
          // 按概率决定是否同时播音
          if (Math.random() < voiceProb) playMotionVoice(g, idx);
        } else {
          model.motion('Idle');
        }
      });
      return;
    } catch (e) {}
  }
}

// 在指定 group 里随机挑一个 motion 索引（结合 model.json 知道总数）
function pickMotionIndex(group) {
  if (!currentMotionGroups) return 0;
  const arr = currentMotionGroups[group];
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return Math.floor(Math.random() * arr.length);
}

// 播放指定 motion 的语音（如果 model.json 给了 sound 字段且角色配置允许）
function playMotionVoice(group, index) {
  if (!currentVoiceEnabled) return;
  // 全局静音：从 currentSettings 读
  if (currentSettings && currentSettings.voice && currentSettings.voice.muted) return;
  if (!currentMotionGroups || !currentModelDir) return;
  const arr = currentMotionGroups[group];
  if (!Array.isArray(arr)) return;
  const m = arr[index];
  const sound = m && (m.sound || m.Sound);
  if (!sound) return;
  try {
    if (currentVoiceAudio) {
      try { currentVoiceAudio.pause(); } catch (e) {}
      currentVoiceAudio = null;
    }
    const a = new Audio(currentModelDir + sound);
    a.volume = 0.55;
    a.play().catch(() => {});
    currentVoiceAudio = a;
  } catch (e) {
    console.warn('[voice] play failed:', e.message);
  }
}

// 闲置时偶尔随机播个动作（idle group）
function tryRandomIdle() {
  if (!model || !currentMotionGroups) return;
  // 优先用 model.json 里的 random / idle group
  const candidates = [];
  if (currentMotionGroups.random) candidates.push('random');
  if (currentMotionGroups.idle) candidates.push('idle');
  if (!candidates.length) return;
  const g = candidates[Math.floor(Math.random() * candidates.length)];
  const idx = pickMotionIndex(g);
  try {
    const r = model.motion(g, idx);
    Promise.resolve(r).then(found => {
      if (found) playMotionVoice(g, idx);
    });
  } catch (e) {}
}

// ========== 右键菜单（动态渲染） ==========
function showContextMenu(x, y) {
  ctxMenu.innerHTML = '';
  const llmOn = currentSettings && currentSettings.llm && currentSettings.llm.enabled;
  addItem('💬 聊天' + (llmOn ? '' : '（需先开启 LLM）'), () => openChat());
  addItem('📊 今日报告', () => showDailyReport());
  if (llmOn) {
    addItem('📔 今日日记', () => writeDiary());
    addItem('🔮 今日塔罗', () => window.petAPI.openTarot && window.petAPI.openTarot());
    addItem('📅 日记本', () => window.petAPI.openDiaryWindow && window.petAPI.openDiaryWindow());
    addItem('📖 图鉴', () => window.petAPI.openCollection && window.petAPI.openCollection());
  }
  addItem('📝 待办', () => window.petAPI.openReminders && window.petAPI.openReminders('todo'));
  addItem('🎂 纪念日', () => window.petAPI.openReminders && window.petAPI.openReminders('anniv'));
  addSep();
  if (availableModels.length > 1) {
    const subItems = availableModels.map(m => {
      const active = m.id === currentModelId;
      return {
        label: (active ? '● ' : '○ ') + m.config.displayName,
        extraClass: active ? 'ctx-active' : '',
        onClick: () => {
          if (m.id !== currentModelId) window.petAPI.switchModel(m.id);
        },
      };
    });
    const currentName = (availableModels.find(m => m.id === currentModelId) || {}).config?.displayName || '?';
    addSubmenu('🎭 切换角色 (当前: ' + currentName + ')', subItems);
    addSep();
  }
  addItem('⚙️ 设置...', () => window.petAPI.openSettings());
  addItem('👋 隐藏', () => window.petAPI.hide());
  addItem('✕ 退出', () => window.petAPI.quit(), 'ctx-danger');

  ctxMenu.classList.remove('hidden');
  const rect = ctxMenu.getBoundingClientRect();
  const px = Math.min(x, window.innerWidth - rect.width - 5);
  const py = Math.min(y, window.innerHeight - rect.height - 5);
  ctxMenu.style.left = px + 'px';
  ctxMenu.style.top = py + 'px';
}
function hideContextMenu() { ctxMenu.classList.add('hidden'); }
function addItem(label, onClick, extraClass = '') {
  const div = document.createElement('div');
  div.className = 'ctx-item' + (extraClass ? ' ' + extraClass : '');
  div.textContent = label;
  div.addEventListener('click', () => { hideContextMenu(); onClick(); });
  ctxMenu.appendChild(div);
}
function addSep() {
  const d = document.createElement('div'); d.className = 'ctx-sep'; ctxMenu.appendChild(d);
}
function addLabel(text) {
  const d = document.createElement('div'); d.className = 'ctx-group-label'; d.textContent = text; ctxMenu.appendChild(d);
}

// 嵌套二级菜单：父项 hover 弹出子项
// items: [{ label, onClick, extraClass }]
function addSubmenu(parentLabel, items) {
  const parent = document.createElement('div');
  parent.className = 'ctx-item ctx-has-submenu';
  parent.textContent = parentLabel;
  const sub = document.createElement('div');
  sub.className = 'ctx-submenu';
  for (const it of items) {
    const child = document.createElement('div');
    child.className = 'ctx-item' + (it.extraClass ? ' ' + it.extraClass : '');
    child.textContent = it.label;
    child.addEventListener('click', (e) => {
      e.stopPropagation();
      hideContextMenu();
      it.onClick();
    });
    sub.appendChild(child);
  }
  parent.appendChild(sub);
  ctxMenu.appendChild(parent);
  // 进入父项时根据可视区位置智能定位子菜单：
  //   - 右边空间不够 → 向左展开
  //   - 下方空间不够 → 整体向上偏移
  parent.addEventListener('mouseenter', () => {
    sub.classList.remove('ctx-submenu-left');
    sub.style.top = '';
    sub.style.bottom = '';
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const margin = 8;

    // 横向：先按默认（向右）量，超界就换左
    let r = sub.getBoundingClientRect();
    if (r.right + margin > winW) {
      sub.classList.add('ctx-submenu-left');
      r = sub.getBoundingClientRect();
      // 换到左边后如果反而左边超界（窗口实在太窄），按"两边谁少切谁少"取舍
      if (r.left < margin) {
        const overflowLeft = margin - r.left;
        const overflowRight = (parent.getBoundingClientRect().right + sub.offsetWidth + margin) - winW;
        if (overflowRight < overflowLeft) sub.classList.remove('ctx-submenu-left');
      }
    }

    // 纵向：底部超界则向上偏移
    const r2 = sub.getBoundingClientRect();
    if (r2.bottom + margin > winH) {
      const overflow = r2.bottom + margin - winH;
      const newTop = parseFloat(getComputedStyle(sub).top) - overflow;
      const minTop = -(parent.getBoundingClientRect().top - margin);
      sub.style.top = Math.max(minTop, newTop) + 'px';
    }
  });
}

// ========== 台词库 ==========
// DEFAULT_LINES 是 fallback；每个模型可在 pet.config.json.lines 里覆盖
// 切换角色时 currentLines 会指向当前模型 lines || DEFAULT_LINES
const DEFAULT_LINES = {
  greet: [
    '主人，我来啦~ (◕‿◕)',
    '欸嘿嘿，又见面啦!',
    '今天也要加油哦~',
    '主人主人，想我了吗? (*/ω＼*)',
    '上线啦~ 来陪主人玩!',
    '叮咚~ 桌面伙伴已就位 ٩(◕‿◕)۶',
    '哼哼，等你好久啦!',
    '主人今天看起来心情不错呀~',
    '准备好和我一起度过今天了吗?',
    '咱们继续昨天的故事吧~',
    '主人主人，我有好多话想说哦~',
    '嗨嗨~ 一起加油吧!',
  ],
  tap: [
    '嘿嘿，被戳到了~',
    '主人手好暖呀~',
    '别一直戳我啦 >///<',
    '咕呜呜~ 痒痒的!',
    '(*/ω＼*)',
    '哎呀，被发现了!',
    '主人是不是无聊啦~',
    '再戳我可要生气啦! (｀_´)ゞ',
    '咿呀，吓我一跳~',
    '又来戳人家~',
    '嘻嘻，温柔一点嘛',
    '欸? 主人想说什么?',
    '陪我聊聊天好不好~',
    '(///ω///)',
    '主人主人，喜欢我吗~',
    '咕噜咕噜~ (=^･ω･^=)',
    '哎呀别戳脸啦~',
    '嗯哼? (•ω•)',
    '主人的手好软呀~',
    '嘿~ 我在听呢!',
  ],
  enterWorking: [
    '主人开始工作啦~ 加油!',
    '专注模式开启! ٩(◕‿◕)۶',
    '我在旁边陪你哦~',
    '今天也是干劲满满的一天!',
    '冲呀~ 主人最棒了!',
    '我会乖乖看着不打扰的~',
    '加油加油! (๑•̀ㅂ•́)و✧',
    '专心写代码的主人最帅啦~',
    '主人加油，我给你打气!',
    '专注的样子真好看~',
    '今天的任务一定能搞定的!',
    '开始战斗吧~',
    '我安静地陪着你 (´-ω-`)',
    '主人主人，记得保持坐姿~',
    '需要我的时候叫我哦~',
  ],
  enterSlacking: [
    '嘿嘿，一起摸鱼吧~',
    '偷偷划水的时间~',
    '主人也要休息一下嘛',
    '看到啦，在摸鱼对不对~',
    '咦? 这是什么有趣的东西~',
    '主人主人，看到什么好玩的啦?',
    '我也想看! (｡♥‿♥｡)',
    '偷懒一下也是可以的~',
    '休息休息~ 张弛有度!',
    '让我也加入摸鱼大军~',
    '欸嘿嘿，老板看不到我~',
    '今天的鱼好新鲜呀~',
    '主人摸鱼的时候表情好放松哦',
    '陪你一起划水! (≧▽≦)',
    '不要太久哦，会被发现的!',
  ],
  enterAfk: [
    '主人去哪儿了... (´-ω-`)',
    '咦? 没人了?',
    '我先睡一会儿好啦~',
    '主人主人，去喝水了吗?',
    '安静的桌面...',
    '一个人好寂寞...',
    '主人去摸鱼也带上我嘛',
    '默默等待ing... (◞‸◟)',
    '主人不要太久哦~',
    '我会在这里乖乖等的',
    '呜呜呜，被遗忘了',
  ],
  welcomeBack: [
    '欢迎回来! (◕‿◕)',
    '主人! 想你啦~',
    '回来啦回来啦~',
    '终于回来了! ٩(>ω<)و',
    '主人主人，我等你好久了!',
    '咦? 主人去哪儿啦?',
    '抱抱~ (つ´ω`)つ',
    '想我了没有呀~',
    '欢迎回家! ♡',
    '快快坐下，给我讲讲你去哪儿啦~',
    '咕呜呜，太久没看到主人了',
    '又能一起玩啦! (≧▽≦)',
  ],
  longWorking: [
    '主人都坐了好久了，起来动动嘛~',
    '喝口水休息一下啦! (>﹏<)',
    '盯着屏幕这么久眼睛会累的~',
    '深呼吸，伸个懒腰~',
    '主人脖子还好吗? 来活动活动!',
    '工作一小时，眺望窗外二十秒~',
    '主人主人，肩膀酸不酸呀?',
    '该歇歇啦，身体最重要!',
    '站起来转转嘛~',
    '我担心主人的眼睛 (´；ω；`)',
    '别太拼啦，劳逸结合~',
    '抬头看看远方好不好?',
    '主人是不是又忘了喝水?',
    '提醒一下~ 该活动手腕啦!',
    '保持好心情，工作更高效!',
  ],
  idleThoughts: [
    '...在发呆~',
    '今天主人在忙什么呢?',
    '想吃布丁了~',
    '(´-ω-`)',
    '陪我说说话嘛~',
    '今天天气真好~',
    '主人今天看起来精神不错',
    '咦? 时间过得好快呀',
    '嘿嘿嘿~',
    '主人主人，我饿了 (•́﹏•̀)',
    '想看主人笑一笑~',
    '在想晚上吃什么呢',
    '咕咕咕~',
    '主人主人，我在看你哦',
    '今天有发生什么开心的事吗?',
    '好想出去玩呀~',
    '(o´ω`o)',
    '主人是不是该休息一下啦',
  ],
};

// ========== 活动分类 + 状态机（同前） ==========
const WORK_PROCS  = /code\.exe|idea|webstorm|pycharm|devenv|sublime|notepad\+\+|windowsterminal|wezterm|alacritty|hyper|pwsh|powershell|cmd|cursor|rider|goland|clion/i;
const SLACK_PROCS = /wechat|weixin|qq\.exe|tim\.exe|dingtalk|feishu|lark|steam|qqmusic|cloudmusic|spotify|vlc|potplayer|wmplayer|netease/i;
const SLACK_TITLE = /bilibili|youtube|twitter|x\.com|weibo|zhihu|douyin|tiktok|reddit|抖音|微博|知乎|哔哩|淘宝|京东|小红书/i;
const BROWSER_PROCS = /chrome|firefox|msedge|opera|brave|safari/i;

function classifyActivity(data) {
  const { processName = '', title = '', idle = 0 } = data || {};
  if (idle > 120) return 'afk';
  if (SLACK_PROCS.test(processName)) return 'slacking';
  if (BROWSER_PROCS.test(processName) && SLACK_TITLE.test(title)) return 'slacking';
  if (WORK_PROCS.test(processName)) return 'working';
  return 'idle';
}

const state = {
  current: 'idle',
  enteredAt: Date.now(),
  workingAccum: 0,
  lastReminderAt: 0,
  lastTransitionSpeechAt: {},
};
const REMINDER_THRESHOLD = 45 * 60 * 1000;
const REMINDER_COOLDOWN  = 15 * 60 * 1000;
const TRANSITION_COOLDOWN = 5 * 60 * 1000;

function onActivityTick(data) {
  const now = Date.now();
  const next = classifyActivity(data);
  const prev = state.current;
  const dt = now - (state._tickTs || now);
  state._tickTs = now;

  stats.addTime(prev, dt);
  if (data && data.processName) stats.addApp(data.processName, dt);

  if (next !== prev) {
    state.current = next;
    state.enteredAt = now;
    if (prev === 'working') state.workingAccum = 0;
    const lastT = state.lastTransitionSpeechAt[next] || 0;
    if (now - lastT > TRANSITION_COOLDOWN) {
      state.lastTransitionSpeechAt[next] = now;
      if (prev === 'afk' && now - (state.afkEnteredAt || 0) > 5 * 60 * 1000) {
        showSpeech(pickLine('welcomeBack'));
      } else if (next === 'working') {
        showSpeech(pickLine('enterWorking'));
      } else if (next === 'slacking') {
        showSpeech(pickLine('enterSlacking'));
      } else if (next === 'afk') {
        state.afkEnteredAt = now;
        showSpeech(pickLine('enterAfk'));
      }
    } else if (next === 'afk') {
      state.afkEnteredAt = now;
    }
  } else if (next === 'working') {
    state.workingAccum += dt;
    if (state.workingAccum >= REMINDER_THRESHOLD && now - state.lastReminderAt > REMINDER_COOLDOWN) {
      state.lastReminderAt = now;
      showSpeech(pickLine('longWorking'), 5000);
      tryTapMotion();
    }
  }
}

// ========== 每日统计 ==========
const STATS_KEY = 'desktop-pet-stats';
const stats = {
  data: null,
  load() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      this.data = raw ? JSON.parse(raw) : null;
    } catch (e) { this.data = null; }
    const today = localDateStr(new Date());
    if (!this.data || this.data.date !== today) {
      this.data = { date: today, time: { working: 0, slacking: 0, afk: 0, idle: 0 }, apps: {} };
      this.save();
    }
  },
  save() { try { localStorage.setItem(STATS_KEY, JSON.stringify(this.data)); } catch (e) {} },
  addTime(s, ms) {
    if (!this.data) this.load();
    if (!this.data.time[s]) this.data.time[s] = 0;
    this.data.time[s] += ms;
    if (Math.random() < 0.05) this.save();
  },
  addApp(name, ms) {
    if (!this.data) this.load();
    if (!name) return;
    if (!this.data.apps[name]) this.data.apps[name] = 0;
    this.data.apps[name] += ms;
  },
  topApps(n = 5) {
    if (!this.data) this.load();
    return Object.entries(this.data.apps).sort((a, b) => b[1] - a[1]).slice(0, n);
  },
};
stats.load();

function fmtMin(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m + ' 分钟';
  return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
}
function showDailyReport() {
  stats.save();
  const t = stats.data.time;
  const tops = stats.topApps(3).map(([n, ms]) => `${n.replace(/\.exe$/i, '')} ${fmtMin(ms)}`).join(' / ');
  const lines = [
    `今天工作 ${fmtMin(t.working || 0)}`,
    `摸鱼 ${fmtMin(t.slacking || 0)} (≧▽≦)`,
    tops ? `常用: ${tops}` : '',
  ].filter(Boolean).join('\n');
  showSpeech(lines, 7000);
}

// ========== 查看 / 清空 / 整理记忆 ==========
async function viewMemory() {
  if (!currentModelId) return;
  let mem;
  try {
    mem = await window.petAPI.getMemory(currentModelId);
  } catch (e) {
    showSpeech('读取记忆失败 (´；ω；`)');
    return;
  }
  openChat();
  // 清掉旧的记忆展示条目
  chatMessages.querySelectorAll('.msg.system').forEach(n => {
    if (n.textContent.startsWith('[记忆') || n.textContent.startsWith('[已清空') ||
        n.textContent.startsWith('· ') || n.textContent.startsWith('[点此')) n.remove();
  });
  const shared = (mem && mem.shared && mem.shared.facts) || [];
  const specific = (mem && mem.specific && mem.specific.facts) || [];
  if (!shared.length && !specific.length) {
    addChatMsg('system', '[记忆] 还没有任何记忆呢，聊一会儿我就能记住啦~');
    return;
  }
  if (shared.length) {
    addChatMsg('system', `[记忆 · 跨角色共享 ${shared.length} 条]`);
    for (const f of shared) addChatMsg('system', '· ' + f.text);
  }
  if (specific.length) {
    const info = availableModels.find(m => m.id === currentModelId);
    const name = info ? info.config.displayName : currentModelId;
    addChatMsg('system', `[记忆 · ${name} 特别记得 ${specific.length} 条]`);
    for (const f of specific) addChatMsg('system', '· ' + f.text);
  }
  // 清空按钮
  const row = document.createElement('div');
  row.className = 'msg system';
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.justifyContent = 'center';

  const mkBtn = (label, scope) => {
    const b = document.createElement('span');
    b.textContent = label;
    b.style.cursor = 'pointer';
    b.style.color = '#b04060';
    b.style.textDecoration = 'underline';
    b.addEventListener('click', async () => {
      const what = scope === 'shared' ? '共享记忆' : (scope === 'both' ? '全部记忆' : '当前角色记忆');
      if (!confirm('确定清空' + what + '？此操作不可恢复。')) return;
      await window.petAPI.clearMemory(currentModelId, scope);
      chatMessages.querySelectorAll('.msg.system').forEach(n => {
        if (n.textContent.startsWith('[记忆') || n.textContent.startsWith('· ') || n === row) n.remove();
      });
      addChatMsg('system', '[已清空] ' + what + '已抹掉~');
    });
    return b;
  };
  row.appendChild(mkBtn('[清空当前角色]', 'specific'));
  row.appendChild(mkBtn('[清空共享]', 'shared'));
  row.appendChild(mkBtn('[全清]', 'both'));
  chatMessages.appendChild(row);
}

async function consolidateMemory() {
  if (!currentModelId) return;
  showSpeech('整理记忆中... (´-ω-`)', 6000);
  try {
    const r = await window.petAPI.consolidateMemory(currentModelId);
    const dShared = r.before.shared - r.after.shared;
    const dSpec   = r.before.specific - r.after.specific;
    const parts = [];
    parts.push(`共享 ${r.before.shared} → ${r.after.shared}` + (dShared > 0 ? `（-${dShared}）` : ''));
    parts.push(`当前角色 ${r.before.specific} → ${r.after.specific}` + (dSpec > 0 ? `（-${dSpec}）` : ''));
    showSpeech('整理完成 (◕‿◕)\n' + parts.join('\n'), 5000);
  } catch (e) {
    showSpeech('整理失败 (´；ω；`)\n' + (e.message || e), 4500);
  }
}

// ========== 桌宠日记 ==========
function buildDiaryContext() {
  stats.save();
  const t = stats.data && stats.data.time ? stats.data.time : {};
  return {
    time: t,
    topApps: stats.topApps(5),
    recentChat: conversation.slice(-12),
    // facts 由主进程从 memory 模块自取
  };
}

async function writeDiary() {
  if (!currentModelId) return;
  let already = false;
  try {
    already = await window.petAPI.diaryExistsToday();
  } catch (e) {}

  if (already) {
    const ok = confirm('今天已经写过日记啦~ 要覆盖重写吗？');
    if (!ok) {
      // 不覆盖：直接展示已有日记
      try {
        const file = await window.petAPI.getDiary(null);
        if (file && file.pet && file.pet.body) {
          showDiaryInChat({ ...file.pet, date: file.date });
        }
      } catch (e) {}
      return;
    }
  }

  showSpeech('开始写今天的日记... (φ´ω`)', 8000);
  try {
    const ctx = buildDiaryContext();
    const r = await window.petAPI.generateDiary(currentModelId, ctx, already);
    if (r && r.entry) {
      showSpeech('日记写好啦~ (◕‿◕)', 2500);
      showDiaryInChat({ ...r.entry, date: r.date });
    }
  } catch (e) {
    const errMsg = (e && e.message) ? e.message : String(e);
    showSpeech('日记写不出来 (´；ω；`)', 3000);
    // 详细错误展示到聊天面板，方便排查
    openChat();
    addChatMsg('system', '[日记错误] ' + errMsg);
    console.error('[diary] generate failed:', e);
  }
}

function showDiaryInChat(entry) {
  openChat();
  // 清掉旧的日记展示
  chatMessages.querySelectorAll('.msg.diary').forEach(n => n.remove());
  const header = document.createElement('div');
  header.className = 'msg system';
  const moodPart = entry.mood ? '（' + (entry.emoji || '🙂') + ' ' + entry.mood + '）' : '';
  header.textContent = `📔 ${entry.date} · ${entry.characterName || '日记'} ${moodPart}`;
  chatMessages.appendChild(header);
  const body = document.createElement('div');
  body.className = 'msg pet diary';
  body.textContent = entry.body || '(空)';
  body.style.maxWidth = '92%';
  chatMessages.appendChild(body);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ========== 自动写日记 ==========
let lastAutoDiaryDate = '';
async function checkAutoDiary() {
  const s = currentSettings;
  if (!s || !s.diary || !s.diary.autoGenerate) return;
  if (!s.llm || !s.llm.enabled) return;
  const target = (s.diary.autoGenerateTime || '22:30');
  const now = new Date();
  const todayStr = localDateStr(now);
  if (lastAutoDiaryDate === todayStr) return;          // 今天已自动尝试过
  const [hh, mm] = target.split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return;
  if (now.getHours() < hh) return;
  if (now.getHours() === hh && now.getMinutes() < mm) return;
  // 时间已到。检查今天是否已有日记
  try {
    const exists = await window.petAPI.diaryExistsToday();
    if (exists) {
      lastAutoDiaryDate = todayStr;
      return;
    }
  } catch (e) { return; }

  lastAutoDiaryDate = todayStr;
  try {
    const ctx = buildDiaryContext();
    const r = await window.petAPI.generateDiary(currentModelId, ctx, false);
    if (r && r.entry) {
      const moodTxt = r.entry.mood ? '（' + (r.entry.emoji || '🙂') + ' ' + r.entry.mood + '）' : '';
      showSpeech('今天的日记自动写好啦~' + moodTxt + '\n右键 📅 日记本 翻翻看', 6000);
    }
  } catch (e) {
    console.warn('[auto-diary] failed:', e.message);
  }
}
setInterval(checkAutoDiary, 60000);
// 启动 5 秒后先检查一次（防止刚开机错过时间点）
setTimeout(checkAutoDiary, 5000);

// ========== 待办 / 纪念日 提醒 ==========
const REMINDER_KEY = 'desktop-pet-reminded';
function loadReminded() {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    const obj = raw ? JSON.parse(raw) : { date: '', ids: [] };
    const today = localDateStr(new Date());
    if (obj.date !== today) return { date: today, ids: [] };
    return obj;
  } catch (e) { return { date: localDateStr(new Date()), ids: [] }; }
}
function saveReminded(o) {
  try { localStorage.setItem(REMINDER_KEY, JSON.stringify(o)); } catch (e) {}
}
function markReminded(id) {
  const o = loadReminded();
  if (!o.ids.includes(id)) o.ids.push(id);
  saveReminded(o);
}
function wasReminded(id) {
  return loadReminded().ids.includes(id);
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

async function checkReminders() {
  if (!window.petAPI || !window.petAPI.upcomingTodos) return;
  // 待办：在 60 分钟窗口内已经触发提醒条件的
  try {
    const todos = await window.petAPI.upcomingTodos(60);
    for (const t of todos) {
      // 每个待办每天只提醒一次
      const dayKey = 'todo_' + t.id + '_' + localDateStr(new Date());
      if (wasReminded(dayKey)) continue;
      const due = t.dueAt ? Date.parse(t.dueAt) : 0;
      const now = Date.now();
      let msg;
      if (due < now) {
        msg = '「' + t.title + '」已经过时间啦 (´；ω；`)，主人记得做哦~';
      } else {
        const mins = Math.max(1, Math.round((due - now) / 60000));
        msg = `主人主人，${fmtTime(t.dueAt)} 该做「${t.title}」啦~（还有 ${mins} 分钟）`;
      }
      showSpeech(msg, 6000);
      markReminded(dayKey);
      break; // 一轮只提醒一条，避免气泡刷屏
    }
  } catch (e) { console.warn('[reminders] todos check failed:', e.message); }

  // 纪念日：今天 + 即将到的
  try {
    const today = await window.petAPI.todaysAnniv();
    for (const a of today || []) {
      const key = 'anniv_today_' + a.id;
      if (wasReminded(key)) continue;
      let msg;
      if (a.type === '生日') {
        const yearsTxt = a.yearsPassed ? `第 ${a.yearsPassed} 个 ` : '';
        msg = `🎂 今天是 ${yearsTxt}「${a.title}」呀! 生日快乐~ (≧▽≦)`;
      } else if (a.type === '节日') {
        msg = `🎉 今天是 ${a.title}! 一起庆祝~`;
      } else {
        const yearsTxt = a.yearsPassed ? `第 ${a.yearsPassed} 年 · ` : '';
        msg = `💝 ${yearsTxt}「${a.title}」就是今天哦~`;
      }
      showSpeech(msg, 8000);
      markReminded(key);
      tryTapMotion();
      break;
    }
    const upcoming = await window.petAPI.upcomingAnniv();
    for (const a of upcoming || []) {
      const key = 'anniv_' + a.id + '_d' + a.daysUntil;
      if (wasReminded(key)) continue;
      const msg = `提醒主人哦~ 还有 ${a.daysUntil} 天就是「${a.title}」啦 (◕‿◕)`;
      showSpeech(msg, 6000);
      markReminded(key);
      break;
    }
  } catch (e) { console.warn('[reminders] anniv check failed:', e.message); }
}

setInterval(checkReminders, 60000);
setTimeout(checkReminders, 8000);

// ========== 从聊天解析待办 ==========
// 触发词 + 时间表达式 → { title, dueAt, remindBefore }
// 不命中返回 null，由 LLM 路径继续处理
function parseTodoFromMessage(text) {
  const TRIGGER = /(提醒我|帮我记一?下?|帮我记着|记得提醒我|别忘了|不要忘了|提醒一下|帮我提醒|帮我安排|安排一下)/;
  const t = String(text || '').trim();

  // 先尝试解析时间（即使没明确触发词，"X 分钟后..."也能用）
  const timeRes = parseTime(t);
  if (!timeRes) {
    // 没解析出时间但带触发词 → 仍认为是待办意图，不设时间
    if (TRIGGER.test(t)) {
      const title = extractTitle(t, null);
      if (title) return { title, dueAt: null, remindBefore: null };
    }
    return null;
  }
  // 有时间表达
  const title = extractTitle(t, timeRes.matchedRange);
  if (!title) return null;
  // 没触发词也要求至少有"X 分钟/小时后" 或 "X 点 Y 分" 这种比较明确的时间锚
  if (!TRIGGER.test(t) && !timeRes.confident) return null;
  return {
    title,
    dueAt: timeRes.dueAt,
    remindBefore: 0,    // 默认到点提醒；之前用户也可以从便签里改
  };
}

// 解析时间表达式，返回 { dueAt:ISO, matchedRange:[start,end], confident:bool }
// 支持：
//   X 分钟/小时 后
//   半小时后 / 一小时后
//   今天/明天/今晚 [上午/下午/晚上] X[点] [Y分][半]
//   [上午/下午/晚上] X[点] [Y分][半]      (今天)
function parseTime(text) {
  const now = new Date();

  // 1) "X 分钟后 / X 小时后 / 半小时后 / 一会儿"
  const relMin = text.match(/(\d+)\s*分钟?后/);
  if (relMin) {
    const mins = parseInt(relMin[1], 10);
    if (mins > 0 && mins < 60 * 24) {
      return rel(now, mins, relMin.index, relMin.index + relMin[0].length, true);
    }
  }
  const relHour = text.match(/(\d+(?:\.\d+)?)\s*(?:个)?小时后/);
  if (relHour) {
    const hrs = parseFloat(relHour[1]);
    if (hrs > 0 && hrs < 48) return rel(now, hrs * 60, relHour.index, relHour.index + relHour[0].length, true);
  }
  if (/半小时后/.test(text)) {
    const i = text.indexOf('半小时后');
    return rel(now, 30, i, i + 4, true);
  }
  if (/一小时后|1小时后|个小时后/.test(text)) {
    const m = text.match(/(?:一|1|个)小时后/);
    return rel(now, 60, m.index, m.index + m[0].length, true);
  }

  // 2) "今天/明天/今晚 [上午/下午/晚上] X 点 [Y 分/半]"
  const absRe = /(今天|明天|今晚|今早|明早)?\s*(上午|下午|晚上|早上|凌晨|中午)?\s*(\d{1,2})\s*[点:：](\s*(\d{1,2})\s*分?|\s*半)?/;
  const m = text.match(absRe);
  if (m) {
    const dayWord = m[1] || '';
    const periodWord = m[2] || '';
    let hour = parseInt(m[3], 10);
    const halfOrMin = m[4] || '';
    let minute = 0;
    if (/半/.test(halfOrMin)) minute = 30;
    else if (m[5]) minute = parseInt(m[5], 10);

    if (hour >= 0 && hour <= 24 && minute >= 0 && minute < 60) {
      // 处理 12 小时制 + 时段词
      if ((periodWord === '下午' || periodWord === '晚上') && hour < 12) hour += 12;
      if ((periodWord === '上午' || periodWord === '早上' || periodWord === '凌晨') && hour === 12) hour = 0;
      if (periodWord === '中午' && hour < 12) hour += 0;     // 12 点保持
      if (dayWord === '今晚' && hour < 12) hour += 12;

      const target = new Date(now);
      target.setSeconds(0, 0);
      if (dayWord === '明天' || dayWord === '明早') {
        target.setDate(target.getDate() + 1);
      }
      target.setHours(hour, minute, 0, 0);
      // 如果不是明天且时间已过，自动推到明天
      if (!dayWord && target <= now) target.setDate(target.getDate() + 1);
      const confident = !!(dayWord || periodWord || /[点:：]/.test(m[0]));
      return {
        dueAt: target.toISOString(),
        matchedRange: [m.index, m.index + m[0].length],
        confident,
      };
    }
  }

  return null;
}

function rel(now, mins, start, end, confident) {
  const t = new Date(now.getTime() + mins * 60000);
  return { dueAt: t.toISOString(), matchedRange: [start, end], confident };
}

// 把时间短语和触发词从原文里去掉，剩下的就是标题
function extractTitle(text, range) {
  let t = String(text || '');
  if (range) t = t.slice(0, range[0]) + ' ' + t.slice(range[1]);
  t = t.replace(/(提醒我|帮我记一?下?|帮我记着|记得提醒我|别忘了|不要忘了|提醒一下|帮我提醒|帮我安排|安排一下)/g, ' ');
  t = t.replace(/(我要|要去|去|要)/g, ' ');
  // 去掉常见连接词和标点
  t = t.replace(/^[，,。.!?！？\s:：]+|[，,。.!?！？\s:：]+$/g, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  if (t.length === 0 || t.length > 80) return null;
  return t;
}

function fmtDueShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  if (sameDay) return '今天 ' + t;
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return '明天 ' + t;
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + t;
}

// ========== 随机闲谈 ==========
function scheduleIdleChat() {
  const delay = 90000 + Math.random() * 120000;
  setTimeout(() => {
    if (state.current === 'idle' && bubble.classList.contains('hidden') && chatPanel.classList.contains('hidden')) {
      showSpeech(pickLine('idleThoughts'), 2500);
    }
    scheduleIdleChat();
  }, delay);
}

// 闲置随机动作（独立于台词，频率更低）
function scheduleIdleMotion() {
  const delay = 60000 + Math.random() * 60000;   // 1-2 分钟
  setTimeout(() => {
    if (state.current !== 'afk' && Math.random() < 0.3) {
      tryRandomIdle();
    }
    scheduleIdleMotion();
  }, delay);
}
scheduleIdleMotion();
scheduleIdleChat();

// ========== 聊天面板 + LLM ==========
const conversation = [];          // [{role:'user'|'assistant', content}]
const MAX_HISTORY = 8;            // 仅保留最近 8 轮发给 LLM

function isLLMEnabled() {
  return !!(currentSettings && currentSettings.llm && currentSettings.llm.enabled);
}

function applyLLMState() {
  const enabled = isLLMEnabled();
  chatInput.disabled = !enabled;
  chatSend.disabled = !enabled;
  if (enabled) {
    chatInput.placeholder = '说点什么...';
  } else {
    chatInput.placeholder = 'LLM 未启用，请先在设置中开启';
  }
}

function openChat() {
  chatPanel.classList.remove('hidden');
  applyLLMState();
  if (isLLMEnabled()) {
    if (window.petAPI.focus) window.petAPI.focus();
    setTimeout(() => chatInput.focus(), 50);
  }
  if (chatMessages.children.length === 0) {
    if (!isLLMEnabled()) {
      addChatMsg('system', '提示：LLM 未启用。右键 → 设置 中开启后即可对话。');
    } else {
      addChatMsg('pet', '主人想聊什么呀~ (◕‿◕)');
    }
  }
}
function closeChat() {
  if (historyMode) exitHistoryMode();
  chatPanel.classList.add('hidden');
}

// ========== 历史回溯模式 ==========
// 显示 main 进程 chatCache 里属于当前角色的对话（不同角色严格隔离）
let historyMode = false;
let savedLiveMessages = null;  // 进入历史模式前 chatMessages 的 DOM 快照

async function enterHistoryMode() {
  if (historyMode || !currentModelId) return;
  if (!window.petAPI || !window.petAPI.getChatHistory) return;

  let history;
  try {
    history = await window.petAPI.getChatHistory(currentModelId);
  } catch (e) {
    addChatMsg('system', '读取历史失败：' + (e.message || e));
    return;
  }

  historyMode = true;
  const historyBtn = document.getElementById('chat-history-btn');
  if (historyBtn) {
    historyBtn.classList.add('active');
    historyBtn.title = '退出历史';
  }
  // 保留当前对话 DOM
  savedLiveMessages = Array.from(chatMessages.childNodes);
  chatMessages.innerHTML = '';

  // 渲染历史
  const charName = (availableModels.find(m => m.id === currentModelId) || {}).config?.displayName || currentModelId;
  const head = document.createElement('div');
  head.className = 'msg history-divider';
  head.textContent = `📜 ${charName} 的历史对话（共 ${history.length} 条 · 仅本角色）`;
  chatMessages.appendChild(head);

  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'msg system';
    empty.textContent = '还没有任何对话历史~';
    chatMessages.appendChild(empty);
  } else {
    for (const m of history) {
      addChatMsg(m.role === 'user' ? 'user' : 'pet', m.content || '');
    }
  }

  const tail = document.createElement('div');
  tail.className = 'msg history-divider';
  tail.textContent = '— 历史结束，再点 📜 返回当前对话 —';
  chatMessages.appendChild(tail);

  chatInput.disabled = true;
  chatSend.disabled = true;
  chatInput.placeholder = '（历史浏览中，再点 📜 退出后可输入）';
  chatMessages.scrollTop = 0;
}

function exitHistoryMode() {
  if (!historyMode) return;
  historyMode = false;
  const historyBtn = document.getElementById('chat-history-btn');
  if (historyBtn) {
    historyBtn.classList.remove('active');
    historyBtn.title = '查看历史';
  }
  chatMessages.innerHTML = '';
  if (savedLiveMessages) {
    for (const n of savedLiveMessages) chatMessages.appendChild(n);
    savedLiveMessages = null;
  }
  applyLLMState();   // 还原输入框状态
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ========== 斜杠指令 ==========
// 聊天框输入以 / 开头时弹指令面板，键盘上下选/回车执行/点击执行
const SLASH_COMMANDS = [
  { name: '/clear',      desc: '清空当前对话',     run: cmdClear },
  { name: '/stats',      desc: '今日报告',         run: cmdStats },
  { name: '/diary',      desc: '今天的日记',       run: cmdDiary },
  { name: '/tarot',      desc: '今日塔罗',         run: cmdTarot },
  { name: '/memory',     desc: '打开设置看记忆',   run: cmdMemory },
  { name: '/collection', desc: '打开图鉴',         run: cmdCollection },
  { name: '/todos',      desc: '打开待办',         run: cmdTodos },
  { name: '/anniv',      desc: '打开纪念日',       run: cmdAnniv },
  { name: '/help',       desc: '列出所有指令',     run: cmdHelp },
];
let slashSelectedIdx = 0;
let slashFiltered = [];

function setupSlashCommands() {
  const menu = document.getElementById('slash-menu');
  if (!menu) return;

  chatInput.addEventListener('input', () => {
    const v = chatInput.value;
    if (v.startsWith('/')) showSlashMenu(v);
    else hideSlashMenu();
  });

  // 键盘控制（在 sendChatMessage 的 keydown 之前抢先处理）
  chatInput.addEventListener('keydown', (e) => {
    if (menu.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      slashSelectedIdx = (slashSelectedIdx + 1) % Math.max(1, slashFiltered.length);
      renderSlashMenu();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      slashSelectedIdx = (slashSelectedIdx - 1 + slashFiltered.length) % Math.max(1, slashFiltered.length);
      renderSlashMenu();
    } else if (e.key === 'Enter') {
      if (slashFiltered.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        runSlashCommand(slashFiltered[slashSelectedIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideSlashMenu();
    } else if (e.key === 'Tab') {
      // Tab 补全
      if (slashFiltered.length > 0) {
        e.preventDefault();
        chatInput.value = slashFiltered[slashSelectedIdx].name + ' ';
        hideSlashMenu();
      }
    }
  }, true);  // capture 优先

  // 点击菜单外关闭
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== chatInput) hideSlashMenu();
  });
}

function showSlashMenu(typed) {
  const menu = document.getElementById('slash-menu');
  const q = typed.toLowerCase();
  slashFiltered = SLASH_COMMANDS.filter(c => c.name.toLowerCase().startsWith(q));
  if (slashFiltered.length === 0) {
    hideSlashMenu();
    return;
  }
  // 当前选中保持在范围内
  if (slashSelectedIdx >= slashFiltered.length) slashSelectedIdx = 0;
  menu.classList.remove('hidden');
  renderSlashMenu();
}

function renderSlashMenu() {
  const menu = document.getElementById('slash-menu');
  menu.innerHTML = '';
  slashFiltered.forEach((cmd, i) => {
    const div = document.createElement('div');
    div.className = 'slash-item' + (i === slashSelectedIdx ? ' active' : '');
    const name = document.createElement('span');
    name.className = 'slash-name';
    name.textContent = cmd.name;
    const desc = document.createElement('span');
    desc.className = 'slash-desc';
    desc.textContent = cmd.desc;
    div.appendChild(name);
    div.appendChild(desc);
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      runSlashCommand(cmd);
    });
    menu.appendChild(div);
  });
}

function hideSlashMenu() {
  const menu = document.getElementById('slash-menu');
  if (menu) menu.classList.add('hidden');
  slashFiltered = [];
  slashSelectedIdx = 0;
}

function runSlashCommand(cmd) {
  chatInput.value = '';
  hideSlashMenu();
  try { cmd.run(); }
  catch (e) { addChatMsg('system', '指令出错：' + (e.message || e)); }
}

// 各指令实现
function cmdClear() {
  conversation.length = 0;
  chatMessages.innerHTML = '';
  addChatMsg('system', '已清空当前对话');
}
function cmdStats() { showDailyReport(); addChatMsg('system', '今日报告已气泡显示'); }
function cmdDiary() {
  if (typeof writeDiary === 'function') writeDiary();
  else addChatMsg('system', 'LLM 未启用，无法写日记');
}
function cmdTarot() {
  if (window.petAPI && window.petAPI.openTarot) {
    window.petAPI.openTarot();
    addChatMsg('system', '已打开塔罗窗口');
  }
}
function cmdMemory() {
  if (window.petAPI && window.petAPI.openSettings) {
    window.petAPI.openSettings();
    addChatMsg('system', '已打开设置（拖到「长期记忆」区）');
  }
}
function cmdCollection() {
  if (window.petAPI && window.petAPI.openCollection) {
    window.petAPI.openCollection();
    addChatMsg('system', '已打开图鉴');
  }
}
function cmdTodos() {
  if (window.petAPI && window.petAPI.openReminders) {
    window.petAPI.openReminders('todo');
    addChatMsg('system', '已打开待办');
  }
}
function cmdAnniv() {
  if (window.petAPI && window.petAPI.openReminders) {
    window.petAPI.openReminders('anniv');
    addChatMsg('system', '已打开纪念日');
  }
}
function cmdHelp() {
  const lines = ['可用指令：'];
  for (const c of SLASH_COMMANDS) lines.push(`  ${c.name}  — ${c.desc}`);
  addChatMsg('system', lines.join('\n'));
}

function addChatMsg(who, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 把对话发给主进程缓存，每条消息带上 modelId
// 避免不同角色对话混在一起后，图鉴/记忆整理时 LLM 分不清是谁聊的
function cacheChatWithModelId() {
  if (!window.petAPI || !window.petAPI.cacheChat) return;
  // 给每条消息打 modelId 标签（旧消息保留它们原来的，新消息打当前角色）
  for (let i = 0; i < conversation.length; i++) {
    if (!conversation[i].modelId) conversation[i].modelId = currentModelId;
  }
  window.petAPI.cacheChat(conversation);
}

async function sendChatMessage() {
  if (!isLLMEnabled()) return;
  const text = chatInput.value.trim();
  if (!text) return;
  // 如果用户输入的是斜杠指令，直接执行而不调 LLM
  if (text.startsWith('/')) {
    const cmd = SLASH_COMMANDS.find(c => c.name === text || c.name === text.split(/\s+/)[0]);
    if (cmd) {
      runSlashCommand(cmd);
      return;
    }
    // 不认识的指令也别送 LLM，提示一下
    chatInput.value = '';
    addChatMsg('system', '未知指令 ' + text + '，试试 /help');
    return;
  }
  chatInput.value = '';
  addChatMsg('user', text);
  conversation.push({ role: 'user', content: text });

  // 先尝试本地解析待办（"5 分钟后开会"、"明天 9 点提醒我..."）
  const parsed = parseTodoFromMessage(text);
  if (parsed) {
    try {
      await window.petAPI.addTodo({
        title: parsed.title,
        dueAt: parsed.dueAt,
        remindBefore: parsed.remindBefore,
      });
      const reply = `好的~ ${fmtDueShort(parsed.dueAt)} 提醒主人「${parsed.title}」(◕‿◕)`;
      conversation.push({ role: 'assistant', content: reply });
      addChatMsg('pet', reply);
      showSpeech(reply, 4500);
      tryTapMotion({ voiceProb: 0.1 });   // 聊天回复时低概率播音，避免每次都响
      cacheChatWithModelId();
      return;
    } catch (e) {
      console.warn('[chat-todo] add failed:', e.message);
      // 失败的话继续走 LLM
    }
  }

  chatSend.disabled = true;
  chatInput.disabled = true;

  // 思考占位 + 内联取消按钮
  const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const thinkingNode = document.createElement('div');
  thinkingNode.className = 'msg pet thinking';
  const dotsSpan = document.createElement('span');
  dotsSpan.className = 'thinking-dots';
  dotsSpan.textContent = '...';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'cancel';
  cancelBtn.className = 'thinking-cancel';
  cancelBtn.addEventListener('click', () => {
    if (window.petAPI && window.petAPI.llmAbort) window.petAPI.llmAbort(reqId);
  });
  thinkingNode.appendChild(dotsSpan);
  thinkingNode.appendChild(cancelBtn);
  chatMessages.appendChild(thinkingNode);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const msgsForLLM = conversation.slice(-MAX_HISTORY);
    const reply = await window.petAPI.llmChat(msgsForLLM, currentPersonality, currentModelId, reqId);
    thinkingNode.remove();
    const out = (reply || '').trim() || '...嗯?';
    conversation.push({ role: 'assistant', content: out });
    addChatMsg('pet', out);
    showSpeech(out, Math.min(8000, 2500 + out.length * 80));
    tryTapMotion({ voiceProb: 0.1 });   // 聊天回复时低概率播音，避免每次都响
    if (window.petAPI.cacheChat) cacheChatWithModelId();
  } catch (e) {
    thinkingNode.remove();
    const err = (e && e.message) ? e.message : String(e);
    // 用户主动取消 → 提示更柔和
    if (/用户取消|aborted|destroyed|socket hang up/i.test(err)) {
      addChatMsg('system', 'canceled');
    } else {
      addChatMsg('system', 'error: ' + err);
    }
  } finally {
    applyLLMState();   // 根据当前设置恢复输入框状态
    if (isLLMEnabled()) chatInput.focus();
  }
}

// ========== 监听 main 进程事件 ==========
if (window.petAPI && window.petAPI.onActivity) {
  window.petAPI.onActivity(onActivityTick);
}
if (window.petAPI && window.petAPI.onSettingsUpdate) {
  window.petAPI.onSettingsUpdate((s) => {
    currentSettings = s;
    // 切到静音时立刻打断正在播的音频
    if (s && s.voice && s.voice.muted) {
      if (currentVoiceAudio) {
        try { currentVoiceAudio.pause(); currentVoiceAudio.currentTime = 0; } catch (e) {}
        currentVoiceAudio = null;
      }
      // 全部 audio 元素也暂停（pixi 内部可能持有自己的 Audio 实例）
      document.querySelectorAll('audio').forEach(a => {
        try { a.pause(); a.currentTime = 0; } catch (e) {}
      });
    }
    // 同步聊天面板里的状态提示和输入框 enable/disable
    const enabled = isLLMEnabled();
    chatMessages.querySelectorAll('.msg.system').forEach(n => {
      if (n.textContent.includes('未启用') || n.textContent.includes('已关闭')) n.remove();
    });
    if (!chatPanel.classList.contains('hidden')) {
      if (!enabled) addChatMsg('system', '提示：LLM 已关闭，无法对话。');
      applyLLMState();
    }
  });
}
if (window.petAPI && window.petAPI.onModelSwitched) {
  window.petAPI.onModelSwitched(async (id) => {
    await loadModelById(id);
    conversation.length = 0;  // 换角色清空对话
    chatMessages.innerHTML = '';
    // 切换后重置穿透状态（新模型 bounds 完全不同）
    mouseIgnored = false;
    if (window.petAPI && window.petAPI.setIgnoreMouse) window.petAPI.setIgnoreMouse(false);
    // 检查新角色今天是不是生日
    const info = availableModels.find(m => m.id === id);
    if (isCharacterBirthdayToday()) {
      showSpeech(pickBirthdayGreeting(), 6000);
    } else {
      showSpeech(`换成 ${info ? info.config.displayName : id} 啦~`, 2500);
    }
  });
}

if (window.petAPI && window.petAPI.onMemoryUpdated) {
  window.petAPI.onMemoryUpdated((id) => {
    if (id === currentModelId && !chatPanel.classList.contains('hidden')) {
      // 在聊天面板里轻提示
      addChatMsg('system', '[记忆已更新]');
      // 自动隐藏这条提示
      const last = chatMessages.lastElementChild;
      setTimeout(() => { if (last && last.parentNode) last.remove(); }, 3500);
    }
  });
}

// 周期性持久化统计
setInterval(() => stats.save(), 60000);
window.addEventListener('beforeunload', () => stats.save());

// 启动
initLive2D();
