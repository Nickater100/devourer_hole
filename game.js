const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const hud = document.getElementById('hud');
const scoreDisplay = document.querySelector('#score-display span');
const finalScoreDisplay = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const deathReason = document.getElementById('death-reason');

// Game State
let gameState = 'START';
let score = 0;
let speedMultiplier = 1;
let animationId;
let lastInvincibleMilestone = 0;
let invincibleBlocks = [];

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

const Hole = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: Math.min(canvas.width, canvas.height) * 0.1,
    color: '#0f3460',
    border: '#16213e',
    
    update() {
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
    speed: 1.5, // Mucho más fácil protegerlo al inicio
    timer: 0,
    
    update() {
        this.timer++;
        // Change direction erratically every ~60 frames
        if (this.timer > 60 || (this.vx === 0 && this.vy === 0)) {
            this.timer = 0;
            const angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Bounce off walls
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
        ctx.fillStyle = '#ffffff';
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
    spawnRate: 100, // Comienzo muy lento (casi 2 segundos) para enseñar a jugar
    frameCount: 0
};

const enemyColors = ['#e94560', '#f39c12', '#9b59b6', '#e74c3c'];

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
        this.baseSpeed = 0.5 + Math.random() * 0.5; // Enemigos iniciales a la mitad de su velocidad vieja
    }

    update() {
        if (!this.active) return;

        if (this.falling) {
            this.scale *= 0.8;
            this.x += (Hole.x - this.x) * 0.2;
            this.y += (Hole.y - this.y) * 0.2;
            
            if (this.scale < 0.1) {
                this.active = false;
                score++;
                scoreDisplay.innerText = score;
                // Escalada de velocidad mucho más amena (0.08 en lugar de 0.15)
                if (score % 10 === 0) speedMultiplier += 0.08; 
            }
            return;
        }

        // Homing behavior towards VIP
        const dx = VIP.x - this.x;
        const dy = VIP.y - this.y;
        const distToVIP = Math.sqrt(dx * dx + dy * dy);
        
        if (distToVIP > 0) {
            this.x += (dx / distToVIP) * this.baseSpeed * speedMultiplier;
            this.y += (dy / distToVIP) * this.baseSpeed * speedMultiplier;
        }
        
        this.rotation += 0.05;

        // Check collision with Hole
        const hdx = this.x - Hole.x;
        const hdy = this.y - Hole.y;
        const distToHole = Math.sqrt(hdx * hdx + hdy * hdy);
        
        if (distToHole < Hole.radius - 8) {
            this.falling = true;
        }

        // Check collision with VIP
        if (distToVIP < VIP.radius + this.width/2 && !this.falling) {
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
        ctx.roundRect(-this.width/2, -this.height/2, this.width, this.height, 4);
        ctx.fill();
        
        ctx.restore();
    }
}

class InvincibleBlock {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 18; // Bola un poco más grande
        this.color = '#ff00ff'; // Magenta neón brillante
        
        // Comienza con velocidad constante en una dirección aleatoria
        const angle = Math.random() * Math.PI * 2;
        const speed = 4;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.active = true;
    }

    update() {
        if (!this.active) return;
        
        this.x += this.vx;
        this.y += this.vy;

        // Rebota contra las paredes
        const margin = this.radius;
        if (this.x < margin) { this.x = margin; this.vx *= -1; }
        if (this.x > canvas.width - margin) { this.x = canvas.width - margin; this.vx *= -1; }
        if (this.y < margin) { this.y = margin; this.vy *= -1; }
        if (this.y > canvas.height - margin) { this.y = canvas.height - margin; this.vy *= -1; }

        // Mágia matemática: Rebota contra el Agujero (Jugador)
        const dx = this.x - Hole.x;
        const dy = this.y - Hole.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < Hole.radius + this.radius) {
            // Refleja el vector de velocidad según la normal del impacto
            let nx = dx / dist;
            let ny = dy / dist;
            let dotProduct = this.vx * nx + this.vy * ny;
            
            // Solo rebotar si viajan hacia nosotros (previene que se quede atrapado)
            if (dotProduct < 0) {
                this.vx -= 2 * dotProduct * nx;
                this.vy -= 2 * dotProduct * ny;
                
                // Le damos un pequeño empujón de velocidad cada vez que lo golpeas
                this.vx *= 1.05;
                this.vy *= 1.05;
                
                // Límite máximo de velocidad para que no rompa el juego
                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (currentSpeed > 9) {
                    this.vx = (this.vx / currentSpeed) * 9;
                    this.vy = (this.vy / currentSpeed) * 9;
                }
            }
            
            // Forzar salida para evitar atascos
            this.x = Hole.x + nx * (Hole.radius + this.radius + 1);
            this.y = Hole.y + ny * (Hole.radius + this.radius + 1);
        }

        // Colisión con la VIP
        const vdx = this.x - VIP.x;
        const vdy = this.y - VIP.y;
        if (Math.sqrt(vdx * vdx + vdy * vdy) < VIP.radius + this.radius) {
            gameOver("¡La Anomalía Magenta aplastó la esfera!");
        }
    }

    draw() {
        if (!this.active) return;
        ctx.beginPath();
        // Aura exterior brillante
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.shadowBlur = 25;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Núcleo letal
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
}

