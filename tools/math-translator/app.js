const SAMPLE_TEXT = "Let f(x) = x^2 + 2x + 1. Suppose f is differentiable on \\mathbb{R}. Then, for every x \\in \\mathbb{R}, we have\n\\[\nf'(x) = 2x + 2.\n\\]\nTherefore, the minimum value of f is attained at x = -1, where f(-1) = 0.";

const MATH_ENVIRONMENTS = new Set(["equation", "equation*", "align", "align*", "aligned", "gather", "gather*"]);

const phraseGlossary = {
  "zh-Hant": [
    [/The minimum value of f is attained at x = -1, where f\(-1\) = 0\./gi, "函數 f 的最小值在 x = -1 取得，其中 f(-1) = 0。"],
    [/is differentiable on/gi, "可微於"],
    [/then,/gi, "則，"],
    [/therefore,/gi, "因此，"],
    [/if and only if/gi, "若且唯若"],
    [/it follows that/gi, "由此可得"],
    [/let us consider/gi, "考慮"],
    [/random variable/gi, "隨機變數"],
    [/real numbers?/gi, "實數"],
    [/natural numbers?/gi, "自然數"],
    [/integers?/gi, "整數"],
    [/eigenvectors?/gi, "特徵向量"],
    [/eigenvalues?/gi, "特徵值"],
    [/minimum value/gi, "最小值"],
    [/maximum value/gi, "最大值"],
    [/is differentiable/gi, "可微"],
    [/is continuous/gi, "連續"],
    [/is defined/gi, "定義為"],
    [/is attained/gi, "取得"],
    [/we obtain/gi, "可得"],
    [/we conclude/gi, "因此可得"],
    [/we have/gi, "有"],
    [/for every/gi, "對每個"],
    [/for all/gi, "對所有"],
    [/such that/gi, "使得"],
    [/therefore/gi, "因此"],
    [/hence/gi, "故"],
    [/suppose/gi, "假設"],
    [/assume/gi, "假設"],
    [/where/gi, "其中"],
    [/because/gi, "因為"],
    [/since/gi, "由於"],
    [/theorem/gi, "定理"],
    [/lemma/gi, "引理"],
    [/definition/gi, "定義"],
    [/proof/gi, "證明"],
    [/solution/gi, "解"],
    [/example/gi, "例"],
    [/function/gi, "函數"],
    [/domain/gi, "定義域"],
    [/range/gi, "值域"],
    [/matrix|matrices/gi, "矩陣"],
    [/vectors?/gi, "向量"],
    [/derivatives?/gi, "導數"],
    [/differentiation/gi, "求導法"],
    [/integrals?/gi, "積分"],
    [/limits?/gi, "極限"],
    [/probability/gi, "機率"],
    [/is equal to/gi, "等於"],
    [/is less than/gi, "小於"],
    [/is greater than/gi, "大於"],
    [/let/gi, "令"],
    [/then/gi, "則"],
    [/if/gi, "若"]
  ],
  en: [
    [/理解/g, "Understand"],
    [/若且唯若/g, "if and only if"],
    [/由此可得/g, "it follows that"],
    [/考慮/g, "Let us consider"],
    [/隨機變數/g, "random variable"],
    [/實數/g, "real numbers"],
    [/自然數/g, "natural numbers"],
    [/整數/g, "integers"],
    [/特徵向量/g, "eigenvectors"],
    [/特徵值/g, "eigenvalues"],
    [/最小值/g, "minimum value"],
    [/最大值/g, "maximum value"],
    [/可微/g, "differentiable"],
    [/連續/g, "continuous"],
    [/定義為/g, "is defined"],
    [/取得/g, "is attained"],
    [/可得/g, "we obtain"],
    [/對每個/g, "for every"],
    [/對所有/g, "for all"],
    [/使得/g, "such that"],
    [/因此/g, "therefore"],
    [/故/g, "hence"],
    [/假設/g, "Suppose"],
    [/其中/g, "where"],
    [/因為/g, "because"],
    [/由於/g, "since"],
    [/定理/g, "theorem"],
    [/引理/g, "lemma"],
    [/定義/g, "definition"],
    [/證明/g, "proof"],
    [/^解(?=\s|[\n：:，。；,.;]|$)/gm, "solution"],
    [/^例(?=\s|[\n：:，。；,.;]|$)/gm, "example"],
    [/函數/g, "function"],
    [/定義域/g, "domain"],
    [/值域/g, "range"],
    [/矩陣/g, "matrix"],
    [/向量/g, "vectors"],
    [/導數/g, "derivative"],
    [/求導法/g, "differentiation"],
    [/積分/g, "integral"],
    [/極限/g, "limit"],
    [/機率/g, "probability"],
    [/等於/g, "is equal to"],
    [/小於/g, "is less than"],
    [/大於/g, "is greater than"],
    [/^令(?=\s|[\n：:，。；,.;]|$)/gm, "Let"],
    [/^則(?=\s|[\n：:，。；,.;]|$)/gm, "Then"],
    [/^若(?=\s|[\n：:，。；,.;]|$)/gm, "If"]
  ]
};

