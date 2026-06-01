// 便签 + 纪念日 管理窗口
const tabs = document.querySelectorAll('.tab-btn');
const panes = document.querySelectorAll('.tab-pane');
function switchTab(name) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  panes.forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}
tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
if (window.remindersAPI && window.remindersAPI.onSwitchTab) {
  window.remindersAPI.onSwitchTab(switchTab);
}

// ========== 待办 ==========
const todoTitle = document.getElementById('todo-title');
const todoDue = document.getElementById('todo-due');
const todoRemind = document.getElementById('todo-remind');
const todoAddBtn = document.getElementById('todo-add-btn');
const todoListActive = document.getElementById('todo-list-active');
const todoListDone = document.getElementById('todo-list-done');
const todoCount = document.getElementById('todo-count');

function fmtDue(iso) {
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

function dueClass(iso) {
  if (!iso) return '';
  const due = Date.parse(iso);
  const now = Date.now();
  if (due < now) return 'overdue';
  if (due - now < 60 * 60 * 1000) return 'upcoming';
  return '';
}

async function renderTodos() {
  let list;
  try { list = await window.remindersAPI.listTodos(); }
  catch (e) { list = []; }

  const active = list.filter(t => !t.completed);
  const done = list.filter(t => t.completed);
  todoCount.textContent = `(${active.length})`;

  // 排序：有 dueAt 的按时间升序在前，没 dueAt 的按创建时间倒序
  active.sort((a, b) => {
    if (a.dueAt && b.dueAt) return Date.parse(a.dueAt) - Date.parse(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return b.createdAt - a.createdAt;
  });
  done.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  todoListActive.innerHTML = '';
  if (active.length === 0) {
    todoListActive.innerHTML = '<li class="muted" style="padding:10px;text-align:center;">还没有待办，加一个吧~</li>';
  }
  for (const t of active) {
    todoListActive.appendChild(renderTodoItem(t, false));
  }

  todoListDone.innerHTML = '';
  for (const t of done.slice(0, 30)) {
    todoListDone.appendChild(renderTodoItem(t, true));
  }
}

function renderTodoItem(t, done) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = done;
  cb.addEventListener('change', async () => {
    await window.remindersAPI.checkTodo(t.id, cb.checked);
    renderTodos();
  });
  const text = document.createElement('div');
  text.className = 'todo-text' + (done ? ' done' : '');
  text.textContent = t.title;

  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.alignItems = 'center';
  right.style.gap = '6px';
  if (t.dueAt && !done) {
    const due = document.createElement('span');
    due.className = 'todo-due ' + dueClass(t.dueAt);
    const remindTip = t.remindBefore ? ` (提前 ${t.remindBefore} 分钟)` : '';
    due.textContent = fmtDue(t.dueAt) + remindTip;
    right.appendChild(due);
  }
  const del = document.createElement('button');
  del.className = 'del-btn';
  del.textContent = '×';
  del.title = '删除';
  del.addEventListener('click', async () => {
    if (!confirm('删除这条待办？')) return;
    await window.remindersAPI.deleteTodo(t.id);
    renderTodos();
  });
  right.appendChild(del);

  li.appendChild(cb);
  li.appendChild(text);
  li.appendChild(right);
  return li;
}

todoAddBtn.addEventListener('click', async () => {
  const title = todoTitle.value.trim();
  if (!title) { todoTitle.focus(); return; }
  const due = todoDue.value ? new Date(todoDue.value).toISOString() : null;
  const remind = todoRemind.value ? parseInt(todoRemind.value, 10) : null;
  try {
    await window.remindersAPI.addTodo({ title, dueAt: due, remindBefore: remind });
    todoTitle.value = ''; todoDue.value = ''; todoRemind.value = '';
    todoTitle.focus();
    renderTodos();
  } catch (e) { alert('添加失败：' + (e.message || e)); }
});
todoTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') todoAddBtn.click();
});

// ========== 纪念日 ==========
const annivTitle = document.getElementById('anniv-title');
const annivType = document.getElementById('anniv-type');
const annivMonth = document.getElementById('anniv-month');
const annivDay = document.getElementById('anniv-day');
const annivYear = document.getElementById('anniv-year');
const annivRemindBefore = document.getElementById('anniv-remind-before');
const annivNotes = document.getElementById('anniv-notes');
const annivAddBtn = document.getElementById('anniv-add-btn');
const annivList = document.getElementById('anniv-list');
const annivCount = document.getElementById('anniv-count');

