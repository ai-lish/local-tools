#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'publish.allowlist.json'), 'utf8'));
const siteRoot = path.resolve(root, manifest.publicRoot);
const OFFLINE_CSP = "default-src 'self' file: data: blob: 'unsafe-inline'; connect-src 'none'; worker-src blob:; form-action 'none'";
const generatedMemberNames = new Set(['START-HERE.html', 'index.html', 'README-OFFLINE.txt', 'VERSION.json', 'LICENSES/THIRD-PARTY-NOTICES.md']);
const expected = new Set([
  ...manifest.entries.map((entry) => entry.destination.replaceAll('\\', '/')),
  ...(manifest.generatedFiles || []),
  ...(manifest.offlinePackages || []).map((item) => `downloads/${item.id}.zip`),
  'downloads/index.js',
  'downloads/SHA256SUMS.txt'
]);
const allowedCdnUrls = new Set([
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://unpkg.com/docxtemplater@3.71.0/build/docxtemplater.js',
  'https://unpkg.com/pizzip@3.2.0/dist/pizzip.js',
  'https://unpkg.com/mammoth@1.13.0/mammoth.browser.min.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://ai-lish.github.io/ai-learning/js/firebase-config.js',
  'https://ai-lish.github.io/ai-learning/js/auth-state.js',
  'https://ai-lish.github.io/ai-learning/css/auth-widget.css'
]);
const calculatorPdf = 'tools/fx-50fh-ii/output/pdf/fx-50fh-ii-s5-program-library.pdf';
const storageAccess = /\b(?:localStorage|sessionStorage|indexedDB)\b/i;
const forbiddenPath = /(?:\.map$|\.pdf$|teacher-tool-snapshot_|(^|\/)docs(?:\/|$))/i;
const forbiddenContent = [
  /navigator\.sendBeacon\s*\(/i,
  /-----BEGIN (?:RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----/i,
  /(?:ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,})/,
  /\b(?:client[_-]?secret|api[_-]?key|access[_-]?token)\s*[:=]/i
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseZip(buffer, label) {
  const minimum = Math.max(0, buffer.length - 65557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimum; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw new Error('invalid ZIP end record: ' + label);
  const disk = buffer.readUInt16LE(endOffset + 4);
  const centralDisk = buffer.readUInt16LE(endOffset + 6);
  const countOnDisk = buffer.readUInt16LE(endOffset + 8);
  const count = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  const commentLength = buffer.readUInt16LE(endOffset + 20);
  if (disk || centralDisk || countOnDisk !== count || endOffset + 22 + commentLength !== buffer.length ||
      centralOffset + centralSize !== endOffset || count > 10000) throw new Error('unsupported or malformed ZIP directory: ' + label);
  const members = [];
  const names = new Set();
  let cursor = centralOffset;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > endOffset || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('invalid ZIP central entry: ' + label);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const memberCommentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttrs = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + memberCommentLength;
    if (end > endOffset || !(flags & 0x0800) || (flags & 0x0009) || ![0, 8].includes(method) || size > 64 * 1024 * 1024) {
      throw new Error('unsupported ZIP entry flags, encoding, method or size: ' + label);
    }
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (names.has(name)) throw new Error('duplicate ZIP member: ' + name);
    names.add(name);
    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('invalid ZIP local entry: ' + name);
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localName = buffer.toString('utf8', localOffset + 30, localOffset + 30 + localNameLength);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (localFlags !== flags || localMethod !== method || localName !== name || dataEnd > centralOffset) throw new Error('ZIP local/central entry mismatch: ' + name);
    const compressed = buffer.subarray(dataStart, dataEnd);
    const bytes = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: 64 * 1024 * 1024 });
    if (bytes.length !== size || crc32(bytes) !== expectedCrc) throw new Error('ZIP size or CRC mismatch: ' + name);
    members.push({ name, bytes, mode: (externalAttrs >>> 16) & 0xffff });
    cursor = end;
  }
  if (cursor !== endOffset) throw new Error('unexpected ZIP central directory data: ' + label);
  return members;
}

function assertZipPath(name, mode, label) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) ||
      name.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('unsafe ZIP path in ' + label + ': ' + name);
  if ((mode & 0o170000) === 0o120000) throw new Error('symbolic link in ZIP: ' + label + ':' + name);
  if ((mode & 0o170000) && (mode & 0o170000) !== 0o100000) throw new Error('non-regular ZIP entry: ' + label + ':' + name);
  if (/teacher-workload/i.test(name)) throw new Error('teacher-workload path in ZIP: ' + label + ':' + name);
  if (forbiddenPath.test(name)) throw new Error('forbidden public path in ZIP: ' + label + ':' + name);
}

