/* ============================================================
   lock.js — randomized squat / jumping-jack gate

   Detection: hip-vs-knee gap measured in SHOULDER-WIDTHS.
   On success it clears the GLOBAL lock flag, grants a short
   grace window, and sends the user back to the blocked site.
   ============================================================ */

/* ===================== CONFIG ===================== */

const REPS_TO_UNLOCK = 5;
const GRACE_SECONDS = 45;
const CONFIDENCE_MIN = 0.3;

const DOWN_GAP = 0.60;
const UP_GAP = 0.82;

const DEBUG = false;

// Pick one exercise every time the lock screen opens.
const EXERCISE_TYPE =
  Math.random() < 0.5
    ? "squat"
    : "jumping_jack";

const EXERCISE_NAME =
  EXERCISE_TYPE === "jumping_jack"
    ? "jumping jacks"
    : "squats";

// Jumping-jack settings
const ARMS_UP_MARGIN = 15;
const LEG_SPREAD_RATIO = 1.35;

/* ================= RETURN TARGET ================= */

const params =
  new URLSearchParams(location.search);

const returnUrl =
  params.get("return") ||
  "https://www.youtube.com";

let siteName = "your feed";

try {
  const hostname =
    new URL(returnUrl)
      .hostname
      .replace(/^www\./, "");

  if (hostname.includes("tiktok")) {
    siteName = "TikTok";
  } else if (hostname.includes("instagram")) {
    siteName = "Instagram";
  } else if (hostname.includes("youtube")) {
    siteName = "YouTube";
  } else if (hostname.includes("reddit")) {
    siteName = "Reddit";
  } else if (
    hostname.includes("twitter") ||
    hostname === "x.com" ||
    hostname.endsWith(".x.com")
  ) {
    siteName = "Twitter";
  }
} catch (error) {
  console.error(
    "Could not determine the website:",
    error
  );
}

setText(
  "siteName",
  siteName.toUpperCase()
);

setText(
  "siteName2",
  siteName
);

[
  "goalText",
  "goalText2",
  "goalText3"
].forEach((id) => {
  setText(
    id,
    REPS_TO_UNLOCK
  );
});

setText(
  "exerciseName",
  EXERCISE_NAME
);

setText(
  "exerciseName2",
  EXERCISE_NAME
);

const exerciseHelp =
  document.getElementById(
    "exerciseHelp"
  );

if (exerciseHelp) {
  exerciseHelp.textContent =
    EXERCISE_TYPE ===
    "jumping_jack"
      ? "Stand far enough back for your full arms and legs to stay in frame."
      : "Stand back so your hips and knees are in frame.";
}

function setText(id, value) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

/* ==================== ELEMENTS ==================== */

const stage =
  document.getElementById("stage");

const ctx =
  stage.getContext("2d");

const video =
  document.getElementById("video");

const startBtn =
  document.getElementById("startBtn");

const startScreen =
  document.getElementById(
    "startScreen"
  );

const doneScreen =
  document.getElementById(
    "doneScreen"
  );

const repCountEl =
  document.getElementById(
    "repCount"
  );

const stateLabel =
  document.getElementById(
    "stateLabel"
  );

const centerMsg =
  document.getElementById(
    "centerMsg"
  );

const ringFg =
  document.getElementById(
    "ringFg"
  );

/* ==================== DISPLAY ==================== */

const SKELETON = "#7ed957";

const RING_C =
  2 * Math.PI * 52;

function setRing(fraction) {
  if (!ringFg) {
    return;
  }

  const safeFraction =
    Math.min(
      Math.max(
        fraction,
        0
      ),
      1
    );

  ringFg.style.strokeDashoffset =
    RING_C *
    (1 - safeFraction);
}

/* ==================== STATE ==================== */

let detector = null;
let stream = null;
let rafId = null;
let busy = false;
let currentFit = null;

let counting = false;
let repCount = 0;

let squatState = "up";
let jackState = "closed";

setRing(0);

/* ==================== SIZING ==================== */

function resize() {
  stage.width =
    window.innerWidth;

  stage.height =
    window.innerHeight;
}

