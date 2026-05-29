#!/usr/bin/env node
/**
 * Downloads the macOS sing-box cores (arm64 + amd64) into ./core so a single
 * build runs on both Apple-Silicon and Intel Macs (singbox.js picks by arch).
 * Runs on macOS (uses `tar`). Pinned to match core/config.template.json schema.
 *
 *   node scripts/fetch-core-mac.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const VER = process.env.SINGBOX_VERSION || "1.10.7";
const CORE = path.join(__dirname, "..", "core");
fs.mkdirSync(CORE, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const go = (u) => https.get(u, { headers: { "User-Agent": "iranpro" } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) return go(res.headers.location);
      if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} ${u}`));
      const f = fs.createWriteStream(dest);
      res.pipe(f); f.on("finish", () => f.close(resolve));
    }).on("error", reject);
    go(url);
  });
}

(async () => {
  for (const arch of ["arm64", "amd64"]) {
    const name = `sing-box-${VER}-darwin-${arch}`;
    const tgz = path.join(CORE, `${name}.tar.gz`);
    console.log(`==> ${name}`);
    await download(`https://github.com/SagerNet/sing-box/releases/download/v${VER}/${name}.tar.gz`, tgz);
    execSync(`tar -xzf "${tgz}" -C "${CORE}"`);
    fs.copyFileSync(path.join(CORE, name, "sing-box"), path.join(CORE, `sing-box-darwin-${arch}`));
    fs.chmodSync(path.join(CORE, `sing-box-darwin-${arch}`), 0o755);
    fs.rmSync(path.join(CORE, name), { recursive: true, force: true });
    fs.rmSync(tgz, { force: true });
  }
  console.log("✓ macOS cores ready:");
  for (const a of ["arm64", "amd64"]) {
    const p = path.join(CORE, `sing-box-darwin-${a}`);
    console.log(`   sing-box-darwin-${a}  (${(fs.statSync(p).size / 1e6).toFixed(1)} MB)`);
  }
})().catch((e) => { console.error("fetch-core-mac failed:", e.message); process.exit(1); });
