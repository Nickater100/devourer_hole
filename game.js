const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const hud = document.getElementById('hud');
const scoreDisplay = document.getElementById('score-display');
const finalScoreDisplay = document.getElementById('final-score-container');
const startHighScoreDisplay = document.getElementById('start-high-score');
const gameOverHighScoreDisplay = document.getElementById('high-score-container');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const deathReason = document.getElementById('death-reason');

const storeScreen = document.getElementById('store-screen');
const startCoinsDisplay = document.getElementById('start-coins');
const storeTotalCoinsDisplay = document.getElementById('store-total-coins');
const storeBtn = document.getElementById('store-btn');
const closeStoreBtn = document.getElementById('close-store-btn');
const storeItemsContainer = document.getElementById('store-items-container');

const rankingBtn = document.getElementById('ranking-btn');
const loginBtn = document.getElementById('login-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const leaderboardScreen = document.getElementById('leaderboard-screen');
const closeLeaderboardBtn = document.getElementById('close-leaderboard-btn');
const leaderboardList = document.getElementById('leaderboard-list');
const menuBtn = document.getElementById('menu-btn');

// Game State
let gameState = 'START';
let score = 0;
let currentUser = null;
let highScore = parseInt(localStorage.getItem('devourer_high_score')) || 0;
if (startHighScoreDisplay) startHighScoreDisplay.innerText = highScore;

let totalCoins = parseInt(localStorage.getItem('devourer_total_coins')) || 0;
if (startCoinsDisplay) startCoinsDisplay.innerText = totalCoins;

// --- AdMob Initialization ---
let isAdMobInitialized = false;
let deathsCount = parseInt(localStorage.getItem('devourer_deaths_count')) || 0;

setTimeout(async () => {
    if (window.AdMobPlugin) {
        try {
            await window.AdMobPlugin.initialize({
                requestTrackingAuthorization: true,
                initializeForTesting: false
            });
            isAdMobInitialized = true;
            console.log("AdMob initialized successfully");
        } catch (e) {
            console.error("AdMob initialization error", e);
        }
    }
}, 500);

async function showInterstitialAd() {
    if (!isAdMobInitialized) return;
    try {
        await window.AdMobPlugin.prepareInterstitial({
            adId: 'ca-app-pub-1547228404922892/8976645036', // Su ID real de AdMob
            isTesting: false
        });
        await window.AdMobPlugin.showInterstitial();
    } catch (e) {
        console.error("Error showing AdMob Interstitial", e);
    }
}

let speedMultiplier = 1;
let animationId;
let lastInvincibleMilestone = 0;
let invincibleBlocks = [];
let particles = [];
let lastRocketMilestone = 0; // Comienza a generar a partir de los 150. (150-50)/100 = 1

// --- Shop & Upgrades Data ---
const SHOP_ITEMS = [
    { id: 'skin-neon', type: 'skin', price: 500, icon: 'icon-neon' },
    { id: 'skin-fire', type: 'skin', price: 1000, icon: 'icon-fire' },
    { id: 'skin-rainbow', type: 'skin', price: 2500, icon: 'icon-rainbow' },
    { id: 'upgrade-shield', type: 'upgrade', price: 1500, icon: 'icon-shield', value: '🛡️' },
    { id: 'upgrade-size', type: 'upgrade', price: 1000, icon: 'icon-size', value: '' },
    { id: 'upgrade-magnet', type: 'upgrade', price: 1200, icon: 'icon-magnet', value: '🧲' }
];

let ownedItems = JSON.parse(localStorage.getItem('devourer_owned_items')) || ['skin-default'];
let equippedSkin = localStorage.getItem('devourer_equipped_skin') || 'skin-default';
// Las mejoras se compran una vez y se activan permanentemente
let upgrades = JSON.parse(localStorage.getItem('devourer_upgrades')) || {
    shield: false,
    biggerHole: false,
    magnet: false
};

// --- Audio System ---
let audioCtx = null;

function unlockAudio() {
    // Crear el contexto si no existe
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Reproducir buffer silencioso en CADA gesto — Android exige que se use
    // el contexto dentro del gesto para desbloquearlo y para mantenerlo activo.
    const silentBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(audioCtx.destination);
    source.start(0);

    // Resume sincrónico dentro del event handler (siempre permitido)
    if (audioCtx.state !== 'running') {
        audioCtx.resume();
    }
}

// Usar touchend Y click (más confiable que touchstart en Android Chrome)
window.addEventListener('touchend', unlockAudio, { passive: true });
window.addEventListener('click', unlockAudio);
window.addEventListener('mousedown', unlockAudio);


function playDestroySound() {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

async function triggerVibration(pattern) {
    if (window.HapticsPlugin) {
        try {
            if (pattern === 'heavy') {
                // Fuerte impacto para perder
                await window.HapticsPlugin.vibrate({ duration: 500 });
            } else {
                // Impacto ligero para destruir boss
                await window.HapticsPlugin.vibrate({ duration: 250 });
            }
        } catch (e) {
            console.error("Native Haptics failed", e);
        }
    } else if (navigator.vibrate) {
        try {
            if (pattern === 'heavy') navigator.vibrate([200, 100, 200, 100, 400]);
            else navigator.vibrate([100, 50, 100]);
        } catch (e) {}
    }
}

function playBossDestroySound() {
    if (!audioCtx || audioCtx.state !== 'running') return;

    // Capa 1: tono grave expansivo
    const osc = audioCtx.createOscillator();
    const gainOsc = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.4);
    gainOsc.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gainOsc.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gainOsc);
    gainOsc.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);

    // Capa 2: ruido blanco tipo "boom" percusivo
    const bufferSize = audioCtx.sampleRate * 0.3;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    noise.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noise.start();
}



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
    if (gameState === 'PLAYING') {
        e.preventDefault();
    }
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
        ctx.save();
        
        // Estilos de Skins
        let holeColor = this.color;
        let borderColor = this.border;
        let shadowColor = 'rgba(0,0,0,0.5)';
        let shadowBlur = 0;

        if (equippedSkin === 'skin-neon') {
            holeColor = '#00f2fe';
            borderColor = '#71f7ff';
            shadowColor = '#00f2fe';
            shadowBlur = 20;
        } else if (equippedSkin === 'skin-fire') {
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
            grad.addColorStop(0, '#ff4b2b');
            grad.addColorStop(1, '#ff416c');
            holeColor = grad;
            borderColor = '#ff4b2b';
            shadowColor = '#ff4b2b';
            shadowBlur = 15;
            
            // Partículas de "fuego/humo" ocasionales
            if (Math.random() > 0.8 && gameState === 'PLAYING') {
                spawnParticles(this.x + (Math.random()-0.5)*20, this.y + (Math.random()-0.5)*20, '#ff4b2b', 1);
            }
        } else if (equippedSkin === 'skin-rainbow') {
            const hue = (Date.now() / 20) % 360;
            holeColor = `hsl(${hue}, 70%, 50%)`;
            borderColor = `hsl(${(hue + 40) % 360}, 70%, 60%)`;
            shadowColor = holeColor;
            shadowBlur = 15;
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 52, 96, 0.3)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.shadowBlur = shadowBlur;
        ctx.shadowColor = shadowColor;
        ctx.fillStyle = holeColor;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.lineWidth = 5;
        ctx.strokeStyle = borderColor;
        ctx.stroke();
        ctx.restore();
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
    hasShield: false,

    update() {
        this.timer += timeScale;
        if (this.timer > 60 || (this.vx === 0 && this.vy === 0)) {
            this.timer = 0;
            // Calcular ángulo hacia el centro aprox. para no quedarse estancado en los bordes
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const distToCenter = Math.sqrt((cx - this.x) ** 2 + (cy - this.y) ** 2);
            
            let angle;
            if (distToCenter > canvas.width * 0.3) {
                // Si está muy lejos del centro (cerca de bordes), forzar dirección general hacia adentro
                const centerAngle = Math.atan2(cy - this.y, cx - this.x);
                angle = centerAngle + (Math.random() - 0.5) * Math.PI; // +/- 90 grados
            } else {
                // Movimiento normal aleatorio
                angle = Math.random() * Math.PI * 2;
            }

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

        // Dibujar escudo si tiene
        if (this.hasShield) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
            ctx.strokeStyle = '#00f2fe';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
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
    constructor(x, y, isGhost = false, isRocket = false) {
        this.x = x;
        this.y = y;
        this.width = blocksConfig.width;
        this.height = blocksConfig.height;
        this.isGhost = isGhost;
        this.isRocket = isRocket;
        
        if (this.isGhost) {
            this.color = '#bdc3c7'; // Ghostly gray/white
            this.phaseTimer = Math.random() * Math.PI * 2;
            this.isSolid = true;
            this.baseSpeed = 0.6 + Math.random() * 0.4; // Ligeramente más rápidos
        } else if (this.isRocket) {
            this.color = '#ff4757'; // Rojo/Naranja misil
            this.isSolid = true;
            // Cohete SUPER RÁPIDO
            this.baseSpeed = 1.8 + Math.random() * 0.4; 
            // Forma alargada y aerodinámica
            this.width = 16;
            this.height = 36;
            // Modo Orbita Inicial
            this.rocketState = 'orbiting';
            this.rocketOrbitTime = 250; // 4 segundos aprox
            this.orbitAngle = Math.atan2(this.y - canvas.height/2, this.x - canvas.width/2);
            this.orbitRadius = Math.sqrt((this.x - canvas.width/2)**2 + (this.y - canvas.height/2)**2);
        } else {
            this.color = enemyColors[Math.floor(Math.random() * enemyColors.length)];
            this.isSolid = true;
            this.baseSpeed = 0.5 + Math.random() * 0.5;
        }
        
        this.active = true;
        this.scale = 1;
        this.falling = false;
        this.rotation = Math.random() * Math.PI * 2;
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
                playDestroySound();

                // Aplicar sistema de cadena y puntuación
                applyCombo();
                score += currentMultiplier;
                
                // Puntos extra
                if (this.isGhost) score += 2;
                if (this.isRocket) score += 3; // Eliminar el misil da más puntos

                if (score % 10 === 0) speedMultiplier += 0.08;
            }
            return;
        }

        if (this.isRocket && !this.falling && Math.random() < 0.4) {
            // Estela de fuego
            spawnParticles(this.x, this.y, '#ff6b81', 1);
            spawnParticles(this.x, this.y, '#ffa502', 1);
        }

        if (this.isGhost) {
            this.phaseTimer += 0.04 * timeScale;
            // Visible y sólido cuando el seno ajustado es mayor que -0.2 (está invisible menos tiempo del que está visible)
            this.isSolid = Math.sin(this.phaseTimer) > -0.2;
        }

        const dx = VIP.x - this.x;
        const dy = VIP.y - this.y;
        const distToVIP = Math.sqrt(dx * dx + dy * dy);

        if (this.isRocket) {
            if (this.rocketState === 'orbiting') {
                this.orbitAngle += 0.05 * timeScale * speedMultiplier;
                // Reducir el radio para que entre en la pantalla
                if (this.orbitRadius > canvas.width * 0.35) {
                    this.orbitRadius -= 2 * timeScale;
                }
                this.x = canvas.width/2 + Math.cos(this.orbitAngle) * this.orbitRadius;
                this.y = canvas.height/2 + Math.sin(this.orbitAngle) * this.orbitRadius;
                
                // Rotación apuntando en dirección de la órbita (tangente +/- ajuste)
                this.rotation = this.orbitAngle + Math.PI;

                this.rocketOrbitTime -= timeScale;
                if (this.rocketOrbitTime <= 0) {
                    this.rocketState = 'attack';
                }
            } else {
                if (distToVIP > 0) {
                    this.x += (dx / distToVIP) * this.baseSpeed * speedMultiplier * timeScale;
                    this.y += (dy / distToVIP) * this.baseSpeed * speedMultiplier * timeScale;
                }
                // Apuntar directamente hacia el VIP
                this.rotation = Math.atan2(dy, dx) + Math.PI / 2;
            }
        } else if (distToVIP > 0) {
            this.x += (dx / distToVIP) * this.baseSpeed * speedMultiplier * timeScale;
            this.y += (dy / distToVIP) * this.baseSpeed * speedMultiplier * timeScale;
            this.rotation += 0.05 * timeScale;
        }

        const hdx = this.x - Hole.x;
        const hdy = this.y - Hole.y;
        const distToHole = Math.sqrt(hdx * hdx + hdy * hdy);

        // Succión del Imán (Upgrade) - Solo si es sólido
        if (upgrades.magnet && distToHole < Hole.radius * 2 && !this.falling && this.isSolid) {
            const pullForce = 0.05;
            this.x -= (hdx / distToHole) * pullForce * (Hole.radius * 2 - distToHole) * 0.1;
            this.y -= (hdy / distToHole) * pullForce * (Hole.radius * 2 - distToHole) * 0.1;
        }

        if (distToHole < Hole.radius - 8 && this.isSolid) {
            this.falling = true;
        }

        // VIP collision (El fantasma mata al VIP incuso cuando está invisible)
        if (distToVIP < VIP.radius + this.width / 2 && !this.falling) {
            if (VIP.hasShield) {
                VIP.hasShield = false;
                this.falling = true; // El bloque que golpeó el escudo es destruido (aunque sea invisible, el escudo es de plasma)
                screenShakeTime = 20;
                flashTime = 5;
                spawnParticles(VIP.x, VIP.y, '#00f2fe', 20);
                playBossDestroySound();
            } else {
                let deathMsg = t.deathEnemy;
                if (this.isGhost) deathMsg = t.deathGhost || 'Death by Ghost';
                if (this.isRocket) deathMsg = t.deathRocket || 'Direct Rocket impact!';
                gameOver(deathMsg);
            }
        }
    }

    draw() {
        if (!this.active) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.scale(this.scale, this.scale);

        if (this.isGhost && !this.falling) {
            ctx.globalAlpha = this.isSolid ? 0.9 : 0.25;
            ctx.shadowBlur = this.isSolid ? 15 : 0;
            ctx.shadowColor = '#ffffff';
        } else if (this.isRocket) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff4757';
        } else {
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
        }

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
        const speed = 2; // Velocidad reducida a la mitad
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.active = true;
        this.falling = false;
        this.scale = 1;
    }

    update() {
        if (!this.active) return;

        if (this.falling) {
            this.scale *= 0.8;
            this.x += (Hole.x - this.x) * 0.2;
            this.y += (Hole.y - this.y) * 0.2;

            if (this.scale < 0.1) {
                this.active = false;
                spawnParticles(Hole.x, Hole.y, this.color, 30);
                playBossDestroySound();
                triggerVibration('light'); // Patrón explosión de jefe
                score += 10;
                applyCombo();
                screenShakeTime = 15;
            }
            return;
        }

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

        // Succión del Imán (Upgrade) - Solo afecta un poco para facilitar el luring
        if (upgrades.magnet && dist < Hole.radius * 3 && !this.falling) {
            this.vx -= (dx / dist) * 0.05;
            this.vy -= (dy / dist) * 0.05;
        }

        if (dist < Hole.radius + this.radius) {
            // Solo puede morir si estamos en cámara lenta y está lo suficientemente cerca
            if (slowMoTimer > 0 && dist < Hole.radius) {
                this.falling = true;
            } else {
                let nx = dx / dist;
                let ny = dy / dist;
                let dotProduct = this.vx * nx + this.vy * ny;

                if (dotProduct < 0) {
                    this.vx -= 2 * dotProduct * nx;
                    this.vy -= 2 * dotProduct * ny;
                    this.vx *= 1.05;
                    this.vy *= 1.05;

                    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    if (currentSpeed > 5) { // Reducida la velocidad máxima de rebote de 9 a 5
                        this.vx = (this.vx / currentSpeed) * 5;
                        this.vy = (this.vy / currentSpeed) * 5;
                    }

                    // Massive shake when impacting player
                    screenShakeTime = 20;
                    spawnParticles(this.x, this.y, this.color, 20);
                }

                this.x = Hole.x + nx * (Hole.radius + this.radius + 1);
                this.y = Hole.y + ny * (Hole.radius + this.radius + 1);
            }
        }

        const vdx = this.x - VIP.x;
        const vdy = this.y - VIP.y;
        if (Math.sqrt(vdx * vdx + vdy * vdy) < VIP.radius + this.radius) {
            if (VIP.hasShield) {
                VIP.hasShield = false;
                this.vx *= -1.5; // Rebota fuerte contra el escudo
                this.vy *= -1.5;
                screenShakeTime = 30;
                flashTime = 5;
                spawnParticles(VIP.x, VIP.y, '#00f2fe', 30);
                playBossDestroySound();
            } else {
                screenShakeTime = 30;
                gameOver(t.deathBoss);
            }
        }
    }

    draw() {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.shadowBlur = 25;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.restore();
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
    let valid = false;
    let attempts = 0;
    while (!valid && attempts < 10) {
        if (Math.random() > 0.5) {
            spawnX = Math.random() > 0.5 ? -30 : canvas.width + 30;
            spawnY = Math.random() * canvas.height;
        } else {
            spawnX = Math.random() * canvas.width;
            spawnY = Math.random() > 0.5 ? -30 : canvas.height + 30;
        }
        
        // Evitar que aparezca encima del VIP
        const dx = spawnX - VIP.x;
        const dy = spawnY - VIP.y;
        if (Math.sqrt(dx * dx + dy * dy) > 200) {
            valid = true;
        }
        attempts++;
    }
    invincibleBlocks.push(new InvincibleBlock(spawnX, spawnY));
}

