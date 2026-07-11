chrome.declarativeNetRequest.getEnabledRulesets((ids) => {
  const status = document.getElementById("status");
  status.textContent = ids.includes("blocklist")
    ? "🔒 Locked — go do some squats"
    : "🔓 Unlocked — enjoy your scroll time";
});
