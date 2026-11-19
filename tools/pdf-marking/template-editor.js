(function (root) {
  "use strict";

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function splitTemplateName(value) {
    var source = String(value || "").trim();
    var marker = source.indexOf("｜");
    if (marker < 0) return { name: source, device: "", version: "" };
    var name = source.slice(0, marker).trim();
    var remainder = source.slice(marker + 1);
    var versionMarker = remainder.indexOf("／");
    if (versionMarker < 0) {
      var trailing = remainder.trim();
      return /^v\d+(?:\.\d+)?$/i.test(trailing)
        ? { name: name, device: "", version: trailing }
        : { name: name, device: trailing, version: "" };
    }
    return { name: name, device: remainder.slice(0, versionMarker).trim(), version: remainder.slice(versionMarker + 1).trim() };
  }
  function composeTemplateName(name, device, version, maxLength) {
    var title = String(name || "").trim();
    var equipment = String(device || "").trim();
    var release = String(version || "").trim();
    if (!title) return "";
    if (equipment && release) return title + "｜" + equipment + "／" + release;
    if (equipment) return title + "｜" + equipment;
    if (release) return title + "｜" + release;
    return title;
  }
  function nextTemplateVersion(value) {
    var match = String(value || "").trim().match(/^(.*?)(\d+)$/);
    if (match) return match[1] + (Number(match[2]) + 1);
    return "v2";
  }
  function templateExportFilename(name, id) {
    function slug(value) {
      return String(value || "").normalize("NFKD").replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 32).toLowerCase();
    }
    var parts = splitTemplateName(name);
    var displaySlug = [slug(parts.name), slug(parts.device), slug(parts.version)].filter(Boolean).join("-");
    var safeId = String(id || "").replace(/[^a-z0-9._-]/gi, "-").replace(/-+/g, "-").slice(0, 40) || "custom";
    return "pdf-marking-template-" + (displaySlug || "template") + "-" + safeId + ".json";
  }
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
      var column = block.columns[group.columnIndex];
      return crossPoints(column.xs.slice(), rowValues(column.rows || block.rows));
    }
    if (group.kind === "mc-column-rows" || group.kind === "tf-column-rows") {
      var rowColumn = block.columns[group.columnIndex];
      return crossPoints(rowColumn.xs.slice(), rowValues(rowColumn.rows || block.rows));
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
        block.columns.forEach(function (column, index) {
          groups.push(buildGroup(definition, {
            id: "mc-column:" + block.id + ":" + index, kind: "mc-column", blockId: block.id, columnIndex: index,
            label: "選擇題第 " + (index + 1) + " 欄（選項圈）", color: "#236ba6"
          }));
          if (column.rows) groups.push(buildGroup(definition, {
            id: "mc-column-rows:" + block.id + ":" + index, kind: "mc-column-rows", blockId: block.id, columnIndex: index,
            label: "選擇題第 " + (index + 1) + " 欄（行位）", color: "#b56a1b"
          }));
        });
        if (block.rows && block.rows.mode === "list" && block.columns.some(function (column) { return !column.rows; })) block.rows.groups.forEach(function (_, index) {
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
        block.columns.forEach(function (column, index) {
          if (column.rows) groups.push(buildGroup(definition, {
            id: "tf-column-rows:" + block.id + ":" + index, kind: "tf-column-rows", blockId: block.id, columnIndex: index,
            label: "是非題第 " + (index + 1) + " 欄（行位）", color: "#b56a1b"
          }));
        });
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
  function median(values) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function (left, right) { return left - right; });
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function listRowSpacing(rows) {
    if (!rows || rows.mode !== "list" || !Array.isArray(rows.groups)) return null;
    var distances = [];
    rows.groups.forEach(function (group) {
      if (!Array.isArray(group)) return;
      for (var index = 1; index < group.length; index += 1) distances.push(group[index] - group[index - 1]);
    });
    return median(distances);
  }
  function respaceListRows(rows, spacing) {
    if (!rows || rows.mode !== "list" || !Array.isArray(rows.groups) ||
        rows.groups.some(function (group) { return !Array.isArray(group) || !group.length || group.some(function (value) { return !Number.isFinite(value); }); })) return null;
    var oldSpacing = listRowSpacing(rows);
    var allValues = rows.groups.reduce(function (all, group) { return all.concat(group); }, []);
    if (allValues.length < 2 || !Number.isFinite(oldSpacing) || oldSpacing <= 0) return null;
    var ratio = spacing / oldSpacing;
    var gaps = [];
    for (var groupIndex = 1; groupIndex < rows.groups.length; groupIndex += 1) {
      var previous = rows.groups[groupIndex - 1]; var current = rows.groups[groupIndex];
      gaps.push((current[0] - previous[previous.length - 1]) * ratio);
    }
    var totalSpan = rows.groups.reduce(function (sum, group) { return sum + Math.max(0, group.length - 1) * spacing; }, 0) +
      gaps.reduce(function (sum, gap) { return sum + gap; }, 0);
    var center = (Math.min.apply(null, allValues) + Math.max.apply(null, allValues)) / 2;
    var cursor = center - totalSpan / 2;
    var groups = rows.groups.map(function (group, index) {
      var values = group.map(function (_, rowIndex) { return cursor + rowIndex * spacing; });
      cursor = values[values.length - 1] + (index < gaps.length ? gaps[index] : 0);
      return values;
    });
    var updated = groups.reduce(function (all, group) { return all.concat(group); }, []);
    if (updated.some(function (value) { return value < -1e-10 || value > 1 + 1e-10; })) return null;
    return groups.map(function (group) { return group.map(function (value) { return Math.max(0, Math.min(1, value)); }); });
  }
  function groupCoordinates(definition, group) {
    if (group.kind === "identity") {
      var field = (definition.identity.fields || []).find(function (entry) { return entry.id === group.fieldId; });
      return { xs: field.id === "student-number" ? field.xs : [field.x], row: field.rows };
    }
    var block = blockById(definition, group.blockId);
    if (group.kind === "mc-column") return { xs: block.columns[group.columnIndex].xs, row: null };
    if (group.kind === "mc-column-rows" || group.kind === "tf-column-rows") {
      return { xs: block.columns[group.columnIndex].xs, row: block.columns[group.columnIndex].rows || block.rows };
    }
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
    var canMoveX = group.kind !== "mc-rows" && group.kind !== "mc-column-rows" && group.kind !== "tf-column-rows";
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
    } else if (group.kind === "mc-column-rows" || group.kind === "tf-column-rows") {
      var rowBlock = definition.blocks.find(function (block) { return block.id === group.blockId; });
      var rowColumn = rowBlock.columns[group.columnIndex];
      if (!rowColumn.rows) rowColumn.rows = clone(rowBlock.rows);
      shiftLinearOrList(rowColumn.rows, dy);
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
      if (group.kind === "mc-column") {
        optionValues = block.columns[group.columnIndex].xs;
        row = block.columns[group.columnIndex].rows || block.rows;
      }
      if (group.kind === "tf") { optionValues = block.columns[0] ? block.columns[0].xs : []; row = block.rows; }
      if (group.kind === "mc-column-rows" || group.kind === "tf-column-rows") row = block.columns[group.columnIndex].rows || block.rows;
      if (group.kind === "mc-rows") row = { mode: "list", groups: [block.rows.groups[group.groupIndex] || []] };
    }
    var optionSpacing = optionValues.length > 1 ? (optionValues[optionValues.length - 1] - optionValues[0]) / (optionValues.length - 1) : null;
    var rowSpacing = null;
    if (row && row.mode === "linear" && row.count > 1) rowSpacing = row.pitch;
    else if (row && row.mode === "list") rowSpacing = listRowSpacing(row);
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
  function rowTarget(definition, groupId) {
    var group = findGroup(definition, groupId);
    if (!group) return null;
    if (group.kind === "identity") {
      var field = (definition.identity.fields || []).find(function (entry) { return entry.id === group.fieldId; });
      return field ? { rows: field.rows, singleGroupIndex: null } : null;
    }
    var block = blockById(definition, group.blockId);
    if (!block) return null;
    if (group.kind === "mc-column" || group.kind === "tf") {
      return { rows: group.kind === "mc-column" ? block.columns[group.columnIndex].rows || block.rows : block.rows, singleGroupIndex: null };
    }
    if (group.kind === "mc-column-rows" || group.kind === "tf-column-rows") {
      return { rows: block.columns[group.columnIndex].rows || block.rows, singleGroupIndex: null };
    }
    if (group.kind === "mc-rows") return { rows: block.rows, singleGroupIndex: group.groupIndex };
    return null;
  }
  function rowTargetGroups(target) {
    if (!target || !target.rows) return [];
    if (target.rows.mode === "linear") return [rowValues(target.rows)];
    if (target.rows.mode !== "list" || !Array.isArray(target.rows.groups)) return [];
    if (target.singleGroupIndex != null) {
      var selected = target.rows.groups[target.singleGroupIndex];
      return Array.isArray(selected) ? [selected.slice()] : [];
    }
    return target.rows.groups.map(function (group) { return Array.isArray(group) ? group.slice() : []; });
  }
  function writeRowTargetGroups(target, groups) {
    if (!target || !target.rows || !groups.length) return false;
    if (target.rows.mode === "linear") {
      var values = groups[0];
      if (!values.length) return false;
      target.rows.start = values[0];
      if (values.length > 1) target.rows.pitch = (values[values.length - 1] - values[0]) / (values.length - 1);
      return true;
    }
    if (target.rows.mode !== "list" || !Array.isArray(target.rows.groups)) return false;
    if (target.singleGroupIndex != null) target.rows.groups[target.singleGroupIndex] = groups[0].slice();
    else target.rows.groups = groups.map(function (group) { return group.slice(); });
    return true;
  }
  function spacedGroupsKeepingFirst(groups, spacing) {
    var updated = groups.map(function (values) {
      if (values.length < 2) return values.slice();
      return values.map(function (_, index) { return values[0] + index * spacing; });
    });
    if (updated.some(function (values) { return values.some(function (value) { return !Number.isFinite(value) || value < -1e-10 || value > 1 + 1e-10; }); })) return null;
    return updated.map(function (values) { return values.map(function (value) { return Math.max(0, Math.min(1, value)); }); });
  }
  function rowIntervalCount(groups) {
    return groups.reduce(function (sum, group) { return sum + Math.max(0, group.length - 1); }, 0);
  }
  function rowSpacingAfterHandle(definition, groupId, deltaY) {
    var target = rowTarget(definition, groupId);
    var groups = rowTargetGroups(target);
    var intervals = rowIntervalCount(groups);
    var spacing = groupSpacing(definition, groupId).rowSpacing;
    if (!intervals || !Number.isFinite(spacing) || !Number.isFinite(Number(deltaY))) {
      return { ok: false, message: "所選組沒有可調行距。" };
    }
    var nextSpacing = spacing + Number(deltaY) / intervals;
    if (nextSpacing <= 0) return { ok: false, message: "行距須為大於 0 的數值。" };
    return { ok: true, spacing: nextSpacing, intervals: intervals };
  }
  function moveGroupRows(definition, groupId, deltaY) {
    var target = rowTarget(definition, groupId);
    var groups = rowTargetGroups(target);
    var delta = Number(deltaY);
    if (!groups.length || !Number.isFinite(delta)) return { ok: false, message: "所選組沒有有效行位。" };
    var updated = groups.map(function (values) { return values.map(function (value) { return value + delta; }); });
    if (updated.some(function (values) { return values.some(function (value) { return value < -1e-10 || value > 1 + 1e-10; }); })) {
      return { ok: false, message: "所選組移動後會超出頁面範圍。" };
    }
    updated = updated.map(function (values) { return values.map(function (value) { return Math.max(0, Math.min(1, value)); }); });
    writeRowTargetGroups(target, updated);
    return { ok: true, deltaY: delta };
  }
  function spaceRowObject(rows, spacing) {
    if (!rows || !Number.isFinite(spacing) || spacing <= 0) return null;
    if (rows.mode === "linear" && Number.isInteger(rows.count) && rows.count >= 1) {
      if (rows.count < 2) return clone(rows);
      var linearGroups = spacedGroupsKeepingFirst([rowValues(rows)], spacing);
      if (!linearGroups) return null;
      var linear = clone(rows);
      linear.start = linearGroups[0][0]; linear.pitch = spacing;
      return linear;
    }
    if (rows.mode === "list" && Array.isArray(rows.groups)) {
      var listGroups = spacedGroupsKeepingFirst(rows.groups, spacing);
      if (!listGroups) return null;
      var list = clone(rows); list.groups = listGroups;
      return list;
    }
    return null;
  }
  function replaceObject(target, source) {
    Object.keys(target).forEach(function (key) { delete target[key]; });
    Object.keys(source).forEach(function (key) { target[key] = source[key]; });
  }
  function setAllMcRowSpacing(definition, spacing) {
    var value = Number(spacing);
    if (!Number.isFinite(value) || value <= 0) return { ok: false, message: "行距須為大於 0 的數值。" };
    var seen = new Set(); var updates = [];
    (definition.blocks || []).filter(function (block) { return block.type === "mc"; }).forEach(function (block) {
      (block.columns || []).forEach(function (column) {
        var rows = column.rows || block.rows;
        if (!rows || seen.has(rows)) return;
        seen.add(rows);
        var next = spaceRowObject(rows, value);
        if (!next) updates.push({ invalid: true });
        else updates.push({ rows: rows, next: next });
      });
    });
    if (!updates.length || updates.some(function (entry) { return entry.invalid; })) {
      return { ok: false, message: "這個行距會令其中一組圈位超出頁面範圍，所有選擇題組均未修改。" };
    }
    updates.forEach(function (entry) { replaceObject(entry.rows, entry.next); });
    return { ok: true, updatedGroups: updates.length };
  }
  function setAllMcRowSpacingFromGroup(definition, groupId) {
    var spacing = groupSpacing(definition, groupId).rowSpacing;
    if (!Number.isFinite(spacing)) return { ok: false, message: "所選組沒有可用行距。" };
    return setAllMcRowSpacing(definition, spacing);
  }
  function setRowSpacing(definition, groupId, spacing) {
    var group = findGroup(definition, groupId); var value = Number(spacing);
    if (!group || !Number.isFinite(value) || value <= 0) return { ok: false, message: "行距須為大於 0 的數值。" };
    var target = rowTarget(definition, groupId); var groups = rowTargetGroups(target);
    if (!target || !rowIntervalCount(groups)) return { ok: false, message: "所選組沒有可調行距。" };
    var updated = spacedGroupsKeepingFirst(groups, value);
    if (!updated) return { ok: false, message: "這個行距會令圈位超出頁面範圍。" };
    writeRowTargetGroups(target, updated);
    return { ok: true };
  }
  function getAtPath(value, path) {
    return path.reduce(function (current, key) { return current == null ? undefined : current[key]; }, value);
  }
  function setAtPath(value, path, next) {
    var parent = getAtPath(value, path.slice(0, -1));
    if (!parent) return false;
    parent[path[path.length - 1]] = next;
    return true;
  }
  function rowTrack(path, rows, xTrackIndexes, id, label) {
    if (!rows) return null;
    var groups;
    var storage;
    if (rows.mode === "linear") {
      groups = [rowValues(rows)]; storage = "linear";
    } else if (rows.mode === "list" && Array.isArray(rows.groups)) {
      groups = rows.groups.map(function (group) { return group.slice(); }); storage = "list";
    } else return null;
    if (!groups.length || groups.some(function (group) { return !group.length || group.some(function (number) { return !Number.isFinite(number); }); })) return null;
    var nextIndex = 0;
    var rowIndexes = groups.map(function (group) {
      var indexes = group.map(function (_, index) { return nextIndex + index; });
      nextIndex += group.length;
      return indexes;
    });
    return { id: id, label: label, path: path, groups: groups, rowIndexes: rowIndexes, storage: storage, xTrackIndexes: xTrackIndexes.slice() };
  }
  function scalarRowTrack(path, values, xTrackIndexes, id, label, firstRowIndex) {
    if (!Array.isArray(values) || !values.length || values.some(function (number) { return !Number.isFinite(number); })) return null;
    var start = Number(firstRowIndex) || 0;
    return { id: id, label: label, path: path, groups: [values.slice()], rowIndexes: [values.map(function (_, index) { return start + index; })],
      storage: "single", xTrackIndexes: xTrackIndexes.slice() };
  }
  function autoTarget(id, label, xTracks, rowTracks) {
    var points = [];
    rowTracks.forEach(function (rows, rowTrackIndex) {
      rows.xTrackIndexes.forEach(function (xTrackIndex) {
        var track = xTracks[xTrackIndex];
        rows.groups.forEach(function (values, groupIndex) {
          values.forEach(function (y, rowIndex) {
            track.values.forEach(function (x, slotIndex) {
              var globalRowIndex = rows.rowIndexes[groupIndex][rowIndex];
              var allowedRows = rows.activeRowIndexes && rows.activeRowIndexes[xTrackIndex];
              if (allowedRows && !allowedRows.has(globalRowIndex)) return;
              points.push({ x: x, y: y, type: track.type, xTrackIndex: xTrackIndex, slotIndex: slotIndex,
                rowTrackIndex: rowTrackIndex, groupIndex: groupIndex, rowIndex: rowIndex, globalRowIndex: globalRowIndex });
            });
          });
        });
      });
    });
    return { id: id, label: label, xTracks: xTracks, rowTracks: rowTracks, points: points };
  }
  function makeIdentityAutoTarget(definition, fieldIndex) {
    var field = definition.identity.fields[fieldIndex];
    var isArray = field.id === "student-number";
    var xTrack = { id: "identity:" + field.id, type: field.id, path: ["identity", "fields", fieldIndex, isArray ? "xs" : "x"],
      scalar: !isArray, values: isArray ? field.xs.slice() : [field.x] };
    var rows = rowTrack(["identity", "fields", fieldIndex, "rows"], field.rows, [0], "identity-rows:" + field.id, field.label);
    return autoTarget("identity:" + field.id, field.label, [xTrack], rows ? [rows] : []);
  }
  function makeBlockAutoTarget(definition, blockIndex, columnIndexes, label, rowPath, selectedGroupIndex) {
    var block = definition.blocks[blockIndex];
    var xTracks = columnIndexes.map(function (columnIndex) {
      return { id: block.type + ":" + block.id + ":" + columnIndex, type: block.type,
        columnIndex: columnIndex, path: ["blocks", blockIndex, "columns", columnIndex, "xs"], scalar: false,
        values: block.columns[columnIndex].xs.slice() };
    });
    var rows = getAtPath(definition, rowPath);
    var row;
    if (selectedGroupIndex != null) {
      var firstRowIndex = rows && rows.groups ? rows.groups.slice(0, selectedGroupIndex).reduce(function (sum, values) { return sum + values.length; }, 0) : 0;
      row = scalarRowTrack(rowPath.concat(["groups", selectedGroupIndex]), rows && rows.groups && rows.groups[selectedGroupIndex],
        xTracks.map(function (_, index) { return index; }), block.type + ":rows:" + selectedGroupIndex,
        "第 " + (selectedGroupIndex + 1) + " 題組", firstRowIndex);
    } else {
      row = rowTrack(rowPath, rows, xTracks.map(function (_, index) { return index; }), block.type + ":rows", label);
    }
    if (row) {
      var activeRows = activeQuestionRows(block);
      row.activeRowIndexes = xTracks.map(function (track) { return activeRows[track.columnIndex] || null; });
    }
    return autoTarget(block.type + ":" + block.id + ":" + rowPath.join(".") + (selectedGroupIndex == null ? "" : ":" + selectedGroupIndex),
      label, xTracks, row ? [row] : []);
  }
  function autoAlignTargetForGroup(definition, group) {
    if (!group) return null;
    if (group.kind === "identity") {
      var fieldIndex = (definition.identity.fields || []).findIndex(function (field) { return field.id === group.fieldId; });
      return fieldIndex < 0 ? null : makeIdentityAutoTarget(definition, fieldIndex);
    }
    var blockIndex = (definition.blocks || []).findIndex(function (block) { return block.id === group.blockId; });
    if (blockIndex < 0) return null;
    var block = definition.blocks[blockIndex];
    if (group.kind === "mc-rows") {
      var sharedIndexes = block.columns.map(function (column, index) { return column.rows ? -1 : index; }).filter(function (index) { return index >= 0; });
      return makeBlockAutoTarget(definition, blockIndex, sharedIndexes, group.label,
        ["blocks", blockIndex, "rows"], group.groupIndex);
    }
    if (group.kind === "mc-column" || group.kind === "mc-column-rows" || group.kind === "tf-column-rows") {
      var column = block.columns[group.columnIndex];
      var rowPath = column.rows ? ["blocks", blockIndex, "columns", group.columnIndex, "rows"] : ["blocks", blockIndex, "rows"];
      return makeBlockAutoTarget(definition, blockIndex, [group.columnIndex], group.label, rowPath);
    }
    if (group.kind === "tf") {
      return makeBlockAutoTarget(definition, blockIndex, block.columns.map(function (_, index) { return index; }), group.label,
        ["blocks", blockIndex, "rows"]);
    }
    return null;
  }
  function listAutoAlignTargets(definition) {
    var targets = [];
    (definition.identity && definition.identity.fields || []).forEach(function (field, index) {
      var target = makeIdentityAutoTarget(definition, index);
      if (target.points.length) targets.push(target);
    });
    (definition.blocks || []).forEach(function (block, blockIndex) {
      var groupedColumns = new Map();
      block.columns.forEach(function (column, columnIndex) {
        var path = column.rows ? ["blocks", blockIndex, "columns", columnIndex, "rows"] : ["blocks", blockIndex, "rows"];
        var key = path.join(".");
        if (!groupedColumns.has(key)) groupedColumns.set(key, { path: path, indexes: [] });
        groupedColumns.get(key).indexes.push(columnIndex);
      });
      groupedColumns.forEach(function (entry) {
        var suffix = entry.indexes.length > 1 ? "全欄" : "第 " + (entry.indexes[0] + 1) + " 欄";
        var label = (block.type === "mc" ? "選擇題" : "是非題") + suffix + "及行位";
        var target = makeBlockAutoTarget(definition, blockIndex, entry.indexes, label, entry.path);
        if (target.points.length) targets.push(target);
      });
    });
    return targets;
  }
  function activeQuestionRows(block) {
    var locations = [];
    block.columns.forEach(function (column, columnIndex) {
      rowValues(column.rows || block.rows).forEach(function (y, rowIndex) {
        locations.push({ columnIndex: columnIndex, rowIndex: rowIndex, y: y,
          x: column.xs.reduce(function (sum, value) { return sum + value; }, 0) / column.xs.length });
      });
    });
    locations.sort(block.numbering === "row-major"
      ? function (left, right) { return left.y - right.y || left.x - right.x || left.columnIndex - right.columnIndex; }
      : function (left, right) { return left.columnIndex - right.columnIndex || left.rowIndex - right.rowIndex; });
    var active = block.columns.map(function () { return new Set(); });
    locations.slice(0, block.maxCount).forEach(function (location) { active[location.columnIndex].add(location.rowIndex); });
    return active;
  }
  function solveLeastSquares(rows, values) {
    if (!rows.length || !rows[0].length || rows.length !== values.length) return null;
    var size = rows[0].length;
    var matrix = Array.from({ length: size }, function () { return Array(size + 1).fill(0); });
    rows.forEach(function (row, rowIndex) {
      for (var i = 0; i < size; i += 1) {
        for (var j = 0; j < size; j += 1) matrix[i][j] += row[i] * row[j];
        matrix[i][size] += row[i] * values[rowIndex];
      }
    });
    for (var column = 0; column < size; column += 1) {
      var pivot = column;
      for (var candidate = column + 1; candidate < size; candidate += 1) {
        if (Math.abs(matrix[candidate][column]) > Math.abs(matrix[pivot][column])) pivot = candidate;
      }
      if (Math.abs(matrix[pivot][column]) < 1e-12) return null;
      var swap = matrix[column]; matrix[column] = matrix[pivot]; matrix[pivot] = swap;
      var divisor = matrix[column][column];
      for (var k = column; k <= size; k += 1) matrix[column][k] /= divisor;
      for (var rowNumber = 0; rowNumber < size; rowNumber += 1) {
        if (rowNumber === column) continue;
        var factor = matrix[rowNumber][column];
        for (var cell = column; cell <= size; cell += 1) matrix[rowNumber][cell] -= factor * matrix[column][cell];
      }
    }
    return matrix.map(function (row) { return row[size]; });
  }
  function fitAutoAlignment(definition, target, measurements, pageSizeMm, maximumResidualMm) {
    var page = pageSizeMm || {};
    var widthMm = Number(page.widthMm); var heightMm = Number(page.heightMm);
    var maxResidual = Number.isFinite(Number(maximumResidualMm)) ? Number(maximumResidualMm) : 1;
    if (!target || !target.points.length || measurements.length !== target.points.length || widthMm <= 0 || heightMm <= 0) {
      return { ok: false, reason: "沒有足夠的圈位或頁面尺寸資料。", target: target };
    }
    var found = measurements.filter(function (entry) { return entry && entry.found && Number.isFinite(entry.x) && Number.isFinite(entry.y); });
    if (found.length * 2 < target.points.length) {
      return { ok: false, reason: "找到的圈心少於該組圈數一半（" + found.length + " / " + target.points.length + "）。", target: target,
        foundCount: found.length, expectedCount: target.points.length };
    }
    var usable = [];
    measurements.forEach(function (measurement, index) {
      if (measurement && measurement.found && Number.isFinite(measurement.x) && Number.isFinite(measurement.y)) {
        usable.push(Object.assign({ point: target.points[index], index: index }, measurement));
      }
    });
    var xFits = [];
    for (var xIndex = 0; xIndex < target.xTracks.length; xIndex += 1) {
      var xTrack = target.xTracks[xIndex];
      var xSamples = usable.filter(function (entry) { return entry.point.xTrackIndex === xIndex; });
      var expectedForTrack = target.points.filter(function (point) { return point.xTrackIndex === xIndex; }).length;
      if (!expectedForTrack) {
        xFits.push({ path: xTrack.path, scalar: xTrack.scalar, values: xTrack.values.slice(), id: xTrack.id });
        continue;
      }
      if (xSamples.length * 2 < expectedForTrack) return { ok: false, reason: xTrack.id + " 找到的圈心不足一半。", target: target,
        foundCount: found.length, expectedCount: target.points.length };
      var xRows = xSamples.map(function (entry) {
        var features = [1];
        if (xTrack.values.length > 1) features.push(entry.point.slotIndex - (xTrack.values.length - 1) / 2);
        return features;
      });
      var xValues = xSamples.map(function (entry) { return entry.x - entry.point.x; });
      var xCoefficients = solveLeastSquares(xRows, xValues);
      if (!xCoefficients) return { ok: false, reason: xTrack.id + " 的選項間距無法穩定估算。", target: target };
      var newValues = xTrack.values.map(function (value, slot) {
        return value + xCoefficients[0] + (xCoefficients.length > 1 ? xCoefficients[1] * (slot - (xTrack.values.length - 1) / 2) : 0);
      });
      xFits.push({ path: xTrack.path, scalar: xTrack.scalar, values: newValues, id: xTrack.id });
    }
    var rowFits = [];
    target.rowTracks.forEach(function (rows, rowTrackIndex) {
      var rowSamples = usable.filter(function (entry) { return entry.point.rowTrackIndex === rowTrackIndex; });
      var expectedForRows = target.points.filter(function (point) { return point.rowTrackIndex === rowTrackIndex; }).length;
      if (rowSamples.length * 2 < expectedForRows) return;
      var hasPitch = rows.groups.some(function (group) { return group.length > 1; });
      var groupCount = rows.groups.length;
      var equations = rowSamples.map(function (entry) {
        var groupIndex = entry.point.groupIndex; var group = rows.groups[groupIndex];
        var features = Array(groupCount + (hasPitch ? 1 : 0)).fill(0);
        features[groupIndex] = 1;
        if (hasPitch) features[groupCount] = entry.point.rowIndex - (group.length - 1) / 2;
        return features;
      });
      var values = rowSamples.map(function (entry) { return entry.y - entry.point.y; });
      var coefficients = solveLeastSquares(equations, values);
      if (!coefficients) return;
      var updatedGroups = rows.groups.map(function (group, groupIndex) {
        return group.map(function (value, rowIndex) {
          return value + coefficients[groupIndex] + (hasPitch ? coefficients[groupCount] * (rowIndex - (group.length - 1) / 2) : 0);
        });
      });
      rowFits.push({ path: rows.path, storage: rows.storage, groups: updatedGroups, id: rows.id });
    });
    if (rowFits.length !== target.rowTracks.length) return { ok: false, reason: "其中一段行位找不到足夠圈心，不能安全調整。", target: target,
      foundCount: found.length, expectedCount: target.points.length };
    if (xFits.some(function (fit) { return fit.values.some(function (value) { return value < 0 || value > 1; }); }) ||
        rowFits.some(function (fit) { return fit.groups.some(function (group) { return group.some(function (value) { return value < 0 || value > 1; }); }); })) {
      return { ok: false, reason: "預計圈位會超出頁面範圍，未作修改。", target: target,
        foundCount: found.length, expectedCount: target.points.length };
    }
    var updatedX = new Map(); xFits.forEach(function (fit, index) { target.xTracks[index].values.forEach(function (value, slot) {
      updatedX.set(index + ":" + slot, fit.values[slot]);
    }); });
    var updatedRows = new Map(); rowFits.forEach(function (fit, index) { fit.groups.forEach(function (group, groupIndex) {
      group.forEach(function (value, rowIndex) { updatedRows.set(index + ":" + groupIndex + ":" + rowIndex, value); });
    }); });
    var residualSquared = 0; var offsetX = 0; var offsetY = 0; var offsetLength = 0;
    usable.forEach(function (entry) {
      var point = entry.point;
      var predictedX = updatedX.get(point.xTrackIndex + ":" + point.slotIndex);
      var predictedY = updatedRows.get(point.rowTrackIndex + ":" + point.groupIndex + ":" + point.rowIndex);
      var residualX = (entry.x - predictedX) * widthMm;
      var residualY = (entry.y - predictedY) * heightMm;
      residualSquared += residualX * residualX + residualY * residualY;
      var dx = (entry.x - point.x) * widthMm; var dy = (entry.y - point.y) * heightMm;
      offsetX += dx; offsetY += dy; offsetLength += Math.hypot(dx, dy);
    });
    var residualMm = Math.sqrt(residualSquared / usable.length);
    var meanOffsetMm = offsetLength / usable.length;
    if (!Number.isFinite(residualMm) || residualMm > maxResidual) return { ok: false, reason: "擬合殘差 " + residualMm.toFixed(2) + " mm 過大（上限 " + maxResidual.toFixed(2) + " mm），未作修改。",
      target: target, residualMm: residualMm, foundCount: found.length, expectedCount: target.points.length };
    var candidate = clone(definition);
    xFits.forEach(function (fit) {
      if (fit.scalar) setAtPath(candidate, fit.path, fit.values[0]);
      else setAtPath(candidate, fit.path, fit.values);
    });
    rowFits.forEach(function (fit) {
      if (fit.storage === "single") setAtPath(candidate, fit.path, fit.groups[0]);
      else if (fit.storage === "list") {
        var rowsValue = getAtPath(candidate, fit.path); rowsValue.groups = fit.groups;
      } else if (fit.storage === "linear") {
        var linear = getAtPath(candidate, fit.path); var values = fit.groups[0];
        linear.start = values[0];
        if (values.length > 1) linear.pitch = (values[values.length - 1] - values[0]) / (values.length - 1);
      }
    });
    var previewPoints = target.points.map(function (point) {
      return { old: { x: point.x, y: point.y }, next: {
        x: updatedX.get(point.xTrackIndex + ":" + point.slotIndex),
        y: updatedRows.get(point.rowTrackIndex + ":" + point.groupIndex + ":" + point.rowIndex)
      }, type: point.type };
    });
    return { ok: true, target: target, candidate: candidate, xFits: xFits, rowFits: rowFits,
      foundCount: found.length, expectedCount: target.points.length, residualMm: residualMm,
      meanOffsetMm: meanOffsetMm, meanDxMm: offsetX / usable.length, meanDyMm: offsetY / usable.length,
      previewPoints: previewPoints };
  }
  function applyAutoAlignPlans(definition, plans) {
    var result = clone(definition);
    (plans || []).filter(function (plan) { return plan && plan.ok; }).forEach(function (plan) {
      plan.xFits.forEach(function (fit) {
        if (fit.scalar) setAtPath(result, fit.path, fit.values[0]);
        else setAtPath(result, fit.path, fit.values);
      });
      plan.rowFits.forEach(function (fit) {
        if (fit.storage === "single") setAtPath(result, fit.path, fit.groups[0]);
        else if (fit.storage === "list") getAtPath(result, fit.path).groups = fit.groups;
        else if (fit.storage === "linear") {
          var linear = getAtPath(result, fit.path); var values = fit.groups[0];
          linear.start = values[0];
          if (values.length > 1) linear.pitch = (values[values.length - 1] - values[0]) / (values.length - 1);
        }
      });
    });
    return result;
  }
  function saveValidated(definition, templateApi, saveFn) {
    var clean = templateApi.sanitizeTemplate(definition);
    var validation = templateApi.validateTemplate(clean);
    if (!validation.ok) return { ok: false, errors: validation.errors, warnings: validation.warnings || [] };
    return saveFn(clean);
  }
  function clampSelectedZoom(value, minimum, maximum) {
    var lower = Number.isFinite(Number(minimum)) ? Number(minimum) : 1;
    var upper = Number.isFinite(Number(maximum)) ? Math.max(lower, Number(maximum)) : 8;
    var zoom = Number.isFinite(Number(value)) ? Number(value) : lower;
    return Math.max(lower, Math.min(upper, zoom));
  }
  function selectedBubbleRadius(pageWidth, bubbleRadius, selectedView) {
    var fraction = Number(bubbleRadius) > 0 ? Number(bubbleRadius) * 0.65 : 0.0077 * 0.65;
    var radius = Math.max(3, Math.min(15, Math.max(0, Number(pageWidth) || 0) * fraction));
    return selectedView ? Math.max(14, radius) : radius;
  }
  function calculateSelectedZoom(options) {
    var settings = options || {};
    var frameWidth = Math.max(1, Number(settings.frameWidth) || 1);
    var frameHeight = Math.max(1, Number(settings.frameHeight) || 1);
    var pageAspect = Math.max(0.01, Number(settings.pageAspect) || 1);
    var boundsValue = settings.bounds || null;
    var width = boundsValue ? Math.max(0, Number(boundsValue.maxX) - Number(boundsValue.minX)) : 0;
    var height = boundsValue ? Math.max(0, Number(boundsValue.maxY) - Number(boundsValue.minY)) : 0;
    var groupFit = Infinity;
    if (width > 0) groupFit = Math.min(groupFit, 0.72 / width);
    if (height > 0) groupFit = Math.min(groupFit, 0.72 * frameHeight / (frameWidth * pageAspect * height));
    if (!Number.isFinite(groupFit)) groupFit = 1;
    var bubbleRadius = Number(settings.bubbleRadius) > 0 ? Number(settings.bubbleRadius) : 0.0077;
    var minCircleDiameter = Number(settings.minCircleDiameter) > 0 ? Number(settings.minCircleDiameter) : 28;
    var circleZoom = minCircleDiameter / (2 * frameWidth * bubbleRadius * 0.65);
    var fitZoom = clampSelectedZoom(settings.fitZoom, 0.05, 1);
    var maxZoom = Number(settings.maxZoom) > 0 ? Number(settings.maxZoom) : 8;
    return clampSelectedZoom(Math.max(fitZoom, groupFit, circleZoom), fitZoom, maxZoom);
  }

  var api = {
    clone: clone,
    splitTemplateName: splitTemplateName,
    composeTemplateName: composeTemplateName,
    nextTemplateVersion: nextTemplateVersion,
    templateExportFilename: templateExportFilename,
    rowValues: rowValues,
    listGroups: listGroups,
    listMasks: listMasks,
    groupSpacing: groupSpacing,
    moveGroup: moveGroup,
    setOptionSpacing: setOptionSpacing,
    setRowSpacing: setRowSpacing,
    rowSpacingAfterHandle: rowSpacingAfterHandle,
    moveGroupRows: moveGroupRows,
    setAllMcRowSpacing: setAllMcRowSpacing,
    setAllMcRowSpacingFromGroup: setAllMcRowSpacingFromGroup,
    clampSelectedZoom: clampSelectedZoom,
    selectedBubbleRadius: selectedBubbleRadius,
    calculateSelectedZoom: calculateSelectedZoom,
    autoAlignTargetForGroup: autoAlignTargetForGroup,
    listAutoAlignTargets: listAutoAlignTargets,
    fitAutoAlignment: fitAutoAlignment,
    applyAutoAlignPlans: applyAutoAlignPlans,
    saveValidated: saveValidated
  };
  root.PdfMarkingTemplateEditor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
