/* ============================================================
   content.js — runs on the target sites

   Counts active seconds on the feed (paused while the tab is hidden). At the
   limit it pings the background, which engages the GLOBAL lock. Running the
   timer here keeps it reliable — unlike the MV3 service worker, this context is
   never terminated out from under us. It also stands down if a lock is already
   engaged (the background will redirect this tab to the gate).
   ============================================================ */
(() => {
  const TIME_LIMIT_SECONDS = 15;  // DEMO value. Raise for real use (e.g. 300 = 5 min).
  const SHOW_BADGE = true;        // small on-page countdown so the demo is readable

  let seconds = 0;
  let fired = false;
  let badge = null;

  chrome.storage.local.get(["unlockedUntil", "locked"], (data) => {
    const now = Date.now();
    const lockedActive = data.locked && (!data.unlockedUntil || now > data.unlockedUntil);
    if (lockedActive) return;                 // globally locked; background handles the redirect
    if (data.unlockedUntil && now < data.unlockedUntil) {
      setTimeout(start, data.unlockedUntil - now); // wait out the post-unlock grace
    } else {
      start();
    }
  });

  function makeBadge() {
    if (!SHOW_BADGE) return;
    badge = document.createElement("div");
    badge.style.cssText = [
      "position:fixed", "top:12px", "left:50%", "transform:translateX(-50%)",
      "z-index:2147483647", "background:rgba(10,13,10,0.85)", "color:#eafce0",
      "font:600 13px -apple-system,system-ui,sans-serif", "padding:6px 15px",
      "border-radius:999px", "pointer-events:none", "backdrop-filter:blur(4px)",
      "border:1px solid rgba(126,217,87,0.35)", "letter-spacing:0.3px",
      "box-shadow:0 2px 18px rgba(0,0,0,0.4)"
    ].join(";");
    document.documentElement.appendChild(badge);
  }

  function updateBadge() {
    if (!badge) return;
    const left = Math.max(0, TIME_LIMIT_SECONDS - seconds);
    const urgent = left <= 5;
    badge.textContent = urgent ? `Fitness check in ${left}s` : `DoomFitness watching · ${left}s`;
    badge.style.background = urgent ? "#7ed957" : "rgba(10,13,10,0.85)";
    badge.style.color = urgent ? "#08210a" : "#eafce0";
    badge.style.borderColor = urgent ? "rgba(126,217,87,0.9)" : "rgba(126,217,87,0.35)";
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
