/* ============================================================
   content.js — runs on TikTok / Instagram / YouTube Shorts
   ============================================================ */

(() => {
  const TIME_LIMIT_SECONDS = 15;
  const SHOW_BADGE = true;

  let seconds = 0;
  let fired = false;
  let badge = null;

  // Listen for popup trigger
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SHOW_LOCK") {
      injectLockScreen();
    }
  });

  function injectLockScreen() {
    const iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("lock.html");
    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.width = "100vw";
    iframe.style.height = "100vh";
    iframe.style.zIndex = "999999999";
    iframe.style.border = "none";

    document.documentElement.appendChild(iframe);
  }

  function makeBadge() {
    if (!SHOW_BADGE) return;
    badge = document.createElement("div");
    badge.style.cssText = [
      "position:fixed", "top:12px", "left:50%", "transform:translateX(-50%)",
      "z-index:2147483647", "background:rgba(10,10,15,0.85)", "color:#fff",
      "font:600 13px -apple-system,system-ui,sans-serif", "padding:6px 14px",
      "border-radius:999px", "pointer-events:none", "backdrop-filter:blur(4px)",
      "border:1px solid rgba(255,255,255,0.15)", "letter-spacing:0.3px"
    ].join(";");
    document.documentElement.appendChild(badge);
  }

  function updateBadge() {
    if (!badge) return;
    const left = Math.max(0, TIME_LIMIT_SECONDS - seconds);
    badge.textContent = left <= 5 ? `💪 squat check in ${left}s`
                                  : `DoomFitness watching · ${left}s`;
    badge.style.background = left <= 5 ? "rgba(220,38,38,0.9)" : "rgba(10,10,15,0.85)";
  }

  function start() {
    makeBadge();
    updateBadge();
    setInterval(() => {
      if (document.visibilityState !== "visible") return;
      seconds++;
      updateBadge();
      if (seconds >= TIME_LIMIT_SECONDS && !fired) {
        fired = true;
        chrome.runtime.sendMessage({ type: "LIMIT_REACHED", url: location.href });
      }
    }, 1000);
  }

  chrome.storage.local.get("unlockedUntil", (data) => {
    const now = Date.now();
    if (data && data.unlockedUntil && now < data.unlockedUntil) {
      setTimeout(start, data.unlockedUntil - now);
    } else {
      start();
    }
  });
})();
