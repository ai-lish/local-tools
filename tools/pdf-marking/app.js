(function () {
  "use strict";

  var model = window.PdfMarkingModel;
  var geometry = window.PdfMarkingGeometry;
  var omr = window.PdfMarkingOmr;
  var pdfExport = window.PdfMarkingExport;
  var DEFAULT_DICTATION_ANSWER = "應當一無掛慮，只要凡事藉著禱告、祈求，和感謝，將你們所要的告訴神。";
  var state = {
    mode: "choice", pdfBytes: null, pdfDoc: null, pdfFingerprint: "", pageCount: 0, currentPage: 1,
    choicePages: {}, dictationPages: {}, activeMark: "circle", renderToken: 0,
    dictationSegment: 1, dictationSegments: {},
    dictationAnswer: DEFAULT_DICTATION_ANSWER, firstRow: 20, punctuation: model.autoPunctuation(DEFAULT_DICTATION_ANSWER),
    dictationCalibration: { dx: 0, dy: 0, scale: 1 }, dictationAnswerEditOriginal: null
  };
  var byId = function (id) { return document.getElementById(id); };
  var els = {
    pdfFile: byId("pdf-file"), clearPdf: byId("clear-pdf"), fileStatus: byId("file-status"),
    fileDot: byId("file-dot"), pageCount: byId("page-count"), choiceMode: byId("choice-mode"),
    dictationMode: byId("dictation-mode"), mcCount: byId("mc-count"), tfCount: byId("tf-count"),
    mcKey: byId("mc-key"), tfKey: byId("tf-key"), mcPoints: byId("mc-points"), tfPoints: byId("tf-points"),
    readOmr: byId("read-omr"), omrStatus: byId("omr-status"), choicePage: byId("choice-page"),
    choicePrev: byId("choice-prev"), choiceNext: byId("choice-next"), choiceScore: byId("choice-score"),
    choiceReviews: byId("choice-reviews"), choiceAlignment: byId("choice-alignment"), choiceClass: byId("choice-class"),
    choiceStudentId: byId("choice-student-id"), choiceStage: byId("choice-stage"), reviewItems: byId("review-items"),
    pageFlags: byId("page-flags"), dictationSegment: byId("dictation-segment"),
    dictationAnswer: byId("dictation-answer"), firstRow: byId("dictation-first-row"),
    punctuationIndexes: byId("punctuation-indexes"), detectPunctuation: byId("detect-punctuation"),
    dictationDx: byId("dictation-dx"), dictationDy: byId("dictation-dy"), dictationScale: byId("dictation-scale"),
    resetDictationCalibration: byId("reset-dictation-calibration"),
    dictationPage: byId("dictation-page"), dictationPrev: byId("dictation-prev"), dictationNext: byId("dictation-next"),
    dictationScore: byId("dictation-score"), dictationDeduction: byId("dictation-deduction"),
    dictationStudentId: byId("dictation-student-id"), dictationStage: byId("dictation-stage"),
    dictationGrid: byId("dictation-grid"), dictationNote: byId("dictation-note"), exportPdf: byId("export-pdf"), exportCsv: byId("export-csv"),
    downloadProgress: byId("download-progress"), progressFile: byId("progress-file"), exportStatus: byId("export-status")
  };

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  els.dictationAnswer.value = DEFAULT_DICTATION_ANSWER;
  els.dictationAnswer.placeholder = "請輸入第一段默書句子";
  els.punctuationIndexes.value = state.punctuation.join(", ");

  function setStatus(message, target) {
    (target || els.exportStatus).textContent = message;
  }

  function numberInput(input, fallback, min, max) {
    var value = Number.parseInt(input.value, 10);
    if (!Number.isInteger(value)) value = fallback;
    return Math.max(min, Math.min(max, value));
  }

  function choiceSettings() {
    var mcCount = numberInput(els.mcCount, 60, 0, 60);
    var tfCount = numberInput(els.tfCount, 10, 0, 10);
    var mc = model.parseKey(els.mcKey.value, mcCount, ["A", "B", "C", "D"]);
    var tf = model.parseKey(els.tfKey.value, tfCount, ["T", "F"]);
    var mcPoints = model.parsePoints(els.mcPoints.value, mcCount);
    var tfPoints = model.parsePoints(els.tfPoints.value, tfCount);
    return {
      mcCount: mcCount, tfCount: tfCount, mcKey: mc.values, tfKey: tf.values,
      mcPoints: mcPoints.values, tfPoints: tfPoints.values,
      valid: mc.ok && tf.ok && mcPoints.ok && tfPoints.ok,
      message: [mc, tf, mcPoints, tfPoints].filter(function (entry) { return !entry.ok; }).map(function (entry) { return entry.message; }).join(" ")
    };
  }

  function keyIsReady() {
    var settings = choiceSettings();
    return settings.valid;
  }

  function currentChoicePage() { return state.choicePages[state.currentPage] || null; }

  function currentChoiceScore(page) {
    var settings = choiceSettings();
    if (!page || page.pageFailure || !settings.valid) return null;
    return model.scoreQuestions({
      answers: model.choiceAnswersForSettings(page, "mc", settings.mcCount),
      tfAnswers: model.choiceAnswersForSettings(page, "tf", settings.tfCount)
    }, settings.mcKey, settings.tfKey, settings.mcPoints, settings.tfPoints);
  }

  function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  }

  function createDownload(name, blob) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function updateControls() {
    var loaded = Boolean(state.pdfDoc);
    var dictationReady = state.dictationAnswer.length > 0;
    els.clearPdf.disabled = !loaded;
    els.readOmr.disabled = !loaded;
    els.choicePage.disabled = !loaded;
    els.dictationPage.disabled = !loaded;
    els.choicePrev.disabled = !loaded || state.currentPage <= 1;
    els.dictationPrev.disabled = !loaded || state.currentPage <= 1;
    els.choiceNext.disabled = !loaded || state.currentPage >= state.pageCount;
    els.dictationNext.disabled = !loaded || state.currentPage >= state.pageCount;
    els.exportPdf.disabled = !loaded || (state.mode === "choice" && !Object.keys(state.choicePages).length) ||
      (state.mode === "dictation" && !dictationReady);
    els.exportCsv.disabled = !loaded || (state.mode === "choice" && (!Object.keys(state.choicePages).length || !keyIsReady())) ||
      (state.mode === "dictation" && !dictationReady);
    els.downloadProgress.disabled = !loaded;
  }

  function updatePageSelectors() {
    [els.choicePage, els.dictationPage].forEach(function (select) {
      select.replaceChildren();
      for (var number = 1; number <= state.pageCount; number += 1) {
        var option = document.createElement("option");
        option.value = String(number); option.textContent = "第 " + number + " 頁";
        select.append(option);
      }
      select.value = String(state.currentPage);
    });
    updateControls();
  }

  async function renderPdfToCanvas(pageNumber, scale) {
    var page = await state.pdfDoc.getPage(pageNumber);
    var viewport = page.getViewport({ scale: scale });
    var canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    var context = canvas.getContext("2d", { willReadFrequently: true });
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return { page: page, viewport: viewport, canvas: canvas, data: context.getImageData(0, 0, canvas.width, canvas.height) };
  }

  function selectedOptions(response) {
    return Array.from(String(response || ""));
  }

  function renderChoiceOverlay(stage, canvas, pageRecord, viewport) {
    var overlay = document.createElement("div");
    overlay.className = "pdf-overlay";
    var settings = choiceSettings();
    var template = geometry.omrTemplate(settings.mcCount, settings.tfCount);
    template.items.forEach(function (item) {
      var response = pageRecord.questions.find(function (question) { return question.type === item.type && question.number === item.number; });
      if (!response) return;
      var key = item.type === "mc" ? settings.mcKey[item.number - 1] : settings.tfKey[item.number - 1];
      var selected = selectedOptions(response.answer);
      item.choices.forEach(function (bubble, bubbleIndex) {
        var localOffset = response.localOffsets && response.localOffsets[bubbleIndex];
        var point = geometry.mapBubble(bubble, viewport.width, viewport.height, pageRecord.calibration, localOffset);
        var button = document.createElement("button");
        button.type = "button"; button.className = "bubble-hit";
        button.style.left = (point.x / viewport.width * 100) + "%";
        button.style.top = (point.y / viewport.height * 100) + "%";
        button.dataset.type = item.type; button.dataset.number = String(item.number); button.dataset.option = bubble.option;
        button.setAttribute("aria-label", (item.type === "mc" ? "選擇題" : "是非題") + "第 " + item.number + " 題，選 " + bubble.option);
        if (selected.indexOf(bubble.option) !== -1) {
          button.classList.add("selected");
          if (key && bubble.option !== key) button.classList.add("wrong");
        }
        if (response.status === "review" && !response.reviewed) button.classList.add("review");
        overlay.append(button);
      });
    });
    stage.replaceChildren(canvas, overlay);
  }

  function reviewRows(page) {
    var rows = [];
    if (!page) return rows;
    page.questions.forEach(function (question) {
      if (question.status === "review" && !question.reviewed) rows.push({ kind: "question", question: question });
    });
    var metadata = page.metadata || {};
    [metadata.grade, metadata.form].forEach(function (entry) {
      if (!page.classWasEdited && entry && entry.status === "review") rows.push({ kind: "metadata", question: entry });
    });
    (metadata.idDigits || []).forEach(function (entry) {
      if (!page.studentIdWasEdited && entry && entry.status === "review") rows.push({ kind: "metadata", question: entry });
    });
    (page.pageFlags || []).forEach(function (flag) {
      if (page.classWasEdited && flag.indexOf("班別") >= 0) return;
      if (page.studentIdWasEdited && flag.indexOf("學號") >= 0) return;
      rows.push({ kind: "flag", question: { reason: flag } });
    });
    return rows;
  }

  function renderReviewList(page) {
    var rows = reviewRows(page);
    els.reviewItems.replaceChildren(); els.pageFlags.replaceChildren();
    var questionRows = rows.filter(function (row) { return row.kind === "question"; });
    if (!questionRows.length) {
      var message = document.createElement("p"); message.className = "muted small";
      message.textContent = !page ? "載入 PDF 後按「自動讀圈」。" :
        page.pageFailure ? "整頁定位失敗；請查看頁面警告並手動批改。" : "本頁沒有待覆核題目。";
      els.reviewItems.append(message);
    } else {
      questionRows.forEach(function (row) {
        var question = row.question;
        var button = document.createElement("button"); button.type = "button"; button.className = "review-item";
        var label = document.createElement("span"); label.textContent = (question.type === "mc" ? "選擇題 " : "是非題 ") + String(question.number).padStart(2, "0");
        var detail = document.createElement("span"); detail.className = "item-value";
        detail.textContent = (question.answer || (question.status === "blank" ? "空白" : "待覆核")) + " · " + question.reason;
        button.append(label, detail);
        button.addEventListener("click", function () {
          var target = els.choiceStage.querySelector('[data-number="' + question.number + '"][data-type="' + question.type + '"]');
          if (target) target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        });
        els.reviewItems.append(button);
      });
    }
    rows.filter(function (row) { return row.kind !== "question"; }).forEach(function (row) {
      var flag = document.createElement("div"); flag.className = "page-flag";
      flag.textContent = row.kind === "metadata" ? "覆核" + row.question.label + "：" + row.question.reason : row.question.reason;
      els.pageFlags.append(flag);
    });
  }

  function refreshChoiceIdentityWarnings() {
    var warnings = model.choiceIdentityWarnings(state.choicePages, state.pageCount);
    var prefix = "班別／學號核對：";
    Object.keys(state.choicePages).forEach(function (pageNumber) {
      var page = state.choicePages[pageNumber];
      page.pageFlags = (Array.isArray(page.pageFlags) ? page.pageFlags : []).filter(function (flag) {
        return String(flag).indexOf(prefix) !== 0;
      }).concat(warnings[pageNumber] || []);
    });
    return warnings;
  }

  function confirmChoiceExport(settings) {
    var summary = model.choiceReviewSummary(state.choicePages, state.pageCount, settings.mcCount, settings.tfCount);
    if (!summary.pagesPending && !summary.questionsPending) return true;
    var message = "尚有 " + summary.pagesPending + " 頁、" + summary.questionsPending + " 題待覆核";
    if (summary.identityPages) message += "；另有 " + summary.identityPages + " 頁班別／學號未確認";
    return window.confirm(message + "。仍要匯出嗎？");
  }

  function hasDictationMarks(pages) {
    return Object.keys(pages || {}).some(function (pageNumber) {
      var page = pages[pageNumber] || {};
      return [page.circles, page.arrows, page.miss].some(function (list) { return Array.isArray(list) && list.length > 0; });
    });
  }

  function finishDictationAnswerEdit() {
    var original = state.dictationAnswerEditOriginal;
    if (!original) return;
    var nextAnswer = els.dictationAnswer.value;
    var changed = nextAnswer !== original.answer;
    if (changed && hasDictationMarks(state.dictationPages) &&
        !window.confirm("所選段落已有批改標記；更改句子會按新字數保留仍有效的索引。要繼續嗎？")) {
      state.dictationAnswer = original.answer;
      state.punctuation = original.punctuation.slice();
      els.dictationAnswer.value = original.answer;
      els.punctuationIndexes.value = state.punctuation.join(", ");
      saveActiveDictationSegment();
      state.dictationAnswerEditOriginal = null;
      renderCurrentMode();
      return;
    }
    var config = getDictationConfig();
    var cleaned = model.sanitizeDictationPages(state.dictationPages, config.answer.length, config.punctuation);
    state.dictationPages = cleaned.pages;
    saveActiveDictationSegment();
    state.dictationAnswerEditOriginal = null;
    if (cleaned.droppedIndexes) {
      setStatus("句子更改後已移除 " + cleaned.droppedIndexes + " 個超出字數或屬於標點的標記索引；其他標記已保留。", els.exportStatus);
    }
    renderCurrentMode();
  }

  function renderChoiceSummary(page) {
    var score = currentChoiceScore(page);
    els.choiceScore.textContent = score ? formatNumber(score.earned) + " / " + formatNumber(score.maximum) : "—";
    var rows = reviewRows(page);
    els.choiceReviews.textContent = page ? String(rows.length) : "—";
    if (!page || !page.calibration) els.choiceAlignment.textContent = "—";
    else {
      var cal = page.calibration;
      els.choiceAlignment.textContent = "已校正 " + (Number(cal.angle).toFixed(1)) + "°";
    }
    var classValue = page ? page.classValue || "" : "";
    var studentId = page ? page.studentId || "" : "";
    if (els.choiceClass.value !== classValue) els.choiceClass.value = classValue;
    if (els.choiceStudentId.value !== studentId) els.choiceStudentId.value = studentId;
    renderReviewList(page);
  }

  async function renderChoicePage() {
    var token = ++state.renderToken;
    var pageRecord = currentChoicePage();
    renderChoiceSummary(pageRecord);
    if (!state.pdfDoc) {
      els.choiceStage.innerHTML = '<p class="empty-state">選擇 PDF 後，答題紙會顯示在這裏。</p>';
      return;
    }
    var width = Math.max(480, Math.min(1050, els.choiceStage.clientWidth || 820));
    var pdfPage = await state.pdfDoc.getPage(state.currentPage);
    var base = pdfPage.getViewport({ scale: 1 });
    var scale = width / base.width;
    var rendered = await renderPdfToCanvas(state.currentPage, scale);
    if (token !== state.renderToken) return;
    rendered.canvas.style.width = "100%";
    rendered.canvas.style.height = "auto";
    if (pageRecord) renderChoiceOverlay(els.choiceStage, rendered.canvas, pageRecord, rendered.viewport);
    else {
      els.choiceStage.replaceChildren(rendered.canvas);
      var note = document.createElement("p"); note.className = "empty-state";
      note.textContent = "按「自動讀圈」建立本頁答案及待覆核清單。";
      els.choiceStage.append(note);
    }
  }

  function dictationPageRecord() {
    if (!state.dictationPages[state.currentPage]) state.dictationPages[state.currentPage] = model.blankDictationPage();
    return state.dictationPages[state.currentPage];
  }

  function saveActiveDictationSegment() {
    state.dictationSegments[String(state.dictationSegment)] = {
      answer: state.dictationAnswer, firstRow: state.firstRow, punctuation: state.punctuation.slice(),
      calibration: Object.assign({}, state.dictationCalibration), pages: state.dictationPages
    };
  }

  function restoreDictationSegment(segmentNumber) {
    var segment = state.dictationSegments[String(segmentNumber)] || {};
    state.dictationSegment = segmentNumber;
    state.dictationAnswer = model.dictationSegmentAnswer(segment, segmentNumber, DEFAULT_DICTATION_ANSWER);
    state.firstRow = Math.max(1, Math.min(80, Number(segment.firstRow) || 20));
    state.punctuation = Array.isArray(segment.punctuation) ? segment.punctuation.filter(function (value) {
      return Number.isInteger(value) && value >= 0 && value < state.dictationAnswer.length;
    }) : model.autoPunctuation(state.dictationAnswer);
    var calibration = segment.calibration || {};
    state.dictationCalibration = {
      dx: Math.max(-200, Math.min(200, Number(calibration.dx) || 0)),
      dy: Math.max(-200, Math.min(200, Number(calibration.dy) || 0)),
      scale: Math.max(0.7, Math.min(1.4, Number(calibration.scale) || 1))
    };
    state.dictationPages = segment.pages || {};
    if (state.pdfDoc) {
      for (var pageNo = 1; pageNo <= state.pageCount; pageNo += 1) {
        if (!state.dictationPages[pageNo]) state.dictationPages[pageNo] = model.blankDictationPage();
      }
    }
    els.dictationSegment.value = String(segmentNumber);
    els.dictationAnswer.value = state.dictationAnswer;
    els.dictationAnswer.placeholder = segmentNumber === 2 ? "請輸入第二段默書句子" : "請輸入第一段默書句子";
    els.firstRow.value = String(state.firstRow);
    els.punctuationIndexes.value = state.punctuation.join(", ");
    els.dictationDx.value = String(state.dictationCalibration.dx);
    els.dictationDy.value = String(state.dictationCalibration.dy);
    els.dictationScale.value = String(Math.round(state.dictationCalibration.scale * 100));
  }

  function getDictationConfig() {
    state.dictationAnswer = els.dictationAnswer.value;
    state.firstRow = numberInput(els.firstRow, 20, 1, 80);
    var punctuation = els.punctuationIndexes.value.split(/[，,\s]+/).filter(Boolean).map(Number);
    state.punctuation = Array.from(new Set(punctuation.filter(function (value) {
      return Number.isInteger(value) && value >= 0 && value < state.dictationAnswer.length;
    }))).sort(function (a, b) { return a - b; });
    saveActiveDictationSegment();
    return { answer: state.dictationAnswer, firstRow: state.firstRow, punctuation: state.punctuation,
      segment: state.dictationSegment };
  }

  function switchDictationSegment(segmentNumber) {
    getDictationConfig();
    restoreDictationSegment(segmentNumber === 2 ? 2 : 1);
    renderCurrentMode();
  }

  function renderDictationStats() {
    var record = dictationPageRecord();
    var valid = model.dictationRecord(record, state.dictationAnswer.length, state.punctuation);
    els.dictationScore.textContent = valid ? valid.score.toFixed(1) : "10.0";
    els.dictationDeduction.textContent = valid ? String(valid.N) : "0";
    els.dictationStudentId.value = record.studentId || "";
  }

  function renderDictationGrid() {
    var config = getDictationConfig();
    var record = dictationPageRecord();
    els.dictationGrid.replaceChildren();
    for (var index = 0; index < config.answer.length; index += 1) {
      var button = document.createElement("button"); button.type = "button";
      button.className = "dictation-cell"; button.dataset.index = String(index);
      button.textContent = (index + 1) + " · " + config.answer.charAt(index);
      var punct = config.punctuation.indexOf(index) !== -1;
      if (record.circles.indexOf(index) !== -1) button.classList.add("is-circled");
      if (record.arrows.indexOf(index) !== -1) button.classList.add("is-arrow");
      if (record.miss.indexOf(index) !== -1) button.classList.add("is-miss");
      if (punct && (state.activeMark === "circle" || state.activeMark === "miss")) button.disabled = true;
      button.setAttribute("aria-label", "第 " + (index + 1) + " 格 " + config.answer.charAt(index) + (punct ? "，標點" : ""));
      els.dictationGrid.append(button);
    }
  }

  async function renderDictationPage() {
    var token = ++state.renderToken;
    renderDictationStats(); renderDictationGrid();
    if (!state.pdfDoc) {
      els.dictationStage.innerHTML = '<p class="empty-state">選擇 PDF 後，掃描頁會顯示在這裏。</p>';
      return;
    }
    var width = Math.max(480, Math.min(1050, els.dictationStage.clientWidth || 900));
    var page = await state.pdfDoc.getPage(state.currentPage);
    var base = page.getViewport({ scale: 1 });
    var rendered = await renderPdfToCanvas(state.currentPage, width / base.width);
    if (token !== state.renderToken) return;
    var record = dictationPageRecord();
    var fittedGrid = geometry.fitDictationGrid(rendered.data, base.width, base.height, state.dictationSegment);
    var layout = geometry.dictationLayout(base.width, base.height,
      state.dictationAnswer.length, state.firstRow, state.dictationCalibration, fittedGrid);
    if (!state.dictationAnswer.length) {
      els.dictationNote.textContent = (fittedGrid
        ? "已按印刷方格自動對齊，共偵測 " + layout.availableCellCount + " 格。"
        : "未能確認印刷方格，使用下方校準滑桿調整格位。") +
        (state.dictationSegment === 2 ? "請輸入第二段默書句子。" : "請輸入默書句子。");
    } else if (fittedGrid && state.dictationAnswer.length !== layout.availableCellCount) {
      var placed = Math.min(state.dictationAnswer.length, layout.availableCellCount);
      els.dictationNote.textContent = "答案 " + state.dictationAnswer.length + " 字，印刷方格 " +
        layout.availableCellCount + " 格；只把前 " + placed + " 字放進對應格位。請核對字數；如需微調，可使用下方校準滑桿。";
    } else {
      els.dictationNote.textContent = fittedGrid
        ? "已按印刷方格自動對齊；如需微調，可使用下方校準滑桿。"
        : "未能確認印刷方格，使用下方校準滑桿調整格位。";
    }
    var overlay = document.createElement("div"); overlay.className = "pdf-overlay";
    layout.cells.forEach(function (box, index) {
      var hit = document.createElement("button"); hit.type = "button"; hit.className = "dictation-hit";
      hit.style.left = ((box.x + box.w / 2) / layout.pageWidth * 100) + "%";
      hit.style.top = ((box.y + box.h / 2) / layout.pageHeight * 100) + "%";
      hit.style.width = (box.w / layout.pageWidth * 100) + "%";
      hit.style.height = (box.h / layout.pageHeight * 100) + "%";
      hit.dataset.index = String(index);
      var punct = state.punctuation.indexOf(index) !== -1;
      if (record.circles.indexOf(index) !== -1) hit.classList.add("is-circled");
      if (record.arrows.indexOf(index) !== -1) hit.classList.add("is-arrow");
      if (record.miss.indexOf(index) !== -1) hit.classList.add("is-miss");
      if (punct && (state.activeMark === "circle" || state.activeMark === "miss")) hit.disabled = true;
      hit.setAttribute("aria-label", "默書第 " + (index + 1) + " 格" + (punct ? "，標點" : ""));
      overlay.append(hit);
    });
    rendered.canvas.style.width = "100%"; rendered.canvas.style.height = "auto";
    els.dictationStage.replaceChildren(rendered.canvas, overlay);
  }

  function renderCurrentMode() {
    updatePageSelectors();
    if (state.mode === "choice") renderChoicePage();
    else renderDictationPage();
    updateControls();
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".mode-tab").forEach(function (tab) {
      var active = tab.dataset.mode === mode;
      tab.classList.toggle("active", active); tab.setAttribute("aria-pressed", active ? "true" : "false");
    });
    els.choiceMode.hidden = mode !== "choice";
    els.dictationMode.hidden = mode !== "dictation";
    setStatus("");
    renderCurrentMode();
  }

  async function loadPdf(file) {
    if (!file || !/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setStatus("請選擇 PDF 檔案。", els.fileStatus); return;
    }
    if (!window.pdfjsLib || !window.PDFLib) {
      setStatus("PDF 程式庫未載入；請連線後重新整理頁面。", els.fileStatus); return;
    }
    try {
      setStatus("正在本機開啟 PDF…", els.fileStatus);
      var bytes = new Uint8Array(await file.arrayBuffer());
      var pdf = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      var digest = await window.crypto.subtle.digest("SHA-256", bytes);
      var fingerprint = Array.from(new Uint8Array(digest)).map(function (value) { return value.toString(16).padStart(2, "0"); }).join("");
      state.pdfBytes = bytes; state.pdfDoc = pdf; state.pdfFingerprint = fingerprint; state.pageCount = pdf.numPages; state.currentPage = 1;
      state.choicePages = {};
      var blankPages = {};
      for (var i = 1; i <= state.pageCount; i += 1) blankPages[i] = model.blankDictationPage();
      state.dictationSegments = {
        "1": { answer: DEFAULT_DICTATION_ANSWER, firstRow: 20, punctuation: model.autoPunctuation(DEFAULT_DICTATION_ANSWER),
          calibration: { dx: 0, dy: 0, scale: 1 }, pages: blankPages },
        "2": { answer: "", firstRow: 20, punctuation: [], calibration: { dx: 0, dy: 0, scale: 1 },
          pages: JSON.parse(JSON.stringify(blankPages)) }
      };
      restoreDictationSegment(1);
      els.fileStatus.textContent = "PDF 已在本機開啟";
      els.pageCount.textContent = "共 " + state.pageCount + " 頁";
      els.fileDot.classList.add("ready");
      els.omrStatus.textContent = "已載入。輸入答案後按「自動讀圈／重新讀取」。";
      updatePageSelectors(); renderCurrentMode();
      setStatus("");
    } catch (error) {
      state.pdfBytes = null; state.pdfDoc = null; state.pdfFingerprint = ""; state.pageCount = 0;
      setStatus("PDF 無法開啟。請確認檔案完整、未加密，並使用 PDF 格式。", els.fileStatus);
    }
  }

  async function readAllPages() {
    if (!state.pdfDoc) return;
    var settings = choiceSettings();
    if (!settings.valid) {
      els.omrStatus.textContent = "讀圈前請修正設定：" + settings.message;
      return;
    }
    state.choicePages = {};
    var totalQuestions = 0; var totalReviews = 0; var metadataReviewPages = 0; var pageFailureCount = 0;
    els.readOmr.disabled = true;
    try {
      for (var pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
        els.omrStatus.textContent = "正在本機分析第 " + pageNumber + " / " + state.pageCount + " 頁…";
        var rendered = await renderPdfToCanvas(pageNumber, 2.2);
        var template = geometry.omrTemplate(settings.mcCount, settings.tfCount);
        var fit = omr.gridFit(rendered.data.data, rendered.canvas.width, rendered.canvas.height, template);
        var detected = omr.detectPage(rendered.data.data, rendered.canvas.width, rendered.canvas.height,
          settings.mcCount, settings.tfCount, fit.calibration, fit.metadataCalibration);
        var page = {
          questions: detected.questions,
          classValue: detected.classValue,
          studentId: detected.studentId,
          metadata: detected.metadata,
          calibration: detected.calibration,
          metadataCalibration: detected.metadataCalibration,
          thresholds: detected.thresholds,
          pageFlags: detected.pageFlags,
          pageFailure: detected.pageFailure,
          classWasEdited: false,
          studentIdWasEdited: false
        };
        state.choicePages[pageNumber] = page;
        totalQuestions += page.questions.length;
        if (page.pageFailure) pageFailureCount += 1;
        else totalReviews += page.questions.filter(function (question) { return question.status === "review"; }).length;
        if ((page.metadata.grade.status !== "read") || (page.metadata.form.status !== "read") || page.metadata.idDigits.some(function (entry) { return entry.status !== "read"; })) metadataReviewPages += 1;
        rendered.canvas.width = 1; rendered.canvas.height = 1;
      }
      var identityWarnings = refreshChoiceIdentityWarnings();
      var identityIssuePages = Object.keys(identityWarnings).filter(function (pageNo) {
        return identityWarnings[pageNo] && identityWarnings[pageNo].length;
      }).length;
      els.omrStatus.textContent = "完成讀圈：" + state.pageCount + " 頁、" + totalQuestions + " 題；" + totalReviews + " 題待覆核；" +
        pageFailureCount + " 頁整頁定位失敗；" + metadataReviewPages + " 頁班別或學號待確認；" + identityIssuePages + " 頁需核對空白／重複班別學號。";
    } catch (error) {
      state.choicePages = {};
      els.omrStatus.textContent = "讀圈未能完成。請檢查 PDF 頁面，再重新載入。";
    }
    els.readOmr.disabled = false;
    updateControls(); renderCurrentMode();
  }

  function toggleChoiceAnswer(type, number, option) {
    var page = currentChoicePage(); if (!page) return;
    var response = page.questions.find(function (question) { return question.type === type && question.number === number; });
    if (!response) return;
    var values = new Set(Array.from(response.answer || ""));
    if (values.has(option)) values.delete(option); else values.add(option);
    response.answer = Array.from(values).sort().join("");
    response.status = "manual"; response.reason = ""; response.reviewed = true;
    if (page.pageFailure && page.questions.every(function (question) { return question.status !== "review"; })) {
      page.pageFailure = false;
      page.pageFlags = (page.pageFlags || []).filter(function (flag) { return flag.indexOf("整頁定位失敗") < 0; });
    }
    renderCurrentMode();
  }

  function csvQuote(value) {
    var text = String(value == null ? "" : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function buildChoiceCsv() {
    var settings = choiceSettings();
    if (!settings.valid) throw new Error(settings.message || "請先輸入完整答案。");
    return model.buildChoiceCsv({ pages: state.choicePages, pageCount: state.pageCount, settings: settings });
  }

  function buildDictationCsv() {
    var config = getDictationConfig();
    var rows = [["頁碼", "班別", "學號", "分數", "段落"]];
    for (var pageNo = 1; pageNo <= state.pageCount; pageNo += 1) {
      var record = model.dictationRecord(state.dictationPages[pageNo], config.answer.length, config.punctuation) || model.blankDictationPage();
      var result = model.dictationRecord(record, config.answer.length, config.punctuation);
      rows.push([pageNo, "", record.studentId || "", result ? result.score.toFixed(1) : "10.0", config.segment]);
    }
    return "\ufeff" + rows.map(function (row) { return row.map(csvQuote).join(","); }).join("\r\n");
  }

  function currentProgress() {
    if (state.mode === "choice") {
      var settings = choiceSettings();
      return {
        version: 1, mode: "choice", pdfFingerprint: state.pdfFingerprint, pageCount: state.pageCount, settings: {
          mcCount: settings.mcCount, tfCount: settings.tfCount,
          mcAnswer: els.mcKey.value.toUpperCase().replace(/[^A-D]/g, "").slice(0, 60),
          tfAnswer: els.tfKey.value.toUpperCase().replace(/[^TF]/g, "").slice(0, 10),
          mcPoints: els.mcPoints.value.replace(/[^0-9.,，\s]/g, ""),
          tfPoints: els.tfPoints.value.replace(/[^0-9.,，\s]/g, "")
        }, pages: Object.fromEntries(Object.keys(state.choicePages).map(function (key) {
          return [key, cleanChoicePage(state.choicePages[key])];
        }))
      };
    }
    var config = getDictationConfig();
    saveActiveDictationSegment();
    var segments = {};
    [1, 2].forEach(function (segmentNumber) {
      var segment = state.dictationSegments[String(segmentNumber)] || {};
      segments[String(segmentNumber)] = {
        settings: { answer: String(segment.answer || ""), firstRow: segment.firstRow || 20,
          punctuation: Array.isArray(segment.punctuation) ? segment.punctuation.slice() : [],
          calibration: Object.assign({ dx: 0, dy: 0, scale: 1 }, segment.calibration || {}) },
        pages: segment.pages || {}
      };
    });
    return {
      version: 2, mode: "dictation", pdfFingerprint: state.pdfFingerprint, pageCount: state.pageCount,
      selectedSegment: config.segment, "段落": config.segment, segments: segments,
      settings: { answer: config.answer, firstRow: config.firstRow, punctuation: config.punctuation,
        calibration: state.dictationCalibration },
      pages: state.dictationPages
    };
  }

  function cleanMetadataEntry(entry) {
    if (!entry || typeof entry !== "object") return { status: "review", reason: "未能讀取", label: "" };
    var reasons = ["空白", "多於一個深圈", "整頁填色偏淡", "填色偏淡，需確認是否作答", "最深與次深差距細", "未能讀取"];
    var labels = ["班別年級", "班別字母", "學號第 1 位", "學號第 2 位"];
    return {
      label: labels.indexOf(entry.label) >= 0 ? entry.label : "", value: String(entry.value || "").replace(/[^A-F0-9]/gi, "").slice(0, 8),
      status: ["read", "review", "blank", "manual"].indexOf(entry.status) >= 0 ? entry.status : "review",
      reason: reasons.indexOf(entry.reason) >= 0 ? entry.reason : "",
      values: Array.isArray(entry.values) ? entry.values.map(Number).slice(0, 10) : []
    };
  }

  function cleanChoicePage(source) {
    var questions = Array.isArray(source.questions) ? source.questions.map(function (entry) {
      return {
        type: entry.type === "tf" ? "tf" : "mc", number: Number(entry.number) || 0,
        answer: entry.type === "tf" ? String(entry.answer || "").toUpperCase().replace(/[^TF]+/g, "") : String(entry.answer || "").toUpperCase().replace(/[^A-D]+/g, ""),
        status: ["read", "review", "blank", "manual"].indexOf(entry.status) >= 0 ? entry.status : "review",
        reason: String(entry.reason || ""), reviewed: Boolean(entry.reviewed), values: Array.isArray(entry.values) ? entry.values.map(Number).slice(0, 4) : [],
        localOffsets: Array.isArray(entry.localOffsets) ? entry.localOffsets.slice(0, 4).map(function (offset) {
          var dx = Number(offset && offset.dx); var dy = Number(offset && offset.dy);
          return { dx: Number.isFinite(dx) ? Math.max(-0.01, Math.min(0.01, dx)) : 0,
            dy: Number.isFinite(dy) ? Math.max(-0.01, Math.min(0.01, dy)) : 0 };
        }) : []
      };
    }) : [];
    var cal = source.calibration || {};
    return {
      questions: questions, classValue: String(source.classValue || "").toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 8),
      studentId: String(source.studentId || "").replace(/\D/g, "").slice(0, 2),
      metadata: {
        grade: cleanMetadataEntry(source.metadata && source.metadata.grade),
        form: cleanMetadataEntry(source.metadata && source.metadata.form),
        idDigits: Array.isArray(source.metadata && source.metadata.idDigits) ? source.metadata.idDigits.slice(0, 2).map(cleanMetadataEntry) : []
      },
      calibration: { dx: Number(cal.dx) || 0, dy: Number(cal.dy) || 0, angle: Number(cal.angle) || 0, scale: Number(cal.scale) || 1 },
      metadataCalibration: (function () {
        var metadataCal = source.metadataCalibration || cal;
        return { dx: Number(metadataCal.dx) || 0, dy: Number(metadataCal.dy) || 0,
          angle: Number(metadataCal.angle) || 0, scale: Number(metadataCal.scale) || 1 };
      })(),
      pageFailure: Boolean(source.pageFailure),
      thresholds: {
        threshold: Number(source.thresholds && source.thresholds.threshold) || 0,
        blankLimit: Number(source.thresholds && source.thresholds.blankLimit) || 0,
        deepLimit: Number(source.thresholds && source.thresholds.deepLimit) || 0,
        spread: Number(source.thresholds && source.thresholds.spread) || 0,
        low: Number(source.thresholds && source.thresholds.low) || 0,
        high: Number(source.thresholds && source.thresholds.high) || 0,
        allPale: Boolean(source.thresholds && source.thresholds.allPale)
      },
      pageFlags: Array.isArray(source.pageFlags) ? source.pageFlags.filter(function (flag) {
        return ["定位校正幅度較大，請檢查整頁對齊", "班別讀取未確認", "學號讀取未確認",
          "整頁定位失敗：可能是空白頁、方向錯誤或分組位置不符，請核對本頁"].indexOf(flag) >= 0;
      }) : [],
      classWasEdited: Boolean(source.classWasEdited), studentIdWasEdited: Boolean(source.studentIdWasEdited)
    };
  }

  function applyProgress(data) {
    var checked = model.sanitizeProgress(data);
    if (!checked.ok) throw new Error(checked.message);
    if (checked.value.pdfFingerprint !== state.pdfFingerprint || checked.value.pageCount !== state.pageCount) {
      throw new Error("進度 JSON 與目前 PDF 不相符；請先選回建立進度時使用的 PDF。");
    }
    if (checked.value.mode === "choice") {
      var settings = checked.value.settings || {};
      els.mcCount.value = String(settings.mcCount == null ? 60 : settings.mcCount); els.tfCount.value = String(settings.tfCount == null ? 10 : settings.tfCount);
      els.mcKey.value = String(settings.mcAnswer || ""); els.tfKey.value = String(settings.tfAnswer || "");
      els.mcPoints.value = String(settings.mcPoints || "1"); els.tfPoints.value = String(settings.tfPoints || "1");
      state.choicePages = {};
      Object.keys(checked.value.pages).forEach(function (key) {
        if (/^\d+$/.test(key) && Number(key) <= state.pageCount) state.choicePages[Number(key)] = cleanChoicePage(checked.value.pages[key]);
      });
      refreshChoiceIdentityWarnings();
    } else {
      var config = checked.value.settings || {};
      state.dictationSegments = {};
      if (checked.value.version === 2 && checked.value.segments) {
        [1, 2].forEach(function (segmentNumber) {
          var sourceSegment = checked.value.segments[String(segmentNumber)] || {};
          var segmentSettings = sourceSegment.settings || {};
          var answer = String(segmentSettings.answer || "");
          var punctuation = Array.isArray(segmentSettings.punctuation) ? segmentSettings.punctuation.filter(function (value) {
            return Number.isInteger(value) && value >= 0 && value < answer.length;
          }) : model.autoPunctuation(answer);
          var calibration = segmentSettings.calibration || {};
          var pages = {};
          for (var segmentPage = 1; segmentPage <= state.pageCount; segmentPage += 1) {
            var sourcePage = sourceSegment.pages && (sourceSegment.pages[String(segmentPage)] || sourceSegment.pages[segmentPage]) || {};
            var normalizedPage = model.dictationRecord(sourcePage, answer.length, punctuation);
            pages[segmentPage] = normalizedPage || model.blankDictationPage();
          }
          state.dictationSegments[String(segmentNumber)] = {
            answer: answer, firstRow: Math.max(1, Math.min(80, Number(segmentSettings.firstRow) || 20)),
            punctuation: punctuation,
            calibration: { dx: Math.max(-200, Math.min(200, Number(calibration.dx) || 0)),
              dy: Math.max(-200, Math.min(200, Number(calibration.dy) || 0)),
              scale: Math.max(0.7, Math.min(1.4, Number(calibration.scale) || 1)) },
            pages: pages
          };
        });
        restoreDictationSegment(Number(checked.value.selectedSegment || checked.value["段落"]) === 2 ? 2 : 1);
      } else {
        var answer = String(config.answer || DEFAULT_DICTATION_ANSWER);
        var punctuation = Array.isArray(config.punctuation) ? config.punctuation.filter(function (value) {
          return Number.isInteger(value) && value >= 0 && value < answer.length;
        }) : model.autoPunctuation(answer);
        var oldPages = {};
        for (var oldPageNo = 1; oldPageNo <= state.pageCount; oldPageNo += 1) {
          var oldSource = checked.value.pages[String(oldPageNo)] || checked.value.pages[oldPageNo] || {};
          var oldNormalized = model.dictationRecord(oldSource, answer.length, punctuation);
          oldPages[oldPageNo] = oldNormalized || model.blankDictationPage();
        }
        state.dictationSegments["1"] = { answer: answer,
          firstRow: Math.max(1, Math.min(80, Number(config.firstRow) || 20)), punctuation: punctuation,
          calibration: config.calibration || { dx: 0, dy: 0, scale: 1 }, pages: oldPages };
        state.dictationSegments["2"] = { answer: "", firstRow: 20, punctuation: [],
          calibration: { dx: 0, dy: 0, scale: 1 }, pages: {} };
        restoreDictationSegment(1);
      }
    }
    setMode(checked.value.mode);
    setStatus("已載入進度 JSON（不包含 PDF）。", els.exportStatus);
    renderCurrentMode(); updateControls();
  }

  async function exportCurrentPdf() {
    if (!state.pdfBytes) return;
    if (state.mode === "choice") {
      var choiceSettingsForExport = choiceSettings();
      if (!choiceSettingsForExport.valid) { setStatus(choiceSettingsForExport.message || "請先輸入答案。"); return; }
      if (!confirmChoiceExport(choiceSettingsForExport)) return;
    }
    els.exportPdf.disabled = true; setStatus("正在本機製作已批改 PDF…");
    try {
      var bytes;
      if (state.mode === "choice") {
        var settings = choiceSettings();
        if (!settings.valid) throw new Error(settings.message || "請先輸入答案。");
        bytes = await pdfExport.exportChoicePdf(state.pdfBytes, { settings: settings, pages: state.choicePages });
        createDownload("pdf-marking-choice-reviewed.pdf", new Blob([bytes], { type: "application/pdf" }));
      } else {
        var config = getDictationConfig();
        if (!config.answer.length) throw new Error("請輸入所選段落的默書句子。");
        bytes = await pdfExport.exportDictationPdf(state.pdfBytes, { answer: config.answer, firstRow: config.firstRow,
          punctuation: config.punctuation, pages: state.dictationPages, calibration: state.dictationCalibration,
          segment: config.segment });
        createDownload("pdf-marking-dictation-reviewed.pdf", new Blob([bytes], { type: "application/pdf" }));
      }
      setStatus("已在本機製作 PDF，下載已開始。");
    } catch (error) {
      setStatus(error && error.message ? error.message : "PDF 匯出失敗。");
    }
    updateControls();
  }

  function exportCsv() {
    if (state.mode === "choice") {
      var choiceSettingsForExport = choiceSettings();
      if (!choiceSettingsForExport.valid) { setStatus(choiceSettingsForExport.message || "請先輸入完整答案。"); return; }
      if (!confirmChoiceExport(choiceSettingsForExport)) return;
    }
    try {
      var csv = state.mode === "choice" ? buildChoiceCsv() : buildDictationCsv();
      var name = state.mode === "choice" ? "pdf-marking-choice-scores.csv" : "pdf-marking-dictation-scores.csv";
      createDownload(name, new Blob([csv], { type: "text/csv;charset=utf-8" }));
      setStatus("CSV 已使用 UTF-8 BOM，下載已開始。");
    } catch (error) {
      setStatus(error && error.message ? error.message : "CSV 匯出失敗。");
    }
  }

  async function loadProgress(file) {
    if (!file || !state.pdfDoc) { setStatus("請先選擇 PDF，再載入進度 JSON。"); return; }
    try {
      var data = JSON.parse(await file.text());
      applyProgress(data);
    } catch (error) {
      setStatus(error && error.message ? error.message : "進度 JSON 無法載入。");
    }
  }

  els.pdfFile.addEventListener("change", function () { loadPdf(els.pdfFile.files[0]); });
  els.clearPdf.addEventListener("click", function () {
    state.pdfBytes = null; state.pdfDoc = null; state.pdfFingerprint = ""; state.pageCount = 0; state.currentPage = 1;
    state.choicePages = {}; state.dictationPages = {}; state.dictationSegments = {}; state.dictationSegment = 1;
    state.dictationAnswer = DEFAULT_DICTATION_ANSWER; state.firstRow = 20;
    state.punctuation = model.autoPunctuation(DEFAULT_DICTATION_ANSWER);
    state.dictationCalibration = { dx: 0, dy: 0, scale: 1 };
    els.dictationSegment.value = "1"; els.dictationAnswer.value = DEFAULT_DICTATION_ANSWER;
    els.dictationAnswer.placeholder = "請輸入第一段默書句子";
    els.firstRow.value = "20"; els.punctuationIndexes.value = state.punctuation.join(", ");
    els.dictationDx.value = "0"; els.dictationDy.value = "0"; els.dictationScale.value = "100"; els.pdfFile.value = "";
    els.fileStatus.textContent = "尚未載入 PDF"; els.pageCount.textContent = ""; els.fileDot.classList.remove("ready");
    els.omrStatus.textContent = "讀圈會比較同題選項深淺，模糊答案及班別／學號會標示覆核。";
    renderCurrentMode(); updateControls();
  });
  els.readOmr.addEventListener("click", function () { readAllPages(); });
  document.querySelectorAll(".mode-tab").forEach(function (button) { button.addEventListener("click", function () { setMode(button.dataset.mode); }); });
  [els.choicePage, els.dictationPage].forEach(function (select) {
    select.addEventListener("change", function () { state.currentPage = Number(select.value); renderCurrentMode(); });
  });
  [els.choicePrev, els.dictationPrev].forEach(function (button) { button.addEventListener("click", function () { state.currentPage = Math.max(1, state.currentPage - 1); renderCurrentMode(); }); });
  [els.choiceNext, els.dictationNext].forEach(function (button) { button.addEventListener("click", function () { state.currentPage = Math.min(state.pageCount, state.currentPage + 1); renderCurrentMode(); }); });
  [els.mcCount, els.tfCount, els.mcKey, els.tfKey, els.mcPoints, els.tfPoints].forEach(function (input) {
    input.addEventListener("input", function () { renderChoiceSummary(currentChoicePage()); updateControls(); });
  });
  els.choiceStage.addEventListener("click", function (event) {
    var button = event.target.closest(".bubble-hit");
    if (button) toggleChoiceAnswer(button.dataset.type, Number(button.dataset.number), button.dataset.option);
  });
  els.reviewItems.addEventListener("click", function () { });
  [els.choiceClass, els.choiceStudentId].forEach(function (input, index) {
    input.addEventListener("input", function () {
      var page = currentChoicePage(); if (!page) return;
      if (index === 0) {
        page.classValue = input.value; page.classWasEdited = true;
        if (page.metadata.grade) page.metadata.grade.status = "manual";
        if (page.metadata.form) page.metadata.form.status = "manual";
      } else {
        page.studentId = input.value; page.studentIdWasEdited = true;
        (page.metadata.idDigits || []).forEach(function (digit) { digit.status = "manual"; });
      }
      refreshChoiceIdentityWarnings();
      renderChoiceSummary(page);
    });
  });
  els.dictationAnswer.addEventListener("focus", function () {
    state.dictationAnswerEditOriginal = { answer: state.dictationAnswer, punctuation: state.punctuation.slice() };
  });
  els.dictationAnswer.addEventListener("input", function () { getDictationConfig(); renderCurrentMode(); });
  els.dictationAnswer.addEventListener("change", finishDictationAnswerEdit);
  [els.firstRow, els.punctuationIndexes].forEach(function (input) {
    input.addEventListener("input", function () { getDictationConfig(); renderCurrentMode(); });
  });
  els.dictationSegment.addEventListener("change", function () {
    switchDictationSegment(Number(els.dictationSegment.value) === 2 ? 2 : 1);
  });
  [els.dictationDx, els.dictationDy, els.dictationScale].forEach(function (input) {
    input.addEventListener("input", function () {
      state.dictationCalibration = {
        dx: Number(els.dictationDx.value) || 0,
        dy: Number(els.dictationDy.value) || 0,
        scale: (Number(els.dictationScale.value) || 100) / 100
      };
      saveActiveDictationSegment();
      renderDictationPage();
    });
  });
  els.resetDictationCalibration.addEventListener("click", function () {
    state.dictationCalibration = { dx: 0, dy: 0, scale: 1 };
    els.dictationDx.value = "0"; els.dictationDy.value = "0"; els.dictationScale.value = "100";
    saveActiveDictationSegment();
    renderDictationPage();
  });
  els.detectPunctuation.addEventListener("click", function () {
    var indexes = model.autoPunctuation(els.dictationAnswer.value);
    els.punctuationIndexes.value = indexes.join(", "); getDictationConfig(); renderCurrentMode();
  });
  document.querySelectorAll(".mode-mark").forEach(function (button) {
    button.addEventListener("click", function () {
      state.activeMark = button.dataset.mark;
      document.querySelectorAll(".mode-mark").forEach(function (entry) {
        var active = entry === button; entry.classList.toggle("active", active); entry.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderDictationGrid(); renderDictationPage();
    });
  });
  function editDictationCell(index) {
    var config = getDictationConfig(); var record = dictationPageRecord();
    var changed = model.toggleDictationMark(record, index, state.activeMark, config.punctuation);
    if (changed.blocked) { setStatus("標點不可圈或標成漏字；可使用箭嘴。", els.exportStatus); return; }
    state.dictationPages[state.currentPage] = model.dictationRecord(changed.page, config.answer.length, config.punctuation);
    saveActiveDictationSegment();
    renderDictationStats(); renderDictationGrid(); renderDictationPage();
  }
  els.dictationStage.addEventListener("click", function (event) {
    var cell = event.target.closest(".dictation-hit"); if (cell && !cell.disabled) editDictationCell(Number(cell.dataset.index));
  });
  els.dictationGrid.addEventListener("click", function (event) {
    var cell = event.target.closest(".dictation-cell"); if (cell && !cell.disabled) editDictationCell(Number(cell.dataset.index));
  });
  els.dictationStudentId.addEventListener("input", function () {
    var page = dictationPageRecord(); page.studentId = els.dictationStudentId.value;
  });
  els.exportPdf.addEventListener("click", exportCurrentPdf);
  els.exportCsv.addEventListener("click", exportCsv);
  els.downloadProgress.addEventListener("click", function () {
    var progress = currentProgress();
    createDownload("pdf-marking-progress.json", new Blob([JSON.stringify(progress, null, 2)], { type: "application/json;charset=utf-8" }));
    setStatus("進度 JSON 已下載；不包含 PDF 或學生姓名。");
  });
  els.progressFile.addEventListener("change", function () { loadProgress(els.progressFile.files[0]); els.progressFile.value = ""; });
  window.addEventListener("resize", function () { if (state.pdfDoc) renderCurrentMode(); });

  renderCurrentMode(); updateControls();
})();
