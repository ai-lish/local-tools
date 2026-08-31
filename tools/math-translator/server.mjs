import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  let contents;
  try {
    contents = readFileSync(path.join(appRoot, ".env"), "utf8");
  } catch {
    return;
  }

  contents.split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}

loadDotEnv();

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const configuredDefaultProvider = process.env.LLM_PROVIDER || "openai";
const DEFAULT_PROVIDER = ["openai", "minimax", "localai", "local"].includes(configuredDefaultProvider)
  ? configuredDefaultProvider
  : "openai";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M3";
const MINIMAX_TOKEN = process.env.MINIMAX_TOKEN || process.env.MINIMAX_API_KEY || "";
const MINIMAX_API_STYLE = "chat";
const LOCALAI_BASE_URL = process.env.LOCALAI_BASE_URL || "http://127.0.0.1:8080/v1";
const LOCALAI_MODEL = process.env.LOCALAI_MODEL || "";
const LOCALAI_TOKEN = process.env.LOCALAI_TOKEN || process.env.LOCALAI_API_KEY || "local-ai";
const LOCALAI_API_STYLE = process.env.LOCALAI_API_STYLE === "responses" ? "responses" : "chat";
const LOCAL_LLM_BASE_URL = process.env.LOCAL_LLM_BASE_URL || "";
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || "";
const OPENAI_LEGACY_TOKEN_ENV = ["OPENAI", "API", "KEY"].join("_");
const LOCAL_LLM_LEGACY_TOKEN_ENV = ["LOCAL", "LLM", "API", "KEY"].join("_");
const LOCAL_LLM_TOKEN = process.env.LOCAL_LLM_TOKEN || process.env[LOCAL_LLM_LEGACY_TOKEN_ENV] || "local";
const LOCAL_LLM_API_STYLE = process.env.LOCAL_LLM_API_STYLE === "responses" ? "responses" : "chat";
const REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "medium";
const DIAGNOSTIC_TIMEOUT_MS = 7000;
const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS || 90000);
const MODEL_TIMEOUT_MS = Number.isFinite(configuredTimeout)
  ? Math.max(5000, Math.min(configuredTimeout, 300000))
  : 90000;
const configuredOutputTokens = Number(process.env.LLM_MAX_OUTPUT_TOKENS || 60000);
const MAX_OUTPUT_TOKENS = Number.isFinite(configuredOutputTokens)
  ? Math.max(256, Math.min(configuredOutputTokens, 120000))
  : 60000;
const MAX_INPUT_CHARS = 120000;
const MAX_OUTPUT_CHARS = 300000;
const MAX_BODY_BYTES = 650000;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACT_BODY_BYTES = 30 * 1024 * 1024;
const EXTRACT_TIMEOUT_MS = 60000;
const GOOGLE_FETCH_TIMEOUT_MS = 30000;
const TEXT_EXTRACTOR = path.join(appRoot, "extract_text.py");
const PYTHON_EXECUTABLE = process.env.MATHLINGO_PYTHON || "python3";
const MATH_ENVIRONMENTS = new Set(["equation", "equation*", "align", "align*", "aligned", "gather", "gather*"]);

function trimTrailingSlashes(value) {
  return String(value || "").replace(/\/+$/, "");
}

function providerEndpoint(baseUrl, apiStyle) {
  const base = trimTrailingSlashes(baseUrl);
  if (base.endsWith("/responses") || base.endsWith("/chat/completions")) return base;
  return base + (apiStyle === "chat" ? "/chat/completions" : "/responses");
}

function providerApiStyle(baseUrl, fallback) {
  const base = trimTrailingSlashes(baseUrl);
  if (base.endsWith("/responses")) return "responses";
  if (base.endsWith("/chat/completions")) return "chat";
  return fallback;
}

