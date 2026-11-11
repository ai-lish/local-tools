(function (root) {
  "use strict";

  var geometry = root.PdfMarkingGeometry;
  var CHOICES = ["A", "B", "C", "D"];
  var MIN_GRID_SCORE = 0.22;
  var MAX_GROUP_GAP_INK = 0.14;
  var MIN_LOCAL_CIRCLE_INK = 0.24;
  var LOCAL_SEARCH_RADIUS = 0.0065;
  var MAX_LOCAL_CORRECTION_RATIO = 0.0062;

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

  function grayAt(data, width, height, x, y) {
    var px = clamp(x, 0, width - 1); var py = clamp(y, 0, height - 1);
    var x0 = Math.floor(px); var y0 = Math.floor(py);
    var x1 = Math.min(width - 1, x0 + 1); var y1 = Math.min(height - 1, y0 + 1);
    var fx = px - x0; var fy = py - y0;
    function gray(ix, iy) {
      var at = (iy * width + ix) * 4;
      return data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
    }
    var top = gray(x0, y0) * (1 - fx) + gray(x1, y0) * fx;
    var bottom = gray(x0, y1) * (1 - fx) + gray(x1, y1) * fx;
    return top * (1 - fy) + bottom * fy;
  }

  function ringInkAtCenter(data, width, height, center) {
    var radius = width * 0.0077;
    var total = 0;
    for (var i = 0; i < 8; i += 1) {
      var angle = i * Math.PI / 4;
      total += 1 - grayAt(data, width, height,
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius) / 255;
    }
    return total / 8;
  }

  function ringInk(data, width, height, bubble, calibration) {
    return ringInkAtCenter(data, width, height, geometry.mapBubble(bubble, width, height, calibration));
  }

  function refineBubbleCenter(data, width, height, bubble, calibration) {
    var expected = geometry.mapBubble(bubble, width, height, calibration);
    var searchRadius = width * LOCAL_SEARCH_RADIUS;
    var step = Math.max(1, width * 0.0008);
    var steps = Math.ceil(searchRadius / step);
    var best = { score: -1, dx: 0, dy: 0 };
    for (var yStep = -steps; yStep <= steps; yStep += 1) {
      var dy = yStep * step;
      for (var xStep = -steps; xStep <= steps; xStep += 1) {
        var dx = xStep * step;
        if (dx * dx + dy * dy > searchRadius * searchRadius) continue;
        var score = ringInkAtCenter(data, width, height, { x: expected.x + dx, y: expected.y + dy });
        var offsetSquared = dx * dx + dy * dy;
        var bestOffsetSquared = best.dx * best.dx + best.dy * best.dy;
        if (score > best.score || (score === best.score && offsetSquared < bestOffsetSquared)) {
          best = { score: score, dx: dx, dy: dy };
        }
      }
    }
    var offset = Math.hypot(best.dx, best.dy);
    var found = best.score >= MIN_LOCAL_CIRCLE_INK;
    var nearSearchBoundary = offset >= searchRadius - step * 0.25;
    var uncertain = !found || offset > width * MAX_LOCAL_CORRECTION_RATIO || nearSearchBoundary;
    return {
      center: { x: expected.x + best.dx, y: expected.y + best.dy },
      offsetX: best.dx / width,
      offsetY: best.dy / height,
      ringInk: best.score,
      found: found,
      uncertain: uncertain
    };
  }

  function questionGroupGaps() {
    var physicalTemplate = geometry.omrTemplate(60, 0);
    var items = physicalTemplate.items;
    var gaps = [];
    for (var i = 0; i < items.length - 1; i += 1) {
      var before = items[i]; var after = items[i + 1];
      var left = before.choices[0]; var right = after.choices[0];
      if (Math.abs(left.x - right.x) > 0.03 || right.y - left.y < 0.03) continue;
      var y = (left.y + right.y) / 2;
      before.choices.forEach(function (bubble) { gaps.push({ x: bubble.x, y: y, type: "group-gap" }); });
    }
    return gaps;
  }

  function groupGapInk(data, width, height, calibration) {
    var gaps = questionGroupGaps();
    if (!gaps.length) return 0;
    return gaps.reduce(function (total, point) {
      return total + ringInk(data, width, height, point, calibration);
    }, 0) / gaps.length;
  }

  function gridFit(data, width, height, template) {
    var points = template.bubbles;
    var best = { score: -1, dx: 0, dy: 0, angle: 0, scale: 1 };
    var evaluations = 0;
    function evaluate(dx, dy, angle, scale) {
      var calibration = { dx: dx, dy: dy, angle: angle, scale: scale };
      var score = 0;
      for (var i = 0; i < points.length; i += 1) score += ringInk(data, width, height, points[i], calibration);
      score /= Math.max(1, points.length);
      evaluations += 1;
      if (score > best.score) best = { score: score, dx: dx, dy: dy, angle: angle, scale: scale };
    }
    var xShifts = [-0.012, -0.006, 0, 0.006, 0.012];
    // The printed five-row group gaps break the periodic row pattern.
    var yShifts = [-0.008, -0.004, 0, 0.004, 0.008];
    var angles = [-0.8, -0.4, 0, 0.4, 0.8];
    var scales = [0.985, 0.9925, 1, 1.0075, 1.015];
    for (var xi = 0; xi < xShifts.length; xi += 1) {
      for (var yi = 0; yi < yShifts.length; yi += 1) {
        for (var ai = 0; ai < angles.length; ai += 1) {
          for (var si = 0; si < scales.length; si += 1) evaluate(xShifts[xi], yShifts[yi], angles[ai], scales[si]);
        }
      }
    }
    var coarse = best;
    for (var dxStep = -2; dxStep <= 2; dxStep += 1) {
      for (var dyStep = -2; dyStep <= 2; dyStep += 1) {
        for (var angleStep = -2; angleStep <= 2; angleStep += 1) {
          for (var scaleStep = -1; scaleStep <= 1; scaleStep += 1) {
            evaluate(coarse.dx + dxStep / width, coarse.dy + dyStep / height,
              coarse.angle + angleStep * 0.08, coarse.scale + scaleStep * 0.002);
          }
        }
      }
    }
    var centerSeed = { dx: best.dx, dy: best.dy, angle: best.angle, scale: best.scale };
    var centerBest = { score: questionCenterScore(data, width, height, template, centerSeed), calibration: centerSeed };
    for (var centerDx = -4; centerDx <= 4; centerDx += 1) {
      for (var centerDy = -6; centerDy <= 6; centerDy += 1) {
        var candidate = {
          dx: centerSeed.dx + centerDx / width,
          dy: clamp(centerSeed.dy + centerDy / height, -0.012, 0.012),
          angle: centerSeed.angle,
          scale: centerSeed.scale
        };
        var centerScore = questionCenterScore(data, width, height, template, candidate);
        if (centerScore > centerBest.score) centerBest = { score: centerScore, calibration: candidate };
      }
    }
    var finalCalibration = centerBest.calibration;
    finalCalibration.fitScore = centerBest.score;
    finalCalibration.gridScore = best.score;
    finalCalibration.groupGapInk = groupGapInk(data, width, height, finalCalibration);
    finalCalibration.alignmentBoundary = Math.abs(finalCalibration.dx) > 0.012 || Math.abs(finalCalibration.dy) >= 0.0115 ||
      finalCalibration.groupGapInk >= MAX_GROUP_GAP_INK || best.score < MIN_GRID_SCORE;
    var metadataFit = fitMetadata(data, width, height, template, finalCalibration);
    return {
      calibration: finalCalibration,
      metadataCalibration: metadataFit.calibration,
      score: best.score,
      improvement: Math.max(0, best.score - ringInkBaseline(data, width, height, points)),
      evaluations: evaluations
    };
  }

  function questionCenterScore(data, width, height, template, calibration) {
    var total = 0;
    template.items.forEach(function (item) {
      var values = item.choices.map(function (bubble) {
        return measureBubble(data, width, height, bubble, calibration);
      });
      total += Math.max.apply(null, values);
    });
    return total / Math.max(1, template.items.length);
  }

  function fitMetadata(data, width, height, template, baseCalibration) {
    var points = template.classGrade.concat(template.classForm, template.studentNumber.reduce(function (all, column) {
      return all.concat(column);
    }, []));
    var best = { score: -1, calibration: baseCalibration };
    // The header grid has its own printed offset from the question area.
    for (var dxStep = -15; dxStep <= 15; dxStep += 1) {
      for (var dyStep = -15; dyStep <= 15; dyStep += 1) {
        var calibration = {
          dx: baseCalibration.dx + dxStep / width,
          dy: baseCalibration.dy + dyStep / height,
          angle: baseCalibration.angle,
          scale: baseCalibration.scale
        };
        var score = 0;
        for (var i = 0; i < points.length; i += 1) {
          score += ringInk(data, width, height, points[i], calibration);
        }
        score /= Math.max(1, points.length);
        if (score > best.score) best = { score: score, calibration: calibration };
      }
    }
    best.calibration.metadataFitScore = best.score;
    return best;
  }

  function ringInkBaseline(data, width, height, points) {
    var score = 0;
    for (var i = 0; i < points.length; i += 1) score += ringInk(data, width, height, points[i], null);
    return score / Math.max(1, points.length);
  }

  function measureBubbleAtCenter(data, width, height, center) {
    var radius = width * 0.0077;
    var centerTotal = 0; var centerCount = 0;
    for (var y = -4; y <= 4; y += 1) {
      for (var x = -4; x <= 4; x += 1) {
        if (x * x + y * y > 16) continue;
        centerTotal += grayAt(data, width, height, center.x + x * radius / 4, center.y + y * radius / 4);
        centerCount += 1;
      }
    }
    var outerTotal = 0;
    for (var i = 0; i < 12; i += 1) {
      var angle = i * Math.PI / 6;
      outerTotal += grayAt(data, width, height,
        center.x + Math.cos(angle) * radius * 1.55,
        center.y + Math.sin(angle) * radius * 1.55);
    }
    var centerGray = centerTotal / Math.max(1, centerCount);
    var paperGray = outerTotal / 12;
    return clamp((paperGray - centerGray) / Math.max(85, paperGray), 0, 1);
  }

  function measureBubble(data, width, height, bubble, calibration) {
    return measureBubbleAtCenter(data, width, height, geometry.mapBubble(bubble, width, height, calibration));
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
  }

  function deriveThreshold(maxima) {
    var sorted = maxima.slice().sort(function (a, b) { return a - b; });
    if (!sorted.length) return { threshold: 0.24, blankLimit: 0.14, deepLimit: 0.32, allPale: true, spread: 0 };
    var split = -1; var largestGap = 0;
    for (var i = 0; i < sorted.length - 1; i += 1) {
      var gap = sorted[i + 1] - sorted[i];
      if (gap > largestGap) { largestGap = gap; split = i; }
    }
    var lowGroup; var highGroup;
    if (split >= 0 && largestGap >= 0.045) {
      lowGroup = sorted.slice(0, split + 1); highGroup = sorted.slice(split + 1);
    } else {
      lowGroup = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.35)));
      highGroup = sorted.slice(Math.max(0, Math.floor(sorted.length * 0.65)));
    }
    var low = lowGroup[Math.floor((lowGroup.length - 1) / 2)];
    var high = highGroup[Math.floor((highGroup.length - 1) / 2)];
    var spread = Math.max(0, high - low);
    var threshold = spread >= 0.045 ? low + spread * 0.5 : clamp(low + 0.12, 0.20, 0.58);
    var blankLimit = clamp(low + Math.max(0.015, spread * 0.08), 0.12, 0.24);
    return {
      threshold: threshold,
      blankLimit: blankLimit,
      deepLimit: clamp(threshold + Math.max(0.025, spread * 0.12), threshold, 0.72),
      allPale: high < 0.28,
      spread: spread,
      low: low,
      high: high
    };
  }

  function classifyItem(choices, values, thresholdInfo) {
    var ranked = choices.map(function (choice, index) { return { choice: choice, value: values[index] }; })
      .sort(function (a, b) { return b.value - a.value; });
    var top = ranked[0] || { choice: "", value: 0 };
    var second = ranked[1] || { choice: "", value: 0 };
    var deep = ranked.filter(function (entry) { return entry.value >= thresholdInfo.deepLimit; });
    var gapLimit = Math.max(0.08, thresholdInfo.spread * 0.18);
    if (deep.length > 1) {
      return { answer: deep.map(function (entry) { return entry.choice; }).sort().join(""), status: "review", reason: "多於一個深圈", values: values };
    }
    if (top.value <= thresholdInfo.blankLimit) {
      if (top.value - second.value >= gapLimit) {
        return { answer: top.choice, status: "review", reason: "填色偏淡，需確認是否作答", values: values };
      }
      return { answer: "", status: "blank", reason: "空白", values: values };
    }
    if (thresholdInfo.allPale) {
      return { answer: top.choice, status: "review", reason: "整頁填色偏淡", values: values };
    }
    var paleLimit = clamp(thresholdInfo.blankLimit + 0.08, 0.24, 0.32);
    if (top.value < paleLimit) {
      return { answer: top.choice, status: "review", reason: "填色偏淡，需確認是否作答", values: values };
    }
    if (top.value - second.value < gapLimit) {
      return { answer: top.choice, status: "review", reason: "最深與次深差距細", values: values };
    }
    return { answer: top.choice, status: "read", reason: "", values: values };
  }

  function classifySingle(options, values, thresholdInfo, label) {
    var localThreshold = deriveThreshold(values);
    var result = classifyItem(options.map(function (entry) { return entry.option; }), values, localThreshold);
    if (result.status === "blank") {
      result.status = "review";
      result.reason = "未能讀取";
    } else if (result.answer.length !== 1) {
      result.status = "review";
    }
    if (result.answer.length === 1) result.value = result.answer;
    if (result.status === "read") result.status = "read";
    if (result.answer.length > 1) result.value = "";
    result.label = label;
    return result;
  }

  function detectPage(data, width, height, mcCount, tfCount, calibration, metadataCalibration) {
    var template = geometry.omrTemplate(mcCount, tfCount);
    var applied = calibration || { dx: 0, dy: 0, angle: 0, scale: 1 };
    var metadataApplied = metadataCalibration || applied;
    var itemLocations = template.items.map(function (item) {
      return item.choices.map(function (bubble) { return refineBubbleCenter(data, width, height, bubble, applied); });
    });
    var itemValues = template.items.map(function (item, itemIndex) {
      return item.choices.map(function (bubble, bubbleIndex) {
        return measureBubbleAtCenter(data, width, height, itemLocations[itemIndex][bubbleIndex].center);
      });
    });
    var thresholdCircleValues = template.items.reduce(function (all, item) {
      return all.concat(item.choices.map(function (bubble) { return measureBubble(data, width, height, bubble, applied); }));
    }, []);
    var thresholdInfo = deriveThreshold(thresholdCircleValues);
    var questions = template.items.map(function (item, index) {
      var options = item.type === "mc" ? CHOICES : ["T", "F"];
      var result = classifyItem(options, itemValues[index], thresholdInfo);
      result.number = item.number;
      result.type = item.type;
      result.reviewed = false;
      result.localOffsets = itemLocations[index].map(function (location) {
        return { dx: location.offsetX, dy: location.offsetY };
      });
      if (itemLocations[index].some(function (location) { return location.uncertain; })) {
        result.status = "review";
        result.reason = "定位不確定";
      }
      return result;
    });
    var multipleCount = questions.filter(function (item) { return item.reason === "多於一個深圈"; }).length;
    var lowGridScore = Number.isFinite(Number(applied.gridScore)) && Number(applied.gridScore) < MIN_GRID_SCORE;
    var unexpectedGroupGapInk = Number.isFinite(Number(applied.groupGapInk)) && Number(applied.groupGapInk) >= MAX_GROUP_GAP_INK;
    var pageFailure = Boolean(applied.alignmentBoundary) || lowGridScore || unexpectedGroupGapInk ||
      (questions.length > 0 && multipleCount / questions.length >= 0.6);
    var pageFlags = [];
    if (!pageFailure && (Math.abs(applied.dx) > 0.008 || Math.abs(applied.dy) > 0.008 || Math.abs(applied.angle) > 0.55 || Math.abs(applied.scale - 1) > 0.012)) {
      pageFlags.push("定位校正幅度較大，請檢查整頁對齊");
    }
    var grade = classifySingle(template.classGrade, template.classGrade.map(function (bubble) {
      return measureBubble(data, width, height, bubble, metadataApplied);
    }), thresholdInfo, "班別年級");
    var form = classifySingle(template.classForm, template.classForm.map(function (bubble) {
      return measureBubble(data, width, height, bubble, metadataApplied);
    }), thresholdInfo, "班別字母");
    var idDigits = template.studentNumber.map(function (options, index) {
      return classifySingle(options, options.map(function (bubble) {
        return measureBubble(data, width, height, bubble, metadataApplied);
      }), thresholdInfo, "學號第 " + (index + 1) + " 位");
    });
    if (pageFailure) {
      questions.forEach(function (question) {
        question.answer = "";
        question.status = "review";
        question.reason = "整頁定位失敗";
        question.reviewed = true;
      });
      pageFlags.push("整頁定位失敗：可能是空白頁、方向錯誤或分組位置不符，請核對本頁");
    }
    if (grade.status !== "read" || form.status !== "read") pageFlags.push("班別讀取未確認");
    if (idDigits.some(function (digit) { return digit.status !== "read"; })) pageFlags.push("學號讀取未確認");
    return {
      questions: questions,
      classValue: grade.status === "read" && form.status === "read" ? grade.value + form.value : "",
      studentId: idDigits.every(function (digit) { return digit.status === "read"; }) ? idDigits.map(function (digit) { return digit.value; }).join("") : "",
      metadata: { grade: grade, form: form, idDigits: idDigits },
      calibration: applied,
      metadataCalibration: metadataApplied,
      pageFailure: pageFailure,
      thresholds: thresholdInfo,
      pageFlags: pageFlags,
      reviewCount: (pageFailure ? 0 : questions.filter(function (item) { return item.status === "review"; }).length) + pageFlags.length
    };
  }

  root.PdfMarkingOmr = {
    grayAt: grayAt,
    measureBubble: measureBubble,
    measureBubbleAtCenter: measureBubbleAtCenter,
    deriveThreshold: deriveThreshold,
    classifyItem: classifyItem,
    gridFit: gridFit,
    detectPage: detectPage,
    MIN_GRID_SCORE: MIN_GRID_SCORE,
    MAX_GROUP_GAP_INK: MAX_GROUP_GAP_INK,
    MIN_LOCAL_CIRCLE_INK: MIN_LOCAL_CIRCLE_INK,
    MAX_LOCAL_CORRECTION_RATIO: MAX_LOCAL_CORRECTION_RATIO,
    refineBubbleCenter: refineBubbleCenter
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingOmr;
})(typeof window !== "undefined" ? window : globalThis);
