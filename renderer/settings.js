const els = {
  enabled: document.getElementById('llm-enabled'),
  provider: document.getElementById('llm-provider'),
  baseUrl: document.getElementById('llm-base-url'),
  baseUrlHint: document.getElementById('base-url-hint'),
  apiKey: document.getElementById('llm-api-key'),
  apiKeyRow: document.getElementById('api-key-row'),
  model: document.getElementById('llm-model'),
  maxTokens: document.getElementById('llm-max-tokens'),
  temperature: document.getElementById('llm-temperature'),
  timeout: document.getElementById('llm-timeout'),
  save: document.getElementById('save-btn'),
  test: document.getElementById('test-btn'),
  result: document.getElementById('result'),

  memEnabled: document.getElementById('mem-enabled'),
  memMax: document.getElementById('mem-max'),
  memEvery: document.getElementById('mem-every'),
  memExtractTokens: document.getElementById('mem-extract-tokens'),
  memConsolidateTokens: document.getElementById('mem-consolidate-tokens'),
  memConsolidate: document.getElementById('mem-consolidate-btn'),
  memClearSpecific: document.getElementById('mem-clear-specific-btn'),
  memClearShared: document.getElementById('mem-clear-shared-btn'),
  memView: document.getElementById('mem-view-btn'),
  memList: document.getElementById('mem-list'),

  diaryAuto: document.getElementById('diary-auto'),
  diaryTime: document.getElementById('diary-time'),
  diaryMaxTokens: document.getElementById('diary-max-tokens'),
  diaryOpen: document.getElementById('diary-open-btn'),

  collectionAuto: document.getElementById('collection-auto'),
  collectionEvery: document.getElementById('collection-every'),
  collectionMaxTokens: document.getElementById('collection-max-tokens'),
  collectionMinSnippets: document.getElementById('collection-min-snippets'),
  collectionMaxSnippets: document.getElementById('collection-max-snippets'),

  voiceMuted: document.getElementById('voice-muted'),
};

let currentModelId = 'Hiyori';

function reflectProvider() {
  const p = els.provider.value;
  if (p === 'ollama') {
    els.baseUrl.placeholder = 'http://localhost:11434';
    els.baseUrlHint.textContent = '本地 Ollama 默认地址。需先 ollama pull <model>。';
    els.apiKeyRow.style.display = 'none';
  } else {
    els.baseUrl.placeholder = 'https://api.deepseek.com 或 https://api.openai.com';
    els.baseUrlHint.textContent = '兼容 OpenAI Chat Completions 协议的服务。';
    els.apiKeyRow.style.display = '';
  }
}

async function load() {
  const s = await window.settingsAPI.get();
  currentModelId = s.currentModel || 'Hiyori';
  els.enabled.checked = !!s.llm.enabled;
  els.provider.value = s.llm.provider || 'ollama';
  els.baseUrl.value = s.llm.baseUrl || '';
  els.apiKey.value = s.llm.apiKey || '';
  els.model.value = s.llm.model || '';
  els.maxTokens.value = s.llm.maxTokens || 200;
  els.temperature.value = s.llm.temperature ?? 0.8;
  els.timeout.value = s.llm.timeoutSeconds || 60;

  const m = s.memory || {};
  els.memEnabled.checked = !!m.enabled;
  els.memMax.value = m.maxFacts || 30;
  els.memEvery.value = m.extractEvery || 8;
  els.memExtractTokens.value = m.extractMaxTokens || 1000;
  els.memConsolidateTokens.value = m.consolidateMaxTokens || 1500;

  const d = s.diary || {};
  els.diaryAuto.checked = !!d.autoGenerate;
  els.diaryTime.value = d.autoGenerateTime || '22:30';
  els.diaryMaxTokens.value = d.maxTokens || 1500;

  const c = s.collection || {};
  els.collectionAuto.checked = !!c.autoGenerate;
  els.collectionEvery.value = c.autoEveryNTurns || 20;
  els.collectionMaxTokens.value = c.maxTokens || 2500;
  els.collectionMinSnippets.value = c.minSnippets || 1;
  els.collectionMaxSnippets.value = c.maxSnippets || 3;

  const v = s.voice || {};
  els.voiceMuted.checked = !!v.muted;

  reflectProvider();
}

