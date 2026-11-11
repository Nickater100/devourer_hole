package com.nickater.devourer;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/*
 * Pide una opinión sin salir del juego (API In-App Review de Google Play). Las
 * opiniones y la calificación pesan mucho en la búsqueda de la tienda.
 *
 * Desde JS es window.Capacitor.Plugins.InAppReview.request(). Google decide si
 * muestra la ventana: tiene una cuota por usuario y NO avisa si la mostró ni qué
 * puso el jugador, así que la promesa resuelve igual. Por eso el juego elige el
 * momento (después de un logro, nunca después de perder) y espacia los pedidos.
 *
 * Solo aparece en apps instaladas desde Play (pista interna incluida), no en un
 * APK instalado a mano.
 */
@CapacitorPlugin(name = "InAppReview")
public class InAppReviewPlugin extends Plugin {

    private static final String TAG = "InAppReview";

    @PluginMethod
    public void request(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                Log.w(TAG, "requestReviewFlow", task.getException());
                call.resolve(result(false));
                return;
            }
            ReviewInfo info = task.getResult();
            getActivity().runOnUiThread(() ->
                manager.launchReviewFlow(getActivity(), info)
                    .addOnCompleteListener(done -> call.resolve(result(true))));
        });
    }

    // `launched` solo dice que se le pasó el pedido a Google, no que se mostró.
    private static JSObject result(boolean launched) {
        JSObject r = new JSObject();
        r.put("launched", launched);
        return r;
    }
}
