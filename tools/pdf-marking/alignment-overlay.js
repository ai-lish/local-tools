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
        var meanY = expectedPoints.reduce(function (sum, point) { return sum + point.y; }, 0) / expectedPoints.length;
        var fontSize = Math.max(10, viewport.width * 0.014);
        var textLabel = label + " " + (Number.isFinite(offsetMm) ? offsetMm : 0).toFixed(1) + " mm";
        var estimatedWidth = textLabel.length * fontSize * 0.62;
        var labelGap = Math.max(4, radiusPx * 0.7);
        var useRight = maxX + labelGap + estimatedWidth <= viewport.width - 2;
        var labelX = useRight ? maxX + labelGap : minX - labelGap;
        var text = node("text", { x: labelX, y: Math.max(fontSize + 2, Math.min(viewport.height - 2, meanY)),
          fill: groupColor, "font-size": fontSize, "font-family": "sans-serif", "font-weight": "700",
          "text-anchor": useRight ? "start" : "end", stroke: "#fff", "stroke-width": 3, "paint-order": "stroke" });
        text.textContent = textLabel;
        var title = node("title", {});
        title.textContent = label + "平均偏移 " + (Number.isFinite(offsetMm) ? offsetMm : 0).toFixed(1) + " mm";
        text.append(title);
        svg.append(text);
      }
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

  root.PdfMarkingAlignmentOverlay = { draw: draw, groupOffsetColor: groupOffsetColor };
})(typeof window !== "undefined" ? window : globalThis);
