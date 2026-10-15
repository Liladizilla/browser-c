import { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, safeStorage } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { isWebUrl, resolveAddress, navigationErrorMessage } from "./navigation.js";
import { canBookmarkTab, persistableTabs, shouldCancelDownloadOnTabClose, shouldPersistCompletedDownload, shouldRecordHistory } from "./privacy-policy.js";
import { downloadSafetyWarning } from "./download-policy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME_HEIGHT = 136;
const SESSION_VERSION = 1;
const PROFILE_VERSION = 1;
const MAX_HISTORY_ITEMS = 500;
const MAX_BOOKMARKS = 200;
const MAX_DOWNLOADS = 100;
const SEARCH_PROVIDERS = Object.freeze({ google: "Google", duckduckgo: "DuckDuckGo", bing: "Bing", brave: "Brave Search" });
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
let profile = { version: PROFILE_VERSION, bookmarks: [], history: [], downloads: [], searchProvider: "google", theme: "dark", homePage: "https://www.google.com/" };
let profileWriteQueue = Promise.resolve();
const downloads = new Map();
const downloadSessions = new WeakSet();
const permissionGrants = new WeakMap();
const pendingPermissionPrompts = new WeakMap();
const privateSessions = new WeakSet();
let passwordVault = [];
let passwordVaultAvailable = false;
let passwordVaultWriteQueue = Promise.resolve();
const MAX_PASSWORDS = 500;
function passwordVaultBackendAvailable() {
  if (!safeStorage.isEncryptionAvailable() || typeof safeStorage.getSelectedStorageBackend !== "function") return false;
  try {
    const backend = safeStorage.getSelectedStorageBackend();
    return ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6", "keychain", "dpapi"].includes(backend);
  } catch { return false; }
}
async function loadPasswordVault() {
  passwordVaultAvailable = passwordVaultBackendAvailable();
  if (!passwordVaultAvailable) { passwordVault = []; return; }
  try {
    const encrypted = await readFile(path.join(app.getPath("userData"), "password-vault.enc"));
    passwordVault = JSON.parse(safeStorage.decryptString(encrypted));
    if (!Array.isArray(passwordVault)) passwordVault = [];
    passwordVault = passwordVault.filter((item) => item && typeof item.id === "string" && typeof item.origin === "string"
      && typeof item.username === "string" && typeof item.password === "string").slice(0, MAX_PASSWORDS);
  } catch { passwordVault = []; }
}
async function persistPasswordVault() {
  if (!passwordVaultAvailable || !passwordVaultBackendAvailable()) throw new Error("Secure OS-backed password storage is unavailable. Browser C will not store passwords in plaintext.");
  passwordVaultWriteQueue = passwordVaultWriteQueue.catch(() => {}).then(async () => {
    const file = path.join(app.getPath("userData"), "password-vault.enc");
    const temporary = file + ".tmp";
    await mkdir(path.dirname(file), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(passwordVault));
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await rename(temporary, file);
  });
  return passwordVaultWriteQueue;
}
function passwordVaultSummary() {
  return { available: passwordVaultAvailable && passwordVaultBackendAvailable(),
    entries: passwordVault.map(({ id, origin, username, createdAt }) => ({ id, origin, username, createdAt })) };
}

