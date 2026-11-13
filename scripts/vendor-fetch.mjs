#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { digest, renderGeneratedVendorFile } from './vendor-utils.mjs';

const root = process.cwd();
const vendorRoot = path.join(root, 'tools/_vendor');
const lockPath = path.join(root, 'vendor.lock.json');
const mode = process.argv[2];
const allowedHosts = new Set(['registry.npmjs.org', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net']);

if (!['--verify', '--fetch'].includes(mode) || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/vendor-fetch.mjs --verify|--fetch');
}

function fail(message) {
  console.error('VENDOR_CHECK_FAILED');
  console.error(message);
  process.exit(1);
}

function safeRelative(value, label) {
  if (typeof value !== 'string' || !value || value.includes('..') || value.includes('\\') ||
      path.posix.isAbsolute(value) || value.split('/').some((part) => !part || part === '.')) {
    fail(`unsafe ${label}: ${value}`);
  }
}

function validateUrl(value, label, hosts = allowedHosts) {
  let url;
  try { url = new URL(value); } catch { fail(`invalid ${label}: ${value}`); }
  if (url.protocol !== 'https:' || !hosts.has(url.hostname)) fail(`unapproved ${label}: ${value}`);
  return url;
}

function parseTarGzip(bytes, packageName, wantedPaths) {
  const tar = gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 });
  const files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/, '');
    const archivePath = prefix ? `${prefix}/${name}` : name;
    const sizeText = header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    const type = header[156];
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) fail(`invalid tar member in ${packageName}: ${archivePath}`);
    if (wantedPaths.has(archivePath)) {
      if (type !== 0 && type !== 48) fail(`non-regular npm tarball member in ${packageName}: ${archivePath}`);
      files.set(archivePath, Buffer.from(tar.subarray(offset + 512, offset + 512 + size)));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function walk(directory, relative = '', output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    const info = await lstat(fullPath);
    if (info.isSymbolicLink()) fail(`symbolic link in vendor tree: ${nextRelative}`);
    if (info.isDirectory()) await walk(fullPath, nextRelative, output);
    else if (info.isFile() && nextRelative !== '.gitkeep') output.push(nextRelative);
    else if (!info.isFile()) fail(`unsupported vendor entry: ${nextRelative}`);
  }
  return output;
}

async function writeAtomic(filePath, bytes) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.vendor-fetch-tmp`;
  await rm(temporary, { force: true });
  await writeFile(temporary, bytes, { flag: 'wx' });
  await rename(temporary, filePath);
}

const lock = JSON.parse(await readFile(lockPath, 'utf8'));
if (lock.version !== 2 || !Array.isArray(lock.packages) || !Array.isArray(lock.files) || !Array.isArray(lock.generatedFiles)) {
  fail('vendor.lock.json must contain version 2, packages, files and generatedFiles arrays.');
}

const packages = new Map();
for (const pkg of lock.packages) {
  if (!pkg || typeof pkg.name !== 'string' || typeof pkg.version !== 'string' || typeof pkg.license !== 'string' ||
      typeof pkg.sourceUrl !== 'string' || typeof pkg.integrity !== 'string' || !Array.isArray(pkg.files) || !pkg.files.length ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(pkg.integrity)) fail('invalid vendor package declaration');
  validateUrl(pkg.sourceUrl, 'npm tarball URL', new Set(['registry.npmjs.org']));
  if (pkg.sourceUrl !== `https://registry.npmjs.org/${pkg.name}/-/${pkg.name}-${pkg.version}.tgz`) {
    fail(`unexpected npm source URL for ${pkg.name}@${pkg.version}`);
  }
  if (packages.has(pkg.name)) fail(`duplicate vendor package: ${pkg.name}`);
  packages.set(pkg.name, pkg);
}

