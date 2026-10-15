import { app, BrowserWindow, WebContentsView, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isWebUrl, resolveAddress } from "./navigation.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME_HEIGHT = 112;
const SESSION_VERSION = 1;
let windowRef;
let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let sessionSaveTimer;

const activeTab = () => tabs.find((tab) => tab.id === activeTabId) ?? null;
function tabSnapshot(tab) {
  return { id: tab.id, url: tab.url, title: tab.title || "New Tab", loading: Boolean(tab.loading),
    canGoBack: tab.view.webContents.canGoBack(), canGoForward: tab.view.webContents.canGoForward(),
    active: tab.id === activeTabId };
}
function sendState(patch = {}) {
  if (!windowRef || windowRef.isDestroyed()) return;
  const tab = activeTab();
  windowRef.webContents.send("browser:state", {
    tabs: tabs.map(tabSnapshot), activeTabId, url: tab?.url ?? "", title: tab?.title ?? "Browser C",
    loading: Boolean(tab?.loading), canGoBack: Boolean(tab && tab.view.webContents.canGoBack()),
    canGoForward: Boolean(tab && tab.view.webContents.canGoForward()), ...patch
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
  const payload = { version: SESSION_VERSION, activeTabId,
    tabs: tabs.map((tab) => ({ url: tab.url, title: tab.title })).filter((tab) => isWebUrl(tab.url)).slice(0, 20) };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
}
async function readSession() {
  try {
    const file = path.join(app.getPath("userData"), "session.json");
    const data = JSON.parse(await readFile(file, "utf8"));
    if (data.version !== SESSION_VERSION || !Array.isArray(data.tabs)) return [];
    return data.tabs.map((tab) => tab?.url).filter((url) => typeof url === "string" && isWebUrl(url)).slice(0, 10);
  } catch { return []; }
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
function attachTabEvents(tab) {
  const contents = tab.view.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
  contents.on("will-redirect", (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
  contents.on("did-start-navigation", (_event, url, _inPlace, isMainFrame) => {
    if (isMainFrame && isWebUrl(url)) tab.url = url;
    tab.loading = true; sendState();
  });
  contents.on("page-title-updated", (_event, title) => { tab.title = title || "New Tab"; sendState(); });
  contents.on("did-navigate", (_event, url) => {
    tab.url = url; tab.title = contents.getTitle() || "New Tab"; tab.loading = false;
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
  const browserSession = contents.session;
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
  windowRef.on("closed", () => { windowRef = undefined; tabs = []; activeTabId = null; });
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
ipcMain.handle("browser:home", () => navigate("https://www.google.com/").catch(() => {}));
ipcMain.handle("browser:new-tab", () => createTab());
ipcMain.handle("browser:activate-tab", (_event, id) => activateTab(id));
ipcMain.handle("browser:close-tab", (_event, id) => closeTab(id));
ipcMain.handle("browser:get-state", () => {
  const tab = activeTab();
  return { tabs: tabs.map(tabSnapshot), activeTabId, url: tab?.url ?? "", title: tab?.title ?? "Browser C",
    canGoBack: Boolean(tab && tab.view.webContents.canGoBack()), canGoForward: Boolean(tab && tab.view.webContents.canGoForward()),
    loading: Boolean(tab?.loading) };
});
app.whenReady().then(async () => {
  createWindow();
  const restored = await readSession();
  if (restored.length) {
    for (const tab of tabs) { windowRef.contentView.removeChildView(tab.view); tab.view.webContents.close(); }
    tabs = []; activeTabId = null;
    for (const url of restored) createTab(url);
    layoutTabs(); sendState();
  } else createTab();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) { createWindow(); createTab(); } });
});
app.on("before-quit", () => { if (sessionSaveTimer) clearTimeout(sessionSaveTimer); saveSession().catch(() => {}); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
