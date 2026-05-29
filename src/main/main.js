"use strict";
const { app, BrowserWindow, ipcMain, Menu, shell, clipboard, net: enet } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const net = require("net");
const { SingBox, exePath } = require("./singbox");
const { buildConfig, defaults } = require("./configgen");
const settingsStore = require("./settings");
const sysproxy = require("./sysproxy");
const { execFile } = require("child_process");

let win = null;
let sb = null;
let proxyOn = false;
const isDev = process.argv.includes("--dev");

function activeConfigPath() { return path.join(app.getPath("userData"), "active.json"); }
function getSettings() { return Object.assign(defaults(), settingsStore.load()); }

function createWindow() {
  win = new BrowserWindow({
    width: 460, height: 760, minWidth: 400, minHeight: 660,
    backgroundColor: "#05070f", title: "ایران پرو", autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  if (isDev) win.webContents.openDevTools({ mode: "detach" });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

// --- connectivity probes -----------------------------------------------------
function probeDirect() {
  return new Promise((resolve) => {
    const req = https.get("https://www.gstatic.com/generate_204", { timeout: 6000 }, (res) => {
      res.resume(); resolve(res.statusCode === 204 || res.statusCode === 200);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}
// proxy mode: verify the tunnel by doing an HTTP CONNECT through the local mixed port
function probeProxy(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: 8000 }, () => {
      s.write("CONNECT www.gstatic.com:443 HTTP/1.1\r\nHost: www.gstatic.com:443\r\n\r\n");
    });
    let buf = "";
    s.on("data", (d) => { buf += d.toString(); if (buf.includes("\r\n")) { s.destroy(); resolve(/\s200\s/.test(buf.split("\r\n")[0] + " ")); } });
    s.on("timeout", () => { s.destroy(); resolve(false); });
    s.on("error", () => resolve(false));
  });
}
function tcpReach(host, port, timeout = 7000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const s = net.connect({ host, port, timeout }, () => { s.destroy(); resolve({ ok: true, ms: Date.now() - start }); });
    s.on("timeout", () => { s.destroy(); resolve({ ok: false }); });
    s.on("error", () => resolve({ ok: false }));
  });
}
function coreVersion() {
  return new Promise((resolve) => {
    try { execFile(exePath(), ["version"], { windowsHide: true }, (e, so) => resolve((so || "").split("\n")[0] || "?")); }
    catch (_) { resolve("?"); }
  });
}

async function applyProxy(on, port) {
  try {
    if (on) { await sysproxy.enable(port); proxyOn = true; }
    else if (proxyOn) { await sysproxy.disable(); proxyOn = false; }
  } catch (_) {}
}

app.whenReady().then(() => {
  sb = new SingBox(
    (line) => send("core-log", line),
    (code) => { applyProxy(false); send("status", { state: "disconnected", code }); }
  );

  ipcMain.handle("get-settings", () => getSettings());
  ipcMain.handle("save-settings", (_e, s) => { settingsStore.save(s); return { ok: true }; });

  ipcMain.handle("connect", async (_e, override) => {
    const s = Object.assign(getSettings(), override || {});
    settingsStore.save(s);
    try { fs.writeFileSync(activeConfigPath(), JSON.stringify(buildConfig(s), null, 2)); }
    catch (e) { send("status", { state: "error", error: "config write failed: " + e.message }); return { ok: false }; }

    const r = sb.start(activeConfigPath(), s.mode);
    if (!r.ok) { send("status", { state: "error", error: r.error }); return r; }
    send("status", { state: "connecting" });

    if (s.mode === "proxy" && s.setSystemProxy) await applyProxy(true, s.proxyPort);

    const probe = () => (s.mode === "proxy" ? probeProxy(s.proxyPort) : probeDirect());
    for (let i = 0; i < 9; i++) {
      await new Promise((res) => setTimeout(res, 1300));
      if (!sb.running) { await applyProxy(false); send("status", { state: "disconnected" }); return { ok: false }; }
      if (await probe()) { send("status", { state: "connected", mode: s.mode, protocol: s.protocol }); return { ok: true }; }
    }
    send("status", { state: "connected", weak: true, mode: s.mode, protocol: s.protocol });
    return { ok: true, weak: true };
  });

  ipcMain.handle("disconnect", async () => {
    await applyProxy(false);
    const r = sb.stop();
    send("status", { state: "disconnected" });
    return r;
  });

  // run reachability + version diagnostics; returns a copy-pasteable report
  ipcMain.handle("diagnose", async () => {
    const s = getSettings();
    const [ver, rTcp] = await Promise.all([coreVersion(), tcpReach(s.serverIp, Number(s.realityPort))]);
    const lines = [
      "=== Iran Pro diagnostics ===",
      `time: ${new Date().toISOString()}`,
      `core: ${ver}`,
      `settings: mode=${s.mode} protocol=${s.protocol} sni=${s.sni}`,
      `server: ${s.serverIp}  reality(tcp)=${s.realityPort}  hy2(udp)=${s.hy2Port}  proxyPort=${s.proxyPort}`,
      `TCP ${s.serverIp}:${s.realityPort} (reality) -> ${rTcp.ok ? "REACHABLE " + rTcp.ms + "ms" : "UNREACHABLE"}`,
      `(note: hy2 is UDP/${s.hy2Port}; UDP reachability can't be probed by TCP)`,
      `tunnel up: ${sb.running}`,
    ];
    return lines.join("\n");
  });

  ipcMain.handle("copy-log", async () => {
    const s = getSettings();
    const header = `=== Iran Pro log ===\n${new Date().toISOString()}\nmode=${s.mode} protocol=${s.protocol} sni=${s.sni} server=${s.serverIp} reality=${s.realityPort} hy2=${s.hy2Port}\n`;
    clipboard.writeText(sb.log(header));
    return { ok: true };
  });

  ipcMain.handle("status", async () => ({ running: sb.running }));
  ipcMain.handle("quit", async () => { await applyProxy(false); if (sb) sb.stop(); app.quit(); });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

function cleanup() { applyProxy(false); if (sb) sb.stop(); }
app.on("before-quit", cleanup);
app.on("window-all-closed", () => { cleanup(); app.quit(); });
process.on("exit", () => { try { if (proxyOn) require("child_process").execSync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f', { windowsHide: true }); } catch (_) {} });
