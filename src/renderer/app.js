"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const power = $("power"), statusText = $("status-text"), statusSub = $("status-sub");
  const mMode = $("m-mode"), mProto = $("m-proto"), mOnline = $("m-online");
  const logPanel = $("logpanel"), logBox = $("logbox"), settings = $("settings"), toast = $("toast");

  const TEXT = {
    disconnected: ["آماده‌ی اتصال", "یک حالت و پروتکل انتخاب کن و دکمه را بزن"],
    connecting:   ["در حال اتصال…", "لطفاً چند لحظه صبر کنید"],
    connected:    ["متصل شدید ✓", "اینترنت شما آزاد و امن است"],
    error:        ["خطا در اتصال", "تست اتصال یا کپی لاگ را بزن"],
  };
  const PROTO_FA = { auto: "خودکار", reality: "Reality", hysteria2: "Hysteria2" };
  const MODE_FA = { proxy: "پروکسی", tun: "TUN" };

  let state = "disconnected", busy = false;
  let cfg = { mode: "proxy", protocol: "auto" }; // mirrors settings for quick pills

  function showToast(msg) {
    toast.textContent = msg; toast.hidden = false;
    clearTimeout(showToast._t); showToast._t = setTimeout(() => (toast.hidden = true), 2200);
  }
  function setState(s, extra) {
    state = s; power.dataset.state = s;
    const [t, sub] = TEXT[s] || TEXT.disconnected;
    statusText.textContent = t;
    statusSub.textContent = (extra && extra.error) ? extra.error : sub;
    mOnline.textContent = s === "connected" ? "آنلاین" : s === "connecting" ? "…" : "آفلاین";
    window.__globeState = s; if (window.IranGlobe) window.IranGlobe.setState(s);
  }

  // ---- segmented controls ----
  function wireSeg(id, key) {
    const seg = $(id);
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      [...seg.children].forEach((c) => c.classList.toggle("on", c === b));
      cfg[key] = b.dataset.v;
      mMode.textContent = MODE_FA[cfg.mode]; mProto.textContent = PROTO_FA[cfg.protocol];
      window.iranpro.saveSettings(cfg);
    });
  }
  wireSeg("seg-mode", "mode");
  wireSeg("seg-proto", "protocol");

  function syncSeg(id, key) {
    [...$(id).children].forEach((c) => c.classList.toggle("on", c.dataset.v === cfg[key]));
  }

  // ---- power button ----
  power.addEventListener("click", async () => {
    if (busy) return; busy = true;
    try {
      if (state === "connected" || state === "connecting") {
        await window.iranpro.disconnect(); setState("disconnected");
      } else {
        setState("connecting");
        const r = await window.iranpro.connect(cfg);
        if (!r || !r.ok) setState("error", { error: friendly(r && r.error) });
        else setState("connected");
      }
    } catch (e) { setState("error", { error: String(e && e.message || e) }); }
    finally { busy = false; }
  });
  function friendly(err) {
    if (!err) return null;
    if (err.startsWith("core_missing")) return "هسته پیدا نشد (نصب ناقص).";
    if (err.startsWith("config")) return "مشکل در ساخت تنظیمات.";
    return err;
  }

  window.iranpro.onStatus((p) => {
    if (!p) return;
    if (p.state === "connected" && p.weak) { setState("connected"); statusSub.textContent = "وصل شد — در حال تأیید نهایی…"; }
    else setState(p.state, p);
  });
  window.iranpro.onLog((line) => {
    logBox.textContent += line; logBox.scrollTop = logBox.scrollHeight;
    if (logBox.textContent.length > 80000) logBox.textContent = logBox.textContent.slice(-60000);
  });

  // ---- footer actions ----
  $("btn-log").addEventListener("click", () => (logPanel.hidden = !logPanel.hidden));
  $("btn-quit").addEventListener("click", () => window.iranpro.quit());
  $("btn-copylog").addEventListener("click", async () => { await window.iranpro.copyLog(); showToast("لاگ کپی شد — برای ما بفرست"); });
  $("btn-test").addEventListener("click", async () => {
    showToast("در حال تست…");
    const rep = await window.iranpro.diagnose();
    logPanel.hidden = false; logBox.textContent = rep + "\n\n" + logBox.textContent; logBox.scrollTop = 0;
    showToast("تست انجام شد (در پنل لاگ)");
  });

  // ---- live speed ----
  const speedbar = $("speedbar");
  function fmt(bps) {
    if (bps < 1024) return bps.toFixed(0) + " B/s";
    if (bps < 1048576) return (bps / 1024).toFixed(0) + " KB/s";
    return (bps / 1048576).toFixed(1) + " MB/s";
  }
  window.iranpro.onSpeed((p) => {
    if (!p) return;
    const active = state === "connected" || state === "connecting";
    speedbar.hidden = !active;
    $("sp-down").textContent = fmt(p.down || 0);
    $("sp-up").textContent = fmt(p.up || 0);
  });

  // ---- auto update ----
  $("btn-update").addEventListener("click", async () => {
    showToast("بررسی بروزرسانی…");
    const r = await window.iranpro.checkUpdate();
    if (r && r.state === "devmode") showToast("در حالت توسعه بروزرسانی نداریم");
  });
  window.iranpro.onUpdate((p) => {
    if (!p) return;
    if (p.state === "checking") showToast("در حال بررسی…");
    else if (p.state === "latest") showToast("آخرین نسخه نصب است ✓");
    else if (p.state === "available") showToast("نسخه‌ی جدید پیدا شد — دانلود…");
    else if (p.state === "downloading") showToast(`دانلود بروزرسانی: ${p.percent}%`);
    else if (p.state === "ready") showToast("نصب… برنامه ری‌استارت می‌شود");
    else if (p.state === "error") showToast("خطای بروزرسانی");
  });

  // ---- settings sheet ----
  $("btn-settings").addEventListener("click", () => (settings.hidden = false));
  $("btn-settings-close").addEventListener("click", () => (settings.hidden = true));
  function fillForm(s) {
    $("f-sni").value = s.sni || ""; $("f-server").value = s.serverIp || "";
    $("f-rport").value = s.realityPort || ""; $("f-hport").value = s.hy2Port || "";
    $("f-pport").value = s.proxyPort || 2080; $("f-setproxy").checked = s.setSystemProxy !== false;
  }
  $("btn-save").addEventListener("click", async () => {
    cfg = Object.assign(cfg, {
      sni: $("f-sni").value.trim(), serverIp: $("f-server").value.trim(),
      realityPort: Number($("f-rport").value), hy2Port: Number($("f-hport").value),
      proxyPort: Number($("f-pport").value), setSystemProxy: $("f-setproxy").checked,
    });
    await window.iranpro.saveSettings(cfg);
    settings.hidden = true; showToast("ذخیره شد — یک‌بار قطع/وصل کن");
  });
  $("btn-reset").addEventListener("click", async () => {
    const d = await window.iranpro.getSettings();
    // reset only advanced fields to bundled defaults by clearing stored overrides
    await window.iranpro.saveSettings({ mode: cfg.mode, protocol: cfg.protocol });
    const s = await window.iranpro.getSettings(); cfg = s; fillForm(s);
    mMode.textContent = MODE_FA[cfg.mode]; mProto.textContent = PROTO_FA[cfg.protocol];
    syncSeg("seg-mode", "mode"); syncSeg("seg-proto", "protocol");
    showToast("به پیش‌فرض برگشت");
  });

  // ---- init ----
  (async () => {
    const s = await window.iranpro.getSettings();
    cfg = s; fillForm(s);
    mMode.textContent = MODE_FA[cfg.mode] || "پروکسی";
    mProto.textContent = PROTO_FA[cfg.protocol] || "خودکار";
    syncSeg("seg-mode", "mode"); syncSeg("seg-proto", "protocol");
    setState("disconnected");
    const st = await window.iranpro.status();
    if (st && st.running) setState("connected");
  })();
})();
