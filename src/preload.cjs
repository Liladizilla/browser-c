const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("browserC", Object.freeze({
  navigate: (input) => ipcRenderer.invoke("browser:navigate", String(input ?? "")),
  setChromeOverlayOpen: (open) => ipcRenderer.send("browser:overlay:set", Boolean(open)),
  minimizeWindow: () => ipcRenderer.invoke("browser:window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("browser:window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("browser:window:close"),
  printPage: () => ipcRenderer.invoke("browser:page:print"),
  savePageAs: () => ipcRenderer.invoke("browser:page:save-as"),
  openDevTools: () => ipcRenderer.invoke("browser:page:devtools"),
  captureScreenshot: () => ipcRenderer.invoke("browser:page:screenshot"),
  savePageAsPdf: () => ipcRenderer.invoke("browser:page:save-pdf"),
  translatePage: () => ipcRenderer.invoke("browser:page:translate"),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  stop: () => ipcRenderer.invoke("browser:stop"),
  findInPage: (query) => ipcRenderer.invoke("browser:find:start", String(query ?? "")),
  findNext: (query) => ipcRenderer.invoke("browser:find:next", String(query ?? "")),
  findPrevious: (query) => ipcRenderer.invoke("browser:find:previous", String(query ?? "")),
  stopFind: () => ipcRenderer.invoke("browser:find:stop"),
  changeZoom: (action) => ipcRenderer.invoke("browser:zoom", String(action ?? "")),
  home: () => ipcRenderer.invoke("browser:home"),
  newTab: () => ipcRenderer.invoke("browser:new-tab"),
  newPrivateTab: () => ipcRenderer.invoke("browser:new-private-tab"),
  activateTab: (id) => ipcRenderer.invoke("browser:activate-tab", Number(id)),
  closeTab: (id) => ipcRenderer.invoke("browser:close-tab", Number(id)),
  getState: () => ipcRenderer.invoke("browser:get-state"),
  clearSitePermissions: () => ipcRenderer.invoke("browser:permissions:clear-site"),
  setSearchProvider: (provider) => ipcRenderer.invoke("browser:settings:search-provider", String(provider ?? "")),
  savePreferences: (preferences) => ipcRenderer.invoke("browser:settings:preferences", { theme: preferences?.theme, homePage: preferences?.homePage }),
  getPasswords: () => ipcRenderer.invoke("browser:passwords:list"),
  savePassword: (entry) => ipcRenderer.invoke("browser:passwords:save", { url: String(entry?.url ?? ""), username: String(entry?.username ?? ""), password: String(entry?.password ?? "") }),
  revealPassword: (id) => ipcRenderer.invoke("browser:passwords:reveal", String(id ?? "")),
  deletePassword: (id) => ipcRenderer.invoke("browser:passwords:delete", String(id ?? "")),
  getBookmarks: () => ipcRenderer.invoke("browser:bookmarks:get"),
  toggleBookmark: (item) => ipcRenderer.invoke("browser:bookmarks:toggle", { url: String(item?.url ?? ""), title: String(item?.title ?? "") }),
  getHistory: () => ipcRenderer.invoke("browser:history:get"),
  clearHistory: () => ipcRenderer.invoke("browser:history:clear"),
  getDownloads: () => ipcRenderer.invoke("browser:downloads:get"),
  cancelDownload: (id) => ipcRenderer.invoke("browser:downloads:cancel", String(id)),
  revealDownload: (id) => ipcRenderer.invoke("browser:downloads:reveal", String(id)),
  onDownloads: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("browser:downloads:state", listener);
    return () => ipcRenderer.removeListener("browser:downloads:state", listener);
  },
  onFocusAddress: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("browser:focus-address", listener);
    return () => ipcRenderer.removeListener("browser:focus-address", listener);
  },
  onFindOpen: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("browser:find:open", listener);
    return () => ipcRenderer.removeListener("browser:find:open", listener);
  },
  onLibraryOpen: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on("browser:library:open", listener);
    return () => ipcRenderer.removeListener("browser:library:open", listener);
  },
  onEscape: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("browser:escape", listener);
    return () => ipcRenderer.removeListener("browser:escape", listener);
  },
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("browser:state", listener);
    return () => ipcRenderer.removeListener("browser:state", listener);
  }
}));