const extraPhraseGlossary = window.MATH_DRIVE_PHRASES || {};
Object.keys(extraPhraseGlossary).forEach(function (language) {
  if (!Array.isArray(extraPhraseGlossary[language])) return;
  if (!phraseGlossary[language]) phraseGlossary[language] = [];
  phraseGlossary[language].unshift(...extraPhraseGlossary[language]);
});

const glossary = window.MATH_GLOSSARY || { meta: {}, entries: [] };
const glossaryMeta = glossary.meta || {};
const glossaryLabel = glossaryMeta.uiLabel || "出版社詞庫";
const driveSample = window.MATH_DRIVE_SAMPLE || null;
const glossaryEntries = Array.isArray(glossary.entries) ? glossary.entries : [];

const sourceText = document.querySelector("#sourceText");
const outputText = document.querySelector("#outputText");
const sourceStats = document.querySelector("#sourceStats");
const outputStats = document.querySelector("#outputStats");
const outputStatus = document.querySelector("#outputStatus");
const fileStatus = document.querySelector("#fileStatus");
const sourceLanguage = document.querySelector("#sourceLanguage");
const targetLanguage = document.querySelector("#targetLanguage");
const translationMode = document.querySelector("#translationMode");
const translateButton = document.querySelector("#translateButton");
const fileInput = document.querySelector("#fileInput");
const dropzone = document.querySelector("#dropzone");
const googleDocsUrl = document.querySelector("#googleDocsUrl");
const importGoogleDocsButton = document.querySelector("#importGoogleDocs");
const driveSampleButton = document.querySelector("#loadDriveSample");
const driveSampleLabel = document.querySelector("#driveSampleLabel");
const sourceFolderLink = document.querySelector("#sourceFolderLink");
const copyOutput = document.querySelector("#copyOutput");
const downloadOutput = document.querySelector("#downloadOutput");
const toast = document.querySelector("#toast");
const serviceStatus = document.querySelector("#serviceStatus");
const workspaceNoteText = document.querySelector("#workspaceNoteText");
const termSearch = document.querySelector("#termSearch");
const termCategory = document.querySelector("#termCategory");
const termPublisher = document.querySelector("#termPublisher");
const resetTermFilters = document.querySelector("#resetTermFilters");
const termCount = document.querySelector("#termCount");
const termFilterNote = document.querySelector("#termFilterNote");
const termList = document.querySelector("#termList");
const termsEmpty = document.querySelector("#termsEmpty");
const heroDescription = document.querySelector("#heroDescription");
const termsTitle = document.querySelector("#terms-title");
const termsDescription = document.querySelector("#termsDescription");

let translatedValue = "";
let activeFileName = "";
let toastTimer;
let backendState = {
  openai: { configured: false, model: "gpt-5.6-sol" },
  local: { configured: false, model: "" }
};

function countCharacters(value) {
  return Array.from(value || "").length;
}

function updateSourceState() {
  const value = sourceText.value;
  const count = countCharacters(value);
  sourceStats.textContent = count.toLocaleString("zh-Hant-TW") + " 字元";
  dropzone.classList.toggle("has-content", Boolean(value.trim()));
}

