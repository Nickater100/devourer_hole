import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { googleVerifier } from '../src/auth.js';
import { checkRun } from '../src/validate.js';

const CLIENT = 'angryball-test.apps.googleusercontent.com';
let base, server, db, sign;
const quiet = { info() {}, warn() {}, error() {} };

before(async () => {
    // Un "Google" de mentira: claves propias, pero el verificador es el real.
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const jwks = createLocalJWKSet({ keys: [jwk] });
    sign = (claims, { aud = CLIENT, iss = 'https://accounts.google.com', exp = '1h' } = {}) =>
        new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);

    db = openDb(':memory:');
    const app = createApp({ db, verifyIdToken: googleVerifier([CLIENT], jwks), allowedOrigins: ['https://localhost'], log: quiet });
    server = createServer(app);
    await new Promise(r => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); db.close(); });

const call = async (method, path, { body, token, headers = {} } = {}) => {
    const r = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text(), headers: r.headers };
};

const login = async (sub, name = 'Jugador ' + sub) =>
    (await call('POST', '/auth/google', { body: { idToken: await sign({ sub, name, picture: "https://x/foto.png" }) } })).data;

const run = (score, extra = {}) => ({ score, kills: Math.max(1, Math.ceil(score / 2)), seconds: Math.max(1, Math.ceil(score / 2)), bestCombo: 5, ...extra });

test('login con un token válido crea la cuenta y una sesión', async () => {
    const r = await login('sub-1', 'Ana');
    assert.ok(r.token.length > 30);
    assert.equal(r.user.name, 'Ana');
    assert.equal(r.best, 0);
    const me = await call('GET', '/me', { token: r.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.name, 'Ana');
});

test('rechaza tokens de otra app, de otro emisor o vencidos', async () => {
    for (const opts of [{ aud: 'otra-app.apps.googleusercontent.com' }, { iss: 'https://evil.example' }, { exp: '-1m' }]) {
        const r = await call('POST', '/auth/google', { body: { idToken: await sign({ sub: 'x' }, opts) } });
        assert.equal(r.status, 401, JSON.stringify(opts));
    }
    assert.equal((await call('POST', '/auth/google', { body: {} })).status, 400);
});

test('sin sesión no se puede mandar puntaje ni ver /me', async () => {
    assert.equal((await call('POST', '/scores', { body: run(10) })).status, 401);
    assert.equal((await call('GET', '/me', { token: 'x'.repeat(43) })).status, 401);
});

test('guarda sólo el mejor puntaje y calcula el ranking', async () => {
    const a = await login('sub-a', 'A');
    const b = await login('sub-b', 'B');
    let r = await call('POST', '/scores', { token: a.token, body: run(100) });
    assert.equal(r.status, 200);
    assert.equal(r.data.record, true);
    assert.equal(r.data.best, 100);
    r = await call('POST', '/scores', { token: a.token, body: run(50) });
    assert.equal(r.data.record, false);
    assert.equal(r.data.best, 100);
    await call('POST', '/scores', { token: b.token, body: run(200) });
    const lb = await call('GET', '/leaderboard?limit=10', { token: a.token });
    assert.deepEqual(lb.data.top.slice(0, 2).map(x => [x.name, x.score, x.me]), [['B', 200, false], ['A', 100, true]]);
    assert.equal(lb.data.me.rank, 2);
    // El ranking es público y no expone ids internos ni el sub de Google
    const pub = await call('GET', '/leaderboard');
    assert.equal(pub.data.me, null);
    assert.ok(!('id' in pub.data.top[0]) && !JSON.stringify(pub.data).includes('sub-'));
});

test('rechaza puntajes inverosímiles', async () => {
    const c = await login('sub-c');
    const malos = [
        { score: 1_000_000, kills: 100, seconds: 10, bestCombo: 50 },
        { score: 500, kills: 10, seconds: 300, bestCombo: 2 },   // 10 cubos con combo 2 no dan 500
        { score: 50, kills: 10, seconds: 0, bestCombo: 2 },
        { score: 50, kills: 10, seconds: 30, bestCombo: 20 },     // combo mayor que los cubos
        { score: '50', kills: 10, seconds: 30, bestCombo: 2 },
    ];
    for (const m of malos) assert.equal((await call('POST', '/scores', { token: c.token, body: m })).status, 422, JSON.stringify(m));
});

test('una partida real del juego pasa la validación', () => {
    // Números de una partida del bot: 110 puntos, 75 cubos, 90 s, combo 7.
    assert.equal(checkRun({ score: 110, kills: 75, seconds: 90, bestCombo: 7 }).ok, true);
    // Una muy buena: combo de 40 (x9) sostenido un rato
    assert.equal(checkRun({ score: 4200, kills: 900, seconds: 600, bestCombo: 40 }).ok, true);
});

test('cerrar sesión invalida el token', async () => {
    const d = await login('sub-d');
    await call('POST', '/auth/logout', { token: d.token });
    assert.equal((await call('GET', '/me', { token: d.token })).status, 401);
});

test('borrar la cuenta borra puntaje y sesiones', async () => {
    const e = await login('sub-e', 'Borrame');
    await call('POST', '/scores', { token: e.token, body: run(999) });
    assert.ok((await call('GET', '/leaderboard')).data.top.some(x => x.name === 'Borrame'));
    assert.equal((await call('DELETE', '/me', { token: e.token })).status, 200);
    assert.equal((await call('GET', '/me', { token: e.token })).status, 401);
    assert.ok(!(await call('GET', '/leaderboard')).data.top.some(x => x.name === 'Borrame'));
    // Volver a entrar arranca de cero
    const again = await login('sub-e', 'Borrame');
    assert.equal(again.best, 0);
});

test('importación de Firebase: se vincula al entrar si se conoce el sub', async () => {
    db.importLegacy({ legacyUid: 'fb-1', googleSub: 'sub-legacy', name: 'Viejo', photo: '', score: 777 });
    db.importLegacy({ legacyUid: 'fb-2', googleSub: null, name: 'Sin vincular', photo: '', score: 555 });
    const r = await login('sub-legacy', 'Viejo');
    assert.equal(r.best, 777);
    // Reimportar no duplica ni pisa un récord mayor
    db.importLegacy({ legacyUid: 'fb-1', googleSub: 'sub-legacy', name: 'Viejo', photo: '', score: 10 });
    assert.equal((await call('GET', '/me', { token: r.token })).data.best, 777);
    assert.ok((await call('GET', '/leaderboard')).data.top.some(x => x.name === 'Sin vincular'));
});

test('CORS sólo para los orígenes de la app', async () => {
    const ok = await call('OPTIONS', '/scores', { headers: { Origin: 'https://localhost' } });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://localhost');
    const no = await call('OPTIONS', '/scores', { headers: { Origin: 'https://evil.example' } });
    assert.equal(no.headers.get('access-control-allow-origin'), null);
});

test('página de borrado de cuenta (la pide Google Play)', async () => {
    const r = await call('GET', '/borrar-cuenta');
    assert.equal(r.status, 200);
    assert.match(r.data, /Borrar cuenta/);
});
