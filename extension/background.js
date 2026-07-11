chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "unlock") {
    unlockFor(message.minutes);
  }
});

function unlockFor(minutes) {
  chrome.declarativeNetRequest.updateEnabledRulesets({
    disableRulesetIds: ["blocklist"]
  });
  chrome.alarms.create("relock", { delayInMinutes: minutes });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "relock") {
    chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: ["blocklist"]
    });
  }
});
