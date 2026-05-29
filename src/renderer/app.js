"use strict";
(function () {
  const power = document.getElementById("power");
  const statusText = document.getElementById("status-text");
  const statusSub = document.getElementById("status-sub");
  const mProto = document.getElementById("m-proto");
  const mOnline = document.getElementById("m-online");
  const logPanel = document.getElementById("logpanel");
  const logBox = document.getElementById("logbox");

  const TEXT = {
    disconnected: ["آماده‌ی اتصال", "برای روشن‌کردن اینترنت آزاد، دکمه را لمس کنید"],
    connecting:   ["در حال اتصال…", "لطفاً چند لحظه صبر کنید"],
    connected:    ["متصل شدید ✓", "اینترنت شما آزاد و امن است"],
    error:        ["خطا در اتصال", "دوباره تلاش کنید یا گزارش فنی را ببینید"],
  };

  let state = "disconnected";
  let busy = false;

  function setState(s, extra) {
    state = s;
    power.dataset.state = s;
    const [t, sub] = TEXT[s] || TEXT.disconnected;
    statusText.textContent = t;
    statusSub.textContent = (extra && extra.error) ? extra.error : sub;
    mOnline.textContent = s === "connected" ? "آنلاین" : s === "connecting" ? "…" : "آفلاین";
    // notify the globe (may not be ready yet → stash for it)
    window.__globeState = s;
    if (window.IranGlobe) window.IranGlobe.setState(s);
  }

  power.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try {
      if (state === "connected" || state === "connecting") {
        await window.iranpro.disconnect();
        setState("disconnected");
      } else {
        setState("connecting");
        const r = await window.iranpro.connect();
        if (!r || !r.ok) setState("error", r && { error: friendly(r.error) });
        else setState("connected");
      }
    } catch (e) {
      setState("error", { error: String(e && e.message || e) });
    } finally {
      busy = false;
    }
  });

  function friendly(err) {
    if (!err) return null;
    if (err.startsWith("core_missing")) return "هسته‌ی برنامه پیدا نشد (نصب ناقص).";
    if (err.startsWith("config_missing")) return "تنظیمات سرور تنظیم نشده است.";
    return err;
  }

  // status pushed from main (e.g. core died on its own)
  window.iranpro.onStatus((p) => {
    if (!p) return;
    if (p.state === "connected" && p.weak) {
      setState("connected");
      statusSub.textContent = "متصل شد — در حال تأیید نهایی…";
    } else {
      setState(p.state, p);
    }
  });

  window.iranpro.onLog((line) => {
    logBox.textContent += line;
    logBox.scrollTop = logBox.scrollHeight;
    if (logBox.textContent.length > 60000) logBox.textContent = logBox.textContent.slice(-40000);
  });

  document.getElementById("btn-log").addEventListener("click", () => {
    logPanel.hidden = !logPanel.hidden;
  });
  document.getElementById("btn-quit").addEventListener("click", () => window.iranpro.quit());

  // reflect any pre-existing connection on launch
  window.iranpro.status().then((s) => {
    if (s && s.running) setState(s.online ? "connected" : "connecting");
  });

  setState("disconnected");
})();
