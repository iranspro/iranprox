#!/usr/bin/env bash
#
# Iran Pro — server bootstrap
# Installs sing-box and configures VLESS+Reality (TCP/443) + Hysteria2 (UDP/8443).
# Designed to coexist with other services on the box: it only binds the two ports
# below and touches nothing under /opt, nginx, or PM2.
#
# Run as root:  sudo bash install.sh
# Re-runnable (idempotent-ish): regenerates config but reuses existing keys if present.
#
set -euo pipefail

# ---- tunables ---------------------------------------------------------------
REALITY_PORT="${REALITY_PORT:-443}"        # VLESS+Reality listens here (TCP)
HY2_PORT="${HY2_PORT:-8443}"               # Hysteria2 listens here (UDP)
# The SNI we borrow for Reality. Must be a real TLS1.3 + HTTP/2 site that is
# NOT blocked inside Iran and is NOT a CDN you also use. Good picks:
DEST_SNI="${DEST_SNI:-www.lovelive-anime.jp}"
HY2_PASSWORD="${HY2_PASSWORD:-}"           # auto-generated if empty
STATE_DIR="/etc/sing-box"
KEYS_FILE="${STATE_DIR}/iranpro.keys"      # cached so re-runs keep the same UUID/keys
# -----------------------------------------------------------------------------

need_root() { [ "$(id -u)" = "0" ] || { echo "run as root (sudo)"; exit 1; }; }
need_root

