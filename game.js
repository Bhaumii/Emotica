// game.js — Emotica Now
// Core game loop, input handling, spawning, difficulty, and reporting.

let sessionData = [];
let highScore   = parseInt(localStorage.getItem('emotica_highscore') || '0');
let dataConsent = localStorage.getItem('emotica_consent'); // 'yes', 'no', or null on first visit

// Screen elements
const introScreen    = document.getElementById('intro-screen');
const gameScreen     = document.getElementById('game-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const reportScreen   = document.getElementById('report-screen');
const consentOverlay = document.getElementById('consent-overlay');

// Show consent popup on first visit
if (dataConsent === null) {
    consentOverlay.style.display = 'flex';
}
document.getElementById('consent-yes').addEventListener('click', () => {
    localStorage.setItem('emotica_consent', 'yes');
    dataConsent = 'yes';
    consentOverlay.style.display = 'none';
});
document.getElementById('consent-no').addEventListener('click', () => {
    localStorage.setItem('emotica_consent', 'no');
    dataConsent = 'no';
    consentOverlay.style.display = 'none';
});

// Button wiring
document.getElementById('start-btn').addEventListener('click', handleStartClick);
document.getElementById('report-btn').addEventListener('click', showReport);
document.getElementById('restart-btn').addEventListener('click', () => location.reload());
document.getElementById('play-again-from-report').addEventListener('click', () => location.reload());

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// We measure the canvas AFTER the game screen is visible, otherwise we'd get 0x0.
function resizeCanvas() {
    const rect  = canvas.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
}
window.addEventListener('resize', () => {
    resizeCanvas();
    player.x = Math.min(player.x, canvas.width  - player.w / 2);
    player.y = Math.min(player.y, canvas.height - player.h / 2);
});

// Sprite images
const playerImg = new Image(); playerImg.src = 'assets/player.png';
const ticketImg = new Image(); ticketImg.src = 'assets/ticket.png';
const goblinImg = new Image(); goblinImg.src = 'assets/enemy_goblin.png';
const scoutImg  = new Image(); scoutImg.src  = 'assets/enemy_scout.png';
const golemImg  = new Image(); golemImg.src  = 'assets/enemy_golem.png';
const hpackImg  = new Image(); hpackImg.src  = 'assets/healthpack.png';
const bgImg     = new Image(); bgImg.src     = 'assets/background.png';

// Game state 
let score, health, gameRunning, startTime, gameLoopId;
let ticketTimer, enemyTimer, logTimer, hpackTimer;
let elapsedSeconds, lastBonusAt, spawnsPaused, gamePaused;
let ragebaitActive = false;

// Player object
const player = { x: 400, y: 300, w: 75, h: 70, speed: 5 };

// Entity pools
let tickets = [], enemies = [], hpacks = [], particles = [];

// Keyboard state 
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
    if (e.key === ' ' && gameRunning) togglePause();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

let enemySpeedBase = 1.2;


// Camera Prompt

function handleStartClick() {
    const prompt = document.getElementById('camera-prompt');

    if (window.cameraIsOn) {
        startGame();
        return;
    }

    prompt.style.display = 'flex';

    document.getElementById('prompt-enable').onclick = function() {
        prompt.style.display = 'none';
        toggleCamera();
        setTimeout(startGame, 300); // give the camera a moment to start up
    };

    document.getElementById('prompt-skip').onclick = function() {
        prompt.style.display = 'none';
        startGame();
    };
    }


// Pause

function togglePause() {
    gamePaused = !gamePaused;
    const ps = document.getElementById('pause-screen');

    if (gamePaused) {
        ps.style.display = 'flex';
        document.getElementById('pause-mood').textContent = window.currentMood;
        cancelAnimationFrame(gameLoopId);
    } else {
        ps.style.display = 'none';
        gameLoopId = requestAnimationFrame(gameLoop);
    }
}

// Called by the hand gesture system in emotion.js
window.triggerPalmPause = function() {
    if (gameRunning) togglePause();
};


// Start Game

function startGame() {
    introScreen.style.display    = 'none';
    gameScreen.style.display     = 'flex';
    gameoverScreen.style.display = 'none';
    reportScreen.style.display   = 'none';
    document.getElementById('settings-icon').style.display = 'none';

    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            resizeCanvas();

            score          = 0;
            health         = 100;
            gameRunning    = true;
            gamePaused     = false;
            elapsedSeconds = 0;
            lastBonusAt    = 0;
            spawnsPaused   = false;
            ragebaitActive = false;
            sessionData    = [];
            tickets        = [];
            enemies        = [];
            hpacks         = [];
            particles      = [];

            player.x  = canvas.width  / 2;
            player.y  = canvas.height / 2;
            startTime = Date.now();

            logTimer   = setInterval(logSession, 2000);
            hpackTimer = setInterval(maybeSpawnHealthPack, 8000);

            scheduleEnemy();
            scheduleTicket();
            gameLoopId = requestAnimationFrame(gameLoop);
        });
    });
}


