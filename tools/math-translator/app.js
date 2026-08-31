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
const examplesLibrary = window.MATH_EXAMPLES || { meta: {}, entries: [] };
const examplesMeta = examplesLibrary.meta || {};
const exampleEntries = Array.isArray(examplesLibrary.entries) ? examplesLibrary.entries : [];

const sourceText = document.querySelector("#sourceText");
const outputText = document.querySelector("#outputText");
const sourceStats = document.querySelector("#sourceStats");
const outputStats = document.querySelector("#outputStats");
const outputStatus = document.querySelector("#outputStatus");
const fileStatus = document.querySelector("#fileStatus");
const sourceLanguage = document.querySelector("#sourceLanguage");
const targetLanguage = document.querySelector("#targetLanguage");
const taskMode = document.querySelector("#taskMode");
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
const workflowStatus = document.querySelector("#workflowStatus");
const workflowTabs = Array.from(document.querySelectorAll("[data-workflow-tab]"));
const workflowContextLabel = document.querySelector("#workflowContextLabel");
const workflowContextTitle = document.querySelector("#workflowContextTitle");
const workflowContextDescription = document.querySelector("#workflowContextDescription");
const workflowContextActions = document.querySelector("#workflowContextActions");
const workflowCategoryChips = document.querySelector("#workflowCategoryChips");
const workflowSearch = document.querySelector("#workflowSearch");
const workflowGrade = document.querySelector("#workflowGrade");
const workflowTopic = document.querySelector("#workflowTopic");
const emiPracticePanel = document.querySelector("#emiPracticePanel");
const emiPracticeCount = document.querySelector("#emiPracticeCount");
const emiSelectedCard = document.querySelector("#emiSelectedCard");
const emiSelectedCategory = document.querySelector("#emiSelectedCategory");
const emiPracticePrompt = document.querySelector("#emiPracticePrompt");
const emiPracticeAnswer = document.querySelector("#emiPracticeAnswer");
const revealEmiAnswer = document.querySelector("#revealEmiAnswer");
const nextEmiCard = document.querySelector("#nextEmiCard");
const emiTableCount = document.querySelector("#emiTableCount");
const emiTableBody = document.querySelector("#emiTableBody");
const emiTableHint = document.querySelector("#emiTableHint");
const otherUsePanel = document.querySelector("#otherUsePanel");
const otherUseNote = document.querySelector("#otherUseNote");
const saveOtherUse = document.querySelector("#saveOtherUse");
const otherUseStatus = document.querySelector("#otherUseStatus");
const examplesDescription = document.querySelector("#examplesDescription");
const exampleSearch = document.querySelector("#exampleSearch");
const exampleKind = document.querySelector("#exampleKind");
const exampleCategory = document.querySelector("#exampleCategory");
const exampleLevel = document.querySelector("#exampleLevel");
const resetExampleFilters = document.querySelector("#resetExampleFilters");
const exampleCount = document.querySelector("#exampleCount");
const exampleFilterNote = document.querySelector("#exampleFilterNote");
const exampleList = document.querySelector("#exampleList");
const examplesSection = document.querySelector("#examples");
const examplesEmpty = document.querySelector("#examplesEmpty");
const checkServicesButton = document.querySelector("#checkServices");
const diagnosticsStatus = document.querySelector("#diagnosticsStatus");
const diagnosticsList = document.querySelector("#diagnosticsList");

