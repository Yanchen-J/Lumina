const { contextBridge, ipcRenderer } = require('electron');

// pet 窗口 API
contextBridge.exposeInMainWorld('petAPI', {
  quit: () => ipcRenderer.send('pet:quit'),
  hide: () => ipcRenderer.send('pet:hide'),
  focus: () => ipcRenderer.send('pet:focus'),
  openSettings: () => ipcRenderer.send('pet:open-settings'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet:set-ignore-mouse', ignore),
  dragStart: (mx, my) => ipcRenderer.send('pet:drag-start', { mx, my }),
  dragMove: (mx, my) => ipcRenderer.send('pet:drag-move', { mx, my }),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  resizeWindow: (width, height) => ipcRenderer.send('pet:resize-window', { width, height }),
  onActivity: (cb) => ipcRenderer.on('activity:update', (_e, data) => cb(data)),
  onSettingsUpdate: (cb) => ipcRenderer.on('settings:update', (_e, data) => cb(data)),
  onModelSwitched: (cb) => ipcRenderer.on('models:switched', (_e, id) => cb(id)),

  listModels: () => ipcRenderer.invoke('models:list'),
  switchModel: (id) => ipcRenderer.invoke('models:switch', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  markGuideSeen: () => ipcRenderer.invoke('settings:save', { firstRun: false }),
  llmChat: (messages, personality, modelId, reqId) => ipcRenderer.invoke('llm:chat', { messages, personality, modelId, reqId }),
  llmAbort: (reqId) => ipcRenderer.send('llm:abort', reqId),

  // 长期记忆
  getMemory: (modelId) => ipcRenderer.invoke('memory:get', modelId),
  clearMemory: (modelId, scope) => ipcRenderer.invoke('memory:clear', { modelId, scope }),
  extractMemoryNow: (modelId, conversation) => ipcRenderer.invoke('memory:extract-now', { modelId, conversation }),
  consolidateMemory: (modelId) => ipcRenderer.invoke('memory:consolidate', modelId),
  onMemoryUpdated: (cb) => ipcRenderer.on('memory:updated', (_e, modelId) => cb(modelId)),

  // 日记
  diaryExistsToday: () => ipcRenderer.invoke('diary:exists-today'),
  getDiary: (date) => ipcRenderer.invoke('diary:get', date),
  generateDiary: (modelId, ctx, overwrite) => ipcRenderer.invoke('diary:generate', { modelId, ctx, overwrite }),
  openDiaryWindow: () => ipcRenderer.send('diary:open-window'),
  onDiaryUpdated: (cb) => ipcRenderer.on('diary:updated', () => cb()),

  // 便签 & 纪念日（pet 窗口主要用于查询触发提醒，不做编辑）
  openReminders: (tab) => ipcRenderer.send('reminders:open-window', tab),
  upcomingTodos: (windowMinutes) => ipcRenderer.invoke('todos:upcoming', windowMinutes),
  todaysAnniv: () => ipcRenderer.invoke('anniv:today'),
  upcomingAnniv: () => ipcRenderer.invoke('anniv:upcoming'),
  addTodo: (data) => ipcRenderer.invoke('todos:add', data),
  onRemindersUpdated: (cb) => ipcRenderer.on('reminders:updated', () => cb()),

  // 口袋图鉴
  openCollection: () => ipcRenderer.send('collection:open-window'),
  cacheChat: (messages) => ipcRenderer.send('chat:cache', messages),
  getChatHistory: (modelId) => ipcRenderer.invoke('chat:get-history', modelId),

  // 塔罗
  openTarot: () => ipcRenderer.send('tarot:open-window'),
  getTarotToday: (modelId) => ipcRenderer.invoke('tarot:get-today', modelId),
  drawTarot: (modelId, force) => ipcRenderer.invoke('tarot:draw', { modelId, force }),
});

// 设置窗口 API
contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (next) => ipcRenderer.invoke('settings:save', next),
  testLLM: () => ipcRenderer.invoke('llm:test'),
  getMemory: (modelId) => ipcRenderer.invoke('memory:get', modelId),
  clearMemory: (modelId, scope) => ipcRenderer.invoke('memory:clear', { modelId, scope }),
  consolidateMemory: (modelId) => ipcRenderer.invoke('memory:consolidate', modelId),
  openDiaryWindow: () => ipcRenderer.send('diary:open-window'),

  // 数据管理（设置窗口用）
  exportData: () => ipcRenderer.invoke('data:export'),
  resetData: () => ipcRenderer.invoke('data:reset'),

  listModels: () => ipcRenderer.invoke('models:list'),
  updateModelConfig: (modelId, patch) => ipcRenderer.invoke('models:update-config', { modelId, patch }),
  resetPersonality: (modelId) => ipcRenderer.invoke('models:reset-personality', modelId),
  getDefaultModelConfig: () => ipcRenderer.invoke('models:default-config'),

  // 关于
  aboutInfo: () => ipcRenderer.invoke('about:info'),
  openUserDataFolder: () => ipcRenderer.send('shell:open-userdata'),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
});

// 便签 & 纪念日 窗口 API
contextBridge.exposeInMainWorld('remindersAPI', {
  listTodos: () => ipcRenderer.invoke('todos:list'),
  addTodo: (data) => ipcRenderer.invoke('todos:add', data),
  updateTodo: (id, patch) => ipcRenderer.invoke('todos:update', { id, patch }),
  deleteTodo: (id) => ipcRenderer.invoke('todos:delete', id),
  checkTodo: (id, completed) => ipcRenderer.invoke('todos:check', { id, completed }),
  listAnniv: () => ipcRenderer.invoke('anniv:list'),
  addAnniv: (data) => ipcRenderer.invoke('anniv:add', data),
  updateAnniv: (id, patch) => ipcRenderer.invoke('anniv:update', { id, patch }),
  deleteAnniv: (id) => ipcRenderer.invoke('anniv:delete', id),
  onSwitchTab: (cb) => ipcRenderer.on('reminders:switch-tab', (_e, tab) => cb(tab)),
});

// 日记窗口 API
contextBridge.exposeInMainWorld('diaryAPI', {
  listAll: () => ipcRenderer.invoke('diary:list-all'),
  get: (date) => ipcRenderer.invoke('diary:get', date),
  emojis: () => ipcRenderer.invoke('diary:emojis'),
  saveUser: (date, body, mood, emoji) => ipcRenderer.invoke('diary:save-user', { date, body, mood, emoji }),
  deleteUser: (date) => ipcRenderer.invoke('diary:delete-user', date),
  onUpdated: (cb) => ipcRenderer.on('diary:updated', () => cb()),
  listModels: () => ipcRenderer.invoke('models:list'),
});

// 口袋图鉴窗口 API
contextBridge.exposeInMainWorld('collectionAPI', {
  list: () => ipcRenderer.invoke('collection:list'),
  get: (id) => ipcRenderer.invoke('collection:get', id),
  rebuild: (recentChat) => ipcRenderer.invoke('collection:rebuild', { recentChat }),
  clear: () => ipcRenderer.invoke('collection:clear'),
  deleteItem: (id) => ipcRenderer.invoke('collection:delete', id),
  onUpdated: (cb) => ipcRenderer.on('collection:updated', () => cb()),
});
