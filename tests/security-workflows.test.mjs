import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const secrets = await readFile(new URL("../.github/workflows/secrets.yml", import.meta.url), "utf8");
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
