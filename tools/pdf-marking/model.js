(function (root) {
  "use strict";

  var ANSWER_KEY_EXCLUDED_FLAG = "答案卷頁：不計分、不匯出";

  function isAnswerKeyExcluded(page) {
    return Boolean(page && Array.isArray(page.pageFlags) && page.pageFlags.indexOf(ANSWER_KEY_EXCLUDED_FLAG) >= 0);
  }

  function setAnswerKeyExcludedFlag(page, excluded) {
    var next = Object.assign({}, page || {});
    next.pageFlags = (Array.isArray(next.pageFlags) ? next.pageFlags : []).filter(function (flag) {
      return flag !== ANSWER_KEY_EXCLUDED_FLAG;
    });
    if (excluded) next.pageFlags.push(ANSWER_KEY_EXCLUDED_FLAG);
    return next;
  }

  var PUNCTUATION = "，、。？！；：「」『』（）《》〈〉…—·,.?!;:'\"()";

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
    var text = Array.from(String(answer || ""));
    var indexes = [];
    for (var i = 0; i < text.length; i += 1) {
      if (PUNCTUATION.indexOf(text[i]) !== -1) indexes.push(i);
    }
    return indexes;
  }

  function normalizeDictationAnswer(answer) {
    return Array.from(String(answer == null ? "" : answer).trim().replace(/\s/g, "")).join("");
  }

  function dictationCharacters(answer) {
    return Array.from(normalizeDictationAnswer(answer));
  }

  function dictationWordCount(answer) {
    return dictationCharacters(answer).filter(function (character) {
      return PUNCTUATION.indexOf(character) < 0;
    }).length;
  }

  function blankDictationV4Page(answer) {
    return {
      studentId: "", reviewStatus: "pending", surfaceMarks: [],
      answerStates: dictationCharacters(answer).map(function () { return "normal"; }),
      baseOverride: null,
      overrides: { wrong: null, extra: null, miss: null, finalScore: null }
    };
  }

  function toggleAnswerState(page, index, answer) {
    var next = cloneDictationV4Page(page, answer);
    var characters = dictationCharacters(answer);
    if (!Number.isInteger(index) || index < 0 || index >= characters.length || PUNCTUATION.indexOf(characters[index]) >= 0) {
      return { page: next, changed: false };
    }
    var cycle = ["normal", "wrong", "miss"];
    var current = cycle.indexOf(next.answerStates[index]);
    next.answerStates[index] = cycle[(current + 1) % cycle.length];
    next.reviewStatus = "reviewed";
    return { page: next, changed: true };
  }

  function cloneDictationV4Page(page, answer) {
    var blank = blankDictationV4Page(answer);
    if (!page || typeof page !== "object") return blank;
    var characters = dictationCharacters(answer);
    var states = Array.isArray(page.answerStates) ? page.answerStates : [];
    blank.studentId = String(page.studentId == null ? "" : page.studentId).slice(0, 24);
    blank.reviewStatus = page.reviewStatus === "reviewed" ? "reviewed" : "pending";
    blank.surfaceMarks = Array.isArray(page.surfaceMarks) ? page.surfaceMarks.map(function (mark) {
      return { type: mark && mark.type, x: mark && mark.x, y: mark && mark.y };
    }) : [];
    blank.answerStates = characters.map(function (_, index) {
      return ["normal", "wrong", "miss"].indexOf(states[index]) >= 0 ? states[index] : "normal";
    });
    blank.baseOverride = typeof page.baseOverride === "boolean" ? page.baseOverride : null;
    var overrides = page.overrides || {};
    ["wrong", "extra", "miss", "finalScore"].forEach(function (key) {
      blank.overrides[key] = overrides[key] == null ? null : overrides[key];
    });
    return blank;
  }

  function toggleSurfaceMark(page, type, x, y, answer) {
    var next = cloneDictationV4Page(page, answer);
    var allowed = ["wrongCircle", "extraCircle", "arrow"];
    var px = Number(x); var py = Number(y);
    if (allowed.indexOf(type) < 0 || !Number.isFinite(px) || !Number.isFinite(py) || px < 0 || px > 1 || py < 0 || py > 1) {
      return { page: next, changed: false };
    }
    var at = next.surfaceMarks.findIndex(function (mark) {
      return mark.type === type && Math.hypot(mark.x - px, mark.y - py) <= 0.025;
    });
    if (at >= 0) next.surfaceMarks.splice(at, 1);
    else next.surfaceMarks.push({ type: type, x: px, y: py });
    next.reviewStatus = "reviewed";
    return { page: next, changed: true };
  }

  function scoreDictationCounts(counts, answerCount, baseEnabled) {
    var wrong = Math.max(0, Number(counts && counts.wrong) || 0);
    var extra = Math.max(0, Number(counts && counts.extra) || 0);
    var miss = Math.max(0, Number(counts && counts.miss) || 0);
    var N = wrong + Math.max(extra, miss);
    var rawScore = roundToHalf(Math.max(0, 10 - 0.5 * N));
    var correctWords = Number(answerCount) - wrong - miss;
    var baseScore = correctWords >= 10 ? 3 : correctWords >= 5 ? 2 : 0;
    return { wrong: wrong, extra: extra, miss: miss, N: N, correctWords: correctWords,
      baseScore: baseScore, rawScore: rawScore,
      finalScore: baseEnabled ? Math.max(baseScore, rawScore) : rawScore };
  }

  function dictationV4Record(page, answer, defaultBaseEnabled, legacyStats) {
    var characters = dictationCharacters(answer);
    var wordCount = characters.filter(function (character) { return PUNCTUATION.indexOf(character) < 0; }).length;
    var source = cloneDictationV4Page(page, answer);
    var autoCounts = legacyStats ? {
      wrong: legacyStats.wrong || 0, extra: legacyStats.extra || 0,
      miss: legacyStats.miss || 0
    } : {
      wrong: source.answerStates.filter(function (status) { return status === "wrong"; }).length,
      extra: source.surfaceMarks.filter(function (mark) { return mark.type === "extraCircle"; }).length,
      miss: source.answerStates.filter(function (status) { return status === "miss"; }).length
    };
    var baseEnabled = source.baseOverride == null ? Boolean(defaultBaseEnabled) : source.baseOverride;
    var automatic = scoreDictationCounts(autoCounts, wordCount, baseEnabled);
    if (legacyStats && Number.isFinite(legacyStats.legacyN)) {
      automatic.N = legacyStats.legacyN;
      automatic.rawScore = roundToHalf(Math.max(0, 10 - 0.5 * legacyStats.legacyN));
      automatic.finalScore = baseEnabled ? Math.max(automatic.baseScore, automatic.rawScore) : automatic.rawScore;
    }
    var overrides = source.overrides;
    var counts = {
      wrong: overrides.wrong == null ? autoCounts.wrong : overrides.wrong,
      extra: overrides.extra == null ? autoCounts.extra : overrides.extra,
      miss: overrides.miss == null ? autoCounts.miss : overrides.miss
    };
    var countAdjusted = overrides.wrong != null || overrides.extra != null || overrides.miss != null;
    var effective = scoreDictationCounts(counts, wordCount, baseEnabled);
    if (legacyStats && !countAdjusted && Number.isFinite(legacyStats.legacyN)) {
      effective.N = legacyStats.legacyN;
      effective.rawScore = automatic.rawScore;
      effective.finalScore = automatic.finalScore;
    }
    var finalScore = overrides.finalScore == null ? effective.finalScore : overrides.finalScore;
    var manualAdjusted = overrides.wrong != null || overrides.extra != null || overrides.miss != null ||
      overrides.finalScore != null || source.baseOverride != null;
    return {
      page: source, reviewed: source.reviewStatus === "reviewed", baseEnabled: baseEnabled,
      studentId: source.studentId,
      autoCounts: autoCounts, counts: counts, N: effective.N, correctWords: effective.correctWords,
      baseScore: effective.baseScore, rawScore: effective.rawScore,
      autoFinalScore: automatic.finalScore, finalScore: finalScore,
      manualAdjusted: manualAdjusted
    };
  }

  function sanitizeDictationV4Pages(pages, pageCount, answer) {
    var clean = {};
    var dropped = 0;
    var maximumPages = Math.max(0, Math.floor(Number(pageCount) || 0));
    Object.keys(pages || {}).forEach(function (key) {
      var pageNumber = Number(key);
      if (!/^\d+$/.test(key) || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > maximumPages) {
        dropped += 1; return;
      }
      var source = pages[key] || {};
      Object.keys(source).forEach(function (name) {
        if (["studentId", "reviewStatus", "surfaceMarks", "answerStates", "baseOverride", "overrides"].indexOf(name) < 0) dropped += 1;
      });
      var target = blankDictationV4Page(answer);
      target.studentId = String(source.studentId == null ? "" : source.studentId).slice(0, 24);
      if (source.reviewStatus === "reviewed" || source.reviewStatus === "pending") target.reviewStatus = source.reviewStatus;
      else if (source.reviewStatus != null) dropped += 1;
      if (source.baseOverride == null || typeof source.baseOverride === "boolean") target.baseOverride = source.baseOverride;
      else dropped += 1;
      var chars = dictationCharacters(answer);
      if (Array.isArray(source.answerStates)) {
        if (source.answerStates.length > chars.length) {
          dropped += source.answerStates.slice(chars.length).filter(function (status) {
            return status != null && status !== "normal";
          }).length;
        }
        chars.forEach(function (character, index) {
          var status = source.answerStates[index];
          if (PUNCTUATION.indexOf(character) >= 0) {
            if (status != null && status !== "normal") dropped += 1;
            target.answerStates[index] = "normal";
          } else if (status == null || status === "normal" || status === "wrong" || status === "miss") {
            target.answerStates[index] = status || "normal";
          } else dropped += 1;
        });
      } else if (source.answerStates != null) dropped += 1;
      if (Array.isArray(source.surfaceMarks)) {
        var seen = new Set();
        source.surfaceMarks.forEach(function (mark) {
          var type = mark && mark.type; var x = Number(mark && mark.x); var y = Number(mark && mark.y);
          var keySignature = type + ":" + x.toFixed(5) + ":" + y.toFixed(5);
          if (["wrongCircle", "extraCircle", "arrow"].indexOf(type) < 0 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1 || seen.has(keySignature)) {
            dropped += 1; return;
          }
          seen.add(keySignature); target.surfaceMarks.push({ type: type, x: x, y: y });
        });
      } else if (source.surfaceMarks != null) dropped += 1;
      var overrides = source.overrides;
      if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
        ["wrong", "extra", "miss"].forEach(function (name) {
          var value = overrides[name];
          var maximum = name === "extra" ? 1000 : dictationWordCount(answer);
          if (value == null) target.overrides[name] = null;
          else if (Number.isInteger(value) && value >= 0 && value <= maximum) target.overrides[name] = value;
          else dropped += 1;
        });
        var finalScore = overrides.finalScore;
        if (finalScore == null) target.overrides.finalScore = null;
        else if (Number.isFinite(finalScore) && finalScore >= 0 && finalScore <= 10 && Number.isInteger(finalScore * 2)) {
          target.overrides.finalScore = finalScore;
        } else dropped += 1;
        Object.keys(overrides).forEach(function (name) {
          if (["wrong", "extra", "miss", "finalScore"].indexOf(name) < 0) dropped += 1;
        });
      } else if (overrides != null) dropped += 1;
      clean[pageNumber] = target;
    });
    return { pages: clean, dropped: dropped };
  }

  function legacyIndexMap(answer) {
    var source = String(answer == null ? "" : answer);
    var byCodeUnit = Array(source.length).fill(-1);
    var normalized = [];
    var outputIndex = 0;
    for (var offset = 0; offset < source.length;) {
      var codePoint = source.codePointAt(offset);
      var character = String.fromCodePoint(codePoint);
      var units = codePoint > 0xffff ? 2 : 1;
      if (!/\s/.test(character)) {
        byCodeUnit[offset] = outputIndex;
        normalized.push(character);
        outputIndex += 1;
      }
      offset += units;
    }
    return { answer: normalized.join(""), byCodeUnit: byCodeUnit };
  }

  function migrateLegacyDictationProgress(progress, arrowPositionsBySegment) {
    var pageCount = Math.max(0, Math.floor(Number(progress && progress.pageCount) || 0));
    var sourceSegments = {};
    if (progress.version === 1) {
      sourceSegments["1"] = { settings: progress.settings || {}, pages: progress.pages || {} };
      sourceSegments["2"] = { settings: { answer: "", firstRow: 20 }, pages: {} };
    } else {
      [1, 2].forEach(function (segmentNumber) {
        sourceSegments[String(segmentNumber)] = progress.segments && progress.segments[String(segmentNumber)] ||
          { settings: { answer: "", firstRow: 20 }, pages: {} };
      });
    }
    var segments = {};
    var dropped = 0;
    [1, 2].forEach(function (segmentNumber) {
      var key = String(segmentNumber);
      var sourceSegment = sourceSegments[key] || {};
      var settings = sourceSegment.settings || {};
      var rawAnswer = String(settings.answer == null ? "" : settings.answer);
      var mappedAnswer = legacyIndexMap(rawAnswer);
      var answer = mappedAnswer.answer;
      var punctuation = autoPunctuation(answer);
      var v4Pages = {};
      var legacyPages = {};
      var rawPages = sourceSegment.pages && typeof sourceSegment.pages === "object" ? sourceSegment.pages : {};
      Object.keys(rawPages).forEach(function (pageKey) {
        var pageNumber = Number(pageKey);
        if (!/^\d+$/.test(pageKey) || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) dropped += 1;
      });
      for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        var sourcePage = rawPages[String(pageNumber)] || rawPages[pageNumber] || {};
        var next = blankDictationV4Page(answer);
        next.studentId = String(sourcePage.studentId == null ? "" : sourcePage.studentId).slice(0, 24);
        var converted = { circles: [], miss: [], arrows: [], arrowSourceIndexes: {} };
        var seen = { circles: new Set(), miss: new Set(), arrows: new Set() };
        ["circles", "miss", "arrows"].forEach(function (name) {
          var values = sourcePage[name];
          if (values == null) return;
          if (!Array.isArray(values)) { dropped += 1; return; }
          values.forEach(function (oldIndex) {
            if (!Number.isInteger(oldIndex) || oldIndex < 0 || oldIndex >= rawAnswer.length) { dropped += 1; return; }
            var newIndex = mappedAnswer.byCodeUnit[oldIndex];
            if (newIndex == null || newIndex < 0 || name !== "arrows" && PUNCTUATION.indexOf(Array.from(answer)[newIndex]) >= 0) {
              dropped += 1; return;
            }
            if (seen[name].has(newIndex)) { dropped += 1; return; }
            seen[name].add(newIndex); converted[name].push(newIndex);
            if (name === "arrows") converted.arrowSourceIndexes[newIndex] = oldIndex;
          });
        });
        converted.circles.forEach(function (index) { next.answerStates[index] = "wrong"; });
        converted.miss.forEach(function (index) {
          if (next.answerStates[index] === "wrong") dropped += 1;
          next.answerStates[index] = "miss";
        });
        var positionMap = arrowPositionsBySegment && arrowPositionsBySegment[key] && arrowPositionsBySegment[key][pageNumber] || {};
        converted.arrows.forEach(function (index) {
          var point = positionMap[converted.arrowSourceIndexes[index]];
          if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
            dropped += 1; return;
          }
          next.surfaceMarks.push({ type: "arrow", x: point.x, y: point.y });
        });
        next.reviewStatus = converted.circles.length || converted.miss.length || next.surfaceMarks.length ? "reviewed" : "pending";
        v4Pages[pageNumber] = next;
        legacyPages[pageNumber] = {
          studentId: next.studentId, circles: converted.circles,
          arrows: converted.arrows, miss: converted.miss,
          reviewStatus: next.reviewStatus,
          baseOverride: null, overrides: { wrong: null, extra: null, miss: null, finalScore: null }
        };
      }
      var calibration = settings.calibration || {};
      segments[key] = {
        settings: {
          answer: answer,
          firstRow: Math.max(1, Math.min(80, Number(settings.firstRow) || 20)),
          calibration: { dx: Number(calibration.dx) || 0, dy: Number(calibration.dy) || 0,
            scale: Math.max(0.7, Math.min(1.4, Number(calibration.scale) || 1)) }
        },
        pages: v4Pages, legacyPages: legacyPages
      };
    });
    var selected = Number(progress.selectedSegment || progress["段落"] || 1) === 2 ? 2 : 1;
    return {
      value: {
        version: 4, mode: "dictation", templateId: progress.templateId || "builtin:dictation-2seg",
        pdfFingerprint: progress.pdfFingerprint, pageCount: pageCount,
        dictationMode: "sentence", baseEnabled: false, selectedSegment: selected,
        segments: segments, settings: segments[String(selected)].settings,
        pages: segments[String(selected)].pages
      },
      dropped: dropped,
      migrated: true
    };
  }

  function safeCsvValue(value) {
    var text = String(value == null ? "" : value).replace(/[\t\r\n]/g, " ");
    return /^[=+\-@]/.test(text) ? "'" + text : text;
  }

  function buildDictationRows(records, pageCount, segmentNumber) {
    var rows = [["頁碼", "段落", "學號", "狀態", "錯字", "多字", "漏字", "N", "正確字數", "底分開關", "底分", "原始分", "自動最終分", "最終分", "人手調整"]];
    for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      var record = records[pageNumber] || records[String(pageNumber)];
      if (!record) {
        rows.push([pageNumber, segmentNumber, "", "未批改", 0, 0, 0, 0, "", "否", "", "", "", "", "否"]);
        continue;
      }
      var isReviewed = Boolean(record.reviewed);
      rows.push([
        pageNumber, segmentNumber, safeCsvValue(record.studentId), isReviewed ? "已批改" : "未批改",
        record.counts.wrong, record.counts.extra, record.counts.miss, record.N,
        record.correctWords, record.baseEnabled ? "是" : "否", isReviewed ? (record.baseEnabled ? record.baseScore : 0) : "",
        isReviewed ? record.rawScore.toFixed(1) : "", isReviewed ? record.autoFinalScore.toFixed(1) : "",
        isReviewed ? record.finalScore.toFixed(1) : "", record.manualAdjusted ? "是" : "否"
      ]);
    }
    return rows;
  }

  function buildDictationCsv(records, pageCount, segmentNumber) {
    return "\ufeff" + buildDictationRows(records, pageCount, segmentNumber).map(function (row) {
      return row.map(function (value) { return csvQuote(safeCsvValue(value)); }).join(",");
    }).join("\r\n");
  }

  function blankDictationPage() {
    return { studentId: "", circles: [], arrows: [], miss: [], reviewStatus: "pending",
      baseOverride: null, overrides: { wrong: null, extra: null, miss: null, finalScore: null } };
  }

  function cloneDictationPage(page) {
    return {
      studentId: page && page.studentId ? String(page.studentId) : "",
      circles: (page && page.circles ? page.circles : []).slice(),
      arrows: (page && page.arrows ? page.arrows : []).slice(),
      miss: (page && page.miss ? page.miss : []).slice(),
      reviewStatus: page && page.reviewStatus === "reviewed" ? "reviewed" : "pending",
      baseOverride: page && typeof page.baseOverride === "boolean" ? page.baseOverride : null,
      overrides: Object.assign({ wrong: null, extra: null, miss: null, finalScore: null }, page && page.overrides || {})
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

  function sanitizeLegacyDictationPages(pages, pageCount, answerLength, punctuation) {
    var clean = {};
    var dropped = 0;
    Object.keys(pages || {}).forEach(function (key) {
      var pageNumber = Number(key);
      if (!/^\d+$/.test(key) || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
        dropped += 1; return;
      }
      var source = pages[key] && typeof pages[key] === "object" ? pages[key] : {};
      Object.keys(source).forEach(function (name) {
        if (["studentId", "circles", "arrows", "miss", "reviewStatus", "baseOverride", "overrides"].indexOf(name) < 0) dropped += 1;
      });
      var normalized = dictationRecord(source, answerLength, punctuation);
      if (!normalized) { dropped += 1; clean[pageNumber] = blankDictationPage(); return; }
      dropped += normalized.droppedIndexes;
      var target = blankDictationPage();
      target.studentId = normalized.studentId;
      target.circles = normalized.circles; target.arrows = normalized.arrows; target.miss = normalized.miss;
      if (source.reviewStatus == null || source.reviewStatus === "pending" || source.reviewStatus === "reviewed") {
        target.reviewStatus = source.reviewStatus || "pending";
      } else dropped += 1;
      if (source.baseOverride == null || typeof source.baseOverride === "boolean") target.baseOverride = source.baseOverride;
      else dropped += 1;
      var overrides = source.overrides;
      if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
        ["wrong", "extra", "miss"].forEach(function (name) {
          var value = overrides[name];
          var maximum = name === "extra" ? 1000 : Math.max(0, answerLength - new Set(punctuation || []).size);
          if (value == null) target.overrides[name] = null;
          else if (Number.isInteger(value) && value >= 0 && value <= maximum) target.overrides[name] = value;
          else dropped += 1;
        });
        var finalScore = overrides.finalScore;
        if (finalScore == null) target.overrides.finalScore = null;
        else if (Number.isFinite(finalScore) && finalScore >= 0 && finalScore <= 10 && Number.isInteger(finalScore * 2)) {
          target.overrides.finalScore = finalScore;
        } else dropped += 1;
        Object.keys(overrides).forEach(function (name) {
          if (["wrong", "extra", "miss", "finalScore"].indexOf(name) < 0) dropped += 1;
        });
      } else if (overrides != null) dropped += 1;
      clean[pageNumber] = target;
    });
    return { pages: clean, dropped: dropped };
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
      if (isAnswerKeyExcluded(page)) continue;
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
      if (isAnswerKeyExcluded(page)) continue;
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

  function buildChoiceRows(config) {
    var settings = config.settings;
    var rows = [["頁碼", "班別", "學號", "分數", "未作答題數", "待覆核題數", "班別／學號已確認"]];
    for (var mc = 1; mc <= settings.mcCount; mc += 1) rows[0].push(String(mc).padStart(2, "0") + "作答", String(mc).padStart(2, "0") + "對錯");
    for (var tf = 1; tf <= settings.tfCount; tf += 1) rows[0].push("是非" + String(tf).padStart(2, "0") + "作答", "是非" + String(tf).padStart(2, "0") + "對錯");
    for (var pageNumber = 1; pageNumber <= config.pageCount; pageNumber += 1) {
      if ((config.excludedPages || []).indexOf(pageNumber) >= 0) continue;
      var page = (config.pages || {})[pageNumber] || (config.pages || {})[String(pageNumber)] || null;
      if (isAnswerKeyExcluded(page)) continue;
      var answers = choiceAnswersForSettings(page, "mc", settings.mcCount);
      var tfAnswers = choiceAnswersForSettings(page, "tf", settings.tfCount);
      var forcedReadPending = Boolean(page && Array.isArray(page.pageFlags) &&
        page.pageFlags.indexOf("整頁讀取中：所有題目須逐題確認後才計分") >= 0 &&
        (page.questions || []).some(function (question) { return question && question.status === "review" && !question.reviewed; }));
      var score = page && !page.pageFailure && !forcedReadPending ? scoreQuestions({ answers: answers, tfAnswers: tfAnswers },
        settings.mcKey, settings.tfKey, settings.mcPoints, settings.tfPoints) : null;
      var questionsPending = choiceReviewSummary({ 1: page }, 1, settings.mcCount, settings.tfCount).questionsPending;
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
    return rows;
  }

  function buildChoiceCsv(config) {
    return "\ufeff" + buildChoiceRows(config).map(function (row) { return row.map(csvQuote).join(","); }).join("\r\n");
  }

  function formatCsvNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  }

  function serializeTsv(rows) {
    return (rows || []).map(function (row) {
      return row.map(function (value) { return safeCsvValue(value); }).join("\t");
    }).join("\r\n");
  }

  function buildChoiceRosterTsv(config) {
    var pages = config.pages || {};
    var pageCount = Math.max(0, Number(config.pageCount) || 0);
    var settings = config.settings || {};
    var mcCount = Math.max(0, Number(settings.mcCount) || 0);
    var tfCount = Math.max(0, Number(settings.tfCount) || 0);
    var maxReadId = 0;
    var pageByStudentId = new Map();
    var duplicatePages = [];
    var identityPages = [];
    var pendingPages = [];
    var overflowPages = [];

    for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if ((config.excludedPages || []).indexOf(pageNumber) >= 0) continue;
      var page = pages[pageNumber] || pages[String(pageNumber)] || null;
      if (isAnswerKeyExcluded(page)) continue;
      if (!page) {
        identityPages.push(pageNumber);
        pendingPages.push(pageNumber);
        continue;
      }
      var id = String(page.studentId || "").trim();
      var numericId = /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : 0;
      if (!choiceIdentityConfirmed(page) || !numericId) identityPages.push(pageNumber);
      if (page.pageFailure || choiceReviewSummary({ 1: page }, 1, mcCount, tfCount).questionsPending > 0) pendingPages.push(pageNumber);
      if (!numericId || numericId < 1) continue;
      maxReadId = Math.max(maxReadId, numericId);
      var existing = pageByStudentId.get(numericId);
      if (existing) {
        existing.pages.push(pageNumber);
        duplicatePages.push(pageNumber);
      } else {
        pageByStudentId.set(numericId, { pageNumber: pageNumber, page: page, pages: [pageNumber] });
      }
    }

    var classSize = Number(config.classSize);
    if (!Number.isSafeInteger(classSize) || classSize < 0 || classSize > 10000) {
      return { ok: false, reason: "全班人數須為 0 至 10,000 的整數。", maxReadId: maxReadId,
        duplicatePages: duplicatePages, identityPages: identityPages, pendingPages: pendingPages, overflowPages: overflowPages };
    }
    pageByStudentId.forEach(function (entry, studentId) {
      if (studentId > classSize) overflowPages.push(entry.pageNumber);
    });
    var duplicateEntries = Array.from(pageByStudentId.entries()).filter(function (entry) { return entry[1].pages.length > 1; })
      .map(function (entry) { return { studentId: String(entry[0]), pages: entry[1].pages.slice() }; });
    if (duplicateEntries.length) {
      duplicatePages = duplicateEntries.reduce(function (all, entry) { return all.concat(entry.pages); }, []);
      return { ok: false, reason: "同一學號對應多於一頁，請先修正。", maxReadId: maxReadId,
        duplicatePages: Array.from(new Set(duplicatePages)).sort(function (a, b) { return a - b; }),
        duplicates: duplicateEntries, identityPages: identityPages, pendingPages: pendingPages, overflowPages: overflowPages };
    }

    var rows = [];
    for (var student = 1; student <= classSize; student += 1) {
      var match = pageByStudentId.get(student);
      if (!match) {
        rows.push(Array(mcCount + tfCount).fill(""));
        continue;
      }
      var mcAnswers = choiceAnswersForSettings(match.page, "mc", mcCount);
      var tfAnswers = choiceAnswersForSettings(match.page, "tf", tfCount);
      rows.push(mcAnswers.concat(tfAnswers).map(function (answer) { return String(answer || "").trim() ? answer : "X"; }));
    }
    return { ok: true, text: serializeTsv(rows), rows: rows, maxReadId: maxReadId,
      duplicatePages: [], identityPages: identityPages, pendingPages: pendingPages,
      overflowPages: overflowPages.sort(function (a, b) { return a - b; }) };
  }

  function xmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "�")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function spreadsheetColumnName(index) {
    var result = "";
    var value = index + 1;
    while (value > 0) {
      var remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function buildXlsx(rows, numericColumns, outputType) {
    var Zip = root.JSZip;
    if (!Zip) return Promise.reject(new Error("JSZip 未載入；請確認離線套件完整。"));
    var sourceRows = rows || [];
    var numeric = new Set(numericColumns || []);
    var columnCount = sourceRows.reduce(function (maximum, row) { return Math.max(maximum, row.length); }, 0);
    var sheetRows = sourceRows.map(function (row, rowIndex) {
      var cells = [];
      for (var column = 0; column < columnCount; column += 1) {
        var value = row[column] == null ? "" : row[column];
        var reference = spreadsheetColumnName(column) + (rowIndex + 1);
        if (rowIndex > 0 && numeric.has(column) && String(value).trim() !== "") {
          var numericValue = Number(value);
          if (!Number.isFinite(numericValue)) throw new Error("數值欄含有非數字資料。");
          cells.push('<c r="' + reference + '"><v>' + String(numericValue) + "</v></c>");
        } else if (String(value) === "") {
          cells.push('<c r="' + reference + '"/>');
        } else {
          cells.push('<c r="' + reference + '" t="inlineStr"><is><t xml:space="preserve">' +
            xmlEscape(safeCsvValue(value)) + "</t></is></c>");
        }
      }
      return '<row r="' + (rowIndex + 1) + '">' + cells.join("") + "</row>";
    }).join("");
    var zip = new Zip();
    zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      "</Types>");
    zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>");
    zip.file("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="成績" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      "</Relationships>");
    zip.file("xl/worksheets/sheet1.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><sheetData>' + sheetRows + "</sheetData></worksheet>");
    return zip.generateAsync({ type: outputType || "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
    next.reviewStatus = "reviewed";
    return { page: next, blocked: false };
  }

  function sanitizeProgress(progress) {
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
      return { ok: false, message: "進度檔格式不正確。" };
    }
    if (![1, 2, 3, 4].includes(progress.version) || (progress.mode !== "choice" && progress.mode !== "dictation") ||
        (progress.version === 4 && progress.mode !== "dictation") ||
        (progress.version === 2 && progress.mode !== "dictation")) {
      return { ok: false, message: "進度檔版本或批改模式不支援。" };
    }
    if ((progress.version === 3 || progress.version === 4) && (typeof progress.templateId !== "string" || !/^(builtin|custom):[a-z0-9][a-z0-9._-]{0,60}$/i.test(progress.templateId))) {
      return { ok: false, message: "進度檔缺少有效的範本 ID。" };
    }
    if (!progress.pages || typeof progress.pages !== "object" || Array.isArray(progress.pages)) {
      return { ok: false, message: "進度檔缺少頁面資料。" };
    }
    if ((progress.version === 2 || progress.version === 3 && progress.mode === "dictation" || progress.version === 4 && progress.mode === "dictation") && (!progress.segments || typeof progress.segments !== "object" ||
        (Number(progress.selectedSegment || progress["段落"]) !== 1 && Number(progress.selectedSegment || progress["段落"]) !== 2))) {
      return { ok: false, message: "進度檔缺少默書段落資料。" };
    }
    if (progress.version === 4 && progress.mode === "dictation" && ["sentence", "grid"].indexOf(progress.dictationMode) < 0) {
      return { ok: false, message: "進度檔的默書模式不正確。" };
    }
    return { ok: true, value: progress };
  }

  root.PdfMarkingModel = {
    ANSWER_KEY_EXCLUDED_FLAG: ANSWER_KEY_EXCLUDED_FLAG,
    isAnswerKeyExcluded: isAnswerKeyExcluded,
    setAnswerKeyExcludedFlag: setAnswerKeyExcludedFlag,
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
    normalizeDictationAnswer: normalizeDictationAnswer,
    dictationCharacters: dictationCharacters,
    dictationWordCount: dictationWordCount,
    blankDictationPage: blankDictationPage,
    cloneDictationPage: cloneDictationPage,
    dictationRecord: dictationRecord,
    sanitizeDictationPages: sanitizeDictationPages,
    sanitizeLegacyDictationPages: sanitizeLegacyDictationPages,
    blankDictationV4Page: blankDictationV4Page,
    cloneDictationV4Page: cloneDictationV4Page,
    toggleAnswerState: toggleAnswerState,
    toggleSurfaceMark: toggleSurfaceMark,
    scoreDictationCounts: scoreDictationCounts,
    dictationV4Record: dictationV4Record,
    sanitizeDictationV4Pages: sanitizeDictationV4Pages,
    migrateLegacyDictationProgress: migrateLegacyDictationProgress,
    buildDictationRows: buildDictationRows,
    buildDictationCsv: buildDictationCsv,
    safeCsvValue: safeCsvValue,
    serializeTsv: serializeTsv,
    buildXlsx: buildXlsx,
    toggleDictationMark: toggleDictationMark,
    choiceAnswersForSettings: choiceAnswersForSettings,
    choiceIdentityConfirmed: choiceIdentityConfirmed,
    choiceIdentityWarnings: choiceIdentityWarnings,
    choiceReviewSummary: choiceReviewSummary,
    choiceAnswerStatus: choiceAnswerStatus,
    buildChoiceRows: buildChoiceRows,
    buildChoiceRosterTsv: buildChoiceRosterTsv,
    buildChoiceCsv: buildChoiceCsv,
    sanitizeProgress: sanitizeProgress
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingModel;
})(typeof window !== "undefined" ? window : globalThis);
