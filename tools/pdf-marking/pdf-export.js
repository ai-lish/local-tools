(function (root) {
  "use strict";

  var geometry = root.PdfMarkingGeometry;
  var model = root.PdfMarkingModel;
  var RED = "#c5161d";

  function inkIntegral(imageData) {
    if (!imageData || !imageData.data) return null;
    var width = imageData.width; var height = imageData.height; var stride = width + 1;
    var integral = new Uint32Array(stride * (height + 1));
    var pixels = imageData.data;
    for (var y = 0; y < height; y += 1) {
      var lineCount = 0;
      for (var x = 0; x < width; x += 1) {
        var offset = (y * width + x) * 4;
        if ((pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 < 218) lineCount += 1;
        integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + lineCount;
      }
    }
    return { width: width, height: height, stride: stride, values: integral };
  }

  function inkCount(integral, x, y, width, height) {
    var left = Math.max(0, Math.min(integral.width, Math.floor(x)));
    var top = Math.max(0, Math.min(integral.height, Math.floor(y)));
    var right = Math.max(left, Math.min(integral.width, Math.ceil(x + width)));
    var bottom = Math.max(top, Math.min(integral.height, Math.ceil(y + height)));
    var stride = integral.stride; var values = integral.values;
    return values[bottom * stride + right] - values[top * stride + right] -
      values[bottom * stride + left] + values[top * stride + left];
  }

  function findLeastInkRect(integral, bounds, width, height, verticalSearch, preferTop) {
    if (!integral) return { x: bounds.x + (bounds.w - width) / 2, y: bounds.y + (bounds.h - height) / 2,
      w: width, h: height, inkFraction: 1 };
    var left = Math.max(0, Math.ceil(bounds.x + 2));
    var right = Math.min(integral.width, Math.floor(bounds.x + bounds.w - 2));
    var top = Math.max(0, Math.ceil(bounds.y + 2));
    var bottom = Math.min(integral.height, Math.floor(bounds.y + bounds.h - 2));
    var rectWidth = Math.max(1, Math.min(right - left, Math.ceil(width)));
    var rectHeight = Math.max(1, Math.min(bottom - top, Math.ceil(height)));
    var maxX = Math.max(left, right - rectWidth);
    var maxY = Math.max(top, bottom - rectHeight);
    var step = 3;
    var best = null;
    for (var y = top; y <= maxY; y += verticalSearch ? step : Math.max(1, maxY - top + 1)) {
      for (var x = left; x <= maxX; x += step) {
        var count = inkCount(integral, x, y, rectWidth, rectHeight);
        var preference = preferTop ? (y - top) * (integral.width + 1) + (x - left) :
          Math.abs(x + rectWidth / 2 - (left + right) / 2) + Math.abs(y + rectHeight / 2 - (top + bottom) / 2);
        if (!best || count < best.count || (count === best.count && preference < best.preference)) {
          best = { x: x, y: y, w: rectWidth, h: rectHeight, count: count, preference: preference };
        }
      }
    }
    best.inkFraction = best.count / Math.max(1, best.w * best.h);
    return best;
  }

  function choiceBannerRect(imageData, labelWidth, labelHeight) {
    var integral = inkIntegral(imageData);
    var width = imageData ? imageData.width : 0; var height = imageData ? imageData.height : 0;
    var bounds = { x: 4, y: 2, w: Math.max(1, width - 8), h: Math.max(1, height * 0.15) };
    var rect = findLeastInkRect(integral, bounds, labelWidth + 12, labelHeight + 8, true, true);
    return { x: rect.x, y: rect.y, w: rect.w, h: rect.h, inkFraction: rect.inkFraction };
  }

  function choiceAnswers(pageRecord, mcCount, tfCount) {
    var answers = Array(mcCount).fill("");
    var tfAnswers = Array(tfCount).fill("");
    if (pageRecord && Array.isArray(pageRecord.answers)) answers = answers.map(function (_, index) { return pageRecord.answers[index] || ""; });
    if (pageRecord && Array.isArray(pageRecord.tfAnswers)) tfAnswers = tfAnswers.map(function (_, index) { return pageRecord.tfAnswers[index] || ""; });
    (pageRecord && Array.isArray(pageRecord.questions) ? pageRecord.questions : []).forEach(function (question) {
      var index = Number(question.number) - 1;
      if (!Number.isInteger(index) || index < 0) return;
      if (question.type === "tf" && index < tfAnswers.length) tfAnswers[index] = question.answer || "";
      if (question.type === "mc" && index < answers.length) answers[index] = question.answer || "";
    });
    return { answers: answers, tfAnswers: tfAnswers };
  }

  function canvasBytes(dataUrl) {
    var binary = root.atob(dataUrl.split(",")[1] || "");
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function pdfPoint(viewport, x, y) {
    if (viewport.convertToPdfPoint) return viewport.convertToPdfPoint(x, y);
    return geometry.uprightToPdf(viewport, x, y);
  }

  function drawRedCircle(page, viewport, point, radius, pdfLib) {
    var center = pdfPoint(viewport, point.x, point.y);
    var edge = pdfPoint(viewport, point.x + radius, point.y);
    var pdfRadius = Math.hypot(center[0] - edge[0], center[1] - edge[1]);
    page.drawEllipse({ x: center[0], y: center[1], xScale: pdfRadius, yScale: pdfRadius,
      borderColor: pdfLib.rgb(0.77, 0.05, 0.08), borderWidth: 1.2 });
  }

  function drawArrow(page, viewport, box, pdfLib) {
    var cx = box.x + box.w / 2;
    var top = box.y + box.h - 2;
    var points = [[cx, top], [cx - 7, top + 10], [cx, top + 7], [cx + 7, top + 10]]
      .map(function (point) { return pdfPoint(viewport, point[0], point[1]); });
    [[0, 1], [0, 2], [0, 3]].forEach(function (pair) {
      page.drawLine({ start: { x: points[pair[0]][0], y: points[pair[0]][1] },
        end: { x: points[pair[1]][0], y: points[pair[1]][1] }, thickness: 1.2,
        color: pdfLib.rgb(0.77, 0.05, 0.08) });
    });
  }

  function drawCross(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size);
    ctx.stroke();
  }

  function drawCheck(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size, y); ctx.lineTo(x - size * 0.2, y + size * 0.8);
    ctx.lineTo(x + size * 1.2, y - size * 0.9);
    ctx.stroke();
  }

  function drawChoiceAnnotations(canvas, viewport, pageRecord, settings, pageNumber, sourceData) {
    pageRecord = pageRecord || {};
    var ctx = canvas.getContext("2d");
    var width = canvas.width; var height = canvas.height;
    var template = geometry.omrTemplate(settings.mcCount, settings.tfCount);
    var calibration = pageRecord.calibration || { dx: 0, dy: 0, angle: 0, scale: 1 };
    var responses = choiceAnswers(pageRecord, settings.mcCount, settings.tfCount);
    ctx.save(); ctx.strokeStyle = RED; ctx.fillStyle = RED;
    ctx.lineWidth = Math.max(2, width / viewport.width * 1.1);
    template.items.forEach(function (item) {
      var key = item.type === "mc" ? settings.mcKey[item.number - 1] : settings.tfKey[item.number - 1];
      if (!key) return;
      var answer = item.type === "mc" ? responses.answers[item.number - 1] : responses.tfAnswers[item.number - 1];
      var question = (pageRecord.questions || []).find(function (entry) {
        return entry.type === item.type && Number(entry.number) === item.number;
      });
      var localOffsets = question && Array.isArray(question.localOffsets) ? question.localOffsets : [];
      var options = answer ? Array.from(answer) : [];
      var points = item.choices;
      if (!answer) {
        var lastBubble = geometry.mapBubble(points[points.length - 1], viewport.width, viewport.height, calibration,
          localOffsets[points.length - 1]);
        ctx.fillStyle = RED; ctx.font = "700 " + Math.max(14, width / viewport.width * 12) + "px sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(question && question.status === "review" ? "待覆核" : "未答",
          lastBubble.x * width / viewport.width + width / viewport.width * 8,
          lastBubble.y * height / viewport.height);
        ctx.textAlign = "center";
      }
      options.forEach(function (option) {
        if (option === key) return;
        var bubble = points.find(function (entry) { return entry.option === option; });
        if (!bubble) return;
        var mapped = geometry.mapBubble(bubble, viewport.width, viewport.height, calibration, localOffsets[points.indexOf(bubble)]);
        drawCross(ctx, mapped.x * width / viewport.width, mapped.y * height / viewport.height,
          Math.max(4, width / viewport.width * 3.3));
      });
      if (options.length !== 1 || options[0] !== key) {
        var target = points.find(function (entry) { return entry.option === key; });
        var mappedTarget = geometry.mapBubble(target, viewport.width, viewport.height, calibration,
          localOffsets[points.indexOf(target)]);
        drawCheck(ctx, mappedTarget.x * width / viewport.width, mappedTarget.y * height / viewport.height,
          Math.max(4, width / viewport.width * 3.0));
      }
    });
    var summary = model.scoreQuestions(responses, settings.mcKey, settings.tfKey, settings.mcPoints, settings.tfPoints);
    var line = "第 " + pageNumber + " 頁　班別 " + (pageRecord.classValue || "未確認") +
      "　學號 " + (pageRecord.studentId || "未確認") + "　得分 " + summary.earned + " / " + summary.maximum;
    ctx.font = "700 " + Math.max(17, width * 0.018) + "px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var labelWidth = ctx.measureText(line).width + width * 0.025;
    var labelHeight = Math.max(25, height * 0.022);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    var labelRect = choiceBannerRect(sourceData, labelWidth, labelHeight);
    ctx.fillRect(labelRect.x, labelRect.y, labelRect.w, labelRect.h);
    ctx.fillStyle = RED;
    ctx.fillText(line, labelRect.x + labelRect.w / 2, labelRect.y + labelRect.h / 2);
    ctx.restore();
  }

  function drawDictationAnnotations(canvas, layout, page, answer, sourceData) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var ratioX = canvas.width / layout.pageWidth;
    var ratioY = canvas.height / layout.pageHeight;
    ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = Math.max(2, ratioX * 1.4);
    (page.circles || []).forEach(function (index) {
      var box = layout.cells[index];
      if (!box) return;
      ctx.beginPath();
      ctx.ellipse((box.x + box.w / 2) * ratioX, (box.y + box.h / 2) * ratioY,
        Math.min(box.w, box.h) * 0.42 * ratioX, Math.min(box.w, box.h) * 0.42 * ratioY, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    (page.arrows || []).forEach(function (index) {
      var box = layout.cells[index];
      if (!box) return;
      var cx = (box.x + box.w / 2) * ratioX;
      var tipY = (box.y + box.h - 2) * ratioY;
      var dx = Math.min(7, box.w * 0.22) * ratioX;
      var dy = Math.min(12, box.h * 0.28) * ratioY;
      ctx.beginPath(); ctx.moveTo(cx, tipY); ctx.lineTo(cx - dx, tipY + dy);
      ctx.moveTo(cx, tipY); ctx.lineTo(cx + dx, tipY + dy);
      ctx.moveTo(cx, tipY); ctx.lineTo(cx, tipY + dy * 0.8); ctx.stroke();
    });
    ctx.restore();

    var score = model.dictationScoreFromCount(model.deductionCount(page.circles, page.miss)).toFixed(1);
    ctx.fillStyle = RED;
    var scoreFont = Math.max(14, Math.min(layout.score.h * ratioY * 0.46,
      layout.score.w * ratioX / Math.max(3, score.length + 0.5)));
    ctx.font = "700 " + scoreFont + "px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var integral = inkIntegral(sourceData);
    var scoreRect = findLeastInkRect(integral, {
      x: layout.score.x * ratioX, y: layout.score.y * ratioY,
      w: layout.score.w * ratioX, h: layout.score.h * ratioY
    }, ctx.measureText(score).width + 2, scoreFont * 1.18, true);
    ctx.fillText(score, scoreRect.x + scoreRect.w / 2, scoreRect.y + scoreRect.h / 2);
    var box = layout.correction;
    if (!box || !answer) return;
    var size = Math.max(12, Math.min(box.h * ratioY * 0.62,
      box.w * ratioX / Math.max(1, answer.length) * 0.92));
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    var missed = new Set(page.miss || []);
    var baseline = box.baseline ? box.baseline * ratioY : (box.y + box.h * 0.88) * ratioY;
    var correctionRect = findLeastInkRect(integral, {
      x: box.x * ratioX, y: Math.max(box.y * ratioY, baseline - size * 0.82),
      w: box.w * ratioX, h: Math.min(box.h * ratioY, size * 1.1)
    }, Math.min(box.w * ratioX, size * answer.length), size * 1.05, false);
    var cursor = correctionRect.x;
    for (var i = 0; i < answer.length; i += 1) {
      var glyph = answer.charAt(i);
      ctx.fillStyle = missed.has(i) ? "#c40000" : "#161616";
      ctx.font = (missed.has(i) ? "800 " : "600 ") + size + "px sans-serif";
      ctx.fillText(glyph, cursor, baseline);
      cursor += ctx.measureText(glyph).width;
    }
  }

  async function embedAnnotation(canvas, libDoc, libPage, rotation, pdfLib) {
    var media = root.document.createElement("canvas");
    var box = libPage.getMediaBox(); var ratio = 2;
    media.width = Math.max(1, Math.round(box.width * ratio));
    media.height = Math.max(1, Math.round(box.height * ratio));
    var matrix = geometry.mediaRasterBlitMatrix(rotation, box.width, box.height, ratio, ratio);
    var context = media.getContext("2d");
    context.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    context.drawImage(canvas, 0, 0);
    var png = await libDoc.embedPng(canvasBytes(media.toDataURL("image/png")));
    libPage.drawImage(png, { x: box.x, y: box.y, width: box.width, height: box.height });
  }

  async function exportChoicePdf(bytes, state) {
    if (!root.pdfjsLib || !root.PDFLib) throw new Error("PDF 元件未能載入。請檢查網絡後重試。");
    var pdfjs = await root.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    var pdfLib = await root.PDFLib.PDFDocument.load(bytes.slice(0));
    var count = Math.min(pdfjs.numPages, pdfLib.getPageCount());
    for (var index = 0; index < count; index += 1) {
      var jsPage = await pdfjs.getPage(index + 1);
      var viewport = jsPage.getViewport({ scale: 2 });
      var canvas = root.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      var sourceContext = canvas.getContext("2d", { willReadFrequently: true });
      await jsPage.render({ canvasContext: sourceContext, viewport: viewport }).promise;
      var sourceData = sourceContext.getImageData(0, 0, canvas.width, canvas.height);
      sourceContext.clearRect(0, 0, canvas.width, canvas.height);
      drawChoiceAnnotations(canvas, viewport, state.pages[index + 1], state.settings, index + 1, sourceData);
      var libPage = pdfLib.getPage(index);
      var rotation = ((libPage.getRotation().angle % 360) + 360) % 360;
      await embedAnnotation(canvas, pdfLib, libPage, rotation, root.PDFLib);
    }
    return pdfLib.save();
  }

  async function exportDictationPdf(bytes, state) {
    if (!root.pdfjsLib || !root.PDFLib) throw new Error("PDF 元件未能載入。請檢查網絡後重試。");
    var pdfjs = await root.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    var pdfLib = await root.PDFLib.PDFDocument.load(bytes.slice(0));
    var count = Math.min(pdfjs.numPages, pdfLib.getPageCount());
    for (var index = 0; index < count; index += 1) {
      var pageNumber = index + 1;
      var record = model.dictationRecord(state.pages[pageNumber], state.answer.length, state.punctuation) || model.blankDictationPage();
      var jsPage = await pdfjs.getPage(pageNumber);
      var baseViewport = jsPage.getViewport({ scale: 1 });
      var viewport = jsPage.getViewport({ scale: 2 });
      var source = root.document.createElement("canvas");
      source.width = Math.ceil(viewport.width); source.height = Math.ceil(viewport.height);
      var sourceContext = source.getContext("2d", { willReadFrequently: true });
      await jsPage.render({ canvasContext: sourceContext, viewport: viewport }).promise;
      var sourceData = sourceContext.getImageData(0, 0, source.width, source.height);
      var fittedGrid = geometry.fitDictationGrid(sourceData, baseViewport.width, baseViewport.height, state.segment);
      var layout = geometry.dictationLayout(baseViewport.width, baseViewport.height, state.answer.length,
        state.firstRow, state.calibration || { dx: 0, dy: 0, scale: 1 }, fittedGrid);
      var annotation = root.document.createElement("canvas");
      annotation.width = Math.ceil(viewport.width); annotation.height = Math.ceil(viewport.height);
      drawDictationAnnotations(annotation, layout, record, state.answer, sourceData);
      var libPage = pdfLib.getPage(index);
      var rotation = ((libPage.getRotation().angle % 360) + 360) % 360;
      layout.cells.forEach(function (cell, cellIndex) {
        if (record.circles.indexOf(cellIndex) < 0 && record.arrows.indexOf(cellIndex) < 0) return;
        if (record.circles.indexOf(cellIndex) >= 0) {
          drawRedCircle(libPage, baseViewport, {
            x: cell.x + cell.w / 2, y: cell.y + cell.h / 2
          }, Math.min(cell.w, cell.h) * 0.42, root.PDFLib);
        }
        if (record.arrows.indexOf(cellIndex) >= 0) {
          drawArrow(libPage, baseViewport, cell, root.PDFLib);
        }
      });
      await embedAnnotation(annotation, pdfLib, libPage, rotation, root.PDFLib);
    }
    return pdfLib.save();
  }

  root.PdfMarkingExport = {
    drawChoiceAnnotations: drawChoiceAnnotations,
    drawDictationAnnotations: drawDictationAnnotations,
    choiceAnswers: choiceAnswers,
    choiceBannerRect: choiceBannerRect,
    exportChoicePdf: exportChoicePdf,
    exportDictationPdf: exportDictationPdf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingExport;
})(typeof window !== "undefined" ? window : globalThis);
