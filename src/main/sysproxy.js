"use strict";
// Sets / clears the OS-wide system proxy so all browsers route through the local
// mixed inbound — no TUN, no admin on Windows.
const { execFile, exec } = require("child_process");

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const REG = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

function run(cmd, args) {
  return new Promise((res) => execFile(cmd, args, { windowsHide: true }, (e, so, se) => res({ e, so, se })));
}
function sh(cmd) {
  return new Promise((res) => exec(cmd, { windowsHide: true }, (e, so, se) => res({ e, so, se })));
}

// Tell WinINET to re-read settings so already-open browsers pick up the change.
const PS_REFRESH =
  "Add-Type -Namespace WinInet -Name N -MemberDefinition '[DllImport(\"wininet.dll\")] public static extern bool InternetSetOption(IntPtr h,int o,IntPtr b,int l);';" +
  "[WinInet.N]::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0);" +
  "[WinInet.N]::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0)";

async function macServices() {
  const { so } = await run("networksetup", ["-listallnetworkservices"]);
  return (so || "").split("\n").slice(1).map((s) => s.trim()).filter((s) => s && !s.startsWith("*"));
}

async function enable(port) {
  if (isWin) {
    await run("reg", ["add", REG, "/v", "ProxyServer", "/t", "REG_SZ", "/d", `127.0.0.1:${port}`, "/f"]);
    await run("reg", ["add", REG, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"]);
    await run("reg", ["add", REG, "/v", "ProxyOverride", "/t", "REG_SZ", "/d", "<local>", "/f"]);
    await run("powershell", ["-NoProfile", "-Command", PS_REFRESH]);
    return { ok: true };
  }
  if (isMac) {
    for (const svc of await macServices()) {
      await run("networksetup", ["-setwebproxy", svc, "127.0.0.1", String(port)]);
      await run("networksetup", ["-setsecurewebproxy", svc, "127.0.0.1", String(port)]);
      await run("networksetup", ["-setsocksfirewallproxy", svc, "127.0.0.1", String(port)]);
    }
    return { ok: true };
  }
  return { ok: false, error: "system proxy not supported on this OS" };
}

async function disable() {
  if (isWin) {
    await run("reg", ["add", REG, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f"]);
    await run("powershell", ["-NoProfile", "-Command", PS_REFRESH]);
    return { ok: true };
  }
  if (isMac) {
    for (const svc of await macServices()) {
      await run("networksetup", ["-setwebproxystate", svc, "off"]);
      await run("networksetup", ["-setsecurewebproxystate", svc, "off"]);
      await run("networksetup", ["-setsocksfirewallproxystate", svc, "off"]);
    }
    return { ok: true };
  }
  return { ok: true };
}

module.exports = { enable, disable };