window.addEventListener(
  "resize",
  resize
);

resize();

/* ==================== START ==================== */

startBtn.addEventListener(
  "click",
  startCamera
);

async function startCamera() {
  startBtn.disabled = true;
  startBtn.textContent =
    "Loading…";

  const errorElement =
    document.getElementById(
      "startErr"
    );

  if (errorElement) {
    errorElement.innerHTML = "";
  }

  try {
    stream =
      await getCamera();

    video.srcObject =
      stream;

    await video.play();

    resize();

    await tf.setBackend(
      "webgl"
    );

    await tf.ready();

    detector =
      await poseDetection
        .createDetector(
          poseDetection
            .SupportedModels
            .MoveNet,
          {
            modelType:
              poseDetection
                .movenet
                .modelType
                .SINGLEPOSE_LIGHTNING
          }
        );

    startScreen.style.display =
      "none";

    loop();
    runCountdown();
  } catch (error) {
    console.error(
      "[DoomFitness] camera error:",
      error
    );

    startBtn.disabled = false;
    startBtn.textContent =
      "Try Again";

    if (errorElement) {
      errorElement.innerHTML =
        describeCamError(
          error
        );
    }

    stateLabel.textContent =
      "camera error: " +
      (
        error &&
        error.name
          ? error.name
          : error
      );
  }
}

/* ==================== CAMERA ==================== */

async function getCamera() {
  try {
    return await navigator
      .mediaDevices
      .getUserMedia({
        video: {
          facingMode: "user",

          width: {
            ideal: 1280
          },

          height: {
            ideal: 720
          }
        },

        audio: false
      });
  } catch (error) {
    if (
      error &&
      (
        error.name ===
          "OverconstrainedError" ||
        error.name ===
          "NotFoundError"
      )
    ) {
      return await navigator
        .mediaDevices
        .getUserMedia({
          video: true,
          audio: false
        });
    }

    throw error;
  }
}

function describeCamError(error) {
  const name =
    error &&
    error.name
      ? error.name
      : "Error";

  const fixes = {
    NotAllowedError:
      "Camera was blocked or the prompt was dismissed. Open Windows Settings, then Privacy & security, then Camera. Turn on Camera access and Let desktop apps access your camera. Then allow the camera in Chrome and press Try Again.",

    NotReadableError:
      "Another app may be using the camera. Close Zoom, Teams, Meet, OBS, or any other camera app, then press Try Again.",

    NotFoundError:
      "No camera was detected. Check that your camera is connected and enabled, then press Try Again.",

    OverconstrainedError:
      "Your camera could not match the requested settings. Press Try Again to use any available camera.",

    AbortError:
      "The camera failed to start. Close other camera apps and press Try Again.",

    SecurityError:
      "Camera access was blocked by browser or system security settings. Check your camera privacy settings and try again."
  };

  const fix =
    fixes[name] ||
    "Open DevTools with F12, open the Console, and check the red error message.";

  return (
    "<b>" +
    name +
    "</b><br>" +
    fix
  );
}

/* ================== COUNTDOWN ================== */

function runCountdown() {
  let number = 3;

  counting = false;

  showCount(
    number,
    false
  );

  beep(440);

  const interval =
    setInterval(() => {
      number--;

      if (number > 0) {
        showCount(
          number,
          false
        );

        beep(440);
      } else if (
        number === 0
      ) {
        showCount(
          "GO",
          true
        );

        beep(880);
      } else {
        clearInterval(
          interval
        );

        centerMsg.innerHTML = "";

        counting = true;

        stateLabel.textContent =
          EXERCISE_TYPE ===
          "jumping_jack"
            ? "stand closed, then jump open"
            : "stand tall, then squat";
      }
    }, 800);
}

function showCount(
  text,
  go
) {
  centerMsg.innerHTML =
    '<span class="tick' +
    (
      go
        ? " go"
        : ""
    ) +
    '">' +
    text +
    "</span>";
}

/* ================== HELPERS ================== */

function getPoint(
  keypoints,
  name
) {
  const point =
    keypoints.find(
      (keypoint) =>
        keypoint.name === name
    );

  if (
    point &&
    point.score >=
      CONFIDENCE_MIN
  ) {
    return point;
  }

  return null;
}

