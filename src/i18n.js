// Textos en español e inglés. El HTML marca los textos con data-i18n
// (textContent) o data-i18n-html (innerHTML, solo para textos propios).
import { save } from './storage.js';

const es = {
    tagline: 'Comete los cubos furiosos.<br>Protegé a <b>Pip</b>, tu pequeño aliado.',
    play: 'JUGAR', survival: 'SUPERVIVENCIA', survivalSub: 'Sin fin · Ranking global',
    campaign: 'CAMPAÑA', campaignSub: '30 niveles · 3 mundos',
    store: 'TIENDA', leaderboard: 'RANKING', back: 'VOLVER', best: 'Récord',
    freeCoins: '+100 gratis',
    // Ajustes
    settings: 'Ajustes', sound: 'Efectos', music: 'Música', vibration: 'Vibración', language: 'Idioma',
    loginGoogle: 'Iniciar sesión con Google', loginOnlyApp: 'El inicio de sesión funciona en la app de Android.', logout: 'Cerrar sesión', deleteAccount: 'Borrar cuenta',
    deleteAccountConfirm: '¿Seguro que querés borrar tu récord del ranking y tu cuenta del juego? No se puede deshacer.',
    accountDeleted: 'Tus datos fueron borrados del ranking.',
    scoreSynced: '¡Tu récord quedó sincronizado en el ranking mundial!',
    on: 'Sí', off: 'No', confirm: 'Confirmar', cancel: 'Cancelar',
    // HUD / juego
    score: 'Puntos', rage: '¡FURIA!', paused: 'PAUSA', resume: 'SEGUIR', restart: 'REINICIAR', quit: 'SALIR',
    go: '¡A COMER!', tutorialMove: 'Arrastrá para mover a la Angry Ball', tutorialGoal: 'Comete los cubos antes de que toquen a Pip',
    tutorialRage: '5 seguidos = FURIA: el tiempo se frena y podés comerte a la Anomalía',
    anomaly: '¡ANOMALÍA DETECTADA!', anomalyHint: 'Solo se la come la Furia o el Gigante', newWave: 'AMENAZA {0}',
    shieldBroken: '¡ESCUDO ROTO!', combo: 'COMBO', perfect: '¡PERFECTO!',
    pu_nova: '¡NOVA!', pu_freeze: '¡CONGELADOS!', pu_shield: '+ESCUDO', pu_grow: '¡GIGANTE!', pu_coins: '+{0} 🪙',
    // Muerte
    gameOver: 'FIN DEL JUEGO', newRecord: '¡NUEVO RÉCORD!', finalScore: 'Puntaje', kills: 'Cubos', maxCombo: 'Combo máx.', time: 'Tiempo',
    coinsEarned: 'Monedas', doubleCoins: 'x2 MONEDAS', doubled: '¡Duplicadas!', retry: 'REINTENTAR', menu: 'MENÚ',
    deathEnemy: '¡Un cubo furioso alcanzó a Pip!', deathBoss: '¡La Anomalía aplastó a Pip!',
    deathGhost: '¡Un cubo fantasma atravesó tus defensas!', deathRocket: '¡Un cohete impactó de lleno a Pip!',
    deathShard: '¡Un fragmento llegó a Pip!',
    reviveTitle: '¿Segunda oportunidad?', reviveDesc: 'Mirá un video y seguí desde acá', reviveBtn: 'REVIVIR', reviveSkip: 'No, gracias',
    adUnavailable: 'El video no está disponible ahora. Probá en un rato.',
    // Tienda
    storeTitle: 'TIENDA', tabSkins: 'Skins', tabBackgrounds: 'Fondos', tabUpgrades: 'Mejoras',
    buy: 'Comprar', equip: 'Usar', equipped: 'En uso', maxed: 'Máximo', level: 'Nivel', notEnough: 'Te faltan monedas',
    'skin-default': 'Clásica', 'skin-neon': 'Neón', 'skin-fire': 'Brasa', 'skin-ice': 'Glaciar', 'skin-rainbow': 'Arcoíris', 'skin-gold': 'Oro Puro', 'skin-void': 'Agujero Negro',
    'bg-default': 'Zona Cibernética', 'bg-fire': 'Infierno Ardiente', 'bg-space': 'Vacío Estelar', 'bg-synth': 'Atardecer Synth',
    up_shield: 'Escudo de Pip', up_shieldDesc: 'Pip arranca con {0} escudo(s).',
    up_size: 'Panza Grande', up_sizeDesc: 'La Angry Ball es un {0}% más grande.',
    up_magnet: 'Imán', up_magnetDesc: 'Atrae cubos cercanos (nivel {0}).',
    up_rage: 'Furia Larga', up_rageDesc: 'La Furia dura {0} s.',
    up_luck: 'Suerte', up_luckDesc: 'Power-ups un {0}% más seguido.',
    // Ranking
    leaderboardTitle: 'TOP 50 MUNDIAL', loading: 'Cargando…', noData: 'Todavía no hay puntajes.', offline: 'No se pudo cargar el ranking.',
    you: 'Vos', guest: 'Invitado', loginToRank: 'Iniciá sesión para aparecer en el ranking',
    // Diario
    dailyTitle: 'RECOMPENSA DIARIA', dailyDay: 'Día {0}', claim: 'COBRAR', claimDouble: 'x2 CON VIDEO', dailyStreak: 'Volvé mañana para seguir la racha',
    // Campaña
    campaignTitle: 'CAMPAÑA', world0: 'Zona Cibernética', world1: 'Infierno Ardiente', world2: 'Vacío Estelar',
    worldLocked: 'Completá el mundo anterior', levelN: 'Nivel {0}',
    levelComplete: '¡NIVEL SUPERADO!', levelFailed: 'NIVEL FALLIDO', next: 'SIGUIENTE', replay: 'REPETIR', levels: 'NIVELES',
    obj_survive: 'Sobreviví {0} s', obj_kill: 'Comete {0} cubos', obj_combo: 'Llegá a combo x{0}',
    obj_boss: 'Comete {0} Anomalía(s)', obj_ghost: 'Comete {0} fantasma(s)',
    star1: 'Cumplir el objetivo', star2: 'Que Pip no reciba golpes', star3_time: 'Terminar con 40% del tiempo', star3_kills: 'Comer {0} cubos',
    allDone: '¡Completaste la campaña! Sos leyenda.',
    levelNames: [
        'Primer Contacto', 'Hambre Insaciable', 'Resistencia', 'Cacería', 'Cadena Letal',
        'Apariciones', 'Campo de Batalla', 'Cazafantasmas', 'Asedio Total', 'La Anomalía',
        'Bautismo de Fuego', 'Divide y Comerás', 'Brasas en Cadena', 'Lluvia de Misiles', 'Fundición',
        'Espíritus del Magma', 'Reacción en Cadena', 'Tormenta Ígnea', 'Corazón del Volcán', 'Gemelas Infernales',
        'Gravedad Cero', 'Polvo de Estrellas', 'Nebulosa Fantasma', 'Supernova', 'Horizonte de Eventos',
        'Lluvia de Meteoros', 'Púlsar', 'Ecos del Vacío', 'Colapso Estelar', 'El Fin del Universo',
    ],
};

