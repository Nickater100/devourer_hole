// El juego en sí: simulación a 60 Hz fijos (igual en pantallas de 60, 90 o
// 120 Hz), dibujo en el canvas y modos supervivencia / campaña / demo del menú.
import { LEVELS, POWERUPS, SKINS, TICK, WORLDS, LEVELS_PER_WORLD } from './config.js';
import { save } from './storage.js';
import { t, fmt } from './i18n.js';
import { sfx, setMusic } from './audio.js';
import { vibrate } from './platform.js';
import { FX } from './fx.js';
import { Background } from './backgrounds.js';
import * as R from './render.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const COMBO_WINDOW = 150;

// Arena de referencia: un celular de 9:19.5 mide unos 96×208 U.
const ARENA_AREA = 20000;
const REF_SPAWN_DISTANCE = 97.5;
// Distancia media (en U) desde un punto de aparición en el borde hasta el
// centro: cada borde se elige con igual probabilidad, como en edgePoint().
function meanSpawnDistance(w, h) {
    const pad = 8, N = 200;
    let sum = 0;
    for (let i = 0; i < N; i++) {
        const fx = (i + 0.5) / N;
        sum += Math.hypot((fx - 0.5) * w, h / 2 + pad) * 2; // arriba y abajo
        sum += Math.hypot(w / 2 + pad, (fx - 0.5) * h) * 2; // izquierda y derecha
    }
    return sum / (4 * N);
}
const GRUNT_COLORS = ['#ff4d6d', '#ff9f1c', '#ff5e3a', '#f72585', '#e94560'];
const TYPE = {
    grunt:    { pts: 1, size: 6.5, speed: [0.13, 0.25] },
    ghost:    { pts: 3, size: 6.5, speed: [0.16, 0.26], color: '#d7e3ff' },
    rocket:   { pts: 4, size: 4.2, speed: [0.48, 0.56], color: '#ff4757' },
    splitter: { pts: 2, size: 9.5, speed: [0.1, 0.16], color: '#9b5de5' },
    shard:    { pts: 1, size: 3.8, speed: [0.3, 0.38], color: '#c77dff' },
};

