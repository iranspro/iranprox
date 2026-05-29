# ایران پرو — Iran Pro

One-click secure-internet client for Windows. A high-graphics Electron + Three.js
shell that drives a bundled **sing-box** core (VLESS+Reality + Hysteria2) in TUN
mode. The user clicks one button → all system traffic is tunneled through the
Iran Pro server → free, censorship-resistant internet.

> Anti-censorship / free-information tool. Server must live **outside Iran**.

## Architecture
```
┌─────────────── Windows client (this repo) ───────────────┐
│  Electron main  ── spawns ──►  core/sing-box.exe (TUN)    │
│       ▲                              │                     │
│   IPC │ (preload bridge)             ▼                     │
│  Renderer (Three.js globe + power button)   all traffic ──┼──► server
└──────────────────────────────────────────────────────────┘
                                                   91.107.170.103
                                          VLESS+Reality :443 / Hysteria2 :8443
```

## Build (developer machine)

```powershell
npm install
npm run setup          # downloads sing-box.exe + wintun.dll + three.js
# 1) provision the server (see server/install.sh), copy its printed params into:
#    core/server.json
npm run config core/server.json   # bakes params into core/config.json
npm run dev            # run locally (needs admin for TUN)
npm run dist           # produce dist/IranPro-Setup-1.0.0.exe
```

## Server provisioning
`server/install.sh` — run as root on the server. Installs sing-box, generates
keys, writes `/etc/sing-box/config.json`, opens the two ports, enables a systemd
service `iranpro-singbox`, and prints the client params. It does **not** touch
nginx, PM2, /opt, or any other service on the box.

```bash
sudo bash install.sh
# optional overrides:
# REALITY_PORT=443 HY2_PORT=8443 DEST_SNI=www.lovelive-anime.jp sudo -E bash install.sh
```

## core/server.json (gitignored — never commit)
```json
{
  "SERVER_IP": "91.107.170.103",
  "REALITY_PORT": 443,
  "UUID": "...",
  "PUBLIC_KEY": "...",
  "SHORT_ID": "...",
  "SNI": "www.lovelive-anime.jp",
  "HY2_PORT": 8443,
  "HY2_PASSWORD": "..."
}
```

## Notes
- Installer requests Administrator (TUN driver requirement).
- The app tears down the tunnel on quit so the user is never left with broken routing.
- `build/icon.ico` — drop a real icon here before `npm run dist` (optional; default used otherwise).
- Code signing: unsigned builds trigger SmartScreen. Sign before wide distribution.