let translatedValue = "";
let activeFileName = "";
let toastTimer;
let activeWorkflow = "author";
let emiPracticeIndex = 0;
let emiPracticeRevealed = false;
let emiSelectedId = "";
let otherUseNoteValue = "";
let backendState = {
  openai: { configured: false, model: "gpt-5.6-luna", apiStyle: "responses" },
  minimax: { configured: false, model: "MiniMax-M3", apiStyle: "chat" },
  localai: { configured: false, model: "", apiStyle: "chat" },
  local: { configured: false, model: "", apiStyle: "chat" }
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

function setSample(value, source, target, fileName, message, focusSource = true) {
  sourceLanguage.value = source;
  targetLanguage.value = target;
  sourceText.value = value;
  activeFileName = fileName;
  updateSourceState();
  updateFileStatus(fileName, true);
  resetOutput();
  if (focusSource) sourceText.focus();
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
  if (examplesDescription && examplesMeta.description) examplesDescription.textContent = examplesMeta.description;
  if (exampleFilterNote && examplesMeta.filterNote) exampleFilterNote.textContent = examplesMeta.filterNote;

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

const QUESTION_KINDS = new Set(["公開試題型", "出版社題型"]);
const WORKFLOW_COPY = {
  translate: {
    label: "TRANSLATION",
    title: "文件、詞庫和例子都在同一個工作區",
    description: "直接貼上或匯入文件；需要時從例子工作台載入短句，並用詞庫核對數學用字。",
    status: "先在上方工作區貼上文件；公式、變數和 LaTeX 會保持原樣。"
  },
  author: {
    label: "QUESTION AUTHORING",
    title: "按年級及課題找例子，直接改寫成新題",
    description: "先選年級和數學課題，再按例子上的「以例改寫出題」。你可以在工作區修改題目條件，最後用 GPT-5.6 Luna、MiniMax 或本機模型產生草稿。",
    status: "顯示公開試及出版社題型；可直接載入為新題參考。"
  },
  emi: {
    label: "EMI CLASSROOM",
    title: "按課堂分類，和同學練習數學英語",
    description: "搜尋或點選課堂用語分類，再用上方雙語卡片輪流提問、回答和核對；不用離開這個頁面。",
    status: "顯示課堂用語；可點選分類開始 pair practice。"
  },
  hkeaa: {
    label: "HKEAA CHECK",
    title: "以公開試題型核對題目用字",
    description: "只顯示 HKEAA 公開試題型示例，逐張查看指令、答案格式和解題表達；需要正式來源時開啟 HKEAA 公開資源。",
    status: "顯示公開試題型；卡片上的來源連結指向 HKEAA 公開資源。"
  },
  other: {
    label: "OPEN SLOT",
    title: "未確定用途？先把想法留在工作台",
    description: "先用全庫搜尋、載入工作區或保存一段頁面備註，日後再決定是否建立新的流程。",
    status: "顯示全庫示例；自訂備註只保留在目前頁面工作階段。"
  }
};

function populateExampleFilters() {
  if (!exampleKind || !exampleLevel || !exampleCategory) return;
  const kinds = Array.from(new Set(exampleEntries.map(function (entry) {
    return entry.kind;
  }).filter(Boolean)));
  const categories = Array.from(new Set(exampleEntries.map(function (entry) {
    return entry.category;
  }).filter(Boolean))).sort(function (left, right) {
    return left.localeCompare(right, "zh-Hant");
  });
  const levels = Array.from(new Set(exampleEntries.flatMap(function (entry) {
    return entry.levels || [];
  }))).sort(function (left, right) {
    return left.localeCompare(right, "en", { numeric: true });
  });
  const categoryOptions = '<option value="all">所有課題／分類</option>' + categories.map(function (category) {
    return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + "</option>";
  }).join("");
  const levelOptions = '<option value="all">所有年級</option>' + levels.map(function (level) {
    return '<option value="' + escapeHtml(level) + '">' + escapeHtml(level) + "</option>";
  }).join("");
  exampleKind.innerHTML = '<option value="all">所有示例類型</option><option value="questions">題目類（公開試＋出版社）</option>' + kinds.map(function (kind) {
    return '<option value="' + escapeHtml(kind) + '">' + escapeHtml(kind) + "</option>";
  }).join("");
  exampleCategory.innerHTML = categoryOptions;
  exampleLevel.innerHTML = levelOptions;
  if (workflowTopic) workflowTopic.innerHTML = categoryOptions;
  if (workflowGrade) workflowGrade.innerHTML = levelOptions;
}

function syncWorkflowSearch() {
  if (workflowSearch && exampleSearch && workflowSearch.value !== exampleSearch.value) {
    workflowSearch.value = exampleSearch.value;
  }
  if (workflowGrade && exampleLevel && workflowGrade.value !== exampleLevel.value) {
    workflowGrade.value = exampleLevel.value;
  }
  if (workflowTopic && exampleCategory && workflowTopic.value !== exampleCategory.value) {
    workflowTopic.value = exampleCategory.value;
  }
}

function exampleMatches(entry, query, kind, category, level) {
  const haystack = [
    entry.kind,
    entry.category,
    entry.sourceText,
    entry.targetText,
    entry.note,
    entry.sourceType,
    ...(entry.tags || []),
    ...(entry.levels || [])
  ].join(" ").toLocaleLowerCase("zh-Hant");
  const matchesQuery = !query || haystack.includes(query);
  const matchesKind = kind === "all"
    || (kind === "questions" && QUESTION_KINDS.has(entry.kind))
    || entry.kind === kind;
  const matchesCategory = category === "all" || entry.category === category;
  const matchesLevel = level === "all" || (entry.levels || []).includes(level);
  return matchesQuery && matchesKind && matchesCategory && matchesLevel;
}

function renderExampleCard(entry) {
  const levelMarkup = (entry.levels || []).map(escapeHtml).join("／");
  const tags = (entry.tags || []).slice(0, 4).map(escapeHtml).join(" · ");
  const sourceLinkMarkup = entry.sourceUrl
    ? '<a href="' + escapeHtml(entry.sourceUrl) + '" target="_blank" rel="noreferrer">HKEAA 參考 ↗</a>'
    : '<span class="example-adapted">自製改寫</span>';
  const isQuestion = QUESTION_KINDS.has(entry.kind);
  const isClassroom = entry.kind === "課堂用語";
  const primaryAction = isQuestion
    ? '<button type="button" data-example-action="draft-question" data-example-id="' + escapeHtml(entry.id) + '">以例改寫出題</button>'
    : isClassroom
      ? '<button type="button" data-example-action="practice" data-example-id="' + escapeHtml(entry.id) + '">加入 EMI 練習</button>'
      : '<button type="button" data-example-action="use" data-example-id="' + escapeHtml(entry.id) + '">載入工作區</button>';
  const secondaryAction = isQuestion || isClassroom
    ? '<button type="button" data-example-action="use" data-example-id="' + escapeHtml(entry.id) + '">載入工作區</button>'
    : '';
  return [
    '<article class="example-card">',
    '<div class="example-card-top"><span class="example-kind">' + escapeHtml(entry.kind || "示例") + '</span><span class="example-category">' + escapeHtml(entry.category || "") + '</span></div>',
    '<div class="example-pair">',
    '<div class="example-language">' + escapeHtml(entry.sourceLanguage === "zh-Hant" ? "繁體中文原文" : "English source") + '</div>',
    '<div class="example-source">' + renderMathAwareText(entry.sourceText || "") + '</div>',
    '<div class="example-arrow" aria-hidden="true">↓</div>',
    '<div class="example-language">' + escapeHtml(entry.targetLanguage === "zh-Hant" ? "香港繁體中文譯法" : "English translation") + '</div>',
    '<div class="example-target">' + renderMathAwareText(entry.targetText || "") + '</div>',
    '</div>',
    '<p class="example-note">' + escapeHtml(entry.note || "按上下文核對 house style。") + '</p>',
    '<div class="example-card-meta"><span>' + escapeHtml(entry.sourceType || "通用示例") + '</span><span>' + levelMarkup + '</span></div>',
    '<div class="example-tags">' + tags + '</div>',
    '<div class="example-card-actions">' + primaryAction + secondaryAction + sourceLinkMarkup + '</div>',
    '</article>'
  ].join("");
}

function renderExampleLibrary() {
  if (!exampleList) return;
  syncWorkflowSearch();
  const query = (exampleSearch ? exampleSearch.value : "").trim().toLocaleLowerCase("zh-Hant");
  const kind = exampleKind ? exampleKind.value : "all";
  const category = exampleCategory ? exampleCategory.value : "all";
  const level = exampleLevel ? exampleLevel.value : "all";
  const filtered = exampleEntries.filter(function (entry) {
    return exampleMatches(entry, query, kind, category, level);
  });
  exampleList.innerHTML = filtered.map(renderExampleCard).join("");
  if (examplesSection) examplesSection.hidden = activeWorkflow === "emi";
  if (exampleCount) exampleCount.textContent = filtered.length.toLocaleString("zh-Hant-TW");
  if (exampleFilterNote) {
    exampleFilterNote.textContent = filtered.length === exampleEntries.length
      ? (examplesMeta.filterNote || "題目及教學語境均以短句、自製改寫或通用句型示範。")
      : "目前顯示 " + filtered.length + " 條相符示例";
  }
  if (examplesEmpty) examplesEmpty.hidden = filtered.length > 0;
  updateWorkflowStatus(filtered.length);
}

function getEmiEntries() {
  const category = exampleCategory ? exampleCategory.value : "all";
  const query = (exampleSearch ? exampleSearch.value : "").trim().toLocaleLowerCase("zh-Hant");
  const level = exampleLevel ? exampleLevel.value : "all";
  return exampleEntries.filter(function (entry) {
    return entry.kind === "課堂用語" && exampleMatches(entry, query, "課堂用語", category, level);
  });
}

function emiPair(entry) {
  return entry.sourceLanguage === "en"
    ? { english: entry.sourceText, chinese: entry.targetText }
    : { english: entry.targetText, chinese: entry.sourceText };
}

function renderEmiTable(entries) {
  if (!emiTableBody) return;
  if (emiTableCount) emiTableCount.textContent = entries.length + " 句";
  if (emiTableHint) {
    emiTableHint.textContent = entries.length
      ? "按分類查看全部句子；按「使用這句」後，句子會在上方放大顯示。"
      : "目前的搜尋／年級／分類沒有相符句子。";
  }
  emiTableBody.innerHTML = entries.map(function (entry, index) {
    const pair = emiPair(entry);
    const selected = entry.id === emiSelectedId;
    const tags = (entry.tags || []).slice(0, 3).join(" · ") || entry.note || "—";
    return [
      '<tr class="emi-table-row' + (selected ? ' selected' : '') + '" data-emi-row-id="' + escapeHtml(entry.id) + '" aria-selected="' + (selected ? "true" : "false") + '">',
      '<td class="emi-table-number">' + (index + 1) + "</td>",
      '<td class="emi-table-english">' + renderMathAwareText(pair.english) + "</td>",
      '<td class="emi-table-chinese">' + renderMathAwareText(pair.chinese) + "</td>",
      '<td class="emi-table-note" title="' + escapeHtml(entry.note || "") + '">' + escapeHtml(tags) + "</td>",
      '<td><button class="emi-use-button" type="button" data-emi-select-id="' + escapeHtml(entry.id) + '">使用這句</button></td>',
      "</tr>"
    ].join("");
  }).join("");
}

function renderWorkflowCategoryChips() {
  if (!workflowCategoryChips) return;
  const entries = activeWorkflow === "author" || activeWorkflow === "hkeaa"
    ? exampleEntries.filter(function (entry) {
        return activeWorkflow === "hkeaa" ? entry.kind === "公開試題型" : QUESTION_KINDS.has(entry.kind);
      })
    : activeWorkflow === "emi"
      ? exampleEntries.filter(function (entry) { return entry.kind === "課堂用語"; })
      : [];
  const categories = Array.from(new Set(entries.map(function (entry) {
    return entry.category;
  }).filter(Boolean))).sort(function (left, right) {
    return left.localeCompare(right, "zh-Hant");
  });
  workflowCategoryChips.hidden = !categories.length;
  workflowCategoryChips.innerHTML = categories.map(function (category) {
    const active = exampleCategory && exampleCategory.value === category;
    return '<button type="button" class="workflow-category-chip' + (active ? ' active' : '') + '" data-workflow-category="' + escapeHtml(category) + '">' + escapeHtml(category) + '</button>';
  }).join("");
}

function renderEmiPractice() {
  if (!emiPracticePanel) return;
  emiPracticePanel.hidden = activeWorkflow !== "emi";
  if (activeWorkflow !== "emi") return;
  const entries = getEmiEntries();
  if (!entries.length) {
    emiPracticeIndex = 0;
    emiSelectedId = "";
    emiPracticeRevealed = false;
    if (emiSelectedCard) emiSelectedCard.classList.remove("has-selection");
    if (emiPracticeCount) emiPracticeCount.textContent = "0 / 0";
    if (emiSelectedCategory) emiSelectedCategory.textContent = "EMI";
    if (emiPracticePrompt) emiPracticePrompt.textContent = "這個分類暫時沒有課堂用語。";
    if (emiPracticeAnswer) {
      emiPracticeAnswer.hidden = true;
      emiPracticeAnswer.innerHTML = "";
    }
    if (revealEmiAnswer) revealEmiAnswer.disabled = true;
    if (nextEmiCard) nextEmiCard.disabled = true;
    renderEmiTable(entries);
    return;
  }
  const selectedIndex = entries.findIndex(function (entry) { return entry.id === emiSelectedId; });
  emiPracticeIndex = selectedIndex >= 0
    ? selectedIndex
    : ((emiPracticeIndex % entries.length) + entries.length) % entries.length;
  const entry = entries[emiPracticeIndex];
  emiSelectedId = entry.id;
  if (emiSelectedCard) emiSelectedCard.classList.add("has-selection");
  const pair = emiPair(entry);
  const prompt = pair.english;
  const answer = pair.chinese;
  if (emiPracticeCount) emiPracticeCount.textContent = (emiPracticeIndex + 1) + " / " + entries.length;
  if (emiSelectedCategory) emiSelectedCategory.textContent = entry.category || "EMI";
  if (emiPracticePrompt) emiPracticePrompt.innerHTML = renderMathAwareText(prompt);
  if (emiPracticeAnswer) {
    emiPracticeAnswer.innerHTML = '<span>Suggested meaning</span>' + renderMathAwareText(answer);
    emiPracticeAnswer.hidden = !emiPracticeRevealed;
  }
  if (revealEmiAnswer) {
    revealEmiAnswer.disabled = false;
    revealEmiAnswer.textContent = emiPracticeRevealed ? "隱藏中文意思" : "顯示中文意思";
  }
  if (nextEmiCard) nextEmiCard.disabled = false;
  renderEmiTable(entries);
}

function updateWorkflowStatus(count) {
  if (!workflowStatus) return;
  const copy = WORKFLOW_COPY[activeWorkflow] || WORKFLOW_COPY.author;
  const total = typeof count === "number" ? count : exampleEntries.length;
  workflowStatus.textContent = copy.status + " · 目前顯示 " + total + " 條示例。";
}

function renderWorkflowContextActions() {
  if (!workflowContextActions) return;
  const actions = {
    translate: '<button type="button" class="workflow-action" data-workflow-action="set-translate">回到翻譯任務</button>',
    author: '<button type="button" class="workflow-action" data-workflow-action="set-question">把工作區設為「改寫成新題」</button>',
    emi: '<button type="button" class="workflow-action" data-workflow-action="reset-emi">換一個 EMI 分類</button>',
    hkeaa: '<a class="workflow-action" href="https://www.hkeaa.edu.hk/en/Resources/publications/list_of_publications/hkdse_erqp_pub/" target="_blank" rel="noreferrer">開啟 HKEAA 公開資源 ↗</a>',
    other: '<button type="button" class="workflow-action" data-workflow-action="set-translate">把內容載入翻譯工作區</button>'
  };
  workflowContextActions.innerHTML = actions[activeWorkflow] || actions.other;
}

function activateWorkflow(workflow, options) {
  const nextWorkflow = WORKFLOW_COPY[workflow] ? workflow : "author";
  const settings = options || {};
  activeWorkflow = nextWorkflow;
  workflowTabs.forEach(function (tab) {
    const active = tab.dataset.workflowTab === activeWorkflow;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll("[data-workflow-target]").forEach(function (item) {
    const active = item.dataset.workflowTarget === activeWorkflow;
    item.classList.toggle("active", active);
    if (item.classList.contains("nav-item")) {
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
  });
  const copy = WORKFLOW_COPY[activeWorkflow];
  if (workflowContextLabel) workflowContextLabel.textContent = copy.label;
  if (workflowContextTitle) workflowContextTitle.textContent = copy.title;
  if (workflowContextDescription) workflowContextDescription.textContent = copy.description;
  renderWorkflowContextActions();
  if (exampleSearch && !settings.preserveSearch) exampleSearch.value = "";
  if (exampleLevel && !settings.preserveLevel) exampleLevel.value = "all";
  if (exampleCategory && !settings.preserveCategory) exampleCategory.value = "all";
  if (exampleKind) {
    exampleKind.value = activeWorkflow === "author"
      ? "questions"
      : activeWorkflow === "emi"
        ? "課堂用語"
        : activeWorkflow === "hkeaa"
          ? "公開試題型"
          : "all";
  }
  if (otherUsePanel) otherUsePanel.hidden = activeWorkflow !== "other";
  if (activeWorkflow === "other" && otherUseNote) {
    otherUseNote.value = otherUseNoteValue;
  }
  if (emiPracticePanel) emiPracticePanel.hidden = activeWorkflow !== "emi";
  renderWorkflowCategoryChips();
  renderExampleLibrary();
  if (settings.exampleId && activeWorkflow === "emi") {
    const entries = getEmiEntries();
    const index = entries.findIndex(function (entry) { return entry.id === settings.exampleId; });
    if (index >= 0) {
      emiPracticeIndex = index;
      emiSelectedId = settings.exampleId;
    }
  }
  renderEmiPractice();
}

function handleWorkflowCategory(event) {
  const button = event.target.closest("[data-workflow-category]");
  if (!button || !exampleCategory) return;
  exampleCategory.value = button.dataset.workflowCategory;
  if (activeWorkflow === "emi") {
    emiPracticeIndex = 0;
    emiSelectedId = "";
  }
  emiPracticeRevealed = false;
  renderWorkflowCategoryChips();
  renderExampleLibrary();
  renderEmiPractice();
}

function handleWorkflowAction(event) {
  const actionButton = event.target.closest("[data-workflow-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.workflowAction;
  if (action === "set-question" && taskMode) {
    taskMode.value = "question";
    updateTaskMode();
    showToast("工作區已設為「改寫成新題」；請選擇模型後開始。 ");
  } else if (action === "set-translate" && taskMode) {
    taskMode.value = "translate";
    updateTaskMode();
    showToast("工作區已回到文件翻譯。 ");
  } else if (action === "reset-emi") {
    exampleCategory.value = "all";
    emiPracticeIndex = 0;
    emiSelectedId = "";
    emiPracticeRevealed = false;
    renderWorkflowCategoryChips();
    renderExampleLibrary();
    renderEmiPractice();
  }
}

function selectEmiEntry(entryId) {
  if (!entryId || activeWorkflow !== "emi") return;
  const entries = getEmiEntries();
  const index = entries.findIndex(function (entry) { return entry.id === entryId; });
  if (index < 0) return;
  emiPracticeIndex = index;
  emiSelectedId = entryId;
  emiPracticeRevealed = false;
  renderEmiPractice();
}

function handleEmiTableClick(event) {
  const row = event.target.closest("[data-emi-row-id]");
  if (!row) return;
  selectEmiEntry(row.dataset.emiRowId);
}

function saveOtherUseNote() {
  if (!otherUseNote || !otherUseStatus) return;
  const value = otherUseNote.value.trim();
  otherUseNoteValue = value;
  otherUseStatus.textContent = value ? "已保存到目前頁面" : "尚未保存備註";
  showToast(value ? "其他用途備註已保存。" : "已清除其他用途備註。 ");
}

function handleExampleAction(event) {
  const actionButton = event.target.closest("button[data-example-action]");
  if (!actionButton) return;
  const example = exampleEntries.find(function (item) {
    return item.id === actionButton.dataset.exampleId;
  });
  if (!example) return;
  if (actionButton.dataset.exampleAction === "draft-question") {
    if (taskMode) taskMode.value = "question";
    setSample(
      example.sourceText,
      example.sourceLanguage,
      example.sourceLanguage,
      "question-reference-" + example.id + ".txt",
      "已載入題型參考；工作區已準備改寫新題。",
      false
    );
    updateTaskMode();
    return;
  }
  if (actionButton.dataset.exampleAction === "practice") {
    activateWorkflow("emi", { preserveSearch: true, preserveLevel: true, preserveCategory: true, exampleId: example.id });
    showToast("已加入 EMI 練習；先由同學讀出 English prompt，再按顯示答案。 ");
    return;
  }
  setSample(
    example.sourceText,
    example.sourceLanguage,
    example.targetLanguage,
    "example-" + example.id + ".txt",
    "已載入「" + (example.kind || "翻譯示例") + "」到工作區。",
    false
  );
}

function wait(milliseconds) {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, milliseconds);
  });
}

function selectedTask() {
  return taskMode ? taskMode.value : "translate";
}

function selectedTaskLabel() {
  return {
    translate: "翻譯",
    question: "改寫新題",
    "lesson-plan": "整理教案"
  }[selectedTask()] || "翻譯";
}

function updateTaskMode() {
  if (translateButton) {
    const label = translateButton.querySelector(".translate-button-label");
    if (label) label.textContent = selectedTaskLabel();
  }
  updateTranslationMode();
}

function requestContext() {
  return {
    workflow: activeWorkflow,
    grade: exampleLevel && exampleLevel.value !== "all" ? exampleLevel.value : "",
    topic: exampleCategory && exampleCategory.value !== "all" ? exampleCategory.value : ""
  };
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
      task: selectedTask(),
      provider: selectedProvider(),
      sourceText: value,
      sourceLanguage: sourceLanguage.value,
      targetLanguage: targetLanguage.value,
      context: requestContext()
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

function selectedProvider() {
  if (!translationMode) return "openai";
  if (["minimax", "localai", "local"].includes(translationMode.value)) return translationMode.value;
  return "openai";
}

function selectedBackend() {
  return backendState[selectedProvider()] || backendState.openai;
}

function selectedModelLabel() {
  const provider = selectedProvider();
  const backend = selectedBackend();
  const labels = {
    openai: "GPT-5.6 Luna",
    minimax: "MiniMax",
    localai: "LocalAI",
    local: "Local LLM"
  };
  const label = provider === "openai" && ["gpt-5.6-sol", "gpt-5.6"].includes(backend.model)
    ? "GPT-5.6 Sol"
    : labels[provider] || "AI";
  if (backend.model) return label + " · " + backend.model;
  return label;
}

function updateTranslationMode() {
  if (!translationMode) return;
  const provider = selectedProvider();
  const task = selectedTask();
  const isModelMode = translationMode.value !== "offline";
  const isCloudAi = isModelMode && provider === "openai";
  const isMiniMax = isModelMode && provider === "minimax";
  const isLocalAI = isModelMode && provider === "localai";
  const isLocalAi = isModelMode && provider === "local";
  const selected = selectedBackend();
  if (workspaceNoteText) {
    const taskNote = task === "question"
      ? "目前為改寫新題任務：保留數學概念，產生可直接編輯的全新題目，不提供解答。"
      : task === "lesson-plan"
        ? "目前為整理教案任務：把內容整理成學習目標、教學法、課堂流程及評量草稿。"
        : "";
    workspaceNoteText.textContent = taskNote
      ? (isModelMode
        ? taskNote + " 由 " + selectedModelLabel() + " 處理；公式先保護。"
        : taskNote + " 請選擇 GPT-5.6 Luna、MiniMax、LocalAI 或 Local LLM 後開始。")
      : isCloudAi
        ? "GPT-5.6 Luna 模式：文字會送到本地伺服器，再由 OpenAI Responses API 處理；公式先保護，沒有服務時自動回到" + glossaryLabel + "。"
        : isMiniMax
          ? "MiniMax 模式：文字會由本地伺服器送到 MiniMax 的 OpenAI-compatible Chat Completions endpoint；公式先保護，服務不可用時回到" + glossaryLabel + "。"
          : isLocalAI
            ? "LocalAI 模式：文件只會送到你設定的本機 LocalAI endpoint，不會送到雲端；公式先保護，服務不可用時回到" + glossaryLabel + "。"
            : isLocalAi
              ? "Local LLM 模式：文件只會送到你設定的本機 OpenAI-compatible endpoint，不會送到 OpenAI；公式先保護，服務不可用時回到" + glossaryLabel + "。"
              : "目前為離線示範模式：內建" + glossaryLabel + "會翻譯常見術語，辨識到的數學公式與 LaTeX 指令保持原樣。";
  }
  if (serviceStatus && isModelMode) {
    serviceStatus.textContent = selected.configured
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
        model: data.openai && data.openai.model ? data.openai.model : "gpt-5.6-luna",
        apiStyle: data.openai && data.openai.apiStyle ? data.openai.apiStyle : "responses"
      },
      minimax: {
        configured: Boolean(response.ok && data.minimax && data.minimax.configured),
        model: data.minimax && data.minimax.model ? data.minimax.model : "MiniMax-M3",
        apiStyle: data.minimax && data.minimax.apiStyle ? data.minimax.apiStyle : "chat"
      },
      localai: {
        configured: Boolean(response.ok && data.localai && data.localai.configured),
        model: data.localai && data.localai.model ? data.localai.model : "",
        apiStyle: data.localai && data.localai.apiStyle ? data.localai.apiStyle : "chat"
      },
      local: {
        configured: Boolean(response.ok && data.local && data.local.configured),
        model: data.local && data.local.model ? data.local.model : "",
        apiStyle: data.local && data.local.apiStyle ? data.local.apiStyle : "chat"
      }
    };
  } catch {
    backendState = {
      openai: { configured: false, model: "gpt-5.6-luna", apiStyle: "responses" },
      minimax: { configured: false, model: "MiniMax-M3", apiStyle: "chat" },
      localai: { configured: false, model: "", apiStyle: "chat" },
      local: { configured: false, model: "", apiStyle: "chat" }
    };
  }
  updateTranslationMode();
}

function diagnosticStatusLabel(status) {
  return {
    reachable: "可連線",
    error: "服務回應錯誤",
    timeout: "連線逾時",
    unreachable: "無法連線",
    not_configured: "未完成設定",
    not_checked: "未檢查"
  }[status] || status || "未知";
}

function diagnosticStatusClass(status) {
  return status === "reachable" ? "diagnostic-ok"
    : ["error", "timeout", "unreachable"].includes(status) ? "diagnostic-error"
      : "diagnostic-pending";
}

function renderDiagnosticCard(provider) {
  const probe = provider.probe || {};
  const models = Array.isArray(probe.models) && probe.models.length
    ? probe.models.join(" · ")
    : provider.model || "尚未指定 model id";
  const setKeys = (provider.environment || []).filter(function (item) {
    return item.set;
  }).map(function (item) {
    return item.key;
  });
  const status = probe.status || "not_checked";
  return [
    '<article class="diagnostic-card">',
    '<div class="diagnostic-card-top"><strong>' + escapeHtml(provider.label || provider.provider) + '</strong><span class="diagnostic-state ' + diagnosticStatusClass(status) + '">' + escapeHtml(diagnosticStatusLabel(status)) + '</span></div>',
    '<div class="diagnostic-row"><span>Endpoint</span><code>' + escapeHtml(provider.endpoint || "未設定") + '</code></div>',
    '<div class="diagnostic-row"><span>Model</span><code>' + escapeHtml(models) + '</code></div>',
    '<div class="diagnostic-row"><span>API</span><span>' + escapeHtml(provider.apiStyle || "chat") + '</span></div>',
    '<div class="diagnostic-row"><span>設定項目</span><span>' + escapeHtml(setKeys.length ? setKeys.join("、") : "未偵測到環境變數") + '</span></div>',
    (probe.error ? '<p class="diagnostic-error-note">' + escapeHtml(probe.error) + '</p>' : ''),
    '</article>'
  ].join("");
}

function renderDiagnostics(data) {
  if (!diagnosticsList) return;
  const providers = Array.isArray(data.providers) ? data.providers : [];
  diagnosticsList.innerHTML = providers.map(renderDiagnosticCard).join("");
  if (diagnosticsStatus) {
    const checkedAt = data.checkedAt ? new Date(data.checkedAt).toLocaleString("zh-Hant-HK") : "剛才";
    const runtime = data.runtime || {};
    diagnosticsStatus.textContent = "檢查時間：" + checkedAt + " · " + (runtime.node || "Node.js") + " · " + (runtime.platform || "本機");
  }
}

async function checkServices() {
  if (!diagnosticsStatus || !diagnosticsList) return;
  if (window.location.protocol === "file:") {
    diagnosticsStatus.textContent = "請先以 npm start 啟動本地伺服器，才可檢查 MiniMax、LocalAI 及本機設定。";
    return;
  }
  if (checkServicesButton) {
    checkServicesButton.disabled = true;
    checkServicesButton.textContent = "檢查中…";
  }
  diagnosticsStatus.textContent = "正在讀取環境設定及測試 /models endpoint…";
  try {
    const response = await fetch("/api/diagnostics?probe=1", { cache: "no-store" });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "診斷服務暫時不可用。");
    renderDiagnostics(data);
    await checkApiService();
  } catch (error) {
    diagnosticsStatus.textContent = error.message || "診斷服務暫時不可用。";
    diagnosticsList.innerHTML = "";
  } finally {
    if (checkServicesButton) {
      checkServicesButton.disabled = false;
      checkServicesButton.textContent = "重新檢查";
    }
  }
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
  const task = selectedTask();
  const useModel = translationMode && ["ai", "minimax", "localai", "local"].includes(translationMode.value);
  const modelLabel = selectedModelLabel();
  if (task !== "translate" && !useModel) {
    translateButton.disabled = false;
    translateButton.querySelector(".translate-button-label").textContent = selectedTaskLabel();
    outputStatus.textContent = selectedTaskLabel() + "需要模型模式";
    showToast("「" + selectedTaskLabel() + "」需要選擇 GPT-5.6 Luna、MiniMax、LocalAI 或 Local LLM。 ");
    return;
  }
  outputStatus.textContent = useModel ? modelLabel + " 正在處理…" : "正在保護公式…";

  try {
    let translated;
    let usedFallback = false;
    if (useModel) {
      try {
        translated = await requestAiTranslation(sourceText.value);
      } catch (error) {
        if (task !== "translate") {
          outputStatus.textContent = selectedTaskLabel() + "失敗 · 請覆核模型設定";
          showToast(modelLabel + " 未完成「" + selectedTaskLabel() + "」；請按「檢查服務」或改用其他模型。 ");
          return;
        }
        translated = translateDocument(sourceText.value, targetLanguage.value);
        usedFallback = true;
        showToast(modelLabel + " 未完成，已改用" + glossaryLabel + " fallback；請覆核或按翻譯重試。 ");
      }
    } else {
      await wait(260);
      translated = translateDocument(sourceText.value, targetLanguage.value);
    }
    renderOutput(translated);
    outputStatus.textContent = usedFallback
      ? "AI 失敗 · " + glossaryLabel + " fallback（請覆核）"
      : useModel
        ? "已完成 · " + selectedTaskLabel() + " · " + modelLabel
        : "已完成 · " + targetLanguage.options[targetLanguage.selectedIndex].text;
    if (!usedFallback) {
      showToast(useModel ? modelLabel + " 已完成「" + selectedTaskLabel() + "」，公式已保持原樣。" : "翻譯完成，公式已保持原樣。");
    }
  } finally {
    translateButton.disabled = false;
    translateButton.querySelector(".translate-button-label").textContent = selectedTaskLabel();
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
  showToast("已套用：「" + term + "」到工作區；頁面位置不變。 ");
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
if (taskMode) {
  taskMode.addEventListener("change", updateTaskMode);
}
workflowTabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    activateWorkflow(tab.dataset.workflowTab);
  });
});
document.querySelectorAll("[data-workflow-target]").forEach(function (item) {
  item.addEventListener("click", function () {
    activateWorkflow(item.dataset.workflowTarget);
  });
});
if (workflowCategoryChips) workflowCategoryChips.addEventListener("click", handleWorkflowCategory);
if (workflowContextActions) workflowContextActions.addEventListener("click", handleWorkflowAction);
if (workflowSearch) {
  workflowSearch.addEventListener("input", function () {
    if (exampleSearch) exampleSearch.value = workflowSearch.value;
    renderExampleLibrary();
  });
}
if (workflowGrade) {
  workflowGrade.addEventListener("change", function () {
    if (exampleLevel) exampleLevel.value = workflowGrade.value;
    renderExampleLibrary();
  });
}
if (workflowTopic) {
  workflowTopic.addEventListener("change", function () {
    if (exampleCategory) exampleCategory.value = workflowTopic.value;
    if (activeWorkflow === "emi") {
      emiPracticeIndex = 0;
      emiSelectedId = "";
      emiPracticeRevealed = false;
    }
    renderWorkflowCategoryChips();
    renderExampleLibrary();
    renderEmiPractice();
  });
}
if (revealEmiAnswer) {
  revealEmiAnswer.addEventListener("click", function () {
    emiPracticeRevealed = !emiPracticeRevealed;
    renderEmiPractice();
  });
}
if (nextEmiCard) {
  nextEmiCard.addEventListener("click", function () {
    emiPracticeIndex += 1;
    emiSelectedId = "";
    emiPracticeRevealed = false;
    renderEmiPractice();
  });
}
if (emiTableBody) {
  emiTableBody.addEventListener("click", handleEmiTableClick);
}
if (saveOtherUse) saveOtherUse.addEventListener("click", saveOtherUseNote);
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
if (exampleSearch) exampleSearch.addEventListener("input", renderExampleLibrary);
if (exampleKind) exampleKind.addEventListener("change", function () {
  renderWorkflowCategoryChips();
  renderExampleLibrary();
  renderEmiPractice();
});
if (exampleCategory) {
  exampleCategory.addEventListener("change", function () {
    emiPracticeIndex = 0;
    emiSelectedId = "";
    emiPracticeRevealed = false;
    renderWorkflowCategoryChips();
    renderExampleLibrary();
    renderEmiPractice();
  });
}
if (exampleLevel) exampleLevel.addEventListener("change", renderExampleLibrary);
if (resetExampleFilters) {
  resetExampleFilters.addEventListener("click", function () {
    exampleSearch.value = "";
    exampleKind.value = "all";
    exampleCategory.value = "all";
    exampleLevel.value = "all";
    renderWorkflowCategoryChips();
    renderExampleLibrary();
    renderEmiPractice();
  });
}
if (exampleList) exampleList.addEventListener("click", handleExampleAction);
if (checkServicesButton) checkServicesButton.addEventListener("click", checkServices);

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
populateExampleFilters();
activateWorkflow("author", { preserveSearch: true, preserveLevel: true, preserveCategory: true });
updateTaskMode();
checkApiService();
updateSourceState();
updateOutputState();
