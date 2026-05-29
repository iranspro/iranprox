"use strict";
// Controls the bundled sing-box core: start (TUN mode) / stop / status.
// Windows: app runs elevated (NSIS requireAdministrator) → spawn sing-box.exe directly.
// macOS : TUN needs root → launch via `osascript ... with administrator privileges`
//          (one password prompt on connect, one on disconnect).
const { spawn, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

const isDev = !app.isPackaged;
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

function coreDir() {
  return isDev
    ? path.join(__dirname, "..", "..", "core")
    : path.join(process.resourcesPath, "core");
}

function corePaths() {
  const dir = coreDir();
  let exe;
  if (isWin) exe = path.join(dir, "sing-box.exe");
  else if (isMac) exe = path.join(dir, `sing-box-darwin-${process.arch === "arm64" ? "arm64" : "amd64"}`);
  else exe = path.join(dir, "sing-box"); // linux (dev)
  return { dir, exe, config: path.join(dir, "config.json") };
}

// Build an `osascript` invocation that runs `inner` (a /bin/sh script) as root.
function adminRun(inner) {
  // AppleScript string: escape backslashes and double quotes.
  const esc = inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return ["-e", `do shell script "${esc}" with administrator privileges`];
}

class SingBox {
  constructor(onLog, onExit) {
    this.proc = null;
    this.onLog = onLog || (() => {});
    this.onExit = onExit || (() => {});
    this._macUp = false;
  }

  get running() {
    if (isMac) return this._macUp;
    return !!this.proc;
  }

  start() {
    if (this.running) return { ok: true, already: true };
    const { dir, exe, config } = corePaths();
    if (!fs.existsSync(exe)) return { ok: false, error: "core_missing: sing-box binary not found" };
    if (!fs.existsSync(config)) return { ok: false, error: "config_missing: run make-client-config" };

    if (isWin) {
      this.proc = spawn(exe, ["run", "-c", config], { cwd: dir, windowsHide: true });
      this.proc.stdout.on("data", (d) => this.onLog(d.toString()));
      this.proc.stderr.on("data", (d) => this.onLog(d.toString()));
      this.proc.on("exit", (code) => { this.proc = null; this.onExit(code, null); });
      this.proc.on("error", (err) => { this.onLog(`[spawn error] ${err.message}`); this.proc = null; this.onExit(-1, null); });
      return { ok: true };
    }

    // macOS: run the core as root in the foreground of an osascript shell, so the
    // osascript process stays alive for as long as the tunnel is up.
    const sh = `chmod +x '${exe}'; exec '${exe}' run -c '${config}'`;
    this._macUp = true;
    this.proc = spawn("osascript", adminRun(sh));
    this.proc.stderr.on("data", (d) => this.onLog(d.toString()));
    this.proc.on("exit", (code) => {
      // code !== 0 here usually means the user cancelled the password prompt
      this.proc = null;
      this._macUp = false;
      this.onExit(code, null);
    });
    this.proc.on("error", (err) => { this.onLog(`[osascript error] ${err.message}`); this.proc = null; this._macUp = false; this.onExit(-1, null); });
    return { ok: true };
  }

  stop() {
    if (isWin) {
      if (!this.proc) return { ok: true, already: true };
      const p = this.proc; this.proc = null;
      try {
        p.kill();
        setTimeout(() => { try { process.kill(p.pid, 0); p.kill("SIGKILL"); } catch (_) {} }, 2500);
      } catch (_) {}
      return { ok: true };
    }
    // macOS: the core runs as root, so killing it also needs root.
    this._macUp = false;
    if (this.proc) { try { this.proc.kill(); } catch (_) {} this.proc = null; }
    const { exe } = corePaths();
    const name = path.basename(exe);
    try {
      execFile("osascript", adminRun(`pkill -x '${name}' || pkill -f 'sing-box'`), () => {});
    } catch (_) {}
    return { ok: true };
  }
}

module.exports = { SingBox, corePaths };
