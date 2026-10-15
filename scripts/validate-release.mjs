import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const platform = process.argv[2];
const expectedExtensions = {
  linux: [".AppImage", ".deb"],
  windows: [".exe"],
  macos: [".dmg", ".zip"]
};
assert.ok(Object.hasOwn(expectedExtensions, platform), "Usage: node scripts/validate-release.mjs <linux|windows|macos>");

const directory = path.resolve(process.argv[3] ?? "release");
const entries = await readdir(directory, { withFileTypes: true });
const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
const sbomName = "SBOM.spdx.json";
const artifacts = files.filter((name) => name !== "SHA256SUMS.txt" && name !== sbomName).sort();
assert.ok(artifacts.length > 0, "Release directory contains no package artifacts");
for (const name of artifacts) {
  assert.ok(expectedExtensions[platform].some((extension) => name.toLowerCase().endsWith(extension.toLowerCase())),
    "Unexpected release artifact type: " + name + "; allowed extensions: " + expectedExtensions[platform].join(", "));
}
for (const name of artifacts) {
  assert.ok(!/[\\u0000-\\u001f\\u007f/\\\\]/.test(name), "Unsafe artifact filename: " + JSON.stringify(name));
  const details = await stat(path.join(directory, name));
  assert.ok(details.size > 0, "Package artifact is empty: " + name);
}
for (const extension of expectedExtensions[platform]) {
  assert.ok(artifacts.some((name) => name.toLowerCase().endsWith(extension.toLowerCase())),
    "Expected a " + extension + " package for " + platform + "; found: " + artifacts.join(", "));
}

assert.ok(files.includes(sbomName), "Release directory must contain " + sbomName);
const sbom = JSON.parse(await readFile(path.join(directory, sbomName), "utf8"));
assert.equal(sbom.spdxVersion, "SPDX-2.3", "SBOM must use SPDX 2.3");
assert.ok(Array.isArray(sbom.packages) && sbom.packages.length > 0, "SBOM must contain dependency package records");

const manifest = await readFile(path.join(directory, "SHA256SUMS.txt"), "utf8");
const records = new Map();
for (const line of manifest.split(/\\r?\\n/).filter(Boolean)) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  assert.ok(match, "Malformed checksum line: " + line);
  assert.ok(!/[\\u0000-\\u001f\\u007f/\\\\]/.test(match[2]), "Unsafe checksum filename: " + JSON.stringify(match[2]));
  assert.ok(!records.has(match[2]), "Duplicate checksum entry: " + match[2]);
  records.set(match[2], match[1]);
}

const checksummedFiles = [...artifacts, sbomName].sort();
assert.deepEqual([...records.keys()].sort(), checksummedFiles,
  "Checksum manifest must cover every package and the SBOM exactly once");
for (const name of checksummedFiles) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path.join(directory, name))) hash.update(chunk);
  assert.equal(records.get(name), hash.digest("hex"), "Checksum mismatch for " + name);
}
console.log("Release validation passed for " + platform + ": " + artifacts.length
  + " package artifact(s), SPDX SBOM validated, all SHA-256 entries verified.");