function computeFit(
  videoWidth,
  videoHeight,
  canvasWidth,
  canvasHeight
) {
  const scale =
    Math.min(
      canvasWidth /
        videoWidth,

      canvasHeight /
        videoHeight
    );

  const drawWidth =
    videoWidth * scale;

  const drawHeight =
    videoHeight * scale;

  return {
    scale: scale,

    drawW:
      drawWidth,

    drawH:
      drawHeight,

    offX:
      (
        canvasWidth -
        drawWidth
      ) / 2,

    offY:
      (
        canvasHeight -
        drawHeight
      ) / 2
  };
}

function mapPt(point) {
  return [
    currentFit.offX +
      point.x *
        currentFit.scale,

    currentFit.offY +
      point.y *
        currentFit.scale
  ];
}

/* ================== MAIN LOOP ================== */

async function loop() {
  rafId =
    requestAnimationFrame(
      loop
    );

  if (
    !detector ||
    video.readyState < 2
  ) {
    return;
  }

  if (busy) {
    return;
  }

  busy = true;

  let poses = [];

  try {
    poses =
      await detector
        .estimatePoses(
          video
        );
  } catch (error) {
    console.error(
      "Pose detection error:",
      error
    );
  }

  busy = false;

  currentFit =
    computeFit(
      video.videoWidth,
      video.videoHeight,
      stage.width,
      stage.height
    );

  ctx.clearRect(
    0,
    0,
    stage.width,
    stage.height
  );

  ctx.drawImage(
    video,
    currentFit.offX,
    currentFit.offY,
    currentFit.drawW,
    currentFit.drawH
  );

  if (poses.length > 0) {
    const keypoints =
      poses[0].keypoints;

    drawSkeleton(
      keypoints
    );

    if (counting) {
      if (
        EXERCISE_TYPE ===
        "jumping_jack"
      ) {
        checkJumpingJack(
          keypoints
        );
      } else {
        checkSquat(
          keypoints
        );
      }
    }
  } else if (counting) {
    stateLabel.textContent =
      "step into frame";
  }
}

/* ==================== SQUAT ==================== */

function checkSquat(
  keypoints
) {
  const hips = [
    getPoint(
      keypoints,
      "left_hip"
    ),

    getPoint(
      keypoints,
      "right_hip"
    )
  ].filter(Boolean);

  const knees = [
    getPoint(
      keypoints,
      "left_knee"
    ),

    getPoint(
      keypoints,
      "right_knee"
    )
  ].filter(Boolean);

  if (
    hips.length === 0 ||
    knees.length === 0
  ) {
    stateLabel.textContent =
      "can't see hips/knees — step back";

    return;
  }

  const hipY =
    hips.reduce(
      (
        total,
        point
      ) =>
        total + point.y,
      0
    ) / hips.length;

  const kneeY =
    knees.reduce(
      (
        total,
        point
      ) =>
        total + point.y,
      0
    ) / knees.length;

  const leftShoulder =
    getPoint(
      keypoints,
      "left_shoulder"
    );

  const rightShoulder =
    getPoint(
      keypoints,
      "right_shoulder"
    );

  const leftHip =
    getPoint(
      keypoints,
      "left_hip"
    );

  const rightHip =
    getPoint(
      keypoints,
      "right_hip"
    );

  let scale;

  if (
    leftShoulder &&
    rightShoulder
  ) {
    scale =
      Math.hypot(
        leftShoulder.x -
          rightShoulder.x,

        leftShoulder.y -
          rightShoulder.y
      );
  } else if (
    leftHip &&
    rightHip
  ) {
    scale =
      Math.hypot(
        leftHip.x -
          rightHip.x,

        leftHip.y -
          rightHip.y
      );
  } else {
    scale =
      Math.abs(
        kneeY -
        hipY
      );
  }

  if (scale < 1) {
    return;
  }

  const gap =
    (
      kneeY -
      hipY
    ) / scale;

  if (DEBUG) {
    stateLabel.textContent =
      "gap " +
      gap.toFixed(2) +
      " · " +
      squatState;
  }

  if (
    gap < DOWN_GAP &&
    squatState === "up"
  ) {
    squatState = "down";

    if (!DEBUG) {
      stateLabel.textContent =
        "down";
    }
  } else if (
    gap > UP_GAP &&
    squatState === "down"
  ) {
    squatState = "up";

    repCount++;

    onRep();
  }
}

