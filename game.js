const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const hud = document.getElementById('hud');
const scoreDisplay = document.querySelector('#score-display span');
const finalScoreDisplay = document.getElementById('final-score');
const startHighScoreDisplay = document.getElementById('start-high-score');
const gameOverHighScoreDisplay = document.getElementById('game-over-high-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const deathReason = document.getElementById('death-reason');

// Game State
let gameState = 'START';
let score = 0;
let highScore = parseInt(localStorage.getItem('devourer_high_score')) || 0;
if (startHighScoreDisplay) startHighScoreDisplay.innerText = highScore;

let speedMultiplier = 1;
let animationId;
let lastInvincibleMilestone = 0;
let invincibleBlocks = [];
let particles = [];

// Game Feel State
let screenShakeTime = 0;
let comboCount = 0;
let comboTimer = 0;
let currentMultiplier = 1;
let slowMoTimer = 0;
let timeScale = 1.0;
let flashTime = 0;

// Resize Canvas
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Input Tracking
const mouse = { x: canvas.width / 2, y: canvas.height / 2 };

function updateMouse(e) {
    if (gameState !== 'PLAYING') return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    mouse.x = clientX;
    mouse.y = clientY;
}

window.addEventListener('mousemove', updateMouse);
window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    updateMouse(e);
}, { passive: false });


// --- Entities ---

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
        this.radius = Math.random() * 4 + 2;
    }

    update() {
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        this.life -= this.decay * timeScale;
    }

    draw() {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

const Hole = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: Math.min(canvas.width, canvas.height) * 0.1,
    color: '#0f3460',
    border: '#16213e',

    update() {
        // Player moves normally during slow-mo
        this.x += (mouse.x - this.x) * 0.2;
        this.y += (mouse.y - this.y) * 0.2;
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
    },

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 52, 96, 0.3)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = this.border;
        ctx.stroke();
    }
};

const VIP = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: Math.min(canvas.width, canvas.height) * 0.05,
    color: '#4ecca3',
    vx: 0,
    vy: 0,
    speed: 1.5,
    timer: 0,

    update() {
        this.timer += timeScale;
        if (this.timer > 60 || (this.vx === 0 && this.vy === 0)) {
            this.timer = 0;
            const angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;
        }

        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;

        const margin = this.radius + 20;
        if (this.x < margin) { this.x = margin; this.vx *= -1; }
        if (this.x > canvas.width - margin) { this.x = canvas.width - margin; this.vx *= -1; }
        if (this.y < margin) { this.y = margin; this.vy *= -1; }
        if (this.y > canvas.height - margin) { this.y = canvas.height - margin; this.vy *= -1; }
    },

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;

        // Destello en el centro cuando está el slowmo
        ctx.fillStyle = slowMoTimer > 0 ? '#00f2fe' : '#ffffff';
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
};

let blocks = [];
const blocksConfig = {
    width: 25,
    height: 25,
    spawnRate: 100,
    frameCount: 0
};

const enemyColors = ['#e94560', '#f39c12', '#9b59b6', '#e74c3c'];

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function applyCombo() {
    comboCount++;
    comboTimer = 120; // 2 segundos (a 60fps) ignorando camera lenta

    if (comboCount >= 5) {
        slowMoTimer = 300; // 5 segundos de poder absoluto
        currentMultiplier = Math.floor(comboCount / 5) + 1; // x2, x3, x4...
        flashTime = 5; // Resplandor épico blanco al activar combo
        // No se reinicia el contador. Queremos que sigan encadenando.
    } else {
        currentMultiplier = 1;
    }
}

class Block {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = blocksConfig.width;
        this.height = blocksConfig.height;
        this.color = enemyColors[Math.floor(Math.random() * enemyColors.length)];
        this.active = true;
        this.scale = 1;
        this.falling = false;
        this.rotation = Math.random() * Math.PI * 2;
        this.baseSpeed = 0.5 + Math.random() * 0.5;
    }

    update() {
        if (!this.active) return;

        if (this.falling) {
            // Caída se siente ágil, no cuenta el timescale
            this.scale *= 0.8;
            this.x += (Hole.x - this.x) * 0.2;
            this.y += (Hole.y - this.y) * 0.2;

            if (this.scale < 0.1) {
                this.active = false;

                // Exploción en partículas
                spawnParticles(Hole.x, Hole.y, this.color, 12);

                // Aplicar sistema de cadena y puntuación
                applyCombo();
                score += currentMultiplier;

                if (score % 10 === 0) speedMultiplier += 0.08;
            }
            return;
        }

        const dx = VIP.x - this.x;
        const dy = VIP.y - this.y;
        const distToVIP = Math.sqrt(dx * dx + dy * dy);

        if (distToVIP > 0) {
            this.x += (dx / distToVIP) * this.baseSpeed * speedMultiplier * timeScale;
            this.y += (dy / distToVIP) * this.baseSpeed * speedMultiplier * timeScale;
        }

        this.rotation += 0.05 * timeScale;

        const hdx = this.x - Hole.x;
        const hdy = this.y - Hole.y;
        const distToHole = Math.sqrt(hdx * hdx + hdy * hdy);

        if (distToHole < Hole.radius - 8) {
            this.falling = true;
        }

        if (distToVIP < VIP.radius + this.width / 2 && !this.falling) {
            gameOver("¡Un enemigo destruyó el objetivo!");
        }
    }

    draw() {
        if (!this.active) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.scale(this.scale, this.scale);

        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 4);
        ctx.fill();

        ctx.restore();
    }
}

