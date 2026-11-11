// Arranque y toda la interfaz (pantallas, modales, tienda, ranking, campaña).
import { SKINS, BACKGROUNDS, UPGRADES, LEVELS, WORLDS, LEVELS_PER_WORLD, STAR_COINS, DAILY_REWARDS } from './config.js';
import { save, persist, addCoins, todayKey } from './storage.js';
import { t, fmt, lang, setLang, applyI18n, escapeHtml } from './i18n.js';
import { sfx, unlockAudio, applyAudioSettings, suspendAudio, setMusic } from './audio.js';
import { initAds, showBanner, hideBanner, showInterstitial, showRewarded, maybeAskReview } from './platform.js';
import { Game, COMBO_WINDOW } from "./game.js";
import { Background } from './backgrounds.js';
import { drawBall } from './render.js';
import { account } from './api.js';

// Polyfill para WebViews viejos
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        r = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
    };
}

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// ---------- Pantallas y modales ----------
let current = 'menu';
function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    current = id;
    const inGame = id === 'hud';
    document.body.classList.toggle('in-game', inGame);
    if (inGame) hideBanner(); else showBanner();
}

function openModal(id) { $('#' + id).classList.add('open'); }
function closeModal(id) { $('#' + id).classList.remove('open'); }
function closeAllModals() { $$('.modal.open').forEach(m => m.classList.remove('open')); }

let toastTimer;
function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function confirmBox(text) {
    return new Promise(resolve => {
        $('#confirm-text').textContent = text;
        openModal('m-confirm');
        const done = (v) => { closeModal('m-confirm'); resolve(v); };
        $('#confirm-yes').onclick = () => done(true);
        $('#confirm-no').onclick = () => done(false);
    });
}

