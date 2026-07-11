/* ============================================================
   lock.js — the squat gate (with camera fallback)
   ============================================================ */

const video = document.getElementById("camera");   // ONLY ONE VIDEO ELEMENT NOW
const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");

const startBtn = document.getElementById("startBtn");
const startScreen = document.getElementById("startScreen");
const doneScreen = document.getElementById("doneScreen");
const repCountEl = document.getElementById("repCount");
const stateLabel = document.getElementById("stateLabel");
const progressFill = document.getElementById("progressFill");
const centerMsg = document.getElementById("centerMsg");

/* ===================== CONFIG ===================== */
const REPS_TO_UNLOCK = 5;
const GRACE_SECONDS  = 45;
const CONFIDENCE_MIN = 0.3;
const DOWN_GAP = 0.60;
const UP_GAP   = 0.82;
const DEBUG    = false;

/* ================= RETURN TARGET ================= */
const params = new URLSearchParams(location.search);
const returnUrl = params.get("return") || "https://www.tiktok.com";
let siteName = "your feed";
try {
  const h = new URL(returnUrl).hostname.replace(/^www\./, "");
  if (h.includes("tiktok")) siteName = "TikTok";
  else if (h.includes("instagram")) siteName = "Instagram";
  else if (h.includes("youtube")) siteName = "YouTube";
} catch (e) {}
setText("siteName", siteName.toUpperCase());
setText("siteName2", siteName);
["goalText", "goalText2", "goalText3"].forEach((id) => setText(id, REPS_TO_UNLOCK));
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

/* ==================== STATE ==================== */
let detector = null, stream = null, rafId = null, busy = false, currentFit = null;
let counting = false;
let repCount = 0, squatState = "up";

/* ==================== SIZING ==================== */
function resize() { stage.width = window.innerWidth; stage.height = window.innerHeight; }
window.addEventListener("resize", resize);
resize();

/* ==================== START ==================== */
startBtn.addEventListener("click", startCamera);

async function startCamera() {
  startBtn.disabled = true;
  startBtn.textContent = "Loading…";
  stateLabel.textContent = "requesting camera...";

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera not supported");
    }

    video.playsInline = true;
    video.muted = true;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (err) {
      if (err.name === "OverconstrainedError") {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } else {
        throw err;
      }
    }

    video.srcObject = stream;
    await video.play();
    resize();

    await tf.setBackend("webgl");
    await tf.ready();
    detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
    );

    startScreen.style.display = "none";
    loop();
    runCountdown();

  } catch (err) {
    console.error("Camera error:", err);

    // ⭐ GRACEFUL FALLBACK — NO WHITE SCREEN
    stateLabel.textContent = "Camera unavailable — squat detection disabled";
    startScreen.style.display = "none";

    // Draw a placeholder background
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, stage.width, stage.height);

    // Auto-unlock after a short delay
    setTimeout(() => {
      doneScreen.style.display = "flex";
      document.getElementById("doneMsg").textContent =
        "Camera failed — unlocking your feed…";
      setTimeout(() => window.location.href = returnUrl, 1500);
    }, 2000);
  }
}

/* ================== COUNTDOWN ================== */
function runCountdown() {
  let n = 3;
  counting = false;
  centerMsg.style.opacity = 1;
  centerMsg.textContent = n;
  beep(440);

  const iv = setInterval(() => {
    n--;
    if (n > 0) { centerMsg.textContent = n; beep(440); }
    else if (n === 0) { centerMsg.textContent = "GO!"; beep(880); }
    else {
      clearInterval(iv);
      centerMsg.style.opacity = 0;
      counting = true;
      stateLabel.textContent = "stand tall, then squat";
    }
  }, 800);
}

/* ================== HELPERS ================== */
function getPoint(kp, name) {
  const p = kp.find((k) => k.name === name);
  return (p && p.score >= CONFIDENCE_MIN) ? p : null;
}
function computeFit(vw, vh, cw, ch) {
  const s = Math.min(cw / vw, ch / vh);
  const dW = vw * s, dH = vh * s;
  return { scale: s, drawW: dW, drawH: dH, offX: (cw - dW) / 2, offY: (ch - dH) / 2 };
}
function mapPt(p) { return [currentFit.offX + p.x * currentFit.scale, currentFit.offY + p.y * currentFit.scale]; }

/* ================== MAIN LOOP ================== */
async function loop() {
  rafId = requestAnimationFrame(loop);
  if (!detector || video.readyState < 2) return;
  if (busy) return;
  busy = true;

  let poses = [];
  try { poses = await detector.estimatePoses(video); } catch (e) {}
  busy = false;

  currentFit = computeFit(video.videoWidth, video.videoHeight, stage.width, stage.height);
  ctx.clearRect(0, 0, stage.width, stage.height);
  ctx.drawImage(video, currentFit.offX, currentFit.offY, currentFit.drawW, currentFit