function spawnRocket() {
    let spawnX, spawnY;
    let valid = false;
    let attempts = 0;
    while (!valid && attempts < 20) {
        const edge = Math.floor(Math.random() * 4);
        const padding = 60;
        if (edge === 0) { spawnX = Math.random() * canvas.width; spawnY = -padding; }
        else if (edge === 1) { spawnX = canvas.width + padding; spawnY = Math.random() * canvas.height; }
        else if (edge === 2) { spawnX = Math.random() * canvas.width; spawnY = canvas.height + padding; }
        else { spawnX = -padding; spawnY = Math.random() * canvas.height; }

        const dx = spawnX - VIP.x;
        const dy = spawnY - VIP.y;
        if (Math.sqrt(dx * dx + dy * dy) > 350) { valid = true; }
        attempts++;
    }
    blocks.push(new Block(spawnX, spawnY, false, true));
}

function spawnBlock() {
    blocksConfig.frameCount += timeScale;
    let currentSpawnRate = Math.max(25, blocksConfig.spawnRate - (score * 0.6));

    if (blocksConfig.frameCount >= currentSpawnRate) {
        blocksConfig.frameCount = 0;
        let spawnX, spawnY;
        let valid = false;
        let attempts = 0;

        while (!valid && attempts < 10) {
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

            // Distancia de seguridad para evitar Instakill
            const dx = spawnX - VIP.x;
            const dy = spawnY - VIP.y;
            if (Math.sqrt(dx * dx + dy * dy) > 250) {
                valid = true;
            }
            attempts++;
        }
        
        let isGhost = false;
        // Empiezan a aparecer fantasmas después de los 25 puntos
        if (score > 25 && Math.random() < 0.20) {
            isGhost = true;
        }
        
        blocks.push(new Block(spawnX, spawnY, isGhost));
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

    // Colisión Agujero → VIP: el jugador puede empujar la esfera
    const hvdx = VIP.x - Hole.x;
    const hvdy = VIP.y - Hole.y;
    const hvDist = Math.sqrt(hvdx * hvdx + hvdy * hvdy);
    const minDist = Hole.radius + VIP.radius;
    if (hvDist < minDist && hvDist > 0) {
        const nx = hvdx / hvDist;
        const ny = hvdy / hvDist;

        // Impulso: cuanto más rápido se mueve el Hole hacia el VIP, más fuerte lo empuja
        const holeSpeedToward = (Hole.x - mouse.x) * -nx + (Hole.y - mouse.y) * -ny;
        const pushStrength = Math.max(3, Math.min(8, Math.abs(holeSpeedToward) * 0.5 + 4));

        VIP.vx = nx * pushStrength;
        VIP.vy = ny * pushStrength;

        // Separar para que no se superpongan
        VIP.x = Hole.x + nx * (minDist + 1);
        VIP.y = Hole.y + ny * (minDist + 1);
    }

    spawnBlock();

    // Logica del Cohete (Rocket) cada 100 puntos a partir de 150
    const currentRocketMilestone = Math.floor((score - 50) / 100);
    if (score >= 150 && currentRocketMilestone > lastRocketMilestone) {
        lastRocketMilestone = currentRocketMilestone;
        spawnRocket();
    }

    const currentMilestone = Math.floor(score / 50);
    if (currentMilestone > lastInvincibleMilestone) {
        lastInvincibleMilestone = currentMilestone;
        const targetCount = currentMilestone;
        const toSpawn = Math.max(0, targetCount - invincibleBlocks.length);
        for (let i = 0; i < toSpawn; i++) {
            spawnInvincible();
        }
    }

    blocks.forEach(block => block.update());
    blocks = blocks.filter(block => block.active);

    invincibleBlocks.forEach(boss => boss.update());
    invincibleBlocks = invincibleBlocks.filter(boss => boss.active);

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
        scoreStr += ` <span style="color:#00f2fe; margin-left: 10px; font-size: 0.9rem; letter-spacing: 2px;">${t.slowMo}</span>`;
    }

    let hudStr = `${t.points}: ${scoreStr}`;
    scoreDisplay.innerHTML = hudStr;

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
    invincibleBlocks.forEach(boss => { if (boss.falling) boss.draw(); });
    Hole.draw();
    blocks.forEach(block => { if (!block.falling) block.draw(); });
    invincibleBlocks.forEach(boss => { if (!boss.falling) boss.draw(); });

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
    lastRocketMilestone = 0; // Reinicia el hito del cohete al empezar
    speedMultiplier = 1;
    blocks = [];
    invincibleBlocks = [];
    particles = [];
    lastInvincibleMilestone = 0;
    blocksConfig.frameCount = 0;

    // Aplicar Upgrades Permanentes
    Hole.radius = Math.min(canvas.width, canvas.height) * 0.1;
    if (upgrades.biggerHole) Hole.radius *= 1.15;
    
    VIP.hasShield = upgrades.shield;

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
    triggerVibration('heavy'); // Patrón pesado de derrota

    gameState = 'GAMEOVER';
    hud.classList.remove('active');
    gameOverScreen.classList.add('active');
    deathReason.innerText = reason;
    finalScoreDisplay.innerText = `${t.finalScore}: ${score}`;
    
    // Convert score to coins
    totalCoins += score;
    localStorage.setItem('devourer_total_coins', totalCoins);
    if (startCoinsDisplay) startCoinsDisplay.innerText = totalCoins;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('devourer_high_score', highScore);
        startHighScoreDisplay.innerText = highScore;
        
        // Guardar en la nube si está logueado y es un nuevo récord
        if (window.FirebaseAPI && currentUser) {
            console.log(`[HIGHSCORE] Local check passed: ${score} > Old ${highScore - score}`); 
            window.FirebaseAPI.saveScore(score);
        }
    } else {
        console.log(`[HIGHSCORE] Local check skipped: ${score} is not higher than ${highScore}`);
    }
    gameOverHighScoreDisplay.innerText = `${t.bestScore}: ${highScore}`;

    // Lógica de Anuncios: Mostrar un Interstitial cada 3 muertes
    deathsCount++;
    if (deathsCount >= 3) {
        deathsCount = 0;
        showInterstitialAd();
    }
    localStorage.setItem('devourer_deaths_count', deathsCount);
}

