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

  function normalizedPoint(point, label) {
    var x = Number(point && point.x); var y = Number(point && point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      throw new Error((label || "圈心") + "座標超出樣本頁。");
    }
    return { x: x, y: y };
  }

  function calibratedRows(firstY, pitch, count, groupSize, groupGapExtra) {
    var rowsCount = Math.floor(Number(count));
    var size = Math.floor(Number(groupSize) || 0);
    var gap = Number(groupGapExtra) || 0;
    if (!Number.isInteger(rowsCount) || rowsCount < 1 || rowsCount > 250 ||
        !Number.isFinite(firstY) || !Number.isFinite(pitch) || pitch <= 0 ||
        !Number.isInteger(size) || size < 0 || size > 250 || !Number.isFinite(gap) || gap < 0) {
      throw new Error("點圈校準的題數、行距或分組設定無效。");
    }
    if (!size) return { mode: "linear", start: firstY, pitch: pitch, count: rowsCount };
    var groups = [];
    for (var start = 0; start < rowsCount; start += size) {
      var group = [];
      for (var offset = 0; offset < Math.min(size, rowsCount - start); offset += 1) {
        group.push(firstY + (start + offset) * pitch + groups.length * gap);
      }
      groups.push(group);
    }
    return { mode: "list", groups: groups };
  }

  function createClickCalibration(options) {
    var settings = options || {};
    var optionPoints = Array.isArray(settings.optionPoints) ? settings.optionPoints.map(function (point, index) {
      return normalizedPoint(point, "第 " + (index + 1) + " 個選項圈");
    }) : [];
    if (optionPoints.length < 2 || optionPoints.length > 6) throw new Error("請點選 2 至 6 個選項圈。");
    for (var index = 1; index < optionPoints.length; index += 1) {
      if (optionPoints[index].x <= optionPoints[index - 1].x) throw new Error("選項圈須按由左至右點選。");
    }
    var firstQuestionNumber = Math.floor(Number(settings.firstQuestionNumber) || 1);
    var anchorQuestionNumber = Math.floor(Number(settings.anchorQuestionNumber));
    if (firstQuestionNumber < 1 || firstQuestionNumber > 250 || anchorQuestionNumber <= firstQuestionNumber || anchorQuestionNumber > 250) {
      throw new Error("第二題題號須大於第一題題號，並在 1 至 250 之間。");
    }
    var first = optionPoints[0];
    var anchor = normalizedPoint(settings.anchorPoint, "第二題 A 圈");
    var pitch = (anchor.y - first.y) / (anchorQuestionNumber - firstQuestionNumber);
    if (!(pitch > 0) || pitch > 0.15) throw new Error("兩題的垂直距離無效；請點同一欄較下方的題目。");
    var questionCount = Math.floor(Number(settings.questionCount));
    var groupSize = Math.floor(Number(settings.groupSize) || 0);
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 250 ||
        !Number.isInteger(groupSize) || groupSize < 0 || groupSize > 250) throw new Error("本欄題數或每組題數無效。");
    var gapExtra = groupSize ? pitch : 0;
    var gapAnchor = null;
    if (settings.nextGroupPoint) {
      if (!groupSize || questionCount <= groupSize) throw new Error("只有至少兩組題目才可量度組間空位。");
      gapAnchor = normalizedPoint(settings.nextGroupPoint, "下一組第一題 A 圈");
      gapExtra = gapAnchor.y - (first.y + groupSize * pitch);
      if (gapExtra < 0 || gapExtra > pitch * 10) throw new Error("組間距離無效；請點下一組第一題的 A 圈。");
    }
    var rows = calibratedRows(first.y, pitch, questionCount, groupSize, gapExtra);
    var ys = rowCoordinates(rows);
    if (ys.some(function (y) { return !Number.isFinite(y) || y < 0 || y > 1; })) throw new Error("生成的題目圈位超出樣本頁。");
    return { xs: optionPoints.map(function (point) { return point.x; }), rows: rows,
      firstQuestionNumber: firstQuestionNumber, questionCount: questionCount, groupSize: groupSize,
      pitch: pitch, groupGapExtra: gapExtra, groupGapInRows: pitch ? gapExtra / pitch : 0,
      optionOffsets: optionPoints.map(function (point) { return point.x - first.x; }),
      optionPoints: optionPoints, firstQuestionPoint: first, anchorPoint: anchor, gapAnchorPoint: gapAnchor };
  }

  function extendClickCalibration(base, firstOptionPoint, firstQuestionNumber, questionCount) {
    if (!base || !Array.isArray(base.optionOffsets) || !Number.isFinite(Number(base.pitch))) {
      throw new Error("請先完成第一欄點圈校準。");
    }
    var first = normalizedPoint(firstOptionPoint, "新欄第一題 A 圈");
    var count = Math.floor(Number(questionCount));
    var start = Math.floor(Number(firstQuestionNumber));
    if (!Number.isInteger(count) || count < 1 || count > 250 || !Number.isInteger(start) || start < 1 || start > 250) {
      throw new Error("新欄起始題號或題數無效。");
    }
    var xs = base.optionOffsets.map(function (offset) { return first.x + offset; });
    if (xs.some(function (x) { return x < 0 || x > 1; })) throw new Error("新欄選項圈超出樣本頁。");
    var rows = calibratedRows(first.y, Number(base.pitch), count, Number(base.groupSize), Number(base.groupGapExtra));
    if (rowCoordinates(rows).some(function (y) { return y < 0 || y > 1; })) throw new Error("新欄題目圈位超出樣本頁。");
    return { xs: xs, rows: rows, firstQuestionNumber: start, questionCount: count,
      groupSize: Number(base.groupSize), pitch: Number(base.pitch), groupGapExtra: Number(base.groupGapExtra),
      groupGapInRows: Number(base.groupGapInRows), optionOffsets: base.optionOffsets.slice(),
      optionPoints: xs.map(function (x) { return { x: x, y: first.y }; }), firstQuestionPoint: first,
      anchorPoint: null, gapAnchorPoint: null };
  }

  function createClickCalibratedZone(calibration, options) {
    if (!calibration || !Array.isArray(calibration.xs) || !calibration.rows) throw new Error("點圈校準資料不完整。");
    var xs = calibration.xs.map(Number); var ys = rowCoordinates(calibration.rows);
    var padding = 0.006;
    var x = Math.max(0, Math.min.apply(null, xs) - padding);
    var y = Math.max(0, Math.min.apply(null, ys) - padding);
    var right = Math.min(1, Math.max.apply(null, xs) + padding);
    var bottom = Math.min(1, Math.max.apply(null, ys) + padding);
    return { id: "click-zone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      type: "answer-mc", label: "選擇題答案欄", x: x, y: y, w: right - x, h: bottom - y,
      rowsPerColumn: calibration.questionCount, groupSize: calibration.groupSize, groupGap: calibration.groupGapInRows,
      numbering: "column-major", options: (options && options.options || ["A", "B", "C", "D"]).slice(),
      questionStart: calibration.firstQuestionNumber,
      clickCalibration: { xs: xs, rows: clone(calibration.rows) } };
  }

  function rowCoordinates(rows) {
    if (!rows || typeof rows !== "object") return [];
    if (rows.mode === "list") return (rows.groups || []).reduce(function (all, group) {
      return all.concat(Array.isArray(group) ? group.map(Number).filter(Number.isFinite) : []);
    }, []);
    if (rows.mode === "linear") {
      var count = Math.max(0, Math.min(250, Math.floor(Number(rows.count) || 0)));
      var start = Number(rows.start); var pitch = Number(rows.pitch);
      if (!Number.isFinite(start) || !Number.isFinite(pitch)) return [];
      return Array.from({ length: count }, function (_, index) { return start + index * pitch; });
    }
    return [];
  }

  function spatialGroups(items, axis, describe) {
    var descriptors = items.map(function (item, index) { return describe(item, index); });
    var parents = descriptors.map(function (_, index) { return index; });
    function find(index) {
      while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
      return index;
    }
    function join(left, right) {
      var leftRoot = find(left); var rightRoot = find(right);
      if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
    }
    descriptors.forEach(function (left, leftIndex) {
      descriptors.slice(leftIndex + 1).forEach(function (right, offset) {
        var rightIndex = leftIndex + offset + 1;
        var leftStart = axis === "x" ? left.left : left.top;
        var rightStart = axis === "x" ? right.left : right.top;
        var leftEnd = axis === "x" ? left.right : left.bottom;
        var rightEnd = axis === "x" ? right.right : right.bottom;
        var leftSize = axis === "x" ? left.width : left.height;
        var rightSize = axis === "x" ? right.width : right.height;
        var overlap = Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart);
        var startDifference = Math.abs(leftStart - rightStart);
        var halfSize = Math.min(leftSize, rightSize) / 2;
        if (overlap > 0 || startDifference < halfSize || startDifference < 1e-9) join(leftIndex, rightIndex);
      });
    });
    var byRoot = new Map();
    descriptors.forEach(function (descriptor, index) {
      var rootIndex = find(index);
      if (!byRoot.has(rootIndex)) byRoot.set(rootIndex, []);
      byRoot.get(rootIndex).push(descriptor);
    });
    var groups = Array.from(byRoot.values());
    groups.forEach(function (group) {
      group.sort(axis === "x"
        ? function (left, right) { return left.centerY - right.centerY || left.centerX - right.centerX || left.index - right.index; }
        : function (left, right) { return left.centerX - right.centerX || left.centerY - right.centerY || left.index - right.index; });
    });
    groups.sort(function (left, right) {
      var leftStart = Math.min.apply(null, left.map(function (entry) { return entry.left; }));
      var rightStart = Math.min.apply(null, right.map(function (entry) { return entry.left; }));
      if (axis === "y") {
        leftStart = Math.min.apply(null, left.map(function (entry) { return entry.top; }));
        rightStart = Math.min.apply(null, right.map(function (entry) { return entry.top; }));
      }
      return leftStart - rightStart || left[0].index - right[0].index;
    });
    return groups;
  }

  function zoneDescriptor(zone, index) {
    var left = Number(zone.x); var top = Number(zone.y);
    var width = Number(zone.w); var height = Number(zone.h);
    return { item: zone, index: index, left: left, right: left + width, width: width,
      top: top, bottom: top + height, height: height, centerX: left + width / 2, centerY: top + height / 2 };
  }

  function templateColumnDescriptor(column, index, block) {
    var xs = Array.isArray(column && column.xs) ? column.xs.map(Number).filter(Number.isFinite) : [];
    var left = xs.length ? Math.min.apply(null, xs) : 0;
    var right = xs.length ? Math.max.apply(null, xs) : left;
    var ys = rowCoordinates(column && (column.rows || block.rows));
    var top = ys.length ? Math.min.apply(null, ys) : 0;
    var bottom = ys.length ? Math.max.apply(null, ys) : top;
    return { item: column, index: index, left: left, right: right, width: right - left,
      top: top, bottom: bottom, height: bottom - top,
      centerX: xs.length ? xs.reduce(function (sum, value) { return sum + value; }, 0) / xs.length : left,
      centerY: top };
  }

  function sortAnswerZones(answerZones, numbering) {
    if (answerZones.length && answerZones.every(function (zone) {
      return zone && zone.clickCalibration && Number.isInteger(Number(zone.questionStart));
    })) {
      return answerZones.slice().sort(function (left, right) { return Number(left.questionStart) - Number(right.questionStart); });
    }
    var axis = numbering === "row-major" ? "y" : "x";
    return spatialGroups(answerZones, axis, zoneDescriptor).reduce(function (ordered, group) {
      return ordered.concat(group.map(function (entry) { return entry.item; }));
    }, []);
  }

  function templateColumnGroups(block) {
    var columns = Array.isArray(block && block.columns) ? block.columns : [];
    return spatialGroups(columns, "x", function (column, index) { return templateColumnDescriptor(column, index, block); });
  }

  function misorderedColumnGroups(definition) {
    var issues = [];
    (definition && Array.isArray(definition.blocks) ? definition.blocks : []).forEach(function (block) {
      if (block.numbering !== "column-major" || !Array.isArray(block.columns) || block.columns.length < 2) return;
      templateColumnGroups(block).forEach(function (group) {
        if (group.length < 2) return;
        var indices = group.map(function (entry) { return entry.index; });
        var originalOrder = indices.slice().sort(function (left, right) { return left - right; })
          .map(function (index) { return group.find(function (entry) { return entry.index === index; }); });
        var orderedByY = originalOrder.every(function (entry, index) {
          return index === 0 || originalOrder[index - 1].centerY <= entry.centerY;
        });
        var contiguous = Math.max.apply(null, indices) - Math.min.apply(null, indices) + 1 === indices.length;
        if (!orderedByY || !contiguous) issues.push({ blockId: block.id, indices: indices });
      });
    });
    return issues;
  }

  function reorderColumnMajorTemplate(definition) {
    var result = clone(definition);
    (result.blocks || []).forEach(function (block) {
      if (block.numbering !== "column-major" || !Array.isArray(block.columns)) return;
      block.columns = templateColumnGroups(block).reduce(function (ordered, group) {
        return ordered.concat(group.map(function (entry) { return entry.item; }));
      }, []);
    });
    return result;
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
      var numbering = settings[type + "Numbering"] === "row-major" ? "row-major" : "column-major";
      var columns = sortAnswerZones(answerZones.filter(function (zone) {
        return (zone.type === "answer-tf" ? "tf" : "mc") === type;
      }), numbering);
      if (!columns.length) return;
      if (columns.length > 20) throw new Error("每種題型最多可設 20 欄。");
      var optionsForType = type === "mc" ? (settings.mcOptions || ["A", "B", "C", "D"]) : ["T", "F"];
      var generatedColumns = columns.map(function (zone, columnIndex) {
        var rowCount = zone.clickCalibration ? answerRowCount(zone.clickCalibration.rows) :
          Math.max(1, Math.min(250, Math.floor(Number(zone.rowsPerColumn) || Number(settings.rowsPerColumn) || 1)));
        var columnOptions = answerOptions(zone.type, Array.isArray(zone.options) ? zone.options : optionsForType);
        var optionXs = zone.clickCalibration ? zone.clickCalibration.xs.map(Number) : centerRange(zone.x, zone.w, columnOptions.length, zone.w * 0.08);
        var rowSpec = zone.clickCalibration ? clone(zone.clickCalibration.rows) : answerRows(zone, rowCount);
        return { xs: optionXs, options: columnOptions,
          rows: rowSpec, wizardColumn: columnIndex };
      });
      var maxCount = Math.min(250, generatedColumns.reduce(function (sum, column) { return sum + answerRowCount(column.rows); }, 0));
      var baseOptions = generatedColumns[0].options;
      definition.blocks.push({ id: type, type: type, label: type === "mc" ? "選擇題" : "是非題",
        maxCount: maxCount, numbering: numbering,
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
  function pdfTextLines(items, tolerance) {
    var limit = Math.max(0.5, Number(tolerance) || 2.5);
    var positioned = (items || []).map(function (item, index) {
      var transform = item && item.transform;
      return {
        text: String(item && item.str || "").trim(),
        x: transform && Number.isFinite(Number(transform[4])) ? Number(transform[4]) : index,
        y: transform && Number.isFinite(Number(transform[5])) ? Number(transform[5]) : 0,
        index: index
      };
    }).filter(function (item) { return item.text; }).sort(function (a, b) {
      return b.y - a.y || a.x - b.x || a.index - b.index;
    });
    var lines = [];
    positioned.forEach(function (item) {
      var line = lines.find(function (candidate) { return Math.abs(candidate.y - item.y) <= limit; });
      if (!line) {
        line = { y: item.y, items: [] };
        lines.push(line);
      }
      line.items.push(item);
      line.y = line.items.reduce(function (sum, part) { return sum + part.y; }, 0) / line.items.length;
    });
    return lines.sort(function (a, b) { return b.y - a.y; }).map(function (line) {
      return line.items.sort(function (a, b) { return a.x - b.x || a.index - b.index; })
        .map(function (item) { return item.text; }).join(" ");
    });
  }
  function parseAnswerKeyText(text, questionCount, allowedOptions) {
    var count = Math.max(0, Math.min(250, Math.floor(Number(questionCount) || 0)));
    var options = Array.from(new Set((allowedOptions || []).map(function (option) { return String(option).trim().toUpperCase(); })));
    var normalized = String(text == null ? "" : text).normalize("NFKC").toUpperCase();
    var answers = {};
    var rejectedCount = 0;
    var unmatchedCount = 0;
    var conflicts = new Set();
    var lines = normalized.split(/\r?\n/);
    var consumed = new Set();
    var expression = /(?:^|[^0-9])([0-9]{1,3})[ \t]*[.、)）:：]?[ \t]*(?:答案[ \t]*[:：]?[ \t]*)?([A-Z])(?=$|[^A-Z])/g;
    var numberHeader = /^(?:題號|題目|QUESTION(?:[ \t]+(?:NO\.?|NUMBER))?|Q)[ \t]*[:：]?[ \t]*/;
    var answerHeader = /^(?:答案|ANS(?:WER)?S?)[ \t]*[:：]?[ \t]*/;
    function tokens(line) { return line.trim().split(/[ \t,，、;；|]+/).filter(Boolean); }
    function rowKind(line) {
      var value = line.trim();
      if (!value) return { type: "empty", values: [] };
      if (/^(?:題號|題目|QUESTION(?:[ \t]+(?:NO\.?|NUMBER))?|Q)(?:[ \t]*[:：]?[ \t]*(?:答案|ANS(?:WER)?S?))?$/.test(value) ||
          /^(?:答案|ANS(?:WER)?S?)$/.test(value)) return { type: "header", values: [] };
      var numberValue = value.replace(numberHeader, "");
      var numberTokens = tokens(numberValue);
      if (numberTokens.length && numberTokens.every(function (token) { return /^[0-9]{1,3}[.、)）:：]?$/.test(token); })) {
        return { type: "numbers", values: numberTokens.map(function (token) { return Number(token.replace(/[.、)）:：]$/, "")); }) };
      }
      var answerValue = value.replace(answerHeader, "");
      var answerTokens = tokens(answerValue);
      if (answerTokens.length && answerTokens.every(function (token) { return /^[A-Z]$/.test(token); })) {
        return { type: "letters", values: answerTokens };
      }
      return { type: "other", values: [] };
    }
    var rows = lines.map(rowKind);
    function addAnswer(questionValue, answer) {
      var question = Number(questionValue);
      if (!Number.isInteger(question) || question < 1 || question > count || options.indexOf(answer) < 0) {
        rejectedCount += 1;
        return;
      }
      if (conflicts.has(question)) { rejectedCount += 1; return; }
      if (Object.prototype.hasOwnProperty.call(answers, question)) {
        rejectedCount += 1;
        if (answers[question] !== answer) {
          delete answers[question];
          conflicts.add(question);
        }
        return;
      }
      answers[question] = answer;
    }
    rows.forEach(function (row, index) {
      if (row.type === "header" || consumed.has(index)) { consumed.add(index); return; }
      if (row.type === "numbers") {
        var next = index + 1;
        while (next < rows.length && (rows[next].type === "header" || rows[next].type === "empty")) { consumed.add(next); next += 1; }
        if (next < rows.length && rows[next].type === "letters") {
          consumed.add(index); consumed.add(next);
          if (row.values.length === rows[next].values.length) {
            row.values.forEach(function (question, offset) { addAnswer(question, rows[next].values[offset]); });
          } else {
            unmatchedCount += Math.max(row.values.length, rows[next].values.length);
            rejectedCount += Math.max(row.values.length, rows[next].values.length);
          }
        } else {
          consumed.add(index);
          unmatchedCount += row.values.length;
          rejectedCount += row.values.length;
        }
      } else if (row.type === "letters") {
        consumed.add(index);
        unmatchedCount += row.values.length;
        rejectedCount += row.values.length;
      }
    });
    lines.forEach(function (line, index) {
      if (consumed.has(index)) return;
      expression.lastIndex = 0;
      var match;
      while ((match = expression.exec(line))) addAnswer(match[1], match[2]);
    });
    return { answers: answers, rejectedCount: rejectedCount, matchedCount: Object.keys(answers).length,
      unmatchedCount: unmatchedCount, conflictingQuestions: Array.from(conflicts).sort(function (a, b) { return a - b; }) };
  }
  function identityRequirements(definition, detected) {
    var base = Object.assign({ grade: false, form: false, studentDigits: 0 }, detected || {});
    var manual = definition && definition.identity && definition.identity.manualFields || {};
    if (manual.class) { base.grade = true; base.form = false; }
    if (Number.isInteger(manual.studentNumberDigits) && manual.studentNumberDigits > 0) base.studentDigits = manual.studentNumberDigits;
    return { grade: Boolean(base.grade), form: Boolean(base.form), studentDigits: Math.max(0, Number(base.studentDigits) || 0) };
  }

  var api = { createTemplateFromZones: createTemplateFromZones, keyArray: keyArray, toggleAnswer: toggleAnswer,
    pdfTextLines: pdfTextLines, parseAnswerKeyText: parseAnswerKeyText,
    identityRequirements: identityRequirements, isLayoutPrivacyZone: isLayoutPrivacyZone, isIdentityGridZone: isIdentityGridZone,
    layoutPrivacyDecisionReady: layoutPrivacyDecisionReady, createLayoutPrivacyDefinition: createLayoutPrivacyDefinition,
    normalizeGridOptions: normalizeGridOptions, answerOptions: answerOptions, answerRows: answerRows,
    misorderedColumnGroups: misorderedColumnGroups, reorderColumnMajorTemplate: reorderColumnMajorTemplate,
    calibratedRows: calibratedRows, createClickCalibration: createClickCalibration,
    extendClickCalibration: extendClickCalibration, createClickCalibratedZone: createClickCalibratedZone,
    rowCoordinates: rowCoordinates };
  root.PdfMarkingChoiceWizard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
