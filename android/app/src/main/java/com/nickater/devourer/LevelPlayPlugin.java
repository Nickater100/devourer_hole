package com.nickater.devourer;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.mediation.LevelPlay;
import com.unity3d.mediation.LevelPlayAdError;
import com.unity3d.mediation.LevelPlayAdInfo;
import com.unity3d.mediation.LevelPlayAdSize;
import com.unity3d.mediation.LevelPlayConfiguration;
import com.unity3d.mediation.LevelPlayInitError;
import com.unity3d.mediation.LevelPlayInitListener;
import com.unity3d.mediation.LevelPlayInitRequest;
import com.unity3d.mediation.banner.LevelPlayBannerAdView;
import com.unity3d.mediation.banner.LevelPlayBannerAdViewListener;
import com.unity3d.mediation.interstitial.LevelPlayInterstitialAd;
import com.unity3d.mediation.interstitial.LevelPlayInterstitialAdListener;
import com.unity3d.mediation.rewarded.LevelPlayReward;
import com.unity3d.mediation.rewarded.LevelPlayRewardedAd;
import com.unity3d.mediation.rewarded.LevelPlayRewardedAdListener;

/*
 * Puente entre el juego (JS) y Unity LevelPlay (ex ironSource), el mediador que
 * subasta cada anuncio entre las redes compiladas en app/build.gradle: ironSource
 * Ads, Unity Ads, Liftoff y AdMob. Es el mismo esquema que usa Astragal, el otro
 * juego de la cuenta.
 *
 * ES UN PLUGIN LOCAL porque no hay uno de Capacitor vigente. Desde JS es
 * window.Capacitor.Plugins.LevelPlay: initialize, showBanner/hideBanner,
 * showInterstitial y showRewarded. Los show* resuelven al CERRARSE el anuncio,
 * así el juego puede hacer `await` y saber qué pasó.
 *
 * Los IDs de las ad units llegan desde JS; el App ID de AdMob NO va en el
 * manifiesto: el adaptador usa el SDK Next Gen de Google y LevelPlay se lo pasa
 * al iniciar, desde lo cargado en su panel (SDK Networks → AdMob).
 */
@CapacitorPlugin(name = "LevelPlay")
public class LevelPlayPlugin extends Plugin {

    private static final String TAG = "LevelPlayPlugin";

    /*
     * LA PRIMERA CARGA ESPERA A QUE GOOGLE TERMINE DE INICIAR. onInitSuccess es
     * de LevelPlay; el SDK Next Gen de Google (el del adaptador de AdMob) sigue
     * iniciando unos segundos más. Una subasta en ese hueco le pide la señal a
     * Google y recibe "IllegalStateException: Flags have not been initialized!"
     * (visto en Astragal con logcat, 1/11/2026): esa subasta sale sin AdMob, que
     * es la red que más paga.
     */
    private static final long ESPERA_PRIMERA_CARGA_MS = 10000;
    /* Un video pedido con la carga en curso espera esto antes de decir "sin anuncio". */
    private static final long ESPERA_DE_CARGA_MS = 15000;

    private final Handler hilo = new Handler(Looper.getMainLooper());
    private boolean iniciado = false;
    private long iniciadoEn = 0;

    @PluginMethod
    public void initialize(PluginCall call) {
        String appKey = call.getString("appKey");
        String rewardedId = call.getString("rewardedAdUnitId");
        String interstitialId = call.getString("interstitialAdUnitId");
        if (appKey == null || appKey.isEmpty()) {
            call.reject("falta appKey");
            return;
        }
        if (iniciado) {
            call.resolve();
            return;
        }

        /*
         * El Test Suite de LevelPlay SÓLO en builds de debug: muestra anuncios de
         * prueba de cada red. Mirar anuncios reales desde el propio teléfono es
         * tráfico inválido, que es lo que hizo suspender la cuenta de AdMob.
         */
        if (BuildConfig.DEBUG) LevelPlay.setMetaData("is_test_suite", "enable");

        LevelPlayInitRequest req = new LevelPlayInitRequest.Builder(appKey).build();
        LevelPlay.init(getContext(), req, new LevelPlayInitListener() {
            @Override
            public void onInitSuccess(@NonNull LevelPlayConfiguration configuration) {
                // Se resuelve DESPUÉS de crear los anuncios: un show inmediato los
                // encontraría en null y contestaría "sin anuncio".
                getActivity().runOnUiThread(() -> {
                    if (rewardedId != null && !rewardedId.isEmpty()) {
                        video = new LevelPlayRewardedAd(rewardedId);
                        video.setListener(oyenteVideo);
                    }
                    if (interstitialId != null && !interstitialId.isEmpty()) {
                        intersticial = new LevelPlayInterstitialAd(interstitialId);
                        intersticial.setListener(oyenteIntersticial);
                    }
                    iniciadoEn = SystemClock.elapsedRealtime();
                    iniciado = true;
                    hilo.postDelayed(() -> {
                        cargarVideo();
                        cargarIntersticial();
                    }, ESPERA_PRIMERA_CARGA_MS);
                    aplicarBanner();
                    call.resolve();
                });
            }

            @Override
            public void onInitFailed(@NonNull LevelPlayInitError error) {
                Log.w(TAG, "LevelPlay no inició: " + error);
                call.reject("LevelPlay no inició: " + error.getErrorMessage());
            }
        });
    }

