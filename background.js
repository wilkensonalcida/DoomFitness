/* ============================================================
   background.js — MV3 service worker, now the GLOBAL LOCK ENFORCER

   Counting still lives in content.js (page context, reliable). When any tab
   crosses the time limit, content.js pings us and we flip a GLOBAL "locked"
   flag in storage. While that flag is on, we redirect EVERY target-site tab —
   including brand-new tabs opened to dodge the gate, back-button attempts, and
   tabs you switch to — straight to the squat page. The flag only clears when
   the squats are finished. That's what turns the nudge into a real block.

   These are event-driven (onMessage / onUpdated / onActivated), so the MV3
   service worker waking from sleep is fine — no fragile setInterval involved.
   ============================================================ */

const TARGET_HOSTS = [
  "tiktok.com", "instagram.com", "youtube.com", "reddit.com", "wikipedia.org"
];

function isTargetUrl(url) {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return TARGET_HOSTS.some((t) => h === t || h.endsWith("." + t));
  } catch (e) { return false; }
}

function lockUrlFor(returnUrl) {
  return chrome.runtime.getURL("lock.html") + "?return=" + encodeURIComponent(returnUrl || "");
}

async function isLockedNow() {
  const { locked = false, unlockedUntil = 0 } =
    await chrome.storage.local.get(["locked", "unlockedUntil"]);
  return locked && Date.now() > unlockedUntil;
}

// Send every currently-open target tab to the gate at once.
async function enforceEverywhere() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null && isTargetUrl(tab.url)) {
      chrome.tabs.update(tab.id, { url: lockUrlFor(tab.url) });
    }
  }
}

// content.js hit the limit -> engage the global lock.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "LIMIT_REACHED") {
    chrome.storage.local.set({ locked: true, unlockedUntil: 0 }, enforceEverywhere);
  }
});

// While locked, catch any navigation to a target site (new tabs included).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || (tab && tab.url);
  if (!isTargetUrl(url)) return;
  if (await isLockedNow()) chrome.tabs.update(tabId, { url: lockUrlFor(url) });
});

// Also catch switching to a target tab that was already open during a lock.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!(await isLockedNow())) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isTargetUrl(tab.url)) chrome.tabs.update(tabId, { url: lockUrlFor(tab.url) });
  } catch (e) {}
});
