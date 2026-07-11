/* ============================================================
   content.js  — runs on TikTok / Instagram / YouTube Shorts

   Counts how many seconds you've actively been on the feed (paused while the
   tab is hidden), and when you cross the limit it pings the background worker,
   which swaps the tab for the squat gate. Running the timer here — in the page
   — is what makes it reliable, because unlike the MV3 service worker this
   context is never terminated out from under us.
   ============================================================ */
(() => {
  const TIME_LIMIT_SECONDS = 15;  // DEMO value. Raise for real use (e.g. 300 = 5 min).
  const SHOW_BADGE = true;        // small on-page countdown so the demo is readable

  let seconds = 0;
  let fired = false;
  let badge = null;

  // After an unlock we set a grace window in storage so returning to the feed
  // doesn't instantly re-lock. Respect it before we start counting again.
  chrome.storage.local.get("unlockedUntil", (data) => {
    const now = Date.now();
    if (data && data.unlockedUntil && now < data.unlockedUntil) {
      setTimeout(start, data.unlockedUntil - now); // start after grace expires
    } else {
      start();
    }
  });

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
      if (document.visibilityState !== "visible") return; // pause when tabbed away
      seconds++;
      updateBadge();
      if (seconds >= TIME_LIMIT_SECONDS && !fired) {
        fired = true;
        chrome.runtime.sendMessage({ type: "LIMIT_REACHED", url: location.href });
      }
    }, 1000);
  }
})();
