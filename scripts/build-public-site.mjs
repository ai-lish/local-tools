#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'publish.allowlist.json'), 'utf8'));
const siteRoot = path.resolve(root, manifest.publicRoot);
const OFFLINE_CSP = "default-src 'self' file: data: blob: 'unsafe-inline'; connect-src 'none'; worker-src blob:; form-action 'none'";

function assertRelative(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') ||
      path.posix.isAbsolute(value) || value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(label + ' is not a safe relative path: ' + value);
  }
}

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

function dosDateTime() {
  return { date: 33, time: 0 }; // 1980-01-01 00:00:00, the ZIP epoch.
}

function makeZip(entries) {
  const localParts = [];
  const directoryParts = [];
  const stamp = dosDateTime();
  let offset = 0;
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    assertRelative(entry.name, 'ZIP member');
    const name = Buffer.from(entry.name, 'utf8');
    const plain = Buffer.from(entry.bytes);
    const compressed = deflateRawSync(plain, { level: 9 });
    const crc = crc32(plain);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(plain.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0o100644 * 0x10000, 38);
    central.writeUInt32LE(offset, 42);
    directoryParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(directoryParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, directory, end]);
}

function htmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function toolTitle(file) {
  if (file.startsWith('tools/image-upscaler/')) return '圖片像素提升工具';
  if (file.startsWith('tools/photo-merge/')) return '相機圖片合併工具';
  return file;
}

function startHere(packageInfo) {
  const links = packageInfo.entries.map((entry) => {
    return `<li><a href="${htmlEscape(entry)}">${htmlEscape(toolTitle(entry))}</a></li>`;
  }).join('\n');
  return `<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${htmlEscape(packageInfo.title)}｜離線套件</title>\n<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:36px auto;padding:0 18px;color:#18334b;line-height:1.65}main{border:1px solid #d7e1e9;border-radius:16px;padding:24px}a{color:#075b91;font-weight:700}small{color:#526779}</style>\n</head>\n<body><main><h1>${htmlEscape(packageInfo.title)}</h1><p>離線版 ${htmlEscape(packageInfo.version)}（${htmlEscape(packageInfo.contentHash)}）</p><p>資料由本機瀏覽器處理；本頁的內容安全政策封鎖對外連線。</p><ul>${links}</ul><p><small>請完整解壓 ZIP 後再開啟工具頁。</small></p></main></body>\n</html>\n`;
}

function readmeOffline(packageInfo) {
  return `LOCAL TOOLS OFFLINE PACKAGE\n\nPackage: ${packageInfo.id}\nVersion: ${packageInfo.version}\nContent hash: ${packageInfo.contentHash}\n\nOPENING\n1. Extract the complete ZIP to a local folder. Do not open HTML inside the ZIP preview.\n2. Double-click START-HERE.html, then open the listed tool. You may also double-click a tool index.html directly.\n3. The offline pages use a Content Security Policy that blocks network connections.\n\nPRIVATE DATA\n- Files are processed by your local browser; no network connection is required.\n- Chrome may share file:// browser storage between local HTML pages. Do not open untrusted local HTML in a browser profile that contains sensitive records.\n- Use each tool's export or backup function as the authoritative copy of important records.\n- On a shared computer, clear browser site data when finished.\n\n繁體中文\n1. 請先把整個 ZIP 完整解壓到本機資料夾，不要在 ZIP 預覽畫面直接開啟 HTML。\n2. 雙擊 START-HERE.html，再開啟清單中的工具；亦可直接雙擊工具 index.html。\n3. 離線頁面使用內容安全政策封鎖網絡連線，不需登入或安裝。\n4. Chrome 的 file:// 頁面可能共用瀏覽器儲存空間；不要在存有敏感記錄的瀏覽器設定檔開啟來歷不明的本機 HTML。\n5. 重要記錄請以工具匯出／備份為準；公用電腦使用後請清除瀏覽器網站資料。\n`;
}

