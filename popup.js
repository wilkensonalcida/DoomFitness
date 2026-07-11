const video = document.getElementById("camera");

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(err => {
    console.error("Camera error:", err);
  });

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  chrome.tabs.sendMessage(tabs[0].id, {
    type: "CAMERA_READY",
    data: "Camera stream started"
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAMERA_READY") {
    console.log("Popup says:", message.data);
    // You can trigger your fitness logic here
  }
});
