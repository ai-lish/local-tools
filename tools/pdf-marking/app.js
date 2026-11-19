(function () {
  "use strict";

  var model = window.PdfMarkingModel;
  var templates = window.PdfMarkingTemplates;
  var geometry = window.PdfMarkingGeometry;
  var omr = window.PdfMarkingOmr;
  var alignmentOverlay = window.PdfMarkingAlignmentOverlay;
  var pdfExport = window.PdfMarkingExport;
  var review = window.PdfMarkingReview;
  var aiReview = window.PdfMarkingAiReview;
  var templateStore = window.PdfMarkingTemplateStore;
  var choiceWizard = window.PdfMarkingChoiceWizard;
  var DEFAULT_DICTATION_ANSWER = "應當一無掛慮，只要凡事藉著禱告、祈求，和感謝，將你們所要的告訴神。";
  var ANSWER_KEY_EXCLUDED_FLAG = model.ANSWER_KEY_EXCLUDED_FLAG;
  var DEFAULT_TEMPLATE = templates.BUILTIN_TEMPLATES[0];
  var storedTemplateState = templateStore.load(window, templates);
  var customTemplates = storedTemplateState.templates;
  var preferredTemplateId = storedTemplateState.selectedTemplateId;
  var pendingColumnOrderTemplate = null;
  function findTemplateById(id) {
    return templates.BUILTIN_TEMPLATES.concat(customTemplates).find(function (definition) { return definition.id === id; }) || null;
  }
  var initialTemplate = findTemplateById(storedTemplateState.selectedTemplateId) || DEFAULT_TEMPLATE;
  var state = {
    mode: initialTemplate.kind, step: 1, templateId: initialTemplate.id, template: initialTemplate,
    choiceWizardActive: true, choiceWizardStage: 1,
    pdfBytes: null, pdfDoc: null, pdfFingerprint: "", pageCount: 0, currentPage: 1,
    choicePages: {}, dictationPages: {}, legacyDictationPages: {}, excludedAnswerPage: 0, activeMark: "wrongCircle", renderToken: 0,
    focusKey: "", demo: false,
    dictationSegment: 1, dictationSegments: {},
    dictationAnswer: DEFAULT_DICTATION_ANSWER, firstRow: 20, punctuation: model.autoPunctuation(DEFAULT_DICTATION_ANSWER),
    dictationCalibration: { dx: 0, dy: 0, scale: 1 }, dictationAnswerEditOriginal: null,
    dictationStyle: "sentence", dictationBaseEnabled: false, dictationUndo: [],
    exportSort: "class-student", choiceClassSizeTouched: false
  };
  var appealState = { pageNumber: 0, questionKey: "", questions: [], filteredQuestions: [], groups: [],
    filter: "all", groupKey: "", renderToken: 0, crop: null };
  var focusBrowseState = { active: false, pageNumber: 0, questionKey: "", returnPage: 0 };
  var appealClassOptionsKey = "";
  // API credentials and AI suggestions intentionally live outside serializable grading state.
  var aiMemory = { enabled: false, provider: "gemini", model: "gemini-3.8-flash", credential: "", busy: false };
  var aiChoiceResults = Object.create(null);
  var aiChoiceErrors = Object.create(null);
  var aiDictationResults = Object.create(null);
  var aiDictationErrors = Object.create(null);
  var aiIdentityResults = Object.create(null);
  var aiIdentityErrors = Object.create(null);
  var aiIdentityPendingConfirmation = Object.create(null);
  var byId = function (id) { return document.getElementById(id); };
  var els = {
    pdfFile: byId("pdf-file"), clearPdf: byId("clear-pdf"), fileStatus: byId("file-status"),
    fileDot: byId("file-dot"), pageCount: byId("page-count"), choiceMode: byId("choice-mode"),
    dictationMode: byId("dictation-mode"), choiceSettingsPanel: byId("choice-settings"),
    dictationSettingsPanel: byId("dictation-settings"), dictationEntry: byId("dictation-entry"), startDictation: byId("start-dictation"),
    step1: byId("step-1"), step2: byId("step-2"), step3: byId("step-3"), step1State: byId("step-1-state"),
    step2State: byId("step-2-state"), step3State: byId("step-3-state"), stepper: byId("legacy-stepper"),
    stepPills: Array.from(document.querySelectorAll(".step-pill[data-step]")),
    templateList: byId("template-list"), useTemplate: byId("use-template"), demoStart: byId("demo-start"),
    editTemplateLayout: byId("edit-template-layout"),
    templateStatus: byId("template-status"), selectedTemplateLabel: byId("selected-template-label"),
    templateOrderWarning: byId("template-order-warning"), templateOrderWarningText: byId("template-order-warning-text"),
    templateOrderRepair: byId("template-order-repair"),
    templateFile: byId("template-file"), exportTemplate: byId("export-template"), deleteTemplate: byId("delete-template"),
    demoBanner: byId("demo-banner"), endDemo: byId("end-demo"), reviewStepStatus: byId("review-step-status"),
    focusTitle: byId("focus-title"), focusReason: byId("focus-reason"), focusPreview: byId("focus-preview"),
    focusAnswerKeys: byId("focus-answer-keys"), focusConfirm: byId("focus-confirm"), focusProgress: byId("focus-progress"),
    focusPageReread: byId("focus-page-reread"), focusBrowseStart: byId("focus-browse-start"),
    focusBrowsePrev: byId("focus-browse-prev"), focusBrowseNext: byId("focus-browse-next"),
    focusBrowseReturn: byId("focus-browse-return"), focusInkStats: byId("focus-ink-stats"),
    mcCount: byId("mc-count"), tfCount: byId("tf-count"),
    mcKey: byId("mc-key"), tfKey: byId("tf-key"), mcPoints: byId("mc-points"), tfPoints: byId("tf-points"),
    readOmr: byId("read-omr"), omrStatus: byId("omr-status"), choicePage: byId("choice-page"),
    choicePrev: byId("choice-prev"), choiceNext: byId("choice-next"), choiceScore: byId("choice-score"),
    choiceReviews: byId("choice-reviews"), choiceAlignment: byId("choice-alignment"), choiceClass: byId("choice-class"),
    choiceStudentId: byId("choice-student-id"), choiceStage: byId("choice-stage"), reviewItems: byId("review-items"),
    pageFlags: byId("page-flags"), pageFlagsSummary: byId("page-flags-summary"),
    reviewQueueSummary: byId("review-queue-summary"), choiceIdentityReviewDetails: byId("choice-identity-review-details"),
    choiceIdentityReviewSummary: byId("choice-identity-review-summary"), choiceHandwritePending: byId("choice-handwrite-pending"),
    choiceHandwritePendingText: byId("choice-handwrite-pending-text"), choiceHandwriteNext: byId("choice-handwrite-next"),
    choiceIdentityReview: byId("choice-identity-review"),
    choiceIdentityReviewPages: byId("choice-identity-review-pages"), choiceIdentityReviewCrops: byId("choice-identity-review-crops"),
    choiceIdentityAiResults: byId("choice-identity-ai-results"),
    appealDetails: byId("choice-appeal-details"), appealClass: byId("appeal-class"), appealStudentId: byId("appeal-student-id"),
    appealSearch: byId("appeal-search"), appealPage: byId("appeal-page"), appealStatus: byId("appeal-status"),
    appealPageResults: byId("appeal-page-results"), appealQuestionList: byId("appeal-question-list"),
    appealQuestionDetail: byId("appeal-question-detail"), appealDetailTitle: byId("appeal-detail-title"),
    appealDetailStatus: byId("appeal-detail-status"), appealShowReadZones: byId("appeal-show-read-zones"),
    appealCropCanvas: byId("appeal-crop-canvas"), appealCropOverlay: byId("appeal-crop-overlay"),
    appealReadouts: byId("appeal-readouts"), appealReviewRecord: byId("appeal-review-record"),
    appealPrevQuestion: byId("appeal-prev-question"), appealNextQuestion: byId("appeal-next-question"),
    appealGroupSummary: byId("appeal-group-summary"), appealQuestionFilter: byId("appeal-question-filter"),
    appealQuestionPosition: byId("appeal-question-position"),
    dictationSegment: byId("dictation-segment"), dictationStyle: byId("dictation-style"),
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
    aiEnabled: byId("ai-review-enabled"), aiProvider: byId("ai-review-provider"), aiModel: byId("ai-review-model"),
    aiKey: byId("ai-review-key"), aiTest: byId("ai-review-test"), aiClearKey: byId("ai-review-clear-key"),
    aiStatus: byId("ai-review-status"), aiChoiceCurrent: byId("ai-review-choice-current"),
    aiChoiceAll: byId("ai-review-choice-all"), aiChoiceSuggestion: byId("ai-review-choice-suggestion"),
    aiIdentityActions: byId("ai-review-identity-actions"),
    aiIdentityCurrent: byId("ai-review-identity-current"), aiIdentityAll: byId("ai-review-identity-all"),
    aiIdentityConfirmation: byId("ai-identity-confirmation"), aiIdentityConfirmCounts: byId("ai-identity-confirm-counts"),
    aiIdentityConfirmPreviewSelect: byId("ai-identity-confirm-preview-select"), aiIdentityConfirmPreviewImage: byId("ai-identity-confirm-preview-image"),
    aiIdentityConfirmSend: byId("ai-identity-confirm-send"), aiIdentityConfirmCancel: byId("ai-identity-confirm-cancel"),
    aiDictationCurrent: byId("ai-review-dictation-current"), aiDictationAll: byId("ai-review-dictation-all"),
    aiDictationActions: byId("ai-review-dictation-actions"), aiDictationResult: byId("ai-review-dictation-result"),
    copyExportTsv: byId("copy-export-tsv"), exportXlsx: byId("export-xlsx"),
    exportPreviewHead: byId("export-preview-head"), exportPreviewBody: byId("export-preview-body"),
    exportPreviewTable: byId("export-preview-table"), exportPreviewNote: byId("export-preview-note"),
    exportSortClass: byId("export-sort-class"), exportSortPage: byId("export-sort-page"),
    choiceClassSizeField: byId("choice-class-size-field"), choiceClassSize: byId("choice-class-size"),
    copyChoiceRoster: byId("copy-choice-roster"), copyFallbackWrap: byId("copy-fallback-wrap"),
    copyFallback: byId("copy-fallback"), copyFallbackLabel: byId("copy-fallback-label"),
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

  function providerLabel(provider) {
    return provider === "minimax" ? "MiniMax" : "Google Gemini";
  }

  function defaultModel(provider) {
    return provider === "minimax" ? "MiniMax-M3.1-Flash" : "gemini-3.8-flash";
  }

  function validAiModel(value) {
    return /^[A-Za-z0-9._:-]{1,100}$/.test(String(value || "").trim());
  }

  function aiReady() {
    return aiMemory.enabled && Boolean(aiMemory.credential) && validAiModel(aiMemory.model);
  }

  function setAiStatus(message, isError) {
    els.aiStatus.textContent = message;
    els.aiStatus.classList.toggle("is-error", Boolean(isError));
  }

  function clearAiSuggestions() {
    aiChoiceResults = Object.create(null);
    aiChoiceErrors = Object.create(null);
    aiDictationResults = Object.create(null);
    aiDictationErrors = Object.create(null);
    aiIdentityResults = Object.create(null);
    aiIdentityErrors = Object.create(null);
    aiIdentityPendingConfirmation = Object.create(null);
    els.aiChoiceSuggestion.replaceChildren();
    els.aiChoiceSuggestion.hidden = true;
    els.aiDictationResult.replaceChildren();
    els.aiDictationResult.hidden = true;
    els.choiceIdentityAiResults.replaceChildren();
    els.aiIdentityConfirmation.hidden = true;
    els.aiIdentityConfirmPreviewImage.removeAttribute("src");
  }

  function hasIdentityAiZones() {
    var identity = state.template && state.template.identity;
    return Boolean(state.template && state.template.kind === "choice" && identity &&
      (Array.isArray(identity.fields) && identity.fields.some(function (field) { return field && ["class-grade", "class-form", "student-number"].indexOf(field.id) >= 0; }) ||
        Array.isArray(identity.masks) && identity.masks.some(function (mask) { return mask && ["class-handwrite", "student-handwrite"].indexOf(mask.type) >= 0; })));
  }

  function updateAiControls() {
    var choiceQueue = review.buildReviewQueue(state.choicePages, state.pageCount);
    var focused = choiceQueue.some(function (entry) { return entry.key === state.focusKey; });
    var dictationReady = Boolean(state.pdfDoc && state.mode === "dictation" && state.dictationStyle === "sentence" && state.dictationAnswer.length);
    var hasIdentityPage = Object.keys(state.choicePages).some(function (pageNumber) {
      return !isAnswerKeyExcludedPage(pageNumber);
    });
    var identityReady = Boolean(state.pdfDoc && state.mode === "choice" && hasIdentityPage && hasIdentityAiZones());
    els.aiChoiceCurrent.disabled = !aiReady() || aiMemory.busy || state.mode !== "choice" || !focused;
    els.aiChoiceAll.disabled = !aiReady() || aiMemory.busy || state.mode !== "choice" || !choiceQueue.length;
    els.aiIdentityCurrent.disabled = !aiReady() || aiMemory.busy || !identityReady || !state.choicePages[state.currentPage];
    els.aiIdentityAll.disabled = !aiReady() || aiMemory.busy || !identityReady;
    els.aiIdentityActions.hidden = state.mode !== "choice";
    els.aiDictationCurrent.disabled = !aiReady() || aiMemory.busy || !dictationReady;
    els.aiDictationAll.disabled = !aiReady() || aiMemory.busy || !dictationReady || !state.pageCount;
    els.aiDictationActions.hidden = state.dictationStyle !== "sentence";
    els.aiTest.disabled = !aiMemory.credential || !validAiModel(aiMemory.model) || aiMemory.busy;
    els.aiClearKey.disabled = !aiMemory.credential || aiMemory.busy;
    els.aiEnabled.disabled = aiMemory.busy;
    els.aiProvider.disabled = aiMemory.busy;
    els.aiModel.disabled = aiMemory.busy;
    els.aiKey.disabled = aiMemory.busy;
    els.pdfFile.disabled = aiMemory.busy;
    els.clearPdf.disabled = !state.pdfDoc || aiMemory.busy;
    els.startDictation.disabled = !state.pdfDoc || aiMemory.busy;
    els.readOmr.disabled = !state.pdfDoc || aiMemory.busy;
    els.choicePage.disabled = !state.pdfDoc || aiMemory.busy;
    els.dictationPage.disabled = !state.pdfDoc || aiMemory.busy;
    els.choicePrev.disabled = !state.pdfDoc || state.currentPage <= 1 || aiMemory.busy;
    els.dictationPrev.disabled = !state.pdfDoc || state.currentPage <= 1 || aiMemory.busy;
    els.choiceNext.disabled = !state.pdfDoc || state.currentPage >= state.pageCount || aiMemory.busy;
    els.dictationNext.disabled = !state.pdfDoc || state.currentPage >= state.pageCount || aiMemory.busy;
    els.dictationAnswer.disabled = aiMemory.busy;
    els.dictationSegment.disabled = aiMemory.busy;
    els.dictationStyle.disabled = aiMemory.busy;
    if (choiceWizardUI) choiceWizardUI.refreshAiSettings();
  }

  function aiFailureMessage(error) {
    var message = String(error && error.message || "");
    if (message.indexOf("身份區") >= 0 || message.indexOf("身份欄位") >= 0 || message.indexOf("身份區") >= 0) return message;
    return "無法安全產生裁切圖片，該項目未送出。";
  }

  function choiceFocusBounds(entry, sourceCanvas, viewport) {
    var expanded = geometry.expandChoiceTemplate(state.template, choiceSettings());
    var item = expanded.items.find(function (candidate) { return candidate.type === entry.type && candidate.number === entry.number; });
    if (!item) throw new Error("題目圈格位置未能確認，已停止送出。");
    var pageRecord = state.choicePages[entry.pageNumber];
    var centers = item.choices.map(function (bubble, index) {
      return geometry.mapBubble(bubble, viewport.width, viewport.height, pageRecord.calibration,
        entry.question.localOffsets && entry.question.localOffsets[index]);
    });
    return review.focusCropBounds(centers, viewport.width * expanded.params.radius, sourceCanvas.width, sourceCanvas.height);
  }

  async function makeChoiceAiImage(entry) {
    var pdfPage = await state.pdfDoc.getPage(entry.pageNumber);
    var base = pdfPage.getViewport({ scale: 1 });
    var rendered = await renderPdfToCanvas(entry.pageNumber, Math.min(1.65, 940 / base.width));
    var bounds = choiceFocusBounds(entry, rendered.canvas, rendered.viewport);
    return aiReview.createDeidentifiedCrop(rendered.canvas, bounds, state.template, {
      templates: templates, geometry: geometry,
      calibration: state.choicePages[entry.pageNumber].calibration
    });
  }

  async function makeDictationAiImage(pageNumber, segmentNumber) {
    var pdfPage = await state.pdfDoc.getPage(pageNumber);
    var base = pdfPage.getViewport({ scale: 1 });
    var rendered = await renderPdfToCanvas(pageNumber, Math.min(1.55, 940 / base.width));
    var params = templates.dictationParams(state.template);
    var segment = params.segments.find(function (entry) { return entry.id === segmentNumber; });
    if (!segment || !params.grid || !Array.isArray(params.grid.scan.x)) {
      throw new Error("默書作答區未能確認，已停止送出。");
    }
    var bounds = {
      left: params.grid.scan.x[0] * rendered.canvas.width,
      top: segment.band[0] * rendered.canvas.height,
      right: params.grid.scan.x[1] * rendered.canvas.width,
      bottom: segment.band[1] * rendered.canvas.height
    };
    return aiReview.createDeidentifiedCrop(rendered.canvas, bounds, state.template, {
      templates: templates, geometry: geometry
    });
  }

  function aiConfirmation(count) {
    return window.confirm("即將以 " + providerLabel(aiMemory.provider) + " 送出 " + count + " 張去識別裁切圖。\n只含裁切圖、不含姓名／班別／學號。\n按「取消」會取消整批；繼續即會把裁切圖傳往所選服務。\n是否繼續？");
  }

  function confirmIdentityBatch(prepared) {
    var gridCount = prepared.filter(function (item) { return item.entry.source === "grid"; }).length;
    var handwriteCount = prepared.filter(function (item) { return item.entry.source === "handwriting"; }).length;
    var select = els.aiIdentityConfirmPreviewSelect;
    select.replaceChildren();
    prepared.forEach(function (item, index) {
      var option = document.createElement("option"); option.value = String(index);
      option.textContent = item.entry.label; select.append(option);
    });
    els.aiIdentityConfirmCounts.textContent = "選擇題裁切 0 張；身份圈格裁切 " + gridCount +
      " 張（只含圈格，不含姓名）；手寫班別／班號裁切 " + handwriteCount + " 張（只含指定手寫區，不含姓名、科目、學校或其他文字區）。";
    function showPreview() {
      var selected = prepared[Number(select.value)] || prepared[0];
      if (selected && selected.image && selected.image.dataUrl) els.aiIdentityConfirmPreviewImage.src = selected.image.dataUrl;
      else els.aiIdentityConfirmPreviewImage.removeAttribute("src");
      els.aiIdentityConfirmPreviewImage.alt = selected ? "第 " + selected.entry.pageNumber + " 頁「" + selected.entry.label + "」身份核對裁切預覽" : "身份核對裁切預覽";
    }
    showPreview();
    els.aiIdentityConfirmation.hidden = false;
    return new Promise(function (resolve) {
      function finish(confirmed) {
        els.aiIdentityConfirmation.hidden = true;
        els.aiIdentityConfirmPreviewImage.removeAttribute("src");
        select.replaceChildren();
        els.aiIdentityConfirmSend.removeEventListener("click", onConfirm);
        els.aiIdentityConfirmCancel.removeEventListener("click", onCancel);
        select.removeEventListener("change", showPreview);
        resolve(confirmed);
      }
      function onConfirm() { finish(true); }
      function onCancel() { finish(false); }
      els.aiIdentityConfirmSend.addEventListener("click", onConfirm);
      els.aiIdentityConfirmCancel.addEventListener("click", onCancel);
      select.addEventListener("change", showPreview);
    });
  }

  async function runPreparedAiBatch(task, entries, prepareImage, onSuccess, errorMap, errorKey) {
    if (!aiReady() || aiMemory.busy) {
      setAiStatus("請先開啟 AI 覆核並輸入有效 API key 及模型名稱。", true);
      return;
    }
    aiMemory.busy = true;
    updateAiControls();
    setAiStatus("正在本機檢查及裁切圖片；尚未送出。", false);
    var prepared = [];
    var failed = 0;
    for (var index = 0; index < entries.length; index += 1) {
      var entry = entries[index];
      try {
        prepared.push({ entry: entry, image: await prepareImage(entry) });
      } catch (error) {
        errorMap[errorKey(entry)] = aiFailureMessage(error);
        failed += 1;
      }
    }
    if (!prepared.length) {
      aiMemory.busy = false;
      setAiStatus("沒有安全裁切圖可送出；" + failed + " 項已略過。", true);
      updateAiControls();
      renderCurrentMode();
      return;
    }
    var confirmed = task === "identity" ? await confirmIdentityBatch(prepared) : aiConfirmation(prepared.length);
    if (!confirmed) {
      aiMemory.busy = false;
      prepared.forEach(function (item) { item.image.dataUrl = ""; });
      setAiStatus("已取消；沒有送出圖片。", false);
      updateAiControls();
      renderCurrentMode();
      return;
    }
    setAiStatus("正在送出 0／" + prepared.length + " 張裁切圖；最多同時處理 2 張。", false);
    var next = 0;
    var completed = 0;
    var succeeded = 0;
    async function worker() {
      while (next < prepared.length) {
        var current = prepared[next++];
        try {
          var allowed = task === "choice" ? current.entry.options : undefined;
          var result;
          var attempts = task === "identity" ? 2 : 1;
          for (var attempt = 0; attempt < attempts; attempt += 1) {
            result = await aiReview.request(aiMemory.provider, aiMemory.model, aiMemory.credential,
              task, current.image, allowed, undefined, task === "identity" ? current.entry.identityContext : undefined);
            if (result.ok || attempt + 1 >= attempts) break;
          }
          if (result.ok) {
            await onSuccess(current.entry, result);
            delete errorMap[errorKey(current.entry)];
            succeeded += 1;
          } else {
            errorMap[errorKey(current.entry)] = result.message || "AI 覆核失敗。";
            failed += 1;
          }
        } catch (error) {
          errorMap[errorKey(current.entry)] = "AI 覆核未能處理此項，請稍後再試。";
          failed += 1;
        } finally {
          current.image.dataUrl = "";
          completed += 1;
          setAiStatus("已處理 " + completed + "／" + prepared.length + " 張；成功 " + succeeded + "，失敗或略過 " + failed + "。", false);
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(2, prepared.length) }, worker));
      setAiStatus("AI 覆核完成：成功 " + succeeded + " 張，失敗或略過 " + failed + "。請逐項核對建議。", failed > 0);
    } finally {
      aiMemory.busy = false;
      updateAiControls();
      renderCurrentMode();
    }
  }

  async function testAiConnection() {
    if (!aiMemory.credential || !validAiModel(aiMemory.model) || aiMemory.busy) {
      setAiStatus("請輸入 API key 及有效模型名稱。", true);
      return;
    }
    if (!window.confirm("連線測試只會送出一張程式即時產生的空白合成圖，不會使用 PDF 或學生資料。繼續？")) {
      setAiStatus("已取消連線測試；沒有送出圖片。", false);
      return;
    }
    aiMemory.busy = true;
    updateAiControls();
    try {
      var blank = document.createElement("canvas");
      blank.width = 64; blank.height = 64;
      var context = blank.getContext("2d");
      context.fillStyle = "#fff"; context.fillRect(0, 0, blank.width, blank.height);
      var image = await aiReview.createDeidentifiedCrop(blank, { left: 0, top: 0, right: 64, bottom: 64 }, null,
        { syntheticTestImage: true });
      var result = await aiReview.request(aiMemory.provider, aiMemory.model, aiMemory.credential, "test", image);
      image.dataUrl = ""; blank.width = 0; blank.height = 0;
      setAiStatus(result.ok ? "連線成功；測試只使用空白合成圖。" : result.message, !result.ok);
    } catch (error) {
      setAiStatus(aiFailureMessage(error), true);
    } finally {
      aiMemory.busy = false;
      updateAiControls();
    }
  }

  function choiceAiEntries() {
    return review.buildReviewQueue(state.choicePages, state.pageCount).map(function (entry) {
      var expanded = geometry.expandChoiceTemplate(state.template, choiceSettings());
      var item = expanded.items.find(function (candidate) {
        return candidate.type === entry.type && candidate.number === entry.number;
      });
      return Object.assign({}, entry, { options: item ? item.choices.map(function (bubble) { return bubble.option; }) : [] });
    }).filter(function (entry) { return entry.options.length > 0; });
  }

  async function runChoiceAi(allPending) {
    var entries = choiceAiEntries();
    if (!allPending) entries = entries.filter(function (entry) { return entry.key === state.focusKey; });
    await runPreparedAiBatch("choice", entries, makeChoiceAiImage, function (entry, result) {
      aiChoiceResults[entry.key] = result;
    }, aiChoiceErrors, function (entry) { return entry.key; });
  }

  async function runDictationAi(allPages) {
    var answerSnapshot = state.dictationAnswer;
    var segmentSnapshot = state.dictationSegment;
    var entries = [];
    var first = allPages ? 1 : state.currentPage;
    var last = allPages ? state.pageCount : state.currentPage;
    for (var pageNumber = first; pageNumber <= last; pageNumber += 1) {
      entries.push({ pageNumber: pageNumber, segment: segmentSnapshot,
        key: segmentSnapshot + ":" + pageNumber });
    }
    await runPreparedAiBatch("dictation", entries, function (entry) {
      return makeDictationAiImage(entry.pageNumber, entry.segment);
    }, function (entry, result) {
      var alignment = aiReview.alignDictationTranscription(answerSnapshot, result.transcription);
      if (!alignment.ok) {
        throw new Error(alignment.message || "未能建立逐字建議。");
      }
      aiDictationResults[entry.key] = { answer: answerSnapshot, transcription: result.transcription, alignment: alignment };
    }, aiDictationErrors, function (entry) { return entry.key; });
  }

  function identityAiEntries(allPages) {
    var pages = allPages ? Array.from({ length: state.pageCount }, function (_, index) { return index + 1; }) : [state.currentPage];
    var entries = [];
    pages.forEach(function (pageNumber) {
      if (!state.choicePages[pageNumber] || isAnswerKeyExcludedPage(pageNumber)) return;
      var identity = state.template && state.template.identity;
      if (!identity) return;
      (Array.isArray(identity.fields) ? identity.fields : []).forEach(function (field) {
        var fieldType = field && field.id === "class-grade" ? "class-grade-grid" :
          field && field.id === "class-form" ? "class-form-grid" :
            field && field.id === "student-number" ? "student-number-grid" : "";
        if (!fieldType) return;
        var label = fieldType === "class-grade-grid" ? "班別年級圈格" :
          fieldType === "class-form-grid" ? "班別字母圈格" : "學號圈格";
        entries.push({ pageNumber: pageNumber, key: pageNumber + ":grid:" + fieldType, source: "grid",
          label: "第 " + pageNumber + " 頁 · " + label, fieldType: fieldType,
          identityContext: { mode: "grid", fieldType: fieldType,
            options: Array.isArray(field.options) ? field.options.slice() : [], digits: Number(field.digits) || 0 } });
      });
      (Array.isArray(identity.masks) ? identity.masks : []).forEach(function (mask) {
        if (!mask || ["class-handwrite", "student-handwrite"].indexOf(mask.type) < 0) return;
        var label = mask.type === "class-handwrite" ? "手寫班別區" : "手寫班號區";
        entries.push({ pageNumber: pageNumber, key: pageNumber + ":handwriting:" + String(mask.id || mask.type), source: "handwriting",
          label: "第 " + pageNumber + " 頁 · " + label, fieldType: mask.type, maskId: mask.id,
          identityContext: { mode: "handwriting", fieldType: mask.type } });
      });
    });
    return entries;
  }

  async function makeIdentityAiImage(entry) {
    var pdfPage = await state.pdfDoc.getPage(entry.pageNumber);
    var base = pdfPage.getViewport({ scale: 1 });
    var rendered = await renderPdfToCanvas(entry.pageNumber, Math.min(1.65, 1180 / base.width));
    var pageRecord = state.choicePages[entry.pageNumber];
    return aiReview.createIdentityCrop(rendered.canvas, state.template,
      { source: entry.source, fieldType: entry.fieldType, maskId: entry.maskId }, {
        templates: templates, geometry: geometry,
        calibration: pageRecord && pageRecord.metadataCalibration
      });
  }

  function mergeIdentityResult(entry, result) {
    var pageResult = aiIdentityResults[entry.pageNumber] || { grid: {}, handwriting: {} };
    var bucket = entry.source === "grid" ? pageResult.grid : pageResult.handwriting;
    var key = entry.source === "grid" ? entry.fieldType : entry.fieldType;
    bucket[key] = result;
    aiIdentityResults[entry.pageNumber] = pageResult;
  }

  async function runIdentityAi(allPages) {
    var entries = identityAiEntries(allPages);
    if (!entries.length) {
      setAiStatus("此頁或範本沒有可用的班別／學號圈格或手寫區。", true);
      return;
    }
    await runPreparedAiBatch("identity", entries, makeIdentityAiImage, mergeIdentityResult,
      aiIdentityErrors, function (entry) { return entry.key; });
  }

  function renderChoiceAiSuggestion(current) {
    var container = els.aiChoiceSuggestion;
    container.replaceChildren();
    if (!current) { container.hidden = true; return; }
    var result = aiChoiceResults[current.key];
    var error = aiChoiceErrors[current.key];
    if (!result && !error) { container.hidden = true; return; }
    container.hidden = false;
    var title = document.createElement("strong");
    title.textContent = error ? "AI 覆核未完成" : "AI 建議";
    var detail = document.createElement("p");
    detail.textContent = error || ((result.selectedOptions.length ? result.selectedOptions.join("、") : "空白") +
      " · 信心 " + Math.round(result.confidence * 100) + "%；請核對圈格後再決定是否採用。");
    container.append(title, detail);
    if (result) {
      var adopt = document.createElement("button"); adopt.type = "button"; adopt.className = "button";
      adopt.textContent = "採用 AI 建議（仍須確認）";
      adopt.addEventListener("click", function () {
        var question = state.choicePages[current.pageNumber] && state.choicePages[current.pageNumber].questions.find(function (entry) {
          return entry.type === current.type && entry.number === current.number;
        });
        if (!question) return;
        question.answer = result.selectedOptions.join("");
        question.status = "review";
        question.reviewed = false;
        question.focusDraftEdited = true;
        renderCurrentMode();
      });
      container.append(adopt);
    }
  }

  function renderDictationAiResult() {
    var container = els.aiDictationResult;
    container.replaceChildren();
    var key = state.dictationSegment + ":" + state.currentPage;
    var result = aiDictationResults[key];
    var error = aiDictationErrors[key];
    if (state.dictationStyle !== "sentence" || (result && result.answer !== state.dictationAnswer) || (!result && !error)) {
      container.hidden = true; return;
    }
    container.hidden = false;
    var heading = document.createElement("strong");
    heading.textContent = error ? "AI 讀取未完成" : "AI 轉錄建議 · 第 " + state.currentPage + " 頁";
    var transcription = document.createElement("p");
    transcription.textContent = error || "轉錄文字（只在本頁記憶體）：" + result.transcription;
    container.append(heading, transcription);
    if (!result) return;
    var preview = document.createElement("div"); preview.className = "dictation-ai-diff";
    model.dictationCharacters(state.dictationAnswer).forEach(function (character, index) {
      var item = document.createElement("span");
      var status = result.alignment.states[index] || "normal";
      item.className = status === "wrong" ? "is-wrong" : status === "miss" ? "is-miss" : "";
      item.textContent = character;
      preview.append(item);
    });
    var extra = document.createElement("p");
    extra.className = "muted small";
    extra.textContent = "建議錯字 " + result.alignment.wrong + "、漏字 " + result.alignment.miss +
      "、多字 " + result.alignment.extra + "；多字只作提示，須由老師自行在卷面加圈。";
    var adopt = document.createElement("button"); adopt.type = "button"; adopt.className = "button";
    adopt.textContent = "採用錯字及漏字建議";
    var answerSnapshot = result.answer;
    var segmentSnapshot = state.dictationSegment;
    var pageSnapshot = state.currentPage;
    adopt.addEventListener("click", function () {
      if (state.dictationAnswer !== answerSnapshot || state.dictationSegment !== segmentSnapshot || state.currentPage !== pageSnapshot) return;
      pushDictationUndo();
      var page = dictationPageRecord();
      page.answerStates = result.alignment.states.slice();
      state.dictationPages[pageSnapshot] = page;
      saveActiveDictationSegment();
      renderCurrentMode();
    });
    container.append(preview, extra, adopt);
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

  function showTemplateOrderWarning(definition) {
    pendingColumnOrderTemplate = definition && definition.source === "custom" && definition.kind === "choice" &&
      choiceWizard.misorderedColumnGroups(definition).length ? definition : null;
    els.templateOrderWarning.hidden = !pendingColumnOrderTemplate;
    els.templateOrderWarningText.textContent = pendingColumnOrderTemplate
      ? "此自訂範本有同一直行的答案欄未按由上而下排列，題號可能錯配。可建立修正版副本；原範本會保留。"
      : "";
  }

  function createReorderedTemplateCopy(definition) {
    if (!definition || definition.source !== "custom" || definition.kind !== "choice" ||
        !choiceWizard.misorderedColumnGroups(definition).length) {
      return { ok: false, message: "此範本毋須重新排列。" };
    }
    var copy = choiceWizard.reorderColumnMajorTemplate(definition);
    copy.source = "custom";
    copy.id = "custom:reordered-" + Date.now().toString(36) + "-" + (customTemplates.length + 1).toString(36);
    copy.name = (String(definition.name || "自訂範本") + "（欄序修正版）").slice(0, 100);
    var validation = templates.validateTemplate(copy);
    if (!validation.ok) return { ok: false, message: validation.errors.join(" ") };
    var next = customTemplates.concat([copy]);
    var saved = templateStore.saveTemplates(window, templates, next);
    if (!saved.ok) return { ok: false, message: saved.message + " 修正版尚未加入範本清單。" };
    customTemplates = next;
    renderTemplateList();
    if (choiceWizardUI) choiceWizardUI.refreshTemplates();
    return { ok: true, template: copy,
      message: "已建立「" + copy.name + "」（欄序修正版）；原範本保留在範本清單。" };
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
    els.editTemplateLayout.disabled = selected.kind !== "choice";
    els.exportTemplate.disabled = false;
    els.deleteTemplate.disabled = selected.source !== "custom";
    els.selectedTemplateLabel.textContent = selected.name;
    showTemplateOrderWarning(selected);
  }

  function updateStepper() {
    var selected = templateById(state.templateId);
    els.step1State.textContent = selected.name;
    els.step2State.textContent = state.pdfDoc ? "已載入 " + state.pageCount + " 頁" : "選擇本機 PDF";
    if (selected.kind === "choice") {
      var settings = choiceSettings(selected);
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
    if (state.choiceWizardActive && state.choiceWizardStage !== 5 && state.choiceWizardStage !== 6) {
      state.step = 1;
      [els.step1, els.step2, els.step3].forEach(function (section) { section.hidden = true; });
      els.stepper.hidden = true;
      updateStepper();
      return;
    }
    if (!state.choiceWizardActive && next > 1 && !state.templateId) next = 1;
    if (next === 3 && !state.pdfDoc) next = 2;
    state.step = next;
    if (state.choiceWizardActive) {
      els.step1.hidden = true;
      els.step2.hidden = next !== 2;
      els.step3.hidden = next !== 3;
      els.stepper.hidden = true;
    } else {
      [els.step1, els.step2, els.step3].forEach(function (section, index) { section.hidden = index + 1 !== next; });
      els.stepper.hidden = false;
    }
    updateStepper();
    if (next === 3 && state.mode === "choice") {
      window.requestAnimationFrame(function () {
        if (state.step === 3 && !els.focusConfirm.disabled) els.focusConfirm.focus({ preventScroll: true });
      });
    }
  }

  function keepChoiceWizardReviewSurfaceVisible() {
    if (!state.choiceWizardActive || state.choiceWizardStage !== 5) return;
    els.step2.hidden = false;
    els.step3.hidden = false;
  }

  function configureTemplateMode(templateOverride) {
    state.template = templateOverride || templateById(state.templateId);
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
      var manualIdentity = state.template.identity && state.template.identity.manualFields || {};
      var classFieldCount = identityFields.filter(function (field) { return field.id === "class-grade" || field.id === "class-form"; }).length;
      var studentField = identityFields.find(function (field) { return field.id === "student-number"; });
      els.choiceClass.closest("label").hidden = classFieldCount === 0 && !manualIdentity.class;
      els.choiceStudentId.closest("label").hidden = !studentField && !(Number(manualIdentity.studentNumberDigits) > 0);
      els.choiceStudentId.maxLength = studentField ? studentField.digits : Number(manualIdentity.studentNumberDigits) || 12;
      els.choiceStudentId.inputMode = "numeric";
      els.mcCount.max = String(mc ? mc.maxCount : 0); els.mcCount.closest("label").hidden = !mc;
      els.tfCount.max = String(tf ? tf.maxCount : 0); els.tfCount.closest("label").hidden = !tf;
      els.mcKey.closest("label").hidden = !mc; els.mcPoints.closest("label").hidden = !mc;
      els.tfKey.closest("label").hidden = !tf; els.tfPoints.closest("label").hidden = !tf;
      if (!mc) { els.mcCount.value = "0"; els.mcKey.value = ""; }
      if (!tf) { els.tfCount.value = "0"; els.tfKey.value = ""; }
      if (mc && Number(els.mcCount.value) > mc.maxCount) els.mcCount.value = String(mc.maxCount);
      if (tf && Number(els.tfCount.value) > tf.maxCount) els.tfCount.value = String(tf.maxCount);
      if (mc) els.mcKey.placeholder = "例如 " + templates.choiceOptionsFor(state.template, "mc", mc.options).join("");
      if (tf) els.tfKey.placeholder = "例如 " + templates.choiceOptionsFor(state.template, "tf", tf.options).join("");
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

  function answerKeyForCount(value, count) {
    return Array.from(String(value || "").toUpperCase().replace(/\s/g, "")).slice(0, count).join("");
  }

  function choiceSettings(templateDefinition) {
    var definition = templateDefinition || state.template;
    var mcBlock = questionBlock("mc", definition); var tfBlock = questionBlock("tf", definition);
    var mcChoices = mcBlock ? templates.choiceOptionsFor(definition, "mc", mcBlock.options) : ["A", "B", "C", "D"];
    var tfChoices = tfBlock ? templates.choiceOptionsFor(definition, "tf", tfBlock.options) : ["T", "F"];
    var mcCount = mcBlock ? numberInput(els.mcCount, mcBlock.maxCount, 0, mcBlock.maxCount) : 0;
    var tfCount = tfBlock ? numberInput(els.tfCount, tfBlock.maxCount, 0, tfBlock.maxCount) : 0;
    var mc = model.parseKey(answerKeyForCount(els.mcKey.value, mcCount), mcCount, mcChoices);
    var tf = model.parseKey(answerKeyForCount(els.tfKey.value, tfCount), tfCount, tfChoices);
    var expanded = templates.expandChoiceTemplate(definition, { mcCount: mcCount, tfCount: tfCount });
    var mcItems = expanded.items.filter(function (item) { return item.type === "mc"; });
    var tfItems = expanded.items.filter(function (item) { return item.type === "tf"; });
    var mcQuestionOptionsValid = mc.values.every(function (answer, index) {
      return !answer || (mcItems[index] && mcItems[index].choices.some(function (choice) { return choice.option === answer; }));
    });
    var tfQuestionOptionsValid = tf.values.every(function (answer, index) {
      return !answer || (tfItems[index] && tfItems[index].choices.some(function (choice) { return choice.option === answer; }));
    });
    var mcPoints = model.parsePoints(els.mcPoints.value, mcCount);
    var tfPoints = model.parsePoints(els.tfPoints.value, tfCount);
    return {
      mcCount: mcCount, tfCount: tfCount, mcKey: mc.values, tfKey: tf.values,
      mcPoints: mcPoints.values, tfPoints: tfPoints.values, mcOptions: mcChoices, tfOptions: tfChoices,
      valid: mc.ok && tf.ok && mcPoints.ok && tfPoints.ok && mcQuestionOptionsValid && tfQuestionOptionsValid,
      message: [mc, tf, mcPoints, tfPoints].filter(function (entry) { return !entry.ok; }).map(function (entry) { return entry.message; })
        .concat(mcQuestionOptionsValid ? [] : ["選擇題答案包含該題沒有的選項。"])
        .concat(tfQuestionOptionsValid ? [] : ["是非題答案包含該題沒有的選項。"]).join(" ")
    };
  }

  function keyIsReady() {
    var settings = choiceSettings();
    return settings.valid;
  }

  function currentChoicePage() { return state.choicePages[state.currentPage] || null; }

  function isAnswerKeyExcludedPage(pageNumber) {
    return model.isAnswerKeyExcluded(state.choicePages[pageNumber]) || Number(pageNumber) === state.excludedAnswerPage;
  }

  function answerKeyExcludedPages() {
    var pages = Object.keys(state.choicePages).map(Number).filter(function (pageNumber) {
      return model.isAnswerKeyExcluded(state.choicePages[pageNumber]);
    });
    if (state.excludedAnswerPage && pages.indexOf(state.excludedAnswerPage) < 0) pages.push(state.excludedAnswerPage);
    return pages.sort(function (left, right) { return left - right; });
  }

  function ensureAnswerKeyExcludedPage(pageNumber) {
    var page = state.choicePages[pageNumber] || cleanChoicePage({});
    state.choicePages[pageNumber] = model.setAnswerKeyExcludedFlag(page, true);
  }

  function syncAnswerKeyExcludedPage() {
    var excludedPages = answerKeyExcludedPages();
    state.excludedAnswerPage = excludedPages[0] || 0;
    excludedPages.forEach(ensureAnswerKeyExcludedPage);
  }

  function currentChoiceScore(page) {
    var settings = choiceSettings();
    if (isAnswerKeyExcludedPage(state.currentPage) || !page || page.pageFailure || review.hasForcedReadPending(page) || !settings.valid) return null;
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
    var exportReady = loaded && (state.mode === "choice"
      ? Object.keys(state.choicePages).length > 0 && keyIsReady()
      : dictationReady);
    els.copyExportTsv.disabled = !exportReady;
    els.exportXlsx.disabled = !exportReady || !window.JSZip;
    els.copyChoiceRoster.hidden = state.mode !== "choice";
    els.choiceClassSizeField.hidden = state.mode !== "choice";
    els.copyChoiceRoster.disabled = !loaded || state.mode !== "choice" || !Object.keys(state.choicePages).length || !keyIsReady();
    els.downloadProgress.disabled = !loaded;
    renderExportPreview();
    updateAiControls();
    renderAppealControls();
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
    if (pageRecord.pageFailure || state.focusKey === "page:" + String(state.currentPage) ||
        Array.isArray(pageRecord.pageFlags) && pageRecord.pageFlags.indexOf(omr.FORCED_READ_REVIEW_FLAG) >= 0) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "alignment-diagnostic-overlay");
      svg.setAttribute("viewBox", "0 0 " + viewport.width + " " + viewport.height);
      svg.setAttribute("aria-label", "預期圈心、讀取圈心及題組間隙診斷");
      alignmentOverlay.draw(svg, geometry, template, pageRecord, viewport);
      overlay.append(svg);
    }
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
      if (flag === ANSWER_KEY_EXCLUDED_FLAG) return;
      if (page.classWasEdited && flag.indexOf("班別") >= 0) return;
      if (page.studentIdWasEdited && flag.indexOf("學號") >= 0) return;
      rows.push({ kind: "flag", question: { reason: flag } });
    });
    return rows;
  }

  function renderAppealControls() {
    if (!els.appealClass) return;
    var hasReadPages = Object.keys(state.choicePages).some(function (pageNumber) {
      var page = state.choicePages[pageNumber];
      return page && Array.isArray(page.questions) && page.questions.length > 0;
    });
    var ready = state.mode === "choice" && Boolean(state.pdfDoc) && hasReadPages;
    [els.appealClass, els.appealStudentId, els.appealSearch, els.appealPage].forEach(function (control) {
      control.disabled = !ready;
    });
    var classes = Array.from(new Set(Object.keys(state.choicePages).map(function (pageNumber) {
      return String(state.choicePages[pageNumber] && state.choicePages[pageNumber].classValue || "").trim().toUpperCase();
    }).filter(Boolean))).sort(function (left, right) { return left.localeCompare(right, "zh-Hant"); });
    var classKey = JSON.stringify(classes);
    if (classKey !== appealClassOptionsKey) {
      var selectedClass = els.appealClass.value;
      els.appealClass.replaceChildren();
      var classPlaceholder = document.createElement("option");
      classPlaceholder.value = ""; classPlaceholder.textContent = classes.length ? "選擇班別" : "沒有已讀班別";
      els.appealClass.append(classPlaceholder);
      classes.forEach(function (classValue) {
        var option = document.createElement("option"); option.value = classValue; option.textContent = classValue;
        els.appealClass.append(option);
      });
      if (classes.indexOf(selectedClass) >= 0) els.appealClass.value = selectedClass;
      appealClassOptionsKey = classKey;
    }
    var pageKey = String(state.pageCount) + ":" + answerKeyExcludedPages().join(",");
    if (els.appealPage.dataset.pageKey !== pageKey) {
      var selectedPage = els.appealPage.value;
      els.appealPage.replaceChildren();
      var pagePlaceholder = document.createElement("option"); pagePlaceholder.value = "";
      pagePlaceholder.textContent = state.pageCount ? "選擇頁碼" : "沒有已載入頁面";
      els.appealPage.append(pagePlaceholder);
      for (var pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
        if (isAnswerKeyExcludedPage(pageNumber)) continue;
        var pageOption = document.createElement("option"); pageOption.value = String(pageNumber);
        pageOption.textContent = "第 " + pageNumber + " 頁";
        els.appealPage.append(pageOption);
      }
      if (selectedPage && els.appealPage.querySelector('option[value="' + selectedPage + '"]')) els.appealPage.value = selectedPage;
      els.appealPage.dataset.pageKey = pageKey;
    }
    if (!ready && !appealState.pageNumber) {
      els.appealStatus.textContent = "完成讀圈或載入進度及同一 PDF 後即可查詢。";
    }
  }

  function resetAppealLookup(message) {
    appealState.pageNumber = 0; appealState.questionKey = ""; appealState.questions = []; appealState.filteredQuestions = [];
    appealState.groups = []; appealState.filter = "all"; appealState.groupKey = "";
    appealState.crop = null; appealState.renderToken += 1;
    if (els.appealPageResults) els.appealPageResults.replaceChildren();
    if (els.appealQuestionList) els.appealQuestionList.replaceChildren();
    if (els.appealGroupSummary) els.appealGroupSummary.replaceChildren();
    if (els.appealQuestionPosition) els.appealQuestionPosition.textContent = "第 0 / 0 題";
    if (els.appealQuestionFilter) els.appealQuestionFilter.value = "all";
    if (els.appealQuestionDetail) els.appealQuestionDetail.hidden = true;
    if (els.appealCropCanvas) { els.appealCropCanvas.width = 0; els.appealCropCanvas.height = 0; }
    if (els.appealCropOverlay) { els.appealCropOverlay.replaceChildren(); els.appealCropOverlay.hidden = true; }
    if (els.appealClass) els.appealClass.value = "";
    if (els.appealStudentId) els.appealStudentId.value = "";
    if (els.appealPage) els.appealPage.value = "";
    if (els.appealStatus && message) els.appealStatus.textContent = message;
  }

  function appealQuestionRows(pageNumber) {
    var page = state.choicePages[pageNumber];
    var settings = choiceSettings();
    var expanded = geometry.expandChoiceTemplate(state.template, { mcCount: settings.mcCount, tfCount: settings.tfCount });
    return expanded.items.map(function (item) {
      var response = page && page.questions.find(function (entry) { return entry.type === item.type && entry.number === item.number; });
      var key = item.type === "mc" ? settings.mcKey[item.number - 1] : settings.tfKey[item.number - 1];
      var answer = response && response.answer || "";
      var pending = Boolean(response && response.status === "review" && !response.reviewed);
      var status = pending ? "待覆核" : model.choiceAnswerStatus(answer, key, item.type, response && response.status || "blank");
      var groupKey = [item.type, item.columnIndex == null ? 0 : item.columnIndex,
        item.rowGroupIndex == null ? 0 : item.rowGroupIndex].join(":");
      var points = Number(item.type === "mc" ? settings.mcPoints[item.number - 1] : settings.tfPoints[item.number - 1]) || 0;
      var normalizedAnswer = item.type === "tf" ? String(answer).toUpperCase() : model.normalizeChoice(answer);
      var normalizedKey = item.type === "tf" ? String(key || "").toUpperCase() : model.normalizeChoice(key);
      return { item: item, response: response || null, answer: answer, key: key || "", status: status,
        groupKey: groupKey, points: points, correct: Boolean(normalizedKey && normalizedAnswer === normalizedKey),
        manual: Boolean(response && (response.status === "manual" || response.focusDraftEdited)) };
    });
  }

  function renderAppealGroupSummary() {
    var page = state.choicePages[appealState.pageNumber] || {};
    var available = Boolean(page && !page.pageFailure && !review.hasForcedReadPending(page) && choiceSettings().valid);
    var summaries = review.summarizeAppealGroups(appealState.questions, appealState.groups, available);
    els.appealGroupSummary.replaceChildren();
    var allButton = document.createElement("button"); allButton.type = "button";
    allButton.className = "appeal-group-button"; allButton.setAttribute("aria-pressed", appealState.groupKey ? "false" : "true");
    var totalEarned = summaries.reduce(function (sum, group) { return sum + (Number(group.earned) || 0); }, 0);
    var totalMaximum = summaries.reduce(function (sum, group) { return sum + (Number(group.maximum) || 0); }, 0);
    var allCounts = summaries.reduce(function (result, group) {
      result.correct += group.counts.correct; result.wrong += group.counts.wrong;
      result.blank += group.counts.blank; result.pending += group.counts.pending;
      return result;
    }, { correct: 0, wrong: 0, blank: 0, pending: 0 });
    function countLabel(counts) {
      return "答對 " + counts.correct + " · 答錯 " + counts.wrong + " · 未作答 " + counts.blank + " · 待覆核 " + counts.pending;
    }
    allButton.textContent = "全部題組 · " + (available ? formatNumber(totalEarned) + " / " + formatNumber(totalMaximum) : "暫不計分") +
      " · " + countLabel(allCounts);
    allButton.dataset.earned = available ? String(totalEarned) : "";
    allButton.dataset.maximum = available ? String(totalMaximum) : "";
    allButton.addEventListener("click", function () {
      appealState.groupKey = "";
      renderAppealQuestionBrowser(appealState.questionKey);
    });
    els.appealGroupSummary.append(allButton);
    summaries.forEach(function (group) {
      var button = document.createElement("button"); button.type = "button"; button.className = "appeal-group-button";
      button.dataset.groupKey = group.key;
      button.setAttribute("aria-pressed", appealState.groupKey === group.key ? "true" : "false");
      button.dataset.earned = available ? String(group.earned) : "";
      button.dataset.maximum = available ? String(group.maximum) : "";
      button.textContent = group.label + " · " + (available ? formatNumber(group.earned) + " / " + formatNumber(group.maximum) : "暫不計分") +
        " · " + countLabel(group.counts);
      button.addEventListener("click", function () {
        appealState.groupKey = group.key;
        renderAppealQuestionBrowser("");
      });
      els.appealGroupSummary.append(button);
    });
  }

  function renderAppealQuestionBrowser(preferredKey) {
    appealState.filter = els.appealQuestionFilter.value || "all";
    appealState.filteredQuestions = review.filterAppealQuestions(appealState.questions, appealState.filter, appealState.groupKey);
    renderAppealGroupSummary();
    els.appealQuestionList.replaceChildren();
    if (!appealState.filteredQuestions.length) {
      appealState.renderToken += 1;
      els.appealQuestionPosition.textContent = "第 0 / 0 題";
      els.appealQuestionDetail.hidden = true;
      if (els.appealCropCanvas) { els.appealCropCanvas.width = 0; els.appealCropCanvas.height = 0; }
      if (els.appealCropOverlay) { els.appealCropOverlay.replaceChildren(); els.appealCropOverlay.hidden = true; }
      var empty = document.createElement("p"); empty.className = "muted small";
      empty.textContent = "此篩選條件沒有題目。"; els.appealQuestionList.append(empty);
      appealState.questionKey = "";
      els.appealPrevQuestion.disabled = true; els.appealNextQuestion.disabled = true;
      return;
    }
    appealState.filteredQuestions.forEach(function (entry) {
      var button = document.createElement("button"); button.type = "button"; button.className = "appeal-question-button";
      if (entry.status === "錯" || entry.status === "多選") button.classList.add("is-wrong");
      if (entry.status === "待覆核") button.classList.add("is-pending");
      button.dataset.questionKey = entry.item.type + ":" + entry.item.number;
      button.setAttribute("aria-current", "false");
      var line = (entry.item.type === "mc" ? "選擇題" : "是非題") + "第 " + String(entry.item.number).padStart(2, "0") +
        " 題 · 讀到「" + (entry.answer || "未作答") + "」· 標準答案「" + (entry.key || "未設定") + "」· " + entry.status;
      if (entry.manual) line += " · 老師曾修改";
      button.textContent = line;
      button.addEventListener("click", function () { renderAppealSelectedQuestion(entry.item.type + ":" + entry.item.number); });
      els.appealQuestionList.append(button);
    });
    var requestedKey = preferredKey === undefined ? appealState.questionKey : preferredKey;
    var selected = appealState.filteredQuestions.find(function (entry) {
      return entry.item.type + ":" + entry.item.number === requestedKey;
    }) || null;
    if (selected) renderAppealSelectedQuestion(selected.item.type + ":" + selected.item.number);
    else {
      appealState.renderToken += 1;
      appealState.questionKey = "";
      els.appealQuestionDetail.hidden = true;
      if (els.appealCropCanvas) { els.appealCropCanvas.width = 0; els.appealCropCanvas.height = 0; }
      if (els.appealCropOverlay) { els.appealCropOverlay.replaceChildren(); els.appealCropOverlay.hidden = true; }
      els.appealQuestionPosition.textContent = "第 0 / " + appealState.filteredQuestions.length + " 題";
      els.appealPrevQuestion.disabled = true; els.appealNextQuestion.disabled = true;
    }
  }

  function renderAppealPage(pageNumber, resultLabel) {
    var page = Number(pageNumber);
    if (!Number.isInteger(page) || page < 1 || page > state.pageCount || isAnswerKeyExcludedPage(page)) return;
    appealState.pageNumber = page;
    appealState.questionKey = "";
    appealState.groupKey = "";
    appealState.filter = "all";
    els.appealQuestionFilter.value = "all";
    var pageRecord = state.choicePages[page];
    appealState.questions = pageRecord && Array.isArray(pageRecord.questions) && pageRecord.questions.length
      ? appealQuestionRows(page) : [];
    var seenGroups = new Set();
    appealState.groups = appealState.questions.reduce(function (groups, entry) {
      if (!seenGroups.has(entry.groupKey)) {
        seenGroups.add(entry.groupKey);
        var numbers = appealState.questions.filter(function (candidate) { return candidate.groupKey === entry.groupKey; })
          .map(function (candidate) { return candidate.item.number; });
        groups.push({ key: entry.groupKey, label: omr.answerGroupLabel(entry.item.type, numbers) });
      }
      return groups;
    }, []);
    els.appealPage.value = String(page);
    els.appealStatus.textContent = resultLabel || "已選第 " + page + " 頁；請選擇題號查看原 PDF 截圖及讀圈資料。";
    els.appealQuestionList.replaceChildren();
    els.appealQuestionDetail.hidden = true;
    els.appealCropOverlay.replaceChildren();
    els.appealCropCanvas.width = 0; els.appealCropCanvas.height = 0;
    if (!appealState.questions.length) {
      var noQuestions = document.createElement("p"); noQuestions.className = "muted small";
      noQuestions.textContent = "此頁尚無讀圈結果，請選擇已完成讀圈的頁面。";
      els.appealQuestionList.append(noQuestions);
      els.appealGroupSummary.replaceChildren();
      els.appealQuestionPosition.textContent = "第 0 / 0 題";
      return;
    }
    renderAppealQuestionBrowser("");
  }

  function appealMappedCenters(questionEntry, viewport) {
    var page = state.choicePages[appealState.pageNumber] || {};
    return questionEntry.item.choices.map(function (bubble, index) {
      return geometry.mapBubble(bubble, viewport.width, viewport.height, page.calibration,
        questionEntry.response && questionEntry.response.localOffsets && questionEntry.response.localOffsets[index]);
    });
  }

  async function renderAppealSelectedQuestion(questionKey) {
    var entry = appealState.questions.find(function (candidate) {
      return candidate.item.type + ":" + candidate.item.number === questionKey;
    });
    if (!entry || !state.pdfDoc) return;
    appealState.questionKey = questionKey;
    var token = ++appealState.renderToken;
    els.appealQuestionList.querySelectorAll(".appeal-question-button").forEach(function (button) {
      button.setAttribute("aria-current", button.dataset.questionKey === questionKey ? "true" : "false");
    });
    els.appealQuestionDetail.hidden = false;
    els.appealDetailTitle.textContent = (entry.item.type === "mc" ? "選擇題" : "是非題") + "第 " + String(entry.item.number).padStart(2, "0") + " 題 · 原 PDF";
    els.appealDetailStatus.textContent = "讀到作答：「" + (entry.answer || "未作答") + "」；標準答案：「" + (entry.key || "未設定") + "」；結果：「" + entry.status + "」。" +
      (entry.response && entry.response.reason ? "讀圈提示：「" + entry.response.reason + "」。" : "");
    els.appealReviewRecord.textContent = entry.manual
      ? "老師覆核紀錄：此題曾由老師修改或確認。"
      : entry.response && entry.response.reviewed ? "老師覆核紀錄：已確認。"
        : "老師覆核紀錄：沒有已保存的人手修改。";
    els.appealReadouts.replaceChildren();
    entry.item.choices.forEach(function (bubble, index) {
      var value = entry.response && Array.isArray(entry.response.values) ? Number(entry.response.values[index]) : NaN;
      var amount = Number.isFinite(value) ? Math.round(value * 100) + "%" : "未記錄";
      var row = document.createElement("li");
      row.textContent = bubble.option + "：填色 " + amount + (entry.answer.indexOf(bubble.option) >= 0 ? " · 程式選取" : "");
      els.appealReadouts.append(row);
    });
    var selectedIndex = appealState.filteredQuestions.indexOf(entry);
    els.appealQuestionPosition.textContent = "第 " + (selectedIndex + 1) + " / " + appealState.filteredQuestions.length + " 題";
    els.appealPrevQuestion.disabled = selectedIndex <= 0;
    els.appealNextQuestion.disabled = selectedIndex < 0 || selectedIndex >= appealState.filteredQuestions.length - 1;
    var scoreText = entry.correct ? entry.points : 0;
    els.appealDetailStatus.textContent = "讀到作答：「" + (entry.answer || "未作答") + "」；標準答案：「" + (entry.key || "未設定") + "」；結果：「" + entry.status + "」；得分 " +
      formatNumber(scoreText) + " / " + formatNumber(entry.points) + "。" +
      (entry.response && entry.response.reason ? "讀圈提示：「" + entry.response.reason + "」。" : "");
    try {
      var pdfPage = await state.pdfDoc.getPage(appealState.pageNumber);
      var viewport = pdfPage.getViewport({ scale: 2 });
      var sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = Math.ceil(viewport.width); sourceCanvas.height = Math.ceil(viewport.height);
      var sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
      await pdfPage.render({ canvasContext: sourceContext, viewport: viewport }).promise;
      if (token !== appealState.renderToken) return;
      var centers = appealMappedCenters(entry, viewport);
      var radius = (Number(state.template.bubble && state.template.bubble.radius) || 0.0077) * Math.min(viewport.width, viewport.height);
      var horizontalStep = centers.length > 1 ? Math.abs(centers[1].x - centers[0].x) : radius * 4;
      var templateItems = geometry.expandChoiceTemplate(state.template, choiceSettings()).items;
      var pageRecord = state.choicePages[appealState.pageNumber] || {};
      var rowDistances = templateItems.filter(function (candidate) {
        return candidate.type === entry.item.type && candidate.number !== entry.item.number && candidate.columnIndex === entry.item.columnIndex;
      }).map(function (candidate) {
        var neighbor = (pageRecord.questions || []).find(function (question) { return question.type === candidate.type && question.number === candidate.number; });
        var center = geometry.mapBubble(candidate.choices[0], viewport.width, viewport.height,
          pageRecord.calibration,
          neighbor && neighbor.localOffsets && neighbor.localOffsets[0]);
        return Math.abs(center.y - centers[0].y);
      }).filter(function (distance) { return distance > radius * 2; });
      var rowPitch = rowDistances.length ? Math.min.apply(Math, rowDistances) : radius * 3;
      var bounds = review.questionCropBounds(centers, radius, horizontalStep, rowPitch, viewport.width, viewport.height);
      var cropWidth = Math.max(1, bounds.right - bounds.left); var cropHeight = Math.max(1, bounds.bottom - bounds.top);
      els.appealCropCanvas.width = cropWidth; els.appealCropCanvas.height = cropHeight;
      els.appealCropCanvas.getContext("2d").drawImage(sourceCanvas, bounds.left, bounds.top, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight);
      els.appealCropOverlay.setAttribute("viewBox", "0 0 " + cropWidth + " " + cropHeight);
      els.appealCropOverlay.setAttribute("preserveAspectRatio", "none");
      els.appealCropOverlay.replaceChildren();
      centers.forEach(function (center, index) {
        var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", String(center.x - bounds.left)); circle.setAttribute("cy", String(center.y - bounds.top));
        circle.setAttribute("r", String(radius)); circle.setAttribute("fill", "rgba(24,91,145,0.12)");
        circle.setAttribute("stroke", "#185b91"); circle.setAttribute("stroke-width", String(Math.max(2, radius * 0.2)));
        var title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = "選項 " + entry.item.choices[index].option;
        circle.append(title); els.appealCropOverlay.append(circle);
      });
      els.appealCropOverlay.hidden = !els.appealShowReadZones.checked;
      appealState.crop = { pageNumber: appealState.pageNumber, questionKey: questionKey, bounds: bounds };
    } catch (error) {
      if (token !== appealState.renderToken) return;
      els.appealDetailStatus.textContent += "原圖載入失敗：" + (error && error.message || "請重試。");
    }
  }

  function searchAppealStudent() {
    var classValue = String(els.appealClass.value || "").trim();
    var studentId = String(els.appealStudentId.value || "").trim();
    els.appealPageResults.replaceChildren();
    els.appealQuestionList.replaceChildren();
    els.appealQuestionDetail.hidden = true;
    if (!classValue || !studentId) {
      els.appealStatus.textContent = "請選擇班別並輸入學號。";
      return;
    }
    var matches = review.findPagesByIdentity(state.choicePages, state.pageCount, classValue, studentId, answerKeyExcludedPages());
    if (!matches.length) {
      appealState.pageNumber = 0; appealState.questionKey = ""; appealState.questions = []; appealState.filteredQuestions = [];
      appealState.groups = [];
      els.appealGroupSummary.replaceChildren(); els.appealQuestionPosition.textContent = "第 0 / 0 題";
      els.appealStatus.textContent = "找不到符合此班別及學號的已讀頁面。請核對輸入或直接選頁碼。";
      return;
    }
    matches.forEach(function (pageNumber) {
      var page = state.choicePages[pageNumber];
      var button = document.createElement("button"); button.type = "button"; button.className = "button compact";
      button.textContent = "第 " + pageNumber + " 頁";
      button.addEventListener("click", function () { renderAppealPage(pageNumber); });
      els.appealPageResults.append(button);
    });
    els.appealStatus.textContent = matches.length > 1
      ? "同一班別及學號找到 " + matches.length + " 頁，請選擇要查閱的頁面。"
      : "找到 1 頁，請選擇題號查看。";
    if (matches.length === 1) renderAppealPage(matches[0]);
    else renderAppealPage(matches[0], "找到多頁；請在上方選擇頁面後查閱題目。");
  }

  function moveAppealQuestion(direction) {
    var index = appealState.filteredQuestions.findIndex(function (entry) {
      return entry.item.type + ":" + entry.item.number === appealState.questionKey;
    });
    var next = index + direction;
    if (next < 0 || next >= appealState.filteredQuestions.length) return;
    var entry = appealState.filteredQuestions[next];
    renderAppealSelectedQuestion(entry.item.type + ":" + entry.item.number);
  }

  function focusPageEntries(pageNumber) {
    var page = state.choicePages[pageNumber];
    if (!page || page.pageFailure || isAnswerKeyExcludedPage(pageNumber)) return [];
    var items = geometry.expandChoiceTemplate(state.template, choiceSettings()).items;
    return review.pageQuestions(pageNumber, page, items).map(function (entry) {
      entry.key = entry.type + ":" + entry.number;
      entry.question = entry.response || { type: entry.type, number: entry.number, answer: "", values: [], status: "blank", reviewed: true };
      return entry;
    });
  }

  function focusBrowseEntry() {
    if (!focusBrowseState.active || focusBrowseState.pageNumber !== state.currentPage) return null;
    return focusPageEntries(focusBrowseState.pageNumber).find(function (entry) { return entry.key === focusBrowseState.questionKey; }) || null;
  }

  function startFocusBrowse() {
    var entries = focusPageEntries(state.currentPage);
    if (!entries.length) return;
    var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
    var pending = queue.find(function (entry) { return entry.key === state.focusKey; });
    focusBrowseState = {
      active: true, pageNumber: state.currentPage, questionKey: entries[0].key,
      returnPage: pending && pending.kind !== "page" ? pending.pageNumber : state.currentPage
    };
    renderCurrentMode();
  }

  function moveFocusBrowse(direction) {
    var entries = focusPageEntries(state.currentPage);
    if (!entries.length) return;
    var active = focusBrowseEntry();
    var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
    var pending = queue.find(function (entry) { return entry.key === state.focusKey; });
    var index = active ? entries.findIndex(function (entry) { return entry.key === active.key; }) : pending && pending.kind !== "page" && pending.pageNumber === state.currentPage
      ? entries.findIndex(function (entry) { return entry.type === pending.type && entry.number === pending.number; }) : -1;
    if (index < 0) {
      index = direction < 0 ? entries.length - 1 : 0;
      focusBrowseState.returnPage = pending && pending.kind !== "page" ? pending.pageNumber : state.currentPage;
    } else {
      index = review.nextIndex(entries, index, direction);
      if (index < 0) return;
      if (!focusBrowseState.active) focusBrowseState.returnPage = pending && pending.kind !== "page" ? pending.pageNumber : state.currentPage;
    }
    focusBrowseState.active = true;
    focusBrowseState.pageNumber = state.currentPage;
    focusBrowseState.questionKey = entries[index].key;
    renderCurrentMode();
  }

  function returnToPendingFocus() {
    var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
    var pending = queue.find(function (entry) { return entry.key === state.focusKey; });
    focusBrowseState.active = false;
    if (pending) state.currentPage = pending.pageNumber;
    else if (focusBrowseState.returnPage) state.currentPage = focusBrowseState.returnPage;
    renderCurrentMode();
  }

  function renderFocusInkStats(entry, entries) {
    var currentKey = entry ? entry.key : "";
    var stats = review.questionInkStats(entries, currentKey);
    if (!stats.count) { els.focusInkStats.textContent = "本頁讀圈深淺：沒有可用讀數。"; return; }
    function percent(value) { return value == null ? "未記錄" : Math.round(value * 100) + "%"; }
    els.focusInkStats.textContent = "本頁每題最深選項：中位數 " + percent(stats.median) + "；範圍 " +
      percent(stats.minimum) + "–" + percent(stats.maximum) + (entry ? "。本題最深／第二深：" +
        percent(stats.darkest) + "／" + percent(stats.secondDarkest) : "。");
  }

  function renderFocusControls(queue) {
    var current = queue.find(function (entry) { return entry.key === state.focusKey; });
    if (current && current.kind !== "page") {
      current = Object.assign({}, current, { item: geometry.expandChoiceTemplate(state.template, choiceSettings()).items.find(function (item) {
        return item.type === current.type && item.number === current.number;
      }) || null });
    }
    if (focusBrowseState.active && focusBrowseState.pageNumber !== state.currentPage) focusBrowseState.active = false;
    var browsing = focusBrowseEntry();
    var shown = browsing || current;
    els.focusAnswerKeys.replaceChildren();
    var queueIndex = queue.findIndex(function (entry) { return entry.key === state.focusKey; });
    els.focusProgress.textContent = queue.length ? (Math.max(1, queueIndex + 1) + " / " + queue.length + " 題") : "0 題";
    var pageFailureItem = Boolean(current && current.kind === "page" && !browsing);
    var pageEntries = focusPageEntries(state.currentPage);
    var statsEntries = browsing ? pageEntries : current && current.kind !== "page" ? focusPageEntries(current.pageNumber) : pageEntries;
    var browseIndex = browsing ? pageEntries.findIndex(function (entry) { return entry.key === browsing.key; }) :
      current && current.kind !== "page" && current.pageNumber === state.currentPage
        ? pageEntries.findIndex(function (entry) { return entry.key === current.key; }) : -1;
    var hasBrowseAnchor = Boolean(browsing || browseIndex >= 0);
    els.focusBrowseStart.disabled = !pageEntries.length;
    els.focusBrowsePrev.disabled = !pageEntries.length || !hasBrowseAnchor || browseIndex <= 0;
    els.focusBrowseNext.disabled = !pageEntries.length || !hasBrowseAnchor || browseIndex >= pageEntries.length - 1;
    els.focusBrowseReturn.hidden = !browsing;
    els.focusPageReread.hidden = !pageFailureItem;
    els.focusConfirm.hidden = pageFailureItem;
    els.focusConfirm.disabled = !current || pageFailureItem;
    els.focusConfirm.classList.toggle("primary", Boolean(current));
    els.exportPdf.classList.toggle("primary", !current);
    renderFocusInkStats(browsing || current && current.kind !== "page" ? shown : null, statsEntries);
    if (shown && shown.kind === "page") {
      els.focusTitle.textContent = "第 " + shown.pageNumber + " 頁 · 整頁定位失敗";
      var diagnostics = shown.diagnostic || {};
      var diagnosticReasons = diagnostics.reasons || [];
      var groupLines = (diagnostics.groups || []).map(function (group) {
        return group.label + "平均偏移 " + Number(group.meanMm).toFixed(1) + " mm";
      });
      var worstLines = (diagnostics.worstGroups || []).map(function (group) {
        return group.label + " " + Number(group.meanMm).toFixed(1) + " mm";
      });
      var readout = diagnosticReasons.length ? diagnosticReasons.slice() : [shown.reason];
      readout.push("各組平均偏移：" + (groupLines.join("；") || "沒有題組"));
      readout.push("偏移最大的三組：" + (worstLines.join("；") || "沒有題組"));
      els.focusReason.textContent = readout.join("\n");
      els.focusPreview.replaceChildren(Object.assign(document.createElement("p"), { className: "empty-state",
        textContent: "整頁圈心診斷已疊加在右側答題紙；藍圈為預期位置，紅圈為讀取位置，連線顯示位移。" }));
      renderChoiceAiSuggestion(null);
      return;
    }
    if (!shown) {
      els.focusTitle.textContent = "沒有待覆核題目";
      els.focusReason.textContent = state.pdfDoc ? "所有已讀題目都已確認；可瀏覽本頁題目，整頁警告仍請檢查。" : "載入 PDF 後，待覆核題目會在這裏放大顯示。";
      els.focusPreview.replaceChildren(Object.assign(document.createElement("p"), { className: "empty-state", textContent: "目前沒有需要覆核的題目。" }));
      renderChoiceAiSuggestion(null);
      return;
    }
    var question = shown.question;
    var selected = question.answer || "";
    var pendingNow = question.status === "review" && !question.reviewed;
    var browsingNonPending = Boolean(browsing && !pendingNow);
    var titlePrefix = browsing ? (browsingNonPending ? "瀏覽中：非待覆核題目 · " : "瀏覽中：待覆核題目 · ") : "";
    els.focusTitle.textContent = titlePrefix + "第 " + shown.pageNumber + " 頁 · " + (shown.type === "mc" ? "選擇題" : "是非題") +
      "第 " + String(shown.number).padStart(2, "0") + " 題";
    var readings = (shown.item ? shown.item.choices : []).map(function (choice, index) {
      var value = Array.isArray(question.values) ? Number(question.values[index]) : NaN;
      return choice.option + " " + (Number.isFinite(value) ? Math.round(value * 100) + "%" : "未記錄");
    }).join("、");
    var browseNote = browsing ? "瀏覽不會更改覆核狀態；Alt+↑／↓ 可移至本頁上一題／下一題，Enter 仍確認待覆核清單中的題目。" : "";
    els.focusReason.textContent = "讀圈結果：「" + (selected || "空白") + "」；選項填色：" + (readings || "未記錄") + "；" +
      (question.reason || "請對照整頁確認答案。") + (browseNote ? "\n" + browseNote : "");
    var answerOptions = shown.item ? shown.item.choices.map(function (bubble) { return bubble.option; }) : [];
    answerOptions.concat(["空白"]).forEach(function (option) {
      var button = document.createElement("button"); button.type = "button"; button.className = "answer-choice";
      var isSelected = option === "空白" ? !selected : selected.indexOf(option) >= 0;
      button.textContent = option; button.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if (isSelected) button.classList.add("selected");
      button.addEventListener("click", function () {
        var page = state.choicePages[shown.pageNumber];
        if (!question || !Array.isArray(page.questions)) return;
        if (!page.questions.includes(question)) page.questions.push(question);
        var next = option === "空白" ? "" : (selected.indexOf(option) >= 0 ? selected.replace(option, "") : Array.from(new Set((selected + option).split(""))).sort().join(""));
        question.answer = next;
        question.status = "review";
        question.reviewed = false;
        question.focusDraftEdited = true;
        renderCurrentMode();
      });
      els.focusAnswerKeys.append(button);
    });
    renderChoiceAiSuggestion(browsing ? null : current);
  }

  function renderReviewList(page) {
    var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
    if (!queue.some(function (entry) { return entry.key === state.focusKey; })) state.focusKey = queue.length ? queue[0].key : "";
    els.reviewItems.replaceChildren(); els.pageFlags.replaceChildren();
    els.reviewQueueSummary.textContent = "跨頁待覆核題目（" + queue.length + "）";
    if (!queue.length) {
      var message = document.createElement("p"); message.className = "muted small";
      message.textContent = !page ? "載入 PDF 並開始讀圈後，清單會列出待覆核題目。" : "沒有待覆核題目。請仍檢查整頁警告。";
      els.reviewItems.append(message);
    } else queue.forEach(function (entry) {
      var button = document.createElement("button"); button.type = "button"; button.className = "review-item";
      button.setAttribute("aria-current", entry.key === state.focusKey ? "true" : "false");
      var label = document.createElement("span");
      label.textContent = entry.kind === "page" ? "第 " + entry.pageNumber + " 頁 · 整頁" :
        "第 " + entry.pageNumber + " 頁 · " + (entry.type === "mc" ? "選擇題" : "是非題") + "第 " + String(entry.number).padStart(2, "0") + " 題";
      var detail = document.createElement("span"); detail.className = "item-value";
      detail.textContent = entry.kind === "page" ? "定位檢查失敗 · 按此查看診斷" : (entry.answer || "空白") + " · " + entry.reason;
      button.append(label, detail);
      button.addEventListener("click", function () {
        focusBrowseState.active = false;
        state.focusKey = entry.key; state.currentPage = entry.pageNumber;
        renderCurrentMode();
      });
      els.reviewItems.append(button);
    });
    var warningGroups = review.groupPageWarnings(state.choicePages, state.pageCount);
    var warningCount = warningGroups.reduce(function (count, group) { return count + group.entries.length; }, 0);
    els.pageFlagsSummary.textContent = "頁面警告（" + warningCount + "）";
    warningGroups.forEach(function (group) {
      var section = document.createElement("details"); section.className = "page-warning-group";
      var summary = document.createElement("summary");
      var pageList = group.entries.map(function (entry) { return entry.pageNumber; });
      var compactPages = pageList.length <= 5 ? "第 " + pageList.join("、") + " 頁" : pageList.length + " 頁";
      summary.textContent = group.label + "：" + compactPages;
      section.append(summary);
      var list = document.createElement("div");
      group.entries.forEach(function (entry) {
        var button = document.createElement("button"); button.type = "button"; button.className = "page-warning-entry";
        button.textContent = "第 " + entry.pageNumber + " 頁 · " + entry.detail;
        button.addEventListener("click", function () {
          state.currentPage = entry.pageNumber;
          renderCurrentMode();
        });
        list.append(button);
      });
      section.append(list); els.pageFlags.append(section);
    });
    renderFocusControls(queue);
  }

  function identityValueText(value, blankLabel) {
    if (Array.isArray(value)) return value.length ? value.map(function (item) { return identityValueText(item, blankLabel); }).join("、") : (blankLabel || "空白");
    if (value == null || value === "") return blankLabel || "空白";
    return String(value);
  }

  function identitySingleValue(value) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") return value[0];
    return null;
  }

  function identityGridClass(result) {
    if (!result || !result.grid) return { text: "未讀取", value: null };
    var gradeField = state.template.identity.fields.find(function (field) { return field.id === "class-grade"; });
    var formField = state.template.identity.fields.find(function (field) { return field.id === "class-form"; });
    var gradeValue = gradeField ? result.grid["class-grade-grid"] && result.grid["class-grade-grid"].classGrade : "";
    var formValue = formField ? result.grid["class-form-grid"] && result.grid["class-form-grid"].classForm : "";
    var gradeText = gradeField ? identityValueText(gradeValue) : "";
    var formText = formField ? identityValueText(formValue) : "";
    var gradeSingle = gradeField ? identitySingleValue(gradeValue) : "";
    var formSingle = formField ? identitySingleValue(formValue) : "";
    return { text: (gradeText + formText) || "未讀取",
      value: gradeSingle !== null && formSingle !== null ? gradeSingle + formSingle : null };
  }

  function identityGridNumber(result) {
    var field = state.template.identity.fields.find(function (entry) { return entry.id === "student-number"; });
    var response = result && result.grid && result.grid["student-number-grid"];
    if (!field || !response || !Array.isArray(response.studentNumber)) return { text: "未讀取", value: null };
    var slots = response.studentNumber;
    var text = slots.map(function (slot) { return identityValueText(slot, "空白"); }).join(" | ");
    var value = slots.every(function (slot) { return typeof slot === "string" && /^\d$/.test(slot); }) ? slots.join("") : null;
    return { text: text, value: value };
  }

  function identityLocalValues(page) {
    var metadata = page && page.metadata || {};
    var fields = state.template && state.template.identity && state.template.identity.fields || [];
    var gradeRequired = fields.some(function (field) { return field && field.id === "class-grade"; });
    var formRequired = fields.some(function (field) { return field && field.id === "class-form"; });
    var numberField = fields.find(function (field) { return field && field.id === "student-number"; });
    var grade = metadata.grade || {};
    var form = metadata.form || {};
    var localClass = page && page.classWasEdited ? String(page.classValue || "") :
      (gradeRequired && grade.status === "read" ? String(grade.value || "") : "") +
      (formRequired && form.status === "read" ? String(form.value || "") : "");
    var digits = Array.isArray(metadata.idDigits) ? metadata.idDigits : [];
    var localNumber = page && page.studentIdWasEdited ? String(page.studentId || "") :
      (digits.length && digits.every(function (entry) { return entry && entry.status === "read" && /^\d$/.test(String(entry.value || "")); })
        ? digits.map(function (entry) { return entry.value; }).join("") : "");
    var classConfirmed = (!gradeRequired || grade.status === "read") &&
      (!formRequired || form.status === "read") || page && page.classWasEdited;
    var numberConfirmed = !numberField || (digits.length === numberField.digits &&
      digits.every(function (entry) { return entry && entry.status === "read"; })) || page && page.studentIdWasEdited;
    return { classValue: localClass || null, studentId: localNumber || null,
      classText: localClass || (classConfirmed ? "空白" : "未確認"),
      numberText: localNumber || (numberConfirmed ? "空白" : "未確認"),
      confirmed: model.choiceIdentityConfirmed(page) };
  }

  function identityComparison(pageNumber) {
    var page = state.choicePages[pageNumber];
    var result = aiIdentityResults[pageNumber];
    if (!page || !result) return null;
    var circleClass = identityGridClass(result);
    var circleNumber = identityGridNumber(result);
    var handClassResult = result.handwriting && result.handwriting["class-handwrite"];
    var handNumberResult = result.handwriting && result.handwriting["student-handwrite"];
    var handClass = handClassResult ? String(handClassResult.handwrittenClass || "") : null;
    var handNumber = handNumberResult ? String(handNumberResult.handwrittenNumber || "") : null;
    var local = identityLocalValues(page);
    var mismatch = !local.confirmed;
    if (circleClass.value != null && local.classValue != null && circleClass.value !== local.classValue) mismatch = true;
    if (circleNumber.value != null && local.studentId != null && circleNumber.value !== local.studentId) mismatch = true;
    if (handClass != null && circleClass.value != null && handClass !== circleClass.value) mismatch = true;
    if (handNumber != null && circleNumber.value != null && handNumber !== circleNumber.value) mismatch = true;
    if (handClass != null && local.classValue != null && handClass !== local.classValue) mismatch = true;
    if (handNumber != null && local.studentId != null && handNumber !== local.studentId) mismatch = true;
    var circlePresent = result.grid && Object.keys(result.grid).length > 0;
    var handPresent = result.handwriting && Object.keys(result.handwriting).length > 0;
    if (!circlePresent && !handPresent) return null;
    return { needsReview: mismatch, local: local, circleClass: circleClass, circleNumber: circleNumber,
      handClass: handClass, handNumber: handNumber,
      circleText: "班別 " + circleClass.text + "／學號 " + circleNumber.text,
      handText: handPresent ? "班別 " + (handClass == null ? "未讀取" : handClass || "空白") + "／學號 " +
        (handNumber == null ? "未讀取" : handNumber || "空白") : "未設定手寫區" };
  }

  function identityAdoption(pageNumber, source) {
    var comparison = identityComparison(pageNumber);
    if (!comparison) return null;
    var identity = state.template.identity;
    var gradeField = identity.fields.find(function (field) { return field.id === "class-grade"; });
    var formField = identity.fields.find(function (field) { return field.id === "class-form"; });
    var numberField = identity.fields.find(function (field) { return field.id === "student-number"; });
    var suggestion = {};
    if (source === "grid") {
      var grid = aiIdentityResults[pageNumber].grid || {};
      var grade = gradeField ? identitySingleValue(grid["class-grade-grid"] && grid["class-grade-grid"].classGrade) : "";
      var form = formField ? identitySingleValue(grid["class-form-grid"] && grid["class-form-grid"].classForm) : "";
      var number = grid["student-number-grid"] && grid["student-number-grid"].studentNumber;
      if ((gradeField || formField) && (!gradeField || grade) && (!formField || form)) {
        suggestion.classValue = String(grade || "") + String(form || "");
      }
      if (numberField && Array.isArray(number) && number.length === numberField.digits && number.every(function (slot) { return typeof slot === "string" && /^\d$/.test(slot); })) {
        suggestion.studentId = number.join("");
      }
    } else {
      var hand = aiIdentityResults[pageNumber].handwriting || {};
      var handClass = hand["class-handwrite"];
      var handNumber = hand["student-handwrite"];
      if (handClass && /^[1-9][A-Z]$/.test(handClass.handwrittenClass || "")) suggestion.classValue = handClass.handwrittenClass;
      if (handNumber && /^\d{1,3}$/.test(handNumber.handwrittenNumber || "")) suggestion.studentId = handNumber.handwrittenNumber;
    }
    return Object.keys(suggestion).length ? suggestion : null;
  }

  function adoptIdentitySuggestion(pageNumber, source) {
    var suggestion = identityAdoption(pageNumber, source);
    var page = state.choicePages[pageNumber];
    if (!suggestion || !page) return;
    if (Object.prototype.hasOwnProperty.call(suggestion, "classValue")) {
      page.classValue = suggestion.classValue;
      page.classWasEdited = false;
      if (page.metadata) {
        if (page.metadata.grade) page.metadata.grade.status = "review";
        if (page.metadata.form) page.metadata.form.status = "review";
      }
    }
    if (Object.prototype.hasOwnProperty.call(suggestion, "studentId")) {
      page.studentId = suggestion.studentId;
      page.studentIdWasEdited = false;
      if (page.metadata) (page.metadata.idDigits || []).forEach(function (digit) { digit.status = "review"; });
    }
    aiIdentityPendingConfirmation[pageNumber] = true;
    refreshChoiceIdentityWarnings();
    renderCurrentMode();
  }

  function confirmAdoptedIdentity(pageNumber) {
    var page = state.choicePages[pageNumber];
    if (!page || !aiIdentityPendingConfirmation[pageNumber]) return;
    page.classWasEdited = true;
    page.studentIdWasEdited = true;
    if (page.metadata) {
      if (page.metadata.grade) page.metadata.grade.status = "manual";
      if (page.metadata.form) page.metadata.form.status = "manual";
      (page.metadata.idDigits || []).forEach(function (digit) { digit.status = "manual"; });
    }
    if (!model.choiceIdentityConfirmed(page)) {
      setAiStatus("班別／學號仍未符合範本要求，請核對欄位後再次確認。", true);
      refreshChoiceIdentityWarnings();
      renderCurrentMode();
      return;
    }
    delete aiIdentityPendingConfirmation[pageNumber];
    refreshChoiceIdentityWarnings();
    renderCurrentMode();
  }

  function renderIdentityAiResult(pageNumber, comparison) {
    var container = els.choiceIdentityAiResults;
    container.replaceChildren();
    if (!comparison || !comparison.needsReview || !aiIdentityResults[pageNumber]) return;
    var card = document.createElement("article"); card.className = "choice-identity-ai-result";
    var heading = document.createElement("strong"); heading.textContent = "第 " + pageNumber + " 頁 · 班別／學號 AI 核對";
    var circle = document.createElement("p"); circle.textContent = "AI 圈格讀到：" + comparison.circleText;
    var handwriting = document.createElement("p"); handwriting.textContent = "AI 手寫讀到：" + comparison.handText;
    var local = document.createElement("p"); local.textContent = "本機讀到：班別 " + comparison.local.classText + "／學號 " + comparison.local.numberText;
    card.append(heading, circle, handwriting, local);
    var circleSuggestion = identityAdoption(pageNumber, "grid");
    var handSuggestion = identityAdoption(pageNumber, "handwriting");
    var actions = document.createElement("div"); actions.className = "toolbar-row";
    if (circleSuggestion) {
      var adoptCircle = document.createElement("button"); adoptCircle.type = "button"; adoptCircle.className = "button";
      adoptCircle.textContent = "採用 AI 圈格結果（仍須老師確認）";
      adoptCircle.addEventListener("click", function () { adoptIdentitySuggestion(pageNumber, "grid"); });
      actions.append(adoptCircle);
    }
    if (handSuggestion) {
      var adoptHand = document.createElement("button"); adoptHand.type = "button"; adoptHand.className = "button";
      adoptHand.textContent = "採用 AI 手寫結果（仍須老師確認）";
      adoptHand.addEventListener("click", function () { adoptIdentitySuggestion(pageNumber, "handwriting"); });
      actions.append(adoptHand);
    }
    if (aiIdentityPendingConfirmation[pageNumber]) {
      var confirm = document.createElement("button"); confirm.type = "button"; confirm.className = "button primary";
      confirm.textContent = "確認班別及學號無誤";
      confirm.addEventListener("click", function () { confirmAdoptedIdentity(pageNumber); });
      actions.append(confirm);
    }
    if (actions.childNodes.length) card.append(actions);
    container.append(card);
  }

  function renderChoiceIdentityCrossCheck(sourceCanvas) {
    if (!els.choiceIdentityReview) return;
    els.choiceIdentityReviewPages.replaceChildren();
    els.choiceIdentityReviewCrops.replaceChildren();
    els.choiceIdentityAiResults.replaceChildren();
    if (!state.pdfDoc || !state.template || state.template.kind !== "choice") {
      els.choiceIdentityReviewDetails.hidden = true;
      els.choiceIdentityReview.hidden = true;
      return;
    }
    var warnings = model.choiceIdentityWarnings(state.choicePages, state.pageCount);
    var displayWarnings = {};
    Object.keys(warnings).forEach(function (pageNumber) { displayWarnings[pageNumber] = warnings[pageNumber].slice(); });
    var manualFields = state.template.identity && state.template.identity.manualFields || {};
    var manualStudentDigits = Number(manualFields.studentNumberDigits) || 0;
    var manualPages = [];
    if (manualFields.class || manualStudentDigits > 0) {
      for (var pendingPageNumber = 1; pendingPageNumber <= state.pageCount; pendingPageNumber += 1) {
        var pendingPage = state.choicePages[pendingPageNumber];
        if (isAnswerKeyExcludedPage(pendingPageNumber)) continue;
        var missingClass = Boolean(manualFields.class && (!pendingPage || !pendingPage.classWasEdited || !String(pendingPage.classValue || "").trim()));
        var missingStudent = Boolean(manualStudentDigits > 0 && (!pendingPage || !pendingPage.studentIdWasEdited ||
          String(pendingPage.studentId || "").replace(/\D/g, "").length !== manualStudentDigits));
        if (missingClass || missingStudent) {
          manualPages.push({ pageNumber: pendingPageNumber, classPending: missingClass, studentPending: missingStudent });
          displayWarnings[pendingPageNumber] = (displayWarnings[pendingPageNumber] || []).filter(function (message) {
            return message.indexOf("未確認") < 0;
          });
          if (!displayWarnings[pendingPageNumber].length) delete displayWarnings[pendingPageNumber];
        }
      }
    }
    Object.keys(aiIdentityResults).forEach(function (pageNumber) {
      var comparison = identityComparison(Number(pageNumber));
      if (!comparison || !comparison.needsReview) return;
      if (!displayWarnings[pageNumber]) displayWarnings[pageNumber] = [];
      displayWarnings[pageNumber].push("AI 圈格／手寫結果與本機讀圈不一致或未確認");
    });
    var pageNumberSet = new Set(Object.keys(displayWarnings).map(Number).filter(Number.isInteger));
    manualPages.forEach(function (entry) { pageNumberSet.add(entry.pageNumber); });
    var pageNumbers = Array.from(pageNumberSet).sort(function (a, b) { return a - b; });
    els.choiceIdentityReviewDetails.hidden = pageNumbers.length === 0;
    els.choiceIdentityReviewSummary.textContent = "班別／學號核對（" + pageNumbers.length + "）";
    els.choiceIdentityReview.hidden = pageNumbers.length === 0;
    els.choiceHandwritePending.hidden = manualPages.length === 0;
    if (manualPages.length) {
      els.choiceHandwritePendingText.textContent = "手寫班別／學號：尚有 " + manualPages.length + " 頁未輸入。這是預期的本機核對步驟。";
      els.choiceHandwriteNext.onclick = function () {
        var next = manualPages.find(function (entry) { return entry.pageNumber > state.currentPage; }) || manualPages[0];
        state.currentPage = next.pageNumber;
        renderCurrentMode();
      };
    }
    if (!pageNumbers.length) return;
    pageNumbers.forEach(function (pageNumber) {
      var button = document.createElement("button");
      button.type = "button"; button.className = "choice-identity-review-page";
      var manualPending = manualPages.find(function (entry) { return entry.pageNumber === pageNumber; });
      var pageWarnings = displayWarnings[pageNumber] || [];
      var pageSummary = [];
      if (manualPending) pageSummary.push("手寫" + (manualPending.classPending && manualPending.studentPending ? "班別／學號" : manualPending.classPending ? "班別" : "學號") + "待輸入");
      if (pageWarnings.length) pageSummary.push(pageWarnings.join("；"));
      button.textContent = "第 " + pageNumber + " 頁 · " + pageSummary.join("；");
      button.setAttribute("aria-current", pageNumber === state.currentPage ? "true" : "false");
      button.addEventListener("click", function () {
        state.currentPage = pageNumber;
        renderCurrentMode();
      });
      els.choiceIdentityReviewPages.append(button);
    });
    if (!pageNumbers.includes(state.currentPage)) return;
    renderIdentityAiResult(state.currentPage, identityComparison(state.currentPage));
    if (!sourceCanvas) return;
    var masks = state.template.identity && Array.isArray(state.template.identity.masks) ? state.template.identity.masks : [];
    var textMasks = masks.filter(function (mask) {
      return mask && ["text-name", "text-subject", "text-other"].indexOf(mask.type) >= 0;
    });
    if (!textMasks.length && masks.every(function (mask) { return !mask || !mask.type; })) {
      textMasks = masks.slice();
    }
    if (!textMasks.length) {
      var none = document.createElement("p"); none.className = "muted small";
      none.textContent = "此範本沒有姓名或文字區座標；請按上方頁碼核對本頁，並在班別／學號欄手動修正。";
      els.choiceIdentityReviewCrops.append(none);
      return;
    }
    textMasks.forEach(function (mask, index) {
      if (![mask.x, mask.y, mask.w, mask.h].every(Number.isFinite)) return;
      var left = Math.max(0, Math.floor(mask.x * sourceCanvas.width));
      var top = Math.max(0, Math.floor(mask.y * sourceCanvas.height));
      var right = Math.min(sourceCanvas.width, Math.ceil((mask.x + mask.w) * sourceCanvas.width));
      var bottom = Math.min(sourceCanvas.height, Math.ceil((mask.y + mask.h) * sourceCanvas.height));
      if (left >= right || top >= bottom) return;
      var frame = document.createElement("figure"); frame.className = "choice-identity-review-crop";
      var caption = document.createElement("figcaption"); caption.textContent = mask.label || (index === 0 ? "姓名區" : "文字區 " + (index + 1));
      var crop = document.createElement("canvas");
      var cropWidth = right - left; var cropHeight = bottom - top;
      var factor = Math.min(6, Math.max(1, Math.min(480 / cropWidth, 210 / cropHeight)));
      crop.width = Math.max(1, Math.round(cropWidth * factor)); crop.height = Math.max(1, Math.round(cropHeight * factor));
      var context = crop.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.drawImage(sourceCanvas, left, top, cropWidth, cropHeight, 0, 0, crop.width, crop.height);
      crop.setAttribute("role", "img"); crop.setAttribute("aria-label", "第 " + state.currentPage + " 頁的本機「" + caption.textContent + "」放大裁切");
      frame.append(caption, crop); els.choiceIdentityReviewCrops.append(frame);
    });
  }

  function renderFocusPreview(sourceCanvas, viewport) {
    var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
    var current = focusBrowseEntry() || queue.find(function (entry) { return entry.key === state.focusKey; });
    if (!sourceCanvas || !current || current.kind === "page" || current.pageNumber !== state.currentPage) return;
    var settings = choiceSettings();
    var template = geometry.expandChoiceTemplate(state.template, settings);
    var item = current.item || template.items.find(function (entry) { return entry.type === current.type && entry.number === current.number; });
    if (!item) return;
    var question = current.question || { values: [] };
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
    zoom.setAttribute("aria-label", "第 " + current.pageNumber + " 頁，" + (current.type === "mc" ? "選擇題" : "是非題") +
      "第 " + current.number + " 題，橙框標示該題圈格");
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
      renderChoiceIdentityCrossCheck(null);
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
    if (isAnswerKeyExcludedPage(state.currentPage)) {
      var answerNote = document.createElement("p"); answerNote.className = "empty-state";
      answerNote.textContent = "此頁已標示為答案卷，不會讀圈或計入學生成績。";
      els.choiceStage.replaceChildren(rendered.canvas, answerNote);
      renderChoiceIdentityCrossCheck(null);
      return;
    }
    if (pageRecord) renderChoiceOverlay(els.choiceStage, rendered.canvas, pageRecord, rendered.viewport);
    else {
      els.choiceStage.replaceChildren(rendered.canvas);
      var note = document.createElement("p"); note.className = "empty-state";
      note.textContent = "按「自動讀圈」建立本頁答案及待覆核清單。";
      els.choiceStage.append(note);
    }
    renderFocusPreview(rendered.canvas, rendered.viewport);
    renderChoiceIdentityCrossCheck(rendered.canvas);
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
    renderDictationAiResult();
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
    clearAiSuggestions();
    try {
      setStatus("正在本機開啟 PDF…", els.fileStatus);
      var bytes = new Uint8Array(await file.arrayBuffer());
      var pdf = await window.pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      var digest = await window.crypto.subtle.digest("SHA-256", bytes);
      var fingerprint = Array.from(new Uint8Array(digest)).map(function (value) { return value.toString(16).padStart(2, "0"); }).join("");
      state.pdfBytes = bytes; state.pdfDoc = pdf; state.pdfFingerprint = fingerprint; state.pageCount = pdf.numPages; state.currentPage = 1;
      state.excludedAnswerPage = 0;
      resetAppealLookup("完成讀圈或載入進度及同一 PDF 後即可查詢。");
      if (choiceWizardUI) choiceWizardUI.refreshAnswerSourceAvailability();
      state.demo = Boolean(file.isDemo);
      els.demoBanner.hidden = !state.demo;
      state.choicePages = {};
      state.choiceClassSizeTouched = false;
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
      updatePageSelectors(); renderCurrentMode(); setStep(2); keepChoiceWizardReviewSurfaceVisible();
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
    var excludedPageNumbers = answerKeyExcludedPages();
    state.choicePages = {};
    resetAppealLookup("正在讀圈；完成後即可查詢。");
    var totalQuestions = 0; var totalReviews = 0; var metadataReviewPages = 0; var pageFailureCount = 0;
    els.readOmr.disabled = true;
    try {
      for (var pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
        if (excludedPageNumbers.indexOf(pageNumber) >= 0) continue;
        els.omrStatus.textContent = "正在本機分析第 " + pageNumber + " / " + state.pageCount + " 頁…";
        var rendered = await renderPdfToCanvas(pageNumber, 2.2);
        var template = geometry.expandChoiceTemplate(state.template, { mcCount: settings.mcCount, tfCount: settings.tfCount });
        var fit = omr.gridFit(rendered.data.data, rendered.canvas.width, rendered.canvas.height, template);
        var detected = omr.detectPage(rendered.data.data, rendered.canvas.width, rendered.canvas.height,
          settings.mcCount, settings.tfCount, fit.calibration, fit.metadataCalibration, template);
        var identityRequirements = window.PdfMarkingChoiceWizard.identityRequirements(state.template, detected.identityRequirements);
        var page = {
          questions: detected.questions,
          classValue: detected.classValue,
          studentId: detected.studentId,
          metadata: detected.metadata,
          identityRequirements: identityRequirements,
          calibration: detected.calibration,
          metadataCalibration: detected.metadataCalibration,
          thresholds: detected.thresholds,
          alignmentDiagnostics: detected.alignmentDiagnostics,
          pageFlags: detected.pageFlags,
          pageFailure: detected.pageFailure,
          classWasEdited: false,
          studentIdWasEdited: false
        };
        state.choicePages[pageNumber] = page;
        totalQuestions += page.questions.length;
        if (page.pageFailure) pageFailureCount += 1;
        else totalReviews += page.questions.filter(function (question) { return question.status === "review"; }).length;
        if (!model.choiceIdentityConfirmed(page)) metadataReviewPages += 1;
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
    excludedPageNumbers.forEach(ensureAnswerKeyExcludedPage);
    syncAnswerKeyExcludedPage();
    els.readOmr.disabled = false;
    setStep(3); keepChoiceWizardReviewSurfaceVisible(); updateControls(); renderCurrentMode();
  }

  function confirmFocusedQuestion() {
    var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
    var index = queue.findIndex(function (entry) { return entry.key === state.focusKey; });
    if (index < 0) return;
    var current = queue[index];
    focusBrowseState.active = false;
    state.currentPage = current.pageNumber;
    review.confirmQuestion(current.question);
    var page = state.choicePages[current.pageNumber];
    if (page && Array.isArray(page.pageFlags) && page.pageFlags.indexOf(omr.FORCED_READ_REVIEW_FLAG) >= 0 &&
        !page.questions.some(function (question) { return question.status === "review" && !question.reviewed; })) {
      page.pageFlags = page.pageFlags.filter(function (flag) { return flag !== omr.FORCED_READ_REVIEW_FLAG; });
    }
    var updated = review.buildReviewQueue(state.choicePages, state.pageCount);
    var next = updated[index] || updated[index - 1] || null;
    state.focusKey = next ? next.key : "";
    if (next) state.currentPage = next.pageNumber;
    renderCurrentMode(); updateControls(); updateStepper();
  }

  async function rereadFailedPageForReview() {
    var page = currentChoicePage();
    if (!page || !page.pageFailure || !state.pdfDoc) return;
    els.focusPageReread.disabled = true;
    try {
      var settings = choiceSettings();
      var rendered = await renderPdfToCanvas(state.currentPage, 2.2);
      var expanded = geometry.expandChoiceTemplate(state.template, settings);
      var detected = omr.detectPage(rendered.data.data, rendered.canvas.width, rendered.canvas.height,
        settings.mcCount, settings.tfCount, page.calibration, page.metadataCalibration, expanded, { forceRead: true });
      state.choicePages[state.currentPage] = Object.assign({}, page, {
        questions: detected.questions,
        pageFailure: false,
        alignmentDiagnostics: page.alignmentDiagnostics || detected.alignmentDiagnostics,
        pageFlags: (page.pageFlags || []).filter(function (flag) { return flag !== omr.FORCED_READ_REVIEW_FLAG; })
          .concat([omr.FORCED_READ_REVIEW_FLAG])
      });
      var queue = review.buildReviewQueue(state.choicePages, state.pageCount);
      state.focusKey = queue.length ? queue[0].key : "";
      renderCurrentMode(); updateControls(); updateStepper();
    } catch (error) {
      els.focusReason.textContent = "仍然讀取失敗；原有整頁警告及零分保護已保留。請重新選擇此項再試。";
    } finally {
      els.focusPageReread.disabled = false;
    }
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
    return model.buildChoiceCsv({ pages: state.choicePages, pageCount: state.pageCount, settings: settings,
      excludedPages: state.excludedAnswerPage ? [state.excludedAnswerPage] : [] });
  }

  function buildDictationCsv() {
    var config = getDictationConfig();
    var records = {};
    for (var pageNo = 1; pageNo <= state.pageCount; pageNo += 1) {
      records[pageNo] = dictationScoreRecordForPage(pageNo);
    }
    return model.buildDictationCsv(records, state.pageCount, config.segment);
  }

  function buildCurrentExportData() {
    if (state.mode === "choice") {
      var settings = choiceSettings();
      return { mode: "choice", settings: settings,
        rows: model.buildChoiceRows({ pages: state.choicePages, pageCount: state.pageCount, settings: settings,
          excludedPages: state.excludedAnswerPage ? [state.excludedAnswerPage] : [] }) };
    }
    var config = getDictationConfig();
    var records = {};
    for (var pageNo = 1; pageNo <= state.pageCount; pageNo += 1) records[pageNo] = dictationScoreRecordForPage(pageNo);
    return { mode: "dictation", config: config, rows: model.buildDictationRows(records, state.pageCount, config.segment) };
  }

  function choiceMaximumReadId() {
    var maximum = 0;
    Object.keys(state.choicePages).forEach(function (key) {
      if (isAnswerKeyExcludedPage(key)) return;
      var value = String(state.choicePages[key] && state.choicePages[key].studentId || "").trim();
      if (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))) maximum = Math.max(maximum, Number(value));
    });
    return maximum;
  }

  function previewStatusLabels(data, row) {
    var labels = [];
    var pageNumber = Number(row[0]);
    if (data.mode === "choice") {
      var page = state.choicePages[pageNumber] || state.choicePages[String(pageNumber)] || null;
      if (!String(row[3] == null ? "" : row[3]).trim()) labels.push("分數留空");
      if (Number(row[5]) > 0 || page && page.pageFailure) labels.push("待覆核");
      if (row[6] !== "是") labels.push("班別／學號未確認");
      if (page && (page.classWasEdited || page.studentIdWasEdited ||
          (page.questions || []).some(function (question) { return question.status === "manual"; }))) labels.push("人手調整");
    } else {
      if (row[3] !== "已批改") labels.push("未批改", "分數留空");
      if (row[14] === "是") labels.push("人手調整");
    }
    return labels;
  }

  function compareExportRows(data, left, right) {
    if (state.exportSort === "page") return Number(left[0]) - Number(right[0]);
    var classIndex = data.mode === "choice" ? 1 : -1;
    var studentIndex = 2;
    if (classIndex >= 0) {
      var classOrder = String(left[classIndex] || "").localeCompare(String(right[classIndex] || ""), "zh-Hant", { numeric: true, sensitivity: "base" });
      if (classOrder) return classOrder;
    }
    var studentOrder = String(left[studentIndex] || "").localeCompare(String(right[studentIndex] || ""), "zh-Hant", { numeric: true, sensitivity: "base" });
    return studentOrder || Number(left[0]) - Number(right[0]);
  }

  function sortedExportRows(data) {
    return [data.rows[0]].concat(data.rows.slice(1).sort(function (left, right) { return compareExportRows(data, left, right); }));
  }

  function renderExportPreview() {
    if (!els.exportPreviewHead || !els.exportPreviewBody) return;
    var data;
    try {
      data = buildCurrentExportData();
    } catch (error) {
      data = { mode: state.mode, rows: [] };
      els.exportPreviewNote.textContent = error && error.message ? error.message : "目前設定未能建立預覽。";
    }
    if (!state.choiceClassSizeTouched && data.mode === "choice") els.choiceClassSize.value = String(choiceMaximumReadId());
    els.exportSortClass.classList.toggle("active", state.exportSort === "class-student");
    els.exportSortClass.setAttribute("aria-pressed", state.exportSort === "class-student" ? "true" : "false");
    els.exportSortPage.classList.toggle("active", state.exportSort === "page");
    els.exportSortPage.setAttribute("aria-pressed", state.exportSort === "page" ? "true" : "false");
    els.exportPreviewHead.replaceChildren();
    els.exportPreviewBody.replaceChildren();
    if (!data.rows.length) {
      var failedRow = document.createElement("tr");
      var failedCell = document.createElement("td");
      failedCell.colSpan = 2; failedCell.className = "muted";
      failedCell.textContent = els.exportPreviewNote.textContent || "目前未能建立預覽。";
      failedRow.appendChild(failedCell); els.exportPreviewBody.appendChild(failedRow);
      return;
    }
    els.exportPreviewNote.textContent = "資料欄與下載分數 CSV 共用同一組列；頁碼旁的提示只供畫面辨識，不會加入複製或下載。";
    data.rows[0].forEach(function (value) {
      var heading = document.createElement("th"); heading.scope = "col"; heading.textContent = String(value);
      els.exportPreviewHead.appendChild(heading);
    });
    if (data.rows.length === 1) {
      var empty = document.createElement("tr"); var emptyCell = document.createElement("td");
      emptyCell.colSpan = data.rows[0].length; emptyCell.className = "muted";
      emptyCell.textContent = state.pdfDoc ? "尚無成績列。" : "載入 PDF 並讀取／批改後，這裏會顯示預覽。";
      empty.appendChild(emptyCell); els.exportPreviewBody.appendChild(empty); return;
    }
    sortedExportRows(data).slice(1).forEach(function (row) {
      var tableRow = document.createElement("tr");
      tableRow.tabIndex = 0; tableRow.setAttribute("role", "button");
      var labels = previewStatusLabels(data, row);
      tableRow.setAttribute("aria-label", "前往第 " + String(row[0]) + " 頁覆核" + (labels.length ? "；" + labels.join("、") : ""));
      tableRow.dataset.page = String(row[0]);
      row.forEach(function (value, columnIndex) {
        var cell = document.createElement("td");
        cell.dataset.exportValue = String(value == null ? "" : value);
        cell.textContent = String(value == null ? "" : value);
        if (columnIndex === 0 && labels.length) {
          labels.forEach(function (label) {
            var badge = document.createElement("span"); badge.className = "preview-status-label"; badge.textContent = label;
            cell.appendChild(badge);
          });
        }
        tableRow.appendChild(cell);
      });
      tableRow.addEventListener("click", function () { openExportPreviewPage(Number(tableRow.dataset.page)); });
      tableRow.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openExportPreviewPage(Number(tableRow.dataset.page)); }
      });
      els.exportPreviewBody.appendChild(tableRow);
    });
  }

  function openExportPreviewPage(pageNumber) {
    if (!state.pdfDoc || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > state.pageCount) return;
    state.currentPage = pageNumber;
    setStep(3); renderCurrentMode();
    window.requestAnimationFrame(function () { els.step3.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }

  function copyFallback(text, label, reason) {
    els.copyFallbackWrap.hidden = false;
    els.copyFallbackLabel.textContent = label + "；剪貼簿不可用（" + reason + "），請手動複製以下內容。";
    els.copyFallback.value = text;
    els.copyFallback.focus(); els.copyFallback.select();
    setStatus("內容已選取；請使用複製指令手動複製。", els.exportStatus);
  }

  async function copyExportText(text, label) {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("瀏覽器未提供剪貼簿權限");
      await navigator.clipboard.writeText(text);
      els.copyFallbackWrap.hidden = true;
      setStatus(label + "已複製到剪貼簿。", els.exportStatus);
    } catch (error) {
      copyFallback(text, label, error && error.message ? error.message : "權限被拒");
    }
  }

  function copyAllExportRows() {
    if (state.mode === "choice") {
      var settings = choiceSettings();
      if (!settings.valid) { setStatus(settings.message || "請先輸入完整答案。", els.exportStatus); return; }
      if (!confirmChoiceExport(settings)) return;
    }
    var data = buildCurrentExportData();
    copyExportText(model.serializeTsv(sortedExportRows(data)), "全表 TSV ");
  }

  function copyChoiceRoster() {
    var settings = choiceSettings();
    if (!settings.valid) { setStatus(settings.message || "請先輸入完整答案。", els.exportStatus); return; }
    var result = model.buildChoiceRosterTsv({ pages: state.choicePages, pageCount: state.pageCount, settings: settings,
      classSize: Number(els.choiceClassSize.value), excludedPages: state.excludedAnswerPage ? [state.excludedAnswerPage] : [] });
    if (!result.ok) {
      var duplicateDetail = (result.duplicates || []).map(function (entry) {
        return "學號 " + entry.studentId + "：第 " + entry.pages.join("、") + " 頁";
      }).join("；");
      window.alert(duplicateDetail || result.reason || "無法建立按學號作答列。");
      setStatus(result.reason || "無法建立按學號作答列。", els.exportStatus); return;
    }
    var confirmations = [];
    if (result.identityPages.length) confirmations.push("班別／學號未確認：第 " + result.identityPages.join("、") + " 頁");
    if (result.pendingPages.length) confirmations.push("題目仍待覆核：第 " + result.pendingPages.join("、") + " 頁");
    if (result.overflowPages.length) confirmations.push("學號超出全班人數設定，將不會複製：第 " + result.overflowPages.join("、") + " 頁");
    if (confirmations.length && !window.confirm(confirmations.join("\n") + "\n仍要複製嗎？")) return;
    copyExportText(result.text, "按學號作答 TSV ");
  }

  async function exportXlsx() {
    if (state.mode === "choice") {
      var settings = choiceSettings();
      if (!settings.valid) { setStatus(settings.message || "請先輸入完整答案。", els.exportStatus); return; }
      if (!confirmChoiceExport(settings)) return;
    }
    try {
      var data = buildCurrentExportData();
      var numericColumns = data.mode === "choice" ? [0, 3, 4, 5] : [0, 1, 4, 5, 6, 7, 8, 10, 11, 12, 13];
      var bytes = await model.buildXlsx(data.rows, numericColumns, "blob");
      var name = data.mode === "choice" ? "pdf-marking-choice-scores.xlsx" : "pdf-marking-dictation-scores.xlsx";
      createDownload(downloadName(name), bytes);
      setStatus("XLSX 已使用本機 SpreadsheetML 產生，下載已開始。", els.exportStatus);
    } catch (error) {
      setStatus(error && error.message ? error.message : "XLSX 匯出失敗。", els.exportStatus);
    }
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
    var currentSettings = choiceSettings();
    var pageTemplate = geometry.expandChoiceTemplate(state.template, {
      mcCount: currentSettings.mcCount, tfCount: currentSettings.tfCount
    });
    var cal = source.calibration || {};
    var affine = omr.normalizeAffine(cal.affine, pageTemplate);
    var calibration = { dx: Number(cal.dx) || 0, dy: Number(cal.dy) || 0,
      angle: Number(cal.angle) || 0, scale: Number(cal.scale) || 1 };
    if (affine) calibration.affine = affine;
    var requirements = window.PdfMarkingChoiceWizard.identityRequirements(state.template, {
      grade: identityFields.some(function (field) { return field.id === "class-grade"; }),
      form: identityFields.some(function (field) { return field.id === "class-form"; }),
      studentDigits: (identityFields.find(function (field) { return field.id === "student-number"; }) || { digits: 0 }).digits
    });
    var questions = Array.isArray(source.questions) ? source.questions.map(function (entry) {
      var type = entry.type === "tf" ? "tf" : "mc";
      var number = Number(entry.number) || 0;
      var item = pageTemplate.items.find(function (candidate) { return candidate.type === type && candidate.number === number; });
      var optionCount = item ? item.choices.length : (questionBlock(type) || { options: [] }).options.length;
      return {
        type: type, number: number,
        answer: normalizeTemplateAnswer(entry.answer, type),
        status: ["read", "review", "blank", "manual"].indexOf(entry.status) >= 0 ? entry.status : "review",
        reason: String(entry.reason || ""), reviewed: Boolean(entry.reviewed), focusDraftEdited: Boolean(entry.focusDraftEdited), values: Array.isArray(entry.values) ? entry.values.map(Number).slice(0, optionCount) : [],
        localOffsets: Array.isArray(entry.localOffsets) ? entry.localOffsets.slice(0, optionCount).map(function (offset, index) {
          var dx = Number(offset && offset.dx); var dy = Number(offset && offset.dy);
          return geometry.clampAffineLocalOffset(item && item.choices[index], affine,
            { dx: Number.isFinite(dx) ? dx : 0, dy: Number.isFinite(dy) ? dy : 0 }, 0.01);
        }) : []
      };
    }) : [];
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
      calibration: calibration,
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
        return ["定位校正幅度較大，請檢查整頁對齊", "定位校正後仍有較大殘差，請檢查整頁對齊",
          "班別讀取未確認", "學號讀取未確認",
          "整頁定位失敗：可能是空白頁、方向錯誤或分組位置不符，請核對本頁",
          omr.FORCED_READ_REVIEW_FLAG, ANSWER_KEY_EXCLUDED_FLAG].indexOf(flag) >= 0;
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
      resetAppealLookup("進度已載入；請輸入班別及學號或直接選頁碼。");
      syncAnswerKeyExcludedPage();
      refreshChoiceIdentityWarnings();
      state.mode = "choice";
      if (choiceWizardUI) choiceWizardUI.refreshAnswerSourceAvailability();
      setStatus("已載入進度 JSON（不包含 PDF）。", els.exportStatus);
      renderCurrentMode(); updateControls();
      if (state.choiceWizardActive && state.choiceWizardStage === 5 && Object.keys(state.choicePages).length) {
        setStep(3); keepChoiceWizardReviewSurfaceVisible();
      }
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
      state.choicePages = {}; syncAnswerKeyExcludedPage(); state.dictationPages = {}; state.legacyDictationPages = {}; state.dictationSegments = {}; state.focusKey = "";
    }
    state.template = nextTemplate; state.mode = nextTemplate.kind;
    templateStore.savePreference(window, nextTemplate.id);
    preferredTemplateId = nextTemplate.id;
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

  var choiceWizardUI = null;
  var aiSettingsPanel = byId("ai-review-settings");
  var aiSettingsHome = aiSettingsPanel.parentNode;
  var aiSettingsNext = aiSettingsPanel.nextSibling;
  function placeAiSettingsForWizard(stage) {
    if (stage === 2) byId("choice-wizard-ai-settings-slot").append(aiSettingsPanel);
    else if (stage === 4) byId("choice-answer-ai-settings-slot").append(aiSettingsPanel);
    else if (aiSettingsPanel.parentNode !== aiSettingsHome) aiSettingsHome.insertBefore(aiSettingsPanel, aiSettingsNext);
  }
  var legacyStepHome = els.step2.parentNode;
  var legacyStep3Next = els.step3.nextSibling;
  var exportPanel = document.querySelector(".export-panel");
  var exportPanelHome = exportPanel.parentNode;
  var exportPanelNext = exportPanel.nextSibling;
  function moveLegacyStepsToWizard() {
    var slot = byId("choice-wizard-grade-slot");
    slot.append(els.step2, els.step3);
  }
  function restoreLegacySteps() {
    legacyStepHome.insertBefore(els.step3, legacyStep3Next);
    legacyStepHome.insertBefore(els.step2, els.step3);
  }
  function moveExportPanelToWizard() {
    byId("choice-wizard-export-slot").append(exportPanel);
  }
  function restoreExportPanel() {
    exportPanelHome.insertBefore(exportPanel, exportPanelNext);
  }

  var templateEditorUI = window.PdfMarkingTemplateEditorUI.create({
    templates: templates,
    geometry: geometry,
    omr: omr,
    editor: window.PdfMarkingTemplateEditor,
    getSelectedTemplate: function () { return state.template || templateById(state.templateId); },
    onSave: function (definition) {
      var next = customTemplates.filter(function (entry) { return entry.id !== definition.id; });
      next.push(definition);
      var saved = templateStore.saveTemplates(window, templates, next);
      if (!saved.ok) return saved;
      customTemplates = next;
      state.templateId = definition.id;
      state.template = definition;
      state.mode = "choice";
      templateStore.savePreference(window, definition.id);
      preferredTemplateId = definition.id;
      configureTemplateMode(definition);
      if (choiceWizardUI) choiceWizardUI.onTemplateSaved(definition);
      return { ok: true, template: definition, message: saved.message };
    },
    onExport: function (definition) {
      var text = templates.serializeTemplate(definition);
      var safeId = definition.id.replace(/[^a-z0-9._-]/gi, "-");
      createDownload(downloadName("pdf-marking-template-" + safeId + ".json"), new Blob([text], { type: "application/json;charset=utf-8" }));
    },
    onClose: function () {
      if (choiceWizardUI) choiceWizardUI.onEditorClosed();
      renderTemplateList(); updateStepper();
    }
  });

  choiceWizardUI = window.PdfMarkingChoiceWizardUI.create({
    templates: templates,
    geometry: geometry,
    omr: omr,
    getTemplates: function () { return templates.BUILTIN_TEMPLATES.concat(customTemplates); },
    getSelectedTemplate: function () { return state.template || templateById(state.templateId); },
    getPreferredTemplateId: function () { return preferredTemplateId; },
    getEditorDraft: function () { return templateEditorUI.getDraft(); },
    getEditorContext: function () { return templateEditorUI.getContext(); },
    hasEditorUnsavedChanges: function () { return templateEditorUI.hasUnsavedChanges(); },
    isTemplateSaved: function (id) { return Boolean(findTemplateById(id)); },
    getAiSettings: function () {
      return { ready: aiReady() && !aiMemory.busy, provider: aiMemory.provider,
        providerLabel: providerLabel(aiMemory.provider), model: aiMemory.model };
    },
    getCurrentPdf: function () { return { document: state.pdfDoc, pageCount: state.pageCount }; },
    getExcludedAnswerPage: function () { return state.excludedAnswerPage; },
    setAnswerPageExcluded: function (pageNumber, excluded) {
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > state.pageCount) return;
      if (excluded) {
        Object.keys(state.choicePages).forEach(function (key) {
          state.choicePages[key] = model.setAnswerKeyExcludedFlag(state.choicePages[key], false);
        });
        state.excludedAnswerPage = pageNumber;
        ensureAnswerKeyExcludedPage(pageNumber);
      } else if (state.choicePages[pageNumber]) {
        state.choicePages[pageNumber] = model.setAnswerKeyExcludedFlag(state.choicePages[pageNumber], false);
        if (state.excludedAnswerPage === pageNumber) {
          state.excludedAnswerPage = 0;
          syncAnswerKeyExcludedPage();
        }
      } else if (state.excludedAnswerPage === pageNumber) {
        state.excludedAnswerPage = 0;
      }
      renderCurrentMode(); updateControls();
    },
    requestAiAnswerKey: async function (image, questionCount, allowedOptions) {
      if (!aiReady() || aiMemory.busy) return { ok: false, message: "AI 覆核設定未就緒；沒有送出圖片。" };
      aiMemory.busy = true; updateAiControls();
      try {
        return await aiReview.request(aiMemory.provider, aiMemory.model, aiMemory.credential,
          "answerKey", image, allowedOptions, undefined, { questionCount: questionCount, allowedOptions: allowedOptions });
      } finally {
        aiMemory.busy = false; updateAiControls();
      }
    },
    createLayoutImage: function (canvas, definition) {
      return aiReview.createMaskedLayoutImage(canvas, definition, { templates: templates, geometry: geometry,
        calibration: { dx: 0, dy: 0, angle: 0, scale: 1 } });
    },
    requestAiLayout: async function (image) {
      if (!aiReady() || aiMemory.busy) return { ok: false, message: "AI 覆核設定未就緒；沒有送出圖片。" };
      aiMemory.busy = true; updateAiControls();
      try {
        return await aiReview.request(aiMemory.provider, aiMemory.model, aiMemory.credential,
          "layout", image, image.redactedRects);
      } finally {
        aiMemory.busy = false; updateAiControls();
      }
    },
    saveTemplate: function () {
      var button = byId("template-editor-save");
      if (!button || button.disabled) {
        byId("choice-wizard-template-save-status").textContent = "請先完成範本位置設定。";
        return;
      }
      button.click();
      byId("choice-wizard-template-save-status").textContent = byId("template-editor-status").textContent;
    },
    exportTemplate: function () {
      var button = byId("template-editor-export");
      if (!button || button.disabled) {
        byId("choice-wizard-template-save-status").textContent = "請先完成範本位置設定。";
        return;
      }
      button.click();
      byId("choice-wizard-template-save-status").textContent = byId("template-editor-status").textContent;
    },
    importTemplate: function (file, input) {
      importTemplateFile(file, { input: input, choiceOnly: true, onImported: function (definition) {
        if (choiceWizardUI) choiceWizardUI.onTemplateImported(definition);
      } });
    },
    createReorderedTemplateCopy: createReorderedTemplateCopy,
    setNumbering: function (type, numbering) { return templateEditorUI.setNumbering(type, numbering); },
    hasLoadedPdf: function () { return Boolean(state.pdfDoc); },
    hasChoiceReadings: function () { return Object.keys(state.choicePages).length > 0; },
    openEditor: function (definition, sampleFile) {
      templateEditorUI.open(definition);
      templateEditorUI.loadSample(sampleFile);
    },
    loadEditorSample: function (sampleFile) { templateEditorUI.loadSample(sampleFile); },
    onSelectTemplate: function (definition, selectionOptions) {
      if (!definition || definition.kind !== "choice") return false;
      var preserveAnswers = Boolean(selectionOptions && selectionOptions.preserveAnswers);
      var changed = state.templateId !== definition.id;
      var hasWork = Object.keys(state.choicePages).length > 0;
      if (changed && state.pdfDoc && hasWork && !window.confirm("更換範本會清除目前選擇題讀圈結果；PDF 仍會保留。要繼續嗎？")) return false;
      if (changed && state.pdfDoc && hasWork) {
        state.choicePages = {}; syncAnswerKeyExcludedPage(); state.focusKey = "";
        if (preserveAnswers) els.omrStatus.textContent = "範本已更換，請重新讀圈。";
      }
      state.templateId = definition.id; state.template = definition; state.mode = "choice";
      templateStore.savePreference(window, definition.id);
      preferredTemplateId = definition.id;
      configureTemplateMode(definition);
      var mc = definition.blocks.find(function (block) { return block.type === "mc"; });
      var tf = definition.blocks.find(function (block) { return block.type === "tf"; });
      if (changed && !preserveAnswers) {
        els.mcCount.value = String(mc ? mc.maxCount : 0);
        els.tfCount.value = String(tf ? tf.maxCount : 0);
        els.mcKey.value = ""; els.tfKey.value = "";
      }
      renderTemplateList(); renderCurrentMode(); updateStepper();
      return true;
    },
    onWizardStage: function (stage) {
      placeAiSettingsForWizard(stage);
      state.choiceWizardActive = true;
      state.choiceWizardStage = stage;
      if (stage >= 5) {
        moveLegacyStepsToWizard();
        moveExportPanelToWizard();
        setStep(state.pdfDoc ? 3 : 2);
        if (stage === 6) els.step3.hidden = true;
        else keepChoiceWizardReviewSurfaceVisible();
      } else {
        restoreExportPanel();
        restoreLegacySteps();
        setStep(1);
      }
    },
    onWizardHome: function () {
      placeAiSettingsForWizard(0);
      restoreExportPanel();
      restoreLegacySteps();
      state.choiceWizardActive = true;
      state.choiceWizardStage = 0;
      setStep(1);
    },
    onShowLegacy: function (mode, definition) {
      placeAiSettingsForWizard(0);
      restoreExportPanel();
      restoreLegacySteps();
      state.choiceWizardActive = false; state.choiceWizardStage = 0;
      if (mode === "choice" && definition) {
        state.templateId = definition.id; state.template = definition; state.mode = "choice";
        configureTemplateMode(definition); setStep(2); renderCurrentMode();
      } else {
        setMode("dictation"); setStep(1); renderCurrentMode();
      }
      updateStepper();
    }
  });

  function templateSummary(definition) {
    if (definition.kind === "choice") {
      return definition.blocks.map(function (block) {
        return block.label + "最多 " + block.maxCount + " 題（" + block.options.join("／") + "）";
      }).join("；") + "；身份遮蔽區 " + ((definition.identity && definition.identity.masks) || []).length + " 個";
    }
    return "默書 " + definition.segments.length + " 段；印刷格線定位；沿用 GAS 半分制";
  }

  async function importTemplateFile(file, importOptions) {
    if (!file) return;
    var settings = importOptions || {};
    var input = settings.input || els.templateFile;
    var status = settings.choiceOnly ? byId("choice-wizard-source-status") : els.templateStatus;
    try {
      var parsed = templates.parseTemplateJson(await file.text());
      if (!parsed.ok) {
        status.textContent = parsed.errors.join(" ");
        return;
      }
      var incoming = parsed.template;
      if (settings.choiceOnly && incoming.kind !== "choice") {
        status.textContent = "此匯入位置只接受選擇題範本 JSON。";
        return;
      }
      var existing = findTemplateById(incoming.id);
      var preview = "範本預覽：「" + incoming.name + "」\n" + templateSummary(incoming) +
        (parsed.warnings && parsed.warnings.length ? "\n提示：" + parsed.warnings.join(" ") : "") + "\n按確定加入範本清單。";
      if (existing && (existing.source !== "custom" || !window.confirm(preview + "\n\n相同 ID 的自訂範本已存在，確定取代？"))) return;
      if (!existing && !window.confirm(preview)) return;
      customTemplates = customTemplates.filter(function (definition) { return definition.id !== incoming.id; });
      customTemplates.push(incoming);
      var saved = templateStore.saveTemplates(window, templates, customTemplates);
      renderTemplateList();
      showTemplateOrderWarning(incoming);
      status.textContent = "範本已加入。" + (saved.ok ? saved.message : saved.message + " 請匯出 JSON 保留副本。");
      if (typeof settings.onImported === "function") settings.onImported(incoming);
    } catch (error) {
      status.textContent = error && error.message ? error.message : "範本檔無法讀取。";
    } finally {
      input.value = "";
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
    resetAppealLookup("完成讀圈或載入進度及同一 PDF 後即可查詢。");
    clearAiSuggestions();
    els.demoBanner.hidden = true;
    state.pdfBytes = null; state.pdfDoc = null; state.pdfFingerprint = ""; state.pageCount = 0; state.currentPage = 1;
    state.choicePages = {}; state.excludedAnswerPage = 0; state.choiceClassSizeTouched = false; state.dictationPages = {}; state.legacyDictationPages = {}; state.dictationSegments = {}; state.dictationUndo = []; state.focusKey = "";
    els.pdfFile.value = ""; els.fileStatus.textContent = "尚未載入 PDF"; els.pageCount.textContent = ""; els.fileDot.classList.remove("ready");
    els.omrStatus.textContent = "示範已結束；可選擇自己的本機 PDF。";
    renderCurrentMode(); setStep(1); updateControls(); updateStepper();
  }

  els.pdfFile.addEventListener("change", function () { loadPdf(els.pdfFile.files[0]); });
  els.clearPdf.addEventListener("click", function () {
    clearAiSuggestions();
    resetAppealLookup("完成讀圈或載入進度及同一 PDF 後即可查詢。");
    state.demo = false; els.demoBanner.hidden = true;
    state.pdfBytes = null; state.pdfDoc = null; state.pdfFingerprint = ""; state.pageCount = 0; state.currentPage = 1;
    state.choicePages = {}; state.excludedAnswerPage = 0; state.choiceClassSizeTouched = false; state.dictationPages = {}; state.legacyDictationPages = {}; state.dictationSegments = {}; state.dictationUndo = []; state.dictationSegment = 1; state.focusKey = "";
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
  els.appealSearch.addEventListener("click", searchAppealStudent);
  els.appealStudentId.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); searchAppealStudent(); }
  });
  els.appealPage.addEventListener("change", function () {
    if (els.appealPage.value) renderAppealPage(Number(els.appealPage.value));
  });
  els.appealShowReadZones.addEventListener("change", function () {
    els.appealCropOverlay.hidden = !els.appealShowReadZones.checked || els.appealQuestionDetail.hidden;
  });
  els.appealPrevQuestion.addEventListener("click", function () { moveAppealQuestion(-1); });
  els.appealNextQuestion.addEventListener("click", function () { moveAppealQuestion(1); });
  els.appealQuestionFilter.addEventListener("change", function () { renderAppealQuestionBrowser(); });
  els.startDictation.addEventListener("click", function () { if (state.pdfDoc) { setStep(3); renderCurrentMode(); } });
  els.useTemplate.addEventListener("click", useSelectedTemplate);
  els.editTemplateLayout.addEventListener("click", function () {
    if (choiceWizardUI && state.choiceWizardActive) choiceWizardUI.openSelectedTemplateEditor();
    else templateEditorUI.open(templateById(state.templateId));
  });
  els.exportTemplate.addEventListener("click", exportSelectedTemplate);
  els.deleteTemplate.addEventListener("click", deleteSelectedTemplate);
  els.templateFile.addEventListener("change", function () { importTemplateFile(els.templateFile.files[0]); });
  els.templateOrderRepair.addEventListener("click", function () {
    var result = createReorderedTemplateCopy(pendingColumnOrderTemplate);
    if (!result.ok) { els.templateStatus.textContent = result.message; return; }
    var hadReadResults = Object.keys(state.choicePages).length > 0;
    state.templateId = result.template.id;
    useSelectedTemplate();
    if (!state.template || state.template.id !== result.template.id) {
      els.templateStatus.textContent = "已建立修正版副本；本次沒有更換目前範本。";
      return;
    }
    var message = "已改用『" + result.template.name + "』；原範本保留在範本清單。";
    if (hadReadResults) {
      message += " 範本已更換，請重新讀圈。";
      els.omrStatus.textContent = "範本已更換，請重新讀圈。";
    }
    els.templateStatus.textContent = message;
    showTemplateOrderWarning(result.template);
  });
  els.demoStart.addEventListener("click", function () {
    if (choiceWizardUI && state.choiceWizardActive) choiceWizardUI.showLegacy("choice");
    startDemo();
  });
  els.endDemo.addEventListener("click", endDemo);
  els.aiEnabled.addEventListener("change", function () {
    aiMemory.enabled = Boolean(els.aiEnabled.checked);
    setAiStatus(aiMemory.enabled ? "AI 覆核已開啟；每次送出前仍會先確認裁切圖張數。" : "AI 覆核已關閉；PDF 仍只在本機處理。", false);
    updateAiControls();
  });
  els.aiProvider.addEventListener("change", function () {
    var previousDefault = defaultModel(aiMemory.provider);
    aiMemory.provider = els.aiProvider.value === "minimax" ? "minimax" : "gemini";
    if (els.aiModel.value.trim() === previousDefault) els.aiModel.value = defaultModel(aiMemory.provider);
    aiMemory.model = els.aiModel.value.trim();
    updateAiControls();
  });
  els.aiModel.addEventListener("input", function () {
    aiMemory.model = els.aiModel.value.trim();
    updateAiControls();
  });
  els.aiKey.addEventListener("input", function () {
    aiMemory.credential = els.aiKey.value;
    updateAiControls();
  });
  els.aiClearKey.addEventListener("click", function () {
    aiMemory.credential = "";
    els.aiKey.value = "";
    clearAiSuggestions();
    setAiStatus("API key 已清除；沒有寫入瀏覽器儲存。", false);
    updateAiControls();
  });
  els.aiTest.addEventListener("click", testAiConnection);
  els.aiChoiceCurrent.addEventListener("click", function () { runChoiceAi(false); });
  els.aiChoiceAll.addEventListener("click", function () { runChoiceAi(true); });
  els.aiIdentityCurrent.addEventListener("click", function () { runIdentityAi(false); });
  els.aiIdentityAll.addEventListener("click", function () { runIdentityAi(true); });
  els.aiDictationCurrent.addEventListener("click", function () { runDictationAi(false); });
  els.aiDictationAll.addEventListener("click", function () { runDictationAi(true); });
  els.stepPills.forEach(function (pill) { pill.addEventListener("click", function () { setStep(Number(pill.dataset.step)); renderCurrentMode(); }); });
  els.focusConfirm.addEventListener("click", confirmFocusedQuestion);
  els.focusPageReread.addEventListener("click", rereadFailedPageForReview);
  els.focusBrowseStart.addEventListener("click", startFocusBrowse);
  els.focusBrowsePrev.addEventListener("click", function () { moveFocusBrowse(-1); });
  els.focusBrowseNext.addEventListener("click", function () { moveFocusBrowse(1); });
  els.focusBrowseReturn.addEventListener("click", returnToPendingFocus);
  window.addEventListener("keydown", function (event) {
    var target = event.target;
    var isTextControl = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && state.step === 3 && state.mode === "choice" && !isTextControl &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault(); moveFocusBrowse(event.key === "ArrowUp" ? -1 : 1); return;
    }
    if (event.key !== "Enter" || state.step !== 3 || state.mode !== "choice") return;
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
      renderExportPreview();
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
  els.dictationAnswer.addEventListener("input", function () { clearAiSuggestions(); getDictationConfig(); renderCurrentMode(); });
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
    renderExportPreview();
  });
  els.exportPdf.addEventListener("click", exportCurrentPdf);
  els.exportCsv.addEventListener("click", exportCsv);
  els.copyExportTsv.addEventListener("click", copyAllExportRows);
  els.copyChoiceRoster.addEventListener("click", copyChoiceRoster);
  els.exportXlsx.addEventListener("click", exportXlsx);
  els.exportSortClass.addEventListener("click", function () { state.exportSort = "class-student"; renderExportPreview(); });
  els.exportSortPage.addEventListener("click", function () { state.exportSort = "page"; renderExportPreview(); });
  els.choiceClassSize.addEventListener("input", function () { state.choiceClassSizeTouched = true; renderExportPreview(); });
  els.downloadProgress.addEventListener("click", function () {
    var progress = currentProgress();
    createDownload(downloadName("pdf-marking-progress.json"), new Blob([JSON.stringify(progress, null, 2)], { type: "application/json;charset=utf-8" }));
    setStatus("進度 JSON 已下載；不包含 PDF 或學生姓名。");
  });
  els.progressFile.addEventListener("change", function () { loadProgress(els.progressFile.files[0]); els.progressFile.value = ""; });
  window.addEventListener("resize", function () { if (state.pdfDoc) renderCurrentMode(); });
  window.addEventListener("pdf-marking:templates-updated", function () {
    customTemplates = templateStore.load(window, templates).templates;
    renderTemplateList();
    if (choiceWizardUI) choiceWizardUI.refreshTemplates();
  });

  aiMemory.provider = els.aiProvider.value === "minimax" ? "minimax" : "gemini";
  aiMemory.model = els.aiModel.value.trim();
  renderTemplateList(); configureTemplateMode(); setStep(1); renderCurrentMode(); updateControls(); updateStepper();
  choiceWizardUI.start();
})();
