// Trae el ranking de Firebase (Firestore, colección `leaderboard`) a la base
// nueva. Se corre UNA vez, dentro del contenedor (ver deploy/README.md):
//
//   docker compose cp clave.json app:/data/clave.json
//   docker compose exec -T app node scripts/import-firestore.js --service-account /data/clave.json --dry-run
//   docker compose exec -T app node scripts/import-firestore.js --service-account /data/clave.json
//   docker compose exec -T app rm /data/clave.json
//
// --service-account  clave JSON de una cuenta de servicio del proyecto
//          (Consola de Firebase → Configuración del proyecto → Cuentas de
//          servicio → Generar nueva clave privada). Las reglas de Firestore no
//          dejan leer el ranking sin sesión; con la clave se lee todo, y además
//          la lista de usuarios de Firebase Auth para vincular cada puntaje con
//          su cuenta de Google. Borrala después de usarla.
// --users  alternativa a lo anterior para la vinculación: el export de
//          `firebase auth:export users.json --format=json --project under-hole`.
//          Firebase identifica a cada jugador con su propio uid, distinto del
//          "sub" de Google que usa la API nueva; el export trae la
//          correspondencia (providerUserInfo.rawId). Con él, cada puntaje
//          viejo queda de su dueño y se ve como suyo al iniciar sesión. Sin él,
//          los puntajes se importan igual pero sin dueño (aparecen en el
//          ranking y nadie los puede reclamar).
// --dry-run  muestra qué haría, sin escribir.
// --file   en vez de leer Firestore, usa un JSON guardado con --save.
// --save   guarda lo leído de Firestore en un JSON (respaldo).
//
// Es idempotente: correrlo de nuevo no duplica ni baja ningún puntaje.
import { readFileSync, writeFileSync } from 'node:fs';
import { SignJWT, importPKCS8 } from 'jose';
import { openDb } from '../src/db.js';

const PROJECT = 'under-hole';
// La API key web de Firebase no es secreta (iba dentro de la app). La lectura
// la permiten las reglas de Firestore, como cuando la app pedía el ranking.
const API_KEY = 'AIzaSyCUqx74Lgt2VZR30NBLERaoapsu7MFLf2g';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const dry = args.includes('--dry-run');
const DB_PATH = process.env.DB_PATH || './data/angryball.db';

// Token OAuth de la cuenta de servicio (flujo JWT bearer de Google).
async function serviceAccountToken(path) {
    const sa = JSON.parse(readFileSync(path, 'utf8'));
    const key = await importPKCS8(sa.private_key, 'RS256');
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/cloud-platform' })
        .setProtectedHeader({ alg: 'RS256', kid: sa.private_key_id })
        .setIssuer(sa.client_email).setAudience(sa.token_uri).setIssuedAt().setExpirationTime('10m')
        .sign(key);
    const r = await fetch(sa.token_uri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!r.ok) throw new Error(`No se pudo obtener el token de la cuenta de servicio: ${r.status} ${await r.text()}`);
    return (await r.json()).access_token;
}

const authHeader = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

async function fetchFirestore(token) {
    const docs = [];
    let pageToken = '';
    do {
        const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/leaderboard?pageSize=300${token ? '' : '&key=' + API_KEY}${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
        const r = await fetch(url, { headers: authHeader(token) });
        if (r.status === 403 && !token) throw new Error('Firestore no deja leer el ranking sin sesión: pasá --service-account clave.json (ver el encabezado).');
        if (!r.ok) throw new Error(`Firestore respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const j = await r.json();
        docs.push(...(j.documents || []));
        pageToken = j.nextPageToken || '';
    } while (pageToken);
    return docs.map(d => {
        const f = d.fields || {};
        return {
            uid: d.name.split('/').pop(),
            name: f.username?.stringValue || '',
            photo: f.photoURL?.stringValue || '',
            score: parseInt(f.score?.integerValue ?? f.score?.doubleValue ?? '0'),
            at: f.timestamp?.timestampValue ? Date.parse(f.timestamp.timestampValue) : null,
        };
    });
}

// uid de Firebase → sub de Google
function addUsers(map, users) {
    for (const u of users || []) {
        const g = (u.providerUserInfo || []).find(p => p.providerId === 'google.com');
        if (g?.rawId) map.set(u.localId, String(g.rawId));
    }
}

async function fetchAuthUsers(token) {
    const map = new Map();
    let next = '';
    do {
        const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?maxResults=1000${next ? '&nextPageToken=' + encodeURIComponent(next) : ''}`, { headers: authHeader(token) });
        if (!r.ok) throw new Error(`Firebase Auth respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const j = await r.json();
        addUsers(map, j.users);
        next = j.nextPageToken || '';
    } while (next);
    return map;
}

const token = opt('--service-account') ? await serviceAccountToken(opt('--service-account')) : null;
const rows = opt('--file') ? JSON.parse(readFileSync(opt('--file'), 'utf8')) : await fetchFirestore(token);
if (opt('--save')) writeFileSync(opt('--save'), JSON.stringify(rows, null, 2));
let subs = new Map();
if (opt('--users')) addUsers(subs, JSON.parse(readFileSync(opt('--users'), 'utf8')).users);
else if (token) subs = await fetchAuthUsers(token);

const valid = rows.filter(r => Number.isFinite(r.score) && r.score > 0 && r.score < 10_000_000);
const linked = valid.filter(r => subs.has(r.uid)).length;
console.log(`Firestore: ${rows.length} documentos · ${valid.length} con puntaje válido · ${linked} vinculables a Google${subs.size ? '' : ' (sin --service-account ni --users: quedan sin dueño)'}`);
for (const r of [...valid].sort((a, b) => b.score - a.score).slice(0, 5)) console.log(`  ${String(r.score).padStart(7)}  ${r.name}`);

if (dry) { console.log('--dry-run: no se escribió nada.'); process.exit(0); }

const db = openDb(DB_PATH);
for (const r of valid) {
    db.importLegacy({ legacyUid: r.uid, googleSub: subs.get(r.uid) || null, name: r.name.slice(0, 60), photo: r.photo.slice(0, 500), score: r.score, at: r.at });
}
console.log(`Importados ${valid.length}. La base tiene ahora ${db.countScores()} puntajes.`);
db.close();
