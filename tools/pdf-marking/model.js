(function (root) {
  "use strict";

  var PUNCTUATION = "，、。";

  function dictationSegmentAnswer(segment, segmentNumber, firstAnswer) {
    if (segment && segment.answer != null) return String(segment.answer);
    return Number(segmentNumber) === 2 ? "" : String(firstAnswer || "");
  }

  function normalizeChoice(value) {
    return Array.from(new Set(String(value || "").toUpperCase().replace(/[^A-F]/g, "").split("")))
      .sort().join("");
  }

  function parseKey(value, count, choices) {
    var key = String(value || "").toUpperCase().replace(/\s/g, "");
    if (key.length !== count) return { ok: false, values: [], message: "答案數目須為 " + count + "。" };
    var values = Array.from(key);
    if (values.some(function (item) { return choices.indexOf(item) === -1; })) {
      return { ok: false, values: [], message: "答案只可使用 " + choices.join("、") + "。" };
    }
    return { ok: true, values: values, message: "" };
  }

  function parsePoints(value, count) {
    var source = String(value == null ? "" : value).trim();
    if (!source) return { ok: true, values: Array(count).fill(1), message: "" };
    var tokens = source.split(/[，,\s]+/).filter(Boolean);
    if (tokens.length === 1) tokens = Array(count).fill(tokens[0]);
    if (tokens.length !== count) return { ok: false, values: [], message: "每題分數須提供 " + count + " 個數值，或填一個共用分數。" };
    var values = tokens.map(Number);
    if (values.some(function (number) { return !Number.isFinite(number) || number < 0; })) {
      return { ok: false, values: [], message: "每題分數必須是零或以上的數值。" };
    }
    return { ok: true, values: values, message: "" };
  }

  function scoreQuestions(page, mcKey, tfKey, mcPoints, tfPoints) {
    var earned = 0;
    var maximum = 0;
    var correctness = [];
    var answers = (page && page.answers) || [];
    var tfAnswers = (page && page.tfAnswers) || [];
    for (var i = 0; i < mcKey.length; i += 1) {
      var point = Number(mcPoints[i] || 0);
      var correct = normalizeChoice(answers[i]) === mcKey[i];
      maximum += point;
      if (correct) earned += point;
      correctness.push(correct);
    }
    for (var j = 0; j < tfKey.length; j += 1) {
      var tfPoint = Number(tfPoints[j] || 0);
      var tfCorrect = String(tfAnswers[j] || "").toUpperCase() === tfKey[j];
      maximum += tfPoint;
      if (tfCorrect) earned += tfPoint;
      correctness.push(tfCorrect);
    }
    return { earned: earned, maximum: maximum, correctness: correctness };
  }

  function roundToHalf(value) {
    return Math.round(value * 2) / 2;
  }

  function dictationScoreFromCount(count) {
    return Math.max(0, Math.min(10, roundToHalf(10 - count * 0.5)));
  }

  function deductionCount(circles, miss) {
    var set = new Set(circles || []);
    (miss || []).forEach(function (index) { set.add(index); });
    return set.size;
  }

  function autoPunctuation(answer) {
    var text = String(answer || "");
    var indexes = [];
    for (var i = 0; i < text.length; i += 1) {
      if (PUNCTUATION.indexOf(text.charAt(i)) !== -1) indexes.push(i);
    }
    return indexes;
  }

  function blankDictationPage() {
    return { studentId: "", circles: [], arrows: [], miss: [] };
  }

  function cloneDictationPage(page) {
    return {
      studentId: page && page.studentId ? String(page.studentId) : "",
      circles: (page && page.circles ? page.circles : []).slice(),
      arrows: (page && page.arrows ? page.arrows : []).slice(),
      miss: (page && page.miss ? page.miss : []).slice()
    };
  }

  function normalizeIndexes(list, length, blocked) {
    if (!Array.isArray(list)) return null;
    var seen = new Set();
    var out = [];
    var dropped = 0;
    for (var i = 0; i < list.length; i += 1) {
      var value = list[i];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= length) { dropped += 1; continue; }
      if (blocked && blocked.has(value)) { dropped += 1; continue; }
      if (seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return { values: out.sort(function (a, b) { return a - b; }), dropped: dropped };
  }

  function dictationRecord(page, answerLength, punctuation) {
    var blocked = new Set(punctuation || []);
    var circles = normalizeIndexes(page && page.circles, answerLength, blocked);
    var arrows = normalizeIndexes(page && page.arrows, answerLength, null);
    var miss = normalizeIndexes(page && page.miss, answerLength, blocked);
    if (!circles || !arrows || !miss) return null;
    var count = deductionCount(circles.values, miss.values);
    return {
      studentId: page && page.studentId != null ? String(page.studentId).slice(0, 24) : "",
      circles: circles.values,
      arrows: arrows.values,
      miss: miss.values,
      droppedIndexes: circles.dropped + arrows.dropped + miss.dropped,
      N: count,
      score: dictationScoreFromCount(count)
    };
  }

  function sanitizeDictationPages(pages, answerLength, punctuation) {
    var clean = {};
    var droppedIndexes = 0;
    Object.keys(pages || {}).forEach(function (pageNumber) {
      var record = dictationRecord(pages[pageNumber], answerLength, punctuation);
      if (record) {
        clean[pageNumber] = { studentId: record.studentId, circles: record.circles,
          arrows: record.arrows, miss: record.miss };
        droppedIndexes += record.droppedIndexes;
      } else {
        clean[pageNumber] = blankDictationPage();
      }
    });
    return { pages: clean, droppedIndexes: droppedIndexes };
  }

  function choiceAnswersForSettings(page, type, count) {
    var byNumber = new Map();
    (page && Array.isArray(page.questions) ? page.questions : []).forEach(function (question) {
      if (question.type === type && Number.isInteger(Number(question.number)) && Number(question.number) > 0) {
        byNumber.set(Number(question.number), String(question.answer || ""));
      }
    });
    var answers = [];
    for (var number = 1; number <= count; number += 1) answers.push(byNumber.get(number) || "");
    return answers;
  }

  function choiceQuestionForSettings(page, type, number) {
    return (page && Array.isArray(page.questions) ? page.questions : []).find(function (question) {
      return question.type === type && Number(question.number) === number;
    }) || null;
  }

  function choiceIdentityConfirmed(page) {
    if (!page) return false;
    var classValue = String(page.classValue || "").trim();
    var studentId = String(page.studentId || "").replace(/\D/g, "");
    var metadata = page.metadata || {};
    var requirements = page.identityRequirements || { grade: true, form: true, studentDigits: 2 };
    var gradeRequired = requirements.grade !== false;
    var formRequired = requirements.form !== false;
    var classRequired = gradeRequired || formRequired;
    var classRead = !classRequired || (Boolean(classValue) && (page.classWasEdited ||
      ((!gradeRequired || metadata.grade && metadata.grade.status === "read") &&
        (!formRequired || metadata.form && metadata.form.status === "read"))));
    var idDigits = Array.isArray(metadata.idDigits) ? metadata.idDigits : [];
    var digitCount = Number.isInteger(requirements.studentDigits) ? requirements.studentDigits : 2;
    var idRead = digitCount === 0 || (idDigits.length === digitCount && idDigits.every(function (digit) { return digit && digit.status === "read"; }));
    var studentRead = digitCount === 0 || (studentId.length === digitCount && /^\d+$/.test(studentId) && (page.studentIdWasEdited || idRead));
    return Boolean(classRead && studentRead);
  }

  function choiceIdentityWarnings(pages, pageCount) {
    var warnings = {};
    var grouped = new Map();
    for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      var page = (pages || {})[pageNumber] || (pages || {})[String(pageNumber)];
      if (!page) continue;
      var requirements = page.identityRequirements || { grade: true, form: true, studentDigits: 2 };
      var digitCount = Number.isInteger(requirements.studentDigits) ? requirements.studentDigits : 2;
      var needsClass = requirements.grade !== false || requirements.form !== false;
      var classValue = String(page.classValue || "").toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 8);
      var studentId = String(page.studentId || "").replace(/\D/g, "").slice(0, digitCount || 12);
      var studentMatches = digitCount === 0 || studentId.length === digitCount && /^\d+$/.test(studentId);
      if (!choiceIdentityConfirmed(page)) {
        warnings[pageNumber] = ["班別／學號核對：第 " + pageNumber + " 頁，班別「" + (classValue || "空白") +
          "」，學號「" + (studentId || "空白") + "」未確認"];
      }
      if (studentMatches && digitCount > 0 && (classValue || !needsClass)) {
        var key = classValue + "|" + studentId;
        if (!grouped.has(key)) grouped.set(key, { classValue: classValue, studentId: studentId, pages: [] });
        grouped.get(key).pages.push(pageNumber);
      }
    }
    grouped.forEach(function (entry) {
      if (entry.pages.length < 2) return;
      var message = "班別／學號核對：班別「" + entry.classValue + "」，學號「" + entry.studentId +
        "」重複（第 " + entry.pages.join("、") + " 頁）";
      entry.pages.forEach(function (pageNumber) {
        if (!warnings[pageNumber]) warnings[pageNumber] = [];
        warnings[pageNumber].push(message);
      });
    });
    return warnings;
  }

  function choiceReviewSummary(pages, pageCount, mcCount, tfCount) {
    var pagesPending = 0;
    var questionsPending = 0;
    var identityPages = 0;
    var pageFailures = 0;
    for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      var page = (pages || {})[pageNumber] || (pages || {})[String(pageNumber)];
      if (!page) {
        pagesPending += 1;
        questionsPending += mcCount + tfCount;
        identityPages += 1;
        continue;
      }
      var pending = 0;
      if (page.pageFailure) pageFailures += 1;
      else {
        for (var mc = 1; mc <= mcCount; mc += 1) {
          var mcQuestion = choiceQuestionForSettings(page, "mc", mc);
          if (!mcQuestion || mcQuestion.status === "review") pending += 1;
        }
        for (var tf = 1; tf <= tfCount; tf += 1) {
          var tfQuestion = choiceQuestionForSettings(page, "tf", tf);
          if (!tfQuestion || tfQuestion.status === "review") pending += 1;
        }
      }
      var identityPending = !choiceIdentityConfirmed(page);
      if (pending) questionsPending += pending;
      if (identityPending) identityPages += 1;
      if (page.pageFailure || pending || identityPending) pagesPending += 1;
    }
    return { pagesPending: pagesPending, questionsPending: questionsPending, identityPages: identityPages, pageFailures: pageFailures };
  }

  function choiceAnswerStatus(answer, key, type, questionStatus) {
    if (type === "tf") {
      var tfAnswer = String(answer || "").toUpperCase();
      if (tfAnswer !== "T" && tfAnswer !== "F") return questionStatus === "review" ? "待覆核" : "未作答";
      if (questionStatus === "review") return "待覆核";
      return tfAnswer === String(key || "").toUpperCase() ? "對" : "錯";
    }
    var normalized = normalizeChoice(answer);
    if (normalized.length > 1) return "多選";
    if (!normalized) return questionStatus === "review" ? "待覆核" : "未作答";
    if (questionStatus === "review") return "待覆核";
    return normalized === String(key || "").toUpperCase() ? "對" : "錯";
  }

  function csvQuote(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  function buildChoiceCsv(config) {
    var settings = config.settings;
    var rows = [["頁碼", "班別", "學號", "分數", "未作答題數", "待覆核題數", "班別／學號已確認"]];
    for (var mc = 1; mc <= settings.mcCount; mc += 1) rows[0].push(String(mc).padStart(2, "0") + "作答", String(mc).padStart(2, "0") + "對錯");
    for (var tf = 1; tf <= settings.tfCount; tf += 1) rows[0].push("是非" + String(tf).padStart(2, "0") + "作答", "是非" + String(tf).padStart(2, "0") + "對錯");
    for (var pageNumber = 1; pageNumber <= config.pageCount; pageNumber += 1) {
      var page = (config.pages || {})[pageNumber] || (config.pages || {})[String(pageNumber)] || null;
      var answers = choiceAnswersForSettings(page, "mc", settings.mcCount);
      var tfAnswers = choiceAnswersForSettings(page, "tf", settings.tfCount);
      var score = page && !page.pageFailure ? scoreQuestions({ answers: answers, tfAnswers: tfAnswers },
        settings.mcKey, settings.tfKey, settings.mcPoints, settings.tfPoints) : null;
      var questionsPending = choiceReviewSummary({ [pageNumber]: page }, 1, settings.mcCount, settings.tfCount).questionsPending;
      var blankCount = 0;
      answers.forEach(function (answer, index) {
        var question = choiceQuestionForSettings(page, "mc", index + 1);
        if (!normalizeChoice(answer) && question && question.status === "blank") blankCount += 1;
      });
      tfAnswers.forEach(function (answer, index) {
        var question = choiceQuestionForSettings(page, "tf", index + 1);
        if (!String(answer || "").trim() && question && question.status === "blank") blankCount += 1;
      });
      var row = [pageNumber, page ? page.classValue || "" : "", page ? page.studentId || "" : "",
        score ? formatCsvNumber(score.earned) : "", blankCount, questionsPending,
        choiceIdentityConfirmed(page) ? "是" : "否"];
      answers.forEach(function (answer, index) {
        var question = choiceQuestionForSettings(page, "mc", index + 1);
        row.push(answer, choiceAnswerStatus(answer, settings.mcKey[index], "mc", question ? question.status : "review"));
      });
      tfAnswers.forEach(function (answer, index) {
        var question = choiceQuestionForSettings(page, "tf", index + 1);
        row.push(answer, choiceAnswerStatus(answer, settings.tfKey[index], "tf", question ? question.status : "review"));
      });
      rows.push(row);
    }
    return "\ufeff" + rows.map(function (row) { return row.map(csvQuote).join(","); }).join("\r\n");
  }

  function formatCsvNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  }

  function toggleDictationMark(page, index, mode, punctuation) {
    var next = cloneDictationPage(page);
    if ((mode === "circle" || mode === "miss") && (punctuation || []).indexOf(index) !== -1) {
      return { page: next, blocked: true };
    }
    var key = mode === "circle" ? "circles" : mode === "arrow" ? "arrows" : "miss";
    var list = next[key].slice();
    var at = list.indexOf(index);
    if (at >= 0) list.splice(at, 1);
    else list.push(index);
    next[key] = list.sort(function (a, b) { return a - b; });
    return { page: next, blocked: false };
  }

  function sanitizeProgress(progress) {
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
      return { ok: false, message: "進度檔格式不正確。" };
    }
    if (![1, 2, 3].includes(progress.version) || (progress.mode !== "choice" && progress.mode !== "dictation") ||
        (progress.version === 2 && progress.mode !== "dictation")) {
      return { ok: false, message: "進度檔版本或批改模式不支援。" };
    }
    if (progress.version === 3 && (typeof progress.templateId !== "string" || !/^(builtin|custom):[a-z0-9][a-z0-9._-]{0,60}$/i.test(progress.templateId))) {
      return { ok: false, message: "進度檔缺少有效的範本 ID。" };
    }
    if (!progress.pages || typeof progress.pages !== "object" || Array.isArray(progress.pages)) {
      return { ok: false, message: "進度檔缺少頁面資料。" };
    }
    if ((progress.version === 2 || progress.version === 3 && progress.mode === "dictation") && (!progress.segments || typeof progress.segments !== "object" ||
        (Number(progress.selectedSegment || progress["段落"]) !== 1 && Number(progress.selectedSegment || progress["段落"]) !== 2))) {
      return { ok: false, message: "進度檔缺少默書段落資料。" };
    }
    return { ok: true, value: progress };
  }

  root.PdfMarkingModel = {
    PUNCTUATION: PUNCTUATION,
    dictationSegmentAnswer: dictationSegmentAnswer,
    normalizeChoice: normalizeChoice,
    parseKey: parseKey,
    parsePoints: parsePoints,
    scoreQuestions: scoreQuestions,
    roundToHalf: roundToHalf,
    dictationScoreFromCount: dictationScoreFromCount,
    deductionCount: deductionCount,
    autoPunctuation: autoPunctuation,
    blankDictationPage: blankDictationPage,
    cloneDictationPage: cloneDictationPage,
    dictationRecord: dictationRecord,
    sanitizeDictationPages: sanitizeDictationPages,
    toggleDictationMark: toggleDictationMark,
    choiceAnswersForSettings: choiceAnswersForSettings,
    choiceIdentityConfirmed: choiceIdentityConfirmed,
    choiceIdentityWarnings: choiceIdentityWarnings,
    choiceReviewSummary: choiceReviewSummary,
    choiceAnswerStatus: choiceAnswerStatus,
    buildChoiceCsv: buildChoiceCsv,
    sanitizeProgress: sanitizeProgress
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingModel;
})(typeof window !== "undefined" ? window : globalThis);
