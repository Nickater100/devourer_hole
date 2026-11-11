// Login con Google: el cliente (el plugin nativo de Android) consigue un ID
// token y el servidor lo VERIFICA contra las claves públicas de Google. Lo que
// no se puede omitir es chequear la audiencia: sin eso entraría un token válido
// emitido para cualquier otra app de Google.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export function googleVerifier(clientIds, jwks = GOOGLE_JWKS) {
    return async (idToken) => {
        const { payload } = await jwtVerify(idToken, jwks, { issuer: ISSUERS, audience: clientIds });
        if (!payload.sub) throw new Error('token sin sub');
        return {
            sub: String(payload.sub),
            name: String(payload.name || payload.given_name || '').slice(0, 60),
            photo: String(payload.picture || '').slice(0, 500),
        };
    };
}

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(t).digest('hex');

export function bearer(req) {
    const h = req.headers.authorization || '';
    const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(h);
    return m ? m[1] : null;
}
