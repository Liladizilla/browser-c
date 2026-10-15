import { app, BrowserWindow, WebContentsView, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isWebUrl, resolveAddress } from "./navigation.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME_HEIGHT = 78;
let windowRef;
let pageView;
let currentUrl = "https://www.google.com/";

function sendState(patch = {}) {
  if (!windowRef || windowRef.isDestroyed()) return;
  windowRef.webContents.send("browser:state", {
    url: currentUrl,
    canGoBack: Boolean(pageView && pageView.webContents.canGoBack()),
    canGoForward: Boolean(pageView && pageView.webContents.canGoForward()),
    loading: Boolean(pageView && pageView.webContents.isLoading()),
    ...patch
  });
}
function layoutPage() {
  if (!windowRef || !pageView) return;
  const bounds = windowRef.getContentBounds();
  pageView.setBounds({ x: 0, y: CHROME_HEIGHT, width: Math.max(0, bounds.width), height: Math.max(0, bounds.height - CHROME_HEIGHT) });
}
async function navigate(rawInput) {
  const destination = resolveAddress(rawInput);
  if (!isWebUrl(destination)) throw new TypeError("Only HTTP and HTTPS destinations are allowed.");
  await pageView.webContents.loadURL(destination);
  return destination;
}
function createWindow() {
  windowRef = new BrowserWindow({
    width: 1280, height: 840, minWidth: 720, minHeight: 480,
    title: "Browser C", backgroundColor: "#101214",
    webPreferences: {
      preload: path.join(here, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false
    }
  });
  pageView = new WebContentsView({
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, navigateOnDragDrop: false,
      partition: "persist:browser-c"
    }
  });
  windowRef.contentView.addChildView(pageView);
  layoutPage();
  windowRef.on("resize", layoutPage);
  windowRef.on("closed", () => { windowRef = undefined; pageView = undefined; });

  pageView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  pageView.webContents.on("will-navigate", (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
  pageView.webContents.on("did-start-navigation", (_event, url, _inPlace, isMainFrame) => {
    if (isMainFrame && isWebUrl(url)) currentUrl = url;
    sendState({ loading: true });
  });
  pageView.webContents.on("did-navigate", (_event, url) => {
    currentUrl = url;
    sendState({ url, title: pageView.webContents.getTitle(), loading: false });
  });
  pageView.webContents.on("did-navigate-in-page", (_event, url) => {
    currentUrl = url;
    sendState({ url, title: pageView.webContents.getTitle() });
  });
  pageView.webContents.on("did-finish-load", () => {
    sendState({ url: pageView.webContents.getURL(), title: pageView.webContents.getTitle(), loading: false });
  });
  pageView.webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame && code !== -3) sendState({ loading: false, error: description, url: validatedURL });
  });

  const browserSession = pageView.webContents.session;
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);

  windowRef.loadFile(path.join(here, "renderer", "index.html"));
  pageView.webContents.loadURL(currentUrl).catch(() => sendState({ loading: false, error: "The page could not be loaded." }));
}

ipcMain.handle("browser:navigate", async (_event, input) => {
  try { return { ok: true, url: await navigate(input) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Navigation failed." }; }
});
ipcMain.handle("browser:back", () => { if (pageView && pageView.webContents.canGoBack()) pageView.webContents.goBack(); });
ipcMain.handle("browser:forward", () => { if (pageView && pageView.webContents.canGoForward()) pageView.webContents.goForward(); });
ipcMain.handle("browser:reload", () => pageView && pageView.webContents.reload());
ipcMain.handle("browser:stop", () => pageView && pageView.webContents.stop());
ipcMain.handle("browser:home", () => navigate("https://www.google.com/").catch(() => {}));
ipcMain.handle("browser:get-state", () => ({
  url: currentUrl,
  canGoBack: Boolean(pageView && pageView.webContents.canGoBack()),
  canGoForward: Boolean(pageView && pageView.webContents.canGoForward()),
  loading: Boolean(pageView && pageView.webContents.isLoading())
}));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
