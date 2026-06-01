// 待办 + 纪念日 持久化模块
// userData/todos.json:        [{id, title, dueAt?, remindBefore?, completed, completedAt?, createdAt}]
// userData/anniversaries.json: [{id, title, type, month, day, year?, notes?, remindDaysBefore[], createdAt}]
const fs = require('fs');
const path = require('path');

let todosPath = null;
let annivPath = null;

function init(userDataPath) {
  todosPath = path.join(userDataPath, 'todos.json');
  annivPath = path.join(userDataPath, 'anniversaries.json');
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function loadJsonArray(p) {
  if (!p) return [];
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveJsonArray(p, arr) {
  if (!p) return;
  try { fs.writeFileSync(p, JSON.stringify(arr, null, 2)); }
  catch (e) { console.error('[reminders] save failed:', p, e.message); }
}

// ========== 待办 ==========
function listTodos() { return loadJsonArray(todosPath); }

function addTodo({ title, dueAt, remindBefore }) {
  const todos = listTodos();
  const t = {
    id: uid('todo'),
    title: String(title || '').trim().slice(0, 200),
    dueAt: dueAt || null,                          // ISO 字符串
    remindBefore: Number.isFinite(remindBefore) ? remindBefore : null,  // 提前 N 分钟
    completed: false,
    completedAt: null,
    createdAt: Date.now(),
  };
  if (!t.title) throw new Error('待办标题不能为空');
  todos.push(t);
  saveJsonArray(todosPath, todos);
  return t;
}

function updateTodo(id, patch) {
  const todos = listTodos();
  const i = todos.findIndex(t => t.id === id);
  if (i < 0) throw new Error('待办不存在');
  todos[i] = { ...todos[i], ...patch };
  saveJsonArray(todosPath, todos);
  return todos[i];
}

function deleteTodo(id) {
  const todos = listTodos().filter(t => t.id !== id);
  saveJsonArray(todosPath, todos);
  return true;
}

function checkTodo(id, completed) {
  return updateTodo(id, {
    completed: !!completed,
    completedAt: completed ? Date.now() : null,
  });
}

// 在未来 windowMinutes 内即将到期、或已过期未完成的（最多返回 N 条）
function upcomingTodos(windowMinutes = 60) {
  const now = Date.now();
  const horizon = now + windowMinutes * 60 * 1000;
  const out = [];
  for (const t of listTodos()) {
    if (t.completed) continue;
    if (!t.dueAt) continue;
    const due = Date.parse(t.dueAt);
    if (Number.isNaN(due)) continue;
    const remind = (t.remindBefore || 0) * 60 * 1000;
    const triggerFrom = due - remind;
    // 提醒触发条件：当前已经到达 triggerFrom（即提前 X 分钟开始提醒）
    if (now >= triggerFrom && due <= horizon + remind) out.push(t);
  }
  return out;
}

// ========== 纪念日 ==========
function listAnniversaries() { return loadJsonArray(annivPath); }

function addAnniversary({ title, type, month, day, year, notes, remindDaysBefore }) {
  const arr = listAnniversaries();
  const t = String(title || '').trim().slice(0, 100);
  if (!t) throw new Error('纪念日标题不能为空');
  const m = parseInt(month, 10), d = parseInt(day, 10);
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) throw new Error('月份/日期不合法');
  const a = {
    id: uid('anniv'),
    title: t,
    type: String(type || '其他').slice(0, 16),
    month: m,
    day: d,
    year: year ? parseInt(year, 10) : null,
    notes: String(notes || '').slice(0, 500),
    remindDaysBefore: Array.isArray(remindDaysBefore) ? remindDaysBefore.map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 60) : [],
    createdAt: Date.now(),
  };
  arr.push(a);
  saveJsonArray(annivPath, arr);
  return a;
}

function updateAnniversary(id, patch) {
  const arr = listAnniversaries();
  const i = arr.findIndex(a => a.id === id);
  if (i < 0) throw new Error('纪念日不存在');
  arr[i] = { ...arr[i], ...patch };
  saveJsonArray(annivPath, arr);
  return arr[i];
}

function deleteAnniversary(id) {
  saveJsonArray(annivPath, listAnniversaries().filter(a => a.id !== id));
  return true;
}

// 今天是哪些纪念日 + 距离哪些纪念日还有 N 天（其中 N 在 remindDaysBefore 集合）
function todaysAnniversaries() {
  const today = new Date();
  const m = today.getMonth() + 1, d = today.getDate();
  const out = [];
  for (const a of listAnniversaries()) {
    if (a.month === m && a.day === d) {
      const yearsPassed = a.year ? today.getFullYear() - a.year : null;
      out.push({ ...a, isToday: true, yearsPassed });
    }
  }
  return out;
}

function upcomingAnniversaries() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = [];
  for (const a of listAnniversaries()) {
    if (!a.remindDaysBefore || !a.remindDaysBefore.length) continue;
    // 计算今年（或明年）下一次该日期与今天相差几天
    const thisYear = new Date(today.getFullYear(), a.month - 1, a.day);
    const target = thisYear < today
      ? new Date(today.getFullYear() + 1, a.month - 1, a.day)
      : thisYear;
    const diffDays = Math.round((target - today) / (24 * 60 * 60 * 1000));
    if (a.remindDaysBefore.includes(diffDays) && diffDays > 0) {
      out.push({ ...a, isToday: false, daysUntil: diffDays });
    }
  }
  return out;
}

module.exports = {
  init,
  listTodos, addTodo, updateTodo, deleteTodo, checkTodo, upcomingTodos,
  listAnniversaries, addAnniversary, updateAnniversary, deleteAnniversary,
  todaysAnniversaries, upcomingAnniversaries,
};