function updateOutputState() {
  const count = countCharacters(translatedValue);
  outputStats.textContent = count.toLocaleString("zh-Hant-TW") + " 字元";
}

function escapeHtml(value) {
  return value.replace(/[&<>\"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[character];
  });
}

function renderMathAwareText(value) {
  return scanMath(value)
    .map(function (part) {
      const safePart = escapeHtml(part.value);
      return part.math ? "<span class=\"formula\">" + safePart + "</span>" : safePart;
    })
    .join("");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isEscaped(value, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function findUnescaped(value, needle, start) {
  let index = value.indexOf(needle, start);
  while (index >= 0) {
    if (!isEscaped(value, index)) return index;
    index = value.indexOf(needle, index + 1);
  }
  return -1;
}

function findBalancedEnd(value, start, opening, closing) {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === opening && !isEscaped(value, index)) depth += 1;
    if (value[index] === closing && !isEscaped(value, index)) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function bareTexEnd(value, index) {
  if (value[index] !== "\\" || isEscaped(value, index)) return -1;
  const command = value.slice(index).match(/^\\([A-Za-z]+)(\*)?/);
  if (!command || command[1] === "begin" || command[1] === "end") return -1;
  let cursor = index + command[0].length;
  while (cursor < value.length) {
    while (value[cursor] === " " || value[cursor] === "\t") cursor += 1;
    if (value[cursor] !== "{" && value[cursor] !== "[") break;
    const closing = value[cursor] === "{" ? "}" : "]";
    const groupEnd = findBalancedEnd(value, cursor, value[cursor], closing);
    if (groupEnd < 0) break;
    cursor = groupEnd;
  }
  return cursor;
}

function mathEndAt(value, index) {
  if (isEscaped(value, index)) return -1;
  if (value.startsWith("$$", index)) {
    const end = findUnescaped(value, "$$", index + 2);
    return end >= 0 ? end + 2 : -1;
  }
  if (value[index] === "$") {
    const end = findUnescaped(value, "$", index + 1);
    return end >= 0 && !value.slice(index + 1, end).includes("\n") ? end + 1 : -1;
  }
  const delimiter = value.startsWith("\\[", index) ? "\\]"
    : value.startsWith("\\(", index) ? "\\)"
      : "";
  if (delimiter) {
    const end = findUnescaped(value, delimiter, index + 2);
    return end >= 0 ? end + delimiter.length : -1;
  }
  const environment = value.slice(index).match(/^\\begin\{([^}\r\n]+)\}/);
  if (environment && MATH_ENVIRONMENTS.has(environment[1])) {
    const closing = "\\end{" + environment[1] + "}";
    const end = findUnescaped(value, closing, index + environment[0].length);
    return end >= 0 ? end + closing.length : -1;
  }
  return bareTexEnd(value, index);
}

function scanMath(value) {
  const parts = [];
  let textStart = 0;
  let index = 0;
  while (index < value.length) {
    if (value.startsWith("$$", index) && !isEscaped(value, index) && findUnescaped(value, "$$", index + 2) < 0) {
      index += 2;
      continue;
    }
    const end = mathEndAt(value, index);
    if (end > index) {
      if (textStart < index) parts.push({ math: false, value: value.slice(textStart, index) });
      parts.push({ math: true, value: value.slice(index, end) });
      index = end;
      textStart = index;
      continue;
    }
    index += 1;
  }
  if (textStart < value.length) parts.push({ math: false, value: value.slice(textStart) });
  return parts;
}

function applyPublisherGlossary(segment, target) {
  const sourceIsEnglish = target === "zh-Hant";
  return glossaryEntries
    .slice()
    .sort(function (left, right) {
      const leftLength = sourceIsEnglish ? left.sourceTerm.length : left.preferred.length;
      const rightLength = sourceIsEnglish ? right.sourceTerm.length : right.preferred.length;
      return rightLength - leftLength;
    })
    .reduce(function (result, entry) {
      const source = sourceIsEnglish ? entry.sourceTerm : entry.preferred;
      const replacement = sourceIsEnglish ? entry.preferred : entry.sourceTerm;
      if (!source || !replacement || (!sourceIsEnglish && source.length < 2)) return result;
      const flags = sourceIsEnglish ? "gi" : "g";
      return result.replace(new RegExp(escapeRegExp(source), flags), replacement);
    }, segment);
}

function translateSegment(segment, target) {
  const phraseTranslated = (phraseGlossary[target] || []).reduce(function (result, entry) {
    return result.replace(entry[0], entry[1]);
  }, segment);
  const translated = target === "en"
    ? applyPublisherGlossary(phraseTranslated, target)
    : (phraseGlossary[target] || []).reduce(function (result, entry) {
        return result.replace(entry[0], entry[1]);
      }, applyPublisherGlossary(segment, target));
  return target === "en"
    ? translated
        .replace(/：/g, ": ")
        .replace(/。/g, ".")
        .replace(/，/g, ", ")
        .replace(/、/g, ", ")
        .replace(/　/g, " ")
        .replace(/及/g, "and")
        .replace(/—/g, " — ")
    : translated
        .replace(/([，。；：])\s+/g, "$1")
        .replace(/\s+([，。；])/g, "$1");
}

function translateDocument(value, target) {
  return scanMath(value)
    .map(function (part) {
      return part.math ? part.value : translateSegment(part.value, target);
    })
    .join("");
}

function renderOutput(value) {
  translatedValue = value;
  outputText.classList.remove("empty");
  outputText.innerHTML = "<div class=\"output-content\">" + renderMathAwareText(value) + "</div>";
  copyOutput.disabled = !value;
  downloadOutput.disabled = !value;
  updateOutputState();
}

function resetOutput() {
  translatedValue = "";
  outputText.className = "output-body empty";
  outputText.innerHTML = "<div class=\"empty-state\"><div class=\"empty-glyph\">∴</div><strong>翻譯結果會出現在這裡</strong><span>貼上原文後，按下中央的翻譯按鈕。</span></div>";
  outputStatus.textContent = "等待翻譯";
  copyOutput.disabled = true;
  downloadOutput.disabled = true;
  updateOutputState();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(function () {
    toast.classList.remove("visible");
  }, 2700);
}

function updateFileStatus(label, isLoaded) {
  fileStatus.innerHTML = "<span class=\"file-status-dot" + (isLoaded ? " accent-dot" : "") + "\"></span>" + escapeHtml(label);
}

function setSample(value, source, target, fileName, message) {
  sourceLanguage.value = source;
  targetLanguage.value = target;
  sourceText.value = value;
  activeFileName = fileName;
  updateSourceState();
  updateFileStatus(fileName, true);
  resetOutput();
  sourceText.focus();
  showToast(message);
}

function setImportedSource(value, fileName, message, warning) {
  sourceText.value = value;
  activeFileName = fileName;
  updateSourceState();
  updateFileStatus(fileName, true);
  resetOutput();
  if (warning) outputStatus.textContent = "已載入 · 請覆核文件提取結果";
  showToast(message + (warning ? " " + warning : ""));
  sourceText.focus();
}

function applyGlossaryPresentation() {
  if (heroDescription && glossaryMeta.heroText) heroDescription.textContent = glossaryMeta.heroText;
  if (workspaceNoteText && glossaryMeta.workspaceText) workspaceNoteText.textContent = glossaryMeta.workspaceText;
  if (termsTitle && glossaryMeta.termsTitle) termsTitle.textContent = glossaryMeta.termsTitle;
  if (termsDescription && glossaryMeta.termsDescription) termsDescription.textContent = glossaryMeta.termsDescription;
  if (termFilterNote && glossaryMeta.filterNote) termFilterNote.textContent = glossaryMeta.filterNote;

  if (driveSampleButton) {
    driveSampleButton.hidden = !driveSample || typeof driveSample.text !== "string";
  }
  if (driveSampleLabel && driveSample && driveSample.label) driveSampleLabel.textContent = driveSample.label;
  if (sourceFolderLink) {
    const sourceUrl = driveSample && typeof driveSample.sourceUrl === "string" ? driveSample.sourceUrl : "";
    sourceFolderLink.hidden = !sourceUrl;
    if (sourceUrl) {
      sourceFolderLink.href = sourceUrl;
      if (driveSample.sourceLabel) sourceFolderLink.setAttribute("aria-label", driveSample.sourceLabel);
    } else {
      sourceFolderLink.removeAttribute("href");
    }
  }
}

function wait(milliseconds) {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, milliseconds);
  });
}