function updateStoreUI() {
    storeItemsContainer.innerHTML = '';
    
    SHOP_ITEMS.forEach(item => {
        const isOwned = ownedItems.includes(item.id);
        const isEquipped = equippedSkin === item.id;
        const canAfford = totalCoins >= item.price;
        
        const itemEl = document.createElement('div');
        itemEl.className = 'store-item';
        
        // Determinar texto y clase del botón
        let btnText = t.buy;
        let btnClass = 'buy-btn';
        
        if (isOwned) {
            if (item.type === 'skin') {
                if (isEquipped) {
                    btnText = t.equipped;
                    btnClass += ' equipped';
                } else {
                    btnText = t.equip;
                }
            } else {
                btnText = t.owned;
                btnClass += ' owned';
            }
        } else if (!canAfford) {
            btnText = t.insufficient;
            btnClass += ' insufficient';
        }

        const nameKey = item.id.replace(/-([a-z])/, (m, c) => c.toUpperCase()); // e.g. skinNeon
        const descKey = nameKey + 'Desc';

        itemEl.innerHTML = `
            <div class="item-icon ${item.icon}">${item.value || ''}</div>
            <div class="item-name">${t[nameKey]}</div>
            <div class="item-desc">${t[descKey]}</div>
            ${!isOwned ? `<div class="item-price">🪙 ${item.price}</div>` : ''}
            <button class="${btnClass}" data-id="${item.id}">${btnText}</button>
        `;
        
        const btn = itemEl.querySelector('button');
        btn.addEventListener('click', () => handleStoreAction(item));
        
        storeItemsContainer.appendChild(itemEl);
    });
}

