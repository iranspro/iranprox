#!/usr/bin/env node
/**
 * Bakes server parameters into core/config.json from core/config.template.json.
 *
 * Either pass values via env / a JSON file, or edit core/server.json (gitignored).
 * Example:
 *   node scripts/make-client-config.js core/server.json
 *
 * core/server.json shape (produced from the server install.sh output):
 * {
 *   "SERVER_IP": "YOUR_SERVER_IP",
 *   "REALITY_PORT": 443,
 *   "UUID": "....",
 *   "PUBLIC_KEY": "....",
 *   "SHORT_ID": "....",
 *   "SNI": "www.lovelive-anime.jp",
 *   "HY2_PORT": 8443,
 *   "HY2_PASSWORD": "...."
 * }
 */
const fs = require("fs");
const path = require("path");

const CORE = path.join(__dirname, "..", "core");
const tpl = fs.readFileSync(path.join(CORE, "config.template.json"), "utf8");

const srcFile = process.argv[2] || path.join(CORE, "server.json");
if (!fs.existsSync(srcFile)) {
  console.error(`missing server params file: ${srcFile}`);
  console.error("create core/server.json from the install.sh output, then re-run.");
  process.exit(1);
}
const p = JSON.parse(fs.readFileSync(srcFile, "utf8"));

const required = ["SERVER_IP", "REALITY_PORT", "UUID", "PUBLIC_KEY", "SHORT_ID", "SNI", "HY2_PORT", "HY2_PASSWORD"];
for (const k of required) if (p[k] === undefined || p[k] === "") { console.error(`missing field: ${k}`); process.exit(1); }

let out = tpl
  .replaceAll("__SERVER_IP__", String(p.SERVER_IP))
  .replaceAll("__REALITY_PORT__", String(p.REALITY_PORT))
  .replaceAll("__UUID__", String(p.UUID))
  .replaceAll("__PUBLIC_KEY__", String(p.PUBLIC_KEY))
  .replaceAll("__SHORT_ID__", String(p.SHORT_ID))
  .replaceAll("__SNI__", String(p.SNI))
  .replaceAll("__HY2_PORT__", String(p.HY2_PORT))
  .replaceAll("__HY2_PASSWORD__", String(p.HY2_PASSWORD));

// validate it parses
JSON.parse(out);
fs.writeFileSync(path.join(CORE, "config.json"), out);
console.log("✓ wrote core/config.json");
