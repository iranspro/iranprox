#!/usr/bin/env node
/** Downloads the three.js ESM build into the renderer so the globe works offline. */
const fs = require("fs");
const path = require("path");
const https = require("https");

const THREE_VERSION = process.env.THREE_VERSION || "0.160.0";
const dest = path.join(__dirname, "..", "src", "renderer", "vendor");
fs.mkdirSync(dest, { recursive: true });

function get(url, file) {
  return new Promise((resolve, reject) => {
    const go = (u) => https.get(u, { headers: { "User-Agent": "iranpro" } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) return go(res.headers.location);
      if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} ${u}`));
      const out = fs.createWriteStream(file);
      res.pipe(out); out.on("finish", () => out.close(resolve));
    }).on("error", reject);
    go(url);
  });
}

(async () => {
  const url = `https://unpkg.com/three@${THREE_VERSION}/build/three.module.js`;
  const file = path.join(dest, "three.module.js");
  console.log(`==> ${url}`);
  await get(url, file);
  console.log(`✓ three.module.js (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
