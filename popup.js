<video id="camera" autoplay playsinline></video>

const video = document.getElementById("camera");

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(err => {
    console.error("Camera error:", err);
  });
