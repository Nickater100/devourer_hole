const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

// Ensure www exists
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
}

// Files to copy
const filesToCopy = [
    'index.html',
    'style.css',
    'game.js',
    'i18n.js',
    'firebase-init.js'
];

filesToCopy.forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${file} to www/`);
    } else {
        console.warn(`Warning: ${file} not found!`);
    }
});

console.log('Running esbuild to bundle AdMob plugin...');
try {
    execSync('npx esbuild admob-init.js --bundle --outfile=www/admob-bundle.js', { stdio: 'inherit' });
} catch (e) {
    console.error('esbuild failed for admob', e);
}

console.log('Running esbuild to bundle GoogleAuth plugin...');
try {
    execSync('npx esbuild google-auth-init.js --bundle --outfile=www/google-auth-bundle.js', { stdio: 'inherit' });
} catch (e) {
    console.error('esbuild failed for google auth', e);
}

console.log('Running esbuild to bundle Haptics plugin...');
try {
    execSync('npx esbuild haptics-init.js --bundle --outfile=www/haptics-bundle.js', { stdio: 'inherit' });
} catch (e) {
    console.error('esbuild failed for haptics', e);
}

console.log('Build complete!');