const activeTab = () => tabs.find((tab) => tab.id === activeTabId) ?? null;
const canGoBack = (contents) => contents.navigationHistory.canGoBack();
const canGoForward = (contents) => contents.navigationHistory.canGoForward();
function tabSnapshot(tab) {
  return { id: tab.id, url: tab.url, title: tab.title || "New Tab", loading: Boolean(tab.loading), error: tab.error || "",
    canGoBack: canGoBack(tab.view.webContents), canGoForward: canGoForward(tab.view.webContents),
    zoomFactor: tab.view.webContents.getZoomFactor(), active: tab.id === activeTabId, isPrivate: Boolean(tab.isPrivate) };
}
function sendState(patch = {}) {
  if (!windowRef || windowRef.isDestroyed()) return;
  const tab = activeTab();
  windowRef.webContents.send("browser:state", {
    tabs: tabs.map(tabSnapshot), activeTabId, url: tab?.url ?? "", title: tab?.title ?? "Browser C", isPrivate: Boolean(tab?.isPrivate),
    loading: Boolean(tab?.loading), error: tab?.error || "", canGoBack: Boolean(tab && canGoBack(tab.view.webContents)),
    canGoForward: Boolean(tab && canGoForward(tab.view.webContents)),
    zoomFactor: tab?.view.webContents.getZoomFactor() ?? 1, sitePermissions: sitePermissions(tab), searchProvider: profile.searchProvider, theme: profile.theme, homePage: profile.homePage, windowMaximized: Boolean(windowRef?.isMaximized()), ...patch
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
      searchProvider: Object.hasOwn(SEARCH_PROVIDERS, data.searchProvider) ? data.searchProvider : "google",
      theme: ["dark", "light", "system"].includes(data.theme) ? data.theme : "dark",
      homePage: typeof data.homePage === "string" && isWebUrl(data.homePage) ? data.homePage : "https://www.google.com/",
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
  } catch { profile = { version: PROFILE_VERSION, bookmarks: [], history: [], downloads: [], searchProvider: "google", theme: "dark", homePage: "https://www.google.com/" }; }
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
  const destination = resolveAddress(rawInput, profile.searchProvider);
  if (!isWebUrl(destination)) throw new TypeError("Only HTTP and HTTPS destinations are allowed.");
  tab.url = destination; tab.loading = true; tab.error = ""; sendState();
  try {
    await tab.view.webContents.loadURL(destination);
  } catch (error) {
    tab.loading = false;
    tab.error = error instanceof Error ? error.message : "The page could not be loaded.";
    if (tab.id === activeTabId) sendState({ error: tab.error, url: destination });
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
      const warning = downloadSafetyWarning(download.filename);
      if (warning) {
        const confirmation = await dialog.showMessageBox(windowRef, {
          type: "warning",
          title: "Potentially unsafe download",
          message: "This file type can run code or change system settings.",
          detail: `File: ${download.filename}\nType: ${warning}\n\nBrowser C does not scan downloaded files. Continue only if you trust the source.`,
          buttons: ["Cancel download", "Continue to save"],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });
        if (confirmation.response !== 1) {
          item.cancel();
          download.state = "cancelled";
          sendDownloads();
          return;
        }
      }
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
function permissionKey(origin, permission) { return new URL(origin).origin + "|" + permission; }
function sitePermissions(tab) {
  if (!tab || !isWebUrl(tab.url)) return [];
  let origin;
  try { origin = new URL(tab.url).origin; } catch { return []; }
  if (!safeOrigin(origin)) return [];
  const grants = permissionGrants.get(tab.view.webContents.session);
  return Object.entries(PERMISSION_LABELS)
    .filter(([permission]) => grants?.has(permissionKey(origin, permission)))
    .map(([, label]) => label);
}
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
    requestPermission(origin, permission, browserSession).then((allowed) => {
      callback(allowed);
      if (allowed) sendState();
    }).catch(() => callback(false));
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
    tab.url = contents.getURL(); tab.title = contents.getTitle() || "New Tab"; tab.loading = false; tab.error = ""; sendState({ error: "" });
  });
  contents.on("did-stop-loading", () => {
    tab.loading = false;
    sendState();
  });
  contents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      tab.loading = false;
      tab.error = navigationErrorMessage(code, description);
      if (tab.id === activeTabId) sendState({ error: tab.error, url: validatedURL });
    }
  });
  contents.on("render-process-gone", (_event, details) => {
    if (!tabs.some((item) => item.id === tab.id)) return;
    tab.loading = false;
    const reason = String(details?.reason || "unknown");
    tab.error = "The page renderer stopped unexpectedly (" + reason + "). Reload this tab to recover.";
    if (tab.id === activeTabId) sendState({ error: tab.error, url: tab.url });
  });
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "Escape") { windowRef?.webContents.send("browser:escape"); return; }
    if (!(input.control || input.meta)) return;
    const key = String(input.key || "").toLowerCase();
    if (key === "n" && input.shift) { event.preventDefault(); createTab("https://www.google.com/", true); }
    else if (key === "t") { event.preventDefault(); createTab(); }
    else if (key === "w") { event.preventDefault(); closeTab(tab.id); }
    else if (key === "l") { event.preventDefault(); windowRef?.webContents.send("browser:focus-address"); }
    else if (key === "f") { event.preventDefault(); windowRef?.webContents.send("browser:find:open"); }
    else if (key === "j") { event.preventDefault(); windowRef?.webContents.send("browser:library:open", "downloads"); }
    else if (key === "h") { event.preventDefault(); windowRef?.webContents.send("browser:library:open", "history"); }
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
  const tab = { id, view, url, title: privateMode ? "Private tab" : "New Tab", loading: true, isPrivate: privateMode };
  if (privateMode) privateSessions.add(view.webContents.session);
  tabs.push(tab); windowRef.contentView.addChildView(view); attachTabEvents(tab);
  activeTabId = id; layoutTabs();
  view.webContents.loadURL(url).catch(() => {
    tab.loading = false;
    tab.error = tab.error || "The page could not be loaded.";
    if (tab.id === activeTabId) sendState({ error: tab.error });
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
    width: 1280, height: 840, minWidth: 520, minHeight: 480, title: "Browser C", backgroundColor: "#101214", frame: false,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false }
  });
  const chromePath = path.join(here, "renderer", "index.html");
  const chromeUrl = pathToFileURL(chromePath).href;
  windowRef.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  windowRef.webContents.on("will-navigate", (event, url) => { if (url !== chromeUrl) event.preventDefault(); });
  windowRef.webContents.on("will-redirect", (event, url) => { if (url !== chromeUrl) event.preventDefault(); });
  windowRef.on("resize", () => { layoutTabs(); sendState(); });
  windowRef.on("maximize", () => sendState());
  windowRef.on("unmaximize", () => sendState());
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

          const showHistory = document.querySelector("#show-history");
          showHistory.click();
          const libraryPanel = document.querySelector("#library-panel");
          await waitFor(() => !libraryPanel.hidden
            && showHistory.getAttribute("aria-expanded") === "true"
            && document.activeElement?.id === "close-library", "accessible library open and focus");
          const libraryOpenSemantics = libraryPanel.getAttribute("aria-labelledby") === "library-title"
            && document.querySelector("#show-bookmarks").getAttribute("aria-expanded") === "false"
            && document.querySelector("#show-downloads").getAttribute("aria-expanded") === "false";
          document.querySelector("#close-library").click();
          const libraryCloseSemantics = libraryPanel.hidden
            && showHistory.getAttribute("aria-expanded") === "false"
            && document.activeElement === showHistory;

          return {
            privateTabLabel: privateState.tabLabel,
            bookmarkDisabled: privateState.bookmarkDisabled,
            privacyStatusClear: privateState.statusClear,
            findShortcutOpensOverlay: findOverlay,
            keyboardTabNavigationWorks,
            privateTabCloses: !document.querySelector(".tab.private-tab"),
            libraryOpenSemantics,
            libraryCloseSemantics
          };
        })()`);
        if (!interactions.privateTabLabel?.startsWith("Private tab:")
          || !interactions.bookmarkDisabled || !interactions.privacyStatusClear
          || !interactions.findShortcutOpensOverlay || !interactions.keyboardTabNavigationWorks
          || !interactions.privateTabCloses || !interactions.libraryOpenSemantics || !interactions.libraryCloseSemantics) {
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
          if (route === "/redirect-chain") {
            response.writeHead(302, { location: "/redirect" });
            response.end();
            return;
          }
          if (route === "/redirect") {
            response.writeHead(302, { location: "/redirected" });
            response.end();
            return;
          }
          if (route === "/fail" || route === "/fail-background") {
            request.socket.destroy();
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
          for (let attempt = 0; attempt < 120; attempt++) {
            if (predicate()) return;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw new Error("Timed out waiting for navigation fixture after 6 seconds: " + label);
        };
        try {
          await waitForFixture(() => (fixtureHits.get("/one") || 0) > 0 && fixtureTab.view.webContents.getTitle() === "one" && !fixtureTab.loading, "first page committed");
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
          let observedNavigationError = "";
          const onFixtureState = (_event, state) => {
            if (state.activeTabId === fixtureTab.id && state.error) observedNavigationError = state.error;
          };
          windowRef.webContents.on("browser:state", onFixtureState);
          try {
            await navigate(fixtureOrigin + "/fail", fixtureTab.id).catch(() => {});
            await waitForFixture(() => !fixtureTab.loading && Boolean(fixtureTab.error), "failed navigation feedback");
            const failedNavigationShowsError = Boolean(observedNavigationError || fixtureTab.error);
            await navigate(fixtureOrigin + "/recovered", fixtureTab.id);
            await waitForFixture(() => fixtureTab.view.webContents.getURL().endsWith("/recovered") && !fixtureTab.loading, "successful navigation after failure");
            const successfulNavigationClearsError = !fixtureTab.error;
            const navigationErrorRecovery = { failedNavigationShowsError, successfulNavigationClearsError, error: fixtureTab.error };
            if (!navigationErrorRecovery.failedNavigationShowsError || !navigationErrorRecovery.successfulNavigationClearsError) {
              throw new Error("Navigation error recovery assertions failed: " + JSON.stringify(navigationErrorRecovery));
            }
            console.log("BROWSER_C_NAVIGATION_ERROR_RECOVERY_PASS " + JSON.stringify(navigationErrorRecovery));
          } finally {
            windowRef.webContents.removeListener("browser:state", onFixtureState);
          }
          const slowNavigation = navigate(fixtureOrigin + "/slow", fixtureTab.id).catch(() => {});
          await waitForFixture(() => fixtureTab.url.endsWith("/slow") && fixtureTab.loading, "slow navigation start");
          fixtureTab.view.webContents.stop();
          await waitForFixture(() => !fixtureTab.loading, "stop to clear loading state");
          await slowNavigation;
          const navigationIntegration = {
            backForwardWorks,
            reloadWorks: (fixtureHits.get("/two") || 0) > previousReloadCount,
            stopClearsLoading: !fixtureTab.loading,
            currentUrl: fixtureTab.view.webContents.getURL(),
            fixtureHits: Object.fromEntries(fixtureHits)
          };
          if (!navigationIntegration.backForwardWorks || !navigationIntegration.reloadWorks || !navigationIntegration.stopClearsLoading) {
            throw new Error("Navigation integration assertions failed: " + JSON.stringify(navigationIntegration));
          }
          console.log("BROWSER_C_NAVIGATION_SMOKE_PASS " + JSON.stringify(navigationIntegration));
          await navigate(fixtureOrigin + "/redirect", fixtureTab.id);
          await waitForFixture(() => fixtureTab.view.webContents.getURL().endsWith("/redirected") && !fixtureTab.loading, "redirect destination");
          const redirectFollowed = fixtureTab.view.webContents.getURL().endsWith("/redirected");
          await navigate(fixtureOrigin + "/two", fixtureTab.id);
          await waitForFixture(() => fixtureTab.view.webContents.getURL().endsWith("/two") && !fixtureTab.loading, "second page after redirect");
          const redirectIntegration = { redirectFollowed, finalUrl: fixtureTab.view.webContents.getURL() };
          if (!redirectIntegration.redirectFollowed) throw new Error("Redirect integration assertion failed: " + JSON.stringify(redirectIntegration));
          await navigate(fixtureOrigin + "/redirect-chain", fixtureTab.id);
          await waitForFixture(() => fixtureTab.view.webContents.getURL().endsWith("/redirected") && !fixtureTab.loading,
            "multi-hop redirect destination");
          redirectIntegration.multiHopRedirectFollowed = fixtureTab.view.webContents.getURL().endsWith("/redirected");
          if (!redirectIntegration.multiHopRedirectFollowed) {
            throw new Error("Multi-hop redirect assertion failed: " + JSON.stringify(redirectIntegration));
          }
          console.log("BROWSER_C_REDIRECT_SMOKE_PASS " + JSON.stringify(redirectIntegration));
          const privateFixtureSnapshot = createTab(fixtureOrigin + "/private-secret", true);
          const privateFixtureTab = tabs.find((tab) => tab.id === privateFixtureSnapshot.id);
          await waitForFixture(() => (fixtureHits.get("/private-secret") || 0) > 0 && privateFixtureTab.view.webContents.getTitle() === "private-secret" && !privateFixtureTab.loading, "private fixture page committed");
          const regularSession = fixtureTab.view.webContents.session;
          const privateSession = privateFixtureTab.view.webContents.session;
          const permissionKeyForFixture = permissionKey(fixtureOrigin, "notifications");
          permissionGrants.set(privateSession, new Set([permissionKeyForFixture]));
          const privatePermissionGrantIsolated = sitePermissions(privateFixtureTab).includes("notifications")
            && !sitePermissions(fixtureTab).includes("notifications");
          const profileDownloadCountBeforePrivateFixture = profile.downloads.length;
          rememberCompletedDownload({
            id: "private-smoke-download", filename: "private-secret.txt", url: fixtureOrigin + "/private-secret",
            state: "completed", savePath: "/tmp/browser-c-private-smoke-download.txt", isPrivate: true,
            receivedBytes: 1, totalBytes: 1
          });
          const privateDownloadExcludedFromProfile = profile.downloads.length === profileDownloadCountBeforePrivateFixture;
          await regularSession.cookies.set({ url: fixtureOrigin, name: "regular-only", value: "regular-secret" });
          await fixtureTab.view.webContents.executeJavaScript('localStorage.setItem("regular-only", "regular-secret")');
          const regularCookie = (await regularSession.cookies.get({ url: fixtureOrigin })).some((cookie) =>
            cookie.name === "regular-only" && cookie.value === "regular-secret");
          const privateCookiesBefore = await privateSession.cookies.get({ url: fixtureOrigin });
          const privateStorageBefore = await privateFixtureTab.view.webContents.executeJavaScript(
            'localStorage.getItem("regular-only")'
          );
          await privateSession.cookies.set({ url: fixtureOrigin, name: "private-only", value: "private-secret" });
          await privateFixtureTab.view.webContents.executeJavaScript('localStorage.setItem("private-only", "private-secret")');
          const privateCookieWasIsolated = !privateCookiesBefore.some((cookie) => cookie.name === "regular-only");
          const privateStorageWasIsolated = privateStorageBefore === null;
          const privateSessionIsolation = {
            separateSession: privateSession !== regularSession,
            nonPersistentSession: !privateSession.isPersistent(),
            excludedFromSession: !persistableTabs(tabs, isWebUrl).some((tab) => tab.id === privateFixtureTab.id),
            excludedFromHistory: !shouldRecordHistory(privateFixtureTab, isWebUrl),
            regularCookiePresent: regularCookie,
            privateCookieIsolation: privateCookieWasIsolated,
            privateStorageIsolation: privateStorageWasIsolated,
            privatePermissionGrantIsolated,
            privateDownloadExcludedFromProfile
          };
          if (Object.values(privateSessionIsolation).some((passed) => !passed)) {
            throw new Error("Private session isolation assertions failed: " + JSON.stringify(privateSessionIsolation));
          }
          closeTab(privateFixtureTab.id);
          let privateCookiesAfterClose = await privateSession.cookies.get({ url: fixtureOrigin });
          for (let attempt = 0; attempt < 50 && privateCookiesAfterClose.some((cookie) => cookie.name === "private-only"); attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            privateCookiesAfterClose = await privateSession.cookies.get({ url: fixtureOrigin });
          }
          const regularCookieSurvivesPrivateClose = (await regularSession.cookies.get({ url: fixtureOrigin }))
            .some((cookie) => cookie.name === "regular-only" && cookie.value === "regular-secret");
          privateSessionIsolation.privateCookiesClearedOnClose = !privateCookiesAfterClose.some((cookie) => cookie.name === "private-only");
          privateSessionIsolation.regularCookieSurvivesPrivateClose = regularCookieSurvivesPrivateClose;
          if (!privateSessionIsolation.privateCookiesClearedOnClose || !regularCookieSurvivesPrivateClose) {
            throw new Error("Private-session cleanup assertions failed: " + JSON.stringify(privateSessionIsolation));
          }
          console.log("BROWSER_C_PRIVATE_SESSION_ISOLATION_PASS " + JSON.stringify(privateSessionIsolation));
          const backgroundTabSnapshot = createTab(fixtureOrigin + "/two");
          const backgroundTab = tabs.find((tab) => tab.id === backgroundTabSnapshot.id);
          await waitForFixture(() => backgroundTab.view.webContents.getTitle() === "two" && !backgroundTab.loading,
            "background isolation fixture");
          activateTab(fixtureTab.id);
          const foregroundId = activeTabId;
          await navigate(fixtureOrigin + "/fail-background", backgroundTab.id).catch(() => {});
          await waitForFixture(() => !backgroundTab.loading && Boolean(backgroundTab.error), "background navigation failure");
          const backgroundErrorIsolation = {
            foregroundRemainsActive: activeTabId === foregroundId,
            foregroundErrorUnaffected: !fixtureTab.error,
            backgroundErrorRecorded: Boolean(backgroundTab.error)
          };
          if (Object.values(backgroundErrorIsolation).some((passed) => !passed)) {
            throw new Error("Background navigation error isolation failed: " + JSON.stringify(backgroundErrorIsolation));
          }
          console.log("BROWSER_C_BACKGROUND_ERROR_ISOLATION_PASS " + JSON.stringify(backgroundErrorIsolation));
          closeTab(backgroundTab.id);

          const offlineProbe = createServer();
          await new Promise((resolve, reject) => {
            offlineProbe.once("error", reject);
            offlineProbe.listen(0, "127.0.0.1", resolve);
          });
          const offlineUrl = "http://127.0.0.1:" + offlineProbe.address().port + "/offline";
          await new Promise((resolve) => offlineProbe.close(resolve));
          await navigate(offlineUrl, fixtureTab.id).catch(() => {});
          await waitForFixture(() => !fixtureTab.loading && Boolean(fixtureTab.error), "unreachable network destination");
          const offlineFailureVisible = Boolean(fixtureTab.error);
          await navigate(fixtureOrigin + "/recovered", fixtureTab.id);
          await waitForFixture(() => fixtureTab.view.webContents.getTitle() === "recovered" && !fixtureTab.loading && !fixtureTab.error,
            "recovery after unreachable network destination");
          const offlineRecovery = { offlineFailureVisible, recoveryClearsError: !fixtureTab.error };
          if (!offlineRecovery.offlineFailureVisible || !offlineRecovery.recoveryClearsError) {
            throw new Error("Offline navigation recovery assertions failed: " + JSON.stringify(offlineRecovery));
          }
          console.log("BROWSER_C_OFFLINE_RECOVERY_PASS " + JSON.stringify(offlineRecovery));

          const crashTabSnapshot = createTab(fixtureOrigin + "/two");
          const crashTab = tabs.find((tab) => tab.id === crashTabSnapshot.id);
          await waitForFixture(() => crashTab.view.webContents.getTitle() === "two" && !crashTab.loading, "renderer crash fixture");
          activateTab(crashTab.id);
          const rendererGone = new Promise((resolve) => {
            crashTab.view.webContents.once("render-process-gone", (_event, details) => resolve(details));
          });
          crashTab.view.webContents.forcefullyCrashRenderer();
          const crashDetails = await Promise.race([
            rendererGone,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for renderer crash event")), 6000))
          ]);
          await waitForFixture(() => !crashTab.loading && /renderer stopped unexpectedly/.test(crashTab.error),
            "renderer crash feedback");
          const rendererCrashErrorVisible = Boolean(crashTab.error) && Boolean(crashDetails?.reason);
          crashTab.view.webContents.reload();
          await waitForFixture(() => crashTab.view.webContents.getTitle() === "two" && !crashTab.loading && !crashTab.error,
            "reload after renderer crash");
          const rendererCrashRecovery = { rendererCrashErrorVisible, reloadRecovers: !crashTab.error && crashTab.view.webContents.getTitle() === "two" };
          if (!rendererCrashRecovery.rendererCrashErrorVisible || !rendererCrashRecovery.reloadRecovers) {
            throw new Error("Renderer crash recovery assertions failed: " + JSON.stringify(rendererCrashRecovery));
          }
          console.log("BROWSER_C_RENDERER_CRASH_RECOVERY_PASS " + JSON.stringify(rendererCrashRecovery));
          closeTab(crashTab.id);
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
function isTrustedChromeEvent(event) {
  return Boolean(windowRef && !windowRef.isDestroyed() && event.sender === windowRef.webContents);
}
ipcMain.handle("browser:window:minimize", (event) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted window-control request." };
  windowRef.minimize();
  return { ok: true };
});
ipcMain.handle("browser:window:toggle-maximize", (event) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted window-control request." };
  if (windowRef.isMaximized()) windowRef.unmaximize();
  else windowRef.maximize();
  return { ok: true, maximized: windowRef.isMaximized() };
});
ipcMain.handle("browser:window:close", (event) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted window-control request." };
  windowRef.close();
  return { ok: true };
});
ipcMain.handle("browser:page:print", async (event) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted print request." };
  const tab = activeTab();
  if (!tab) return { ok: false, error: "There is no active page to print." };
  return await new Promise((resolve) => {
    tab.view.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
      resolve(success ? { ok: true } : { ok: false, error: failureReason || "Printing was cancelled or failed." });
    });
  });
});
ipcMain.handle("browser:page:save-as", async (event) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted save request." };
  const tab = activeTab();
  if (!tab || !isWebUrl(tab.url)) return { ok: false, error: "There is no web page to save." };
  const safeTitle = String(tab.title || "webpage").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 100) || "webpage";
  const result = await dialog.showSaveDialog(windowRef, {
    title: "Save webpage",
    defaultPath: path.join(app.getPath("downloads"), safeTitle + ".html"),
    filters: [{ name: "Web page, complete", extensions: ["html"] }, { name: "HTML only", extensions: ["htm", "html"] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    await tab.view.webContents.savePage(result.filePath, "HTMLComplete");
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save this page." };
  }
});
ipcMain.handle("browser:page:screenshot", async (event) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted screenshot request." };
  const tab = activeTab();
  if (!tab || !isWebUrl(tab.url)) return { ok: false, error: "There is no web page to capture." };
  try {
    const image = await tab.view.webContents.capturePage();
    if (image.isEmpty()) return { ok: false, error: "The page capture was empty." };
    const safeTitle = String(tab.title || "screenshot").slice(0, 80).replace(/[^a-zA-Z0-9._ -]/g, "_") || "screenshot";
    const result = await dialog.showSaveDialog(windowRef, {
      title: "Save page screenshot",
      defaultPath: path.join(app.getPath("pictures"), safeTitle + ".png"),
      filters: [{ name: "PNG image", extensions: ["png"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await writeFile(result.filePath, image.toPNG(), { mode: 0o600 });
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not capture this page." };
  }
});
ipcMain.handle("browser:page:save-pdf", async (event) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted PDF export request." };
  const tab = activeTab();
  if (!tab || !isWebUrl(tab.url)) return { ok: false, error: "There is no web page to export." };
  try {
    const safeTitle = String(tab.title || "webpage").slice(0, 80).replace(/[^a-zA-Z0-9._ -]/g, "_") || "webpage";
    const result = await dialog.showSaveDialog(windowRef, {
      title: "Save page as PDF",
      defaultPath: path.join(app.getPath("downloads"), safeTitle + ".pdf"),
      filters: [{ name: "PDF document", extensions: ["pdf"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const pdf = await tab.view.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    await writeFile(result.filePath, pdf, { mode: 0o600 });
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not export this page as PDF." };
  }
});
ipcMain.handle("browser:page:translate", async (event) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted translation request." };
  const tab = activeTab();
  if (!tab || !isWebUrl(tab.url)) return { ok: false, error: "There is no web page to translate." };
  const result = await dialog.showMessageBox(windowRef, {
    type: "question",
    title: "Translate webpage",
    message: "Choose a target language",
    detail: "Browser C opens Google Translate in a new tab. The page URL is sent to Google Translate.",
    buttons: ["English", "Kiswahili", "French", "Cancel"],
    defaultId: 0,
    cancelId: 3,
    noLink: true
  });
  if (result.response === 3) return { ok: false, canceled: true };
  const target = ["en", "sw", "fr"][result.response] || "en";
  const translationUrl = "https://translate.google.com/translate?sl=auto&tl=" + target + "&u=" + encodeURIComponent(tab.url);
  createTab(translationUrl);
  return { ok: true, target };
});
ipcMain.handle("browser:page:devtools", (event) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted developer-tools request." };
  const tab = activeTab();
  if (!tab) return { ok: false, error: "There is no active tab." };
  tab.view.webContents.openDevTools({ mode: "detach" });
  return { ok: true };
});
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
ipcMain.handle("browser:home", () => navigate(profile.homePage).catch(() => {}));
ipcMain.handle("browser:new-tab", () => createTab());
ipcMain.handle("browser:new-private-tab", () => createTab("https://www.google.com/", true));
ipcMain.handle("browser:activate-tab", (_event, id) => activateTab(id));
ipcMain.handle("browser:close-tab", (_event, id) => closeTab(id));
ipcMain.handle("browser:get-state", () => {
  const tab = activeTab();
  return { tabs: tabs.map(tabSnapshot), activeTabId, url: tab?.url ?? "", title: tab?.title ?? "Browser C", isPrivate: Boolean(tab?.isPrivate),
    canGoBack: Boolean(tab && canGoBack(tab.view.webContents)), canGoForward: Boolean(tab && canGoForward(tab.view.webContents)),
    loading: Boolean(tab?.loading), error: tab?.error || "",
    zoomFactor: tab?.view.webContents.getZoomFactor() ?? 1, sitePermissions: sitePermissions(tab), searchProvider: profile.searchProvider, windowMaximized: Boolean(windowRef?.isMaximized()) };
});
ipcMain.handle("browser:permissions:clear-site", () => {
  const tab = activeTab();
  const permissions = sitePermissions(tab);
  if (!tab || !permissions.length) return { ok: true, cleared: 0 };
  let origin;
  try { origin = new URL(tab.url).origin; } catch { return { ok: false, error: "The current page has no valid site origin." }; }
  const grants = permissionGrants.get(tab.view.webContents.session);
  let cleared = 0;
  if (grants) {
    for (const permission of Object.keys(PERMISSION_LABELS)) {
      if (grants.delete(permissionKey(origin, permission))) cleared++;
    }
  }
  sendState();
  return { ok: true, cleared };
});
ipcMain.handle("browser:passwords:list", (event) => {
  if (!isTrustedChromeEvent(event)) return { available: false, entries: [], error: "Untrusted password-vault request." };
  return passwordVaultSummary();
});
ipcMain.handle("browser:passwords:save", async (event, input) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted password-vault request." };
  if (!passwordVaultAvailable || !passwordVaultBackendAvailable()) return { ok: false, error: "Secure OS-backed password storage is unavailable. No password was saved." };
  if (!input || typeof input !== "object") return { ok: false, error: "Enter a website, username, and password." };
  let parsed;
  try { parsed = new URL(String(input.url || "")); } catch { return { ok: false, error: "Enter a valid website URL." }; }
  const allowed = parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  if (!allowed || parsed.username || parsed.password) return { ok: false, error: "Passwords can only be stored for HTTPS sites (HTTP localhost is allowed for development)." };
  const origin = parsed.origin;
  const username = String(input.username ?? "").trim();
  const password = String(input.password ?? "");
  if (!username || username.length > 256 || !password || password.length > 4096) return { ok: false, error: "Username is required (up to 256 characters) and password must be 1–4096 characters." };
  const existing = passwordVault.findIndex((item) => item.origin === origin && item.username === username);
  const previous = existing >= 0 ? passwordVault[existing] : null;
  const previousVault = passwordVault.slice();
  const entry = { id: existing >= 0 ? previous.id : randomUUID(), origin, username, password,
    createdAt: existing >= 0 ? previous.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (existing >= 0) passwordVault[existing] = entry;
  else passwordVault.unshift(entry);
  passwordVault = passwordVault.slice(0, MAX_PASSWORDS);
  try { await persistPasswordVault(); return { ok: true, ...passwordVaultSummary() }; }
  catch (error) {
    passwordVault = previousVault;
    return { ok: false, error: error instanceof Error ? error.message : "Could not save password securely." };
  }
});
ipcMain.handle("browser:passwords:reveal", (event, id) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted password-vault request." };
  if (!passwordVaultAvailable || !passwordVaultBackendAvailable()) return { ok: false, error: "Secure OS-backed password storage is unavailable." };
  const entry = passwordVault.find((item) => item.id === String(id || ""));
  return entry ? { ok: true, password: entry.password } : { ok: false, error: "Password entry not found." };
});
ipcMain.handle("browser:passwords:delete", async (event, id) => {
  if (!isTrustedChromeEvent(event)) return { ok: false, error: "Untrusted password-vault request." };
  const index = passwordVault.findIndex((item) => item.id === String(id || ""));
  if (index < 0) return { ok: false, error: "Password entry not found." };
  const [removed] = passwordVault.splice(index, 1);
  try { await persistPasswordVault(); return { ok: true, ...passwordVaultSummary() }; }
  catch (error) { passwordVault.splice(index, 0, removed); return { ok: false, error: error instanceof Error ? error.message : "Could not update password vault." }; }
});
ipcMain.handle("browser:settings:preferences", async (_event, input) => {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid settings." };
  const next = {};
  if (Object.hasOwn(input, "theme")) {
    if (!["dark", "light", "system"].includes(input.theme)) return { ok: false, error: "Choose a supported theme." };
    next.theme = input.theme;
  }
  if (Object.hasOwn(input, "homePage")) {
    const homePage = String(input.homePage ?? "").trim();
    if (!isWebUrl(homePage)) return { ok: false, error: "Homepage must be a valid HTTP or HTTPS URL." };
    next.homePage = new URL(homePage).href;
  }
  Object.assign(profile, next);
  await persistProfile();
  sendState();
  return { ok: true, theme: profile.theme, homePage: profile.homePage };
});
ipcMain.handle("browser:settings:search-provider", async (_event, provider) => {
  if (typeof provider !== "string" || !Object.hasOwn(SEARCH_PROVIDERS, provider)) {
    return { ok: false, error: "Choose a supported search provider." };
  }
  profile.searchProvider = provider;
  await persistProfile();
  sendState();
  return { ok: true, searchProvider: provider };
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
app.on("certificate-error", (event, _contents, _url, _error, _certificate, callback) => {
  // Never bypass TLS verification. The renderer receives the navigation failure
  // and displays a safe recovery message; users cannot click through a bad cert.
  event.preventDefault();
  callback(false);
});

app.whenReady().then(async () => {
  await loadProfile();
  await loadPasswordVault();
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
