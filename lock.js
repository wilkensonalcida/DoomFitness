/* ============================================================
   lock.js — the squat gate

   Detection: hip-vs-knee gap measured in SHOULDER-WIDTHS (distance-proof).
   On success it clears the GLOBAL lock flag so the browser-wide block lifts,
   grants a short grace window, and sends you back.
   ============================================================ */

/* ===================== CONFIG ===================== */
const REPS_TO_UNLOCK = 5;
const GRACE_SECONDS  = 45;    // free scrolling time granted after you pay the toll
const CONFIDENCE_MIN = 0.3;   // ignore low-confidence keypoints
const DOWN_GAP = 0.60;        // shoulder-widths: hip dropped near knees => "down"
const UP_GAP   = 0.82;        // hip back up near standing => "up" (rep counts)
const DEBUG    = false;       // set true to print the live gap value in the state label

/* ================= RETURN TARGET ================= */
const params = new URLSearchParams(location.search);
const returnUrl = params.get("return") || "https://www.youtube.com";
let siteName = "your feed";
try {
  const h = new URL(returnUrl).hostname.replace(/^www\./, "");
  if (h.includes("tiktok")) siteName = "TikTok";
  else if (h.includes("instagram")) siteName = "Instagram";
  else if (h.includes("youtube")) siteName = "YouTube";
  else if (h.includes("reddit")) siteName = "Reddit";
  else if (h.includes("twitter") || h === "x.com" || h.endsWith(".x.com")) siteName = "Twitter";
} catch (e) {}
setText("siteName", siteName.toUpperCase());
setText("siteName2", siteName);
["goalText", "goalText2", "goalText3"].forEach((id) => setText(id, REPS_TO_UNLOCK));
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

/* ==================== ELEMENTS ==================== */
const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");
const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const startScreen = document.getElementById("startScreen");
const doneScreen = document.getElementById("doneScreen");
const repCountEl = document.getElementById("repCount");
const stateLabel = document.getElementById("stateLabel");
const centerMsg = document.getElementById("centerMsg");
const ringFg = document.getElementById("ringFg");

const SKELETON = "#7ed957";
const RING_C = 2 * Math.PI * 52; // must match r=52 in the SVG
function setRing(frac) {
  if (ringFg) ringFg.style.strokeDashoffset = RING_C * (1 - Math.min(Math.max(frac, 0), 1));
}

let detector = null, stream = null, rafId = null, busy = false, currentFit = null;
let counting = false;              // becomes true only after the 3-2-1 countdown
let repCount = 0, squatState = "up";

setRing(0);

/* ==================== SIZING ==================== */
function resize() { stage.width = window.innerWidth; stage.height = window.innerHeight; }
window.addEventListener("resize", resize);
resize();

/* ==================== START ==================== */
startBtn.addEventListener("click", startCamera);
async function startCamera() {
  startBtn.disabled = true;
  startBtn.textContent = "Loading…";
  const errEl = document.getElementById("startErr");
  if (errEl) errEl.innerHTML = "";
  try {
    stream = await getCamera();
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
    console.error("[DoomFitness] camera error:", err);
    startBtn.disabled = false;
    startBtn.textContent = "Try Again";
    if (errEl) errEl.innerHTML = describeCamError(err);
    stateLabel.textContent = "camera error: " + (err && err.name ? err.name : err);
  }
}

// Ask for a nice camera first; if that request can't be satisfied, fall back to
// the barest possible one. Permission denials aren't retried (they'd just fail).
async function getCamera() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    if (e && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw e;
  }
}

function describeCamError(err) {
  const name = (err && err.name) ? err.name : "Error";
  const fixes = {
    NotAllowedError:
      "Camera was blocked or the prompt was dismissed. On Windows, open Settings -> Privacy & security -> Camera and turn ON 'Camera access' and 'Let desktop apps access your camera'. Then click the camera icon in the address bar, set it to Allow, and press Try Again.",
    NotReadableError:
      "Another app is using the camera (Zoom, Teams, Meet, OBS, etc.). Close it completely, then press Try Again.",
    NotFoundError:
      "No camera detected. Check it's connected and enabled in Device Manager, then press Try Again.",
    OverconstrainedError:
      "Your camera couldn't match the requested settings. Press Try Again - it will now request any available camera.",
    AbortError:
      "The camera failed to start. Close other camera apps and press Try Again.",
    SecurityError:
      "Camera access was blocked by browser or OS security settings. Check your OS camera privacy settings, then press Try Again.",
  };
  const fix = fixes[name] || "Open DevTools (F12) -> Console and share the red error line.";
  return "<b>" + name + "</b><br>" + fix;
}

