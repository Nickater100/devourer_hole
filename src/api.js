// Cuenta y ranking contra la API propia (server/), que reemplaza a Firebase.
// El login es el nativo de Google (plugin de Capacitor): da un ID token que el
// servidor verifica y cambia por una sesión propia.
import { save, persist } from './storage.js';

const DEFAULT_BASE = 'https://astragal.duckdns.org/angryball/api';
const q = new URLSearchParams(location.search);
const debug = q.has('debug');
// Sólo en modo debug se puede apuntar a otro servidor (p. ej. uno local).
export const API_BASE = (debug && q.get('api')) || DEFAULT_BASE;
const DEV_LOGIN = debug ? q.get('devlogin') : null;

const TOKEN_KEY = 'angryball_session';
const USER_KEY = 'angryball_user';
const GOOGLE_CLIENT_ID = '857081135448-r4n44jakpp9lccn73527so10ai1oped1.apps.googleusercontent.com';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } };

let token = read(TOKEN_KEY);
let user = read(USER_KEY);      // { id, name, photo }
let cloudBest = 0;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn(user));

export class ApiError extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
}

async function request(method, path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
        const r = await fetch(API_BASE + path, {
            method,
            headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: ctrl.signal,
        });
        const data = await r.json().catch(() => ({}));
        if (r.status === 401 && token && path !== '/auth/google') setSession(null, null); // sesión vencida o borrada
        if (!r.ok) throw new ApiError(r.status, data.error || `HTTP ${r.status}`);
        return data;
    } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(0, 'sin conexión');
    } finally {
        clearTimeout(timer);
    }
}

function setSession(t, u) {
    token = t; user = u;
    write(TOKEN_KEY, t); write(USER_KEY, u);
    if (!u) cloudBest = 0;
    emit();
}

const google = () => window.GoogleAuthPlugin;
const isNative = () => !!(window.CapacitorCore?.isNativePlatform?.() || window.Capacitor?.isNativePlatform?.());

try { google()?.initialize?.({ clientId: GOOGLE_CLIENT_ID, scopes: ['profile', 'email'], grantOfflineAccess: true }); } catch { /* web sin plugin */ }

// Sube la mejor partida guardada si la nube no la tiene. Los récords de la
// versión vieja que no traen estadísticas no se pueden validar y no se suben.
async function syncBest() {
    if (!user) return null;
    const run = [save.pendingRun, save.bestRun].filter(Boolean).sort((a, b) => b.score - a.score)[0];
    if (!run || run.score <= cloudBest) { save.pendingRun = null; persist(); return null; }
    const r = await request('POST', '/scores', run);
    cloudBest = r.best;
    save.pendingRun = null;
    persist();
    return r;
}

export const account = {
    get user() { return user; },
    get best() { return cloudBest; },
    get available() { return isNative() || !!DEV_LOGIN; },
    onChange(fn) { listeners.add(fn); fn(user); return () => listeners.delete(fn); },

    // Al abrir la app: valida la sesión guardada y sube lo pendiente.
    async init() {
        if (!token) return;
        try {
            const me = await request('GET', '/me');
            cloudBest = me.best;
            setSession(token, me.user);
            await syncBest().catch(() => {});
        } catch { /* sin red: se queda con la sesión guardada */ }
    },

    // Reintento barato de lo que quedó sin subir (al volver la red o la app).
    retryPending() {
        if (token && save.pendingRun) return this.init();
        return Promise.resolve();
    },

    async login() {
        let idToken;
        if (DEV_LOGIN) {
            idToken = 'dev:' + DEV_LOGIN; // sólo lo acepta un servidor local con DEV_FAKE_LOGIN=1
        } else {
            if (!isNative() || !google()) throw new ApiError(0, 'solo-app');
            const g = await google().signIn();
            idToken = g?.authentication?.idToken;
            if (!idToken) throw new ApiError(0, 'Google no devolvió el token');
        }
        const r = await request('POST', '/auth/google', { idToken });
        cloudBest = r.best;
        setSession(r.token, r.user);
        const synced = await syncBest().catch(() => null);
        return { ...r, synced };
    },

    async logout() {
        try { await request('POST', '/auth/logout'); } catch { /* igual se cierra local */ }
        try { await google()?.signOut?.(); } catch { /* idem */ }
        setSession(null, null);
    },

    async deleteAccount() {
        await request('DELETE', '/me');
        try { await google()?.signOut?.(); } catch { /* idem */ }
        setSession(null, null);
    },

    // Se llama al terminar una partida de supervivencia.
    async submitRun(run) {
        if (!user || run.score <= cloudBest) return null;
        try {
            const r = await request('POST', '/scores', run);
            cloudBest = r.best;
            return r;
        } catch (e) {
            // Sin red: queda pendiente (la mejor) y se reintenta al volver.
            if (e.status === 0 && (!save.pendingRun || run.score > save.pendingRun.score)) { save.pendingRun = run; persist(); }
            throw e;
        }
    },

    leaderboard: () => request('GET', '/leaderboard?limit=50'),
};