function handleStoreAction(item) {
    const isOwned = ownedItems.includes(item.id);
    
    if (isOwned) {
        if (item.type === 'skin' && equippedSkin !== item.id) {
            equippedSkin = item.id;
            localStorage.setItem('devourer_equipped_skin', equippedSkin);
            updateStoreUI();
        }
        return;
    }
    
    if (totalCoins >= item.price) {
        // Comprar
        totalCoins -= item.price;
        ownedItems.push(item.id);
        
        // Aplicar efectos permanentes de upgrades
        if (item.id === 'upgrade-shield') upgrades.shield = true;
        if (item.id === 'upgrade-size') upgrades.biggerHole = true;
        if (item.id === 'upgrade-magnet') upgrades.magnet = true;
        
        localStorage.setItem('devourer_total_coins', totalCoins);
        localStorage.setItem('devourer_owned_items', JSON.stringify(ownedItems));
        localStorage.setItem('devourer_upgrades', JSON.stringify(upgrades));
        
        startCoinsDisplay.innerText = totalCoins;
        storeTotalCoinsDisplay.innerText = totalCoins;
        
        updateStoreUI();
    }
}

storeBtn.addEventListener('click', () => {
    startScreen.classList.remove('active');
    storeTotalCoinsDisplay.innerText = totalCoins;
    updateStoreUI();
    storeScreen.classList.add('active');
});

