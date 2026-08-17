import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "publish.allowlist.json"), "utf8"));
const siteRoot = path.join(root, manifest.publicRoot);
const expected = new Set([
  ...manifest.entries.map((entry) => entry.destination.replaceAll("\\", "/")),
  ...(manifest.generatedFiles || [])
]);

async function listFiles(dir, prefix = "") {
  const result = [];
  for (const item of await readdir(dir)) {
    const full = path.join(dir, item);
    const relative = prefix ? `${prefix}/${item}` : item;
    const info = await stat(full);
    if (info.isDirectory()) result.push(...await listFiles(full, relative));
    else result.push(relative);
  }
  return result;
}

const actual = new Set(await listFiles(siteRoot));
const unexpected = [...actual].filter((file) => !expected.has(file));
const missing = [...expected].filter((file) => !actual.has(file));
if (unexpected.length || missing.length) {
  throw new Error(`Public allowlist mismatch; unexpected=${unexpected.join(",")}; missing=${missing.join(",")}`);
}

const forbiddenPath = /(?:\.xlsx?$|\.pdf$|teacher-tool-snapshot_|(^|\/)docs(?:\/|$))/i;
const forbiddenContent = [
  /\b(?:localStorage|sessionStorage|indexedDB)\b/i,
  /navigator\.sendBeacon\s*\(/i,
  /<script\b[^>]*\bsrc\s*=/i,
  /<link\b[^>]*\bhref\s*=/i,
  /-----BEGIN (?:RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----/i,
  /(?:ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,})/,
  /\b(?:client[_-]?secret|api[_-]?key|access[_-]?token)\s*[:=]/i
];

for (const file of actual) {
  if (forbiddenPath.test(file)) throw new Error(`Forbidden public path: ${file}`);
  if (file === ".nojekyll") continue;
  const content = await readFile(path.join(siteRoot, file), "utf8");
  for (const pattern of forbiddenContent) {
    if (pattern.test(content)) throw new Error(`Forbidden public content in ${file}: ${pattern}`);
  }
}

const toolPath = path.join(siteRoot, "teacher-workload", "教師人力與行政架構工具_單檔離線版.html");
const tool = await readFile(toolPath, "utf8");
if (!tool.includes("window.TeacherTool") || !tool.includes("window.AdminStructureTool")) {
  throw new Error("The offline tool exports are missing");
}
console.log(`Guard passed: ${actual.size} files; no external resource tags, storage APIs, credentials, or source-data files.`);

