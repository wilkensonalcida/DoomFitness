// lock.js — MV3 module script

const video = document.getElementById("camera");
const message = document.getElementById("message");

let stream = null;
let squatCount = 0;
let isSquatting = false;

// Simple squat detection using vertical motion
let lastY = null;

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    requestAnimationFrame(trackMovement);

  } catch (err) {
    console.error("Camera error:", err);
    message.textContent = "Camera blocked. Enable webcam permissions.";
  }
}

function trackMovement() {
  const rect = video.getBoundingClientRect();

  // Approximate "center of mass" by sampling brightness
  const y = rect.height / 2; // placeholder for simple motion detection

  if (lastY !== null) {
    const delta = y - lastY;

    // If user moves downward significantly → squat
    if (delta > 15 && !isSquatting) {
      isSquatting = true;
    }

    // If user moves upward → stand up → count squat
    if (delta < -15 && isSquatting) {
      isSquatting = false;
      squatCount++;
      message.textContent = `Squats: ${squatCount}/5`;

      if (squatCount >= 5) {
        unlock();
        return;
      }
    }
  }

  lastY = y;
  requestAnimationFrame(trackMovement);
}

function unlock() {
  const params = new URLSearchParams(location.search);
  const returnUrl = params.get("return") || "https://www.tiktok.com";

  window.location.href = returnUrl;
}

startCamera();