let bannerTimer;
function banner(text, sub, color) {
    const el = $('#banner');
    el.innerHTML = `<b style="color:${color}">${escapeHtml(text)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove('show'), 1500);
}

// Botones: sonido de click en todos
document.addEventListener('click', (e) => { if (e.target.closest('button')) sfx.click(); });

// ---------- Monedas / textos globales ----------
function refreshCoins() { $$('.js-coins').forEach(el => { el.textContent = save.coins.toLocaleString(); }); }
document.addEventListener('coins-changed', refreshCoins);

function totalStars() { return save.campaign.stars.reduce((a, b) => a + b, 0); }

function refreshMenu() {
    refreshCoins();
    $('#menu-best').textContent = save.highScore.toLocaleString();
    $('#menu-stars').textContent = totalStars();
    $('#daily-dot').hidden = !dailyAvailable();
}

// ---------- Juego ----------
let pendingDeath = null;
let reviveTimer = null;

const game = new Game($('#game'), {
    hud: updateHud,
    banner,
    tutorial: showTutorial,
    requestPause: pauseGame,
    death: onDeath,
    levelEnd: onLevelEnd,
});
game.startAttract();
if (/[?&]debug/.test(location.search)) window.__game = game;

function startSurvival() {
    closeAllModals();
    show('hud');
    $('#objective').hidden = true;
    game.start('survival');
    banner(t.survival, '', '#4ecca3');
}

function startLevel(i) {
    closeAllModals();
    show('hud');
    $('#objective').hidden = false;
    game.start('campaign', i);
    // Tarjeta de presentación mientras dura la intro
    const L = LEVELS[i];
    const w = Math.floor(i / LEVELS_PER_WORLD);
    $('#intro-world').textContent = `${t['world' + w]} · ${fmt(t.levelN, (i % LEVELS_PER_WORLD) + 1)}`;
    $('#intro-title').textContent = t.levelNames[i];
    $('#intro-obj').textContent = fmt(t['obj_' + L.objective], L.target);
    const third = L.objective === 'survive' ? fmt(t.star3_kills, game.starKills()) : t.star3_time;
    $('#intro-stars').innerHTML = [t.star1, t.star2, third].map((s, k) => `<li><i>${'★'.repeat(k + 1)}</i>${escapeHtml(s)}</li>`).join('');
    openModal('m-intro');
    setTimeout(() => closeModal('m-intro'), 1600);
}

function pauseGame() {
    if (game.pause()) {
        openModal('m-pause');
        suspendMusicForPause(true);
    }
}
function resumeGame() {
    closeModal('m-pause');
    game.resume();
    suspendMusicForPause(false);
}
function suspendMusicForPause(yes) { setMusic(yes ? 0 : game.rageT > 0 ? 2 : 1); }

function toMenu() {
    closeAllModals();
    hideTutorial();
    if (reviveTimer) clearInterval(reviveTimer);
    game.startAttract();
    show('menu');
    refreshMenu();
    account.retryPending();
}

// HUD: solo se toca el DOM cuando cambia algo (antes se reescribía cada frame).
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $('#' + id).textContent = v; } }
function updateHud(g) {
    if (current !== 'hud') return;
    setText('hud-score', g.score.toLocaleString());
    const m = g.mult > 1 ? 'x' + g.mult : '';
    if (hudCache.mult !== m) {
        hudCache.mult = m;
        const el = $('#hud-mult');
        el.textContent = m;
        el.classList.toggle('on', !!m);
        el.classList.remove('bump'); void el.offsetWidth; if (m) el.classList.add('bump');
    }
    setText('hud-coins', String(g.runCoins));
    const bar = $('#combo-bar');
    const raging = g.rageT > 0;
    const frac = raging ? g.rageT / g.rageMax : g.comboT / COMBO_WINDOW;
    bar.classList.toggle('show', g.combo > 0 || raging);
    bar.classList.toggle('rage', raging);
    $('#combo-fill').style.transform = `scaleX(${Math.max(0, frac)})`;
    setText('combo-label', raging ? `${t.rage} ${t.combo} ${g.combo}` : g.combo > 1 ? `${t.combo} ${g.combo}` : '');
    if (g.mode === 'campaign' && g.level) {
        const pr = g.objectiveProgress();
        const L = g.level;
        const icons = { survive: '⏱', kill: '🍽', combo: '🔥', boss: '👁', ghost: '👻' };
        setText('obj-text', `${icons[L.objective]} ${fmt(t['obj_' + L.objective], L.target)} · ${L.objective === 'combo' ? 'x' + pr.cur : pr.cur + '/' + pr.target}`);
        $('#obj-fill').style.transform = `scaleX(${Math.min(1, pr.cur / pr.target)})`;
        const secs = Math.max(0, Math.ceil(g.levelTimer / 60));
        setText('obj-timer', secs + 's');
        $('#obj-timer').classList.toggle('low', secs <= 5 && L.objective !== 'survive');
    }
}

function showTutorial(step) {
    const el = $('#tutorial');
    const txt = step === 0 ? t.tutorialMove : step === 1 ? t.tutorialGoal : step === 2 ? t.tutorialRage : '';
    if (el.dataset.step !== String(step)) {
        el.dataset.step = step;
        el.textContent = txt;
        el.classList.toggle('show', !!txt);
        if (step === -1) persist();
    }
}

// ---------- Muerte, revivir y fin ----------
function hideTutorial() {
    const el = $('#tutorial');
    el.classList.remove('show');
    el.dataset.step = '';
}

function onDeath(reason) {
    pendingDeath = reason;
    hideTutorial();
    const canRevive = !game.revived && (game.mode === 'campaign' || game.score >= 10);
    if (canRevive) showRevive();
    else finishRun();
}

function showRevive() {
    openModal('m-revive');
    let secs = 5;
    const ring = $('#revive-ring');
    const C = 2 * Math.PI * 44;
    ring.style.strokeDasharray = C;
    const tickUI = () => {
        $('#revive-num').textContent = Math.max(0, Math.ceil(secs));
        ring.style.strokeDashoffset = C * (1 - secs / 5);
    };
    tickUI();
    clearInterval(reviveTimer);
    reviveTimer = setInterval(() => {
        secs -= 0.1;
        tickUI();
        if (secs <= 0) { clearInterval(reviveTimer); closeModal('m-revive'); finishRun(); }
    }, 100);
}

$('#btn-revive').onclick = async () => {
    clearInterval(reviveTimer);
    const r = await showRewarded(() => { closeModal('m-revive'); game.revive(); });
    if (r === 'unavailable' || r === 'cancelled') {
        if (r === 'unavailable') toast(t.adUnavailable);
        // Si llega tarde la recompensa ya no aplica: se termina la partida.
        closeModal('m-revive');
        finishRun();
    }
};
$('#btn-skip-revive').onclick = () => { clearInterval(reviveTimer); closeModal('m-revive'); finishRun(); };

function finishRun() {
    if (game.state !== 'DEAD') return; // ya se resolvió (p. ej. revivió)
    if (game.mode === 'campaign') { game.endLevel(false); return; }
    const res = game.finishSurvival();
    const isRecord = res.score > save.highScore;
    const run = { score: res.score, kills: res.kills, seconds: res.seconds, bestCombo: res.bestCombo };
    if (isRecord) {
        save.highScore = res.score;
        save.bestRun = run;
    }
    // Al ranking va si supera lo que ya hay en la nube (no hace falta que sea
    // récord del teléfono: puede haber jugado en otro).
    if (res.score > 0) {
        account.submitRun(run).then(r => {
            if (r?.record) toast(`🏆 #${r.rank} ${t.leaderboard}`);
        }).catch(e => { if (e.status && e.status !== 401) console.warn('ranking:', e.message); });
    }
    save.stats.games++;
    save.stats.kills += res.kills;
    save.stats.bestCombo = Math.max(save.stats.bestCombo, res.bestCombo);
    addCoins(res.coins);
    lastRunCoins = res.coins;
    persist();

    $('#go-reason').textContent = pendingDeath || '';
    $('#go-record').hidden = !isRecord;
    $('#go-best').textContent = save.highScore.toLocaleString();
    $('#go-kills').textContent = res.kills;
    $('#go-combo').textContent = res.bestCombo;
    $('#go-time').textContent = res.seconds + 's';
    $('#go-coins').textContent = '+' + res.coins;
    $('#btn-double').hidden = res.coins < 10;
    $('#btn-double').disabled = false;
    countUp($('#go-score'), res.score);
    openModal('m-gameover');
    if (isRecord) setTimeout(() => sfx.win(), 300); else sfx.lose();

    save.counters.deaths++;
    if (save.counters.deaths >= 3) { save.counters.deaths = 0; showInterstitial(); }
    else if (isRecord) maybeAskReview(); // nunca encima de un anuncio
    persist();
}

