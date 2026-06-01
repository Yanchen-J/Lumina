// 桌宠日记 - 日历视图 + 用户日记编辑
const monthLabel = document.getElementById('month-label');
const calGrid = document.getElementById('cal-grid');
const prevBtn = document.getElementById('prev-month');
const nextBtn = document.getElementById('next-month');
const todayBtn = document.getElementById('today-btn');
const statsInfo = document.getElementById('stats-info');
const detailEl = document.getElementById('detail');
const detailEmpty = document.getElementById('detail-empty');
const detailDateHead = document.getElementById('detail-date-head');

// pet section
const petSection = document.getElementById('pet-section');
const petEmoji = document.getElementById('pet-emoji');
const petMood = document.getElementById('pet-mood');
const petMeta = document.getElementById('pet-meta');
const petBody = document.getElementById('pet-body');

// user section
const userEmojiDisplay = document.getElementById('user-emoji-display');
const userMoodDisplay = document.getElementById('user-mood-display');
const userMeta = document.getElementById('user-meta');
const userDisplay = document.getElementById('user-display');
const userEmpty = document.getElementById('user-empty');
const userEditor = document.getElementById('user-editor');
const userBody = document.getElementById('user-body');
const userMoodInput = document.getElementById('user-mood-input');
const emojiPicker = document.getElementById('emoji-picker');
const userEditBtn = document.getElementById('user-edit-btn');
const userDeleteBtn = document.getElementById('user-delete-btn');
const userSaveBtn = document.getElementById('user-save-btn');
const userCancelBtn = document.getElementById('user-cancel-btn');

// 用本地时区的 YYYY-MM-DD，避免 toISOString() 的 UTC 偏移导致和后端存储日期对不上
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const todayStr = localDateStr(new Date());
let viewYear, viewMonth;
let allDiaries = [];
let diaryMap = new Map();
let selectedDate = null;
let currentFile = null;        // 当前选中日期的完整 file
let availableEmojis = [];
let pickedEmoji = '🙂';

// 半透明 Live2D 形象
let ghostApp = null;
let ghostModel = null;
let ghostModelId = null;
let modelsList = [];
const ghostCanvas = document.getElementById('ghost-canvas');

