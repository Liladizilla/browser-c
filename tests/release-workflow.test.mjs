import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/packages.yml", import.meta.url), "utf8");
const releaseDocs = await readFile(new URL("../docs/RELEASES.md", import.meta.url), "utf8");

test("tagged release packaging covers all supported desktop platforms", () => {
  assert.match(workflow, /push:\s*\n\s*tags:\s*\n\s*- ["']v\*["']/);
  for (const platform of ["linux", "windows", "macos"]) {
    assert.match(workflow, new RegExp(`platform: ${platform}\\b`), `Missing package matrix for ${platform}`);
  }
  assert.match(workflow, /name: browser-c-\$\{\{ matrix\.platform \}\}/);
  assert.match(workflow, /pattern: browser-c-\*/);
  for (const artifact of ["AppImage", "deb", "exe", "dmg", "zip"]) {
    assert.ok(workflow.includes(`*.${artifact}`) || workflow.includes(`-name '*.${artifact}'`), `Missing release asset format: ${artifact}`);
  }
});

test("release assembly waits for every platform and creates a reviewable draft", () => {
  assert.match(workflow, /publish-release:[\s\S]*?needs: package/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /draft: true/);
  assert.match(workflow, /prerelease: true/);
  assert.match(workflow, /tag_name: \$\{\{ github\.ref_name \}\}/);
  assert.match(workflow, /files: release-assets\/\*/);
});

test("release assembly requires a complete cross-platform payload and integrity metadata", () => {
  assert.match(workflow, /for platform in linux windows macos/);
  assert.match(workflow, /source="release-downloads\/browser-c-\$\{platform\}"/);
  assert.match(workflow, /pattern: browser-c-\*/);
  for (const format of ["*.AppImage", "*.deb", "*.exe", "*.dmg", "*.zip"]) {
    assert.ok(workflow.includes(format), `Missing required format validation: ${format}`);
  }
  assert.match(workflow, /SBOM\.spdx\.json/);
  assert.match(workflow, /SHA256SUMS\.txt/);
  assert.match(releaseDocs, /SHA-256/);
  assert.match(releaseDocs, /draft prerelease/);
});
