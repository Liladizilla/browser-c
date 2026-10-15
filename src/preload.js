import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("browserC", Object.freeze({
  navigate: (input) => ipcRenderer.invoke("browser:navigate", String(input ?? "")),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  stop: () => ipcRenderer.invoke("browser:stop"),
  home: () => ipcRenderer.invoke("browser:home"),
  getState: () => ipcRenderer.invoke("browser:get-state"),
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("browser:state", listener);
    return () => ipcRenderer.removeListener("browser:state", listener);
  }
}));
