(function (root) {
  "use strict";

  function questionKey(entry) {
    return String(entry.pageNumber) + ":" + String(entry.type) + ":" + String(entry.number);
  }

  function buildReviewQueue(pages, pageCount) {
    var queue = [];
    for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      var page = pages && pages[pageNumber];
      if (!page || page.pageFailure) continue;
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
      return Boolean(page.classWasEdited || page.studentIdWasEdited || page.focusDraftEdited) ||
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
    nextIndex: nextIndex,
    findIndex: findIndex,
    focusCropBounds: focusCropBounds,
    hasManualEdits: hasManualEdits,
    confirmQuestion: confirmQuestion
  };
  root.PdfMarkingReview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
