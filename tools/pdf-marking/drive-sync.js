(function (root) {
  "use strict";

  var GIS_SCRIPT = "https://accounts.google.com/gsi/client";
  var DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
  var DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  var DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  var DRIVE_FOLDER_NAME = "Local Tools 範本";
  var DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
  var TEMPLATE_KIND = "pdf-marking-template";
  var memoryToken = "";
  var tokenClient = null;

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function isClientId(value) {
    return typeof value === "string" && value.length <= 300 && /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value.trim());
  }
  function changedFields(left, right, templateApi) {
    var a = templateApi.sanitizeTemplate(left);
    var b = templateApi.sanitizeTemplate(right);
    var labels = { kind: "類型", page: "頁面設定（方向或比例）", bubble: "圈格設定", blocks: "題目區及答案欄（選項、題數或位置）", identity: "身份遮蔽設定", segments: "段落設定" };
    var changes = [];
    if (a.name !== b.name) changes.push("範本名稱：「" + a.name + "」→「" + b.name + "」");
    Object.keys(labels).forEach(function (key) {
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) changes.push(labels[key]);
    });
    return changes;
  }
  function timestamp(value) {
    var parsed = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function planMerge(localTemplates, remoteTemplates, templateApi, localMetadata) {
    var localById = new Map(asArray(localTemplates).map(function (item) { return [item.id, item]; }));
    var remoteById = new Map();
    var duplicates = new Set();
    asArray(remoteTemplates).forEach(function (item) {
      if (remoteById.has(item.template.id)) duplicates.add(item.template.id);
      else remoteById.set(item.template.id, item);
    });
    var additions = [];
    var unchanged = [];
    var conflicts = [];
    remoteById.forEach(function (remote, id) {
      if (duplicates.has(id)) {
        conflicts.push({ id: id, local: localById.get(id) || null, remote: remote, duplicate: true, differences: ["Drive 有多個相同範本 ID"] });
        return;
      }
      var local = localById.get(id);
      if (!local) { additions.push(remote); return; }
      var localHash = templateApi.templateChecksum(local);
      var remoteHash = remote.checksum || templateApi.templateChecksum(remote.template);
      if (localHash === remoteHash) { unchanged.push({ local: local, remote: remote }); return; }
      var localMeta = localMetadata && localMetadata[id] || {};
      var localTime = timestamp(localMeta.updatedAt);
      var remoteTime = timestamp(remote.updatedAt);
      var recommendation = localTime && remoteTime ? remoteTime > localTime ? "drive" : localTime > remoteTime ? "local" : "choose" : "choose";
      conflicts.push({
        id: id,
        local: local,
        remote: remote,
        duplicate: false,
        differences: changedFields(local, remote.template, templateApi),
        recommendation: recommendation,
        localUpdatedAt: localMeta.updatedAt || "",
        remoteUpdatedAt: remote.updatedAt || ""
      });
    });
    return { additions: additions, unchanged: unchanged, conflicts: conflicts };
  }
  function parseRemoteFiles(files, templateApi) {
    var templates = [];
    var skipped = [];
    var idCounts = Object.create(null);
    asArray(files).forEach(function (file) {
      var properties = file && file.appProperties || {};
      if (properties.kind === TEMPLATE_KIND && typeof properties.templateId === "string") {
        idCounts[properties.templateId] = (idCounts[properties.templateId] || 0) + 1;
      }
    });
    asArray(files).forEach(function (file) {
      var properties = file && file.appProperties || {};
      if (properties.kind !== TEMPLATE_KIND) {
        skipped.push({ name: file && file.name || "未命名檔案", reason: "檔案沒有 PDF 批改範本標記" });
        return;
      }
      if (idCounts[properties.templateId] > 1) {
        skipped.push({ name: file.name || "未命名檔案", reason: "Drive 資料夾內有重複範本 ID；請先手動整理重複檔案" });
        return;
      }
      var parsed = templateApi.parseTemplateJson(file.jsonText || "");
      if (!parsed.ok || parsed.template.source !== "custom" || parsed.template.kind !== "choice" ||
          properties.templateId !== parsed.template.id) {
        skipped.push({ name: file.name || "未命名檔案", reason: parsed.ok ? "範本 ID 或類型不相符" : parsed.errors.join(" ") });
        return;
      }
      var computedHash = templateApi.templateChecksum(parsed.template);
      if (properties.contentHash && properties.contentHash !== computedHash) {
        skipped.push({ name: file.name || "未命名檔案", reason: "範本校驗碼與 Drive metadata 不相符" });
        return;
      }
      templates.push({
        template: parsed.template,
        driveFileId: file.id,
        updatedAt: properties.updatedAt || file.modifiedTime || "",
        checksum: computedHash
      });
    });
    return { templates: templates, skipped: skipped };
  }
  function translatedError(error) {
    var code = error && (error.error || error.code || error.type || error.message) || "";
    if (/admin_policy_enforced|org_internal|access_denied/i.test(code)) return "Google 授權被拒或已被學校管理員封鎖第三方應用程式；請聯絡管理員或使用獲准帳戶。";
    if (/origin_mismatch|origin.*not.*allow|unauthorized.*origin/i.test(code)) return "此網頁來源未獲 OAuth 用戶端授權；請在 Google Cloud 加入 https://ai-lish.github.io。";
    if (/quota|rate.?limit|429/i.test(code)) return "Google Drive 配額或請求頻率已達上限，請稍後再試。";
    if (/network|failed to fetch|load failed|internet|offline/i.test(code)) return "未能連線至 Google Drive；請檢查網絡後再試。";
    if (/popup_closed|popup_failed_to_open|cancel/i.test(code)) return "登入視窗已關閉或被瀏覽器封鎖；請允許彈出視窗後再試。";
    if (/401|403|unauthorized|forbidden/i.test(code)) return "Google Drive 授權未成功或權限不足；請重新登入並確認 Drive API 已啟用。";
    return "Google Drive 操作未能完成。";
  }

  function loadGis() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + GIS_SCRIPT + '"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", function () { reject(new Error("network")); }, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.src = GIS_SCRIPT;
      script.async = true;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("network")); };
      document.head.append(script);
    });
  }

  function authorize(clientId) {
    if (!isClientId(clientId)) return Promise.reject(new Error("invalid_client_id"));
    return loadGis().then(function () {
      if (!root.google || !root.google.accounts || !root.google.accounts.oauth2) throw new Error("network");
      return new Promise(function (resolve, reject) {
        tokenClient = root.google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: DRIVE_SCOPE,
          callback: function (response) {
            if (!response || response.error || !response.access_token) { memoryToken = ""; reject(new Error(response && response.error || "access_denied")); return; }
            memoryToken = response.access_token;
            resolve();
          },
          error_callback: function (error) { memoryToken = ""; reject(error || new Error("access_denied")); }
        });
        tokenClient.requestAccessToken({ prompt: "" });
      });
    });
  }

  function createDriveClient(options) {
    var fetcher = options.fetch || root.fetch.bind(root);
    var templates = options.templates;
    var now = options.now || function () { return new Date().toISOString(); };

    async function request(url, init) {
      if (!memoryToken) throw new Error("access_denied");
      var headers = Object.assign({}, init && init.headers || {}, { Authorization: "Bearer " + memoryToken });
      var response;
      try { response = await fetcher(url, Object.assign({}, init || {}, { headers: headers })); }
      catch (error) { throw new Error("network"); }
      if (response.status === 401) { memoryToken = ""; throw new Error("unauthorized"); }
      if (!response.ok) {
        var detail = "";
        try { var body = await response.json(); detail = body && body.error && (body.error.message || body.error.status) || ""; } catch (error) {}
        throw new Error(response.status === 403 || response.status === 429 ? String(response.status) + " " + detail : String(response.status));
      }
      return response;
    }

    async function findFolder() {
      var q = "name = '" + DRIVE_FOLDER_NAME.replace(/'/g, "\\'") + "' and mimeType = '" + DRIVE_FOLDER_MIME + "' and trashed = false";
      var url = DRIVE_FILES + "?q=" + encodeURIComponent(q) + "&spaces=drive&pageSize=100&fields=files(id,name,mimeType)";
      var response = await request(url, { method: "GET" });
      var result = await response.json();
      var folders = asArray(result.files).filter(function (file) { return file.name === DRIVE_FOLDER_NAME && file.mimeType === DRIVE_FOLDER_MIME; });
      if (folders.length > 1) throw new Error("duplicate_folders");
      if (folders.length === 1) return folders[0].id;
      var created = await request(DRIVE_FILES + "?fields=id,name,mimeType", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: DRIVE_FOLDER_MIME, appProperties: { kind: TEMPLATE_KIND } })
      });
      var folder = await created.json();
      if (!folder.id) throw new Error("folder_create_failed");
      return folder.id;
    }

    async function listFiles(folderId) {
      var q = "'" + folderId + "' in parents and trashed = false";
      var url = DRIVE_FILES + "?q=" + encodeURIComponent(q) + "&spaces=drive&pageSize=1000&fields=files(id,name,mimeType,appProperties,modifiedTime)";
      var response = await request(url, { method: "GET" });
      return asArray((await response.json()).files).filter(function (file) {
        return file.mimeType === "application/json";
      });
    }

    async function readFile(file) {
      var response = await request(DRIVE_FILES + "/" + encodeURIComponent(file.id) + "?alt=media", { method: "GET" });
      return response.text();
    }

    async function uploadFile(folderId, definition, fileId) {
      var updatedAt = now();
      var clean = templates.sanitizeTemplate(definition);
      var contentHash = templates.templateChecksum(clean);
      var jsonText = templates.serializeTemplate(clean, updatedAt);
      var metadata = {
        name: "template-" + clean.id.replace(/[^a-z0-9._-]/gi, "-") + ".json",
        mimeType: "application/json",
        appProperties: { kind: TEMPLATE_KIND, templateId: clean.id, updatedAt: updatedAt, contentHash: contentHash }
      };
      if (!fileId) metadata.parents = [folderId];
      var boundary = "local-tools-drive-template-boundary";
      var body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) +
        "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + jsonText + "\r\n--" + boundary + "--";
      var endpoint = DRIVE_UPLOAD + (fileId ? "/" + encodeURIComponent(fileId) : "") + "?uploadType=multipart&fields=id,name,appProperties,modifiedTime";
      var response = await request(endpoint, { method: fileId ? "PATCH" : "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body: body });
      return response.json();
    }

    async function inspect(folderId, files) {
      var localState = options.store.load(options.host, templates);
      var locals = localState.templates.filter(function (item) { return item.kind === "choice"; });
      var metadata = options.store.loadDriveSync(options.host).templates;
      var remote = [];
      var skipped = [];
      for (var index = 0; index < files.length; index += 1) {
        try {
          var jsonText = await readFile(files[index]);
          remote.push(Object.assign({}, files[index], { jsonText: jsonText }));
        } catch (error) {
          skipped.push({ name: files[index].name || "未命名檔案", reason: translatedError(error) });
        }
      }
      var parsed = parseRemoteFiles(remote, templates);
      skipped = skipped.concat(parsed.skipped);
      var plan = planMerge(locals, parsed.templates, templates, metadata);
      return { folderId: folderId, files: files, remote: parsed.templates, skipped: skipped, plan: plan, locals: locals, metadata: metadata };
    }

    return {
      authorize: function (clientId) {
        if (typeof options.requestToken === "function") {
          return Promise.resolve(options.requestToken(clientId, DRIVE_SCOPE)).then(function (token) {
            if (typeof token !== "string" || !token) throw new Error("access_denied");
            memoryToken = token;
          });
        }
        return authorize(clientId);
      },
      clearToken: function () { memoryToken = ""; tokenClient = null; },
      hasToken: function () { return Boolean(memoryToken); },
      inspectDrive: async function () {
        var folderId = await findFolder();
        var files = await listFiles(folderId);
        return inspect(folderId, files);
      },
      uploadFile: uploadFile,
      getFolder: findFolder,
      readFile: readFile,
      listFiles: listFiles,
      constants: { DRIVE_SCOPE: DRIVE_SCOPE, GIS_SCRIPT: GIS_SCRIPT, DRIVE_FOLDER_NAME: DRIVE_FOLDER_NAME, DRIVE_FILES: DRIVE_FILES, DRIVE_UPLOAD: DRIVE_UPLOAD }
    };
  }

  function renderConflicts(container, conflicts, choose) {
    container.replaceChildren();
    conflicts.forEach(function (conflict) {
      var card = document.createElement("article");
      card.className = "drive-sync-conflict";
      var heading = document.createElement("h4");
      heading.textContent = conflict.local ? "相同 ID 範本有不同內容：「" + conflict.local.name + "」" : "Drive 有重複範本 ID：「" + conflict.id + "」";
      var details = document.createElement("p");
      details.textContent = conflict.duplicate ? conflict.differences.join("；") : "差異：" + (conflict.differences.join("、") || "內容") +
        "。建議較新版本：" + (conflict.recommendation === "drive" ? "Drive" : conflict.recommendation === "local" ? "本機" : "時間相同或無法判斷，請自行選擇") + "。";
      var actions = document.createElement("div");
      actions.className = "drive-sync-actions";
      if (!conflict.duplicate) {
        [["local", "保留本機版本"], ["drive", "採用 Drive 版本"]].forEach(function (choice) {
          var button = document.createElement("button"); button.type = "button"; button.className = "button compact"; button.textContent = choice[1];
          button.addEventListener("click", function () { choose(conflict, choice[0]); card.remove(); });
          actions.append(button);
        });
      }
      card.append(heading, details, actions);
      container.append(card);
    });
  }

  function initialize() {
    var panel = document.getElementById("pdf-marking-drive-sync");
    var offlineNote = document.getElementById("pdf-marking-drive-offline-note");
    if (!panel || !offlineNote) return;
    if (root.LT_OFFLINE) { panel.hidden = true; offlineNote.hidden = false; return; }
    panel.hidden = false;
    var store = root.PdfMarkingTemplateStore;
    var templates = root.PdfMarkingTemplates;
    var host = root;
    var clientIdInput = document.getElementById("drive-sync-client-id");
    var saveClientIdButton = document.getElementById("drive-sync-save-client-id");
    var loginButton = document.getElementById("drive-sync-login");
    var uploadButton = document.getElementById("drive-sync-upload");
    var downloadButton = document.getElementById("drive-sync-download");
    var status = document.getElementById("drive-sync-status");
    var lastSync = document.getElementById("drive-sync-last-sync");
    var conflictsNode = document.getElementById("drive-sync-conflicts");
    var settings = store.loadDriveSync(host);
    var authorizedClientId = "";
    clientIdInput.value = settings.clientId || root.PdfMarkingDriveConfig && root.PdfMarkingDriveConfig.clientId || "";
    if (isClientId(clientIdInput.value)) status.textContent = "尚未登入；按「登入 Google Drive」後才會連線。";
    if (settings.lastSyncAt) lastSync.textContent = "上次同步：" + new Date(settings.lastSyncAt).toLocaleString("zh-HK");
    var client = createDriveClient({ templates: templates, store: store, host: host });
    function updateButtons() {
      var configured = isClientId(clientIdInput.value);
      loginButton.disabled = !configured;
      var authorized = client.hasToken() && authorizedClientId === clientIdInput.value.trim();
      uploadButton.disabled = !configured || !authorized;
      downloadButton.disabled = !configured || !authorized;
    }
    function setStatus(message, isError) { status.textContent = message; status.classList.toggle("is-error", Boolean(isError)); }
    function saveSettings(next) {
      var current = store.loadDriveSync(host);
      var result = store.saveDriveSync(host, Object.assign({}, current, next));
      if (!result.ok) throw new Error(result.message);
      settings = store.loadDriveSync(host);
    }
    function notifyTemplatesChanged() {
      root.dispatchEvent(new CustomEvent("pdf-marking:templates-updated"));
    }
    function setLastSync() {
      var now = new Date().toISOString();
      saveSettings({ clientId: clientIdInput.value.trim(), lastSyncAt: now });
      lastSync.textContent = "上次同步：" + new Date(now).toLocaleString("zh-HK");
    }
    function saveTemplateList(items, remoteMetadata) {
      var all = store.load(host, templates).templates;
      var byId = new Map(all.map(function (item) { return [item.id, item]; }));
      items.forEach(function (item) { byId.set(item.id, item); });
      var result = store.saveTemplates(host, templates, Array.from(byId.values()));
      if (!result.ok) throw new Error(result.message);
      var current = store.loadDriveSync(host);
      var nextMetadata = Object.assign(Object.create(null), current.templates);
      Object.keys(remoteMetadata || {}).forEach(function (id) { nextMetadata[id] = remoteMetadata[id]; });
      saveSettings({ clientId: clientIdInput.value.trim(), templates: nextMetadata });
      notifyTemplatesChanged();
    }
    function currentLocalById(id) { return store.load(host, templates).templates.find(function (item) { return item.id === id; }) || null; }
    function recordRemoteMetadata(remote) {
      var current = store.loadDriveSync(host);
      var next = Object.assign(Object.create(null), current.templates);
      remote.forEach(function (entry) { next[entry.template.id] = { updatedAt: entry.updatedAt, checksum: entry.checksum, driveFileId: entry.driveFileId }; });
      saveSettings({ clientId: clientIdInput.value.trim(), templates: next });
    }
    function resolveDownloadConflict(conflict, choice) {
      if (choice === "drive") {
        var remote = conflict.remote;
        saveTemplateList([remote.template], { [remote.template.id]: { updatedAt: remote.updatedAt, checksum: remote.checksum, driveFileId: remote.driveFileId } });
        setStatus("已按你的選擇採用 Drive 版本。", false);
      } else setStatus("已保留本機版本；沒有覆寫本機範本。", false);
    }
    saveClientIdButton.addEventListener("click", function () {
      if (!isClientId(clientIdInput.value)) { setStatus("請輸入有效的 Google OAuth 網頁用戶端 ID（結尾為 .apps.googleusercontent.com）。", true); updateButtons(); return; }
      try { saveSettings({ clientId: clientIdInput.value.trim() }); setStatus("公開用戶端 ID 已保存在這部瀏覽器；這不是密碼。", false); }
      catch (error) { setStatus(error.message, true); }
      updateButtons();
    });
    clientIdInput.addEventListener("input", updateButtons);
    clientIdInput.addEventListener("change", function () {
      if (client.hasToken() && authorizedClientId !== clientIdInput.value.trim()) {
        client.clearToken(); authorizedClientId = "";
        setStatus("用戶端 ID 已更改；請重新登入。", false);
      }
      updateButtons();
    });
    loginButton.addEventListener("click", async function () {
      try {
        if (!isClientId(clientIdInput.value)) throw new Error("invalid_client_id");
        saveSettings({ clientId: clientIdInput.value.trim() });
        setStatus("正在開啟 Google 授權視窗…", false);
        await client.authorize(clientIdInput.value.trim());
        authorizedClientId = clientIdInput.value.trim();
        setStatus("已授權本次頁面使用 Drive；重整後須重新登入。", false);
      } catch (error) {
        client.clearToken();
        authorizedClientId = "";
        setStatus(error.message === "invalid_client_id" ? "請先輸入並保存有效的 OAuth 用戶端 ID。" : translatedError(error), true);
      }
      updateButtons();
    });
    downloadButton.addEventListener("click", async function () {
      conflictsNode.replaceChildren();
      uploadButton.disabled = true; downloadButton.disabled = true;
      try {
        setStatus("正在檢查 Drive 範本…", false);
        var snapshot = await client.inspectDrive();
        var plan = snapshot.plan;
        var additions = plan.additions.map(function (entry) { return entry.template; });
        var metadata = Object.create(null);
        plan.additions.concat(plan.unchanged.map(function (entry) { return entry.remote; })).forEach(function (entry) {
          metadata[entry.template.id] = { updatedAt: entry.updatedAt, checksum: entry.checksum, driveFileId: entry.driveFileId };
        });
        if (additions.length) saveTemplateList(additions, metadata);
        else if (Object.keys(metadata).length) { recordRemoteMetadata(plan.additions.concat(plan.unchanged.map(function (entry) { return entry.remote; }))); }
        renderConflicts(conflictsNode, plan.conflicts, resolveDownloadConflict);
        setLastSync();
        var message = "已檢查 Drive 範本：新增 " + additions.length + " 個，無變更 " + plan.unchanged.length + " 個，待你選擇 " + plan.conflicts.length + " 個。";
        if (snapshot.skipped.length) message += " 略過 " + snapshot.skipped.length + " 個無效或無法讀取項目。";
        setStatus(message + (snapshot.skipped.length ? " " + snapshot.skipped.map(function (item) { return item.name + "：" + item.reason; }).join("；") : ""), snapshot.skipped.length > 0);
      } catch (error) { setStatus(translatedError(error), true); }
      updateButtons();
    });
    uploadButton.addEventListener("click", async function () {
      conflictsNode.replaceChildren();
      uploadButton.disabled = true; downloadButton.disabled = true;
      try {
        setStatus("正在檢查 Drive 範本…", false);
        var snapshot = await client.inspectDrive();
        var localById = new Map(snapshot.locals.map(function (item) { return [item.id, item]; }));
        var remoteById = new Map(snapshot.remote.map(function (item) { return [item.template.id, item]; }));
        var conflicts = snapshot.plan.conflicts;
        var uploaded = 0;
        var folderId = snapshot.folderId;
        for (var index = 0; index < snapshot.locals.length; index += 1) {
          var local = snapshot.locals[index];
          var remote = remoteById.get(local.id);
          if (remote && templates.templateChecksum(local) === remote.checksum) continue;
          if (remote) continue;
          var result = await client.uploadFile(folderId, local, "");
          var now = new Date().toISOString();
          var metadataNow = store.loadDriveSync(host);
          var nextMap = Object.assign(Object.create(null), metadataNow.templates);
          nextMap[local.id] = { updatedAt: now, checksum: templates.templateChecksum(local), driveFileId: result.id || "" };
          saveSettings({ clientId: clientIdInput.value.trim(), templates: nextMap });
          uploaded += 1;
        }
        conflicts.forEach(function (conflict) {
          conflict.uploadPending = true;
          conflict.local = localById.get(conflict.id) || conflict.local;
        });
        renderConflicts(conflictsNode, conflicts.filter(function (item) { return !item.duplicate; }), async function (conflict, choice) {
          try {
            if (choice === "local") {
              var result = await client.uploadFile(folderId, conflict.local, conflict.remote.driveFileId);
              var now = new Date().toISOString();
              var current = store.loadDriveSync(host); var nextMap = Object.assign(Object.create(null), current.templates);
              nextMap[conflict.id] = { updatedAt: now, checksum: templates.templateChecksum(conflict.local), driveFileId: result.id || conflict.remote.driveFileId };
              saveSettings({ clientId: clientIdInput.value.trim(), templates: nextMap });
              setStatus("已按你的選擇以上載本機版本更新 Drive。", false);
            } else {
              saveTemplateList([conflict.remote.template], { [conflict.id]: { updatedAt: conflict.remote.updatedAt, checksum: conflict.remote.checksum, driveFileId: conflict.remote.driveFileId } });
              setStatus("已按你的選擇採用 Drive 版本。", false);
            }
          } catch (error) { setStatus(translatedError(error), true); }
        });
        recordRemoteMetadata(snapshot.plan.unchanged.map(function (entry) { return entry.remote; }));
        setLastSync();
        setStatus("已上載 " + uploaded + " 個新範本；" + conflicts.length + " 個不同版本待你選擇。" +
          (conflicts.length ? " 未經選擇不會覆寫任何版本。" : ""), false);
      } catch (error) { setStatus(translatedError(error), true); }
      updateButtons();
    });
    updateButtons();
  }

  var api = {
    GIS_SCRIPT: GIS_SCRIPT,
    DRIVE_SCOPE: DRIVE_SCOPE,
    DRIVE_FILES: DRIVE_FILES,
    DRIVE_UPLOAD: DRIVE_UPLOAD,
    DRIVE_FOLDER_NAME: DRIVE_FOLDER_NAME,
    TEMPLATE_KIND: TEMPLATE_KIND,
    isClientId: isClientId,
    changedFields: changedFields,
    planMerge: planMerge,
    parseRemoteFiles: parseRemoteFiles,
    translatedError: translatedError,
    createDriveClient: createDriveClient,
    initialize: initialize
  };
  root.PdfMarkingDriveSync = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") root.addEventListener("DOMContentLoaded", initialize, { once: true });
})(typeof window !== "undefined" ? window : globalThis);
