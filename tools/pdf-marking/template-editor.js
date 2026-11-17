(function (root) {
  "use strict";

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function rowValues(rows) {
    if (!rows || typeof rows !== "object") return [];
    if (rows.mode === "list") return Array.isArray(rows.groups) ? rows.groups.reduce(function (all, group) {
      return all.concat(Array.isArray(group) ? group : []);
    }, []) : [];
    if (rows.mode === "linear" && Number.isInteger(rows.count)) {
      return Array.from({ length: rows.count }, function (_, index) { return rows.start + index * rows.pitch; });
    }
    return [];
  }
  function blockById(definition, id) {
    return (definition.blocks || []).find(function (block) { return block.id === id; }) || null;
  }
  function bounds(points) {
    if (!points.length) return null;
    return points.reduce(function (result, point) {
      result.minX = Math.min(result.minX, point.x); result.maxX = Math.max(result.maxX, point.x);
      result.minY = Math.min(result.minY, point.y); result.maxY = Math.max(result.maxY, point.y);
      return result;
    }, { minX: 1, maxX: 0, minY: 1, maxY: 0 });
  }
  function crossPoints(xs, ys) {
    var points = [];
    xs.forEach(function (x) { ys.forEach(function (y) { points.push({ x: x, y: y }); }); });
    return points;
  }
  function groupPoints(definition, group) {
    if (group.kind === "identity") {
      var field = (definition.identity.fields || []).find(function (entry) { return entry.id === group.fieldId; });
      if (!field) return [];
      return crossPoints(field.id === "student-number" ? field.xs.slice() : [field.x], rowValues(field.rows));
    }
    var block = blockById(definition, group.blockId);
    if (!block) return [];
    if (group.kind === "mc-column") {
      return crossPoints(block.columns[group.columnIndex].xs.slice(), rowValues(block.rows));
    }
    if (group.kind === "mc-rows") {
      var rows = block.rows && block.rows.mode === "list" ? block.rows.groups[group.groupIndex] || [] : [];
      return crossPoints(block.columns.reduce(function (all, column) { return all.concat(column.xs); }, []), rows);
    }
    if (group.kind === "tf") {
      return crossPoints(block.columns.reduce(function (all, column) { return all.concat(column.xs); }, []), rowValues(block.rows));
    }
    return [];
  }
  function buildGroup(definition, descriptor) {
    var points = groupPoints(definition, descriptor);
    return Object.assign({}, descriptor, { points: points, bounds: bounds(points) });
  }
  function listGroups(definition) {
    var groups = [];
    (definition.identity && definition.identity.fields || []).forEach(function (field) {
      var labels = { "class-grade": "班別年級", "class-form": "班別字母", "student-number": "學號（所有位數）" };
      groups.push(buildGroup(definition, {
        id: "identity:" + field.id, kind: "identity", fieldId: field.id,
        label: labels[field.id] || field.label || field.id,
        color: field.id === "class-grade" ? "#176b87" : field.id === "class-form" ? "#387b42" : "#a45b16"
      }));
    });
    (definition.blocks || []).forEach(function (block) {
      if (block.type === "mc") {
        block.columns.forEach(function (_, index) {
          groups.push(buildGroup(definition, {
            id: "mc-column:" + block.id + ":" + index, kind: "mc-column", blockId: block.id, columnIndex: index,
            label: "選擇題第 " + (index + 1) + " 欄（選項圈）", color: "#236ba6"
          }));
        });
        if (block.rows && block.rows.mode === "list") block.rows.groups.forEach(function (_, index) {
          groups.push(buildGroup(definition, {
            id: "mc-rows:" + block.id + ":" + index, kind: "mc-rows", blockId: block.id, groupIndex: index,
            label: "選擇題第 " + (index + 1) + " 題組（行位）", color: "#b56a1b"
          }));
        });
      } else if (block.type === "tf") {
        groups.push(buildGroup(definition, {
          id: "tf:" + block.id, kind: "tf", blockId: block.id,
          label: "是非題（全部圈位）", color: "#744aa3"
        }));
      }
    });
    return groups;
  }
  function listMasks(definition) {
    return (definition.identity && definition.identity.masks || []).map(function (mask) {
      return { id: mask.id, label: mask.label, x: mask.x, y: mask.y, w: mask.w, h: mask.h };
    });
  }
  function findGroup(definition, id) {
    return listGroups(definition).find(function (group) { return group.id === id; }) || null;
  }
  function groupCoordinates(definition, group) {
    if (group.kind === "identity") {
      var field = (definition.identity.fields || []).find(function (entry) { return entry.id === group.fieldId; });
      return { xs: field.id === "student-number" ? field.xs : [field.x], row: field.rows };
    }
    var block = blockById(definition, group.blockId);
    if (group.kind === "mc-column") return { xs: block.columns[group.columnIndex].xs, row: null };
    if (group.kind === "mc-rows") return {
      xs: block.columns.reduce(function (all, column) { return all.concat(column.xs); }, []),
      row: block.rows.groups[group.groupIndex]
    };
    if (group.kind === "tf") return { xs: block.columns.reduce(function (all, column) { return all.concat([column.xs]); }, []), row: block.rows };
    return null;
  }
  function shiftBounds(definition, group) {
    var coords = groupCoordinates(definition, group);
    var xs = Array.isArray(coords.xs[0]) ? coords.xs.reduce(function (all, values) { return all.concat(values); }, []) : coords.xs;
    var ys = Array.isArray(coords.row) ? coords.row : coords.row ? rowValues(coords.row) : [];
    var points = crossPoints(xs, ys.length ? ys : [0.5]);
    return bounds(points);
  }
  function shiftLinearOrList(rows, delta) {
    if (rows.mode === "linear") rows.start += delta;
    else if (rows.mode === "list") rows.groups = rows.groups.map(function (group) {
      return group.map(function (value) { return value + delta; });
    });
  }
  function moveGroup(definition, groupId, deltaX, deltaY) {
    var group = findGroup(definition, groupId);
    if (!group) return { ok: false, message: "找不到所選圈位組。", deltaX: 0, deltaY: 0 };
    var boundsValue = shiftBounds(definition, group);
    if (!boundsValue) return { ok: false, message: "所選組沒有有效座標。", deltaX: 0, deltaY: 0 };
    var canMoveX = group.kind !== "mc-rows";
    var canMoveY = group.kind !== "mc-column";
    var dx = canMoveX ? Math.max(-boundsValue.minX, Math.min(1 - boundsValue.maxX, Number(deltaX) || 0)) : 0;
    var dy = canMoveY ? Math.max(-boundsValue.minY, Math.min(1 - boundsValue.maxY, Number(deltaY) || 0)) : 0;
    var coords = groupCoordinates(definition, group);
    if (group.kind === "identity") {
      var field = (definition.identity.fields || []).find(function (entry) { return entry.id === group.fieldId; });
      if (field.id === "student-number") field.xs = field.xs.map(function (x) { return x + dx; });
      else field.x += dx;
      shiftLinearOrList(field.rows, dy);
    } else if (group.kind === "mc-column") {
      definition.blocks.find(function (block) { return block.id === group.blockId; }).columns[group.columnIndex].xs = coords.xs.map(function (x) { return x + dx; });
    } else if (group.kind === "mc-rows") {
      definition.blocks.find(function (block) { return block.id === group.blockId; }).rows.groups[group.groupIndex] = coords.row.map(function (y) { return y + dy; });
    } else if (group.kind === "tf") {
      var tfBlock = definition.blocks.find(function (block) { return block.id === group.blockId; });
      tfBlock.columns.forEach(function (column) { column.xs = column.xs.map(function (x) { return x + dx; }); });
      shiftLinearOrList(tfBlock.rows, dy);
    }
    return { ok: true, deltaX: dx, deltaY: dy };
  }
  function groupSpacing(definition, groupId) {
    var group = findGroup(definition, groupId);
    if (!group) return { optionSpacing: null, rowSpacing: null };
    var optionValues = [];
    var row = null;
    if (group.kind === "identity") {
      var field = (definition.identity.fields || []).find(function (entry) { return entry.id === group.fieldId; });
      if (field.id === "student-number") optionValues = field.xs;
      row = field.rows;
    } else {
      var block = blockById(definition, group.blockId);
      if (group.kind === "mc-column") optionValues = block.columns[group.columnIndex].xs;
      if (group.kind === "tf") { optionValues = block.columns[0] ? block.columns[0].xs : []; row = block.rows; }
      if (group.kind === "mc-rows") row = { mode: "list", groups: [block.rows.groups[group.groupIndex] || []] };
    }
    var optionSpacing = optionValues.length > 1 ? (optionValues[optionValues.length - 1] - optionValues[0]) / (optionValues.length - 1) : null;
    var rowSpacing = null;
    if (row && row.mode === "linear" && row.count > 1) rowSpacing = row.pitch;
    else if (row && row.mode === "list") {
      var values = row.mode === "list" ? row.groups.reduce(function (all, entry) { return all.concat(entry); }, []) : [];
      if (values.length > 1) rowSpacing = (values[values.length - 1] - values[0]) / (values.length - 1);
    }
    return { optionSpacing: optionSpacing, rowSpacing: rowSpacing };
  }
  function reSpace(values, spacing) {
    if (!Array.isArray(values) || values.length < 2 || !Number.isFinite(spacing) || spacing <= 0) return null;
    var center = (values[0] + values[values.length - 1]) / 2;
    var result = values.map(function (_, index) { return center + (index - (values.length - 1) / 2) * spacing; });
    var minimum = Math.min.apply(null, result); var maximum = Math.max.apply(null, result);
    if (minimum < 0) result = result.map(function (value) { return value - minimum; });
    maximum = Math.max.apply(null, result);
    if (maximum > 1) result = result.map(function (value) { return value - (maximum - 1); });
    if (Math.min.apply(null, result) < -1e-10 || Math.max.apply(null, result) > 1 + 1e-10) return null;
    return result.map(function (value) { return Math.max(0, Math.min(1, value)); });
  }
  function setOptionSpacing(definition, groupId, spacing, allMcColumns) {
    var group = findGroup(definition, groupId); var value = Number(spacing);
    if (!group || !Number.isFinite(value) || value <= 0) return { ok: false, message: "選項間距須為大於 0 的數值。" };
    var targets = [];
    if (group.kind === "identity") {
      var field = (definition.identity.fields || []).find(function (entry) { return entry.id === group.fieldId; });
      if (field.id === "student-number") targets.push(field.xs);
    } else {
      var block = blockById(definition, group.blockId);
      if (group.kind === "mc-column") targets = allMcColumns ? block.columns.map(function (column) { return column.xs; }) : [block.columns[group.columnIndex].xs];
      if (group.kind === "tf") targets = block.columns.map(function (column) { return column.xs; });
    }
    if (!targets.length) return { ok: false, message: "所選組沒有選項間距可調。" };
    var updated = targets.map(function (values) { return reSpace(values, value); });
    if (updated.some(function (values) { return !values; })) return { ok: false, message: "這個間距會令圈位超出頁面範圍。" };
    if (group.kind === "identity") {
      var studentField = definition.identity.fields.find(function (entry) { return entry.id === group.fieldId; });
      studentField.xs = updated[0];
    } else if (group.kind === "mc-column") {
      var mcBlock = blockById(definition, group.blockId);
      if (allMcColumns) mcBlock.columns.forEach(function (column, index) { column.xs = updated[index]; });
      else mcBlock.columns[group.columnIndex].xs = updated[0];
    } else if (group.kind === "tf") {
      blockById(definition, group.blockId).columns.forEach(function (column, index) { column.xs = updated[index]; });
    }
    return { ok: true, updatedGroups: updated.length };
  }
  function centeredRows(values, spacing) {
    return reSpace(values, spacing);
  }
  function setRowSpacing(definition, groupId, spacing) {
    var group = findGroup(definition, groupId); var value = Number(spacing);
    if (!group || !Number.isFinite(value) || value <= 0) return { ok: false, message: "行距須為大於 0 的數值。" };
    var row = null; var rowValuesToSet = null;
    if (group.kind === "identity") {
      var field = definition.identity.fields.find(function (entry) { return entry.id === group.fieldId; });
      row = field.rows;
    } else {
      var block = blockById(definition, group.blockId);
      if (group.kind === "tf") row = block.rows;
      if (group.kind === "mc-rows") rowValuesToSet = block.rows.groups[group.groupIndex];
    }
    if (row && row.mode === "linear" && row.count > 1) {
      var oldValues = rowValues(row); var spaced = centeredRows(oldValues, value);
      if (!spaced) return { ok: false, message: "這個行距會令圈位超出頁面範圍。" };
      row.start = spaced[0]; row.pitch = value;
      return { ok: true };
    }
    if (rowValuesToSet && rowValuesToSet.length > 1) {
      var newValues = centeredRows(rowValuesToSet, value);
      if (!newValues) return { ok: false, message: "這個行距會令圈位超出頁面範圍。" };
      blockById(definition, group.blockId).rows.groups[group.groupIndex] = newValues;
      return { ok: true };
    }
    return { ok: false, message: "所選組沒有可調行距。" };
  }
  function saveValidated(definition, templateApi, saveFn) {
    var clean = templateApi.sanitizeTemplate(definition);
    var validation = templateApi.validateTemplate(clean);
    if (!validation.ok) return { ok: false, errors: validation.errors, warnings: validation.warnings || [] };
    return saveFn(clean);
  }

  var api = {
    clone: clone,
    rowValues: rowValues,
    listGroups: listGroups,
    listMasks: listMasks,
    groupSpacing: groupSpacing,
    moveGroup: moveGroup,
    setOptionSpacing: setOptionSpacing,
    setRowSpacing: setRowSpacing,
    saveValidated: saveValidated
  };
  root.PdfMarkingTemplateEditor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
