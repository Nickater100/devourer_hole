// Arranque del servicio. Toda la configuración sale de variables de entorno.
import { createServer } from 'node:http';
import { openDb } from './db.js';
import { googleVerifier } from './auth.js';
import { createApp } from './app.js';

const env = process.env;
const PORT = parseInt(env.PORT || '3010');
const DB_PATH = env.DB_PATH || './data/angryball.db';
// Client ID web del proyecto de Google de Angry Ball: es el "serverClientId"
// del plugin nativo (capacitor.config.json), así que es la audiencia de los
// tokens que manda la APK. No es secreto: viaja dentro de la app.
const GOOGLE_CLIENT_IDS = (env.GOOGLE_CLIENT_IDS || '857081135448-r4n44jakpp9lccn73527so10ai1oped1.apps.googleusercontent.com')
    .split(',').map(s => s.trim()).filter(Boolean);
// Orígenes del WebView de Capacitor (https://localhost en Android) y del
// servidor local de pruebas.
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || 'https://localhost,http://localhost,capacitor://localhost,http://localhost:5178')
    .split(',').map(s => s.trim()).filter(Boolean);

let verifyIdToken = googleVerifier(GOOGLE_CLIENT_IDS);
// Sólo para probar en la PC sin el login nativo: acepta "dev:<nombre>".
// Nunca en producción (la imagen Docker fija NODE_ENV=production).
if (env.DEV_FAKE_LOGIN === '1') {
    if (env.NODE_ENV === 'production') throw new Error('DEV_FAKE_LOGIN no se puede usar con NODE_ENV=production');
    const real = verifyIdToken;
    verifyIdToken = async (tok) => tok.startsWith('dev:')
        ? { sub: 'dev-' + tok.slice(4), name: tok.slice(4), photo: '' }
        : real(tok);
    console.warn('⚠ DEV_FAKE_LOGIN activo: cualquiera entra como cualquiera. Sólo para pruebas locales.');
}

const db = openDb(DB_PATH);
const app = createApp({ db, verifyIdToken, allowedOrigins: ALLOWED_ORIGINS });

setInterval(() => db.purgeExpiredSessions(), 6 * 3600 * 1000).unref();

const server = createServer(app);
server.listen(PORT, () => console.log(`Angry Ball API en :${PORT} · base ${DB_PATH} · ${db.countScores()} puntajes`));

for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
        server.close(() => { db.close(); process.exit(0); });
        setTimeout(() => process.exit(0), 5000).unref();
    });
}
