package com.nickater.devourer;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins locales se registran ANTES de super.onCreate, que es donde
        // Capacitor arma el puente con JS.
        registerPlugin(AppodealPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
