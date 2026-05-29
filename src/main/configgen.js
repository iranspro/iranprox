"use strict";
// Builds a sing-box config object from user settings + bundled server credentials.
// Lets the tester switch mode (tun/proxy), protocol (auto/reality/hysteria2),
// SNI, server IP and ports without rebuilding the app.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const isDev = !app.isPackaged;

function coreDir() {
  return isDev ? path.join(__dirname, "..", "..", "core") : path.join(process.resourcesPath, "core");
}

// Bundled credentials (uuid / reality keys / hy2 password). Never user-editable.
function creds() {
  const p = path.join(coreDir(), "server.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Merge stored settings over sensible defaults derived from the bundled creds.
function defaults() {
  const c = creds();
  return {
    mode: "proxy",            // "proxy" (no admin) | "tun" (whole system, admin)
    protocol: "auto",         // "auto" | "reality" | "hysteria2"
    serverIp: c.SERVER_IP,
    sni: c.SNI,
    realityPort: c.REALITY_PORT,
    hy2Port: c.HY2_PORT,
    proxyPort: 2080,          // local mixed (http+socks) port for proxy mode
    setSystemProxy: true,     // auto-configure Windows/mac system proxy in proxy mode
  };
}

function realityOutbound(s, c) {
  return {
    type: "vless", tag: "reality",
    server: s.serverIp, server_port: Number(s.realityPort),
    uuid: c.UUID, flow: "xtls-rprx-vision",
    tls: {
      enabled: true, server_name: s.sni,
      utls: { enabled: true, fingerprint: "chrome" },
      reality: { enabled: true, public_key: c.PUBLIC_KEY, short_id: c.SHORT_ID },
    },
  };
}

function hy2Outbound(s, c) {
  return {
    type: "hysteria2", tag: "hy2",
    server: s.serverIp, server_port: Number(s.hy2Port),
    password: c.HY2_PASSWORD,
    tls: { enabled: true, server_name: s.sni, insecure: true, alpn: ["h3"] },
  };
}

function buildConfig(settings) {
  const c = creds();
  const s = Object.assign(defaults(), settings || {});

  const inbounds = [];
  if (s.mode === "tun") {
    inbounds.push({
      type: "tun", tag: "tun-in", interface_name: "iranpro",
      inet4_address: "172.19.0.1/30", auto_route: true, strict_route: true,
      stack: "system", sniff: true, sniff_override_destination: false,
    });
  } else {
    inbounds.push({
      type: "mixed", tag: "mixed-in",
      listen: "127.0.0.1", listen_port: Number(s.proxyPort), sniff: true,
    });
  }

  const reality = realityOutbound(s, c);
  const hy2 = hy2Outbound(s, c);

  // pick which outbound the traffic uses
  let finalTag;
  const outbounds = [];
  if (s.protocol === "reality") { outbounds.push(reality, hy2); finalTag = "reality"; }
  else if (s.protocol === "hysteria2") { outbounds.push(reality, hy2); finalTag = "hy2"; }
  else {
    outbounds.push(
      { type: "urltest", tag: "auto", outbounds: ["reality", "hy2"], url: "https://www.gstatic.com/generate_204", interval: "3m", tolerance: 100 },
      reality, hy2
    );
    finalTag = "auto";
  }
  outbounds.push({ type: "direct", tag: "direct" }, { type: "dns", tag: "dns-out" });

  return {
    log: { level: "info", timestamp: true },
    experimental: { clash_api: { external_controller: "127.0.0.1:9090" } },
    dns: {
      servers: [
        { tag: "remote", address: "https://1.1.1.1/dns-query", detour: finalTag },
        { tag: "local", address: "local", detour: "direct" },
      ],
      rules: [{ outbound: "any", server: "local" }],
      strategy: "prefer_ipv4",
    },
    inbounds,
    outbounds,
    route: {
      rules: [
        { protocol: "dns", outbound: "dns-out" },
        { ip_is_private: true, outbound: "direct" },
      ],
      auto_detect_interface: true,
      final: finalTag,
    },
  };
}

module.exports = { buildConfig, defaults, creds, coreDir };
