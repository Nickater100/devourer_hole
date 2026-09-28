package com.nickater.devourer;

import android.util.Log;

import com.appodeal.ads.Appodeal;
import com.appodeal.ads.BannerCallbacks;
import com.appodeal.ads.InterstitialCallbacks;
import com.appodeal.ads.RewardedVideoCallbacks;
import com.appodeal.ads.initializing.ApdInitializationError;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Puente mínimo entre el juego (JS) y el SDK oficial de Appodeal para Android.
 *
 * Existe porque no hay plugin de Capacitor vigente: el de Cordova oficial es de
 * 2018 (SDK 2.x) y el comunitario no trae video recompensado.
 *
 * Desde JS se usa como window.Capacitor.Plugins.Appodeal. Los callbacks del SDK
 * se reenvían como eventos con el mismo nombre (onRewardedVideoFinished, etc.).
 */
@CapacitorPlugin(name = "Appodeal")
public class AppodealPlugin extends Plugin {

    private static final String TAG = "AppodealPlugin";
    private boolean iniciado = false;

    // Las llamadas show* quedan pendientes hasta que el anuncio se cierra, así el
    // JS puede hacer `await` y saber qué pasó.
    private PluginCall rewardedPendiente;
    private PluginCall interstitialPendiente;
    private boolean rewardedTerminado = false;

    @PluginMethod
    public void initialize(PluginCall call) {
        String appKey = call.getString("appKey");
        if (appKey == null || appKey.isEmpty()) {
            call.reject("falta appKey");
            return;
        }
        if (iniciado) {
            call.resolve();
            return;
        }
        // Un build de debug SIEMPRE pide anuncios de prueba: mirar anuncios reales
        // desde el propio teléfono o un emulador es tráfico inválido, y es lo que
        // hace bloquear una cuenta de publicidad.
        boolean testing = BuildConfig.DEBUG || Boolean.TRUE.equals(call.getBoolean("testing", false));

        getActivity().runOnUiThread(() -> {
            Appodeal.setTesting(testing);
            // Banner, interstitial y rewarded son los tres formatos que usa el juego.
            int tipos = Appodeal.BANNER | Appodeal.INTERSTITIAL | Appodeal.REWARDED_VIDEO;
            registrarCallbacks();
            Appodeal.initialize(getActivity(), appKey, tipos, (List<ApdInitializationError> errores) -> {
                iniciado = true;
                JSObject r = new JSObject();
                if (errores != null && !errores.isEmpty()) {
                    StringBuilder sb = new StringBuilder();
                    for (ApdInitializationError e : errores) sb.append(e.toString()).append("; ");
                    Log.w(TAG, "Appodeal inició con errores: " + sb);
                    r.put("errors", sb.toString());
                }
                call.resolve(r);
            });
        });
    }

