// La API, sin framework: son seis rutas. createApp recibe sus dependencias
// (base y verificador de Google) para poder probarla sin red.
import { readFileSync } from 'node:fs';
import { bearer, hashToken, newToken } from './auth.js';
import { checkRun } from './validate.js';

const SESSION_TTL = 180 * 24 * 3600 * 1000; // 6 meses
const MAX_BODY = 8 * 1024;
const DELETE_PAGE = readFileSync(new URL('./pages/borrar-cuenta.html', import.meta.url), 'utf8');

// Límites en memoria: hay UN proceso. Con varios habría que llevarlos a la base.
function limiter(max, windowMs) {
    const hits = new Map();
    setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.until < now) hits.delete(k); }, windowMs).unref();
    return (key) => {
        const now = Date.now();
        let h = hits.get(key);
        if (!h || h.until < now) { h = { n: 0, until: now + windowMs }; hits.set(key, h); }
        return ++h.n <= max;
    };
}

class HttpError extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
}

export function createApp({ db, verifyIdToken, allowedOrigins = [], log = console }) {
    const authLimit = limiter(30, 15 * 60 * 1000);   // por IP
    const scoreLimit = limiter(20, 60 * 1000);        // por usuario
    const generalLimit = limiter(240, 60 * 1000);     // por IP

    const publicUser = (u) => ({ id: u.id, name: u.name, photo: u.photo });
    const meInfo = (u) => {
        const best = db.bestOf(u.id);
        return { user: publicUser(u), best: best ? best.score : 0, rank: best ? db.rankOf(best.score) : null };
    };

    function sessionUser(req, required = true) {
        const tok = bearer(req);
        const u = tok ? db.userForSession(hashToken(tok)) : null;
        if (!u && required) throw new HttpError(401, 'sesión inválida');
        return u;
    }

    const routes = {
        'GET /health': () => ({ ok: true, scores: db.countScores() }),

        'POST /auth/google': async (req, body, ip) => {
            if (!authLimit(ip)) throw new HttpError(429, 'demasiados intentos');
            if (typeof body?.idToken !== 'string' || body.idToken.length > 4096) throw new HttpError(400, 'falta idToken');
            let g;
            try { g = await verifyIdToken(body.idToken); }
            catch (e) { log.warn('token de Google rechazado:', e.message); throw new HttpError(401, 'token inválido'); }
            const u = db.upsertGoogleUser(g);
            const token = newToken();
            db.createSession(hashToken(token), u.id, SESSION_TTL);
            return { token, ...meInfo(u) };
        },

        'POST /auth/logout': (req) => {
            const tok = bearer(req);
            if (tok) db.deleteSession(hashToken(tok));
            return { ok: true };
        },

        'GET /me': (req) => meInfo(sessionUser(req)),

        // Google Play exige poder borrar la cuenta desde la app.
        'DELETE /me': (req) => {
            const u = sessionUser(req);
            db.deleteUser(u.id);
            log.info(`cuenta ${u.id} borrada`);
            return { ok: true };
        },

        'POST /scores': (req, body) => {
            const u = sessionUser(req);
            if (!scoreLimit(String(u.id))) throw new HttpError(429, 'demasiados envíos');
            const chk = checkRun(body);
            if (!chk.ok) {
                log.warn(`puntaje rechazado de ${u.id}: ${chk.why}`, JSON.stringify(body).slice(0, 200));
                throw new HttpError(422, chk.why);
            }
            const record = db.submitScore(u.id, chk.run);
            return { record, ...meInfo(u) };
        },

        'GET /leaderboard': (req, body, ip, url) => {
            const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit')) || 50));
            const me = sessionUser(req, false);
            const top = db.top(limit).map((r, i) => ({ rank: i + 1, name: r.name, photo: r.photo, score: r.score, me: !!me && r.id === me.id }));
            return { top, me: me ? meInfo(me) : null };
        },
    };

    function cors(req, res) {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            res.setHeader('Access-Control-Max-Age', '86400');
        }
    }

    function send(res, status, data) {
        const body = JSON.stringify(data);
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
    }

    async function readBody(req) {
        if (req.method !== 'POST') return null;
        let size = 0;
        const chunks = [];
        for await (const c of req) {
            size += c.length;
            if (size > MAX_BODY) throw new HttpError(413, 'cuerpo muy grande');
            chunks.push(c);
        }
        if (!size) return {};
        try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new HttpError(400, 'JSON inválido'); }
    }

    return async function handler(req, res) {
        // Detrás de nginx req.socket.remoteAddress es siempre 127.0.0.1.
        const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '?';
        cors(req, res);
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        const url = new URL(req.url, 'http://x');
        if (req.method === 'GET' && (url.pathname === '/borrar-cuenta' || url.pathname === '/delete-account')) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(DELETE_PAGE);
            return;
        }
        const route = routes[`${req.method} ${url.pathname}`];
        try {
            if (!route) throw new HttpError(404, 'no existe');
            if (!generalLimit(ip)) throw new HttpError(429, 'demasiados pedidos');
            const body = await readBody(req);
            send(res, 200, await route(req, body, ip, url));
        } catch (e) {
            const status = e.status || 500;
            if (status === 500) log.error(e);
            send(res, status, { error: status === 500 ? 'error interno' : e.message });
        }
    };
}
