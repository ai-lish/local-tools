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
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js'
]);
const forbiddenPath = /(?:\.map$|\.pdf$|teacher-tool-snapshot_|(^|\/)docs(?:\/|$))/i;
const forbiddenContent = [
  /\b(?:localStorage|sessionStorage|indexedDB)\b/i,
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
  if (forbiddenPath.test(file.relative)) {
    throw new Error('forbidden public path: ' + file.relative);
  }
  if (file.relative === '.nojekyll') continue;

  const content = await readFile(file.fullPath, 'utf8');
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
