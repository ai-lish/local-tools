(function (root) {
  "use strict";

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeAnswerCell(value, allowedOptions) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return { ok: true, value: "" };
    var allowed = Array.from(new Set((Array.isArray(allowedOptions) ? allowedOptions : []).map(function (item) {
      return String(item).toUpperCase();
    })));
    var normalized = Array.from(raw.toUpperCase());
    var invalid = normalized.filter(function (letter) { return allowed.indexOf(letter) < 0; });
    if (invalid.length) return { ok: false, value: "", invalid: Array.from(new Set(invalid)) };
    return { ok: true, value: Array.from(new Set(normalized)).sort().join("") };
  }

  function parseTsvPaste(value, options) {
    var settings = options || {};
    var startRow = Math.max(0, Math.floor(Number(settings.startRow) || 0));
    var startColumn = Math.max(0, Math.floor(Number(settings.startColumn) || 0));
    var rowCount = Math.max(0, Math.floor(Number(settings.rowCount) || 0));
    var columnCount = Math.max(0, Math.floor(Number(settings.columnCount) || 0));
    var source = String(value == null ? "" : value).replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
    var rows = source.split("\n");
    while (rows.length && rows[rows.length - 1] === "") rows.pop();
    var updates = [];
    var errors = [];
    rows.forEach(function (line, rowOffset) {
      line.split("\t").forEach(function (cellValue, columnOffset) {
        var row = startRow + rowOffset;
        var column = startColumn + columnOffset;
        if (row >= rowCount || column >= columnCount) {
          errors.push({ row: row + 1, column: column + 1, message: "超出表格範圍" });
          return;
        }
        updates.push({ row: row, column: column, value: cellValue });
      });
    });
    return { updates: updates, errors: errors, rows: rows.length };
  }

  function snapshotPages(pages, pageNumbers) {
    var snapshot = { pageStates: {} };
    Array.from(new Set((Array.isArray(pageNumbers) ? pageNumbers : []).map(function (pageNumber) {
      return String(pageNumber);
    }))).forEach(function (pageNumber) {
      var exists = Object.prototype.hasOwnProperty.call(pages || {}, pageNumber);
      snapshot.pageStates[pageNumber] = exists
        ? { exists: true, value: copy(pages[pageNumber]) }
        : { exists: false };
    });
    return snapshot;
  }

  function restorePages(pages, snapshot) {
    var restored = copy(pages || {});
    var pageStates = snapshot && snapshot.pageStates || {};
    Object.keys(pageStates).forEach(function (pageNumber) {
      var entry = pageStates[pageNumber];
      if (entry && entry.exists) restored[pageNumber] = copy(entry.value);
      else delete restored[pageNumber];
    });
    return restored;
  }

  function prepareFailedPageForTable(page, items, forcedReadFlag) {
    var prepared = copy(page || {});
    prepared.questions = Array.isArray(prepared.questions) ? prepared.questions : [];
    (Array.isArray(items) ? items : []).forEach(function (item) {
      var question = prepared.questions.find(function (entry) {
        return entry && entry.type === item.type && entry.number === item.number;
      });
      if (!question) {
        question = { type: item.type, number: item.number, answer: "", status: "review", reason: "", reviewed: false, values: [] };
        prepared.questions.push(question);
      }
      question.answer = "";
      question.status = "review";
      question.reason = "整頁定位失敗後，需逐題確認";
      question.reviewed = false;
      question.focusDraftEdited = false;
    });
    prepared.pageFailure = false;
    prepared.pageFlags = Array.isArray(prepared.pageFlags) ? prepared.pageFlags.slice() : [];
    var flag = String(forcedReadFlag || "");
    if (flag && prepared.pageFlags.indexOf(flag) < 0) prepared.pageFlags.push(flag);
    return prepared;
  }

  function createUndoStack(limit) {
    var maximum = Number.isInteger(limit) && limit > 0 ? limit : 20;
    var history = [];
    return {
      push: function (value) {
        history.push(copy(value));
        if (history.length > maximum) history.shift();
      },
      undo: function () { return history.length ? history.pop() : null; },
      invalidatePages: function (pageNumbers) {
        var keys = new Set((Array.isArray(pageNumbers) ? pageNumbers : []).map(String));
        history.forEach(function (entry) {
          var pageStates = entry && entry.pageStates;
          if (!pageStates) return;
          keys.forEach(function (pageNumber) { delete pageStates[pageNumber]; });
        });
        history = history.filter(function (entry) {
          return !entry || !entry.pageStates || Object.keys(entry.pageStates).length > 0;
        });
      },
      canUndo: function () { return history.length > 0; },
      clear: function () { history = []; },
      size: function () { return history.length; }
    };
  }

  var api = {
    normalizeAnswerCell: normalizeAnswerCell,
    parseTsvPaste: parseTsvPaste,
    snapshotPages: snapshotPages,
    restorePages: restorePages,
    prepareFailedPageForTable: prepareFailedPageForTable,
    createUndoStack: createUndoStack
  };
  root.PdfMarkingChoiceReviewTable = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
