"use strict";
// Persists user settings as JSON in Electron's userData dir.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function file() { return path.join(app.getPath("userData"), "settings.json"); }

function load() {
  try { return JSON.parse(fs.readFileSync(file(), "utf8")); }
  catch (_) { return {}; }
}

function save(obj) {
  try { fs.writeFileSync(file(), JSON.stringify(obj, null, 2)); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { load, save };
