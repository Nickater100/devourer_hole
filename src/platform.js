// Todo lo que habla con el teléfono: vibración, anuncios (Unity LevelPlay) y
// el pedido de opinión en Play.
import { save, persist } from './storage.js';

// ---------- Vibración ----------
export function vibrate(kind) {
    if (!save.settings.vibration) return;
    const H = window.HapticsPlugin;
    try {
        if (H && window.Capacitor?.isNativePlatform?.()) {
            const S = window.HapticsImpactStyle || {};
            if (kind === 'heavy') H.vibrate({ duration: 400 });
            else if (kind === 'medium') H.impact({ style: S.Heavy || 'HEAVY' });
            else H.impact({ style: S.Light || 'LIGHT' });
        } else if (navigator.vibrate) {
            navigator.vibrate(kind === 'heavy' ? [120, 60, 220] : kind === 'medium' ? 40 : 12);
        }
    } catch { /* sin vibración no pasa nada */ }
}

// ---------- Publicidad ----------
// LevelPlay (ex ironSource) es un mediador: subasta cada anuncio entre ironSource
// Ads, Unity Ads, Liftoff y AdMob. El puente nativo es
// android/app/src/main/java/com/nickater/devourer/LevelPlayPlugin.java; las redes
// y sus IDs se configuran en el panel (platform.ironsrc.com, app "Angry Ball").
// Ninguno de estos IDs es secreto: viajan dentro de la APK.
const LEVELPLAY_APP_KEY = '297377bbd';
const LEVELPLAY_BANNER_ID = 'brypbzu64gljahwi';
const LEVELPLAY_INTERSTITIAL_ID = 'nq4vvzfu9prg5kog';
const LEVELPLAY_REWARDED_ID = 'vne8ekdur6r1mfm0';

const getAds = () => window.Capacitor?.Plugins?.LevelPlay;
let adsReady = false;
let bannerWanted = true;
// La recompensa pendiente es UNA función que se consume una sola vez: así un
// aviso tardío ('rewardedLate') nunca revive a nadie desde el menú.
let pendingReward = null;
// En el navegador (sin anuncios) se puede simular con ?fakeads para probar.
const fakeAds = new URLSearchParams(location.search).has('fakeads');

export async function initAds() {
    const Ads = getAds();
    if (!Ads || !window.Capacitor?.isNativePlatform?.()) return;
    try {
        await Ads.initialize({
            appKey: LEVELPLAY_APP_KEY,
            rewardedAdUnitId: LEVELPLAY_REWARDED_ID,
            interstitialAdUnitId: LEVELPLAY_INTERSTITIAL_ID,
        });
        // Algunas redes avisan la recompensa DESPUÉS de cerrar el video.
        Ads.addListener('rewardedLate', () => grant());
        adsReady = true;
        if (bannerWanted) showBanner();
    } catch (e) {
        console.error('LevelPlay initialization error', e);
    }
}

function grant() {
    const fn = pendingReward;
    pendingReward = null;
    if (fn) fn();
}

export function showBanner() {
    bannerWanted = true;
    if (adsReady) getAds().showBanner({ adUnitId: LEVELPLAY_BANNER_ID }).catch(e => console.error('banner', e));
}

export function hideBanner() {
    bannerWanted = false;
    if (adsReady) getAds().hideBanner().catch(e => console.error('banner', e));
}

// Si no está listo se saltea: lo pide el juego, no el jugador.
export async function showInterstitial() {
    if (!adsReady) return;
    try { await getAds().showInterstitial(); } catch (e) { console.error('interstitial', e); }
}

// Devuelve 'granted', 'cancelled' (se vio pero no entero) o 'unavailable'.
// `onReward` corre como mucho una vez.
export async function showRewarded(onReward) {
    if (fakeAds) { onReward(); return 'granted'; }
    if (!adsReady) return 'unavailable';
    pendingReward = onReward;
    try {
        const r = await getAds().showRewarded();
        if (!r.shown) { pendingReward = null; return 'unavailable'; }
        if (r.finished) { grant(); return 'granted'; }
        // Si no terminó, puede llegar tarde por 'rewardedLate'; se deja unos segundos.
        const fn = onReward;
        setTimeout(() => { if (pendingReward === fn) pendingReward = null; }, 4000);
        return 'cancelled';
    } catch (e) {
        console.error('rewarded', e);
        pendingReward = null;
        return 'unavailable';
    }
}

export const isNative = () => !!window.Capacitor?.isNativePlatform?.();

// ---------- Opiniones en Play ----------
// Puente nativo: android/app/src/main/java/com/nickater/devourer/InAppReviewPlugin.java.
// Se pide solo en un buen momento (nivel con 3 estrellas o récord), a quien ya
// jugó un rato, y con meses de distancia: Google tiene su propia cuota y no
// avisa si mostró la ventana, así que pedir de más no suma y molesta.
const REVIEW_MIN_GAMES = 4;
const REVIEW_GAP_DAYS = [0, 30, 90]; // espera antes del 1.º, 2.º y 3.º pedido
let reviewAskedThisSession = false;

export function maybeAskReview() {
    const Review = window.Capacitor?.Plugins?.InAppReview;
    if (!Review || !isNative() || reviewAskedThisSession) return;
    const r = save.review;
    if (r.asks >= REVIEW_GAP_DAYS.length) return;
    const played = save.stats.games + save.campaign.stars.filter(s => s > 0).length;
    if (played < REVIEW_MIN_GAMES) return;
    if (Date.now() - r.last < REVIEW_GAP_DAYS[r.asks] * 86400000) return;
    reviewAskedThisSession = true;
    r.last = Date.now();
    r.asks++;
    persist();
    // Que se vea el resultado (estrellas, récord) antes de la ventana de Google.
    setTimeout(() => Review.request().catch(e => console.warn('review', e)), 2600);
}