/* ================= JUMPING JACK ================= */

function checkJumpingJack(
  keypoints
) {
  const leftWrist =
    getPoint(
      keypoints,
      "left_wrist"
    );

  const rightWrist =
    getPoint(
      keypoints,
      "right_wrist"
    );

  const leftShoulder =
    getPoint(
      keypoints,
      "left_shoulder"
    );

  const rightShoulder =
    getPoint(
      keypoints,
      "right_shoulder"
    );

  const leftAnkle =
    getPoint(
      keypoints,
      "left_ankle"
    );

  const rightAnkle =
    getPoint(
      keypoints,
      "right_ankle"
    );

  if (
    !leftWrist ||
    !rightWrist ||
    !leftShoulder ||
    !rightShoulder ||
    !leftAnkle ||
    !rightAnkle
  ) {
    stateLabel.textContent =
      "can't see full body — step back";

    return;
  }

  const armsUp =
    leftWrist.y <
      leftShoulder.y -
        ARMS_UP_MARGIN &&

    rightWrist.y <
      rightShoulder.y -
        ARMS_UP_MARGIN;

  const shoulderWidth =
    Math.abs(
      leftShoulder.x -
        rightShoulder.x
    );

  const ankleWidth =
    Math.abs(
      leftAnkle.x -
        rightAnkle.x
    );

  if (
    shoulderWidth < 1
  ) {
    return;
  }

  const legsSpread =
    ankleWidth >
    shoulderWidth *
      LEG_SPREAD_RATIO;

  const isOpen =
    armsUp &&
    legsSpread;

  if (DEBUG) {
    stateLabel.textContent =
      "arms " +
      (
        armsUp
          ? "up"
          : "down"
      ) +
      " · legs " +
      (
        legsSpread
          ? "open"
          : "closed"
      ) +
      " · " +
      jackState;
  }

  if (
    isOpen &&
    jackState === "closed"
  ) {
    jackState = "open";

    if (!DEBUG) {
      stateLabel.textContent =
        "open";
    }
  } else if (
    !isOpen &&
    jackState === "open"
  ) {
    jackState = "closed";

    repCount++;

    onRep();
  }
}

/* ==================== REP ==================== */

function onRep() {
  navigator.vibrate?.(25);

  beep(680);

  repCountEl.textContent =
    repCount;

  repCountEl.classList.remove(
    "flash"
  );

  void repCountEl.offsetWidth;

  repCountEl.classList.add(
    "flash"
  );

  setRing(
    repCount /
      REPS_TO_UNLOCK
  );

  if (!DEBUG) {
    stateLabel.textContent =
      repCount +
      " / " +
      REPS_TO_UNLOCK;
  }

  if (
    repCount >=
    REPS_TO_UNLOCK
  ) {
    finish();
  }
}

/* ==================== FINISH ==================== */

function finish() {
  counting = false;

  beep(990);

  setTimeout(() => {
    beep(1245);
  }, 140);

  confetti();

  const doneMessage =
    document.getElementById(
      "doneMsg"
    );

  if (doneMessage) {
    doneMessage.textContent =
      "Nice. Enjoy " +
      GRACE_SECONDS +
      "s before the next check.";
  }

  doneScreen.style.display =
    "flex";

  const goBack = () => {
    if (stream) {
      stream
        .getTracks()
        .forEach(
          (track) =>
            track.stop()
        );
    }

    window.location.href =
      returnUrl;
  };

  const unlockedUntil =
    Date.now() +
    GRACE_SECONDS * 1000;

  if (
    typeof chrome !==
      "undefined" &&
    chrome.storage
  ) {
    chrome.storage.local.set(
      {
        locked: false,
        unlockedUntil:
          unlockedUntil
      },
      () => {
        setTimeout(
          goBack,
          1500
        );
      }
    );
  } else {
    setTimeout(
      goBack,
      1500
    );
  }
}

