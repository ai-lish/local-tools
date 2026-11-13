(function () {
  "use strict";

  var model = window.PdfMarkingModel;
  var templates = window.PdfMarkingTemplates;
  var geometry = window.PdfMarkingGeometry;
  var omr = window.PdfMarkingOmr;
  var pdfExport = window.PdfMarkingExport;
  var review = window.PdfMarkingReview;
  var templateStore = window.PdfMarkingTemplateStore;
  var DEFAULT_DICTATION_ANSWER = "應當一無掛慮，只要凡事藉著禱告、祈求，和感謝，將你們所要的告訴神。";
  var DEFAULT_TEMPLATE = templates.BUILTIN_TEMPLATES[0];
  var storedTemplateState = templateStore.load(window, templates);
  var customTemplates = storedTemplateState.templates;
  function findTemplateById(id) {
    return templates.BUILTIN_TEMPLATES.concat(customTemplates).find(function (definition) { return definition.id === id; }) || null;
  }
  var initialTemplate = findTemplateById(storedTemplateState.selectedTemplateId) || DEFAULT_TEMPLATE;
  var state = {
    mode: initialTemplate.kind, step: 1, templateId: initialTemplate.id, template: initialTemplate,
    pdfBytes: null, pdfDoc: null, pdfFingerprint: "", pageCount: 0, currentPage: 1,
    choicePages: {}, dictationPages: {}, activeMark: "circle", renderToken: 0,
    focusKey: "", demo: false,
    dictationSegment: 1, dictationSegments: {},
    dictationAnswer: DEFAULT_DICTATION_ANSWER, firstRow: 20, punctuation: model.autoPunctuation(DEFAULT_DICTATION_ANSWER),
    dictationCalibration: { dx: 0, dy: 0, scale: 1 }, dictationAnswerEditOriginal: null
  };
  var byId = function (id) { return document.getElementById(id); };
  var els = {
    pdfFile: byId("pdf-file"), clearPdf: byId("clear-pdf"), fileStatus: byId("file-status"),
    fileDot: byId("file-dot"), pageCount: byId("page-count"), choiceMode: byId("choice-mode"),
    dictationMode: byId("dictation-mode"), choiceSettingsPanel: byId("choice-settings"),
    dictationSettingsPanel: byId("dictation-settings"), startDictation: byId("start-dictation"),
    step1: byId("step-1"), step2: byId("step-2"), step3: byId("step-3"), step1State: byId("step-1-state"),
    step2State: byId("step-2-state"), step3State: byId("step-3-state"), stepPills: Array.from(document.querySelectorAll(".step-pill")),
    templateList: byId("template-list"), useTemplate: byId("use-template"), demoStart: byId("demo-start"),
    templateStatus: byId("template-status"), selectedTemplateLabel: byId("selected-template-label"),
    templateFile: byId("template-file"), exportTemplate: byId("export-template"), deleteTemplate: byId("delete-template"),
    demoBanner: byId("demo-banner"), endDemo: byId("end-demo"), reviewStepStatus: byId("review-step-status"),
    focusTitle: byId("focus-title"), focusReason: byId("focus-reason"), focusPreview: byId("focus-preview"),
    focusAnswerKeys: byId("focus-answer-keys"), focusConfirm: byId("focus-confirm"), focusProgress: byId("focus-progress"),
    mcCount: byId("mc-count"), tfCount: byId("tf-count"),
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
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.LT_PDF_WORKER_SRC;
  }
  els.dictationAnswer.value = DEFAULT_DICTATION_ANSWER;
  els.dictationAnswer.placeholder = "請輸入第一段默書句子";
  els.punctuationIndexes.value = state.punctuation.join(", ");

  function setStatus(message, target) {
    (target || els.exportStatus).textContent = message;
  }

  function templateById(id) {
    return findTemplateById(id) || DEFAULT_TEMPLATE;
  }

  function choiceReviewStatusText(summary) {
    var parts = [];
    if (summary.questionsPending) parts.push("尚有 " + summary.questionsPending + " 題待覆核");
    if (summary.pageFailures) parts.push("整頁失敗 " + summary.pageFailures + " 頁");
    if (summary.identityPages) parts.push("班別／學號待確認 " + summary.identityPages + " 頁");
    return parts.length ? parts.join("；") : "可覆核及匯出";
  }

  function questionBlock(type, definition) {
    return (definition || state.template).blocks && (definition || state.template).blocks.find(function (block) { return block.type === type; });
  }

  function renderTemplateList() {
    els.templateList.replaceChildren();
    templates.BUILTIN_TEMPLATES.concat(customTemplates).forEach(function (definition) {
      var card = document.createElement("button"); card.type = "button"; card.className = "template-card";
      card.setAttribute("role", "radio"); card.setAttribute("aria-checked", definition.id === state.templateId ? "true" : "false");
      if (definition.id === state.templateId) card.classList.add("selected");
      var head = document.createElement("span"); head.className = "template-card-head";
      var glyph = document.createElement("span"); glyph.className = "template-glyph"; glyph.textContent = definition.kind === "choice" ? "○" : "格";
      var title = document.createElement("strong"); title.textContent = definition.name;
      var kind = document.createElement("span"); kind.className = "template-kind"; kind.textContent = definition.kind === "choice" ? "選擇題" : "默書";
      head.append(glyph, title, kind);
      var source = document.createElement("span"); source.className = "template-source";
      source.textContent = definition.source === "builtin" ? "內置" : "自訂／匯入";
      head.append(source);
      var detail = document.createElement("p");
      if (definition.kind === "choice") {
        var mc = questionBlock("mc", definition); var tf = questionBlock("tf", definition);
        detail.textContent = (mc ? mc.maxCount + " 題 " + mc.options.join("／") : "無選擇題") +
          (tf ? "＋" + tf.maxCount + " 題是非" : "") + " · 班別及學號圈格";
      } else detail.textContent = "兩段金句 · 印刷格線自動定位 · 每次批改一段";
      card.append(head, detail);
      card.addEventListener("click", function () {
        state.templateId = definition.id;
        renderTemplateList(); updateControls(); updateStepper();
      });
      els.templateList.append(card);
    });
    var selected = templateById(state.templateId);
    els.exportTemplate.disabled = false;
    els.deleteTemplate.disabled = selected.source !== "custom";
    els.selectedTemplateLabel.textContent = selected.name;
  }

  function updateStepper() {
    var selected = templateById(state.templateId);
    els.step1State.textContent = selected.name;
    els.step2State.textContent = state.pdfDoc ? "已載入 " + state.pageCount + " 頁" : "選擇 PDF 並輸入答案";
    if (selected.kind === "choice") {
      var settings = choiceSettings();
      var summary = model.choiceReviewSummary(state.choicePages, state.pageCount, settings.mcCount, settings.tfCount);
      var hasReadPages = Object.keys(state.choicePages).length > 0;
      els.step3State.textContent = hasReadPages ? choiceReviewStatusText(summary) : "開始讀圈後可覆核及匯出";
      els.reviewStepStatus.textContent = !state.pdfDoc ? "先載入 PDF" : hasReadPages ? choiceReviewStatusText(summary) : "開始讀圈後可覆核及匯出";
    } else {
      els.step3State.textContent = state.pdfDoc ? "檢查格位並匯出" : "先載入 PDF";
      els.reviewStepStatus.textContent = state.pdfDoc ? "點擊格位批改所選段落" : "先載入 PDF";
    }
    els.stepPills.forEach(function (pill) {
      var target = Number(pill.dataset.step);
      pill.classList.toggle("current", target === state.step);
      pill.classList.toggle("complete", target < state.step);
      if (target === state.step) pill.setAttribute("aria-current", "step"); else pill.removeAttribute("aria-current");
      pill.disabled = target > 1 && !state.templateId || target === 3 && !state.pdfDoc;
    });
  }

  function setStep(step) {
    var next = Math.max(1, Math.min(3, Number(step) || 1));
    if (next > 1 && !state.templateId) next = 1;
    if (next === 3 && !state.pdfDoc) next = 2;
    state.step = next;
    [els.step1, els.step2, els.step3].forEach(function (section, index) { section.hidden = index + 1 !== next; });
    updateStepper();
    if (next === 3 && state.mode === "choice") {
      window.requestAnimationFrame(function () {
        if (state.step === 3 && !els.focusConfirm.disabled) els.focusConfirm.focus({ preventScroll: true });
      });
    }
  }

  function configureTemplateMode() {
    state.template = templateById(state.templateId);
    state.mode = state.template.kind;
    var choice = state.mode === "choice";
    els.choiceSettingsPanel.hidden = !choice;
    els.dictationSettingsPanel.hidden = choice;
    els.choiceMode.hidden = !choice;
    els.dictationMode.hidden = choice;
    els.exportPdf.classList.toggle("primary", !choice);
    if (choice) {
      var mc = questionBlock("mc"); var tf = questionBlock("tf");
      var identityFields = state.template.identity && state.template.identity.fields || [];
      var classFieldCount = identityFields.filter(function (field) { return field.id === "class-grade" || field.id === "class-form"; }).length;
      var studentField = identityFields.find(function (field) { return field.id === "student-number"; });
      els.choiceClass.closest("label").hidden = classFieldCount === 0;
      els.choiceStudentId.closest("label").hidden = !studentField;
      els.choiceStudentId.maxLength = studentField ? studentField.digits : 12;
      els.choiceStudentId.inputMode = "numeric";
      els.mcCount.max = String(mc ? mc.maxCount : 0); els.mcCount.closest("label").hidden = !mc;
      els.tfCount.max = String(tf ? tf.maxCount : 0); els.tfCount.closest("label").hidden = !tf;
      els.mcKey.closest("label").hidden = !mc; els.mcPoints.closest("label").hidden = !mc;
      els.tfKey.closest("label").hidden = !tf; els.tfPoints.closest("label").hidden = !tf;
      if (!mc) { els.mcCount.value = "0"; els.mcKey.value = ""; }
      if (!tf) { els.tfCount.value = "0"; els.tfKey.value = ""; }
      if (mc && Number(els.mcCount.value) > mc.maxCount) els.mcCount.value = String(mc.maxCount);
      if (tf && Number(els.tfCount.value) > tf.maxCount) els.tfCount.value = String(tf.maxCount);
      if (mc) els.mcKey.placeholder = "例如 " + mc.options.join("");
      if (tf) els.tfKey.placeholder = "例如 " + tf.options.join("");
    }
    els.selectedTemplateLabel.textContent = state.template.name;
    renderTemplateList();
    setStatus(""); updateControls(); updateStepper();
  }

  function numberInput(input, fallback, min, max) {
    var value = Number.parseInt(input.value, 10);
    if (!Number.isInteger(value)) value = fallback;
    return Math.max(min, Math.min(max, value));
  }

  function choiceSettings() {
    var mcBlock = questionBlock("mc"); var tfBlock = questionBlock("tf");
    var mcChoices = mcBlock ? mcBlock.options : ["A", "B", "C", "D"];
    var tfChoices = tfBlock ? tfBlock.options : ["T", "F"];
    var mcCount = mcBlock ? numberInput(els.mcCount, mcBlock.maxCount, 0, mcBlock.maxCount) : 0;
    var tfCount = tfBlock ? numberInput(els.tfCount, tfBlock.maxCount, 0, tfBlock.maxCount) : 0;
    var mc = model.parseKey(els.mcKey.value, mcCount, mcChoices);
    var tf = model.parseKey(els.tfKey.value, tfCount, tfChoices);
    var mcPoints = model.parsePoints(els.mcPoints.value, mcCount);
    var tfPoints = model.parsePoints(els.tfPoints.value, tfCount);
    return {
      mcCount: mcCount, tfCount: tfCount, mcKey: mc.values, tfKey: tf.values,
      mcPoints: mcPoints.values, tfPoints: tfPoints.values, mcOptions: mcChoices, tfOptions: tfChoices,
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

  function downloadName(name) {
    return state.demo ? "demo-" + name : name;
  }

  function updateControls() {
    var loaded = Boolean(state.pdfDoc);
    var dictationReady = state.dictationAnswer.length > 0;
    els.clearPdf.disabled = !loaded;
    els.readOmr.disabled = !loaded;
    els.startDictation.disabled = !loaded || !dictationReady;
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
    var template = geometry.expandChoiceTemplate(state.template, { mcCount: settings.mcCount, tfCount: settings.tfCount });
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
        if (state.focusKey === state.currentPage + ":" + item.type + ":" + item.number) button.classList.add("focused");
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

  function renderFocusControls(queue) {
    var current = queue.find(function (entry) { return entry.key === state.focusKey; });
    els.focusAnswerKeys.replaceChildren();
    els.focusProgress.textContent = queue.length ? (Math.max(1, queue.findIndex(function (entry) { return entry.key === state.focusKey; }) + 1) + " / " + queue.length + " 題") : "0 題";
    els.focusConfirm.disabled = !current;
    els.focusConfirm.classList.toggle("primary", Boolean(current));
    els.exportPdf.classList.toggle("primary", !current);
    if (!current) {
      els.focusTitle.textContent = "沒有待覆核題目";
      els.focusReason.textContent = state.pdfDoc ? "所有已讀題目都已確認；整頁警告仍請檢查。" : "載入 PDF 後，待覆核題目會在這裏放大顯示。";
      els.focusPreview.replaceChildren(Object.assign(document.createElement("p"), { className: "empty-state", textContent: "目前沒有需要覆核的題目。" }));
      return;
    }
    var question = current.question;
    var selected = question.answer || "";
    els.focusTitle.textContent = "第 " + current.pageNumber + " 頁 · " + (current.type === "mc" ? "選擇題" : "是非題") +
      "第 " + String(current.number).padStart(2, "0") + " 題";
    els.focusReason.textContent = "讀圈結果：「" + (selected || "空白") + "」；" + (question.reason || "請對照整頁確認答案。");
    var item = geometry.expandChoiceTemplate(state.template, choiceSettings()).items.find(function (entry) {
      return entry.type === current.type && entry.number === current.number;
    });
    var answerOptions = item ? item.choices.map(function (bubble) { return bubble.option; }) : [];
    answerOptions.concat(["空白"]).forEach(function (option) {
      var button = document.createElement("button"); button.type = "button"; button.className = "answer-choice";
      var isSelected = option === "空白" ? !selected : selected.indexOf(option) >= 0;
      button.textContent = option; button.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if (isSelected) button.classList.add("selected");
      button.addEventListener("click", function () {
        var next = option === "空白" ? "" : (selected.indexOf(option) >= 0 ? selected.replace(option, "") : Array.from(new Set((selected + option).split(""))).sort().join(""));
        question.answer = next;
        question.status = "review";
        question.reviewed = false;
        question.focusDraftEdited = true;
        renderCurrentMode();
      });
      els.focusAnswerKeys.append(button);
    });
  }

  function renderReviewList(page) {
    var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
    if (!queue.some(function (entry) { return entry.key === state.focusKey; })) state.focusKey = queue.length ? queue[0].key : "";
    els.reviewItems.replaceChildren(); els.pageFlags.replaceChildren();
    if (!queue.length) {
      var message = document.createElement("p"); message.className = "muted small";
      message.textContent = !page ? "載入 PDF 並開始讀圈後，清單會列出待覆核題目。" : "沒有待覆核題目。請仍檢查整頁警告。";
      els.reviewItems.append(message);
    } else queue.forEach(function (entry) {
      var button = document.createElement("button"); button.type = "button"; button.className = "review-item";
      button.setAttribute("aria-current", entry.key === state.focusKey ? "true" : "false");
      var label = document.createElement("span");
      label.textContent = "第 " + entry.pageNumber + " 頁 · " + (entry.type === "mc" ? "選擇題" : "是非題") + "第 " + String(entry.number).padStart(2, "0") + " 題";
      var detail = document.createElement("span"); detail.className = "item-value";
      detail.textContent = (entry.answer || "空白") + " · " + entry.reason;
      button.append(label, detail);
      button.addEventListener("click", function () {
        state.focusKey = entry.key; state.currentPage = entry.pageNumber;
        renderCurrentMode();
      });
      els.reviewItems.append(button);
    });
    for (var pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
      var entry = state.choicePages[pageNumber];
      if (!entry) continue;
      (entry.pageFlags || []).forEach(function (flagText) {
        var flag = document.createElement("div"); flag.className = "page-flag";
        flag.textContent = "第 " + pageNumber + " 頁 · " + flagText;
        els.pageFlags.append(flag);
      });
    }
    renderFocusControls(queue);
  }

  function renderFocusPreview(sourceCanvas, viewport) {
    var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
    var current = queue.find(function (entry) { return entry.key === state.focusKey; });
    if (!sourceCanvas || !current || current.pageNumber !== state.currentPage) return;
    var settings = choiceSettings();
    var template = geometry.expandChoiceTemplate(state.template, settings);
    var item = template.items.find(function (entry) { return entry.type === current.type && entry.number === current.number; });
    if (!item) return;
    var question = current.question;
    var centers = item.choices.map(function (bubble, index) {
      return geometry.mapBubble(bubble, viewport.width, viewport.height, state.choicePages[current.pageNumber].calibration,
        question.localOffsets && question.localOffsets[index]);
    });
    var radius = viewport.width * template.params.radius;
    var bounds = review.focusCropBounds(centers, radius, sourceCanvas.width, sourceCanvas.height);
    var left = bounds.left; var top = bounds.top; var right = bounds.right; var bottom = bounds.bottom;
    var cropWidth = Math.max(1, right - left); var cropHeight = Math.max(1, bottom - top);
    var zoom = document.createElement("canvas");
    var factor = Math.min(5, Math.max(2, 520 / cropWidth));
    zoom.width = Math.ceil(cropWidth * factor); zoom.height = Math.ceil(cropHeight * factor);
    var context = zoom.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.drawImage(sourceCanvas, left, top, cropWidth, cropHeight, 0, 0, zoom.width, zoom.height);
    context.strokeStyle = "#c26b12";
    context.lineWidth = Math.max(2, radius * factor * 0.22);
    var focus = bounds.focus;
    context.strokeRect((focus.left - left) * factor, (focus.top - top) * factor,
      (focus.right - focus.left) * factor, (focus.bottom - focus.top) * factor);
    zoom.setAttribute("role", "img");
    zoom.setAttribute("aria-label", "第 " + current.pageNumber + " 頁，第 " + current.number + " 題，目前覆核，橙框標示該題圈格");
    els.focusPreview.replaceChildren(zoom);
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
    if (summary.pageFailures) message += "；整頁失敗 " + summary.pageFailures + " 頁";
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
    renderFocusPreview(rendered.canvas, rendered.viewport);
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
    var dictationTemplateParams = templates.dictationParams(state.template);
    var fittedGrid = geometry.fitDictationGrid(rendered.data, base.width, base.height, state.dictationSegment, dictationTemplateParams);
    var layout = geometry.dictationLayout(base.width, base.height,
      state.dictationAnswer.length, state.firstRow, state.dictationCalibration, fittedGrid, dictationTemplateParams, state.dictationSegment);
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
    state.templateId = templates.BUILTIN_TEMPLATES.find(function (definition) { return definition.kind === mode; }).id;
    configureTemplateMode();
    setStatus("");
    renderCurrentMode();
  }

  async function loadPdf(file) {
    if (!file || !/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setStatus("請選擇 PDF 檔案。", els.fileStatus); return;
    }
    if (!window.pdfjsLib || !window.PDFLib || !window.LT_PDF_WORKER_SRC) {
      var missingLibraryMessage = window.LT_OFFLINE
        ? "套件不完整：請先把 zip 完整解壓，再開啟 START-HERE.html"
        : "PDF 程式庫未載入；請連線後重新整理頁面。";
      setStatus(missingLibraryMessage, els.fileStatus); return;
    }
    try {
      setStatus("正在本機開啟 PDF…", els.fileStatus);
      var bytes = new Uint8Array(await file.arrayBuffer());
      var pdf = await window.pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      var digest = await window.crypto.subtle.digest("SHA-256", bytes);
      var fingerprint = Array.from(new Uint8Array(digest)).map(function (value) { return value.toString(16).padStart(2, "0"); }).join("");
      state.pdfBytes = bytes; state.pdfDoc = pdf; state.pdfFingerprint = fingerprint; state.pageCount = pdf.numPages; state.currentPage = 1;
      state.demo = Boolean(file.isDemo);
      els.demoBanner.hidden = !state.demo;
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
      updatePageSelectors(); renderCurrentMode(); setStep(2);
      setStatus("");
    } catch (error) {
      state.pdfBytes = null; state.pdfDoc = null; state.pdfFingerprint = ""; state.pageCount = 0;
      setStatus("PDF 無法開啟。請確認檔案完整、未加密，並使用 PDF 格式。", els.fileStatus);
    }
  }

  async function readAllPages() {
    if (!state.pdfDoc) return;
    if (review.hasManualEdits(state.choicePages) && !window.confirm("讀圈結果中有你手動修改的答案或班別／學號。重新讀取會清除這些修改，仍要繼續嗎？")) return;
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
        var template = geometry.expandChoiceTemplate(state.template, { mcCount: settings.mcCount, tfCount: settings.tfCount });
        var fit = omr.gridFit(rendered.data.data, rendered.canvas.width, rendered.canvas.height, template);
        var detected = omr.detectPage(rendered.data.data, rendered.canvas.width, rendered.canvas.height,
          settings.mcCount, settings.tfCount, fit.calibration, fit.metadataCalibration, template);
        var page = {
          questions: detected.questions,
          classValue: detected.classValue,
          studentId: detected.studentId,
          metadata: detected.metadata,
          identityRequirements: detected.identityRequirements,
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
        var requirements = detected.identityRequirements || { grade: true, form: true, studentDigits: 2 };
        if ((requirements.grade && page.metadata.grade.status !== "read") || (requirements.form && page.metadata.form.status !== "read") ||
            page.metadata.idDigits.some(function (entry) { return entry.status !== "read"; })) metadataReviewPages += 1;
        rendered.canvas.width = 1; rendered.canvas.height = 1;
      }
      var identityWarnings = refreshChoiceIdentityWarnings();
      var identityIssuePages = Object.keys(identityWarnings).filter(function (pageNo) {
        return identityWarnings[pageNo] && identityWarnings[pageNo].length;
      }).length;
      els.omrStatus.textContent = "完成讀圈：" + state.pageCount + " 頁、" + totalQuestions + " 題；" + totalReviews + " 題待覆核；" +
        pageFailureCount + " 頁整頁定位失敗；" + metadataReviewPages + " 頁班別或學號待確認；" + identityIssuePages + " 頁需核對空白／重複班別學號。";
      var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
      state.focusKey = queue.length ? queue[0].key : "";
      if (queue.length) state.currentPage = queue[0].pageNumber;
    } catch (error) {
      state.choicePages = {};
      els.omrStatus.textContent = "讀圈未能完成。請檢查 PDF 頁面，再重新載入。";
    }
    els.readOmr.disabled = false;
    setStep(3); updateControls(); renderCurrentMode();
  }

  function confirmFocusedQuestion() {
    var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
    var index = queue.findIndex(function (entry) { return entry.key === state.focusKey; });
    if (index < 0) return;
    var current = queue[index];
    review.confirmQuestion(current.question);
    var updated = review.buildReviewQueue(state.choicePages, state.pageCount);
    var next = updated[index] || updated[index - 1] || null;
    state.focusKey = next ? next.key : "";
    if (next) state.currentPage = next.pageNumber;
    renderCurrentMode(); updateControls(); updateStepper();
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
        version: 3, mode: "choice", templateId: state.template.id, pdfFingerprint: state.pdfFingerprint, pageCount: state.pageCount, settings: {
          mcCount: settings.mcCount, tfCount: settings.tfCount,
          mcAnswer: Array.from(els.mcKey.value.toUpperCase()).filter(function (value) { return settings.mcOptions.indexOf(value) >= 0; }).slice(0, 250).join(""),
          tfAnswer: Array.from(els.tfKey.value.toUpperCase()).filter(function (value) { return settings.tfOptions.indexOf(value) >= 0; }).slice(0, 250).join(""),
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
      version: 3, mode: "dictation", templateId: state.template.id, pdfFingerprint: state.pdfFingerprint, pageCount: state.pageCount,
      selectedSegment: config.segment, "段落": config.segment, segments: segments,
      settings: { answer: config.answer, firstRow: config.firstRow, punctuation: config.punctuation,
        calibration: state.dictationCalibration },
      pages: state.dictationPages
    };
  }

  function cleanMetadataEntry(entry) {
    if (!entry || typeof entry !== "object") return { status: "review", reason: "未能讀取", label: "" };
    var reasons = ["空白", "多於一個深圈", "整頁填色偏淡", "填色偏淡，需確認是否作答", "最深與次深差距細", "未能讀取"];
    var labels = ["班別年級", "班別字母"];
    if (/^學號第 \d+ 位$/.test(String(entry.label || ""))) labels.push(entry.label);
    return {
      label: labels.indexOf(entry.label) >= 0 ? entry.label : "", value: String(entry.value || "").replace(/[^A-F0-9]/gi, "").slice(0, 8),
      status: ["read", "review", "blank", "manual"].indexOf(entry.status) >= 0 ? entry.status : "review",
      reason: reasons.indexOf(entry.reason) >= 0 ? entry.reason : "",
      values: Array.isArray(entry.values) ? entry.values.map(Number).slice(0, 10) : []
    };
  }

  function normalizeTemplateAnswer(value, type) {
    var block = questionBlock(type);
    var allowed = block ? block.options : (type === "tf" ? ["T", "F"] : ["A", "B", "C", "D"]);
    return Array.from(new Set(Array.from(String(value || "").toUpperCase()).filter(function (option) { return allowed.indexOf(option) >= 0; })))
      .sort().join("");
  }

  function cleanChoicePage(source) {
    var identityFields = state.template.identity && state.template.identity.fields || [];
    var requirements = {
      grade: identityFields.some(function (field) { return field.id === "class-grade"; }),
      form: identityFields.some(function (field) { return field.id === "class-form"; }),
      studentDigits: (identityFields.find(function (field) { return field.id === "student-number"; }) || { digits: 0 }).digits
    };
    var questions = Array.isArray(source.questions) ? source.questions.map(function (entry) {
      return {
        type: entry.type === "tf" ? "tf" : "mc", number: Number(entry.number) || 0,
        answer: normalizeTemplateAnswer(entry.answer, entry.type === "tf" ? "tf" : "mc"),
        status: ["read", "review", "blank", "manual"].indexOf(entry.status) >= 0 ? entry.status : "review",
        reason: String(entry.reason || ""), reviewed: Boolean(entry.reviewed), focusDraftEdited: Boolean(entry.focusDraftEdited), values: Array.isArray(entry.values) ? entry.values.map(Number).slice(0, (questionBlock(entry.type === "tf" ? "tf" : "mc") || { options: [] }).options.length) : [],
        localOffsets: Array.isArray(entry.localOffsets) ? entry.localOffsets.slice(0, (questionBlock(entry.type === "tf" ? "tf" : "mc") || { options: [] }).options.length).map(function (offset) {
          var dx = Number(offset && offset.dx); var dy = Number(offset && offset.dy);
          return { dx: Number.isFinite(dx) ? Math.max(-0.01, Math.min(0.01, dx)) : 0,
            dy: Number.isFinite(dy) ? Math.max(-0.01, Math.min(0.01, dy)) : 0 };
        }) : []
      };
    }) : [];
    var cal = source.calibration || {};
    return {
      questions: questions, classValue: String(source.classValue || "").toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 8),
      studentId: String(source.studentId || "").replace(/\D/g, "").slice(0, requirements.studentDigits || 12),
      identityRequirements: requirements,
      metadata: {
        grade: requirements.grade ? cleanMetadataEntry(source.metadata && source.metadata.grade) : { status: "read", reason: "", label: "班別年級", value: "", values: [] },
        form: requirements.form ? cleanMetadataEntry(source.metadata && source.metadata.form) : { status: "read", reason: "", label: "班別字母", value: "", values: [] },
        idDigits: requirements.studentDigits && Array.isArray(source.metadata && source.metadata.idDigits) ?
          source.metadata.idDigits.slice(0, requirements.studentDigits).map(function (entry, index) {
            var clean = cleanMetadataEntry(entry);
            clean.label = "學號第 " + (index + 1) + " 位";
            return clean;
          }) : []
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
    var targetTemplate = checked.value.version === 3 ? findTemplateById(checked.value.templateId) :
      templates.BUILTIN_TEMPLATES.find(function (definition) { return definition.kind === checked.value.mode; });
    if (!targetTemplate) throw new Error("進度檔使用的自訂範本未在本機找到；請先匯入該範本 JSON。");
    if (targetTemplate.kind !== checked.value.mode) throw new Error("進度檔的範本類型與批改模式不相符。");
    state.templateId = targetTemplate.id; state.template = targetTemplate; state.mode = targetTemplate.kind;
    configureTemplateMode();
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
      if ((checked.value.version === 2 || checked.value.version === 3) && checked.value.segments) {
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
    state.mode = checked.value.mode;
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
        settings.template = geometry.expandChoiceTemplate(state.template, { mcCount: settings.mcCount, tfCount: settings.tfCount });
        bytes = await pdfExport.exportChoicePdf(state.pdfBytes, { settings: settings, pages: state.choicePages });
        createDownload(downloadName("pdf-marking-choice-reviewed.pdf"), new Blob([bytes], { type: "application/pdf" }));
      } else {
        var config = getDictationConfig();
        if (!config.answer.length) throw new Error("請輸入所選段落的默書句子。");
        bytes = await pdfExport.exportDictationPdf(state.pdfBytes, { answer: config.answer, firstRow: config.firstRow,
          punctuation: config.punctuation, pages: state.dictationPages, calibration: state.dictationCalibration,
          segment: config.segment, templateParams: templates.dictationParams(state.template) });
        createDownload(downloadName("pdf-marking-dictation-reviewed.pdf"), new Blob([bytes], { type: "application/pdf" }));
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
      createDownload(downloadName(name), new Blob([csv], { type: "text/csv;charset=utf-8" }));
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

  function useSelectedTemplate() {
    var nextTemplate = templateById(state.templateId);
    if (state.template && state.template.id !== nextTemplate.id) {
      var hasChoiceWork = Object.keys(state.choicePages).length > 0;
      var hasDictationWork = hasDictationMarks(state.dictationPages) || Object.keys(state.dictationSegments).some(function (key) {
        return hasDictationMarks(state.dictationSegments[key] && state.dictationSegments[key].pages);
      });
      if (state.pdfDoc && (hasChoiceWork || hasDictationWork) &&
          !window.confirm("更換範本會清除目前 PDF 的批改記錄；PDF 本身仍會保留。要繼續嗎？")) {
        state.templateId = state.template.id; renderTemplateList(); updateStepper(); return;
      }
      state.choicePages = {}; state.dictationPages = {}; state.dictationSegments = {}; state.focusKey = "";
    }
    state.template = nextTemplate; state.mode = nextTemplate.kind;
    templateStore.savePreference(window, nextTemplate.id);
    configureTemplateMode();
    setStep(state.pdfDoc ? 2 : 2);
    renderCurrentMode();
  }

  function exportSelectedTemplate() {
    try {
      var selected = templateById(state.templateId);
      var text = templates.serializeTemplate(selected);
      var safeId = selected.id.replace(/[^a-z0-9._-]/gi, "-");
      createDownload(downloadName("pdf-marking-template-" + safeId + ".json"), new Blob([text], { type: "application/json;charset=utf-8" }));
      els.templateStatus.textContent = "範本 JSON 已下載；檔案不含批改進度。";
    } catch (error) {
      els.templateStatus.textContent = error.message || "範本無法匯出。";
    }
  }

  function templateSummary(definition) {
    if (definition.kind === "choice") {
      return definition.blocks.map(function (block) {
        return block.label + "最多 " + block.maxCount + " 題（" + block.options.join("／") + "）";
      }).join("；") + "；身份遮蔽區 " + ((definition.identity && definition.identity.masks) || []).length + " 個";
    }
    return "默書 " + definition.segments.length + " 段；印刷格線定位；沿用 GAS 半分制";
  }

  async function importTemplateFile(file) {
    if (!file) return;
    try {
      var parsed = templates.parseTemplateJson(await file.text());
      if (!parsed.ok) {
        els.templateStatus.textContent = parsed.errors.join(" ");
        return;
      }
      var incoming = parsed.template;
      var existing = findTemplateById(incoming.id);
      var preview = "範本預覽：「" + incoming.name + "」\n" + templateSummary(incoming) +
        (parsed.warnings && parsed.warnings.length ? "\n提示：" + parsed.warnings.join(" ") : "") + "\n按確定加入範本清單。";
      if (existing && (existing.source !== "custom" || !window.confirm(preview + "\n\n相同 ID 的自訂範本已存在，確定取代？"))) return;
      if (!existing && !window.confirm(preview)) return;
      customTemplates = customTemplates.filter(function (definition) { return definition.id !== incoming.id; });
      customTemplates.push(incoming);
      var saved = templateStore.saveTemplates(window, templates, customTemplates);
      renderTemplateList();
      els.templateStatus.textContent = "範本已加入。" + (saved.ok ? saved.message : saved.message + " 請匯出 JSON 保留副本。");
    } catch (error) {
      els.templateStatus.textContent = error && error.message ? error.message : "範本檔無法讀取。";
    } finally {
      els.templateFile.value = "";
    }
  }

  function deleteSelectedTemplate() {
    var selected = findTemplateById(state.templateId);
    if (!selected || selected.source !== "custom") return;
    if (!window.confirm("刪除自訂範本「" + selected.name + "」？此操作不能還原，建議先匯出 JSON 備份。")) return;
    if (state.template.id === selected.id) {
      state.templateId = DEFAULT_TEMPLATE.id;
      useSelectedTemplate();
      if (state.template.id === selected.id) return;
    }
    customTemplates = customTemplates.filter(function (definition) { return definition.id !== selected.id; });
    var saved = templateStore.saveTemplates(window, templates, customTemplates);
    if (state.templateId === selected.id) state.templateId = state.template.id;
    renderTemplateList(); updateStepper();
    els.templateStatus.textContent = saved.ok ? "自訂範本已刪除。" : "自訂範本已從清單移除，但 " + saved.message;
  }

  async function startDemo() {
    if (state.pdfDoc && !window.confirm("開始示範會清除目前已載入的 PDF 及批改記錄，仍要繼續嗎？")) return;
    try {
      var definition = templates.BUILTIN_TEMPLATES.find(function (entry) { return entry.kind === "choice"; });
      state.templateId = definition.id;
      state.template = definition;
      state.mode = "choice";
      var plan = window.PdfMarkingDemo.buildDemoPlan();
      els.mcCount.value = String(plan.questionCount); els.tfCount.value = String(plan.tfCount);
      els.mcKey.value = plan.answerKey;
      els.tfKey.value = plan.tfAnswerKey; els.mcPoints.value = "1"; els.tfPoints.value = "1";
      configureTemplateMode();
      var bytes = await window.PdfMarkingDemo.createDemoPdf(window.PDFLib, definition);
      var syntheticFile = {
        name: "demo-synthetic.pdf", type: "application/pdf", isDemo: true,
        arrayBuffer: async function () { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
      };
      await loadPdf(syntheticFile);
      if (state.pdfDoc) {
        state.demo = true;
        els.demoBanner.hidden = false;
        els.fileStatus.textContent = "示範 PDF 已在本機開啟";
        els.omrStatus.textContent = "合成答題紙已載入；按「自動讀圈並進入覆核」開始示範。";
        setStatus("示範使用 3 頁虛構答題紙，與正式流程相同。", els.templateStatus);
        renderCurrentMode(); setStep(2); updateStepper();
      }
    } catch (error) {
      state.demo = false;
      setStatus(error && error.message ? error.message : "示範 PDF 無法建立。", els.templateStatus);
    }
  }

  function endDemo() {
    state.demo = false;
    els.demoBanner.hidden = true;
    state.pdfBytes = null; state.pdfDoc = null; state.pdfFingerprint = ""; state.pageCount = 0; state.currentPage = 1;
    state.choicePages = {}; state.dictationPages = {}; state.dictationSegments = {}; state.focusKey = "";
    els.pdfFile.value = ""; els.fileStatus.textContent = "尚未載入 PDF"; els.pageCount.textContent = ""; els.fileDot.classList.remove("ready");
    els.omrStatus.textContent = "示範已結束；可選擇自己的本機 PDF。";
    renderCurrentMode(); setStep(1); updateControls(); updateStepper();
  }

  els.pdfFile.addEventListener("change", function () { loadPdf(els.pdfFile.files[0]); });
  els.clearPdf.addEventListener("click", function () {
    state.demo = false; els.demoBanner.hidden = true;
    state.pdfBytes = null; state.pdfDoc = null; state.pdfFingerprint = ""; state.pageCount = 0; state.currentPage = 1;
    state.choicePages = {}; state.dictationPages = {}; state.dictationSegments = {}; state.dictationSegment = 1; state.focusKey = "";
    state.dictationAnswer = DEFAULT_DICTATION_ANSWER; state.firstRow = 20;
    state.punctuation = model.autoPunctuation(DEFAULT_DICTATION_ANSWER);
    state.dictationCalibration = { dx: 0, dy: 0, scale: 1 };
    els.dictationSegment.value = "1"; els.dictationAnswer.value = DEFAULT_DICTATION_ANSWER;
    els.dictationAnswer.placeholder = "請輸入第一段默書句子";
    els.firstRow.value = "20"; els.punctuationIndexes.value = state.punctuation.join(", ");
    els.dictationDx.value = "0"; els.dictationDy.value = "0"; els.dictationScale.value = "100"; els.pdfFile.value = "";
    els.fileStatus.textContent = "尚未載入 PDF"; els.pageCount.textContent = ""; els.fileDot.classList.remove("ready");
    els.omrStatus.textContent = "讀圈會比較同題選項深淺，模糊答案及班別／學號會標示覆核。";
    setStep(2); renderCurrentMode(); updateControls(); updateStepper();
  });
  els.readOmr.addEventListener("click", function () { readAllPages(); });
  els.startDictation.addEventListener("click", function () { if (state.pdfDoc && state.dictationAnswer.length) { setStep(3); renderCurrentMode(); } });
  els.useTemplate.addEventListener("click", useSelectedTemplate);
  els.exportTemplate.addEventListener("click", exportSelectedTemplate);
  els.deleteTemplate.addEventListener("click", deleteSelectedTemplate);
  els.templateFile.addEventListener("change", function () { importTemplateFile(els.templateFile.files[0]); });
  els.demoStart.addEventListener("click", startDemo);
  els.endDemo.addEventListener("click", endDemo);
  els.stepPills.forEach(function (pill) { pill.addEventListener("click", function () { setStep(Number(pill.dataset.step)); renderCurrentMode(); }); });
  els.focusConfirm.addEventListener("click", confirmFocusedQuestion);
  window.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" || state.step !== 3 || state.mode !== "choice") return;
    var target = event.target;
    if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) && target !== els.focusConfirm) return;
    event.preventDefault(); confirmFocusedQuestion();
  });
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
    createDownload(downloadName("pdf-marking-progress.json"), new Blob([JSON.stringify(progress, null, 2)], { type: "application/json;charset=utf-8" }));
    setStatus("進度 JSON 已下載；不包含 PDF 或學生姓名。");
  });
  els.progressFile.addEventListener("change", function () { loadProgress(els.progressFile.files[0]); els.progressFile.value = ""; });
  window.addEventListener("resize", function () { if (state.pdfDoc) renderCurrentMode(); });

  renderTemplateList(); configureTemplateMode(); setStep(1); renderCurrentMode(); updateControls(); updateStepper();
})();
