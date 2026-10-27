const PROPERTY_KEYS = Object.freeze({
  spreadsheetId: 'REPORT_SHEET_ID',
  screenshotFolderId: 'SCREENSHOT_FOLDER_ID',
  googleClientId: 'GOOGLE_CLIENT_ID'
});

const PUBLIC_HEADERS = Object.freeze([
  'report_id', 'created_at', 'model', 'category', 'subcategory', 'summary',
  'status', 'fix_version', 'votes', 'version', 'source_commit', 'client_time', 'replay_json'
]);
const PRIVATE_HEADERS = Object.freeze([
  'report_id', 'email', 'account_hash', 'created_at', 'screenshot_url'
]);
const VOTE_HEADERS = Object.freeze([
  'report_id', 'account_hash', 'email', 'created_at'
]);
const CATEGORY_OPTIONS = Object.freeze({
  feature: ['basic', 'fraction', 'trigonometry', 'complex', 'statistics', 'programming', 'other'],
  button: ['no-response', 'label-position', 'keyboard-map', 'mode-key', 'other'],
  display: ['digit-symbol', 'result-format', 'mode-indicator', 'mobile-layout', 'other'],
  calculation: ['wrong-result', 'edge-case', 'error-message', 'ans-memory', 'other']
});
const ALLOWED_MODELS = Object.freeze(['fx-50FH II', 'fx-3650P']);
const MAX_BODY_CHARS = 480000;
const MAX_SCREENSHOT_BYTES = 300000;
const MAX_SCREENSHOT_BASE64_CHARS = 400000;
const MAX_REPLAY_KEYS = 200;
const MAX_SUMMARY_CHARS = 160;
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_JWKS_CACHE_KEY = 'google_id_token_jwks_v1';
const GOOGLE_JWKS_REFRESH_COOLDOWN_KEY = 'google_id_token_jwks_refresh_cooldown_v1';
const GOOGLE_JWKS_LAST_UNKNOWN_KID_KEY = 'google_id_token_jwks_last_unknown_kid_v1';
const GOOGLE_JWKS_REFRESH_COOLDOWN_SECONDS = 60;

function authorizeServices() {
  const properties = PropertiesService.getScriptProperties();
  const config = readRequiredProperties_(properties);
  SpreadsheetApp.openById(config.spreadsheetId).getName();
  DriveApp.getFolderById(config.screenshotFolderId).getName();
  UrlFetchApp.fetch(GOOGLE_JWKS_URL, { method: 'get', muteHttpExceptions: true });
}

function doGet() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty(PROPERTY_KEYS.spreadsheetId);
    if (!spreadsheetId) return jsonOutput_({ ok: false, error: 'NOT_CONFIGURED' });
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName('Reports');
    if (!sheet || sheet.getLastRow() < 2) return jsonOutput_({ ok: true, reports: [] });

    const lastRow = sheet.getLastRow();
    const firstRow = Math.max(2, lastRow - 199);
    const header = sheet.getRange(1, 1, 1, PUBLIC_HEADERS.length).getValues()[0].map(String);
    assertHeaders_(header, PUBLIC_HEADERS);
    const index = headerIndex_(header);
    const recentRange = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, PUBLIC_HEADERS.length);
    const recentRows = recentRange.getValues();
    const recentFormulas = recentRange.getFormulas();
    const reports = recentRows.map((row, rowIndex) => {
      if (recentFormulas[rowIndex].some(Boolean)) return null;
      return {
        id: safeString_(row[index.report_id], 64),
        model: safeString_(row[index.model], 24),
        category: safeString_(row[index.category], 24),
        subcategory: safeString_(row[index.subcategory], 32),
        summary: safeString_(restoreSheetText_(row[index.summary]), MAX_SUMMARY_CHARS),
        status: normalizeStatus_(row[index.status]),
        fixVersion: safeString_(restoreSheetText_(row[index.fix_version]), 32),
        votes: Math.max(0, Number(row[index.votes]) || 0),
        sortTime: row[index.created_at] instanceof Date ? row[index.created_at].getTime() : Date.parse(row[index.created_at]) || 0
      };
    }).filter((report) => report && report.id && ALLOWED_MODELS.includes(report.model));
    reports.sort((left, right) => right.sortTime - left.sortTime);
    return jsonOutput_({ ok: true, reports: reports.slice(0, 200).map((report) => ({
      id: report.id,
      model: report.model,
      category: report.category,
      subcategory: report.subcategory,
      summary: report.summary,
      status: report.status,
      fixVersion: report.fixVersion,
      votes: report.votes
    })) });
  } catch (_) {
    return jsonOutput_({ ok: false, error: 'LIST_UNAVAILABLE' });
  }
}

