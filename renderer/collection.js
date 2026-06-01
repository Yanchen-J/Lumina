// 口袋图鉴窗口
const catList = document.getElementById('cat-list');
const grid = document.getElementById('grid');
const emptyEl = document.getElementById('empty');
const rebuildBtn = document.getElementById('rebuild-btn');
const clearBtn = document.getElementById('clear-btn');
const statusEl = document.getElementById('status');
const detailPane = document.getElementById('detail-pane');
const detailClose = document.getElementById('detail-close');
const dEmoji = document.getElementById('d-emoji');
const dTitle = document.getElementById('d-title');
const dCat = document.getElementById('d-cat');
const dDesc = document.getElementById('d-desc');
const dFacts = document.getElementById('d-facts');
const dSnippets = document.getElementById('d-snippets');
const dMeta = document.getElementById('d-meta');
const dDelete = document.getElementById('d-delete');

const CATEGORIES = ['全部', '人物', '宠物', '食物', '地点', '物件', '习惯', '兴趣', '工作', '其他'];
let currentCat = '全部';
let allItems = [];
let selectedId = null;

function setStatus(text, error = false) {
  statusEl.textContent = text || '';
  statusEl.classList.toggle('error', !!error);
}

async function reload() {
  let data;
  try { data = await window.collectionAPI.list(); }
  catch (e) { data = { items: [] }; }
  allItems = data.items || [];
  renderCats();
  renderGrid();
  if (data.lastRebuildAt) {
    setStatus('上次整理: ' + new Date(data.lastRebuildAt).toLocaleString());
  } else {
    setStatus('');
  }
}

function renderCats() {
  catList.innerHTML = '';
  const counts = new Map();
  for (const it of allItems) {
    counts.set(it.category, (counts.get(it.category) || 0) + 1);
  }
  for (const cat of CATEGORIES) {
    const el = document.createElement('div');
    el.className = 'cat-item' + (cat === currentCat ? ' active' : '');
    const left = document.createElement('span');
    left.textContent = cat;
    const right = document.createElement('span');
    right.className = 'cat-count';
    const n = cat === '全部' ? allItems.length : (counts.get(cat) || 0);
    right.textContent = n;
    el.appendChild(left);
    el.appendChild(right);
    el.addEventListener('click', () => {
      currentCat = cat;
      renderCats();
      renderGrid();
    });
    catList.appendChild(el);
  }
}

function renderGrid() {
  grid.innerHTML = '';
  const filtered = currentCat === '全部'
    ? allItems
    : allItems.filter(i => i.category === currentCat);
  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  for (const it of filtered) {
    const card = document.createElement('div');
    card.className = 'card';

    const emoji = document.createElement('div');
    emoji.className = 'card-emoji';
    emoji.textContent = it.emoji || '✨';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = it.title;

    const cat = document.createElement('div');
    cat.className = 'card-cat';
    cat.textContent = it.category;

    const desc = document.createElement('div');
    desc.className = 'card-desc';
    desc.textContent = it.description || '';

    card.appendChild(emoji);
    card.appendChild(title);
    card.appendChild(cat);
    card.appendChild(desc);
    card.addEventListener('click', () => openDetail(it.id));
    grid.appendChild(card);
  }
}

async function openDetail(id) {
  selectedId = id;
  let it;
  try { it = await window.collectionAPI.get(id); }
  catch (e) { return; }
  if (!it) return;
  detailPane.dataset.itemId = it.id;
  dEmoji.textContent = it.emoji || '✨';
  dTitle.textContent = it.title;
  dCat.textContent = it.category;
  dDesc.textContent = it.description || '';
  dFacts.innerHTML = '';
  if (it.factTexts && it.factTexts.length) {
    for (const f of it.factTexts) {
      const li = document.createElement('li');
      li.textContent = '· ' + f;
      dFacts.appendChild(li);
    }
  } else {
    const li = document.createElement('li');
    li.className = 'empty-line';
    li.textContent = '没有关联记忆';
    dFacts.appendChild(li);
  }
  dSnippets.innerHTML = '';
  if (it.snippets && it.snippets.length) {
    for (const s of it.snippets) {
      const div = document.createElement('div');
      div.className = 'snippet ' + (s.role === 'user' ? 'user' : 'assistant');
      div.textContent = (s.role === 'user' ? '主人: ' : '我: ') + s.content;
      dSnippets.appendChild(div);
    }
  }
  const first = it.firstAt ? new Date(it.firstAt).toLocaleDateString() : '';
  const last = it.lastAt ? new Date(it.lastAt).toLocaleDateString() : '';
  dMeta.textContent = (first ? '初次收录: ' + first : '') + (last && last !== first ? ' · 最近更新: ' + last : '');
  detailPane.classList.remove('hidden');
}

detailClose.addEventListener('click', () => detailPane.classList.add('hidden'));

dDelete.addEventListener('click', async () => {
  const id = detailPane.dataset.itemId;
  if (!id) return;
  const title = dTitle.textContent || '这张卡片';
  if (!confirm(`确定删除「${title}」？\n\n注意：删除后下次自动整理时，如果聊天中又提到这个实体，可能会被重新创建。`)) return;
  try {
    await window.collectionAPI.deleteItem(id);
    detailPane.classList.add('hidden');
    await reload();
  } catch (e) {
    alert('删除失败：' + (e.message || e));
  }
});

rebuildBtn.addEventListener('click', async () => {
  rebuildBtn.disabled = true;
  const originalText = rebuildBtn.textContent;
  rebuildBtn.textContent = '整理中...';
  setStatus('正在让桌宠整理图鉴，可能需要 20-60 秒...');
  try {
    // recentChat 这里拿不到，让 main 端用记忆事实即可，对话片段是空数组
    const result = await window.collectionAPI.rebuild([]);
    if (result && result.skipped) {
      setStatus(result.reason || '没有可整理的内容', true);
    } else {
      setStatus('整理完成，共 ' + (result.items ? result.items.length : 0) + ' 张卡片');
      await reload();
    }
  } catch (e) {
    setStatus('整理失败：' + (e.message || e), true);
  } finally {
    rebuildBtn.disabled = false;
    rebuildBtn.textContent = originalText;
  }
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('确定清空图鉴？所有卡片会被删除（长期记忆不受影响）。')) return;
  await window.collectionAPI.clear();
  await reload();
});

if (window.collectionAPI && window.collectionAPI.onUpdated) {
  window.collectionAPI.onUpdated(() => reload());
}

reload();
