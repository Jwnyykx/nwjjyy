// Copy this buildless site into the directory consumed by the hosting service.
// No dependencies, credentials or local QA files belong in the public output.
import { cp, mkdir, readdir, stat, rm } from "node:fs/promises";
import { resolve, join, extname, relative } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist");
// Guard the resolved destination before removing prior generated files.
if (relative(root, output) !== "dist") throw new Error("Static output must stay inside the project dist directory");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ["index.html", "style.css", "script.js", "site-config.js", ".nojekyll"]) {
  await cp(resolve(root, file), join(output, file));
}
const formats = new Set([".png", ".webp", ".jpg", ".jpeg", ".avif", ".gif", ".svg", ".mp3", ".m4a", ".ogg", ".wav"]);
let count = 0;
async function copyAssets(directory, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const source = join(directory, entry.name);
    const target = join(destination, entry.name);
    if (entry.isDirectory()) await copyAssets(source, target);
    else if (entry.isFile() && formats.has(extname(entry.name).toLowerCase())) {
      await cp(source, target);
      count += 1;
    }
  }
}
for (const folder of ["images", "audio", "icons"]) {
  await copyAssets(resolve(root, "assets", folder), join(output, "assets", folder));
}
if (!(await stat(join(output, "index.html"))).isFile()) throw new Error("Static entry is missing");
console.log(`Static site ready: dist/ (${count} media assets)`);
