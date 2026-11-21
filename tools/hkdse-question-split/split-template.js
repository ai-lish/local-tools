(function (root) {
  "use strict";

  var FORMAT = "hkdse-question-split-template";
  var VERSION = 1;
  var STORAGE_KEY = "hkdse-question-split.templates.v1";
  var PAPER_VALUES = ["M1", "M2", "P1", "P2"];
  var OUTPUT_FORMATS = ["png", "jpg"];
  var DPI_VALUES = [150, 200, 250];
  var ROOT_KEYS = ["format", "version", "id", "name", "createdAt", "updatedAt", "paper", "year",
    "language", "kind", "outputFormat", "dpi", "sectionEnd", "leftPercent", "rightPercent",
    "sourcePageCount", "boundarySets"];
  var ROW_KEYS = ["number", "section", "name", "start", "end", "customName", "customSection"];

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function normalizeField(value) {
    if (value == null || String(value).trim() === "") return "";
    var number = Number(value);
    return Number.isFinite(number) ? number : String(value);
  }

  function normalizeCoordinate(value) {
    var source = isObject(value) ? value : {};
    return { page: normalizeField(source.page), percent: normalizeField(source.percent) };
  }

  function safeId() {
    var random = "";
    try {
      var bytes = new Uint8Array(8);
      root.crypto.getRandomValues(bytes);
      random = Array.from(bytes).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    } catch (error) {
      random = Math.random().toString(36).slice(2, 14);
    }
    return "hkdse-split-" + Date.now().toString(36) + "-" + random;
  }

  function createTemplate(settings) {
    var source = isObject(settings) ? settings : {};
    var meta = isObject(source.metadata) ? source.metadata : {};
    var now = new Date().toISOString();
    var rows = Array.isArray(source.rows) ? source.rows : [];
    return {
      format: FORMAT,
      version: VERSION,
      id: text(meta.id) || safeId(),
      name: text(source.name).trim(),
      createdAt: text(meta.createdAt) || now,
      updatedAt: now,
      paper: text(source.paper),
      year: Number(source.year),
      language: text(source.language),
      kind: text(source.kind),
      outputFormat: text(source.outputFormat),
      dpi: Number(source.dpi),
      sectionEnd: Number(source.sectionEnd),
      leftPercent: Number(source.leftPercent),
      rightPercent: Number(source.rightPercent),
      sourcePageCount: Number(source.sourcePageCount),
      boundarySets: {
        questions: rows.map(function (row) {
          var item = isObject(row) ? row : {};
          return {
            number: Number(item.number),
            section: text(item.section),
            name: text(item.name),
            start: normalizeCoordinate(item.start),
            end: normalizeCoordinate(item.end),
            customName: Boolean(item.customName),
            customSection: Boolean(item.customSection)
          };
        }),
        answers: null
      }
    };
  }

  function addUnknownKeyErrors(value, allowed, label, errors) {
    Object.keys(value).forEach(function (key) {
      if (allowed.indexOf(key) < 0) errors.push(label + "含有不支援的欄位：「" + key + "」。");
    });
  }

  function dateIsValid(value) {
    return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
  }

  function coordinateState(coord, side, rowNumber, maximumPage, errors) {
    var label = side === "start" ? "起點" : "終點";
    if (!isObject(coord)) {
      errors.push("第 " + rowNumber + " 題：" + label + "欄位缺失或格式不正確。");
      return null;
    }
    addUnknownKeyErrors(coord, ["page", "percent"], "第 " + rowNumber + " 題「" + label + "」", errors);
    var pageText = text(coord.page).trim();
    var percentText = text(coord.percent).trim();
    if (!pageText && !percentText) return null;
    if (!pageText || !percentText) {
      errors.push("第 " + rowNumber + " 題：" + label + "頁碼及百分比須一併設定，或同時留空作草稿。");
    }
    var page = pageText ? Number(pageText) : NaN;
    var percent = percentText ? Number(percentText) : NaN;
    var validPage = Number.isInteger(page) && page >= 1 && page <= maximumPage;
    var validPercent = Number.isFinite(percent) && percent >= 0 && percent <= 100;
    if (pageText && !validPage) {
      errors.push("第 " + rowNumber + " 題：" + label + "頁碼必須是 1 至來源 PDF 頁數內的整數。");
    }
    if (percentText && !validPercent) {
      errors.push("第 " + rowNumber + " 題：" + label + "百分比必須是 0 至 100。");
    }
    if (!pageText || !percentText || !validPage || !validPercent) return null;
    return { page: page, percent: percent };
  }

  function validateRows(rows, paper, maximumPage) {
    var errors = [];
    var seenNumbers = Object.create(null);
    var seenNames = Object.create(null);
    var positioned = [];
    var usesSection = ["M1", "M2", "P1"].indexOf(paper) >= 0;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 200) {
      return ["逐題界線必須有 1 至 200 列。"];
    }
    rows.forEach(function (row, index) {
      var label = "第 " + (isObject(row) ? row.number : index + 1) + " 題：";
      if (!isObject(row)) {
        errors.push("第 " + (index + 1) + " 題資料格式不正確。");
        return;
      }
      addUnknownKeyErrors(row, ROW_KEYS, label, errors);
      if (!Number.isInteger(row.number) || row.number < 1 || row.number > 200) {
        errors.push(label + "題號必須是 1 至 200 的整數。");
      } else if (seenNumbers[row.number]) {
        errors.push("題號重複：第 " + row.number + " 題。");
      } else {
        seenNumbers[row.number] = true;
      }
      if (usesSection && ["甲部", "乙部"].indexOf(row.section) < 0) {
        errors.push(label + "未設定部份或部份格式不正確。");
      } else if (!usesSection && row.section !== "") {
        errors.push(label + "此卷別不設甲乙部。");
      }
      if (typeof row.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*[.](png|jpg)$/i.test(row.name)) {
        errors.push(label + "檔名不合規，須符合現有 PNG／JPG 檔名規則。");
      }
      var nameKey = text(row.name).toLowerCase();
      if (nameKey && seenNames[nameKey]) errors.push("檔名重複：「" + row.name + "」。");
      else if (nameKey) seenNames[nameKey] = true;
      if (row.customName != null && typeof row.customName !== "boolean") errors.push(label + "自訂檔名狀態格式不正確。");
      if (row.customSection != null && typeof row.customSection !== "boolean") errors.push(label + "自訂部份狀態格式不正確。");

      var start = coordinateState(row.start, "start", row.number, maximumPage, errors);
      var end = coordinateState(row.end, "end", row.number, maximumPage, errors);
      if (start && end) {
        var startValue = start.page * 100000 + start.percent;
        var endValue = end.page * 100000 + end.percent;
        if (startValue >= endValue) errors.push(label + "起終點次序錯誤。");
        positioned.push({ index: index, number: row.number, start: start, end: end });
      }
    });
    positioned.sort(function (left, right) {
      return left.start.page - right.start.page || left.start.percent - right.start.percent;
    });
    for (var index = 1; index < positioned.length; index += 1) {
      var previous = positioned[index - 1];
      var current = positioned[index];
      var previousEnd = previous.end.page * 100000 + previous.end.percent;
      var currentStart = current.start.page * 100000 + current.start.percent;
      if (current.index < previous.index) {
        errors.push("題目界線順序錯誤：第 " + previous.number + " 題應在第 " + current.number + " 題之前。");
      }
      if (currentStart < previousEnd) errors.push("題目界線重疊：第 " + previous.number + " 題與第 " + current.number + " 題。");
    }
    return errors;
  }

  function validateTemplate(value) {
    var errors = [];
    if (!isObject(value)) return { ok: false, errors: ["範本內容必須是 JSON 物件。"] };
    addUnknownKeyErrors(value, ROOT_KEYS, "範本", errors);
    if (value.format !== FORMAT) errors.push("範本格式識別不符。");
    if (value.version !== VERSION) errors.push("不支援此範本版本（目前只支援 v1）。");
    if (typeof value.id !== "string" || !/^hkdse-split-[A-Za-z0-9-]{1,100}$/.test(value.id)) errors.push("範本 ID 缺失或格式不正確。");
    if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 100) errors.push("範本名稱缺失或超過 100 個字元。");
    if (!dateIsValid(value.createdAt)) errors.push("建立時間缺失或格式不正確。");
    if (!dateIsValid(value.updatedAt)) errors.push("更新時間缺失或格式不正確。");
    if (PAPER_VALUES.indexOf(value.paper) < 0) errors.push("卷別缺失或格式不正確。");
    if (!Number.isInteger(value.year) || value.year < 2000 || value.year > 2100) errors.push("年份必須是 2000 至 2100 的整數。");
    if (["zh", "en"].indexOf(value.language) < 0) errors.push("語言缺失或格式不正確。");
    if (["q", "a"].indexOf(value.kind) < 0) errors.push("內容類型缺失或格式不正確。");
    if (OUTPUT_FORMATS.indexOf(value.outputFormat) < 0) errors.push("輸出圖片格式缺失或格式不正確。");
    if (DPI_VALUES.indexOf(value.dpi) < 0) errors.push("輸出 DPI 必須是 150、200 或 250。");
    if (!Number.isInteger(value.sectionEnd) || value.sectionEnd < 0 || value.sectionEnd > 200) errors.push("乙部起始題號設定（甲部最後題號）必須是 0 至 200 的整數。");
    if (!isFiniteNumber(value.leftPercent) || value.leftPercent < 0 || value.leftPercent > 100) errors.push("左裁切百分比必須是 0 至 100。");
    if (!isFiniteNumber(value.rightPercent) || value.rightPercent < 0 || value.rightPercent > 100) errors.push("右裁切百分比必須是 0 至 100。");
    if (isFiniteNumber(value.leftPercent) && isFiniteNumber(value.rightPercent) && value.leftPercent >= value.rightPercent) {
      errors.push("左裁切位置必須小於右裁切位置。");
    }
    if (!Number.isInteger(value.sourcePageCount) || value.sourcePageCount < 1 || value.sourcePageCount > 10000) errors.push("來源 PDF 頁數必須是 1 至 10000 的整數。");
    if (!isObject(value.boundarySets)) {
      errors.push("缺少題目界線集合。");
    } else {
      addUnknownKeyErrors(value.boundarySets, ["questions", "answers"], "界線集合", errors);
      if (!Array.isArray(value.boundarySets.questions)) errors.push("缺少題目界線清單。");
      if (value.boundarySets.answers !== null) errors.push("此版本不支援答案界線；answers 須保留為 null。");
      if (Array.isArray(value.boundarySets.questions) && Number.isInteger(value.sourcePageCount)) {
        errors = errors.concat(validateRows(value.boundarySets.questions, value.paper, value.sourcePageCount));
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function cleanTemplate(value) {
    var source = value;
    return {
      format: FORMAT,
      version: VERSION,
      id: source.id,
      name: source.name.trim(),
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      paper: source.paper,
      year: source.year,
      language: source.language,
      kind: source.kind,
      outputFormat: source.outputFormat,
      dpi: source.dpi,
      sectionEnd: source.sectionEnd,
      leftPercent: source.leftPercent,
      rightPercent: source.rightPercent,
      sourcePageCount: source.sourcePageCount,
      boundarySets: {
        questions: source.boundarySets.questions.map(function (row) {
          return {
            number: row.number,
            section: row.section,
            name: row.name,
            start: normalizeCoordinate(row.start),
            end: normalizeCoordinate(row.end),
            customName: Boolean(row.customName),
            customSection: Boolean(row.customSection)
          };
        }),
        answers: null
      }
    };
  }

  function serializeTemplate(value) {
    var result = validateTemplate(value);
    if (!result.ok) return { ok: false, errors: result.errors, text: "" };
    return { ok: true, errors: [], text: JSON.stringify(cleanTemplate(value), null, 2) + "\n" };
  }

  function deserializeTemplate(input) {
    var value;
    try {
      value = typeof input === "string" ? JSON.parse(input) : input;
    } catch (error) {
      return { ok: false, errors: ["範本 JSON 讀取失敗：格式不正確。"], template: null };
    }
    var result = validateTemplate(value);
    return { ok: result.ok, errors: result.errors, template: result.ok ? cleanTemplate(value) : null };
  }

  function applyOffsets(value, options) {
    var templateResult = deserializeTemplate(value);
    if (!templateResult.ok) return { ok: false, canApply: false, rows: [], warnings: [], errors: templateResult.errors, affectedCount: 0 };
    var settings = isObject(options) ? options : {};
    var pageOffset = settings.pageOffset == null ? 0 : Number(settings.pageOffset);
    var verticalOffset = settings.verticalOffset == null ? 0 : Number(settings.verticalOffset);
    var pageCount = settings.pageCount == null ? null : Number(settings.pageCount);
    var errors = [];
    var offsetErrors = [];
    var warnings = [];
    if (!Number.isInteger(pageOffset)) offsetErrors.push("整體頁碼位移必須是整數。");
    if (!Number.isFinite(verticalOffset) || verticalOffset < -100 || verticalOffset > 100) offsetErrors.push("整體上下位移必須是 -100 至 100 的百分比。");
    if (pageCount != null && (!Number.isInteger(pageCount) || pageCount < 1)) offsetErrors.push("目標 PDF 頁數格式不正確。");
    if (pageCount != null && pageCount !== templateResult.template.sourcePageCount) {
      warnings.push("目標 PDF 共 " + pageCount + " 頁；範本來源 PDF 共 " + templateResult.template.sourcePageCount + " 頁。請核對套用後的界線。");
    }
    var rows = templateResult.template.boundarySets.questions.map(function (sourceRow) {
      var row = clone(sourceRow);
      ["start", "end"].forEach(function (side) {
        var coord = row[side];
        if (coord.page !== "" && Number.isInteger(Number(coord.page)) && Number.isInteger(pageOffset)) coord.page = Number(coord.page) + pageOffset;
        if (coord.percent !== "" && Number.isFinite(Number(coord.percent)) && Number.isFinite(verticalOffset)) {
          coord.percent = Number(coord.percent) + verticalOffset;
        }
      });
      return row;
    });
    if (pageCount != null && offsetErrors.length === 0) {
      rows.forEach(function (row) {
        ["start", "end"].forEach(function (side) {
          var coord = row[side];
          if (coord.page !== "" && Number.isInteger(Number(coord.page)) && (Number(coord.page) < 1 || Number(coord.page) > pageCount)) {
            errors.push("第 " + row.number + " 題" + (side === "start" ? "起點" : "終點") + "頁碼 " + coord.page + " 超出目標 PDF 的 1 至 " + pageCount + " 頁範圍。");
          }
          if (coord.percent !== "" && Number.isFinite(Number(coord.percent)) && (Number(coord.percent) < 0 || Number(coord.percent) > 100)) {
            errors.push("第 " + row.number + " 題" + (side === "start" ? "起點" : "終點") + "百分比 " + coord.percent + " 超出 0 至 100 範圍。");
          }
        });
      });
    }
    if (offsetErrors.length === 0 && pageCount != null) errors = errors.concat(validateRows(rows, templateResult.template.paper, pageCount));
    errors = offsetErrors.concat(errors);
    var affectedCount = rows.filter(function (row, index) {
      var original = templateResult.template.boundarySets.questions[index];
      return ["start", "end"].some(function (side) {
        return row[side].page !== original[side].page || row[side].percent !== original[side].percent;
      });
    }).length;
    return {
      ok: errors.length === 0,
      canApply: offsetErrors.length === 0,
      rows: rows,
      warnings: warnings,
      errors: errors,
      affectedCount: affectedCount
    };
  }

  function storageFrom(host) {
    try {
      var storage = host && host.localStorage;
      return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" ? storage : null;
    } catch (error) {
      return null;
    }
  }

  function loadStored(host) {
    var storage = storageFrom(host);
    if (!storage) return { ok: false, templates: [], invalidCount: 0, message: "此瀏覽器不允許本機儲存；仍可匯入及匯出範本 JSON。" };
    try {
      var raw = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(raw)) return { ok: false, templates: [], invalidCount: 0, message: "本機範本清單格式不正確；仍可匯入及匯出 JSON。" };
      var templates = [];
      var invalidCount = 0;
      raw.forEach(function (item) {
        var result = deserializeTemplate(item);
        if (result.ok) templates.push(result.template);
        else invalidCount += 1;
      });
      return { ok: true, templates: templates, invalidCount: invalidCount, message: "" };
    } catch (error) {
      return { ok: false, templates: [], invalidCount: 0, message: "無法讀取本機範本清單；仍可匯入及匯出 JSON。" };
    }
  }

  function saveStored(host, templates) {
    var storage = storageFrom(host);
    if (!storage) return { ok: false, message: "此瀏覽器不允許本機儲存；請匯出範本 JSON 備份。" };
    if (!Array.isArray(templates)) return { ok: false, message: "本機範本清單格式不正確。" };
    var clean = [];
    var errors = [];
    templates.forEach(function (item, index) {
      var result = deserializeTemplate(item);
      if (!result.ok) errors.push("第 " + (index + 1) + " 個範本：" + result.errors.join("；"));
      else clean.push(result.template);
    });
    if (errors.length) return { ok: false, message: errors.join("\n") };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(clean));
      return { ok: true, message: "範本清單已儲存在此瀏覽器。" };
    } catch (error) {
      return { ok: false, message: "無法儲存範本；請先匯出範本 JSON 備份。" };
    }
  }

  root.HkdseSplitTemplate = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    createTemplate: createTemplate,
    validateTemplate: validateTemplate,
    serializeTemplate: serializeTemplate,
    deserializeTemplate: deserializeTemplate,
    applyOffsets: applyOffsets,
    loadStored: loadStored,
    saveStored: saveStored
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.HkdseSplitTemplate;
})(typeof window !== "undefined" ? window : globalThis);
