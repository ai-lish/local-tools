(function (root) {
  "use strict";

  var TEMPLATE_STORAGE_KEY = "pdf-marking.templates.v1";
  var PREFERENCE_STORAGE_KEY = "pdf-marking.preferences.v1";

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
      storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(clean));
      return { ok: true, message: "自訂範本已儲存在這部電腦的瀏覽器。" };
    } catch (error) {
      return { ok: false, message: "無法儲存範本；請先匯出範本 JSON 備份。" };
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
    load: load,
    saveTemplates: saveTemplates,
    savePreference: savePreference
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingTemplateStore;
})(typeof window !== "undefined" ? window : globalThis);
