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
    },
    en: {
        title1: 'THE',
        title2: 'DEVOURER',
        subtitle: 'Swallow enemy blocks.<br>Protect the interactive sphere.<br><span class="danger">They chase the target. Defend it!</span>',
        highScore: 'Best Score',
        play: 'PLAY',
        store: 'SHOP',
        storeTitle: 'THE SHOP',
        storeSoon: 'Upgrades and powers coming soon!',
        back: 'BACK',
        points: 'Score',
        gameOver: 'Game Over',
        finalScore: 'Final Score',
        bestScore: 'Best Score',
        retry: 'RETRY',
        slowMo: 'SLOW MO',
        deathEnemy: 'An enemy destroyed the target!',
        deathBoss: 'The Magenta Anomaly crushed the sphere!',
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
    // Solo actualizar el texto del label, NO reemplazar el innerHTML completo
    // (game.js tiene referencias a los <span> internos que deben mantenerse vivos)
    document.querySelector('.high-score-display').firstChild.textContent = `${t.highScore}: `;
    document.getElementById('start-btn').textContent = t.play;
    document.getElementById('store-btn').textContent = t.store;

    // Tienda
    document.querySelector('#store-screen h1').textContent = t.storeTitle;
    document.querySelector('.store-items p').textContent = t.storeSoon;
    document.getElementById('close-store-btn').textContent = t.back;

    // HUD — solo el nodo de texto, no el <span> del número
    document.querySelector('#score-display').firstChild.textContent = `${t.points}: `;

    // Pantalla Game Over
    document.querySelector('#game-over-screen h2').textContent = t.gameOver;
    document.querySelector('.score-board p:first-child').firstChild.textContent = `${t.finalScore}: `;
    document.querySelector('.high-score-text').firstChild.textContent = `${t.bestScore}: `;
    document.getElementById('restart-btn').textContent = t.retry;

    // Actualizar lang en el html tag
    document.documentElement.lang = lang;
});

