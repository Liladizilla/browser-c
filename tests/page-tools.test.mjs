import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [main, html, renderer, preload] = await Promise.all([
  readFile(new URL("../src/main.js", import.meta.url), "utf8"),
  readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/renderer/renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../src/preload.cjs", import.meta.url), "utf8")
]);

test("page tools expose print, PDF export, complete-page save, screenshot, and translation", () => {
  for (const id of ["print-page", "save-page-pdf", "save-page-as", "capture-screenshot", "translate-page"]) {
    assert.match(html, new RegExp(`id="${id}"`), `Missing page tool control: ${id}`);
  }
  for (const method of ["printPage", "savePageAsPdf", "savePageAs", "captureScreenshot", "translatePage"]) {
    assert.match(preload, new RegExp(`\\b${method}: \\(\\) => ipcRenderer\\.invoke\\(`));
    assert.match(renderer, new RegExp(`api\\.${method}\\(\\)`));
  }
});

test("page tool IPC handlers reject untrusted browser-content requests", () => {
  for (const channel of [
    "browser:page:print",
    "browser:page:save-pdf",
    "browser:page:save-as",
    "browser:page:screenshot",
    "browser:page:translate"
  ]) {
    const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const handler = new RegExp(`ipcMain\\.handle\\("${escaped}"[\\s\\S]{0,240}isTrustedChromeEvent\\(event\\)`);
    assert.match(main, handler, `Missing trusted-chrome guard for ${channel}`);
  }
});

test("PDF export uses Electron printToPDF and a user-selected PDF destination", () => {
  assert.match(main, /browser:page:save-pdf[\s\S]{0,900}showSaveDialog/);
  assert.match(main, /webContents\.printToPDF\(/);
  assert.match(main, /extensions: \["pdf"\]/);
});

test("screenshot uses the active page capture API and saves through a user-selected path", () => {
  assert.match(main, /browser:page:screenshot[\s\S]{0,900}showSaveDialog/);
  assert.match(main, /webContents\.capturePage\(/);
});

test("translation opens an explicit external translation destination instead of injecting code into pages", () => {
  assert.match(main, /browser:page:translate/);
  assert.match(main, /translate\.google\.com/);
  assert.doesNotMatch(main, /executeJavaScript\([^\n]*translate/);
});
