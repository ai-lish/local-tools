(function (root) {
  "use strict";

  var templates = root.PdfMarkingTemplates;
  if (!templates && typeof module !== "undefined" && module.exports) templates = require("./templates.js");

  function normalizeRotation(rotation) {
    var value = Number(rotation) || 0;
    value %= 360;
    return value < 0 ? value + 360 : value;
  }

  function pageViewport(viewBox, scale, rotation) {
    var x0 = viewBox[0]; var y0 = viewBox[1];
    var x1 = viewBox[2]; var y1 = viewBox[3];
    var rot = normalizeRotation(rotation);
    var cx = (x1 + x0) / 2; var cy = (y1 + y0) / 2;
    var a; var b; var c; var d;
    if (rot === 180) { a = -1; b = 0; c = 0; d = 1; }
    else if (rot === 90) { a = 0; b = 1; c = 1; d = 0; }
    else if (rot === 270) { a = 0; b = -1; c = -1; d = 0; }
    else if (rot === 0) { a = 1; b = 0; c = 0; d = -1; }
    else throw new Error("頁面旋轉角度須為 90° 的倍數。");
    var originX; var originY; var width; var height;
    if (a === 0) {
      originX = Math.abs(cy - y0) * scale;
      originY = Math.abs(cx - x0) * scale;
      width = (y1 - y0) * scale; height = (x1 - x0) * scale;
    } else {
      originX = Math.abs(cx - x0) * scale;
      originY = Math.abs(cy - y0) * scale;
      width = (x1 - x0) * scale; height = (y1 - y0) * scale;
    }
    return {
      width: width, height: height, rotation: rot, viewBox: viewBox.slice(),
      transform: [a * scale, b * scale, c * scale, d * scale,
        originX - a * scale * cx - c * scale * cy,
        originY - b * scale * cx - d * scale * cy]
    };
  }

  function applyInverse(point, matrix) {
    var a = matrix[0]; var b = matrix[1]; var c = matrix[2]; var d = matrix[3];
    var e = matrix[4]; var f = matrix[5];
    var determinant = a * d - b * c;
    return [
      (d * point[0] - c * point[1] + c * f - d * e) / determinant,
      (-b * point[0] + a * point[1] + b * e - a * f) / determinant
    ];
  }

  function uprightToPdf(viewport, x, y) {
    return applyInverse([x, y], viewport.transform);
  }

  function uprightToMediaPoint(rotation, mediaWidth, mediaHeight, x, y) {
    var viewport = pageViewport([0, 0, mediaWidth, mediaHeight], 1, rotation);
    var pdf = uprightToPdf(viewport, x, y);
    return [pdf[0], mediaHeight - pdf[1]];
  }

  function mediaBlitMatrix(rotation, mediaWidth, mediaHeight) {
    var origin = uprightToMediaPoint(rotation, mediaWidth, mediaHeight, 0, 0);
    var axisX = uprightToMediaPoint(rotation, mediaWidth, mediaHeight, 1, 0);
    var axisY = uprightToMediaPoint(rotation, mediaWidth, mediaHeight, 0, 1);
    return [axisX[0] - origin[0], axisX[1] - origin[1], axisY[0] - origin[0],
      axisY[1] - origin[1], origin[0], origin[1]];
  }

  function mediaRasterBlitMatrix(rotation, mediaWidth, mediaHeight, sourceScale, targetScale) {
    var matrix = mediaBlitMatrix(rotation, mediaWidth, mediaHeight);
    // Convert the point-space page transform to a source-pixel to output-pixel transform.
    var factor = targetScale / sourceScale;
    return [matrix[0] * factor, matrix[1] * factor, matrix[2] * factor, matrix[3] * factor,
      matrix[4] * targetScale, matrix[5] * targetScale];
  }

  function projectionPeaks(values, start, end, radius, minimum) {
    var candidates = [];
    for (var index = start + radius; index < end - radius; index += 1) {
      var value = values[index];
      if (value < minimum) continue;
      var isPeak = true;
      for (var neighbor = index - radius; neighbor <= index + radius; neighbor += 1) {
        if (neighbor !== index && values[neighbor] > value) { isPeak = false; break; }
      }
      if (isPeak) candidates.push({ position: index, strength: value });
    }
    candidates.sort(function (left, right) { return right.strength - left.strength; });
    var selected = [];
    candidates.forEach(function (candidate) {
      if (selected.every(function (entry) { return Math.abs(candidate.position - entry.position) > radius * 2 + 1; })) {
        selected.push(candidate);
      }
    });
    return selected.sort(function (left, right) { return left.position - right.position; });
  }

  function fitDictationRow(imageData, top, bottom, rowParams) {
    var imageWidth = imageData.width;
    var imageHeight = imageData.height;
    var pixels = imageData.data;
    var vertical = new Array(imageWidth).fill(0);
    var yStart = Math.max(0, Math.ceil(top + 2));
    var yEnd = Math.min(imageHeight, Math.floor(bottom - 2));
    if (yEnd - yStart < 8) return null;
    var scanX = rowParams.scanX || [0.04, 0.94];
    for (var x = Math.floor(imageWidth * scanX[0]); x < Math.floor(imageWidth * scanX[1]); x += 1) {
      for (var y = yStart; y < yEnd; y += 1) {
        var offset = (y * imageWidth + x) * 4;
        if ((pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 < 220) vertical[x] += 1;
      }
    }
    var peaks = projectionPeaks(vertical, Math.floor(imageWidth * scanX[0]), Math.floor(imageWidth * scanX[1]),
      2, (yEnd - yStart) * 0.22);
    var best = null;
    var startX = rowParams.startX || [0.05, 0.11];
    var stepRange = rowParams.step || [0.035, 0.044];
    peaks.forEach(function (start) {
      if (start.position < imageWidth * startX[0] || start.position > imageWidth * startX[1]) return;
      for (var step = imageWidth * stepRange[0]; step <= imageWidth * stepRange[1]; step += 0.35) {
        var observations = [[0, start.position]];
        var misses = 0;
        for (var boundary = 1; boundary <= rowParams.cellsPerRow; boundary += 1) {
          var expected = start.position + boundary * step;
          var nearest = null;
          peaks.forEach(function (candidate) {
            if (Math.abs(candidate.position - expected) > step * 0.24) return;
            if (!nearest || Math.abs(candidate.position - expected) < Math.abs(nearest.position - expected)) nearest = candidate;
          });
          if (nearest) {
            observations.push([boundary, nearest.position]);
            misses = 0;
          } else {
            misses += 1;
            if (misses >= 2) break;
          }
        }
        var last = observations[observations.length - 1][0];
        if (last < 5) continue;
        var matched = observations.length;
        if (matched / (last + 1) < 0.72) continue;
        var meanIndex = observations.reduce(function (sum, value) { return sum + value[0]; }, 0) / matched;
        var meanPosition = observations.reduce(function (sum, value) { return sum + value[1]; }, 0) / matched;
        var numerator = 0;
        var denominator = 0;
        observations.forEach(function (value) {
          numerator += (value[0] - meanIndex) * (value[1] - meanPosition);
          denominator += (value[0] - meanIndex) * (value[0] - meanIndex);
        });
        if (!denominator) continue;
        var fittedStep = numerator / denominator;
        var fittedStart = meanPosition - fittedStep * meanIndex;
        var residuals = observations.map(function (value) {
          return Math.abs(value[1] - (fittedStart + value[0] * fittedStep));
        });
        var maxResidual = Math.max.apply(Math, residuals);
        var meanResidual = residuals.reduce(function (sum, value) { return sum + value; }, 0) / residuals.length;
        if (maxResidual > fittedStep * 0.18) continue;
        var score = last * 100 + matched * 12 - meanResidual * 12 -
          Math.abs(fittedStart - imageWidth * rowParams.fallbackX) * 0.025 - Math.abs(fittedStep - imageWidth * rowParams.expectedStep) * 0.02;
        if (!best || score > best.score) {
          best = { x: fittedStart, step: fittedStep, physicalCount: last, score: score,
            confidence: matched / (last + 1), residual: maxResidual };
        }
      }
    });
    if (!best) return null;
    var lastActive = -1;
    for (var cellIndex = 0; cellIndex < best.physicalCount; cellIndex += 1) {
      var cellLeft = Math.max(0, Math.ceil(best.x + (cellIndex + 0.18) * best.step));
      var cellRight = Math.min(imageWidth, Math.floor(best.x + (cellIndex + 0.82) * best.step));
      var cellTop = Math.max(yStart, Math.ceil(top + (bottom - top) * 0.18));
      var cellBottom = Math.min(yEnd, Math.floor(top + (bottom - top) * 0.82));
      var light = 0; var total = 0;
      for (var pixelY = cellTop; pixelY < cellBottom; pixelY += 1) {
        for (var pixelX = cellLeft; pixelX < cellRight; pixelX += 1) {
          var pixelOffset = (pixelY * imageWidth + pixelX) * 4;
          var shade = (pixels[pixelOffset] + pixels[pixelOffset + 1] + pixels[pixelOffset + 2]) / 3;
          if (shade > 230) light += 1;
          total += 1;
        }
      }
      if (total && light / total > 0.18) lastActive = cellIndex;
    }
    best.count = lastActive + 1;
    return best.count >= 5 ? best : null;
  }

  function fitDictationGrid(imageData, pageWidth, pageHeight, segmentNumber, params) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) return null;
    var imageWidth = imageData.width;
    var imageHeight = imageData.height;
    var pixels = imageData.data;
    var configuration = params || templates.dictationParams();
    var grid = configuration.grid || configuration;
    var scanX = grid.scan && grid.scan.x || [0.04, 0.96];
    var scanY = grid.scan && grid.scan.y || [0.13, 0.76];
    var rowParams = Object.assign({}, grid.row || {}, {
      scanX: grid.row && grid.row.scanX || [0.04, 0.94],
      fallbackX: grid.fallback ? grid.fallback.x : 0.076,
      expectedStep: grid.fallback ? grid.fallback.cellWidth : 0.04
    });
    var xStart = Math.floor(imageWidth * scanX[0]);
    var xEnd = Math.floor(imageWidth * scanX[1]);
    var yStart = Math.floor(imageHeight * scanY[0]);
    var yEnd = Math.floor(imageHeight * scanY[1]);
    var horizontal = new Array(imageHeight).fill(0);
    for (var y = yStart; y < yEnd; y += 1) {
      var rowOffset = y * imageWidth * 4;
      for (var x = xStart; x < xEnd; x += 1) {
        var offset = rowOffset + x * 4;
        if ((pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 < 220) horizontal[y] += 1;
      }
    }
    var horizontalPeaks = projectionPeaks(horizontal, yStart, yEnd, 2, (xEnd - xStart) * 0.24);
    var candidates = [];
    for (var topIndex = 0; topIndex < horizontalPeaks.length - 1; topIndex += 1) {
      var top = horizontalPeaks[topIndex];
      for (var bottomIndex = topIndex + 1; bottomIndex < horizontalPeaks.length; bottomIndex += 1) {
        var bottom = horizontalPeaks[bottomIndex];
        var gap = bottom.position - top.position;
        if (gap < imageHeight * 0.022) continue;
        if (gap > imageHeight * 0.052) break;
        var rowFit = fitDictationRow(imageData, top.position, bottom.position, rowParams);
        if (!rowFit) continue;
        candidates.push({ topIndex: topIndex, bottomIndex: bottomIndex, top: top.position,
          bottom: bottom.position, height: gap, x: rowFit.x, step: rowFit.step,
          count: rowFit.count, physicalCount: rowFit.physicalCount,
          confidence: rowFit.confidence, residual: rowFit.residual,
          score: rowFit.score + top.strength + bottom.strength });
      }
    }
    var groups = [];
    candidates.forEach(function (first) {
      var rows = [first];
      function extend(current, cellCount, score) {
        if (rows.length >= 2) groups.push({ rows: rows.slice(), cells: cellCount, score: score });
        candidates.forEach(function (next) {
          if (next.topIndex !== current.bottomIndex || next.x < current.x - imageWidth * 0.012 ||
              next.x > current.x + imageWidth * 0.012 || Math.abs(next.step - current.step) > imageWidth * 0.004) return;
          if (rows.length >= 5 || next.bottom <= current.bottom) return;
          rows.push(next);
          extend(next, cellCount + next.count, score + next.score);
          rows.pop();
        });
      }
      extend(first, first.count, first.score);
    });
    if (!groups.length) return null;
    var selectedSegment = Number(segmentNumber) === 2 ? 2 : 1;
    var segmentDefinition = (configuration.segments || []).find(function (segment) { return segment.id === selectedSegment; });
    var segmentBand = segmentDefinition ? segmentDefinition.band : (selectedSegment === 1 ? [0.19, 0.38] : [0.38, 0.70]);
    var segmentTop = imageHeight * segmentBand[0];
    var segmentBottom = imageHeight * segmentBand[1];
    var rowHeightRange = grid.row && grid.row.height || [0.028, 0.041];
    var expectedRowHeight = imageHeight * (grid.row && grid.row.expectedHeight || 0.034);
    var segmentGroups = groups.filter(function (group) {
      if (group.rows.length < 2 || group.rows[0].top < segmentTop || group.rows[0].top > segmentBottom) return false;
      var heights = group.rows.map(function (row) { return row.height; });
      var shortest = Math.min.apply(Math, heights);
      var tallest = Math.max.apply(Math, heights);
      return heights.every(function (height) {
        return height >= imageHeight * rowHeightRange[0] && height <= imageHeight * rowHeightRange[1];
      }) && tallest - shortest <= imageHeight * 0.008;
    });
    if (!segmentGroups.length) return null;
    segmentGroups.sort(function (left, right) {
      if (left.rows.length !== right.rows.length) return right.rows.length - left.rows.length;
      var leftHeightError = left.rows.reduce(function (sum, row) {
        return sum + Math.abs(row.height - expectedRowHeight);
      }, 0);
      var rightHeightError = right.rows.reduce(function (sum, row) {
        return sum + Math.abs(row.height - expectedRowHeight);
      }, 0);
      if (leftHeightError !== rightHeightError) return leftHeightError - rightHeightError;
      if (left.score !== right.score) return right.score - left.score;
      var targetTop = imageHeight * (segmentDefinition ? segmentDefinition.targetTop : (selectedSegment === 1 ? 0.267 : 0.50));
      return Math.abs(left.rows[0].top - targetTop) - Math.abs(right.rows[0].top - targetTop);
    });
    var selected = segmentGroups[0];
    var tableTop = selected.rows[0].top;
    var tableBottom = selected.rows[selected.rows.length - 1].bottom;
    var gridRight = Math.max.apply(Math, selected.rows.map(function (row) { return row.x + row.step * row.physicalCount; }));
    var vertical = new Array(imageWidth).fill(0);
    for (var column = Math.floor(imageWidth * 0.04); column < Math.floor(imageWidth * 0.98); column += 1) {
      for (var lineY = Math.floor(tableTop + 2); lineY < Math.ceil(tableBottom - 2); lineY += 1) {
        var lineOffset = (lineY * imageWidth + column) * 4;
        if ((pixels[lineOffset] + pixels[lineOffset + 1] + pixels[lineOffset + 2]) / 3 < 220) vertical[column] += 1;
      }
    }
    var tableVerticalPeaks = projectionPeaks(vertical, Math.floor(gridRight - imageWidth * 0.01),
      Math.floor(imageWidth * 0.98), 2, (tableBottom - tableTop) * 0.18);
    var outerRight = tableVerticalPeaks.filter(function (peak) { return peak.position > gridRight + imageWidth * 0.012; })
      .sort(function (left, right) { return right.position - left.position; })[0];
    var scoreRight = outerRight ? outerRight.position : imageWidth * 0.96;
    var correctionStart = Math.min(imageHeight - 1, Math.ceil(tableBottom + imageHeight * 0.012));
    var correctionEnd = Math.min(imageHeight, Math.ceil(tableBottom + imageHeight * 0.09));
    var correctionProjection = horizontal.slice(correctionStart, correctionEnd);
    var correctionPeaks = projectionPeaks(correctionProjection, 0, correctionProjection.length, 2,
      (xEnd - xStart) * 0.3).sort(function (left, right) { return left.position - right.position; });
    var correctionY = correctionPeaks.length ? correctionStart + correctionPeaks[0].position :
      tableBottom + (selected.rows[0].height * 1.05);
    var rowsOut = selected.rows.map(function (row) {
      return { x: row.x * pageWidth / imageWidth, y: row.top * pageHeight / imageHeight,
        cellWidth: row.step * pageWidth / imageWidth, count: row.count,
        height: row.height * pageHeight / imageHeight, confidence: row.confidence };
    });
    var score = { x: gridRight * pageWidth / imageWidth, y: selected.rows[0].bottom * pageHeight / imageHeight,
      w: Math.max(imageWidth * 0.025, scoreRight - gridRight) * pageWidth / imageWidth,
      h: Math.max(1, tableBottom - selected.rows[0].bottom) * pageHeight / imageHeight };
    var correctionHeight = selected.rows[0].height * pageHeight / imageHeight;
    var correction = { x: imageWidth * 0.125 * pageWidth / imageWidth,
      y: (correctionY - selected.rows[0].height * 0.7) * pageHeight / imageHeight,
      w: imageWidth * 0.82 * pageWidth / imageWidth,
      h: correctionHeight * 0.58,
      baseline: (correctionY - selected.rows[0].height * 0.12) * pageHeight / imageHeight };
    return {
      rows: rowsOut, score: score, correction: correction,
      confidence: selected.rows.reduce(function (sum, row) { return sum + row.confidence; }, 0) / selected.rows.length,
      residual: Math.max.apply(Math, selected.rows.map(function (row) { return row.residual; })),
      cellCount: selected.cells,
      lines: { xStart: selected.rows[0].x, xStep: selected.rows[0].step,
        y: selected.rows.map(function (row) { return row.top; }).concat([selected.rows[selected.rows.length - 1].bottom]) }
    };
  }

  function dictationLayout(width, height, answerLength, firstRow, calibration, fittedGrid, params, segmentNumber) {
    var answerCount = Number.isFinite(Number(answerLength)) ? Math.max(0, Math.floor(Number(answerLength))) : 0;
    var fallbackCount = Math.max(1, Math.min(firstRow, answerCount || 1));
    var calibrationValue = calibration || { dx: 0, dy: 0, scale: 1 };
    var configuration = params || templates.dictationParams();
    var grid = configuration.grid || configuration;
    var segmentDefinition = (configuration.segments || []).find(function (segment) { return segment.id === (Number(segmentNumber) === 2 ? 2 : 1); });
    var fallback = grid.fallback || { x: 0.076, y: 0.267, cellWidth: 0.04, rowHeight: 0.034 };
    var fallbackY = segmentDefinition ? segmentDefinition.targetTop : fallback.y;
    function mapRect(rect) {
      var cx = width / 2; var cy = height / 2; var scale = calibrationValue.scale || 1;
      return {
        x: cx + (rect.x - cx) * scale + (calibrationValue.dx || 0),
        y: cy + (rect.y - cy) * scale + (calibrationValue.dy || 0),
        w: rect.w * scale, h: rect.h * scale
      };
    }
    var cells = [];
    var rows = [];
    if (fittedGrid && Array.isArray(fittedGrid.rows) && fittedGrid.rows.length) {
      rows = fittedGrid.rows.map(function (row) {
        return { x: row.x, y: row.y, cellWidth: row.cellWidth, count: row.count, height: row.height };
      });
    } else {
      var fallbackRows = Math.max(1, Math.ceil((answerCount || 1) / fallbackCount));
      for (var rowIndex = 0; rowIndex < fallbackRows; rowIndex += 1) {
        var rowCount = Math.min(fallbackCount, Math.max(0, answerCount - rowIndex * fallbackCount));
        rows.push({ x: fallback.x * width, y: (fallbackY + rowIndex * fallback.rowHeight) * height,
          cellWidth: fallback.cellWidth * width, count: rowCount, height: fallback.rowHeight * height });
      }
    }
    var availableCellCount = rows.reduce(function (sum, row) { return sum + row.count; }, 0);
    var mappedCellCount = Math.min(answerCount, availableCellCount);
    var cursor = 0;
    rows.forEach(function (row) {
      var mappedRow = mapRect({ x: row.x, y: row.y, w: row.cellWidth * row.count, h: row.height });
      for (var index = 0; index < row.count && cursor < mappedCellCount; index += 1) {
        cells.push({ x: mappedRow.x + row.cellWidth * calibrationValue.scale * index,
          y: mappedRow.y, w: row.cellWidth * calibrationValue.scale, h: mappedRow.h });
        cursor += 1;
      }
    });
    function mapped(x, y, w, h) { return mapRect({ x: x * width, y: y * height, w: w * width, h: h * height }); }
    var firstRow = rows[0];
    var lastRow = rows[rows.length - 1];
    var fallbackGridRight = firstRow.x + firstRow.cellWidth * firstRow.count;
    var score = fittedGrid && fittedGrid.score ? fittedGrid.score : {
      x: fallbackGridRight, y: firstRow.y + firstRow.height,
      w: Math.max(0.04 * width, 0.96 * width - fallbackGridRight),
      h: Math.max(firstRow.height, lastRow.y + lastRow.height - (firstRow.y + firstRow.height))
    };
    var correction = fittedGrid && fittedGrid.correction ? fittedGrid.correction : {
      x: 0.125 * width, y: lastRow.y + lastRow.height * 1.3,
      w: 0.82 * width, h: lastRow.height * 0.58,
      baseline: lastRow.y + lastRow.height * 1.93
    };
    var mappedCorrection = mapRect(correction);
    if (correction.baseline != null) {
      var centerY = height / 2;
      mappedCorrection.baseline = centerY + (correction.baseline - centerY) *
        (calibrationValue.scale || 1) + (calibrationValue.dy || 0);
    }
    return {
      pageWidth: width, pageHeight: height, cells: cells,
      rows: rows, availableCellCount: availableCellCount,
      score: mapRect(score), correction: mappedCorrection
    };
  }

  function omrTemplate(mcCount, tfCount) {
    var definition = templates.BUILTIN_TEMPLATES[0];
    return templates.expandChoiceTemplate(definition, { mcCount: mcCount, tfCount: tfCount });
  }

  function mapBubble(bubble, width, height, calibration, localOffset) {
    var cal = calibration || { dx: 0, dy: 0, angle: 0, scale: 1 };
    var x = bubble.x * width; var y = bubble.y * height;
    var cx = width / 2; var cy = height / 2;
    var scale = Number(cal.scale) || 1;
    var angle = (Number(cal.angle) || 0) * Math.PI / 180;
    var sx = (x - cx) * scale; var sy = (y - cy) * scale;
    return {
      x: cx + sx * Math.cos(angle) - sy * Math.sin(angle) + (Number(cal.dx) || 0) * width + (Number(localOffset && localOffset.dx) || 0) * width,
      y: cy + sx * Math.sin(angle) + sy * Math.cos(angle) + (Number(cal.dy) || 0) * height + (Number(localOffset && localOffset.dy) || 0) * height
    };
  }

  root.PdfMarkingGeometry = {
    normalizeRotation: normalizeRotation,
    pageViewport: pageViewport,
    uprightToPdf: uprightToPdf,
    uprightToMediaPoint: uprightToMediaPoint,
    mediaBlitMatrix: mediaBlitMatrix,
    mediaRasterBlitMatrix: mediaRasterBlitMatrix,
    dictationLayout: dictationLayout,
    fitDictationGrid: fitDictationGrid,
    expandChoiceTemplate: templates.expandChoiceTemplate,
    dictationParams: templates.dictationParams,
    identityMaskRects: templates.identityMaskRects,
    omrTemplate: omrTemplate,
    mapBubble: mapBubble
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingGeometry;
})(typeof window !== "undefined" ? window : globalThis);
