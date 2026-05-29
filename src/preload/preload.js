"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("iranpro", {
  connect: () => ipcRenderer.invoke("connect"),
  disconnect: () => ipcRenderer.invoke("disconnect"),
  status: () => ipcRenderer.invoke("status"),
  quit: () => ipcRenderer.invoke("quit"),
  onStatus: (cb) => ipcRenderer.on("status", (_e, p) => cb(p)),
  onLog: (cb) => ipcRenderer.on("core-log", (_e, line) => cb(line)),
});