let lastRunCoins = 0;
$('#btn-double').onclick = async () => {
    const btn = $('#btn-double');
    btn.disabled = true;
    const r = await showRewarded(() => {
        addCoins(lastRunCoins);
        $('#go-coins').textContent = '+' + lastRunCoins * 2;
        btn.hidden = true;
        toast(t.doubled + ' +' + lastRunCoins);
        sfx.coin();
    });
    if (r !== 'granted') { btn.disabled = false; if (r === 'unavailable') toast(t.adUnavailable); }
};
$('#btn-retry').onclick = () => startSurvival();
$('#btn-go-menu').onclick = () => toMenu();

function countUp(el, target) {
    const start = performance.now(), dur = Math.min(1200, 300 + target * 4);
    const step = (now) => {
        const k = Math.min(1, (now - start) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString();
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// ---------- Campaña ----------
function onLevelEnd(r) {
    const i = game.levelIndex;
    const c = save.campaign;
    let coins = r.coins;
    if (r.win) {
        c.stars[i] = Math.max(c.stars[i], r.stars);
        const best = c.stars[i];
        coins += Math.max(0, STAR_COINS[best] - STAR_COINS[c.paid[i]]);
        c.paid[i] = Math.max(c.paid[i], best);
        if (i + 1 < LEVELS.length) c.unlocked = Math.max(c.unlocked, i + 1);
    }
    addCoins(coins);
    persist();

    $('#le-title').textContent = r.win ? t.levelComplete : t.levelFailed;
    $('#le-title').className = r.win ? 'win-title' : 'danger-title';
    $('#le-name').textContent = `${fmt(t.levelN, i + 1)} — ${t.levelNames[i]}`;
    $('#le-coins').textContent = '+' + coins;
    $('#le-reward').hidden = coins <= 0;
    const stars = $$('#m-levelend .stars-big span');
    stars.forEach(s => s.classList.remove('on'));
    if (r.win) stars.forEach((s, k) => { if (k < r.stars) setTimeout(() => { s.classList.add('on'); sfx.star(k); }, 450 + k * 380); });
    $('#btn-next').hidden = !r.win || i + 1 >= LEVELS.length;
    if (r.win && i + 1 >= LEVELS.length) toast(t.allDone);
    openModal('m-levelend');
    if (r.win) sfx.win(); else sfx.lose();

    save.counters.campaignPlays++;
    if (save.counters.campaignPlays >= 5) { save.counters.campaignPlays = 0; showInterstitial(); }
    else if (r.win && r.stars === 3) maybeAskReview(); // nunca encima de un anuncio
    persist();
}

$('#btn-next').onclick = () => startLevel(game.levelIndex + 1);
$('#btn-replay').onclick = () => startLevel(game.levelIndex);
$('#btn-le-levels').onclick = () => { closeAllModals(); game.startAttract(); openLevels(Math.floor(game.levelIndex / LEVELS_PER_WORLD)); };

let worldTab = 0;
function worldUnlocked(w) { return save.campaign.unlocked >= w * LEVELS_PER_WORLD; }

function openLevels(w) {
    if (w === undefined) w = Math.min(WORLDS.length - 1, Math.floor(save.campaign.unlocked / LEVELS_PER_WORLD));
    worldTab = w;
    show('levels');
    renderLevels();
}

function renderLevels() {
    const tabs = $('#world-tabs');
    tabs.innerHTML = '';
    WORLDS.forEach((W, w) => {
        const b = document.createElement('button');
        const stars = save.campaign.stars.slice(w * LEVELS_PER_WORLD, (w + 1) * LEVELS_PER_WORLD).reduce((a, x) => a + x, 0);
        const locked = !worldUnlocked(w);
        b.className = (w === worldTab ? 'active ' : '') + (locked ? 'locked' : '');
        b.style.setProperty('--accent', W.accent);
        b.innerHTML = `${locked ? '🔒 ' : ''}${escapeHtml(t['world' + w])}<small>★ ${stars}/30</small>`;
        b.onclick = () => { if (locked) { toast(t.worldLocked); return; } worldTab = w; renderLevels(); };
        tabs.appendChild(b);
    });
    const wb = $('#world-banner');
    wb.innerHTML = '';
    wb.appendChild(Background.thumb(WORLDS[worldTab].bg, 300));
    wb.insertAdjacentHTML('beforeend', `<span>${escapeHtml(t['world' + worldTab])}</span>`);
    wb.style.setProperty('--accent', WORLDS[worldTab].accent);

    const grid = $('#level-grid');
    grid.innerHTML = '';
    for (let k = 0; k < LEVELS_PER_WORLD; k++) {
        const i = worldTab * LEVELS_PER_WORLD + k;
        const L = LEVELS[i];
        const unlocked = i <= save.campaign.unlocked;
        const st = save.campaign.stars[i];
        const cell = document.createElement('button');
        cell.className = 'level' + (unlocked ? '' : ' locked') + (unlocked && st === 0 ? ' current' : '') + (L.boss && L.objective === 'boss' ? ' boss' : '');
        cell.style.setProperty('--accent', WORLDS[worldTab].accent);
        cell.innerHTML = `<b>${k + 1}</b><span class="lv-stars">${[1, 2, 3].map(n => `<i class="${n <= st ? 'on' : ''}">★</i>`).join('')}</span>`;
        if (unlocked) cell.onclick = () => startLevel(i);
        grid.appendChild(cell);
    }
}

// ---------- Tienda ----------
let storeTab = 'skins';
function openStore() { show('store'); renderStore(); }

$$('#store-tabs button').forEach(b => b.onclick = () => {
    storeTab = b.dataset.tab;
    $$('#store-tabs button').forEach(x => x.classList.toggle('active', x === b));
    renderStore();
});

function skinPreview(look, size = 120) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = size * dpr;
    c.style.width = c.style.height = size + 'px';
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    drawBall(g, size / 2, size / 2, size * 0.24, look, { t: 1, lookX: 0.3, lookY: 0.2 });
    return c;
}

function renderStore() {
    const grid = $('#store-grid');
    grid.innerHTML = '';
    grid.className = 'scroll store-grid ' + storeTab;
    const card = (opts) => {
        const el = document.createElement('div');
        el.className = 'item' + (opts.equipped ? ' equipped' : '');
        const prev = document.createElement('div');
        prev.className = 'item-preview';
        prev.appendChild(opts.preview);
        el.appendChild(prev);
        el.insertAdjacentHTML('beforeend', `<div class="item-name">${escapeHtml(opts.name)}</div>${opts.desc ? `<div class="item-desc">${escapeHtml(opts.desc)}</div>` : ''}`);
        const btn = document.createElement('button');
        btn.className = 'btn btn-small ' + opts.btnClass;
        btn.innerHTML = opts.btnHtml;
        btn.disabled = !!opts.disabled;
        btn.onclick = opts.action;
        el.appendChild(btn);
        grid.appendChild(el);
    };
    const priceHtml = (p) => `<span class="coin-ico sm"></span> ${p.toLocaleString()}`;

    if (storeTab === 'skins' || storeTab === 'backgrounds') {
        const list = storeTab === 'skins' ? SKINS : BACKGROUNDS;
        const key = storeTab === 'skins' ? 'skin' : 'background';
        for (const it of list) {
            const owned = save.owned.includes(it.id);
            const equipped = save[key] === it.id;
            const preview = storeTab === 'skins' ? skinPreview(it.look) : Background.thumb(it.id, 140);
            card({
                name: t[it.id], preview, equipped,
                btnClass: equipped ? 'btn-equipped' : owned ? 'btn-ghost' : save.coins >= it.price ? 'btn-gold' : 'btn-locked',
                btnHtml: equipped ? t.equipped : owned ? t.equip : priceHtml(it.price),
                disabled: equipped,
                action: () => {
                    if (owned) { save[key] = it.id; persist(); if (key === 'background') game.refreshBackground(); renderStore(); renderMascot(); return; }
                    if (save.coins < it.price) { toast(t.notEnough); return; }
                    addCoins(-it.price);
                    save.owned.push(it.id);
                    save[key] = it.id;
                    persist();
                    sfx.powerup();
                    if (key === 'background') game.refreshBackground();
                    renderStore();
                    renderMascot();
                },
            });
        }
    } else {
        for (const u of UPGRADES) {
            const lvl = save.upgrades[u.id];
            const max = lvl >= u.cost.length;
            const price = max ? 0 : u.cost[lvl];
            const shown = Math.max(1, lvl);
            const val = { shield: shown, size: shown * 8, magnet: shown, rage: 5 + shown, luck: Math.round(100 / (1 - 0.12 * shown) - 100) }[u.id];
            const prev = document.createElement('div');
            prev.className = 'up-ico';
            prev.innerHTML = `<span>${u.icon}</span><div class="pips">${u.cost.map((_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('')}</div>`;
            card({
                name: t['up_' + u.id], desc: fmt(t['up_' + u.id + 'Desc'], val) + (lvl === 0 ? '' : ` · ${t.level} ${lvl}`),
                preview: prev,
                btnClass: max ? 'btn-equipped' : save.coins >= price ? 'btn-gold' : 'btn-locked',
                btnHtml: max ? t.maxed : `${t.buy} · ${priceHtml(price)}`,
                disabled: max,
                action: () => {
                    if (save.coins < price) { toast(t.notEnough); return; }
                    addCoins(-price);
                    save.upgrades[u.id]++;
                    persist();
                    sfx.powerup();
                    renderStore();
                },
            });
        }
    }
}

// ---------- Ranking ----------
function rankRow({ rank, name: who, photo, score, me }) {
    const li = document.createElement('li');
    li.className = 'rank-item' + (rank <= 3 ? ' top' + rank : '') + (me ? ' me' : '');
    const r = document.createElement('span'); r.className = 'rank'; r.textContent = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : '#' + rank;
    const av = document.createElement(photo ? 'img' : 'span'); av.className = 'avatar';
    if (photo) { av.src = photo; av.referrerPolicy = 'no-referrer'; av.onerror = () => { av.style.visibility = 'hidden'; }; }
    const name = document.createElement('span'); name.className = 'name'; name.textContent = (who || t.guest) + (me ? ` (${t.you})` : '');
    const sc = document.createElement('b'); sc.className = 'score'; sc.textContent = (score | 0).toLocaleString();
    li.append(r, av, name, sc);
    return li;
}

async function openRanking() {
    show('ranking');
    const list = $('#ranking-list');
    list.innerHTML = `<li class="muted center">${t.loading}</li>`;
    $('#ranking-login').hidden = !!account.user;
    let data;
    try { data = await account.leaderboard(); }
    catch { if (current === 'ranking') list.innerHTML = `<li class="muted center">${t.offline}</li>`; return; }
    if (current !== 'ranking') return;
    list.innerHTML = '';
    if (!data.top.length) { list.innerHTML = `<li class="muted center">${t.noData}</li>`; return; }
    data.top.forEach(s => list.appendChild(rankRow(s)));
    // Si está fuera del top, su puesto al final
    const me = data.me;
    if (me && me.rank && !data.top.some(s => s.me)) {
        list.insertAdjacentHTML('beforeend', '<li class="muted center rank-gap">⋯</li>');
        list.appendChild(rankRow({ rank: me.rank, name: me.user.name, photo: me.user.photo, score: me.best, me: true }));
    }
}
$('#ranking-login').onclick = () => doLogin().then(() => { if (current === 'ranking') openRanking(); });

// ---------- Recompensa diaria ----------
function dailyState() {
    const today = todayKey();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const last = save.daily.last;
    const streak = last === todayKey(y) ? save.daily.streak : 0; // si se saltó un día, vuelve al día 1
    return { today, available: last !== today, day: streak % DAILY_REWARDS.length, streak };
}
function dailyAvailable() { return dailyState().available; }

function openDaily() {
    const st = dailyState();
    const grid = $('#daily-grid');
    grid.innerHTML = DAILY_REWARDS.map((r, k) => {
        const cls = k < st.day ? 'done' : k === st.day && st.available ? 'today' : '';
        return `<div class="day ${cls} ${k === 6 ? 'big' : ''}"><small>${fmt(t.dailyDay, k + 1)}</small><span class="coin-ico"></span><b>${r}</b></div>`;
    }).join('');
    if (!st.available) {
        // Ya cobró hoy: marcar cobrados hasta hoy incluido
        const doneUpTo = (save.daily.streak - 1) % DAILY_REWARDS.length;
        $$('#daily-grid .day').forEach((d, k) => d.classList.toggle('done', k <= doneUpTo));
    }
    $('#btn-claim').hidden = !st.available;
    $('#btn-claim-double').hidden = !st.available;
    $('#btn-daily-close').textContent = st.available ? t.back : t.dailyStreak;
    openModal('m-daily');
}

function claimDaily(mult) {
    const st = dailyState();
    if (!st.available) return;
    const amount = DAILY_REWARDS[st.day] * mult;
    save.daily.last = st.today;
    save.daily.streak = st.streak + 1;
    addCoins(amount);
    persist();
    sfx.coin(); setTimeout(() => sfx.win(), 120);
    toast(`+${amount} 🪙`);
    closeModal('m-daily');
    refreshMenu();
}
$('#btn-claim').onclick = () => claimDaily(1);
$('#btn-claim-double').onclick = async () => {
    const r = await showRewarded(() => claimDaily(2));
    if (r === 'unavailable') toast(t.adUnavailable);
};

// ---------- Ajustes ----------
function renderSettings() {
    $$('[data-setting]').forEach(b => {
        const on = save.settings[b.dataset.setting];
        b.classList.toggle('on', on);
        if (b.classList.contains('toggle')) b.textContent = on ? t.on : t.off;
        else b.classList.toggle('off', !on);
    });
    $$('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
}
$$('[data-setting]').forEach(b => b.onclick = () => {
    const k = b.dataset.setting;
    save.settings[k] = !save.settings[k];
    persist();
    applyAudioSettings();
    renderSettings();
});
$$('[data-lang]').forEach(b => b.onclick = () => {
    setLang(b.dataset.lang);
    persist();
    renderSettings();
    updateLoginLabel();
    refreshMenu();
});
$('#btn-settings').onclick = () => { renderSettings(); openModal('m-settings'); };
$$('.js-close').forEach(b => b.addEventListener('click', () => closeModal(b.closest('.modal').id)));

function updateLoginLabel() {
    const u = account.user;
    $('#btn-login').textContent = u ? `${t.logout} (${u.name || t.guest})` : t.loginGoogle;
    $('#btn-delete').hidden = !u;
}
account.onChange(updateLoginLabel);

// Si la nube tiene un récord mayor (jugó en otro teléfono), se trae.
function adoptCloudBest() {
    if (account.best > save.highScore) { save.highScore = account.best; persist(); refreshMenu(); }
}

let loggingIn = false;
async function doLogin() {
    if (loggingIn) return;
    if (!account.available) { toast(t.loginOnlyApp); return; }
    loggingIn = true;
    try {
        const r = await account.login();
        adoptCloudBest();
        toast(r.synced?.record ? t.scoreSynced : `👋 ${r.user.name || t.guest}`);
    } catch (e) {
        // Cerrar el selector de cuentas de Google no es un error que mostrar
        if (!/cancel|12501/i.test(e.message || '')) toast(e.status === 0 ? t.offline : 'Error: ' + e.message);
    } finally {
        loggingIn = false;
    }
}

$('#btn-login').onclick = () => { if (account.user) account.logout(); else doLogin(); };
$('#btn-delete').onclick = async () => {
    if (!account.user) return;
    if (!(await confirmBox(t.deleteAccountConfirm))) return;
    try {
        await account.deleteAccount();
        toast(t.accountDeleted);
        refreshMenu();
    } catch (e) {
        toast(e.status === 0 ? t.offline : 'Error: ' + e.message);
    }
};

account.init().then(adoptCloudBest);
// Lo que no se pudo subir por falta de red se reintenta al volver la conexión,
// al volver a la app y al volver al menú.
window.addEventListener('online', () => account.retryPending());

// ---------- Navegación ----------
$('#btn-survival').onclick = startSurvival;
$('#btn-campaign').onclick = () => openLevels();
$('#btn-store').onclick = openStore;
$('#btn-ranking').onclick = openRanking;
$('#btn-daily').onclick = openDaily;
$('#btn-free-coins').onclick = async () => {
    const r = await showRewarded(() => { addCoins(100); toast('+100 🪙'); sfx.coin(); });
    if (r === 'unavailable') toast(t.adUnavailable);
};
$$('.js-back').forEach(b => b.onclick = () => { show('menu'); refreshMenu(); });

$('#btn-pause').onclick = pauseGame;
$('#btn-resume').onclick = resumeGame;
$('#btn-restart').onclick = () => {
    closeModal('m-pause');
    if (game.mode === 'campaign') startLevel(game.levelIndex); else startSurvival();
};
$('#btn-quit').onclick = toMenu;

// Al salir de la app (o bloquear el teléfono) se pausa sola.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        pauseGame();
        suspendAudio(true);
        persist();
    } else {
        suspendAudio(false);
        account.retryPending();
    }
});

