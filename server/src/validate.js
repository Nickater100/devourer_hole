// Control de verosimilitud de un puntaje de supervivencia. No es a prueba de
// tramposos decididos (el cliente arma los números), pero corta lo burdo: un
// puntaje de un millón en diez segundos, o más puntos de los que pueden dar
// los cubos comidos con el combo declarado.
//
// Las cuentas salen del juego (src/game.js):
//  - cada bocado vale base × multiplicador; la base máxima es 10 (Anomalía)
//    y el multiplicador es floor(combo / 5) + 1;
//  - en Furia se come rápido, pero ni así se pasan los ~50 puntos por segundo
//    sostenidos: el tope de 150/s deja mucho margen.
const MAX_SECONDS = 6 * 3600;

export function checkRun(body) {
    const n = (v) => (Number.isInteger(v) && v >= 0 ? v : NaN);
    const score = n(body?.score);
    const kills = n(body?.kills);
    const seconds = n(body?.seconds);
    const bestCombo = n(body?.bestCombo);

    if ([score, kills, seconds, bestCombo].some(Number.isNaN)) return { ok: false, why: 'campos inválidos' };
    if (seconds < 1 || seconds > MAX_SECONDS) return { ok: false, why: 'duración imposible' };
    if (score === 0) return { ok: false, why: 'sin puntos' };
    if (kills > seconds * 12) return { ok: false, why: 'demasiados cubos por segundo' };
    if (bestCombo > kills) return { ok: false, why: 'combo mayor que los cubos comidos' };
    if (score > 300 + seconds * 150) return { ok: false, why: 'demasiados puntos por segundo' };
    const maxPerKill = 10 * (Math.floor(bestCombo / 5) + 1);
    if (score > kills * maxPerKill) return { ok: false, why: 'más puntos de los que dan esos cubos' };
    return { ok: true, run: { score, kills, seconds, bestCombo } };
}