class InvincibleBlock {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 18;
        this.color = '#ff00ff';
        const angle = Math.random() * Math.PI * 2;
        const speed = 4;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.active = true;
    }

    update() {
        if (!this.active) return;

        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;

        const margin = this.radius;
        if (this.x < margin) { this.x = margin; this.vx *= -1; screenShakeTime = 8; }
        if (this.x > canvas.width - margin) { this.x = canvas.width - margin; this.vx *= -1; screenShakeTime = 8; }
        if (this.y < margin) { this.y = margin; this.vy *= -1; screenShakeTime = 8; }
        if (this.y > canvas.height - margin) { this.y = canvas.height - margin; this.vy *= -1; screenShakeTime = 8; }

        const dx = this.x - Hole.x;
        const dy = this.y - Hole.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < Hole.radius + this.radius) {
            let nx = dx / dist;
            let ny = dy / dist;
            let dotProduct = this.vx * nx + this.vy * ny;

            if (dotProduct < 0) {
                this.vx -= 2 * dotProduct * nx;
                this.vy -= 2 * dotProduct * ny;
                this.vx *= 1.05;
                this.vy *= 1.05;

                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (currentSpeed > 9) {
                    this.vx = (this.vx / currentSpeed) * 9;
                    this.vy = (this.vy / currentSpeed) * 9;
                }

                // Massive shake when impacting player
                screenShakeTime = 20;
                spawnParticles(this.x, this.y, this.color, 20);
            }

            this.x = Hole.x + nx * (Hole.radius + this.radius + 1);
            this.y = Hole.y + ny * (Hole.radius + this.radius + 1);
        }

        const vdx = this.x - VIP.x;
        const vdy = this.y - VIP.y;
        if (Math.sqrt(vdx * vdx + vdy * vdy) < VIP.radius + this.radius) {
            screenShakeTime = 30;
            gameOver("¡La Anomalía Magenta aplastó la esfera!");
        }
    }

    draw() {
        if (!this.active) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.shadowBlur = 25;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
}

function spawnInvincible() {
    let spawnX, spawnY;
    if (Math.random() > 0.5) {
        spawnX = Math.random() > 0.5 ? -30 : canvas.width + 30;
        spawnY = Math.random() * canvas.height;
    } else {
        spawnX = Math.random() * canvas.width;
        spawnY = Math.random() > 0.5 ? -30 : canvas.height + 30;
    }
    invincibleBlocks.push(new InvincibleBlock(spawnX, spawnY));
}

function spawnBlock() {
    blocksConfig.frameCount += timeScale;
    let currentSpawnRate = Math.max(25, blocksConfig.spawnRate - (score * 0.6));

    if (blocksConfig.frameCount >= currentSpawnRate) {
        blocksConfig.frameCount = 0;
        let spawnX, spawnY;
        const edge = Math.floor(Math.random() * 4);
        const padding = 50;

        if (edge === 0) {
            spawnX = Math.random() * canvas.width;
            spawnY = -padding;
        } else if (edge === 1) {
            spawnX = canvas.width + padding;
            spawnY = Math.random() * canvas.height;
        } else if (edge === 2) {
            spawnX = Math.random() * canvas.width;
            spawnY = canvas.height + padding;
        } else {
            spawnX = -padding;
            spawnY = Math.random() * canvas.height;
        }
        blocks.push(new Block(spawnX, spawnY));
    }
}

function updateGameFeel() {
    // Combo Logic
    if (comboTimer > 0) {
        comboTimer--;
        if (comboTimer === 0) {
            comboCount = 0;
            currentMultiplier = 1;
        }
    }

    // Slow Mo Logic
    if (slowMoTimer > 0) {
        slowMoTimer--;
        timeScale = Math.max(0.2, timeScale - 0.05); // Transición suave a cámara lenta (20% vel normal)
    } else {
        timeScale = Math.min(1.0, timeScale + 0.05); // Volver a la normalidad
    }

    if (screenShakeTime > 0) screenShakeTime--;
    if (flashTime > 0) flashTime--;
}

