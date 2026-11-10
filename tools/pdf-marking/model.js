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
    for (var i = 0; i < list.length; i += 1) {
      var value = list[i];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= length) return null;
      if (blocked && blocked.has(value)) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  function dictationRecord(page, answerLength, punctuation) {
    var blocked = new Set(punctuation || []);
    var circles = normalizeIndexes(page && page.circles, answerLength, blocked);
    var arrows = normalizeIndexes(page && page.arrows, answerLength, null);
    var miss = normalizeIndexes(page && page.miss, answerLength, blocked);
    if (!circles || !arrows || !miss) return null;
    var count = deductionCount(circles, miss);
    return {
      studentId: page && page.studentId != null ? String(page.studentId).slice(0, 24) : "",
      circles: circles,
      arrows: arrows,
      miss: miss,
      N: count,
      score: dictationScoreFromCount(count)
    };
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
    if ((progress.version !== 1 && progress.version !== 2) || (progress.mode !== "choice" && progress.mode !== "dictation") ||
        (progress.version === 2 && progress.mode !== "dictation")) {
      return { ok: false, message: "進度檔版本或批改模式不支援。" };
    }
    if (!progress.pages || typeof progress.pages !== "object" || Array.isArray(progress.pages)) {
      return { ok: false, message: "進度檔缺少頁面資料。" };
    }
    if (progress.version === 2 && (!progress.segments || typeof progress.segments !== "object" ||
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
    toggleDictationMark: toggleDictationMark,
    sanitizeProgress: sanitizeProgress
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingModel;
})(typeof window !== "undefined" ? window : globalThis);