    @PluginMethod
    public void showBanner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean ok = Appodeal.show(getActivity(), Appodeal.BANNER_BOTTOM);
            JSObject r = new JSObject();
            r.put("shown", ok);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void hideBanner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Appodeal.hide(getActivity(), Appodeal.BANNER);
            call.resolve();
        });
    }

    @PluginMethod
    public void isLoaded(PluginCall call) {
        String tipo = call.getString("type", "rewarded");
        int t = "interstitial".equals(tipo) ? Appodeal.INTERSTITIAL
                : "banner".equals(tipo) ? Appodeal.BANNER : Appodeal.REWARDED_VIDEO;
        JSObject r = new JSObject();
        r.put("loaded", Appodeal.isLoaded(t));
        call.resolve(r);
    }

    /** Resuelve {shown:false} si no había anuncio cargado; si no, al cerrarse. */
    @PluginMethod
    public void showInterstitial(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!Appodeal.isLoaded(Appodeal.INTERSTITIAL)) {
                JSObject r = new JSObject();
                r.put("shown", false);
                call.resolve(r);
                return;
            }
            interstitialPendiente = call;
            if (!Appodeal.show(getActivity(), Appodeal.INTERSTITIAL)) {
                interstitialPendiente = null;
                JSObject r = new JSObject();
                r.put("shown", false);
                call.resolve(r);
            }
        });
    }

    /**
     * Resuelve {shown:false} si no había video; si se mostró, al cerrarse con
     * {shown:true, finished}. `finished` es lo que decide si hay recompensa.
     */
    @PluginMethod
    public void showRewarded(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!Appodeal.isLoaded(Appodeal.REWARDED_VIDEO)) {
                JSObject r = new JSObject();
                r.put("shown", false);
                r.put("finished", false);
                call.resolve(r);
                return;
            }
            rewardedTerminado = false;
            rewardedPendiente = call;
            if (!Appodeal.show(getActivity(), Appodeal.REWARDED_VIDEO)) {
                rewardedPendiente = null;
                JSObject r = new JSObject();
                r.put("shown", false);
                r.put("finished", false);
                call.resolve(r);
            }
        });
    }

    private void cerrarRewarded(boolean mostrado) {
        if (rewardedPendiente == null) return;
        JSObject r = new JSObject();
        r.put("shown", mostrado);
        r.put("finished", rewardedTerminado);
        rewardedPendiente.resolve(r);
        rewardedPendiente = null;
    }

    private void cerrarInterstitial(boolean mostrado) {
        if (interstitialPendiente == null) return;
        JSObject r = new JSObject();
        r.put("shown", mostrado);
        interstitialPendiente.resolve(r);
        interstitialPendiente = null;
    }

    private void evento(String nombre) {
        notifyListeners(nombre, new JSObject());
    }

    private void registrarCallbacks() {
        Appodeal.setRewardedVideoCallbacks(new RewardedVideoCallbacks() {
            @Override public void onRewardedVideoLoaded(boolean isPrecache) { evento("onRewardedVideoLoaded"); }
            @Override public void onRewardedVideoFailedToLoad() { evento("onRewardedVideoFailedToLoad"); }
            @Override public void onRewardedVideoShown() { evento("onRewardedVideoShown"); }
            @Override public void onRewardedVideoShowFailed() {
                evento("onRewardedVideoShowFailed");
                cerrarRewarded(false);
            }
            @Override public void onRewardedVideoClicked() { evento("onRewardedVideoClicked"); }
            @Override public void onRewardedVideoFinished(double amount, String name) {
                rewardedTerminado = true;
                JSObject d = new JSObject();
                d.put("amount", amount);
                d.put("name", name);
                notifyListeners("onRewardedVideoFinished", d);
            }
            @Override public void onRewardedVideoClosed(boolean finished) {
                // Algunas redes avisan el "finished" recién acá y no en onFinished.
                if (finished) rewardedTerminado = true;
                evento("onRewardedVideoClosed");
                cerrarRewarded(true);
            }
            @Override public void onRewardedVideoExpired() { evento("onRewardedVideoExpired"); }
        });

        Appodeal.setInterstitialCallbacks(new InterstitialCallbacks() {
            @Override public void onInterstitialLoaded(boolean isPrecache) { evento("onInterstitialLoaded"); }
            @Override public void onInterstitialFailedToLoad() { evento("onInterstitialFailedToLoad"); }
            @Override public void onInterstitialShown() { evento("onInterstitialShown"); }
            @Override public void onInterstitialShowFailed() {
                evento("onInterstitialShowFailed");
                cerrarInterstitial(false);
            }
            @Override public void onInterstitialClicked() { evento("onInterstitialClicked"); }
            @Override public void onInterstitialClosed() {
                evento("onInterstitialClosed");
                cerrarInterstitial(true);
            }
            @Override public void onInterstitialExpired() { evento("onInterstitialExpired"); }
        });

        Appodeal.setBannerCallbacks(new BannerCallbacks() {
            @Override public void onBannerLoaded(int height, boolean isPrecache) { evento("onBannerLoaded"); }
            @Override public void onBannerFailedToLoad() { evento("onBannerFailedToLoad"); }
            @Override public void onBannerShown() { evento("onBannerShown"); }
            @Override public void onBannerShowFailed() { evento("onBannerShowFailed"); }
            @Override public void onBannerClicked() { evento("onBannerClicked"); }
            @Override public void onBannerExpired() { evento("onBannerExpired"); }
        });
    }
}
