// Fondos animados. La capa fija se pre-renderiza al cambiar de tamaño y cada
// frame solo se dibujan los detalles que se mueven.
import { drawGlow } from './render.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

function layer(w, h, dpr) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    return [c, g];
}

const THEMES = {
    'bg-default': {
        build(w, h, dpr) {
            const [c, g] = layer(w, h, dpr);
            const grad = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
            grad.addColorStop(0, '#16204a');
            grad.addColorStop(1, '#070a1c');
            g.fillStyle = grad;
            g.fillRect(0, 0, w, h);
            const s = Math.max(36, Math.min(w, h) / 9);
            g.strokeStyle = 'rgba(80,140,255,0.09)';
            g.lineWidth = 1;
            g.beginPath();
            for (let x = (w / 2) % s; x <= w; x += s) { g.moveTo(x, 0); g.lineTo(x, h); }
            for (let y = (h / 2) % s; y <= h; y += s) { g.moveTo(0, y); g.lineTo(w, y); }
            g.stroke();
            g.fillStyle = 'rgba(120,200,255,0.25)';
            for (let x = (w / 2) % s; x <= w; x += s) for (let y = (h / 2) % s; y <= h; y += s) g.fillRect(x - 1, y - 1, 2, 2);
            // Circuitos
            g.strokeStyle = 'rgba(255,0,200,0.07)';
            g.lineWidth = 2;
            for (let i = 0; i < 14; i++) {
                let x = Math.round(rand(0, w / s)) * s + (w / 2) % s, y = Math.round(rand(0, h / s)) * s + (h / 2) % s;
                g.beginPath(); g.moveTo(x, y);
                for (let k = 0; k < 4; k++) {
                    if (Math.random() < 0.5) x += s * (Math.random() < 0.5 ? -1 : 1); else y += s * (Math.random() < 0.5 ? -1 : 1);
                    g.lineTo(x, y);
                }
                g.stroke();
            }
            return { canvas: c, grid: s, pulses: [] };
        },
        animate(ctx, st, w, h, t, dt) {
            // Pulsos de luz que viajan por la grilla
            if (st.pulses.length < 6 && Math.random() < dt * 1.5) {
                const horiz = Math.random() < 0.5;
                const off = (horiz ? (h / 2) % st.grid : (w / 2) % st.grid);
                const line = Math.floor(rand(0, (horiz ? h : w) / st.grid)) * st.grid + off;
                st.pulses.push({ horiz, line, pos: -40, speed: rand(120, 320), color: Math.random() < 0.7 ? '#4fc3ff' : '#ff4fd8' });
            }
            for (const p of st.pulses) {
                p.pos += p.speed * dt;
                const x = p.horiz ? p.pos : p.line, y = p.horiz ? p.line : p.pos;
                drawGlow(ctx, x, y, 26, p.color, 0.5);
            }
            st.pulses = st.pulses.filter(p => p.pos < (p.horiz ? w : h) + 40);
        },
    },
    'bg-fire': {
        build(w, h, dpr) {
            const [c, g] = layer(w, h, dpr);
            const grad = g.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, '#120403');
            grad.addColorStop(1, '#2a0805');
            g.fillStyle = grad;
            g.fillRect(0, 0, w, h);
            // Grietas de lava
            // Grietas: caminos con dirección general y pasos cortos, como roca partida
            for (let i = 0; i < 7; i++) {
                let x = rand(0, w), y = rand(0, h), a = rand(0, TAU);
                const pts = [[x, y]];
                for (let k = 0; k < 14; k++) { a += rand(-0.7, 0.7); const st = rand(10, 26); x += Math.cos(a) * st; y += Math.sin(a) * st; pts.push([x, y]); }
                for (const [lw, col] of [[10, 'rgba(255,60,0,0.05)'], [4, 'rgba(255,110,20,0.09)'], [1.2, 'rgba(255,190,90,0.22)']]) {
                    g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round';
                    g.beginPath(); pts.forEach(([px, py], j) => j ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
                }
            }
            const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
            v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
            g.fillStyle = v; g.fillRect(0, 0, w, h);
            return { canvas: c, embers: Array.from({ length: 40 }, () => ({ x: rand(0, w), y: rand(0, h), v: rand(15, 50), s: rand(1, 3), ph: rand(0, TAU) })) };
        },
        animate(ctx, st, w, h, t, dt) {
            drawGlow(ctx, w / 2, h * 1.05, w * 0.9, '#ff3d00', 0.12 + Math.sin(t * 1.3) * 0.04);
            ctx.globalCompositeOperation = 'lighter';
            for (const e of st.embers) {
                e.y -= e.v * dt; e.x += Math.sin(t * 2 + e.ph) * 12 * dt;
                if (e.y < -10) { e.y = h + 10; e.x = rand(0, w); }
                ctx.fillStyle = `rgba(255,${120 + (e.ph * 20 | 0)},40,${0.5 + Math.sin(t * 5 + e.ph) * 0.3})`;
                ctx.fillRect(e.x, e.y, e.s, e.s);
            }
            ctx.globalCompositeOperation = 'source-over';
        },
    },
    'bg-space': {
        build(w, h, dpr) {
            const [c, g] = layer(w, h, dpr);
            g.fillStyle = '#05060f';
            g.fillRect(0, 0, w, h);
            const blobs = [['#5b2a86', 0.25], ['#1f4e9c', 0.2], ['#a12a6b', 0.14], ['#2a7c86', 0.12]];
            for (const [col, a] of blobs) {
                for (let i = 0; i < 2; i++) {
                    const x = rand(0, w), y = rand(0, h), r = rand(0.3, 0.6) * Math.max(w, h);
                    const gr = g.createRadialGradient(x, y, 0, x, y, r);
                    gr.addColorStop(0, col + Math.round(a * 255).toString(16).padStart(2, '0'));
                    gr.addColorStop(1, col + '00');
                    g.fillStyle = gr; g.fillRect(0, 0, w, h);
                }
            }
            for (let i = 0; i < 260; i++) {
                g.fillStyle = `rgba(255,255,255,${rand(0.15, 0.6)})`;
                const s = Math.random() < 0.9 ? 1 : 2;
                g.fillRect(rand(0, w), rand(0, h), s, s);
            }
            return { canvas: c, stars: Array.from({ length: 40 }, () => ({ x: rand(0, w), y: rand(0, h), ph: rand(0, TAU), s: rand(1.5, 3) })), shoot: null };
        },
        animate(ctx, st, w, h, t, dt) {
            for (const s of st.stars) {
                const a = 0.4 + Math.sin(t * 2 + s.ph) * 0.4;
                if (a > 0.5) drawGlow(ctx, s.x, s.y, s.s * 4, '#cfe3ff', a * 0.7);
                ctx.fillStyle = `rgba(255,255,255,${a})`;
                ctx.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
            }
            if (!st.shoot && Math.random() < dt * 0.15) st.shoot = { x: rand(0, w), y: rand(0, h * 0.5), vx: rand(300, 500) * (Math.random() < 0.5 ? -1 : 1), vy: rand(150, 250), life: 1 };
            if (st.shoot) {
                const s = st.shoot;
                s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.2;
                ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, s.life)})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12); ctx.stroke();
                if (s.life <= 0) st.shoot = null;
            }
        },
    },
    'bg-synth': {
        build(w, h, dpr) {
            const [c, g] = layer(w, h, dpr);
            const sky = g.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, '#12002b');
            sky.addColorStop(0.42, '#3b0a57');
            sky.addColorStop(0.5, '#7a1a6a');
            sky.addColorStop(0.5, '#0c0018');
            sky.addColorStop(1, '#14002a');
            g.fillStyle = sky; g.fillRect(0, 0, w, h);
            // Sol con franjas
            const r = Math.min(w, h) * 0.28, cx = w / 2, cy = h * 0.5;
            g.save();
            g.beginPath(); g.rect(0, 0, w, cy); g.clip();
            const sun = g.createLinearGradient(0, cy - r, 0, cy);
            sun.addColorStop(0, '#ffe66d'); sun.addColorStop(1, '#ff2e88');
            g.fillStyle = sun;
            g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
            g.fillStyle = '#3b0a57';
            for (let i = 0; i < 6; i++) { const y = cy - r * 0.55 + i * r * 0.1; g.fillRect(cx - r, y, r * 2, r * 0.025 * (i + 1)); }
            g.restore();
            for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(255,255,255,${rand(0.1, 0.5)})`; g.fillRect(rand(0, w), rand(0, h * 0.45), 1, 1); }
            g.fillStyle = 'rgba(5,0,15,0.35)'; g.fillRect(0, 0, w, h);
            return { canvas: c };
        },
        animate(ctx, st, w, h, t) {
            const hy = h * 0.5;
            ctx.strokeStyle = 'rgba(255,60,200,0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = -12; i <= 12; i++) { ctx.moveTo(w / 2 + i * w * 0.02, hy); ctx.lineTo(w / 2 + i * w * 0.25, h); }
            const phase = (t * 0.6) % 1;
            for (let i = 0; i < 12; i++) {
                const z = (i + phase) / 12;
                const y = hy + (h - hy) * z * z;
                ctx.moveTo(0, y); ctx.lineTo(w, y);
            }
            ctx.stroke();
        },
    },
};

export class Background {
    constructor() { this.id = null; this.st = null; this.w = 0; this.h = 0; }

    set(id, w, h, dpr) {
        if (!THEMES[id]) id = 'bg-default';
        if (id === this.id && w === this.w && h === this.h && this.st) return;
        this.id = id; this.w = w; this.h = h;
        this.st = THEMES[id].build(w, h, dpr);
    }

    draw(ctx, t, dt) {
        ctx.drawImage(this.st.canvas, 0, 0, this.w, this.h);
        THEMES[this.id].animate(ctx, this.st, this.w, this.h, t, dt);
    }

    // Miniatura estática para la tienda.
    static thumb(id, size) {
        const [c] = layer(size, size, 1);
        const st = THEMES[id].build(size, size, 1);
        const g = c.getContext('2d');
        g.drawImage(st.canvas, 0, 0);
        THEMES[id].animate(g, st, size, size, 1.3, 0);
        return c;
    }
}