// Botón "atrás" de Android (si el WebView lo reporta como Escape/history)
window.addEventListener('popstate', () => { if (current === 'hud') pauseGame(); });

// Desbloqueo de audio en el primer gesto
['pointerdown', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, () => {
    unlockAudio();
    setMusic(game.state === 'MENU' ? 0 : game.rageT > 0 ? 2 : 1);
}, { passive: true }));

// ---------- Mascota del menú (mira al dedo) ----------
const mascot = $('#mascot');
const mctx = mascot.getContext('2d');
const look = { x: 0, y: 0.2, tx: 0, ty: 0.2, mouth: 0, blink: 0, nextBlink: 2 };
window.addEventListener('pointermove', (e) => {
    const r = mascot.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    look.tx = dx / d * Math.min(1, d / 150); look.ty = dy / d * Math.min(1, d / 150);
});
mascot.addEventListener('pointerdown', () => { look.mouth = 1; sfx.chomp(); });
function renderMascot(now = performance.now()) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = mascot.clientWidth || 160;
    if (mascot.width !== size * dpr) { mascot.width = mascot.height = size * dpr; }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, size, size);
    const s = now / 1000;
    look.x += (look.tx - look.x) * 0.1; look.y += (look.ty - look.y) * 0.1;
    look.mouth = Math.max(0, look.mouth - 0.04);
    look.nextBlink -= 1 / 60;
    if (look.nextBlink < 0) { look.blink = 1; look.nextBlink = 2 + Math.random() * 3; }
    look.blink = Math.max(0, look.blink - 0.1);
    const skin = (SKINS.find(k => k.id === save.skin) || SKINS[0]).look;
    drawBall(mctx, size / 2, size / 2 + Math.sin(s * 2) * size * 0.02, size * 0.235, skin, { t: s, lookX: look.x, lookY: look.y, mouth: look.mouth, blink: look.blink, squash: Math.sin(s * 4) * 0.02 });
}
(function mascotLoop(now) {
    if (current === 'menu') renderMascot(now);
    requestAnimationFrame(mascotLoop);
})();

