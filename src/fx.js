// Efectos: partículas, textos flotantes, ondas expansivas.
import { drawGlow } from './render.js';

const MAX_PARTICLES = 500;

export class FX {
    constructor() { this.reset(); }

    reset() {
        this.particles = [];
        this.texts = [];
        this.rings = [];
    }

    // kind: 'spark' (brilla), 'chunk' (cuadradito), 'smoke'
    burst(x, y, color, n, { speed = 4, size = 3, life = 1, kind = 'spark', gravity = 0, spread = Math.PI * 2, angle = 0 } = {}) {
        for (let i = 0; i < n; i++) {
            if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
            const a = angle + (Math.random() - 0.5) * spread;
            const v = speed * (0.3 + Math.random() * 0.9);
            this.particles.push({
                x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, kind, gravity,
                size: size * (0.5 + Math.random()), life, max: life, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
            });
        }
    }

    text(x, y, str, color = '#fff', size = 18, { life = 0.9, rise = 40, big = false } = {}) {
        this.texts.push({ x, y, str, color, size, life, max: life, rise, big });
    }

    ring(x, y, color, maxR, { life = 0.45, width = 6 } = {}) {
        this.rings.push({ x, y, color, r: 0, maxR, life, max: life, width });
    }

    update(dt, ts) {
        const k = dt * 60 * ts;
        for (const p of this.particles) {
            p.x += p.vx * k; p.y += p.vy * k;
            p.vx *= Math.pow(0.95, k); p.vy = p.vy * Math.pow(0.95, k) + p.gravity * k;
            p.rot += p.vr * k;
            p.life -= dt * ts;
        }
        this.particles = this.particles.filter(p => p.life > 0);
        for (const tx of this.texts) tx.life -= dt;
        this.texts = this.texts.filter(tx => tx.life > 0);
        for (const r of this.rings) { r.life -= dt; r.r = r.maxR * (1 - Math.pow(r.life / r.max, 2)); }
        this.rings = this.rings.filter(r => r.life > 0);
    }

    draw(ctx) {
        for (const r of this.rings) {
            ctx.strokeStyle = r.color;
            ctx.globalAlpha = Math.max(0, r.life / r.max);
            ctx.lineWidth = r.width * (r.life / r.max) + 1;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        for (const p of this.particles) {
            const a = Math.max(0, p.life / p.max);
            if (p.kind === 'spark') {
                drawGlow(ctx, p.x, p.y, p.size * 3 * a + 1, p.color, a);
            } else if (p.kind === 'chunk') {
                ctx.save();
                ctx.globalAlpha = a;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                const s = p.size * (0.4 + a * 0.6);
                ctx.fillRect(-s / 2, -s / 2, s, s);
                ctx.restore();
            } else {
                ctx.globalAlpha = a * 0.35;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (2 - a), 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const tx of this.texts) {
            const a = tx.life / tx.max;
            const pop = tx.big ? 1 + Math.max(0, (a - 0.8) * 3) : 1 + Math.max(0, (a - 0.85) * 4);
            ctx.globalAlpha = Math.min(1, a * 2.5);
            ctx.font = `900 ${tx.size * pop}px Bungee, Rubik, system-ui, sans-serif`;
            const y = tx.y - tx.rise * (1 - a);
            ctx.lineWidth = Math.max(3, tx.size * 0.18);
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            ctx.strokeText(tx.str, tx.x, y);
            ctx.fillStyle = tx.color;
            ctx.fillText(tx.str, tx.x, y);
        }
        ctx.globalAlpha = 1;
    }
}