export class Game {
    constructor(canvas, hooks) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.hooks = hooks;
        this.fx = new FX();
        this.bg = new Background();
        this.state = 'MENU';
        this.mode = 'attract';
        this.time = 0;
        this.acc = 0;
        this.last = performance.now();
        this.player = { x: 0, y: 0, tx: 0, ty: 0, r: 10, baseR: 10, mouth: 0, squash: 0, lookX: 0, lookY: 0, blink: 0, blinkT: 2, growT: 0, moved: 0 };
        this.pip = { x: 0, y: 0, vx: 0, vy: 0, r: 5, timer: 0, shields: 0, invuln: 0, fear: 0, hurtT: 0, blink: 0, blinkT: 3, hidden: false, lookX: 0, lookY: 0 };
        this.resetRun();
        this.resize();
        this.centerActors();
        this.bindInput();
        window.addEventListener('resize', () => this.resize());
        this.frame = this.frame.bind(this);
        requestAnimationFrame(this.frame);
    }

    // ---------- Pantalla ----------
    resize() {
        const w = window.innerWidth, h = window.innerHeight;
        const oldW = this.w || w, oldH = this.h || h;
        this.w = w; this.h = h;
        this.dpr = Math.min(2, window.devicePixelRatio || 1);
        this.canvas.width = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        // Unidad del juego: el área de la arena mide siempre ARENA_AREA U², así un
        // celular alto, una tablet o una PC tienen el mismo espacio para jugar.
        const oldU = this.U || 1;
        this.U = Math.sqrt(w * h / ARENA_AREA);
        // Y como la forma cambia la distancia media desde los bordes hasta Pip,
        // la velocidad de los enemigos se ajusta para que tarden lo mismo en llegar.
        this.arenaK = meanSpawnDistance(w / this.U, h / this.U) / REF_SPAWN_DISTANCE;
        // Reubicar proporcionalmente si gira la pantalla a mitad de partida
        const k = this.U / oldU;
        for (const o of [this.player, this.pip, ...this.enemies, ...this.bosses, ...this.powerups, ...this.coins]) {
            o.x *= w / oldW; o.y *= h / oldH;
            if ('tx' in o) { o.tx *= w / oldW; o.ty *= h / oldH; }
            if ('s' in o) o.s *= k;
            if ('vx' in o) { o.vx *= k; o.vy *= k; }
            if (o !== this.player && o !== this.pip && 'r' in o) o.r *= k;
            if ('orbitR' in o) o.orbitR *= k;
        }
        this.updateRadii();
        this.bg.set(this.bgId(), w, h, this.dpr);
    }

    bgId() {
        if (this.mode === 'campaign') return WORLDS[Math.floor(this.levelIndex / LEVELS_PER_WORLD)].bg;
        return save.background;
    }

    refreshBackground() { this.bg.set(this.bgId(), this.w, this.h, this.dpr); }

    updateRadii() {
        const U = this.U;
        this.player.baseR = 10 * U * (1 + 0.08 * (this.mode === 'attract' ? 0 : save.upgrades.size));
        if (!this.player.r || this.player.r < 1 || this.state !== 'PLAYING') this.player.r = this.player.baseR;
        this.pip.r = 5 * U;
    }

    centerActors() {
        const p = this.player, pip = this.pip;
        pip.x = this.w / 2; pip.y = this.h * 0.45; pip.vx = pip.vy = 0; pip.timer = 60;
        p.x = p.tx = this.w / 2;
        p.y = p.ty = Math.min(this.h - p.baseR * 1.6, this.h * 0.72);
    }

    // ---------- Entrada ----------
    // Táctil: arrastre RELATIVO (el dedo no tapa a la bola y no hay saltos al
    // tocar). Mouse: la bola sigue al puntero.
    bindInput() {
        let last = null;
        const playing = () => this.state === 'PLAYING' || this.state === 'INTRO';
        window.addEventListener('pointerdown', (e) => {
            if (!playing() || e.target.closest('button')) return;
            last = { x: e.clientX, y: e.clientY, id: e.pointerId };
        });
        window.addEventListener('pointermove', (e) => {
            if (!playing()) return;
            const p = this.player;
            if (e.pointerType === 'mouse') {
                p.moved += Math.hypot(e.clientX - p.tx, e.clientY - p.ty) > 2 ? 1.5 : 0;
                p.tx = e.clientX; p.ty = e.clientY;
            } else if (last && last.id === e.pointerId) {
                const sens = 1.35;
                const dx = (e.clientX - last.x) * sens, dy = (e.clientY - last.y) * sens;
                p.tx += dx; p.ty += dy;
                p.moved += Math.hypot(dx, dy) / this.U;
                last.x = e.clientX; last.y = e.clientY;
            }
            p.tx = clamp(p.tx, p.r * 0.6, this.w - p.r * 0.6);
            p.ty = clamp(p.ty, p.r * 0.6, this.h - p.r * 0.6);
        });
        const up = (e) => { if (last && last.id === e.pointerId) last = null; };
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        // Evitar scroll/zoom del WebView mientras se juega
        window.addEventListener('touchmove', (e) => { if (playing()) e.preventDefault(); }, { passive: false });
        // Teclado (escritorio): flechas/WASD
        this.keys = new Set();
        window.addEventListener('keydown', (e) => {
            this.keys.add(e.key.toLowerCase());
            if ((e.key === 'Escape' || e.key === 'p') && this.state === 'PLAYING') this.hooks.requestPause?.();
        });
        window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    }

    // ---------- Partidas ----------
    resetRun() {
        this.enemies = [];
        this.bosses = [];
        this.powerups = [];
        this.coins = [];
        this.bossQueue = [];
        this.fx?.reset();
        this.score = 0;
        this.kills = 0;
        this.ghostKills = 0;
        this.bossKills = 0;
        this.combo = 0;
        this.comboT = 0;
        this.mult = 1;
        this.maxMult = 1;
        this.bestCombo = 0;
        this.rageT = 0;
        this.rageMax = 1;
        this.freezeT = 0;
        this.timeScale = 1;
        this.spawnAcc = 0;
        this.puT = 60 * 8;
        this.ticks = 0;
        this.threat = 0;
        this.shake = 0;
        this.flash = 0;
        this.flashColor = '#fff';
        this.hitStop = 0;
        this.hitTaken = false;
        this.revived = false;
        this.runCoins = 0;
        this.tutorial = -1;
        this.deathT = 0;
    }

    start(mode, levelIndex = 0) {
        this.mode = mode;
        this.levelIndex = levelIndex;
        this.level = mode === 'campaign' ? LEVELS[levelIndex] : null;
        this.resetRun();
        this.updateRadii();
        this.player.r = this.player.baseR;
        this.player.growT = 0;
        this.pip.shields = save.upgrades.shield;
        this.pip.invuln = 0;
        this.pip.hidden = false;
        this.centerActors();
        this.refreshBackground();
        if (mode === 'campaign') {
            this.levelTimer = this.level.duration * 60;
            for (let i = 0; i < (this.level.boss || 0); i++) this.bossQueue.push(120 + i * 360);
        }
        if (mode === 'survival' && !save.tutorialDone) this.tutorial = 0;
        this.state = 'INTRO';
        this.introT = mode === 'campaign' ? 100 : 70;
        setMusic(1);
    }

    startAttract() {
        this.mode = 'attract';
        this.state = 'MENU';
        this.resetRun();
        this.updateRadii();
        this.player.r = this.player.baseR;
        this.pip.hidden = false;
        this.pip.shields = 0;
        this.centerActors();
        this.refreshBackground();
        setMusic(0);
    }

    pause() {
        if (this.state !== 'PLAYING' && this.state !== 'INTRO') return false;
        this.prevState = this.state;
        this.state = 'PAUSED';
        return true;
    }

    resume() {
        if (this.state !== 'PAUSED') return;
        this.state = this.prevState || 'PLAYING';
        this.last = performance.now();
        this.acc = 0;
    }

    revive() {
        this.revived = true;
        for (const e of this.enemies) this.fx.burst(e.x, e.y, e.color, 6, { kind: 'chunk', speed: this.U, size: this.U });
        this.enemies = [];
        // Las Anomalías vuelven a entrar desde afuera
        const n = this.bosses.length;
        this.bosses = [];
        for (let i = 0; i < n; i++) this.bossQueue.push(180 + i * 120);
        this.pip.hidden = false;
        this.pip.invuln = 180;
        this.centerActors();
        this.combo = 0; this.comboT = 0; this.mult = 1; this.rageT = 0;
        this.timeScale = 1;
        this.state = 'PLAYING';
        this.fx.ring(this.pip.x, this.pip.y, '#7ff3ff', 40 * this.U, { life: 0.7, width: 10 });
        sfx.powerup();
        setMusic(1);
    }

    // Resultado final de supervivencia.
    finishSurvival() {
        this.state = 'OVER';
        setMusic(0);
        return {
            score: this.score,
            kills: this.kills,
            maxMult: this.maxMult,
            bestCombo: this.bestCombo,
            seconds: Math.floor(this.ticks / 60),
            coins: this.score + this.runCoins,
        };
    }

    // ---------- Bucle ----------
    frame(now) {
        // El timestamp de rAF puede ser anterior a un performance.now() previo
        // (p. ej. al reanudar): nunca dejar que dt sea negativo.
        const dt = clamp((now - this.last) / 1000, 0, 0.1);
        this.last = now;
        this.time += dt;
        const running = this.state === 'PLAYING' || this.state === 'INTRO' || this.state === 'DYING' || this.state === 'MENU';
        if (running) {
            this.acc += dt;
            let n = 0;
            while (this.acc >= TICK && n < 6) { this.step(); this.acc -= TICK; n++; }
            if (n === 6) this.acc = 0;
        }
        this.render(dt);
        this.hooks.hud?.(this);
        requestAnimationFrame(this.frame);
    }

    step() {
        const U = this.U;
        const p = this.player, pip = this.pip;
        const attract = this.mode === 'attract';

        if (this.hitStop > 0) { this.hitStop--; return; }

        const targetTS = this.state === 'DYING' ? 0.12 : this.rageT > 0 ? 0.33 : 1;
        this.timeScale += (targetTS - this.timeScale) * 0.08;
        const ts = this.timeScale;
        this.ticks++;

        // --- Intro ---
        if (this.state === 'INTRO') {
            this.introT--;
            if (this.introT <= 0) {
                this.state = 'PLAYING';
                this.hooks.banner?.(t.go, '', '#ffe066');
                sfx.warn();
            }
        }

        // --- Jugador ---
        if (attract) this.attractAI();
        this.keyboardMove();
        p.x += (p.tx - p.x) * 0.24;
        p.y += (p.ty - p.y) * 0.24;
        p.x = clamp(p.x, p.r * 0.6, this.w - p.r * 0.6);
        p.y = clamp(p.y, p.r * 0.6, this.h - p.r * 0.6);
        const goalR = p.baseR * (p.growT > 0 ? 1.45 : 1) * (this.rageT > 0 ? 1.08 : 1);
        p.r += (goalR - p.r) * 0.1;
        if (p.growT > 0) p.growT--;
        p.mouth = Math.max(0, p.mouth - 0.07);
        p.squash *= 0.85;
        p.blinkT -= TICK;
        if (p.blinkT < 0) { p.blink = 1; p.blinkT = rnd(2, 5); }
        p.blink = Math.max(0, p.blink - 0.12);

        // --- Pip ---
        if (!pip.hidden) this.updatePip(ts);

        // Empujón bola → Pip
        const d = dist(p, pip);
        const minD = p.r + pip.r;
        if (!pip.hidden && d < minD && d > 0) {
            const nx = (pip.x - p.x) / d, ny = (pip.y - p.y) / d;
            const push = clamp(Math.hypot(p.tx - p.x, p.ty - p.y) * 0.08 + 1.1, 0.8, 2.2) * U;
            pip.vx = nx * push * 0.5; pip.vy = ny * push * 0.5;
            pip.x = p.x + nx * (minD + 1);
            pip.y = p.y + ny * (minD + 1);
            pip.timer = 0;
        }

        // --- Temporizadores ---
        if (this.comboT > 0 && --this.comboT === 0) { this.combo = 0; this.mult = 1; }
        if (this.rageT > 0 && --this.rageT === 0 && !attract) setMusic(1);
        if (this.freezeT > 0) this.freezeT--;
        if (this.shake > 0) this.shake *= 0.9;
        if (this.shake < 0.3) this.shake = 0;
        if (this.flash > 0) this.flash -= 0.06;

        const active = this.state === 'PLAYING' || this.state === 'MENU';
        if (active) {
            this.spawning(ts);
            if (!attract) this.powerupSpawning(ts);
        }

        if (this.state !== 'INTRO') {
            this.updateEnemies(ts);
            this.updateBosses(ts);
            this.updatePowerups(ts);
            this.updateCoins();
        }
        this.fx.update(TICK, Math.max(ts, 0.35));

        // --- Muerte ---
        if (this.state === 'DYING') {
            if (--this.deathT <= 0) {
                this.state = 'DEAD';
                this.hooks.death?.(this.deathReason);
            }
            return;
        }

        if (this.state !== 'PLAYING') return;

        // --- Tutorial ---
        if (this.tutorial >= 0) this.updateTutorial();

        // --- Objetivos ---
        if (this.mode === 'survival') this.survivalMilestones();
        if (this.mode === 'campaign') this.campaignTick();
    }

    keyboardMove() {
        if (!this.keys.size || (this.state !== 'PLAYING' && this.state !== 'INTRO')) return;
        const p = this.player, s = 1.6 * this.U;
        const k = this.keys;
        if (k.has('arrowleft') || k.has('a')) p.tx -= s;
        if (k.has('arrowright') || k.has('d')) p.tx += s;
        if (k.has('arrowup') || k.has('w')) p.ty -= s;
        if (k.has('arrowdown') || k.has('s')) p.ty += s;
        p.tx = clamp(p.tx, p.r * 0.6, this.w - p.r * 0.6);
        p.ty = clamp(p.ty, p.r * 0.6, this.h - p.r * 0.6);
        p.moved += 1;
    }

    attractAI() {
        // En el menú la bola juega sola: persigue al cubo más cercano a Pip.
        const p = this.player;
        let best = null, bd = Infinity;
        for (const e of this.enemies) {
            if (e.eaten) continue;
            const dd = dist(e, this.pip);
            if (dd < bd) { bd = dd; best = e; }
        }
        if (best) { p.tx = best.x; p.ty = best.y; }
        else { p.tx = this.w / 2 + Math.cos(this.time * 0.7) * this.w * 0.25; p.ty = this.h / 2 + Math.sin(this.time * 1.1) * this.h * 0.2; }
    }

    updatePip(ts) {
        const pip = this.pip, U = this.U;
        pip.timer += ts;
        if (pip.timer > 60 || (pip.vx === 0 && pip.vy === 0)) {
            pip.timer = 0;
            const cx = this.w / 2, cy = this.h / 2;
            const toC = Math.hypot(cx - pip.x, cy - pip.y);
            const ang = toC > Math.min(this.w, this.h) * 0.28
                ? Math.atan2(cy - pip.y, cx - pip.x) + rnd(-1, 1) * Math.PI / 2
                : rnd(0, TAU);
            const sp = 0.42 * U;
            pip.vx = Math.cos(ang) * sp; pip.vy = Math.sin(ang) * sp;
        }
        // Frenado suave después de un empujón
        const sp = Math.hypot(pip.vx, pip.vy), base = 0.42 * U;
        if (sp > base) { pip.vx *= 0.96; pip.vy *= 0.96; }
        pip.x += pip.vx * ts; pip.y += pip.vy * ts;
        const m = pip.r + 4 * U;
        if (pip.x < m) { pip.x = m; pip.vx = Math.abs(pip.vx); }
        if (pip.x > this.w - m) { pip.x = this.w - m; pip.vx = -Math.abs(pip.vx); }
        if (pip.y < m) { pip.y = m; pip.vy = Math.abs(pip.vy); }
        if (pip.y > this.h - m) { pip.y = this.h - m; pip.vy = -Math.abs(pip.vy); }
        if (pip.invuln > 0) pip.invuln--;
        if (pip.hurtT > 0) pip.hurtT--;
        pip.blinkT -= TICK;
        if (pip.blinkT < 0) { pip.blink = 1; pip.blinkT = rnd(2, 4); }
        pip.blink = Math.max(0, pip.blink - 0.12);

        // Miedo según el enemigo más cercano
        let nd = Infinity, ne = null;
        for (const e of this.enemies) { if (e.eaten) continue; const dd = dist(e, pip); if (dd < nd) { nd = dd; ne = e; } }
        for (const b of this.bosses) { const dd = dist(b, pip) - b.r; if (dd < nd) { nd = dd; ne = b; } }
        pip.fear += (clamp(1 - (nd - 8 * U) / (22 * U), 0, 1) - pip.fear) * 0.15;
        if (ne) { pip.lookX = (ne.x - pip.x) / (nd || 1); pip.lookY = (ne.y - pip.y) / (nd || 1); }
    }

    // ---------- Aparición de enemigos ----------
    difficulty() {
        if (this.mode === 'campaign') return { speed: this.level.speed, rate: this.level.rate, mix: this.level.mix };
        if (this.mode === 'attract') return { speed: 0.9, rate: 55, mix: { g: 1, h: 0.15, s: 0.1 } };
        const s = this.score;
        return {
            speed: Math.min(2.3, 1 + s * 0.0065),
            rate: Math.max(26, 85 - s * 0.45) * (this.tutorial === 0 || this.tutorial === 1 ? 1.4 : 1),
            mix: { g: 1, h: s > 25 ? 0.25 : 0, s: s > 75 ? 0.18 : 0, r: s > 150 ? 0.07 : 0 },
            pack: this.tutorial >= 0 && this.tutorial < 2 ? 0 : Math.min(0.45, 0.18 + s * 0.002),
        };
    }

    spawning(ts) {
        const diff = this.difficulty();
        this.speedMult = diff.speed;
        if (this.mode === 'attract' && this.enemies.length > 9) return;
        this.spawnAcc += ts;
        if (this.spawnAcc >= diff.rate) {
            this.spawnAcc = 0;
            const mix = diff.mix;
            const total = (mix.g || 0) + (mix.h || 0) + (mix.r || 0) + (mix.s || 0);
            let roll = Math.random() * total;
            let type = 'grunt';
            for (const [k, name] of [['h', 'ghost'], ['r', 'rocket'], ['s', 'splitter']]) {
                if ((roll -= mix[k] || 0) < 0) { type = name; break; }
            }
            const first = this.spawnEnemy(type);
            // A veces llegan en manada desde el mismo lado: así salen los combos.
            const pack = diff.pack ?? 0.25;
            if (type === 'grunt' && Math.random() < pack) {
                const n = 1 + Math.floor(Math.random() * 3);
                for (let i = 0; i < n; i++) {
                    const off = (i + 1) * this.U * 9 * (i % 2 ? 1 : -1);
                    const horizEdge = first.y < 0 || first.y > this.h;
                    this.spawnEnemy('grunt', horizEdge ? { x: first.x + off, y: first.y - Math.sign(first.y) * this.U * 4 * i } : { x: first.x + this.U * 4 * i * Math.sign(first.x), y: first.y + off });
                }
            }
        }
        // Anomalías en cola (sin setTimeout: así no se filtran entre partidas)
        for (let i = this.bossQueue.length - 1; i >= 0; i--) {
            if ((this.bossQueue[i] -= 1) <= 0) { this.bossQueue.splice(i, 1); this.spawnBoss(); }
        }
    }

    edgePoint(pad, minFromPip) {
        let x, y;
        for (let tries = 0; tries < 12; tries++) {
            const edge = Math.floor(Math.random() * 4);
            if (edge === 0) { x = rnd(0, this.w); y = -pad; }
            else if (edge === 1) { x = this.w + pad; y = rnd(0, this.h); }
            else if (edge === 2) { x = rnd(0, this.w); y = this.h + pad; }
            else { x = -pad; y = rnd(0, this.h); }
            if (Math.hypot(x - this.pip.x, y - this.pip.y) > minFromPip) break;
        }
        return { x, y };
    }

    spawnEnemy(type, at) {
        const U = this.U, def = TYPE[type];
        const pos = at || this.edgePoint(8 * U, 50 * U);
        const e = {
            type, x: pos.x, y: pos.y,
            s: def.size * U,
            speed: rnd(def.speed[0], def.speed[1]), // en U por tick: se multiplica por this.U al moverse
            color: def.color || GRUNT_COLORS[Math.floor(Math.random() * GRUNT_COLORS.length)],
            solid: true, eaten: false, dead: false, scale: 1,
            seed: Math.random() * 100, phase: Math.random() * TAU, rot: 0,
        };
        if (type === 'rocket') {
            e.state = 'orbit';
            e.orbitT = 220;
            const cx = this.w / 2, cy = this.h / 2;
            e.ang = Math.atan2(e.y - cy, e.x - cx);
            e.orbitR = Math.hypot(e.x - cx, e.y - cy);
            e.dir = Math.random() < 0.5 ? 1 : -1;
        }
        this.enemies.push(e);
        return e;
    }

    spawnBoss() {
        const U = this.U;
        const pos = this.edgePoint(6 * U, 50 * U);
        const ang = Math.atan2(this.h / 2 - pos.y, this.w / 2 - pos.x) + rnd(-0.5, 0.5);
        const sp = 0.55 * U;
        this.bosses.push({ x: pos.x, y: pos.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 4.8 * U, eaten: false, scale: 1, entering: true });
        if (this.mode !== 'attract') {
            this.hooks.banner?.(t.anomaly, t.anomalyHint, '#ff4fd8');
            sfx.warn();
        }
    }

    // ---------- Enemigos ----------
    updateEnemies(ts) {
        const U = this.U, p = this.player, pip = this.pip;
        const frozen = this.freezeT > 0;
        const magnetLvl = this.mode === 'attract' ? 0 : save.upgrades.magnet;
        const speedMult = this.speedMult || 1;
        let nearest = null, nd = Infinity;

        for (const e of this.enemies) {
            if (e.dead) continue;
            if (e.eaten) {
                e.x += (p.x - e.x) * 0.3; e.y += (p.y - e.y) * 0.3;
                e.scale *= 0.75;
                e.rot += 0.3;
                if (e.scale < 0.08) e.dead = true;
                continue;
            }
            if (e.type === 'ghost') {
                e.phase += 0.045 * ts;
                e.solid = Math.sin(e.phase) > -0.25;
            }
            const spd = frozen ? 0 : e.speed * U * this.arenaK * speedMult * ts;
            const dx = pip.x - e.x, dy = pip.y - e.y;
            const dp = Math.hypot(dx, dy) || 1;

            if (e.type === 'rocket') {
                if (e.state === 'orbit') {
                    if (!frozen) {
                        e.ang += 0.018 * e.dir * ts * speedMult;
                        const target = Math.min(this.w, this.h) * 0.42;
                        if (e.orbitR > target) e.orbitR -= 1.5 * U * ts;
                        e.orbitT -= ts;
                    }
                    e.x = this.w / 2 + Math.cos(e.ang) * e.orbitR;
                    e.y = this.h / 2 + Math.sin(e.ang) * e.orbitR;
                    e.rot = e.ang + Math.PI / 2 * e.dir;
                    if (e.orbitT <= 0) { e.state = 'dive'; if (this.mode !== 'attract') sfx.warn(); }
                } else {
                    e.x += dx / dp * spd; e.y += dy / dp * spd;
                    e.rot = Math.atan2(dy, dx);
                }
                if (Math.random() < 0.5 * ts) this.fx.burst(e.x - Math.cos(e.rot) * e.s, e.y - Math.sin(e.rot) * e.s, Math.random() < 0.5 ? '#ffa502' : '#ff6b81', 1, { speed: 0.5 * U * 0.3, size: U * 0.7, life: 0.4 });
            } else if (e.fling > 0) {
                // Fragmentos recién salidos de un divisor
                e.x += e.vx * ts; e.y += e.vy * ts;
                e.vx *= 0.9; e.vy *= 0.9;
                e.fling -= ts;
            } else {
                // Persecución con un leve zigzag para que se vean vivos
                const wob = Math.sin(this.ticks * 0.08 + e.seed) * 0.35;
                const nx = dx / dp, ny = dy / dp;
                e.x += (nx - ny * wob) * spd;
                e.y += (ny + nx * wob) * spd;
            }

            // Imán
            const dpl = Math.hypot(e.x - p.x, e.y - p.y) || 1;
            if (magnetLvl > 0 && e.solid && !frozen) {
                const range = p.r * (1.5 + 0.3 * magnetLvl);
                if (dpl < range) {
                    const f = U * (0.1 + 0.08 * magnetLvl) * (1 - dpl / range) * Math.max(ts, 0.5);
                    e.x -= (e.x - p.x) / dpl * f; e.y -= (e.y - p.y) / dpl * f;
                }
            }

            // ¡Ñam!
            if (e.solid && dpl < p.r * 0.86 + e.s * 0.2) { this.eat(e); continue; }

            // Golpe a Pip
            if (!pip.hidden && dp < pip.r + e.s * 0.42) { this.hitPip(e); continue; }

            if (dpl < nd) { nd = dpl; nearest = e; }
        }
        this.enemies = this.enemies.filter(e => !e.dead);

        // La bola mira al cubo más cercano
        const p2 = this.player;
        if (nearest && nd < 45 * U) { p2.lookX += ((nearest.x - p2.x) / nd - p2.lookX) * 0.2; p2.lookY += ((nearest.y - p2.y) / nd - p2.lookY) * 0.2; }
        else { const mx = clamp((p2.tx - p2.x) / (8 * U), -1, 1), my = clamp((p2.ty - p2.y) / (8 * U), -1, 1); p2.lookX += (mx - p2.lookX) * 0.1; p2.lookY += (my - p2.lookY) * 0.1; }
    }

    eat(e) {
        const U = this.U;
        e.eaten = true;
        if (this.mode === 'attract') {
            this.fx.burst(this.player.x, this.player.y, e.color, 8, { kind: 'chunk', speed: U * 0.8, size: U * 1.1 });
            this.player.mouth = 1; this.player.squash = 0.12;
            return;
        }
        this.kills++;
        if (e.type === 'ghost') this.ghostKills++;
        this.registerKill(TYPE[e.type].pts, e.x, e.y, e.color);
        sfx.chomp();
        if (e.type === 'splitter') {
            // Se parte en 3 fragmentos que salen despedidos
            const base = Math.random() * TAU;
            for (let i = 0; i < 3; i++) {
                const a = base + (i / 3) * TAU;
                const r = this.player.r * 1.25;
                const sh = this.spawnEnemy('shard', { x: this.player.x + Math.cos(a) * r, y: this.player.y + Math.sin(a) * r });
                sh.vx = Math.cos(a) * 1.6 * U; sh.vy = Math.sin(a) * 1.6 * U; sh.fling = 22;
            }
            this.fx.ring(this.player.x, this.player.y, '#c77dff', this.player.r * 2, { life: 0.35 });
        }
        if (Math.random() < (e.type === 'splitter' ? 0.3 : 0.04)) this.dropCoin(e.x, e.y, 1);
    }

    registerKill(base, x, y, color) {
        const U = this.U, p = this.player;
        this.combo++;
        this.comboT = COMBO_WINDOW;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        if (this.combo >= 5) {
            if (this.rageT <= 0) this.startRage();
            this.rageMax = (5 + save.upgrades.rage) * 60;
            this.rageT = this.rageMax;
            const newMult = Math.floor(this.combo / 5) + 1;
            if (newMult > this.mult) {
                this.fx.text(this.w / 2, this.h * 0.32, `${t.combo} x${newMult}`, '#ffe066', 9 * U * 0.5 + 18, { life: 1.1, big: true, rise: 20 });
            }
            this.mult = newMult;
        } else {
            this.mult = 1;
        }
        this.maxMult = Math.max(this.maxMult, this.mult);
        const pts = base * this.mult;
        this.score += pts;
        this.fx.text(x, y - 4 * U, `+${pts}`, this.mult > 1 ? '#ffe066' : '#ffffff', 4.5 * U + 6);
        sfx.eat(this.combo);
        vibrate('light');
        p.mouth = 1;
        p.squash = 0.14;
        this.fx.burst(p.x, p.y, color, 10, { kind: 'chunk', speed: U * 0.9, size: U * 1.3, life: 0.7 });
        this.fx.burst(p.x, p.y, color, 5, { speed: U * 0.7, size: U * 0.8, life: 0.5 });
    }

    startRage() {
        sfx.rage();
        vibrate('medium');
        setMusic(2);
        this.flash = 0.6; this.flashColor = '#ff8a3d';
        this.shake = 10;
        this.fx.ring(this.player.x, this.player.y, '#ff7a00', 60 * this.U, { life: 0.6, width: 14 });
        this.hooks.banner?.(t.rage, '', '#ff7a00');
    }

    hitPip(e, boss = false) {
        const pip = this.pip, U = this.U;
        const pop = () => {
            if (!boss) { e.dead = true; this.fx.burst(e.x, e.y, e.color, 14, { kind: 'chunk', speed: U, size: U * 1.2 }); }
            else { const a = Math.atan2(e.y - pip.y, e.x - pip.x); e.vx = Math.cos(a) * 1.2 * U; e.vy = Math.sin(a) * 1.2 * U; e.x = pip.x + Math.cos(a) * (pip.r + e.r + 2); e.y = pip.y + Math.sin(a) * (pip.r + e.r + 2); }
        };
        if (this.mode === 'attract') { pop(); return; }
        if (pip.invuln > 0) { pop(); return; }
        this.hitTaken = true;
        if (pip.shields > 0) {
            pip.shields--;
            pip.invuln = 75;
            pip.hurtT = 30;
            pop();
            this.shake = 18;
            this.flash = 0.5; this.flashColor = '#7ff3ff';
            this.fx.burst(pip.x, pip.y, '#7ff3ff', 24, { speed: U * 1.4, size: U });
            this.fx.ring(pip.x, pip.y, '#7ff3ff', 25 * U);
            this.fx.text(pip.x, pip.y - 10 * U, t.shieldBroken, '#7ff3ff', 4 * U + 8, { life: 1.1 });
            sfx.shield();
            vibrate('medium');
            return;
        }
        this.die(boss ? t.deathBoss : e.type === 'ghost' ? t.deathGhost : e.type === 'rocket' ? t.deathRocket : e.type === 'shard' ? t.deathShard : t.deathEnemy);
    }

    die(reason) {
        const pip = this.pip, U = this.U;
        this.state = 'DYING';
        this.deathT = 75;
        this.deathReason = reason;
        pip.hidden = true;
        this.shake = 30;
        this.flash = 1; this.flashColor = '#ff3b5c';
        this.fx.burst(pip.x, pip.y, '#9ff5d6', 40, { speed: U * 2.2, size: U * 1.4, life: 1.4 });
        this.fx.burst(pip.x, pip.y, '#ffffff', 20, { kind: 'chunk', speed: U * 1.8, size: U * 1.5, life: 1.2 });
        this.fx.ring(pip.x, pip.y, '#ff3b5c', 50 * U, { life: 0.8, width: 12 });
        sfx.death();
        vibrate('heavy');
        setMusic(0);
    }

    // ---------- Anomalías ----------
    updateBosses(ts) {
        const U = this.U, p = this.player, pip = this.pip;
        // Se la puede comer en Furia o siendo Gigante.
        const rage = (this.rageT > 0 || p.growT > 0) && this.mode !== 'attract';
        const slow = this.freezeT > 0 ? 0.35 : 1;
        for (const b of this.bosses) {
            if (b.eaten) {
                b.x += (p.x - b.x) * 0.3; b.y += (p.y - b.y) * 0.3; b.scale *= 0.8;
                if (b.scale < 0.08) b.dead = true;
                continue;
            }
            b.x += b.vx * ts * slow; b.y += b.vy * ts * slow;
            const m = b.r;
            if (b.entering) {
                if (b.x > m && b.x < this.w - m && b.y > m && b.y < this.h - m) b.entering = false;
            } else {
                let hit = false;
                if (b.x < m) { b.x = m; b.vx = Math.abs(b.vx); hit = true; }
                if (b.x > this.w - m) { b.x = this.w - m; b.vx = -Math.abs(b.vx); hit = true; }
                if (b.y < m) { b.y = m; b.vy = Math.abs(b.vy); hit = true; }
                if (b.y > this.h - m) { b.y = this.h - m; b.vy = -Math.abs(b.vy); hit = true; }
                if (hit) this.shake = Math.max(this.shake, 4);
            }
            const dx = b.x - p.x, dy = b.y - p.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d < p.r + b.r) {
                if (rage && d < p.r * 1.05) { this.eatBoss(b); continue; }
                const nx = dx / d, ny = dy / d;
                const dot = b.vx * nx + b.vy * ny;
                if (dot < 0) {
                    b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
                    b.vx *= 1.05; b.vy *= 1.05;
                    const sp = Math.hypot(b.vx, b.vy), max = 1.3 * U;
                    if (sp > max) { b.vx = b.vx / sp * max; b.vy = b.vy / sp * max; }
                    this.shake = Math.max(this.shake, 12);
                    this.fx.burst(b.x - nx * b.r, b.y - ny * b.r, '#ff00ff', 12, { speed: U, size: U });
                    p.squash = -0.15;
                    if (this.mode !== 'attract') { sfx.bounce(); vibrate('light'); }
                }
                b.x = p.x + nx * (p.r + b.r + 1);
                b.y = p.y + ny * (p.r + b.r + 1);
            }
            if (!pip.hidden && Math.hypot(b.x - pip.x, b.y - pip.y) < pip.r + b.r) this.hitPip(b, true);
        }
        this.bosses = this.bosses.filter(b => !b.dead);
    }

    eatBoss(b) {
        const U = this.U, p = this.player;
        b.eaten = true;
        this.kills++;
        this.bossKills++;
        this.registerKill(10, b.x, b.y, '#ff00ff');
        this.hitStop = 6;
        this.shake = 26;
        this.flash = 0.7; this.flashColor = '#ff4fd8';
        this.fx.burst(p.x, p.y, '#ff4fd8', 40, { speed: U * 2, size: U * 1.4, life: 1.2 });
        this.fx.ring(p.x, p.y, '#ff4fd8', 45 * U, { life: 0.7, width: 12 });
        sfx.boom();
        vibrate('medium');
        this.dropCoin(b.x, b.y, 8);
    }

    // ---------- Power-ups y monedas ----------
    powerupSpawning(ts) {
        if (this.mode === 'campaign' && !this.level.powerups) return;
        this.puT -= ts;
        if (this.puT > 0) return;
        const bossy = this.bosses.length > 0 || this.bossQueue.length > 0;
        this.puT = 60 * rnd(11, 16) * (1 - 0.12 * save.upgrades.luck) * (bossy ? 0.6 : 1);
        const U = this.U;
        const entries = Object.entries(POWERUPS).filter(([k]) => !(k === 'shield' && this.pip.shields >= 3));
        let roll = Math.random() * entries.reduce((s, [, d]) => s + d.weight, 0);
        // Con Anomalías en pantalla, el Gigante sale más seguido
        if (this.bosses.length && Math.random() < 0.35) roll = -1;
        let kind = this.bosses.length && roll < 0 ? 'grow' : entries[0][0];
        if (roll >= 0) for (const [k, d] of entries) if ((roll -= d.weight) < 0) { kind = k; break; }
        let x, y;
        for (let i = 0; i < 10; i++) {
            x = rnd(this.w * 0.12, this.w * 0.88); y = rnd(this.h * 0.18, this.h * 0.85);
            if (Math.hypot(x - this.pip.x, y - this.pip.y) > 18 * U && Math.hypot(x - this.player.x, y - this.player.y) > 25 * U) break;
        }
        this.powerups.push({ kind, x, y, r: 4.2 * U, life: 60 * 9, t: Math.random() * 10 });
        this.fx.ring(x, y, POWERUPS[kind].color, 12 * U, { life: 0.5 });
    }

    updatePowerups() {
        const p = this.player;
        for (const pu of this.powerups) {
            pu.life--;
            pu.t += TICK;
            if (Math.hypot(pu.x - p.x, pu.y - p.y) < p.r + pu.r * 0.4) { pu.dead = true; this.activate(pu); }
            if (pu.life <= 0) pu.dead = true;
        }
        this.powerups = this.powerups.filter(pu => !pu.dead);
    }

    activate(pu) {
        const U = this.U, p = this.player, pip = this.pip;
        const def = POWERUPS[pu.kind];
        sfx.powerup();
        vibrate('medium');
        this.fx.burst(pu.x, pu.y, def.color, 24, { speed: U * 1.5, size: U });
        this.fx.ring(pu.x, pu.y, def.color, 20 * U);
        let label = t['pu_' + pu.kind];
        switch (pu.kind) {
            case 'nova': {
                sfx.nova();
                const R = 38 * U;
                this.fx.ring(p.x, p.y, '#ff4fd8', R, { life: 0.6, width: 18 });
                this.flash = 0.6; this.flashColor = '#ff4fd8';
                this.shake = 20;
                for (const e of this.enemies) {
                    if (!e.eaten && Math.hypot(e.x - p.x, e.y - p.y) < R) {
                        e.eaten = true;
                        this.kills++;
                        if (e.type === 'ghost') this.ghostKills++;
                        this.registerKill(TYPE[e.type].pts, e.x, e.y, e.color);
                        this.fx.burst(e.x, e.y, e.color, 10, { kind: 'chunk', speed: U, size: U * 1.2 });
                    }
                }
                for (const b of this.bosses) {
                    const a = Math.atan2(b.y - p.y, b.x - p.x);
                    b.vx = Math.cos(a) * 1.3 * U; b.vy = Math.sin(a) * 1.3 * U;
                }
                break;
            }
            case 'freeze':
                sfx.freeze();
                this.freezeT = 200;
                this.flash = 0.4; this.flashColor = '#7fdcff';
                break;
            case 'shield':
                pip.shields = Math.min(3, pip.shields + 1);
                this.fx.ring(pip.x, pip.y, '#7ff3ff', 15 * U);
                break;
            case 'grow':
                p.growT = 60 * 6;
                break;
            case 'coins': {
                const n = 10 + Math.floor(Math.random() * 11);
                this.runCoins += n;
                sfx.coin();
                label = fmt(t.pu_coins, n);
                break;
            }
        }
        this.fx.text(pu.x, pu.y - 6 * U, label, def.color, 5 * U + 6, { life: 1.1 });
    }

    dropCoin(x, y, n) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, v = rnd(0.6, 1.4) * this.U;
            this.coins.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 60 * 6, t: Math.random() * 5 });
        }
    }

    updateCoins() {
        const p = this.player, U = this.U;
        for (const c of this.coins) {
            c.t += TICK; c.life--;
            const d = Math.hypot(c.x - p.x, c.y - p.y) || 1;
            if (d < p.r * 2.2) { c.vx += (p.x - c.x) / d * 0.25 * U; c.vy += (p.y - c.y) / d * 0.25 * U; }
            c.x += c.vx; c.y += c.vy; c.vx *= 0.92; c.vy *= 0.92;
            if (d < p.r * 0.8) {
                c.dead = true;
                if (this.mode !== 'attract') { this.runCoins++; sfx.coin(); }
                this.fx.burst(c.x, c.y, '#ffd700', 4, { speed: U * 0.6, size: U * 0.6, life: 0.4 });
            }
            if (c.life <= 0) c.dead = true;
        }
        this.coins = this.coins.filter(c => !c.dead);
    }

    // ---------- Supervivencia ----------
    survivalMilestones() {
        const threat = Math.floor(this.score / 50);
        if (threat > this.threat) {
            this.threat = threat;
            const want = Math.min(4, threat);
            const have = this.bosses.length + this.bossQueue.length;
            for (let i = have; i < want; i++) this.bossQueue.push(60 + (i - have) * 150);
            if (want <= have) this.hooks.banner?.(fmt(t.newWave, threat + 1), '', '#ff4d6d');
        }
    }

    updateTutorial() {
        const p = this.player;
        if (this.tutorial === 0 && p.moved > 40) this.tutorial = 1;
        else if (this.tutorial === 1 && this.kills >= 3) { this.tutorial = 2; this.tutT = 300; }
        else if (this.tutorial === 2 && --this.tutT <= 0) {
            this.tutorial = -1;
            save.tutorialDone = true;
        }
        this.hooks.tutorial?.(this.tutorial);
    }

    // ---------- Campaña ----------
    objectiveProgress() {
        const L = this.level;
        switch (L.objective) {
            case 'survive': return { cur: Math.min(L.target, Math.floor((L.duration * 60 - this.levelTimer) / 60)), target: L.target };
            case 'kill': return { cur: this.kills, target: L.target };
            case 'combo': return { cur: this.maxMult, target: L.target };
            case 'boss': return { cur: this.bossKills, target: L.target };
            case 'ghost': return { cur: this.ghostKills, target: L.target };
        }
        return { cur: 0, target: 1 };
    }

    starKills() {
        const L = this.level;
        return Math.max(5, Math.round(L.duration * 60 / L.rate * 0.7));
    }

    campaignTick() {
        const L = this.level;
        this.levelTimer--;
        const pr = this.objectiveProgress();
        if (L.objective !== 'survive' && pr.cur >= pr.target) return this.endLevel(true);
        if (this.levelTimer <= 0) return this.endLevel(L.objective === 'survive');
    }

    endLevel(win) {
        this.state = 'OVER';
        setMusic(0);
        const L = this.level;
        let stars = 0;
        if (win) {
            stars = 1;
            if (!this.hitTaken) stars++;
            const third = L.objective === 'survive'
                ? this.kills >= this.starKills()
                : this.levelTimer / (L.duration * 60) >= 0.4;
            if (third) stars++;
            this.fx.burst(this.player.x, this.player.y, '#ffe066', 50, { speed: this.U * 2, size: this.U * 1.2, life: 1.4 });
        }
        this.hooks.levelEnd?.({ win, stars, kills: this.kills, coins: this.runCoins, hitTaken: this.hitTaken });
    }

    // ---------- Dibujo ----------
    render(dt) {
        const ctx = this.ctx, U = this.U, p = this.player, pip = this.pip;
        const t0 = this.time;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.save();
        if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

        this.bg.draw(ctx, t0, this.state === 'PAUSED' ? 0 : dt);

        for (const c of this.coins) R.drawCoin(ctx, c.x, c.y, 1.8 * U, c.t);
        for (const pu of this.powerups) {
            const blinkOut = pu.life < 120 && Math.floor(pu.life / 8) % 2 === 0;
            R.drawPowerup(ctx, pu.x, pu.y + Math.sin(pu.t * 3) * U, pu.r, POWERUPS[pu.kind], pu.t, blinkOut ? 0.35 : 1);
        }

        if (!pip.hidden) {
            R.drawPip(ctx, pip.x, pip.y, pip.r, { t: t0, fear: pip.fear, blink: pip.blink, lookX: pip.lookX * 0.6, lookY: pip.lookY * 0.6, hurt: pip.hurtT > 0, happy: this.rageT > 0 });
            R.drawShieldBubble(ctx, pip.x, pip.y, pip.r * 1.55, pip.shields, t0, pip.invuln > 0);
        }

        // Cubos que están siendo tragados (debajo de la bola)
        for (const e of this.enemies) if (e.eaten) this.drawEnemy(e, t0);
        for (const b of this.bosses) if (b.eaten) R.drawAnomaly(ctx, b.x, b.y, b.r * b.scale, { t: t0, vulnerable: true });

        // Anillo de succión
        this.drawSuction(ctx, t0);
        const skin = (SKINS.find(s => s.id === save.skin) || SKINS[0]).look;
        R.drawBall(ctx, p.x, p.y, p.r, skin, { t: t0, mouth: p.mouth, rage: this.rageT > 0, lookX: p.lookX, lookY: p.lookY, blink: p.blink, squash: p.squash });
        this.trail(skin, dt);

        for (const e of this.enemies) if (!e.eaten) this.drawEnemy(e, t0);
        for (const b of this.bosses) {
            if (b.eaten) continue;
            const lx = (pip.x - b.x), ly = (pip.y - b.y), ll = Math.hypot(lx, ly) || 1;
            R.drawAnomaly(ctx, b.x, b.y, b.r, { t: t0, lookX: lx / ll, lookY: ly / ll, vulnerable: (this.rageT > 0 || p.growT > 0) && this.mode !== 'attract' });
        }

        this.fx.draw(ctx);
        this.drawIndicators(ctx, t0);
        ctx.restore();

        // Capas de pantalla completa
        if (this.rageT > 0 || this.timeScale < 0.9) {
            const k = this.state === 'DYING' ? 0.5 : (1 - this.timeScale) * 0.9;
            const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.45, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
            g.addColorStop(0, 'rgba(255,60,20,0)');
            g.addColorStop(1, this.state === 'DYING' ? `rgba(120,0,20,${k})` : `rgba(255,60,20,${k * 0.38})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, this.w, this.h);
        }
        if (this.freezeT > 0) {
            ctx.fillStyle = `rgba(127,220,255,${Math.min(0.18, this.freezeT / 200 * 0.25)})`;
            ctx.fillRect(0, 0, this.w, this.h);
        }
        if (this.flash > 0) {
            ctx.globalAlpha = Math.min(1, this.flash) * 0.6;
            ctx.fillStyle = this.flashColor;
            ctx.fillRect(0, 0, this.w, this.h);
            ctx.globalAlpha = 1;
        }
        if (this.state === 'MENU' || this.state === 'OVER' || this.state === 'DEAD' || this.state === 'PAUSED') {
            ctx.fillStyle = 'rgba(5,6,20,0.45)';
            ctx.fillRect(0, 0, this.w, this.h);
        }
    }

    drawEnemy(e, t0) {
        const ctx = this.ctx, U = this.U, pip = this.pip;
        const s = e.s * e.scale;
        if (e.type === 'rocket') {
            R.drawRocket(ctx, e.x, e.y, s, s * 3, e.rot, t0);
            if (e.state === 'orbit' && e.orbitT < 50 && Math.floor(e.orbitT / 6) % 2 === 0) {
                ctx.fillStyle = '#ff3b3b';
                ctx.font = `900 ${5 * U}px Bungee, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('!', e.x, e.y - 4 * U);
            }
            return;
        }
        const lx = pip.x - e.x, ly = pip.y - e.y, ll = Math.hypot(lx, ly) || 1;
        const alpha = e.type === 'ghost' ? (e.solid ? 0.85 : 0.22 + Math.sin(t0 * 10) * 0.05) : 1;
        R.drawCube(ctx, e.x, e.y, s, e.color, {
            lookX: lx / ll, lookY: ly / ll, alpha,
            squash: Math.sin(this.ticks * 0.25 + e.seed) * 0.06,
            frozen: this.freezeT > 0, eyes: e.type !== 'shard' || s > 3 * U,
            rot: e.eaten ? e.rot : 0,
        });
        if (e.type === 'splitter' && !e.eaten) {
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = Math.max(1, U * 0.35);
            ctx.beginPath();
            ctx.moveTo(e.x - s * 0.45, e.y + s * 0.4); ctx.lineTo(e.x - s * 0.1, e.y + s * 0.15); ctx.lineTo(e.x + s * 0.05, e.y + s * 0.45);
            ctx.stroke();
        }
    }

    drawSuction(ctx, t0) {
        const p = this.player;
        const magnet = this.mode === 'attract' ? 0 : save.upgrades.magnet;
        const R1 = p.r * (magnet > 0 ? 1.5 + 0.3 * magnet : 1.3);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(-t0 * 2.2);
        ctx.strokeStyle = this.rageT > 0 ? 'rgba(255,140,40,0.35)' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = Math.max(1.5, this.U * 0.5);
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, R1, i * TAU / 3, i * TAU / 3 + 1.1);
            ctx.stroke();
        }
        ctx.restore();
    }

    trail(skin, dt) {
        const p = this.player, U = this.U;
        if (!skin.trail || this.state === 'PAUSED') return;
        const moving = Math.hypot(p.tx - p.x, p.ty - p.y) > U * 0.5;
        if (!moving && Math.random() > 0.15) return;
        const a = Math.random() * TAU, x = p.x + Math.cos(a) * p.r * 0.8, y = p.y + Math.sin(a) * p.r * 0.8;
        const colors = {
            spark: skin.aura, fire: Math.random() < 0.5 ? '#ff7a00' : '#ffd25e', snow: '#ffffff',
            rainbow: `hsl(${(this.time * 200) % 360},100%,60%)`, void: '#c77dff',
        };
        this.fx.burst(x, y, colors[skin.trail] || skin.aura, 1, { speed: U * 0.15, size: U * 0.7, life: 0.5, gravity: skin.trail === 'fire' ? -0.02 * U : 0 });
    }

    drawIndicators(ctx, t0) {
        // Flechas en el borde para lo que viene desde afuera de la pantalla
        const U = this.U, pad = 3 * U;
        const items = [];
        for (const e of this.enemies) if (!e.eaten && (e.type === 'rocket' || e.type === 'splitter')) items.push([e, e.type === 'rocket' ? '#ff4757' : '#c77dff']);
        for (const b of this.bosses) if (b.entering) items.push([b, '#ff00ff']);
        for (const [o, col] of items) {
            if (o.x > 0 && o.x < this.w && o.y > 0 && o.y < this.h) continue;
            const x = clamp(o.x, pad, this.w - pad), y = clamp(o.y, pad, this.h - pad);
            const a = Math.atan2(o.y - y, o.x - x);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(a);
            ctx.globalAlpha = 0.6 + Math.sin(t0 * 12) * 0.3;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(2 * U, 0); ctx.lineTo(-1.5 * U, -1.6 * U); ctx.lineTo(-1.5 * U, 1.6 * U);
            ctx.fill();
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }
}
