// Arte procedural: todo se dibuja en el canvas, así escala nítido en cualquier
// pantalla. Sin shadowBlur (es lentísimo en Android): el brillo sale de sprites
// radiales pre-renderizados y pintados en modo 'lighter'.

const TAU = Math.PI * 2;

// ---------- Brillos cacheados ----------
const glowCache = new Map();
export function glow(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(0.25, hexA(color, 0.55));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
    return c;
}

export function drawGlow(ctx, x, y, radius, color, alpha = 1) {
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(glow(color), x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prev;
}

export function hexA(hex, a) {
    if (hex.startsWith('hsl')) return hex.replace('hsl(', 'hsla(').replace(')', `,${a})`);
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------- Angry Ball (el jugador) ----------
// o: { look:{x,y} dirección normalizada, mouth 0..1, rage bool, t segundos, blink 0..1, squash }
export function drawBall(ctx, x, y, r, look, o = {}) {
    const t = o.t || 0;
    let body = look.body;
    if (look.rainbow) {
        const h = (t * 90) % 360;
        body = [`hsl(${h},100%,80%)`, `hsl(${(h + 30) % 360},90%,55%)`, `hsl(${(h + 60) % 360},80%,25%)`];
    }
    const aura = look.rainbow ? `hsl(${(t * 90) % 360},100%,60%)` : look.aura;

    // Aura
    drawGlow(ctx, x, y, r * (o.rage ? 2.6 : 2.0), o.rage ? '#ff5a1f' : aura, o.rage ? 0.9 : 0.45);

    ctx.save();
    ctx.translate(x, y);
    const sq = o.squash || 0;
    ctx.scale(1 + sq, 1 - sq);

    // Agujero negro: disco de acreción girando detrás
    if (look.void) {
        ctx.save();
        ctx.rotate(t * 0.8);
        ctx.scale(1, 0.38);
        const ring = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 1.9);
        ring.addColorStop(0, 'rgba(255,170,80,0)');
        ring.addColorStop(0.25, 'rgba(255,170,80,0.85)');
        ring.addColorStop(0.55, 'rgba(199,125,255,0.6)');
        ring.addColorStop(1, 'rgba(120,60,255,0)');
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.9, 0, TAU);
        ctx.fill();
        ctx.restore();
    }

    // Cuerpo
    const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    grad.addColorStop(0, body[0]);
    grad.addColorStop(0.55, body[1]);
    grad.addColorStop(1, body[2]);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // Borde de fuego en Furia
    if (o.rage) {
        ctx.lineWidth = r * 0.12;
        ctx.strokeStyle = `rgba(255,${150 + Math.sin(t * 30) * 60 | 0},40,0.9)`;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
            const a = (i / 24) * TAU;
            const rr = r * (1.02 + Math.sin(a * 5 + t * 18) * 0.05);
            const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
    }

    // Cicatriz como en el ícono
    if (!look.void && !look.rainbow) {
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = r * 0.06;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(r * 0.38, -r * 0.72); ctx.lineTo(r * 0.62, -r * 0.42);
        ctx.moveTo(r * 0.62, -r * 0.7); ctx.lineTo(r * 0.42, -r * 0.5);
        ctx.stroke();
    }

    // Cara (mira hacia `o.look`)
    const lx = (o.lookX || 0) * r * 0.12;
    const ly = (o.lookY || 0) * r * 0.1;
    ctx.translate(lx, ly);
    const eyeY = -r * 0.12;
    const eyeDX = r * 0.36;
    const blink = o.blink || 0;
    const eyeColor = o.rage ? '#ffe066' : look.eye;
    for (const s of [-1, 1]) {
        const ex = s * eyeDX;
        drawGlow(ctx, ex, eyeY, r * 0.42, eyeColor, 0.6);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, r * 0.2, r * 0.17 * (1 - blink * 0.9), 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = eyeColor;
        ctx.beginPath();
        ctx.ellipse(ex + (o.lookX || 0) * r * 0.06, eyeY + (o.lookY || 0) * r * 0.05, r * 0.11, r * 0.11 * (1 - blink * 0.9), 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(ex + (o.lookX || 0) * r * 0.08, eyeY + (o.lookY || 0) * r * 0.06, r * 0.05 * (1 - blink * 0.8), 0, TAU);
        ctx.fill();
    }
    // Cejas furiosas
    ctx.strokeStyle = look.void ? '#c77dff' : 'rgba(40,0,0,0.9)';
    ctx.lineWidth = r * 0.13;
    ctx.lineCap = 'round';
    const browLift = o.rage ? -r * 0.04 : 0;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, eyeY - r * 0.32 + browLift); ctx.lineTo(-r * 0.14, eyeY - r * 0.14);
    ctx.moveTo(r * 0.6, eyeY - r * 0.32 + browLift); ctx.lineTo(r * 0.14, eyeY - r * 0.14);
    ctx.stroke();

    // Boca: mueca con dientes, o abierta al morder
    const m = o.mouth || 0;
    const my = r * 0.38;
    if (m > 0.05) {
        ctx.fillStyle = '#1a0000';
        ctx.beginPath();
        ctx.ellipse(0, my, r * 0.34, r * 0.08 + r * 0.24 * m, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(i * r * 0.12 - r * 0.05, my - r * 0.06 - r * 0.2 * m);
            ctx.lineTo(i * r * 0.12 + r * 0.05, my - r * 0.06 - r * 0.2 * m);
            ctx.lineTo(i * r * 0.12, my + r * 0.04 - r * 0.2 * m);
            ctx.fill();
        }
    } else {
        ctx.fillStyle = '#2a0000';
        ctx.beginPath();
        ctx.roundRect(-r * 0.32, my - r * 0.08, r * 0.64, r * 0.17, r * 0.06);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = r * 0.035;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
            const px = -r * 0.28 + (i / 8) * r * 0.56;
            const py = my + (i % 2 ? r * 0.05 : -r * 0.04);
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
    }
    ctx.translate(-lx, -ly);

    // Brillo especular
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.45, -r * 0.55, r * 0.22, r * 0.12, -0.6, 0, TAU);
    ctx.fill();

    ctx.restore();
}