function collect() {
  return {
    llm: {
      enabled: els.enabled.checked,
      provider: els.provider.value,
      baseUrl: els.baseUrl.value.trim(),
      apiKey: els.apiKey.value.trim(),
      model: els.model.value.trim(),
      maxTokens: parseInt(els.maxTokens.value, 10) || 200,
      temperature: parseFloat(els.temperature.value),
      timeoutSeconds: parseInt(els.timeout.value, 10) || 60,
    },
    memory: {
      enabled: els.memEnabled.checked,
      maxFacts: parseInt(els.memMax.value, 10) || 30,
      extractEvery: parseInt(els.memEvery.value, 10) || 8,
      extractMaxTokens: parseInt(els.memExtractTokens.value, 10) || 1000,
      consolidateMaxTokens: parseInt(els.memConsolidateTokens.value, 10) || 1500,
    },
    diary: {
      autoGenerate: els.diaryAuto.checked,
      autoGenerateTime: els.diaryTime.value || '22:30',
      maxTokens: parseInt(els.diaryMaxTokens.value, 10) || 1500,
    },
    collection: {
      autoGenerate: els.collectionAuto.checked,
      autoEveryNTurns: parseInt(els.collectionEvery.value, 10) || 20,
      maxTokens: parseInt(els.collectionMaxTokens.value, 10) || 2500,
      minSnippets: parseInt(els.collectionMinSnippets.value, 10) || 1,
      maxSnippets: parseInt(els.collectionMaxSnippets.value, 10) || 3,
    },
    voice: {
      muted: els.voiceMuted.checked,
    },
  };
}

function showResult(text, error = false) {
  els.result.textContent = text;
  els.result.classList.toggle('error', error);
}

async function renderMemory() {
  els.memList.classList.add('visible');
  els.memList.innerHTML = '加载中...';
  try {
    const mem = await window.settingsAPI.getMemory(currentModelId);
    const shared = (mem && mem.shared && mem.shared.facts) || [];
    const specific = (mem && mem.specific && mem.specific.facts) || [];
    if (!shared.length && !specific.length) {
      els.memList.innerHTML = '<div class="mem-empty">还没有记忆。开启后聊一会儿就会自动积累~</div>';
      return;
    }
    els.memList.innerHTML = '';
    if (shared.length) {
      const h = document.createElement('div');
      h.className = 'mem-item';
      h.style.fontWeight = 'bold';
      h.style.color = '#c97099';
      h.textContent = '跨角色共享 (' + shared.length + ' 条)';
      els.memList.appendChild(h);
      for (const f of shared) {
        const it = document.createElement('div');
        it.className = 'mem-item';
        it.textContent = '· ' + f.text;
        els.memList.appendChild(it);
      }
    }
    if (specific.length) {
      const h = document.createElement('div');
      h.className = 'mem-item';
      h.style.fontWeight = 'bold';
      h.style.color = '#b04080';
      h.style.marginTop = '6px';
      h.textContent = currentModelId + ' 特别记得 (' + specific.length + ' 条)';
      els.memList.appendChild(h);
      for (const f of specific) {
        const it = document.createElement('div');
        it.className = 'mem-item';
        it.textContent = '· ' + f.text;
        els.memList.appendChild(it);
      }
    }
  } catch (e) {
    els.memList.innerHTML = '<div class="mem-empty">读取失败：' + (e.message || e) + '</div>';
  }
}

els.provider.addEventListener('change', reflectProvider);

// ========== 自动保存 ==========
let saveTimer = null;
let lastSavedAt = 0;
let isLoading = true;

async function autoSave() {
  if (isLoading) return;
  try {
    await window.settingsAPI.save(collect());
    lastSavedAt = Date.now();
    showResult('自动保存 ✓');
    setTimeout(() => {
      // 仅当没有更新覆盖时才清掉
      if (Date.now() - lastSavedAt > 1500) showResult('');
    }, 1800);
  } catch (e) {
    showResult('保存失败：' + (e.message || e), true);
  }
}

function scheduleAutoSave() {
  if (isLoading) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(autoSave, 400);   // debounce
}

// 给所有可填写控件挂监听
[
  els.enabled, els.provider, els.baseUrl, els.apiKey, els.model,
  els.maxTokens, els.temperature, els.timeout,
  els.memEnabled, els.memMax, els.memEvery,
  els.memExtractTokens, els.memConsolidateTokens,
  els.diaryAuto, els.diaryTime, els.diaryMaxTokens,
  els.collectionAuto, els.collectionEvery, els.collectionMaxTokens,
  els.collectionMinSnippets, els.collectionMaxSnippets,
  els.voiceMuted,
].forEach(el => {
  if (!el) return;
  el.addEventListener('input', scheduleAutoSave);
  el.addEventListener('change', scheduleAutoSave);
});

