// 塔罗窗口
const elDate = document.getElementById('date');
const elPreDraw = document.getElementById('pre-draw');
const elResult = document.getElementById('result');
const elCardBack = document.getElementById('card-back');
const elDrawBtn = document.getElementById('draw-btn');
const elRedrawBtn = document.getElementById('redraw-btn');
const elFrame = document.getElementById('card-frame');
const elImg = document.getElementById('card-img');
const elName = document.getElementById('card-name');
const elOri = document.getElementById('card-orientation');
const elKw = document.getElementById('card-keywords');
const elIntro = document.getElementById('text-intro');
const elMeaning = document.getElementById('text-meaning');
const elAdvice = document.getElementById('text-advice');
const elMeta = document.getElementById('meta-line');
const elStatus = document.getElementById('status');

function setStatus(text, error = false) {
  elStatus.textContent = text || '';
  elStatus.classList.toggle('error', !!error);
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

elDate.textContent = formatPrettyDate(new Date());

function formatPrettyDate(d) {
  const weeks = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${weeks[d.getDay()]}`;
}

let currentModelId = null;

async function init() {
  try {
    const settings = await window.settingsAPI.get();
    currentModelId = settings.currentModel || 'Hiyori';
  } catch (e) {
    currentModelId = 'Hiyori';
  }
  // 看今天有没有抽过
  try {
    const today = await window.petAPI.getTarotToday(currentModelId);
    if (today) showResult(today);
  } catch (e) { /* 没有就显示抽牌前 */ }
}

elCardBack.addEventListener('click', doDraw);
elDrawBtn.addEventListener('click', doDraw);
elRedrawBtn.addEventListener('click', () => doDraw(true));

async function doDraw(force = false) {
  setStatus('正在与命运对话...');
  elDrawBtn.disabled = true;
  elRedrawBtn.disabled = true;
  try {
    const r = await window.petAPI.drawTarot(currentModelId, !!force);
    showResult(r);
    setStatus('');
  } catch (e) {
    setStatus(e.message || String(e), true);
  } finally {
    elDrawBtn.disabled = false;
    elRedrawBtn.disabled = false;
  }
}

function showResult(r) {
  elPreDraw.style.display = 'none';
  elResult.classList.remove('hidden');
  // 重置 + 强制 reflow 让 flip-in 动画重播（重抽时也能看到翻牌）
  elFrame.style.animation = 'none';
  void elFrame.offsetWidth;
  elFrame.style.animation = '';
  elImg.src = r.imageUrl;
  elFrame.classList.toggle('reversed', !!r.reversed);
  elName.textContent = r.cardName + ' (' + r.cardNameEn + ')';
  elOri.textContent = r.reversed ? '· 逆位 ·' : '· 正位 ·';
  elKw.textContent = (r.keywords || []).join('、');

  setRow('row-intro', elIntro, r.intro);
  setRow('row-meaning', elMeaning, r.meaning);
  setRow('row-advice', elAdvice, r.advice);

  const author = r.characterName ? `由 ${r.characterName} 解读` : '';
  const created = r.createdAt ? new Date(r.createdAt).toLocaleTimeString() : '';
  const attempt = r.redrawAttempt && r.redrawAttempt > 0 ? `（第 ${r.redrawAttempt + 1} 次抽）` : '';
  elMeta.textContent = author + (author && created ? ' · ' : '') + (created ? '抽于 ' + created : '') + attempt;
}

function setRow(rowId, textEl, value) {
  const row = document.getElementById(rowId);
  if (!value || !value.trim()) {
    row.classList.add('empty');
    textEl.textContent = '';
  } else {
    row.classList.remove('empty');
    textEl.textContent = value;
  }
}

init();
