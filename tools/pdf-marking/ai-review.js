(function (root) {
  "use strict";

  var MAX_IMAGE_SIDE = 1024;
  var MAX_RESPONSE_CHARS = 12000;
  var GEMINI_ENDPOINT_PREFIX = "https://generativelanguage.googleapis.com/v1beta/models/";
  var MINIMAX_ENDPOINT = "https://api.minimax.io/v1/chat/completions";
  var PUNCTUATION = "，、。？！；：「」『』（）《》〈〉…—·,.?!;:'\"()";
  var PROMPTS = {
    choice: "只查看圖片中圈格的實際填寫痕跡，不推測答案。回傳 JSON：{\"selectedOptions\":[\"A\"],\"confidence\":0.0}。空白請用空陣列；如有多個填寫，逐一列出。confidence 必須為 0 至 1。只回傳 JSON。",
    answerKey: "只讀取頁面上清晰列出的選擇題標準答案，不猜測不清楚的內容。只回傳 JSON：{\"answers\":[{\"q\":1,\"a\":\"A\"}]}。q 必須是題號整數，a 必須是單一選項字母。不要回傳解釋或其他內容。",
    dictation: "請只轉錄圖片內可見的手寫文字，不要補寫、改正或推測；不確定的字請以問號表示。不要描述圖片。回傳 JSON：{\"transcription\":\"\"}。只回傳 JSON。",
    identity: "只讀取提示所指定的一組身份資料，不描述或轉錄其他內容。只回傳 JSON；圈格欄位只可回報固定選項及填寫狀態，手寫欄位只可回報指定的班別或班號。",
    layout: "只分析答案及身份代號圈格的版面幾何。圈格可見的固定標籤只可辨認班別年級數字 1–9、班別字母 A–Z；不要讀取或推測圈內填寫內容。班別年級及字母圈格必須回傳 options，按標籤由上而下列出；不得用 digits 代替。學號 digits 是學號位數，即數字圈格的欄數，不是 0–9 的行數；學號欄只回傳 digits。每個圈格框須緊貼該組圈格外緣。不得讀取、轉錄或描述姓名、手寫班別／班號、科目、題目或任何其他文字。請只回傳 JSON：{\"answerColumns\":[{\"type\":\"mc\",\"rect\":{\"x\":0.1,\"y\":0.2,\"w\":0.3,\"h\":0.5},\"options\":[\"A\",\"B\",\"C\",\"D\",\"E\"],\"rows\":10,\"groupSize\":5,\"numbering\":\"column-major\"}],\"identityFields\":[{\"type\":\"class-grade-grid\",\"rect\":{\"x\":0.1,\"y\":0.2,\"w\":0.1,\"h\":0.3},\"options\":[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\"]},{\"type\":\"class-form-grid\",\"rect\":{\"x\":0.3,\"y\":0.2,\"w\":0.1,\"h\":0.3},\"options\":[\"A\",\"B\",\"C\",\"D\",\"E\"]},{\"type\":\"student-number-grid\",\"rect\":{\"x\":0.5,\"y\":0.2,\"w\":0.2,\"h\":0.3},\"digits\":4}]}。每個答案欄可用 type mc 或 tf；options 只回傳可見選項標籤；rows 是整數；groupSize 可選，為 1 至 rows 的整數；numbering 只可為 column-major 或 row-major。identityFields 只可列出 class-grade-grid、class-form-grid、student-number-grid 的位置；班別年級及字母 options 須為 2 至 12 個不重複的可見標籤，學號欄只附 1 至 12 位 digits。不可回傳轉錄文字、label、name、filename、page number、答案或解釋。只回傳 JSON。",
    test: "這是程式即時產生的空白合成圖片。請勿推測或描述個人資料，只回傳 JSON：{\"status\":\"ok\"}。"
  };

  var GRID_FIELD_TYPES = {
    "class-grade": "class-grade-grid",
    "class-form": "class-form-grid",
    "student-number": "student-number-grid"
  };
  var GRID_BUBBLE_TYPES = {
    "class-grade-grid": "class-grade",
    "class-form-grid": "class-form",
    "student-number-grid": "student-number"
  };
  var HANDWRITING_TYPES = ["class-handwrite", "student-handwrite"];
  var GRID_MASK_TYPES = ["class-grade-grid", "class-form-grid", "student-number-grid"];

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

  function isUnitRect(rect) {
    return Boolean(rect && [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) &&
      rect.left >= 0 && rect.top >= 0 && rect.right <= 1 && rect.bottom <= 1 &&
      rect.left < rect.right && rect.top < rect.bottom);
  }

  function expandNormalizedRect(rect, marginX, marginY) {
    return {
      left: clamp(rect.left - marginX, 0, 1), top: clamp(rect.top - marginY, 0, 1),
      right: clamp(rect.right + marginX, 0, 1), bottom: clamp(rect.bottom + marginY, 0, 1)
    };
  }

  function unionBubbleBounds(bubbles, width, height, radius, calibration, geometryApi) {
    if (!Array.isArray(bubbles) || !bubbles.length) return null;
    var points = bubbles.map(function (bubble) {
      var point = geometryApi.mapBubble(bubble, width, height, calibration);
      return { left: (point.x - radius) / width, top: (point.y - radius) / height,
        right: (point.x + radius) / width, bottom: (point.y + radius) / height };
    });
    return {
      left: Math.min.apply(null, points.map(function (point) { return point.left; })),
      top: Math.min.apply(null, points.map(function (point) { return point.top; })),
      right: Math.max.apply(null, points.map(function (point) { return point.right; })),
      bottom: Math.max.apply(null, points.map(function (point) { return point.bottom; }))
    };
  }

  function identityGridBounds(definition, fieldType, options) {
    var settings = options || {};
    var width = Number(settings.pageWidth); var height = Number(settings.pageHeight);
    var bubbleType = GRID_BUBBLE_TYPES[fieldType];
    var templateApi = settings.templates || root.PdfMarkingTemplates;
    var geometryApi = settings.geometry || root.PdfMarkingGeometry;
    if (!definition || definition.kind !== "choice" || !bubbleType || !(width > 0) || !(height > 0) ||
        !definition.identity || !Array.isArray(definition.identity.fields) || !templateApi || !geometryApi) {
      throw new Error("身份圈格位置未能確認，已停止送出。");
    }
    var fieldId = Object.keys(GRID_FIELD_TYPES).find(function (id) { return GRID_FIELD_TYPES[id] === fieldType; });
    if (!fieldId || !definition.identity.fields.some(function (field) { return field && field.id === fieldId; })) {
      throw new Error("範本沒有此身份圈格，已停止送出。");
    }
    var expanded = templateApi.expandChoiceTemplate(definition, {});
    var radius = width * expanded.params.radius;
    var circles = unionBubbleBounds(expanded.bubbles.filter(function (bubble) { return bubble.type === bubbleType; }),
      width, height, radius, settings.calibration, geometryApi);
    if (!circles || !isUnitRect(circles)) throw new Error("身份圈格位置未能核實，已停止送出。");
    var cropMarginX = Math.max(width * 0.0015, radius * 0.55) / width;
    var cropMarginY = Math.max(width * 0.0015, radius * 0.55) / height;
    var guardMarginX = Math.max(width * 0.005, radius * 2) / width;
    var guardMarginY = Math.max(width * 0.005, radius * 2) / height;
    return { crop: expandNormalizedRect(circles, cropMarginX, cropMarginY),
      allowed: expandNormalizedRect(circles, guardMarginX, guardMarginY), circles: circles };
  }

  function identityHandwriteBounds(definition, maskId, fieldType) {
    var masks = definition && definition.identity && definition.identity.masks;
    if (!definition || definition.kind !== "choice" || !Array.isArray(masks) || HANDWRITING_TYPES.indexOf(fieldType) < 0) {
      throw new Error("範本沒有可用的手寫班別／班號區，已停止送出。");
    }
    var matches = masks.filter(function (mask) {
      return mask && mask.type === fieldType && (!maskId || mask.id === maskId);
    });
    if (matches.length !== 1) throw new Error("手寫班別／班號區位置不明確，已停止送出。");
    var mask = matches[0];
    var base = normalizedRect(mask);
    if (!base || !isUnitRect(base)) throw new Error("手寫班別／班號區位置無效，已停止送出。");
    return { crop: expandNormalizedRect(base, 0.003, 0.003),
      allowed: expandNormalizedRect(base, 0.01, 0.01), mask: mask };
  }

  function protectedIdentityRects(definition, target) {
    var masks = definition && definition.identity && definition.identity.masks;
    if (!Array.isArray(masks)) throw new Error("範本未能確認文字及手寫身份區，已停止送出。");
    var isBuiltInHeaderOnly = definition.id === "builtin:choice-60x4-tf10" && masks.length === 1 &&
      masks[0] && !masks[0].type && masks[0].id === "header";
    return masks.filter(function (mask) {
      if (!mask) return true;
      if (target && target.maskId && mask.id === target.maskId) return false;
      if (mask.type && GRID_MASK_TYPES.indexOf(mask.type) >= 0) return false;
      if (isBuiltInHeaderOnly && !mask.type) return false;
      return true;
    }).map(normalizedRect).filter(Boolean);
  }

  function identityCropPolicy(definition, target, options) {
    if (!target || !target.source) throw new Error("身份裁切類型未能確認，已停止送出。");
    var bounds = target.source === "grid"
      ? identityGridBounds(definition, target.fieldType, options)
      : target.source === "handwriting"
        ? identityHandwriteBounds(definition, target.maskId, target.fieldType)
        : null;
    if (!bounds) throw new Error("身份裁切類型無效，已停止送出。");
    return bounds;
  }

  function assertIdentityCropSafe(crop, definition, target, options) {
    if (!isUnitRect(crop)) throw new Error("身份裁切範圍無效，已停止送出。");
    var policy = identityCropPolicy(definition, target, options);
    var allowed = policy.allowed;
    if (crop.left < allowed.left || crop.top < allowed.top || crop.right > allowed.right || crop.bottom > allowed.bottom) {
      throw new Error("身份裁切超出指定圈格／手寫區範圍，已停止送出。");
    }
    if (protectedIdentityRects(definition, target).some(function (zone) { return intersects(crop, zone); })) {
      throw new Error("身份裁切與姓名、科目、學校或其他手寫區重疊，已停止送出。");
    }
    return true;
  }

  async function createIdentityCrop(sourceCanvas, definition, target, options) {
    if (!sourceCanvas || !(sourceCanvas.width > 0) || !(sourceCanvas.height > 0)) {
      throw new Error("身份裁切圖片無效，已停止送出。");
    }
    var settings = options || {};
    var crop = identityCropPolicy(definition, target, Object.assign({}, settings, {
      pageWidth: sourceCanvas.width, pageHeight: sourceCanvas.height
    })).crop;
    var left = Math.floor(crop.left * sourceCanvas.width);
    var top = Math.floor(crop.top * sourceCanvas.height);
    var right = Math.ceil(crop.right * sourceCanvas.width);
    var bottom = Math.ceil(crop.bottom * sourceCanvas.height);
    var normalized = { left: left / sourceCanvas.width, top: top / sourceCanvas.height,
      right: right / sourceCanvas.width, bottom: bottom / sourceCanvas.height };
    var cropOptions = Object.assign({}, settings, { pageWidth: sourceCanvas.width, pageHeight: sourceCanvas.height });
    assertIdentityCropSafe(normalized, definition, target, cropOptions);
    if (left < 0 || top < 0 || right > sourceCanvas.width || bottom > sourceCanvas.height ||
        left >= right || top >= bottom) throw new Error("身份裁切範圍無效，已停止送出。");
    var cropWidth = right - left; var cropHeight = bottom - top;
    var scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(cropWidth, cropHeight));
    var output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(cropWidth * scale));
    output.height = Math.max(1, Math.round(cropHeight * scale));
    var context = output.getContext("2d");
    if (!context) throw new Error("無法建立身份裁切圖片。");
    context.drawImage(sourceCanvas, left, top, cropWidth, cropHeight, 0, 0, output.width, output.height);
    var dataUrl;
    try { dataUrl = await canvasDataUrl(output, "image/png"); }
    finally { output.width = 0; output.height = 0; }
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(dataUrl || "")) {
      throw new Error("身份裁切圖片格式無效，已停止送出。");
    }
    return { mimeType: "image/png", dataUrl: dataUrl, width: Math.max(1, Math.round(cropWidth * scale)),
      height: Math.max(1, Math.round(cropHeight * scale)), crop: normalized };
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

  function expandLayoutMask(rect, marginX, marginY) {
    return {
      left: clamp(rect.left - marginX, 0, 1), top: clamp(rect.top - marginY, 0, 1),
      right: clamp(rect.right + marginX, 0, 1), bottom: clamp(rect.bottom + marginY, 0, 1)
    };
  }

  async function createMaskedLayoutImage(sourceCanvas, definition, options) {
    var settings = options || {};
    var width = Number(sourceCanvas && sourceCanvas.width);
    var height = Number(sourceCanvas && sourceCanvas.height);
    if (!(width > 0) || !(height > 0) || !definition || !definition.identity ||
        !Array.isArray(definition.identity.masks) || !Array.isArray(definition.identity.fields)) {
      throw new Error("樣本頁或身份區設定無效，已停止送出。");
    }
    if (!definition.identity.masks.length && !definition.identity.fields.length && definition.identity.noIdentityAreaDeclared !== true) {
      throw new Error("請先標示所有身份區，或確認此答題紙沒有身份區；已停止送出。");
    }
    if (definition.identity.masks.some(function (mask) {
      return !mask || ![mask.x, mask.y, mask.w, mask.h].every(Number.isFinite) ||
        mask.x < 0 || mask.y < 0 || mask.w <= 0 || mask.h <= 0 || mask.x + mask.w > 1 || mask.y + mask.h > 1;
    })) {
      throw new Error("身份遮罩範圍無效，已停止送出。");
    }
    var identityRects = buildIdentityRects(definition, {
      templates: settings.templates || root.PdfMarkingTemplates,
      geometry: settings.geometry || root.PdfMarkingGeometry,
      pageWidth: width, pageHeight: height, calibration: settings.calibration
    });
    if ((definition.identity.masks.length || definition.identity.fields.length) && !identityRects.length) {
      throw new Error("身份區位置未能核實，已停止送出。");
    }
    var marginX = 0.015;
    var marginY = Math.min(1, 0.015 * width / height);
    var redactionRects = definition.identity.masks.filter(function (mask) {
      if (!mask || !mask.type) return true;
      if (["text-name", "class-handwrite", "student-handwrite"].indexOf(mask.type) >= 0) return true;
      if (["text-subject", "text-other"].indexOf(mask.type) >= 0) return mask.redactForAi !== false;
      return false;
    }).map(normalizedRect).filter(Boolean);
    var masks = redactionRects.map(function (rect) { return expandLayoutMask(rect, marginX, marginY); });
    var scale = Math.min(1, 1600 / Math.max(width, height));
    var outputWidth = Math.max(1, Math.round(width * scale));
    var outputHeight = Math.max(1, Math.round(height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = outputWidth; canvas.height = outputHeight;
    var context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("無法建立去識別預覽，已停止送出。");
    context.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
    var pixelMasks = masks.map(function (rect) {
      var left = Math.max(0, Math.floor(rect.left * outputWidth));
      var top = Math.max(0, Math.floor(rect.top * outputHeight));
      var right = Math.min(outputWidth, Math.ceil(rect.right * outputWidth));
      var bottom = Math.min(outputHeight, Math.ceil(rect.bottom * outputHeight));
      if (left >= right || top >= bottom) throw new Error("身份區遮罩位置無效，已停止送出。");
      context.fillStyle = "#000000";
      context.fillRect(left, top, right - left, bottom - top);
      return { left: left, top: top, right: right, bottom: bottom };
    });
    var pixels;
    try { pixels = context.getImageData(0, 0, outputWidth, outputHeight).data; }
    catch (error) { canvas.width = 0; canvas.height = 0; throw new Error("無法核對身份區遮罩像素，已停止送出。"); }
    for (var maskIndex = 0; maskIndex < pixelMasks.length; maskIndex += 1) {
      var mask = pixelMasks[maskIndex];
      for (var y = mask.top; y < mask.bottom; y += 1) {
        for (var x = mask.left; x < mask.right; x += 1) {
          var offset = (y * outputWidth + x) * 4;
          if (pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0 || pixels[offset + 3] !== 255) {
            canvas.width = 0; canvas.height = 0;
            throw new Error("身份區遮罩像素核對失敗，已停止送出。");
          }
        }
      }
    }
    var dataUrl;
    try { dataUrl = await (settings.toDataUrl || canvasDataUrl)(canvas, "image/png"); }
    finally { canvas.width = 0; canvas.height = 0; }
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(dataUrl || "")) {
      throw new Error("去識別預覽影像格式無效，已停止送出。");
    }
    var labels = definition.identity.masks.filter(function (mask) {
      if (!mask || !mask.type) return true;
      if (["text-name", "class-handwrite", "student-handwrite"].indexOf(mask.type) >= 0) return true;
      return ["text-subject", "text-other"].indexOf(mask.type) >= 0 && mask.redactForAi !== false;
    }).map(function (mask) { return String(mask.label || "身份區"); });
    (definition.identity.fields || []).forEach(function (field) { labels.push(String(field.label || field.id || "身份圈格")); });
    if (definition.identity.noIdentityAreaDeclared === true && !labels.length) labels.push("已確認沒有身份區");
    return { mimeType: "image/png", dataUrl: dataUrl, width: outputWidth, height: outputHeight,
      redactedAreas: labels, redactedRects: identityRects.map(function (rect) { return expandLayoutMask(rect, marginX, marginY); }) };
  }

  function identityPrompt(context) {
    var settings = context || {};
    if (settings.mode === "grid") {
      if (settings.fieldType === "class-grade-grid") {
        return "圖片只包含一組班別年級圈格。只辨認有填記號的 1–9 固定選項；不要讀取或推測任何其他文字。允許選項（由上而下）為：" +
          (settings.options || []).join("、") + "。空白回傳空字串；單選回傳一個字串；多填回傳字串陣列，保留所有被填選項。只回傳 JSON：{\"classGrade\":\"1\",\"confidence\":0.0}；多填時 classGrade 可為 [\"1\",\"2\"]。不可回傳姓名、手寫文字、學校、科目、轉錄或解釋，只回傳 JSON。";
      }
      if (settings.fieldType === "class-form-grid") {
        return "圖片只包含一組班別字母圈格。只辨認有填記號的 A–Z 固定選項；不要讀取或推測任何其他文字。允許選項（由上而下）為：" +
          (settings.options || []).join("、") + "。空白回傳空字串；單選回傳一個字串；多填回傳字串陣列，保留所有被填選項。只回傳 JSON：{\"classForm\":\"A\",\"confidence\":0.0}；多填時 classForm 可為 [\"A\",\"B\"]。不可回傳姓名、手寫文字、學校、科目、轉錄或解釋，只回傳 JSON。";
      }
      if (settings.fieldType === "student-number-grid") {
        return "圖片只包含一組學號數字圈格，共 " + Number(settings.digits) + " 個數字欄。每個欄位的選項是 0–9；studentNumber 必須按欄由左至右回傳，長度剛好 " +
          Number(settings.digits) + "。每格使用一個字串表示單選、空字串表示空白；多填時該格用字串陣列列出所有被填數字，例如 [\"2\",[\"3\",\"6\"]]。不要把 0–9 的選項行數當成位數。不要讀取或推測任何其他文字。只回傳 JSON：{\"studentNumber\":[\"2\",\"6\"],\"confidence\":0.0}。不可回傳姓名、手寫文字、學校、科目、轉錄或解釋，只回傳 JSON。";
      }
    }
    if (settings.mode === "handwriting" && settings.fieldType === "class-handwrite") {
      return "圖片只包含老師指定的手寫班別區。只讀取 1–9 年級加一個 A–Z 班別字母，例如 1A；不完整或不清楚請回傳空字串。其他格式一律回傳空字串。不得讀取或回傳姓名、學號、學校名稱、科目或任何其他文字。只回傳 JSON：{\"handwrittenClass\":\"1A\"}。";
    }
    if (settings.mode === "handwriting" && settings.fieldType === "student-handwrite") {
      return "圖片只包含老師指定的手寫班號區。只讀取 1–3 位數字；空白、不清楚或包含其他字元時回傳空字串。不得讀取或回傳姓名、班別、學校名稱、科目或任何其他文字。只回傳 JSON：{\"handwrittenNumber\":\"26\"}。";
    }
    return "";
  }

  function promptFor(task, identityContext) {
    if (task === "identity") return identityPrompt(identityContext);
    return PROMPTS[task] || "";
  }

  function buildProviderRequest(provider, model, apiKey, task, image, identityContext) {
    var safeProvider = String(provider || "");
    var safeModel = String(model || "").trim();
    var key = String(apiKey || "").trim();
    if (["gemini", "minimax"].indexOf(safeProvider) < 0 || !safeModel || !key || !promptFor(task, identityContext)) {
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
            { text: promptFor(task, identityContext) },
            { inline_data: { mime_type: mimeType, data: base64 } }
          ] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: task === "layout" ? 8192 : 512 }
        })
      };
    }
    return {
      url: MINIMAX_ENDPOINT,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: safeModel,
        messages: [{ role: "user", content: [
          { type: "text", text: promptFor(task, identityContext) },
          { type: "image_url", image_url: { url: image.dataUrl, detail: "low" } }
        ] }],
        reasoning_effort: "low",
        max_completion_tokens: task === "layout" ? 8192 : 2048,
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

  function hasUsableProviderText(provider, response) {
    if (provider === "gemini") {
      var parts = response && response.candidates && response.candidates[0] &&
        response.candidates[0].content && response.candidates[0].content.parts;
      return Array.isArray(parts) && parts.some(function (part) {
        return part && part.thought !== true && typeof part.text === "string" && part.text.trim().length > 0;
      });
    }
    var content = response && response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
    if (typeof content === "string") return content.trim().length > 0;
    return Array.isArray(content) && content.some(function (part) {
      return part && typeof part.text === "string" && part.text.trim().length > 0;
    });
  }

  function hasBudgetExhaustionWithoutText(provider, response) {
    if (hasUsableProviderText(provider, response)) return false;
    if (provider === "gemini") {
      return Boolean(response && response.candidates && response.candidates[0] &&
        response.candidates[0].finishReason === "MAX_TOKENS");
    }
    return Boolean(response && response.choices && response.choices[0] &&
      response.choices[0].finish_reason === "length");
  }

  function budgetExhaustionMessage(task) {
    if (task === "layout") return "AI 用盡回覆額度仍未完成分析（只有思考內容），未套用建議。建議改用 Gemini，或直接手動拉框。";
    if (task === "choice") return "AI 用盡回覆額度仍未完成選擇題分析（只有思考內容），未套用答案建議。";
    if (task === "answerKey") return "AI 用盡回覆額度仍未完成答案表讀取（只有思考內容），未套用答案。";
    if (task === "dictation") return "AI 用盡回覆額度仍未完成默書轉錄（只有思考內容），未套用轉錄建議。";
    if (task === "identity") return "AI 用盡回覆額度仍未完成身份核對（只有思考內容），未套用識別建議。";
    return "AI 用盡回覆額度仍未完成測試（只有思考內容）。";
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

  function parseAnswerKeySuggestion(text, questionCount, allowedOptions) {
    var parsed = parseJsonObject(text);
    if (!parsed || !Array.isArray(parsed.answers)) return { ok: false, message: "AI 答案表回覆格式無效，未套用任何答案。" };
    var count = Math.max(0, Math.min(250, Math.floor(Number(questionCount) || 0)));
    var allowed = Array.from(new Set((allowedOptions || []).map(function (option) { return String(option).trim().toUpperCase(); })));
    var seen = new Set(); var answers = []; var rejectedCount = 0;
    parsed.answers.forEach(function (entry) {
      var question = entry && entry.q;
      var answer = entry && typeof entry.a === "string" ? entry.a.trim().toUpperCase() : "";
      if (!Number.isInteger(question) || question < 1 || question > count || allowed.indexOf(answer) < 0 || seen.has(question)) {
        rejectedCount += 1; return;
      }
      seen.add(question); answers.push({ q: question, a: answer });
    });
    answers.sort(function (first, second) { return first.q - second.q; });
    return { ok: true, answers: answers, rejectedCount: rejectedCount };
  }

  function normalizedSuggestionRect(value) {
    var rect = value && (value.rect || value);
    if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) ||
        rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0 ||
        rect.x + rect.w > 1 || rect.y + rect.h > 1) return null;
    return { left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h,
      x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  }

  function rectsOverlap(first, second) {
    return first.left <= second.right && first.right >= second.left &&
      first.top <= second.bottom && first.bottom >= second.top;
  }

  function parseChoiceLayoutSuggestion(text, identityRects) {
    var parsed = parseJsonObject(text);
    if (!parsed || !Array.isArray(parsed.answerColumns) ||
        (parsed.identityFields != null && !Array.isArray(parsed.identityFields))) {
      return { ok: false, message: "AI 版面回覆格式無效，未套用建議。" };
    }
    var protectedRects = Array.isArray(identityRects) ? identityRects : [];
    var answerColumns = []; var identityFields = []; var rejected = 0; var studentDigitsMismatch = false;
    function isSafeRect(item) {
      var rect = normalizedSuggestionRect(item);
      if (!rect || protectedRects.some(function (protectedRect) { return rectsOverlap(rect, protectedRect); })) return null;
      return rect;
    }
    parsed.answerColumns.slice(0, 40).forEach(function (item) {
      if (!item || ["mc", "tf"].indexOf(item.type) < 0 || !Array.isArray(item.options) ||
          !Number.isInteger(item.rows) || item.rows < 1 || item.rows > 250 ||
          (item.groupSize != null && (!Number.isInteger(item.groupSize) || item.groupSize < 1 || item.groupSize > item.rows)) ||
          ["column-major", "row-major"].indexOf(item.numbering) < 0) { rejected += 1; return; }
      var rect = isSafeRect(item);
      var options = item.options.map(function (option) { return String(option).trim().toUpperCase(); });
      var allowed = item.type === "tf" ? ["T", "F"] : ["A", "B", "C", "D", "E", "F"];
      if (!rect || options.length < 2 || options.length > 6 ||
          options.some(function (option) { return allowed.indexOf(option) < 0; }) ||
          new Set(options).size !== options.length) { rejected += 1; return; }
      answerColumns.push({ type: item.type, rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        options: options, rows: item.rows, groupSize: item.groupSize || 0, numbering: item.numbering });
    });
    (parsed.identityFields || []).slice(0, 20).forEach(function (item) {
      var allowedTypes = ["class-grade-grid", "class-form-grid", "student-number-grid"];
      if (!item || allowedTypes.indexOf(item.type) < 0) { rejected += 1; return; }
      var rect = isSafeRect(item);
      var digits = item.type === "student-number-grid" ? Number(item.digits) : undefined;
      var defaultLabels = item.type === "class-grade-grid" ? ["1", "2", "3", "4", "5", "6"] : ["A", "B", "C", "D", "E", "F"];
      var optionsMissing = item.type !== "student-number-grid" && item.options == null;
      var options = item.type === "student-number-grid" ? undefined :
        (optionsMissing ? defaultLabels.slice() : Array.isArray(item.options) ? item.options.map(function (option) {
          return typeof option === "string" ? option.trim().toUpperCase() : "";
        }) : null);
      var optionsValid = item.type === "class-grade-grid"
        ? options && options.length >= 2 && options.length <= 12 && options.every(function (option) { return /^[1-9]$/.test(option); })
        : item.type === "class-form-grid"
          ? options && options.length >= 2 && options.length <= 12 && options.every(function (option) { return /^[A-Z]$/.test(option); })
          : true;
      if (!rect || identityFields.some(function (previous) {
        return rectsOverlap(rect, normalizedSuggestionRect(previous));
      }) || (item.type === "student-number-grid" && (!Number.isInteger(digits) || digits < 1 || digits > 12 ||
        (digits >= 7 && rect.w < rect.h))) ||
          (item.type !== "student-number-grid" && (!optionsValid || new Set(options).size !== options.length))) {
        if (item.type === "student-number-grid" && Number.isInteger(digits) && digits >= 7 && rect && rect.w < rect.h) {
          studentDigitsMismatch = true;
        }
        rejected += 1; return;
      }
      var field = { type: item.type, rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } };
      if (item.type === "student-number-grid") field.digits = digits;
      else {
        field.options = options;
        if (optionsMissing) field.optionsPendingConfirmation = true;
      }
      identityFields.push(field);
    });
    var safeAnswerColumns = answerColumns.filter(function (column) {
      var rect = normalizedSuggestionRect(column.rect);
      return !identityFields.some(function (field) {
        return rectsOverlap(rect, normalizedSuggestionRect(field.rect));
      });
    });
    rejected += answerColumns.length - safeAnswerColumns.length;
    answerColumns = safeAnswerColumns;
    if (parsed.answerColumns.length > 40 || (parsed.identityFields || []).length > 20) rejected += 1;
    var messageParts = [];
    if (rejected) messageParts.push("已略過 " + rejected + " 個無效或與身份區重疊的項目。");
    if (studentDigitsMismatch) messageParts.push("學號框較窄但回覆位數不少於 7，已略過該欄；請老師手動設定位數。");
    if (identityFields.some(function (field) { return field.optionsPendingConfirmation; })) {
      messageParts.push("缺少班別選項的欄位使用預設值，選項待確認。");
    }
    if (!answerColumns.length && !identityFields.length) {
      return { ok: false, rejectedCount: rejected,
        message: "AI 回覆沒有可用建議；" + (messageParts.join(" ") || "請重新檢查回覆。") };
    }
    return { ok: true, answerColumns: answerColumns, identityFields: identityFields,
      rejectedCount: rejected, message: messageParts.length ? messageParts.join(" ") : "建議位置已生成，請逐項核對。" };
  }

  function parseTranscription(text) {
    var parsed = parseJsonObject(text);
    if (!parsed || typeof parsed.transcription !== "string" || parsed.transcription.length > 3000) {
      return { ok: false, message: "AI 回覆格式無效，未套用任何標記。" };
    }
    return { ok: true, transcription: parsed.transcription };
  }

  function identitySelections(value, allowed) {
    var raw = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
    var rejectedCount = 0;
    var selected = [];
    raw.forEach(function (entry) {
      var option = typeof entry === "string" || typeof entry === "number" ? String(entry).trim().toUpperCase() : "";
      if (!option || allowed.indexOf(option) < 0) { rejectedCount += 1; return; }
      if (selected.indexOf(option) < 0) selected.push(option);
    });
    selected.sort(function (left, right) { return allowed.indexOf(left) - allowed.indexOf(right); });
    return { selected: selected, rejectedCount: rejectedCount };
  }

  function identityDigitSlot(value) {
    if (value == null || value === "") return { value: "", rejectedCount: 0 };
    var parsed = identitySelections(value, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    if (Array.isArray(value) && value.length > 1) return { value: parsed.selected, rejectedCount: parsed.rejectedCount };
    return { value: parsed.selected[0] || "", rejectedCount: parsed.rejectedCount };
  }

  function parseIdentitySuggestion(text, context) {
    var parsed = parseJsonObject(text);
    var settings = context || {};
    if (!parsed) return { ok: false, message: "AI 回覆格式無效，未套用身份建議。" };
    if (settings.mode === "grid") {
      var key = settings.fieldType === "class-grade-grid" ? "classGrade" :
        settings.fieldType === "class-form-grid" ? "classForm" :
          settings.fieldType === "student-number-grid" ? "studentNumber" : "";
      if (!key) return { ok: false, message: "身份圈格類型無效，未套用建議。" };
      if (!Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) {
        return { ok: false, message: "AI 身份圈格回覆缺少有效信心值，未套用建議。" };
      }
      if (settings.fieldType === "student-number-grid") {
        if (!Array.isArray(parsed.studentNumber) || parsed.studentNumber.length !== Number(settings.digits) ||
            !Number.isInteger(Number(settings.digits)) || Number(settings.digits) < 1 || Number(settings.digits) > 12) {
          return { ok: false, message: "AI 學號圈格回覆位數不符，未套用建議。" };
        }
        var slots = parsed.studentNumber.map(identityDigitSlot);
        return { ok: true, studentNumber: slots.map(function (slot) { return slot.value; }), confidence: parsed.confidence,
          rejectedCount: slots.reduce(function (total, slot) { return total + slot.rejectedCount; }, 0) };
      }
      var allowed = Array.isArray(settings.options) ? settings.options.map(function (option) { return String(option).toUpperCase(); }) : [];
      if (!allowed.length) return { ok: false, message: "範本身份選項未能確認，未套用建議。" };
      var selections = identitySelections(parsed[key], allowed);
      var output = { ok: true, confidence: parsed.confidence, rejectedCount: selections.rejectedCount };
      output[key] = selections.selected.length === 1 ? selections.selected[0] : selections.selected;
      return output;
    }
    if (settings.mode === "handwriting" && settings.fieldType === "class-handwrite") {
      var classValue = typeof parsed.handwrittenClass === "string" ? parsed.handwrittenClass.trim().toUpperCase() : "";
      return { ok: true, handwrittenClass: /^[1-9][A-Z]$/.test(classValue) ? classValue : "",
        rejectedCount: classValue && !/^[1-9][A-Z]$/.test(classValue) ? 1 : 0 };
    }
    if (settings.mode === "handwriting" && settings.fieldType === "student-handwrite") {
      var numberValue = typeof parsed.handwrittenNumber === "string" ? parsed.handwrittenNumber.trim() : "";
      return { ok: true, handwrittenNumber: /^\d{1,3}$/.test(numberValue) ? numberValue : "",
        rejectedCount: numberValue && !/^\d{1,3}$/.test(numberValue) ? 1 : 0 };
    }
    return { ok: false, message: "身份核對類型無效，未套用建議。" };
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

  function parseProviderResponse(provider, task, response, allowedOptions, identityContext) {
    var text = extractProviderText(provider, response);
    if (task === "choice") return parseChoiceSuggestion(text, allowedOptions || ["A", "B", "C", "D", "T", "F"]);
    if (task === "answerKey") return parseAnswerKeySuggestion(text, identityContext && identityContext.questionCount,
      identityContext && identityContext.allowedOptions);
    if (task === "layout") return parseChoiceLayoutSuggestion(text, allowedOptions || []);
    if (task === "identity") return parseIdentitySuggestion(text, identityContext);
    if (task === "dictation") return parseTranscription(text);
    return parseTestResponse(text);
  }

  function responseError(status) {
    if (status === 401 || status === 403) return "API key 無效或未獲授權（HTTP " + status + "）。";
    if (status === 429) return "服務繁忙或用量受限（HTTP 429），請稍後再試。";
    return "AI 服務回應錯誤（HTTP " + status + "）。";
  }

  async function request(provider, model, apiKey, task, image, allowedOptions, fetchImpl, identityContext) {
    var requestInfo;
    try {
      requestInfo = buildProviderRequest(provider, model, apiKey, task, image, identityContext);
    } catch (error) {
      return { ok: false, message: error && error.message || "AI 覆核設定不完整。" };
    }
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutMs = task === "layout" ? 120000 : 30000;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
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
      if (hasBudgetExhaustionWithoutText(provider, value)) {
        return { ok: false, message: budgetExhaustionMessage(task) };
      }
      try { return parseProviderResponse(provider, task, value, allowedOptions, identityContext); } catch (error) {
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
    identityGridBounds: identityGridBounds,
    identityHandwriteBounds: identityHandwriteBounds,
    assertIdentityCropSafe: assertIdentityCropSafe,
    createIdentityCrop: createIdentityCrop,
    createMaskedLayoutImage: createMaskedLayoutImage,
    buildProviderRequest: buildProviderRequest,
    parseJsonObject: parseJsonObject,
    parseChoiceSuggestion: parseChoiceSuggestion,
    parseAnswerKeySuggestion: parseAnswerKeySuggestion,
    parseChoiceLayoutSuggestion: parseChoiceLayoutSuggestion,
    parseIdentitySuggestion: parseIdentitySuggestion,
    parseTranscription: parseTranscription,
    parseTestResponse: parseTestResponse,
    parseProviderResponse: parseProviderResponse,
    alignDictationTranscription: alignDictationTranscription,
    request: request
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PdfMarkingAiReview;
})(typeof window !== "undefined" ? window : globalThis);
