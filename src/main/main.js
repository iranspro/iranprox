"use strict";
const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const path = require("path");
const https = require("https");
const { SingBox } = require("./singbox");

let win = null;
let sb = null;
const isDev = process.argv.includes("--dev");

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 720,
    minWidth: 400,
    minHeight: 640,
    backgroundColor: "#05070f",
    title: "ایران پرو",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  if (isDev) win.webContents.openDevTools({ mode: "detach" });

  // open external links in the real browser, never in-app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// --- connectivity probe: is traffic actually flowing through the tunnel? -----
function probe() {
  return new Promise((resolve) => {
    const req = https.get(
      "https://www.gstatic.com/generate_204",
      { timeout: 6000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 204 || res.statusCode === 200);
      }
    );
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

app.whenReady().then(() => {
  sb = new SingBox(
    (line) => send("core-log", line),
    (code) => send("status", { state: "disconnected", code })
  );

  ipcMain.handle("connect", async () => {
    const r = sb.start();
    if (!r.ok) { send("status", { state: "error", error: r.error }); return r; }
    send("status", { state: "connecting" });
    // give the core a moment to bring up TUN + pick the fastest outbound, then verify
    for (let i = 0; i < 8; i++) {
      await new Promise((res) => setTimeout(res, 1200));
      if (!sb.running) { send("status", { state: "disconnected" }); return { ok: false }; }
      if (await probe()) { send("status", { state: "connected" }); return { ok: true }; }
    }
    send("status", { state: "connected", weak: true }); // up but probe didn't confirm yet
    return { ok: true, weak: true };
  });

  ipcMain.handle("disconnect", async () => {
    const r = sb.stop();
    send("status", { state: "disconnected" });
    return r;
  });

  ipcMain.handle("status", async () => ({
    running: sb.running,
    online: sb.running ? await probe() : false,
  }));

  ipcMain.handle("quit", () => { if (sb) sb.stop(); app.quit(); });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// make sure the tunnel is torn down on exit so the user isn't left with broken routing
app.on("before-quit", () => { if (sb) sb.stop(); });
app.on("window-all-closed", () => { if (sb) sb.stop(); app.quit(); });
process.on("exit", () => { if (sb) sb.stop(); });
