(function (global) {
  'use strict';

  var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
  var UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
  var BACKUP_PREFIX = '謝師恩完整備份_';
  var DRIVE_BACKUP_PAUSED = true;
  var DRIVE_PAUSED_MESSAGE = 'Google Drive 備份、雲端清單及載入暫停中；Google 登入仍可使用。';
  var MAX_BACKUP_BYTES = 200 * 1024 * 1024;
  var token = '';
  var tokenEmail = '';
  var backups = [];
  var backupsTruncated = false;
  var busy = false;
  var authPersistenceReady = false;
  var els = {};

  function byId(id) { return document.getElementById(id); }
  function normalizedEmail(value) { return String(value || '').trim().toLowerCase(); }

  function setStatus(message, isError) {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.classList.toggle('error', Boolean(isError));
    els.status.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  }

  function currentAuthState() {
    return global.AuthState && typeof global.AuthState.get === 'function'
      ? global.AuthState.get()
      : { state: 'unavailable', role: 'guest', user: null };
  }

  function isTeacherAuthorized() {
    var state = currentAuthState();
    return state.role === 'teacher' && state.user && state.user.email;
  }

  function setBusy(value) {
    busy = Boolean(value);
    if (els.connect) {
      els.connect.disabled = busy || !authPersistenceReady;
      els.connect.textContent = DRIVE_BACKUP_PAUSED ? 'Google 登入' : '連接／重新授權 Google Drive';
    }
    if (els.upload) els.upload.disabled = busy || DRIVE_BACKUP_PAUSED || !token || !isTeacherAuthorized();
    if (els.refresh) els.refresh.disabled = busy || DRIVE_BACKUP_PAUSED || !token || !isTeacherAuthorized();
    if (els.select) els.select.disabled = busy || DRIVE_BACKUP_PAUSED || !token || !isTeacherAuthorized() || !backups.length;
    if (els.load) els.load.disabled = busy || DRIVE_BACKUP_PAUSED || !token || !isTeacherAuthorized() || !els.select || !els.select.value;
  }

  function updateAuthState(state) {
    var email = state && state.user ? normalizedEmail(state.user.email) : '';
    if (token && (!email || email !== tokenEmail || state.role !== 'teacher')) {
      token = '';
      tokenEmail = '';
      backups = [];
      backupsTruncated = false;
      renderBackupOptions_();
    }
    if (token && email === tokenEmail && state.role === 'teacher') {
      setStatus('Google 已登入：' + email + '。' + (DRIVE_BACKUP_PAUSED ? DRIVE_PAUSED_MESSAGE : '雲端備份只會在你按下上載時建立。'), false);
    } else if (state && state.role === 'teacher' && email) {
      setStatus('已登入教師帳戶：' + email + '。' + (DRIVE_BACKUP_PAUSED ? DRIVE_PAUSED_MESSAGE : '請連接 Google Drive 以授權備份。'), false);
    } else if (state && state.state === 'loading') {
      setStatus('正在檢查 AI-Learning 共用登入…', false);
    } else if (state && state.user) {
      setStatus('此 Google 帳戶未獲教師工具授權；請使用已授權的教師帳戶。', true);
    } else if (state && state.state === 'unavailable') {
      setStatus('共用登入未能載入。請檢查網絡，或稍後重新整理。', true);
    } else {
      setStatus('尚未登入。按「連接／重新授權 Google Drive」仍可登入。' + (DRIVE_BACKUP_PAUSED ? ' ' + DRIVE_PAUSED_MESSAGE : ''), false);
    }
    setBusy(busy);
  }

  function firebaseAuth_() {
    if (!global.firebase || !global.FIREBASE_CONFIG || !global.AuthState) {
      throw new Error('AI-Learning 共用登入尚未載入；請檢查網絡後重新整理。');
    }
    if (!global.firebase.apps || !global.firebase.apps.length) {
      global.firebase.initializeApp(global.FIREBASE_CONFIG);
    }
    return global.firebase.auth();
  }

  function prepareAuthPersistence_() {
    setBusy(busy);
    var ready;
    try {
      var auth = firebaseAuth_();
      if (typeof global.AuthState.whenPersistenceReady === 'function') {
        ready = global.AuthState.whenPersistenceReady();
      } else {
        // Older shared AuthState versions still use the same LOCAL persistence.
        try {
          ready = auth.setPersistence(global.firebase.auth.Auth.Persistence.LOCAL);
        } catch (error) {
          ready = Promise.resolve(false);
        }
      }
    } catch (error) {
      setStatus(error.message || 'AI-Learning 共用登入尚未就緒。', true);
      return;
    }
    Promise.resolve(ready).catch(function () { return false; }).then(function () {
      authPersistenceReady = true;
      setBusy(busy);
    });
  }

  function waitForTeacher_(email) {
    var expected = normalizedEmail(email);
    var existing = currentAuthState();
    if (existing.role === 'teacher' && normalizedEmail(existing.user && existing.user.email) === expected) {
      return Promise.resolve(existing);
    }
    return new Promise(function (resolve, reject) {
      var done = false;
      var observedUser = false;
      var off = null;
      var timer = setTimeout(function () {
        finish(false, new Error('未能核實教師帳戶。請確認此帳戶已獲 AI-Learning 教師登入授權。'));
      }, 20000);
      function finish(ok, value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (off) off();
        if (ok) resolve(value);
        else reject(value);
      }
      off = global.AuthState.onChange(function (state) {
        var actual = normalizedEmail(state && state.user && state.user.email);
        if (actual === expected) {
          observedUser = true;
          if (state.role === 'teacher') finish(true, state);
          else if (state.state === 'unavailable') finish(false, new Error('無法核實此帳戶的教師權限。'));
        } else if (observedUser && state && state.state === 'guest') {
          finish(false, new Error('此帳戶未獲 AI-Learning 教師登入授權。'));
        }
      });
      if (done && off) off();
    });
  }

  function authorizeDrive_() {
    if (!authPersistenceReady) return Promise.reject(new Error('登入設定仍在準備，請稍候再試。'));
    setBusy(true);
    setStatus('正在開啟 Google 登入及 Drive 權限確認…', false);
    var auth;
    try {
      auth = firebaseAuth_();
    } catch (error) {
      setBusy(false);
      return Promise.reject(error);
    }
    var provider = new global.firebase.auth.GoogleAuthProvider();
    if (!DRIVE_BACKUP_PAUSED) provider.addScope(DRIVE_SCOPE);
    provider.setCustomParameters({ prompt: 'select_account' });
    var popupResult;
    try {
      // Persistence is prepared before the click so the popup opens in the
      // user-activation task, which is important on mobile browsers.
      popupResult = auth.signInWithPopup(provider);
    } catch (error) {
      popupResult = Promise.reject(error);
    }
    return Promise.resolve(popupResult)
      .then(function (result) {
        var credential = result && result.credential;
        var email = normalizedEmail(result && result.user && result.user.email);
        if (!email) {
          throw new Error('Google 登入沒有回傳帳戶電郵。');
        }
        if (!DRIVE_BACKUP_PAUSED && (!credential || !credential.accessToken)) {
          throw new Error('Google 登入成功，但沒有取得 Drive 權限。請重新連接並接受 Drive 權限要求。');
        }
        setStatus('Google 登入成功，正在核實教師帳戶…', false);
        return waitForTeacher_(email).then(function () {
          if (DRIVE_BACKUP_PAUSED) {
            token = '';
            tokenEmail = '';
            backups = [];
            backupsTruncated = false;
            renderBackupOptions_();
            setStatus('Google 已登入並核實教師帳戶：' + email + '。' + DRIVE_PAUSED_MESSAGE, false);
            return null;
          }
          token = credential.accessToken;
          tokenEmail = email;
          setStatus('Google Drive 已連接：' + email + '。正在讀取此工具的備份…', false);
          return listBackups_(false);
        });
      })
      .then(function () {
        if (token) setStatus(DRIVE_BACKUP_PAUSED ? 'Google 已登入：' + tokenEmail + '。' + DRIVE_PAUSED_MESSAGE : 'Google Drive 已連接：' + tokenEmail + '。', false);
      })
      .catch(function (error) {
        var code = error && error.code;
        if (code === 'auth/popup-blocked') {
          throw new Error('手機瀏覽器阻擋登入視窗。請在 Safari 或 Chrome 直接開啟網站，再按一次連接。');
        }
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          throw new Error('已取消 Google 登入。');
        }
        if (code === 'auth/unauthorized-domain') {
          throw new Error('此網站網域尚未加入 Firebase 授權網域。');
        }
        throw error;
      })
      .catch(function (error) { setStatus(error.message || (DRIVE_BACKUP_PAUSED ? 'Google 登入失敗。' : 'Google Drive 連接失敗。'), true); })
      .finally(function () { setBusy(false); });
  }

  function apiError_(response) {
    return response.text().then(function (body) {
      var message = response.statusText || 'Google Drive 要求失敗。';
      try {
        var parsed = JSON.parse(body);
        if (parsed && parsed.error && parsed.error.message) message = parsed.error.message;
      } catch (error) { /* Keep the HTTP status text. */ }
      if (response.status === 401) {
        token = '';
        tokenEmail = '';
        updateAuthState(currentAuthState());
        message = 'Drive 權限已過期；請重新連接 Google Drive。';
      } else if (response.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(body)) {
        message = 'Google Drive API 尚未在共用 Google Cloud 專案啟用。';
      } else if (response.status === 403 && /insufficient|permission/i.test(body)) {
        message = 'Drive 權限不足；請重新連接並接受 drive.file 權限。';
      }
      return new Error('Google Drive (' + response.status + ')：' + message);
    });
  }

  function authorizedFetch_(url, options) {
    if (!token || !isTeacherAuthorized()) return Promise.reject(new Error('請先連接已授權的教師 Google 帳戶。'));
    var request = Object.assign({}, options || {});
    request.headers = Object.assign({}, request.headers || {}, { Authorization: 'Bearer ' + token });
    return fetch(url, request).then(function (response) {
      if (!response.ok) return apiError_(response).then(function (error) { throw error; });
      return response;
    });
  }

  function renderBackupOptions_() {
    if (!els.select) return;
    els.select.textContent = '';
    if (!backups.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = DRIVE_BACKUP_PAUSED ? '雲端備份清單暫停中' : token ? '尚未找到此工具建立的雲端備份' : '請先連接 Google Drive';
      els.select.appendChild(empty);
    } else {
      backups.forEach(function (file) {
        var option = document.createElement('option');
        option.value = file.id;
        option.textContent = file.name + ' · ' + formatDate_(file.modifiedTime) + ' · ' + formatSize_(Number(file.size) || 0);
        els.select.appendChild(option);
      });
    }
    setBusy(busy);
  }

  function formatDate_(value) {
    if (!value) return '日期不詳';
    var date = new Date(value);
    return isNaN(date.getTime()) ? '日期不詳' : date.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });
  }

  function formatSize_(bytes) {
    if (!bytes) return '大小不詳';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function listBackups_(showMessage) {
    if (!token) return Promise.reject(new Error('請先連接 Google Drive。'));
    var query = "name contains '" + BACKUP_PREFIX + "' and mimeType = 'application/zip' and trashed = false";
    var maxResults = 1000;
    backups = [];
    backupsTruncated = false;
    function readPage_(pageToken) {
      var remaining = maxResults - backups.length;
      var params = new URLSearchParams({
        q: query,
        spaces: 'drive',
        pageSize: String(Math.min(100, remaining)),
        orderBy: 'modifiedTime desc',
        fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)'
      });
      if (pageToken) params.set('pageToken', pageToken);
      return authorizedFetch_(DRIVE_API + '?' + params.toString(), { method: 'GET' })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          if (Array.isArray(data.files)) backups = backups.concat(data.files);
          if (data.nextPageToken && backups.length < maxResults) return readPage_(data.nextPageToken);
          backupsTruncated = Boolean(data.nextPageToken);
          return backups;
        });
    }
    return readPage_(null).then(function () {
        renderBackupOptions_();
        if (showMessage !== false) {
          setStatus(backups.length
            ? '找到 ' + backups.length + (backupsTruncated ? ' 個以上' : ' 個') + '雲端備份；已選最新版本。'
            : 'Drive 已連接。尚未找到備份；可按「上載新完整備份 ZIP」。', false);
        }
        return backups;
      });
  }

  function makeBackupName_() {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return BACKUP_PREFIX + stamp + '.zip';
  }

  function uploadSession_(blob, name) {
    var metadata = JSON.stringify({ name: name, mimeType: 'application/zip' });
    return authorizedFetch_(UPLOAD_API + '?uploadType=resumable&fields=id,name,mimeType,modifiedTime,size,webViewLink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/zip',
        'X-Upload-Content-Length': String(blob.size)
      },
      body: metadata
    }).then(function (response) {
      var location = response.headers.get('Location');
      if (!location) throw new Error('Google Drive 沒有回傳上載工作階段。');
      return uploadChunks_(location, blob);
    });
  }

  function uploadChunks_(sessionUrl, blob) {
    var chunkSize = 8 * 1024 * 1024;
    var offset = 0;
    var retryCount = 0;
    function readNextOffset_(response) {
      var range = response.headers.get('Range') || '';
      var match = range.match(/(?:bytes=)?(\d+)-(\d+)/i);
      return match ? Number(match[2]) + 1 : 0;
    }
    function queryProgress_() {
      return fetch(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': 'bytes */' + blob.size }
      }).then(function (response) {
        if (response.ok) return response.json();
        if (response.status !== 308) throw new Error('無法恢復 Drive 上載；請重新上載備份。');
        offset = readNextOffset_(response);
        return null;
      });
    }
    function sendChunk_() {
      var start = offset;
      var end = Math.min(start + chunkSize, blob.size);
      if (start >= blob.size) return Promise.reject(new Error('Google Drive 上載未完成；請重新上載備份。'));
      setStatus('正在上載完整備份：' + Math.round((start / blob.size) * 100) + '%。請保持此頁開啟。', false);
      return fetch(sessionUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/zip',
          'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + blob.size
        },
        body: blob.slice(start, end)
      }).then(function (response) {
        if (response.status === 308) {
          var next = readNextOffset_(response);
          if (next <= start) {
            if (retryCount >= 2) throw new Error('Google Drive 上載進度沒有前進；請重新上載備份。');
            retryCount += 1;
            return queryProgress_().then(function (completed) {
              if (completed) return completed;
              return sendChunk_();
            });
          }
          offset = next;
          retryCount = 0;
          return sendChunk_();
        }
        if (response.status >= 500) {
          if (retryCount >= 2) return apiError_(response).then(function (error) { throw error; });
          retryCount += 1;
          return queryProgress_().then(function (completed) {
            if (completed) return completed;
            return sendChunk_();
          });
        }
        if (!response.ok) return apiError_(response).then(function (error) { throw error; });
        return response.json();
      }, function (networkError) {
        if (retryCount >= 2) throw networkError;
        retryCount += 1;
        return queryProgress_().then(function (completed) {
          if (completed) return completed;
          return sendChunk_();
        });
      });
    }
    return sendChunk_();
  }

  function uploadBackup_() {
    if (DRIVE_BACKUP_PAUSED) {
      setStatus(DRIVE_PAUSED_MESSAGE, false);
      return;
    }
    if (!global.LIFE_EDU_DRIVE_BRIDGE || typeof global.LIFE_EDU_DRIVE_BRIDGE.createBackupZip !== 'function') {
      setStatus('完整備份功能尚未載入；請重新整理頁面。', true);
      return;
    }
    setBusy(true);
    setStatus('正在整理文章、範本及掃描附件…', false);
    global.LIFE_EDU_DRIVE_BRIDGE.createBackupZip()
      .then(function (blob) {
        if (blob.size > MAX_BACKUP_BYTES) throw new Error('完整備份超過 200 MiB，未有上載。');
        return uploadSession_(blob, makeBackupName_());
      })
      .then(function (file) {
        setStatus('完整備份已上載：' + file.name + '。', false);
        return listBackups_(false);
      })
      .then(function () {
        if (backups.length) setStatus('完整備份已上載並列在雲端清單最上方。', false);
      })
      .catch(function (error) { setStatus(error.message || 'Google Drive 上載失敗。', true); })
      .finally(function () { setBusy(false); });
  }

  function loadSelectedBackup_() {
    if (DRIVE_BACKUP_PAUSED) {
      setStatus(DRIVE_PAUSED_MESSAGE, false);
      return;
    }
    var bridge = global.LIFE_EDU_DRIVE_BRIDGE;
    if (bridge && typeof bridge.getRestoreBlockReason === 'function') {
      var blockReason = bridge.getRestoreBlockReason();
      if (blockReason) {
        setStatus(blockReason, true);
        return;
      }
    }
    var id = els.select && els.select.value;
    var file = backups.filter(function (item) { return item.id === id; })[0];
    if (!file) {
      setStatus('請先選擇一份雲端備份。', true);
      return;
    }
    if (Number(file.size) > MAX_BACKUP_BYTES) {
      setStatus('這份備份超過 200 MiB，未能載入。', true);
      return;
    }
    if (!bridge || typeof bridge.restoreBackupZip !== 'function') {
      setStatus('完整備份還原功能尚未載入；請重新整理頁面。', true);
      return;
    }
    setBusy(true);
    setStatus('正在從 Google Drive 下載 ' + file.name + '…', false);
    authorizedFetch_(DRIVE_API + '/' + encodeURIComponent(file.id) + '?alt=media', { method: 'GET' })
      .then(function (response) { return response.blob(); })
      .then(function (blob) {
        if (blob.size > MAX_BACKUP_BYTES) throw new Error('下載的完整備份超過 200 MiB，未有還原。');
        return global.LIFE_EDU_DRIVE_BRIDGE.restoreBackupZip(blob, els.status);
      })
      .then(function (restored) {
        if (restored === true) setStatus('雲端備份已載入；請核對名冊、文章及附件。', false);
      })
      .catch(function (error) { setStatus(error.message || 'Google Drive 載入失敗。', true); })
      .finally(function () { setBusy(false); });
  }

  function openDialog_() {
    if (!els.dialog) return;
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    else els.dialog.setAttribute('open', '');
    updateAuthState(currentAuthState());
  }

  function init() {
    els.dialog = byId('leDriveDialog');
    els.open = byId('leDriveOpen');
    els.close = byId('leDriveClose');
    els.status = byId('leDriveStatus');
    els.connect = byId('leDriveConnect');
    els.upload = byId('leDriveUpload');
    els.refresh = byId('leDriveRefresh');
    els.select = byId('leDriveBackupSelect');
    els.load = byId('leDriveLoad');
    if (!els.dialog || !els.open) return;
    prepareAuthPersistence_();
    els.open.addEventListener('click', openDialog_);
    if (els.close) els.close.addEventListener('click', function () {
      if (typeof els.dialog.close === 'function') els.dialog.close();
      else els.dialog.removeAttribute('open');
    });
    els.dialog.addEventListener('click', function (event) {
      if (event.target === els.dialog && typeof els.dialog.close === 'function') els.dialog.close();
    });
    if (els.connect) els.connect.addEventListener('click', function () {
      authorizeDrive_().catch(function (error) { setStatus(error.message || 'Google Drive 連接失敗。', true); })
        .finally(function () { setBusy(false); });
    });
    if (els.upload) els.upload.addEventListener('click', uploadBackup_);
    if (els.refresh) els.refresh.addEventListener('click', function () {
      if (DRIVE_BACKUP_PAUSED) {
        setStatus(DRIVE_PAUSED_MESSAGE, false);
        return;
      }
      setBusy(true);
      listBackups_(true).catch(function (error) { setStatus(error.message || '雲端備份讀取失敗。', true); })
        .finally(function () { setBusy(false); });
    });
    if (els.load) els.load.addEventListener('click', loadSelectedBackup_);
    if (els.select) els.select.addEventListener('change', function () { setBusy(busy); });
    if (global.AuthState && typeof global.AuthState.onChange === 'function') {
      global.AuthState.onChange(updateAuthState);
      if (typeof global.AuthState.whenReady === 'function') {
        global.AuthState.whenReady().then(updateAuthState);
      }
    } else {
      setStatus('AI-Learning 共用登入未載入；請檢查網絡後重新整理。', true);
    }
  }

  global.addEventListener('pagehide', function () {
    token = '';
    tokenEmail = '';
    backups = [];
    backupsTruncated = false;
    renderBackupOptions_();
    updateAuthState(currentAuthState());
  });
  global.addEventListener('pageshow', function () { updateAuthState(currentAuthState()); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
