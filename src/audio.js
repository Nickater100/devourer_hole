// Sonido 100% sintetizado con WebAudio: efectos y una música procedural que
// acelera con la Furia. Nada que descargar.
import { save } from './storage.js';

let ctx = null;
let master, sfxBus, musicBus;
let noiseBuf = null;

function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = save.settings.sound ? 0.55 : 0;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = save.settings.music ? 0.22 : 0;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
}

// Android exige usar el contexto dentro de un gesto para desbloquearlo.
export function unlockAudio() {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
    if (ctx.state !== 'running') ctx.resume();
}

export function applyAudioSettings() {
    if (!ctx) return;
    const now = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(save.settings.sound ? 0.55 : 0, now, 0.05);
    musicBus.gain.setTargetAtTime(save.settings.music ? 0.22 : 0, now, 0.1);
}

export function suspendAudio(yes) {
    if (!ctx) return;
    if (yes) ctx.suspend(); else ctx.resume();
}

const ready = () => ctx && ctx.state === 'running' && save.settings.sound;

function tone({ type = 'sine', f0, f1, dur, vol = 0.5, delay = 0, bus = sfxBus, attack = 0.005 }) {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
}

function noise({ dur, vol = 0.4, freq = 1200, q = 1, type = 'lowpass', delay = 0, sweep }) {
    const t0 = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(sfxBus);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
}

// Escala pentatónica: el tono sube con el combo y siempre suena bien.
const PENTA = [0, 2, 4, 7, 9];
const noteHz = (semi) => 220 * Math.pow(2, semi / 12);
function comboNote(combo) {
    const step = Math.min(combo, 20);
    return noteHz(12 + PENTA[step % 5] + 12 * Math.floor(step / 5));
}

export const sfx = {
    eat(combo = 0) {
        if (!ready()) return;
        const f = comboNote(combo);
        tone({ type: 'triangle', f0: f * 1.5, f1: f * 0.5, dur: 0.12, vol: 0.45 });
        tone({ type: 'sine', f0: f, dur: 0.18, vol: 0.25, delay: 0.02 });
    },
    chomp() {
        if (!ready()) return;
        noise({ dur: 0.06, vol: 0.25, freq: 900, type: 'bandpass', q: 2 });
    },
    rage() {
        if (!ready()) return;
        tone({ type: 'sawtooth', f0: 110, f1: 440, dur: 0.5, vol: 0.3 });
        tone({ type: 'square', f0: 220, f1: 880, dur: 0.45, vol: 0.15, delay: 0.05 });
        noise({ dur: 0.6, vol: 0.25, freq: 400, sweep: 4000, type: 'bandpass', q: 1 });
    },
    boom() {
        if (!ready()) return;
        tone({ type: 'sawtooth', f0: 180, f1: 30, dur: 0.45, vol: 0.5 });
        noise({ dur: 0.4, vol: 0.5, freq: 2000, sweep: 100 });
    },
    bounce() {
        if (!ready()) return;
        tone({ type: 'square', f0: 140, f1: 70, dur: 0.12, vol: 0.25 });
    },
    shield() {
        if (!ready()) return;
        tone({ type: 'sine', f0: 1200, f1: 300, dur: 0.3, vol: 0.4 });
        noise({ dur: 0.25, vol: 0.3, freq: 3000, type: 'highpass' });
    },
    powerup() {
        if (!ready()) return;
        [0, 4, 7, 12].forEach((s, i) => tone({ type: 'triangle', f0: noteHz(24 + s), dur: 0.14, vol: 0.3, delay: i * 0.05 }));
    },
    coin() {
        if (!ready()) return;
        tone({ type: 'square', f0: 988, dur: 0.06, vol: 0.18 });
        tone({ type: 'square', f0: 1319, dur: 0.18, vol: 0.18, delay: 0.06 });
    },
    freeze() {
        if (!ready()) return;
        for (let i = 0; i < 6; i++) tone({ type: 'sine', f0: 1800 + Math.random() * 1600, dur: 0.15, vol: 0.12, delay: i * 0.03 });
    },
    nova() {
        if (!ready()) return;
        tone({ type: 'sine', f0: 80, f1: 40, dur: 0.6, vol: 0.6 });
        noise({ dur: 0.7, vol: 0.45, freq: 6000, sweep: 200 });
    },
    death() {
        if (!ready()) return;
        tone({ type: 'sawtooth', f0: 400, f1: 50, dur: 0.9, vol: 0.4 });
        tone({ type: 'square', f0: 300, f1: 40, dur: 0.9, vol: 0.2, delay: 0.1 });
        noise({ dur: 0.8, vol: 0.4, freq: 1500, sweep: 80 });
    },
    click() {
        if (!ready()) return;
        tone({ type: 'triangle', f0: 660, f1: 880, dur: 0.05, vol: 0.2 });
    },
    star(i = 0) {
        if (!ready()) return;
        tone({ type: 'triangle', f0: noteHz(24 + [0, 4, 7][i]), dur: 0.35, vol: 0.35 });
        tone({ type: 'sine', f0: noteHz(36 + [0, 4, 7][i]), dur: 0.35, vol: 0.15 });
    },
    win() {
        if (!ready()) return;
        [0, 4, 7, 12, 16].forEach((s, i) => tone({ type: 'triangle', f0: noteHz(12 + s), dur: 0.25, vol: 0.3, delay: i * 0.09 }));
    },
    lose() {
        if (!ready()) return;
        [7, 4, 0, -5].forEach((s, i) => tone({ type: 'triangle', f0: noteHz(12 + s), dur: 0.3, vol: 0.3, delay: i * 0.14 }));
    },
    warn() {
        if (!ready()) return;
        tone({ type: 'square', f0: 880, dur: 0.12, vol: 0.15 });
        tone({ type: 'square', f0: 660, dur: 0.12, vol: 0.15, delay: 0.16 });
        tone({ type: 'square', f0: 880, dur: 0.12, vol: 0.15, delay: 0.32 });
    },
};

