/* ============================================================
   background.js  (MV3 service worker)

   IMPORTANT DESIGN NOTE:
   The original guide counted time here with setInterval. In Manifest V3 the
   background is a SERVICE WORKER that Chrome kills after ~30s idle — so a
   setInterval timer silently dies mid-count and the limit never fires. That's
   the kind of flakiness that ruins a live demo.

   So the per-second counting lives in content.js (page context, never killed).
   This worker does almost nothing: it wakes up ONLY when the content script
   pings it, and redirects that tab to the full-screen squat gate.

   Why redirect to our own extension page instead of overlaying TikTok?
   getUserMedia (the webcam) is blocked by many sites' Permissions-Policy, even
   for injected scripts. An extension page has its own origin, so the camera is
   never blocked there.
   ============================================================ */

// background.js — opens the lock screen in a new tab

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "OPEN_LOCK") {
    const returnUrl = msg.url || (sender && sender.tab && sender.tab.url) || "https://www.tiktok.com";

    chrome.tabs.create({
      url: chrome.runtime.getURL("lock.html") + "?return=" + encodeURIComponent(returnUrl)
    });
  }
});