// Spawners

function scheduleEnemy() {
    if (!gameRunning) return;

    const delayByMood = {
    'Bored':      900,
    'Engaged':    1800,
    'Surprised':  2200,
    'Frustrated': 3500,
    };

    const delay = delayByMood[window.currentMood] || 2000;

    enemyTimer = setTimeout(function() {
    spawnEnemy();
    scheduleEnemy();
    }, delay);
}

function scheduleTicket() {
    if (!gameRunning) return;

  // Frustrated
    const delayByMood = {
    'Frustrated': 600,
    'Bored':      1200,
    'Engaged':    2000,
    'Surprised':  2500,
    };

    const delay = delayByMood[window.currentMood] || 2000;

    ticketTimer = setTimeout(function() {
    spawnTicket();
    scheduleTicket();
    }, delay);
}


// Game Loop

function gameLoop() {
    if (!gameRunning || gamePaused) return;
    elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    applyDifficulty();
    update();
    draw();
    updateHUD();
    gameLoopId = requestAnimationFrame(gameLoop);
}


// Update

function update() {
    movePlayer();
    moveEnemies();
    moveParticles();
    checkTicketCollisions();
    checkEnemyCollisions();
    checkHpackCollisions();
    checkScoreBonus();
}

function movePlayer() {
    const W = canvas.width;
    const H = canvas.height;

    if ((keys['ArrowLeft']  || keys['a'] || keys['A']) && player.x - player.w / 2 > 0) player.x -= player.speed;
    if ((keys['ArrowRight'] || keys['d'] || keys['D']) && player.x + player.w / 2 < W) player.x += player.speed;
    if ((keys['ArrowUp']    || keys['w'] || keys['W']) && player.y - player.h / 2 > 0) player.y -= player.speed;
    if ((keys['ArrowDown']  || keys['s'] || keys['S']) && player.y + player.h / 2 < H) player.y += player.speed;

  // Block the player from entering the camera preview zone (top-right corner) when camera is on
    if (window.cameraIsOn) {
        const camLeft   = W - 236; 
        const camBottom = 181;     

        if (player.x + player.w / 2 > camLeft && player.y - player.h / 2 < camBottom) {
        const overlapLeft   = (player.x + player.w / 2) - camLeft;
        const overlapBottom = camBottom - (player.y - player.h / 2);

        if (overlapLeft < overlapBottom) {
            player.x = camLeft - player.w / 2; 
        } else {
            player.y = camBottom + player.h / 2; 
        }
        }
    }
}

function moveEnemies() {
    enemies.forEach(e => {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        e.x += (dx / d) * e.speed;
        e.y += (dy / d) * e.speed;
    });
    }

function moveParticles() {
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
    });
    }

function checkTicketCollisions() {
    tickets = tickets.filter(t => {
        const dx = player.x - t.x;
        const dy = player.y - t.y;
        if (Math.sqrt(dx * dx + dy * dy) < 28) {
        score += 10;
        spawnParticles(t.x, t.y, '#ffd700');
        return false;
        }
        return true;
    });
    }

function checkEnemyCollisions() {
    enemies = enemies.filter(e => {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        if (Math.sqrt(dx * dx + dy * dy) < player.w / 2 + e.size) {
        health = Math.max(0, health - e.damage);
        spawnParticles(e.x, e.y, '#ff2d78');
        if (health <= 0) endGame();
        return false;
        }
        return true;
    });
    }

function checkHpackCollisions() {
    hpacks = hpacks.filter(h => {
        const dx = player.x - h.x;
        const dy = player.y - h.y;
        if (Math.sqrt(dx * dx + dy * dy) < 30) {
        health = Math.min(100, health + 20);
        spawnParticles(h.x, h.y, '#00ff88');
        return false;
        }
        return true;
    });
    }

