// Base SQLite (node:sqlite, sin dependencias nativas). Es chica a propósito:
// jugadores, su mejor partida y las sesiones. El archivo vive en un volumen de
// Docker, que en el servidor de Astragal está sobre el volumen de bloque /data.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    -- La identidad es el "sub" de Google, no el mail: el mail puede cambiar
    -- y ni siquiera lo guardamos.
    google_sub  TEXT UNIQUE,
    -- Jugadores importados de Firebase cuyo sub de Google no se conoce todavía.
    legacy_uid  TEXT UNIQUE,
    name        TEXT NOT NULL DEFAULT '',
    photo       TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    score       INTEGER NOT NULL,
    kills       INTEGER,
    seconds     INTEGER,
    best_combo  INTEGER,
    legacy      INTEGER NOT NULL DEFAULT 0,
    achieved_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_by_score ON scores(score DESC, achieved_at ASC);

-- El token de sesión se guarda HASHEADO: una tabla de tokens en claro sería
-- una lista de credenciales vivas para quien consiga un respaldo.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id);
`;

export function openDb(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec(SCHEMA);
    return makeRepo(db);
}

function makeRepo(db) {
    const q = (sql) => db.prepare(sql);
    const st = {
        userBySub: q('SELECT * FROM users WHERE google_sub = ?'),
        userById: q('SELECT * FROM users WHERE id = ?'),
        insertUser: q('INSERT INTO users (google_sub, legacy_uid, name, photo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
        updateProfile: q('UPDATE users SET name = ?, photo = ?, updated_at = ? WHERE id = ?'),
        linkLegacy: q('UPDATE users SET google_sub = ?, updated_at = ? WHERE legacy_uid = ? AND google_sub IS NULL'),
        deleteUser: q('DELETE FROM users WHERE id = ?'),

        getScore: q('SELECT * FROM scores WHERE user_id = ?'),
        upsertScore: q(`INSERT INTO scores (user_id, score, kills, seconds, best_combo, legacy, achieved_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(user_id) DO UPDATE SET
                            score = excluded.score, kills = excluded.kills, seconds = excluded.seconds,
                            best_combo = excluded.best_combo, legacy = excluded.legacy, achieved_at = excluded.achieved_at
                        WHERE excluded.score > scores.score`),
        rankOf: q('SELECT COUNT(*) + 1 AS rank FROM scores WHERE score > ?'),
        top: q(`SELECT u.id, u.name, u.photo, s.score FROM scores s JOIN users u ON u.id = s.user_id
                ORDER BY s.score DESC, s.achieved_at ASC LIMIT ?`),
        countScores: q('SELECT COUNT(*) AS n FROM scores'),

        insertSession: q('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
        sessionUser: q(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                        WHERE s.token_hash = ? AND s.expires_at > ?`),
        deleteSession: q('DELETE FROM sessions WHERE token_hash = ?'),
        purgeSessions: q('DELETE FROM sessions WHERE expires_at <= ?'),
    };

    const tx = (fn) => (...args) => {
        db.exec('BEGIN IMMEDIATE');
        try { const r = fn(...args); db.exec('COMMIT'); return r; }
        catch (e) { db.exec('ROLLBACK'); throw e; }
    };

    return {
        close: () => db.close(),

        // Alta o actualización al entrar con Google.
        upsertGoogleUser: tx(({ sub, name, photo }) => {
            const now = Date.now();
            let u = st.userBySub.get(sub);
            if (!u) {
                const id = Number(st.insertUser.run(sub, null, name, photo, now, now).lastInsertRowid);
                u = st.userById.get(id);
            } else if (u.name !== name || u.photo !== photo) {
                st.updateProfile.run(name, photo, now, u.id);
                u = st.userById.get(u.id);
            }
            return u;
        }),

        userById: (id) => st.userById.get(id),
        deleteUser: (id) => st.deleteUser.run(id).changes > 0,

        bestOf: (userId) => st.getScore.get(userId) || null,
        rankOf: (score) => st.rankOf.get(score).rank,
        // Guarda sólo si mejora. Devuelve true si fue un récord nuevo.
        submitScore: (userId, { score, kills = null, seconds = null, bestCombo = null, legacy = 0, at = Date.now() }) =>
            st.upsertScore.run(userId, score, kills, seconds, bestCombo, legacy, at).changes > 0,
        top: (limit) => st.top.all(limit),
        countScores: () => st.countScores.get().n,

        createSession: (tokenHash, userId, ttlMs) => {
            const now = Date.now();
            st.insertSession.run(tokenHash, userId, now, now + ttlMs);
        },
        userForSession: (tokenHash) => st.sessionUser.get(tokenHash, Date.now()) || null,
        deleteSession: (tokenHash) => st.deleteSession.run(tokenHash),
        purgeExpiredSessions: () => st.purgeSessions.run(Date.now()).changes,

        // Importación desde Firebase (scripts/import-firestore.js).
        importLegacy: tx(({ legacyUid, googleSub, name, photo, score, at }) => {
            const now = Date.now();
            let u = googleSub ? st.userBySub.get(googleSub) : null;
            if (!u) u = db.prepare('SELECT * FROM users WHERE legacy_uid = ?').get(legacyUid);
            if (!u) {
                const id = Number(st.insertUser.run(googleSub || null, legacyUid, name, photo, now, now).lastInsertRowid);
                u = st.userById.get(id);
            } else if (googleSub && !u.google_sub) {
                st.linkLegacy.run(googleSub, now, legacyUid);
            }
            st.upsertScore.run(u.id, score, null, null, null, 1, at || now);
            return u.id;
        }),
    };
}