function notices() {
  return 'Third-party notices\n\nThis Stage 0 package contains no third-party runtime libraries.\n';
}

function injectOfflineHead(source, packageInfo) {
  if (!/<head(?:\s[^>]*)?>/i.test(source) || !/<\/head\s*>/i.test(source)) {
    throw new Error(`offline entry has no complete head element: ${packageInfo.id}`);
  }
  if (source.includes('window.LT_OFFLINE') || /http-equiv\s*=\s*["']Content-Security-Policy/i.test(source)) {
    throw new Error(`offline entry already contains offline metadata or CSP: ${packageInfo.id}`);
  }
  const metadata = `<meta http-equiv="Content-Security-Policy" content="${OFFLINE_CSP}">\n<script>window.LT_OFFLINE=${JSON.stringify({ id: packageInfo.id, version: packageInfo.version, hash: packageInfo.contentHash })};</script>\n`;
  return source.replace(/<\/head\s*>/i, `${metadata}</head>`);
}

if (manifest.version !== 1 || manifest.publicRoot !== 'site' ||
    !Array.isArray(manifest.entries) || !Array.isArray(manifest.generatedFiles) ||
    !Array.isArray(manifest.offlinePackages)) {
  throw new Error('invalid publish manifest');
}

await rm(siteRoot, { recursive: true, force: true });
await mkdir(siteRoot, { recursive: true });
for (const entry of manifest.entries) {
  assertRelative(entry.source, 'source');
  assertRelative(entry.destination, 'destination');
  const sourcePath = path.resolve(root, entry.source);
  const destinationPath = path.resolve(siteRoot, entry.destination);
  const sourceStat = await lstat(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error('allowlisted source is not a regular file: ' + entry.source);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

for (const generated of manifest.generatedFiles) assertRelative(generated, 'generated file');
if (manifest.generatedFiles.length !== 1 || manifest.generatedFiles[0] !== '.nojekyll') {
  throw new Error('generatedFiles must contain only .nojekyll');
}
await writeFile(path.join(siteRoot, '.nojekyll'), '');

const offlineLock = JSON.parse(await readFile(path.join(root, 'offline.lock.json'), 'utf8'));
if (offlineLock.version !== 1 || !offlineLock.packages || typeof offlineLock.packages !== 'object') {
  throw new Error('invalid offline.lock.json');
}
const downloads = [];
for (const packageInfo of manifest.offlinePackages) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(packageInfo.id) || !Array.isArray(packageInfo.entries) ||
      packageInfo.entries.length === 0 || !Array.isArray(packageInfo.files) || packageInfo.files.length === 0 ||
      /teacher-workload/i.test(packageInfo.files.join('\n'))) {
    throw new Error('invalid or forbidden offline package: ' + packageInfo.id);
  }
  const lockEntry = offlineLock.packages[packageInfo.id];
  if (!lockEntry || lockEntry.version !== packageInfo.version || !/^[a-f0-9]{12}$/i.test(lockEntry.contentHash)) {
    throw new Error('offline.lock.json is stale or incomplete for ' + packageInfo.id);
  }
  const rows = [];
  let sourceBytes = 0;
  const members = new Map();
  for (const filename of [...packageInfo.files].sort()) {
    assertRelative(filename, 'offline package source');
    const sourcePath = path.join(siteRoot, filename);
    const stat = await lstat(sourcePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('offline package source is not a regular file: ' + filename);
    const source = await readFile(sourcePath);
    rows.push(`${filename}\t${sha256(source)}\n`);
    sourceBytes += source.length;
    if (packageInfo.entries.includes(filename) && packageInfo.transforms.injectOfflineHead) {
      const output = injectOfflineHead(source.toString('utf8'), { ...packageInfo, contentHash: lockEntry.contentHash });
      members.set(filename, Buffer.from(output, 'utf8'));
    } else {
      members.set(filename, source);
    }
  }
  const sourceHash = createHash('sha256').update(rows.sort().join('')).digest('hex').slice(0, 12);
  if (sourceHash !== lockEntry.contentHash || packageInfo.files.length !== lockEntry.fileCount || sourceBytes !== lockEntry.byteLength) {
    throw new Error(`offline.lock.json content/version mismatch for ${packageInfo.id}: expected ${lockEntry.contentHash}, computed ${sourceHash}`);
  }
  if (packageInfo.entries.some((entry) => !members.has(entry)) ||
      (packageInfo.entry !== 'START-HERE.html' && !packageInfo.entries.includes(packageInfo.entry))) {
    throw new Error(`offline entry is not in package file list: ${packageInfo.id}:${packageInfo.entry}`);
  }

  const generated = new Map([
    ['START-HERE.html', Buffer.from(startHere({ ...packageInfo, contentHash: sourceHash }), 'utf8')],
    ['README-OFFLINE.txt', Buffer.from(readmeOffline({ ...packageInfo, contentHash: sourceHash }), 'utf8')],
    ['LICENSES/THIRD-PARTY-NOTICES.md', Buffer.from(notices(), 'utf8')]
  ]);
  generated.set('index.html', generated.get('START-HERE.html'));
  for (const [filename, bytes] of generated) members.set(filename, bytes);
  const inventory = [...members.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([filename, bytes]) => ({ path: filename, sha256: sha256(bytes), byteLength: bytes.length }));
  const totalBytes = inventory.reduce((sum, file) => sum + file.byteLength, 0);
  const versionJson = {
    id: packageInfo.id,
    title: packageInfo.title,
    version: packageInfo.version,
    contentHash: sourceHash,
    fileCount: inventory.length,
    byteLength: totalBytes,
    files: inventory
  };
  members.set('VERSION.json', Buffer.from(`${JSON.stringify(versionJson, null, 2)}\n`, 'utf8'));
  const zip = makeZip([...members.entries()].map(([name, bytes]) => ({ name, bytes })));
  const zipDigest = sha256(zip);
  const zipPath = path.join(siteRoot, 'downloads', `${packageInfo.id}.zip`);
  await mkdir(path.dirname(zipPath), { recursive: true });
  await writeFile(zipPath, zip);
  downloads.push({
    id: packageInfo.id,
    title: packageInfo.title,
    version: packageInfo.version,
    sizeBytes: zip.length,
    sizeText: zip.length >= 1024 * 1024 ? `${(zip.length / (1024 * 1024)).toFixed(2)} MiB` : `${(zip.length / 1024).toFixed(1)} KiB`,
    sha256: zipDigest
  });
  console.log(`Generated downloads/${packageInfo.id}.zip (${zip.length} bytes, SHA-256 ${zipDigest}).`);
}

const downloadsRoot = path.join(siteRoot, 'downloads');
await writeFile(path.join(downloadsRoot, 'index.js'), `window.LT_DOWNLOADS=${JSON.stringify(downloads)};\n`, 'utf8');
const sums = [...downloads].sort((a, b) => a.id.localeCompare(b.id, 'en'))
  .map((item) => `${item.sha256}  ${item.id}.zip`).join('\n') + '\n';
await writeFile(path.join(downloadsRoot, 'SHA256SUMS.txt'), sums, 'utf8');

const generatedDownloadFiles = [
  ...manifest.offlinePackages.map((item) => `downloads/${item.id}.zip`),
  'downloads/index.js',
  'downloads/SHA256SUMS.txt'
];
if (new Set(generatedDownloadFiles).size !== generatedDownloadFiles.length) throw new Error('duplicate offline generated file path');
console.log(`Built ${manifest.entries.length + manifest.generatedFiles.length + generatedDownloadFiles.length} public files (${manifest.entries.length} allowlist entries, ${generatedDownloadFiles.length + manifest.generatedFiles.length} generated).`);
