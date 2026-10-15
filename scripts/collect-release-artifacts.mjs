import assert from "node:assert/strict";
import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const expectedExtensions = {
  linux: [".AppImage", ".deb"],
  windows: [".exe"],
  macos: [".dmg", ".zip"]
};
const platform = process.argv[2];
assert.ok(Object.hasOwn(expectedExtensions, platform),
  "Usage: node scripts/collect-release-artifacts.mjs <linux|windows|macos> [build-directory] [artifact-directory]");

const sourceDirectory = path.resolve(process.argv[3] ?? "release");
const artifactDirectory = path.resolve(process.argv[4] ?? path.join(sourceDirectory, "artifacts"));
const entries = await readdir(sourceDirectory, { withFileTypes: true });
const files = entries.filter((entry) => entry.isFile() && entry.name !== "SHA256SUMS.txt");
const selected = files.filter((entry) =>
  expectedExtensions[platform].some((extension) => entry.name.toLowerCase().endsWith(extension.toLowerCase()))
);
for (const extension of expectedExtensions[platform]) {
  assert.ok(selected.some((entry) => entry.name.toLowerCase().endsWith(extension.toLowerCase())),
    `Expected a ${extension} package for ${platform}; found: ${files.map((entry) => entry.name).join(", ")}`);
}
for (const entry of selected) {
  const details = await stat(path.join(sourceDirectory, entry.name));
  assert.ok(details.size > 0, `Package artifact is empty: ${entry.name}`);
}
await rm(artifactDirectory, { recursive: true, force: true });
await mkdir(artifactDirectory, { recursive: true });
for (const entry of selected) {
  await copyFile(path.join(sourceDirectory, entry.name), path.join(artifactDirectory, entry.name));
}
console.log(`Staged ${selected.length} distributable package(s) for ${platform} in ${artifactDirectory}; build intermediates excluded.`);
