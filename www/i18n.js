// --- Internationalization (i18n) ---
const translations = {
    es: {
        title1: 'ANGRY',
        title2: 'BALL',
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
        deathGhost: '¡Un Bloque Fantasma traspasó tus defensas!',
        deathRocket: '¡Un Cohete impacto directo contra el objetivo!',
        deleteAccount: 'Eliminar Cuenta',
        deleteAccountConfirm: '¿Seguro que quieres borrar tu récord global de Firebase y eliminar tu cuenta del juego? Esta acción no se puede deshacer.',
        accountDeleted: 'Tus datos han sido eliminados del ranking.',
        scoreSynced: '¡Tu récord local ha sido sincronizado en el ranking mundial!',
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
        guest: 'Invitado',
        menu: 'MENÚ PRINCIPAL'
    },
    en: {
        title1: 'ANGRY',
        title2: 'BALL',
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
        deathGhost: 'A Ghost Block phased through your defenses!',
        deathRocket: 'A Rocket made a direct hit on the target!',
        deleteAccount: 'Delete Account',
        deleteAccountConfirm: 'Are you sure you want to delete your global high score from Firebase and remove your account from the game? This action cannot be undone.',
        accountDeleted: 'Your data has been deleted from the leaderboard.',
        scoreSynced: 'Your local high score has been synchronized to the global leaderboard!',
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
        guest: 'Guest',
        menu: 'MAIN MENU'
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
    document.getElementById('menu-btn').textContent = t.menu;

    // Leaderboard
    document.getElementById('ranking-btn').textContent = t.leaderboard;
    document.getElementById('lbl-leaderboard-title').textContent = t.leaderboardTitle;
    document.getElementById('close-leaderboard-btn').textContent = t.back;
    document.getElementById('login-btn').textContent = t.loginGoogle;

    // Actualizar lang en el html tag
    document.documentElement.lang = lang;
});

