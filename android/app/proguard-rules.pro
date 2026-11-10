# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# STACK TRACES LEGIBLES. Con R8 los nombres se ofuscan; el mapping.txt de cada
# build los traduce en la consola de Play, pero sólo si se conservan las líneas.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- LevelPlay (las mismas reglas que Astragal) ---
# LEVELPLAY CARGA LOS ADAPTADORES POR REFLEXIÓN. El mediador busca cada red por
# nombre de clase (com.ironsource.adapters.<red>.<Red>Adapter); si R8 los borra
# o los renombra, la red queda fuera de la subasta sin ningún error visible:
# simplemente no puja. Son las reglas que pide la documentación de LevelPlay.
# (LevelPlayPlugin lo conserva Capacitor: trae su regla para @CapacitorPlugin.)
-keepattributes JavascriptInterface,*Annotation*
-keep class com.ironsource.adapters.** { *; }
-keep class com.unity3d.mediation.** { *; }
-keepclassmembers class com.ironsource.sdk.controller.IronSourceWebView$JSInterface {
    public *;
}
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
-dontwarn com.ironsource.mediationsdk.**
-dontwarn com.ironsource.adapters.**
-dontwarn com.unity3d.mediation.**

# Los SDK de anuncios nombran clases opcionales de Play Services que no siempre
# están en la app, y sin esto R8 corta el build por una referencia que nunca se usa.
-dontwarn com.google.android.gms.**
-keepclassmembers class **$WhenMappings {
    <fields>;
}

# EL ADAPTADOR DE LIFTOFF (vungle-adapter 5.15.0), SIN SU
# `-keep class com.google.android.gms.internal.** { *; }`: conservaba entero el
# código interno de Play Services (unas 1.100 clases) y hundía la métrica de
# optimización de R8 en Play. El resto de su proguard.txt es del SDK viejo de
# Vungle; el de hoy (com.vungle.ads) trae sus reglas.
-dontwarn com.google.android.gms.ads.identifier.**
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-keepattributes Signature, InnerClasses
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn javax.annotation.**
-dontwarn kotlin.Unit
-dontwarn retrofit2.-KotlinExtensions
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase
-dontwarn com.vungle.warren.downloader.DownloadRequestMediator$Status
-dontwarn com.vungle.warren.error.VungleError$ErrorCode
-dontwarn com.amazon.**

# LO QUE LOS SDK DE ANUNCIOS BUSCAN EN PLAY SERVICES POR NOMBRE (un texto, no
# una referencia que R8 pueda seguir). Si R8 las renombra, el SDK concluye que
# el teléfono no tiene Play Services, sin ningún error.
-keep class com.google.android.gms.ads.identifier.AdvertisingIdClient { *; }
-keep class com.google.android.gms.ads.identifier.AdvertisingIdClient$* { *; }
-keep class com.google.android.gms.appset.** { *; }
-keep class com.google.android.gms.tasks.** { *; }