async function requestAiTranslation(value) {
  if (window.location.protocol === "file:") {
    throw new Error("AI 模式需要透過本地伺服器開啟工具。");
  }

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "translation",
      provider: translationMode && translationMode.value === "local" ? "local" : "openai",
      sourceText: value,
      sourceLanguage: sourceLanguage.value,
      targetLanguage: targetLanguage.value
    })
  });
  const data = await response.json().catch(function () {
    return {};
  });
  if (!response.ok) {
    throw new Error(data.error || "AI 翻譯服務暫時不可用。");
  }
  if (!data.translation) {
    throw new Error("AI 翻譯服務沒有回傳文字。");
  }
  return data.translation;
}

function selectedModelLabel() {
  if (translationMode && translationMode.value === "local") {
    return backendState.local.model ? "Local LLM · " + backendState.local.model : "Local LLM";
  }
  return backendState.openai.model || "gpt-5.6-sol";
}

function updateTranslationMode() {
  if (!translationMode) return;
  const isCloudAi = translationMode.value === "ai";
  const isLocalAi = translationMode.value === "local";
  const isModelMode = isCloudAi || isLocalAi;
  const selectedBackend = isLocalAi ? backendState.local : backendState.openai;
  if (workspaceNoteText) {
    workspaceNoteText.textContent = isCloudAi
      ? "GPT-5.6-sol 模式：文字會送到本地伺服器，再由 Responses API 處理；公式先保護，沒有服務時自動回到" + glossaryLabel + "。"
      : isLocalAi
        ? "Local LLM 模式：文件只會送到你設定的本機 OpenAI-compatible endpoint，不會送到 OpenAI；公式先保護，服務不可用時回到" + glossaryLabel + "。"
        : "目前為離線示範模式：內建" + glossaryLabel + "會翻譯常見術語，辨識到的數學公式與 LaTeX 指令保持原樣。";
  }
  if (serviceStatus && isModelMode) {
    serviceStatus.textContent = selectedBackend.configured
      ? selectedModelLabel() + " 已設定"
      : selectedModelLabel() + " 待設定";
  } else if (serviceStatus) {
    serviceStatus.textContent = "離線可用";
  }
}