// ---------- Pip (el aliado a proteger) ----------
// o: { fear 0..1, happy bool, blink, lookX, lookY, t, hurt }
export function drawPip(ctx, x, y, r, o = {}) {
    const t = o.t || 0;
    const fear = o.fear || 0;
    const shake = fear > 0.6 ? Math.sin(t * 60) * r * 0.04 : 0;
    x += shake;
    drawGlow(ctx, x, y, r * 2.4, o.hurt ? '#ff3b5c' : '#4ecca3', 0.55);
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#9ff5d6');
    grad.addColorStop(1, '#2a9d7a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    const lx = (o.lookX || 0) * r * 0.15, ly = (o.lookY || 0) * r * 0.12;
    const blink = o.blink || 0;
    const eh = r * 0.24 * (1 - blink * 0.9) * (1 + fear * 0.25);
    for (const s of [-1, 1]) {
        ctx.fillStyle = '#10302a';
        ctx.beginPath();
        ctx.ellipse(x + s * r * 0.32 + lx, y - r * 0.1 + ly, r * 0.16, eh, 0, 0, TAU);
        ctx.fill();
        if (blink < 0.5) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x + s * r * 0.32 + lx + r * 0.05, y - r * 0.18 + ly, r * 0.06, 0, TAU);
            ctx.fill();
        }
    }
    // Mejillas
    ctx.fillStyle = 'rgba(255,120,150,0.45)';
    for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + s * r * 0.58 + lx, y + r * 0.2 + ly, r * 0.14, r * 0.08, 0, 0, TAU);
        ctx.fill();
    }
    // Boca
    ctx.strokeStyle = '#10302a';
    ctx.fillStyle = '#10302a';
    ctx.lineWidth = r * 0.09;
    ctx.lineCap = 'round';
    const mx = x + lx, my = y + r * 0.32 + ly;
    if (fear > 0.4) {
        ctx.beginPath();
        ctx.ellipse(mx, my, r * 0.1, r * 0.13 * fear, 0, 0, TAU);
        ctx.fill();
    } else if (o.happy) {
        ctx.beginPath();
        ctx.arc(mx, my - r * 0.1, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.arc(mx, my - r * 0.12, r * 0.13, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.42, y - r * 0.5, r * 0.18, r * 0.1, -0.6, 0, TAU);
    ctx.fill();
}

export function drawShieldBubble(ctx, x, y, r, charges, t, invuln) {
    if (charges <= 0 && !invuln) return;
    const a = invuln ? 0.35 + Math.sin(t * 25) * 0.25 : 0.75;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.6);
    ctx.strokeStyle = hexA('#7ff3ff', a);
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
        const ang = (i / 6) * TAU;
        const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = hexA('#7ff3ff', a * 0.12);
    ctx.fill();
    ctx.restore();
    // Puntitos con las cargas que quedan
    for (let i = 0; i < charges; i++) {
        const ang = -Math.PI / 2 + (i - (charges - 1) / 2) * 0.45;
        ctx.fillStyle = '#7ff3ff';
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * r * 1.18, y + Math.sin(ang) * r * 1.18, Math.max(2, r * 0.09), 0, TAU);
        ctx.fill();
    }
}

