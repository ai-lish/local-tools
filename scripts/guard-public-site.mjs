#!/usr/bin/env node

import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'publish.allowlist.json'), 'utf8'));
const siteRoot = path.resolve(root, manifest.publicRoot);
const expected = new Set([
  ...manifest.entries.map((entry) => entry.destination.replaceAll('\\', '/')),
  ...(manifest.generatedFiles || [])
]);
const allowedCdnUrls = new Set([
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
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

for (const file of files) {
  if (forbiddenPath.test(file.relative) && file.relative !== calculatorPdf) {
    throw new Error('forbidden public path: ' + file.relative);
  }
  if (file.relative === '.nojekyll') continue;

  const content = await readFile(file.fullPath, 'utf8');
  if (storageAccess.test(content)) {
    const allowedCalculatorStorageCalls = [
      /\blocalStorage\.getItem\s*\(\s*STORAGE_KEY\s*\)/,
      /\blocalStorage\.getItem\s*\(\s*LEGACY_STORAGE_KEY\s*\)/,
      /\blocalStorage\.setItem\s*\(\s*STORAGE_KEY\s*,/
    ];
    const namespacedCalculatorStorage = file.relative === 'tools/fx-50fh-ii/js/studio.js' &&
      content.includes("const STORAGE_KEY = 'math-lish.local-tools.fx-50fh-ii.program-studio.v3';") &&
      content.includes("const LEGACY_STORAGE_KEY = 'math-lish.local-tools.fx-50fh-ii.program-studio.v2';") &&
      (content.match(/\blocalStorage\b/g) || []).length === allowedCalculatorStorageCalls.length &&
      allowedCalculatorStorageCalls.every((pattern) => (content.match(pattern) || []).length === 1) &&
      !/\b(?:sessionStorage|indexedDB)\b/i.test(content);
    const thankTeacherStorageCalls = [...content.matchAll(
      /\blocalStorage\.(getItem|setItem)\s*\(\s*([A-Z0-9_]+)/g
    )];
    const namespacedThankTeacherStorage = file.relative === 'tools/thank-teacher-cards/app.js' &&
      content.includes("var LIFE_EDU_LOCAL_KEY = 'local-tools.thank-teacher-cards.v1';") &&
      content.includes("var LIFE_EDU_DB_NAME = 'local-tools-thank-teacher-cards';") &&
      (content.match(/\blocalStorage\b/g) || []).length === 15 &&
      thankTeacherStorageCalls.length === 15 &&
      thankTeacherStorageCalls.every((match) => match[2] === 'LIFE_EDU_LOCAL_KEY') &&
      thankTeacherStorageCalls.filter((match) => match[1] === 'getItem').length === 14 &&
      thankTeacherStorageCalls.filter((match) => match[1] === 'setItem').length === 1 &&
      (content.match(/\bindexedDB\b/g) || []).length === 2 &&
      (content.match(/\bindexedDB\.open\s*\(\s*LIFE_EDU_DB_NAME\s*,\s*1\s*\)/g) || []).length === 1 &&
      !/\bsessionStorage\b/i.test(content);
    if (!namespacedCalculatorStorage && !namespacedThankTeacherStorage) {
      throw new Error('unapproved browser storage in public file: ' + file.relative);
    }
  }
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
