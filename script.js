// Chrome Dino Game — canvas remake in vanilla JavaScript.
//
// The world is simulated in "frames" of a 60 Hz game (like the original),
// scaled by real elapsed time, so it plays the same on any refresh rate.

(() => {
    const { PIXEL, SPRITES, FONT } = window.DinoSprites;

    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const soundToggleBtn = document.getElementById("soundToggleBtn");

    const WIDTH = 600;
    const HEIGHT = 150;
    const GROUND_Y = 127;          // y of the horizon line
    const TREX_X = 50;

    const CFG = {
        speed: 6,
        maxSpeed: 13,
        acceleration: 0.001,
        gravity: 0.6,
        jumpVelocity: -10,
        dropVelocity: -5,
        minJumpHeight: 30,
        maxJumpHeight: 30,
        speedDropFactor: 3,
        scoreCoefficient: 0.025,
        gapCoefficient: 0.6,
        maxObstacleDuplication: 2,
        birdMinSpeed: 8.5,
        birdHeights: [100, 75, 50],
        cloudFrequency: 0.5,
        maxClouds: 6,
        nightEvery: 700,
        nightLength: 250,
        flashFrames: 45,
    };

    // ---------- Storage (safe in private mode) ----------

    const store = {
        get(key) {
            try { return localStorage.getItem(key); } catch { return null; }
        },
        set(key, value) {
            try { localStorage.setItem(key, value); } catch { /* storage disabled */ }
        },
    };

    // ---------- Sound (Web Audio, no files needed) ----------

    let audio = null;
    let muted = store.get("dinoMuted") === "1";

    function beep(frequency, duration, delay = 0) {
        if (muted) return;
        try {
            audio ??= new (window.AudioContext || window.webkitAudioContext)();
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            const start = audio.currentTime + delay;
            osc.type = "square";
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.06, start);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            osc.connect(gain).connect(audio.destination);
            osc.start(start);
            osc.stop(start + duration);
        } catch {
            // Audio not available.
        }
    }

    const sounds = {
        jump: () => beep(620, 0.06),
        score: () => { beep(980, 0.08); beep(1310, 0.12, 0.09); },
        hit: () => { beep(160, 0.12); beep(110, 0.18, 0.1); },
    };

    // ---------- Canvas setup (sharp on high-DPI screens) ----------

    function resize() {
        // Whole-number ratio keeps every game pixel on exact device pixels (no seams).
        const ratio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
        canvas.width = WIDTH * ratio;
        canvas.height = HEIGHT * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.imageSmoothingEnabled = false;
    }
    window.addEventListener("resize", resize);
    resize();

    // ---------- Drawing helpers ----------

    function colors() {
        const dark = document.body.classList.contains("dark-theme");
        const night = game.nightAmount > 0.5;
        const inverted = dark !== night;
        return {
            ink: inverted ? "#f1f1f1" : "#535353",
            faint: inverted ? "#6a6a6a" : "#c9c9c9",
            background: inverted ? "#202124" : "#f7f7f7",
        };
    }

    function drawSprite(s, x, y, color) {
        ctx.fillStyle = color;
        for (let r = 0; r < s.rowsCount; r++) {
            const row = s.grid[r];
            let runStart = -1;
            for (let c = 0; c <= s.cols; c++) {
                if (c < s.cols && row[c]) {
                    if (runStart < 0) runStart = c;
                } else if (runStart >= 0) {
                    ctx.fillRect(Math.round(x) + runStart * PIXEL, Math.round(y) + r * PIXEL, (c - runStart) * PIXEL, PIXEL);
                    runStart = -1;
                }
            }
        }
    }

    function drawText(text, x, y, color, size = 1) {
        ctx.fillStyle = color;
        let cursor = x;
        for (const ch of text) {
            const glyph = FONT[ch] || FONT[" "];
            glyph.forEach((row, r) => {
                for (let c = 0; c < row.length; c++) {
                    if (row[c] === "#") ctx.fillRect(cursor + c * size, y + r * size, size, size);
                }
            });
            cursor += 6 * size;
        }
        return cursor;
    }

    const textWidth = (text, size = 1) => text.length * 6 * size - size;

    // ---------- Pixel-perfect collision ----------

    function collides(a, ax, ay, b, bx, by) {
        const left = Math.max(ax, bx);
        const right = Math.min(ax + a.w, bx + b.w);
        const top = Math.max(ay, by);
        const bottom = Math.min(ay + a.h, by + b.h);
        if (left >= right || top >= bottom) return false;

        for (let y = top; y < bottom; y += PIXEL) {
            for (let x = left; x < right; x += PIXEL) {
                const ac = Math.floor((x - ax) / PIXEL);
                const ar = Math.floor((y - ay) / PIXEL);
                const bc = Math.floor((x - bx) / PIXEL);
                const br = Math.floor((y - by) / PIXEL);
                if (a.grid[ar]?.[ac] && b.grid[br]?.[bc]) return true;
            }
        }
        return false;
    }

    // ---------- Game state ----------

    const game = {
        status: "idle",            // idle | running | crashed
        speed: CFG.speed,
        distance: 0,
        highScore: Number.parseInt(store.get("dinoHighScore"), 10) || 0,
        obstacles: [],
        history: [],
        clouds: [],
        stars: [],
        groundOffset: 0,
        groundBumps: [],
        nightAmount: 0,
        nightUntil: 0,
        nextNightAt: CFG.nightEvery,
        flashTimer: 0,
        lastMilestone: 0,
        blinkTimer: 0,
        crashFrames: 0,
        lastTime: 0,
        paused: false,
    };

    const trex = {
        y: 0,                  // height above the ground
        velocity: 0,
        jumping: false,
        ducking: false,
        speedDrop: false,
        reachedMinHeight: false,
        frameTimer: 0,
        frame: 0,
    };

    const keys = { jump: false, duck: false };

    function score() {
        return Math.floor(game.distance * CFG.scoreCoefficient);
    }

    // ---------- Scenery ----------

    function makeGround() {
        game.groundBumps = [];
        for (let x = 0; x < WIDTH * 2; x += 2 + Math.random() * 18) {
            game.groundBumps.push({ x, y: 2 + Math.floor(Math.random() * 6), w: Math.random() < 0.3 ? 4 : 2, bump: Math.random() < 0.06 });
        }
    }

    function addCloud(x = WIDTH) {
        game.clouds.push({ x, y: 15 + Math.random() * 45, gap: 100 + Math.random() * 300 });
    }

    function placeStars() {
        game.stars = Array.from({ length: 3 }, (_, i) => ({ x: 120 + i * 170 + Math.random() * 60, y: 10 + Math.random() * 60 }));
    }

    // ---------- Obstacles ----------

    function obstacleTypes() {
        return [
            { kind: "cactusSmall", minSpeed: 0, maxGroup: 3, multiSpeed: 4 },
            { kind: "cactusLarge", minSpeed: 0, maxGroup: 3, multiSpeed: 7 },
            { kind: "bird", minSpeed: CFG.birdMinSpeed, maxGroup: 1, multiSpeed: 999 },
        ];
    }

    function spawnObstacle() {
        const types = obstacleTypes().filter((t) => game.speed >= t.minSpeed);
        let type = types[Math.floor(Math.random() * types.length)];

        // Avoid the same obstacle more than twice in a row.
        const recent = game.history.slice(-CFG.maxObstacleDuplication);
        if (recent.length === CFG.maxObstacleDuplication && recent.every((k) => k === type.kind)) {
            type = types.find((t) => t.kind !== type.kind) || type;
        }

        const size = game.speed > type.multiSpeed ? 1 + Math.floor(Math.random() * type.maxGroup) : 1;
        const base = type.kind === "bird" ? SPRITES.birdUp : SPRITES[type.kind];
        const width = base.w * size + (size - 1) * 2;
        const minGap = Math.round(width * game.speed + 120 * CFG.gapCoefficient);
        const gap = minGap + Math.random() * minGap * 0.5;

        const obstacle = {
            kind: type.kind,
            size,
            x: WIDTH,
            y: 0,
            w: width,
            gap,
            speedOffset: 0,
            frame: 0,
            frameTimer: 0,
        };

        if (type.kind === "bird") {
            obstacle.y = CFG.birdHeights[Math.floor(Math.random() * CFG.birdHeights.length)];
            obstacle.speedOffset = Math.random() > 0.5 ? 0.8 : -0.8;
        } else {
            obstacle.y = GROUND_Y - base.h + 2;
        }

        game.obstacles.push(obstacle);
        game.history.push(type.kind);
        if (game.history.length > 5) game.history.shift();
    }

    function obstacleSprite(o) {
        if (o.kind === "bird") return o.frame ? SPRITES.birdDown : SPRITES.birdUp;
        return SPRITES[o.kind];
    }

    // ---------- T-Rex ----------

    function trexSprite() {
        if (game.status === "crashed") return SPRITES.trexCrash;
        if (game.status === "idle") return game.blinkTimer % 240 < 8 ? SPRITES.trexBlink : SPRITES.trexStand;
        if (trex.jumping) return SPRITES.trexStand;
        if (trex.ducking) return trex.frame ? SPRITES.trexDuckB : SPRITES.trexDuckA;
        return trex.frame ? SPRITES.trexRunB : SPRITES.trexRunA;
    }

    function trexTop() {
        return GROUND_Y - trexSprite().h + 2 - trex.y;
    }

    function startJump() {
        if (trex.jumping || trex.ducking) return;
        trex.jumping = true;
        trex.reachedMinHeight = false;
        trex.speedDrop = false;
        trex.velocity = CFG.jumpVelocity - game.speed / 10;
        sounds.jump();
    }

    function endJump() {
        if (trex.jumping && trex.reachedMinHeight && trex.velocity < CFG.dropVelocity) {
            trex.velocity = CFG.dropVelocity;
        }
    }

    function updateTrex(frames) {
        if (trex.jumping) {
            const gravity = CFG.gravity * (trex.speedDrop ? CFG.speedDropFactor : 1);
            trex.y -= trex.velocity * frames;
            trex.velocity += gravity * frames;

            if (trex.y >= CFG.minJumpHeight) trex.reachedMinHeight = true;
            if (trex.y >= CFG.minJumpHeight + CFG.maxJumpHeight + 40) endJump();

            if (trex.y <= 0) {
                trex.y = 0;
                trex.velocity = 0;
                trex.jumping = false;
                trex.speedDrop = false;
                if (keys.duck) trex.ducking = true;
            }
        }

        trex.frameTimer += frames;
        if (trex.frameTimer >= 6) {
            trex.frameTimer = 0;
            trex.frame = 1 - trex.frame;
        }
    }

    // ---------- Game flow ----------

    function reset() {
        game.status = "running";
        game.speed = CFG.speed;
        game.distance = 0;
        game.obstacles = [];
        game.history = [];
        game.nightAmount = 0;
        game.nightUntil = 0;
        game.nextNightAt = CFG.nightEvery;
        game.flashTimer = 0;
        game.lastMilestone = 0;
        game.crashFrames = 0;
        Object.assign(trex, { y: 0, velocity: 0, jumping: false, ducking: false, speedDrop: false });
        game.lastTime = performance.now();
    }

    function crash() {
        game.status = "crashed";
        game.crashFrames = 0;
        sounds.hit();
        if (navigator.vibrate) navigator.vibrate(200);

        if (score() > game.highScore) {
            game.highScore = score();
            store.set("dinoHighScore", String(game.highScore));
        }
    }

    function update(frames) {
        if (game.status === "idle") {
            game.blinkTimer += frames;
            return;
        }

        if (game.status === "crashed") {
            game.crashFrames += frames;
            return;
        }

        game.distance += game.speed * frames;
        if (game.speed < CFG.maxSpeed) game.speed = Math.min(CFG.maxSpeed, game.speed + CFG.acceleration * frames);

        updateTrex(frames);

        // Score milestones flash and beep every 100 points.
        const milestone = Math.floor(score() / 100);
        if (milestone > game.lastMilestone) {
            game.lastMilestone = milestone;
            game.flashTimer = CFG.flashFrames;
            sounds.score();
        }
        game.flashTimer = Math.max(0, game.flashTimer - frames);

        // Night mode for a while every 700 points.
        if (score() >= game.nextNightAt) {
            game.nightUntil = score() + CFG.nightLength;
            game.nextNightAt += CFG.nightEvery;
            placeStars();
        }
        const targetNight = score() < game.nightUntil ? 1 : 0;
        game.nightAmount += Math.sign(targetNight - game.nightAmount) * Math.min(Math.abs(targetNight - game.nightAmount), 0.035 * frames);

        // Ground and clouds.
        game.groundOffset = (game.groundOffset + game.speed * frames) % WIDTH;
        for (const cloud of game.clouds) cloud.x -= game.speed * 0.2 * frames;
        game.clouds = game.clouds.filter((c) => c.x > -SPRITES.cloud.w);
        const lastCloud = game.clouds[game.clouds.length - 1];
        if (game.clouds.length < CFG.maxClouds && (!lastCloud || WIDTH - lastCloud.x > lastCloud.gap) && Math.random() < CFG.cloudFrequency) {
            addCloud();
        }

        // Obstacles.
        for (const o of game.obstacles) {
            o.x -= (game.speed + o.speedOffset) * frames;
            if (o.kind === "bird") {
                o.frameTimer += frames;
                if (o.frameTimer >= 10) {
                    o.frameTimer = 0;
                    o.frame = 1 - o.frame;
                }
            }
        }
        game.obstacles = game.obstacles.filter((o) => o.x + o.w > 0);

        const last = game.obstacles[game.obstacles.length - 1];
        if (game.distance > 300 && (!last || WIDTH - (last.x + last.w) > last.gap)) {
            spawnObstacle();
        }

        // Collision.
        const t = trexSprite();
        const ty = trexTop();
        for (const o of game.obstacles) {
            const s = obstacleSprite(o);
            for (let i = 0; i < o.size; i++) {
                if (collides(t, TREX_X, ty, s, o.x + i * (s.w + 2), o.y)) {
                    crash();
                    return;
                }
            }
        }
    }

    function draw() {
        const c = colors();

        ctx.fillStyle = c.background;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Moon and stars at night.
        if (game.nightAmount > 0) {
            ctx.globalAlpha = game.nightAmount;
            drawSprite(SPRITES.moon, WIDTH - 90, 18, c.ink);
            for (const star of game.stars) drawSprite(SPRITES.star, star.x, star.y, c.ink);
            ctx.globalAlpha = 1;
        }

        for (const cloud of game.clouds) drawSprite(SPRITES.cloud, cloud.x, cloud.y, c.faint);

        // Horizon line with moving bumps and pebbles.
        ctx.fillStyle = c.ink;
        ctx.fillRect(0, GROUND_Y, WIDTH, 1);
        for (const b of game.groundBumps) {
            const x = (b.x - game.groundOffset + WIDTH * 2) % (WIDTH * 2);
            if (x > WIDTH) continue;
            if (b.bump) {
                ctx.fillRect(x, GROUND_Y - 2, 6, 2);
            } else {
                ctx.fillRect(x, GROUND_Y + b.y, b.w, 1);
            }
        }

        for (const o of game.obstacles) {
            const s = obstacleSprite(o);
            for (let i = 0; i < o.size; i++) drawSprite(s, o.x + i * (s.w + 2), o.y, c.ink);
        }

        drawSprite(trexSprite(), TREX_X, trexTop(), c.ink);

        // Score: "HI 00123  00045", flashing on milestones.
        const current = String(score()).padStart(5, "0");
        const high = "HI " + String(game.highScore).padStart(5, "0");
        const showCurrent = game.flashTimer === 0 || Math.floor(game.flashTimer / 8) % 2 === 0;
        const scoreText = game.highScore > 0 ? `${high}  ${current}` : current;
        const x = WIDTH - 10 - textWidth(scoreText, 2);

        if (game.highScore > 0) {
            ctx.globalAlpha = 0.8;
            drawText(high + "  ", x, 8, c.ink, 2);
            ctx.globalAlpha = 1;
        }
        if (game.status !== "idle" && (showCurrent || game.status !== "running")) {
            drawText(current, WIDTH - 10 - textWidth(current, 2), 8, c.ink, 2);
        }

        if (game.status === "crashed") {
            const label = "GAME OVER";
            drawText(label, (WIDTH - textWidth(label, 2)) / 2, 45, c.ink, 2);
            drawSprite(SPRITES.restart, (WIDTH - SPRITES.restart.w) / 2, 72, c.ink);
        }

        document.body.classList.toggle("night", game.nightAmount > 0.5);
    }

    function loop(now) {
        // Convert elapsed time to 60 Hz frames, clamped so a lag spike cannot teleport obstacles.
        const frames = Math.min((now - game.lastTime) / (1000 / 60), 3);
        game.lastTime = now;

        if (!game.paused) {
            update(frames);
            draw();
        }

        requestAnimationFrame(loop);
    }

    // ---------- Input ----------

    function pressJump() {
        if (game.status === "idle") {
            reset();
            startJump();
            return;
        }
        if (game.status === "crashed") {
            // Short delay so a held key does not restart instantly.
            if (game.crashFrames > 20) reset();
            return;
        }
        startJump();
    }

    function pressDuck(down) {
        keys.duck = down;
        if (game.status !== "running") return;

        if (down) {
            if (trex.jumping) {
                trex.speedDrop = true;
                trex.velocity = Math.max(trex.velocity, 1);
            } else {
                trex.ducking = true;
            }
        } else {
            trex.ducking = false;
            trex.speedDrop = false;
        }
    }

    document.addEventListener("keydown", (event) => {
        if (["Space", "ArrowUp", "Enter"].includes(event.code)) {
            event.preventDefault();
            if (!keys.jump && !event.repeat) pressJump();
            keys.jump = true;
        } else if (event.code === "ArrowDown") {
            event.preventDefault();
            pressDuck(true);
        }
    });

    document.addEventListener("keyup", (event) => {
        if (["Space", "ArrowUp", "Enter"].includes(event.code)) {
            keys.jump = false;
            endJump();
        } else if (event.code === "ArrowDown") {
            pressDuck(false);
        }
    });

    // Touch / mouse: tap the top part of the game to jump, hold the bottom quarter to duck.
    canvas.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const relativeY = (event.clientY - rect.top) / rect.height;
        if (game.status === "running" && relativeY > 0.75 && event.pointerType !== "mouse") {
            pressDuck(true);
        } else {
            pressJump();
        }
    });

    window.addEventListener("pointerup", () => {
        endJump();
        if (keys.duck) pressDuck(false);
    });

    // Pause when the tab is hidden.
    document.addEventListener("visibilitychange", () => {
        game.paused = document.hidden;
        game.lastTime = performance.now();
    });

    // ---------- Theme & sound buttons ----------

    function applyTheme(theme) {
        document.body.classList.toggle("dark-theme", theme === "dark");
        document.body.classList.toggle("light-theme", theme !== "dark");
        themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
    }

    themeToggleBtn.addEventListener("click", () => {
        const next = document.body.classList.contains("dark-theme") ? "light" : "dark";
        applyTheme(next);
        store.set("dinoTheme", next);
        themeToggleBtn.blur();
    });

    function applySound() {
        soundToggleBtn.textContent = muted ? "🔇" : "🔊";
    }

    soundToggleBtn.addEventListener("click", () => {
        muted = !muted;
        store.set("dinoMuted", muted ? "1" : "0");
        applySound();
        soundToggleBtn.blur();
    });

    applyTheme(store.get("dinoTheme") === "dark" ? "dark" : "light");
    applySound();

    // ---------- Start ----------

    makeGround();
    addCloud(120);
    addCloud(380);
    placeStars();
    game.lastTime = performance.now();
    requestAnimationFrame(loop);

    // Expose state for automated tests.
    window.__dino = { game, trex, score };
})();