// ---------- Cubos enemigos ----------
// o: { lookX, lookY, alpha, squash, eyes:boolean, frozen }
export function drawCube(ctx, x, y, s, color, o = {}) {
    const h = s / 2;
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    drawGlow(ctx, x, y, s * 1.3, o.frozen ? '#7fdcff' : color, 0.5 * (o.alpha ?? 1));
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    const sq = o.squash || 0;
    ctx.scale(1 + sq, 1 - sq);
    const grad = ctx.createLinearGradient(0, -h, 0, h);
    grad.addColorStop(0, shade(color, 0.35));
    grad.addColorStop(1, shade(color, -0.35));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-h, -h, s, s, s * 0.22);
    ctx.fill();
    ctx.strokeStyle = shade(color, -0.55);
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.stroke();
    if (o.frozen) {
        ctx.fillStyle = 'rgba(180,235,255,0.45)';
        ctx.fill();
    }
    if (o.eyes !== false && s > 10) {
        const lx = (o.lookX || 0) * s * 0.07, ly = (o.lookY || 0) * s * 0.07;
        for (const sd of [-1, 1]) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.ellipse(sd * s * 0.2 + lx, -s * 0.02 + ly, s * 0.13, s * 0.15, 0, 0, TAU);
            ctx.fill();
            ctx.fillStyle = '#120012';
            ctx.beginPath();
            ctx.arc(sd * s * 0.2 + lx * 1.6, -s * 0.0 + ly * 1.6, s * 0.065, 0, TAU);
            ctx.fill();
        }
        ctx.strokeStyle = '#1a0010';
        ctx.lineWidth = s * 0.09;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.36 + lx, -s * 0.27 + ly); ctx.lineTo(-s * 0.08 + lx, -s * 0.15 + ly);
        ctx.moveTo(s * 0.36 + lx, -s * 0.27 + ly); ctx.lineTo(s * 0.08 + lx, -s * 0.15 + ly);
        ctx.stroke();
        ctx.lineWidth = s * 0.07;
        ctx.beginPath();
        ctx.moveTo(-s * 0.12 + lx, s * 0.26 + ly);
        ctx.quadraticCurveTo(lx, s * 0.18 + ly, s * 0.12 + lx, s * 0.26 + ly);
        ctx.stroke();
    }
    ctx.restore();
}

