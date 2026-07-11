const REPS_TO_UNLOCK = 5;
const CONFIDENCE_MIN = 0.3;
const SQUAT_MARGIN = 25;

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startBtn");
const stateLabel = document.getElementById("stateLabel");

let detector = null;
let rafId = null;
let stream = null;
let repCount = 0;
let squatState = "up";

startBtn.addEventListener("click", startCamera);

async function startCamera() {
  startBtn.disabled = true;
  startBtn.textContent = "Loading...";
  stateLabel.textContent = "requesting camera...";

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    stateLabel.textContent = "loading pose model...";
    await tf.setBackend("webgl");
    await tf.ready();
    detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
    );

    startBtn.style.display = "none";
    stateLabel.textContent = "get your hips + knees in frame";
    detectLoop();
  } catch (err) {
    stateLabel.textContent = "camera error: " + err.message;
    startBtn.disabled = false;
    startBtn.textContent = "Try Again";
  }
}

async function detectLoop() {
  const poses = await detector.estimatePoses(video);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (poses.length > 0) {
    const kp = poses[0].keypoints;
    drawSkeleton(kp);
    checkSquat(kp);
  } else {
    stateLabel.textContent = "no person detected";
  }

  rafId = requestAnimationFrame(detectLoop);
}

function getPoint(keypoints, name) {
  const pt = keypoints.find((k) => k.name === name);
  if (!pt || pt.score < CONFIDENCE_MIN) return null;
  return pt;
}

function checkSquat(keypoints) {
  const lHip = getPoint(keypoints, "left_hip");
  const rHip = getPoint(keypoints, "right_hip");
  const lKnee = getPoint(keypoints, "left_knee");
  const rKnee = getPoint(keypoints, "right_knee");

  const hips = [lHip, rHip].filter(Boolean);
  const knees = [lKnee, rKnee].filter(Boolean);

  if (hips.length === 0 || knees.length === 0) {
    stateLabel.textContent = "can't see hips/knees — step back";
    return;
  }

  const hipY = hips.reduce((s, p) => s + p.y, 0) / hips.length;
  const kneeY = knees.reduce((s, p) => s + p.y, 0) / knees.length;

  if (hipY > kneeY - SQUAT_MARGIN && squatState === "up") {
    squatState = "down";
    stateLabel.textContent = "down ↓";
  } else if (hipY < kneeY - SQUAT_MARGIN - 40 && squatState === "down") {
    squatState = "up";
    stateLabel.textContent = "up ↑ — rep counted!";
    repCount++;
    document.getElementById("repCount").textContent = repCount;
    if (repCount >= REPS_TO_UNLOCK) {
      setTimeout(finishUnlock, 400);
    }
  }
}

function finishUnlock() {
  if (rafId) cancelAnimationFrame(rafId);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  chrome.runtime.sendMessage({ action: "unlock", minutes: 5 }, () => {
    history.back(); // send them back to the site they were trying to visit
  });
}

const CONNECTIONS = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];

function drawSkeleton(keypoints) {
  const byName = {};
  keypoints.forEach((k) => (byName[k.name] = k));

  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 3;
  CONNECTIONS.forEach(([a, b]) => {
    const p1 = byName[a], p2 = byName[b];
    if (p1 && p2 && p1.score > CONFIDENCE_MIN && p2.score > CONFIDENCE_MIN) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  });

  ctx.fillStyle = "#4ade80";
  keypoints.forEach((p) => {
    if
