// Chrome Dino Game — vanilla JavaScript game loop.
//
// The game runs on requestAnimationFrame with delta time, so it plays at the
// same speed on 60 Hz and 120 Hz screens. Positions are kept in JS (not CSS
// animations), which lets the speed increase smoothly without the cactus
// jumping back, and collision uses real bounding boxes on any screen width.

const dino = document.getElementById("dino");
const cactus = document.getElementById("cactus");
const scoreDisplay = document.getElementById("score");
const highScoreDisplay = document.getElementById("high-score");
const gameMessage = document.getElementById("gameMessage");
const gameBoard = document.getElementById("gameBoard");
const themeToggleBtn = document.getElementById("themeToggleBtn");

const CONFIG = {
    startSpeed: 420,      // cactus speed in px/second
    maxSpeed: 900,
    speedStep: 35,        // added every 100 points
    gravity: 2600,        // px/second²
    jumpVelocity: 760,    // initial upward speed in px/second
    pointsPerSecond: 10,
    hitboxInset: 6,       // forgiving collision margin in px
    minGap: 0.9,          // seconds between cacti (minimum)
    maxGap: 1.8,
};

const state = {
    playing: false,
    score: 0,
    highScore: readNumber("dinoHighScore"),
    speed: CONFIG.startSpeed,
    dinoY: 0,             // height above the ground
    dinoVelocity: 0,
    cactusX: 0,
    nextCactusIn: 0,
    lastFrame: 0,
};

// ---------- Storage (safe in private mode) ----------

function readNumber(key) {
    try {
        return Number.parseInt(localStorage.getItem(key), 10) || 0;
    } catch {
        return 0;
    }
}

function save(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage unavailable: the game still works, the value just is not kept.
    }
}

// ---------- Theme ----------

function applyTheme(theme) {
    document.body.classList.toggle("dark-theme", theme === "dark");
    document.body.classList.toggle("light-theme", theme !== "dark");
    themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}

themeToggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = document.body.classList.contains("dark-theme") ? "light" : "dark";
    applyTheme(next);
    save("dinoTheme", next);
});

try {
    applyTheme(localStorage.getItem("dinoTheme") === "dark" ? "dark" : "light");
} catch {
    applyTheme("light");
}

// ---------- Score ----------

const pad = (value) => String(Math.floor(value)).padStart(5, "0");

function renderScore() {
    scoreDisplay.textContent = pad(state.score);
    highScoreDisplay.textContent = "HI " + pad(state.highScore);
}

// ---------- Input ----------
// One pointer handler covers mouse, touch and pen, so a tap is never counted twice.

gameBoard.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handleAction();
});

gameMessage.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleAction();
});

document.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "Enter") {
        event.preventDefault();
        if (!event.repeat) handleAction();
    }
});

function handleAction() {
    if (!state.playing) {
        startGame();
    } else {
        jump();
    }
}

function jump() {
    if (state.dinoY === 0) {
        state.dinoVelocity = CONFIG.jumpVelocity;
    }
}

// ---------- Game loop ----------

function boardWidth() {
    return gameBoard.clientWidth;
}

function randomGap() {
    return CONFIG.minGap + Math.random() * (CONFIG.maxGap - CONFIG.minGap);
}

function startGame() {
    state.playing = true;
    state.score = 0;
    state.speed = CONFIG.startSpeed;
    state.dinoY = 0;
    state.dinoVelocity = 0;
    state.cactusX = boardWidth();
    state.nextCactusIn = 0;
    state.lastFrame = performance.now();

    gameMessage.classList.add("hidden");
    renderScore();
    requestAnimationFrame(frame);
}

function frame(now) {
    if (!state.playing) return;

    // Clamp delta so a background tab does not teleport the cactus.
    const dt = Math.min((now - state.lastFrame) / 1000, 0.05);
    state.lastFrame = now;

    update(dt);
    draw();

    if (collides()) {
        gameOver();
        return;
    }

    requestAnimationFrame(frame);
}

function update(dt) {
    // Score and difficulty.
    const before = Math.floor(state.score / 100);
    state.score += CONFIG.pointsPerSecond * dt * (state.speed / CONFIG.startSpeed);
    if (Math.floor(state.score / 100) > before) {
        state.speed = Math.min(state.speed + CONFIG.speedStep, CONFIG.maxSpeed);
    }

    // Dino physics.
    if (state.dinoY > 0 || state.dinoVelocity > 0) {
        state.dinoVelocity -= CONFIG.gravity * dt;
        state.dinoY = Math.max(0, state.dinoY + state.dinoVelocity * dt);
        if (state.dinoY === 0) state.dinoVelocity = 0;
    }

    // Cactus movement and respawn after a random gap.
    if (state.nextCactusIn > 0) {
        state.nextCactusIn -= dt;
        if (state.nextCactusIn <= 0) state.cactusX = boardWidth();
        return;
    }

    state.cactusX -= state.speed * dt;
    if (state.cactusX < -cactus.offsetWidth) {
        state.nextCactusIn = randomGap();
    }
}

function draw() {
    dino.style.transform = `translateY(${-state.dinoY}px)`;
    cactus.style.transform = `translateX(${state.cactusX}px)`;
    cactus.style.visibility = state.nextCactusIn > 0 ? "hidden" : "visible";
    renderScore();
}

function collides() {
    if (state.nextCactusIn > 0) return false;

    const a = dino.getBoundingClientRect();
    const b = cactus.getBoundingClientRect();
    const inset = CONFIG.hitboxInset;

    return a.left + inset < b.right - inset
        && a.right - inset > b.left + inset
        && a.bottom - inset > b.top + inset;
}

function gameOver() {
    state.playing = false;

    if (state.score > state.highScore) {
        state.highScore = Math.floor(state.score);
        save("dinoHighScore", state.highScore);
    }

    renderScore();
    gameMessage.classList.remove("hidden");
}

// Pause cleanly when the tab is hidden.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.playing) {
        state.lastFrame = performance.now();
    }
});

// Keep the cactus off-screen until the first game starts.
state.cactusX = boardWidth();
draw();
gameMessage.classList.remove("hidden");