export function drawRocket(ctx, x, y, w, len, rot, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // Llama
    const fl = len * (0.5 + Math.sin(t * 50) * 0.12);
    drawGlow(ctx, -len * 0.5 - fl * 0.4, 0, fl * 0.9, '#ffa502', 0.9);
    ctx.fillStyle = '#ffdd59';
    ctx.beginPath();
    ctx.moveTo(-len * 0.45, -w * 0.3); ctx.lineTo(-len * 0.45 - fl, 0); ctx.lineTo(-len * 0.45, w * 0.3);
    ctx.fill();
    // Cuerpo
    const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
    g.addColorStop(0, '#ff8a8a'); g.addColorStop(0.5, '#ff4757'); g.addColorStop(1, '#8a0f1c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(len * 0.55, 0);
    ctx.quadraticCurveTo(len * 0.3, -w / 2, -len * 0.45, -w / 2);
    ctx.lineTo(-len * 0.45, w / 2);
    ctx.quadraticCurveTo(len * 0.3, w / 2, len * 0.55, 0);
    ctx.fill();
    // Aletas
    ctx.fillStyle = '#2f3542';
    ctx.beginPath();
    ctx.moveTo(-len * 0.2, -w / 2); ctx.lineTo(-len * 0.5, -w); ctx.lineTo(-len * 0.45, -w / 2);
    ctx.moveTo(-len * 0.2, w / 2); ctx.lineTo(-len * 0.5, w); ctx.lineTo(-len * 0.45, w / 2);
    ctx.fill();
    // Ojo furioso en la punta
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(len * 0.22, 0, w * 0.22, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(len * 0.27, 0, w * 0.1, 0, TAU); ctx.fill();
    ctx.restore();
}

// ---------- Anomalía (jefe) ----------
export function drawAnomaly(ctx, x, y, r, o = {}) {
    const t = o.t || 0;
    const vuln = o.vulnerable;
    drawGlow(ctx, x, y, r * 3, vuln ? '#ffffff' : '#ff00ff', 0.7);
    ctx.save();
    ctx.translate(x, y);
    // Púas
    ctx.rotate(t * 1.5);
    ctx.fillStyle = vuln ? '#ffb3ff' : '#c2185b';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const rr = i % 2 ? r * 1.0 : r * (1.35 + Math.sin(t * 6 + i) * 0.08);
        i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-t * 1.5);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ff9cff'); g.addColorStop(0.6, '#e000e0'); g.addColorStop(1, '#4a0050');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    // Ojo cíclope
    const lx = (o.lookX || 0) * r * 0.25, ly = (o.lookY || 0) * r * 0.25;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r * (vuln ? 0.5 : 0.38), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = vuln ? '#222' : '#ff1744';
    ctx.beginPath(); ctx.arc(lx, ly, r * (vuln ? 0.14 : 0.24), 0, TAU); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(lx, ly, r * (vuln ? 0.07 : 0.12), 0, TAU); ctx.fill();
    if (!vuln) {
        ctx.strokeStyle = '#4a0050';
        ctx.lineWidth = r * 0.16;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.55); ctx.lineTo(r * 0.6, -r * 0.3); ctx.stroke();
    } else {
        // Gotita de sudor: ¡ahora sí se lo pueden comer!
        ctx.fillStyle = '#7fdcff';
        ctx.beginPath(); ctx.ellipse(r * 0.75, -r * 0.55, r * 0.12, r * 0.2, 0.3, 0, TAU); ctx.fill();
    }
    if (vuln) {
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 20) * 0.5})`;
        ctx.lineWidth = r * 0.1;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, TAU); ctx.stroke();
    }
    ctx.restore();
}

// ---------- Power-ups ----------
export function drawPowerup(ctx, x, y, r, def, t, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    drawGlow(ctx, x, y, r * 2.6, def.color, 0.8 * alpha);
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 3) * 0.2);
    ctx.fillStyle = 'rgba(10,10,30,0.75)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = r * 0.16;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, TAU); ctx.stroke();
    ctx.setLineDash([r * 0.3, r * 0.25]);
    ctx.lineWidth = r * 0.08;
    ctx.rotate(t * 2);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-t * 2);
    ctx.fillStyle = def.color;
    ctx.font = `900 ${r * 1.05}px Rubik, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.glyph, 0, r * 0.06);
    ctx.restore();
}

export function drawCoin(ctx, x, y, r, t) {
    const w = Math.abs(Math.cos(t * 4));
    drawGlow(ctx, x, y, r * 2.2, '#ffd700', 0.5);
    ctx.fillStyle = '#b8860b';
    ctx.beginPath(); ctx.ellipse(x, y, r * Math.max(0.15, w), r, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.ellipse(x, y, r * Math.max(0.1, w) * 0.8, r * 0.8, 0, 0, TAU); ctx.fill();
}