// ---------- Inicio ----------
applyI18n();
refreshMenu();
renderSettings();
updateLoginLabel();
setTimeout(initAds, 500);
// Recordatorio del diario: se abre solo una vez por día
if (dailyAvailable() && save.highScore > 0) setTimeout(() => { if (current === 'menu') openDaily(); }, 900);

// Solo para probar pantallas: ?debug&screen=store|levels|ranking|daily|settings
if (window.__game) {
    const q = new URLSearchParams(location.search);
    if (q.get('coins')) { save.coins = +q.get('coins'); refreshCoins(); }
    if (q.has('demo')) {
        // Progreso de muestra para las capturas (no se guarda: sólo en memoria)
        [3, 3, 2, 3, 3, 2, 3, 1, 3, 3, 3, 2, 3].forEach((s, i) => { save.campaign.stars[i] = s; });
        save.campaign.unlocked = 13;
        save.highScore = 1287;
        save.owned.push('skin-neon', 'skin-fire', 'bg-fire');
        save.upgrades = { shield: 2, size: 1, magnet: 3, rage: 1, luck: 0 };
        save.daily.last = todayKey();
        refreshMenu();
    }
    ({ store: openStore, levels: () => openLevels(), ranking: openRanking, daily: openDaily, settings: () => $('#btn-settings').click() }[q.get('screen')] || (() => {}))();
    if (q.get('skin')) { save.skin = q.get('skin'); save.background = q.get('bg') || save.background; game.refreshBackground(); }
    if (q.get('level')) startLevel(+q.get('level'));
    if (q.has('survival')) { startSurvival(); game.player.moved = 999; if (q.get('score')) game.score = +q.get('score'); }
    if (q.has('bot')) {
        // Autojuego tonto para probar: persigue al cubo más cercano a Pip.
        setInterval(() => {
            const g = game;
            if (g.state !== 'PLAYING') return;
            let best = null, bd = 1e9;
            for (const e of g.enemies) { if (e.eaten || !e.solid) continue; const d = Math.hypot(e.x - g.pip.x, e.y - g.pip.y); if (d < bd) { bd = d; best = e; } }
            if ((g.rageT > 0 || g.player.growT > 0) && g.bosses[0]) best = g.bosses[0];
            if (best) { g.player.tx = best.x; g.player.ty = best.y; }
        }, 16);
    }
    // Escenas para capturas de la tienda: ?debug&survival&sim=900[&rage][&pu][&boss][&combo=N]
    if (q.get('sim')) {
        const g = game;
        closeModal('m-intro');
        g.player.moved = 999;
        g.tutorial = -1;
        let T = performance.now();
        for (let i = 0; i < +q.get('sim'); i++) {
            if (g.state === 'PLAYING') {
                let best = null, bd = 1e9;
                for (const e of g.enemies) { if (e.eaten || !e.solid) continue; const d = Math.hypot(e.x - g.pip.x, e.y - g.pip.y); if (d < bd) { bd = d; best = e; } }
                if (best && bd < g.U * 45) { g.player.tx = best.x; g.player.ty = best.y; }
                else { g.player.tx = g.pip.x + g.U * 12; g.player.ty = g.pip.y + g.U * 22; }
                g.pip.invuln = 2;
            }
            T += 1000 / 60; g.last = T - 1000 / 60; g.frame(T);
        }
        if (q.has('boss') && !g.bosses.length) { g.spawnBoss(); const b = g.bosses[0]; b.x = g.w * 0.72; b.y = g.h * 0.3; b.entering = false; }
        if (q.has('rage')) { g.combo = +(q.get('combo') || 12); g.mult = Math.floor(g.combo / 5) + 1; g.rageMax = 360; g.rageT = 300; g.comboT = 140; g.timeScale = 0.4; }
        if (q.has('pu')) {
            const kinds = ['nova', 'freeze', 'grow'];
            kinds.forEach((k, i) => g.powerups.push({ kind: k, x: g.w * (0.22 + i * 0.28), y: g.h * (0.62 + (i % 2) * 0.08), r: 4.2 * g.U, life: 9999, t: i }));
        }
        if (q.get('score')) g.score = +q.get('score');
        if (q.has('place')) {
            const p = g.player, pip = g.pip;
            p.x = p.tx = g.w * 0.56; p.y = p.ty = g.h * 0.64;
            pip.x = g.w * 0.34; pip.y = g.h * 0.47; pip.fear = 0.7; pip.lookX = 0.7; pip.lookY = -0.3;
            if (!q.has('giant')) { p.growT = 0; p.r = p.baseR * (g.rageT > 0 ? 1.08 : 1); }
            p.mouth = 0.85; p.lookX = 0.4; p.lookY = -0.6;
            // Sacar cubos encimados a la bola o a Pip
            g.enemies = g.enemies.filter(e => !e.eaten && Math.hypot(e.x - p.x, e.y - p.y) > p.r * 1.4 && Math.hypot(e.x - pip.x, e.y - pip.y) > pip.r * 2.5);
            g.coins = [];
            g.bosses = g.bosses.slice(0, +(q.get('maxboss') || 0));
            if (g.bosses[0]) Object.assign(g.bosses[0], { x: g.w * 0.78, y: g.h * 0.4, entering: false });
            g.fx.texts = [];
            const U = g.U;
            g.fx.text(p.x + p.r * 1.1, p.y - p.r * 1.2, q.get('pts') || '+12', '#ffe066', 6 * U + 6, { life: 99, rise: 0 });
            if (q.get('label')) g.fx.text(g.w / 2, g.h * 0.3, q.get('label'), q.get('labelColor') || '#ffe066', 9 * U * 0.5 + 18, { life: 99, rise: 0 });
            for (const tx of g.fx.texts) tx.max = tx.life = 99;
        }
        g.pip.invuln = 0;
        g.step = () => {}; // congelado: se sigue dibujando pero nada se mueve
        hideTutorial();
    }
}