// --- Background Grid ---
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

// --- Game Loop ---

function spawnBlock() {
    blocksConfig.frameCount++;
    
    // Baja el timer gradual pero el límite inferior (máximo número de enemigos en pantalla) se relaja de 15 a 25.
    let currentSpawnRate = Math.max(25, blocksConfig.spawnRate - (score * 0.6));

    if (blocksConfig.frameCount >= currentSpawnRate) {
        blocksConfig.frameCount = 0;
        
        let spawnX, spawnY;
        const edge = Math.floor(Math.random() * 4);
        const padding = 50;

        if (edge === 0) { // Top
            spawnX = Math.random() * canvas.width;
            spawnY = -padding;
        } else if (edge === 1) { // Right
            spawnX = canvas.width + padding;
            spawnY = Math.random() * canvas.height;
        } else if (edge === 2) { // Bottom
            spawnX = Math.random() * canvas.width;
            spawnY = canvas.height + padding;
        } else { // Left
            spawnX = -padding;
            spawnY = Math.random() * canvas.height;
        }
        
        blocks.push(new Block(spawnX, spawnY));
    }
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

function update() {
    if (gameState !== 'PLAYING') return;
    
    Hole.update();
    VIP.update();
    
    spawnBlock();
    
    // Spawn de la Anomalía cada 1000 puntos
    if (score > 0 && score % 1000 === 0 && lastInvincibleMilestone !== score) {
        lastInvincibleMilestone = score;
        spawnInvincible();
    }
    
    blocks.forEach(block => block.update());
    blocks = blocks.filter(block => block.active);
    
    invincibleBlocks.forEach(boss => boss.update());
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawGrid();
    
    VIP.draw();
    
    blocks.forEach(block => { if (block.falling) block.draw(); });
    Hole.draw();
    blocks.forEach(block => { if (!block.falling) block.draw(); });
    
    // Dibujar enemigos indestructibles por encima de todo
    invincibleBlocks.forEach(boss => boss.draw());
}

function loop(timestamp) {
    update();
    draw();
    animationId = requestAnimationFrame(loop);
}

// --- Control Flow ---

// --- Truco para probar rápidamente ---
window.addEventListener('keydown', (e) => {
    // Si presionas la tecla "I" (i latina) durante tu partida, aparecerá el enemigo
    if (e.key.toLowerCase() === 'i' && gameState === 'PLAYING') {
        spawnInvincible();
    }
});

function startGame() {
    gameState = 'PLAYING';
    score = 0;
    speedMultiplier = 1;
    blocks = [];
    invincibleBlocks = [];
    lastInvincibleMilestone = 0;
    blocksConfig.frameCount = 0;
    scoreDisplay.innerText = '0';
    
    Hole.x = canvas.width / 2;
    Hole.y = Math.max(canvas.height - 150, canvas.height / 2);
    mouse.x = Hole.x;
    mouse.y = Hole.y;

    VIP.x = canvas.width / 2;
    VIP.y = canvas.height / 2;
    VIP.vx = 0;
    VIP.vy = 0;
    VIP.timer = 60; // Force immediate direction change
    
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    hud.classList.add('active');
    
    if (!animationId) {
        loop();
    }
}

function gameOver(reason) {
    gameState = 'GAMEOVER';
    hud.classList.remove('active');
    gameOverScreen.classList.add('active');
    deathReason.innerText = reason;
    finalScoreDisplay.innerText = score;
}

// Events
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// Initial Render
drawGrid();
Hole.draw();
VIP.draw();