// ---------- Música procedural ----------
// Secuenciador con lookahead: bajo + arpegio + bombo/hihat en Am–F–C–G.
const PROG = [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]]; // relativo a La
let music = { on: false, intensity: 0, step: 0, next: 0, timer: null, tempo: 112 };

function scheduleStep(step, time) {
    const bar = Math.floor(step / 16) % PROG.length;
    const s = step % 16;
    const chord = PROG[bar];
    const root = chord[0];
    const lvl = music.intensity; // 0 menú, 1 juego, 2 furia
    const beat = 60 / music.tempo / 4;

    const play = (type, freq, dur, vol) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        o.connect(g).connect(musicBus);
        o.start(time);
        o.stop(time + dur + 0.02);
    };

    // Bajo
    if (s % 4 === 0 || (lvl >= 1 && s % 4 === 2 && s !== 14)) play('triangle', 55 * Math.pow(2, root / 12), beat * 1.8, 0.55);
    // Arpegio
    if (lvl >= 1 || s % 2 === 0) {
        const n = chord[(s + (s >> 2)) % 3] + (s % 8 >= 4 ? 12 : 0);
        play(lvl >= 2 ? 'square' : 'sine', 220 * Math.pow(2, n / 12), beat * 0.9, lvl >= 2 ? 0.08 : 0.12);
    }
    // Pad suave en el menú
    if (lvl === 0 && s === 0) chord.forEach(n => play('sine', 110 * Math.pow(2, n / 12), beat * 15, 0.06));
    // Percusión
    if (lvl >= 1) {
        if (s % 4 === 0) {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.frequency.setValueAtTime(130, time); o.frequency.exponentialRampToValueAtTime(40, time + 0.12);
            g.gain.setValueAtTime(0.7, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
            o.connect(g).connect(musicBus); o.start(time); o.stop(time + 0.16);
        }
        if (s % 2 === 1 || lvl >= 2) {
            const src = ctx.createBufferSource(); src.buffer = noiseBuf;
            const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
            const g = ctx.createGain(); g.gain.setValueAtTime(lvl >= 2 ? 0.12 : 0.08, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
            src.connect(f).connect(g).connect(musicBus); src.start(time); src.stop(time + 0.05);
        }
        if (s === 4 || s === 12) {
            const src = ctx.createBufferSource(); src.buffer = noiseBuf;
            const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.25, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
            src.connect(f).connect(g).connect(musicBus); src.start(time); src.stop(time + 0.13);
        }
    }
}

function tick() {
    if (!ctx || !music.on) return;
    if (ctx.state === 'running') {
        while (music.next < ctx.currentTime + 0.15) {
            if (music.next < ctx.currentTime - 0.2) music.next = ctx.currentTime + 0.02; // tras una pausa, no ametrallar
            scheduleStep(music.step, music.next);
            music.step++;
            music.next += 60 / music.tempo / 4;
        }
    }
    music.timer = setTimeout(tick, 40);
}

export function setMusic(intensity) {
    if (!ensure()) return;
    music.intensity = intensity;
    music.tempo = intensity === 2 ? 140 : intensity === 1 ? 118 : 92;
    if (!music.on) {
        music.on = true;
        music.next = ctx.currentTime + 0.05;
        tick();
    }
}
