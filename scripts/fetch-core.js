#!/usr/bin/env node
/**
 * Downloads the Windows sing-box core + wintun.dll into ./core so electron-builder
 * can bundle them as extraResources. Pins a known-good version for config-schema
 * compatibility with core/config.template.json.
 *
 *   node scripts/fetch-core.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const SINGBOX_VERSION = process.env.SINGBOX_VERSION || "1.10.7"; // schema matches the template
const CORE_DIR = path.join(__dirname, "..", "core");
const ARCH = "amd64";

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const go = (u) =>
      https.get(u, { headers: { "User-Agent": "iranpro" } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) return go(res.headers.location);
        if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} for ${u}`));
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      }).on("error", reject);
    go(url);
  });
}

(async () => {
  fs.mkdirSync(CORE_DIR, { recursive: true });
  const base = `https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}`;
  const zipName = `sing-box-${SINGBOX_VERSION}-windows-${ARCH}.zip`;
  const zipPath = path.join(CORE_DIR, zipName);

  console.log(`==> downloading ${zipName} …`);
  await download(`${base}/${zipName}`, zipPath);

  console.log("==> extracting sing-box.exe …");
  // PowerShell Expand-Archive is available on every modern Windows
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '${zipPath}' -DestinationPath '${CORE_DIR}'"`,
    { stdio: "inherit" }
  );
  const exeSrc = path.join(CORE_DIR, `sing-box-${SINGBOX_VERSION}-windows-${ARCH}`, "sing-box.exe");
  fs.copyFileSync(exeSrc, path.join(CORE_DIR, "sing-box.exe"));

  // wintun.dll — required by the TUN inbound on Windows
  console.log("==> downloading wintun.dll …");
  const wintunZip = path.join(CORE_DIR, "wintun.zip");
  await download("https://www.wintun.net/builds/wintun-0.14.1.zip", wintunZip);
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '${wintunZip}' -DestinationPath '${CORE_DIR}'"`,
    { stdio: "inherit" }
  );
  fs.copyFileSync(
    path.join(CORE_DIR, "wintun", "bin", ARCH, "wintun.dll"),
    path.join(CORE_DIR, "wintun.dll")
  );

  console.log("\n✓ core ready:");
  for (const f of ["sing-box.exe", "wintun.dll"]) {
    const p = path.join(CORE_DIR, f);
    console.log(`   ${f}  (${(fs.statSync(p).size / 1e6).toFixed(1)} MB)`);
  }
})().catch((e) => {
  console.error("fetch-core failed:", e.message);
  process.exit(1);
});
