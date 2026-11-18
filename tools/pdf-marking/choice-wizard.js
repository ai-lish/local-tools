(function (root) {
  "use strict";

  var DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  var MC_OPTIONS = ["A", "B", "C", "D", "E", "F"];
  var GRADE_OPTIONS = ["1", "2", "3", "4", "5", "6"];
  var GRADE_GRID_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  var FORM_GRID_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function spread(start, end, count) {
    if (count <= 1) return [(start + end) / 2];
    return Array.from({ length: count }, function (_, index) { return start + (end - start) * index / (count - 1); });
  }
  function centerRange(start, length, count, inset) {
    var margin = Math.min(length * 0.15, Math.max(0, inset || 0));
    return spread(start + margin, start + length - margin, count);
  }
  function zoneMask(zone) {
    var mask = { id: zone.id, label: zone.label, x: zone.x, y: zone.y, w: zone.w, h: zone.h };
    if (zone.type) mask.type = zone.type;
    if (typeof zone.redactForAi === "boolean") mask.redactForAi = zone.redactForAi;
    return mask;
  }

  function answerOptions(type, value) {
    var allowed = type === "answer-tf" ? ["T", "F"] : MC_OPTIONS;
    var raw = Array.isArray(value) ? value : String(value == null ? "ABCD" : value).split(/[，,\s]+/);
    var options = raw.map(function (option) { return String(option).trim().toUpperCase(); }).filter(Boolean);
    if (options.length < 2 || options.length > (type === "answer-tf" ? 2 : 6) ||
        options.some(function (option) { return allowed.indexOf(option) < 0; }) || new Set(options).size !== options.length) {
      throw new Error(type === "answer-tf" ? "是非題選項須為 T、F。" : "選擇題選項須為 2 至 6 個不重複的 A–F 標籤。");
    }
    return options;
  }

  function answerRows(zone, count) {
    var groupSize = Math.max(0, Math.min(250, Math.floor(Number(zone.groupSize) || 0)));
    var groupGap = Math.max(0, Math.min(10, Number(zone.groupGap) || 0));
    if (!groupSize) {
      var linear = centerRange(zone.y, zone.h, count, zone.h * 0.05);
      return { mode: "linear", start: linear[0], pitch: linear.length > 1 ? linear[1] - linear[0] : zone.h, count: linear.length };
    }
    var margin = zone.h * 0.05;
    var top = zone.y + margin;
    var bottom = zone.y + zone.h - margin;
    var groupsCount = Math.ceil(count / groupSize);
    var intervals = Math.max(1, count - 1 + (groupsCount - 1) * groupGap);
    var step = (bottom - top) / intervals;
    var groups = [];
    var logicalIndex = 0;
    for (var start = 0; start < count; start += groupSize) {
      var size = Math.min(groupSize, count - start);
      var group = [];
      for (var index = 0; index < size; index += 1) group.push(top + logicalIndex++ * step);
      groups.push(group);
      if (start + size < count) logicalIndex += groupGap;
    }
    return { mode: "list", groups: groups };
  }

  function answerRowCount(rows) {
    if (!rows) return 0;
    if (rows.mode === "list") return (rows.groups || []).reduce(function (total, group) {
      return total + (Array.isArray(group) ? group.length : 0);
    }, 0);
    return Number(rows.count) || 0;
  }

  function isLayoutPrivacyZone(zone) {
    return Boolean(zone && ["text-name", "text-subject", "text-other", "class-handwrite", "student-handwrite"].indexOf(zone.type) >= 0);
  }

  function isIdentityGridZone(zone) {
    return Boolean(zone && ["class-grade-grid", "class-form-grid", "student-number-grid"].indexOf(zone.type) >= 0);
  }

  function layoutPrivacyDecisionReady(zones, identitiesComplete, noTextIdentityConfirmed) {
    var hasTextIdentity = Array.isArray(zones) && zones.some(isLayoutPrivacyZone);
    return hasTextIdentity ? identitiesComplete === true : noTextIdentityConfirmed === true;
  }

  function createLayoutPrivacyDefinition(zones, noTextIdentityConfirmed) {
    var masks = (Array.isArray(zones) ? zones : []).filter(isLayoutPrivacyZone).map(zoneMask);
    return { kind: "choice", identity: { fields: [], masks: masks,
      noIdentityAreaDeclared: masks.length === 0 && noTextIdentityConfirmed === true } };
  }

  function normalizeGridOptions(type, value) {
    var allowed = type === "class-grade-grid" ? GRADE_GRID_LABELS : type === "class-form-grid" ? FORM_GRID_LABELS : null;
    if (!allowed) throw new Error("只可設定班別年級或班別字母圈格選項。");
    var defaults = type === "class-grade-grid" ? GRADE_OPTIONS.slice() : MC_OPTIONS.slice();
    var raw = value == null ? defaults : Array.isArray(value) ? value : String(value).split(/[，,]/);
    var options = raw.map(function (option) { return String(option).trim().toUpperCase(); }).filter(Boolean);
    if (options.length < 2 || options.length > 12 || options.some(function (option) { return allowed.indexOf(option) < 0; }) ||
        new Set(options).size !== options.length) {
      throw new Error(type === "class-grade-grid"
        ? "班別年級圈格選項須為 2 至 12 個不重複的 1–9 標籤，並以逗號分隔。"
        : "班別字母圈格選項須為 2 至 12 個不重複的 A–Z 標籤，並以逗號分隔。");
    }
    return options;
  }

  function createTemplateFromZones(options) {
    var settings = options || {};
    var templates = settings.templates || root.PdfMarkingTemplates;
    if (!templates || typeof templates.cloneTemplate !== "function") throw new Error("範本模組未載入。");
    var zones = Array.isArray(settings.zones) ? settings.zones : [];
    if (!zones.length) throw new Error("請先在樣本頁標示至少一個答案範圍。");
    if (zones.length > 20) throw new Error("範本最多可標示 20 個範圍。");
    var width = Number(settings.pageWidth); var height = Number(settings.pageHeight);
    if (!(width > 0) || !(height > 0)) throw new Error("樣本頁尺寸無效。");

    var definition = templates.cloneTemplate(templates.BUILTIN_TEMPLATES.find(function (entry) { return entry.kind === "choice"; }));
    definition.id = "custom:wizard-" + String(settings.id || Date.now().toString(36)).toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 48);
    definition.name = String(settings.name || "新建選擇題範本").trim().slice(0, 100) || "新建選擇題範本";
    definition.source = "custom";
    definition.page = { orientation: width >= height ? "landscape" : "portrait", aspect: width / height, aspectTolerance: 0.04 };
    definition.blocks = [];
    definition.identity = { fields: [], masks: [], noIdentityAreaDeclared: false };
    definition.notes = "只含圈位及遮罩座標；不含樣本、答案或學生資料。";

    var manuals = { class: false, studentNumberDigits: 0 };
    zones.forEach(function (zone, index) {
      var clean = Object.assign({}, zone);
      clean.id = String(clean.id || "zone-" + (index + 1)).slice(0, 80);
      clean.label = String(clean.label || "範圍 " + (index + 1)).slice(0, 80);
      if (clean.type === "class-handwrite") clean.label = "手寫班別：" + clean.label;
      if (clean.type === "student-handwrite") clean.label = "手寫學號：" + clean.label;
      ["x", "y", "w", "h"].forEach(function (key) { clean[key] = Number(clean[key]); });
      if (![clean.x, clean.y, clean.w, clean.h].every(Number.isFinite) || clean.x < 0 || clean.y < 0 || clean.w <= 0 || clean.h <= 0 || clean.x + clean.w > 1 || clean.y + clean.h > 1) {
        throw new Error("第 " + (index + 1) + " 個範圍超出頁面。");
      }
      if (clean.type === "text-name" || clean.type === "text-subject" || clean.type === "text-other" || clean.type === "class-handwrite" || clean.type === "student-handwrite" || clean.type === "class-grade-grid" || clean.type === "class-form-grid" || clean.type === "student-number-grid") {
        if (clean.type === "text-name" || clean.type === "class-handwrite" || clean.type === "student-handwrite") clean.redactForAi = true;
        else if (clean.type === "text-subject" || clean.type === "text-other") clean.redactForAi = clean.redactForAi !== false;
        definition.identity.masks.push(zoneMask(clean));
      }
      if (clean.type === "class-grade-grid" || clean.type === "class-form-grid") {
        var grade = clean.type === "class-grade-grid";
        var choices = normalizeGridOptions(clean.type, clean.options);
        var rows = centerRange(clean.y, clean.h, choices.length, clean.h * 0.12);
        definition.identity.fields.push({ id: grade ? "class-grade" : "class-form", label: grade ? "班別年級" : "班別字母",
          options: choices, x: clean.x + clean.w / 2, rows: { mode: "linear", start: rows[0], pitch: rows.length > 1 ? rows[1] - rows[0] : clean.h, count: rows.length } });
      } else if (clean.type === "student-number-grid") {
        var digits = Math.max(1, Math.min(12, Math.floor(Number(clean.digits) || 4)));
        var digitXs = centerRange(clean.x, clean.w, digits, clean.w * 0.06);
        var digitYs = centerRange(clean.y, clean.h, DIGITS.length, clean.h * 0.12);
        definition.identity.fields.push({ id: "student-number", label: "學號", digits: digits, xs: digitXs, options: DIGITS.slice(),
          rows: { mode: "linear", start: digitYs[0], pitch: digitYs[1] - digitYs[0], count: digitYs.length } });
      } else if (clean.type === "class-handwrite") manuals.class = true;
      else if (clean.type === "student-handwrite") manuals.studentNumberDigits = Math.max(1, Math.min(12, Math.floor(Number(clean.digits) || 4)));
    });

    var answerZones = zones.filter(function (zone) { return zone.type === "answer-mc" || zone.type === "answer-tf"; });
    ["mc", "tf"].forEach(function (type) {
      var columns = answerZones.filter(function (zone) { return (zone.type === "answer-tf" ? "tf" : "mc") === type; }).sort(function (a, b) { return a.x - b.x; });
      if (!columns.length) return;
      if (columns.length > 20) throw new Error("每種題型最多可設 20 欄。");
      var optionsForType = type === "mc" ? (settings.mcOptions || ["A", "B", "C", "D"]) : ["T", "F"];
      var generatedColumns = columns.map(function (zone, columnIndex) {
        var rowCount = Math.max(1, Math.min(250, Math.floor(Number(zone.rowsPerColumn) || Number(settings.rowsPerColumn) || 1)));
        var columnOptions = answerOptions(zone.type, Array.isArray(zone.options) ? zone.options : optionsForType);
        var optionXs = centerRange(zone.x, zone.w, columnOptions.length, zone.w * 0.08);
        var rowSpec = answerRows(zone, rowCount);
        return { xs: optionXs, options: columnOptions,
          rows: rowSpec, wizardColumn: columnIndex };
      });
      var maxCount = Math.min(250, generatedColumns.reduce(function (sum, column) { return sum + answerRowCount(column.rows); }, 0));
      var baseOptions = generatedColumns[0].options;
      definition.blocks.push({ id: type, type: type, label: type === "mc" ? "選擇題" : "是非題",
        maxCount: maxCount, numbering: settings[type + "Numbering"] === "row-major" ? "row-major" : "column-major",
        options: baseOptions.slice(),
        columns: generatedColumns.map(function (column) {
          var result = { xs: column.xs, rows: column.rows };
          if (JSON.stringify(column.options) !== JSON.stringify(baseOptions)) result.options = column.options.slice();
          return result;
        }),
        rows: clone(generatedColumns[0].rows) });
    });
    if (!definition.blocks.length) throw new Error("請至少標示一欄選擇題或是非題答案範圍。");
    if (definition.identity.fields.length > 10) throw new Error("身份圈格最多可設 10 欄。");
    if (definition.identity.masks.length > 20) throw new Error("身份遮罩範圍最多可設 20 個。");
    if (manuals.class || manuals.studentNumberDigits) definition.identity.manualFields = manuals;
    if (!definition.identity.masks.length && !definition.identity.fields.length) {
      if (settings.confirmNoIdentityArea !== true) throw new Error("請先確認「此答題紙沒有姓名等身份區」。");
      definition.identity.noIdentityAreaDeclared = true;
    }
    var cleanDefinition = templates.sanitizeTemplate(definition);
    var validation = templates.validateTemplate(cleanDefinition);
    if (!validation.ok) throw new Error(validation.errors.join(" "));
    return cleanDefinition;
  }

  function keyArray(value, count, options) {
    var source = Array.from(String(value || "").toUpperCase().replace(/\s/g, ""));
    return Array.from({ length: count }, function (_, index) {
      return options.indexOf(source[index]) >= 0 ? source[index] : "";
    });
  }
  function toggleAnswer(value, count, options, questionNumber, choice) {
    var answers = keyArray(value, count, options);
    var index = Number(questionNumber) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= count || options.indexOf(choice) < 0) return answers.join("");
    answers[index] = answers[index] === choice ? "" : choice;
    return answers.map(function (answer) { return answer || "?"; }).join("");
  }
  function identityRequirements(definition, detected) {
    var base = Object.assign({ grade: false, form: false, studentDigits: 0 }, detected || {});
    var manual = definition && definition.identity && definition.identity.manualFields || {};
    if (manual.class) { base.grade = true; base.form = false; }
    if (Number.isInteger(manual.studentNumberDigits) && manual.studentNumberDigits > 0) base.studentDigits = manual.studentNumberDigits;
    return { grade: Boolean(base.grade), form: Boolean(base.form), studentDigits: Math.max(0, Number(base.studentDigits) || 0) };
  }

  var api = { createTemplateFromZones: createTemplateFromZones, keyArray: keyArray, toggleAnswer: toggleAnswer,
    identityRequirements: identityRequirements, isLayoutPrivacyZone: isLayoutPrivacyZone, isIdentityGridZone: isIdentityGridZone,
    layoutPrivacyDecisionReady: layoutPrivacyDecisionReady, createLayoutPrivacyDefinition: createLayoutPrivacyDefinition,
    normalizeGridOptions: normalizeGridOptions, answerOptions: answerOptions, answerRows: answerRows };
  root.PdfMarkingChoiceWizard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
