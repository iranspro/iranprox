"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("iranpro", {
  connect: (override) => ipcRenderer.invoke("connect", override),
  disconnect: () => ipcRenderer.invoke("disconnect"),
  status: () => ipcRenderer.invoke("status"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (s) => ipcRenderer.invoke("save-settings", s),
  diagnose: () => ipcRenderer.invoke("diagnose"),
  copyLog: () => ipcRenderer.invoke("copy-log"),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  quit: () => ipcRenderer.invoke("quit"),
  onStatus: (cb) => ipcRenderer.on("status", (_e, p) => cb(p)),
  onLog: (cb) => ipcRenderer.on("core-log", (_e, line) => cb(line)),
  onSpeed: (cb) => ipcRenderer.on("speed", (_e, p) => cb(p)),
  onUpdate: (cb) => ipcRenderer.on("update", (_e, p) => cb(p)),
});