const fileMap = new Map();
for (const item of lock.files) {
  if (!item || typeof item.path !== 'string' || typeof item.packageName !== 'string' || typeof item.version !== 'string' ||
      typeof item.packagePath !== 'string' || typeof item.sourceUrl !== 'string' || typeof item.bytes !== 'number' ||
      typeof item.sha256 !== 'string' || typeof item.sha384 !== 'string' || typeof item.licensePath !== 'string') {
    fail('each vendor file needs package, path, source, byte count and SHA-256/SHA-384.');
  }
  safeRelative(item.path, 'vendor path');
  safeRelative(item.packagePath, 'npm package path');
  safeRelative(item.licensePath, 'license path');
  validateUrl(item.sourceUrl, 'npm tarball URL', new Set(['registry.npmjs.org']));
  if (!/^[a-f0-9]{64}$/i.test(item.sha256) || !/^[a-f0-9]{96}$/i.test(item.sha384) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) {
    fail(`invalid digest or byte count for ${item.path}`);
  }
  if (fileMap.has(item.path)) fail(`duplicate vendor path: ${item.path}`);
  if (item.path.endsWith('.map')) fail(`source maps are forbidden in vendor tree: ${item.path}`);
  const pkg = packages.get(item.packageName);
  if (!pkg || pkg.version !== item.version || pkg.sourceUrl !== item.sourceUrl || !pkg.files.includes(item.path)) {
    fail(`vendor file does not match package declaration: ${item.path}`);
  }
  const cdnUrls = item.cdnUrls || (item.cdnUrl ? [item.cdnUrl] : []);
  if (!Array.isArray(cdnUrls)) fail(`invalid CDN cross-check URLs for ${item.path}`);
  for (const cdnUrl of cdnUrls) validateUrl(cdnUrl, 'CDN cross-check URL', new Set(['cdnjs.cloudflare.com', 'cdn.jsdelivr.net']));
  fileMap.set(item.path, item);
}
for (const pkg of packages.values()) {
  for (const file of pkg.files) if (!fileMap.has(file)) fail(`package file is not locked: ${pkg.name}:${file}`);
}
for (const item of lock.files) if (!fileMap.has(item.licensePath)) fail(`licensePath is not a locked vendor file: ${item.licensePath}`);

for (const generated of lock.generatedFiles) {
  if (!generated || typeof generated.path !== 'string' || typeof generated.sourcePath !== 'string' ||
      typeof generated.inputSha256 !== 'string' || typeof generated.bytes !== 'number' ||
      typeof generated.sha256 !== 'string' || typeof generated.sha384 !== 'string' ||
      generated.generator !== 'pdfjs-base64-blob-worker-v1') fail('invalid generated vendor file declaration');
  safeRelative(generated.path, 'generated vendor path');
  safeRelative(generated.sourcePath, 'generated vendor source path');
  if (!/^[a-f0-9]{64}$/i.test(generated.inputSha256) || !/^[a-f0-9]{64}$/i.test(generated.sha256) ||
      !/^[a-f0-9]{96}$/i.test(generated.sha384) || !Number.isSafeInteger(generated.bytes) || generated.bytes <= 0) {
    fail(`invalid generated vendor digest or byte count: ${generated.path}`);
  }
  if (fileMap.has(generated.path)) fail(`duplicate generated vendor path: ${generated.path}`);
}

