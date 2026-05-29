"use strict";
// Runs the bundled sing-box core with a generated config, keeps a log ring buffer.
// Windows: app is elevated only when TUN needs it; proxy mode needs no admin.
// macOS : TUN needs root → launch via osascript; proxy mode runs unprivileged.
const { spawn, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const { coreDir } = require("./configgen");

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

function exePath() {
  const dir = coreDir();
  if (isWin) return path.join(dir, "sing-box.exe");
  if (isMac) return path.join(dir, `sing-box-darwin-${process.arch === "arm64" ? "arm64" : "amd64"}`);
  return path.join(dir, "sing-box");
}

function adminRun(inner) {
  const esc = inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return ["-e", `do shell script "${esc}" with administrator privileges`];
}

class SingBox {
  constructor(onLog, onExit) {
    this.proc = null;
    this.mode = null;
    this.onExit = onExit || (() => {});
    this._log = [];
    this._macUp = false;
    this._onLine = (line) => {
      this._log.push(line);
      if (this._log.length > 1500) this._log.splice(0, this._log.length - 1500);
      if (onLog) onLog(line);
    };
  }

  get running() { return isMac ? this._macUp : !!this.proc; }
  log(extra) { return (extra ? extra + "\n" : "") + this._log.join(""); }
  clearLog() { this._log = []; }

  // configPath: a written sing-box config; mode: "tun" | "proxy"
  start(configPath, mode) {
    if (this.running) return { ok: true, already: true };
    const exe = exePath();
    if (!fs.existsSync(exe)) return { ok: false, error: "core_missing: sing-box binary not found" };
    if (!fs.existsSync(configPath)) return { ok: false, error: "config_missing" };
    this.mode = mode;
    const dir = coreDir();
    this._onLine(`[iranpro] starting core (mode=${mode})\n`);

    const needRoot = isMac && mode === "tun";
    if (!needRoot) {
      this.proc = spawn(exe, ["run", "-c", configPath], { cwd: dir, windowsHide: true });
      this.proc.stdout.on("data", (d) => this._onLine(d.toString()));
      this.proc.stderr.on("data", (d) => this._onLine(d.toString()));
      this.proc.on("exit", (code) => { this.proc = null; this.onExit(code); });
      this.proc.on("error", (err) => { this._onLine(`[spawn error] ${err.message}\n`); this.proc = null; this.onExit(-1); });
      return { ok: true };
    }

    // macOS TUN → run as root via osascript (foreground = lifetime tracking)
    const sh = `chmod +x '${exe}'; exec '${exe}' run -c '${configPath}'`;
    this._macUp = true;
    this.proc = spawn("osascript", adminRun(sh));
    this.proc.stderr.on("data", (d) => this._onLine(d.toString()));
    this.proc.on("exit", (code) => { this.proc = null; this._macUp = false; this.onExit(code); });
    this.proc.on("error", (err) => { this._onLine(`[osascript error] ${err.message}\n`); this.proc = null; this._macUp = false; this.onExit(-1); });
    return { ok: true };
  }

  stop() {
    const wasRoot = isMac && this.mode === "tun";
    if (this.proc) { try { this.proc.kill(); } catch (_) {} }
    if (isWin && this.proc) {
      const p = this.proc;
      setTimeout(() => { try { process.kill(p.pid, 0); p.kill("SIGKILL"); } catch (_) {} }, 2000);
    }
    this.proc = null;
    this._macUp = false;
    if (wasRoot) {
      try { execFile("osascript", adminRun(`pkill -f 'sing-box-darwin'`), () => {}); } catch (_) {}
    }
    return { ok: true };
  }
}

module.exports = { SingBox, exePath };