    /** Abre el Test Suite de LevelPlay. Sólo hace algo en builds de debug. */
    @PluginMethod
    public void launchTestSuite(PluginCall call) {
        if (!BuildConfig.DEBUG) {
            call.reject("sólo en debug");
            return;
        }
        LevelPlay.launchTestSuite(getContext());
        call.resolve();
    }

    /* ======================================================================
     * VIDEO RECOMPENSADO
     * ==================================================================== */

    private LevelPlayRewardedAd video;
    private PluginCall videoPendiente;
    private PluginCall videoEsperandoCarga;
    private boolean videoRecompensado = false;
    /*
     * Pedir loadAd() con una carga en curso NO es inocuo: el SDK contesta
     * onAdLoadFailed "627: Load is already called", y eso cortaba la espera con
     * "sin anuncio" aunque el video estuviera por llegar.
     */
    private boolean videoCargando = false;
    private String videoUltimoError;

    /**
     * Resuelve {shown:false, error} si no hubo video; si se mostró, al cerrarse,
     * con {shown:true, finished}. `finished` es lo que decide la recompensa.
     */
    @PluginMethod
    public void showRewarded(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (videoPendiente != null || videoEsperandoCarga != null) {
                call.reject("ya hay un video en pantalla");
                return;
            }
            if (video == null) {
                sinVideo(call, "LevelPlay no iniciado");
                return;
            }
            if (video.isAdReady()) {
                mostrarVideo(call);
                return;
            }
            // Todavía cargando (o falló antes): se pide y se espera un rato.
            videoEsperandoCarga = call;
            cargarVideo();
            hilo.postDelayed(() -> {
                if (videoEsperandoCarga == call) {
                    videoEsperandoCarga = null;
                    sinVideo(call, videoUltimoError != null ? videoUltimoError : "timeout de carga");
                }
            }, ESPERA_DE_CARGA_MS);
        });
    }

    private void cargarVideo() {
        if (video == null || videoCargando || video.isAdReady()) return;
        videoCargando = true;
        video.loadAd();
    }

    private void mostrarVideo(PluginCall call) {
        videoRecompensado = false;
        videoPendiente = call;
        video.showAd(getActivity());
    }

    private void sinVideo(PluginCall call, String motivo) {
        Log.i(TAG, "sin video: " + motivo);
        JSObject r = new JSObject();
        r.put("shown", false);
        r.put("finished", false);
        r.put("error", motivo);
        call.resolve(r);
    }

    private void cerrarVideo(boolean mostrado) {
        if (videoPendiente != null) {
            JSObject r = new JSObject();
            r.put("shown", mostrado);
            r.put("finished", videoRecompensado);
            videoPendiente.resolve(r);
            videoPendiente = null;
        }
        // LevelPlay no recarga solo: el próximo se pide al cerrar este.
        cargarVideo();
    }

    private final LevelPlayRewardedAdListener oyenteVideo = new LevelPlayRewardedAdListener() {
        @Override public void onAdLoaded(@NonNull LevelPlayAdInfo info) {
            videoCargando = false;
            videoUltimoError = null;
            Log.i(TAG, "video cargado: " + info.getAdNetwork());
            if (videoEsperandoCarga != null) {
                PluginCall c = videoEsperandoCarga;
                videoEsperandoCarga = null;
                mostrarVideo(c);
            }
        }
        @Override public void onAdLoadFailed(@NonNull LevelPlayAdError error) {
            // Ver `videoCargando`: un 627 es un pedido repetido, no un fallo de la carga en curso.
            if (error.getErrorCode() == 627) return;
            videoCargando = false;
            videoUltimoError = error.getErrorCode() + ": " + error.getErrorMessage();
            Log.w(TAG, "no cargó el video: " + videoUltimoError);
            if (videoEsperandoCarga != null) {
                PluginCall c = videoEsperandoCarga;
                videoEsperandoCarga = null;
                sinVideo(c, videoUltimoError);
            }
        }
        @Override public void onAdDisplayed(@NonNull LevelPlayAdInfo info) { }
        @Override public void onAdDisplayFailed(@NonNull LevelPlayAdError error, @NonNull LevelPlayAdInfo info) {
            Log.w(TAG, "no se pudo mostrar el video: " + error);
            cerrarVideo(false);
        }
        @Override public void onAdClicked(@NonNull LevelPlayAdInfo info) { }
        // Puede llegar ANTES o DESPUÉS de onAdClosed según la red: sólo se marca.
        @Override public void onAdRewarded(@NonNull LevelPlayReward reward, @NonNull LevelPlayAdInfo info) {
            videoRecompensado = true;
            // Si llegó después del cierre, el juego igual tiene que enterarse.
            if (videoPendiente == null) notifyListeners("rewardedLate", new JSObject());
        }
        @Override public void onAdClosed(@NonNull LevelPlayAdInfo info) {
            cerrarVideo(true);
        }
    };

    /* ======================================================================
     * INTERSTICIAL
     *
     * No espera la carga como el video: el intersticial lo pide el juego (cada
     * tantas muertes), no el jugador, así que si no está listo se saltea.
     * ==================================================================== */

    private LevelPlayInterstitialAd intersticial;
    private PluginCall intersticialPendiente;
    private boolean intersticialCargando = false;

    /** Resuelve {shown:false} si no estaba listo; si se mostró, al cerrarse. */
    @PluginMethod
    public void showInterstitial(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (intersticial == null || intersticialPendiente != null || !intersticial.isAdReady()) {
                cargarIntersticial();
                JSObject r = new JSObject();
                r.put("shown", false);
                call.resolve(r);
                return;
            }
            intersticialPendiente = call;
            intersticial.showAd(getActivity());
        });
    }

    private void cargarIntersticial() {
        if (intersticial == null || intersticialCargando || intersticial.isAdReady()) return;
        intersticialCargando = true;
        intersticial.loadAd();
    }

    private void cerrarIntersticial(boolean mostrado) {
        if (intersticialPendiente != null) {
            JSObject r = new JSObject();
            r.put("shown", mostrado);
            intersticialPendiente.resolve(r);
            intersticialPendiente = null;
        }
        cargarIntersticial();
    }

    private final LevelPlayInterstitialAdListener oyenteIntersticial = new LevelPlayInterstitialAdListener() {
        @Override public void onAdLoaded(@NonNull LevelPlayAdInfo info) {
            intersticialCargando = false;
            Log.i(TAG, "intersticial cargado: " + info.getAdNetwork());
        }
        @Override public void onAdLoadFailed(@NonNull LevelPlayAdError error) {
            if (error.getErrorCode() == 627) return;
            intersticialCargando = false;
            Log.w(TAG, "no cargó el intersticial: " + error.getErrorCode() + ": " + error.getErrorMessage());
        }
        @Override public void onAdDisplayed(@NonNull LevelPlayAdInfo info) { }
        @Override public void onAdDisplayFailed(@NonNull LevelPlayAdError error, @NonNull LevelPlayAdInfo info) {
            Log.w(TAG, "no se pudo mostrar el intersticial: " + error);
            cerrarIntersticial(false);
        }
        @Override public void onAdClicked(@NonNull LevelPlayAdInfo info) { }
        @Override public void onAdClosed(@NonNull LevelPlayAdInfo info) {
            cerrarIntersticial(true);
        }
    };

    /* ======================================================================
     * BANNER, abajo y centrado, encima del WebView
     *
     * LA ROTACIÓN LA HACE EL SDK, con la tasa de refresco del ad unit en el
     * panel. Acá sólo se pausa y se reanuda.
     *
     * NUNCA SE CARGA NI SE REFRESCA OCULTO, que es lo que una red lee como
     * tráfico inválido: oculto por el juego (en plena partida) o por Android (la
     * app pausada, la pantalla apagada). Las dos condiciones se cruzan acá
     * (`quiereVisible` y `appActiva`).
     * ==================================================================== */

    private String bannerAdUnit;
    private LevelPlayBannerAdView banner;
    /* loadAd() se llama UNA vez por vista; después refresca el SDK solo. */
    private boolean bannerPedido = false;
    private boolean quiereVisible = false;
    private boolean appActiva = true;
    private Runnable cargaDiferida;

    private int px(float dp) {
        return Math.round(dp * getContext().getResources().getDisplayMetrics().density);
    }

    /** Muestra el banner (lo crea la primera vez). Idempotente. */
    @PluginMethod
    public void showBanner(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        if (adUnitId == null || adUnitId.isEmpty()) {
            call.reject("falta adUnitId");
            return;
        }
        getActivity().runOnUiThread(() -> {
            bannerAdUnit = adUnitId;
            quiereVisible = true;
            aplicarBanner();
            call.resolve();
        });
    }

    /** Lo oculta y congela la rotación. No lo destruye: mostrarlo de nuevo no pide otra subasta. */
    @PluginMethod
    public void hideBanner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            quiereVisible = false;
            aplicarBanner();
            call.resolve();
        });
    }

    private void crearBanner() {
        float densidad = getContext().getResources().getDisplayMetrics().density;
        int anchoDp = Math.round(getContext().getResources().getDisplayMetrics().widthPixels / densidad);
        // ADAPTATIVO: del ancho de la pantalla, con el alto que elige la red, que
        // paga más que el 320x50 fijo.
        LevelPlayAdSize tam = LevelPlayAdSize.createAdaptiveAdSize(getContext(), anchoDp);
        if (tam == null) tam = LevelPlayAdSize.BANNER;
        LevelPlayBannerAdView.Config cfg = new LevelPlayBannerAdView.Config.Builder().setAdSize(tam).build();
        banner = new LevelPlayBannerAdView(getActivity(), bannerAdUnit, cfg);
        banner.setBannerListener(oyenteBanner);
        banner.setBackgroundColor(Color.TRANSPARENT);
        banner.setVisibility(View.INVISIBLE);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(px(tam.getWidth()), px(tam.getHeight()));
        lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        ViewGroup raiz = getActivity().findViewById(android.R.id.content);
        raiz.addView(banner, lp);
    }

    /* El único lugar que decide si el banner se ve, carga o rota. */
    private void aplicarBanner() {
        boolean aLaVista = iniciado && quiereVisible && appActiva && bannerAdUnit != null;
        if (aLaVista) {
            if (banner == null) crearBanner();
            banner.setVisibility(View.VISIBLE);
            banner.bringToFront();
            if (!bannerPedido) programarPrimeraCarga();
            else banner.resumeAutoRefresh();
        } else if (banner != null) {
            if (bannerPedido) banner.pauseAutoRefresh();
            banner.setVisibility(View.INVISIBLE);
            if (cargaDiferida != null) hilo.removeCallbacks(cargaDiferida);
            cargaDiferida = null;
        }
    }

    /* Respeta la misma espera que el video (ESPERA_PRIMERA_CARGA_MS). */
    private void programarPrimeraCarga() {
        if (cargaDiferida != null) return;
        long espera = Math.max(0, iniciadoEn + ESPERA_PRIMERA_CARGA_MS - SystemClock.elapsedRealtime());
        cargaDiferida = () -> {
            cargaDiferida = null;
            if (banner == null || bannerPedido || !quiereVisible || !appActiva) return;
            bannerPedido = true;
            banner.loadAd();
        };
        hilo.postDelayed(cargaDiferida, espera);
    }

    private final LevelPlayBannerAdViewListener oyenteBanner = new LevelPlayBannerAdViewListener() {
        @Override public void onAdLoaded(@NonNull LevelPlayAdInfo info) {
            Log.i(TAG, "banner cargado: " + info.getAdNetwork());
        }
        @Override public void onAdLoadFailed(@NonNull LevelPlayAdError error) {
            // Los fallos de una rotación los reintenta el SDK en la siguiente.
            Log.i(TAG, "banner sin anuncio: " + error.getErrorCode() + ": " + error.getErrorMessage());
        }
    };

    /* Android pausa la actividad: pantalla apagada, otra app, el anuncio que abrió el navegador. */
    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        appActiva = false;
        aplicarBanner();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        appActiva = true;
        aplicarBanner();
    }

    @Override
    protected void handleOnDestroy() {
        if (cargaDiferida != null) hilo.removeCallbacks(cargaDiferida);
        if (banner != null) banner.destroy();
        banner = null;
        super.handleOnDestroy();
    }
}
