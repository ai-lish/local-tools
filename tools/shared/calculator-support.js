import { REPORT_CONFIG, REPORT_ENABLED } from './report-config.js';

const CATEGORY_OPTIONS = Object.freeze({
  feature: {
    label: '功能',
    details: [
      ['basic', '基本運算'], ['fraction', '分數與小數'], ['trigonometry', '三角與角度'],
      ['complex', '複數'], ['statistics', '統計'], ['programming', '程式'], ['other', '其他功能']
    ]
  },
  button: {
    label: '按鈕',
    details: [
      ['no-response', '按鍵無反應'], ['label-position', '按鍵標示或位置'],
      ['keyboard-map', '電腦鍵盤對應'], ['mode-key', '模式鍵'], ['other', '其他按鍵']
    ]
  },
  display: {
    label: '顯示',
    details: [
      ['digit-symbol', '數字或符號不清'], ['result-format', '結果格式'],
      ['mode-indicator', '模式指示'], ['mobile-layout', '手機排版'], ['other', '其他顯示']
    ]
  },
  calculation: {
    label: '運算',
    details: [
      ['wrong-result', '結果不正確'], ['edge-case', '邊界或特殊值'],
      ['error-message', '錯誤提示'], ['ans-memory', 'Ans 或記憶'], ['other', '其他運算']
    ]
  }
});

const STATUS_LABELS = Object.freeze({
  received: '已收到', processing: '處理中', fixed: '已修正'
});
const KEY_EVENT = 'local-tools-calculator-key';
const REPLAY_EVENT = 'local-tools-calculator-replay';
const BUFFER_LIMIT = 200;
const MAX_SUMMARY = 160;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text, className = '') {
  const element = makeElement('button', className, text);
  element.type = 'button';
  return element;
}

function addLabel(parent, text, control) {
  const label = makeElement('label', 'calc-support-field');
  label.append(makeElement('span', '', text), control);
  parent.append(label);
  return label;
}

function loadStylesheet() {
  const existing = document.querySelector('link[data-calculator-support-style]');
  if (existing) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./calculator-support.css', import.meta.url).href;
    link.dataset.calculatorSupportStyle = 'true';
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.append(link);
  });
}

function selectedLabel(category, subcategory) {
  return CATEGORY_OPTIONS[category]?.details.find(([value]) => value === subcategory)?.[1] || '';
}

class KeyRing {
  constructor(capacity) {
    this.capacity = capacity;
    this.values = new Array(capacity);
    this.next = 0;
    this.length = 0;
  }

  clear() {
    this.values.fill(undefined);
    this.next = 0;
    this.length = 0;
  }

  push(value) {
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    this.length = Math.min(this.capacity, this.length + 1);
  }

  toArray() {
    const start = (this.next - this.length + this.capacity) % this.capacity;
    return Array.from({ length: this.length }, (_, index) =>
      this.values[(start + index) % this.capacity]
    );
  }
}

