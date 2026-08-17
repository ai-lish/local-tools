import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "publish.allowlist.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const siteRoot = path.join(root, manifest.publicRoot);

if (!Array.isArray(manifest.entries) || !manifest.entries.length) {
  throw new Error("publish.allowlist.json must contain at least one entry");
}

await rm(siteRoot, { recursive: true, force: true });
await mkdir(siteRoot, { recursive: true });

for (const entry of manifest.entries) {
  if (!entry.source || !entry.destination) throw new Error("Invalid allowlist entry");
  const source = path.resolve(root, entry.source);
  const destination = path.resolve(siteRoot, entry.destination);
  if (!destination.startsWith(`${siteRoot}${path.sep}`) && destination !== siteRoot) {
    throw new Error(`Destination escapes public root: ${entry.destination}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

for (const generated of manifest.generatedFiles || []) {
  const destination = path.resolve(siteRoot, generated);
  if (!destination.startsWith(`${siteRoot}${path.sep}`)) throw new Error(`Generated file escapes public root: ${generated}`);
  await mkdir(path.dirname(destination), { recursive: true });
  if (generated === ".nojekyll") await writeFile(destination, "", "utf8");
}

console.log(`Built ${manifest.entries.length} allowlisted entries in ${path.relative(root, siteRoot)}/`);