// 显式保存按钮：立即保存
els.save.addEventListener('click', async () => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    await window.settingsAPI.save(collect());
    showResult('已保存 ✓');
    setTimeout(() => showResult(''), 1800);
  } catch (e) {
    showResult('保存失败：' + (e.message || e), true);
  }
});

els.test.addEventListener('click', async () => {
  showResult('测试中...');
  try {
    await window.settingsAPI.save(collect());
    const reply = await window.settingsAPI.testLLM();
    showResult('✓ 已连接：' + (reply || '').slice(0, 60));
  } catch (e) {
    showResult('✗ ' + (e.message || String(e)), true);
  }
});

els.memView.addEventListener('click', renderMemory);
els.memConsolidate.addEventListener('click', async () => {
  els.memConsolidate.disabled = true;
  const originalText = els.memConsolidate.textContent;
  els.memConsolidate.textContent = '整理中...';
  try {
    const r = await window.settingsAPI.consolidateMemory(currentModelId);
    showResult(`整理完成 共享 ${r.before.shared}→${r.after.shared}，当前角色 ${r.before.specific}→${r.after.specific}`);
    setTimeout(() => showResult(''), 4000);
    renderMemory();
  } catch (e) {
    showResult('整理失败：' + (e.message || e), true);
  } finally {
    els.memConsolidate.disabled = false;
    els.memConsolidate.textContent = originalText;
  }
});
els.memClearSpecific.addEventListener('click', async () => {
  if (!confirm('确定清空 ' + currentModelId + ' 的专属记忆？此操作不可恢复。')) return;
  await window.settingsAPI.clearMemory(currentModelId, 'specific');
  renderMemory();
});
els.memClearShared.addEventListener('click', async () => {
  if (!confirm('确定清空跨角色共享记忆？所有角色都会受影响，此操作不可恢复。')) return;
  await window.settingsAPI.clearMemory(currentModelId, 'shared');
  renderMemory();
});

els.diaryOpen.addEventListener('click', () => {
  window.settingsAPI.openDiaryWindow();
});

// 数据管理
const dataExportBtn = document.getElementById('data-export-btn');
const dataResetBtn = document.getElementById('data-reset-btn');
if (dataExportBtn) {
  dataExportBtn.addEventListener('click', async () => {
    dataExportBtn.disabled = true;
    const orig = dataExportBtn.textContent;
    dataExportBtn.textContent = '导出中...';
    try {
      const r = await window.settingsAPI.exportData();
      if (r.canceled) {
        showResult('已取消导出');
      } else {
        const sizeMb = (r.size / 1024 / 1024).toFixed(2);
        showResult(`已导出 ${sizeMb} MB → ${r.filePath}`);
      }
    } catch (e) {
      showResult('导出失败：' + (e.message || e), true);
    } finally {
      dataExportBtn.disabled = false;
      dataExportBtn.textContent = orig;
      setTimeout(() => showResult(''), 5000);
    }
  });
}
if (dataResetBtn) {
  dataResetBtn.addEventListener('click', async () => {
    dataResetBtn.disabled = true;
    try {
      const r = await window.settingsAPI.resetData();
      if (r.canceled) {
        showResult('已取消');
      } else {
        showResult(`已重置 ${r.count} 项数据，2 秒后刷新...`);
        setTimeout(() => location.reload(), 2000);
      }
    } catch (e) {
      showResult('重置失败：' + (e.message || e), true);
    } finally {
      dataResetBtn.disabled = false;
      setTimeout(() => showResult(''), 4000);
    }
  });
}

// 关于
(async () => {
  try {
    const info = await window.settingsAPI.aboutInfo();
    const aboutInfo = document.getElementById('about-info');
    if (aboutInfo && info) {
      aboutInfo.innerHTML = `Desktop Pet Live2D <b>v${info.version}</b> · MIT License<br>
        <span style="color:#aa6688">Electron ${info.electron} · Node ${info.node} · ${info.platform}-${info.arch}</span><br>
        <a href="#" id="about-open-folder">📂 打开数据目录</a> · <a href="#" id="about-open-repo">🐙 GitHub 仓库</a>`;
      const openFolder = document.getElementById('about-open-folder');
      const openRepo = document.getElementById('about-open-repo');
      if (openFolder) openFolder.addEventListener('click', (e) => {
        e.preventDefault();
        window.settingsAPI.openUserDataFolder();
      });
      if (openRepo) openRepo.addEventListener('click', (e) => {
        e.preventDefault();
        // 占位：发布前替换成真实仓库 URL
        window.settingsAPI.openExternal('https://github.com/');
      });
    }
  } catch (e) {}
})();