function getProviderConfig(providerName) {
  if (providerName === "minimax") {
    return {
      provider: "minimax",
      label: "MiniMax",
      baseUrl: MINIMAX_BASE_URL,
      endpoint: providerEndpoint(MINIMAX_BASE_URL, MINIMAX_API_STYLE),
      authToken: MINIMAX_TOKEN,
      model: MINIMAX_MODEL,
      apiStyle: MINIMAX_API_STYLE,
      configured: Boolean(MINIMAX_BASE_URL && MINIMAX_MODEL && MINIMAX_TOKEN),
      environmentKeys: ["MINIMAX_API_KEY", "MINIMAX_TOKEN", "MINIMAX_BASE_URL", "MINIMAX_MODEL"]
    };
  }
  if (providerName === "localai") {
    return {
      provider: "localai",
      label: "LocalAI",
      baseUrl: LOCALAI_BASE_URL,
      endpoint: providerEndpoint(LOCALAI_BASE_URL, LOCALAI_API_STYLE),
      authToken: LOCALAI_TOKEN,
      model: LOCALAI_MODEL,
      apiStyle: providerApiStyle(LOCALAI_BASE_URL, LOCALAI_API_STYLE),
      configured: Boolean(LOCALAI_BASE_URL && LOCALAI_MODEL),
      environmentKeys: ["LOCALAI_BASE_URL", "LOCALAI_MODEL", "LOCALAI_API_KEY", "LOCALAI_API_STYLE"]
    };
  }
  if (providerName === "local") {
    const apiStyle = providerApiStyle(LOCAL_LLM_BASE_URL, LOCAL_LLM_API_STYLE);
    return {
      provider: "local",
      label: "Local LLM",
      baseUrl: LOCAL_LLM_BASE_URL,
      endpoint: providerEndpoint(LOCAL_LLM_BASE_URL, apiStyle),
      authToken: LOCAL_LLM_TOKEN,
      model: LOCAL_LLM_MODEL,
      apiStyle,
      configured: Boolean(LOCAL_LLM_BASE_URL && LOCAL_LLM_MODEL),
      environmentKeys: ["LOCAL_LLM_BASE_URL", "LOCAL_LLM_MODEL", "LOCAL_LLM_TOKEN", "LOCAL_LLM_API_STYLE"]
    };
  }
  return {
    provider: "openai",
    label: ["gpt-5.6-sol", "gpt-5.6"].includes(OPENAI_MODEL) ? "GPT-5.6 Sol / OpenAI" : "GPT-5.6 Luna / OpenAI",
    baseUrl: OPENAI_BASE_URL,
    endpoint: providerEndpoint(OPENAI_BASE_URL, "responses"),
    authToken: process.env.OPENAI_TOKEN || process.env[OPENAI_LEGACY_TOKEN_ENV] || "",
    model: OPENAI_MODEL,
    apiStyle: "responses",
    configured: Boolean(process.env.OPENAI_TOKEN || process.env[OPENAI_LEGACY_TOKEN_ENV]),
    environmentKeys: ["OPENAI_API_KEY", "OPENAI_TOKEN", "OPENAI_BASE_URL", "OPENAI_MODEL"]
  };
}

function requestedProvider(value) {
  if (["local", "localai", "minimax", "openai"].includes(value)) return value;
  return DEFAULT_PROVIDER;
}

function requestedTask(value) {
  if (["question", "lesson-plan", "translate"].includes(value)) return value;
  return "translate";
}

function safeEndpointLabel(value) {
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "未設定或格式無效";
  }
}

function modelsEndpoint(config) {
  const base = trimTrailingSlashes(config.baseUrl)
    .replace(/\/(?:chat\/completions|responses)$/, "");
  return base + "/models";
}

function extractModelIds(payload) {
  const candidates = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];
  return candidates.map(function (model) {
    return typeof model === "string" ? model : model && (model.id || model.name);
  }).filter(function (model, index, all) {
    return typeof model === "string" && model && all.indexOf(model) === index;
  }).slice(0, 30);
}