function iconForType(type) {
  if (type === '生日') return '🎂';
  if (type === '纪念日') return '💝';
  if (type === '节日') return '🎉';
  return '✨';
}

function daysUntil(month, day) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisYear = new Date(today.getFullYear(), month - 1, day);
  const target = thisYear < today
    ? new Date(today.getFullYear() + 1, month - 1, day)
    : thisYear;
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

async function renderAnnivs() {
  let list;
  try { list = await window.remindersAPI.listAnniv(); }
  catch (e) { list = []; }
  annivCount.textContent = `(${list.length})`;
  // 按 daysUntil 升序
  list.sort((a, b) => daysUntil(a.month, a.day) - daysUntil(b.month, b.day));
  annivList.innerHTML = '';
  if (list.length === 0) {
    annivList.innerHTML = '<li class="muted" style="padding:10px;text-align:center;">还没有纪念日，加一个让桌宠帮你记住吧~</li>';
    return;
  }
  for (const a of list) {
    annivList.appendChild(renderAnnivItem(a));
  }
}

function renderAnnivItem(a) {
  const li = document.createElement('li');
  li.className = 'anniv-item';
  const icon = document.createElement('div');
  icon.className = 'anniv-icon';
  icon.textContent = iconForType(a.type);

  const main = document.createElement('div');
  main.className = 'anniv-main';
  const title = document.createElement('div');
  title.className = 'anniv-title';
  title.textContent = a.title;
  main.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'anniv-sub';
  const parts = [];
  parts.push(`${a.month} 月 ${a.day} 日`);
  if (a.year) parts.push(`${a.year} 年起`);
  if (a.type) parts.push(a.type);
  if (a.remindDaysBefore && a.remindDaysBefore.length) {
    parts.push(`提前 ${a.remindDaysBefore.join('/')} 天提醒`);
  }
  if (a.notes) parts.push(a.notes);
  sub.textContent = parts.join(' · ');
  main.appendChild(sub);

  const cd = document.createElement('div');
  const days = daysUntil(a.month, a.day);
  cd.className = 'anniv-countdown' + (days === 0 ? ' today' : '');
  if (days === 0) {
    const years = a.year ? new Date().getFullYear() - a.year : null;
    cd.textContent = years ? `第 ${years} 年 · 就是今天!` : '就是今天!';
  } else {
    cd.textContent = `还有 ${days} 天`;
  }

  const del = document.createElement('button');
  del.className = 'del-btn';
  del.textContent = '×';
  del.title = '删除';
  del.addEventListener('click', async () => {
    if (!confirm('删除「' + a.title + '」？')) return;
    await window.remindersAPI.deleteAnniv(a.id);
    renderAnnivs();
  });

  li.appendChild(icon);
  li.appendChild(main);
  li.appendChild(cd);
  li.appendChild(del);
  return li;
}

annivAddBtn.addEventListener('click', async () => {
  const title = annivTitle.value.trim();
  if (!title) { annivTitle.focus(); return; }
  const m = parseInt(annivMonth.value, 10);
  const d = parseInt(annivDay.value, 10);
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) {
    alert('请填写正确的月份和日期~');
    return;
  }
  const y = annivYear.value ? parseInt(annivYear.value, 10) : null;
  const remindBefore = annivRemindBefore.value
    .split(/[,，\s]+/).map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n >= 0);
  try {
    await window.remindersAPI.addAnniv({
      title, type: annivType.value, month: m, day: d, year: y,
      notes: annivNotes.value.trim(),
      remindDaysBefore: remindBefore,
    });
    annivTitle.value = ''; annivMonth.value = ''; annivDay.value = '';
    annivYear.value = ''; annivRemindBefore.value = ''; annivNotes.value = '';
    annivTitle.focus();
    renderAnnivs();
  } catch (e) { alert('添加失败：' + (e.message || e)); }
});

// 启动
renderTodos();
renderAnnivs();
