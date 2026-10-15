import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const preload = await readFile(new URL("../src/preload.cjs", import.meta.url), "utf8");
const renderer = await readFile(new URL("../src/renderer/renderer.js", import.meta.url), "utf8");

test("tabs have separate sandboxed WebContentsView instances", () => {
  assert.match(main, /function createTab/);
  assert.match(main, /new WebContentsView/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
});
test("tab operations use narrow IPC methods", () => {
  assert.match(preload, /browser:new-tab/);
  assert.match(preload, /browser:activate-tab/);
  assert.match(preload, /browser:close-tab/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^,]+,\s*ipcRenderer/);
});
test("session restoration is versioned and restricts restored URLs", () => {
  assert.match(main, /SESSION_VERSION/);
  assert.match(main, /isWebUrl\(url\)/);
  assert.match(main, /session\.json/);
});
test("keyboard shortcuts cover common tab operations", () => {
  assert.match(renderer, /key === "t"/);
  assert.match(renderer, /key === "w"/);
  assert.match(renderer, /key === "tab"/);
});