async function checkApiService() {
  if (window.location.protocol === "file:" || !serviceStatus) return;
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();
    backendState = {
      openai: {
        configured: Boolean(response.ok && data.openai && data.openai.configured),
        model: data.openai && data.openai.model ? data.openai.model : "gpt-5.6-sol"
      },
      local: {
        configured: Boolean(response.ok && data.local && data.local.configured),
        model: data.local && data.local.model ? data.local.model : ""
      }
    };
  } catch {
    backendState = {
      openai: { configured: false, model: "gpt-5.6-sol" },
      local: { configured: false, model: "" }
    };
  }
  updateTranslationMode();
}

async function runTranslation() {
  const value = sourceText.value.trim();
  if (!value) {
    sourceText.focus();
    showToast("請先貼上或匯入一份數學文件。");
    return;
  }

  translateButton.disabled = true;
  translateButton.querySelector(".translate-button-label").textContent = "處理中";
  const useModel = translationMode && ["ai", "local"].includes(translationMode.value);
  const modelLabel = selectedModelLabel();
  outputStatus.textContent = useModel ? modelLabel + " 正在處理…" : "正在保護公式…";

  try {
    let translated;
    let usedFallback = false;
    if (useModel) {
      try {
        translated = await requestAiTranslation(sourceText.value);
      } catch (error) {
        translated = translateDocument(sourceText.value, targetLanguage.value);
        usedFallback = true;
        showToast(modelLabel + " 未完成，已改用" + glossaryLabel + " fallback；請覆核或按翻譯重試。");
      }
    } else {
      await wait(260);
      translated = translateDocument(sourceText.value, targetLanguage.value);
    }
    renderOutput(translated);
    outputStatus.textContent = usedFallback
      ? "AI 失敗 · " + glossaryLabel + " fallback（請覆核）"
      : useModel
        ? "已完成 · " + modelLabel
        : "已完成 · " + targetLanguage.options[targetLanguage.selectedIndex].text;
    if (!usedFallback) {
      showToast(useModel ? modelLabel + " 翻譯完成，公式已保持原樣。" : "翻譯完成，公式已保持原樣。");
    }
  } finally {
    translateButton.disabled = false;
    translateButton.querySelector(".translate-button-label").textContent = "翻譯";
  }
}