function doPost(event) {
  let lock;
  try {
    const body = event && event.postData && event.postData.contents;
    const contentType = String(event && event.postData && event.postData.type || '').toLowerCase();
    if (!body || body.length > MAX_BODY_CHARS || !contentType.startsWith('text/plain')) {
      return jsonOutput_({ ok: false, error: 'INVALID_REQUEST' });
    }
    const payload = JSON.parse(body);
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      return jsonOutput_({ ok: false, error: 'INVALID_REQUEST' });
    }
    if (payload.action === 'submit') {
      assertKeys_(payload, [
        'action', 'idToken', 'model', 'category', 'subcategory', 'summary', 'replay',
        'screenshot', 'version', 'sourceCommit', 'clientTime'
      ]);
    } else if (payload.action === 'vote') {
      assertKeys_(payload, ['action', 'idToken', 'reportId']);
    } else {
      return jsonOutput_({ ok: false, error: 'INVALID_ACTION' });
    }
    const properties = PropertiesService.getScriptProperties();
    const config = readRequiredProperties_(properties);
    const identity = verifyGoogleIdToken_(payload.idToken, config.googleClientId);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return jsonOutput_({ ok: false, error: 'BUSY' });

    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    let result;
    if (payload.action === 'submit') {
      result = submitReport_(payload, identity, spreadsheet, config.screenshotFolderId);
    } else {
      result = voteReport_(payload, identity, spreadsheet);
    }
    SpreadsheetApp.flush();
    return jsonOutput_(result);
  } catch (error) {
    if (lock && lock.hasLock()) {
      try { SpreadsheetApp.flush(); } catch (_) { /* Return the request error while retaining the lock. */ }
    }
    return jsonOutput_({ ok: false, error: safeErrorCode_(error) });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function submitReport_(payload, identity, spreadsheet, screenshotFolderId) {
  validateReport_(payload);
  const publicSheet = ensureSheet_(spreadsheet, 'Reports', PUBLIC_HEADERS);
  const privateSheet = ensureSheet_(spreadsheet, 'Private', PRIVATE_HEADERS);
  assertRateLimit_(privateSheet, 3, 4, identity.accountHash, 5, 24 * 60 * 60 * 1000, 'submit');

  const reportId = Utilities.getUuid();
  const createdAt = new Date();
  const screenshotBytes = Utilities.base64Decode(payload.screenshot.base64);
  if (screenshotBytes.length > MAX_SCREENSHOT_BYTES || screenshotBytes.length !== payload.screenshot.bytes) {
    throw apiError_('SCREENSHOT_TOO_LARGE');
  }
  const extension = payload.screenshot.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const blob = Utilities.newBlob(screenshotBytes, payload.screenshot.mimeType,
    `calculator-${reportId}.${extension}`);
  const folder = DriveApp.getFolderById(screenshotFolderId);
  let file;
  let privateRow = 0;
  let publicRow = 0;
  try {
    file = folder.createFile(blob);
    privateRow = privateSheet.getLastRow() + 1;
    privateSheet.appendRow([
      reportId, escapeSheetFormula_(identity.email), identity.accountHash, createdAt, file.getUrl()
    ]);
    publicRow = publicSheet.getLastRow() + 1;
    publicSheet.appendRow([
      reportId, createdAt, payload.model, payload.category, payload.subcategory,
      payload.summary.trim(), 'received', '', 0, payload.version.trim(),
      payload.sourceCommit.toLowerCase(), payload.clientTime, JSON.stringify(payload.replay)
    ].map(escapeSheetFormula_));
  } catch (_) {
    if (publicRow && publicSheet.getLastRow() >= publicRow) publicSheet.deleteRow(publicRow);
    if (privateRow && privateSheet.getLastRow() >= privateRow) privateSheet.deleteRow(privateRow);
    if (file) file.setTrashed(true);
    throw apiError_('WRITE_FAILED');
  }
  incrementRateCache_(identity.accountHash, 'submit');
  return { ok: true, id: reportId };
}

function voteReport_(payload, identity, spreadsheet) {
  if (!isUuid_(payload.reportId)) throw apiError_('INVALID_REPORT');
  const publicSheet = ensureSheet_(spreadsheet, 'Reports', PUBLIC_HEADERS);
  const voteSheet = ensureSheet_(spreadsheet, 'Votes', VOTE_HEADERS);
  const reportRow = findReportRow_(publicSheet, payload.reportId);
  if (!reportRow) throw apiError_('REPORT_NOT_FOUND');
  if (hasVote_(voteSheet, payload.reportId, identity.accountHash)) throw apiError_('ALREADY_VOTED');
  assertRateLimit_(voteSheet, 2, 4, identity.accountHash, 50, 24 * 60 * 60 * 1000, 'vote');

  const voteRow = voteSheet.getLastRow() + 1;
  const votesColumn = PUBLIC_HEADERS.indexOf('votes') + 1;
  try {
    voteSheet.appendRow([
      payload.reportId, identity.accountHash, escapeSheetFormula_(identity.email), new Date()
    ]);
    const previousVotes = Math.max(0, Number(publicSheet.getRange(reportRow, votesColumn).getValue()) || 0);
    publicSheet.getRange(reportRow, votesColumn).setValue(previousVotes + 1);
  } catch (_) {
    if (voteSheet.getLastRow() >= voteRow) voteSheet.deleteRow(voteRow);
    throw apiError_('WRITE_FAILED');
  }
  incrementRateCache_(identity.accountHash, 'vote');
  return { ok: true };
}

function validateReport_(payload) {
  if (!ALLOWED_MODELS.includes(payload.model)) throw apiError_('INVALID_MODEL');
  if (!Object.prototype.hasOwnProperty.call(CATEGORY_OPTIONS, payload.category) ||
      !CATEGORY_OPTIONS[payload.category].includes(payload.subcategory)) {
    throw apiError_('INVALID_CATEGORY');
  }
  if (typeof payload.summary !== 'string' || [...payload.summary].length > MAX_SUMMARY_CHARS ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(payload.summary)) {
    throw apiError_('INVALID_SUMMARY');
  }
  if (!Array.isArray(payload.replay) || payload.replay.length > MAX_REPLAY_KEYS) {
    throw apiError_('INVALID_REPLAY');
  }
  let previousAt = -1;
  for (const entry of payload.replay) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw apiError_('INVALID_REPLAY');
    assertKeys_(entry, ['id', 'at']);
    if (typeof entry.id !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(entry.id) ||
        !Number.isSafeInteger(entry.at) || entry.at < previousAt || entry.at > 3600000) {
      throw apiError_('INVALID_REPLAY');
    }
    previousAt = entry.at;
  }
  if (typeof payload.version !== 'string' || payload.version.length > 32 || !payload.version.trim()) {
    throw apiError_('INVALID_VERSION');
  }
  if (typeof payload.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/i.test(payload.sourceCommit)) {
    throw apiError_('INVALID_VERSION');
  }
  if (typeof payload.clientTime !== 'string' || payload.clientTime.length > 40 || !Number.isFinite(Date.parse(payload.clientTime))) {
    throw apiError_('INVALID_TIME');
  }
  if (!payload.screenshot || typeof payload.screenshot !== 'object' || Array.isArray(payload.screenshot)) {
    throw apiError_('INVALID_SCREENSHOT');
  }
  assertKeys_(payload.screenshot, ['mimeType', 'base64', 'bytes']);
  if (!['image/webp', 'image/jpeg'].includes(payload.screenshot.mimeType) ||
      typeof payload.screenshot.base64 !== 'string' ||
      payload.screenshot.base64.length > MAX_SCREENSHOT_BASE64_CHARS ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.screenshot.base64) ||
      !Number.isSafeInteger(payload.screenshot.bytes) || payload.screenshot.bytes < 1 ||
      payload.screenshot.bytes > MAX_SCREENSHOT_BYTES) {
    throw apiError_('INVALID_SCREENSHOT');
  }
}

