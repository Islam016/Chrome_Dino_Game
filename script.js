const dino = document.getElementById("dino");
const cactus = document.getElementById("cactus");
const scoreDisplay = document.getElementById("score");
const highScoreDisplay = document.getElementById("high-score");
const gameMessage = document.getElementById("gameMessage");
const startBtn = document.getElementById("startBtn");
const gameBoard = document.getElementById("gameBoard");
const themeToggleBtn = document.getElementById("themeToggleBtn");

let score = 0;
let highScore = localStorage.getItem("dinoHighScore") || 0;
updateHighScoreDisplay();

let isPlaying = false;
let scoreInterval;
let checkCollisionInterval;

// Jijjiirraa Theebii (Dark/Light Mode)
themeToggleBtn.addEventListener("click", () => {
    if (document.body.classList.contains("dark-theme")) {
        document.body.classList.replace("dark-theme", "light-theme");
        themeToggleBtn.textContent = "🌙";
        localStorage.setItem("dinoTheme", "light");
    } else {
        document.body.classList.replace("light-theme", "dark-theme");
        themeToggleBtn.textContent = "☀️";
        localStorage.setItem("dinoTheme", "dark");
    }
});

const savedTheme = localStorage.getItem("dinoTheme");
if (savedTheme === "dark") {
    document.body.classList.replace("light-theme", "dark-theme");
    themeToggleBtn.textContent = "☀️";
}

function updateHighScoreDisplay() {
    highScoreDisplay.textContent = "HI " + String(highScore).padStart(5, '0');
}

function updateScoreDisplay() {
    scoreDisplay.textContent = String(score).padStart(5, '0');
}

// To'annoo Qabiyyee (Touch & Keyboard Controls)
document.body.addEventListener("click", (e) => {
    handleAction(e);
});

document.body.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) return;
    handleAction(e);
}, { passive: false });

document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        handleAction(e);
    }
});

function handleAction(e) {
    if (e.target === themeToggleBtn) return;
    
    if (!isPlaying) {
        startGame();
    } else {
        jump();
    }
}

function jump() {
    if (!dino.classList.contains("jump")) {
        dino.classList.add("jump");
        setTimeout(() => {
            dino.classList.remove("jump");
        }, 420);
    }
}

function startGame() {
    if (isPlaying) return;
    
    isPlaying = true;
    score = 0;
    updateScoreDisplay();
    gameMessage.classList.add("hidden");

    cactus.classList.add("moving-cactus");

    scoreInterval = setInterval(() => {
        score++;
        updateScoreDisplay();
    }, 150);

    checkCollisionInterval = setInterval(() => {
        let dinoBottom = parseInt(window.getComputedStyle(dino).getPropertyValue("bottom"));
        let cactusLeft = parseInt(window.getComputedStyle(cactus).getPropertyValue("left"));

        if (cactusLeft > 25 && cactusLeft < 60 && dinoBottom <= 38) {
            gameOver();
        }
    }, 10);
}

function gameOver() {
    isPlaying = false;
    clearInterval(scoreInterval);
    clearInterval(checkCollisionInterval);

    cactus.classList.remove("moving-cactus");

    if (score > highScore) {
        highScore = score;
        localStorage.setItem("dinoHighScore", highScore);
        updateHighScoreDisplay();
    }

    gameMessage.classList.remove("hidden");
}
