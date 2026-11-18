(function (root) {
  "use strict";

  function questionKey(entry) {
    return String(entry.pageNumber) + ":" + String(entry.type) + ":" + String(entry.number);
  }

  function buildReviewQueue(pages, pageCount) {
    var queue = [];
    for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      var page = pages && pages[pageNumber];
      if (!page) continue;
      if (Array.isArray(page.pageFlags) && page.pageFlags.indexOf("答案卷頁：不計分、不匯出") >= 0) continue;
      if (page.pageFailure) {
        queue.push({ kind: "page", pageNumber: pageNumber, type: "page", number: 0,
          answer: "整頁", reason: Array.isArray(page.alignmentDiagnostics && page.alignmentDiagnostics.reasons)
            ? page.alignmentDiagnostics.reasons.join(" ") : "整頁定位失敗，請檢查本頁",
          diagnostic: page.alignmentDiagnostics || null, question: null, key: "page:" + String(pageNumber) });
        continue;
      }
      (Array.isArray(page.questions) ? page.questions : []).forEach(function (question) {
        if (question && question.status === "review" && !question.reviewed) {
          queue.push({ pageNumber: pageNumber, type: question.type, number: question.number,
            answer: question.answer || "", reason: question.reason || "", question: question,
            key: questionKey({ pageNumber: pageNumber, type: question.type, number: question.number }) });
        }
      });
    }
    return queue;
  }

  function groupPageWarnings(pages, pageCount) {
    var grouped = new Map();
    var identityPrefix = "班別／學號核對：";
    var excludedFlag = "答案卷頁：不計分、不匯出";
    function add(key, label, pageNumber, detail) {
      if (!grouped.has(key)) grouped.set(key, { key: key, label: label, entries: [], seen: new Set() });
      var group = grouped.get(key);
      var entryKey = pageNumber + "\u0000" + detail;
      if (group.seen.has(entryKey)) return;
      group.seen.add(entryKey);
      group.entries.push({ pageNumber: pageNumber, detail: detail });
    }
    for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      var page = pages && (pages[pageNumber] || pages[String(pageNumber)]);
      if (!page || Array.isArray(page.pageFlags) && page.pageFlags.indexOf(excludedFlag) >= 0) continue;
      if (page.pageFailure) {
        var reasons = page.alignmentDiagnostics && Array.isArray(page.alignmentDiagnostics.reasons)
          ? page.alignmentDiagnostics.reasons.filter(Boolean) : [];
        add("page-failure", "整頁定位失敗", pageNumber, reasons.join("；") || "請檢查本頁定位");
      }
      (Array.isArray(page.pageFlags) ? page.pageFlags : []).forEach(function (flag) {
        var text = String(flag || "");
        if (!text || text === excludedFlag || text.indexOf(identityPrefix) === 0) return;
        add("flag:" + text, text, pageNumber, text);
      });
    }
    return Array.from(grouped.values()).map(function (group) {
      return { key: group.key, label: group.label, entries: group.entries };
    });
  }

  function findPagesByIdentity(pages, pageCount, classValue, studentId, excludedPages) {
    var normalizedClass = String(classValue || "").trim().toUpperCase();
    var normalizedStudent = String(studentId || "").trim();
    if (!normalizedClass || !normalizedStudent) return [];
    var excluded = new Set((Array.isArray(excludedPages) ? excludedPages : []).map(Number));
    var matches = [];
    for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (excluded.has(pageNumber)) continue;
      var page = pages && (pages[pageNumber] || pages[String(pageNumber)]);
      if (!page || String(page.classValue || "").trim().toUpperCase() !== normalizedClass ||
          String(page.studentId || "").trim() !== normalizedStudent) continue;
      matches.push(pageNumber);
    }
    return matches;
  }

  function questionCropBounds(centers, radius, horizontalStep, rowPitch, pageWidth, pageHeight) {
    var points = (Array.isArray(centers) ? centers : []).filter(function (point) {
      return point && Number.isFinite(point.x) && Number.isFinite(point.y);
    });
    var width = Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 1;
    var height = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 1;
    var safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
    var minX = points.length ? Math.min.apply(Math, points.map(function (point) { return point.x; })) : 0;
    var maxX = points.length ? Math.max.apply(Math, points.map(function (point) { return point.x; })) : minX;
    var centerY = points.length ? points.reduce(function (sum, point) { return sum + point.y; }, 0) / points.length : 0;
    var gap = Number.isFinite(horizontalStep) && horizontalStep > 0 ? horizontalStep : safeRadius * 4;
    var halfRow = Number.isFinite(rowPitch) && rowPitch > 0 ? rowPitch / 2 : safeRadius * 1.5;
    var left = Math.max(0, Math.floor(minX - Math.max(safeRadius * 3.5, gap * 1.15)));
    var right = Math.min(width, Math.ceil(maxX + Math.max(safeRadius * 1.5, gap * 0.35)));
    var top = Math.max(0, Math.floor(centerY - safeRadius - halfRow));
    var bottom = Math.min(height, Math.ceil(centerY + safeRadius + halfRow));
    return { left: left, top: top, right: right, bottom: bottom, centerY: centerY };
  }

  function hasForcedReadPending(page, questions) {
    var pending = Boolean(page && Array.isArray(page.pageFlags) && page.pageFlags.indexOf("整頁讀取中：所有題目須逐題確認後才計分") >= 0);
    if (!pending) return false;
    return (Array.isArray(questions) ? questions : page.questions || []).some(function (question) {
      return question && question.status === "review" && !question.reviewed;
    });
  }

  function nextIndex(queue, currentIndex, direction) {
    if (!Array.isArray(queue) || !queue.length) return -1;
    var step = direction < 0 ? -1 : 1;
    var current = Number.isInteger(currentIndex) ? currentIndex : -1;
    if (current < 0 || current >= queue.length) return step > 0 ? 0 : queue.length - 1;
    var candidate = current + step;
    return candidate < 0 || candidate >= queue.length ? -1 : candidate;
  }

  function findIndex(queue, pageNumber, type, number) {
    if (!Array.isArray(queue)) return -1;
    return queue.findIndex(function (entry) {
      return entry.pageNumber === pageNumber && entry.type === type && entry.number === number;
    });
  }

  function focusCropBounds(centers, radius, pageWidth, pageHeight) {
    var points = (Array.isArray(centers) ? centers : []).filter(function (point) {
      return point && Number.isFinite(point.x) && Number.isFinite(point.y);
    });
    var safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
    var minX = points.length ? Math.min.apply(Math, points.map(function (point) { return point.x; })) : 0;
    var maxX = points.length ? Math.max.apply(Math, points.map(function (point) { return point.x; })) : minX;
    var rowY = points.length ? points.reduce(function (total, point) { return total + point.y; }, 0) / points.length : 0;
    var width = Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 1;
    var height = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 1;
    var left = Math.max(0, Math.floor(minX - safeRadius * 3.5));
    var right = Math.min(width, Math.ceil(maxX + safeRadius * 3.5));
    var top = Math.max(0, Math.floor(rowY - safeRadius * 1.35));
    var bottom = Math.min(height, Math.ceil(rowY + safeRadius * 1.35));
    var focusLeft = Math.max(left, Math.floor(minX - safeRadius * 1.15));
    var focusRight = Math.min(right, Math.ceil(maxX + safeRadius * 1.15));
    var focusTop = Math.max(top, Math.floor(rowY - safeRadius * 1.08));
    var focusBottom = Math.min(bottom, Math.ceil(rowY + safeRadius * 1.08));
    return {
      left: left, top: top, right: right, bottom: bottom,
      focus: { left: focusLeft, top: focusTop, right: focusRight, bottom: focusBottom, centerY: rowY }
    };
  }

  function hasManualEdits(pages) {
    return Object.keys(pages || {}).some(function (pageNumber) {
      var page = pages[pageNumber] || {};
      return Boolean(page.classWasEdited || page.studentIdWasEdited || page.focusDraftEdited ||
        Array.isArray(page.pageFlags) && page.pageFlags.indexOf("整頁讀取中：所有題目須逐題確認後才計分") >= 0) ||
        (Array.isArray(page.questions) && page.questions.some(function (question) {
          return question && (question.status === "manual" || question.focusDraftEdited);
        }));
    });
  }

  function confirmQuestion(question) {
    if (!question) return false;
    if (question.status === "review") question.status = "manual";
    question.reviewed = true;
    return true;
  }

  var api = {
    buildReviewQueue: buildReviewQueue,
    groupPageWarnings: groupPageWarnings,
    findPagesByIdentity: findPagesByIdentity,
    questionCropBounds: questionCropBounds,
    nextIndex: nextIndex,
    findIndex: findIndex,
    focusCropBounds: focusCropBounds,
    hasManualEdits: hasManualEdits,
    confirmQuestion: confirmQuestion,
    hasForcedReadPending: hasForcedReadPending
  };
  root.PdfMarkingReview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
