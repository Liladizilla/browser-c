import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const secrets = await readFile(new URL("../.github/workflows/secrets.yml", import.meta.url), "utf8");
const packages = await readFile(new URL("../.github/workflows/packages.yml", import.meta.url), "utf8");
const smoke = await readFile(new URL("../scripts/smoke-electron.mjs", import.meta.url), "utf8");
const collector = await readFile(new URL("../scripts/collect-release-artifacts.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

test("CI audits the pinned dependency tree", () => {
  assert.ok(ci.includes("npm audit --audit-level=high"));
  assert.ok(ci.includes("npm ci --no-audit --no-fund"));
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages[""].devDependencies.electron, pkg.devDependencies.electron);
});

test("secret scanning runs on pushes, pull requests, and schedule", () => {
  assert.ok(secrets.includes("pull_request:"));
  assert.ok(secrets.includes("schedule:"));
  assert.ok(secrets.includes("fetch-depth: 0"));
  assert.ok(secrets.includes("gitleaks/gitleaks-action@v2.3.9"));
});

test("secret scanning has read-only repository permissions", () => {
  assert.ok(secrets.includes("contents: read"));
  assert.ok(secrets.includes("pull-requests: read"));
  assert.ok(!secrets.includes("contents: write"));
  assert.ok(!secrets.includes("pull-requests: write"));
});

test("desktop packages are validated before artifact provenance is attested", () => {
  assert.ok(packages.includes("npm audit --audit-level=high"));
  assert.ok(packages.includes("node scripts/collect-release-artifacts.mjs ${{ matrix.platform }}"));
  assert.ok(packages.includes("node scripts/validate-release.mjs ${{ matrix.platform }} release/artifacts"));
  assert.ok(packages.includes("npm run checksums -- release/artifacts"));
  assert.ok(packages.includes("path: release/artifacts/*"));
  assert.ok(packages.includes("node scripts/validate-release.mjs ${{ matrix.platform }}"));
  assert.ok(packages.includes("uses: actions/attest-build-provenance@v3"));
  assert.ok(packages.includes("subject-path:"));
  assert.ok(packages.includes("id-token: write"));
  assert.ok(packages.includes("attestations: write"));
  assert.ok(packages.indexOf("Validate package formats and checksums") < packages.indexOf("Attest package and checksum provenance"));
  assert.ok(packages.indexOf("Attest package and checksum provenance") < packages.indexOf("Upload package artifacts"));
});

test("Electron smoke waits for the UI smoke suite instead of sampling too early", () => {
  assert.ok(smoke.includes("BROWSER_C_UI_SMOKE_(?:PASS|FAIL)"));
  assert.ok(smoke.includes("startupWindowMs = 45_000"));
  assert.ok(smoke.includes("clearTimeout(timeoutHandle)"));
  assert.ok(!smoke.includes("setInterval("));
});

test("release staging excludes unpacked build output and rejects empty packages", () => {
  assert.ok(collector.includes("expectedExtensions"));
  assert.ok(collector.includes("details.size > 0"));
  assert.ok(collector.includes("rm(artifactDirectory, { recursive: true, force: true })"));
  assert.ok(collector.includes("copyFile("));
});