function update() {
    if (gameState !== 'PLAYING') return;

    updateGameFeel();

    Hole.update();
    VIP.update();
    spawnBlock();

    if (score > 0 && score % 50 === 0 && lastInvincibleMilestone !== score) {
        lastInvincibleMilestone = score;
        spawnInvincible();
    }

    blocks.forEach(block => block.update());
    blocks = blocks.filter(block => block.active);

    invincibleBlocks.forEach(boss => boss.update());

    particles.forEach(p => p.update());
    particles = particles.filter(p => p.life > 0);
}

function drawHUD() {
    let scoreStr = score.toString();

    // Si hay combo activo, lo mostramos
    if (currentMultiplier > 1) {
        scoreStr += ` <span style="color:#f39c12; font-size: 1.2rem;">x${currentMultiplier}</span>`;
    }

    // Alerta de Cámara lenta (Si quieres que el texto parpadee, puedes quitar esta o dejarla)
    if (slowMoTimer > 0) {
        scoreStr += ` <span style="color:#00f2fe; margin-left: 10px; font-size: 0.9rem; letter-spacing: 2px;">SLOW MO</span>`;
    }

    scoreDisplay.innerHTML = scoreStr;

    // Barra de Combo debajo de la puntuación
    if (comboTimer > 0) {
        ctx.save();
        ctx.shadowBlur = 0; // Deshabilitar sombras para UI pura
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(20, 75, 200, 8);
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(20, 75, 200 * (comboTimer / 120), 8);
        ctx.restore();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Efecto de Temblor (Screen Shake)
    if (screenShakeTime > 0) {
        const intensity = Math.min(15, screenShakeTime);
        const dx = (Math.random() - 0.5) * intensity;
        const dy = (Math.random() - 0.5) * intensity;
        ctx.translate(dx, dy);
    }

    drawGrid();

    particles.forEach(p => p.draw());
    VIP.draw();

    blocks.forEach(block => { if (block.falling) block.draw(); });
    Hole.draw();
    blocks.forEach(block => { if (!block.falling) block.draw(); });
    invincibleBlocks.forEach(boss => boss.draw());

    ctx.restore(); // Siempre limpiar la traslación de la cámara para UI independiente

    // Reflejo blanco en toda la pantalla al detonar un poder (Flash)
    if (flashTime > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashTime / 5})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Efecto Viñeta turquesa dramática para ralentización de tiempo
    if (timeScale < 1.0) {
        const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.width * 0.2, canvas.width / 2, canvas.height / 2, canvas.width * 0.8);
        grad.addColorStop(0, 'rgba(0, 242, 254, 0)');
        grad.addColorStop(1, `rgba(0, 242, 254, ${(1 - timeScale) * 0.5})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawHUD();
}

function loop(timestamp) {
    update();
    draw();
    animationId = requestAnimationFrame(loop);
}

// --- Control Flow ---

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'i' && gameState === 'PLAYING') spawnInvincible();

    // TECLA TRAMPA PARA PROBAR COMBO DE GOLPE
    if (e.key.toLowerCase() === 'c' && gameState === 'PLAYING') {
        for (let i = 0; i < 5; i++) applyCombo();
    }
});

function startGame() {
    gameState = 'PLAYING';
    score = 0;
    speedMultiplier = 1;
    blocks = [];
    invincibleBlocks = [];
    particles = [];
    lastInvincibleMilestone = 0;
    blocksConfig.frameCount = 0;

    // Reset Game Feel variables
    screenShakeTime = 0;
    comboCount = 0;
    comboTimer = 0;
    currentMultiplier = 1;
    slowMoTimer = 0;
    timeScale = 1.0;
    flashTime = 0;

    Hole.x = canvas.width / 2;
    Hole.y = Math.max(canvas.height - 150, canvas.height / 2);
    mouse.x = Hole.x;
    mouse.y = Hole.y;

    VIP.x = canvas.width / 2;
    VIP.y = canvas.height / 2;
    VIP.vx = 0;
    VIP.vy = 0;
    VIP.timer = 60;

    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    hud.classList.add('active');

    if (!animationId) loop();
}

function gameOver(reason) {
    gameState = 'GAMEOVER';
    hud.classList.remove('active');
    gameOverScreen.classList.add('active');
    deathReason.innerText = reason;
    finalScoreDisplay.innerText = score;
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('devourer_high_score', highScore);
        startHighScoreDisplay.innerText = highScore;
    }
    gameOverHighScoreDisplay.innerText = highScore;
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

drawGrid();
Hole.draw();
VIP.draw();
