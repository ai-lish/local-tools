(function (root) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function node(name, attributes) {
    var element = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, String(attributes[key])); });
    return element;
  }

  function groupOffsetColor(offsetMm, radiusMm) {
    var offset = Number(offsetMm);
    var radius = Number(radiusMm);
    if (!Number.isFinite(offset) || !Number.isFinite(radius) || radius <= 0) return "#a34f00";
    if (offset > radius) return "#b42318";
    if (offset > radius * 0.5) return "#bd7a12";
    return "#a34f00";
  }

  function groupKey(item) {
    return item.type + ":" + (Number.isInteger(item.columnIndex) ? item.columnIndex : 0) + ":" +
      (Number.isInteger(item.rowGroupIndex) ? item.rowGroupIndex : 0);
  }

  function groupLabel(group) {
    var numbers = group.items.map(function (item) { return Number(item.number); }).filter(Number.isFinite);
    if (!numbers.length) return group.type === "tf" ? "是非題" : "選擇題";
    var first = Math.min.apply(Math, numbers);
    var last = Math.max.apply(Math, numbers);
    var range = first === last ? String(first) : first + "–" + last;
    return (group.type === "tf" ? "是非題" : "選擇題") + "第 " + range + " 題";
  }

  function rectanglesOverlap(left, right) {
    return left.x < right.x + right.width && left.x + left.width > right.x &&
      left.y < right.y + right.height && left.y + left.height > right.y;
  }

  function labelHitsCircle(rect, point, radius) {
    var x = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
    var y = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
    return Math.hypot(point.x - x, point.y - y) < radius;
  }

  function labelWidth(text, fontSize) {
    return Array.from(String(text)).reduce(function (sum, character) {
      return sum + fontSize * (character.charCodeAt(0) < 128 ? 0.58 : 1);
    }, 0);
  }

  function placeLabels(groups, circles, options) {
    var width = Number(options.width); var height = Number(options.height);
    var fontSize = Number(options.fontSize) || 12;
    var paddingX = Number(options.paddingX) || 5;
    var paddingY = Number(options.paddingY) || 3;
    var gap = Number(options.gap) || 5;
    var circleRadius = Number(options.circleRadius) || 4;
    var stepX = Math.max(3, fontSize * 0.65);
    var stepY = Math.max(3, fontSize * 0.55);
    var placed = [];
    var ordered = (groups || []).slice().sort(function (left, right) {
      return left.bounds.minY - right.bounds.minY || left.bounds.minX - right.bounds.minX;
    });
    var results = [];

    ordered.forEach(function (group) {
      var textWidth = labelWidth(group.text, fontSize);
      var boxWidth = textWidth + paddingX * 2;
      var boxHeight = fontSize * 1.35 + paddingY * 2;
      var centerX = (group.bounds.minX + group.bounds.maxX) / 2;
      var xCandidates = [];
      var seenX = new Set();
      function addX(value) {
        var clamped = Math.max(0, Math.min(width - boxWidth, value));
        var rounded = Math.round(clamped * 1000) / 1000;
        if (!seenX.has(rounded)) { seenX.add(rounded); xCandidates.push(rounded); }
      }
      addX(centerX - boxWidth / 2);
      for (var offset = stepX; offset <= width; offset += stepX) {
        addX(centerX - boxWidth / 2 - offset);
        addX(centerX - boxWidth / 2 + offset);
      }
      addX(group.bounds.minX);
      addX(group.bounds.maxX - boxWidth);
      xCandidates.sort(function (left, right) {
        return Math.abs(left + boxWidth / 2 - centerX) - Math.abs(right + boxWidth / 2 - centerX);
      });

      function tryVertical(startY, direction) {
        for (var y = startY; y >= 0 && y + boxHeight <= height; y += direction * stepY) {
          for (var index = 0; index < xCandidates.length; index += 1) {
            var rect = { x: xCandidates[index], y: Math.round(y * 1000) / 1000, width: boxWidth, height: boxHeight };
            if (circles.some(function (point) { return labelHitsCircle(rect, point, circleRadius); })) continue;
            if (placed.some(function (other) { return rectanglesOverlap(rect, other); })) continue;
            placed.push(rect);
            return { id: group.id, text: group.text, color: group.color, rect: rect, fontSize: fontSize,
              baselineY: rect.y + paddingY + fontSize, position: direction < 0 ? "above" : "below" };
          }
        }
        return null;
      }

      var placement = tryVertical(group.bounds.minY - gap - boxHeight, -1);
      if (!placement) placement = tryVertical(group.bounds.maxY + gap, 1);
      if (placement) results.push(placement);
    });
    return results;
  }

  function draw(svg, geometry, template, pageRecord, viewport) {
    if (!svg || !geometry || !template || !pageRecord || !viewport) return;
    var questionById = Object.create(null);
    (pageRecord.questions || []).forEach(function (question) {
      questionById[question.type + ":" + question.number] = question;
    });
    var groupsById = Object.create(null);
    template.items.forEach(function (item) {
      var id = groupKey(item);
      if (!groupsById[id]) groupsById[id] = { type: item.type, items: [] };
      groupsById[id].items.push(item);
    });
    var diagnosticGroups = pageRecord.alignmentDiagnostics && pageRecord.alignmentDiagnostics.groups || [];
    var radiusPx = viewport.width * Number(template.params.radius || 0.0077);
    var radiusMm = Number(template.params.radius || 0.0077) * 210;
    var labelRequests = [];
    var circlePoints = [];
    Object.keys(groupsById).forEach(function (id) {
      var group = groupsById[id];
      var label = groupLabel(group);
      var diagnostic = diagnosticGroups.find(function (entry) { return entry.label === label; });
      var offsetMm = diagnostic ? Number(diagnostic.meanMm) : 0;
      var groupColor = groupOffsetColor(offsetMm, radiusMm);
      var expectedPoints = [];
      group.items.forEach(function (item) {
        var question = questionById[item.type + ":" + item.number];
        if (!question) return;
        item.choices.forEach(function (bubble, index) {
          var expected = geometry.mapBubble(bubble, viewport.width, viewport.height, { dx: 0, dy: 0, angle: 0, scale: 1 });
          var detected = geometry.mapBubble(bubble, viewport.width, viewport.height, pageRecord.calibration,
            question.localOffsets && question.localOffsets[index]);
          expectedPoints.push(expected);
          circlePoints.push(expected, detected);
          svg.append(node("line", { x1: expected.x, y1: expected.y, x2: detected.x, y2: detected.y,
            stroke: groupColor, "stroke-width": 1.5 }));
          [[expected, "#236ba6"], [detected, "#b42318"]].forEach(function (entry) {
            svg.append(node("circle", { cx: entry[0].x, cy: entry[0].y,
              r: Math.max(3, radiusPx * 0.5), fill: "none",
              stroke: entry[1], "stroke-width": 1.4 }));
          });
        });
      });
      if (expectedPoints.length) {
        var minX = Math.min.apply(Math, expectedPoints.map(function (point) { return point.x; }));
        var maxX = Math.max.apply(Math, expectedPoints.map(function (point) { return point.x; }));
        var fontSize = Math.max(10, viewport.width * 0.014);
        var textLabel = label + " " + (Number.isFinite(offsetMm) ? offsetMm : 0).toFixed(1) + " mm";
        labelRequests.push({ id: id, text: textLabel, color: groupColor, bounds: {
          minX: minX, maxX: maxX,
          minY: Math.min.apply(Math, expectedPoints.map(function (point) { return point.y; })),
          maxY: Math.max.apply(Math, expectedPoints.map(function (point) { return point.y; }))
        }, title: label + "平均偏移 " + (Number.isFinite(offsetMm) ? offsetMm : 0).toFixed(1) + " mm" });
      }
    });
    placeLabels(labelRequests, circlePoints, { width: viewport.width, height: viewport.height,
      fontSize: Math.max(10, viewport.width * 0.014), gap: Math.max(4, radiusPx * 0.7), circleRadius: radiusPx * 0.5 + 1 })
      .forEach(function (placement) {
        var rect = node("rect", { x: placement.rect.x, y: placement.rect.y,
          width: placement.rect.width, height: placement.rect.height, rx: 3,
          fill: "#fff", "fill-opacity": 0.88, stroke: placement.color, "stroke-opacity": 0.32, "stroke-width": 1 });
        rect.setAttribute("data-alignment-label-id", placement.id);
        svg.append(rect);
        var text = node("text", { x: placement.rect.x + placement.rect.width / 2, y: placement.baselineY,
          fill: placement.color, "font-size": placement.fontSize, "font-family": "sans-serif", "font-weight": "700",
          "text-anchor": "middle" });
        text.textContent = placement.text;
        var title = node("title", {});
        var request = labelRequests.find(function (entry) { return entry.id === placement.id; });
        title.textContent = request ? request.title : placement.text;
        text.append(title);
        text.setAttribute("data-alignment-label-id", placement.id);
        svg.append(text);
      });
    (template.params.groupGaps || []).forEach(function (gap) {
      var measured = pageRecord.alignmentDiagnostics && (pageRecord.alignmentDiagnostics.groupGaps || []).find(function (entry) {
        return entry.beforeNumber === gap.beforeNumber && entry.afterNumber === gap.afterNumber;
      });
      gap.points.forEach(function (point) {
        var center = geometry.mapBubble(point, viewport.width, viewport.height, pageRecord.calibration);
        var side = Math.max(6, viewport.width * template.params.radius * 0.52);
        svg.append(node("rect", { x: center.x - side / 2, y: center.y - side / 2, width: side, height: side,
          fill: "none", stroke: measured && measured.ink >= template.params.maxGroupGapInk ? "#b42318" : "#bd7a12",
          "stroke-width": 1.4 }));
      });
    });
  }

  root.PdfMarkingAlignmentOverlay = { draw: draw, groupOffsetColor: groupOffsetColor, placeLabels: placeLabels };
})(typeof window !== "undefined" ? window : globalThis);