function verifyGoogleIdToken_(idToken, expectedClientId) {
  if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 10000) {
    throw apiError_('AUTH_REQUIRED');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) throw apiError_('AUTH_INVALID');
  let header;
  let claims;
  try {
    header = JSON.parse(base64UrlText_(parts[0]));
    claims = JSON.parse(base64UrlText_(parts[1]));
  } catch (_) { throw apiError_('AUTH_INVALID'); }
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid)) {
    throw apiError_('AUTH_INVALID');
  }
  let key = findGoogleKey_(header.kid, false);
  if (!key) key = findGoogleKey_(header.kid, true);
  if (!key || !verifyRsaSha256_(parts[0] + '.' + parts[1], parts[2], key)) {
    throw apiError_('AUTH_INVALID');
  }
  const expiry = Number(claims.exp);
  const issuer = claims.iss;
  if (claims.aud !== expectedClientId ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(issuer) ||
      !Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000) ||
      typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 255 ||
      typeof claims.email !== 'string' || claims.email.length > 254 ||
      !['true', true].includes(claims.email_verified)) {
    throw apiError_('AUTH_INVALID');
  }
  return { email: claims.email, accountHash: accountHash_(claims.sub) };
}

function findGoogleKey_(keyId, forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (forceRefresh && cache.get(GOOGLE_JWKS_LAST_UNKNOWN_KID_KEY) === keyId) return null;
  let content = forceRefresh ? '' : cache.get(GOOGLE_JWKS_CACHE_KEY);
  if (content) {
    const cachedKey = googleKeyFromJwks_(content, keyId);
    if (cachedKey || !forceRefresh) return cachedKey;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return null;
  try {
    if (forceRefresh && cache.get(GOOGLE_JWKS_LAST_UNKNOWN_KID_KEY) === keyId) return null;
    if (!forceRefresh) {
      content = cache.get(GOOGLE_JWKS_CACHE_KEY);
      if (content) return googleKeyFromJwks_(content, keyId);
    }
    if (cache.get(GOOGLE_JWKS_REFRESH_COOLDOWN_KEY)) {
      if (forceRefresh) {
        cache.put(GOOGLE_JWKS_LAST_UNKNOWN_KID_KEY, keyId, GOOGLE_JWKS_REFRESH_COOLDOWN_SECONDS);
      }
      return null;
    }

    cache.put(GOOGLE_JWKS_REFRESH_COOLDOWN_KEY, '1', GOOGLE_JWKS_REFRESH_COOLDOWN_SECONDS);
    const response = UrlFetchApp.fetch(GOOGLE_JWKS_URL, { method: 'get', muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw apiError_('AUTH_UNAVAILABLE');
    content = response.getContentText();
    cache.put(GOOGLE_JWKS_CACHE_KEY, content, jwksCacheTtl_(response));
    const key = googleKeyFromJwks_(content, keyId);
    if (forceRefresh && !key) {
      cache.put(GOOGLE_JWKS_LAST_UNKNOWN_KID_KEY, keyId, GOOGLE_JWKS_REFRESH_COOLDOWN_SECONDS);
    }
    return key;
  } finally {
    lock.releaseLock();
  }
}

function googleKeyFromJwks_(content, keyId) {
  let jwks;
  try { jwks = JSON.parse(content); }
  catch (_) { throw apiError_('AUTH_UNAVAILABLE'); }
  if (!jwks || !Array.isArray(jwks.keys)) throw apiError_('AUTH_UNAVAILABLE');
  return jwks.keys.find((key) => key.kid === keyId && key.kty === 'RSA' &&
    (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256')) || null;
}

function jwksCacheTtl_(response) {
  const headers = response.getHeaders ? response.getHeaders() : {};
  const key = Object.keys(headers).find((name) => name.toLowerCase() === 'cache-control');
  const match = key ? String(headers[key]).match(/(?:^|,\s*)max-age=(\d+)/i) : null;
  const maxAge = match ? Number(match[1]) : 3600;
  return Math.max(1, Math.min(21600, maxAge));
}

function base64UrlText_(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw apiError_('AUTH_INVALID');
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
}

function verifyRsaSha256_(signingInput, signature, jwk) {
  if (typeof jwk.n !== 'string' || typeof jwk.e !== 'string' || typeof signature !== 'string') return false;
  const modulusBytes = Utilities.base64DecodeWebSafe(jwk.n + '='.repeat((4 - jwk.n.length % 4) % 4));
  const exponentBytes = Utilities.base64DecodeWebSafe(jwk.e + '='.repeat((4 - jwk.e.length % 4) % 4));
  const signatureBytes = Utilities.base64DecodeWebSafe(signature + '='.repeat((4 - signature.length % 4) % 4));
  if (modulusBytes.length < 256 || modulusBytes.length > 1024 ||
      exponentBytes.length < 1 || exponentBytes.length > 8 || signatureBytes.length !== modulusBytes.length) {
    return false;
  }

  const modulus = bytesToBigInt_(modulusBytes);
  const exponent = bytesToBigInt_(exponentBytes);
  const signatureNumber = bytesToBigInt_(signatureBytes);
  if (signatureNumber >= modulus || exponent < BigInt(3)) return false;
  const encoded = modPow_(signatureNumber, exponent, modulus);
  const encodedHex = bigIntToFixedHex_(encoded, modulusBytes.length);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signingInput, Utilities.Charset.UTF_8);
  const digestInfo = '3031300d060960864801650304020105000420' + bytesToHex_(digest);
  if (!encodedHex.startsWith('0001')) return false;
  const separator = encodedHex.indexOf('00', 4);
  if (separator < 20 || !/^(?:ff){8,}$/i.test(encodedHex.slice(4, separator))) return false;
  return encodedHex.slice(separator + 2) === digestInfo;
}

function bytesToBigInt_(bytes) {
  let result = BigInt(0);
  const base = BigInt(256);
  for (const value of bytes) result = result * base + BigInt((value + 256) % 256);
  return result;
}

function modPow_(base, exponent, modulus) {
  let result = BigInt(1);
  let factor = base % modulus;
  let power = exponent;
  const zero = BigInt(0);
  const one = BigInt(1);
  const two = BigInt(2);
  while (power > zero) {
    if (power % two === one) result = (result * factor) % modulus;
    power = power / two;
    factor = (factor * factor) % modulus;
  }
  return result;
}

function bigIntToFixedHex_(value, byteLength) {
  let hex = value.toString(16);
  const expectedLength = byteLength * 2;
  while (hex.length < expectedLength) hex = '0' + hex;
  return hex;
}

function bytesToHex_(bytes) {
  return bytes.map((value) => ((value + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function readRequiredProperties_(properties) {
  const config = {
    spreadsheetId: properties.getProperty(PROPERTY_KEYS.spreadsheetId),
    screenshotFolderId: properties.getProperty(PROPERTY_KEYS.screenshotFolderId),
    googleClientId: properties.getProperty(PROPERTY_KEYS.googleClientId)
  };
  if (!config.spreadsheetId || !config.screenshotFolderId || !config.googleClientId) {
    throw apiError_('NOT_CONFIGURED');
  }
  return config;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }
  const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(String);
  assertHeaders_(actual, headers);
  return sheet;
}

function assertHeaders_(actual, expected) {
  if (actual.length !== expected.length || expected.some((value, index) => actual[index] !== value)) {
    throw apiError_('SHEET_SCHEMA_MISMATCH');
  }
}

function headerIndex_(headers) {
  return headers.reduce((result, key, index) => { result[key] = index; return result; }, {});
}

function findReportRow_(sheet, reportId) {
  if (sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const index = values.findIndex((row) => String(row[0]) === reportId);
  return index < 0 ? 0 : index + 2;
}

function hasVote_(sheet, reportId, accountHash) {
  if (sheet.getLastRow() < 2) return false;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  return rows.some((row) => String(row[0]) === reportId && String(row[1]) === accountHash);
}

function assertRateLimit_(sheet, accountColumn, timeColumn, accountHash, limit, windowMs, action) {
  const cacheKey = `rate_${action}_${accountHash}`;
  let cached = 0;
  try { cached = Number(CacheService.getScriptCache().get(cacheKey) || 0); } catch (_) { cached = 0; }
  const since = Date.now() - windowMs;
  let recent = 0;
  if (sheet.getLastRow() >= 2) {
    const width = Math.max(accountColumn, timeColumn);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
    recent = rows.reduce((count, row) => {
      const timestamp = row[timeColumn - 1] instanceof Date ? row[timeColumn - 1].getTime() : Date.parse(row[timeColumn - 1]);
      return count + (String(row[accountColumn - 1]) === accountHash && Number.isFinite(timestamp) && timestamp >= since ? 1 : 0);
    }, 0);
  }
  if (Math.max(recent, cached) >= limit) throw apiError_('RATE_LIMIT');
}

function incrementRateCache_(accountHash, action) {
  try {
    const cache = CacheService.getScriptCache();
    const key = `rate_${action}_${accountHash}`;
    cache.put(key, String(Number(cache.get(key) || 0) + 1), 21600);
  } catch (_) {
    // The private sheet ledger remains the rate-limit source of truth.
  }
}

function accountHash_(subject) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, subject, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function normalizeStatus_(value) {
  const status = String(value || 'received');
  return ['received', 'processing', 'fixed'].includes(status) ? status : 'received';
}

function safeString_(value, maxLength) {
  return String(value == null ? '' : value).slice(0, maxLength);
}

function escapeSheetFormula_(value) {
  if (typeof value !== 'string') return value;
  const significant = value.replace(/^[\s\u200B-\u200F\u2060-\u206F\uFEFF]+/, '');
  return /^[=+\-@]/.test(significant) ? `\u200B${value}` : value;
}

function restoreSheetText_(value) {
  const text = String(value == null ? '' : value);
  return text.startsWith('\u200B') ? text.slice(1) : text;
}

function isUuid_(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function assertKeys_(object, allowed) {
  const keys = Object.keys(object);
  if (keys.some((key) => !allowed.includes(key))) throw apiError_('INVALID_FIELDS');
}

function apiError_(code) {
  const error = new Error(code);
  error.publicCode = code;
  return error;
}

function safeErrorCode_(error) {
  const code = error && error.publicCode;
  return typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : 'REQUEST_FAILED';
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
