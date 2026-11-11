// Guardado único y versionado. Migra las claves sueltas de la versión 1.x
// (devourer_*) la primera vez, así nadie pierde monedas, compras ni progreso.
import { LEVELS, UPGRADES } from './config.js';

const KEY = 'angryball_save_v2';

function read(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
    } catch {
        return fallback;
    }
}

function defaults() {
    return {
        version: 2,
        highScore: 0,
        coins: 0,
        owned: ['skin-default', 'bg-default'],
        skin: 'skin-default',
        background: 'bg-default',
        upgrades: Object.fromEntries(UPGRADES.map(u => [u.id, 0])),
        campaign: {
            stars: new Array(LEVELS.length).fill(0),
            paid: new Array(LEVELS.length).fill(0),
            unlocked: 0,
        },
        settings: { sound: true, music: true, vibration: true, lang: null },
        daily: { last: null, streak: 0 },
        tutorialDone: false,
        counters: { deaths: 0, campaignPlays: 0 },
        // Pedido de opinión en Play: cuándo fue el último y cuántos van.
        review: { last: 0, asks: 0 },
        stats: { games: 0, kills: 0, bestCombo: 0, bossKills: 0 },
        // Mejor partida con sus estadísticas (el servidor las pide para validar)
        // y la que quedó sin subir por falta de red.
        bestRun: null,
        pendingRun: null,
    };
}

function migrateV1(s) {
    const hs = parseInt(localStorage.getItem('devourer_high_score'));
    if (!Number.isNaN(hs)) s.highScore = hs;
    const coins = parseInt(localStorage.getItem('devourer_total_coins'));
    if (!Number.isNaN(coins)) s.coins = coins;

    const owned = read('devourer_owned_items', null);
    if (Array.isArray(owned)) s.owned = [...new Set([...s.owned, ...owned.filter(id => !id.startsWith('upgrade-'))])];
    s.skin = localStorage.getItem('devourer_equipped_skin') || s.skin;
    s.background = localStorage.getItem('devourer_equipped_background') || s.background;

    // Las mejoras de la 1.x eran de un solo nivel; el agujero grande daba +15%,
    // que equivale a dos niveles de +8%.
    const up = read('devourer_upgrades', null);
    if (up) {
        if (up.shield) s.upgrades.shield = 1;
        if (up.biggerHole) s.upgrades.size = 2;
        if (up.magnet) s.upgrades.magnet = 1;
    }

    const camp = read('devourer_campaign', null);
    if (camp && Array.isArray(camp.levelStars)) {
        camp.levelStars.forEach((v, i) => { if (i < LEVELS.length) s.campaign.stars[i] = v | 0; });
        if (Array.isArray(camp.coinsCollected)) {
            camp.coinsCollected.forEach((v, i) => { if (i < LEVELS.length) s.campaign.paid[i] = typeof v === 'number' ? v : 0; });
        }
        s.campaign.unlocked = Math.min(LEVELS.length - 1, camp.unlockedLevel | 0);
        // En la 1.x pasar el nivel 10 no desbloqueaba nada: si ya lo ganó, abre el mundo 2.
        if (s.campaign.stars[9] > 0) s.campaign.unlocked = Math.max(s.campaign.unlocked, 10);
    }
    s.counters.deaths = parseInt(localStorage.getItem('devourer_deaths_count')) || 0;
    s.counters.campaignPlays = parseInt(localStorage.getItem('devourer_campaign_plays')) || 0;
    // Quien ya jugaba no necesita el tutorial.
    if (s.highScore > 0) s.tutorialDone = true;
    return s;
}

// Completa campos que falten (por si una versión futura agrega cosas).
function normalize(s) {
    const d = defaults();
    const out = { ...d, ...s };
    out.upgrades = { ...d.upgrades, ...(s.upgrades || {}) };
    out.settings = { ...d.settings, ...(s.settings || {}) };
    out.daily = { ...d.daily, ...(s.daily || {}) };
    out.counters = { ...d.counters, ...(s.counters || {}) };
    out.review = { ...d.review, ...(s.review || {}) };
    out.stats = { ...d.stats, ...(s.stats || {}) };
    const c = s.campaign || d.campaign;
    out.campaign = {
        stars: LEVELS.map((_, i) => (c.stars && c.stars[i]) | 0),
        paid: LEVELS.map((_, i) => (c.paid && c.paid[i]) | 0),
        unlocked: Math.min(LEVELS.length - 1, c.unlocked | 0),
    };
    if (!Array.isArray(out.owned)) out.owned = d.owned;
    for (const id of d.owned) if (!out.owned.includes(id)) out.owned.push(id);
    if (!out.owned.includes(out.skin)) out.skin = 'skin-default';
    if (!out.owned.includes(out.background)) out.background = 'bg-default';
    return out;
}

function load() {
    const saved = read(KEY, null);
    if (saved) return normalize(saved);
    const hadV1 = localStorage.getItem('devourer_total_coins') !== null || localStorage.getItem('devourer_high_score') !== null;
    return normalize(hadV1 ? migrateV1(defaults()) : defaults());
}

export const save = load();

let pending = null;
export function persist() {
    // Se agrupa en un microtask para no escribir varias veces por tick.
    if (pending) return;
    pending = Promise.resolve().then(() => {
        pending = null;
        try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { console.warn('No se pudo guardar', e); }
    });
}
persist();

export function addCoins(n) {
    save.coins = Math.max(0, save.coins + Math.round(n));
    persist();
    document.dispatchEvent(new CustomEvent('coins-changed'));
}

export function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