/* ================= DRAW SKELETON ================= */

const CONNECTIONS = [
  [
    "left_shoulder",
    "right_shoulder"
  ],

  [
    "left_shoulder",
    "left_elbow"
  ],

  [
    "left_elbow",
    "left_wrist"
  ],

  [
    "right_shoulder",
    "right_elbow"
  ],

  [
    "right_elbow",
    "right_wrist"
  ],

  [
    "left_shoulder",
    "left_hip"
  ],

  [
    "right_shoulder",
    "right_hip"
  ],

  [
    "left_hip",
    "right_hip"
  ],

  [
    "left_hip",
    "left_knee"
  ],

  [
    "left_knee",
    "left_ankle"
  ],

  [
    "right_hip",
    "right_knee"
  ],

  [
    "right_knee",
    "right_ankle"
  ]
];

function drawSkeleton(
  keypoints
) {
  const byName = {};

  keypoints.forEach(
    (keypoint) => {
      byName[
        keypoint.name
      ] = keypoint;
    }
  );

  ctx.strokeStyle =
    SKELETON;

  ctx.lineWidth = 4;

  CONNECTIONS.forEach(
    (
      [
        firstName,
        secondName
      ]
    ) => {
      const firstPoint =
        byName[firstName];

      const secondPoint =
        byName[secondName];

      if (
        firstPoint &&
        secondPoint &&
        firstPoint.score >
          CONFIDENCE_MIN &&
        secondPoint.score >
          CONFIDENCE_MIN
      ) {
        const [
          x1,
          y1
        ] =
          mapPt(
            firstPoint
          );

        const [
          x2,
          y2
        ] =
          mapPt(
            secondPoint
          );

        ctx.beginPath();
        ctx.moveTo(
          x1,
          y1
        );

        ctx.lineTo(
          x2,
          y2
        );

        ctx.stroke();
      }
    }
  );

  ctx.fillStyle =
    SKELETON;

  keypoints.forEach(
    (point) => {
      if (
        point.score >
        CONFIDENCE_MIN
      ) {
        const [
          x,
          y
        ] =
          mapPt(
            point
          );

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          5,
          0,
          2 * Math.PI
        );

        ctx.fill();
      }
    }
  );
}

/* ================= SOUND ================= */

let audioContext;

function beep(
  frequency
) {
  try {
    audioContext =
      audioContext ||
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    const oscillator =
      audioContext
        .createOscillator();

    const gain =
      audioContext
        .createGain();

    oscillator.type =
      "sine";

    oscillator.frequency.value =
      frequency;

    oscillator.connect(
      gain
    );

    gain.connect(
      audioContext.destination
    );

    gain.gain.setValueAtTime(
      0.14,
      audioContext.currentTime
    );

    gain.gain
      .exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime +
          0.12
      );

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime +
        0.12
    );
  } catch (error) {
    console.error(
      "Sound error:",
      error
    );
  }
}

/* ================= CONFETTI ================= */

function confetti() {
  const shades = [
    "#7ed957",
    "#a4f04a",
    "#b6ff6e",
    "#5bbf3a",
    "#eafce0"
  ];

  for (
    let index = 0;
    index < 70;
    index++
  ) {
    const piece =
      document.createElement(
        "div"
      );

    piece.className =
      "confetti";

    piece.style.left =
      Math.random() *
        100 +
      "vw";

    piece.style.width =
      6 +
      Math.random() *
        6 +
      "px";

    piece.style.height =
      10 +
      Math.random() *
        10 +
      "px";

    piece.style.background =
      shades[
        index %
        shades.length
      ];

    piece.style.animationDuration =
      1.6 +
      Math.random() *
        1.6 +
      "s";

    piece.style.animationDelay =
      Math.random() *
        0.35 +
      "s";

    document.body.appendChild(
      piece
    );

    setTimeout(() => {
      piece.remove();
    }, 3400);
  }
}