async function ensureGhostApp() {
  if (ghostApp) return ghostApp;
  if (!window.PIXI || !window.PIXI.live2d) return null;
  try { PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker); } catch (e) {}
  ghostApp = new PIXI.Application({
    view: ghostCanvas,
    resizeTo: document.querySelector('.detail-pane'),
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  return ghostApp;
}

async function showGhostFor(modelId) {
  if (!modelId) { hideGhost(); return; }
  if (ghostModelId === modelId && ghostModel) {
    ghostCanvas.classList.remove('hidden');
    return;
  }
  const info = modelsList.find(m => m.id === modelId);
  if (!info) { hideGhost(); return; }

  const app = await ensureGhostApp();
  if (!app) return;
  if (ghostModel) {
    try { app.stage.removeChild(ghostModel); ghostModel.destroy({ children: true, texture: true, baseTexture: true }); } catch (e) {}
    ghostModel = null;
  }
  try {
    ghostModel = await PIXI.live2d.Live2DModel.from(info.url, { autoInteract: false });
  } catch (e) {
    console.warn('[ghost] load failed:', e.message);
    hideGhost();
    return;
  }
  app.stage.addChild(ghostModel);
  ghostModelId = modelId;

  // 静态：停掉所有动画（呼吸、眨眼、idle motion）
  freezeModel(ghostModel);

  fitGhost();
  // 手动渲染一帧并停掉 ticker，节省 CPU
  app.render();
  app.ticker.stop();

  ghostCanvas.classList.remove('hidden');
}

// 冻结模型：移除呼吸/眨眼/物理/idle motion，并清空更新函数
function freezeModel(model) {
  try {
    const im = model.internalModel;
    if (im) {
      // 清空各组件，避免它们继续推动参数
      im.breath = null;
      im.eyeBlink = null;
      im.physics = null;
      im.pose = null;
      if (im.motionManager) {
        try { im.motionManager.stopAllMotions(); } catch (e) {}
        // 关掉 idle group 自动播放
        try {
          im.motionManager.groups = im.motionManager.groups || {};
          im.motionManager.groups.idle = '__none__';
        } catch (e) {}
      }
    }
    // 取消模型自身的 update 调用（pixi-live2d-display 在 ticker 上注册了 model.update）
    model.update = function () {};
  } catch (e) {
    console.warn('[ghost] freeze failed:', e.message);
  }
}

function fitGhost() {
  if (!ghostModel || !ghostApp) return;
  ghostModel.scale.set(1);
  const margin = 20;
  const availW = ghostApp.screen.width - margin * 2;
  const availH = ghostApp.screen.height - margin * 2;
  const s = Math.min(availW / ghostModel.width, availH / ghostModel.height);
  ghostModel.scale.set(s);
  ghostModel.anchor.set(0.5, 0.5);
  // 偏右侧呈现，避免遮挡左侧文字
  ghostModel.position.set(
    ghostApp.screen.width * 0.72,
    ghostApp.screen.height * 0.55
  );
  // 重新渲染（ticker 已停，必须手动 render）
  if (ghostApp.render) ghostApp.render();
}

function hideGhost() {
  ghostCanvas.classList.add('hidden');
}

window.addEventListener('resize', () => {
  if (ghostApp) { ghostApp.resize(); fitGhost(); }
});

function fmtYM(y, m) { return y + ' 年 ' + (m + 1) + ' 月'; }

// 角色调色板：按名字 hash 出固定的一对色 { border, bg, tag }
// border 用作色环描边、 section border-left、tag 背景
// bg 用作色环填充（淡），tag 文字始终白色
const PALETTE = [
  { border: '#ff5d9a', bg: '#ffeaf3' },   // 樱桃粉
  { border: '#7a5cff', bg: '#ebe5ff' },   // 但 user 占了，跳过
  { border: '#5cb8ff', bg: '#e3f1ff' },   // 天空蓝
  { border: '#ff8a3d', bg: '#ffeadb' },   // 橘
  { border: '#3dc28a', bg: '#daf5e8' },   // 薄荷绿
  { border: '#c97099', bg: '#f7e1ec' },   // 玫瑰
  { border: '#a96bff', bg: '#f0e3ff' },   // 兰
  { border: '#ffb845', bg: '#fff1d6' },   // 蜜糖橙
  { border: '#ff6b6b', bg: '#ffe1e1' },   // 珊瑚红
  { border: '#19a3a3', bg: '#d6f0f0' },   // 青绿
];
const USER_COLOR = { border: '#7a5cff', bg: '#ebe5ff' };

function authorPalette(name) {
  if (!name) return PALETTE[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  // 跳过和 user 撞色的索引 1
  const choices = PALETTE.filter((_, i) => i !== 1);
  return choices[h % choices.length];
}

function shortAuthor(name) {
  if (!name) return '';
  const isCJK = /[一-鿿]/.test(name);
  return isCJK ? name.slice(0, 2) : name.slice(0, 3);
}

async function reload() {
  try { allDiaries = await window.diaryAPI.listAll(); } catch (e) { allDiaries = []; }
  diaryMap = new Map(allDiaries.map(d => [d.date, d]));
  const petN = allDiaries.filter(d => d.hasPet).length;
  const userN = allDiaries.filter(d => d.hasUser).length;
  statsInfo.textContent = `桌宠 ${petN} 篇 · 我 ${userN} 篇`;
  renderLegend();
  renderMonth();
}

// 图例：所有出现过的角色 + "我"
function renderLegend() {
  const legend = document.getElementById('cal-legend');
  if (!legend) return;
  // 收集所有 pet 角色名
  const seen = new Map();   // name -> palette
  for (const d of allDiaries) {
    if (d.hasPet && d.pet) {
      const n = d.pet.characterName || d.pet.modelId;
      if (n && !seen.has(n)) seen.set(n, authorPalette(n));
    }
  }
  legend.innerHTML = '';
  for (const [name, p] of seen) {
    const span = document.createElement('span');
    span.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = p.bg;
    dot.style.borderColor = p.border;
    span.appendChild(dot);
    span.appendChild(document.createTextNode(name));
    legend.appendChild(span);
  }
  // "我"
  const userSpan = document.createElement('span');
  userSpan.className = 'legend-item';
  const userDot = document.createElement('span');
  userDot.className = 'legend-dot user';
  userSpan.appendChild(userDot);
  userSpan.appendChild(document.createTextNode('我'));
  legend.appendChild(userSpan);
}

function renderMonth() {
  monthLabel.textContent = fmtYM(viewYear, viewMonth);
  calGrid.innerHTML = '';
  const firstDay = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(viewYear, viewMonth - 1, daysInPrevMonth - i), outside: true });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(viewYear, viewMonth, day), outside: false });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    cells.push({ date: next, outside: next.getMonth() !== viewMonth });
    if (cells.length >= 42) break;
  }

  for (const c of cells) {
    const d = c.date;
    const dateStr = localDateStr(d);
    const meta = diaryMap.get(dateStr);
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (c.outside) cell.classList.add('outside');
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr > todayStr) cell.classList.add('future');
    if (meta && (meta.hasPet || meta.hasUser)) cell.classList.add('has-any');
    if (dateStr === selectedDate) cell.classList.add('selected');

    const num = document.createElement('div');
    num.className = 'cal-day-num';
    num.textContent = d.getDate();
    cell.appendChild(num);

    const emojiRow = document.createElement('div');
    if (meta && (meta.hasPet || meta.hasUser)) {
      emojiRow.className = 'cal-emojis';
      if (meta.hasPet && meta.pet) {
        const author = meta.pet.characterName || meta.pet.modelId || '';
        const p = authorPalette(author);
        const c = document.createElement('div');
        c.className = 'cal-emoji-circle pet';
        c.style.borderColor = p.border;
        c.style.background = p.bg;
        c.textContent = meta.pet.emoji || '🙂';
        emojiRow.appendChild(c);
      }
      if (meta.hasUser && meta.user) {
        const c = document.createElement('div');
        c.className = 'cal-emoji-circle user';
        c.textContent = meta.user.emoji || '🙂';
        emojiRow.appendChild(c);
      }

      const tipParts = [dateStr];
      if (meta.hasPet) {
        const author = meta.pet.characterName || meta.pet.modelId || '';
        tipParts.push(`${author} ${meta.pet.emoji || ''} ${meta.pet.mood || ''}`);
      }
      if (meta.hasUser) {
        tipParts.push(`我 ${meta.user.emoji || ''} ${meta.user.mood || ''}`);
      }
      cell.title = tipParts.join('\n');
    } else {
      emojiRow.className = 'cal-emoji-placeholder';
      emojiRow.textContent = '·';
      cell.title = dateStr + '（无日记）';
    }
    cell.appendChild(emojiRow);

    cell.addEventListener('click', () => selectDate(dateStr));
    calGrid.appendChild(cell);
  }
}

