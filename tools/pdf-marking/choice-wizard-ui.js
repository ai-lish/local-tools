(function (root) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function create(options) {
    var api = root.PdfMarkingChoiceWizard;
    var answerHighlight = root.PdfMarkingAnswerHighlight;
    var templates = options.templates;
    var geometry = options.geometry;
    var omr = options.omr;
    var get = function (id) { return document.getElementById(id); };
    var wizard = get("choice-wizard");
    var home = get("pdf-marking-home");
    var legacyStepper = get("legacy-stepper");
    var legacySections = [get("step-1"), get("step-2"), get("step-3")];
    var editorPanel = get("template-editor-panel");
    var editorHome = editorPanel.parentNode;
    var editorNext = editorPanel.nextSibling;
    var settingsPanel = get("choice-settings");
    var answerInputs = get("choice-wizard-answer-inputs");
    var answerCounts = get("choice-wizard-answer-counts");
    var moreAnswerInputs = get("choice-wizard-more-answer-inputs");
    var moreSettings = get("choice-wizard-more-settings");
    var mcCountLabel = get("mc-count").closest("label");
    var tfCountLabel = get("tf-count").closest("label");
    var mcKeyLabel = get("mc-key").closest("label");
    var tfKeyLabel = get("tf-key").closest("label");
    var mcPointsLabel = get("mc-points").closest("label");
    var tfPointsLabel = get("tf-points").closest("label");
    var currentStage = 1;
    var selectedTemplate = null;
    var pendingEditorReplacementId = "";
    var pendingOrderTemplate = null;
    var sampleFile = null;
    var sampleDocument = null;
    var samplePage = null;
    var sampleViewport = null;
    var sampleRenderTask = null;
    var sampleToken = 0;
    var zones = [];
    var selectedZoneId = "";
    var drawing = null;
    var createMode = false;
    var answerToken = 0;
    var answerRenderTask = null;
    var aiSuggestions = [];
    var preparedAiImage = null;
    var aiRequestBusy = false;
    var answerSourceDocument = null;
    var localAnswerDocument = null;
    var answerSourceFile = null;
    var referenceDocument = null;
    var referenceFile = null;
    var importedAnswers = [];
    var referenceImage = null;
    var referenceBaseCanvas = null;
    var referenceMaskRects = [];
    var maskDrawing = null;
    var referencePreviewToken = 0;
    var clickMode = null;
    var baseClickCalibration = null;

    function svg(name, attributes) {
      var node = document.createElementNS(SVG_NS, name);
      Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, String(attributes[key])); });
      return node;
    }
    function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
    function safeSlug(value) { return String(value || "").replace(/[^a-z0-9._-]/gi, "-").slice(0, 40) || "custom"; }
    function selectedDefinition() { return selectedTemplate || options.getSelectedTemplate(); }
    function allChoiceTemplates() {
      return options.getTemplates().filter(function (definition) { return definition.kind === "choice"; });
    }
    function setStatus(id, message, error) {
      var target = get(id);
      target.textContent = message || "";
      target.classList.toggle("is-error", Boolean(error));
    }
    function updateTemplateOrderWarning(definition) {
      pendingOrderTemplate = definition && definition.source === "custom" && definition.kind === "choice" &&
        api.misorderedColumnGroups(definition).length ? definition : null;
      var warning = get("choice-wizard-order-warning");
      warning.hidden = !pendingOrderTemplate;
      get("choice-wizard-order-warning-text").textContent = pendingOrderTemplate
        ? "此自訂範本有同一直行的答案欄未按由上而下排列，題號可能錯配。可建立修正版副本；原範本會保留。"
        : "";
      var card = Array.from(get("choice-wizard-template-cards").children).find(function (item) {
        return pendingOrderTemplate && item.dataset.templateId === pendingOrderTemplate.id;
      });
      if (card) card.append(warning);
      else get("choice-wizard-template-cards").append(warning);
    }
    function setLegacyVisibility(visible) {
      legacyStepper.hidden = !visible;
      legacySections.forEach(function (section) { section.hidden = !visible; });
    }
    function moveFields(stage) {
      if (stage === 3) {
        get("choice-wizard-count-slot").append(mcCountLabel, tfCountLabel);
      } else if (stage === 4) {
        answerCounts.append(mcCountLabel, tfCountLabel);
      } else settingsPanel.append(mcCountLabel, tfCountLabel);
      if (stage === 4) {
        var definition = selectedDefinition();
        var hasMc = Boolean(definition && definition.blocks.some(function (entry) { return entry.type === "mc"; }));
        var hasTf = Boolean(definition && definition.blocks.some(function (entry) { return entry.type === "tf"; }));
        if (hasMc) answerInputs.append(mcKeyLabel);
        if (hasTf && hasMc) moreAnswerInputs.append(tfKeyLabel);
        else if (hasTf) answerInputs.append(tfKeyLabel);
        moreSettings.append(mcPointsLabel, tfPointsLabel);
      } else settingsPanel.append(mcKeyLabel, tfKeyLabel, mcPointsLabel, tfPointsLabel);
    }
    function updateAnswerInputVisibility() {
      var definition = selectedDefinition();
      ["mc", "tf"].forEach(function (type) {
        var hasType = Boolean(definition && definition.blocks.some(function (entry) { return entry.type === type; }));
        var count = Number(get(type === "mc" ? "mc-count" : "tf-count").value) || 0;
        var label = type === "mc" ? mcKeyLabel : tfKeyLabel;
        label.hidden = !hasType || (currentStage === 4 && count === 0);
        (type === "mc" ? mcCountLabel : tfCountLabel).hidden = !hasType;
      });
    }
    function renderStage(stage) {
      if (stage === 3 && !syncEditorForSelected(selectedDefinition(), false)) return false;
      currentStage = stage;
      home.hidden = true;
      wizard.hidden = false;
      setLegacyVisibility(false);
      document.querySelectorAll("[data-wizard-panel]").forEach(function (panel) {
        panel.hidden = Number(panel.dataset.wizardPanel) !== stage;
      });
      var flowStep = stage === 4 ? 2 : stage === 5 ? 3 : stage === 6 ? 4 : stage === 1 ? 1 : 0;
      get("choice-wizard-stepper").hidden = !flowStep;
      document.querySelectorAll("[data-wizard-step]").forEach(function (pill) {
        var target = Number(pill.dataset.wizardStep);
        pill.classList.toggle("current", target === flowStep);
        pill.classList.toggle("complete", flowStep > 0 && target < flowStep);
        if (target === flowStep) pill.setAttribute("aria-current", "step"); else pill.removeAttribute("aria-current");
        pill.disabled = target > 1 && (!selectedTemplate || selectedTemplate.kind !== "choice");
      });
      moveFields(stage);
      updateAnswerInputVisibility();
      if (stage === 1) populateTemplates();
      if (stage === 2) updateSourceButtons();
      if (stage === 3) {
        var draft = options.getEditorDraft() || selectedDefinition();
        get("choice-wizard-stage3-template-name").textContent = draft ? "｜" + draft.name : "";
        var mcBlock = draft && draft.blocks.find(function (entry) { return entry.type === "mc"; });
        var tfBlock = draft && draft.blocks.find(function (entry) { return entry.type === "tf"; });
        get("choice-wizard-mc-numbering").value = mcBlock ? mcBlock.numbering : "column-major";
        get("choice-wizard-tf-numbering").value = tfBlock ? tfBlock.numbering : "column-major";
        get("choice-wizard-mc-numbering").disabled = !mcBlock;
        get("choice-wizard-tf-numbering").disabled = !tfBlock;
        updateCountStatus();
      }
      if (stage === 4) { renderSimpleAnswerGrid(); renderAnswerPage(); updateAnswerSourceAvailability(); }
      options.onWizardStage(stage);
    }
    function renderHome() {
      wizard.hidden = true;
      home.hidden = false;
      setLegacyVisibility(false);
      var preferred = allChoiceTemplates().find(function (definition) { return definition.id === options.getPreferredTemplateId(); });
      get("choice-wizard-last-template").textContent = preferred ? preferred.name : "揀範本開始";
      options.onWizardHome();
    }
    function showLegacy(mode, definition) {
      if (editorPanel.parentNode !== editorHome) editorHome.insertBefore(editorPanel, editorNext);
      moveFields(0);
      wizard.hidden = true;
      setLegacyVisibility(true);
      options.onShowLegacy(mode, definition || selectedDefinition());
    }
    function populateTemplates() {
      var select = get("choice-wizard-template");
      var previous = select.value;
      select.replaceChildren();
      allChoiceTemplates().forEach(function (definition) {
        var option = document.createElement("option");
        option.value = definition.id; option.textContent = definition.name + (definition.source === "custom" ? "（自訂）" : "（內置）");
        select.append(option);
      });
      if (Array.from(select.options).some(function (entry) { return entry.value === previous; })) select.value = previous;
      else if (Array.from(select.options).some(function (entry) { return entry.value === options.getPreferredTemplateId(); })) select.value = options.getPreferredTemplateId();
      else if (options.getSelectedTemplate() && options.getSelectedTemplate().kind === "choice") select.value = options.getSelectedTemplate().id;
      else if (select.options.length) select.selectedIndex = 0;
      selectedTemplate = templateFromSelect();
      renderTemplateCards();
      updateTemplateOrderWarning(templateFromSelect());
    }
    function renderTemplateCards() {
      var holder = get("choice-wizard-template-cards");
      var select = get("choice-wizard-template");
      var orderWarning = get("choice-wizard-order-warning");
      // Keep the warning node outside the list while cards are rebuilt; if it
      // is inside a card, replaceChildren() would remove it from the document.
      holder.after(orderWarning);
      holder.replaceChildren();
      allChoiceTemplates().forEach(function (definition) {
        var card = document.createElement("article");
        card.className = "choice-wizard-template-card";
        card.dataset.templateId = definition.id;
        var label = document.createElement("label");
        label.className = "choice-wizard-template-choice";
        var radio = document.createElement("input");
        radio.type = "radio"; radio.name = "choice-wizard-template-choice";
        radio.value = definition.id; radio.checked = select.value === definition.id;
        radio.setAttribute("aria-label", definition.name);
        var copy = document.createElement("span");
        copy.className = "choice-wizard-template-copy";
        var title = document.createElement("strong"); title.textContent = definition.name;
        var detail = document.createElement("span");
        detail.className = "muted small";
        detail.textContent = definition.blocks.map(function (block) {
          return (block.type === "mc" ? "選擇題 " : "是非題 ") + block.maxCount + " 題";
        }).join(" · ");
        var lastUsed = document.createElement("span");
        lastUsed.className = options.getPreferredTemplateId() === definition.id ? "chip ok" : "chip";
        lastUsed.textContent = options.getPreferredTemplateId() === definition.id ? "上次使用" : "可用範本";
        copy.append(title, detail);
        label.append(radio, copy, lastUsed);
        card.append(label);
        radio.addEventListener("change", function () {
          if (!this.checked) return;
          if (!selectTemplate(definition, null, false)) {
            renderTemplateCards();
            return;
          }
          select.value = definition.id;
          holder.querySelectorAll(".choice-wizard-template-card").forEach(function (item) {
            item.classList.toggle("selected", item.dataset.templateId === definition.id);
            var choice = item.querySelector("input[type=radio]");
            if (choice) choice.checked = item.dataset.templateId === definition.id;
          });
          updateTemplateOrderWarning(definition);
          updateSourceButtons();
        });
        card.classList.toggle("selected", radio.checked);
        holder.append(card);
      });
    }
    function templateFromSelect() {
      return allChoiceTemplates().find(function (definition) { return definition.id === get("choice-wizard-template").value; }) || null;
    }
    function updateSourceButtons() {
      var loaded = Boolean(sampleFile);
      get("choice-wizard-next-from-source").disabled = !loaded || !templateFromSelect();
      get("choice-wizard-build-template").disabled = !loaded || !createMode;
      get("choice-wizard-page").disabled = !loaded;
      get("choice-wizard-start-create").disabled = !loaded;
    }
    function isPrivacyIdentityZone(zone) { return api.isLayoutPrivacyZone(zone); }
    function isIdentityGridZone(zone) { return api.isIdentityGridZone(zone); }
    function isTextZone(zone) { return Boolean(zone && ["text-name", "text-subject", "text-other"].indexOf(zone.type) >= 0); }
    function isForcedRedactionZone(zone) { return Boolean(zone && zone.type === "text-name"); }
    function clearPreparedAiImage() {
      if (preparedAiImage) preparedAiImage.dataUrl = "";
      preparedAiImage = null;
      get("choice-wizard-ai-preview-image").removeAttribute("src");
      get("choice-wizard-ai-confirmation").hidden = true;
    }
    function clearAiSuggestions() {
      aiSuggestions = [];
      renderOverlay(); renderAiSuggestions();
    }
    function identityDecisionReady() {
      return api.layoutPrivacyDecisionReady(zones, get("choice-wizard-identities-complete").checked,
        get("choice-wizard-no-identity").checked);
    }
    function updateAiButton() {
      var button = get("choice-wizard-ai-prepare");
      var confirmationOpen = !get("choice-wizard-ai-confirmation").hidden;
      var enabled = Boolean(sampleFile && createMode && identityDecisionReady() && options.getAiSettings().ready && !aiRequestBusy && !confirmationOpen);
      button.disabled = !enabled;
      var status = get("choice-wizard-ai-status");
      if (!aiRequestBusy && (confirmationOpen || aiSuggestions.length)) return;
      if (aiRequestBusy) status.textContent = "正在處理版面建議；沒有儲存樣本或回應。";
      else if (!sampleFile) status.textContent = "請先載入本機樣本 PDF。";
      else if (!createMode) status.textContent = "請先選「由樣本建立新範本」。";
      else if (zones.some(isPrivacyIdentityZone) && !get("choice-wizard-identities-complete").checked) status.textContent = "標示所有文字及手寫身份區後，勾選已完成才可準備 AI 預覽。圈格可先畫概略框，亦可留待 AI 建議。";
      else if (!zones.some(isPrivacyIdentityZone) && !get("choice-wizard-no-identity").checked) status.textContent = "如答題紙沒有姓名等文字身份區，請明確勾選確認；班別及班號代號圈格不計作文字身份區。";
      else if (!options.getAiSettings().ready) status.textContent = "請在此頁下方的 AI 覆核設定啟用功能並輸入 API key 及模型。";
      else status.textContent = "文字及手寫身份區已確認；圈格會保留供 AI 定位。按下按鈕後先預覽實際影像，未確認不會送出。";
    }
    function updateIdentityConfirmation(resetPrivacyDecision) {
      var hasPrivacyIdentity = zones.some(isPrivacyIdentityZone);
      get("choice-wizard-no-identity-wrap").hidden = hasPrivacyIdentity;
      get("choice-wizard-identities-complete-wrap").hidden = !hasPrivacyIdentity;
      if (hasPrivacyIdentity) {
        get("choice-wizard-no-identity").checked = false;
        if (resetPrivacyDecision) get("choice-wizard-identities-complete").checked = false;
      } else {
        get("choice-wizard-identities-complete").checked = false;
        if (resetPrivacyDecision) get("choice-wizard-no-identity").checked = false;
      }
      if (resetPrivacyDecision) { clearPreparedAiImage(); clearAiSuggestions(); }
      updateAiButton();
    }
    function zoneTypeLabel(type) {
      return ({ "text-name": "文字遮罩：姓名", "text-subject": "文字遮罩：科目", "text-other": "文字遮罩：其他",
        "class-grade-grid": "班別圈格：年級", "class-form-grid": "班別圈格：字母", "student-number-grid": "班號圈格：數字",
        "class-handwrite": "手寫班別", "student-handwrite": "手寫班號",
        "answer-mc": "選擇題答案欄", "answer-tf": "是非題答案欄" })[type] || "區域";
    }
    function renderZoneList() {
      var list = get("choice-wizard-zone-list");
      list.replaceChildren();
      zones.forEach(function (zone, index) {
        var item = document.createElement("div");
        item.className = "choice-wizard-zone-item" + (zone.id === selectedZoneId ? " selected" : "");
        var text = document.createElement("span");
        text.textContent = (index + 1) + ". " + zoneTypeLabel(zone.type) + " · " + zone.label +
          (zone.clickCalibrated ? " · 點圈建立" : "") +
          (zone.optionsPendingConfirmation ? " · 選項待確認" : "");
        item.append(text);
        if (isTextZone(zone)) {
          var labelField = document.createElement("label"); labelField.className = "choice-wizard-zone-rows choice-wizard-zone-label";
          var labelText = document.createElement("span"); labelText.textContent = "區域標籤";
          var labelInput = document.createElement("input"); labelInput.type = "text"; labelInput.maxLength = 80;
          labelInput.value = zone.label || ""; labelInput.setAttribute("aria-label", zoneTypeLabel(zone.type) + "自訂標籤");
          labelInput.addEventListener("input", function () { zone.label = labelInput.value.slice(0, 80); renderOverlay(); });
          labelField.append(labelText, labelInput); item.append(labelField);
        }
        if (isPrivacyIdentityZone(zone)) {
          var redactLabel = document.createElement("label"); redactLabel.className = "inline-check choice-wizard-zone-redact";
          var redactInput = document.createElement("input"); redactInput.type = "checkbox";
          redactInput.checked = isForcedRedactionZone(zone) || zone.redactForAi !== false;
          redactInput.disabled = isForcedRedactionZone(zone);
          redactInput.setAttribute("aria-label", zoneTypeLabel(zone.type) + "送 AI 時遮擋");
          var redactText = document.createElement("span"); redactText.textContent = "送 AI 時遮擋";
          redactInput.addEventListener("change", function () {
            zone.redactForAi = isForcedRedactionZone(zone) || redactInput.checked;
            clearPreparedAiImage(); clearAiSuggestions(); updateAiButton();
          });
          redactLabel.append(redactInput, redactText); item.append(redactLabel);
        }
        if (zone.type === "answer-mc" || zone.type === "answer-tf") {
          var rowLabel = document.createElement("label"); rowLabel.className = "choice-wizard-zone-rows";
          var rowText = document.createElement("span"); rowText.textContent = "本欄題數";
          var rowInput = document.createElement("input"); rowInput.type = "number"; rowInput.min = "1"; rowInput.max = "250";
          rowInput.value = String(zone.rowsPerColumn || 10); rowInput.setAttribute("aria-label", zoneTypeLabel(zone.type) + "本欄題數");
          rowInput.addEventListener("input", function () {
            zone.rowsPerColumn = Math.max(1, Math.min(250, Math.floor(Number(rowInput.value) || 1)));
          });
          rowLabel.append(rowText, rowInput); item.append(rowLabel);
          var groupSizeLabel = document.createElement("label"); groupSizeLabel.className = "choice-wizard-zone-rows";
          var groupSizeText = document.createElement("span"); groupSizeText.textContent = "每組題數（0 不分組）";
          var groupSizeInput = document.createElement("input"); groupSizeInput.type = "number"; groupSizeInput.min = "0"; groupSizeInput.max = "250"; groupSizeInput.step = "1";
          groupSizeInput.value = String(zone.groupSize || 0); groupSizeInput.setAttribute("aria-label", zoneTypeLabel(zone.type) + "每組題數");
          groupSizeInput.addEventListener("input", function () { zone.groupSize = Math.max(0, Math.min(250, Math.floor(Number(groupSizeInput.value) || 0))); });
          groupSizeLabel.append(groupSizeText, groupSizeInput); item.append(groupSizeLabel);
          var groupGapLabel = document.createElement("label"); groupGapLabel.className = "choice-wizard-zone-rows";
          var groupGapText = document.createElement("span"); groupGapText.textContent = "組間空位（行距倍數）";
          var groupGapInput = document.createElement("input"); groupGapInput.type = "number"; groupGapInput.min = "0"; groupGapInput.max = "10"; groupGapInput.step = "0.5";
          groupGapInput.value = String(zone.groupGap == null ? 1 : zone.groupGap); groupGapInput.setAttribute("aria-label", zoneTypeLabel(zone.type) + "組間空位");
          groupGapInput.addEventListener("input", function () { zone.groupGap = Math.max(0, Math.min(10, Number(groupGapInput.value) || 0)); });
          groupGapLabel.append(groupGapText, groupGapInput); item.append(groupGapLabel);
          var answerOptionsLabel = document.createElement("label"); answerOptionsLabel.className = "choice-wizard-zone-rows";
          var answerOptionsText = document.createElement("span"); answerOptionsText.textContent = "選項";
          var answerOptionsInput = document.createElement("input"); answerOptionsInput.type = "text";
          answerOptionsInput.value = (Array.isArray(zone.options) ? zone.options : (zone.type === "answer-tf" ? ["T", "F"] : ["A", "B", "C", "D"])).join(", ");
          answerOptionsInput.setAttribute("aria-label", zoneTypeLabel(zone.type) + "答案選項，以逗號分隔");
          answerOptionsInput.addEventListener("change", function () {
            try {
              zone.options = api.answerOptions(zone.type, answerOptionsInput.value);
              zone.optionsPendingConfirmation = false;
              answerOptionsInput.value = zone.options.join(", ");
              setStatus("choice-wizard-builder-status", "答案欄選項已更新。", false);
              renderZoneList();
            } catch (error) { setStatus("choice-wizard-builder-status", error.message || "答案欄選項無效。", true); }
          });
          answerOptionsLabel.append(answerOptionsText, answerOptionsInput); item.append(answerOptionsLabel);
        }
        if (zone.type === "class-grade-grid" || zone.type === "class-form-grid") {
          var optionLabel = document.createElement("label"); optionLabel.className = "choice-wizard-zone-rows";
          var optionText = document.createElement("span"); optionText.textContent = zone.type === "class-grade-grid" ? "年級選項" : "班別字母選項";
          var optionInput = document.createElement("input"); optionInput.type = "text";
          optionInput.value = (Array.isArray(zone.options) ? zone.options : api.normalizeGridOptions(zone.type, null)).join(", ");
          optionInput.setAttribute("aria-label", zoneTypeLabel(zone.type) + "選項，以逗號分隔");
          optionInput.addEventListener("input", function () { zone.options = optionInput.value; });
          optionInput.addEventListener("change", function () {
            try {
              zone.options = api.normalizeGridOptions(zone.type, optionInput.value);
              zone.optionsPendingConfirmation = false;
              optionInput.value = zone.options.join(", ");
              setStatus("choice-wizard-builder-status", "圈格選項已更新；建立範本時會按選項數量生成行位。", false);
              renderZoneList();
            } catch (error) {
              zone.options = optionInput.value;
              setStatus("choice-wizard-builder-status", error.message || "圈格選項無效。", true);
            }
          });
          optionLabel.append(optionText, optionInput); item.append(optionLabel);
        }
        var select = document.createElement("button"); select.type = "button"; select.className = "button compact"; select.textContent = "選取";
        select.addEventListener("click", function () { selectedZoneId = zone.id; renderOverlay(); renderZoneList(); });
        var remove = document.createElement("button"); remove.type = "button"; remove.className = "button compact danger-button"; remove.textContent = "刪除";
        remove.addEventListener("click", function () { var removedIdentity = isPrivacyIdentityZone(zone); zones = zones.filter(function (entry) { return entry.id !== zone.id; }); if (selectedZoneId === zone.id) selectedZoneId = ""; renderOverlay(); renderZoneList(); updateIdentityConfirmation(removedIdentity); });
        item.append(select, remove); list.append(item);
      });
      get("choice-wizard-delete-zone").disabled = !selectedZoneId;
      updateIdentityConfirmation(false);
    }
    function renderOverlay() {
      var overlay = get("choice-wizard-overlay");
      overlay.replaceChildren();
      zones.forEach(function (zone) {
        var group = svg("g", { "data-zone-id": zone.id, class: zone.id === selectedZoneId ? "choice-wizard-zone is-selected" : "choice-wizard-zone" });
        group.append(svg("rect", { x: zone.x, y: zone.y, width: zone.w, height: zone.h, rx: 0.002 }));
        var label = svg("text", { x: zone.x + 0.004, y: zone.y + 0.018, "pointer-events": "none", "font-size": "0.014" });
        label.textContent = zone.label || zoneTypeLabel(zone.type);
        group.append(label);
        if (zone.id === selectedZoneId) group.append(svg("rect", { x: zone.x + zone.w - 0.018, y: zone.y + zone.h - 0.018,
          width: 0.018, height: 0.018, class: "choice-wizard-resize", "data-zone-handle": "resize", "data-zone-id": zone.id }));
        overlay.append(group);
      });
      if (drawing && drawing.kind === "new") {
        overlay.append(svg("rect", { x: drawing.zone.x, y: drawing.zone.y, width: drawing.zone.w, height: drawing.zone.h, class: "choice-wizard-zone-preview" }));
      }
      aiSuggestions.forEach(function (suggestion, index) {
        var rect = suggestion.rect || suggestion;
        var group = svg("g", { class: "choice-wizard-ai-suggestion-zone", "data-ai-suggestion": index });
        group.append(svg("rect", { x: rect.x, y: rect.y, width: rect.w, height: rect.h }));
        var label = svg("text", { x: rect.x + 0.004, y: rect.y + 0.018, "pointer-events": "none", "font-size": "0.014" });
        label.textContent = suggestion.label;
        group.append(label); overlay.append(group);
      });
      if (clickMode) {
        (clickMode.points || []).forEach(function (point, index) {
          var circle = svg("circle", { cx: point.x, cy: point.y, r: 0.006,
            class: point.snapped ? "choice-wizard-click-point" : "choice-wizard-click-point is-unsnapped",
            "data-click-point-index": index, "aria-label": point.label || clickPointLabel(point) });
          var label = svg("text", { x: point.x + 0.006, y: point.y - 0.006, "font-size": "0.012", "pointer-events": "none" });
          label.textContent = point.label || clickPointLabel(point);
          overlay.append(circle, label);
        });
        var preview = clickMode.calibration;
        if (preview) {
          var rows = api.rowCoordinates(preview.rows);
          preview.xs.forEach(function (x) {
            rows.forEach(function (y) {
              overlay.append(svg("circle", { cx: x, cy: y, r: 0.0045, class: "choice-wizard-click-prediction",
                "data-click-predicted-circle": "true" }));
            });
          });
        }
      }
    }
    function renderAiSuggestions() {
      var list = get("choice-wizard-ai-suggestions");
      list.replaceChildren();
      aiSuggestions.forEach(function (suggestion, index) {
        var item = document.createElement("div"); item.className = "choice-wizard-ai-suggestion";
        var label = document.createElement("span"); label.textContent = suggestion.label +
          (suggestion.options ? " · " + suggestion.options.join("／") : "") +
          (suggestion.rowsPerColumn ? " · " + suggestion.rowsPerColumn + " 行" : "") +
          (suggestion.optionsPendingConfirmation ? " · 選項待確認" : "");
        var actions = document.createElement("div"); actions.className = "choice-wizard-ai-suggestion-actions";
        var accept = document.createElement("button"); accept.type = "button"; accept.className = "button compact primary"; accept.textContent = "接受並可調整";
        accept.addEventListener("click", function () {
          var accepted = Object.assign({}, suggestion, { id: "ai-zone-" + Date.now().toString(36) + "-" + index });
          zones.push(accepted); selectedZoneId = accepted.id;
          aiSuggestions.splice(index, 1);
          renderOverlay(); renderZoneList(); renderAiSuggestions();
          if (isPrivacyIdentityZone(accepted)) updateIdentityConfirmation(true);
        });
        var discard = document.createElement("button"); discard.type = "button"; discard.className = "button compact"; discard.textContent = "刪除建議";
        discard.addEventListener("click", function () { aiSuggestions.splice(index, 1); renderOverlay(); renderAiSuggestions(); });
        actions.append(accept, discard); item.append(label, actions); list.append(item);
      });
    }
    function pointFromEvent(event) {
      var rect = get("choice-wizard-overlay").getBoundingClientRect();
      return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
    }

    function clickOptionLabels() { return Array.from(get("choice-wizard-options").value); }
    function clickPointLabel(point) {
      if (point.role === "option") return point.label + " 圈";
      if (point.role === "anchor") return "定位題 " + clickMode.anchorQuestionNumber + " A 圈";
      if (point.role === "gap") return "下一組第一題 A 圈";
      return "第 " + clickMode.startQuestionNumber + " 題 A 圈";
    }
    function snapClickPoint(point, label) {
      var canvas = get("choice-wizard-canvas");
      if (!options.omr || !canvas || !canvas.width || !canvas.height) return Object.assign({}, point, { snapped: false, label: label });
      try {
        var data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
        var params = templates.choiceParameters(templates.BUILTIN_TEMPLATES[0]);
        var result = options.omr.refineBubbleCenter(data.data, canvas.width, canvas.height,
          { x: point.x, y: point.y, type: "mc" }, { dx: 0, dy: 0, angle: 0, scale: 1 }, params);
        if (result.found) return { x: result.center.x / canvas.width, y: result.center.y / canvas.height,
          snapped: true, label: label };
      } catch (error) { /* Keep the teacher's click when a nearby bubble cannot be measured. */ }
      return Object.assign({}, point, { snapped: false, label: label });
    }
    function renderClickControls(message) {
      var panel = get("choice-wizard-click-panel");
      var active = Boolean(createMode && samplePage && get("choice-wizard-zone-type").value === "answer-mc");
      panel.hidden = !active;
      get("choice-wizard-zone-type").disabled = Boolean(clickMode);
      get("choice-wizard-options").disabled = Boolean(clickMode);
      if (!active) return;
      var inProgress = Boolean(clickMode);
      get("choice-wizard-click-start").hidden = inProgress || Boolean(baseClickCalibration);
      get("choice-wizard-click-add-column").hidden = inProgress || !baseClickCalibration;
      get("choice-wizard-click-cancel").hidden = !inProgress;
      get("choice-wizard-click-complete").hidden = !inProgress || clickMode.stage !== "settings";
      get("choice-wizard-click-anchor-wrap").hidden = !inProgress || clickMode.kind !== "first" || clickMode.stage !== "anchor";
      get("choice-wizard-click-start-wrap").hidden = !inProgress || clickMode.kind !== "additional";
      get("choice-wizard-click-group-wrap").hidden = !inProgress || clickMode.kind !== "first" || clickMode.stage !== "settings";
      get("choice-wizard-click-count").closest("label").hidden = !inProgress || clickMode.stage === "options" || clickMode.stage === "anchor" || clickMode.stage === "gap";
      get("choice-wizard-click-measure-gap").hidden = !inProgress || clickMode.kind !== "first" || clickMode.stage !== "settings" ||
        !Number(get("choice-wizard-click-group-size").value) || Number(get("choice-wizard-click-count").value) <= Number(get("choice-wizard-click-group-size").value) || Boolean(clickMode.gapChosen);
      get("choice-wizard-click-skip-gap").hidden = !inProgress || clickMode.kind !== "first" || clickMode.stage !== "settings" ||
        !Number(get("choice-wizard-click-group-size").value) || Number(get("choice-wizard-click-count").value) <= Number(get("choice-wizard-click-group-size").value) || Boolean(clickMode.gapChosen);
      get("choice-wizard-click-status").textContent = message || (inProgress
        ? "請按提示在樣本頁點圈。點不到清晰圈心時會保留點擊位置，可拖動微調。"
        : baseClickCalibration ? "第一欄已完成；可繼續拉框混用，或按「再加一欄」沿用同一間距。"
          : "選擇題答案欄可沿用拖拉畫框，亦可按「點圈建立」量度圈心及行距。");
      renderOverlay();
    }
    function clickCalibrationInput() {
      if (!clickMode) return null;
      var count = Number(get("choice-wizard-click-count").value);
      if (clickMode.kind === "additional") {
        var point = clickMode.points[0];
        if (!point) return null;
        return api.extendClickCalibration(baseClickCalibration, point, Number(get("choice-wizard-click-start-number").value), count);
      }
      var optionsPoints = clickMode.points.filter(function (point) { return point.role === "option"; });
      var anchor = clickMode.points.find(function (point) { return point.role === "anchor"; });
      var gap = clickMode.points.find(function (point) { return point.role === "gap"; });
      if (optionsPoints.length !== clickMode.optionLabels.length || !anchor) return null;
      return api.createClickCalibration({ optionPoints: optionsPoints, firstQuestionNumber: clickMode.startQuestionNumber,
        anchorQuestionNumber: Number(get("choice-wizard-click-anchor-number").value), anchorPoint: anchor,
        questionCount: count, groupSize: Number(get("choice-wizard-click-group-size").value), nextGroupPoint: gap || null });
    }
    function refreshClickPreview() {
      if (!clickMode || clickMode.stage !== "settings") return;
      try {
        clickMode.calibration = clickCalibrationInput();
        get("choice-wizard-click-complete").disabled = !clickMode.calibration;
        get("choice-wizard-click-status").textContent = clickMode.calibration
          ? "已按定位點生成 " + clickMode.calibration.questionCount + " 題預覽；可拖動綠圈或定位點微調，再按「完成並加入答案欄」。"
          : "請補齊點圈資料。";
      } catch (error) {
        clickMode.calibration = null;
        get("choice-wizard-click-complete").disabled = true;
        get("choice-wizard-click-status").textContent = error.message || "點圈資料無效。";
      }
      renderOverlay();
    }
    function startClickCalibration(additional) {
      if (!samplePage || get("choice-wizard-zone-type").value !== "answer-mc") return;
      var count = Math.max(1, Number(get("choice-wizard-rows").value) || 15);
      get("choice-wizard-click-count").value = String(additional && baseClickCalibration ? baseClickCalibration.questionCount : count);
      if (additional && baseClickCalibration) {
        var existingEnd = Math.max.apply(null, zones.filter(function (zone) { return zone.clickCalibrated; })
          .map(function (zone) { return Number(zone.questionStart) + Number(zone.rowsPerColumn) - 1; }).concat([0]));
        get("choice-wizard-click-start-number").value = String(Math.max(existingEnd + 1, 1));
        clickMode = { kind: "additional", stage: "additional", points: [],
          startQuestionNumber: Number(get("choice-wizard-click-start-number").value),
          optionLabels: (baseClickCalibration.optionLabels || clickOptionLabels()).slice() };
        renderClickControls("點新欄第 " + clickMode.startQuestionNumber + " 題的 A 圈；其他選項圈會按第一欄間距生成。");
      } else {
        get("choice-wizard-click-anchor-number").value = "2";
        get("choice-wizard-click-group-size").value = "5";
        clickMode = { kind: "first", stage: "options", points: [], startQuestionNumber: 1, optionLabels: clickOptionLabels() };
        renderClickControls("第一步：依次點第一題的 " + clickMode.optionLabels.join("、") + " 圈。");
      }
    }
    function acceptClickPoint(point) {
      if (!clickMode) return;
      var snapped = snapClickPoint(point, "");
      if (clickMode.stage === "options") {
        var optionLabel = clickMode.optionLabels[clickMode.points.filter(function (entry) { return entry.role === "option"; }).length];
        snapped.role = "option"; snapped.label = optionLabel;
        clickMode.points.push(snapped);
        if (clickMode.points.filter(function (entry) { return entry.role === "option"; }).length >= clickMode.optionLabels.length) {
          clickMode.stage = "anchor";
          get("choice-wizard-click-anchor-number").value = "2";
          renderClickControls("第二步：點同一欄另一題的 A 圈。題號預設 2；可改成所點題號，建議選較遠的一題。");
        } else renderClickControls("請點第一題的 " + clickMode.optionLabels[clickMode.points.filter(function (entry) { return entry.role === "option"; }).length] + " 圈。");
      } else if (clickMode.stage === "anchor") {
        snapped.role = "anchor"; snapped.label = "定位題 A"; clickMode.points.push(snapped);
        clickMode.anchorQuestionNumber = Number(get("choice-wizard-click-anchor-number").value) || 2;
        clickMode.stage = "settings"; renderClickControls(); refreshClickPreview();
      } else if (clickMode.stage === "gap") {
        snapped.role = "gap"; snapped.label = "下一組第一題 A"; clickMode.points.push(snapped); clickMode.gapChosen = true;
        clickMode.stage = "settings"; renderClickControls(); refreshClickPreview();
      } else if (clickMode.stage === "additional") {
        snapped.role = "additional"; snapped.label = "新欄第一題 A"; clickMode.points.push(snapped);
        clickMode.stage = "settings"; renderClickControls(); refreshClickPreview();
      }
    }
    function completeClickCalibration() {
      if (!clickMode) return;
      try {
        var calibration = clickMode.calibration || clickCalibrationInput();
        if (!calibration) throw new Error("請先完成所有點圈步驟。");
        calibration.optionLabels = clickMode.optionLabels.slice();
        var zone = api.createClickCalibratedZone(calibration, { options: clickMode.optionLabels });
        zone.clickCalibrated = true;
        zone.clickCalibrationInfo = calibration;
        zones.push(zone); selectedZoneId = zone.id;
        if (!baseClickCalibration) baseClickCalibration = calibration;
        clickMode = null;
        renderZoneList(); renderClickControls("點圈答案欄已加入；範本尚未建立，可繼續新增其他區域或點「建立範本並調整位置」。");
      } catch (error) { get("choice-wizard-click-status").textContent = error.message || "點圈校準無法完成。"; }
    }
    function cancelClickCalibration() {
      clickMode = null;
      renderClickControls("已取消目前點圈步驟；已加入的範圍保留。");
    }
    function zoneConfig(point) {
      var type = get("choice-wizard-zone-type").value;
      var names = { "text-name": "姓名", "text-subject": "科目", "text-other": "其他文字區", "class-grade-grid": "班別年級圈格",
        "class-form-grid": "班別字母圈格", "student-number-grid": "學號圈格", "class-handwrite": "班別手寫區", "student-handwrite": "學號手寫區",
        "answer-mc": "選擇題答案欄", "answer-tf": "是非題答案欄" };
      var zone = { id: "zone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6), type: type,
        label: names[type] || "新區域", x: point.x, y: point.y, w: 0, h: 0,
        digits: Number(get("choice-wizard-digits").value) || 4 };
      if (isPrivacyIdentityZone(zone)) {
        zone.redactForAi = zone.type === "class-handwrite" || zone.type === "student-handwrite" ? false : true;
      }
      if (type === "answer-mc" || type === "answer-tf") { zone.groupSize = 0; zone.groupGap = 1; }
      if (type === "class-grade-grid" || type === "class-form-grid") zone.options = api.normalizeGridOptions(type, null);
      return zone;
    }
    function pointerDown(event) {
      if (!createMode || !samplePage || event.button !== 0) return;
      var clickPointTarget = event.target.closest("[data-click-point-index]");
      if (clickMode && clickPointTarget) {
        var clickIndex = Number(clickPointTarget.getAttribute("data-click-point-index"));
        drawing = { kind: "click-point", index: clickIndex };
        get("choice-wizard-overlay").setPointerCapture(event.pointerId);
        event.preventDefault(); return;
      }
      if (clickMode) {
        acceptClickPoint(pointFromEvent(event));
        event.preventDefault(); return;
      }
      var target = event.target.closest("[data-zone-id]");
      var handle = event.target.closest("[data-zone-handle]");
      var point = pointFromEvent(event);
      if (target) {
        var zone = zones.find(function (entry) { return entry.id === target.dataset.zoneId; });
        if (!zone) return;
        selectedZoneId = zone.id;
        drawing = { kind: handle ? "resize" : "move", zone: zone, origin: point,
          initial: { x: zone.x, y: zone.y, w: zone.w, h: zone.h } };
      } else {
        selectedZoneId = "";
        drawing = { kind: "new", origin: point, zone: zoneConfig(point) };
      }
      get("choice-wizard-overlay").setPointerCapture(event.pointerId);
      renderOverlay(); renderZoneList(); event.preventDefault();
    }
    function pointerMove(event) {
      if (!drawing) return;
      var point = pointFromEvent(event);
      if (drawing.kind === "click-point") {
        var selectedPoint = clickMode && clickMode.points[drawing.index];
        if (selectedPoint) { selectedPoint.x = point.x; selectedPoint.y = point.y; }
        refreshClickPreview();
      } else if (drawing.kind === "new") {
        drawing.zone.x = Math.min(drawing.origin.x, point.x); drawing.zone.y = Math.min(drawing.origin.y, point.y);
        drawing.zone.w = Math.abs(point.x - drawing.origin.x); drawing.zone.h = Math.abs(point.y - drawing.origin.y);
      } else if (drawing.kind === "move") {
        var dx = point.x - drawing.origin.x; var dy = point.y - drawing.origin.y;
        drawing.zone.x = clamp(drawing.initial.x + dx, 0, 1 - drawing.initial.w);
        drawing.zone.y = clamp(drawing.initial.y + dy, 0, 1 - drawing.initial.h);
      } else {
        drawing.zone.w = clamp(point.x - drawing.zone.x, 0.015, 1 - drawing.zone.x);
        drawing.zone.h = clamp(point.y - drawing.zone.y, 0.015, 1 - drawing.zone.y);
      }
      renderOverlay(); event.preventDefault();
    }
    function pointerUp(event) {
      if (!drawing) return;
      if (drawing.kind === "click-point") {
        drawing = null; renderOverlay();
        if (get("choice-wizard-overlay").hasPointerCapture(event.pointerId)) get("choice-wizard-overlay").releasePointerCapture(event.pointerId);
        event.preventDefault(); return;
      }
      var identityDecisionChanged = false;
      if (drawing.kind === "new") {
        var zone = drawing.zone;
        if (zone.w >= 0.015 && zone.h >= 0.015) {
          if (zone.type === "answer-mc" || zone.type === "answer-tf") {
            var optionsCount = get("choice-wizard-options").value.length;
            zone.options = zone.type === "answer-tf" ? ["T", "F"] : Array.from(get("choice-wizard-options").value);
            zone.rowsPerColumn = Number(get("choice-wizard-rows").value) || 10;
            if (zone.groupSize == null) zone.groupSize = 0;
            if (zone.groupGap == null) zone.groupGap = 1;
            zone.numbering = get("choice-wizard-numbering").value;
            if (zone.type === "answer-mc") zone.optionsCount = optionsCount;
          }
          zones.push(zone); selectedZoneId = zone.id; identityDecisionChanged = isPrivacyIdentityZone(zone);
        }
      } else if (isPrivacyIdentityZone(drawing.zone) && (drawing.zone.x !== drawing.initial.x || drawing.zone.y !== drawing.initial.y ||
          drawing.zone.w !== drawing.initial.w || drawing.zone.h !== drawing.initial.h)) identityDecisionChanged = true;
      drawing = null; renderOverlay(); renderZoneList(); event.preventDefault();
      if (identityDecisionChanged) updateIdentityConfirmation(true);
      if (get("choice-wizard-overlay").hasPointerCapture(event.pointerId)) get("choice-wizard-overlay").releasePointerCapture(event.pointerId);
    }
    async function renderSamplePage() {
      if (!sampleDocument) return;
      var token = ++sampleToken;
      if (sampleRenderTask && typeof sampleRenderTask.cancel === "function") { try { sampleRenderTask.cancel(); } catch (error) { /* cancelled render */ } }
      var pageNo = clamp(Math.floor(Number(get("choice-wizard-page").value) || 1), 1, sampleDocument.numPages);
      get("choice-wizard-page").value = String(pageNo);
      var page = await sampleDocument.getPage(pageNo);
      var base = page.getViewport({ scale: 1 });
      var scale = Math.min(1.5, 1000 / Math.max(base.width, base.height));
      var viewport = page.getViewport({ scale: scale });
      if (token !== sampleToken) return;
      var canvas = get("choice-wizard-canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); canvas.hidden = false;
      get("choice-wizard-empty").hidden = true;
      samplePage = page; sampleViewport = viewport;
      sampleRenderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport });
      await sampleRenderTask.promise;
      if (token !== sampleToken) return;
      sampleRenderTask = null;
      get("choice-wizard-overlay").setAttribute("viewBox", "0 0 1 1");
      get("choice-wizard-page").max = String(sampleDocument.numPages);
      get("choice-wizard-answer-page").max = String(sampleDocument.numPages);
      setStatus("choice-wizard-source-status", "樣本 PDF 已在本機開啟；第 " + pageNo + " / " + sampleDocument.numPages + " 頁。", false);
      updateSourceButtons(); renderClickControls(); renderOverlay();
      if (currentStage === 4) renderAnswerPage();
    }
    async function loadSample(file) {
      if (!file) return;
      sampleFile = file; samplePage = null; createMode = false; zones = []; selectedZoneId = "";
      clickMode = null; baseClickCalibration = null;
      clearPreparedAiImage(); clearAiSuggestions(); get("choice-wizard-no-identity").checked = false;
      get("choice-wizard-identities-complete").checked = false;
      if (sampleDocument && typeof sampleDocument.destroy === "function") sampleDocument.destroy();
      sampleDocument = null;
      if (sampleRenderTask && typeof sampleRenderTask.cancel === "function") { try { sampleRenderTask.cancel(); } catch (error) { /* cancelled render */ } }
      if (!root.pdfjsLib || !root.LT_PDF_WORKER_SRC) {
        setStatus("choice-wizard-source-status", root.LT_OFFLINE ? "套件不完整：請先把 zip 完整解壓，再開啟 START-HERE.html" : "PDF 程式庫未載入；請連線後重新整理頁面。", true);
        return;
      }
      try {
        var bytes = new Uint8Array(await file.arrayBuffer());
        sampleDocument = await root.pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
        get("choice-wizard-page").value = "1";
        get("choice-wizard-answer-page").value = "1";
        await renderSamplePage();
      } catch (error) {
        sampleDocument = null; sampleFile = null;
        setStatus("choice-wizard-source-status", "樣本 PDF 無法開啟；請確認檔案完整且未加密。", true);
      }
    }
    function beginCreate() {
      if (!sampleFile) { setStatus("choice-wizard-source-status", "請先載入樣本 PDF。", true); return; }
      var continuing = createMode && zones.length > 0;
      createMode = true; selectedTemplate = null;
      if (!continuing) {
        zones = []; selectedZoneId = "";
        clickMode = null; baseClickCalibration = null;
        get("choice-wizard-no-identity").checked = false; get("choice-wizard-identities-complete").checked = false;
        clearPreparedAiImage(); clearAiSuggestions();
      }
      get("choice-wizard-builder").hidden = false;
      setStatus("choice-wizard-source-status", "請拖拉標示姓名、科目、其他文字及手寫身份區；班別／班號圈格可先畫概略框，亦可留待 AI 建議。", false);
      renderOverlay(); renderZoneList(); renderClickControls(); updateSourceButtons(); updateIdentityConfirmation(false);
    }
    function openEditorForSelected(forceReset, definition) {
      definition = definition || selectedDefinition();
      if (!definition) return;
      get("choice-wizard-builder").hidden = true;
      get("choice-wizard-editor-slot").append(editorPanel);
      var context = typeof options.getEditorContext === "function" ? options.getEditorContext() : null;
      if (!forceReset && context && context.templateId === definition.id && context.sampleFile === sampleFile && options.getEditorDraft()) return;
      get("choice-wizard-position-status").textContent = definition.source === "builtin"
        ? "內置範本會以自訂副本編輯；內置範本保持不變。"
        : "範本只保存圈位及遮罩設定，不包括樣本、答案或學生資料。";
      options.openEditor(definition, sampleFile);
    }
    function editorTransition(definition) {
      var context = typeof options.getEditorContext === "function" ? options.getEditorContext() : null;
      return api.editorTransition(context && context.templateId, context && context.sampleFile,
        definition && definition.id, sampleFile, Boolean(options.getEditorDraft()));
    }
    function confirmEditorReplacement(definition) {
      if (definition && pendingEditorReplacementId === definition.id) return true;
      if (editorTransition(definition) !== "reopen" || typeof options.hasEditorUnsavedChanges !== "function" ||
          !options.hasEditorUnsavedChanges()) return true;
      return root.confirm("第三步有未儲存的範本修改，改用新範本會放棄這些修改。要繼續嗎？");
    }
    function syncEditorForSelected(definition, replacementConfirmed) {
      if (!definition) return true;
      var transition = editorTransition(definition);
      if (transition === "preserve") { pendingEditorReplacementId = ""; return true; }
      if (transition === "reload-sample") {
        pendingEditorReplacementId = "";
        if (typeof options.loadEditorSample === "function") options.loadEditorSample(sampleFile);
        else openEditorForSelected(true, definition);
        return true;
      }
      var alreadyConfirmed = replacementConfirmed || pendingEditorReplacementId === definition.id;
      if (transition === "reopen" && !alreadyConfirmed && !confirmEditorReplacement(definition)) return false;
      pendingEditorReplacementId = "";
      openEditorForSelected(true, definition);
      return true;
    }
    function selectTemplate(definition, selectionOptions, syncEditorNow) {
      var transition = definition ? editorTransition(definition) : "open";
      if (!definition || !confirmEditorReplacement(definition)) {
        if (definition) setStatus("choice-wizard-source-status", "已取消切換；原有範本草稿仍保留。", false);
        return false;
      }
      if (!options.onSelectTemplate(definition, selectionOptions)) return false;
      pendingEditorReplacementId = transition === "reopen" ? definition.id : "";
      selectedTemplate = definition;
      updateTemplateOrderWarning(definition);
      return syncEditorNow === false ? true : syncEditorForSelected(definition, transition === "reopen");
    }
    function updateCountStatus() {
      var definition = options.getEditorDraft() || selectedDefinition();
      if (!definition) return;
      var parts = [];
      var invalidCount = false;
      ["mc", "tf"].forEach(function (type) {
        var block = definition.blocks.find(function (entry) { return entry.type === type; });
        if (!block) return;
        var raw = Number(get(type === "mc" ? "mc-count" : "tf-count").value) || 0;
        if (raw > block.maxCount) {
          invalidCount = true;
          parts.push((type === "mc" ? "選擇題" : "是非題") + "題數超出可用圈位 " + block.maxCount + " 題，請減少題數或調整範本。");
        }
        else parts.push((type === "mc" ? "選擇題" : "是非題") + "可用圈位 " + block.maxCount + " 題；目前設定 " + raw + " 題。");
      });
      setStatus("choice-wizard-count-status", parts.join(" "), invalidCount);
      get("choice-wizard-next-to-answers").disabled = invalidCount;
    }
    function handleBuildTemplate() {
      try {
        var mcColumns = zones.filter(function (zone) { return zone.type === "answer-mc"; }).length;
        var tfColumns = zones.filter(function (zone) { return zone.type === "answer-tf"; }).length;
        var rowInputs = zones.filter(function (zone) { return zone.type === "answer-mc" || zone.type === "answer-tf"; }).map(function (zone) { return zone.rowsPerColumn || 10; });
        var rowsPerColumn = rowInputs.length ? Math.max.apply(null, rowInputs) : Number(get("choice-wizard-rows").value) || 10;
        function numberingFor(type) {
          var entries = zones.filter(function (zone) { return zone.type === (type === "mc" ? "answer-mc" : "answer-tf"); });
          var numberings = entries.map(function (zone) { return zone.numbering; }).filter(function (value) { return value === "column-major" || value === "row-major"; });
          return numberings.length && numberings.every(function (value) { return value === numberings[0]; }) ? numberings[0] : get("choice-wizard-numbering").value;
        }
        var definition = api.createTemplateFromZones({ templates: templates, zones: zones, pageWidth: sampleViewport.width, pageHeight: sampleViewport.height,
          name: get("choice-wizard-name").value, id: safeSlug(get("choice-wizard-name").value) + "-" + Date.now().toString(36),
          mcOptions: Array.from(get("choice-wizard-options").value), rowsPerColumn: rowsPerColumn,
          mcNumbering: numberingFor("mc"), tfNumbering: numberingFor("tf"),
          confirmNoIdentityArea: get("choice-wizard-no-identity").checked });
        if (mcColumns && rowInputs.length && get("choice-wizard-rows").value === "") throw new Error("請設定每欄題數。");
        if (!selectTemplate(definition)) return;
        get("choice-wizard-template").value = "";
        renderStage(3);
        setStatus("choice-wizard-position-status", "已建立待調整範本；按「儲存為自訂範本」後才可繼續。", false);
      } catch (error) {
        setStatus("choice-wizard-builder-status", error.message || "範本設定不正確。", true);
      }
    }
    function privacyDefinition() {
      return api.createLayoutPrivacyDefinition(zones, get("choice-wizard-no-identity").checked);
    }
    async function prepareAiLayout() {
      if (!identityDecisionReady()) { updateAiButton(); return; }
      var settings = options.getAiSettings();
      if (!settings.ready) { setStatus("choice-wizard-ai-status", "請先在此頁下方的 AI 覆核設定啟用功能並輸入有效 API key 及模型名稱。", true); return; }
      if (!samplePage || !createMode) { updateAiButton(); return; }
      clearPreparedAiImage(); clearAiSuggestions(); aiRequestBusy = true; updateAiButton();
      try {
        var layoutCanvas = document.createElement("canvas");
        var baseViewport = samplePage.getViewport({ scale: 1 });
        var layoutScale = Math.min(1600 / Math.max(baseViewport.width, baseViewport.height), 3);
        var layoutViewport = samplePage.getViewport({ scale: layoutScale });
        layoutCanvas.width = Math.ceil(layoutViewport.width); layoutCanvas.height = Math.ceil(layoutViewport.height);
        await samplePage.render({ canvasContext: layoutCanvas.getContext("2d", { willReadFrequently: true }), viewport: layoutViewport }).promise;
        var image;
        try { image = await options.createLayoutImage(layoutCanvas, privacyDefinition()); }
        finally { layoutCanvas.width = 0; layoutCanvas.height = 0; }
        image.provider = settings.provider; image.model = settings.model;
        preparedAiImage = image;
        get("choice-wizard-ai-preview-image").src = image.dataUrl;
        get("choice-wizard-ai-provider").textContent = "供應者：" + settings.providerLabel + "；模型：" + settings.model;
        var maskedAreas = image.redactedAreas.length ? image.redactedAreas.join("、") : "無（已確認沒有姓名等文字身份區）";
        var unmaskedText = zones.filter(function (zone) {
          return isPrivacyIdentityZone(zone) && zone.type !== "text-name" && zone.redactForAi === false;
        })
          .map(function (zone) { return zone.label || zoneTypeLabel(zone.type); });
        var visibleGrids = zones.filter(isIdentityGridZone).map(function (zone) { return zone.label || zoneTypeLabel(zone.type); });
        get("choice-wizard-ai-masks").textContent = "已遮走：" + maskedAreas +
          (image.redactedAreas.length ? "（含每邊至少 1.5% 頁寬安全邊距）" : "") +
          "。教師選擇不遮：" + (unmaskedText.length ? unmaskedText.join("、") : "無") +
          "。未遮（班別／班號代號圈格，供 AI 定位）：" + (visibleGrids.length ? visibleGrids.join("、") : "沒有已標示圈格；AI 可提出建議");
        get("choice-wizard-ai-confirmation").hidden = false;
        setStatus("choice-wizard-ai-status", "請核對以下實際送出影像。只有按「確認送出」才會連接服務；取消不會送出。", false);
      } catch (error) {
        setStatus("choice-wizard-ai-status", error && error.message ? error.message : "無法安全產生預覽，已停止送出。", true);
      } finally {
        aiRequestBusy = false; updateAiButton();
      }
    }
    function suggestionZones(result) {
      var output = [];
      result.answerColumns.forEach(function (item) {
        output.push({ type: item.type === "tf" ? "answer-tf" : "answer-mc",
          label: item.type === "tf" ? "AI 建議是非題欄" : "AI 建議選擇題欄",
          x: item.rect.x, y: item.rect.y, w: item.rect.w, h: item.rect.h,
          options: item.options.slice(), rowsPerColumn: item.rows, groupSize: item.groupSize || 0,
          groupGap: item.groupSize ? 1 : 0, numbering: item.numbering });
      });
      result.identityFields.forEach(function (item) {
        var labels = { "class-grade-grid": "AI 建議班別年級圈格", "class-form-grid": "AI 建議班別字母圈格", "student-number-grid": "AI 建議班號圈格" };
        output.push({ type: item.type, label: labels[item.type], x: item.rect.x, y: item.rect.y,
          w: item.rect.w, h: item.rect.h, options: item.options && item.options.slice(), digits: item.digits || 4,
          optionsPendingConfirmation: item.optionsPendingConfirmation === true });
      });
      return output;
    }
    async function confirmAiLayout() {
      if (!preparedAiImage || aiRequestBusy) return;
      var currentSettings = options.getAiSettings();
      if (!currentSettings.ready || currentSettings.provider !== preparedAiImage.provider || currentSettings.model !== preparedAiImage.model) {
        clearPreparedAiImage();
        setStatus("choice-wizard-ai-status", "AI 設定已更改或不完整；請先確認設定，再重新產生預覽。", true);
        updateAiButton(); return;
      }
      var image = preparedAiImage;
      var finalErrorMessage = "";
      aiRequestBusy = true; updateAiButton();
      get("choice-wizard-ai-confirm").disabled = true; get("choice-wizard-ai-cancel").disabled = true;
      try {
        var result = await options.requestAiLayout(image);
        image.dataUrl = ""; clearPreparedAiImage();
        if (!result || !result.ok) {
          finalErrorMessage = result && result.message || "AI 版面建議失敗；沒有套用任何區域。";
          setStatus("choice-wizard-ai-status", finalErrorMessage, true);
          return;
        }
        aiSuggestions = suggestionZones(result);
        renderOverlay(); renderAiSuggestions();
        setStatus("choice-wizard-ai-status", result.message + " 共 " + aiSuggestions.length + " 項；接受後可在樣本頁移動、改大小或刪除。", false);
      } catch (error) {
        image.dataUrl = ""; clearPreparedAiImage();
        finalErrorMessage = error && error.message ? error.message : "AI 版面建議失敗；沒有套用任何區域。";
        setStatus("choice-wizard-ai-status", finalErrorMessage, true);
      } finally {
        aiRequestBusy = false; get("choice-wizard-ai-confirm").disabled = false; get("choice-wizard-ai-cancel").disabled = false; updateAiButton();
        if (finalErrorMessage) setStatus("choice-wizard-ai-status", finalErrorMessage, true);
      }
    }
    function selectedOptions(type) {
      var count = Number(get(type === "mc" ? "mc-count" : "tf-count").value) || 0;
      var definition = selectedDefinition();
      var block = definition && definition.blocks.find(function (entry) { return entry.type === type; });
      return { count: count, choices: block ? templates.choiceOptionsFor(definition, type, block.options) : (type === "tf" ? ["T", "F"] : ["A", "B", "C", "D"]) };
    }
    function renderSimpleAnswerGrid() {
      var holder = get("choice-wizard-answer-grid");
      var definition = selectedDefinition();
      holder.replaceChildren();
      if (!definition || definition.kind !== "choice") return;
      ["mc", "tf"].forEach(function (type) {
        var settings = selectedOptions(type);
        if (!settings.count) return;
        var input = get(type === "mc" ? "mc-key" : "tf-key");
        var key = api.keyArray(input.value, settings.count, settings.choices);
        for (var start = 0; start < settings.count; start += 10) {
          var group = document.createElement("section");
          group.className = "choice-answer-group";
          var heading = document.createElement("h3");
          heading.textContent = (type === "mc" ? "選擇題" : "是非題") + "第 " + (start + 1) + "–" + Math.min(settings.count, start + 10) + " 題";
          var questions = document.createElement("div");
          questions.className = "choice-answer-question-grid";
          for (let number = start + 1; number <= Math.min(settings.count, start + 10); number += 1) {
            var row = document.createElement("div"); row.className = "choice-answer-question";
            var label = document.createElement("strong"); label.textContent = String(number);
            var optionsRow = document.createElement("div"); optionsRow.className = "choice-answer-option-row";
            settings.choices.forEach(function (choice) {
              var button = document.createElement("button");
              button.type = "button"; button.className = "choice-answer-option";
              button.textContent = choice;
              button.dataset.answerType = type; button.dataset.question = String(number); button.dataset.option = choice;
              button.setAttribute("aria-label", (type === "mc" ? "選擇題" : "是非題") + "第 " + number + " 題答案 " + choice);
              button.setAttribute("aria-pressed", key[number - 1] === choice ? "true" : "false");
              button.classList.toggle("selected", key[number - 1] === choice);
              button.addEventListener("click", function () {
                input.value = toggleAnswerPreservingTail(input.value, settings, number, choice);
                input.dispatchEvent(new Event("input", { bubbles: true }));
              });
              optionsRow.append(button);
            });
            row.append(label, optionsRow); questions.append(row);
          }
          group.append(heading, questions); holder.append(group);
        }
      });
    }
    function toggleAnswerPreservingTail(value, settings, number, choice) {
      var raw = String(value || "");
      var boundary = 0;
      var seen = 0;
      for (var index = 0; index < raw.length;) {
        var character = String.fromCodePoint(raw.codePointAt(index));
        index += character.length;
        if (!/\s/.test(character)) seen += 1;
        boundary = index;
        if (seen >= settings.count) break;
      }
      if (settings.count === 0) boundary = 0;
      return api.toggleAnswer(raw, settings.count, settings.choices, number, choice) + raw.slice(boundary);
    }
    function updateAnswerButtons(type, settings, input) {
      var answers = api.keyArray(input.value, settings.count, settings.choices);
      document.querySelectorAll(".choice-answer-option[data-answer-type='" + type + "'], .choice-wizard-answer-bubble[data-answer-type='" + type + "']").forEach(function (button) {
        var selected = answers[Number(button.dataset.question) - 1] === button.dataset.option;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }
    function syncAnswerInput(type) {
      var settings = selectedOptions(type);
      var input = get(type === "mc" ? "mc-key" : "tf-key");
      updateAnswerButtons(type, settings, input);
      updateAnswerStatus();
    }
    function updateAnswerCounts() {
      var definition = selectedDefinition();
      ["mc", "tf"].forEach(function (type) {
        var input = get(type === "mc" ? "mc-count" : "tf-count");
        var block = definition && definition.blocks.find(function (entry) { return entry.type === type; });
        if (!block) {
          input.value = "0";
          return;
        }
        var maxCount = Math.max(0, Number(block.maxCount) || 0);
        input.min = "0";
        input.max = String(maxCount);
        var parsed = Number.parseInt(input.value, 10);
        var count = Number.isInteger(parsed) ? clamp(parsed, 0, maxCount) : 0;
        input.value = String(count);
      });
      updateAnswerInputVisibility();
      renderSimpleAnswerGrid();
      renderAnswerPage();
      updateAnswerStatus();
    }
    function updateAnswerStatus() {
      var missing = [];
      var total = 0;
      ["mc", "tf"].forEach(function (type) {
        var settings = selectedOptions(type); var answers = api.keyArray(get(type === "mc" ? "mc-key" : "tf-key").value, settings.count, settings.choices);
        total += settings.count;
        var expanded = templates.expandChoiceTemplate(selectedDefinition(), type === "mc"
          ? { mcCount: settings.count, tfCount: Number(get("tf-count").value) || 0 }
          : { mcCount: Number(get("mc-count").value) || 0, tfCount: settings.count });
        var questions = expanded.items.filter(function (item) { return item.type === type; });
        answers.forEach(function (answer, index) {
          var title = (type === "mc" ? "選擇題" : "是非題") + "第 " + (index + 1) + " 題";
          if (!answer) missing.push(title);
          else if (!questions[index] || !questions[index].choices.some(function (choice) { return choice.option === answer; })) missing.push(title + "（選項不適用）");
        });
      });
      var count = Math.max(0, total - missing.length);
      var countChip = get("choice-wizard-answer-count");
      countChip.textContent = count + " / " + total + " 已設定";
      countChip.classList.toggle("warn", Boolean(missing.length));
      countChip.classList.toggle("ok", !missing.length);
      setStatus("choice-wizard-answer-status", missing.length ? "尚未設定：" + missing.slice(0, 12).join("、") + (missing.length > 12 ? "等 " + missing.length + " 題" : "") : "所有題目已設定答案。", Boolean(missing.length));
      get("choice-wizard-next-to-grade").disabled = Boolean(missing.length);
    }
    function pageDocument(file) {
      if (!root.pdfjsLib || !root.LT_PDF_WORKER_SRC) throw new Error("PDF 程式庫未載入；請檢查完整解壓的工具套件。");
      return file.arrayBuffer().then(function (buffer) {
        return root.pdfjsLib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
      });
    }
    function destroyDocument(documentValue) {
      if (documentValue && typeof documentValue.destroy === "function") documentValue.destroy();
    }
    function gradingPdfInfo() {
      return typeof options.getCurrentPdf === "function" ? options.getCurrentPdf() : null;
    }
    function updateAnswerSourceAvailability() {
      var source = get("choice-answer-source");
      var grading = source.querySelector('option[value="grading"]');
      var info = gradingPdfInfo();
      var excludedPage = typeof options.getExcludedAnswerPage === "function" ? options.getExcludedAnswerPage() : 0;
      grading.disabled = !info || !info.document || !info.pageCount;
      if (excludedPage && !grading.disabled) source.value = "grading";
      get("choice-answer-file-wrap").hidden = source.value !== "local";
      get("choice-answer-exclude-wrap").hidden = source.value !== "grading";
      if (source.value === "grading" && !grading.disabled) {
        answerSourceDocument = info.document; answerSourceFile = null;
        get("choice-answer-page").max = String(info.pageCount);
        if (excludedPage) get("choice-answer-page").value = String(excludedPage);
        get("choice-answer-exclude-page").checked = Boolean(excludedPage && Number(get("choice-answer-page").value) === excludedPage);
      } else if (source.value === "grading" && grading.disabled) {
        source.value = "local"; get("choice-answer-file-wrap").hidden = false;
        get("choice-answer-exclude-wrap").hidden = true;
        answerSourceDocument = null; answerSourceFile = null;
      } else answerSourceDocument = localAnswerDocument;
      get("choice-answer-read-omr").disabled = !answerSourceDocument || !selectedDefinition();
      get("choice-answer-page").disabled = !answerSourceDocument;
    }
    async function renderImportPage(documentValue, pageNumber, maxSide) {
      var total = Number(documentValue && documentValue.numPages) || 0;
      var pageNo = Math.floor(Number(pageNumber));
      if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > total) throw new Error("頁碼超出 PDF 範圍。");
      var page = await documentValue.getPage(pageNo);
      var base = page.getViewport({ scale: 1 });
      var viewport = page.getViewport({ scale: Math.min(2.2, maxSide / Math.max(base.width, base.height)) });
      var canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
      return { page: page, canvas: canvas, viewport: viewport };
    }
    function currentAnswerBlocks() {
      var definition = selectedDefinition();
      var counts = { mcCount: Number(get("mc-count").value) || 0, tfCount: Number(get("tf-count").value) || 0 };
      if (!definition) return { definition: null, expanded: { items: [] }, counts: counts };
      return { definition: definition, expanded: templates.expandChoiceTemplate(definition, counts), counts: counts };
    }
    function answerTypeFor(questionNumber, answer, expanded) {
      var matches = (expanded.items || []).filter(function (item) { return item.number === questionNumber &&
        item.choices.some(function (choice) { return choice.option === answer; }); });
      return matches.length === 1 ? matches[0].type : "";
    }
    function viewportTextItems(items, viewport) {
      return (items || []).map(function (item) {
        var transform = item && item.transform;
        var text = String(item && item.str || "");
        if (!text.trim() || !transform || !Number.isFinite(Number(transform[4])) || !Number.isFinite(Number(transform[5]))) return null;
        var x = Number(transform[4]); var y = Number(transform[5]);
        var width = Math.max(0, Number(item.width) || 0); var height = Math.max(1, Number(item.height) || 1);
        var corners = [
          viewport.convertToViewportPoint(x, y),
          viewport.convertToViewportPoint(x + width, y),
          viewport.convertToViewportPoint(x, y + height),
          viewport.convertToViewportPoint(x + width, y + height)
        ];
        var xs = corners.map(function (point) { return point[0]; });
        var ys = corners.map(function (point) { return point[1]; });
        return { text: text, x: Math.min.apply(Math, xs), y: Math.min.apply(Math, ys),
          width: Math.max(1, Math.max.apply(Math, xs) - Math.min.apply(Math, xs)),
          height: Math.max(1, Math.max.apply(Math, ys) - Math.min.apply(Math, ys)) };
      }).filter(Boolean);
    }
    function showReferenceAiOption(show) {
      get("choice-reference-ai-controls").hidden = !show;
      get("choice-reference-ai-preview").disabled = !referenceDocument || !show;
    }
    function renderImportedAnswers(records, message) {
      var context = currentAnswerBlocks();
      importedAnswers = records || [];
      var byKey = Object.create(null);
      importedAnswers.forEach(function (entry) { byKey[entry.type + ":" + entry.number] = entry; });
      var body = get("choice-answer-import-rows");
      body.replaceChildren();
      context.expanded.items.forEach(function (item) {
        var source = byKey[item.type + ":" + item.number] || { type: item.type, number: item.number, answer: "", status: "待老師設定" };
        var row = document.createElement("tr");
        var questionCell = document.createElement("td"); questionCell.textContent = (item.type === "mc" ? "選擇題 " : "是非題 ") + item.number;
        var answerCell = document.createElement("td");
        var select = document.createElement("select"); select.setAttribute("aria-label", questionCell.textContent + "答案");
        var blank = document.createElement("option"); blank.value = ""; blank.textContent = "待老師設定"; select.append(blank);
        Array.from(new Set(item.choices.map(function (choice) { return choice.option; }))).forEach(function (optionValue) {
          var option = document.createElement("option"); option.value = optionValue; option.textContent = optionValue; select.append(option);
        });
        select.value = item.choices.some(function (choice) { return choice.option === source.answer; }) ? source.answer : "";
        select.addEventListener("change", function () {
          var current = byKey[item.type + ":" + item.number] || { type: item.type, number: item.number };
          current.answer = select.value; current.status = select.value ? "老師確認" : "待老師設定";
          byKey[item.type + ":" + item.number] = current;
          importedAnswers = Object.keys(byKey).map(function (key) { return byKey[key]; });
          statusCell.textContent = current.status;
        });
        answerCell.append(select);
        var statusCell = document.createElement("td"); statusCell.textContent = source.status || (source.answer ? "已讀取" : "待老師設定");
        row.append(questionCell, answerCell, statusCell); body.append(row);
      });
      get("choice-answer-import-results").hidden = false;
      get("choice-answer-import-apply").disabled = !context.expanded.items.length;
      setStatus("choice-answer-import-status", message || "請逐題核對；未讀取的題目可在表格選擇答案。", false);
    }
    async function readAnswerSheet() {
      var info = gradingPdfInfo();
      if (get("choice-answer-source").value === "grading") {
        if (!info || !info.document) { setStatus("choice-answer-import-status", "目前沒有已載入的批改 PDF。", true); return; }
        answerSourceDocument = info.document;
      }
      if (!answerSourceDocument || !selectedDefinition()) return;
      var pageNumber = Number(get("choice-answer-page").value) || 1;
      var context = currentAnswerBlocks();
      var canvas = null;
      try {
        setStatus("choice-answer-import-status", "正在本機讀取答案卷…", false);
        var rendered = await renderImportPage(answerSourceDocument, pageNumber, 1800);
        canvas = rendered.canvas;
        var image = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        var template = geometry.expandChoiceTemplate(context.definition, context.counts);
        var fit = omr.gridFit(image, canvas.width, canvas.height, template);
        var detected = omr.detectPage(image, canvas.width, canvas.height, context.counts.mcCount,
          context.counts.tfCount, fit.calibration, fit.metadataCalibration, template);
        var records = context.expanded.items.map(function (item) {
          var found = detected.questions.find(function (question) { return question.type === item.type && question.number === item.number; });
          var valid = found && found.status === "read" && item.choices.some(function (choice) { return choice.option === found.answer; });
          return { type: item.type, number: item.number, answer: valid ? found.answer : "",
            status: valid ? "清晰讀取" : "待老師設定" };
        });
        var ready = records.filter(function (record) { return Boolean(record.answer); }).length;
        var pending = records.length - ready;
        renderImportedAnswers(records, "本機讀圈完成：清晰讀取 " + ready + " 題；空白、淺圈或多選共 " + pending + " 題待老師設定。");
      } catch (error) {
        setStatus("choice-answer-import-status", error && error.message || "答案卷未能讀取；請檢查檔案及頁碼。", true);
      } finally {
        if (canvas) { canvas.width = 1; canvas.height = 1; }
      }
    }
    async function loadReferencePdf(file) {
      destroyDocument(referenceDocument); referenceDocument = null; referenceFile = null;
      referenceMaskRects = []; referenceImage = null;
      get("choice-reference-ai-confirmation").hidden = true;
      get("choice-reference-extract").disabled = true; showReferenceAiOption(false);
      get("choice-answer-import-results").hidden = true;
      importedAnswers = [];
      if (!file) return;
      try {
        referenceFile = file; referenceDocument = await pageDocument(file);
        get("choice-reference-page").max = String(referenceDocument.numPages);
        get("choice-reference-page").value = "1";
        get("choice-reference-extract").disabled = false;
        setStatus("choice-answer-import-status", "PDF 已在本機開啟，共 " + referenceDocument.numPages + " 頁；正在讀取全文。", false);
        await extractReferenceAnswers();
      } catch (error) {
        referenceFile = null; referenceDocument = null;
        setStatus("choice-answer-import-status", "參考 PDF 無法開啟；請確認檔案完整且未加密。", true);
      }
    }
    async function readReferenceText() {
      var pages = [];
      var unreadablePages = [];
      for (var pageNumber = 1; pageNumber <= referenceDocument.numPages; pageNumber += 1) {
        try {
          var page = await referenceDocument.getPage(pageNumber);
          var content = await page.getTextContent();
          pages.push(api.pdfTextLines(content.items).join("\n"));
        } catch (error) {
          pages.push("");
          unreadablePages.push(pageNumber);
        }
      }
      return Object.assign(api.parseAnswerKeyText(pages.join("\n"), 250, ["A", "B", "C", "D", "E", "F", "T"]),
        { unreadablePages: unreadablePages });
    }
    async function readReferenceHighlights() {
      if (!answerHighlight || !referenceDocument) throw new Error("本機螢光標示讀取程式未載入。");
      var combined = { answers: Object.create(null), questionNumbers: [], duplicateNumbers: [] };
      var previousQuestionNumber = null;
      var sequenceQuestionNumbers = [];
      for (var pageNumber = 1; pageNumber <= referenceDocument.numPages; pageNumber += 1) {
        var page = await referenceDocument.getPage(pageNumber);
        var base = page.getViewport({ scale: 1 });
        var viewport = page.getViewport({ scale: Math.min(2.2, 1800 / Math.max(base.width, base.height)) });
        var canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        try {
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
          var imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
          var content = await page.getTextContent();
          var items = viewportTextItems(content.items, viewport);
          var detected = answerHighlight.analyzePage(items, canvas.width, canvas.height, imageData,
            canvas.width, canvas.height, previousQuestionNumber, sequenceQuestionNumbers);
          previousQuestionNumber = detected.lastQuestionNumber;
          sequenceQuestionNumbers = detected.seenQuestionNumbers || [];
          if (detected.sequenceReset) {
            combined.answers = Object.create(null);
            combined.questionNumbers = [];
            combined.duplicateNumbers = [];
          }
          combined.questionNumbers = combined.questionNumbers.concat(detected.questionNumbers);
          combined.duplicateNumbers = combined.duplicateNumbers.concat(detected.duplicateNumbers || []);
          Object.keys(detected.answers).forEach(function (key) {
            combined.answers[key] = detected.answers[key] || "";
          });
        } finally {
          canvas.width = 1; canvas.height = 1;
        }
      }
      return combined;
    }
    async function extractReferenceAnswers() {
      if (!referenceDocument || !selectedDefinition()) return;
      try {
        showReferenceAiOption(false);
        setStatus("choice-answer-import-status", "正在本機讀取 PDF 文字層…", false);
        var context = currentAnswerBlocks();
        var parsed = await readReferenceText();
        var records = parsed.matchedCount ? Object.keys(parsed.answers).map(function (key) {
          var number = Number(key); var answer = parsed.answers[key];
          var type = answerTypeFor(number, answer, context.expanded);
          return type ? { type: type, number: number, answer: answer, status: "文字讀取" } : null;
        }).filter(Boolean) : [];
        parsed.conflictingQuestions.forEach(function (number) {
          context.expanded.items.filter(function (item) { return item.number === number; }).forEach(function (item) {
            records.push({ type: item.type, number: number, answer: "", status: "答案衝突，待老師設定" });
          });
        });
        var textAnswers = Object.create(null);
        records.forEach(function (record) {
          if (record && record.answer) textAnswers[String(record.number)] = record.answer;
        });
        var textSource = { matchedCount: parsed.matchedCount, answers: textAnswers };
        var textAnswerCount = answerHighlight.countAnswers(textSource);
        var expectedCount = context.expanded.items.length;
        var warnings = [];
        if (parsed.unmatchedCount) warnings.push(parsed.unmatchedCount + " 項題號／答案數量不符或未能配對，請核對。");
        if (parsed.conflictingQuestions.length) warnings.push("第 " + parsed.conflictingQuestions.join("、") + " 題有不同答案，已留空待老師設定。");
        if (parsed.rejectedCount > parsed.unmatchedCount + parsed.conflictingQuestions.length) {
          warnings.push("另有 " + (parsed.rejectedCount - parsed.unmatchedCount - parsed.conflictingQuestions.length) + " 項無效或重複內容已忽略。");
        }
        if (parsed.unreadablePages.length) warnings.push("第 " + parsed.unreadablePages.join("、") + " 頁文字層無法讀取。");
        if (expectedCount > 0 && parsed.matchedCount >= expectedCount) {
          renderImportedAnswers(records, "採用文字答案表：讀取 " + parsed.matchedCount + " 題。" +
            (warnings.length ? " " + warnings.join(" ") : "") + " 請核對及補齊表格。");
          return;
        }

        setStatus("choice-answer-import-status", "沒有找到文字答案表；正在本機檢查螢光標示…", false);
        var detected = await readReferenceHighlights();
        var highlightedRecords = context.expanded.items.map(function (item) {
            var answer = detected.answers[String(item.number)] || "";
            var valid = item.choices.some(function (choice) { return choice.option === answer; });
            return { type: item.type, number: item.number, answer: valid ? answer : "",
              status: valid ? "螢光標示" : "待老師設定" };
        });
        var highlightedAnswers = Object.create(null);
        highlightedRecords.forEach(function (record) {
          if (record.answer) highlightedAnswers[String(record.number)] = record.answer;
        });
        var highlightSource = { answers: highlightedAnswers };
        var highlightAnswerCount = answerHighlight.countAnswers(highlightSource);
        var source = answerHighlight.chooseAnswerSource(textSource, highlightSource, expectedCount);
        if (source === "text") {
          var textMismatch = parsed.matchedCount !== expectedCount;
          renderImportedAnswers(records, "文字答案表配對 " + parsed.matchedCount + " 題；螢光標示讀取 " +
            highlightAnswerCount + " 題；採用文字答案表（有效 " + textAnswerCount + " 題）。" +
            (textMismatch ? "與第 2 步設定的 " + expectedCount + " 題數量不符；請核對，答案不會自動套用。" : "") +
            (warnings.length ? " " + warnings.join(" ") : "") + " 請核對及補齊表格。");
          return;
        }
        if (source === "highlight") {
          var pending = highlightedRecords.filter(function (record) { return !record.answer; }).length;
          var countMismatch = detected.questionNumbers.length !== context.expanded.items.length;
          var duplicateNotice = detected.duplicateNumbers.length
            ? "題號重複（" + Array.from(new Set(detected.duplicateNumbers)).join("、") + "）已留空。" : "";
          renderImportedAnswers(highlightedRecords, "文字答案表配對 " + parsed.matchedCount + " 題；採用螢光標示，讀取 " +
            (highlightedRecords.length - pending) + " 題；" + pending + " 題待老師設定。" +
            (countMismatch ? "偵測到 " + detected.questionNumbers.length +
              " 個題號，與第 2 步設定的 " + expectedCount + " 題數量不符；請核對，答案不會自動套用。" : "") +
            duplicateNotice + " 請核對及按「套用答案」。");
          return;
        }
        showReferenceAiOption(true);
        renderImportedAnswers([], "文字答案表配對 " + parsed.matchedCount + " 題；螢光標示沒有有效答案。可檢視後選用 AI 讀取；答案不會自動套用。");
      } catch (error) {
        showReferenceAiOption(true);
        setStatus("choice-answer-import-status", error && error.message || "參考答案文字未能讀取。", true);
      }
    }
    async function prepareReferenceAiPreview() {
      if (!referenceDocument || !selectedDefinition()) return;
      try {
        var pageNumber = Math.floor(Number(get("choice-reference-page").value) || 1);
        var rendered = await renderImportPage(referenceDocument, pageNumber, 1024);
        referenceBaseCanvas = rendered.canvas;
        var preview = get("choice-reference-preview");
        preview.width = rendered.canvas.width; preview.height = rendered.canvas.height;
        preview.getContext("2d").drawImage(rendered.canvas, 0, 0);
        var overlay = get("choice-reference-mask-overlay");
        overlay.width = rendered.canvas.width; overlay.height = rendered.canvas.height;
        referenceMaskRects = []; maskDrawing = null; drawReferenceMasks();
        get("choice-reference-ai-reviewed").checked = false;
        get("choice-reference-ai-confirm").disabled = true;
        get("choice-reference-ai-confirmation").hidden = false;
        setStatus("choice-answer-import-status", "已在本機顯示第 " + pageNumber + " 頁；按住並拖曳可遮蓋不需送出的區域。", false);
      } catch (error) {
        setStatus("choice-answer-import-status", error && error.message || "參考答案頁無法預覽。", true);
      }
    }
    function drawReferenceMasks() {
      var canvas = get("choice-reference-mask-overlay");
      if (!canvas.width || !canvas.height) return;
      var context = canvas.getContext("2d"); context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#000";
      referenceMaskRects.forEach(function (rect) {
        context.fillRect(rect.x * canvas.width, rect.y * canvas.height, rect.w * canvas.width, rect.h * canvas.height);
      });
      if (maskDrawing) {
        var left = Math.min(maskDrawing.x, maskDrawing.endX); var top = Math.min(maskDrawing.y, maskDrawing.endY);
        context.fillRect(left, top, Math.abs(maskDrawing.endX - maskDrawing.x), Math.abs(maskDrawing.endY - maskDrawing.y));
      }
    }
    function previewPoint(event) {
      var canvas = get("choice-reference-mask-overlay"); var rect = canvas.getBoundingClientRect();
      return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1) * canvas.width,
        y: clamp((event.clientY - rect.top) / rect.height, 0, 1) * canvas.height };
    }
    async function sendReferenceAiRequest() {
      if (!referenceBaseCanvas || !get("choice-reference-ai-reviewed").checked || typeof options.requestAiAnswerKey !== "function") return;
      var context = currentAnswerBlocks();
      var aiSettings = options.getAiSettings();
      if (!aiSettings.ready) {
        setStatus("choice-answer-import-status", "請先在第七步啟用 AI 並設定供應者、模型及本頁記憶體中的 key。沒有送出圖片。", true); return;
      }
      var output = document.createElement("canvas"); output.width = referenceBaseCanvas.width; output.height = referenceBaseCanvas.height;
      var outputContext = output.getContext("2d"); outputContext.drawImage(referenceBaseCanvas, 0, 0);
      outputContext.fillStyle = "#000";
      referenceMaskRects.forEach(function (rect) {
        outputContext.fillRect(rect.x * output.width, rect.y * output.height, rect.w * output.width, rect.h * output.height);
      });
      var image = { mimeType: "image/png", dataUrl: output.toDataURL("image/png"), width: output.width, height: output.height };
      var allowed = Array.from(new Set(context.expanded.items.flatMap(function (item) {
        return item.choices.map(function (choice) { return choice.option; });
      })));
      var questionCount = context.expanded.items.reduce(function (maximum, item) { return Math.max(maximum, item.number); }, 0);
      get("choice-reference-ai-confirm").disabled = true;
      setStatus("choice-answer-import-status", "已按預覽遮蓋內容；正在送出單頁圖片，沒有套用答案。", false);
      try {
        var result = await options.requestAiAnswerKey(image, questionCount, allowed);
        if (!result || !result.ok) {
          setStatus("choice-answer-import-status", result && result.message || "AI 讀取失敗，沒有套用答案。", true); return;
        }
        var records = result.answers.map(function (entry) {
          var type = answerTypeFor(entry.q, entry.a, context.expanded);
          return type ? { type: type, number: entry.q, answer: entry.a, status: "AI 待核對" } : null;
        }).filter(Boolean);
        renderImportedAnswers(records, "AI 提供 " + records.length + " 項答案供核對；" + result.rejectedCount + " 項無效或不適用內容已忽略。只按「套用答案」才會寫入答案欄。");
      } catch (error) {
        setStatus("choice-answer-import-status", error && error.message || "AI 讀取失敗，沒有套用答案。", true);
      } finally {
        image.dataUrl = ""; output.width = 1; output.height = 1;
        get("choice-reference-ai-confirm").disabled = false;
      }
    }
    function applyImportedAnswers() {
      var context = currentAnswerBlocks();
      ["mc", "tf"].forEach(function (type) {
        var count = context.counts[type === "mc" ? "mcCount" : "tfCount"];
        var answers = Array(count).fill("?");
        importedAnswers.forEach(function (entry) {
          var index = Number(entry.number) - 1;
          if (entry.type === type && Number.isInteger(index) && index >= 0 && index < count) {
            var choices = selectedOptions(type).choices;
            answers[index] = choices.indexOf(entry.answer) >= 0 ? entry.answer : "?";
          }
        });
        var input = get(type === "mc" ? "mc-key" : "tf-key");
        input.value = answers.join("");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        syncAnswerInput(type);
      });
      setStatus("choice-answer-import-status", "答案已套用；待老師設定的題目仍保留空位，請在答案表或下方答案欄補齊。", false);
      get("choice-reference-ai-confirmation").hidden = true;
    }
    function renderAnswerPage() {
      var definition = selectedDefinition();
      if (!definition) return;
      var canvas = get("choice-wizard-answer-canvas");
      var overlay = get("choice-wizard-answer-overlay");
      var empty = get("choice-wizard-answer-empty");
      var pageLabel = get("choice-wizard-answer-page").closest("label");
      if (!sampleDocument || !sampleDocument.numPages) {
        answerToken += 1;
        if (answerRenderTask && typeof answerRenderTask.cancel === "function") { try { answerRenderTask.cancel(); } catch (error) { /* cancelled render */ } }
        answerRenderTask = null; canvas.hidden = true; overlay.replaceChildren(); pageLabel.hidden = true;
        empty.hidden = false;
        empty.textContent = "範本已匯入；可先在下方整批輸入答案。如需點選圈格，請返回第二步載入樣本 PDF。";
        updateAnswerStatus();
        return;
      }
      pageLabel.hidden = false;
      empty.textContent = "請先完成第三步並載入樣本。";
      var token = ++answerToken;
      var pageNo = clamp(Math.floor(Number(get("choice-wizard-answer-page").value) || 1), 1, sampleDocument.numPages);
      get("choice-wizard-answer-page").value = String(pageNo);
      sampleDocument.getPage(pageNo).then(function (page) {
        if (token !== answerToken) return;
        var base = page.getViewport({ scale: 1 });
        var viewport = page.getViewport({ scale: Math.min(1.5, 1000 / Math.max(base.width, base.height)) });
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); canvas.hidden = false;
        empty.hidden = true;
        if (answerRenderTask && typeof answerRenderTask.cancel === "function") { try { answerRenderTask.cancel(); } catch (error) { /* cancelled render */ } }
        answerRenderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport });
        return answerRenderTask.promise.then(function () {
          if (token !== answerToken) return;
          answerRenderTask = null;
          overlay.replaceChildren();
          var counts = { mcCount: Number(get("mc-count").value) || 0, tfCount: Number(get("tf-count").value) || 0 };
          var expanded = templates.expandChoiceTemplate(definition, counts);
          expanded.items.forEach(function (item) {
            item.choices.forEach(function (choice) {
              var button = document.createElement("button");
              button.type = "button"; button.className = "choice-wizard-answer-bubble";
              button.style.left = (choice.x * 100) + "%"; button.style.top = (choice.y * 100) + "%";
              button.dataset.answerType = item.type; button.dataset.question = String(item.number); button.dataset.option = choice.option;
              button.textContent = choice.option;
              button.setAttribute("aria-label", (item.type === "mc" ? "選擇題" : "是非題") + "第 " + item.number + " 題 " + choice.option);
              button.addEventListener("click", function () {
                var input = get(item.type === "mc" ? "mc-key" : "tf-key");
                var settings = selectedOptions(item.type);
                input.value = toggleAnswerPreservingTail(input.value, settings, item.number, choice.option);
                input.dispatchEvent(new Event("input", { bubbles: true }));
                syncAnswerInput(item.type);
              });
              overlay.append(button);
            });
          });
          syncAnswerInput("mc"); syncAnswerInput("tf");
        });
      }).catch(function () {
        if (token === answerToken) setStatus("choice-wizard-answer-status", "樣本頁無法顯示。", true);
      });
    }
    function enterStage3FromExisting() {
      var definition = templateFromSelect();
      if (!definition) { setStatus("choice-wizard-source-status", "請選擇一個選擇題範本。", true); return; }
      if (!sampleFile) { setStatus("choice-wizard-source-status", "請載入樣本 PDF，供第三步調整位置及第四步點選答案。", true); return; }
      if (!selectTemplate(definition)) return;
      renderStage(3);
    }

    function returnToSampleBuilder() {
      if (createMode && zones.length) {
        get("choice-wizard-builder").hidden = false;
        updateSourceButtons(); renderOverlay(); renderZoneList();
        setStatus("choice-wizard-source-status", "已保留原有範圍；可繼續調整後重新建立範本。", false);
      }
      renderStage(2);
    }

    get("choice-wizard-select-choice").addEventListener("click", function (event) {
      event.preventDefault();
      var preferred = allChoiceTemplates().find(function (definition) { return definition.id === options.getPreferredTemplateId(); });
      if (preferred) {
        get("choice-wizard-template").value = preferred.id;
        if (!selectTemplate(preferred, null, false)) return;
        renderStage(4);
      } else {
        renderStage(1); populateTemplates();
      }
    });
    get("choice-home-change-template").addEventListener("click", function () { renderStage(1); populateTemplates(); });
    function openTemplateBuilder() {
      selectedTemplate = templateFromSelect();
      createMode = false;
      renderStage(2);
      setStatus("choice-wizard-source-status", "載入樣本 PDF 後，可建立新範本或編輯已選範本。", false);
    }
    get("choice-home-create-template").addEventListener("click", openTemplateBuilder);
    get("choice-home-create-template-step").addEventListener("click", openTemplateBuilder);
    get("choice-home-lookup").addEventListener("click", function () {
      renderStage(6);
      var details = get("export-preview-details");
      details.open = true;
      window.requestAnimationFrame(function () { details.scrollIntoView({ behavior: "smooth", block: "start" }); });
    });
    get("template-editor-name").addEventListener("input", function () {
      if (currentStage === 3) get("choice-wizard-stage3-template-name").textContent = "｜" + this.value;
    });
    get("choice-wizard-select-dictation").addEventListener("click", function () { showLegacy("dictation"); });
    get("choice-wizard-use-existing").addEventListener("click", function () {
      var definition = templateFromSelect();
      if (!definition) { setStatus("choice-wizard-source-status", "請選擇一個範本。", true); return; }
      if (!selectTemplate(definition, null, false)) return;
      createMode = false; get("choice-wizard-builder").hidden = true;
      updateSourceButtons();
      renderStage(4);
    });
    get("choice-wizard-start-create").addEventListener("click", beginCreate);
    get("choice-wizard-template").addEventListener("change", function () {
      selectedTemplate = templateFromSelect();
      renderTemplateCards();
      updateTemplateOrderWarning(selectedTemplate);
      updateSourceButtons();
    });
    get("choice-wizard-order-repair").addEventListener("click", function () {
      var result = options.createReorderedTemplateCopy(pendingOrderTemplate);
      if (!result.ok) { setStatus("choice-wizard-template-status", result.message, true); return; }
      var hadReadResults = typeof options.hasChoiceReadings === "function" && options.hasChoiceReadings();
      if (!selectTemplate(result.template, { preserveAnswers: true }, false)) {
        setStatus("choice-wizard-template-status", "已建立修正版副本，但本次沒有更換目前範本；仍使用原範本。", false);
        return;
      }
      get("choice-wizard-template").value = result.template.id;
      updateTemplateOrderWarning(result.template);
      updateSourceButtons();
      if (currentStage === 4) { renderAnswerPage(); renderSimpleAnswerGrid(); updateAnswerStatus(); }
      var message = "已改用『" + result.template.name + "』；原範本保留在範本清單。";
      if (hadReadResults) message += " 範本已更換，請重新讀圈。";
      setStatus("choice-wizard-template-status", message, false);
    });
    get("choice-wizard-pdf-file").addEventListener("change", function () { loadSample(this.files[0]); });
    get("choice-wizard-answer-sample-file").addEventListener("change", function () { loadSample(this.files[0]); });
    get("choice-wizard-template-file").addEventListener("change", function () {
      if (this.files[0]) options.importTemplate(this.files[0], this);
    });
    get("choice-wizard-save-template").addEventListener("click", function () { options.saveTemplate(); });
    get("choice-wizard-export-template").addEventListener("click", function () { options.exportTemplate(); });
    get("choice-wizard-ai-prepare").addEventListener("click", prepareAiLayout);
    get("choice-wizard-ai-confirm").addEventListener("click", confirmAiLayout);
    get("choice-wizard-ai-cancel").addEventListener("click", function () {
      if (preparedAiImage) preparedAiImage.dataUrl = "";
      clearPreparedAiImage();
      setStatus("choice-wizard-ai-status", "已取消；沒有送出圖片。", false);
      updateAiButton();
    });
    get("choice-wizard-no-identity").addEventListener("change", function () {
      clearPreparedAiImage(); clearAiSuggestions(); updateAiButton();
    });
    get("choice-wizard-identities-complete").addEventListener("change", function () {
      clearPreparedAiImage(); clearAiSuggestions(); updateAiButton();
    });
    get("choice-wizard-page").addEventListener("change", function () {
      clearPreparedAiImage(); clearAiSuggestions(); renderSamplePage();
    });
    get("choice-wizard-answer-page").addEventListener("change", renderAnswerPage);
    get("choice-answer-source").addEventListener("change", function () {
      updateAnswerSourceAvailability();
      if (this.value === "grading") get("choice-answer-page").value = "1";
    });
    get("choice-answer-file").addEventListener("change", async function () {
      var file = this.files && this.files[0];
      destroyDocument(localAnswerDocument); localAnswerDocument = null; answerSourceDocument = null; answerSourceFile = file || null;
      if (!file) { updateAnswerSourceAvailability(); return; }
      try {
        localAnswerDocument = await pageDocument(file);
        if (get("choice-answer-source").value === "local") answerSourceDocument = localAnswerDocument;
        get("choice-answer-page").max = String(localAnswerDocument.numPages);
        get("choice-answer-page").value = "1";
        updateAnswerSourceAvailability();
        setStatus("choice-answer-import-status", "答案卷已在本機開啟，共 " + localAnswerDocument.numPages + " 頁。", false);
      } catch (error) {
        answerSourceFile = null; localAnswerDocument = null;
        updateAnswerSourceAvailability();
        setStatus("choice-answer-import-status", error && error.message || "答案卷無法開啟。", true);
      }
    });
    get("choice-answer-read-omr").addEventListener("click", readAnswerSheet);
    get("choice-answer-page").addEventListener("change", function () {
      var excludedPage = typeof options.getExcludedAnswerPage === "function" ? options.getExcludedAnswerPage() : 0;
      get("choice-answer-exclude-page").checked = Boolean(excludedPage && excludedPage === Number(this.value));
    });
    get("choice-answer-import-apply").addEventListener("click", applyImportedAnswers);
    get("choice-answer-exclude-page").addEventListener("change", function () {
      var pageNumber = Number(get("choice-answer-page").value) || 1;
      if (typeof options.setAnswerPageExcluded === "function") options.setAnswerPageExcluded(pageNumber, this.checked);
    });
    get("choice-reference-file").addEventListener("change", function () { loadReferencePdf(this.files && this.files[0]); });
    get("choice-reference-extract").addEventListener("click", extractReferenceAnswers);
    get("choice-reference-ai-preview").addEventListener("click", prepareReferenceAiPreview);
    get("choice-reference-ai-reviewed").addEventListener("change", function () {
      get("choice-reference-ai-confirm").disabled = !this.checked || !referenceBaseCanvas;
    });
    get("choice-reference-ai-confirm").addEventListener("click", sendReferenceAiRequest);
    get("choice-reference-ai-cancel").addEventListener("click", function () {
      get("choice-reference-ai-confirmation").hidden = true;
      get("choice-reference-ai-reviewed").checked = false;
      referenceBaseCanvas = null; referenceMaskRects = [];
      get("choice-reference-preview").width = 1; get("choice-reference-preview").height = 1;
      get("choice-reference-mask-overlay").width = 1; get("choice-reference-mask-overlay").height = 1;
      setStatus("choice-answer-import-status", "已取消 AI 讀取；沒有送出圖片或套用答案。", false);
    });
    var referenceMaskOverlay = get("choice-reference-mask-overlay");
    referenceMaskOverlay.addEventListener("pointerdown", function (event) {
      if (!referenceBaseCanvas || event.button !== 0) return;
      var point = previewPoint(event); maskDrawing = { x: point.x, y: point.y, endX: point.x, endY: point.y };
      referenceMaskOverlay.setPointerCapture(event.pointerId); drawReferenceMasks(); event.preventDefault();
    });
    referenceMaskOverlay.addEventListener("pointermove", function (event) {
      if (!maskDrawing) return;
      var point = previewPoint(event); maskDrawing.endX = point.x; maskDrawing.endY = point.y; drawReferenceMasks();
    });
    referenceMaskOverlay.addEventListener("pointerup", function (event) {
      if (!maskDrawing) return;
      var point = previewPoint(event); maskDrawing.endX = point.x; maskDrawing.endY = point.y;
      var left = Math.min(maskDrawing.x, maskDrawing.endX); var top = Math.min(maskDrawing.y, maskDrawing.endY);
      var width = Math.abs(maskDrawing.endX - maskDrawing.x); var height = Math.abs(maskDrawing.endY - maskDrawing.y);
      if (width >= 2 && height >= 2) referenceMaskRects.push({ x: left / referenceMaskOverlay.width, y: top / referenceMaskOverlay.height,
        w: width / referenceMaskOverlay.width, h: height / referenceMaskOverlay.height });
      maskDrawing = null; drawReferenceMasks();
    });
    referenceMaskOverlay.addEventListener("pointercancel", function () { maskDrawing = null; drawReferenceMasks(); });
    get("choice-wizard-next-from-source").addEventListener("click", enterStage3FromExisting);
    get("choice-wizard-build-template").addEventListener("click", handleBuildTemplate);
    get("choice-wizard-delete-zone").addEventListener("click", function () {
      var removedIdentity = zones.some(function (zone) { return zone.id === selectedZoneId && isPrivacyIdentityZone(zone); });
      zones = zones.filter(function (zone) { return zone.id !== selectedZoneId; }); selectedZoneId = ""; renderOverlay(); renderZoneList();
      if (removedIdentity) updateIdentityConfirmation(true);
    });
    get("choice-wizard-zone-type").addEventListener("change", function () { renderClickControls(); });
    get("choice-wizard-options").addEventListener("change", function () { renderClickControls(); });
    get("choice-wizard-click-start").addEventListener("click", function () { startClickCalibration(false); });
    get("choice-wizard-click-add-column").addEventListener("click", function () { startClickCalibration(true); });
    get("choice-wizard-click-complete").addEventListener("click", completeClickCalibration);
    get("choice-wizard-click-cancel").addEventListener("click", cancelClickCalibration);
    get("choice-wizard-click-measure-gap").addEventListener("click", function () {
      if (!clickMode || clickMode.kind !== "first" || clickMode.stage !== "settings") return;
      clickMode.stage = "gap";
      renderClickControls("請點下一組第一題的 A 圈，以量度組間空位。");
    });
    get("choice-wizard-click-skip-gap").addEventListener("click", function () {
      if (!clickMode || clickMode.kind !== "first" || clickMode.stage !== "settings") return;
      clickMode.gapChosen = true;
      renderClickControls("未量度組間空位；已按預設空一行計算。可檢視預覽後完成。");
      refreshClickPreview();
    });
    ["choice-wizard-click-anchor-number", "choice-wizard-click-start-number", "choice-wizard-click-count", "choice-wizard-click-group-size"]
      .forEach(function (id) { get(id).addEventListener("input", function () {
        if (id === "choice-wizard-click-anchor-number" && clickMode) clickMode.anchorQuestionNumber = Number(this.value);
        if (id === "choice-wizard-click-start-number" && clickMode) clickMode.startQuestionNumber = Number(this.value);
        renderClickControls();
        refreshClickPreview();
      }); });
    var zoneOverlay = get("choice-wizard-overlay");
    zoneOverlay.addEventListener("pointerdown", pointerDown);
    zoneOverlay.addEventListener("pointermove", pointerMove);
    zoneOverlay.addEventListener("pointerup", pointerUp);
    zoneOverlay.addEventListener("pointercancel", pointerUp);
    get("choice-wizard-next-to-answers").addEventListener("click", function () {
      var draft = options.getEditorDraft();
      if (!draft || !templates.validateTemplate(draft).ok) { setStatus("choice-wizard-position-status", "目前範本未通過驗證。", true); return; }
      if (!options.isTemplateSaved(draft.id)) { setStatus("choice-wizard-position-status", "請先按「儲存為自訂範本」；範本不會包含樣本或答案。", true); return; }
      selectedTemplate = options.getSelectedTemplate();
      renderStage(4);
    });
    get("choice-wizard-apply-numbering").addEventListener("click", function () {
      var mc = get("choice-wizard-mc-numbering").value;
      var tf = get("choice-wizard-tf-numbering").value;
      var mcApplied = options.setNumbering("mc", mc);
      var tfApplied = options.setNumbering("tf", tf);
      if (mcApplied || tfApplied) {
        setStatus("choice-wizard-position-status", "題號排列已套用；請重新測試讀圈並儲存範本。", false);
      } else setStatus("choice-wizard-position-status", "目前範本沒有可調整的選擇題區。", true);
    });
    ["mc-count", "tf-count"].forEach(function (id) {
      get(id).addEventListener("input", function () {
        if (currentStage === 4) updateAnswerCounts();
        else updateCountStatus();
      });
    });
    ["mc", "tf"].forEach(function (type) {
      get(type === "mc" ? "mc-key" : "tf-key").addEventListener("input", function () { syncAnswerInput(type); });
    });
    get("choice-wizard-next-to-grade").addEventListener("click", function () {
      updateAnswerStatus();
      if (get("choice-wizard-next-to-grade").disabled) return;
      selectedTemplate = options.getSelectedTemplate();
      renderStage(5);
    });
    get("choice-wizard-back-to-answers").addEventListener("click", function () { renderStage(4); });
    get("choice-wizard-back-to-category").addEventListener("click", function () {
      if (options.hasLoadedPdf() && !root.confirm("返回第一步會保留範本及答案，但離開目前批改畫面。要繼續嗎？")) return;
      renderStage(1);
    });
    get("choice-wizard-back-to-review").addEventListener("click", function () { renderStage(5); });
    get("choice-wizard-stepper").querySelectorAll("[data-wizard-step]").forEach(function (pill) {
      pill.addEventListener("click", function () {
        var target = Number(pill.dataset.wizardStep);
        if (target === 1) renderStage(1);
        else if (target === 2 && selectedTemplate && selectedTemplate.kind === "choice") {
          if (selectTemplate(selectedTemplate, null, false)) renderStage(4);
        }
        else if (target === 3 && selectedTemplate && selectedTemplate.kind === "choice") {
          updateAnswerStatus();
          if (!get("choice-wizard-next-to-grade").disabled) renderStage(5);
        } else if (target === 4 && selectedTemplate && selectedTemplate.kind === "choice") renderStage(6);
      });
    });
    document.querySelectorAll("[data-wizard-back]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = Number(button.dataset.wizardBack);
        if (target === 2 && currentStage === 3) returnToSampleBuilder();
        else if (target === 1) renderStage(1);
        else renderStage(target);
      });
    });
    return {
      start: function () { populateTemplates(); renderHome(); },
      openSelectedTemplateEditor: function () {
        var definition = selectedTemplate || templateFromSelect();
        if (!definition || definition.kind !== "choice") return;
        if (!selectTemplate(definition, null, false)) return;
        openEditorForSelected(false, definition);
        renderStage(3);
      },
      onTemplateSaved: function (definition) { selectedTemplate = definition; populateTemplates(); updateTemplateOrderWarning(definition); },
      onTemplateImported: function (definition) {
        if (!definition || definition.kind !== "choice") return;
        if (!selectTemplate(definition, null, false)) return;
        createMode = false; populateTemplates();
        get("choice-wizard-template").value = definition.id;
        updateTemplateOrderWarning(definition);
        renderStage(4);
        setStatus("choice-wizard-answer-status", "範本已匯入；可在此設定答案。", false);
      },
      onEditorClosed: function () { if (editorPanel.parentNode !== editorHome) editorHome.insertBefore(editorPanel, editorNext); },
      refreshAiSettings: updateAiButton,
      refreshAnswerSourceAvailability: updateAnswerSourceAvailability,
      isActive: function () { return !wizard.hidden; },
      showLegacy: showLegacy,
      refreshTemplates: populateTemplates
    };
  }

  root.PdfMarkingChoiceWizardUI = { create: create };
})(typeof window !== "undefined" ? window : globalThis);
