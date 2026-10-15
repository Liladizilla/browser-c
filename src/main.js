import { app, BrowserWindow, WebContentsView, ipcMain, dialog } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { isWebUrl, resolveAddress } from "./navigation.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME_HEIGHT = 178;
const SESSION_VERSION = 1;
const PROFILE_VERSION = 1;
const MAX_HISTORY_ITEMS = 500;
const MAX_BOOKMARKS = 200;
let windowRef;
let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let sessionSaveTimer;
let quitAfterSessionSave = false;
let lastSessionSnapshot = null;
let profile = { version: PROFILE_VERSION, bookmarks: [], history: [] };
let profileWriteQueue = Promise.resolve();
const downloads = new Map();
const downloadSessions = new WeakSet();

const activeTab = () => tabs.find((tab) => tab.id === activeTabId) ?? null;
function tabSnapshot(tab) {
  return { id: tab.id, url: tab.url, title: tab.title || "New Tab", loading: Boolean(tab.loading),
    canGoBack: tab.view.webContents.canGoBack(), canGoForward: tab.view.webContents.canGoForward(),
    zoomFactor: tab.view.webContents.getZoomFactor(), active: tab.id === activeTabId };
}
function sendState(patch = {}) {
  if (!windowRef || windowRef.isDestroyed()) return;
  const tab = activeTab();
  windowRef.webContents.send("browser:state", {
    tabs: tabs.map(tabSnapshot), activeTabId, url: tab?.url ?? "", title: tab?.title ?? "Browser C",
    loading: Boolean(tab?.loading), canGoBack: Boolean(tab && tab.view.webContents.canGoBack()),
    canGoForward: Boolean(tab && tab.view.webContents.canGoForward()),
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
  const liveTabs = tabs.map((tab) => ({ id: tab.id, url: tab.url, title: tab.title }))
    .filter((tab) => isWebUrl(tab.url)).slice(0, 20);
  const savedTabs = liveTabs.length ? liveTabs : (lastSessionSnapshot?.tabs ?? []);
  const liveActiveIndex = liveTabs.findIndex((tab) => tab.id === activeTabId);
  const payload = {
    version: SESSION_VERSION,
    activeTabId: activeTab()?.id ?? lastSessionSnapshot?.activeTabId ?? null,
    activeIndex: liveActiveIndex >= 0 ? liveActiveIndex : (lastSessionSnapshot?.activeIndex ?? 0),
    activeUrl: activeTab()?.url ?? lastSessionSnapshot?.activeUrl ?? "https://www.google.com/",
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
        .filter((item) => item && isWebUrl(item.url) && typeof item.visitedAt === "string").slice(0, MAX_HISTORY_ITEMS) : []
    };
  } catch { profile = { version: PROFILE_VERSION, bookmarks: [], history: [] }; }
}
function recordHistory(tab) {
  if (!isWebUrl(tab.url)) return;
  profile.history.unshift({ url: tab.url, title: tab.title || tab.url, visitedAt: new Date().toISOString() });
  profile.history = profile.history.slice(0, MAX_HISTORY_ITEMS);
  persistProfile().catch(() => {});
}
async function navigate(rawInput, tabId = activeTabId) {
  const tab = tabs.find((candidate) => candidate.id === tabId);
  if (!tab) throw new Error("The selected tab no longer exists.");
  const destination = resolveAddress(rawInput);
  if (!isWebUrl(destination)) throw new TypeError("Only HTTP and HTTPS destinations are allowed.");
  tab.url = destination; tab.loading = true; sendState();
  await tab.view.webContents.loadURL(destination);
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
function attachDownloadHandler(browserSession) {
  if (downloadSessions.has(browserSession)) return;
  downloadSessions.add(browserSession);
  browserSession.on("will-download", async (event, item) => {
    const id = randomUUID();
    const download = {
      id, filename: item.getFilename(), url: item.getURL(), state: "choosing-location",
      receivedBytes: 0, totalBytes: item.getTotalBytes(), savePath: null, item
    };
    downloads.set(id, download);
    sendDownloads();
    try {
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
      return;
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
      sendDownloads();
    });
  });
}
function attachTabEvents(tab) {
  const contents = tab.view.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
  contents.on("will-redirect", (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
  contents.on("did-start-navigation", (_event, url, _inPlace, isMainFrame) => {
    if (isMainFrame && isWebUrl(url)) tab.url = url;
    tab.loading = true; sendState();
  });
  contents.on("page-title-updated", (_event, title) => {
    tab.title = title || "New Tab";
    const recent = profile.history.find((item) => item.url === tab.url);
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
    tab.url = contents.getURL(); tab.title = contents.getTitle() || "New Tab"; tab.loading = false; sendState();
  });
  contents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      tab.loading = false;
      if (tab.id === activeTabId) sendState({ error: description, url: validatedURL });
    }
  });
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !(input.control || input.meta)) return;
    const key = String(input.key || "").toLowerCase();
    if (key === "t") { event.preventDefault(); createTab(); }
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
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
}
function createTab(url = "https://www.google.com/") {
  const id = nextTabId++;
  const view = new WebContentsView({ webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
    allowRunningInsecureContent: false, navigateOnDragDrop: false, partition: "persist:browser-c"
  }});
  const tab = { id, view, url, title: "New Tab", loading: true };
  tabs.push(tab); windowRef.contentView.addChildView(view); attachTabEvents(tab);
  activeTabId = id; layoutTabs();
  view.webContents.loadURL(url).catch(() => {
    tab.loading = false;
    if (tab.id === activeTabId) sendState({ error: "The page could not be loaded." });
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
  windowRef.contentView.removeChildView(tab.view); tab.view.webContents.close();
  if (!tabs.length) createTab();
  else if (tab.id === activeTabId) activeTabId = tabs[Math.min(index, tabs.length - 1)].id;
  layoutTabs(); sendState(); scheduleSessionSave(); return { ok: true, activeTabId };
}
function createWindow() {
  windowRef = new BrowserWindow({
    width: 1280, height: 840, minWidth: 720, minHeight: 480, title: "Browser C", backgroundColor: "#101214",
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false }
  });
  const chromePath = path.join(here, "renderer", "index.html");
  const chromeUrl = pathToFileURL(chromePath).href;
  windowRef.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  windowRef.webContents.on("will-navigate", (event, url) => { if (url !== chromeUrl) event.preventDefault(); });
  windowRef.webContents.on("will-redirect", (event, url) => { if (url !== chromeUrl) event.preventDefault(); });
  windowRef.on("resize", layoutTabs);
  windowRef.on("closed", () => {
    const savedTabs = tabs.map((tab) => ({ id: tab.id, url: tab.url, title: tab.title }))
      .filter((tab) => isWebUrl(tab.url)).slice(0, 20);
    lastSessionSnapshot = {
      activeTabId,
      activeIndex: Math.max(0, savedTabs.findIndex((tab) => tab.id === activeTabId)),
      activeUrl: activeTab()?.url ?? savedTabs[0]?.url ?? "https://www.google.com/",
      tabs: savedTabs.map(({ url, title }) => ({ url, title }))
    };
    windowRef = undefined;
    tabs = [];
    activeTabId = null;
  });
  windowRef.loadFile(chromePath);
}
ipcMain.handle("browser:navigate", async (_event, input) => {
  try { return { ok: true, url: await navigate(input) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Navigation failed." }; }
});
ipcMain.handle("browser:back", () => { const tab = activeTab(); if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack(); });
ipcMain.handle("browser:forward", () => { const tab = activeTab(); if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward(); });
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
ipcMain.handle("browser:activate-tab", (_event, id) => activateTab(id));
ipcMain.handle("browser:close-tab", (_event, id) => closeTab(id));
ipcMain.handle("browser:get-state", () => {
  const tab = activeTab();
  return { tabs: tabs.map(tabSnapshot), activeTabId, url: tab?.url ?? "", title: tab?.title ?? "Browser C",
    canGoBack: Boolean(tab && tab.view.webContents.canGoBack()), canGoForward: Boolean(tab && tab.view.webContents.canGoForward()),
    loading: Boolean(tab?.loading), zoomFactor: tab?.view.webContents.getZoomFactor() ?? 1 };
});
ipcMain.handle("browser:bookmarks:get", () => profile.bookmarks);
ipcMain.handle("browser:bookmarks:toggle", async (_event, item) => {
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
  if (!download || !["choosing-location", "in-progress"].includes(download.state)) return { ok: false };
  download.item.cancel();
  download.state = "cancelled";
  sendDownloads();
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