(async () => {
  await load();
  await renderCharacters();
  isLoading = false;
})();

// ========== 角色性格编辑 ==========
async function renderCharacters() {
  const wrap = document.getElementById('characters-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  let chars = [];
  try {
    chars = await window.settingsAPI.listModels();
  } catch (e) {
    wrap.innerHTML = '<div class="hint">加载角色列表失败：' + (e.message || e) + '</div>';
    return;
  }
  if (!chars.length) {
    wrap.innerHTML = '<div class="hint">还没有角色。</div>';
    return;
  }
  let defaultCfg = null;
  try { defaultCfg = await window.settingsAPI.getDefaultModelConfig(); } catch (e) {}

  for (const ch of chars) {
    wrap.appendChild(renderCharCard(ch, defaultCfg));
  }
}

function renderCharCard(ch, defaultCfg) {
  const card = document.createElement('div');
  card.className = 'char-card';

  // header
  const head = document.createElement('div');
  head.className = 'char-card-head';
  const name = document.createElement('div');
  const nameSpan = document.createElement('span');
  nameSpan.className = 'char-name';
  nameSpan.textContent = ch.config.displayName || ch.id;
  const idSpan = document.createElement('span');
  idSpan.className = 'char-id';
  idSpan.textContent = '(' + ch.id + ')';
  name.appendChild(nameSpan);
  name.appendChild(idSpan);
  head.appendChild(name);
  card.appendChild(head);

  // personality
  const pField = document.createElement('div');
  pField.className = 'field';
  const pLabel = document.createElement('label');
  pLabel.textContent = '性格 (system prompt)';
  const pArea = document.createElement('textarea');
  pArea.value = ch.config.personality || '';
  pArea.placeholder = (defaultCfg && defaultCfg.personality) || '';
  pField.appendChild(pLabel);
  pField.appendChild(pArea);
  card.appendChild(pField);

  // memoryFocus
  const mField = document.createElement('div');
  mField.className = 'field';
  const mLabel = document.createElement('label');
  mLabel.textContent = '记忆关注重点 (memoryFocus，决定该角色记什么)';
  const mInput = document.createElement('input');
  mInput.type = 'text';
  mInput.value = ch.config.memoryFocus || '';
  mInput.placeholder = '例：关注主人的甜食偏好、睡眠、家人...';
  mField.appendChild(mLabel);
  mField.appendChild(mInput);
  card.appendChild(mField);

  // 操作行
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const status = document.createElement('span');
  status.className = 'save-status';
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '重置默认';
  actions.appendChild(status);
  actions.appendChild(resetBtn);
  card.appendChild(actions);

  // 自动保存（debounce 600ms）
  let timer = null;
  function scheduleSave() {
    if (timer) clearTimeout(timer);
    status.textContent = '...';
    status.classList.remove('error');
    timer = setTimeout(async () => {
      try {
        await window.settingsAPI.updateModelConfig(ch.id, {
          personality: pArea.value,
          memoryFocus: mInput.value.trim(),
        });
        status.textContent = '已保存 ✓';
        setTimeout(() => { if (status.textContent === '已保存 ✓') status.textContent = ''; }, 1500);
      } catch (e) {
        status.textContent = '保存失败：' + (e.message || e);
        status.classList.add('error');
      }
    }, 600);
  }
  pArea.addEventListener('input', scheduleSave);
  mInput.addEventListener('input', scheduleSave);

  resetBtn.addEventListener('click', async () => {
    if (!confirm('重置 ' + (ch.config.displayName || ch.id) + ' 的性格和记忆关注重点为默认？')) return;
    try {
      await window.settingsAPI.resetPersonality(ch.id);
      pArea.value = (defaultCfg && defaultCfg.personality) || '';
      mInput.value = '';
      status.textContent = '已重置';
      setTimeout(() => { status.textContent = ''; }, 1500);
    } catch (e) {
      status.textContent = '重置失败：' + (e.message || e);
      status.classList.add('error');
    }
  });

  return card;
}
