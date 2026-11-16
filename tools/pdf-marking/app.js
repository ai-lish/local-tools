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
    choicePages: {}, dictationPages: {}, legacyDictationPages: {}, activeMark: "wrongCircle", renderToken: 0,
    focusKey: "", demo: false,
    dictationSegment: 1, dictationSegments: {},
    dictationAnswer: DEFAULT_DICTATION_ANSWER, firstRow: 20, punctuation: model.autoPunctuation(DEFAULT_DICTATION_ANSWER),
    dictationCalibration: { dx: 0, dy: 0, scale: 1 }, dictationAnswerEditOriginal: null,
    dictationStyle: "sentence", dictationBaseEnabled: false, dictationUndo: []
  };
  var byId = function (id) { return document.getElementById(id); };
  var els = {
    pdfFile: byId("pdf-file"), clearPdf: byId("clear-pdf"), fileStatus: byId("file-status"),
    fileDot: byId("file-dot"), pageCount: byId("page-count"), choiceMode: byId("choice-mode"),
    dictationMode: byId("dictation-mode"), choiceSettingsPanel: byId("choice-settings"),
    dictationSettingsPanel: byId("dictation-settings"), dictationEntry: byId("dictation-entry"), startDictation: byId("start-dictation"),
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
    pageFlags: byId("page-flags"), dictationSegment: byId("dictation-segment"), dictationStyle: byId("dictation-style"),
    dictationAnswer: byId("dictation-answer"), firstRow: byId("dictation-first-row"),
    dictationBaseEnabled: byId("dictation-base-enabled"), dictationCalibration: byId("dictation-calibration"),
    firstRowField: byId("dictation-first-row-field"), sentenceToolbar: byId("sentence-mark-toolbar"),
    sentenceStickyToolbar: byId("dictation-sentence-sticky"), dictationStickyScore: byId("dictation-sticky-score"),
    dictationStickyDeduction: byId("dictation-sticky-deduction"),
    gridToolbar: byId("grid-mark-toolbar"), dictationGridWrap: document.querySelector(".dictation-grid-wrap"),
    answerReviewWrap: byId("dictation-answer-review-wrap"), answerReview: byId("dictation-answer-review"),
    undoDictation: byId("undo-dictation"), markDictationPerfect: byId("mark-dictation-perfect"),
    dictationPageBase: byId("dictation-page-base"), overrideWrong: byId("dictation-override-wrong"),
    overrideExtra: byId("dictation-override-extra"), overrideMiss: byId("dictation-override-miss"),
    overrideScore: byId("dictation-override-score"), restoreDictationAuto: byId("restore-dictation-auto"),
    dictationAutoScore: byId("dictation-auto-score"), dictationPageStatus: byId("dictation-page-status"),
    dictationManualBadge: byId("dictation-manual-badge"),
    dictationDx: byId("dictation-dx"), dictationDy: byId("dictation-dy"), dictationScale: byId("dictation-scale"),
    resetDictationCalibration: byId("reset-dictation-calibration"),
    dictationPage: byId("dictation-page"), dictationPrev: byId("dictation-prev"), dictationNext: byId("dictation-next"),
    dictationScore: byId("dictation-score"), dictationDeduction: byId("dictation-deduction"),
    dictationStudentId: byId("dictation-student-id"), dictationStage: byId("dictation-stage"),
    dictationGrid: byId("dictation-grid"), dictationNote: byId("dictation-note"),
    dictationRuleNote: byId("dictation-rule-note"), exportPdf: byId("export-pdf"), exportCsv: byId("export-csv"),
    downloadProgress: byId("download-progress"), progressFile: byId("progress-file"), exportStatus: byId("export-status")
  };

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.LT_PDF_WORKER_SRC;
  }
  els.dictationAnswer.value = DEFAULT_DICTATION_ANSWER;
  els.dictationAnswer.placeholder = "請輸入第一段默書句子";
  els.dictationStyle.value = state.dictationStyle;
  els.dictationBaseEnabled.checked = state.dictationBaseEnabled;

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
      } else detail.textContent = "兩段金句 · 答案句新模式或舊版格位模式 · 每次批改一段";
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
    els.step2State.textContent = state.pdfDoc ? "已載入 " + state.pageCount + " 頁" : "選擇本機 PDF";
    if (selected.kind === "choice") {
      var settings = choiceSettings();
      var summary = model.choiceReviewSummary(state.choicePages, state.pageCount, settings.mcCount, settings.tfCount);
      var hasReadPages = Object.keys(state.choicePages).length > 0;
      els.step3State.textContent = hasReadPages ? choiceReviewStatusText(summary) : "開始讀圈後可覆核及匯出";
      els.reviewStepStatus.textContent = !state.pdfDoc ? "先載入 PDF" : hasReadPages ? choiceReviewStatusText(summary) : "開始讀圈後可覆核及匯出";
    } else {
      els.step3State.textContent = state.pdfDoc ? "默書設定、批改及匯出" : "先載入 PDF";
      els.reviewStepStatus.textContent = state.pdfDoc ? "按答案句標記；可切換舊版格位模式" : "先載入 PDF";
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
    els.dictationEntry.hidden = choice;
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
    els.startDictation.disabled = !loaded;
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

  function confirmDictationExport() {
    var pending = [];
    for (var pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
      if (!dictationScoreRecordForPage(pageNumber).reviewed) pending.push(pageNumber);
    }
    if (!pending.length) return true;
    return window.confirm("以下頁面尚未批改：" + pending.join("、") + "。這些頁面的分數會留空，仍要匯出嗎？");
  }

  function hasDictationMarks(pages) {
    return Object.keys(pages || {}).some(function (pageNumber) {
      var page = pages[pageNumber] || {};
      return [page.circles, page.arrows, page.miss, page.surfaceMarks].some(function (list) {
        return Array.isArray(list) && list.length > 0;
      }) || Array.isArray(page.answerStates) && page.answerStates.some(function (status) { return status !== "normal"; });
    });
  }

  function finishDictationAnswerEdit() {
    var original = state.dictationAnswerEditOriginal;
    if (!original) return;
    var nextAnswer = model.normalizeDictationAnswer(els.dictationAnswer.value);
    var changed = nextAnswer !== original.answer;
    if (changed && (hasDictationMarks(state.dictationPages) || hasDictationMarks(state.legacyDictationPages)) &&
        !window.confirm("所選段落已有批改標記；更改句子會按新字數保留仍有效的標記。要繼續嗎？")) {
      state.dictationAnswer = original.answer;
      els.dictationAnswer.value = original.answer;
      state.punctuation = model.autoPunctuation(state.dictationAnswer);
      saveActiveDictationSegment();
      state.dictationAnswerEditOriginal = null;
      renderCurrentMode();
      return;
    }
    var config = getDictationConfig();
    els.dictationAnswer.value = config.answer;
    var cleaned = model.sanitizeDictationV4Pages(state.dictationPages, state.pageCount, config.answer);
    state.dictationPages = cleaned.pages;
    var legacyCleaned = model.sanitizeLegacyDictationPages(state.legacyDictationPages, state.pageCount,
      model.dictationCharacters(config.answer).length, config.punctuation);
    state.legacyDictationPages = legacyCleaned.pages;
    saveActiveDictationSegment();
    state.dictationAnswerEditOriginal = null;
    var dropped = cleaned.dropped + legacyCleaned.dropped;
    if (dropped) {
      setStatus("句子更改後已移除 " + dropped + " 個超出字數或屬於標點的標記；其他標記已保留。", els.exportStatus);
      renderCurrentMode();
    }
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
    if (!state.dictationPages[state.currentPage]) state.dictationPages[state.currentPage] = model.blankDictationV4Page(state.dictationAnswer);
    return model.cloneDictationV4Page(state.dictationPages[state.currentPage], state.dictationAnswer);
  }

  function legacyDictationPageRecord() {
    if (!state.legacyDictationPages[state.currentPage]) state.legacyDictationPages[state.currentPage] = model.blankDictationPage();
    return model.cloneDictationPage(state.legacyDictationPages[state.currentPage]);
  }

  function saveActiveDictationSegment() {
    state.dictationSegments[String(state.dictationSegment)] = {
      answer: state.dictationAnswer, firstRow: state.firstRow,
      calibration: Object.assign({}, state.dictationCalibration),
      pages: state.dictationPages, legacyPages: state.legacyDictationPages
    };
  }

  function syncDictationStyleControls() {
    state.dictationStyle = els.dictationStyle.value === "grid" ? "grid" : "sentence";
    var sentence = state.dictationStyle === "sentence";
    els.sentenceStickyToolbar.hidden = !sentence;
    els.sentenceToolbar.hidden = !sentence;
    els.gridToolbar.hidden = sentence;
    els.answerReviewWrap.hidden = !sentence;
    els.dictationGridWrap.hidden = sentence;
    els.dictationCalibration.hidden = sentence;
    els.firstRowField.hidden = sentence;
    els.dictationRuleNote.textContent = sentence
      ? "N = 錯字 + max(多字, 漏字)。原始分 = max(0, 10 − 0.5 × N)，四捨五入至 0.5；啟用底分時，正確字數 ≥ 5 為 2 分、≥ 10 為 3 分。"
      : "舊版自動計分以錯字圈與漏字格的不同格數計 N，同一格同時圈及漏只扣一次；人手覆寫數目後按 N = 錯字 + max(多字, 漏字) 重算。底分規則相同。";
    var toolbar = sentence ? els.sentenceToolbar : els.gridToolbar;
    toolbar.querySelectorAll(".mode-mark").forEach(function (button) {
      var active = button.dataset.mark === state.activeMark;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function restoreDictationSegment(segmentNumber) {
    var segment = state.dictationSegments[String(segmentNumber)] || {};
    state.dictationSegment = segmentNumber;
    state.dictationAnswer = model.normalizeDictationAnswer(model.dictationSegmentAnswer(segment, segmentNumber, DEFAULT_DICTATION_ANSWER));
    state.firstRow = Math.max(1, Math.min(80, Number(segment.firstRow) || 20));
    state.punctuation = model.autoPunctuation(state.dictationAnswer);
    var calibration = segment.calibration || {};
    state.dictationCalibration = {
      dx: Math.max(-200, Math.min(200, Number(calibration.dx) || 0)),
      dy: Math.max(-200, Math.min(200, Number(calibration.dy) || 0)),
      scale: Math.max(0.7, Math.min(1.4, Number(calibration.scale) || 1))
    };
    state.dictationPages = segment.pages || {};
    state.legacyDictationPages = segment.legacyPages || {};
    if (state.pdfDoc) {
      for (var pageNo = 1; pageNo <= state.pageCount; pageNo += 1) {
        if (!state.dictationPages[pageNo]) state.dictationPages[pageNo] = model.blankDictationV4Page(state.dictationAnswer);
        if (!state.legacyDictationPages[pageNo]) state.legacyDictationPages[pageNo] = model.blankDictationPage();
      }
    }
    els.dictationSegment.value = String(segmentNumber);
    els.dictationAnswer.value = state.dictationAnswer;
    els.dictationAnswer.placeholder = segmentNumber === 2 ? "請輸入第二段默書句子" : "請輸入第一段默書句子";
    els.firstRow.value = String(state.firstRow);
    els.dictationDx.value = String(state.dictationCalibration.dx);
    els.dictationDy.value = String(state.dictationCalibration.dy);
    els.dictationScale.value = String(Math.round(state.dictationCalibration.scale * 100));
    els.dictationStyle.value = state.dictationStyle;
    els.dictationBaseEnabled.checked = state.dictationBaseEnabled;
    syncDictationStyleControls();
  }

  function getDictationConfig() {
    state.dictationAnswer = model.normalizeDictationAnswer(els.dictationAnswer.value);
    state.firstRow = numberInput(els.firstRow, 20, 1, 80);
    state.punctuation = model.autoPunctuation(state.dictationAnswer);
    syncDictationStyleControls();
    saveActiveDictationSegment();
    return { answer: state.dictationAnswer, firstRow: state.firstRow, punctuation: state.punctuation,
      segment: state.dictationSegment };
  }

  function switchDictationSegment(segmentNumber) {
    getDictationConfig();
    restoreDictationSegment(segmentNumber === 2 ? 2 : 1);
    renderCurrentMode();
  }

  function activeLegacyScoreStats(page) {
    var record = model.dictationRecord(page, model.dictationCharacters(state.dictationAnswer).length, state.punctuation);
    return record ? { wrong: record.circles.length, extra: 0, miss: record.miss.length, legacyN: record.N } :
      { wrong: 0, extra: 0, miss: 0, legacyN: 0 };
  }

  function dictationScoreRecordForPage(pageNumber) {
    if (state.dictationStyle === "sentence") {
      var page = state.dictationPages[pageNumber] || model.blankDictationV4Page(state.dictationAnswer);
      return model.dictationV4Record(page, state.dictationAnswer, state.dictationBaseEnabled);
    }
    var legacy = state.legacyDictationPages[pageNumber] || model.blankDictationPage();
    var compatible = model.blankDictationV4Page(state.dictationAnswer);
    compatible.studentId = legacy.studentId;
    compatible.reviewStatus = legacy.reviewStatus;
    compatible.baseOverride = legacy.baseOverride;
    compatible.overrides = legacy.overrides;
    var score = model.dictationV4Record(compatible, state.dictationAnswer, state.dictationBaseEnabled,
      activeLegacyScoreStats(legacy));
    score.page = legacy;
    return score;
  }

  function currentDictationScoreRecord() {
    return dictationScoreRecordForPage(state.currentPage);
  }

  function renderDictationStats() {
    var result = currentDictationScoreRecord();
    els.dictationScore.textContent = result.reviewed ? result.finalScore.toFixed(1) : "—";
    els.dictationAutoScore.textContent = result.reviewed ? result.autoFinalScore.toFixed(1) : "—";
    els.dictationDeduction.textContent = result.reviewed ? String(result.N) : "—";
    els.dictationStickyScore.textContent = els.dictationScore.textContent;
    els.dictationStickyDeduction.textContent = els.dictationDeduction.textContent;
    els.dictationPageStatus.textContent = result.reviewed ? "已批改" : "未批改";
    els.dictationPageStatus.dataset.manual = result.manualAdjusted ? "true" : "false";
    els.dictationStudentId.value = result.studentId || "";
    els.dictationManualBadge.hidden = !result.manualAdjusted;
    els.dictationPageBase.value = result.page.baseOverride == null ? "inherit" : result.page.baseOverride ? "on" : "off";
    els.overrideWrong.value = result.page.overrides.wrong == null ? "" : String(result.page.overrides.wrong);
    els.overrideExtra.value = result.page.overrides.extra == null ? "" : String(result.page.overrides.extra);
    els.overrideMiss.value = result.page.overrides.miss == null ? "" : String(result.page.overrides.miss);
    els.overrideScore.value = result.page.overrides.finalScore == null ? "" : String(result.page.overrides.finalScore);
    els.undoDictation.disabled = state.dictationUndo.length === 0;
  }

  function renderAnswerReview() {
    var page = dictationPageRecord();
    var chars = model.dictationCharacters(state.dictationAnswer);
    els.answerReview.replaceChildren();
    chars.forEach(function (character, index) {
      if (model.PUNCTUATION.indexOf(character) >= 0) {
        var punctuation = document.createElement("span");
        punctuation.className = "dictation-answer-punct";
        punctuation.textContent = character;
        els.answerReview.appendChild(punctuation);
        return;
      }
      var button = document.createElement("button");
      var status = page.answerStates[index] || "normal";
      button.type = "button"; button.className = "dictation-answer-char";
      button.dataset.index = String(index); button.setAttribute("aria-pressed", status === "normal" ? "false" : "true");
      button.setAttribute("aria-label", character + (status === "wrong" ? "，錯字" : status === "miss" ? "，漏字" : "，正確"));
      if (status === "wrong") button.classList.add("is-wrong");
      if (status === "miss") button.classList.add("is-miss");
      button.textContent = character;
      if (status === "miss") {
        var tag = document.createElement("span"); tag.className = "miss-tag"; tag.textContent = "漏";
        button.appendChild(tag);
      }
      els.answerReview.appendChild(button);
    });
  }

  function renderDictationGrid() {
    var config = getDictationConfig();
    var record = legacyDictationPageRecord();
    var chars = model.dictationCharacters(config.answer);
    els.dictationGrid.replaceChildren();
    chars.forEach(function (character, index) {
      var button = document.createElement("button"); button.type = "button";
      button.className = "dictation-cell"; button.dataset.index = String(index);
      button.textContent = (index + 1) + " · " + character;
      var punct = config.punctuation.indexOf(index) !== -1;
      if (record.circles.indexOf(index) !== -1) button.classList.add("is-circled");
      if (record.arrows.indexOf(index) !== -1) button.classList.add("is-arrow");
      if (record.miss.indexOf(index) !== -1) button.classList.add("is-miss");
      if (punct && (state.activeMark === "circle" || state.activeMark === "miss")) button.disabled = true;
      button.setAttribute("aria-label", "第 " + (index + 1) + " 格 " + character + (punct ? "，標點" : ""));
      els.dictationGrid.append(button);
    });
  }

  function dictationLayoutFor(rendered, page) {
    var params = templates.dictationParams(state.template);
    var fitted = geometry.fitDictationGrid(rendered.data, rendered.viewport.width, rendered.viewport.height,
      state.dictationSegment, params);
    var layout = geometry.dictationLayout(rendered.viewport.width, rendered.viewport.height,
      model.dictationCharacters(state.dictationAnswer).length, state.firstRow, state.dictationCalibration,
      fitted, params, state.dictationSegment);
    return { fitted: fitted, layout: layout, params: params, page: page };
  }

  function renderSurfaceMarks(layer, marks) {
    (marks || []).forEach(function (mark) {
      var item = document.createElement("span");
      item.className = "surface-mark" + (mark.type === "arrow" ? " is-arrow" : " is-circle");
      item.style.left = (mark.x * 100) + "%"; item.style.top = (mark.y * 100) + "%";
      item.setAttribute("aria-hidden", "true");
      item.textContent = mark.type === "arrow" ? "↑" : "";
      if (mark.type !== "arrow") {
        var tag = document.createElement("span"); tag.className = "surface-mark-tag";
        tag.textContent = mark.type === "extraCircle" ? "多" : "錯";
        item.appendChild(tag);
      }
      layer.appendChild(item);
    });
  }

  async function renderSentenceDictationPage(token) {
    var record = dictationPageRecord();
    renderAnswerReview();
    if (!state.pdfDoc) {
      els.dictationStage.textContent = "選擇 PDF 後，掃描頁會顯示在這裏。";
      return;
    }
    var page = await state.pdfDoc.getPage(state.currentPage);
    var base = page.getViewport({ scale: 1 });
    var width = Math.max(1, Math.min(1050, els.dictationStage.clientWidth || 900));
    var rendered = await renderPdfToCanvas(state.currentPage, width / base.width);
    if (token !== state.renderToken) return;
    var frame = document.createElement("div"); frame.className = "pdf-page-frame";
    rendered.canvas.style.width = "100%"; rendered.canvas.style.height = "auto";
    var overlay = document.createElement("div"); overlay.className = "pdf-overlay";
    var hit = document.createElement("button"); hit.type = "button";
    hit.className = "surface-hit-area"; hit.setAttribute("aria-label", "在頁面目前位置放置默書標記");
    var layer = document.createElement("div"); layer.className = "surface-marks";
    renderSurfaceMarks(layer, record.surfaceMarks);
    overlay.append(hit, layer); frame.append(rendered.canvas, overlay);
    els.dictationNote.textContent = "新模式不需格位校準；在卷面任何位置點擊放置所選標記，再點同一標記可移除。";
    els.dictationStage.replaceChildren(frame);
  }

  async function renderLegacyDictationPage(token) {
    renderDictationGrid();
    if (!state.pdfDoc) {
      els.dictationStage.textContent = "選擇 PDF 後，掃描頁會顯示在這裏。";
      return;
    }
    var page = await state.pdfDoc.getPage(state.currentPage);
    var base = page.getViewport({ scale: 1 });
    var width = Math.max(1, Math.min(1050, els.dictationStage.clientWidth || 900));
    var rendered = await renderPdfToCanvas(state.currentPage, width / base.width);
    if (token !== state.renderToken) return;
    var record = legacyDictationPageRecord();
    var info = dictationLayoutFor(rendered, page);
    if (!state.dictationAnswer.length) {
      els.dictationNote.textContent = "請輸入答案句；舊版格位模式會按印刷格線定位，可用滑桿微調。";
    } else if (info.fitted && model.dictationCharacters(state.dictationAnswer).length !== info.layout.availableCellCount) {
      els.dictationNote.textContent = "答案 " + model.dictationCharacters(state.dictationAnswer).length + " 字，印刷方格 " +
        info.layout.availableCellCount + " 格；只把前 " + Math.min(model.dictationCharacters(state.dictationAnswer).length,
          info.layout.availableCellCount) + " 字放進格位。請核對字數。";
    } else {
      els.dictationNote.textContent = info.fitted ? "已按印刷格線定位；如需微調，可使用校準滑桿。" :
        "未能確認印刷格線，使用後備格數及校準滑桿。";
    }
    var frame = document.createElement("div"); frame.className = "pdf-page-frame";
    rendered.canvas.style.width = "100%"; rendered.canvas.style.height = "auto";
    var overlay = document.createElement("div"); overlay.className = "pdf-overlay";
    info.layout.cells.forEach(function (box, index) {
      var hit = document.createElement("button"); hit.type = "button"; hit.className = "dictation-hit";
      hit.style.left = ((box.x + box.w / 2) / info.layout.pageWidth * 100) + "%";
      hit.style.top = ((box.y + box.h / 2) / info.layout.pageHeight * 100) + "%";
      hit.style.width = (box.w / info.layout.pageWidth * 100) + "%";
      hit.style.height = (box.h / info.layout.pageHeight * 100) + "%";
      hit.dataset.index = String(index);
      var punct = state.punctuation.indexOf(index) !== -1;
      if (record.circles.indexOf(index) !== -1) hit.classList.add("is-circled");
      if (record.arrows.indexOf(index) !== -1) hit.classList.add("is-arrow");
      if (record.miss.indexOf(index) !== -1) hit.classList.add("is-miss");
      if (punct && (state.activeMark === "circle" || state.activeMark === "miss")) hit.disabled = true;
      hit.setAttribute("aria-label", "默書第 " + (index + 1) + " 格" + (punct ? "，標點" : ""));
      overlay.append(hit);
    });
    frame.append(rendered.canvas, overlay);
    els.dictationStage.replaceChildren(frame);
  }

  async function renderDictationPage() {
    var token = ++state.renderToken;
    getDictationConfig();
    syncDictationStyleControls();
    renderDictationStats();
    if (state.dictationStyle === "sentence") await renderSentenceDictationPage(token);
    else await renderLegacyDictationPage(token);
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
      var blankPages = {}; var blankLegacyPages = {};
      for (var i = 1; i <= state.pageCount; i += 1) {
        blankPages[i] = model.blankDictationV4Page(DEFAULT_DICTATION_ANSWER);
        blankLegacyPages[i] = model.blankDictationPage();
      }
      state.dictationSegments = {
        "1": { answer: DEFAULT_DICTATION_ANSWER, firstRow: 20,
          calibration: { dx: 0, dy: 0, scale: 1 }, pages: blankPages, legacyPages: blankLegacyPages },
        "2": { answer: "", firstRow: 20, calibration: { dx: 0, dy: 0, scale: 1 },
          pages: {}, legacyPages: {} }
      };
      state.dictationStyle = "sentence"; state.activeMark = "wrongCircle"; state.dictationBaseEnabled = false; state.dictationUndo = [];
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

  function buildChoiceCsv() {
    var settings = choiceSettings();
    if (!settings.valid) throw new Error(settings.message || "請先輸入完整答案。");
    return model.buildChoiceCsv({ pages: state.choicePages, pageCount: state.pageCount, settings: settings });
  }

  function buildDictationCsv() {
    var config = getDictationConfig();
    var records = {};
    for (var pageNo = 1; pageNo <= state.pageCount; pageNo += 1) {
      records[pageNo] = dictationScoreRecordForPage(pageNo);
    }
    return model.buildDictationCsv(records, state.pageCount, config.segment);
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
        settings: { answer: model.normalizeDictationAnswer(String(segment.answer || "")), firstRow: segment.firstRow || 20,
          calibration: Object.assign({ dx: 0, dy: 0, scale: 1 }, segment.calibration || {}) },
        pages: segment.pages || {}, legacyPages: segment.legacyPages || {}
      };
    });
    return {
      version: 4, mode: "dictation", templateId: state.template.id, pdfFingerprint: state.pdfFingerprint, pageCount: state.pageCount,
      dictationMode: state.dictationStyle, baseEnabled: state.dictationBaseEnabled,
      selectedSegment: config.segment, "段落": config.segment, segments: segments,
      settings: { answer: config.answer, firstRow: config.firstRow,
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

  async function legacyArrowPositions(progress) {
    var sources = {};
    if (progress.version === 1) {
      sources["1"] = { settings: progress.settings || {}, pages: progress.pages || {} };
      sources["2"] = { settings: { answer: "", firstRow: 20 }, pages: {} };
    } else {
      [1, 2].forEach(function (segmentNumber) {
        sources[String(segmentNumber)] = progress.segments && progress.segments[String(segmentNumber)] ||
          { settings: { answer: "", firstRow: 20 }, pages: {} };
      });
    }
    var positions = {};
    for (var segmentNumber = 1; segmentNumber <= 2; segmentNumber += 1) {
      var key = String(segmentNumber); var segment = sources[key] || {}; var settings = segment.settings || {};
      var rawPages = segment.pages || {}; var pagesWithArrows = Object.keys(rawPages).filter(function (pageNo) {
        return rawPages[pageNo] && Array.isArray(rawPages[pageNo].arrows) && rawPages[pageNo].arrows.length;
      });
      if (!pagesWithArrows.length) { positions[key] = {}; continue; }
      var answer = String(settings.answer || "");
      var firstRow = Math.max(1, Math.min(80, Number(settings.firstRow) || 20));
      var calibration = settings.calibration || { dx: 0, dy: 0, scale: 1 };
      positions[key] = {};
      for (var arrowPageIndex = 0; arrowPageIndex < pagesWithArrows.length; arrowPageIndex += 1) {
        var pageNumber = Number(pagesWithArrows[arrowPageIndex]);
        if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > state.pageCount) continue;
        var pdfPage = await state.pdfDoc.getPage(pageNumber);
        var base = pdfPage.getViewport({ scale: 1 });
        var rendered = await renderPdfToCanvas(pageNumber, 1);
        var params = templates.dictationParams(state.template);
        var fitted = geometry.fitDictationGrid(rendered.data, base.width, base.height, segmentNumber, params);
        var layout = geometry.dictationLayout(base.width, base.height, answer.length,
          firstRow, calibration, fitted, params, segmentNumber);
        positions[key][pageNumber] = {};
        rawPages[pageNumber].arrows.forEach(function (oldIndex) {
          var cell = Number.isInteger(oldIndex) && layout.cells[oldIndex];
          if (!cell) return;
          positions[key][pageNumber][oldIndex] = {
            x: (cell.x + cell.w / 2) / layout.pageWidth,
            y: (cell.y + cell.h / 2) / layout.pageHeight
          };
        });
      }
    }
    return positions;
  }

  async function applyProgress(data) {
    var checked = model.sanitizeProgress(data);
    if (!checked.ok) throw new Error(checked.message);
    var original = checked.value;
    if (original.pdfFingerprint !== state.pdfFingerprint || original.pageCount !== state.pageCount) {
      throw new Error("進度 JSON 與目前 PDF 不相符；請先選回建立進度時使用的 PDF。");
    }
    var targetTemplate = original.version >= 3 ? findTemplateById(original.templateId) :
      templates.BUILTIN_TEMPLATES.find(function (definition) { return definition.kind === original.mode; });
    if (!targetTemplate) throw new Error("進度檔使用的自訂範本未在本機找到；請先匯入該範本 JSON。");
    if (targetTemplate.kind !== original.mode) throw new Error("進度檔的範本類型與批改模式不相符。");
    state.templateId = targetTemplate.id; state.template = targetTemplate; state.mode = targetTemplate.kind;
    configureTemplateMode();
    if (original.mode === "choice") {
      var settings = original.settings || {};
      els.mcCount.value = String(settings.mcCount == null ? 60 : settings.mcCount); els.tfCount.value = String(settings.tfCount == null ? 10 : settings.tfCount);
      els.mcKey.value = String(settings.mcAnswer || ""); els.tfKey.value = String(settings.tfAnswer || "");
      els.mcPoints.value = String(settings.mcPoints || "1"); els.tfPoints.value = String(settings.tfPoints || "1");
      state.choicePages = {};
      Object.keys(original.pages).forEach(function (key) {
        if (/^\d+$/.test(key) && Number(key) <= state.pageCount) state.choicePages[Number(key)] = cleanChoicePage(original.pages[key]);
      });
      refreshChoiceIdentityWarnings();
      state.mode = "choice";
      setStatus("已載入進度 JSON（不包含 PDF）。", els.exportStatus);
      renderCurrentMode(); updateControls();
      return;
    }

    var value = original;
    var dropped = 0; var migrated = false;
    if (original.version < 4) {
      var positions = await legacyArrowPositions(original);
      var conversion = model.migrateLegacyDictationProgress(original, positions);
      value = conversion.value; dropped += conversion.dropped; migrated = true;
    }
    state.dictationStyle = value.dictationMode === "grid" ? "grid" : "sentence";
    state.activeMark = state.dictationStyle === "grid" ? "circle" : "wrongCircle";
    state.dictationBaseEnabled = Boolean(value.baseEnabled);
    els.dictationBaseEnabled.checked = state.dictationBaseEnabled;
    state.dictationUndo = [];
    state.dictationSegments = {};
    [1, 2].forEach(function (segmentNumber) {
      var key = String(segmentNumber); var sourceSegment = value.segments && value.segments[key] || {};
      var settings = sourceSegment.settings || {};
      var answer = model.normalizeDictationAnswer(settings.answer || "");
      var cleanPages = model.sanitizeDictationV4Pages(sourceSegment.pages || {}, state.pageCount, answer);
      var cleanLegacy = model.sanitizeLegacyDictationPages(sourceSegment.legacyPages || {}, state.pageCount,
        model.dictationCharacters(answer).length, model.autoPunctuation(answer));
      dropped += cleanPages.dropped + cleanLegacy.dropped;
      for (var pageNo = 1; pageNo <= state.pageCount; pageNo += 1) {
        if (!cleanPages.pages[pageNo]) cleanPages.pages[pageNo] = model.blankDictationV4Page(answer);
        if (!cleanLegacy.pages[pageNo]) cleanLegacy.pages[pageNo] = model.blankDictationPage();
      }
      var calibration = settings.calibration || {};
      state.dictationSegments[key] = {
        answer: answer, firstRow: Math.max(1, Math.min(80, Number(settings.firstRow) || 20)),
        calibration: { dx: Math.max(-200, Math.min(200, Number(calibration.dx) || 0)),
          dy: Math.max(-200, Math.min(200, Number(calibration.dy) || 0)),
          scale: Math.max(0.7, Math.min(1.4, Number(calibration.scale) || 1)) },
        pages: cleanPages.pages, legacyPages: cleanLegacy.pages
      };
    });
    var selectedSegment = Number(value.selectedSegment || value["段落"] || 1) === 2 ? 2 : 1;
    restoreDictationSegment(selectedSegment);
    state.mode = "dictation";
    var note = migrated ? "已由舊版進度轉換，請核對。" : "已載入進度 JSON（不包含 PDF）。";
    if (dropped) note += " 已丟棄 " + dropped + " 項無效或超出範圍的資料。";
    setStatus(note, els.exportStatus);
    renderCurrentMode(); updateControls();
  }

  async function exportCurrentPdf() {
    if (!state.pdfBytes) return;
    if (state.mode === "choice") {
      var choiceSettingsForExport = choiceSettings();
      if (!choiceSettingsForExport.valid) { setStatus(choiceSettingsForExport.message || "請先輸入答案。"); return; }
      if (!confirmChoiceExport(choiceSettingsForExport)) return;
    } else if (!confirmDictationExport()) {
      return;
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
        var scoreRecords = {};
        for (var pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
          scoreRecords[pageNumber] = dictationScoreRecordForPage(pageNumber);
        }
        bytes = await pdfExport.exportDictationPdf(state.pdfBytes, { answer: config.answer, firstRow: config.firstRow,
          style: state.dictationStyle, baseEnabled: state.dictationBaseEnabled,
          pages: state.dictationStyle === "sentence" ? state.dictationPages : state.legacyDictationPages,
          scoreRecords: scoreRecords,
          calibration: state.dictationCalibration, segment: config.segment,
          templateParams: templates.dictationParams(state.template) });
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
      await applyProgress(data);
    } catch (error) {
      setStatus(error && error.message ? error.message : "進度 JSON 無法載入。");
    }
  }

  function useSelectedTemplate() {
    var nextTemplate = templateById(state.templateId);
    if (state.template && state.template.id !== nextTemplate.id) {
      var hasChoiceWork = Object.keys(state.choicePages).length > 0;
      var hasDictationWork = hasDictationMarks(state.dictationPages) || hasDictationMarks(state.legacyDictationPages) || Object.keys(state.dictationSegments).some(function (key) {
        var segment = state.dictationSegments[key] || {};
        return hasDictationMarks(segment.pages) || hasDictationMarks(segment.legacyPages);
      });
      if (state.pdfDoc && (hasChoiceWork || hasDictationWork) &&
          !window.confirm("更換範本會清除目前 PDF 的批改記錄；PDF 本身仍會保留。要繼續嗎？")) {
        state.templateId = state.template.id; renderTemplateList(); updateStepper(); return;
      }
      state.choicePages = {}; state.dictationPages = {}; state.legacyDictationPages = {}; state.dictationSegments = {}; state.focusKey = "";
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
    state.choicePages = {}; state.dictationPages = {}; state.legacyDictationPages = {}; state.dictationSegments = {}; state.dictationUndo = []; state.focusKey = "";
    els.pdfFile.value = ""; els.fileStatus.textContent = "尚未載入 PDF"; els.pageCount.textContent = ""; els.fileDot.classList.remove("ready");
    els.omrStatus.textContent = "示範已結束；可選擇自己的本機 PDF。";
    renderCurrentMode(); setStep(1); updateControls(); updateStepper();
  }

  els.pdfFile.addEventListener("change", function () { loadPdf(els.pdfFile.files[0]); });
  els.clearPdf.addEventListener("click", function () {
    state.demo = false; els.demoBanner.hidden = true;
    state.pdfBytes = null; state.pdfDoc = null; state.pdfFingerprint = ""; state.pageCount = 0; state.currentPage = 1;
    state.choicePages = {}; state.dictationPages = {}; state.legacyDictationPages = {}; state.dictationSegments = {}; state.dictationUndo = []; state.dictationSegment = 1; state.focusKey = "";
    state.dictationAnswer = DEFAULT_DICTATION_ANSWER; state.firstRow = 20;
    state.punctuation = model.autoPunctuation(DEFAULT_DICTATION_ANSWER);
    state.dictationCalibration = { dx: 0, dy: 0, scale: 1 };
    els.dictationSegment.value = "1"; els.dictationAnswer.value = DEFAULT_DICTATION_ANSWER;
    els.dictationAnswer.placeholder = "請輸入第一段默書句子";
    els.firstRow.value = "20"; state.dictationStyle = "sentence"; state.activeMark = "wrongCircle"; state.dictationBaseEnabled = false;
    state.dictationUndo = []; els.dictationStyle.value = "sentence"; els.dictationBaseEnabled.checked = false;
    els.dictationDx.value = "0"; els.dictationDy.value = "0"; els.dictationScale.value = "100"; els.pdfFile.value = "";
    els.fileStatus.textContent = "尚未載入 PDF"; els.pageCount.textContent = ""; els.fileDot.classList.remove("ready");
    els.omrStatus.textContent = "讀圈會比較同題選項深淺，模糊答案及班別／學號會標示覆核。";
    setStep(2); renderCurrentMode(); updateControls(); updateStepper();
  });
  els.readOmr.addEventListener("click", function () { readAllPages(); });
  els.startDictation.addEventListener("click", function () { if (state.pdfDoc) { setStep(3); renderCurrentMode(); } });
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
  function pushDictationUndo() {
    saveActiveDictationSegment();
    var sentenceMode = state.dictationStyle === "sentence";
    var page = sentenceMode ? dictationPageRecord() : legacyDictationPageRecord();
    state.dictationUndo.push({ segment: state.dictationSegment, pageNumber: state.currentPage,
      style: sentenceMode ? "sentence" : "grid", page: JSON.parse(JSON.stringify(page)) });
    if (state.dictationUndo.length > 100) state.dictationUndo.shift();
  }

  function undoDictation() {
    var snapshot = state.dictationUndo.pop();
    if (!snapshot) return;
    var segment = state.dictationSegments[String(snapshot.segment)] || {};
    var key = snapshot.style === "sentence" ? "pages" : "legacyPages";
    var pages = segment[key] || {};
    pages[snapshot.pageNumber] = snapshot.page;
    segment[key] = pages;
    state.dictationSegments[String(snapshot.segment)] = segment;
    if (snapshot.segment === state.dictationSegment) {
      if (snapshot.style === "sentence") state.dictationPages = pages;
      else state.legacyDictationPages = pages;
    }
    renderCurrentMode();
  }

  function activeMutableDictationPage() {
    return state.dictationStyle === "sentence" ? dictationPageRecord() : legacyDictationPageRecord();
  }

  function saveActiveMutableDictationPage(page) {
    if (state.dictationStyle === "sentence") state.dictationPages[state.currentPage] = page;
    else state.legacyDictationPages[state.currentPage] = page;
    saveActiveDictationSegment();
  }

  function updateDictationOverride(name, value) {
    var page = activeMutableDictationPage();
    var answerLength = model.dictationWordCount(state.dictationAnswer);
    var maximum = name === "extra" ? 1000 : answerLength;
    if (value != null) {
      var valid = name === "finalScore"
        ? Number.isFinite(value) && value >= 0 && value <= 10 && Number.isInteger(value * 2)
        : Number.isInteger(value) && value >= 0 && value <= maximum;
      if (!valid) {
        setStatus(name === "finalScore" ? "最終分須為 0 至 10，並以 0.5 為步長。" :
          "人手調整數目須為 0 至 " + maximum + " 的整數。", els.exportStatus); return;
      }
    }
    pushDictationUndo();
    page.overrides[name] = value;
    page.reviewStatus = "reviewed";
    saveActiveMutableDictationPage(page);
    renderCurrentMode();
  }

  function handleOverrideInput(name, input) {
    var text = input.value.trim();
    if (!text) { updateDictationOverride(name, null); return; }
    var value = Number(text);
    if (name === "finalScore") {
      if (!Number.isFinite(value) || value < 0 || value > 10 || !Number.isInteger(value * 2)) {
        setStatus("最終分須為 0 至 10，並以 0.5 為步長。", els.exportStatus); return;
      }
    } else if (!Number.isInteger(value)) {
      setStatus("人手調整數目須為整數。", els.exportStatus); return;
    }
    updateDictationOverride(name, value);
  }

  els.dictationAnswer.addEventListener("focus", function () {
    state.dictationAnswerEditOriginal = { answer: state.dictationAnswer };
  });
  els.dictationAnswer.addEventListener("input", function () { getDictationConfig(); renderCurrentMode(); });
  els.dictationAnswer.addEventListener("change", finishDictationAnswerEdit);
  els.firstRow.addEventListener("input", function () { getDictationConfig(); renderCurrentMode(); });
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
  els.dictationStyle.addEventListener("change", function () {
    state.dictationStyle = els.dictationStyle.value === "grid" ? "grid" : "sentence";
    state.activeMark = state.dictationStyle === "sentence" ? "wrongCircle" : "circle";
    syncDictationStyleControls(); renderCurrentMode();
  });
  els.dictationBaseEnabled.addEventListener("change", function () {
    state.dictationBaseEnabled = Boolean(els.dictationBaseEnabled.checked);
    saveActiveDictationSegment(); renderDictationStats(); updateStepper();
  });
  els.undoDictation.addEventListener("click", undoDictation);
  els.markDictationPerfect.addEventListener("click", function () {
    pushDictationUndo();
    var page = activeMutableDictationPage();
    if (state.dictationStyle === "sentence") {
      page.answerStates = page.answerStates.map(function () { return "normal"; });
      page.surfaceMarks = [];
    } else {
      page.circles = []; page.arrows = []; page.miss = [];
    }
    page.reviewStatus = "reviewed";
    page.overrides = { wrong: null, extra: null, miss: null, finalScore: null };
    saveActiveMutableDictationPage(page); renderCurrentMode();
  });
  els.dictationPageBase.addEventListener("change", function () {
    pushDictationUndo();
    var page = activeMutableDictationPage();
    page.baseOverride = els.dictationPageBase.value === "on" ? true : els.dictationPageBase.value === "off" ? false : null;
    page.reviewStatus = "reviewed";
    saveActiveMutableDictationPage(page); renderCurrentMode();
  });
  [["wrong", els.overrideWrong], ["extra", els.overrideExtra], ["miss", els.overrideMiss], ["finalScore", els.overrideScore]]
    .forEach(function (entry) { entry[1].addEventListener("change", function () { handleOverrideInput(entry[0], entry[1]); }); });
  els.manualAdjustGrid = document.querySelector(".manual-adjust-grid");
  els.manualAdjustGrid.addEventListener("click", function (event) {
    var button = event.target.closest("[data-count-delta]");
    if (!button) return;
    var parts = button.dataset.countDelta.split(":"); var name = parts[0]; var delta = Number(parts[1]);
    var record = currentDictationScoreRecord();
    updateDictationOverride(name, Math.max(0, Number(record.counts[name] || 0) + delta));
  });
  els.restoreDictationAuto.addEventListener("click", function () {
    pushDictationUndo();
    var page = activeMutableDictationPage();
    page.overrides = { wrong: null, extra: null, miss: null, finalScore: null };
    page.baseOverride = null;
    saveActiveMutableDictationPage(page); renderCurrentMode();
  });
  document.querySelectorAll(".mode-mark").forEach(function (button) {
    button.addEventListener("click", function () {
      var toolbar = state.dictationStyle === "sentence" ? els.sentenceToolbar : els.gridToolbar;
      if (!toolbar.contains(button)) return;
      state.activeMark = button.dataset.mark;
      toolbar.querySelectorAll(".mode-mark").forEach(function (entry) {
        var active = entry === button; entry.classList.toggle("active", active); entry.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderDictationGrid(); renderDictationPage();
    });
  });
  function editDictationCell(index) {
    var config = getDictationConfig(); var record = legacyDictationPageRecord();
    var changed = model.toggleDictationMark(record, index, state.activeMark, config.punctuation);
    if (changed.blocked) { setStatus("標點不可圈或標成漏字；可使用箭嘴。", els.exportStatus); return; }
    pushDictationUndo();
    changed.page.reviewStatus = "reviewed";
    state.legacyDictationPages[state.currentPage] = changed.page;
    saveActiveDictationSegment(); renderCurrentMode();
  }
  function editSurfaceMark(clientX, clientY) {
    var frame = els.dictationStage.querySelector(".pdf-page-frame");
    if (!frame) return;
    var rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    var y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    pushDictationUndo();
    var changed = model.toggleSurfaceMark(dictationPageRecord(), state.activeMark, x, y, state.dictationAnswer);
    if (!changed.changed) { state.dictationUndo.pop(); return; }
    state.dictationPages[state.currentPage] = changed.page;
    saveActiveDictationSegment(); renderCurrentMode();
  }
  els.dictationStage.addEventListener("click", function (event) {
    if (state.dictationStyle === "sentence") {
      if (event.target.closest(".surface-hit-area")) editSurfaceMark(event.clientX, event.clientY);
    } else {
      var cell = event.target.closest(".dictation-hit"); if (cell && !cell.disabled) editDictationCell(Number(cell.dataset.index));
    }
  });
  els.dictationGrid.addEventListener("click", function (event) {
    var cell = event.target.closest(".dictation-cell"); if (cell && !cell.disabled) editDictationCell(Number(cell.dataset.index));
  });
  els.answerReview.addEventListener("click", function (event) {
    var button = event.target.closest(".dictation-answer-char");
    if (!button) return;
    pushDictationUndo();
    var changed = model.toggleAnswerState(dictationPageRecord(), Number(button.dataset.index), state.dictationAnswer);
    if (!changed.changed) { state.dictationUndo.pop(); return; }
    state.dictationPages[state.currentPage] = changed.page;
    saveActiveDictationSegment(); renderCurrentMode();
  });
  els.dictationStudentId.addEventListener("input", function () {
    var page = activeMutableDictationPage(); page.studentId = els.dictationStudentId.value;
    saveActiveMutableDictationPage(page);
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
