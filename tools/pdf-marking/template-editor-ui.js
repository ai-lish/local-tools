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
    var alignmentOverlay = root.PdfMarkingAlignmentOverlay;
    var editor = options.editor;
    var elements = {};
    [
      "template-selection-panel", "template-editor-panel", "edit-template-layout", "template-editor-close",
      "template-editor-copy-note", "template-editor-pdf-file", "template-editor-page-number", "template-editor-group",
      "template-editor-option-spacing", "template-editor-row-spacing", "template-editor-all-columns-wrap",
      "template-editor-all-columns", "template-editor-row-all-wrap", "template-editor-row-all",
      "template-editor-row-all-apply", "template-editor-view-fit", "template-editor-view-width", "template-editor-view-selected",
      "template-editor-undo", "template-editor-reset", "template-editor-test",
      "template-editor-auto-align-scope", "template-editor-auto-align", "template-editor-auto-align-apply",
      "template-editor-auto-align-cancel", "template-editor-auto-align-preview",
      "template-editor-frame", "template-editor-canvas", "template-editor-overlay", "template-editor-empty", "template-editor-page-status",
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
    var autoAlignPreview = null;
    var undoStack = [];
    var drag = null;
    var controlEdit = null;
    var viewMode = "fit";

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
    function updateSampleDisplay(scrollToSelection) {
      var canvas = elements["template-editor-canvas"];
      var frame = elements["template-editor-frame"];
      var svg = elements["template-editor-overlay"];
      if (!canvas || canvas.hidden || !canvas.width || !canvas.height) return;
      var frameWidth = Math.max(1, frame.clientWidth - 2);
      var aspect = canvas.height / canvas.width;
      var displayWidth = frameWidth;
      var displayHeight;
      frame.classList.toggle("is-zoomed", viewMode === "selected");
      if (viewMode === "fit") {
        var maxHeight = Math.max(220, Math.min(window.innerHeight * 0.68, window.innerHeight - 250));
        displayWidth = Math.min(frameWidth, maxHeight / aspect);
      } else if (viewMode === "selected") {
        frame.style.height = Math.max(260, Math.floor(window.innerHeight * 0.62)) + "px";
        var group = selectedGroup();
        var groupWidth = group && group.bounds ? Math.max(1, (group.bounds.maxX - group.bounds.minX) * frameWidth) : frameWidth * 0.4;
        var groupHeight = group && group.bounds ? Math.max(1, (group.bounds.maxY - group.bounds.minY) * frameWidth * aspect) : frame.clientHeight * 0.4;
        var zoom = Math.min(4, Math.max(1.5, Math.min(frameWidth * 0.72 / groupWidth, frame.clientHeight * 0.72 / groupHeight)));
        displayWidth = frameWidth * zoom;
      } else {
        frame.style.height = "";
      }
      if (viewMode !== "selected") frame.style.height = "";
      displayHeight = displayWidth * aspect;
      canvas.style.width = displayWidth + "px";
      canvas.style.height = displayHeight + "px";
      svg.style.left = viewMode === "selected" ? "0" : "50%";
      svg.style.top = "0";
      svg.style.right = "auto";
      svg.style.bottom = "auto";
      svg.style.transform = viewMode === "selected" ? "none" : "translateX(-50%)";
      svg.style.width = displayWidth + "px";
      svg.style.height = displayHeight + "px";
      if (scrollToSelection && viewMode === "selected") {
        var selected = selectedGroup();
        if (selected && selected.bounds) {
          frame.scrollLeft = ((selected.bounds.minX + selected.bounds.maxX) / 2) * displayWidth - frame.clientWidth / 2;
          frame.scrollTop = ((selected.bounds.minY + selected.bounds.maxY) / 2) * displayHeight - frame.clientHeight / 2;
        }
      }
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
      autoAlignPreview = null;
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
      var isMcRows = Boolean(group && ["mc-column", "mc-column-rows", "mc-rows"].indexOf(group.kind) >= 0);
      elements["template-editor-row-all-wrap"].hidden = !isMcRows;
      elements["template-editor-row-all-apply"].hidden = !isMcRows;
      elements["template-editor-row-all-apply"].disabled = !spacing.rowSpacing || !isMcRows;
      elements["template-editor-undo"].disabled = undoStack.length === 0;
      elements["template-editor-reset"].disabled = !session;
      elements["template-editor-test"].disabled = !samplePage;
      elements["template-editor-auto-align"].disabled = !samplePage || !selectedGroup();
      elements["template-editor-auto-align-apply"].disabled = !autoAlignPreview || !autoAlignPreview.canApply;
      elements["template-editor-auto-align-cancel"].hidden = !autoAlignPreview;
      renderAutoAlignPreview();
      renderOverlay();
      updateSampleDisplay(false);
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
      if (detectedResult) {
        drawDetectedPositions(svg, expanded, detectedResult, width, height, radius);
        alignmentOverlay.draw(svg, geometry, expanded, detectedResult, { width: width, height: height });
      }
      if (autoAlignPreview) drawAutoAlignPreview(svg, width, height, radius);
      renderRowHandles(svg, width, height);
    }
    function renderRowHandles(svg, width, height) {
      var group = selectedGroup();
      if (!group || !group.bounds || group.points.length < 2 || !editor.groupSpacing(session.draft, group.id).rowSpacing) return;
      var rows = Array.from(new Set(group.points.map(function (point) { return point.y; }))).sort(function (a, b) { return a - b; });
      if (rows.length < 2) return;
      var handleX = group.bounds.maxX * width + 14;
      if (handleX > width - 13) handleX = Math.max(13, group.bounds.minX * width - 14);
      var line = svgElement("line", { x1: handleX, y1: rows[0] * height, x2: handleX, y2: rows[rows.length - 1] * height,
        class: "template-editor-row-handle-line" });
      svg.append(line);
      [["first", rows[0], "移動整組行位"], ["last", rows[rows.length - 1], "調整行距"]].forEach(function (item) {
        var handle = svgElement("circle", { cx: handleX, cy: item[1] * height, r: 10,
          class: "template-editor-row-handle", "data-row-handle": item[0], tabindex: 0, role: "button",
          "aria-label": item[2] });
        var title = svgElement("title"); title.textContent = item[2] + "；可拖拉調整。"; handle.append(title);
        svg.append(handle);
        var label = svgElement("text", { x: handleX, y: item[1] * height, class: "template-editor-row-handle-label" });
        label.textContent = item[0] === "first" ? "↕" : "↕";
        svg.append(label);
      });
    }
    function drawAutoAlignPreview(svg, width, height, radius) {
      autoAlignPreview.plans.filter(function (plan) { return plan.ok; }).forEach(function (plan) {
        plan.previewPoints.forEach(function (point) {
          drawCircle(svg, { x: point.old.x * width, y: point.old.y * height, type: point.type }, Math.max(4, radius * 0.9),
            "#c05a00", "template-editor-auto-before", plan.target.label + " 調整前");
          drawCircle(svg, { x: point.next.x * width, y: point.next.y * height, type: point.type }, Math.max(3, radius * 0.68),
            "#00834a", "template-editor-auto-after", plan.target.label + " 調整後");
        });
      });
    }
    function renderAutoAlignPreview() {
      if (!elements["template-editor-auto-align-preview"]) return;
      if (!autoAlignPreview) {
        elements["template-editor-auto-align-preview"].textContent = "自動對位只會讀取本機樣本頁；預覽確認後才修改草稿。";
        return;
      }
      var lines = autoAlignPreview.plans.map(function (plan) {
        if (!plan.ok) return plan.target.label + "：略過，" + plan.reason;
        return plan.target.label + "：平均偏移 " + plan.meanOffsetMm.toFixed(2) + " mm（水平 " + plan.meanDxMm.toFixed(2) +
          "、垂直 " + plan.meanDyMm.toFixed(2) + "），調整後殘差 " + plan.residualMm.toFixed(2) + " mm（圈心 " +
          plan.foundCount + " / " + plan.expectedCount + "）。";
      });
      if (autoAlignPreview.validationError) lines.push("預計範本未能通過驗證：" + autoAlignPreview.validationError);
      lines.push("橙色圈：調整前；綠色圈：調整後。按「套用」才會寫入草稿，可用一次「撤銷」還原。");
      elements["template-editor-auto-align-preview"].textContent = lines.join("\n");
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
      viewMode = "fit";
      elements["template-editor-view-fit"].setAttribute("aria-pressed", "true");
      elements["template-editor-view-width"].setAttribute("aria-pressed", "false");
      elements["template-editor-view-selected"].setAttribute("aria-pressed", "false");
      elements["template-editor-frame"].classList.remove("is-zoomed");
      elements["template-editor-frame"].style.height = "";
      if (sampleDocument && typeof sampleDocument.destroy === "function") sampleDocument.destroy();
      sampleDocument = null; sampleBytes = null; detectedResult = null;
      autoAlignPreview = null;
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
        updateSampleDisplay(false);
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
      var diagnostics = detected.alignmentDiagnostics || { checks: [], groups: [], worstGroups: [], reasons: [] };
      var checkLines = diagnostics.checks.map(function (check) {
        var value = check.value == null ? "未提供" : (check.id === "multi-deep" ? (Number(check.value) * 100).toFixed(1) + "%" : Number(check.value).toFixed(3));
        var limit = check.limit == null ? "—" : (check.id === "multi-deep" ? (Number(check.limit) * 100).toFixed(0) + "%" : Number(check.limit).toFixed(3));
        return check.label + " " + value + " / 門檻 " + limit + "（" + (check.passed ? "通過" : "未通過") + "）";
      });
      var groupLines = diagnostics.groups.map(function (group) { return group.label + "平均偏移 " + Number(group.meanMm).toFixed(2) + " mm"; });
      var worstLines = diagnostics.worstGroups.map(function (group) { return group.label + " " + Number(group.meanMm).toFixed(2) + " mm"; });
      var shift = diagnostics.pageShift || {};
      elements["template-editor-result"].textContent = "班別：" + (detected.classValue || "未能讀取") +
        "；學號：" + (detected.studentId || "未能讀取") + "；首 " + detected.questions.slice(0, 10).length + " 題：" + (firstTen || "沒有選擇題") +
        "；待覆核數：" + detected.reviewCount + (detected.pageFailure ? "（整頁定位失敗）" : "") +
        "\n頁面移位：水平 " + Number(shift.xMm || 0).toFixed(1) + " mm、垂直 " + Number(shift.yMm || 0).toFixed(1) + " mm" +
        "\n檢查：" + (checkLines.join("；") || "沒有檢查資料") +
        "\n各組平均偏移：" + (groupLines.join("；") || "沒有題組") +
        "\n偏移最大的三組：" + (worstLines.join("；") || "沒有題組") +
        (diagnostics.reasons.length ? "\n定位原因：" + diagnostics.reasons.join(" ") : "");
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
    function autoAlign() {
      if (!session || !samplePage || !sampleViewport) return;
      var scope = elements["template-editor-auto-align-scope"].value;
      var targets = scope === "all" ? editor.listAutoAlignTargets(session.draft) :
        [editor.autoAlignTargetForGroup(session.draft, selectedGroup())].filter(Boolean);
      if (!targets.length) { setStatus("所選範圍沒有可自動對位的圈位。", true); return; }
      var button = elements["template-editor-auto-align"];
      button.disabled = true; button.textContent = "正在本機量度圈心…";
      setStatus("正在本機樣本頁附近搜尋圈心；讀取完成前不會修改草稿。", false);
      window.setTimeout(function () {
        try {
          var canvas = elements["template-editor-canvas"];
          var imageData = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
          var parameters = templates.choiceParameters(session.draft);
          // Calibration widens only the local search window so a deliberately misplaced template can find its printed rings.
          // The ring-ink acceptance threshold and all normal OMR read parameters remain unchanged.
          var calibrationParameters = Object.assign({}, parameters, { localSearch: Math.max(Number(parameters.localSearch) || 0, 0.016) });
          var pageSizeMm = { widthMm: sampleViewport.width / sampleViewport.scale * 25.4 / 72,
            heightMm: sampleViewport.height / sampleViewport.scale * 25.4 / 72 };
          var plans = targets.map(function (target) {
            var measurements = target.points.map(function (point) {
              var found = omr.refineBubbleCenter(imageData.data, imageData.width, imageData.height,
                { x: point.x, y: point.y, type: point.type }, { dx: 0, dy: 0, angle: 0, scale: 1 }, calibrationParameters);
              return { found: Boolean(found && found.found), x: found ? found.center.x / imageData.width : NaN,
                y: found ? found.center.y / imageData.height : NaN, ringInk: found && found.ringInk };
            });
            return editor.fitAutoAlignment(session.draft, target, measurements, pageSizeMm, 1);
          });
          var applicable = plans.filter(function (plan) { return plan.ok; });
          var validationError = "";
          if (applicable.length) {
            var candidate = editor.applyAutoAlignPlans(session.draft, applicable);
            var validation = templates.validateTemplate(candidate);
            if (!validation.ok) validationError = validation.errors.join(" ");
          }
          autoAlignPreview = { plans: plans, canApply: applicable.length > 0 && !validationError, validationError: validationError };
          renderAutoAlignPreview(); renderOverlay(); renderControls();
          setStatus(applicable.length
            ? "本機自動對位預覽完成；請檢查橙色及綠色圈位和殘差，再決定是否套用。"
            : "沒有組別符合自動對位條件；範本草稿沒有修改。", !applicable.length);
        } catch (error) {
          autoAlignPreview = null;
          renderOverlay(); renderAutoAlignPreview();
          setStatus("自動對位未能完成；範本草稿沒有修改。", true);
        } finally {
          button.textContent = "自動對位";
          button.disabled = !samplePage || !selectedGroup();
        }
      }, 30);
    }
    async function applyAutoAlign() {
      if (!session || !autoAlignPreview || !autoAlignPreview.canApply) return;
      var plans = autoAlignPreview.plans.filter(function (plan) { return plan.ok; });
      var before = clone(session.draft);
      var candidate = editor.applyAutoAlignPlans(session.draft, plans);
      var validation = templates.validateTemplate(candidate);
      if (!validation.ok) {
        autoAlignPreview.validationError = validation.errors.join(" "); autoAlignPreview.canApply = false;
        renderAutoAlignPreview(); renderControls();
        setStatus("自動對位結果未通過範本驗證；未套用。", true);
        return;
      }
      pushUndo(before);
      session.draft = candidate;
      elements["template-editor-name"].value = candidate.name;
      autoAlignPreview = null;
      resetTest(); renderControls();
      setStatus("已把自動對位結果寫入草稿；正在重新執行樣本讀圈測試。", false);
      await testSample();
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
      undoStack = []; detectedResult = null; autoAlignPreview = null; controlEdit = null;
      viewMode = "fit";
      elements["template-editor-view-fit"].setAttribute("aria-pressed", "true");
      elements["template-editor-view-width"].setAttribute("aria-pressed", "false");
      elements["template-editor-view-selected"].setAttribute("aria-pressed", "false");
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
      var result;
      if (kind === "option") result = editor.setOptionSpacing(session.draft, group.id, Number(elements["template-editor-option-spacing"].value),
        Boolean(elements["template-editor-all-columns"].checked));
      else result = elements["template-editor-row-all"].checked
        ? editor.setAllMcRowSpacing(session.draft, Number(elements["template-editor-row-spacing"].value))
        : editor.setRowSpacing(session.draft, group.id, Number(elements["template-editor-row-spacing"].value));
      if (!result.ok) {
        session.draft = clone(controlEdit.base);
      } else {
        resetTest();
      }
      renderOverlay(); updateValidation();
      setStatus(result.ok ? "間距已調整；請重新測試讀圈。" : result.message, !result.ok);
    }
    function finishSpacing(kind) {
      if (!controlEdit || controlEdit.kind !== kind) return;
      var errorMessage = elements["template-editor-status"].classList.contains("is-error")
        ? elements["template-editor-status"].textContent : "";
      if (JSON.stringify(controlEdit.base) !== JSON.stringify(session.draft)) pushUndo(controlEdit.base);
      controlEdit = null;
      renderControls();
      if (errorMessage) setStatus(errorMessage, true);
    }
    function undo() {
      if (!session || !undoStack.length) return;
      session.draft = undoStack.pop();
      autoAlignPreview = null;
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
      if (!session || !samplePage || event.button !== 0) return;
      var group = selectedGroup(); var rect = elements["template-editor-overlay"].getBoundingClientRect();
      if (!group || !rect.width || !rect.height) return;
      var handle = event.target.closest && event.target.closest("[data-row-handle]");
      if (!handle && event.pointerType === "touch") return;
      if (handle) {
        var handleSpacing = editor.rowSpacingAfterHandle(session.draft, group.id, 0);
        drag = { mode: handle.getAttribute("data-row-handle") === "last" ? "row-pitch" : "row-move",
          id: group.id, x: event.clientX, y: event.clientY, rect: rect, spacing: handleSpacing.spacing,
          intervals: handleSpacing.intervals, before: clone(session.draft), base: clone(session.draft) };
      } else {
        drag = { mode: "move", id: group.id, x: event.clientX, y: event.clientY, rect: rect,
          before: clone(session.draft), base: clone(session.draft) };
      }
      elements["template-editor-overlay"].setPointerCapture(event.pointerId);
      event.preventDefault();
    }
    function pointerMove(event) {
      if (!drag || !session) return;
      session.draft = clone(drag.base);
      var deltaY = (event.clientY - drag.y) / drag.rect.height;
      var result;
      if (drag.mode === "row-move") result = editor.moveGroupRows(session.draft, drag.id, deltaY);
      else if (drag.mode === "row-pitch") {
        var nextSpacing = drag.spacing + deltaY / drag.intervals;
        result = elements["template-editor-row-all"].checked
          ? editor.setAllMcRowSpacing(session.draft, nextSpacing)
          : editor.setRowSpacing(session.draft, drag.id, nextSpacing);
      } else result = editor.moveGroup(session.draft, drag.id,
        (event.clientX - drag.x) / drag.rect.width, deltaY);
      if (result.ok) {
        resetTest(); renderOverlay(); updateValidation();
        if (drag.mode === "row-pitch") {
          var liveSpacing = editor.groupSpacing(session.draft, drag.id).rowSpacing;
          if (Number.isFinite(liveSpacing)) elements["template-editor-row-spacing"].value = liveSpacing.toFixed(4);
        }
      }
      event.preventDefault();
    }
    function pointerUp(event) {
      if (!drag || !session) return;
      if (JSON.stringify(drag.before) !== JSON.stringify(session.draft)) {
        pushUndo(drag.before);
        setStatus(drag.mode === "row-pitch" ? "已調整行距；請測試讀圈後再儲存。"
          : drag.mode === "row-move" ? "已移動整組行位；請測試讀圈後再儲存。"
            : "已移動所選圈位組；請測試讀圈後再儲存。", false);
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
      if (event.altKey) {
        var isRow = event.key === "ArrowUp" || event.key === "ArrowDown";
        var sign = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
        var beforeSpacing = clone(session.draft);
        var nextValue = isRow ? editor.groupSpacing(session.draft, group.id).rowSpacing : editor.groupSpacing(session.draft, group.id).optionSpacing;
        if (!Number.isFinite(nextValue)) { setStatus(isRow ? "所選組沒有可調行距。" : "所選組沒有可調選項間距。", true); return; }
        var candidate = clone(session.draft);
        var adjusted = isRow
          ? (elements["template-editor-row-all"].checked
            ? editor.setAllMcRowSpacing(candidate, nextValue + sign * amount)
            : editor.setRowSpacing(candidate, group.id, nextValue + sign * amount))
          : editor.setOptionSpacing(candidate, group.id, nextValue + sign * amount,
            Boolean(elements["template-editor-all-columns"].checked));
        if (!adjusted.ok) { setStatus(adjusted.message, true); return; }
        session.draft = candidate; pushUndo(beforeSpacing); resetTest(); renderControls();
        setStatus(isRow ? "已用鍵盤調整行距。" : "已用鍵盤調整選項間距。", false);
        return;
      }
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
    elements["template-editor-group"].addEventListener("change", function () {
      autoAlignPreview = null; renderControls(); updateSampleDisplay(true);
    });
    elements["template-editor-option-spacing"].addEventListener("input", function () { applySpacing("option"); });
    elements["template-editor-option-spacing"].addEventListener("change", function () { finishSpacing("option"); });
    elements["template-editor-row-spacing"].addEventListener("input", function () { applySpacing("row"); });
    elements["template-editor-row-spacing"].addEventListener("change", function () { finishSpacing("row"); });
    elements["template-editor-row-all-apply"].addEventListener("click", function () {
      if (!session || !selectedGroup()) return;
      var before = clone(session.draft); var candidate = clone(session.draft);
      var result = editor.setAllMcRowSpacingFromGroup(candidate, selectedGroup().id);
      if (!result.ok) { setStatus(result.message, true); return; }
      pushUndo(before); session.draft = candidate; resetTest(); renderControls();
      setStatus("已把所選組的行距套用到全部選擇題組。一次撤銷可還原全部。", false);
    });
    [
      ["template-editor-view-fit", "fit"],
      ["template-editor-view-width", "width"],
      ["template-editor-view-selected", "selected"]
    ].forEach(function (entry) {
      elements[entry[0]].addEventListener("click", function () {
        viewMode = entry[1];
        ["fit", "width", "selected"].forEach(function (mode) {
          var id = mode === "fit" ? "template-editor-view-fit" : mode === "width" ? "template-editor-view-width" : "template-editor-view-selected";
          elements[id].setAttribute("aria-pressed", mode === viewMode ? "true" : "false");
        });
        updateSampleDisplay(true);
      });
    });
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
    elements["template-editor-auto-align"].addEventListener("click", autoAlign);
    elements["template-editor-auto-align-apply"].addEventListener("click", applyAutoAlign);
    elements["template-editor-auto-align-cancel"].addEventListener("click", function () {
      autoAlignPreview = null; renderAutoAlignPreview(); renderOverlay(); renderControls();
      setStatus("已取消自動對位預覽；草稿沒有修改。", false);
    });
    elements["template-editor-name"].addEventListener("input", updateName);
    elements["template-editor-save"].addEventListener("click", saveDraft);
    elements["template-editor-export"].addEventListener("click", exportDraft);
    elements["template-editor-close"].addEventListener("click", close);
    elements["template-editor-overlay"].addEventListener("pointerdown", pointerDown);
    elements["template-editor-overlay"].addEventListener("pointermove", pointerMove);
    elements["template-editor-overlay"].addEventListener("pointerup", pointerUp);
    elements["template-editor-overlay"].addEventListener("pointercancel", pointerUp);
    elements["template-editor-overlay"].addEventListener("keydown", nudge);
    window.addEventListener("resize", function () { updateSampleDisplay(false); });
    elements["edit-template-layout"].addEventListener("click", function () {
      var selected = options.getSelectedTemplate();
      if (selected && selected.kind === "choice") open(selected);
    });
    return { open: open, close: close, loadSample: loadSample, setNumbering: setNumbering,
      getDraft: function () { return session ? clone(session.draft) : null; } };
  }

  root.PdfMarkingTemplateEditorUI = { create: create };
})(typeof window !== "undefined" ? window : globalThis);