function checkScoreBonus() {
    const threshold = Math.floor(score / 100) * 100;
    if (threshold > 0 && threshold > lastBonusAt) {
        lastBonusAt = threshold;
        health = Math.min(100, health + 10);
        showFloatingMsg('+10 HP');
        spawnParticles(player.x, player.y, '#00f5d4');
    }
    }


// Draw

function draw() {
    const W = canvas.width;
    const H = canvas.height;

    // Background
    if (bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.drawImage(bgImg, 0, 0, W, H);
    } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0a0014');
        g.addColorStop(1, '#12002a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#ff2d78';
        ctx.beginPath(); ctx.arc(W * 0.25, H * 0.4, 60, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#00f5d4';
        ctx.beginPath(); ctx.arc(W * 0.75, H * 0.6, 45, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    hpacks.forEach(h => {
        if (hpackImg.complete && hpackImg.naturalWidth > 0) {
        ctx.drawImage(hpackImg, h.x - 16, h.y - 16, 32, 32);
        } else {
        ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 10;
        ctx.fillStyle   = '#00ff88';
        ctx.fillRect(h.x - 8, h.y - 2, 16, 4);
        ctx.fillRect(h.x - 2, h.y - 8, 4, 16);
        ctx.shadowBlur = 0;
        }
    });

    tickets.forEach(t => {
        if (ticketImg.complete && ticketImg.naturalWidth > 0) {
        ctx.drawImage(ticketImg, t.x - 24, t.y - 16, 48, 32);
        } else {
        ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 14;
        ctx.fillStyle   = '#ffd700';
        ctx.fillRect(t.x - 14, t.y - 9, 28, 18);
        ctx.fillStyle = '#0a0014';
        ctx.font      = 'bold 7px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('TICKET', t.x, t.y + 3);
        ctx.shadowBlur = 0;
        }
    });

    enemies.forEach(e => drawEnemy(e));
    drawParticles();

    // Player

    if (playerImg.complete && playerImg.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        ctx.drawImage(playerImg, player.x - player.w / 2, player.y - player.h / 2, player.w, player.h);
        ctx.restore();
    } else {
        ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 16;
        ctx.fillStyle   = '#7d3cff';
        ctx.beginPath(); ctx.arc(player.x, player.y, player.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a235a';
        ctx.fillRect(player.x - 11, player.y - player.w / 2 - 16, 22, 14);
        ctx.fillStyle = '#6c3483';
        ctx.fillRect(player.x - 15, player.y - player.w / 2 - 4, 30, 5);
        ctx.shadowBlur = 0;
    }
}

function drawEnemy(e) {
    let img = null;
    if (e.type === 'goblin' && goblinImg.complete && goblinImg.naturalWidth > 0) img = goblinImg;
    if (e.type === 'scout'  && scoutImg.complete  && scoutImg.naturalWidth  > 0) img = scoutImg;
    if (e.type === 'golem'  && golemImg.complete  && golemImg.naturalWidth  > 0) img = golemImg;

    if (img) {
        ctx.drawImage(img, e.x - e.size, e.y - e.size, e.size * 2, e.size * 2);
        return;
    }

    ctx.fillStyle   = e.color;
    ctx.shadowColor = e.color;
    ctx.shadowBlur  = 8;

    if (e.type === 'goblin') {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#fff';
        ctx.beginPath(); ctx.arc(e.x - 5, e.y - 4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(e.x + 5, e.y - 4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle  = '#f00';
        ctx.beginPath(); ctx.arc(e.x - 5, e.y - 4, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(e.x + 5, e.y - 4, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'scout') {
        ctx.beginPath();
        ctx.moveTo(e.x,         e.y - e.size);
        ctx.lineTo(e.x - e.size, e.y + e.size);
        ctx.lineTo(e.x + e.size, e.y + e.size);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
    } else {
        ctx.fillRect(e.x - e.size, e.y - e.size, e.size * 2, e.size * 2);
        ctx.shadowBlur = 0;
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life / 30;
        ctx.shadowColor = p.color;
        ctx.shadowBlur  = 6;
        ctx.fillStyle   = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
}


// Spawn Helpers

function spawnTicket() {
    if (!gameRunning) return;
    tickets.push({
        x: Math.random() * (canvas.width  - 80) + 40,
        y: Math.random() * (canvas.height - 80) + 40,
    });
    }

function spawnEnemy() {
    if (!gameRunning || spawnsPaused) return;

    const mood = window.currentMood;
    const W    = canvas.width;
    const H    = canvas.height;

    function edgePos(edge) {
        if      (edge === 0) return { x: Math.random() * W, y: -20  };
        else if (edge === 1) return { x: W + 20,            y: Math.random() * H };
        else if (edge === 2) return { x: Math.random() * W, y: H + 20 };
        else                 return { x: -20,               y: Math.random() * H };
    }

    // Bored — 3 enemies at once from different edges so the screen floods immediately.
    // Each one is a distinct type so they look visually different.
    if (mood === 'Bored') {
        const burst = [
        { type: 'scout',  color: '#ff69b4', speed: 3.2, size: 9,  damage: 6  },
        { type: 'goblin', color: '#ff4400', speed: 2.6, size: 14, damage: 9  },
        { type: 'golem',  color: '#aa00ff', speed: 1.8, size: 20, damage: 11 },
        ];
        burst.forEach((e, i) => {
        const pos = edgePos(i);
        enemies.push({ ...e, x: pos.x, y: pos.y });
        });
        return;
    }

    // Engaged — random mix of all three types, moderately fast
    if (mood === 'Engaged') {
        const r = Math.random();
        let type, color, speed, size, damage;

        if (r < 0.33) {
        type = 'golem';  color = '#ff6600'; speed = 2.2; size = 19; damage = 12;
        } else if (r < 0.66) {
        type = 'goblin'; color = '#cc00ff'; speed = 2.8; size = 13; damage = 8;
        } else {
        type = 'scout';  color = '#ff2d78'; speed = 3.2; size = 10; damage = 6;
        }

        const pos = edgePos(Math.floor(Math.random() * 4));
        enemies.push({ x: pos.x, y: pos.y, type, color, speed, size, damage });
        return;
    }

    // Surprised — single calm scout
    if (mood === 'Surprised') {
        const pos = edgePos(Math.floor(Math.random() * 4));
        enemies.push({ x: pos.x, y: pos.y, type: 'scout', color: '#00f5d4', speed: 2.0, size: 11, damage: 8 });
        return;
    }

    // Frustrated — one slow goblin, easy to dodge
    const pos = edgePos(Math.floor(Math.random() * 4));
    enemies.push({ x: pos.x, y: pos.y, type: 'goblin', color: '#556677', speed: 1.0, size: 13, damage: 5 });
}

function maybeSpawnHealthPack() {
    if (!gameRunning) return;
    if (health < 60 || window.isRagebait) {
        hpacks.push({
        x: Math.random() * (canvas.width  - 80) + 40,
        y: Math.random() * (canvas.height - 80) + 40,
        });
    }
}

function spawnParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
        particles.push({
        x, y, color,
        vx:     (Math.random() - 0.5) * 5,
        vy:     (Math.random() - 0.5) * 5,
        radius: Math.random() * 4 + 2,
        life:   30,
        });
    }
}


// Difficulty

function applyDifficulty() {
    if (window.isRagebait && !ragebaitActive) {
        ragebaitActive    = true;
        window.isRagebait = false;

        const overlay = document.getElementById('ragebait-overlay');
        const msg     = document.getElementById('ragebait-msg');
        overlay.classList.add('active');
        msg.style.display = 'block';
        spawnsPaused = true;

        setTimeout(() => {
        spawnsPaused   = false;
        ragebaitActive = false;
        overlay.classList.remove('active');
        msg.style.display = 'none';
        hpacks.push({ x: canvas.width / 2, y: canvas.height / 2 });
    }, 5000);

    return;
    }

    if (spawnsPaused) return;

    // Update the HUD difficulty label to match the current mood
    const diffEl = document.getElementById('diff-display');
    if (diffEl) {
        const byMood = {
        'Bored':      { label: 'INSANE', color: '#ff0000' },
        'Engaged':    { label: 'HIGH',   color: '#ff2d78' },
        'Surprised':  { label: 'NORMAL', color: '#ffffff' },
        'Frustrated': { label: 'LOW',    color: '#00f5d4' },
        };
        const d = byMood[window.currentMood] || { label: 'NORMAL', color: '#fff' };
        diffEl.textContent = d.label;
        diffEl.style.color = d.color;
    }
}


// HUD

function updateHUD() {
    document.getElementById('score-display').textContent     = score;
    document.getElementById('highscore-display').textContent = highScore;
    document.getElementById('health-display').textContent    = health;
    document.getElementById('mood-display').textContent      = window.currentMood;
}


// Session Logger

function logSession() {
    if (!gameRunning) return;
    sessionData.push({
        timestamp:  elapsedSeconds,
        mood:       window.currentMood,
        score:      score,
        health:     health,
        enemies:    enemies.length,
        ragebait:   window.isRagebait || false,
        engScore:   window.engagementScore  || 0,
        frustScore: window.frustrationScore || 0,
        rageIndex:  window.rageIndex        || 0,
    });
}


// Floating Message

let floatTimeout = null;

function showFloatingMsg(text) {
    let el = document.getElementById('float-msg');
    if (!el) {
        el          = document.createElement('div');
        el.id       = 'float-msg';
        el.style.cssText = [
        'position:fixed', 'top:13%', 'left:50%', 'transform:translateX(-50%)',
        'background:rgba(6,0,15,0.95)', 'border:1px solid #00f5d4', 'color:#00f5d4',
        'padding:9px 22px', 'border-radius:4px', 'font-family:Space Grotesk,sans-serif',
        'font-size:15px', 'letter-spacing:3px', 'z-index:30', 'pointer-events:none',
        ].join(';');
        document.body.appendChild(el);
    }
    el.textContent   = text;
    el.style.display = 'block';
    clearTimeout(floatTimeout);
    floatTimeout = setTimeout(() => { el.style.display = 'none'; }, 1800);
}


// End Game
function endGame() {
    gameRunning = false;

    clearTimeout(ticketTimer);
    clearTimeout(enemyTimer);
    clearInterval(logTimer);
    clearInterval(hpackTimer);
    cancelAnimationFrame(gameLoopId);

    const t = sessionData.length || 1;
    const c = { Engaged: 0, Bored: 0, Frustrated: 0, Surprised: 0 };
    sessionData.forEach(d => { if (c[d.mood] !== undefined) c[d.mood]++; });

    // Save to Supabase
    fetch('https://gaipsjlgcouprwgyemoo.supabase.co/rest/v1/sessions', {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'apikey':        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhaXBzamxnY291cHJ3Z3llbW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTE5NTIsImV4cCI6MjA4NzI4Nzk1Mn0.D7vC95zSTQlRcrzqWrJgQbNCJqexuyZoJwy0Xz-wOQc',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhaXBzamxnY291cHJ3Z3llbW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTE5NTIsImV4cCI6MjA4NzI4Nzk1Mn0.D7vC95zSTQlRcrzqWrJgQbNCJqexuyZoJwy0Xz-wOQc',
            'Prefer':        'return=minimal'
        },
        body: JSON.stringify({
            score:          score,
            time_alive:     elapsedSeconds,
            engaged_pct:    Math.round(c.Engaged    / t * 100),
            frustrated_pct: Math.round(c.Frustrated / t * 100),
            bored_pct:      Math.round(c.Bored      / t * 100),
            surprised_pct:  Math.round(c.Surprised  / t * 100),
            ragebait_count: sessionData.filter(d => d.ragebait).length
        })
    }).then(res => {
        if (res.ok) console.log('[Supabase] Session saved ✓');
        else res.text().then(e => console.warn('[Supabase] Error:', e));
    }).catch(e => console.warn('[Supabase] Offline:', e.message));

    // Save to localStorage
    if (dataConsent === 'yes') {
        const allSessions = JSON.parse(localStorage.getItem('emotica_all_sessions') || '[]');
        allSessions.push({
            date:       new Date().toISOString(),
            finalScore: score,
            duration:   elapsedSeconds,
            log:        sessionData,
        });
        localStorage.setItem('emotica_all_sessions', JSON.stringify(allSessions));
    }

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('emotica_highscore', highScore);
    }

    gameScreen.style.display      = 'none';
    gameoverScreen.style.display  = 'flex';
    document.getElementById('settings-icon').style.display    = 'block';
    document.getElementById('final-score-text').textContent   = score + ' pts';
    document.getElementById('survived-text').textContent      = 'Survived ' + elapsedSeconds + 's';
    document.getElementById('gameover-highscore').textContent = 'BEST  ' + highScore;
}

// Session Report

function showReport() {
    gameoverScreen.style.display = 'none';
    reportScreen.style.display   = 'flex';

    const moodCounts    = { Engaged: 0, Bored: 0, Frustrated: 0, Surprised: 0 };
    sessionData.forEach(d => { if (moodCounts[d.mood] !== undefined) moodCounts[d.mood]++; });

    const total         = sessionData.length || 1;
    const ragebaitCount = sessionData.filter(d => d.ragebait).length;
    const avgE          = avg(sessionData.filter(d => d.mood === 'Engaged').map(d => d.score));
    const avgF          = avg(sessionData.filter(d => d.mood === 'Frustrated').map(d => d.score));

  // Score + Health over time
    const lc = document.getElementById('moodLineChart').getContext('2d');
    new Chart(lc, {
        type: 'line',
        data: {
        labels: sessionData.map(d => d.timestamp + 's'),
        datasets: [
            {
            label: 'Score',  data: sessionData.map(d => d.score),
            borderColor: '#ff2d78', backgroundColor: 'rgba(255,45,120,0.08)',
            tension: 0.4, fill: true, pointRadius: 2,
            },
            {
            label: 'Health', data: sessionData.map(d => d.health),
            borderColor: '#00f5d4', backgroundColor: 'rgba(0,245,212,0.04)',
            tension: 0.4, fill: true, pointRadius: 2,
            },
        ],
        },
        options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#c9b8ff', font: { family: 'Space Grotesk', size: 11 } } } },
        scales: {
            x: { ticks: { color: '#555', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: '#555', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
        },
    });

    // Mood donut
    const pc = document.getElementById('moodPieChart').getContext('2d');
    new Chart(pc, {
        type: 'doughnut',
        data: {
        labels: Object.keys(moodCounts),
        datasets: [{
            data: Object.values(moodCounts),
            backgroundColor: ['#ff2d78', '#00f5d4', '#ffd700', '#c9b8ff'],
            borderWidth: 0,
        }],
        },
        options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: {
            position: 'bottom',
            labels: { color: '#c9b8ff', font: { family: 'Space Grotesk', size: 11 }, padding: 10 },
            },
        },
        },
    });

    // Stats panel
    const engPct   = ((moodCounts.Engaged    / total) * 100).toFixed(0);
    const frustPct = ((moodCounts.Frustrated / total) * 100).toFixed(0);
    const boredPct = ((moodCounts.Bored      / total) * 100).toFixed(0);
    const surprPct = ((moodCounts.Surprised  / total) * 100).toFixed(0);

    document.getElementById('stats-box').innerHTML = `
        <div class="stat-row"><span class="stat-label">FINAL SCORE</span>              <span class="stat-value pink">${score}</span></div>
        <div class="stat-row"><span class="stat-label">HIGH SCORE</span>               <span class="stat-value gold">${highScore}</span></div>
        <div class="stat-row"><span class="stat-label">TIME ALIVE</span>               <span class="stat-value teal">${elapsedSeconds}s</span></div>
        <div class="stat-row"><span class="stat-label">ENGAGED</span>                  <span class="stat-value teal">${engPct}%</span></div>
        <div class="stat-row"><span class="stat-label">FRUSTRATED</span>               <span class="stat-value pink">${frustPct}%</span></div>
        <div class="stat-row"><span class="stat-label">BORED</span>                    <span class="stat-value gold">${boredPct}%</span></div>
        <div class="stat-row"><span class="stat-label">SURPRISED</span>                <span class="stat-value purple">${surprPct}%</span></div>
        <div class="stat-row"><span class="stat-label">RAGEBAIT EVENTS</span>          <span class="stat-value pink">${ragebaitCount}</span></div>
        <div class="stat-row"><span class="stat-label">AVG SCORE (ENGAGED)</span>      <span class="stat-value">${avgE.toFixed(0)}</span></div>
        <div class="stat-row"><span class="stat-label">AVG SCORE (FRUSTRATED)</span>   <span class="stat-value">${avgF.toFixed(0)}</span></div>
    `;
}

function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}