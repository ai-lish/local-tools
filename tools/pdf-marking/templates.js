(function (root) {
  "use strict";

  var MAX_JSON_BYTES = 200 * 1024;
  var MC_OPTIONS = ["A", "B", "C", "D", "E", "F"];
  var TF_OPTIONS = ["T", "F"];
  var DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  var CHOICE_TEMPLATE = {
    schema: "pdf-marking-template", version: 1,
    id: "builtin:choice-60x4-tf10", name: "本校多項選擇題答題紙", kind: "choice", source: "builtin",
    page: { orientation: "portrait", aspect: 0.7071, aspectTolerance: 0.03 },
    bubble: { radius: 0.0077, localSearch: 0.0065, maxLocalCorrection: 0.0062, minRingInk: 0.24 },
    blocks: [
      {
        id: "mc", type: "mc", label: "選擇題", options: ["A", "B", "C", "D"], maxCount: 60,
        numbering: "column-major",
        columns: [
          { xs: [0.1413, 0.1786, 0.2151, 0.2516] },
          { xs: [0.4405, 0.4762, 0.5127, 0.5492] },
          { xs: [0.7389, 0.7754, 0.8119, 0.8484] }
        ],
        rows: { mode: "list", groups: [
          [0.3751, 0.3960, 0.4169, 0.4384, 0.4593],
          [0.5016, 0.5231, 0.5436, 0.5655, 0.5870],
          [0.6288, 0.6491, 0.6711, 0.6915, 0.7135],
          [0.7553, 0.7757, 0.7977, 0.8186, 0.8401],
          [0.8816, 0.9033, 0.9248, 0.9463, 0.9672]
        ] }
      },
      {
        id: "tf", type: "tf", label: "是非題", options: TF_OPTIONS.slice(), maxCount: 10,
        numbering: "column-major", columns: [{ xs: [0.7381, 0.8119] }],
        rows: { mode: "linear", start: 0.7446, pitch: 0.0214, count: 10 }
      }
    ],
    identity: {
      fields: [
        { id: "class-grade", label: "班別年級", options: ["1", "2", "3", "4", "5", "6"],
          x: 0.5893, rows: { mode: "linear", start: 0.0774, pitch: 0.0213, count: 6 } },
        { id: "class-form", label: "班別字母", options: ["A", "B", "C", "D", "E", "F"],
          x: 0.6665, rows: { mode: "linear", start: 0.0774, pitch: 0.0213, count: 6 } },
        { id: "student-number", label: "學號", digits: 2, xs: [0.8115, 0.8504], options: DIGITS.slice(),
          rows: { mode: "linear", start: 0.0774, pitch: 0.02135, count: 10 } }
      ],
      masks: [{ id: "header", label: "姓名／班別／學號區", x: 0, y: 0, w: 1, h: 0.33 }],
      noIdentityAreaDeclared: false
    },
    alignment: {
      method: "bubble-grid", search: { dx: 0.012, dy: 0.008, angle: 0.8, scale: 0.015 },
      limits: { dx: 0.012, dy: 0.012 }, metadataSearchPixels: 15,
      minGridScore: 0.22, rowShiftGuard: { mode: "group-gaps", maxInk: 0.14 }, anchors: []
    },
    notes: "不含任何學生資料"
  };
  var DICTATION_TEMPLATE = {
    schema: "pdf-marking-template", version: 1,
    id: "builtin:dictation-2seg", name: "本校金句默書紙", kind: "dictation", source: "builtin",
    page: { orientation: "portrait", aspect: 0.7071, aspectTolerance: 0.03 },
    grid: {
      detect: "printed-lines", scan: { x: [0.04, 0.96], y: [0.13, 0.76] },
      row: { cellsPerRow: 20, startX: [0.05, 0.11], step: [0.035, 0.044], scanX: [0.04, 0.94],
        height: [0.028, 0.041], expectedHeight: 0.034 },
      fallback: { x: 0.076, y: 0.267, cellWidth: 0.04, rowHeight: 0.034 }
    },
    segments: [
      { id: 1, label: "第一段", band: [0.19, 0.38], targetTop: 0.267 },
      { id: 2, label: "第二段", band: [0.38, 0.70], targetTop: 0.50 }
    ],
    identity: {
      fields: [], masks: [{ id: "header", label: "姓名／班別／學號區", x: 0, y: 0, w: 1, h: 0.13 }],
      noIdentityAreaDeclared: false
    },
    scoring: { rule: "gas-half-point" }, notes: "不含任何學生資料"
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function isFiniteIn(value, low, high) { return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high; }
  function unique(values) { return new Set(values).size === values.length; }
  function safeText(value, maximum) { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
  function rowValues(rows) {
    if (!rows || typeof rows !== "object") return [];
    if (rows.mode === "list") return Array.isArray(rows.groups) ? rows.groups.reduce(function (all, group) {
      return all.concat(Array.isArray(group) ? group : []);
    }, []) : [];
    if (rows.mode === "linear" && Number.isInteger(rows.count) && rows.count >= 0 && Number.isFinite(rows.start) && Number.isFinite(rows.pitch)) {
      var values = [];
      for (var index = 0; index < rows.count; index += 1) values.push(rows.start + index * rows.pitch);
      return values;
    }
    return [];
  }
  function boundedCount(value, maximum, fallback) {
    if (value == null) return fallback;
    var count = Number(value);
    if (!Number.isFinite(count)) return fallback;
    return Math.max(0, Math.min(maximum, Math.floor(count)));
  }
  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  var BUILTIN_TEMPLATES = deepFreeze([CHOICE_TEMPLATE, DICTATION_TEMPLATE]);

  function expandChoiceTemplate(definition, counts) {
    var def = definition || BUILTIN_TEMPLATES[0];
    if (!def || def.kind !== "choice" || !Array.isArray(def.blocks)) throw new Error("選擇題範本格式不正確。");
    var requested = counts || {};
    var bubbles = []; var items = []; var typeNumbers = { mc: 0, tf: 0 };
    function appendQuestion(block, columnIndex, rowIndex, yValues, limit) {
      if (typeNumbers[block.type] >= limit) return false;
      typeNumbers[block.type] += 1;
      var number = typeNumbers[block.type]; var y = yValues[rowIndex];
      var choices = block.columns[columnIndex].xs.map(function (x, optionIndex) {
        return { x: x, y: y, type: block.type, number: number, option: block.options[optionIndex] };
      });
      choices.forEach(function (bubble) { bubbles.push(bubble); });
      items.push({ type: block.type, number: number, choices: choices });
      return true;
    }
    function countFor(block) {
      var direct = requested[block.id];
      if (direct == null) direct = block.type === "mc" ? requested.mcCount : requested.tfCount;
      return boundedCount(direct, block.maxCount, block.maxCount);
    }
    def.blocks.forEach(function (block) {
      var ys = rowValues(block.rows); var limit = countFor(block);
      if (block.numbering === "row-major") {
        for (var rowIndex = 0; rowIndex < ys.length && typeNumbers[block.type] < limit; rowIndex += 1) {
          for (var columnIndex = 0; columnIndex < block.columns.length && typeNumbers[block.type] < limit; columnIndex += 1) {
            appendQuestion(block, columnIndex, rowIndex, ys, limit);
          }
        }
      } else {
        for (var col = 0; col < block.columns.length && typeNumbers[block.type] < limit; col += 1) {
          for (var row = 0; row < ys.length && typeNumbers[block.type] < limit; row += 1) appendQuestion(block, col, row, ys, limit);
        }
      }
    });

    var gradeOptions = []; var formOptions = []; var idColumns = [];
    var gradeField = def.identity && def.identity.fields.find(function (field) { return field.id === "class-grade"; });
    var formField = def.identity && def.identity.fields.find(function (field) { return field.id === "class-form"; });
    var gradeYs = gradeField ? rowValues(gradeField.rows) : [];
    var formYs = formField ? rowValues(formField.rows) : [];
    for (var classRow = 0; classRow < Math.max(gradeYs.length, formYs.length); classRow += 1) {
      if (gradeField && classRow < gradeYs.length) {
        var gradeBubble = { x: gradeField.x, y: gradeYs[classRow], type: "class-grade", option: gradeField.options[classRow] };
        bubbles.push(gradeBubble); gradeOptions.push(gradeBubble);
      }
      if (formField && classRow < formYs.length) {
        var formBubble = { x: formField.x, y: formYs[classRow], type: "class-form", option: formField.options[classRow] };
        bubbles.push(formBubble); formOptions.push(formBubble);
      }
    }
    var idField = def.identity && def.identity.fields.find(function (field) { return field.id === "student-number"; });
    if (idField) {
      for (var digitColumn = 0; digitColumn < idField.digits; digitColumn += 1) {
        var digitOptions = []; var digitYs = rowValues(idField.rows);
        for (var digit = 0; digit < idField.options.length && digit < digitYs.length; digit += 1) {
          var digitBubble = { x: idField.xs[digitColumn], y: digitYs[digit], type: "student-number", column: digitColumn, option: idField.options[digit] };
          bubbles.push(digitBubble); digitOptions.push(digitBubble);
        }
        idColumns.push(digitOptions);
      }
    }
    var expanded = { bubbles: bubbles, items: items, classGrade: gradeOptions, classForm: formOptions, studentNumber: idColumns };
    Object.defineProperty(expanded, "params", { value: choiceParameters(def), enumerable: false });
    return expanded;
  }

  function choiceParameters(definition) {
    var def = definition || BUILTIN_TEMPLATES[0];
    var alignment = def.alignment || {};
    var bubble = def.bubble || {};
    var questionItems = [];
    (def.blocks || []).filter(function (block) { return block.type === "mc"; }).forEach(function (block) {
      var ys = rowValues(block.rows);
      var count = 0;
      function add(columnIndex, rowIndex) {
        questionItems.push({ choices: block.columns[columnIndex].xs.map(function (x) { return { x: x, y: ys[rowIndex] }; }) });
        count += 1;
      }
      if (block.numbering === "row-major") {
        for (var rowIndex = 0; rowIndex < ys.length && count < block.maxCount; rowIndex += 1) {
          for (var columnIndex = 0; columnIndex < block.columns.length && count < block.maxCount; columnIndex += 1) add(columnIndex, rowIndex);
        }
      } else {
        for (var column = 0; column < block.columns.length && count < block.maxCount; column += 1) {
          for (var row = 0; row < ys.length && count < block.maxCount; row += 1) add(column, row);
        }
      }
    });
    var groupGapPoints = [];
    for (var itemIndex = 0; itemIndex < questionItems.length - 1; itemIndex += 1) {
      var before = questionItems[itemIndex]; var after = questionItems[itemIndex + 1];
      var left = before.choices[0]; var right = after.choices[0];
      if (Math.abs(left.x - right.x) > 0.03 || right.y - left.y < 0.03) continue;
      var gapY = (left.y + right.y) / 2;
      before.choices.forEach(function (point) { groupGapPoints.push({ x: point.x, y: gapY, type: "group-gap" }); });
    }
    return {
      radius: bubble.radius == null ? 0.0077 : bubble.radius,
      localSearch: bubble.localSearch == null ? 0.0065 : bubble.localSearch,
      maxLocalCorrection: bubble.maxLocalCorrection == null ? 0.0062 : bubble.maxLocalCorrection,
      minLocalCircleInk: bubble.minRingInk == null ? 0.24 : bubble.minRingInk,
      minGridScore: alignment.minGridScore == null ? 0.22 : alignment.minGridScore,
      maxGroupGapInk: alignment.rowShiftGuard && alignment.rowShiftGuard.maxInk != null ? alignment.rowShiftGuard.maxInk : 0.14,
      groupGapPoints: groupGapPoints,
      search: clone(alignment.search || { dx: 0.012, dy: 0.008, angle: 0.8, scale: 0.015 }),
      limits: clone(alignment.limits || { dx: 0.012, dy: 0.012 }),
      metadataSearchPixels: Number.isFinite(alignment.metadataSearchPixels) ? alignment.metadataSearchPixels : 15,
      rowShiftGuard: alignment.rowShiftGuard ? alignment.rowShiftGuard.mode : "group-gaps",
      mcOptions: (def.blocks.find(function (block) { return block.type === "mc"; }) || { options: MC_OPTIONS.slice(0, 4) }).options.slice(),
      tfOptions: (def.blocks.find(function (block) { return block.type === "tf"; }) || { options: TF_OPTIONS.slice() }).options.slice()
    };
  }

  function dictationParams(definition) {
    var def = definition || BUILTIN_TEMPLATES[1];
    if (!def || def.kind !== "dictation") throw new Error("默書範本格式不正確。");
    return { grid: clone(def.grid), segments: clone(def.segments), scoring: clone(def.scoring) };
  }

  function identityMaskRects(definition) {
    return ((definition && definition.identity && definition.identity.masks) || []).map(function (mask) {
      return { id: mask.id, label: mask.label, x: mask.x, y: mask.y, w: mask.w, h: mask.h };
    });
  }

  function sanitizeRowSpec(rows) {
    if (!isObject(rows)) return rows;
    if (rows.mode === "list") return { mode: "list", groups: Array.isArray(rows.groups) ? rows.groups.map(function (group) {
      return Array.isArray(group) ? group.slice() : group;
    }) : rows.groups };
    if (rows.mode === "linear") return { mode: "linear", start: rows.start, pitch: rows.pitch, count: rows.count };
    return { mode: rows.mode };
  }
  function sanitizeTemplate(raw) {
    if (!isObject(raw)) return raw;
    var clean = {
      schema: raw.schema, version: raw.version,
      id: raw.id, name: raw.name, kind: raw.kind,
      source: raw.source === "builtin" ? "builtin" : "custom"
    };
    if (isObject(raw.page)) clean.page = { orientation: raw.page.orientation, aspect: raw.page.aspect, aspectTolerance: raw.page.aspectTolerance };
    if (raw.kind === "choice") {
      if (isObject(raw.bubble)) clean.bubble = {
        radius: raw.bubble.radius, localSearch: raw.bubble.localSearch, maxLocalCorrection: raw.bubble.maxLocalCorrection,
        minRingInk: raw.bubble.minRingInk
      };
      clean.blocks = Array.isArray(raw.blocks) ? raw.blocks.map(function (block) {
        if (!isObject(block)) return block;
        return {
          id: block.id, type: block.type, label: block.label,
          options: Array.isArray(block.options) ? block.options.slice() : block.options,
          maxCount: block.maxCount, numbering: block.numbering,
          columns: Array.isArray(block.columns) ? block.columns.map(function (column) {
            return isObject(column) ? { xs: Array.isArray(column.xs) ? column.xs.slice() : column.xs } : column;
          }) : block.columns,
          rows: sanitizeRowSpec(block.rows)
        };
      }) : raw.blocks;
      if (isObject(raw.identity)) clean.identity = {
        fields: Array.isArray(raw.identity.fields) ? raw.identity.fields.map(function (field) {
          if (!isObject(field)) return field;
          var result = { id: field.id, label: field.label };
          if (field.options != null) result.options = Array.isArray(field.options) ? field.options.slice() : field.options;
          if (field.digits != null) result.digits = field.digits;
          if (field.x != null) result.x = field.x;
          if (field.xs != null) result.xs = Array.isArray(field.xs) ? field.xs.slice() : field.xs;
          if (field.rows != null) result.rows = sanitizeRowSpec(field.rows);
          return result;
        }) : raw.identity.fields,
        masks: Array.isArray(raw.identity.masks) ? raw.identity.masks.map(function (mask) {
          return isObject(mask) ? { id: mask.id, label: mask.label, x: mask.x, y: mask.y, w: mask.w, h: mask.h } : mask;
        }) : raw.identity.masks,
        noIdentityAreaDeclared: raw.identity.noIdentityAreaDeclared === true
      };
      if (isObject(raw.alignment)) clean.alignment = {
        method: raw.alignment.method,
        search: isObject(raw.alignment.search) ? {
          dx: raw.alignment.search.dx, dy: raw.alignment.search.dy, angle: raw.alignment.search.angle, scale: raw.alignment.search.scale
        } : raw.alignment.search,
        limits: isObject(raw.alignment.limits) ? { dx: raw.alignment.limits.dx, dy: raw.alignment.limits.dy } : raw.alignment.limits,
        metadataSearchPixels: raw.alignment.metadataSearchPixels,
        minGridScore: raw.alignment.minGridScore,
        rowShiftGuard: isObject(raw.alignment.rowShiftGuard) ? {
          mode: raw.alignment.rowShiftGuard.mode, maxInk: raw.alignment.rowShiftGuard.maxInk
        } : raw.alignment.rowShiftGuard,
        anchors: Array.isArray(raw.alignment.anchors) ? raw.alignment.anchors.map(function (anchor) {
          return isObject(anchor) ? { x: anchor.x, y: anchor.y, shape: anchor.shape } : anchor;
        }) : raw.alignment.anchors
      };
    } else if (raw.kind === "dictation") {
      if (isObject(raw.grid)) clean.grid = {
        detect: raw.grid.detect,
        scan: isObject(raw.grid.scan) ? { x: raw.grid.scan.x, y: raw.grid.scan.y } : raw.grid.scan,
        row: isObject(raw.grid.row) ? { cellsPerRow: raw.grid.row.cellsPerRow, startX: raw.grid.row.startX,
          step: raw.grid.row.step, scanX: raw.grid.row.scanX, height: raw.grid.row.height, expectedHeight: raw.grid.row.expectedHeight } : raw.grid.row,
        fallback: isObject(raw.grid.fallback) ? { x: raw.grid.fallback.x, y: raw.grid.fallback.y,
          cellWidth: raw.grid.fallback.cellWidth, rowHeight: raw.grid.fallback.rowHeight } : raw.grid.fallback
      };
      clean.segments = Array.isArray(raw.segments) ? raw.segments.map(function (segment) {
        return isObject(segment) ? { id: segment.id, label: segment.label, band: segment.band, targetTop: segment.targetTop } : segment;
      }) : raw.segments;
      if (isObject(raw.identity)) clean.identity = {
        fields: Array.isArray(raw.identity.fields) ? raw.identity.fields.map(function (field) {
          if (!isObject(field)) return field;
          var result = { id: field.id, label: field.label };
          if (field.options != null) result.options = Array.isArray(field.options) ? field.options.slice() : field.options;
          if (field.digits != null) result.digits = field.digits;
          if (field.x != null) result.x = field.x;
          if (field.xs != null) result.xs = Array.isArray(field.xs) ? field.xs.slice() : field.xs;
          if (field.rows != null) result.rows = sanitizeRowSpec(field.rows);
          return result;
        }) : raw.identity.fields,
        masks: Array.isArray(raw.identity.masks) ? raw.identity.masks.map(function (mask) {
          return isObject(mask) ? { id: mask.id, label: mask.label, x: mask.x, y: mask.y, w: mask.w, h: mask.h } : mask;
        }) : raw.identity.masks,
        noIdentityAreaDeclared: raw.identity.noIdentityAreaDeclared === true
      };
      if (isObject(raw.scoring)) clean.scoring = { rule: raw.scoring.rule };
    }
    if (typeof raw.notes === "string" && raw.notes.length <= 500) clean.notes = raw.notes;
    return clean;
  }

  function validateRows(rows, path, errors) {
    if (!isObject(rows)) { errors.push(path + "：缺少行座標。"); return []; }
    if (rows.mode === "list") {
      if (!Array.isArray(rows.groups) || !rows.groups.length) { errors.push(path + "：分組行座標必須是非空陣列。"); return []; }
      rows.groups.forEach(function (group, groupIndex) {
        if (!Array.isArray(group) || !group.length) errors.push(path + "：第 " + (groupIndex + 1) + " 組必須有行座標。");
        else group.forEach(function (value) { if (!isFiniteIn(value, 0, 1)) errors.push(path + "：行座標須介乎 0 至 1。"); });
      });
    } else if (rows.mode === "linear") {
      if (!isFiniteIn(rows.start, 0, 1) || !isFiniteIn(rows.pitch, 0.00001, 1) || !Number.isInteger(rows.count) || rows.count < 1 || rows.count > 500) {
        errors.push(path + "：直線行座標的起點、間距或數量不正確。");
      } else if (!isFiniteIn(rows.start + (rows.count - 1) * rows.pitch, 0, 1)) errors.push(path + "：最後一行超出頁面範圍。");
    } else errors.push(path + "：行座標模式只支援 list 或 linear。");
    return rowValues(rows);
  }

  function validateIdentity(identity, errors) {
    if (!isObject(identity)) { errors.push("身份資料區設定缺失。"); return; }
    if (!Array.isArray(identity.fields) || identity.fields.length > 10) errors.push("身份欄位須為陣列（最多 10 欄）。");
    else {
      var ids = identity.fields.map(function (field) { return isObject(field) ? field.id : ""; });
      if (!unique(ids)) errors.push("身份欄位 ID 不可重複。");
      identity.fields.forEach(function (field) {
        if (!isObject(field) || ["class-grade", "class-form", "student-number"].indexOf(field.id) < 0) {
          errors.push("身份欄位只支援班別年級、班別字母及學號圈格。"); return;
        }
        if (!safeText(field.label || field.id, 80) || !Array.isArray(field.options) || !field.options.length || !unique(field.options) ||
            field.options.some(function (option) { return typeof option !== "string" || option.length > 8; })) {
          errors.push("身份欄位選項不正確。"); return;
        }
        if (field.id === "student-number") {
          if (!Number.isInteger(field.digits) || field.digits < 1 || field.digits > 12 || !Array.isArray(field.xs) || field.xs.length !== field.digits ||
              field.xs.some(function (x) { return !isFiniteIn(x, 0, 1); }) || field.options.some(function (option) { return DIGITS.indexOf(option) < 0; })) {
            errors.push("學號圈格的位數、欄座標或數字選項不正確。");
          }
        } else if (!isFiniteIn(field.x, 0, 1) || field.options.some(function (option) { return field.id === "class-grade" ? !/^[1-6]$/.test(option) : !/^[A-F]$/.test(option); })) {
          errors.push("班別圈格座標或選項不正確。");
        }
        var ys = validateRows(field.rows, "身份圈格", errors);
        if (ys.length < field.options.length) errors.push("身份圈格的行數少於選項數。");
      });
    }
    if (!Array.isArray(identity.masks) || identity.masks.length > 20) errors.push("身份遮蔽區須為陣列（最多 20 個）。");
    else identity.masks.forEach(function (mask) {
      if (!isObject(mask) || !safeText(mask.id || "mask", 80) || !["x", "y", "w", "h"].every(function (key) { return isFiniteIn(mask[key], 0, 1); }) ||
          mask.w <= 0 || mask.h <= 0 || mask.x + mask.w > 1 || mask.y + mask.h > 1) errors.push("身份遮蔽區必須完全位於頁面內。");
    });
    if (Array.isArray(identity.masks) && !identity.masks.length && identity.noIdentityAreaDeclared !== true) errors.push("請設定身份遮蔽區，或明確聲明此紙沒有身份資料區。");
  }

  function validateTemplate(definition) {
    var errors = []; var warnings = [];
    var def = definition;
    if (!isObject(def)) return { ok: false, errors: ["範本必須是 JSON 物件。"], warnings: [] };
    if (def.schema !== "pdf-marking-template") errors.push("範本 schema 必須是 pdf-marking-template。");
    if (def.version !== 1) errors.push("目前只支援範本版本 1。");
    var idValid = safeText(def.id, 80) && /^(builtin|custom):[a-z0-9][a-z0-9._-]{0,60}$/i.test(def.id);
    if (!idValid) errors.push("範本 ID 格式不正確。");
    if (!safeText(def.name, 100)) errors.push("範本名稱不可空白，且須少於 100 字。");
    if (["choice", "dictation"].indexOf(def.kind) < 0) errors.push("範本類型只支援選擇題或默書。");
    if (def.source !== "builtin" && def.source !== "custom") errors.push("範本來源只支援內置或自訂。");
    if (idValid && (def.id.indexOf("builtin:") === 0) !== (def.source === "builtin")) errors.push("內置與自訂範本的 ID 前綴不相符。");
    if (!isObject(def.page) || ["portrait", "landscape"].indexOf(def.page.orientation) < 0 || !isFiniteIn(def.page.aspect, 0.3, 3) ||
        !isFiniteIn(def.page.aspectTolerance, 0, 0.5)) errors.push("紙張方向或寬高比設定不正確。");
    if (def.kind === "choice") {
      if (!isObject(def.bubble) || !isFiniteIn(def.bubble.radius, 0.003, 0.03) || !isFiniteIn(def.bubble.localSearch, 0.001, 0.03) ||
          !isFiniteIn(def.bubble.maxLocalCorrection, 0.001, 0.03) || !isFiniteIn(def.bubble.minRingInk, 0, 1)) errors.push("圈格半徑或局部校正範圍不正確。");
      if (!Array.isArray(def.blocks) || !def.blocks.length || def.blocks.length > 8) errors.push("題目區必須有 1 至 8 個區塊。");
      else {
        var blockIds = def.blocks.map(function (block) { return isObject(block) ? block.id : ""; });
        if (!unique(blockIds)) errors.push("題目區 ID 不可重複。");
        var blockTypes = def.blocks.map(function (block) { return isObject(block) ? block.type : ""; });
        if (!unique(blockTypes)) errors.push("每種題型只可設定一個區塊。");
        def.blocks.forEach(function (block) {
          if (!isObject(block) || !safeText(block.id, 40) || ["mc", "tf"].indexOf(block.type) < 0) {
            errors.push("題目區 ID 或類型不正確。"); return;
          }
          var optionsValid = Array.isArray(block.options) && block.options.length >= 2 && block.options.length <= 6 && unique(block.options) &&
            block.options.every(function (option) { return typeof option === "string" && (block.type === "tf" ? TF_OPTIONS.indexOf(option) >= 0 : MC_OPTIONS.indexOf(option) >= 0); });
          if (!optionsValid) errors.push("題目選項須為 2 至 6 個有效選項，而且不可重複。");
          if (!Number.isInteger(block.maxCount) || block.maxCount < 1 || block.maxCount > 250 ||
              ["column-major", "row-major"].indexOf(block.numbering) < 0) errors.push("題數上限或題號排列方式不正確。");
          if (!Array.isArray(block.columns) || !block.columns.length || block.columns.length > 20) errors.push("題目圈欄數不正確。");
          else block.columns.forEach(function (column) {
            if (!isObject(column) || !Array.isArray(column.xs) || !optionsValid || column.xs.length !== block.options.length ||
                column.xs.some(function (x) { return !isFiniteIn(x, 0, 1); })) errors.push("每欄選項圈座標數須與選項數相同，且介乎 0 至 1。");
            else for (var xIndex = 1; xIndex < column.xs.length; xIndex += 1) {
              if (column.xs[xIndex] - column.xs[xIndex - 1] < (isObject(def.bubble) && Number.isFinite(def.bubble.radius) ? def.bubble.radius : 0.003) * 2.2) errors.push("同題選項圈之間距離不足。");
            }
          });
          var ys = validateRows(block.rows, "題目區「" + block.id + "」", errors);
          if (Array.isArray(block.columns) && block.maxCount > 0 && block.columns.length * ys.length < block.maxCount) errors.push("題目區圈格總數少於題數上限。");
          if (safeText(block.label, 80) === false) errors.push("題目區標籤不可空白。");
        });
      }
      if (!isObject(def.alignment) || def.alignment.method !== "bubble-grid" || !isObject(def.alignment.search) ||
          !isFiniteIn(def.alignment.search.dx, 0, 0.05) || !isFiniteIn(def.alignment.search.dy, 0, 0.05) ||
          !isFiniteIn(def.alignment.search.angle, 0, 5) || !isFiniteIn(def.alignment.search.scale, 0, 0.2) ||
          !isFiniteIn(def.alignment.minGridScore, 0, 1) || !isObject(def.alignment.rowShiftGuard) ||
          ["group-gaps", "edge-sentinels"].indexOf(def.alignment.rowShiftGuard.mode) < 0 || !isFiniteIn(def.alignment.rowShiftGuard.maxInk, 0, 1) ||
          !Array.isArray(def.alignment.anchors) || def.alignment.anchors.length > 8) errors.push("圈格對齊設定不正確。");
      if (!isObject(def.alignment) || !isObject(def.alignment.limits) ||
          !isFiniteIn(def.alignment.limits.dx, 0.001, 0.05) || !isFiniteIn(def.alignment.limits.dy, 0.001, 0.05) ||
          !Number.isInteger(def.alignment.metadataSearchPixels) || def.alignment.metadataSearchPixels < 0 || def.alignment.metadataSearchPixels > 100) {
        errors.push("圈格校正界限或身份欄搜尋範圍不正確。");
      }
      if (isObject(def.alignment) && def.alignment.rowShiftGuard && def.alignment.rowShiftGuard.mode === "edge-sentinels") {
        warnings.push("此範本使用均勻行距端點校驗；目前版本仍沿用題組間距定位，讀圈結果必須逐題覆核。");
      }
      validateIdentity(def.identity, errors);
    } else if (def.kind === "dictation") {
      if (!isObject(def.grid) || def.grid.detect !== "printed-lines" || !isObject(def.grid.scan) || !isObject(def.grid.row) || !isObject(def.grid.fallback)) {
        errors.push("默書格線偵測設定不正確。");
      } else {
        [def.grid.scan.x, def.grid.scan.y, def.grid.row.startX, def.grid.row.step, def.grid.row.scanX, def.grid.row.height].forEach(function (range) {
          if (!Array.isArray(range) || range.length !== 2 || !isFiniteIn(range[0], 0, 1) || !isFiniteIn(range[1], 0, 1) || range[0] >= range[1]) errors.push("默書格線搜尋範圍須為遞增的 0 至 1 比例。");
        });
        if (!Number.isInteger(def.grid.row.cellsPerRow) || def.grid.row.cellsPerRow < 1 || def.grid.row.cellsPerRow > 80 ||
            !isFiniteIn(def.grid.row.expectedHeight, 0.001, 0.2)) errors.push("默書每行格數或預期格高不正確。");
        ["x", "y", "cellWidth", "rowHeight"].forEach(function (key) {
          if (!isFiniteIn(def.grid.fallback[key], 0, 1)) errors.push("默書後備格線設定不正確。");
        });
      }
      if (!Array.isArray(def.segments) || def.segments.length !== 2 || def.segments.some(function (segment, index) {
        return !isObject(segment) || segment.id !== index + 1 || !safeText(segment.label, 40) || !Array.isArray(segment.band) || segment.band.length !== 2 ||
          !isFiniteIn(segment.band[0], 0, 1) || !isFiniteIn(segment.band[1], 0, 1) || segment.band[0] >= segment.band[1] ||
          !isFiniteIn(segment.targetTop, segment.band[0], segment.band[1]);
      })) errors.push("默書段落須有兩段有效範圍。");
      validateIdentity(def.identity, errors);
      if (!isObject(def.scoring) || def.scoring.rule !== "gas-half-point") errors.push("默書計分規則必須沿用 GAS 半分制。");
    }
    if (typeof def.notes === "string" && def.notes.length > 500) errors.push("範本備註不得超過 500 字。");
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
    var encoded = unescape(encodeURIComponent(text)); var bytes = new Uint8Array(encoded.length);
    for (var index = 0; index < encoded.length; index += 1) bytes[index] = encoded.charCodeAt(index);
    return bytes;
  }
  function templateChecksum(definition) {
    var clean = sanitizeTemplate(definition);
    var text = JSON.stringify(clean);
    var bytes = utf8Bytes(text); var high = 0xcbf29ce4; var low = 0x84222325;
    for (var i = 0; i < bytes.length; i += 1) {
      low = (low ^ bytes[i]) >>> 0;
      var oldLow = low; var product = oldLow * 0x1b3;
      var carry = Math.floor(product / 0x100000000);
      low = product >>> 0;
      high = (Math.imul(high, 0x1b3) + Math.imul(oldLow, 0x100) + carry) >>> 0;
    }
    return high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
  }
  function serializeTemplate(definition, exportedAt) {
    var check = validateTemplate(definition);
    if (!check.ok) throw new Error(check.errors.join(" "));
    var clean = sanitizeTemplate(definition);
    clean.exportedAt = exportedAt || new Date().toISOString();
    clean.checksum = templateChecksum(definition);
    return JSON.stringify(clean, null, 2);
  }
  function parseTemplateJson(text) {
    if (typeof text !== "string") return { ok: false, errors: ["範本檔必須是 JSON 文字。"] };
    if (utf8Bytes(text).length > MAX_JSON_BYTES) return { ok: false, errors: ["範本檔超過 200 KB 上限。"] };
    var raw;
    try { raw = JSON.parse(text); } catch (error) { return { ok: false, errors: ["範本 JSON 格式不正確。"] }; }
    if (!isObject(raw)) return { ok: false, errors: ["範本必須是 JSON 物件。"] };
    var clean = sanitizeTemplate(raw); var check = validateTemplate(clean);
    if (!check.ok) return { ok: false, errors: check.errors, warnings: check.warnings };
    if (raw.checksum != null && String(raw.checksum) !== templateChecksum(clean)) return { ok: false, errors: ["範本校驗碼不符，檔案可能已更改。"] };
    if (clean.source === "builtin") {
      clean.source = "custom";
      clean.id = "custom:imported-" + clean.id.slice("builtin:".length);
      clean.name = clean.name + "（匯入副本）";
    }
    return { ok: true, template: clean, errors: [], warnings: check.warnings };
  }

  var api = {
    BUILTIN_TEMPLATES: BUILTIN_TEMPLATES,
    BUILTIN_CHOICE_ID: CHOICE_TEMPLATE.id,
    BUILTIN_DICTATION_ID: DICTATION_TEMPLATE.id,
    MAX_JSON_BYTES: MAX_JSON_BYTES,
    rowValues: rowValues,
    expandChoiceTemplate: expandChoiceTemplate,
    choiceParameters: choiceParameters,
    dictationParams: dictationParams,
    identityMaskRects: identityMaskRects,
    validateTemplate: validateTemplate,
    parseTemplateJson: parseTemplateJson,
    serializeTemplate: serializeTemplate,
    templateChecksum: templateChecksum,
    sanitizeTemplate: sanitizeTemplate,
    cloneTemplate: clone
  };
  root.PdfMarkingTemplates = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
