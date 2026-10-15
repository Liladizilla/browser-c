const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("browserC", Object.freeze({
  navigate: (input) => ipcRenderer.invoke("browser:navigate", String(input ?? "")),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  stop: () => ipcRenderer.invoke("browser:stop"),
  home: () => ipcRenderer.invoke("browser:home"),
  newTab: () => ipcRenderer.invoke("browser:new-tab"),
  activateTab: (id) => ipcRenderer.invoke("browser:activate-tab", Number(id)),
  closeTab: (id) => ipcRenderer.invoke("browser:close-tab", Number(id)),
  getState: () => ipcRenderer.invoke("browser:get-state"),
  getBookmarks: () => ipcRenderer.invoke("browser:bookmarks:get"),
  toggleBookmark: (item) => ipcRenderer.invoke("browser:bookmarks:toggle", { url: String(item?.url ?? ""), title: String(item?.title ?? "") }),
  getHistory: () => ipcRenderer.invoke("browser:history:get"),
  clearHistory: () => ipcRenderer.invoke("browser:history:clear"),
  onFocusAddress: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("browser:focus-address", listener);
    return () => ipcRenderer.removeListener("browser:focus-address", listener);
  },
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("browser:state", listener);
    return () => ipcRenderer.removeListener("browser:state", listener);
  }
}));