function fileExtension(fileName) {
  const match = String(fileName || "").toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

async function requestExtraction(payload) {
  if (window.location.protocol === "file:") {
    throw new Error("DOCX、PDF 及 Google Docs 匯入需要先以 npm start 啟動本地伺服器。");
  }
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(function () {
    return {};
  });
  if (!response.ok) throw new Error(data.error || "文件提取服務暫時不可用。");
  if (!data || typeof data.text !== "string") throw new Error("文件提取服務沒有回傳文字。");
  return data;
}

async function extractRichFile(file) {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("DOCX 或 PDF 文件不能超過 20 MB，請分拆後再試。");
  }
  updateFileStatus("正在提取 " + file.name + "…", false);
  outputStatus.textContent = "正在提取文件文字…";
  const data = await requestExtraction({
    kind: "file",
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    data: arrayBufferToBase64(await file.arrayBuffer())
  });
  const warning = Array.isArray(data.warnings) && data.warnings.length ? data.warnings[0] : "";
  setImportedSource(data.text, file.name, "已提取 " + file.name + " 的文字。", warning);
}

async function loadTextFile(file) {
  if (!file) return;
  const extension = fileExtension(file.name);
  const plainTextFile = [".txt", ".md", ".tex"].includes(extension) || file.type.startsWith("text/");
  const richTextFile = [".docx", ".pdf"].includes(extension);
  if (!plainTextFile && !richTextFile) {
    showToast("目前支援 TXT、MD、TEX、DOCX 及 PDF 文件。");
    return;
  }

  if (richTextFile) {
    try {
      await extractRichFile(file);
    } catch (error) {
      updateFileStatus("文件提取失敗", false);
      outputStatus.textContent = "匯入失敗 · 請覆核設定";
      showToast(error.message || "文件提取失敗，請再試一次。");
    }
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", function () {
    setImportedSource(String(reader.result || ""), file.name, "已載入 " + file.name + "。", "");
  });
  reader.addEventListener("error", function () {
    showToast("文件讀取失敗，請再試一次。");
  });
  reader.readAsText(file);
}

async function importGoogleDocument() {
  const sourceUrl = googleDocsUrl ? googleDocsUrl.value.trim() : "";
  if (!sourceUrl) {
    googleDocsUrl?.focus();
    showToast("請先貼上 Google Docs 連結。");
    return;
  }
  if (importGoogleDocsButton) importGoogleDocsButton.disabled = true;
  updateFileStatus("正在匯入 Google Docs…", false);
  outputStatus.textContent = "正在匯出 Google Docs…";
  try {
    const data = await requestExtraction({ kind: "google-docs", sourceUrl });
    const warning = Array.isArray(data.warnings) && data.warnings.length ? data.warnings[0] : "";
    setImportedSource(data.text, data.fileName || "Google Docs", "已匯入 Google Docs。", warning);
  } catch (error) {
    updateFileStatus("Google Docs 匯入失敗", false);
    outputStatus.textContent = "匯入失敗 · 請覆核分享權限";
    showToast(error.message || "Google Docs 匯入失敗，請確認連結可供檢視。");
  } finally {
    if (importGoogleDocsButton) importGoogleDocsButton.disabled = false;
  }
}

function swapLanguages() {
  const currentSource = sourceLanguage.value;
  sourceLanguage.value = targetLanguage.value;
  targetLanguage.value = currentSource;
  showToast("語言已交換：" + sourceLanguage.options[sourceLanguage.selectedIndex].text + " → " + targetLanguage.options[targetLanguage.selectedIndex].text);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
}

