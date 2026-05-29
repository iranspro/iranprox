"use strict";
// Controls the bundled sing-box.exe core: start (TUN mode) / stop / status.
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

const isDev = !app.isPackaged;

// In dev the core lives in ./core; when packaged it's in resources/core (extraResources).
function coreDir() {
  return isDev
    ? path.join(__dirname, "..", "..", "core")
    : path.join(process.resourcesPath, "core");
}

function corePaths() {
  const dir = coreDir();
  return {
    dir,
    exe: path.join(dir, "sing-box.exe"),
    config: path.join(dir, "config.json"),
  };
}

class SingBox {
  constructor(onLog, onExit) {
    this.proc = null;
    this.onLog = onLog || (() => {});
    this.onExit = onExit || (() => {});
  }

  get running() {
    return !!this.proc;
  }

  start() {
    if (this.proc) return { ok: true, already: true };
    const { dir, exe, config } = corePaths();
    if (!fs.existsSync(exe)) return { ok: false, error: "core_missing: sing-box.exe not found" };
    if (!fs.existsSync(config)) return { ok: false, error: "config_missing: run make-client-config" };

    // `run -c config.json`; cwd = core dir so wintun.dll resolves next to the exe
    this.proc = spawn(exe, ["run", "-c", config], {
      cwd: dir,
      windowsHide: true,
    });

    this.proc.stdout.on("data", (d) => this.onLog(d.toString()));
    this.proc.stderr.on("data", (d) => this.onLog(d.toString()));
    this.proc.on("exit", (code, signal) => {
      this.proc = null;
      this.onExit(code, signal);
    });
    this.proc.on("error", (err) => {
      this.onLog(`[spawn error] ${err.message}`);
      this.proc = null;
      this.onExit(-1, null);
    });
    return { ok: true };
  }

  stop() {
    if (!this.proc) return { ok: true, already: true };
    const p = this.proc;
    this.proc = null;
    try {
      // sing-box restores routing on a clean kill; SIGTERM works via tree-kill on win
      p.kill();
      // hard fallback after 2.5s
      setTimeout(() => {
        try { process.kill(p.pid, 0); p.kill("SIGKILL"); } catch (_) {}
      }, 2500);
    } catch (_) {}
    return { ok: true };
  }
}

module.exports = { SingBox, corePaths };