/* ================== COUNTDOWN ================== */
// Gives the user a beat to stand up straight, so stepping in mid-crouch doesn't
// register a phantom rep.
function runCountdown() {
  let n = 3;
  counting = false;
  showCount(n, false);
  beep(440);
  const iv = setInterval(() => {
    n--;
    if (n > 0) { showCount(n, false); beep(440); }
    else if (n === 0) { showCount("GO", true); beep(880); }
    else {
      clearInterval(iv);
      centerMsg.innerHTML = "";
      counting = true;
      stateLabel.textContent = "stand tall, then squat";
    }
  }, 800);
}
function showCount(txt, go) {
  centerMsg.innerHTML = '<span class="tick' + (go ? " go" : "") + '">' + txt + "</span>";
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
  ctx.drawImage(video, currentFit.offX, currentFit.offY, currentFit.drawW, currentFit.drawH);

  if (poses.length > 0) {
    const kp = poses[0].keypoints;
    drawSkeleton(kp);
    if (counting) checkSquat(kp);
  } else if (counting) {
    stateLabel.textContent = "step into frame";
  }
}

/* ============ SQUAT (shoulder-width normalized) ============ */
function checkSquat(kp) {
  const hips  = [getPoint(kp, "left_hip"),  getPoint(kp, "right_hip")].filter(Boolean);
  const knees = [getPoint(kp, "left_knee"), getPoint(kp, "right_knee")].filter(Boolean);
  if (!hips.length || !knees.length) { stateLabel.textContent = "can't see hips/knees — step back"; return; }

  const hipY  = hips.reduce((s, p) => s + p.y, 0)  / hips.length;
  const kneeY = knees.reduce((s, p) => s + p.y, 0) / knees.length;

  const lSh = getPoint(kp, "left_shoulder"), rSh = getPoint(kp, "right_shoulder");
  const lHp = getPoint(kp, "left_hip"),      rHp = getPoint(kp, "right_hip");
  let scale;
  if (lSh && rSh)      scale = Math.hypot(lSh.x - rSh.x, lSh.y - rSh.y);
  else if (lHp && rHp) scale = Math.hypot(lHp.x - rHp.x, lHp.y - rHp.y);
  else                 scale = Math.abs(kneeY - hipY);
  if (scale < 1) return;

  const gap = (kneeY - hipY) / scale; // standing ~1.0, deep squat ~0.2
  if (DEBUG) stateLabel.textContent = "gap " + gap.toFixed(2) + " · " + squatState;

  if (gap < DOWN_GAP && squatState === "up") {
    squatState = "down";
    if (!DEBUG) stateLabel.textContent = "down";
  } else if (gap > UP_GAP && squatState === "down") {
    squatState = "up";
    repCount++;
    onRep();
  }
}

function onRep() {
  navigator.vibrate?.(25);
  beep(680);
  repCountEl.textContent = repCount;
  repCountEl.classList.remove("flash"); void repCountEl.offsetWidth; repCountEl.classList.add("flash");
  setRing(repCount / REPS_TO_UNLOCK);
  if (!DEBUG) stateLabel.textContent = repCount + " / " + REPS_TO_UNLOCK;
  if (repCount >= REPS_TO_UNLOCK) finish();
}

/* ============ FINISH → clear the global lock, grant grace, go back ============ */
function finish() {
  counting = false;
  beep(990); setTimeout(() => beep(1245), 140);
  confetti();
  const dm = document.getElementById("doneMsg");
  if (dm) dm.textContent = "Nice. Enjoy " + GRACE_SECONDS + "s before the next check.";
  doneScreen.style.display = "flex";

  const goBack = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    window.location.href = returnUrl;
  };
  const until = Date.now() + GRACE_SECONDS * 1000;

  // Clearing `locked` lifts the browser-wide block; `unlockedUntil` is the grace.
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.set({ locked: false, unlockedUntil: until }, () => setTimeout(goBack, 1500));
  } else {
    setTimeout(goBack, 1500); // allows testing lock.html standalone (file://)
  }
}

/* ================== DRAW SKELETON ================== */
const CONNECTIONS = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];
function drawSkeleton(kp) {
  const byName = {}; kp.forEach((k) => (byName[k.name] = k));
  ctx.strokeStyle = SKELETON; ctx.lineWidth = 4;
  CONNECTIONS.forEach(([a, b]) => {
    const p1 = byName[a], p2 = byName[b];
    if (p1 && p2 && p1.score > CONFIDENCE_MIN && p2.score > CONFIDENCE_MIN) {
      const [x1, y1] = mapPt(p1), [x2, y2] = mapPt(p2);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  });
  ctx.fillStyle = SKELETON;
  kp.forEach((p) => {
    if (p.score > CONFIDENCE_MIN) {
      const [x, y] = mapPt(p);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill();
    }
  });
}

/* ================== SOUND + CONFETTI ================== */
let actx;
function beep(freq) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.14, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.12);
    o.start(); o.stop(actx.currentTime + 0.12);
  } catch (e) {}
}
function confetti() {
  const shades = ["#7ed957", "#a4f04a", "#b6ff6e", "#5bbf3a", "#eafce0"];
  for (let i = 0; i < 70; i++) {
    const s = document.createElement("div");
    s.className = "confetti";
    s.style.left = Math.random() * 100 + "vw";
    s.style.width = (6 + Math.random() * 6) + "px";
    s.style.height = (10 + Math.random() * 10) + "px";
    s.style.background = shades[i % shades.length];
    s.style.animationDuration = (1.6 + Math.random() * 1.6) + "s";
    s.style.animationDelay = (Math.random() * 0.35) + "s";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 3400);
  }
}