async function selectDate(dateStr) {
  selectedDate = dateStr;
  renderMonth();   // 重渲选中态
  detailEmpty.style.display = 'none';
  detailEl.classList.remove('hidden');
  detailDateHead.textContent = formatPrettyDate(dateStr);

  let file = null;
  try { file = await window.diaryAPI.get(dateStr); } catch (e) {}
  currentFile = file || { date: dateStr, pet: null, user: null };

  renderPet(currentFile.pet);
  renderUser(currentFile.user);
  // 切日期时退出编辑态
  exitEditor();

  // 背景形象：有 pet 就显示对应模型，没有就隐藏
  if (currentFile.pet && currentFile.pet.modelId) {
    showGhostFor(currentFile.pet.modelId);
  } else {
    hideGhost();
  }
}

function renderPet(pet) {
  if (!pet || !pet.body) {
    petSection.classList.add('hidden');
    return;
  }
  const author = pet.characterName || pet.modelId || '';
  const p = authorPalette(author);
  petSection.classList.remove('hidden');
  petSection.style.borderLeftColor = p.border;

  const petTag = document.getElementById('pet-tag');
  if (petTag) {
    petTag.textContent = author || '桌宠';
    petTag.style.background = p.border;
  }

  petEmoji.textContent = pet.emoji || '🙂';
  petMood.textContent = pet.mood ? '心情: ' + pet.mood : '';
  petMood.style.display = pet.mood ? '' : 'none';
  if (pet.mood) {
    petMood.style.background = p.bg;
    petMood.style.color = p.border;
  }
  const created = pet.createdAt ? new Date(pet.createdAt).toLocaleString() : '';
  petMeta.textContent = '写于 ' + created;
  petBody.textContent = pet.body;
}

