(function (root) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function create(options) {
    var api = root.PdfMarkingChoiceWizard;
    var templates = options.templates;
    var geometry = options.geometry;
    var get = function (id) { return document.getElementById(id); };
    var wizard = get("choice-wizard");
    var legacyStepper = get("legacy-stepper");
    var legacySections = [get("step-1"), get("step-2"), get("step-3")];
    var editorPanel = get("template-editor-panel");
    var editorHome = editorPanel.parentNode;
    var editorNext = editorPanel.nextSibling;
    var settingsPanel = get("choice-settings");
    var answerInputs = get("choice-wizard-answer-inputs");
    var mcCountLabel = get("mc-count").closest("label");
    var tfCountLabel = get("tf-count").closest("label");
    var mcKeyLabel = get("mc-key").closest("label");
    var tfKeyLabel = get("tf-key").closest("label");
    var currentStage = 1;
    var selectedTemplate = null;
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
    }
    function setLegacyVisibility(visible) {
      legacyStepper.hidden = !visible;
      legacySections.forEach(function (section) { section.hidden = !visible; });
    }
    function moveFields(stage) {
      if (stage === 3) {
        get("choice-wizard-count-slot").append(mcCountLabel, tfCountLabel);
      } else settingsPanel.append(mcCountLabel, tfCountLabel);
      if (stage === 4) answerInputs.append(mcKeyLabel, tfKeyLabel);
      else settingsPanel.append(mcKeyLabel, tfKeyLabel);
    }
    function renderStage(stage) {
      currentStage = stage;
      wizard.hidden = false;
      setLegacyVisibility(false);
      document.querySelectorAll("[data-wizard-panel]").forEach(function (panel) {
        panel.hidden = Number(panel.dataset.wizardPanel) !== stage;
      });
      document.querySelectorAll("[data-wizard-step]").forEach(function (pill) {
        var target = Number(pill.dataset.wizardStep);
        pill.classList.toggle("current", target === stage);
        pill.classList.toggle("complete", target < stage);
        if (target === stage) pill.setAttribute("aria-current", "step"); else pill.removeAttribute("aria-current");
      });
      moveFields(stage);
      if (stage === 3) {
        if (sampleFile && selectedDefinition() && !options.getEditorDraft()) openEditorForSelected();
        var draft = options.getEditorDraft() || selectedDefinition();
        var mcBlock = draft && draft.blocks.find(function (entry) { return entry.type === "mc"; });
        var tfBlock = draft && draft.blocks.find(function (entry) { return entry.type === "tf"; });
        get("choice-wizard-mc-numbering").value = mcBlock ? mcBlock.numbering : "column-major";
        get("choice-wizard-tf-numbering").value = tfBlock ? tfBlock.numbering : "column-major";
        get("choice-wizard-mc-numbering").disabled = !mcBlock;
        get("choice-wizard-tf-numbering").disabled = !tfBlock;
        updateCountStatus();
      }
      if (stage === 4) renderAnswerPage();
      options.onWizardStage(stage);
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
      else if (options.getSelectedTemplate() && options.getSelectedTemplate().kind === "choice") select.value = options.getSelectedTemplate().id;
      else if (select.options.length) select.selectedIndex = 0;
      updateTemplateOrderWarning(templateFromSelect());
    }
    function templateFromSelect() {
      return allChoiceTemplates().find(function (definition) { return definition.id === get("choice-wizard-template").value; }) || null;
    }
    function updateSourceButtons() {
      var loaded = Boolean(sampleFile);
      get("choice-wizard-next-from-source").disabled = !loaded || !selectedTemplate;
      get("choice-wizard-build-template").disabled = !loaded || !createMode;
      get("choice-wizard-page").disabled = !loaded;
    }
    function isPrivacyIdentityZone(zone) { return api.isLayoutPrivacyZone(zone); }
    function isIdentityGridZone(zone) { return api.isIdentityGridZone(zone); }
    function isTextZone(zone) { return Boolean(zone && ["text-name", "text-subject", "text-other"].indexOf(zone.type) >= 0); }
    function isForcedRedactionZone(zone) { return Boolean(zone && ["text-name", "class-handwrite", "student-handwrite"].indexOf(zone.type) >= 0); }
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
        "class-handwrite": "手寫班別（遮罩）", "student-handwrite": "手寫班號（遮罩）",
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
    function zoneConfig(point) {
      var type = get("choice-wizard-zone-type").value;
      var names = { "text-name": "姓名", "text-subject": "科目", "text-other": "其他文字區", "class-grade-grid": "班別年級圈格",
        "class-form-grid": "班別字母圈格", "student-number-grid": "學號圈格", "class-handwrite": "班別手寫區", "student-handwrite": "學號手寫區",
        "answer-mc": "選擇題答案欄", "answer-tf": "是非題答案欄" };
      var zone = { id: "zone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6), type: type,
        label: names[type] || "新區域", x: point.x, y: point.y, w: 0, h: 0,
        digits: Number(get("choice-wizard-digits").value) || 4 };
      if (isPrivacyIdentityZone(zone)) zone.redactForAi = true;
      if (type === "answer-mc" || type === "answer-tf") { zone.groupSize = 0; zone.groupGap = 1; }
      if (type === "class-grade-grid" || type === "class-form-grid") zone.options = api.normalizeGridOptions(type, null);
      return zone;
    }
    function pointerDown(event) {
      if (!createMode || !samplePage || event.button !== 0) return;
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
      if (drawing.kind === "new") {
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
      updateSourceButtons(); renderOverlay();
      if (currentStage === 4) renderAnswerPage();
    }
    async function loadSample(file) {
      if (!file) return;
      sampleFile = file; samplePage = null; createMode = false; zones = []; selectedZoneId = "";
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
        get("choice-wizard-no-identity").checked = false; get("choice-wizard-identities-complete").checked = false;
        clearPreparedAiImage(); clearAiSuggestions();
      }
      get("choice-wizard-builder").hidden = false;
      setStatus("choice-wizard-source-status", "請拖拉標示姓名、科目、其他文字及手寫身份區；班別／班號圈格可先畫概略框，亦可留待 AI 建議。", false);
      renderOverlay(); renderZoneList(); updateSourceButtons(); updateIdentityConfirmation(false);
    }
    function openEditorForSelected(forceReset) {
      var definition = selectedDefinition();
      if (!definition || !sampleFile) return;
      if (!forceReset && options.getEditorDraft()) return;
      get("choice-wizard-builder").hidden = true;
      get("choice-wizard-position-status").textContent = definition.source === "builtin"
        ? "內置範本會以自訂副本編輯；內置範本保持不變。"
        : "範本只保存圈位及遮罩設定，不包括樣本、答案或學生資料。";
      get("choice-wizard-editor-slot").append(editorPanel);
      options.openEditor(definition, sampleFile);
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
        selectedTemplate = definition;
        if (!options.onSelectTemplate(definition)) return;
        get("choice-wizard-template").value = "";
        openEditorForSelected(true);
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
        var unmaskedText = zones.filter(function (zone) { return isTextZone(zone) && zone.type !== "text-name" && zone.redactForAi === false; })
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
    function syncAnswerInput(type) {
      var settings = selectedOptions(type);
      var input = get(type === "mc" ? "mc-key" : "tf-key");
      var result = api.keyArray(input.value, settings.count, settings.choices);
      get("choice-wizard-answer-overlay").querySelectorAll("[data-answer-type='" + type + "']").forEach(function (button) {
        var selected = result[Number(button.dataset.question) - 1] === button.dataset.option;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      updateAnswerStatus();
    }
    function updateAnswerStatus() {
      var missing = [];
      ["mc", "tf"].forEach(function (type) {
        var settings = selectedOptions(type); var answers = api.keyArray(get(type === "mc" ? "mc-key" : "tf-key").value, settings.count, settings.choices);
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
      setStatus("choice-wizard-answer-status", missing.length ? "尚未設定：" + missing.slice(0, 12).join("、") + (missing.length > 12 ? "等 " + missing.length + " 題" : "") : "所有題目已設定答案。", Boolean(missing.length));
      get("choice-wizard-next-to-grade").disabled = Boolean(missing.length);
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
                input.value = api.toggleAnswer(input.value, settings.count, settings.choices, item.number, choice.option);
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
      selectedTemplate = definition;
      if (!options.onSelectTemplate(definition)) return;
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

    get("choice-wizard-select-choice").addEventListener("click", function () { renderStage(2); populateTemplates(); });
    get("choice-wizard-select-dictation").addEventListener("click", function () { showLegacy("dictation"); });
    get("choice-wizard-use-existing").addEventListener("click", function () {
      selectedTemplate = templateFromSelect();
      if (!selectedTemplate) { setStatus("choice-wizard-source-status", "請選擇一個範本。", true); return; }
      updateTemplateOrderWarning(selectedTemplate);
      createMode = false; get("choice-wizard-builder").hidden = true;
      if (!options.onSelectTemplate(selectedTemplate)) return;
      updateSourceButtons();
      setStatus("choice-wizard-source-status", "已選取「" + selectedTemplate.name + "」；載入樣本後繼續。", false);
    });
    get("choice-wizard-start-create").addEventListener("click", beginCreate);
    get("choice-wizard-direct-use").addEventListener("click", function () {
      var definition = templateFromSelect();
      if (!definition) { setStatus("choice-wizard-source-status", "請選擇一個範本。", true); return; }
      updateTemplateOrderWarning(definition);
      if (!options.onSelectTemplate(definition)) return;
      showLegacy("choice", definition);
    });
    get("choice-wizard-template").addEventListener("change", function () {
      updateTemplateOrderWarning(templateFromSelect());
    });
    get("choice-wizard-order-repair").addEventListener("click", function () {
      var result = options.createReorderedTemplateCopy(pendingOrderTemplate);
      if (!result.ok) { setStatus("choice-wizard-source-status", result.message, true); return; }
      var hadReadResults = typeof options.hasChoiceReadings === "function" && options.hasChoiceReadings();
      if (!options.onSelectTemplate(result.template, { preserveAnswers: true })) {
        setStatus("choice-wizard-source-status", "已建立修正版副本，但本次沒有更換目前範本；仍使用原範本。", false);
        return;
      }
      selectedTemplate = result.template;
      get("choice-wizard-template").value = result.template.id;
      updateTemplateOrderWarning(result.template);
      updateSourceButtons();
      if (currentStage === 4) { renderAnswerPage(); updateAnswerStatus(); }
      var message = "已改用『" + result.template.name + "』；原範本保留在範本清單。";
      if (hadReadResults) message += " 範本已更換，請重新讀圈。";
      setStatus("choice-wizard-source-status", message, false);
    });
    get("choice-wizard-pdf-file").addEventListener("change", function () { loadSample(this.files[0]); });
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
    get("choice-wizard-next-from-source").addEventListener("click", enterStage3FromExisting);
    get("choice-wizard-build-template").addEventListener("click", handleBuildTemplate);
    get("choice-wizard-delete-zone").addEventListener("click", function () {
      var removedIdentity = zones.some(function (zone) { return zone.id === selectedZoneId && isPrivacyIdentityZone(zone); });
      zones = zones.filter(function (zone) { return zone.id !== selectedZoneId; }); selectedZoneId = ""; renderOverlay(); renderZoneList();
      if (removedIdentity) updateIdentityConfirmation(true);
    });
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
    ["mc-count", "tf-count"].forEach(function (id) { get(id).addEventListener("input", updateCountStatus); });
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
    get("choice-wizard-stepper").querySelectorAll("[data-wizard-step]").forEach(function (pill) {
      pill.addEventListener("click", function () {
        var target = Number(pill.dataset.wizardStep);
        if (target === 1) renderStage(1);
        else if (target === 2) returnToSampleBuilder();
        else if (target === 3 && selectedTemplate && sampleFile) renderStage(3);
        else if (target === 4 && selectedTemplate && sampleFile && !get("choice-wizard-next-to-answers").disabled && options.isTemplateSaved(selectedTemplate.id)) renderStage(4);
        else if (target === 5 && selectedTemplate && sampleFile) {
          updateAnswerStatus();
          if (!get("choice-wizard-next-to-grade").disabled) renderStage(5);
        }
      });
    });
    document.querySelectorAll("[data-wizard-back]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = Number(button.dataset.wizardBack);
        if (target === 2 && currentStage === 3) returnToSampleBuilder();
        else renderStage(target);
      });
    });
    return {
      start: function () { populateTemplates(); updateTemplateOrderWarning(options.getSelectedTemplate()); renderStage(1); },
      onTemplateSaved: function (definition) { selectedTemplate = definition; populateTemplates(); updateTemplateOrderWarning(definition); },
      onTemplateImported: function (definition) {
        if (!definition || definition.kind !== "choice") return;
        updateTemplateOrderWarning(definition);
        selectedTemplate = definition; createMode = false; populateTemplates();
        if (!options.onSelectTemplate(definition)) return;
        get("choice-wizard-template").value = definition.id;
        updateTemplateOrderWarning(definition);
        setStatus("choice-wizard-source-status", "範本已匯入。已直接前往第四步；載入樣本頁後可點選圈格，也可用整批輸入。", false);
        renderStage(4);
      },
      onEditorClosed: function () { if (editorPanel.parentNode !== editorHome) editorHome.insertBefore(editorPanel, editorNext); },
      refreshAiSettings: updateAiButton,
      isActive: function () { return !wizard.hidden; },
      showLegacy: showLegacy,
      refreshTemplates: populateTemplates
    };
  }

  root.PdfMarkingChoiceWizardUI = { create: create };
})(typeof window !== "undefined" ? window : globalThis);