export async function installCalculatorSupport(options) {
  await loadStylesheet();
  const {
    model, shell, canvas, buttons,
    laserButton, reportButton
  } = options;
  const enabled = REPORT_ENABLED;
  const sequence = new KeyRing(BUFFER_LIMIT);
  const recordedSequence = new KeyRing(BUFFER_LIMIT);
  const moduleStart = performance.now();
  let recordingStart = null;
  let recording = false;
  let hasRecording = false;
  let replaying = false;
  let replayGeneration = 0;
  let teacherMode = false;
  let laserCanvas;
  let laserContext;
  let drawHandle = 0;
  let highlightedButton;
  let highlightTimer;
  let pendingAction = null;
  let gisLoaded = false;
  let gisInitialized = false;
  let replayUiTimer;

  const laserControls = makeElement('aside', 'calc-laser-controls');
  laserControls.hidden = true;
  laserControls.setAttribute('aria-label', '老師模式控制');
  const teacherLabel = makeElement('strong', '', '老師模式');
  const sequenceToggle = document.createElement('input');
  sequenceToggle.type = 'checkbox';
  const sequenceLabel = makeElement('label', 'calc-laser-sequence-toggle');
  sequenceLabel.append(sequenceToggle, document.createTextNode('顯示最近按鍵序列'));
  const sequenceOutput = makeElement('output', 'calc-laser-sequence');
  sequenceOutput.hidden = true;
  laserControls.append(teacherLabel, sequenceLabel, sequenceOutput);
  document.getElementById('utility-nav').after(laserControls);

  const backdrop = makeElement('div', 'calc-support-backdrop');
  backdrop.hidden = true;
  const dialog = makeElement('section', 'calc-support-dialog');
  dialog.id = 'calculator-support-dialog';
  reportButton.setAttribute('aria-controls', dialog.id);
  reportButton.setAttribute('aria-expanded', 'false');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'calc-support-title');
  const header = makeElement('header', 'calc-support-header');
  const heading = makeElement('h2', '', '計算機回報問題');
  heading.id = 'calc-support-title';
  const closeButton = button('關閉', 'calc-support-close');
  closeButton.setAttribute('aria-label', '關閉回報問題面板');
  header.append(heading, closeButton);
  const privacy = makeElement('p', 'calc-support-privacy',
    '瀏覽及查看列表不需登入。提交或投票前需 Google 登入；登入電郵只為追溯亂報，僅供老師查看，不會公開。');
  const status = makeElement('p', 'calc-support-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const tabs = makeElement('div', 'calc-support-tabs');
  const listTab = button('現有回報', 'is-active');
  const newTab = button('新增回報');
  listTab.setAttribute('aria-pressed', 'true');
  newTab.setAttribute('aria-pressed', 'false');
  tabs.append(listTab, newTab);
  const listView = makeElement('section', 'calc-support-list-view');
  const reportList = makeElement('div', 'calc-support-list');
  const newView = makeElement('section', 'calc-support-new-view');
  newView.hidden = true;
  const form = makeElement('form', 'calc-support-form');
  form.noValidate = true;

  const category = document.createElement('select');
  category.required = true;
  category.name = 'category';
  const emptyCategory = new Option('選擇問題分類', '');
  category.append(emptyCategory);
  for (const [value, item] of Object.entries(CATEGORY_OPTIONS)) category.add(new Option(item.label, value));
  const subcategory = document.createElement('select');
  subcategory.required = true;
  subcategory.name = 'subcategory';
  subcategory.disabled = true;
  subcategory.add(new Option('先選擇分類', ''));
  addLabel(form, '第一層：問題分類', category);
  addLabel(form, '第二層：細項', subcategory);

  const summary = document.createElement('textarea');
  summary.name = 'summary';
  summary.maxLength = MAX_SUMMARY;
  summary.rows = 3;
  summary.placeholder = '簡述（選填，最多 160 字）';
  summary.setAttribute('aria-label', '簡述，選填，最多 160 字');
  addLabel(form, '補充說明', summary);

  const replaySection = makeElement('section', 'calc-support-replay');
  replaySection.append(makeElement('h3', '', '重演輸入流程'));
  const replayHelp = makeElement('p', '', '提交前，錄影只保存在本頁記憶體，限最近 200 個按鍵 ID 和相對時間；不記姓名或電郵。提交後，回放序列和截圖會存入老師的私人 Google Sheet／Drive，只供老師跟進，不會公開。回放會把按鍵送入目前計算機，開始前可按 AC。');
  const replayActions = makeElement('div', 'calc-support-replay-actions');
  const startRecordingButton = button('開始錄製');
  const stopRecordingButton = button('停止錄製');
  const replayButton = button('回放核對');
  const replayCount = makeElement('output', 'calc-support-replay-count', '未錄製');
  stopRecordingButton.disabled = true;
  replayButton.disabled = true;
  replayActions.append(startRecordingButton, stopRecordingButton, replayButton, replayCount);
  const replayKeyList = makeElement('ol', 'calc-support-replay-keys');
  replaySection.append(replayHelp, replayActions, replayKeyList);
  form.append(replaySection);

  const gisSlot = makeElement('div', 'calc-support-gis-slot');
  gisSlot.hidden = true;
  const gisMessage = makeElement('p', 'calc-support-auth-note');
  gisMessage.hidden = true;
  const submitButton = button('Google 登入並提交', 'calc-support-primary');
  submitButton.disabled = !enabled;
  const configurationNote = makeElement('p', 'calc-support-config-note',
    enabled ? '' : '回報功能尚未啟用：Apps Script 網址及 Google Client ID 尚未設定；提交和投票已停用。雷射筆不受影響。');
  if (enabled) configurationNote.hidden = true;
  form.append(configurationNote, submitButton);
  newView.append(form);
  listView.append(reportList);
  dialog.append(header, privacy, status, tabs, gisMessage, gisSlot, listView, newView);
  backdrop.append(dialog);
  document.body.append(backdrop);

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function updateSequence() {
    const values = sequence.toArray().slice(-12).map(({ id }) => id);
    sequenceOutput.textContent = values.length ? `最近按鍵：${values.join(' · ')}` : '最近按鍵：尚未輸入';
  }

  function updateReplayList() {
    const items = recordedSequence.toArray();
    replayCount.textContent = recording ? `錄製中 · ${items.length}/${BUFFER_LIMIT}` :
      hasRecording ? `已錄製 ${items.length} 個按鍵` : '未錄製';
    replayKeyList.replaceChildren();
    for (const item of items.slice(-30)) {
      const entry = makeElement('li', '', `${item.id} · ${item.at} ms`);
      replayKeyList.append(entry);
    }
    replayButton.disabled = !hasRecording || recording || replaying;
    startRecordingButton.disabled = recording || replaying;
  }

  function scheduleReplayListUpdate() {
    if (backdrop.hidden || newView.hidden || replayUiTimer) return;
    replayUiTimer = setTimeout(() => {
      replayUiTimer = undefined;
      updateReplayList();
    }, 120);
  }

  window.addEventListener(KEY_EVENT, (event) => {
    const id = event.detail?.id;
    const time = event.detail?.time;
    if (typeof id !== 'string' || id.length > 16 || !Number.isFinite(time) || replaying) return;
    sequence.push({ id, at: Math.max(0, Math.round(time - moduleStart)) });
    if (recording) recordedSequence.push({ id, at: Math.max(0, Math.round(time - recordingStart)) });
    if (teacherMode && sequenceToggle.checked) updateSequence();
    if (recording || hasRecording) scheduleReplayListUpdate();
    if (!teacherMode) return;
    const keyButton = buttons.get(id);
    if (!keyButton) return;
    highlightedButton?.classList.remove('laser-key-highlight');
    clearTimeout(highlightTimer);
    highlightedButton = keyButton;
    keyButton.classList.add('laser-key-highlight');
    highlightTimer = setTimeout(() => {
      keyButton.classList.remove('laser-key-highlight');
      if (highlightedButton === keyButton) highlightedButton = null;
    }, 520);
  });

  function resizeLaserCanvas() {
    if (!laserCanvas) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    laserCanvas.width = Math.round(window.innerWidth * scale);
    laserCanvas.height = Math.round(window.innerHeight * scale);
    laserCanvas.style.width = `${window.innerWidth}px`;
    laserCanvas.style.height = `${window.innerHeight}px`;
    laserContext = laserCanvas.getContext('2d');
    laserContext.setTransform(scale, 0, 0, scale, 0, 0);
  }

  const pointerTrail = [];
  function paintTrail() {
    drawHandle = 0;
    if (!laserContext || !teacherMode) return;
    const now = performance.now();
    while (pointerTrail.length && now - pointerTrail[0].time > 1100) pointerTrail.shift();
    laserContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let index = 1; index < pointerTrail.length; index++) {
      const previous = pointerTrail[index - 1];
      const point = pointerTrail[index];
      const opacity = Math.max(0, 1 - (now - point.time) / 1100);
      laserContext.globalAlpha = opacity;
      laserContext.lineCap = 'round';
      laserContext.lineJoin = 'round';
      laserContext.strokeStyle = '#ffffff';
      laserContext.lineWidth = 11;
      laserContext.beginPath();
      laserContext.moveTo(previous.x, previous.y);
      laserContext.lineTo(point.x, point.y);
      laserContext.stroke();
      laserContext.strokeStyle = '#f0153f';
      laserContext.lineWidth = 6;
      laserContext.beginPath();
      laserContext.moveTo(previous.x, previous.y);
      laserContext.lineTo(point.x, point.y);
      laserContext.stroke();
    }
    laserContext.globalAlpha = 1;
    if (pointerTrail.length) drawHandle = requestAnimationFrame(paintTrail);
  }

  function addPointerPoint(event) {
    if (!teacherMode) return;
    pointerTrail.push({ x: event.clientX, y: event.clientY, time: performance.now() });
    if (pointerTrail.length > 36) pointerTrail.shift();
    if (!drawHandle) drawHandle = requestAnimationFrame(paintTrail);
  }

  function setTeacherMode(active) {
    teacherMode = Boolean(active);
    laserButton.setAttribute('aria-pressed', String(teacherMode));
    laserButton.textContent = teacherMode ? '雷射筆：開' : '雷射筆';
    laserButton.setAttribute('aria-label', teacherMode ? '關閉老師模式雷射筆' : '開啟老師模式雷射筆');
    laserControls.hidden = !teacherMode;
    if (teacherMode && !laserCanvas) {
      laserCanvas = makeElement('canvas', 'calc-laser-overlay');
      laserCanvas.setAttribute('aria-hidden', 'true');
      document.body.append(laserCanvas);
      resizeLaserCanvas();
      window.addEventListener('resize', resizeLaserCanvas, { passive: true });
      window.addEventListener('pointerdown', addPointerPoint, { passive: true });
      window.addEventListener('pointermove', addPointerPoint, { passive: true });
      window.addEventListener('pointerup', addPointerPoint, { passive: true });
    }
    if (!teacherMode) {
      pointerTrail.length = 0;
      highlightedButton?.classList.remove('laser-key-highlight');
      highlightedButton = null;
      laserContext?.clearRect(0, 0, window.innerWidth, window.innerHeight);
      sequenceOutput.hidden = true;
    }
    if (teacherMode) sequenceOutput.hidden = !sequenceToggle.checked;
  }

  sequenceToggle.addEventListener('change', () => {
    sequenceOutput.hidden = !sequenceToggle.checked || !teacherMode;
    if (sequenceToggle.checked) updateSequence();
  });
  function chooseView(view) {
    const isList = view === 'list';
    listView.hidden = !isList;
    newView.hidden = isList;
    listTab.classList.toggle('is-active', isList);
    newTab.classList.toggle('is-active', !isList);
    listTab.setAttribute('aria-pressed', String(isList));
    newTab.setAttribute('aria-pressed', String(!isList));
  }

  function closeReport() {
    backdrop.hidden = true;
    reportButton.setAttribute('aria-expanded', 'false');
  }

  async function refreshReports() {
    if (!enabled) {
      reportList.replaceChildren(makeElement('p', 'calc-support-empty', '回報功能尚未啟用。'));
      return;
    }
    setStatus('正在讀取回報列表……');
    try {
      const response = await fetch(REPORT_CONFIG.webAppUrl, { method: 'GET', cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('LIST_FAILED');
      const result = await response.json();
      if (!result || result.ok !== true || !Array.isArray(result.reports)) throw new Error('LIST_FAILED');
      renderReports(result.reports);
      setStatus(`已載入 ${result.reports.length} 項回報`);
    } catch {
      reportList.replaceChildren(makeElement('p', 'calc-support-empty', '暫時未能連接回報列表；計算機運作不受影響。'));
      setStatus('列表載入失敗或目前離線。', true);
    }
  }

  function renderReports(reports) {
    reportList.replaceChildren();
    const visible = reports.slice(0, 200);
    if (!visible.length) {
      reportList.append(makeElement('p', 'calc-support-empty', '目前沒有已公開的回報。'));
      return;
    }
    for (const report of visible) {
      if (!report || typeof report !== 'object' || typeof report.id !== 'string' || report.id.length > 64) continue;
      const card = makeElement('article', 'calc-support-report-card');
      const title = makeElement('h3', '', `${CATEGORY_OPTIONS[report.category]?.label || '其他'} · ${selectedLabel(report.category, report.subcategory) || '其他'}`);
      const modelLine = makeElement('p', 'calc-support-report-model', typeof report.model === 'string' ? report.model : '');
      const shortDescription = makeElement('p', 'calc-support-report-summary', typeof report.summary === 'string' ? report.summary : '');
      const state = STATUS_LABELS[report.status] || '已收到';
      const version = report.status === 'fixed' && typeof report.fixVersion === 'string' && report.fixVersion
        ? ` · 修正版本 ${report.fixVersion}` : '';
      const stateLine = makeElement('p', 'calc-support-report-state', `狀態：${state}${version}`);
      const vote = button(`我都遇到 · ${Number.isSafeInteger(report.votes) ? report.votes : 0} 票`, 'calc-support-vote');
      vote.disabled = !enabled;
      vote.setAttribute('aria-label', `${title.textContent}；${modelLine.textContent}；我都遇到`);
      vote.addEventListener('click', () => beginAuthentication((credential) => submitVote(report.id, credential)));
      card.append(title, modelLine, shortDescription, stateLine, vote);
      reportList.append(card);
    }
    if (!reportList.childElementCount) reportList.append(makeElement('p', 'calc-support-empty', '目前沒有已公開的回報。'));
  }

  category.addEventListener('change', () => {
    subcategory.replaceChildren(new Option('選擇細項', ''));
    const choices = CATEGORY_OPTIONS[category.value]?.details || [];
    for (const [value, label] of choices) subcategory.add(new Option(label, value));
    subcategory.disabled = !choices.length;
  });

  function setRecording(active) {
    recording = active;
    if (active) {
      recordedSequence.clear();
      recordingStart = performance.now();
      hasRecording = false;
      setStatus('錄製中；只記按鍵 ID 和相對時間。');
    } else if (recordingStart !== null) {
      hasRecording = recordedSequence.length > 0;
      setStatus(hasRecording ? '錄製已停止，可回放或提交。' : '沒有錄到按鍵。');
    }
    startRecordingButton.disabled = recording || replaying;
    stopRecordingButton.disabled = !recording;
    updateReplayList();
  }

  startRecordingButton.addEventListener('click', () => setRecording(true));
  stopRecordingButton.addEventListener('click', () => setRecording(false));

  async function replayKeys() {
    if (!hasRecording || recording || replaying) return;
    const items = recordedSequence.toArray();
    const generation = ++replayGeneration;
    replaying = true;
    updateReplayList();
    setStatus('正在回放輸入流程；按鍵仍經過目前的計算機。');
    let previousTime = 0;
    for (const item of items) {
      if (generation !== replayGeneration) break;
      const delay = Math.max(0, Math.min(1500, item.at - previousTime));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (generation !== replayGeneration) break;
      window.dispatchEvent(new CustomEvent(REPLAY_EVENT, { detail: { id: item.id } }));
      previousTime = item.at;
    }
    replaying = false;
    updateReplayList();
    setStatus(generation === replayGeneration ? '回放完成。' : '回放已停止。');
  }

  replayButton.addEventListener('click', replayKeys);

  function setGISStatus(message, isError = false) {
    gisMessage.className = isError ? 'calc-support-auth-error' : 'calc-support-auth-note';
    gisMessage.textContent = message;
    gisMessage.hidden = false;
    gisSlot.hidden = false;
  }

  function onGoogleCredential(response) {
    const action = pendingAction;
    pendingAction = null;
    gisMessage.hidden = true;
    gisSlot.replaceChildren();
    gisSlot.hidden = true;
    if (!response || typeof response.credential !== 'string' || !action) {
      setGISStatus('Google 登入未完成，請再試一次。', true);
      return;
    }
    Promise.resolve(action(response.credential)).catch(() => {
      setStatus('操作未能完成或目前離線；計算機運作不受影響。', true);
    });
  }

  function renderGoogleButton() {
    if (!window.google?.accounts?.id) throw new Error('GIS_UNAVAILABLE');
    if (!gisInitialized) {
      window.google.accounts.id.initialize({
        client_id: REPORT_CONFIG.googleClientId,
        callback: onGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      gisInitialized = true;
    }
    gisSlot.hidden = false;
    gisSlot.replaceChildren();
    window.google.accounts.id.renderButton(gisSlot, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill' });
  }

  function loadGoogleIdentity() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (gisLoaded) return gisLoaded;
    gisLoaded = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('GIS_LOAD_FAILED'));
      document.head.append(script);
    }).catch((error) => {
      gisLoaded = false;
      throw error;
    });
    return gisLoaded;
  }

  async function beginAuthentication(action) {
    if (!enabled) return;
    pendingAction = action;
    setGISStatus('正在載入 Google 登入元件……');
    try {
      await loadGoogleIdentity();
      renderGoogleButton();
      setGISStatus('請按 Google 登入按鈕確認後繼續。');
    } catch {
      pendingAction = null;
      setGISStatus('Google 登入暫時無法載入；計算機運作不受影響。', true);
    }
  }

  async function sendRequest(payload) {
    const response = await fetch(REPORT_CONFIG.webAppUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new Error(result.error || 'REQUEST_FAILED');
    return result;
  }

  async function submitVote(reportId, idToken) {
    try {
      await sendRequest({ action: 'vote', reportId, idToken });
      setStatus('已記錄一票。');
      await refreshReports();
    } catch (error) {
      setStatus(error.message === 'ALREADY_VOTED' ? '每個登入帳戶對同一項回報只可投一票。' :
        '投票未能完成或目前離線；計算機運作不受影響。', true);
    }
  }

  async function submitIssue(idToken) {
    if (!category.value || !subcategory.value) {
      chooseView('new');
      setStatus('請先選擇問題分類及細項。', true);
      return;
    }
    if (recording) setRecording(false);
    try {
      const { captureCalculatorScreenshot } = await import('./calculator-screenshot.js');
      const screenshot = await captureCalculatorScreenshot({ shell, lcdCanvas: canvas, model });
      const payload = {
        action: 'submit',
        idToken,
        model,
        category: category.value,
        subcategory: subcategory.value,
        summary: summary.value.trim(),
        replay: hasRecording ? recordedSequence.toArray() : [],
        screenshot,
        version: REPORT_CONFIG.version,
        sourceCommit: REPORT_CONFIG.sourceCommit,
        clientTime: new Date().toISOString()
      };
      await sendRequest(payload);
      form.reset();
      subcategory.disabled = true;
      hasRecording = false;
      sequence.clear();
      recordedSequence.clear();
      updateReplayList();
      setStatus('回報已送出，謝謝。');
      chooseView('list');
      await refreshReports();
    } catch {
      setStatus('回報未能完成或目前離線；你可以稍後重試，計算機運作不受影響。', true);
    }
  }

  submitButton.addEventListener('click', () => {
    if (!enabled) return;
    chooseView('new');
    beginAuthentication((credential) => submitIssue(credential));
  });
  form.addEventListener('submit', (event) => event.preventDefault());

  listTab.addEventListener('click', () => chooseView('list'));
  newTab.addEventListener('click', () => chooseView('new'));
  closeButton.addEventListener('click', closeReport);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeReport(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !backdrop.hidden) closeReport(); });
  if (!enabled) {
    submitButton.title = '回報功能尚未啟用：請先設定 Apps Script Web App URL 及 Google Client ID。';
    renderReports([]);
    reportList.replaceChildren(makeElement('p', 'calc-support-empty', '回報功能尚未啟用。'));
  }

  return {
    openReport() {
      backdrop.hidden = false;
      reportButton.setAttribute('aria-expanded', 'true');
      chooseView('list');
      void refreshReports();
    },
    toggleLaser() { setTeacherMode(!teacherMode); },
    closeReport,
    setTeacherMode
  };
}
