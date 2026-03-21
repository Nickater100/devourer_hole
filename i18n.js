// --- Internationalization (i18n) ---
const translations = {
    es: {
        title1: 'EL AGUJERO',
        title2: 'DEVORADOR',
        subtitle: 'Trágate los bloques enemigos.<br>Protege la esfera interactiva.<br><span class="danger">Persiguen al objetivo. ¡Defiéndelo!</span>',
        highScore: 'Mejor Puntaje',
        play: 'JUGAR',
        store: 'TIENDA',
        storeTitle: 'LA TIENDA',
        storeSoon: '¡Próximamente podrás comprar mejoras y poderes aquí!',
        back: 'VOLVER',
        points: 'Puntos',
        gameOver: 'Fin del Juego',
        finalScore: 'Puntuación Final',
        bestScore: 'Mejor Puntaje',
        retry: 'REINTENTAR',
        slowMo: 'SLOW MO',
        deathEnemy: '¡Un enemigo destruyó el objetivo!',
        deathBoss: '¡La Anomalía Magenta aplastó la esfera!',
        buy: 'Comprar',
        equip: 'Equipar',
        equipped: 'Equipado',
        owned: 'Comprado',
        insufficient: 'Monedas insuficientes',
        skinNeon: 'Skin Neón',
        skinNeonDesc: 'Azul cian eléctrico con brillo intenso.',
        skinFire: 'Skin de Fuego',
        skinFireDesc: 'Gradiente ígneo con partículas de humo.',
        skinRainbow: 'Skin Arcoíris',
        skinRainbowDesc: 'Ciclo cromático psicodélico.',
        upgradeShield: 'Escudo VIP',
        upgradeShieldDesc: 'La esfera resiste 1 impacto de bloque.',
        upgradeSize: 'Agujero Grande',
        upgradeSizeDesc: 'Aumenta el radio del agujero un 15%.',
        upgradeMagnet: 'Súper Imán',
        upgradeMagnetDesc: 'Succión de bloques más potente.',
        leaderboard: 'RANKING',
        leaderboardTitle: 'TOP 50 GLOBAL',
        loginGoogle: 'Iniciar sesión con Google',
        logout: 'Cerrar sesión',
        loading: 'Cargando...',
        guest: 'Invitado'
    },
    en: {
        title1: 'THE',
        title2: 'DEVOURER',
        subtitle: 'Swallow enemy blocks.<br>Protect the interactive sphere.<br><span class="danger">They chase the target. Defend it!</span>',
        highScore: 'Best Score',
        play: 'PLAY',
        store: 'SHOP',
        storeTitle: 'THE SHOP',
        storeSoon: 'Upgrades and powers available below:',
        back: 'BACK',
        points: 'Score',
        gameOver: 'Game Over',
        finalScore: 'Final Score',
        bestScore: 'Best Score',
        retry: 'RETRY',
        slowMo: 'SLOW MO',
        deathEnemy: 'An enemy destroyed the target!',
        deathBoss: 'The Magenta Anomaly crushed the sphere!',
        buy: 'Buy',
        equip: 'Equip',
        equipped: 'Equipped',
        owned: 'Owned',
        insufficient: 'Not enough coins',
        skinNeon: 'Neon Skin',
        skinNeonDesc: 'Electric cyan with intense glow.',
        skinFire: 'Fire Skin',
        skinFireDesc: 'Fiery gradient with smoke effects.',
        skinRainbow: 'Rainbow Skin',
        skinRainbowDesc: 'Psychedelic color cycle.',
        upgradeShield: 'VIP Shield',
        upgradeShieldDesc: 'Sphere survives 1 block impact.',
        upgradeSize: 'Bigger Hole',
        upgradeSizeDesc: 'Increases hole radius by 15%.',
        upgradeMagnet: 'Super Magnet',
        upgradeMagnetDesc: 'Stronger block suction power.',
        leaderboard: 'RANKING',
        leaderboardTitle: 'GLOBAL TOP 50',
        loginGoogle: 'Sign in with Google',
        logout: 'Sign out',
        loading: 'Loading...',
        guest: 'Guest'
    }
};

// Detectar idioma: revisar TODAS las preferencias del navegador (no solo la principal)
// Si el usuario tiene español en cualquier posición (es, es-AR, es-419), usamos español.
const userLangs = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'es'];

const prefersSpanish = userLangs.some(l => l.toLowerCase().startsWith('es'));
const lang = (!prefersSpanish && userLangs[0].toLowerCase().startsWith('en')) ? 'en' : 'es';
const t = translations[lang];

// Aplicar traducciones al HTML estático
document.addEventListener('DOMContentLoaded', () => {
    // Pantalla de inicio
    document.querySelector('#start-screen h1').innerHTML = `${t.title1}<br><span>${t.title2}</span>`;
    document.querySelector('#start-screen p').innerHTML = t.subtitle;
    // Labels con ID propio → nunca tocamos los <span> de datos que usa game.js
    document.getElementById('lbl-high-score').textContent = t.highScore;
    document.getElementById('start-btn').textContent = t.play;
    document.getElementById('store-btn').textContent = t.store;

    // Tienda
    document.querySelector('#store-screen h1').textContent = t.storeTitle;
    document.getElementById('close-store-btn').textContent = t.back;

    // HUD (ahora manejado por game.js para evitar conflictos)

    // Pantalla Game Over (ahora manejado por game.js)
    document.querySelector('#game-over-screen h2').textContent = t.gameOver;
    document.getElementById('restart-btn').textContent = t.retry;

    // Leaderboard
    document.getElementById('ranking-btn').textContent = t.leaderboard;
    document.getElementById('lbl-leaderboard-title').textContent = t.leaderboardTitle;
    document.getElementById('close-leaderboard-btn').textContent = t.back;
    document.getElementById('login-btn').textContent = t.loginGoogle;

    // Actualizar lang en el html tag
    document.documentElement.lang = lang;
});

