import { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { isWebUrl, resolveAddress } from "./navigation.js";
import { canBookmarkTab, persistableTabs, shouldCancelDownloadOnTabClose, shouldPersistCompletedDownload, shouldRecordHistory } from "./privacy-policy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME_HEIGHT = 136;
const SESSION_VERSION = 1;
const PROFILE_VERSION = 1;
const MAX_HISTORY_ITEMS = 500;
const MAX_BOOKMARKS = 200;
const MAX_DOWNLOADS = 100;
const PERMISSION_LABELS = Object.freeze({
  media: "camera or microphone",
  geolocation: "location",
  notifications: "notifications",
  midi: "MIDI devices",
  "clipboard-read": "clipboard access",
  pointerLock: "pointer lock"
});
let windowRef;
let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let sessionSaveTimer;
let quitAfterSessionSave = false;
let lastSessionSnapshot = null;
let profile = { version: PROFILE_VERSION, bookmarks: [], history: [], downloads: [] };
let profileWriteQueue = Promise.resolve();
const downloads = new Map();
const downloadSessions = new WeakSet();
const permissionGrants = new WeakMap();
const pendingPermissionPrompts = new WeakMap();
const privateSessions = new WeakSet();

const activeTab = () => tabs.find((tab) => tab.id === activeTabId) ?? null;
const canGoBack = (contents) => contents.navigationHistory.canGoBack();
const canGoForward = (contents) => contents.navigationHistory.canGoForward();
function tabSnapshot(tab) {
  return { id: tab.id, url: tab.url, title: tab.title || "New Tab", loading: Boolean(tab.loading),
    canGoBack: canGoBack(tab.view.webContents), canGoForward: canGoForward(tab.view.webContents),
    zoomFactor: tab.view.webContents.getZoomFactor(), active: tab.id === activeTabId, isPrivate: Boolean(tab.isPrivate) };
}
function sendState(patch = {}) {
  if (!windowRef || windowRef.isDestroyed()) return;
  const tab = activeTab();
  windowRef.webContents.send("browser:state", {
    tabs: tabs.map(tabSnapshot), activeTabId, url: tab?.url ?? "", title: tab?.title ?? "Browser C", isPrivate: Boolean(tab?.isPrivate),
    loading: Boolean(tab?.loading), error: tab?.error ?? "", canGoBack: Boolean(tab && canGoBack(tab.view.webContents)),
    canGoForward: Boolean(tab && canGoForward(tab.view.webContents)),
    zoomFactor: tab?.view.webContents.getZoomFactor() ?? 1, ...patch
  });
}
function layoutTabs() {
  if (!windowRef) return;
  const { width, height } = windowRef.getContentBounds();
  for (const tab of tabs) {
    tab.view.setBounds(tab.id === activeTabId
      ? { x: 0, y: CHROME_HEIGHT, width: Math.max(0, width), height: Math.max(0, height - CHROME_HEIGHT) }
      : { x: 0, y: CHROME_HEIGHT, width: 0, height: 0 });
  }
}
function scheduleSessionSave() {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => { saveSession().catch(() => {}); }, 250);
}
async function saveSession() {
  if (!app.isReady()) return;
  const file = path.join(app.getPath("userData"), "session.json");
  const liveTabs = persistableTabs(tabs, isWebUrl, 20).map((tab) => ({ id: tab.id, url: tab.url, title: tab.title }));
  const savedTabs = liveTabs.length ? liveTabs : (lastSessionSnapshot?.tabs ?? []);
  const liveActiveIndex = liveTabs.findIndex((tab) => tab.id === activeTabId);
  const payload = {
    version: SESSION_VERSION,
    activeTabId: (activeTab() && !activeTab().isPrivate ? activeTab().id : null) ?? lastSessionSnapshot?.activeTabId ?? null,
    activeIndex: liveActiveIndex >= 0 ? liveActiveIndex : (lastSessionSnapshot?.activeIndex ?? 0),
    activeUrl: (activeTab() && !activeTab().isPrivate ? activeTab().url : null) ?? lastSessionSnapshot?.activeUrl ?? "https://www.google.com/",
    tabs: savedTabs.map(({ url, title }) => ({ url, title })).slice(0, 20)
  };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
}
async function readSession() {
  try {
    const file = path.join(app.getPath("userData"), "session.json");
    const data = JSON.parse(await readFile(file, "utf8"));
    if (data.version !== SESSION_VERSION || !Array.isArray(data.tabs)) return { urls: [], activeIndex: 0 };
    const urls = data.tabs.map((tab) => tab?.url)
      .filter((url) => typeof url === "string" && isWebUrl(url)).slice(0, 10);
    const activeIndex = Number.isInteger(data.activeIndex)
      ? Math.max(0, Math.min(data.activeIndex, Math.max(0, urls.length - 1)))
      : Math.max(0, urls.indexOf(data.activeUrl));
    return { urls, activeIndex };
  } catch { return { urls: [], activeIndex: 0 }; }
}
async function persistProfile() {
  profileWriteQueue = profileWriteQueue.catch(() => {}).then(async () => {
    const file = path.join(app.getPath("userData"), "profile.json");
    const temporary = file + ".tmp";
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(temporary, JSON.stringify(profile, null, 2), { mode: 0o600 });
    await rename(temporary, file);
  });
  return profileWriteQueue;
}
async function loadProfile() {
  try {
    const data = JSON.parse(await readFile(path.join(app.getPath("userData"), "profile.json"), "utf8"));
    if (data.version !== PROFILE_VERSION) return;
    profile = {
      version: PROFILE_VERSION,
      bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks
        .filter((item) => item && isWebUrl(item.url) && typeof item.title === "string").slice(0, MAX_BOOKMARKS) : [],
      history: Array.isArray(data.history) ? data.history
        .filter((item) => item && isWebUrl(item.url) && typeof item.visitedAt === "string").slice(0, MAX_HISTORY_ITEMS) : [],
      downloads: Array.isArray(data.downloads) ? data.downloads
        .filter((item) => item && typeof item.id === "string" && typeof item.filename === "string"
          && typeof item.savePath === "string" && item.state === "completed")
        .slice(0, MAX_DOWNLOADS) : []
    };
    for (const item of profile.downloads) downloads.set(item.id, { ...item, item: null, restored: true });
  } catch { profile = { version: PROFILE_VERSION, bookmarks: [], history: [], downloads: [] }; }
}
function recordHistory(tab) {
  if (!shouldRecordHistory(tab, isWebUrl)) return;
  profile.history.unshift({ url: tab.url, title: tab.title || tab.url, visitedAt: new Date().toISOString() });
  profile.history = profile.history.slice(0, MAX_HISTORY_ITEMS);
  persistProfile().catch(() => {});
}
async function navigate(rawInput, tabId = activeTabId) {
  const tab = tabs.find((candidate) => candidate.id === tabId);
  if (!tab) throw new Error("The selected tab no longer exists.");
  const destination = resolveAddress(rawInput);
  if (!isWebUrl(destination)) throw new TypeError("Only HTTP and HTTPS destinations are allowed.");
  tab.url = destination; tab.loading = true; tab.error = ""; sendState();
  try {
    await tab.view.webContents.loadURL(destination);
  } catch (error) {
    tab.loading = false;
    tab.error = error instanceof Error ? error.message : "The page could not be loaded.";
    if (tab.id === activeTabId) sendState();
    throw error;
  }
  scheduleSessionSave();
  return destination;
}
function downloadSnapshot(download) {
  return { id: download.id, filename: download.filename, url: download.url, state: download.state,
    receivedBytes: download.receivedBytes, totalBytes: download.totalBytes, savePath: download.savePath ?? null };
}
function sendDownloads() {
  if (!windowRef || windowRef.isDestroyed()) return;
  windowRef.webContents.send("browser:downloads:state", [...downloads.values()].map(downloadSnapshot));
}
function rememberCompletedDownload(download) {
  if (!shouldPersistCompletedDownload(download)) return;
  profile.downloads = [
    { id: download.id, filename: download.filename, url: isWebUrl(download.url) ? download.url : "",
      state: "completed", receivedBytes: download.receivedBytes, totalBytes: download.totalBytes,
      savePath: download.savePath, completedAt: new Date().toISOString() },
    ...profile.downloads.filter((item) => item.id !== download.id)
  ].slice(0, MAX_DOWNLOADS);
  persistProfile().catch(() => {});
}
function attachDownloadHandler(browserSession) {
  if (downloadSessions.has(browserSession)) return;
  downloadSessions.add(browserSession);
  browserSession.on("will-download", async (_event, item) => {
    const id = randomUUID();
    const download = {
      id, filename: item.getFilename(), url: item.getURL(), state: "choosing-location",
      receivedBytes: 0, totalBytes: item.getTotalBytes(), savePath: null, item, isPrivate: privateSessions.has(browserSession),
      tabId: tabs.find((tab) => tab.view.webContents.session === browserSession)?.id ?? null, startedAt: new Date().toISOString()
    };
    downloads.set(id, download);
    while (downloads.size > MAX_DOWNLOADS) {
      const oldest = downloads.keys().next().value;
      if (oldest === id) break;
      if (downloads.get(oldest)?.state === "in-progress" || downloads.get(oldest)?.state === "choosing-location") break;
      downloads.delete(oldest);
    }
    item.on("updated", (_event, state) => {
      download.state = state === "interrupted" ? "interrupted" : "in-progress";
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      sendDownloads();
    });
    item.once("done", (_event, state) => {
      download.state = state;
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      if (state === "completed") rememberCompletedDownload(download);
      sendDownloads();
    });
    sendDownloads();
    try {
      if (!windowRef || windowRef.isDestroyed()) throw new Error("Browser window is unavailable.");
      const result = await dialog.showSaveDialog(windowRef, { defaultPath: download.filename, title: "Save download" });
      if (result.canceled || !result.filePath) {
        item.cancel();
        download.state = "cancelled";
        sendDownloads();
        return;
      }
      download.savePath = result.filePath;
      item.setSavePath(result.filePath);
      download.state = "in-progress";
      sendDownloads();
    } catch {
      item.cancel();
      download.state = "cancelled";
      sendDownloads();
    }
  });
}
function safeOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname));
  } catch { return false; }
}
function permissionKey(origin, permission) { return origin + "|" + permission; }
async function requestPermission(origin, permission, browserSession) {
  if (!PERMISSION_LABELS[permission] || !safeOrigin(origin)) return false;
  const key = permissionKey(origin, permission);
  let grants = permissionGrants.get(browserSession);
  if (!grants) { grants = new Set(); permissionGrants.set(browserSession, grants); }
  let pending = pendingPermissionPrompts.get(browserSession);
  if (!pending) { pending = new Map(); pendingPermissionPrompts.set(browserSession, pending); }
  if (grants.has(key)) return true;
  if (pending.has(key)) return pending.get(key);
  const prompt = (async () => {
    if (!windowRef || windowRef.isDestroyed()) return false;
    const result = await dialog.showMessageBox(windowRef, {
      type: "question",
      title: "Website permission request",
      message: new URL(origin).host + " wants access to " + PERMISSION_LABELS[permission] + ".",
      detail: "Allowing applies only for this running Browser C session. Unknown permissions and insecure origins are blocked.",
      buttons: ["Block", "Allow for this session"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    const allowed = result.response === 1;
    if (allowed) grants.add(key);
    return allowed;
  })().catch(() => false).finally(() => pending.delete(key));
  pending.set(key, prompt);
  return prompt;
}
function attachPermissionHandlers(browserSession) {
  browserSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const origin = String(details?.requestingOrigin || "");
    const currentUrl = contents.getURL();
    if (!isWebUrl(currentUrl) || !safeOrigin(origin) || !PERMISSION_LABELS[permission]) {
      callback(false);
      return;
    }
    requestPermission(origin, permission, browserSession).then(callback).catch(() => callback(false));
  });
  browserSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    const grants = permissionGrants.get(browserSession);
    return Boolean(PERMISSION_LABELS[permission] && safeOrigin(String(requestingOrigin || ""))
      && grants?.has(permissionKey(String(requestingOrigin), permission)));
  });
}
function attachTabEvents(tab) {
  const contents = tab.view.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
  contents.on("will-redirect", (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
  contents.on("did-start-navigation", (_event, url, _inPlace, isMainFrame) => {
    if (isMainFrame && isWebUrl(url)) tab.url = url;
    tab.loading = true; tab.error = ""; sendState({ error: "" });
  });
  contents.on("page-title-updated", (_event, title) => {
    tab.title = title || "New Tab";
    const recent = tab.isPrivate ? null : profile.history.find((item) => item.url === tab.url);
    if (recent) { recent.title = tab.title; persistProfile().catch(() => {}); }
    sendState();
  });
  contents.on("did-navigate", (_event, url) => {
    tab.url = url; tab.title = contents.getTitle() || "New Tab"; tab.loading = false;
    recordHistory(tab);
    sendState(); scheduleSessionSave();
  });
  contents.on("did-navigate-in-page", (_event, url) => { tab.url = url; sendState(); scheduleSessionSave(); });
  contents.on("did-finish-load", () => {
    tab.url = contents.getURL(); tab.title = contents.getTitle() || "New Tab"; tab.loading = false; tab.error = ""; sendState();
  });
  contents.on("did-stop-loading", () => {
    tab.loading = false;
    sendState();
  });
  contents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      tab.loading = false;
      tab.error = description || "The page could not be loaded.";
      if (tab.id === activeTabId) sendState({ url: validatedURL });
    }
  });
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !(input.control || input.meta)) return;
    const key = String(input.key || "").toLowerCase();
    if (key === "n" && input.shift) { event.preventDefault(); createTab("https://www.google.com/", true); }
    else if (key === "t") { event.preventDefault(); createTab(); }
    else if (key === "w") { event.preventDefault(); closeTab(tab.id); }
    else if (key === "l") { event.preventDefault(); windowRef?.webContents.send("browser:focus-address"); }
    else if (key === "f") { event.preventDefault(); windowRef?.webContents.send("browser:find:open"); }
    else if (key === "+" || key === "=") { event.preventDefault(); changeZoom("in", tab.id); }
    else if (key === "-") { event.preventDefault(); changeZoom("out", tab.id); }
    else if (key === "0") { event.preventDefault(); changeZoom("reset", tab.id); }
    else if (key === "r") { event.preventDefault(); contents.reload(); }
    else if (key === "tab" && tabs.length > 1) {
      event.preventDefault();
      const index = tabs.findIndex((candidate) => candidate.id === activeTabId);
      const delta = input.shift ? -1 : 1;
      activateTab(tabs[(index + delta + tabs.length) % tabs.length].id);
    }
  });
  const browserSession = contents.session;
  attachDownloadHandler(browserSession);
  attachPermissionHandlers(browserSession);
}
function createTab(url = "https://www.google.com/", privateMode = false) {
  const id = nextTabId++;
  const partition = privateMode ? "private-" + randomUUID() : "persist:browser-c";
  const view = new WebContentsView({ webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
    allowRunningInsecureContent: false, navigateOnDragDrop: false, partition
  }});
  const tab = { id, view, url, title: privateMode ? "Private tab" : "New Tab", loading: true, error: "", isPrivate: privateMode };
  if (privateMode) privateSessions.add(view.webContents.session);
  tabs.push(tab); windowRef.contentView.addChildView(view); attachTabEvents(tab);
  activeTabId = id; layoutTabs();
  view.webContents.loadURL(url).catch(() => {
    tab.loading = false;
    tab.error ||= "The page could not be loaded.";
    if (tab.id === activeTabId) sendState();
  });
  sendState(); scheduleSessionSave();
  return tabSnapshot(tab);
}
function changeZoom(action, tabId = activeTabId) {
  const tab = tabs.find((candidate) => candidate.id === Number(tabId));
  if (!tab) return { ok: false, error: "Tab not found." };
  const current = tab.view.webContents.getZoomFactor();
  const next = action === "reset" ? 1 : action === "in" ? Math.min(3, current + 0.1) : action === "out" ? Math.max(0.5, current - 0.1) : null;
  if (next === null) return { ok: false, error: "Unsupported zoom action." };
  tab.view.webContents.setZoomFactor(Number(next.toFixed(2)));
  sendState();
  return { ok: true, zoomFactor: tab.view.webContents.getZoomFactor() };
}
function activateTab(id) {
  const tab = tabs.find((candidate) => candidate.id === Number(id));
  if (!tab) return { ok: false, error: "Tab not found." };
  activeTabId = tab.id; layoutTabs(); sendState(); return { ok: true, activeTabId };
}
function closeTab(id = activeTabId) {
  const index = tabs.findIndex((tab) => tab.id === Number(id));
  if (index < 0) return { ok: false, error: "Tab not found." };
  const [tab] = tabs.splice(index, 1);
  if (tab.isPrivate) {
    for (const [downloadId, download] of downloads) {
      if (download.tabId !== tab.id) continue;
      if (download.item && shouldCancelDownloadOnTabClose(download)) download.item.cancel();
      downloads.delete(downloadId);
    }
    sendDownloads();
    tab.view.webContents.session.clearStorageData().catch(() => {});
    tab.view.webContents.session.clearCache().catch(() => {});
  }
  windowRef.contentView.removeChildView(tab.view); tab.view.webContents.close();
  if (!tabs.length) createTab();
  else if (tab.id === activeTabId) activeTabId = tabs[Math.min(index, tabs.length - 1)].id;
  layoutTabs(); sendState(); scheduleSessionSave(); return { ok: true, activeTabId };
}
function createWindow() {
  windowRef = new BrowserWindow({
    width: 1280, height: 840, minWidth: 520, minHeight: 480, title: "Browser C", backgroundColor: "#101214",
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false }
  });
  const chromePath = path.join(here, "renderer", "index.html");
  const chromeUrl = pathToFileURL(chromePath).href;
  windowRef.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  windowRef.webContents.on("will-navigate", (event, url) => { if (url !== chromeUrl) event.preventDefault(); });
  windowRef.webContents.on("will-redirect", (event, url) => { if (url !== chromeUrl) event.preventDefault(); });
  windowRef.on("resize", layoutTabs);
  windowRef.on("closed", () => {
    const savedTabs = persistableTabs(tabs, isWebUrl, 20).map((tab) => ({ id: tab.id, url: tab.url, title: tab.title }));
    lastSessionSnapshot = {
      activeTabId: activeTab() && !activeTab().isPrivate ? activeTabId : null,
      activeIndex: Math.max(0, savedTabs.findIndex((tab) => tab.id === activeTabId)),
      activeUrl: activeTab() && !activeTab().isPrivate ? activeTab().url : (savedTabs[0]?.url ?? "https://www.google.com/"),
      tabs: savedTabs.map(({ url, title }) => ({ url, title }))
    };
    windowRef = undefined;
    tabs = [];
    activeTabId = null;
  });
  if (process.env.BROWSER_C_SMOKE === "1") {
    windowRef.webContents.once("did-finish-load", async () => {
      try {
        const result = await windowRef.webContents.executeJavaScript(`(() => {
          const selectors = [
            ".toolbar", "#tabs", "#address", "#new-tab", "#new-private-tab",
            "#show-bookmarks", "#show-history", "#show-downloads", "#find-bar",
            "#zoom-reset", "#library-panel", "#status"
          ];
          const missing = selectors.filter((selector) => !document.querySelector(selector));
          return {
            missing,
            toolbarHeight: getComputedStyle(document.querySelector(".toolbar")).height,
            bridgeAvailable: Boolean(window.browserC)
          };
        })()`);
        if (result.missing.length || result.toolbarHeight !== "136px" || !result.bridgeAvailable) {
          throw new Error("UI smoke assertions failed: " + JSON.stringify(result));
        }
        const interactions = await windowRef.webContents.executeJavaScript(`(async () => {
          const waitFor = async (predicate, label) => {
            for (let attempt = 0; attempt < 30; attempt++) {
              if (predicate()) return;
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            throw new Error("Timed out waiting for " + label);
          };
          const privateButton = document.querySelector("#new-private-tab");
          privateButton.click();
          await waitFor(() => document.querySelector(".tab.private-tab"), "private tab to render");
          const privateTab = document.querySelector(".tab.private-tab");
          const privateSelect = privateTab.querySelector(".tab-select");
          privateSelect.click();
          await waitFor(() => document.body.classList.contains("private-mode"), "private-mode state");
          const privateState = {
            tabLabel: privateSelect.getAttribute("aria-label"),
            bookmarkDisabled: document.querySelector("#bookmark-current").disabled,
            statusClear: document.querySelector("#status").textContent.includes("history and tabs are not saved")
          };
          document.dispatchEvent(new KeyboardEvent("keydown", {
            key: "f", ctrlKey: true, bubbles: true, cancelable: true
          }));
          const findBar = document.querySelector("#find-bar");
          const findOverlay = !findBar.hidden
            && getComputedStyle(findBar).position === "absolute"
            && findBar.getBoundingClientRect().top < document.querySelector(".toolbar").getBoundingClientRect().bottom;
          document.querySelector("#find-close").click();
          privateSelect.focus();
          privateSelect.dispatchEvent(new KeyboardEvent("keydown", {
            key: "ArrowLeft", bubbles: true, cancelable: true
          }));
          await waitFor(() => !document.body.classList.contains("private-mode"), "keyboard-selected regular tab");
          const keyboardTabNavigationWorks = document.activeElement?.dataset?.tabId
            === document.querySelector(".tab:not(.private-tab) .tab-select")?.dataset?.tabId;
          privateTab.querySelector(".tab-close").click();
          await waitFor(() => !document.querySelector(".tab.private-tab"), "private tab close");
          return {
            privateTabLabel: privateState.tabLabel,
            bookmarkDisabled: privateState.bookmarkDisabled,
            privacyStatusClear: privateState.statusClear,
            findShortcutOpensOverlay: findOverlay,
            keyboardTabNavigationWorks,
            privateTabCloses: !document.querySelector(".tab.private-tab")
          };
        })()`);
        if (!interactions.privateTabLabel?.startsWith("Private tab:")
          || !interactions.bookmarkDisabled || !interactions.privacyStatusClear
          || !interactions.findShortcutOpensOverlay || !interactions.keyboardTabNavigationWorks
          || !interactions.privateTabCloses) {
          throw new Error("UI interaction assertions failed: " + JSON.stringify(interactions));
        }
        windowRef.setSize(520, 840);
        const narrowLayout = await windowRef.webContents.executeJavaScript(`(async () => {
          for (let attempt = 0; attempt < 30 && document.documentElement.clientWidth > 560; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const width = document.documentElement.clientWidth;
          const toolbar = document.querySelector(".toolbar");
          const rows = [".tab-row", ".controls", ".library-controls"].map((selector) => {
            const element = document.querySelector(selector);
            return { selector, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
          });
          return {
            viewportWidth: width,
            toolbarClientWidth: toolbar.clientWidth,
            toolbarScrollWidth: toolbar.scrollWidth,
            homeHidden: getComputedStyle(document.querySelector("#home")).display === "none",
            rows
          };
        })()`);
        if (narrowLayout.viewportWidth > 560
          || narrowLayout.toolbarScrollWidth > narrowLayout.toolbarClientWidth
          || narrowLayout.rows.some((row) => row.scrollWidth > row.clientWidth)) {
          throw new Error("Responsive layout overflow at 520px: " + JSON.stringify(narrowLayout));
        }
        windowRef.setSize(1280, 840);
        const fixtureHits = new Map();
        const fixtureServer = createServer((request, response) => {
          const route = new URL(request.url || "/", "http://127.0.0.1").pathname;
          fixtureHits.set(route, (fixtureHits.get(route) || 0) + 1);
          if (route === "/redirect") {
            response.writeHead(302, { location: "/one" });
            response.end();
            return;
          }
          if (route === "/slow") {
            const timer = setTimeout(() => {
              response.writeHead(200, { "content-type": "text/html" });
              response.end("<title>Slow fixture</title><p>Delayed response</p>");
            }, 1500);
            response.on("close", () => clearTimeout(timer));
            return;
          }
          response.writeHead(200, { "content-type": "text/html" });
          response.end("<!doctype html><title>" + route.slice(1) + "</title><p>Navigation fixture: " + route + "</p>");
        });
        await new Promise((resolve, reject) => {
          fixtureServer.once("error", reject);
          fixtureServer.listen(0, "127.0.0.1", resolve);
        });
        const fixtureOrigin = "http://127.0.0.1:" + fixtureServer.address().port;
        const fixtureTabSnapshot = createTab(fixtureOrigin + "/one");
        const fixtureTab = tabs.find((tab) => tab.id === fixtureTabSnapshot.id);
        const waitForFixture = async (predicate, label) => {
          for (let attempt = 0; attempt < 50; attempt++) {
            if (predicate()) return;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw new Error("Timed out waiting for navigation fixture: " + label);
        };
        try {
          await waitForFixture(() => fixtureTab.view.webContents.getURL().endsWith("/one") && !fixtureTab.loading, "first page");
          await navigate(fixtureOrigin + "/two", fixtureTab.id);
          await waitForFixture(() => fixtureTab.view.webContents.getURL().endsWith("/two") && !fixtureTab.loading, "second page");
          const waitForNavigationEvent = (targetPath, trigger) => new Promise((resolve, reject) => {
            const contents = fixtureTab.view.webContents;
            const timer = setTimeout(() => {
              contents.removeListener("did-navigate", onNavigate);
              reject(new Error("Timed out waiting for navigation event: " + targetPath));
            }, 4000);
            const onNavigate = (_event, url) => {
              if (!url.endsWith(targetPath)) return;
              clearTimeout(timer);
              contents.removeListener("did-navigate", onNavigate);
              resolve();
            };
            contents.on("did-navigate", onNavigate);
            trigger();
          });
          await waitForNavigationEvent("/one", () => fixtureTab.view.webContents.navigationHistory.goBack());
          await waitForFixture(() => fixtureTab.view.webContents.getURL().endsWith("/one") && !fixtureTab.loading, "back navigation");
          await waitForNavigationEvent("/two", () => fixtureTab.view.webContents.navigationHistory.goForward());
          await waitForFixture(() => fixtureTab.view.webContents.getURL().endsWith("/two") && !fixtureTab.loading, "forward navigation");
          const backForwardWorks = fixtureTab.view.webContents.getURL().endsWith("/two");
          const previousReloadCount = fixtureHits.get("/two") || 0;
          fixtureTab.view.webContents.reload();
          await waitForFixture(() => (fixtureHits.get("/two") || 0) > previousReloadCount && !fixtureTab.loading, "reload");
          const slowNavigation = navigate(fixtureOrigin + "/slow", fixtureTab.id).catch(() => {});
          await waitForFixture(() => fixtureTab.url.endsWith("/slow") && fixtureTab.loading, "slow navigation start");
          fixtureTab.view.webContents.stop();
          await waitForFixture(() => !fixtureTab.loading, "stop to clear loading state");
          await slowNavigation;
          await navigate(fixtureOrigin + "/redirect", fixtureTab.id);
          await waitForFixture(() => fixtureTab.view.webContents.getURL().endsWith("/one") && !fixtureTab.loading, "redirect destination");
          const redirectWorks = fixtureTab.view.webContents.getURL().endsWith("/one");
          const refusedServer = createServer();
          await new Promise((resolve, reject) => {
            refusedServer.once("error", reject);
            refusedServer.listen(0, "127.0.0.1", resolve);
          });
          const refusedPort = refusedServer.address().port;
          await new Promise((resolve) => refusedServer.close(resolve));
          await navigate("http://127.0.0.1:" + refusedPort + "/unreachable", fixtureTab.id).catch(() => {});
          await waitForFixture(() => Boolean(fixtureTab.error) && !fixtureTab.loading, "failed navigation error state");
          const failureFeedback = await windowRef.webContents.executeJavaScript("(() => ({ statusShowsError: document.getElementById('status').textContent.includes('Load error:'), retryVisible: !document.getElementById('retry-navigation').hidden, retryEnabled: !document.getElementById('retry-navigation').disabled }))()");
          const retryStarted = new Promise((resolve) => fixtureTab.view.webContents.once("did-start-navigation", resolve));
          await windowRef.webContents.executeJavaScript("document.getElementById('retry-navigation').click()");
          await retryStarted;
          await waitForFixture(() => Boolean(fixtureTab.error) && !fixtureTab.loading, "retry failure feedback");
          const retryWorks = await windowRef.webContents.executeJavaScript("!document.getElementById('retry-navigation').hidden");
          const navigationIntegration = {
            backForwardWorks,
            reloadWorks: (fixtureHits.get("/two") || 0) > previousReloadCount,
            stopClearsLoading: !fixtureTab.loading,
            redirectWorks,
            failureFeedback,
            retryWorks,
            currentUrl: fixtureTab.view.webContents.getURL(),
            fixtureHits: Object.fromEntries(fixtureHits)
          };
          if (!navigationIntegration.backForwardWorks || !navigationIntegration.reloadWorks || !navigationIntegration.stopClearsLoading
            || !navigationIntegration.redirectWorks || !failureFeedback.statusShowsError || !failureFeedback.retryVisible
            || !failureFeedback.retryEnabled || !retryWorks) {
            throw new Error("Navigation integration assertions failed: " + JSON.stringify(navigationIntegration));
          }
          console.log("BROWSER_C_NAVIGATION_SMOKE_PASS " + JSON.stringify(navigationIntegration));
        } finally {
          closeTab(fixtureTab.id);
          await new Promise((resolve) => fixtureServer.close(resolve));
        }
        console.log("BROWSER_C_UI_SMOKE_PASS " + JSON.stringify({ ...result, interactions, narrowLayout }));
      } catch (error) {
        console.error("BROWSER_C_UI_SMOKE_FAIL " + (error?.stack || error));
        app.exit(1);
      }
    });
  }
  windowRef.loadFile(chromePath);
}
ipcMain.handle("browser:navigate", async (_event, input) => {
  try { return { ok: true, url: await navigate(input) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Navigation failed." }; }
});
ipcMain.handle("browser:back", () => { const tab = activeTab(); if (tab && canGoBack(tab.view.webContents)) tab.view.webContents.navigationHistory.goBack(); });
ipcMain.handle("browser:forward", () => { const tab = activeTab(); if (tab && canGoForward(tab.view.webContents)) tab.view.webContents.navigationHistory.goForward(); });
ipcMain.handle("browser:reload", () => activeTab()?.view.webContents.reload());
ipcMain.handle("browser:stop", () => activeTab()?.view.webContents.stop());
ipcMain.handle("browser:find:start", (_event, query) => {
  const tab = activeTab();
  const value = String(query ?? "").slice(0, 500);
  if (!tab || !value.trim()) return { ok: false, error: "Enter text to find." };
  tab.view.webContents.findInPage(value, { matchCase: false, findNext: false });
  return { ok: true };
});
ipcMain.handle("browser:find:next", (_event, query) => {
  const tab = activeTab();
  const value = String(query ?? "").slice(0, 500);
  if (!tab || !value.trim()) return { ok: false, error: "Enter text to find." };
  tab.view.webContents.findInPage(value, { matchCase: false, findNext: true, forward: true });
  return { ok: true };
});
ipcMain.handle("browser:find:previous", (_event, query) => {
  const tab = activeTab();
  const value = String(query ?? "").slice(0, 500);
  if (!tab || !value.trim()) return { ok: false, error: "Enter text to find." };
  tab.view.webContents.findInPage(value, { matchCase: false, findNext: true, forward: false });
  return { ok: true };
});
ipcMain.handle("browser:find:stop", () => {
  activeTab()?.view.webContents.stopFindInPage("clearSelection");
  return { ok: true };
});
ipcMain.handle("browser:zoom", (_event, action) => changeZoom(String(action)));
ipcMain.handle("browser:home", () => navigate("https://www.google.com/").catch(() => {}));
ipcMain.handle("browser:new-tab", () => createTab());
ipcMain.handle("browser:new-private-tab", () => createTab("https://www.google.com/", true));
ipcMain.handle("browser:activate-tab", (_event, id) => activateTab(id));
ipcMain.handle("browser:close-tab", (_event, id) => closeTab(id));
ipcMain.handle("browser:get-state", () => {
  const tab = activeTab();
  return { tabs: tabs.map(tabSnapshot), activeTabId, url: tab?.url ?? "", title: tab?.title ?? "Browser C", isPrivate: Boolean(tab?.isPrivate),
    canGoBack: Boolean(tab && canGoBack(tab.view.webContents)), canGoForward: Boolean(tab && canGoForward(tab.view.webContents)),
    loading: Boolean(tab?.loading), error: tab?.error ?? "", zoomFactor: tab?.view.webContents.getZoomFactor() ?? 1 };
});
ipcMain.handle("browser:bookmarks:get", () => profile.bookmarks);
ipcMain.handle("browser:bookmarks:toggle", async (_event, item) => {
  if (!canBookmarkTab(activeTab())) return { ok: false, error: "Bookmarks are disabled in private tabs." };
  if (!item || !isWebUrl(item.url)) return { ok: false, error: "Only HTTP and HTTPS pages can be bookmarked." };
  const index = profile.bookmarks.findIndex((bookmark) => bookmark.url === item.url);
  if (index >= 0) profile.bookmarks.splice(index, 1);
  else profile.bookmarks.unshift({ url: item.url, title: String(item.title || item.url).slice(0, 300), createdAt: new Date().toISOString() });
  profile.bookmarks = profile.bookmarks.slice(0, MAX_BOOKMARKS);
  await persistProfile();
  return { ok: true, bookmarked: index < 0, bookmarks: profile.bookmarks };
});
ipcMain.handle("browser:history:get", () => profile.history.slice(0, 100));
ipcMain.handle("browser:downloads:get", () => [...downloads.values()].map(downloadSnapshot));
ipcMain.handle("browser:downloads:cancel", (_event, id) => {
  const download = downloads.get(String(id));
  if (!download?.item || !["choosing-location", "in-progress"].includes(download.state)) return { ok: false };
  download.item.cancel();
  download.state = "cancelled";
  sendDownloads();
  return { ok: true };
});
ipcMain.handle("browser:downloads:reveal", (_event, id) => {
  const download = downloads.get(String(id));
  if (!download || download.state !== "completed" || typeof download.savePath !== "string" || !download.savePath) {
    return { ok: false, error: "Only completed downloads can be revealed." };
  }
  shell.showItemInFolder(download.savePath);
  return { ok: true };
});
ipcMain.handle("browser:history:clear", async () => {
  profile.history = [];
  await persistProfile();
  return { ok: true };
});

function restoreTabs(session) {
  if (session.urls.length) {
    for (const url of session.urls) createTab(url);
    activateTab(tabs[Math.min(session.activeIndex, tabs.length - 1)].id);
  } else createTab();
  layoutTabs();
  sendState();
}
app.whenReady().then(async () => {
  await loadProfile();
  createWindow();
  restoreTabs(await readSession());
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      restoreTabs(await readSession());
    }
  });
});
app.on("before-quit", (event) => {
  if (quitAfterSessionSave) return;
  event.preventDefault();
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  Promise.all([saveSession(), persistProfile()]).catch(() => {}).finally(() => { quitAfterSessionSave = true; app.quit(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
