const dino = document.getElementById("dino");
const cactus = document.getElementById("cactus");
const scoreDisplay = document.getElementById("score");
const highScoreDisplay = document.getElementById("high-score");
const gameMessage = document.getElementById("gameMessage");
const startBtn = document.getElementById("startBtn");

let score = 0;
let highScore = localStorage.getItem("dinoHighScore") || 0;
highScoreDisplay.textContent = highScore;

let isPlaying = false;
let scoreInterval;
let checkCollisionInterval;

// زر البدء
startBtn.addEventListener("click", startGame);

// التحكم بزر المسافة أو النقر
document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        e.preventDefault();
        if (!isPlaying) {
            startGame();
        } else {
            jump();
        }
    }
});

gameBoard.addEventListener("click", () => {
    if (isPlaying) jump();
});

function jump() {
    if (!dino.classList.contains("jump")) {
        dino.classList.add("jump");
        setTimeout(() => {
            dino.classList.remove("jump");
        }, 600);
    }
}

function startGame() {
    if (isPlaying) return;
    
    isPlaying = true;
    score = 0;
    scoreDisplay.textContent = score;
    gameMessage.classList.add("hidden");

    // تشغيل حركة العائق
    cactus.classList.add("moving-cactus");

    // عداد النقاط
    scoreInterval = setInterval(() => {
        score++;
        scoreDisplay.textContent = score;
    }, 200);

    // فحص التصادم باستمرار
    checkCollisionInterval = setInterval(() => {
        let dinoBottom = parseInt(window.getComputedStyle(dino).getPropertyValue("bottom"));
        let cactusLeft = parseInt(window.getComputedStyle(cactus).getPropertyValue("left"));

        // شروط الاصطدام
        if (cactusLeft > 25 && cactusLeft < 60 && dinoBottom <= 35) {
            gameOver();
        }
    }, 10);
}

function gameOver() {
    isPlaying = false;
    clearInterval(scoreInterval);
    clearInterval(checkCollisionInterval);

    cactus.classList.remove("moving-cactus");

    // تحديث أعلى نتيجة
    if (score > highScore) {
        highScore = score;
        localStorage.setItem("dinoHighScore", highScore);
        highScoreDisplay.textContent = highScore;
    }

    // إظهار رسالة الخسارة
    gameMessage.querySelector("h2").textContent = "انتهت اللعبة!";
    gameMessage.querySelector("p").textContent = `جيبت ${score} نقطة. اضغط لإعادة المحاولة`;
    startBtn.textContent = "العب مرة أخرى";
    gameMessage.classList.remove("hidden");
}
