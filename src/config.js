// Datos del juego: tienda, mejoras, mundos y niveles. Nada de lógica acá.

export const TICK = 1 / 60; // la simulación corre a 60 Hz fijos, sin importar los FPS de la pantalla

// ---------- Tienda ----------
// Skins de la Angry Ball (el jugador). `look` lo interpreta render.js.
export const SKINS = [
    { id: 'skin-default', price: 0,    look: { body: ['#ff6a3d', '#e5262f', '#7a0b14'], eye: '#7ff3ff', aura: '#ff4b2b' } },
    { id: 'skin-neon',    price: 500,  look: { body: ['#8ffcff', '#00c6e0', '#00405a'], eye: '#ffffff', aura: '#00f2fe', trail: 'spark' } },
    { id: 'skin-fire',    price: 1000, look: { body: ['#ffd25e', '#ff6a00', '#8a1500'], eye: '#fff3a8', aura: '#ff7a00', trail: 'fire' } },
    { id: 'skin-ice',     price: 1500, look: { body: ['#ffffff', '#9fd8ff', '#2a5ea8'], eye: '#1b3c8f', aura: '#9fd8ff', trail: 'snow' } },
    { id: 'skin-rainbow', price: 2500, look: { rainbow: true, eye: '#ffffff', aura: '#ffffff', trail: 'rainbow' } },
    { id: 'skin-gold',    price: 4000, look: { body: ['#fff6c2', '#ffc93c', '#8a5a00'], eye: '#ff3b3b', aura: '#ffd700', trail: 'spark' } },
    { id: 'skin-void',    price: 6000, look: { void: true, body: ['#3b1a66', '#12051f', '#000000'], eye: '#c77dff', aura: '#9d4edd', trail: 'void' } },
];

export const BACKGROUNDS = [
    { id: 'bg-default', price: 0 },
    { id: 'bg-fire',    price: 1500 },
    { id: 'bg-space',   price: 2000 },
    { id: 'bg-synth',   price: 3000 },
];

// Mejoras con niveles. cost[i] = precio para pasar del nivel i al i+1.
export const UPGRADES = [
    { id: 'shield', icon: '🛡️', cost: [800, 1600, 3200] },   // cargas de escudo al empezar
    { id: 'size',   icon: '⭕', cost: [600, 1200, 2400] },   // +8% de radio por nivel
    { id: 'magnet', icon: '🧲', cost: [700, 1400, 2800] },   // atrae cubos cercanos
    { id: 'rage',   icon: '🔥', cost: [500, 1000, 2000] },   // +1 s de Furia por nivel
    { id: 'luck',   icon: '🍀', cost: [900, 1800, 3600] },   // más power-ups
];

// ---------- Power-ups ----------
export const POWERUPS = {
    nova:   { color: '#ff4fd8', glyph: '✸', weight: 3 },
    freeze: { color: '#7fdcff', glyph: '❄', weight: 3 },
    shield: { color: '#4ecca3', glyph: '⛨', weight: 2 },
    grow:   { color: '#ffb02e', glyph: '⬤', weight: 3 },
    coins:  { color: '#ffd700', glyph: '$', weight: 2 },
};

// ---------- Recompensa diaria ----------
export const DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 500];

// ---------- Campaña ----------
export const STAR_COINS = [0, 25, 50, 100]; // monedas acumuladas por 0..3 estrellas

export const WORLDS = [
    { id: 0, bg: 'bg-default', accent: '#4ecca3' },
    { id: 1, bg: 'bg-fire',    accent: '#ff7a00' },
    { id: 2, bg: 'bg-space',   accent: '#b388ff' },
];

// Mezcla de enemigos por nivel: pesos relativos. g = común, h = fantasma,
// r = cohete, s = divisor. `speed` multiplica la velocidad base y `rate` son
// ticks entre apariciones. `boss` es la cantidad de Anomalías.
const L = (objective, target, duration, speed, rate, mix = {}, extra = {}) =>
    ({ objective, target, duration, speed, rate, mix: { g: 1, ...mix }, ...extra });

export const LEVELS = [
    // Mundo 1 — Zona Cibernética
    L('survive', 20, 20, 0.75, 120),
    L('kill',    10, 40, 0.8,  110),
    L('survive', 30, 30, 0.9,  95, {}, { powerups: true }),
    L('kill',    20, 50, 1.0,  85, {}, { powerups: true }),
    L('combo',   2,  45, 1.0,  60, {}, { powerups: true }),
    L('survive', 25, 25, 1.0,  85, { h: 0.18 }, { powerups: true }),
    L('kill',    25, 50, 1.1,  75, { h: 0.2 }, { powerups: true }),
    L('ghost',   5,  50, 1.0,  80, { h: 0.5 }, { powerups: true }),
    L('survive', 40, 40, 1.15, 58, { h: 0.25 }, { powerups: true }),
    L('boss',    1,  60, 1.0,  105, { h: 0.12 }, { boss: 1, powerups: true }),
    // Mundo 2 — Infierno Ardiente: cohetes y divisores
    L('survive', 30, 30, 1.05, 85, { r: 0.08 }, { powerups: true }),
    L('kill',    25, 45, 1.1,  75, { s: 0.15 }, { powerups: true }),
    L('combo',   3,  50, 1.1,  55, { s: 0.2 }, { powerups: true }),
    L('survive', 35, 35, 1.15, 70, { r: 0.1, h: 0.15 }, { powerups: true }),
    L('kill',    35, 55, 1.2,  65, { s: 0.2, r: 0.06 }, { powerups: true }),
    L('ghost',   8,  55, 1.15, 70, { h: 0.45, r: 0.05 }, { powerups: true }),
    L('combo',   4,  55, 1.2,  50, { s: 0.25 }, { powerups: true }),
    L('survive', 45, 45, 1.25, 55, { r: 0.12, s: 0.15, h: 0.15 }, { powerups: true }),
    L('kill',    45, 60, 1.3,  52, { s: 0.25, r: 0.1, h: 0.15 }, { powerups: true }),
    L('boss',    2,  75, 1.1,  95, { r: 0.08, s: 0.1 }, { boss: 2, powerups: true }),
    // Mundo 3 — Vacío Estelar: todo junto y más rápido
    L('survive', 40, 40, 1.25, 60, { h: 0.2, r: 0.08, s: 0.12 }, { powerups: true }),
    L('kill',    40, 50, 1.3,  55, { s: 0.3, r: 0.08 }, { powerups: true }),
    L('ghost',   10, 55, 1.3,  60, { h: 0.55, r: 0.06 }, { powerups: true }),
    L('combo',   5,  55, 1.3,  45, { s: 0.3, h: 0.1 }, { powerups: true }),
    L('survive', 50, 50, 1.35, 50, { h: 0.2, r: 0.12, s: 0.2 }, { powerups: true, boss: 1 }),
    L('kill',    55, 65, 1.4,  45, { s: 0.3, r: 0.1, h: 0.2 }, { powerups: true }),
    L('combo',   6,  60, 1.4,  40, { s: 0.35, h: 0.15 }, { powerups: true }),
    L('ghost',   14, 60, 1.4,  50, { h: 0.6, r: 0.1 }, { powerups: true, boss: 1 }),
    L('survive', 60, 60, 1.5,  42, { h: 0.25, r: 0.15, s: 0.25 }, { powerups: true }),
    L('boss',    3,  90, 1.2,  80, { h: 0.15, r: 0.1, s: 0.15 }, { boss: 3, powerups: true }),
];

export const LEVELS_PER_WORLD = 10;
