// Arma www/: copia los archivos estáticos y empaqueta el juego (src/) y los
// plugins de Capacitor con esbuild.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = __dirname;
const out = path.join(root, 'www');
fs.mkdirSync(out, { recursive: true });

// Restos de la versión anterior (el juego ahora sale de src/)
for (const old of ['i18n.js', 'firebase-init.js']) {
    const p = path.join(out, old);
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

for (const file of ['index.html', 'style.css']) {
    fs.copyFileSync(path.join(root, file), path.join(out, file));
    console.log(`Copiado ${file}`);
}

const watch = process.argv.includes('--watch');
// Chrome 80+ cubre los WebView de Android 7 (minSdk 24) actualizados.
const common = { bundle: true, target: ['chrome80'], logLevel: 'info' };

const builds = [
    { entryPoints: ['src/main.js'], outfile: 'www/game.js', format: 'iife', minify: !watch, sourcemap: watch ? 'inline' : false },
    { entryPoints: ['google-auth-init.js'], outfile: 'www/google-auth-bundle.js' },
    { entryPoints: ['haptics-init.js'], outfile: 'www/haptics-bundle.js' },
];

(async () => {
    if (watch) {
        const ctx = await esbuild.context({ ...common, ...builds[0] });
        await ctx.watch();
        console.log('Mirando cambios en src/…');
        return;
    }
    await Promise.all(builds.map(b => esbuild.build({ ...common, ...b })));
    console.log('Build listo.');
})().catch(e => { console.error(e); process.exit(1); });
