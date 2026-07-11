/* ============================================================
   lock.js — squat gate (no TensorFlow, MV3-safe)
   ============================================================ */

const video = document.getElementById("camera");
const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");

const startBtn = document.getElementById("startBtn");
const startScreen = document.getElementById("startScreen");
const doneScreen = document.getElementById("doneScreen");
const repCountEl = document.getElementById("repCount");
const stateLabel = document.getElementById("stateLabel");
const progressFill = document.getElementById("progressFill");
const centerMsg = document.getElementById("centerMsg");

const REPS_TO_UNLOCK = 5;
const GRACE_SECONDS = 45;

let repCount = 0;
let counting = false;

/* ================= RETURN TARGET ================= */
const params = new URLSearchParams(location.search);
const returnUrl = params.get("return") || "https://www.tiktok.com";

function resize() {
  stage.width = window.innerWidth;
  stage.height = window.innerHeight;
}
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

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    startScreen.style.display = "none";
    runCountdown();

  } catch (err) {
    console.error("Camera error:", err);

    stateLabel.textContent = "Camera unavailable — squat detection disabled";
    startScreen.style.display = "none";

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, stage.width, stage.height);

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
    if (n > 0) {
      centerMsg.textContent = n;
      beep(440);
    } else if (n === 0) {
      centerMsg.textContent = "GO!";
      beep(880);
    } else {
      clearInterval(iv);
      centerMsg.style.opacity = 0;
      counting = true;
      stateLabel.textContent = "pretend you're squatting 😉";
      fakeSquatLoop();
    }
  }, 800);
}

/* ================== FAKE SQUAT LOOP ================== */
function fakeSquatLoop() {
  let reps = 0;

  const iv = setInterval(() => {
    if (!counting) {
      clearInterval(iv);
      return;
    }

    reps++;
    repCount = reps;

    repCountEl.textContent = repCount;
    progressFill.style.width = (repCount / REPS_TO_UNLOCK) * 100 + "%";

    repCountEl.classList.remove("flash");
    void repCountEl.offsetWidth;
    repCountEl.classList.add("flash");

    beep(680);

    if (repCount >= REPS_TO_UNLOCK) {
      clearInterval(iv);
      finish();
    }
  }, 900);
}

/* ============ FINISH ============ */
function finish() {
  counting = false;

  beep(990);
  setTimeout(() => beep(1245), 140);

  confetti();

  document.getElementById("doneMsg").textContent =
    `Nice. Enjoy ${GRACE_SECONDS}s before the next check…`;

  doneScreen.style.display = "flex";

  const goBack = () => {
    window.location.href = returnUrl;
  };

  const until = Date.now() + GRACE_SECONDS * 1000;

  if (chrome.storage) {
    chrome.storage.local.set({ unlockedUntil: until }, () => {
      setTimeout(goBack, 1400);
    });
  } else {
    setTimeout(goBack, 1400);
  }
}

/* ================== SOUND + CONFETTI ================== */
let actx;
function beep(freq) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(actx.destination);
    g.gain.setValueAtTime(0.14, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.12);
    o.start();
    o.stop(actx.currentTime + 0.12);
  } catch (e) {}
}

function confetti() {
  const bits = ["🎉", "🔥", "💪", "⭐", "🏆"];
  for (let i = 0; i < 50; i++) {
    const s = document.createElement("div");
    s.className = "confetti";
    s.textContent = bits[i % bits.length];
    s.style.left = Math.random() * 100 + "vw";
    s.style.fontSize = 16 + Math.random() * 22 + "px";
    s.style.animationDuration = 1.6 + Math.random() * 1.4 + "s";
    s.style.animationDelay = Math.random() * 0.4 + "s";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 3200);
  }
}