echo "==> Installing sing-box (official repo)…"
if ! command -v sing-box >/dev/null 2>&1; then
  # official one-liner; falls back to GitHub binary if the repo route fails
  if ! bash <(curl -fsSL https://sing-box.app/install.sh) >/dev/null 2>&1; then
    ARCH=$(uname -m); case "$ARCH" in x86_64) A=amd64;; aarch64) A=arm64;; *) A=amd64;; esac
    VER=$(curl -fsSL https://api.github.com/repos/SagerNet/sing-box/releases/latest | grep -oP '"tag_name":\s*"v\K[^"]+')
    curl -fsSL "https://github.com/SagerNet/sing-box/releases/download/v${VER}/sing-box-${VER}-linux-${A}.tar.gz" -o /tmp/sb.tgz
    tar -xzf /tmp/sb.tgz -C /tmp
    install -m755 "/tmp/sing-box-${VER}-linux-${A}/sing-box" /usr/local/bin/sing-box
  fi
fi
echo "    sing-box: $(sing-box version | head -n1)"

mkdir -p "$STATE_DIR"

# ---- keys (generate once, then cache) ---------------------------------------
if [ -f "$KEYS_FILE" ]; then
  echo "==> Reusing cached keys ($KEYS_FILE)"
  # shellcheck disable=SC1090
  source "$KEYS_FILE"
else
  echo "==> Generating UUID + Reality keypair + short-id…"
  UUID="$(sing-box generate uuid)"
  RK="$(sing-box generate reality-keypair)"   # prints PrivateKey: .. / PublicKey: ..
  PRIV="$(echo "$RK" | awk '/PrivateKey/{print $2}')"
  PUB="$(echo "$RK"  | awk '/PublicKey/{print $2}')"
  SHORT_ID="$(openssl rand -hex 8)"
  [ -n "$HY2_PASSWORD" ] || HY2_PASSWORD="$(openssl rand -hex 16)"
  cat >"$KEYS_FILE" <<EOF
UUID="$UUID"
PRIV="$PRIV"
PUB="$PUB"
SHORT_ID="$SHORT_ID"
HY2_PASSWORD="$HY2_PASSWORD"
EOF
  chmod 600 "$KEYS_FILE"
fi

# ---- self-signed cert for Hysteria2 -----------------------------------------
if [ ! -f "${STATE_DIR}/hy2.crt" ]; then
  echo "==> Generating self-signed cert for Hysteria2…"
  openssl req -x509 -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -keyout "${STATE_DIR}/hy2.key" -out "${STATE_DIR}/hy2.crt" \
    -subj "/CN=${DEST_SNI}" -days 3650 >/dev/null 2>&1
fi

# ---- server config ----------------------------------------------------------
echo "==> Writing ${STATE_DIR}/config.json…"
cat >"${STATE_DIR}/config.json" <<EOF
{
  "log": { "level": "warn", "timestamp": true },
  "inbounds": [
    {
      "type": "vless",
      "tag": "vless-reality",
      "listen": "::",
      "listen_port": ${REALITY_PORT},
      "users": [ { "uuid": "${UUID}", "flow": "xtls-rprx-vision" } ],
      "tls": {
        "enabled": true,
        "server_name": "${DEST_SNI}",
        "reality": {
          "enabled": true,
          "handshake": { "server": "${DEST_SNI}", "server_port": 443 },
          "private_key": "${PRIV}",
          "short_id": [ "${SHORT_ID}" ]
        }
      }
    },
    {
      "type": "hysteria2",
      "tag": "hy2",
      "listen": "::",
      "listen_port": ${HY2_PORT},
      "users": [ { "password": "${HY2_PASSWORD}" } ],
      "tls": {
        "enabled": true,
        "alpn": [ "h3" ],
        "certificate_path": "${STATE_DIR}/hy2.crt",
        "key_path": "${STATE_DIR}/hy2.key"
      }
    }
  ],
  "outbounds": [ { "type": "direct", "tag": "direct" } ]
}
EOF

sing-box check -c "${STATE_DIR}/config.json"
echo "    config OK"

# ---- firewall ---------------------------------------------------------------
echo "==> Opening ports ${REALITY_PORT}/tcp and ${HY2_PORT}/udp (best-effort)…"
if command -v ufw >/dev/null 2>&1; then
  ufw allow "${REALITY_PORT}/tcp" || true
  ufw allow "${HY2_PORT}/udp"     || true
else
  iptables  -I INPUT -p tcp --dport "${REALITY_PORT}" -j ACCEPT 2>/dev/null || true
  iptables  -I INPUT -p udp --dport "${HY2_PORT}"     -j ACCEPT 2>/dev/null || true
fi

# ---- systemd service --------------------------------------------------------
echo "==> Installing systemd unit iranpro-singbox.service…"
cat >/etc/systemd/system/iranpro-singbox.service <<'EOF'
[Unit]
Description=Iran Pro sing-box
After=network.target

[Service]
ExecStart=/usr/local/bin/sing-box run -c /etc/sing-box/config.json
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF
# if sing-box landed in /usr/bin instead, fix the path
command -v sing-box | grep -q /usr/local/bin || \
  sed -i "s#/usr/local/bin/sing-box#$(command -v sing-box)#" /etc/systemd/system/iranpro-singbox.service

systemctl daemon-reload
systemctl enable --now iranpro-singbox.service
sleep 1
systemctl --no-pager --full status iranpro-singbox.service | head -n 6 || true

# ---- print client params ----------------------------------------------------
PUBIP="$(curl -fsSL https://api.ipify.org || echo 'YOUR_SERVER_IP')"
cat <<EOF

============================================================
  IRAN PRO — client parameters (paste these into the app)
============================================================
SERVER_IP   = ${PUBIP}
# --- VLESS + Reality ---
REALITY_PORT= ${REALITY_PORT}
UUID        = ${UUID}
PUBLIC_KEY  = ${PUB}
SHORT_ID    = ${SHORT_ID}
SNI / DEST  = ${DEST_SNI}
FLOW        = xtls-rprx-vision
# --- Hysteria2 ---
HY2_PORT    = ${HY2_PORT}
HY2_PASSWORD= ${HY2_PASSWORD}
============================================================
These values are saved in ${KEYS_FILE} (root-only).
Run  scripts/make-client-config.sh  to bake them into the client.
============================================================
EOF
