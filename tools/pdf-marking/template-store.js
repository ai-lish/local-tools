(function (root) {
  "use strict";

  var TEMPLATE_STORAGE_KEY = "pdf-marking.templates.v1";
  var PREFERENCE_STORAGE_KEY = "pdf-marking.preferences.v1";
  var DRIVE_SYNC_STORAGE_KEY = "pdf-marking.drive-sync.v1";

  function storageFrom(host) {
    try {
      var storage = host && host.localStorage;
      return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" ? storage : null;
    } catch (error) {
      return null;
    }
  }

  function load(host, templateApi) {
    var storage = storageFrom(host);
    var templates = [];
    var selectedTemplateId = "";
    if (!storage) return { templates: templates, selectedTemplateId: selectedTemplateId };
    try {
      var rawTemplates = JSON.parse(storage.getItem(TEMPLATE_STORAGE_KEY) || "[]");
      if (Array.isArray(rawTemplates)) {
        templates = rawTemplates.map(function (raw) {
          var clean = templateApi.sanitizeTemplate(raw);
          return clean.source === "custom" && templateApi.validateTemplate(clean).ok ? clean : null;
        }).filter(Boolean);
      }
    } catch (error) {
      templates = [];
    }
    try {
      var preferences = JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEY) || "{}");
      if (preferences && typeof preferences.selectedTemplateId === "string" && preferences.selectedTemplateId.length <= 80) {
        selectedTemplateId = preferences.selectedTemplateId;
      }
    } catch (error) {
      selectedTemplateId = "";
    }
    return { templates: templates, selectedTemplateId: selectedTemplateId };
  }

  function saveTemplates(host, templateApi, definitions) {
    var storage = storageFrom(host);
    if (!storage) return { ok: false, message: "此瀏覽器不允許本機儲存；範本只會保留至關閉頁面。" };
    var clean = [];
    (Array.isArray(definitions) ? definitions : []).forEach(function (definition) {
      var item = templateApi.sanitizeTemplate(definition);
      if (item.source === "custom" && templateApi.validateTemplate(item).ok) clean.push(item);
    });
    try {
      var syncState = loadDriveSync(host);
      var previousById = syncState.templates;
      var nextSyncTemplates = Object.create(null);
      var now = new Date().toISOString();
      clean.forEach(function (item) {
        var checksum = templateApi.templateChecksum(item);
        var previous = previousById[item.id];
        nextSyncTemplates[item.id] = {
          updatedAt: previous && previous.checksum === checksum ? previous.updatedAt : now,
          checksum: checksum,
          driveFileId: previous ? previous.driveFileId : ""
        };
      });
      storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(clean));
      var syncSaved = saveDriveSync(host, {
        clientId: syncState.clientId,
        lastSyncAt: syncState.lastSyncAt,
        templates: nextSyncTemplates
      });
      return { ok: true, message: "自訂範本已儲存在這部電腦的瀏覽器。" + (syncSaved.ok ? "" : "同步時間資料未能更新。") };
    } catch (error) {
      return { ok: false, message: "無法儲存範本；請先匯出範本 JSON 備份。" };
    }
  }

  function validIsoDate(value) {
    if (typeof value !== "string" || value.length > 40) return "";
    var time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : "";
  }

  function cleanDriveSync(value) {
    var source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    var clientId = typeof source.clientId === "string" && source.clientId.length <= 300 &&
      /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(source.clientId.trim()) ? source.clientId.trim() : "";
    var templates = Object.create(null);
    var rawTemplates = source.templates && typeof source.templates === "object" && !Array.isArray(source.templates) ? source.templates : {};
    Object.keys(rawTemplates).forEach(function (id) {
      var raw = rawTemplates[id];
      if (!/^custom:[a-z0-9][a-z0-9._-]{0,60}$/i.test(id) || !raw || typeof raw !== "object") return;
      var checksum = typeof raw.checksum === "string" && /^[a-f0-9]{16}$/i.test(raw.checksum) ? raw.checksum.toLowerCase() : "";
      if (!checksum) return;
      var driveFileId = typeof raw.driveFileId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(raw.driveFileId) ? raw.driveFileId : "";
      templates[id] = { updatedAt: validIsoDate(raw.updatedAt), checksum: checksum, driveFileId: driveFileId };
    });
    return {
      clientId: clientId,
      lastSyncAt: validIsoDate(source.lastSyncAt),
      templates: templates
    };
  }

  function loadDriveSync(host) {
    var storage = storageFrom(host);
    if (!storage) return { clientId: "", lastSyncAt: "", templates: Object.create(null) };
    try {
      return cleanDriveSync(JSON.parse(storage.getItem(DRIVE_SYNC_STORAGE_KEY) || "{}"));
    } catch (error) {
      return { clientId: "", lastSyncAt: "", templates: Object.create(null) };
    }
  }

  function saveDriveSync(host, value) {
    var storage = storageFrom(host);
    if (!storage) return { ok: false, message: "此瀏覽器不允許儲存同步設定。" };
    try {
      storage.setItem(DRIVE_SYNC_STORAGE_KEY, JSON.stringify(cleanDriveSync(value)));
      return { ok: true };
    } catch (error) {
      return { ok: false, message: "無法儲存同步設定。" };
    }
  }

  function savePreference(host, selectedTemplateId) {
    var storage = storageFrom(host);
    if (!storage) return { ok: false, message: "此瀏覽器不允許儲存介面偏好。" };
    if (typeof selectedTemplateId !== "string" || selectedTemplateId.length > 80) {
      return { ok: false, message: "範本偏好格式不正確。" };
    }
    try {
      storage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify({ selectedTemplateId: selectedTemplateId }));
      return { ok: true };
    } catch (error) {
      return { ok: false, message: "無法儲存介面偏好。" };
    }
  }

  root.PdfMarkingTemplateStore = {
    TEMPLATE_STORAGE_KEY: TEMPLATE_STORAGE_KEY,
    PREFERENCE_STORAGE_KEY: PREFERENCE_STORAGE_KEY,
    DRIVE_SYNC_STORAGE_KEY: DRIVE_SYNC_STORAGE_KEY,
    load: load,
    saveTemplates: saveTemplates,
    savePreference: savePreference,
    loadDriveSync: loadDriveSync,
    saveDriveSync: saveDriveSync
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingTemplateStore;
})(typeof window !== "undefined" ? window : globalThis);