const en = {
    tagline: 'Devour the furious cubes.<br>Protect <b>Pip</b>, your tiny buddy.',
    play: 'PLAY', survival: 'SURVIVAL', survivalSub: 'Endless · Global ranking',
    campaign: 'CAMPAIGN', campaignSub: '30 levels · 3 worlds',
    store: 'SHOP', leaderboard: 'RANKING', back: 'BACK', best: 'Best',
    freeCoins: '+100 free',
    settings: 'Settings', sound: 'Sound FX', music: 'Music', vibration: 'Vibration', language: 'Language',
    loginGoogle: 'Sign in with Google', loginOnlyApp: 'Sign-in works in the Android app.', logout: 'Sign out', deleteAccount: 'Delete account',
    deleteAccountConfirm: 'Delete your ranking score and your game account? This cannot be undone.',
    accountDeleted: 'Your data was removed from the ranking.',
    scoreSynced: 'Your best score is now synced to the global ranking!',
    on: 'On', off: 'Off', confirm: 'Confirm', cancel: 'Cancel',
    score: 'Score', rage: 'RAGE!', paused: 'PAUSED', resume: 'RESUME', restart: 'RESTART', quit: 'QUIT',
    go: 'CHOW TIME!', tutorialMove: 'Drag to move the Angry Ball', tutorialGoal: 'Eat the cubes before they reach Pip',
    tutorialRage: '5 in a row = RAGE: time slows down and you can eat the Anomaly',
    anomaly: 'ANOMALY DETECTED!', anomalyHint: 'Only RAGE or GIANT can eat it', newWave: 'THREAT {0}',
    shieldBroken: 'SHIELD BROKEN!', combo: 'COMBO', perfect: 'PERFECT!',
    pu_nova: 'NOVA!', pu_freeze: 'FROZEN!', pu_shield: '+SHIELD', pu_grow: 'GIANT!', pu_coins: '+{0} 🪙',
    gameOver: 'GAME OVER', newRecord: 'NEW RECORD!', finalScore: 'Score', kills: 'Cubes', maxCombo: 'Max combo', time: 'Time',
    coinsEarned: 'Coins', doubleCoins: 'x2 COINS', doubled: 'Doubled!', retry: 'RETRY', menu: 'MENU',
    deathEnemy: 'A furious cube reached Pip!', deathBoss: 'The Anomaly crushed Pip!',
    deathGhost: 'A ghost cube slipped through!', deathRocket: 'A rocket hit Pip head-on!',
    deathShard: 'A shard reached Pip!',
    reviveTitle: 'Second chance?', reviveDesc: 'Watch a video and keep going', reviveBtn: 'REVIVE', reviveSkip: 'No, thanks',
    adUnavailable: 'No video available right now. Try again soon.',
    storeTitle: 'SHOP', tabSkins: 'Skins', tabBackgrounds: 'Arenas', tabUpgrades: 'Upgrades',
    buy: 'Buy', equip: 'Use', equipped: 'In use', maxed: 'Maxed', level: 'Level', notEnough: 'Not enough coins',
    'skin-default': 'Classic', 'skin-neon': 'Neon', 'skin-fire': 'Ember', 'skin-ice': 'Glacier', 'skin-rainbow': 'Rainbow', 'skin-gold': 'Pure Gold', 'skin-void': 'Black Hole',
    'bg-default': 'Cyber Zone', 'bg-fire': 'Burning Hell', 'bg-space': 'Star Void', 'bg-synth': 'Synth Sunset',
    up_shield: 'Pip Shield', up_shieldDesc: 'Pip starts with {0} shield(s).',
    up_size: 'Big Belly', up_sizeDesc: 'The Angry Ball is {0}% bigger.',
    up_magnet: 'Magnet', up_magnetDesc: 'Pulls nearby cubes (level {0}).',
    up_rage: 'Long Rage', up_rageDesc: 'Rage lasts {0} s.',
    up_luck: 'Luck', up_luckDesc: 'Power-ups {0}% more often.',
    leaderboardTitle: 'GLOBAL TOP 50', loading: 'Loading…', noData: 'No scores yet.', offline: 'Could not load the ranking.',
    you: 'You', guest: 'Guest', loginToRank: 'Sign in to appear in the ranking',
    dailyTitle: 'DAILY REWARD', dailyDay: 'Day {0}', claim: 'CLAIM', claimDouble: 'x2 WITH VIDEO', dailyStreak: 'Come back tomorrow to keep the streak',
    campaignTitle: 'CAMPAIGN', world0: 'Cyber Zone', world1: 'Burning Hell', world2: 'Star Void',
    worldLocked: 'Finish the previous world', levelN: 'Level {0}',
    levelComplete: 'LEVEL CLEARED!', levelFailed: 'LEVEL FAILED', next: 'NEXT', replay: 'REPLAY', levels: 'LEVELS',
    obj_survive: 'Survive {0}s', obj_kill: 'Eat {0} cubes', obj_combo: 'Reach a x{0} combo',
    obj_boss: 'Eat {0} Anomaly(ies)', obj_ghost: 'Eat {0} ghost(s)',
    star1: 'Complete the objective', star2: 'Pip takes no hits', star3_time: 'Finish with 40% time left', star3_kills: 'Eat {0} cubes',
    allDone: 'You beat the campaign! Legend.',
    levelNames: [
        'First Contact', 'Insatiable', 'Endurance', 'The Hunt', 'Lethal Chain',
        'Apparitions', 'Battlefield', 'Ghostbusters', 'Total Siege', 'The Anomaly',
        'Baptism of Fire', 'Divide & Devour', 'Chained Embers', 'Missile Rain', 'Foundry',
        'Magma Spirits', 'Chain Reaction', 'Firestorm', 'Volcano Heart', 'Infernal Twins',
        'Zero Gravity', 'Stardust', 'Ghost Nebula', 'Supernova', 'Event Horizon',
        'Meteor Shower', 'Pulsar', 'Void Echoes', 'Stellar Collapse', 'End of the Universe',
    ],
};

const dict = { es, en };

function detect() {
    if (save.settings.lang && dict[save.settings.lang]) return save.settings.lang;
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'es'];
    if (langs.some(l => l.toLowerCase().startsWith('es'))) return 'es';
    return langs[0].toLowerCase().startsWith('en') ? 'en' : 'es';
}

export let lang = detect();
export let t = dict[lang];

export function fmt(str, ...args) {
    return String(str).replace(/\{(\d)\}/g, (_, i) => args[i]);
}

export function setLang(l) {
    lang = l;
    t = dict[l];
    save.settings.lang = l;
    applyI18n();
}

export function applyI18n(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t[el.dataset.i18n] ?? el.textContent; });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t[el.dataset.i18nHtml] ?? el.innerHTML; });
    document.documentElement.lang = lang;
}

export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
