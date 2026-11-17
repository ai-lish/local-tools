(function (root) {
  "use strict";

  var MAX_IMAGE_SIDE = 1024;
  var MAX_RESPONSE_CHARS = 12000;
  var GEMINI_ENDPOINT_PREFIX = "https://generativelanguage.googleapis.com/v1beta/models/";
  var MINIMAX_ENDPOINT = "https://api.minimax.io/v1/chat/completions";
  var PUNCTUATION = "，、。？！；：「」『』（）《》〈〉…—·,.?!;:'\"()";
  var PROMPTS = {
    choice: "只查看圖片中圈格的實際填寫痕跡，不推測答案。回傳 JSON：{\"selectedOptions\":[\"A\"],\"confidence\":0.0}。空白請用空陣列；如有多個填寫，逐一列出。confidence 必須為 0 至 1。只回傳 JSON。",
    dictation: "請只轉錄圖片內可見的手寫文字，不要補寫、改正或推測；不確定的字請以問號表示。不要描述圖片。回傳 JSON：{\"transcription\":\"\"}。只回傳 JSON。",
    test: "這是程式即時產生的空白合成圖片。請勿推測或描述個人資料，只回傳 JSON：{\"status\":\"ok\"}。"
  };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function normalizedRect(rect) {
    if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) return null;
    return {
      left: clamp(rect.x, 0, 1), top: clamp(rect.y, 0, 1),
      right: clamp(rect.x + rect.w, 0, 1), bottom: clamp(rect.y + rect.h, 0, 1)
    };
  }

  function buildIdentityRects(definition, options) {
    var settings = options || {};
    var identity = definition && definition.identity;
    if (!identity || !Array.isArray(identity.fields) || !Array.isArray(identity.masks)) {
      throw new Error("範本未能確認身份區，已停止送出。");
    }
    if (!identity.masks.length && !identity.fields.length && identity.noIdentityAreaDeclared !== true) {
      throw new Error("範本未聲明身份區，已停止送出。");
    }
    var output = [];
    identity.masks.forEach(function (mask) {
      var rect = normalizedRect(mask);
      if (rect) output.push(rect);
    });

    if (definition.kind !== "choice" || !identity.fields.length) return output;
    var templateApi = settings.templates || root.PdfMarkingTemplates;
    var geometryApi = settings.geometry || root.PdfMarkingGeometry;
    var width = Number(settings.pageWidth);
    var height = Number(settings.pageHeight);
    if (!templateApi || !geometryApi || !(width > 0) || !(height > 0)) {
      throw new Error("範本身份欄位位置未能確認，已停止送出。");
    }
    var expanded = templateApi.expandChoiceTemplate(definition, {});
    var radius = width * expanded.params.radius;
    var margin = Math.max(width * 0.012, radius * 2);
    expanded.bubbles.filter(function (bubble) {
      return ["class-grade", "class-form", "student-number"].indexOf(bubble.type) >= 0;
    }).forEach(function (bubble) {
      var point = geometryApi.mapBubble(bubble, width, height, settings.calibration);
      var center = { x: point.x / width, y: point.y / height };
      var xRadius = (radius + margin) / width;
      var yRadius = (radius + margin) / height;
      output.push({
        left: clamp(center.x - xRadius, 0, 1), top: clamp(center.y - yRadius, 0, 1),
        right: clamp(center.x + xRadius, 0, 1), bottom: clamp(center.y + yRadius, 0, 1)
      });
    });
    return output;
  }

  function intersects(first, second) {
    return first.left <= second.right && first.right >= second.left &&
      first.top <= second.bottom && first.bottom >= second.top;
  }

  function assertCropSafe(crop, definition, options) {
    if (!crop || ![crop.left, crop.top, crop.right, crop.bottom].every(Number.isFinite) ||
        crop.left < 0 || crop.top < 0 || crop.right > 1 || crop.bottom > 1 ||
        crop.left >= crop.right || crop.top >= crop.bottom) {
      throw new Error("裁切範圍無效，已停止送出。");
    }
    if (!definition) {
      var settings = options || {};
      var width = Number(settings.pageWidth);
      var height = Number(settings.pageHeight);
      if (settings.syntheticTestImage === true && Number.isInteger(width) && Number.isInteger(height) &&
          width > 0 && height > 0 && width <= 64 && height <= 64 &&
          isBlankSyntheticCanvas(settings.syntheticCanvas) &&
          crop.left === 0 && crop.top === 0 && crop.right === 1 && crop.bottom === 1) return true;
      throw new Error("範本未能確認身份區，已停止送出。");
    }
    var zones = buildIdentityRects(definition, options);
    if (zones.some(function (zone) { return intersects(crop, zone); })) {
      throw new Error("裁切範圍與範本身份區重疊，已停止送出。");
    }
    return true;
  }

  function isBlankSyntheticCanvas(canvas) {
    if (!canvas || !Number.isInteger(canvas.width) || !Number.isInteger(canvas.height) ||
        canvas.width < 1 || canvas.height < 1 || canvas.width > 64 || canvas.height > 64) return false;
    try {
      var context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return false;
      var pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (var index = 0; index < pixels.length; index += 4) {
        if (pixels[index] !== 255 || pixels[index + 1] !== 255 ||
            pixels[index + 2] !== 255 || pixels[index + 3] !== 255) return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  function canvasDataUrl(canvas, mimeType) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error("無法產生裁切圖片。")); return; }
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || "")); };
        reader.onerror = function () { reject(new Error("無法讀取裁切圖片。")); };
        reader.readAsDataURL(blob);
      }, mimeType);
    });
  }

  async function createDeidentifiedCrop(sourceCanvas, pixelBounds, definition, options) {
    if (!sourceCanvas || !(sourceCanvas.width > 0) || !(sourceCanvas.height > 0) || !pixelBounds) {
      throw new Error("裁切圖片無效，已停止送出。");
    }
    var left = Math.floor(Number(pixelBounds.left));
    var top = Math.floor(Number(pixelBounds.top));
    var right = Math.ceil(Number(pixelBounds.right));
    var bottom = Math.ceil(Number(pixelBounds.bottom));
    if (![left, top, right, bottom].every(Number.isFinite) || left < 0 || top < 0 ||
        right > sourceCanvas.width || bottom > sourceCanvas.height || left >= right || top >= bottom) {
      throw new Error("裁切範圍無效，已停止送出。");
    }
    var normalized = {
      left: left / sourceCanvas.width, top: top / sourceCanvas.height,
      right: right / sourceCanvas.width, bottom: bottom / sourceCanvas.height
    };
    var settings = Object.assign({}, options || {}, {
      pageWidth: sourceCanvas.width, pageHeight: sourceCanvas.height
    });
    if (definition && settings.syntheticTestImage === true) {
      throw new Error("合成測試圖不能略過範本身份區檢查。");
    }
    if (!definition && settings.syntheticTestImage === true) settings.syntheticCanvas = sourceCanvas;
    assertCropSafe(normalized, definition, settings);

    var cropWidth = right - left;
    var cropHeight = bottom - top;
    var scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(cropWidth, cropHeight));
    var output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(cropWidth * scale));
    output.height = Math.max(1, Math.round(cropHeight * scale));
    var context = output.getContext("2d");
    if (!context) throw new Error("無法建立裁切圖片。");
    context.drawImage(sourceCanvas, left, top, cropWidth, cropHeight, 0, 0, output.width, output.height);
    var dataUrl = await canvasDataUrl(output, "image/png");
    output.width = 0;
    output.height = 0;
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(dataUrl)) {
      throw new Error("裁切圖片格式不正確，已停止送出。");
    }
    return { mimeType: "image/png", dataUrl: dataUrl };
  }

  function promptFor(task) {
    return PROMPTS[task] || "";
  }

  function buildProviderRequest(provider, model, apiKey, task, image) {
    var safeProvider = String(provider || "");
    var safeModel = String(model || "").trim();
    var key = String(apiKey || "").trim();
    if (["gemini", "minimax"].indexOf(safeProvider) < 0 || !safeModel || !key || !promptFor(task)) {
      throw new Error("AI 覆核設定不完整。");
    }
    if (!image || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl || "")) {
      throw new Error("只可送出安全裁切圖片。");
    }
    var parts = image.dataUrl.split(",");
    var mimeType = parts[0].slice(5, -7);
    var base64 = parts[1];
    if (safeProvider === "gemini") {
      return {
        url: GEMINI_ENDPOINT_PREFIX + encodeURIComponent(safeModel) + ":generateContent",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: promptFor(task) },
            { inline_data: { mime_type: mimeType, data: base64 } }
          ] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 512 }
        })
      };
    }
    return {
      url: MINIMAX_ENDPOINT,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: safeModel,
        messages: [{ role: "user", content: [
          { type: "text", text: promptFor(task) },
          { type: "image_url", image_url: { url: image.dataUrl, detail: "low" } }
        ] }],
        reasoning_effort: "low",
        max_completion_tokens: 2048,
        stream: false
      })
    };
  }

  function providerText(provider, response) {
    if (provider === "gemini") {
      var parts = response && response.candidates && response.candidates[0] &&
        response.candidates[0].content && response.candidates[0].content.parts;
      return Array.isArray(parts) ? parts.map(function (part) { return part && part.text || ""; }).join("\n") : "";
    }
    var content = response && response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map(function (part) { return part && part.text || ""; }).join("\n");
    return "";
  }

  function parseJsonObject(text) {
    var source = String(text || "").slice(0, MAX_RESPONSE_CHARS).replace(/```(?:json)?/gi, "");
    var start = source.indexOf("{");
    var end = source.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    try {
      var value = JSON.parse(source.slice(start, end + 1));
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function parseChoiceSuggestion(text, allowedOptions) {
    var parsed = parseJsonObject(text);
    if (!parsed || !Array.isArray(parsed.selectedOptions) ||
        !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) {
      return { ok: false, message: "AI 回覆格式無效，未套用任何答案。" };
    }
    var options = Array.from(new Set((allowedOptions || []).map(function (option) { return String(option); })));
    var selected = parsed.selectedOptions.map(function (option) { return String(option).trim().toUpperCase(); });
    if (selected.some(function (option) { return options.indexOf(option) < 0; })) {
      return { ok: false, message: "AI 回覆包含不適用選項，未套用任何答案。" };
    }
    return { ok: true, selectedOptions: Array.from(new Set(selected)).sort(), confidence: parsed.confidence };
  }

  function parseTranscription(text) {
    var parsed = parseJsonObject(text);
    if (!parsed || typeof parsed.transcription !== "string" || parsed.transcription.length > 3000) {
      return { ok: false, message: "AI 回覆格式無效，未套用任何標記。" };
    }
    return { ok: true, transcription: parsed.transcription };
  }

  function parseTestResponse(text) {
    var parsed = parseJsonObject(text);
    return parsed && parsed.status === "ok"
      ? { ok: true }
      : { ok: false, message: "AI 回覆格式無效。" };
  }

  function answerItems(answer) {
    var items = [];
    Array.from(String(answer == null ? "" : answer).trim().replace(/\s/g, "")).forEach(function (character, index) {
      if (PUNCTUATION.indexOf(character) < 0) items.push({ character: character, answerIndex: index });
    });
    return items;
  }

  function actualItems(transcription) {
    return Array.from(String(transcription == null ? "" : transcription).trim().replace(/\s/g, ""))
      .filter(function (character) { return PUNCTUATION.indexOf(character) < 0; });
  }

  function alignDictationTranscription(answer, transcription) {
    var answerChars = Array.from(String(answer == null ? "" : answer).trim().replace(/\s/g, ""));
    var expected = answerItems(answer);
    var actual = actualItems(transcription);
    if (expected.length > 1200 || actual.length > 1200) {
      return { ok: false, message: "文字太長，未能安全建立逐字建議。" };
    }
    var rows = expected.length + 1;
    var columns = actual.length + 1;
    var costs = Array.from({ length: rows }, function () { return new Uint16Array(columns); });
    for (var i = 0; i < rows; i += 1) costs[i][0] = i;
    for (var j = 0; j < columns; j += 1) costs[0][j] = j;
    for (var a = 1; a < rows; a += 1) {
      for (var b = 1; b < columns; b += 1) {
        var substitution = costs[a - 1][b - 1] + (expected[a - 1].character === actual[b - 1] ? 0 : 1);
        costs[a][b] = Math.min(substitution, costs[a - 1][b] + 1, costs[a][b - 1] + 1);
      }
    }
    var states = answerChars.map(function () { return "normal"; });
    var wrong = 0; var miss = 0; var extra = 0;
    var row = expected.length; var column = actual.length;
    while (row > 0 || column > 0) {
      if (row > 0 && column > 0 && expected[row - 1].character === actual[column - 1] &&
          costs[row][column] === costs[row - 1][column - 1]) {
        row -= 1; column -= 1;
      } else if (row > 0 && column > 0 && costs[row][column] === costs[row - 1][column - 1] + 1) {
        states[expected[row - 1].answerIndex] = "wrong";
        wrong += 1; row -= 1; column -= 1;
      } else if (row > 0 && costs[row][column] === costs[row - 1][column] + 1) {
        states[expected[row - 1].answerIndex] = "miss";
        miss += 1; row -= 1;
      } else if (column > 0) {
        extra += 1; column -= 1;
      } else {
        return { ok: false, message: "未能建立逐字建議。" };
      }
    }
    return { ok: true, states: states, wrong: wrong, miss: miss, extra: extra,
      answerCharacterCount: expected.length, transcriptionCharacterCount: actual.length };
  }

  function extractProviderText(provider, response) {
    var text = providerText(provider, response);
    if (!text) throw new Error("invalid-response");
    return text;
  }

  function parseProviderResponse(provider, task, response, allowedOptions) {
    var text = extractProviderText(provider, response);
    if (task === "choice") return parseChoiceSuggestion(text, allowedOptions || ["A", "B", "C", "D", "T", "F"]);
    if (task === "dictation") return parseTranscription(text);
    return parseTestResponse(text);
  }

  function responseError(status) {
    if (status === 401 || status === 403) return "API key 無效或未獲授權（HTTP " + status + "）。";
    if (status === 429) return "服務繁忙或用量受限（HTTP 429），請稍後再試。";
    return "AI 服務回應錯誤（HTTP " + status + "）。";
  }

  async function request(provider, model, apiKey, task, image, allowedOptions, fetchImpl) {
    var requestInfo;
    try {
      requestInfo = buildProviderRequest(provider, model, apiKey, task, image);
    } catch (error) {
      return { ok: false, message: error && error.message || "AI 覆核設定不完整。" };
    }
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 30000) : null;
    try {
      var sender = fetchImpl || root.fetch.bind(root);
      var response = await sender(requestInfo.url, {
        method: "POST", headers: requestInfo.headers, body: requestInfo.body,
        mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
        signal: controller ? controller.signal : undefined
      });
      if (!response || !response.ok) return { ok: false, message: responseError(response && response.status || 0) };
      var value;
      try { value = await response.json(); } catch (error) { return { ok: false, message: "AI 回覆不是有效 JSON。" }; }
      try { return parseProviderResponse(provider, task, value, allowedOptions); } catch (error) {
        return { ok: false, message: "AI 回覆格式無效，未套用任何建議。" };
      }
    } catch (error) {
      return { ok: false, message: error && error.name === "AbortError" ? "AI 要求逾時。" : "無法連接所選 AI 服務。" };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  root.PdfMarkingAiReview = {
    PROMPTS: PROMPTS,
    MAX_IMAGE_SIDE: MAX_IMAGE_SIDE,
    buildIdentityRects: buildIdentityRects,
    assertCropSafe: assertCropSafe,
    createDeidentifiedCrop: createDeidentifiedCrop,
    buildProviderRequest: buildProviderRequest,
    parseJsonObject: parseJsonObject,
    parseChoiceSuggestion: parseChoiceSuggestion,
    parseTranscription: parseTranscription,
    parseTestResponse: parseTestResponse,
    parseProviderResponse: parseProviderResponse,
    alignDictationTranscription: alignDictationTranscription,
    request: request
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingAiReview;
})(typeof window !== "undefined" ? window : globalThis);