async function probeProvider(config) {
  const requiresCredential = ["openai", "minimax"].includes(config.provider);
  if (!config.baseUrl || (requiresCredential && !config.authToken)) {
    return { status: "not_configured", models: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, DIAGNOSTIC_TIMEOUT_MS);
  try {
    const headers = { Accept: "application/json" };
    if (config.authToken) headers.Authorization = "Bearer " + config.authToken;
    const response = await fetch(modelsEndpoint(config), {
      method: "GET",
      headers,
      signal: controller.signal
    });
    const payload = await response.json().catch(function () {
      return {};
    });
    return {
      status: response.ok ? "reachable" : "error",
      httpStatus: response.status,
      models: extractModelIds(payload),
      error: response.ok ? "" : "服務回傳 HTTP " + response.status
    };
  } catch (error) {
    return {
      status: error && error.name === "AbortError" ? "timeout" : "unreachable",
      models: [],
      error: error && error.name === "AbortError" ? "連線逾時" : "無法連線"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function describeProvider(config, probe) {
  const credentialKeys = config.provider === "localai" || config.provider === "local"
    ? config.environmentKeys.filter(function (key) {
        return /(?:API_KEY|TOKEN)$/.test(key);
      })
    : config.environmentKeys.filter(function (key) {
        return /(?:API_KEY|TOKEN)$/.test(key);
      });
  return {
    provider: config.provider,
    label: config.label,
    configured: config.configured,
    credentialConfigured: Boolean(config.authToken && !["local", "localai"].includes(config.provider)),
    endpoint: safeEndpointLabel(config.baseUrl),
    model: config.model,
    apiStyle: config.apiStyle,
    environment: config.environmentKeys.map(function (key) {
      return { key, set: Boolean(process.env[key]) };
    }),
    credentialKeys,
    probe
  };
}

async function handleDiagnostics(request, response) {
  const requestUrl = new URL(request.url || "/api/diagnostics", "http://" + HOST);
  const shouldProbe = requestUrl.searchParams.get("probe") === "1";
  const configs = [
    getProviderConfig("openai"),
    getProviderConfig("minimax"),
    getProviderConfig("localai"),
    getProviderConfig("local")
  ];
  const probes = shouldProbe
    ? await Promise.all(configs.map(probeProvider))
    : configs.map(function () { return { status: "not_checked", models: [] }; });
  jsonResponse(response, 200, {
    checkedAt: new Date().toISOString(),
    probed: shouldProbe,
    defaultProvider: DEFAULT_PROVIDER,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pythonExecutable: PYTHON_EXECUTABLE,
      extraction: { docx: true, pdf: true, googleDocs: true }
    },
    providers: configs.map(function (config, index) {
      return describeProvider(config, probes[index]);
    })
  });
}

function loadGlossary() {
  const source = readFileSync(path.join(appRoot, "publisher-glossary.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  return sandbox.window.MATH_GLOSSARY || { meta: {}, entries: [] };
}

const glossary = loadGlossary();
const glossaryEntries = Array.isArray(glossary.entries) ? glossary.entries : [];
const glossaryPromptLabel = glossary.meta && glossary.meta.promptLabel
  ? glossary.meta.promptLabel
  : "Mathematics terminology glossary";

function jsonResponse(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function readRequestBody(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let total = 0;
    request.on("data", function (chunk) {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("request_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

async function readJsonBody(request, maxBytes) {
  const rawBody = await readRequestBody(request, maxBytes);
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("invalid_json");
  }
}

function badRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function runTextExtractor(filePath) {
  return new Promise(function (resolve, reject) {
    const child = spawn(PYTHON_EXECUTABLE, [TEXT_EXTRACTOR, filePath], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    const timeout = setTimeout(function () {
      child.kill("SIGTERM");
      reject(new Error("文件文字提取逾時，請分拆文件後再試。"));
    }, EXTRACT_TIMEOUT_MS);

    child.stdout.on("data", function (chunk) {
      stdout.push(chunk);
    });
    child.stderr.on("data", function (chunk) {
      stderr.push(chunk);
    });
    child.once("error", function (error) {
      clearTimeout(timeout);
      reject(new Error("無法啟動本機文字提取器：" + error.message));
    });
    child.once("close", function (code) {
      clearTimeout(timeout);
      if (code !== 0) {
        let message = "文件文字提取失敗。";
        try {
          const errorPayload = JSON.parse(Buffer.concat(stderr).toString("utf8"));
          if (errorPayload && errorPayload.error) message = errorPayload.error;
        } catch {
          const detail = Buffer.concat(stderr).toString("utf8").trim();
          if (detail) message = detail.slice(0, 300);
        }
        reject(new Error(message));
        return;
      }
      try {
        const payload = JSON.parse(Buffer.concat(stdout).toString("utf8"));
        if (!payload || typeof payload.text !== "string") throw new Error("提取器沒有回傳文字。");
        resolve(payload);
      } catch (error) {
        reject(new Error("文件文字提取器回傳格式無效：" + error.message));
      }
    });
  });
}

async function extractLocalFile(fileName, fileBuffer) {
  const extension = path.extname(fileName).toLowerCase();
  if (![".docx", ".pdf"].includes(extension)) {
    throw new Error("只支援 DOCX 或 PDF 文件。TXT、MD、TEX 可直接在瀏覽器載入。 ");
  }
  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("文件超過 20 MB 上限，請分拆後再試。 ");
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "mathlingo-extract-"));
  const temporaryFile = path.join(temporaryDirectory, "input" + extension);
  try {
    await writeFile(temporaryFile, fileBuffer, { mode: 0o600 });
    const result = await runTextExtractor(temporaryFile);
    if (result.text.length > MAX_INPUT_CHARS) {
      throw new Error("提取文字超過 120,000 字元上限，請分段翻譯。 ");
    }
    return result;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(function () {});
  }
}

function isAllowedGoogleHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "docs.google.com" || host === "drive.google.com" || host.endsWith(".googleusercontent.com");
}

function extractGoogleDocId(sourceUrl) {
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw badRequestError("Google Docs 連結格式無效。 ");
  }
  if (parsed.protocol !== "https:" || !["docs.google.com", "drive.google.com"].includes(parsed.hostname.toLowerCase())) {
    throw badRequestError("只接受 docs.google.com 或 drive.google.com 的 HTTPS 連結。 ");
  }
  const pathMatch = parsed.pathname.match(/\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];
  if (parsed.hostname.toLowerCase() === "drive.google.com" && parsed.pathname === "/open") {
    const id = parsed.searchParams.get("id");
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) return id;
  }
  throw badRequestError("找不到 Google Docs 文件 ID；請貼上文件的 docs.google.com/document/d/... 連結。 ");
}

async function readFetchBytes(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Google Docs 匯出文件超過大小上限，請先分拆文件。 ");
  }
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error("Google Docs 匯出文件超過大小上限，請先分拆文件。 ");
    return bytes;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("Google Docs 匯出文件超過大小上限，請先分拆文件。 ");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function fetchGoogleExport(documentId, format) {
  const exportUrl = "https://docs.google.com/document/d/" + documentId + "/export?format=" + format;
  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, GOOGLE_FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(exportUrl, { signal: controller.signal, redirect: "follow" });
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error("Google Docs 匯出逾時，請稍後再試。 ");
    throw new Error("無法連接 Google Docs 匯出服務。 ");
  } finally {
    clearTimeout(timeout);
  }
  let finalUrl;
  try {
    finalUrl = new URL(response.url || exportUrl);
  } catch {
    throw new Error("Google Docs 匯出回應無效。 ");
  }
  if (!isAllowedGoogleHost(finalUrl.hostname)) throw new Error("Google Docs 匯出被重新導向到不受支援的網域。 ");
  if (!response.ok) throw new Error("Google Docs 未允許匯出；請確認文件連結可供檢視。 ");
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const bytes = await readFetchBytes(response, MAX_UPLOAD_BYTES);
  const prefix = bytes.subarray(0, 512).toString("utf8").toLowerCase();
  if (contentType.includes("text/html") || /<!doctype html|<html/.test(prefix)) {
    throw new Error("Google Docs 未允許匯出；請確認文件連結可供檢視。 ");
  }
  return { bytes, contentType };
}

async function extractGoogleDocument(sourceUrl) {
  const documentId = extractGoogleDocId(sourceUrl);
  try {
    const exported = await fetchGoogleExport(documentId, "docx");
    const result = await extractLocalFile("google-doc-" + documentId + ".docx", exported.bytes);
    return {
      ...result,
      parser: "google-docs-docx-export",
      warnings: ["Google Docs 以 DOCX 匯出後提取；圖片、圖表及部分複雜公式請覆核。", ...(result.warnings || [])]
    };
  } catch (docxError) {
    try {
      const exported = await fetchGoogleExport(documentId, "txt");
      const plainText = exported.bytes.toString("utf8").replace(/\r\n/g, "\n").trim();
      if (plainText.length > MAX_INPUT_CHARS) throw new Error("提取文字超過 120,000 字元上限，請分段翻譯。 ");
      return {
        text: plainText,
        parser: "google-docs-text-export",
        warnings: ["Google Docs 未能以 DOCX 匯出，已改用純文字匯出；格式及公式請覆核。"]
      };
    } catch {
      throw new Error(docxError.message || "Google Docs 匯入失敗；請確認文件連結可供檢視，或先下載為 DOCX／PDF。 ");
    }
  }
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

function maskMath(value) {
  const formulas = [];
  const nonce = randomBytes(6).toString("hex");
  const masked = scanMath(value).map(function (part) {
    if (!part.math) return part.value;
    const token = "__MATH_BLOCK_" + nonce + "_" + String(formulas.length).padStart(3, "0") + "__";
    formulas.push({ token, formula: part.value });
    return token;
  }).join("");
  return { masked, formulas };
}

function restoreMath(value, formulas) {
  let restored = value;
  let preserved = true;
  let previousIndex = -1;
  formulas.forEach(function (item) {
    const firstIndex = restored.indexOf(item.token);
    const occurrences = restored.split(item.token).length - 1;
    if (firstIndex < 0 || occurrences !== 1 || firstIndex < previousIndex) {
      preserved = false;
      return;
    }
    previousIndex = firstIndex;
    restored = restored.split(item.token).join(item.formula);
  });
  return { restored, preserved };
}

function glossaryContext() {
  return JSON.stringify(glossaryEntries.map(function (entry) {
    return {
      category: entry.category,
      english: entry.sourceTerm,
      traditionalChinese: entry.preferred,
      aliases: entry.aliases || [],
      publishers: entry.publishers || [],
      levels: entry.levels || [],
      note: entry.note || ""
    };
  }));
}

function buildInstructions(sourceLanguage, targetLanguage, task, context) {
  const targetLabel = targetLanguage === "zh-Hant" ? "繁體中文（香港數學教材用語）" : "English";
  const safeContext = context && typeof context === "object" ? context : {};
  const grade = typeof safeContext.grade === "string" ? safeContext.grade.slice(0, 40) : "";
  const topic = typeof safeContext.topic === "string" ? safeContext.topic.slice(0, 80) : "";
  const workflow = typeof safeContext.workflow === "string" ? safeContext.workflow.slice(0, 40) : "";
  const contextLines = [
    grade ? "TARGET_GRADE: " + grade : "",
    topic ? "TARGET_TOPIC: " + topic : "",
    workflow ? "WORKFLOW: " + workflow : ""
  ].filter(Boolean);
  const hkeaaInstruction = workflow === "hkeaa"
    ? "For question instructions, prefer wording consistent with HKEAA public examination examples and keep the requested answer format explicit."
    : "";
  const shared = [
    "The source language is " + sourceLanguage + "; the target language is " + targetLabel + ".",
    "Preserve Markdown headings, lists, line breaks, punctuation structure, variable names, units, and every token beginning with __MATH_BLOCK_ and ending with __. Never translate, delete, reorder, or reformat those math tokens.",
    "Use the terminology glossary below as the first choice when the context matches. Prefer clear Hong Kong school mathematics wording. Do not invent a publisher citation or claim that a term is official unless the glossary says so.",
    hkeaaInstruction,
    contextLines.length ? "WORKFLOW CONTEXT:\n" + contextLines.join("\n") : "",
    glossaryPromptLabel + " (short terminology pairs only):",
    glossaryContext()
  ].filter(Boolean);
  if (task === "question") {
    return [
      "You are MathLingo, a careful mathematical question writer for Hong Kong secondary-school mathematics materials.",
      "Use the reference supplied by the user as a conceptual and difficulty pattern, then write one original, ready-to-use mathematics question in the target language.",
      "Change the wording, values, names, and context enough to make a genuinely new question while testing the same mathematical idea. Do not copy distinctive source wording. Prefer concise HKEAA-style question instructions when appropriate.",
      "Return only the new question. Do not include a solution, answer, marking scheme, explanation, preface, quotation marks, or code fence.",
      ...shared
    ].join("\n\n");
  }
  if (task === "lesson-plan") {
    return [
      "You are MathLingo, a careful mathematics curriculum editor for Hong Kong secondary-school materials.",
      "Turn the supplied material into a concise, usable lesson-plan draft in the target language. Preserve the mathematical meaning and all protected math tokens.",
      "Use these headings when the information is available: Learning objectives, Prior knowledge, Key vocabulary, Teaching approach, Lesson sequence, Formative assessment, Differentiation, Homework.",
      "Do not invent specific facts that are absent from the source. Mark reasonable assumptions briefly. Return only the lesson-plan draft, without a preface, commentary, quotation marks, or code fence.",
      ...shared
    ].join("\n\n");
  }
  return [
    "You are MathLingo, a careful mathematical translator and terminology editor for Hong Kong secondary-school mathematics materials.",
    "Translate only the document supplied by the user; do not answer questions about it or add an explanation.",
    ...shared,
    "Return only the translated document, with no preface, commentary, quotation marks, or code fence."
  ].join("\n\n");
}

function extractOutputText(payload, apiStyle) {
  if (apiStyle === "chat") {
    const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content
      : "";
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content.filter(function (part) {
        return part && typeof part.text === "string";
      }).map(function (part) {
        return part.text;
      }).join("").trim();
    }
    return "";
  }
  if (payload && typeof payload.output_text === "string") return payload.output_text.trim();
  const parts = [];
  for (const item of (payload && Array.isArray(payload.output) ? payload.output : [])) {
    for (const content of (item && Array.isArray(item.content) ? item.content : [])) {
      if (content && content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function stripMiniMaxThinking(value, provider) {
  if (provider !== "minimax") return value.trim();
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function translateWithProvider(config, sourceText, sourceLanguage, targetLanguage, task, context) {
  const protectedText = maskMath(sourceText);
  const input = [
    "SOURCE_LANGUAGE: " + sourceLanguage,
    "TARGET_LANGUAGE: " + targetLanguage,
    "DOCUMENT_BEGIN",
    protectedText.masked,
    "DOCUMENT_END"
  ].join("\n");

  const instructions = buildInstructions(sourceLanguage, targetLanguage, task, context);
  const requestBody = config.apiStyle === "chat"
    ? {
        model: config.model,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: input }
        ],
        ...(config.provider === "openai" || config.provider === "minimax" ? { temperature: 0.1 } : {}),
        ...(config.provider === "minimax"
          ? { thinking: { type: "adaptive" }, reasoning_split: true, max_completion_tokens: MAX_OUTPUT_TOKENS }
          : { max_tokens: MAX_OUTPUT_TOKENS })
      }
    : {
        model: config.model,
        ...(config.provider === "openai" ? { reasoning: { effort: REASONING_EFFORT } } : {}),
        instructions,
        input,
        max_output_tokens: MAX_OUTPUT_TOKENS
      };
  const headers = { "Content-Type": "application/json" };
  if (config.authToken) headers.Authorization = "Bearer " + config.authToken;

  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, MODEL_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(config.provider + " API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const payload = await upstream.json().catch(function () {
    return {};
  });
  if (!upstream.ok) {
    const errorMessage = payload && payload.error && payload.error.message ? payload.error.message : "model API request failed";
    throw new Error(config.provider + " API " + upstream.status + ": " + errorMessage);
  }

  const output = stripMiniMaxThinking(extractOutputText(payload, config.apiStyle), config.provider);
  if (!output) throw new Error(config.provider + " API returned no output");
  if (output.length > MAX_OUTPUT_CHARS) throw new Error(config.provider + " API output exceeded the limit");
  const restored = restoreMath(output, protectedText.formulas);
  if (!restored.preserved) throw new Error("Math token preservation check failed");
  return {
    translation: restored.restored,
    task,
    formulaCount: protectedText.formulas.length,
    formulaPreserved: restored.preserved,
    provider: config.provider,
    model: config.model,
    apiStyle: config.apiStyle,
    reasoningEffort: config.provider === "openai" ? REASONING_EFFORT : null
  };
}

async function handleTranslation(request, response) {
  let rawBody;
  try {
    rawBody = await readRequestBody(request);
  } catch (error) {
    jsonResponse(response, 413, { error: error.message === "request_too_large" ? "文件太大，請分段翻譯。" : "無法讀取請求。" });
    return;
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    jsonResponse(response, 400, { error: "請求格式不是有效 JSON。" });
    return;
  }

  const sourceText = typeof body.sourceText === "string" ? body.sourceText : "";
  const sourceLanguage = body.sourceLanguage === "zh-Hant" ? "zh-Hant" : body.sourceLanguage === "en" ? "en" : "";
  const targetLanguage = body.targetLanguage === "zh-Hant" ? "zh-Hant" : body.targetLanguage === "en" ? "en" : "";
  const task = requestedTask(body.task);
  const context = body.context && typeof body.context === "object" ? body.context : {};
  if (!sourceText.trim() || !sourceLanguage || !targetLanguage) {
    jsonResponse(response, 400, { error: "缺少原文或語言設定。" });
    return;
  }
  if (sourceText.length > MAX_INPUT_CHARS) {
    jsonResponse(response, 413, { error: "文件太大，請分段翻譯。" });
    return;
  }
  const provider = requestedProvider(body.provider);
  const config = getProviderConfig(provider);
  if (!config.configured) {
    const messages = {
      openai: "後端尚未設定 OpenAI API key。",
      minimax: "後端尚未設定 MINIMAX_API_KEY（或 MINIMAX_TOKEN）。",
      localai: "後端尚未設定 LOCALAI_MODEL；可先按「檢查服務」查看可用模型。",
      local: "後端尚未設定 LOCAL_LLM_BASE_URL 或 LOCAL_LLM_MODEL。"
    };
    jsonResponse(response, 503, {
      error: messages[provider] || "後端尚未完成模型設定。"
    });
    return;
  }

  try {
    const result = await translateWithProvider(config, sourceText, sourceLanguage, targetLanguage, task, context);
    jsonResponse(response, 200, {
      ...result,
      glossaryVersion: glossary.meta && glossary.meta.version ? glossary.meta.version : "unknown"
    });
  } catch (error) {
    console.error(error.message);
    jsonResponse(response, 502, { error: "AI 翻譯服務暫時不可用，請稍後再試。" });
  }
}

async function handleExtraction(request, response) {
  let body;
  try {
    body = await readJsonBody(request, MAX_EXTRACT_BODY_BYTES);
  } catch (error) {
    if (error.message === "request_too_large") {
      jsonResponse(response, 413, { error: "匯入文件超過 20 MB 上限，請分拆後再試。" });
      return;
    }
    jsonResponse(response, 400, { error: "匯入請求格式不是有效 JSON。" });
    return;
  }

  try {
    if (body && body.kind === "google-docs") {
      if (typeof body.sourceUrl !== "string" || !body.sourceUrl.trim()) {
        jsonResponse(response, 400, { error: "請提供 Google Docs 連結。" });
        return;
      }
      const result = await extractGoogleDocument(body.sourceUrl.trim());
      jsonResponse(response, 200, {
        ...result,
        fileName: "Google Docs · " + extractGoogleDocId(body.sourceUrl.trim())
      });
      return;
    }

    const fileName = typeof body?.fileName === "string" ? path.basename(body.fileName) : "";
    const data = typeof body?.data === "string" ? body.data : "";
    const extension = path.extname(fileName).toLowerCase();
    if (!fileName || ![".docx", ".pdf"].includes(extension)) {
      jsonResponse(response, 400, { error: "只支援 DOCX 或 PDF 文件。TXT、MD、TEX 可直接在瀏覽器載入。" });
      return;
    }
    if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      jsonResponse(response, 400, { error: "文件內容不是有效的 Base64 資料。" });
      return;
    }
    const fileBuffer = Buffer.from(data, "base64");
    if (!fileBuffer.length) {
      jsonResponse(response, 400, { error: "文件內容為空。" });
      return;
    }
    const result = await extractLocalFile(fileName, fileBuffer);
    jsonResponse(response, 200, { ...result, fileName });
  } catch (error) {
    console.error("MathLingo extraction:", error.message);
    jsonResponse(response, error.statusCode || 502, { error: error.message || "文件匯入失敗，請稍後再試。" });
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function resolvePublicFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const absolutePath = path.resolve(appRoot, relativePath);
  if (absolutePath !== appRoot && !absolutePath.startsWith(appRoot + path.sep)) return null;
  const extension = path.extname(absolutePath).toLowerCase();
  return MIME_TYPES[extension] ? { absolutePath, mimeType: MIME_TYPES[extension] } : null;
}

async function serveStatic(request, response, pathname) {
  const file = resolvePublicFile(pathname);
  if (!file) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const details = await stat(file.absolutePath);
    if (!details.isFile()) throw new Error("not_file");
    const contents = await readFile(file.absolutePath);
    response.writeHead(200, {
      "Content-Type": file.mimeType,
      "Cache-Control": "no-cache",
      "Content-Length": contents.length
    });
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async function (request, response) {
  const requestUrl = new URL(request.url || "/", "http://" + HOST);
  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    const openai = getProviderConfig("openai");
    const minimax = getProviderConfig("minimax");
    const localai = getProviderConfig("localai");
    const local = getProviderConfig("local");
    const active = getProviderConfig(DEFAULT_PROVIDER);
    jsonResponse(response, 200, {
      provider: DEFAULT_PROVIDER,
      configured: active.configured,
      model: active.model,
      apiStyle: active.apiStyle,
      reasoningEffort: DEFAULT_PROVIDER === "openai" ? REASONING_EFFORT : null,
      openai: {
        configured: openai.configured,
        model: openai.model,
        apiStyle: openai.apiStyle
      },
      minimax: {
        configured: minimax.configured,
        model: minimax.model,
        apiStyle: minimax.apiStyle
      },
      localai: {
        configured: localai.configured,
        model: localai.model,
        apiStyle: localai.apiStyle
      },
      local: {
        configured: local.configured,
        model: local.model,
        apiStyle: local.apiStyle
      },
      extraction: {
        docx: true,
        pdf: true,
        googleDocs: true,
        maxUploadBytes: MAX_UPLOAD_BYTES
      },
      glossaryVersion: glossary.meta && glossary.meta.version ? glossary.meta.version : "unknown"
    });
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/diagnostics") {
    await handleDiagnostics(request, response);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/extract") {
    await handleExtraction(request, response);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/translate") {
    await handleTranslation(request, response);
    return;
  }
  if (request.method === "GET") {
    await serveStatic(request, response, requestUrl.pathname);
    return;
  }
  response.writeHead(405, { Allow: "GET, POST" });
  response.end("Method not allowed");
});

server.listen(PORT, HOST, function () {
  const active = getProviderConfig(DEFAULT_PROVIDER);
  console.log("MathLingo running at http://" + HOST + ":" + PORT);
  console.log("Provider: " + DEFAULT_PROVIDER + " / model: " + (active.model || "not configured") + " / API style: " + active.apiStyle + " / credential status: " + (active.configured ? "configured" : "not configured"));
});
