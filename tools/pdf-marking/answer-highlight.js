(function (root) {
  "use strict";

  var LEFT_MARGIN_RATIO = 0.09;
  var TOP_IGNORE_RATIO = 0.06;
  var MIN_HIGHLIGHT_RATIO = 0.20;

  function isQuestionNumberAccepted(number, previous) {
    return Number.isInteger(number) && number >= 1 && number <= 250 &&
      (previous === null || previous === undefined ? number === 1 : number === previous || number === previous + 1 || number === 1);
  }

  function groupLines(items) {
    var lines = [];
    (items || []).filter(function (item) {
      return item && typeof item.text === "string" && item.text.trim() &&
        Number.isFinite(item.x) && Number.isFinite(item.y);
    }).slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }).forEach(function (item) {
      var height = Math.max(1, Number(item.height) || 1);
      var tolerance = Math.max(2.5, height * 0.32);
      var line = lines.find(function (candidate) { return Math.abs(candidate.y - item.y) <= Math.max(candidate.tolerance, tolerance); });
      if (!line) {
        line = { y: item.y, tolerance: tolerance, items: [] };
        lines.push(line);
      }
      line.items.push(item);
      line.y = line.items.reduce(function (sum, entry) { return sum + entry.y; }, 0) / line.items.length;
      line.tolerance = Math.max(line.tolerance, tolerance);
    });
    return lines.sort(function (a, b) { return a.y - b.y; }).map(function (line) {
      line.items.sort(function (a, b) { return a.x - b.x; });
      return line;
    });
  }

  function clusterItems(items, gapScale) {
    var clusters = [];
    (items || []).slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (item) {
      var previous = clusters[clusters.length - 1];
      var gap = previous ? item.x - (previous.right || previous.x + previous.width) : Infinity;
      var maxGap = Math.max(3, Math.max(Number(item.height) || 1,
        previous ? Number(previous.height) || 1 : 1) * (Number(gapScale) || 0.45));
      if (!previous || gap > maxGap) {
        clusters.push({ x: item.x, y: item.y, width: item.width || 0, height: item.height || 0,
          right: item.x + (item.width || 0), bottom: item.y + (item.height || 0), text: item.text, items: [item] });
      } else {
        previous.width = Math.max(previous.right, item.x + (item.width || 0)) - previous.x;
        previous.right = previous.x + previous.width;
        previous.y = Math.min(previous.y, item.y);
        previous.bottom = Math.max(previous.bottom, item.y + (item.height || 0));
        previous.height = previous.bottom - previous.y;
        previous.text += item.text;
        previous.items.push(item);
      }
    });
    return clusters;
  }

  function questionCandidates(items, pageWidth, pageHeight) {
    return groupLines(items).flatMap(function (line) {
        return clusterItems(line.items.filter(function (item) { return item.x <= pageWidth * LEFT_MARGIN_RATIO; }), 0.75)
          .map(function (cluster) {
            var text = cluster.text.replace(/\s+/g, "");
            var match = text.match(/^(\d{1,3})\.?(?:\D.*)?$/);
            return match ? { number: Number(match[1]), y: line.y, cluster: cluster } : null;
          }).filter(Boolean);
      }).sort(function (a, b) { return a.y - b.y || a.cluster.x - b.cluster.x; });
  }

  function mergeQuestionFragments(items, pageWidth, pageHeight, previousNumber) {
    var previous = Number.isInteger(previousNumber) ? previousNumber : null;
    return questionCandidates(items, pageWidth, pageHeight).filter(function (candidate) {
      if (candidate.y / pageHeight < TOP_IGNORE_RATIO) {
        var expected = previous === null ? 1 : previous + 1;
        if (candidate.number !== expected) return false;
      }
      if (isQuestionNumberAccepted(candidate.number, previous)) previous = candidate.number;
      return true;
    }).map(function (item) { return item.number; });
  }

  function isHighlightColor(red, green, blue) {
    if (red > 200 && green > 200 && blue < 120) return true;
    var maximum = Math.max(red, green, blue);
    var minimum = Math.min(red, green, blue);
    var spread = maximum - minimum;
    return maximum >= 150 && minimum >= 45 && spread >= 38 && spread / maximum >= 0.18;
  }

  function highlightRatio(imageData, width, height, rect) {
    if (!imageData || !width || !height || !rect) return 0;
    var left = Math.max(0, Math.floor(rect.x));
    var top = Math.max(0, Math.floor(rect.y));
    var right = Math.min(width, Math.ceil(rect.x + rect.width));
    var bottom = Math.min(height, Math.ceil(rect.y + rect.height));
    if (right <= left || bottom <= top) return 0;
    var total = 0;
    var highlighted = 0;
    var pixels = imageData.data || imageData;
    for (var y = top; y < bottom; y += 1) {
      for (var x = left; x < right; x += 1) {
        var index = (y * width + x) * 4;
        if (pixels[index + 3] === 0) continue;
        total += 1;
        if (isHighlightColor(pixels[index], pixels[index + 1], pixels[index + 2])) highlighted += 1;
      }
    }
    return total ? highlighted / total : 0;
  }

  function tokenRect(cluster, token) {
    var first = cluster.items[0];
    var text = String(first.text || "").trim();
    var tokenWidth = first.width || cluster.width;
    var label = String(token || "").length;
    if (text.length > label && label > 0) tokenWidth *= Math.min(1, label / Array.from(text).length);
    return { x: first.x - 2, y: first.y - 2, width: Math.max(6, tokenWidth + 5), height: Math.max(6, first.height + 4) };
  }

  function analyzePage(items, pageWidth, pageHeight, imageData, pixelWidth, pixelHeight, previousNumber, seenQuestionNumbers) {
    var lines = groupLines(items);
    var candidates = questionCandidates(items, pageWidth, pageHeight);
    var candidateByLine = new Map();
    candidates.forEach(function (candidate) {
      var line = lines.find(function (entry) { return Math.abs(entry.y - candidate.y) <= entry.tolerance; });
      if (line) {
        if (!candidateByLine.has(line)) candidateByLine.set(line, []);
        candidateByLine.get(line).push(candidate);
      }
    });
    var previous = Number.isInteger(previousNumber) ? previousNumber : null;
    var current = null;
    var questions = Object.create(null);
    var acceptedNumbers = [];
    var duplicateNumbers = [];
    var seen = new Set((seenQuestionNumbers || []).filter(function (number) {
      return Number.isInteger(number) && number >= 1 && number <= 250;
    }));
    var sequenceReset = false;
    lines.forEach(function (line) {
      var candidatesOnLine = candidateByLine.get(line) || [];
      var acceptedCandidateOnLine = false;
      candidatesOnLine.forEach(function (candidate) {
        if (line.y / pageHeight < TOP_IGNORE_RATIO) {
          var expected = previous === null ? 1 : previous + 1;
          if (candidate.number !== expected) return;
        }
        if (!isQuestionNumberAccepted(candidate.number, previous) && !seen.has(candidate.number)) return;

        var startsNewSequence = candidate.number === 1 && previous !== null && previous !== 1;
        if (startsNewSequence) {
          questions = Object.create(null);
          acceptedNumbers = [];
          duplicateNumbers = [];
          seen.clear();
          sequenceReset = true;
        }
        previous = candidate.number;
        current = candidate.number;
        acceptedNumbers.push(current);
        acceptedCandidateOnLine = true;
        if (seen.has(current) || questions[current]) {
          duplicateNumbers.push(current);
          questions[current] = Object.create(null);
          questions[current].ambiguous = true;
        } else {
          questions[current] = Object.create(null);
          seen.add(current);
        }
      });
      if (candidatesOnLine.length && !acceptedCandidateOnLine) return;
      if (current === null) return;
      if (questions[current].ambiguous) return;
      clusterItems(line.items, 0.45).forEach(function (cluster) {
        var token = cluster.text.replace(/\s+/g, "").toUpperCase();
        var match = token.match(/^([A-D])(?:[.)])?/);
        if (!match) return;
        var option = match[1];
        if (cluster.x <= pageWidth * LEFT_MARGIN_RATIO && /^\d/.test(token)) return;
        var ratio = highlightRatio(imageData, pixelWidth, pixelHeight, tokenRect(cluster, match[0]));
        if (!questions[current][option]) questions[current][option] = { ratio: ratio, highlighted: ratio > MIN_HIGHLIGHT_RATIO };
        else {
          questions[current][option].ratio = Math.max(questions[current][option].ratio, ratio);
          questions[current][option].highlighted = questions[current][option].ratio > MIN_HIGHLIGHT_RATIO;
        }
      });
    });
    var answers = Object.create(null);
    Object.keys(questions).forEach(function (questionNumber) {
      if (questions[questionNumber].ambiguous) { answers[questionNumber] = ""; return; }
      var marked = Object.keys(questions[questionNumber]).filter(function (option) { return questions[questionNumber][option].highlighted; });
      answers[questionNumber] = marked.length === 1 ? marked[0] : "";
    });
    return { questions: questions, answers: answers, questionNumbers: acceptedNumbers, duplicateNumbers: duplicateNumbers,
      lastQuestionNumber: previous, seenQuestionNumbers: Array.from(seen), sequenceReset: sequenceReset };
  }

  function countAnswers(source) {
    var answers = source && source.answers || {};
    return Object.keys(answers).filter(function (key) {
      return typeof answers[key] === "string" && answers[key].trim().length > 0;
    }).length;
  }

  function chooseAnswerSource(text, highlighted, expectedCount) {
    var required = Number(expectedCount) || 0;
    var matchedCount = Number(text && text.matchedCount) || 0;
    if (required > 0 && matchedCount >= required) return "text";
    var textCount = countAnswers(text);
    var highlightCount = countAnswers(highlighted);
    if (highlightCount > textCount) return "highlight";
    if (textCount > 0) return "text";
    if (highlightCount > 0) return "highlight";
    return "none";
  }

  root.PdfMarkingAnswerHighlight = {
    LEFT_MARGIN_RATIO: LEFT_MARGIN_RATIO,
    TOP_IGNORE_RATIO: TOP_IGNORE_RATIO,
    MIN_HIGHLIGHT_RATIO: MIN_HIGHLIGHT_RATIO,
    isQuestionNumberAccepted: isQuestionNumberAccepted,
    mergeQuestionFragments: mergeQuestionFragments,
    isHighlightColor: isHighlightColor,
    highlightRatio: highlightRatio,
    analyzePage: analyzePage,
    countAnswers: countAnswers,
    chooseAnswerSource: chooseAnswerSource
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingAnswerHighlight;
})(typeof window !== "undefined" ? window : globalThis);
