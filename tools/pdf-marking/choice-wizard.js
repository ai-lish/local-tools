(function (root) {
  "use strict";

  var DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  var MC_OPTIONS = ["A", "B", "C", "D", "E", "F"];

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
    return { id: zone.id, label: zone.label, x: zone.x, y: zone.y, w: zone.w, h: zone.h };
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
        definition.identity.masks.push(zoneMask(clean));
      }
      if (clean.type === "class-grade-grid" || clean.type === "class-form-grid") {
        var grade = clean.type === "class-grade-grid";
        var choices = grade ? ["1", "2", "3", "4", "5", "6"] : ["A", "B", "C", "D", "E", "F"];
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
        var columnOptions = Array.isArray(zone.options) ? zone.options.slice() : optionsForType.slice();
        var optionXs = centerRange(zone.x, zone.w, columnOptions.length, zone.w * 0.08);
        var rowYs = centerRange(zone.y, zone.h, rowCount, zone.h * 0.05);
        return { xs: optionXs, options: columnOptions,
          rows: { mode: "linear", start: rowYs[0], pitch: rowYs.length > 1 ? rowYs[1] - rowYs[0] : zone.h, count: rowYs.length }, wizardColumn: columnIndex };
      });
      var maxCount = Math.min(250, generatedColumns.reduce(function (sum, column) { return sum + column.rows.count; }, 0));
      var baseOptions = generatedColumns[0].options;
      definition.blocks.push({ id: type, type: type, label: type === "mc" ? "選擇題" : "是非題",
        maxCount: maxCount, numbering: settings[type + "Numbering"] === "row-major" ? "row-major" : "column-major",
        options: baseOptions.slice(),
        columns: generatedColumns.map(function (column) {
          var result = { xs: column.xs, rows: column.rows };
          if (JSON.stringify(column.options) !== JSON.stringify(baseOptions)) result.options = column.options.slice();
          return result;
        }),
        rows: { mode: "linear", start: generatedColumns[0].rows.start, pitch: generatedColumns[0].rows.pitch, count: generatedColumns[0].rows.count } });
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

  var api = { createTemplateFromZones: createTemplateFromZones, keyArray: keyArray, toggleAnswer: toggleAnswer, identityRequirements: identityRequirements };
  root.PdfMarkingChoiceWizard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
