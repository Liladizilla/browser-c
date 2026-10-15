import test from "node:test";
import assert from "node:assert/strict";
import { downloadSafetyWarning } from "../src/download-policy.js";

test("warns for executable, script, and installer downloads case-insensitively", () => {
  for (const filename of ["setup.exe", "PATCH.MSI", "run.ps1", "script.js", "driver.sys", "installer.pkg", "launch.sh"]) {
    assert.equal(typeof downloadSafetyWarning(filename), "string", filename);
  }
});

test("detects a risky final extension even when the name contains a misleading suffix", () => {
  assert.equal(typeof downloadSafetyWarning("invoice.pdf.exe"), "string");
  assert.equal(typeof downloadSafetyWarning("photo.jpg"), "object");
});

test("does not warn for common documents, images, archives, or ordinary text", () => {
  for (const filename of ["report.pdf", "photo.png", "backup.zip", "notes.txt", "archive.tar.gz", "README"]) {
    assert.equal(downloadSafetyWarning(filename), null, filename);
  }
});

test("handles invalid names and path separators without throwing", () => {
  assert.equal(downloadSafetyWarning(""), null);
  assert.equal(downloadSafetyWarning(null), null);
  assert.equal(typeof downloadSafetyWarning("C:\\Downloads\\payload.EXE"), "string");
  assert.equal(typeof downloadSafetyWarning("../tmp/payload.exe"), "string");
});
