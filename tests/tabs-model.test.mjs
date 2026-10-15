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
  assert.match(main, /shouldRecordHistory\(tab, isWebUrl\)/);
  assert.match(main, /MAX_HISTORY_ITEMS/);
  assert.match(main, /recordHistory\(tab\)/);
});
test("content view layout accounts for the expanded browser toolbar", () => {
  assert.match(main, /CHROME_HEIGHT = 178/);
});

test("unsupported session versions fall back to a valid empty session model", () => {
  assert.match(main, /data\.version !== SESSION_VERSION[^\n]+return \{ urls: \[\], activeIndex: 0 \}/);
});

test("downloads use explicit save-location prompts and narrow IPC controls", () => {
  assert.match(main, /will-download/);
  assert.match(main, /showSaveDialog/);
  assert.match(main, /item\.setSavePath/);
  assert.match(main, /browser:downloads:cancel/);
  assert.match(preload, /getDownloads/);
  assert.match(preload, /onDownloads/);
  assert.match(preload, /cancelDownload/);
});
test("download panel displays progress and supports cancellation", () => {
  assert.match(renderer, /formatBytes/);
  assert.match(renderer, /mode === "downloads"/);
  assert.match(renderer, /cancelDownload/);
});

test("find-in-page uses bounded query input and narrow IPC methods", () => {
  assert.match(main, /findInPage\(value, \{ matchCase: false, findNext: false \}\)/);
  assert.match(main, /slice\(0, 500\)/);
  assert.match(preload, /browser:find:start/);
  assert.match(preload, /browser:find:next/);
  assert.match(preload, /browser:find:previous/);
  assert.match(preload, /browser:find:stop/);
  assert.match(renderer, /openFindBar/);
});
test("zoom controls clamp page zoom and expose keyboard shortcuts", () => {
  assert.match(main, /Math\.min\(3, current \+ 0\.1\)/);
  assert.match(main, /Math\.max\(0\.5, current - 0\.1\)/);
  assert.match(main, /setZoomFactor/);
  assert.match(preload, /browser:zoom/);
  assert.match(renderer, /zoomReset\.textContent/);
  assert.match(main, /key === "f"/);
  assert.match(main, /key === "0"/);
});

test("completed downloads are persisted with a bounded history and reveal actions", () => {
  assert.match(main, /MAX_DOWNLOADS = 100/);
  assert.match(main, /rememberCompletedDownload/);
  assert.match(main, /profile\.downloads/);
  assert.match(main, /browser:downloads:reveal/);
  assert.match(main, /state !== "completed"/);
  assert.match(preload, /revealDownload/);
  assert.match(renderer, /Show downloaded file in its folder/);
});
test("download event listeners are attached before the save dialog await", () => {
  const listener = main.indexOf('browserSession.on("will-download"');
  const dialogCall = main.indexOf("await dialog.showSaveDialog", listener);
  const doneListener = main.indexOf('item.once("done"', listener);
  assert.ok(listener >= 0 && doneListener > listener && dialogCall > doneListener);
});

test("private tabs use unique non-persistent partitions and never enter saved sessions", () => {
  assert.match(main, /private-" \\+ randomUUID\\(\\)/);
  assert.match(main, /: "persist:browser-c"/);
  assert.match(main, /persistableTabs\(tabs, isWebUrl, 20\)/);
  assert.match(main, /shouldRecordHistory\(tab, isWebUrl\)/);
  assert.match(main, /isPrivate: Boolean\(tab\?\.isPrivate\)/);
});
test("private tabs do not persist downloads or bookmark current pages", () => {
  assert.match(main, /shouldPersistCompletedDownload\(download\)/);
  assert.match(main, /canBookmarkTab\(activeTab\(\)\)/);
  assert.match(main, /shouldCancelDownloadOnTabClose\(download\)/);
  assert.match(main, /if \(download\.tabId !== tab\.id\) continue/);
});
test("permission grants are scoped to each Electron session", () => {
  assert.match(main, /const permissionGrants = new WeakMap\(\)/);
  assert.match(main, /permissionGrants\.get\(browserSession\)/);
  assert.match(main, /requestPermission\(origin, permission, browserSession\)/);
});
test("private tab creation is exposed through a narrow IPC and visible control", () => {
  assert.match(main, /browser:new-private-tab/);
  assert.match(preload, /newPrivateTab: \(\) => ipcRenderer\.invoke\("browser:new-private-tab"\)/);
  assert.match(renderer, /api\.newPrivateTab\(\)/);
  assert.match(renderer, /event\.shiftKey/);
  assert.match(renderer, /state\.isPrivate/);
});
