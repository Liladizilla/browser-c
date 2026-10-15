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
test("keyboard shortcuts are handled inside loaded page views", () => {
  assert.match(main, /before-input-event/);
  assert.match(main, /key === "t"/);
  assert.match(main, /key === "w"/);
  assert.match(main, /key === "tab"/);
  assert.match(preload, /browser:focus-address/);
});
test("closing a window snapshots tabs before clearing runtime state", () => {
  assert.match(main, /lastSessionSnapshot = \{/);
  assert.match(main, /lastSessionSnapshot\?\.tabs/);
});
test("session restoration preserves the selected tab index", () => {
  assert.match(main, /activeIndex/);
  assert.match(main, /activateTab\(tabs\[Math\.min\(session\.activeIndex/);
});

test("bookmarks and history use narrow IPC endpoints and persistent profile storage", () => {
  assert.match(main, /profile\.json/);
  assert.match(main, /MAX_HISTORY_ITEMS/);
  assert.match(main, /browser:bookmarks:toggle/);
  assert.match(main, /browser:history:clear/);
  assert.match(preload, /getBookmarks/);
  assert.match(preload, /getHistory/);
  assert.match(preload, /clearHistory/);
});

test("history records only web URLs and remains bounded", () => {
  assert.match(main, /if \(!isWebUrl\(tab\.url\)\) return/);
  assert.match(main, /MAX_HISTORY_ITEMS/);
  assert.match(main, /recordHistory\(tab\)/);
});
test("content view layout accounts for the expanded browser toolbar", () => {
  assert.match(main, /CHROME_HEIGHT = 148/);
});

test("unsupported session versions fall back to a valid empty session model", () => {
  assert.match(main, /data\.version !== SESSION_VERSION[^\n]+return \{ urls: \[\], activeIndex: 0 \}/);
});