async function copyTranslatedText() {
  if (!translatedValue) return;
  await copyText(translatedValue);
  showToast("翻譯結果已複製到剪貼簿。");
}

function populateTermFilters() {
  if (!termCategory || !termPublisher) return;
  const categories = Array.from(new Set(glossaryEntries.map(function (entry) {
    return entry.category;
  }).filter(Boolean))).sort();
  const publishers = Array.from(new Set(glossaryEntries.flatMap(function (entry) {
    return entry.publishers || [];
  }))).sort();

  termCategory.innerHTML = '<option value="all">所有分類</option>' + categories.map(function (category) {
    return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + "</option>";
  }).join("");
  termPublisher.innerHTML = '<option value="all">所有來源</option>' + publishers.map(function (publisher) {
    return '<option value="' + escapeHtml(publisher) + '">' + escapeHtml(publisher) + "</option>";
  }).join("");
}

function termMatches(entry, query, category, publisher) {
  const haystack = [
    entry.sourceTerm,
    entry.preferred,
    ...(entry.aliases || []),
    entry.note,
    entry.sourceLabel,
    ...(entry.publishers || []),
    ...(entry.levels || [])
  ].join(" ").toLocaleLowerCase("zh-Hant");
  const matchesQuery = !query || haystack.includes(query);
  const matchesCategory = category === "all" || entry.category === category;
  const matchesPublisher = publisher === "all" || (entry.publishers || []).includes(publisher);
  return matchesQuery && matchesCategory && matchesPublisher;
}

function renderTermCard(entry) {
  const aliases = (entry.aliases || []).filter(function (alias) {
    return alias !== entry.preferred && alias !== entry.sourceTerm;
  }).slice(0, 3);
  const aliasMarkup = aliases.length
    ? '<div class="term-aliases">變體：' + escapeHtml(aliases.join(" · ")) + "</div>"
    : "";
  const publisherMarkup = (entry.publishers || []).map(escapeHtml).join(" · ");
  const levelMarkup = (entry.levels || []).map(escapeHtml).join("／");
  const sourceLinkMarkup = entry.sourceUrl
    ? '<a href="' + escapeHtml(entry.sourceUrl) + '" target="_blank" rel="noreferrer">來源 ↗</a>'
    : "";
  return [
    '<article class="term-card">',
    '<div class="term-card-top"><span class="term-category">' + escapeHtml(entry.category) + '</span><span class="term-confidence">' + escapeHtml(entry.confidence || "待核對") + '</span></div>',
    '<div class="term-pair"><span class="term-english">' + escapeHtml(entry.sourceTerm) + '</span><b aria-hidden="true">→</b><strong>' + escapeHtml(entry.preferred) + '</strong></div>',
    '<p class="term-note">' + escapeHtml(entry.note || glossaryMeta.noteLabel || "按上下文核對 house style。") + "</p>",
    aliasMarkup,
    '<div class="term-card-meta"><span>' + publisherMarkup + '</span><span>' + levelMarkup + '</span></div>',
    '<div class="term-card-actions"><button type="button" data-term-action="use" data-term-id="' + escapeHtml(entry.id) + '">套用到工作區</button><button type="button" data-term-action="copy" data-term-id="' + escapeHtml(entry.id) + '">複製中文</button>' + sourceLinkMarkup + '</div>',
    '</article>'
  ].join("");
}

function renderTermLibrary() {
  if (!termList) return;
  const query = (termSearch ? termSearch.value : "").trim().toLocaleLowerCase("zh-Hant");
  const category = termCategory ? termCategory.value : "all";
  const publisher = termPublisher ? termPublisher.value : "all";
  const filtered = glossaryEntries.filter(function (entry) {
    return termMatches(entry, query, category, publisher);
  });

  termList.innerHTML = filtered.map(renderTermCard).join("");
  if (termCount) termCount.textContent = filtered.length.toLocaleString("zh-Hant-TW");
  if (termFilterNote) {
    termFilterNote.textContent = filtered.length === glossaryEntries.length
      ? (glossaryMeta.filterNote || "按分類、年級和信心標籤整理")
      : "目前顯示 " + filtered.length + " 條相符詞條";
  }
  if (termsEmpty) termsEmpty.hidden = filtered.length > 0;
}