if (mode === '--fetch') {
  for (const pkg of packages.values()) {
    const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`;
    const metadataResponse = await fetch(metadataUrl, { redirect: 'error' });
    if (!metadataResponse.ok) fail(`npm metadata download failed (${metadataResponse.status}) for ${pkg.name}@${pkg.version}`);
    const metadata = await metadataResponse.json();
    if (metadata.name !== pkg.name || metadata.version !== pkg.version || metadata.license !== pkg.license ||
        metadata.dist?.tarball !== pkg.sourceUrl || metadata.dist?.integrity !== pkg.integrity) {
      fail(`npm registry metadata mismatch for ${pkg.name}@${pkg.version}`);
    }
    const response = await fetch(pkg.sourceUrl, { redirect: 'error' });
    if (!response.ok) fail(`npm tarball download failed (${response.status}) for ${pkg.name}@${pkg.version}`);
    const tarball = Buffer.from(await response.arrayBuffer());
    const actualIntegrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
    if (actualIntegrity !== pkg.integrity) fail(`npm registry integrity mismatch for ${pkg.name}@${pkg.version}`);
    const packageFiles = lock.files.filter((file) => file.packageName === pkg.name);
    const archive = parseTarGzip(tarball, pkg.name, new Set(packageFiles.map((file) => file.packagePath)));
    for (const item of packageFiles) {
      const bytes = archive.get(item.packagePath);
      if (!bytes) fail(`npm tarball member is missing: ${pkg.name}:${item.packagePath}`);
      if (bytes.length !== item.bytes || digest(bytes) !== item.sha256.toLowerCase() || digest(bytes, 'sha384') !== item.sha384.toLowerCase()) {
        fail(`npm package digest mismatch: ${item.path}`);
      }
      for (const cdnUrl of item.cdnUrls || (item.cdnUrl ? [item.cdnUrl] : [])) {
        const cdnResponse = await fetch(cdnUrl, { redirect: 'error' });
        if (!cdnResponse.ok) fail(`CDN cross-check failed (${cdnResponse.status}) for ${cdnUrl}`);
        const cdnBytes = Buffer.from(await cdnResponse.arrayBuffer());
        if (!cdnBytes.equals(bytes)) fail(`npm/CDN bytes differ for ${item.path}: ${cdnUrl}`);
      }
      const destination = path.resolve(vendorRoot, item.path);
      if (!destination.startsWith(`${vendorRoot}${path.sep}`)) fail(`vendor path escapes _vendor: ${item.path}`);
      await writeAtomic(destination, bytes);
      console.log(`Fetched ${item.path} (${item.bytes} bytes; SHA-256 ${item.sha256}; SHA-384 ${item.sha384}).`);
    }
  }
  for (const item of lock.generatedFiles) {
    const source = await readFile(path.join(vendorRoot, item.sourcePath));
    const generated = renderGeneratedVendorFile(item, source);
    const destination = path.resolve(vendorRoot, item.path);
    if (!destination.startsWith(`${vendorRoot}${path.sep}`)) fail(`generated vendor path escapes _vendor: ${item.path}`);
    await writeAtomic(destination, generated);
    item.bytes = generated.length;
    item.sha256 = digest(generated);
    item.sha384 = digest(generated, 'sha384');
    console.log(`Generated ${item.path} (${item.bytes} bytes; input SHA-256 ${item.inputSha256}; output SHA-256 ${item.sha256}).`);
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

const expected = new Set([...fileMap.keys(), ...lock.generatedFiles.map((item) => item.path)]);
const actual = new Set(await walk(vendorRoot));
const extras = [...actual].filter((file) => !expected.has(file));
const missing = [...expected].filter((file) => !actual.has(file));
if (extras.length || missing.length) fail(`vendor file set mismatch; extra=${extras.join(',')} missing=${missing.join(',')}`);

for (const item of lock.files) {
  const bytes = await readFile(path.join(vendorRoot, item.path));
  if (bytes.length !== item.bytes || digest(bytes) !== item.sha256.toLowerCase() || digest(bytes, 'sha384') !== item.sha384.toLowerCase()) {
    fail(`vendor hash/size mismatch for ${item.path}`);
  }
}
for (const item of lock.generatedFiles) {
  const source = await readFile(path.join(vendorRoot, item.sourcePath));
  const bytes = await readFile(path.join(vendorRoot, item.path));
  const expectedBytes = renderGeneratedVendorFile(item, source);
  if (!bytes.equals(expectedBytes) || bytes.length !== item.bytes || digest(bytes) !== item.sha256.toLowerCase() ||
      digest(bytes, 'sha384') !== item.sha384.toLowerCase()) fail(`generated vendor hash/size mismatch for ${item.path}`);
}
console.log(`Vendor lock passed (${expected.size} files; ${lock.generatedFiles.length} generated file source hash verified; ${mode === '--fetch' ? 'npm integrity, CDN cross-check, fetch and verify' : 'verify only'}).`);
