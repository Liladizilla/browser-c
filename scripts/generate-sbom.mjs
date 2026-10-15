import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputPath = path.resolve(process.argv[2] ?? "release/artifacts/SBOM.spdx.json");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["sbom", "--sbom-format=spdx"], {
  shell: process.platform === "win32",
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 16 * 1024 * 1024
});

if (result.error) throw result.error;
assert.equal(result.status, 0, "npm sbom failed: " + (result.stderr || result.stdout).slice(-4000));
let sbom;
try {
  sbom = JSON.parse(result.stdout);
} catch {
  throw new Error("npm sbom did not produce valid JSON: " + result.stdout.slice(-2000));
}
assert.equal(sbom.spdxVersion, "SPDX-2.3", "Expected an SPDX 2.3 software bill of materials");
assert.ok(Array.isArray(sbom.packages) && sbom.packages.length > 0, "SBOM must include dependency package records");
assert.ok(sbom.creationInfo && typeof sbom.creationInfo.created === "string", "SBOM must include creation metadata");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(sbom, null, 2) + "\n", { mode: 0o600 });
console.log("Generated SPDX 2.3 SBOM with " + sbom.packages.length + " package records at " + outputPath);