function applyTermToWorkspace(entry) {
  const term = sourceLanguage.value === "zh-Hant" ? entry.preferred : entry.sourceTerm;
  const current = sourceText.value.trimEnd();
  sourceText.value = current ? current + "\n" + term : term;
  activeFileName = "";
  updateSourceState();
  updateFileStatus("已套用詞條", true);
  resetOutput();
  document.querySelector("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  sourceText.focus();
  showToast("已套用：「" + term + "」到工作區。");
}

function handleTermAction(event) {
  const actionButton = event.target.closest("button[data-term-action]");
  if (!actionButton) return;
  const entry = glossaryEntries.find(function (item) {
    return item.id === actionButton.dataset.termId;
  });
  if (!entry) return;
  if (actionButton.dataset.termAction === "use") {
    applyTermToWorkspace(entry);
  } else if (actionButton.dataset.termAction === "copy") {
    copyText(entry.preferred).then(function () {
      showToast("已複製：「" + entry.preferred + "」。");
    });
  }
}

function downloadTranslatedText() {
  if (!translatedValue) return;
  const baseName = (activeFileName || "math-translation").replace(/\\.[^.]+$/, "");
  const blob = new Blob([translatedValue], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = baseName + ".translated.md";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showToast("翻譯結果已下載為 Markdown。");
}

document.querySelector("#loadSample").addEventListener("click", function () {
  setSample(SAMPLE_TEXT, "en", "zh-Hant", "calculus-example.tex", "已載入微積分 LaTeX 示例。");
});

if (driveSampleButton) {
  driveSampleButton.addEventListener("click", function () {
    if (!driveSample || typeof driveSample.text !== "string") return;
    setSample(
      driveSample.text,
      driveSample.sourceLanguage || "en",
      driveSample.targetLanguage || "zh-Hant",
      driveSample.fileName || "mathlingo-example.tex",
      driveSample.message || "已載入示例。"
    );
  });
}

document.querySelector("#clearAll").addEventListener("click", function () {
  sourceText.value = "";
  activeFileName = "";
  updateSourceState();
  updateFileStatus("尚未載入文件", false);
  resetOutput();
  showToast("工作區已清除。");
});

document.querySelector("#openFile").addEventListener("click", function () {
  fileInput.click();
});

fileInput.addEventListener("change", function (event) {
  loadTextFile(event.target.files[0]);
  fileInput.value = "";
});

if (importGoogleDocsButton) {
  importGoogleDocsButton.addEventListener("click", importGoogleDocument);
}

translateButton.addEventListener("click", runTranslation);
document.querySelector("#swapLanguages").addEventListener("click", swapLanguages);
copyOutput.addEventListener("click", copyTranslatedText);
downloadOutput.addEventListener("click", downloadTranslatedText);
if (translationMode) {
  translationMode.addEventListener("change", updateTranslationMode);
}
if (termSearch) termSearch.addEventListener("input", renderTermLibrary);
if (termCategory) termCategory.addEventListener("change", renderTermLibrary);
if (termPublisher) termPublisher.addEventListener("change", renderTermLibrary);
if (resetTermFilters) {
  resetTermFilters.addEventListener("click", function () {
    termSearch.value = "";
    termCategory.value = "all";
    termPublisher.value = "all";
    renderTermLibrary();
  });
}
if (termList) termList.addEventListener("click", handleTermAction);

sourceText.addEventListener("input", function () {
  if (activeFileName) {
    activeFileName = "";
    updateFileStatus("已編輯的文件", true);
  }
  updateSourceState();
  if (translatedValue) resetOutput();
});

["dragenter", "dragover"].forEach(function (eventName) {
  dropzone.addEventListener(eventName, function (event) {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach(function (eventName) {
  dropzone.addEventListener(eventName, function (event) {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
});

dropzone.addEventListener("drop", function (event) {
  loadTextFile(event.dataTransfer.files[0]);
});

document.addEventListener("keydown", function (event) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    runTranslation();
  }
});

applyGlossaryPresentation();
populateTermFilters();
renderTermLibrary();
updateTranslationMode();
checkApiService();
updateSourceState();
updateOutputState();
