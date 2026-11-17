(function (root) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var COLORS = {
    "class-grade": "#176b87", "class-form": "#387b42", "student-number": "#a45b16",
    mc: "#236ba6", tf: "#744aa3"
  };

  function create(options) {
    var templates = options.templates;
    var geometry = options.geometry;
    var omr = options.omr;
    var editor = options.editor;
    var elements = {};
    [
      "template-selection-panel", "template-editor-panel", "edit-template-layout", "template-editor-close",
      "template-editor-copy-note", "template-editor-pdf-file", "template-editor-page-number", "template-editor-group",
      "template-editor-option-spacing", "template-editor-row-spacing", "template-editor-all-columns-wrap",
      "template-editor-all-columns", "template-editor-undo", "template-editor-reset", "template-editor-test",
      "template-editor-canvas", "template-editor-overlay", "template-editor-empty", "template-editor-page-status",
      "template-editor-result", "template-editor-name", "template-editor-save", "template-editor-export", "template-editor-status"
    ].forEach(function (id) { elements[id] = document.getElementById(id); });

    var session = null;
    var sampleBytes = null;
    var sampleDocument = null;
    var samplePage = null;
    var sampleViewport = null;
    var sampleRenderTask = null;
    var renderToken = 0;
    var detectedResult = null;
    var undoStack = [];
    var drag = null;
    var controlEdit = null;

    function clone(value) { return editor.clone(value); }
    function svgElement(name, attributes) {
      var node = document.createElementNS(SVG_NS, name);
      Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, String(attributes[key])); });
      return node;
    }
    function setStatus(message, isError) {
      elements["template-editor-status"].textContent = message || "";
      elements["template-editor-status"].classList.toggle("is-error", Boolean(isError));
    }
    function selectedGroup() {
      return session ? editor.listGroups(session.draft).find(function (group) {
        return group.id === elements["template-editor-group"].value;
      }) || null : null;
    }
    function isDirty() {
      return Boolean(session && (JSON.stringify(session.draft) !== JSON.stringify(session.resetDraft) ||
        elements["template-editor-name"].value !== session.resetDraft.name));
    }
    function pushUndo(definition) {
      undoStack.push(clone(definition));
      if (undoStack.length > 100) undoStack.shift();
      elements["template-editor-undo"].disabled = undoStack.length === 0;
    }
    function resetTest() {
      detectedResult = null;
      elements["template-editor-result"].textContent = "調整範本後請重新測試讀圈。";
    }
    function updateValidation() {
      if (!session) return;
      var validation = templates.validateTemplate(session.draft);
      var name = elements["template-editor-name"].value.trim();
      var nameValid = name.length > 0 && name.length <= 100;
      elements["template-editor-save"].disabled = !validation.ok || !nameValid;
      if (!validation.ok) setStatus("目前位置未能通過範本驗證：" + validation.errors.join(" "), true);
      else if (!nameValid) setStatus("請輸入 1 至 100 字的範本名稱。", true);
      else if (elements["template-editor-status"].classList.contains("is-error")) setStatus("目前範本符合格式及座標範圍驗證。", false);
    }
    function renderControls() {
      if (!session) return;
      var groups = editor.listGroups(session.draft);
      var previous = elements["template-editor-group"].value;
      elements["template-editor-group"].replaceChildren();
      groups.forEach(function (group) {
        var option = document.createElement("option");
        option.value = group.id; option.textContent = group.label;
        elements["template-editor-group"].append(option);
      });
      elements["template-editor-group"].disabled = groups.length === 0;
      elements["template-editor-group"].value = groups.some(function (group) { return group.id === previous; }) ? previous : groups[0].id;
      var group = selectedGroup();
      var spacing = group ? editor.groupSpacing(session.draft, group.id) : { optionSpacing: null, rowSpacing: null };
      var optionInput = elements["template-editor-option-spacing"];
      var rowInput = elements["template-editor-row-spacing"];
      optionInput.disabled = spacing.optionSpacing == null;
      rowInput.disabled = spacing.rowSpacing == null;
      optionInput.value = spacing.optionSpacing == null ? "" : spacing.optionSpacing.toFixed(4);
      rowInput.value = spacing.rowSpacing == null ? "" : spacing.rowSpacing.toFixed(4);
      elements["template-editor-all-columns-wrap"].hidden = !group || group.kind !== "mc-column";
      elements["template-editor-undo"].disabled = undoStack.length === 0;
      elements["template-editor-reset"].disabled = !session;
      elements["template-editor-test"].disabled = !samplePage;
      renderOverlay();
      updateValidation();
    }
    function drawLabel(svg, x, y, text, color) {
      var label = svgElement("text", { x: Math.max(4, x), y: Math.max(15, y), fill: color, class: "template-editor-label" });
      label.textContent = text;
      svg.append(label);
    }
    function drawCircle(svg, point, radius, color, className, titleText) {
      var circle = svgElement("circle", {
        cx: point.x, cy: point.y, r: radius, stroke: color, class: className,
        "data-template-type": point.type || ""
      });
      if (titleText) {
        var title = svgElement("title"); title.textContent = titleText; circle.append(title);
      }
      svg.append(circle);
    }
    function renderOverlay() {
      var svg = elements["template-editor-overlay"];
      svg.replaceChildren();
      if (!session || !samplePage || !sampleViewport) {
        svg.setAttribute("viewBox", "0 0 1 1"); svg.hidden = true;
        return;
      }
      var width = sampleViewport.width; var height = sampleViewport.height;
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      svg.hidden = false;
      var definition = session.draft;
      var masks = editor.listMasks(definition);
      masks.forEach(function (mask) {
        var rect = svgElement("rect", {
          x: mask.x * width, y: mask.y * height, width: mask.w * width, height: mask.h * height,
          class: "template-editor-mask"
        });
        svg.append(rect);
        drawLabel(svg, mask.x * width + 5, mask.y * height + 18, mask.label || "身份遮罩區", "#775819");
      });
      var expanded = geometry.expandChoiceTemplate(definition, {
        mcCount: (definition.blocks.find(function (block) { return block.type === "mc"; }) || { maxCount: 0 }).maxCount,
        tfCount: (definition.blocks.find(function (block) { return block.type === "tf"; }) || { maxCount: 0 }).maxCount
      });
      var radius = Math.max(3, Math.min(15, width * (definition.bubble && definition.bubble.radius || 0.0077) * 0.65));
      expanded.bubbles.forEach(function (bubble) {
        drawCircle(svg, { x: bubble.x * width, y: bubble.y * height, type: bubble.type }, radius,
          COLORS[bubble.type] || COLORS.mc, "template-editor-bubble", bubble.type + " " + (bubble.option || ""));
      });
      editor.listGroups(definition).forEach(function (group) {
        if (!group.bounds) return;
        var isSelected = group.id === elements["template-editor-group"].value;
        var pad = Math.max(4, width * 0.004);
        var rect = svgElement("rect", {
          x: Math.max(0, group.bounds.minX * width - pad),
          y: Math.max(0, group.bounds.minY * height - pad),
          width: Math.min(width, (group.bounds.maxX - group.bounds.minX) * width + pad * 2),
          height: Math.min(height, (group.bounds.maxY - group.bounds.minY) * height + pad * 2),
          stroke: group.color, class: isSelected ? "template-editor-group-box is-selected" : "template-editor-group-box",
          "data-group-id": group.id
        });
        svg.append(rect);
        drawLabel(svg, group.bounds.minX * width, group.bounds.minY * height - 3, group.label, group.color);
      });
      if (detectedResult) drawDetectedPositions(svg, expanded, detectedResult, width, height, radius);
    }
    function drawDetectedPositions(svg, expanded, detected, width, height, radius) {
      expanded.items.forEach(function (item) {
        var question = detected.questions.find(function (entry) { return entry.type === item.type && entry.number === item.number; });
        if (!question) return;
        item.choices.forEach(function (bubble, index) {
          var point = geometry.mapBubble(bubble, width, height, detected.calibration, question.localOffsets && question.localOffsets[index]);
          drawCircle(svg, point, Math.max(2, radius * 0.72), "#d21f2b", "template-editor-detected",
            "讀圈實際位置：" + item.type + " 第 " + item.number + " 題 " + bubble.option);
        });
      });
      [expanded.classGrade, expanded.classForm].forEach(function (field) {
        field.forEach(function (bubble) {
          drawCircle(svg, geometry.mapBubble(bubble, width, height, detected.metadataCalibration), Math.max(2, radius * 0.72),
            "#d21f2b", "template-editor-detected", "讀圈實際位置：" + bubble.type + " " + bubble.option);
        });
      });
      expanded.studentNumber.forEach(function (column) { column.forEach(function (bubble) {
        drawCircle(svg, geometry.mapBubble(bubble, width, height, detected.metadataCalibration), Math.max(2, radius * 0.72),
          "#d21f2b", "template-editor-detected", "讀圈實際位置：學號 " + bubble.option);
      }); });
    }
    function clearSample() {
      renderToken += 1;
      if (sampleRenderTask && typeof sampleRenderTask.cancel === "function") {
        try { sampleRenderTask.cancel(); } catch (error) { /* ignore cancelled render */ }
      }
      sampleRenderTask = null; samplePage = null; sampleViewport = null;
      if (sampleDocument && typeof sampleDocument.destroy === "function") sampleDocument.destroy();
      sampleDocument = null; sampleBytes = null; detectedResult = null;
      elements["template-editor-canvas"].width = 1; elements["template-editor-canvas"].height = 1;
      elements["template-editor-canvas"].hidden = true;
      elements["template-editor-empty"].hidden = false;
      elements["template-editor-page-number"].disabled = true;
      elements["template-editor-test"].disabled = true;
      elements["template-editor-pdf-file"].value = "";
      elements["template-editor-page-status"].textContent = "";
      elements["template-editor-result"].textContent = "測試後會顯示班別、學號、首十題答案及待覆核數。";
      renderOverlay();
    }
    async function renderSamplePage() {
      if (!sampleDocument) return;
      var token = ++renderToken;
      if (sampleRenderTask && typeof sampleRenderTask.cancel === "function") {
        try { sampleRenderTask.cancel(); } catch (error) { /* ignore cancelled render */ }
      }
      var pageNumber = Math.max(1, Math.min(sampleDocument.numPages, Number(elements["template-editor-page-number"].value) || 1));
      elements["template-editor-page-number"].value = String(pageNumber);
      elements["template-editor-page-status"].textContent = "正在本機轉正及顯示樣本頁…";
      try {
        var page = await sampleDocument.getPage(pageNumber);
        var baseViewport = page.getViewport({ scale: 1 });
        var scale = Math.min(1.6, 1200 / Math.max(1, baseViewport.width));
        var viewport = page.getViewport({ scale: scale });
        if (token !== renderToken) return;
        var canvas = elements["template-editor-canvas"];
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); canvas.hidden = false;
        elements["template-editor-empty"].hidden = true;
        var context = canvas.getContext("2d", { willReadFrequently: true });
        samplePage = page; sampleViewport = viewport;
        sampleRenderTask = page.render({ canvasContext: context, viewport: viewport });
        await sampleRenderTask.promise;
        if (token !== renderToken) return;
        sampleRenderTask = null;
        resetTest();
        elements["template-editor-page-status"].textContent = "第 " + pageNumber + " / " + sampleDocument.numPages + " 頁；旋轉 " +
          (page.rotate || 0) + "°，已由 PDF.js 轉正。拖拉底圖可移動所選組。";
        elements["template-editor-test"].disabled = false;
        renderOverlay();
      } catch (error) {
        if (token !== renderToken) return;
        sampleRenderTask = null;
        elements["template-editor-page-status"].textContent = "樣本頁無法顯示，請重新選擇 PDF。";
        elements["template-editor-page-status"].classList.add("is-error");
      }
    }
    async function loadSample(file) {
      if (!file) return;
      clearSample();
      elements["template-editor-page-status"].classList.remove("is-error");
      if ((!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") || !root.pdfjsLib || !root.LT_PDF_WORKER_SRC) {
        elements["template-editor-page-status"].textContent = !root.pdfjsLib || !root.LT_PDF_WORKER_SRC
          ? (root.LT_OFFLINE ? "套件不完整：請先把 zip 完整解壓，再開啟 START-HERE.html" : "PDF 程式庫未載入；請連線後重新整理頁面。")
          : "請選擇 PDF 檔案。";
        elements["template-editor-page-status"].classList.add("is-error");
        return;
      }
      try {
        sampleBytes = new Uint8Array(await file.arrayBuffer());
        sampleDocument = await root.pdfjsLib.getDocument({ data: sampleBytes.slice(), isEvalSupported: false }).promise;
        elements["template-editor-page-number"].min = "1";
        elements["template-editor-page-number"].max = String(sampleDocument.numPages);
        elements["template-editor-page-number"].value = "1";
        elements["template-editor-page-number"].disabled = false;
        await renderSamplePage();
      } catch (error) {
        clearSample();
        elements["template-editor-page-status"].textContent = "PDF 無法開啟；請確認檔案完整、未加密，並使用 PDF 格式。";
        elements["template-editor-page-status"].classList.add("is-error");
      }
    }
    function renderReadout(detected) {
      var firstTen = detected.questions.slice(0, 10).map(function (question) {
        return question.number + "「" + (question.answer || "空白") + "」" + (question.status === "review" ? "（待覆核）" : "");
      }).join("、");
      elements["template-editor-result"].textContent = "班別：" + (detected.classValue || "未能讀取") +
        "；學號：" + (detected.studentId || "未能讀取") + "；首 " + detected.questions.slice(0, 10).length + " 題：" + (firstTen || "沒有選擇題") +
        "；待覆核數：" + detected.reviewCount + (detected.pageFailure ? "（整頁定位失敗）" : "");
    }
    async function testSample() {
      if (!session || !samplePage) return;
      var button = elements["template-editor-test"];
      button.disabled = true; button.textContent = "正在本機測試讀圈…";
      try {
        var context = elements["template-editor-canvas"].getContext("2d", { willReadFrequently: true });
        var imageData = context.getImageData(0, 0, elements["template-editor-canvas"].width, elements["template-editor-canvas"].height);
        var mc = session.draft.blocks.find(function (block) { return block.type === "mc"; });
        var tf = session.draft.blocks.find(function (block) { return block.type === "tf"; });
        var mcCount = mc ? mc.maxCount : 0; var tfCount = tf ? tf.maxCount : 0;
        var expanded = geometry.expandChoiceTemplate(session.draft, { mcCount: mcCount, tfCount: tfCount });
        var fit = omr.gridFit(imageData.data, imageData.width, imageData.height, expanded);
        detectedResult = omr.detectPage(imageData.data, imageData.width, imageData.height,
          mcCount, tfCount, fit.calibration, fit.metadataCalibration, expanded);
        renderReadout(detectedResult);
        renderOverlay();
        setStatus("樣本讀圈完成；紅色小圈顯示讀圈使用的實際位置。", false);
      } catch (error) {
        detectedResult = null;
        elements["template-editor-result"].textContent = "讀圈測試失敗；請檢查樣本頁及圈位。";
        setStatus("樣本讀圈失敗。", true);
        renderOverlay();
      } finally {
        button.textContent = "以樣本測試讀圈";
        button.disabled = !samplePage;
      }
    }
    function updateName() {
      if (!session) return;
      session.draft.name = elements["template-editor-name"].value;
      updateValidation();
    }
    function saveDraft() {
      if (!session) return;
      session.draft.name = elements["template-editor-name"].value.trim();
      var result = editor.saveValidated(session.draft, templates, options.onSave);
      if (result && result.ok) {
        session.draft = clone(result.template || session.draft);
        session.resetDraft = clone(session.draft);
        elements["template-editor-name"].value = session.draft.name;
        undoStack = [];
        renderControls();
        setStatus("自訂範本已儲存在這部電腦的瀏覽器。" + (result.message ? " " + result.message : ""), false);
      } else {
        setStatus(result && result.errors ? "範本未能儲存：" + result.errors.join(" ") : result && result.message || "範本未能儲存。", true);
        updateValidation();
      }
    }
    function exportDraft() {
      if (!session) return;
      session.draft.name = elements["template-editor-name"].value.trim();
      var check = templates.validateTemplate(session.draft);
      if (!check.ok) { setStatus("範本未能匯出：" + check.errors.join(" "), true); return; }
      try { options.onExport(session.draft); setStatus("範本 JSON 已下載；檔案只含範本設定。", false); }
      catch (error) { setStatus(error.message || "範本無法匯出。", true); }
    }
    function close() {
      if (!session) return;
      if (isDirty() && !root.confirm("尚有未儲存的範本調整，確定返回範本清單？")) return;
      clearSample();
      session = null; undoStack = []; controlEdit = null; drag = null;
      elements["template-editor-panel"].hidden = true;
      elements["template-selection-panel"].hidden = false;
      elements["template-editor-overlay"].replaceChildren();
      if (typeof options.onClose === "function") options.onClose();
    }
    function open(selected) {
      if (!selected || selected.kind !== "choice") return false;
      var draft = clone(selected); var isBuiltin = selected.source === "builtin";
      if (isBuiltin) {
        var slug = selected.id.replace(/^builtin:/, "").toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 36);
        draft.id = "custom:layout-" + slug + "-" + Date.now().toString(36);
        draft.source = "custom";
        draft.name = (selected.name.slice(0, 88) + "（自訂副本）").slice(0, 100);
      }
      session = { draft: draft, resetDraft: clone(draft), original: clone(selected), copiedBuiltin: isBuiltin };
      undoStack = []; detectedResult = null; controlEdit = null;
      elements["template-selection-panel"].hidden = true;
      elements["template-editor-panel"].hidden = false;
      elements["template-editor-copy-note"].textContent = isBuiltin
        ? "已建立「" + draft.name + "」自訂副本；內置範本保持不變。"
        : "正在編輯自訂範本「" + selected.name + "」；尚未儲存前，既有範本不會改動。";
      elements["template-editor-name"].value = draft.name;
      elements["template-editor-all-columns"].checked = false;
      setStatus("所有圈位均符合範本座標範圍。", false);
      renderControls();
      elements["template-editor-name"].focus({ preventScroll: true });
      return true;
    }
    function applySpacing(kind) {
      if (!session) return;
      var group = selectedGroup(); if (!group) return;
      if (!controlEdit || controlEdit.kind !== kind) controlEdit = { kind: kind, base: clone(session.draft) };
      session.draft = clone(controlEdit.base);
      var result = kind === "option"
        ? editor.setOptionSpacing(session.draft, group.id, Number(elements["template-editor-option-spacing"].value),
          Boolean(elements["template-editor-all-columns"].checked))
        : editor.setRowSpacing(session.draft, group.id, Number(elements["template-editor-row-spacing"].value));
      if (!result.ok) {
        session.draft = clone(controlEdit.base);
        setStatus(result.message, true);
      } else {
        resetTest(); setStatus("間距已調整；請重新測試讀圈。", false);
      }
      renderOverlay(); updateValidation();
    }
    function finishSpacing(kind) {
      if (!controlEdit || controlEdit.kind !== kind) return;
      if (JSON.stringify(controlEdit.base) !== JSON.stringify(session.draft)) pushUndo(controlEdit.base);
      controlEdit = null;
      renderControls();
    }
    function undo() {
      if (!session || !undoStack.length) return;
      session.draft = undoStack.pop();
      elements["template-editor-name"].value = session.draft.name;
      resetTest(); setStatus("已撤銷上一步調整。", false);
      renderControls();
    }
    function reset() {
      if (!session) return;
      pushUndo(session.draft);
      session.draft = clone(session.resetDraft);
      elements["template-editor-name"].value = session.draft.name;
      resetTest(); setStatus("已重設為開始編輯時的原範本位置。", false);
      renderControls();
    }
    function setNumbering(type, numbering) {
      if (!session || ["column-major", "row-major"].indexOf(numbering) < 0) return false;
      var block = session.draft.blocks.find(function (entry) { return entry.type === type; });
      if (!block || block.numbering === numbering) return Boolean(block);
      pushUndo(session.draft);
      block.numbering = numbering;
      resetTest();
      setStatus("題號排列已調整；請重新測試讀圈。", false);
      renderOverlay(); updateValidation();
      return true;
    }
    function pointerDown(event) {
      if (!session || !samplePage || event.pointerType === "touch" || event.button !== 0) return;
      var group = selectedGroup(); var rect = elements["template-editor-overlay"].getBoundingClientRect();
      if (!group || !rect.width || !rect.height) return;
      drag = { id: group.id, x: event.clientX, y: event.clientY, rect: rect, before: clone(session.draft), base: clone(session.draft) };
      elements["template-editor-overlay"].setPointerCapture(event.pointerId);
      event.preventDefault();
    }
    function pointerMove(event) {
      if (!drag || !session) return;
      session.draft = clone(drag.base);
      var result = editor.moveGroup(session.draft, drag.id,
        (event.clientX - drag.x) / drag.rect.width, (event.clientY - drag.y) / drag.rect.height);
      if (result.ok) {
        resetTest(); renderOverlay(); updateValidation();
      }
      event.preventDefault();
    }
    function pointerUp(event) {
      if (!drag || !session) return;
      if (JSON.stringify(drag.before) !== JSON.stringify(session.draft)) {
        pushUndo(drag.before); setStatus("已移動所選圈位組；請測試讀圈後再儲存。", false);
      }
      drag = null; renderControls();
      if (elements["template-editor-overlay"].hasPointerCapture(event.pointerId)) {
        elements["template-editor-overlay"].releasePointerCapture(event.pointerId);
      }
    }
    function nudge(event) {
      if (!session || !samplePage || ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(event.key) < 0) return;
      var group = selectedGroup(); if (!group) return;
      event.preventDefault();
      var amount = event.shiftKey ? 0.005 : 0.001;
      var dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
      var dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
      var before = clone(session.draft);
      var result = editor.moveGroup(session.draft, group.id, dx, dy);
      if (result.ok && (result.deltaX || result.deltaY)) {
        pushUndo(before); resetTest(); setStatus("已微調所選圈位組。", false); renderControls();
      }
    }

    elements["template-editor-pdf-file"].addEventListener("change", function () { loadSample(elements["template-editor-pdf-file"].files[0]); });
    elements["template-editor-page-number"].addEventListener("change", renderSamplePage);
    elements["template-editor-group"].addEventListener("change", function () { renderControls(); });
    elements["template-editor-option-spacing"].addEventListener("input", function () { applySpacing("option"); });
    elements["template-editor-option-spacing"].addEventListener("change", function () { finishSpacing("option"); });
    elements["template-editor-row-spacing"].addEventListener("input", function () { applySpacing("row"); });
    elements["template-editor-row-spacing"].addEventListener("change", function () { finishSpacing("row"); });
    elements["template-editor-all-columns"].addEventListener("change", function () {
      var group = selectedGroup();
      if (!session || !group || group.kind !== "mc-column" || !this.checked) return;
      var before = clone(session.draft);
      var result = editor.setOptionSpacing(session.draft, group.id, Number(elements["template-editor-option-spacing"].value), true);
      if (result.ok) { pushUndo(before); resetTest(); setStatus("已把選項間距套用至所有選擇題欄。", false); renderControls(); }
      else setStatus(result.message, true);
    });
    elements["template-editor-undo"].addEventListener("click", undo);
    elements["template-editor-reset"].addEventListener("click", reset);
    elements["template-editor-test"].addEventListener("click", testSample);
    elements["template-editor-name"].addEventListener("input", updateName);
    elements["template-editor-save"].addEventListener("click", saveDraft);
    elements["template-editor-export"].addEventListener("click", exportDraft);
    elements["template-editor-close"].addEventListener("click", close);
    elements["template-editor-overlay"].addEventListener("pointerdown", pointerDown);
    elements["template-editor-overlay"].addEventListener("pointermove", pointerMove);
    elements["template-editor-overlay"].addEventListener("pointerup", pointerUp);
    elements["template-editor-overlay"].addEventListener("pointercancel", pointerUp);
    elements["template-editor-overlay"].addEventListener("keydown", nudge);
    elements["edit-template-layout"].addEventListener("click", function () {
      var selected = options.getSelectedTemplate();
      if (selected && selected.kind === "choice") open(selected);
    });
    return { open: open, close: close, loadSample: loadSample, setNumbering: setNumbering,
      getDraft: function () { return session ? clone(session.draft) : null; } };
  }

  root.PdfMarkingTemplateEditorUI = { create: create };
})(typeof window !== "undefined" ? window : globalThis);