closeStoreBtn.addEventListener('click', () => {
    storeScreen.classList.remove('active');
    startScreen.classList.add('active');
});

rankingBtn.addEventListener('click', async () => {
    startScreen.classList.remove('active');
    leaderboardScreen.classList.add('active');
    
    leaderboardList.innerHTML = `<li style="text-align: center; color: #a0a0a0;">${t.loading}</li>`;
    
    if (window.FirebaseAPI) {
        const scores = await window.FirebaseAPI.getLeaderboard();
        leaderboardList.innerHTML = '';
        
        if (scores.length === 0) {
            leaderboardList.innerHTML = `<li style="text-align: center; color: #a0a0a0;">No data yet.</li>`;
        } else {
            scores.forEach((s, index) => {
                const li = document.createElement('li');
                li.className = 'leaderboard-item';
                
                const avatarStr = s.photoURL 
                    ? `<img src="${s.photoURL}" class="lb-avatar" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
                    : `<div class="lb-avatar"></div>`;

                li.innerHTML = `
                    <div class="lb-rank">#${index + 1}</div>
                    ${avatarStr}
                    <div class="lb-name">${s.username || t.guest}</div>
                    <div class="lb-score">${s.score}</div>
                `;
                leaderboardList.appendChild(li);
            });
        }
    }
});

closeLeaderboardBtn.addEventListener('click', () => {
    leaderboardScreen.classList.remove('active');
    startScreen.classList.add('active');
});

// Inicializar Firebase Auth Listeners (Esperar que cargue el módulo)
const fbInitInterval = setInterval(() => {
    if (window.FirebaseAPI) {
        clearInterval(fbInitInterval);
        
        window.FirebaseAPI.onAuthChange(async (user) => {
            currentUser = user;
            if (user) {
                loginBtn.innerHTML = `${t.logout} (${user.displayName || t.guest})`;
                loginBtn.style.color = 'var(--danger)';
                loginBtn.style.borderColor = 'rgba(233, 69, 96, 0.4)';
                if (deleteAccountBtn) deleteAccountBtn.style.display = 'block';

                // Sincronizar HighScore local con la nube al loguearse
                const cloudScore = await window.FirebaseAPI.getUserScore(user.uid);
                if (cloudScore > highScore) {
                    // La nube tiene un puntaje mejor, lo bajamos al dispositivo
                    highScore = cloudScore;
                    localStorage.setItem('devourer_high_score', highScore);
                    if (startHighScoreDisplay) startHighScoreDisplay.innerText = highScore;
                } else if (highScore > cloudScore) {
                    // El dispositivo tiene un puntaje mejor, lo subimos a la nube
                    console.log(`Subiendo récord local (${highScore}) a la nube (${cloudScore})`);
                    await window.FirebaseAPI.saveScore(highScore);
                    // Avisar al usuario si está en el menú principal
                    if (startScreen.classList.contains('active')) {
                        setTimeout(() => alert(t.scoreSynced || '¡Récord local sincronizado a la nube!'), 500);
                    }
                }
            } else {
                loginBtn.innerHTML = t.loginGoogle;
                loginBtn.style.color = '#fff';
                loginBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                if (deleteAccountBtn) deleteAccountBtn.style.display = 'none';
            }
        });

        loginBtn.addEventListener('click', () => {
            if (currentUser) {
                window.FirebaseAPI.logout();
            } else {
                window.FirebaseAPI.loginWithGoogle();
            }
        });

        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', async () => {
                if (confirm(t.deleteAccountConfirm)) {
                    if (currentUser && window.FirebaseAPI) {
                        try {
                            // Ensure local state is wiped so it doesn't re-upload on next death
                            highScore = 0;
                            localStorage.removeItem('devourer_high_score');
                            if (startHighScoreDisplay) startHighScoreDisplay.innerText = 0;
                            
                            await window.FirebaseAPI.deleteAccount(currentUser.uid);
                            alert(t.accountDeleted);
                        } catch (e) {
                            alert("Error: " + e.message);
                        }
                    }
                }
            });
        }
    }
}, 100);

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

menuBtn.addEventListener('click', () => {
    gameOverScreen.classList.remove('active');
    startScreen.classList.add('active');
    drawGrid(); // Redibujar la cuadrícula de fondo
});

drawGrid();
Hole.draw();
VIP.draw();