function renderUser(user) {
  if (!user || !user.body) {
    userDisplay.style.display = 'none';
    userEmojiDisplay.style.display = 'none';
    userMoodDisplay.style.display = 'none';
    userMeta.textContent = '';
    userEmpty.style.display = '';
    userDeleteBtn.classList.add('hidden');
  } else {
    userDisplay.style.display = '';
    userDisplay.textContent = user.body;
    userEmojiDisplay.textContent = user.emoji || '🙂';
    userEmojiDisplay.style.display = '';
    if (user.mood) {
      userMoodDisplay.textContent = '心情: ' + user.mood;
      userMoodDisplay.style.display = '';
    } else {
      userMoodDisplay.style.display = 'none';
    }
    const updated = user.updatedAt ? new Date(user.updatedAt).toLocaleString() : '';
    userMeta.textContent = '更新于 ' + updated;
    userEmpty.style.display = 'none';
    userDeleteBtn.classList.remove('hidden');
  }
}

function enterEditor() {
  const u = currentFile && currentFile.user;
  userBody.value = (u && u.body) || '';
  userMoodInput.value = (u && u.mood) || '';
  pickedEmoji = (u && u.emoji) || '🙂';
  renderEmojiPicker();

  userDisplay.style.display = 'none';
  userEmpty.style.display = 'none';
  userEditor.classList.remove('hidden');
  userEditBtn.classList.add('hidden');
  userDeleteBtn.classList.add('hidden');
  setTimeout(() => userBody.focus(), 30);
}

function exitEditor() {
  userEditor.classList.add('hidden');
  userEditBtn.classList.remove('hidden');
  // 根据是否有 user 决定显示删除按钮
  const hasUser = !!(currentFile && currentFile.user && currentFile.user.body);
  userDeleteBtn.classList.toggle('hidden', !hasUser);
  renderUser(currentFile && currentFile.user);
}

function renderEmojiPicker() {
  emojiPicker.innerHTML = '';
  for (const e of availableEmojis) {
    const span = document.createElement('span');
    span.className = 'emoji-option' + (e === pickedEmoji ? ' selected' : '');
    span.textContent = e;
    span.addEventListener('click', () => {
      pickedEmoji = e;
      renderEmojiPicker();
    });
    emojiPicker.appendChild(span);
  }
}

userEditBtn.addEventListener('click', enterEditor);
userCancelBtn.addEventListener('click', exitEditor);
userSaveBtn.addEventListener('click', async () => {
  const body = userBody.value.trim();
  if (!body) { alert('内容不能为空哦~'); return; }
  try {
    const file = await window.diaryAPI.saveUser(
      selectedDate, body, userMoodInput.value.trim(), pickedEmoji
    );
    currentFile = file;
    exitEditor();
    await reload();
  } catch (e) {
    alert('保存失败：' + (e.message || e));
  }
});
userDeleteBtn.addEventListener('click', async () => {
  if (!confirm('确定删除 ' + selectedDate + ' 我的日记？此操作不可恢复。')) return;
  try {
    const file = await window.diaryAPI.deleteUser(selectedDate);
    currentFile = file || { date: selectedDate, pet: currentFile && currentFile.pet, user: null };
    exitEditor();
    await reload();
  } catch (e) {
    alert('删除失败：' + (e.message || e));
  }
});

function formatPrettyDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weeks = ['日', '一', '二', '三', '四', '五', '六'];
  return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 周' + weeks[d.getDay()];
}

prevBtn.addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderMonth();
});
nextBtn.addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderMonth();
});
todayBtn.addEventListener('click', () => {
  const t = new Date();
  viewYear = t.getFullYear();
  viewMonth = t.getMonth();
  renderMonth();
  selectDate(todayStr);
});

// 启动
(async () => {
  try { availableEmojis = await window.diaryAPI.emojis(); }
  catch (e) { availableEmojis = ['😊', '🥰', '😌', '😴', '😟', '😭', '😤', '🤔', '😎', '😋', '🙂', '😔']; }
  try { modelsList = await window.diaryAPI.listModels(); }
  catch (e) { modelsList = []; }
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  await reload();
  if (diaryMap.has(todayStr)) selectDate(todayStr);
})();

if (window.diaryAPI && window.diaryAPI.onUpdated) {
  window.diaryAPI.onUpdated(() => reload().then(() => {
    if (selectedDate) selectDate(selectedDate);
  }));
}
