const video = document.getElementById("camera");

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;

    // Tell content script to show lock screen
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { type: "SHOW_LOCK" });
    });
  })
  .catch(err => console.error("Camera error:", err));