function injectOfflineHead(source, packageInfo, contentHash) {
  if (source.includes('window.LT_OFFLINE') || /http-equiv\s*=\s*["']Content-Security-Policy/i.test(source)) {
    throw new Error('source already contains offline metadata or CSP: ' + packageInfo.id);
  }
  const metadata = `<meta http-equiv="Content-Security-Policy" content="${OFFLINE_CSP}">\n<script>window.LT_OFFLINE=${JSON.stringify({ id: packageInfo.id, version: packageInfo.version, hash: contentHash })};</script>\n`;
  if (!/<head(?:\s[^>]*)?>/i.test(source) || !/<\/head\s*>/i.test(source)) throw new Error('offline entry has no head element: ' + packageInfo.id);
  return Buffer.from(source.replace(/<\/head\s*>/i, `${metadata}</head>`), 'utf8');
}

function assertStorageAllowed(relative, content) {
  if (storageAccess.test(content)) {
    const allowedCalculatorStorageCalls = [
      /\blocalStorage\.getItem\s*\(\s*STORAGE_KEY\s*\)/,
      /\blocalStorage\.getItem\s*\(\s*LEGACY_STORAGE_KEY\s*\)/,
      /\blocalStorage\.setItem\s*\(\s*STORAGE_KEY\s*,/
    ];
    const namespacedCalculatorStorage = relative === 'tools/fx-50fh-ii/js/studio.js' &&
      content.includes("const STORAGE_KEY = 'math-lish.local-tools.fx-50fh-ii.program-studio.v3';") &&
      content.includes("const LEGACY_STORAGE_KEY = 'math-lish.local-tools.fx-50fh-ii.program-studio.v2';") &&
      (content.match(/\blocalStorage\b/g) || []).length === allowedCalculatorStorageCalls.length &&
      allowedCalculatorStorageCalls.every((pattern) => (content.match(pattern) || []).length === 1) &&
      !/\b(?:sessionStorage|indexedDB)\b/i.test(content);
    const thankTeacherStorageCalls = [...content.matchAll(
      /\blocalStorage\.(getItem|setItem)\s*\(\s*([A-Z0-9_]+)/g
    )];
    const namespacedThankTeacherStorage = relative === 'tools/thank-teacher-cards/app.js' &&
      content.includes("var LIFE_EDU_LOCAL_KEY = 'local-tools.thank-teacher-cards.v1';") &&
      content.includes("var LIFE_EDU_DB_NAME = 'local-tools-thank-teacher-cards';") &&
      (content.match(/\blocalStorage\b/g) || []).length === 17 &&
      thankTeacherStorageCalls.length === 17 &&
      thankTeacherStorageCalls.every((match) => match[2] === 'LIFE_EDU_LOCAL_KEY') &&
      thankTeacherStorageCalls.filter((match) => match[1] === 'getItem').length === 16 &&
      thankTeacherStorageCalls.filter((match) => match[1] === 'setItem').length === 1 &&
      (content.match(/\bindexedDB\b/g) || []).length === 2 &&
      (content.match(/\bindexedDB\.open\s*\(\s*LIFE_EDU_DB_NAME\s*,\s*1\s*\)/g) || []).length === 1 &&
      !/\bsessionStorage\b/i.test(content);
    const pdfMarkingStorageCalls = [...content.matchAll(
      /\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*(getItem|setItem)\s*\(/g
    )];
    const bracketPdfMarkingStorageCalls = [...content.matchAll(
      /\b[A-Za-z_$][\w$]*\s*\[\s*['"](?:getItem|setItem)['"]\s*\]\s*\(/g
    )];
    const approvedPdfMarkingStorageCalls = [...content.matchAll(
      /\bstorage\.(getItem|setItem)\s*\(\s*(TEMPLATE_STORAGE_KEY|PREFERENCE_STORAGE_KEY)\s*(?=[,)])/g
    )];
    const namespacedPdfMarkingStorage = relative === 'tools/pdf-marking/template-store.js' &&
      content.includes('var TEMPLATE_STORAGE_KEY = "pdf-marking.templates.v1";') &&
      content.includes('var PREFERENCE_STORAGE_KEY = "pdf-marking.preferences.v1";') &&
      content.includes('var storage = host && host.localStorage;') &&
      (content.match(/\blocalStorage\b/gi) || []).length === 1 &&
      pdfMarkingStorageCalls.length === 4 &&
      bracketPdfMarkingStorageCalls.length === 0 &&
      approvedPdfMarkingStorageCalls.length === pdfMarkingStorageCalls.length &&
      approvedPdfMarkingStorageCalls.filter((match) => match[1] === 'getItem').length === 2 &&
      approvedPdfMarkingStorageCalls.filter((match) => match[1] === 'setItem').length === 2 &&
      !/\b(?:sessionStorage|indexedDB)\b/i.test(content);
    if (!namespacedCalculatorStorage && !namespacedThankTeacherStorage && !namespacedPdfMarkingStorage) {
      throw new Error('unapproved browser storage in public file: ' + relative);
    }
  }
}

async function walk(current, relative = '') {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    const nextRelative = relative ? path.join(relative, entry.name) : entry.name;
    const info = await lstat(fullPath);
    if (info.isSymbolicLink()) {
      throw new Error('symbolic link in public site: ' + nextRelative);
    }
    if (info.isDirectory()) {
      files.push(...await walk(fullPath, nextRelative));
    } else if (info.isFile()) {
      files.push({ fullPath, relative: nextRelative.split(path.sep).join('/') });
    }
  }
  return files;
}

if (!Array.isArray(manifest.entries) || !Array.isArray(manifest.generatedFiles)) {
  throw new Error('invalid public manifest');
}

const files = await walk(siteRoot);
const actual = new Set(files.map((file) => file.relative));
const unexpected = [...actual].filter((file) => !expected.has(file));
const missing = [...expected].filter((file) => !actual.has(file));
if (unexpected.length || missing.length) {
  throw new Error('Public allowlist mismatch; unexpected=' + unexpected.join(',') + ' missing=' + missing.join(','));
}

if (!Array.isArray(manifest.offlinePackages)) throw new Error('offlinePackages must be an explicit array.');
const fileMap = new Map(files.map((file) => [file.relative, file]));
const offlineLock = JSON.parse(await readFile(path.join(siteRoot, 'offline.lock.json'), 'utf8'));
if (offlineLock.version !== 1 || !offlineLock.packages || typeof offlineLock.packages !== 'object') throw new Error('invalid offline.lock.json');
const zipDigests = new Map();
for (const packageInfo of manifest.offlinePackages) {
  const lock = offlineLock.packages[packageInfo.id];
  if (!lock || lock.version !== packageInfo.version || !Array.isArray(packageInfo.entries) || !packageInfo.entries.length ||
      !Array.isArray(packageInfo.files) || !packageInfo.files.length ||
      packageInfo.transforms?.injectOfflineHead !== true || Object.keys(packageInfo.transforms || {}).some((key) => key !== 'injectOfflineHead')) {
    throw new Error('invalid offline package or lock entry: ' + packageInfo.id);
  }
  const rows = [];
  let sourceByteLength = 0;
  for (const name of packageInfo.files) {
    const sourceFile = fileMap.get(name);
    if (!sourceFile) throw new Error('offline package source is not in exact site output: ' + packageInfo.id + ':' + name);
    const source = await readFile(sourceFile.fullPath);
    sourceByteLength += source.length;
    rows.push(`${name}\t${sha256(source)}\n`);
  }
  const contentHash = createHash('sha256').update(rows.sort().join('')).digest('hex').slice(0, 12);
  if (contentHash !== lock.contentHash || packageInfo.files.length !== lock.fileCount || sourceByteLength !== lock.byteLength) {
    throw new Error('offline lock content hash mismatch: ' + packageInfo.id);
  }
  const archivePath = `downloads/${packageInfo.id}.zip`;
  const archiveBytes = await readFile(fileMap.get(archivePath).fullPath);
  zipDigests.set(`${packageInfo.id}.zip`, sha256(archiveBytes));
  const members = parseZip(archiveBytes, archivePath);
  const memberMap = new Map();
  for (const member of members) {
    assertZipPath(member.name, member.mode, packageInfo.id);
    memberMap.set(member.name, member);
  }
  const expectedMembers = new Set([...packageInfo.files, ...generatedMemberNames]);
  if (memberMap.size !== expectedMembers.size || [...expectedMembers].some((name) => !memberMap.has(name))) {
    throw new Error('ZIP member set mismatch for ' + packageInfo.id + '; expected=' + [...expectedMembers].join(',') + ' actual=' + [...memberMap.keys()].join(','));
  }
  if (sha256(memberMap.get('index.html').bytes) !== sha256(memberMap.get('START-HERE.html').bytes)) {
    throw new Error('generated ZIP index.html differs from START-HERE.html: ' + packageInfo.id);
  }
  for (const name of packageInfo.files) {
    const member = memberMap.get(name);
    const source = await readFile(fileMap.get(name).fullPath);
    const expectedBytes = packageInfo.transforms.injectOfflineHead && packageInfo.entries.includes(name)
      ? injectOfflineHead(source.toString('utf8'), packageInfo, contentHash) : source;
    if (sha256(member.bytes) !== sha256(expectedBytes)) throw new Error('ZIP member differs from site source/approved transform: ' + packageInfo.id + ':' + name);
  }
  for (const member of members) {
    if (forbiddenPath.test(member.name)) throw new Error('forbidden public path in ZIP: ' + packageInfo.id + ':' + member.name);
    if (member.name.endsWith('.zip')) throw new Error('nested ZIP is not a declared package member: ' + member.name);
    if (member.name.endsWith('.html') || /\.(?:txt|md|json|js|css|svg|xml)$/i.test(member.name)) {
      const text = member.bytes.toString('utf8');
      if (text.includes('teacher-workload')) throw new Error('teacher-workload string in ZIP member: ' + packageInfo.id + ':' + member.name);
      assertStorageAllowed(member.name, text);
      for (const pattern of forbiddenContent) if (pattern.test(text)) throw new Error('forbidden public content in ZIP member ' + member.name + ': ' + pattern);
      const resourceUrls = [...text.matchAll(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/giu)].map((match) => match[1]);
      for (const url of resourceUrls) if (!allowedCdnUrls.has(url)) throw new Error('unapproved external resource in ZIP member ' + member.name + ': ' + url);
    }
  }
}
if (Object.keys(offlineLock.packages).sort().join('\n') !== manifest.offlinePackages.map((item) => item.id).sort().join('\n')) {
  throw new Error('offline.lock.json package set differs from offlinePackages');
}
const sums = await readFile(fileMap.get('downloads/SHA256SUMS.txt').fullPath, 'utf8');
const expectedSums = [...zipDigests.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, hash]) => `${hash}  ${name}`).join('\n') + '\n';
if (sums !== expectedSums) throw new Error('downloads/SHA256SUMS.txt does not match generated ZIP files');

for (const file of files) {
  if (forbiddenPath.test(file.relative) && file.relative !== calculatorPdf) {
    throw new Error('forbidden public path: ' + file.relative);
  }
  if (file.relative === '.nojekyll') continue;
  if (file.relative.endsWith('.zip')) continue; // The archive is parsed and validated member by member above.

  const content = await readFile(file.fullPath, 'utf8');
  assertStorageAllowed(file.relative, content);
  for (const pattern of forbiddenContent) {
    if (pattern.test(content)) {
      throw new Error('forbidden public content in ' + file.relative + ': ' + pattern);
    }
  }

  const resourceUrls = [...content.matchAll(
    /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/giu
  )].map((match) => match[1]);
  for (const url of resourceUrls) {
    if (!allowedCdnUrls.has(url)) {
      throw new Error('unapproved external resource in ' + file.relative + ': ' + url);
    }
  }

  if (file.relative === 'tools/slp-split-pdf/index.html') {
    const urls = [...content.matchAll(/https?:\/\/[^\s"'<>]+/gu)].map(([url]) => url);
    for (const url of urls) {
      if (!allowedCdnUrls.has(url)) {
        throw new Error('unapproved external URL in CloudSAMS HTML: ' + url);
      }
    }
  }
}

const offlineTool = files.find((file) => file.relative === 'teacher-workload/教師人力與行政架構工具_單檔離線版.html');
if (!offlineTool) {
  throw new Error('sanitized teacher workload tool is missing');
}
const teacherTool = await readFile(offlineTool.fullPath, 'utf8');
if (!teacherTool.includes('window.TeacherTool') || !teacherTool.includes('window.AdminStructureTool')) {
  throw new Error('the offline teacher tool exports are missing');
}

console.log('Public mirror guard passed (' + files.length + ' exact files).');
