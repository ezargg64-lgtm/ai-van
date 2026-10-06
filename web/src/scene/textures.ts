// ── Procedural textures ──────────────────────────────────────────────────────
// Everything is generated once on mount and cached in a module map: no external
// runtime assets, ever. Textures are drawn to tile horizontally so the panorama
// can scroll forever without a seam.

import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function tex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, wrapX = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, ctx } = canvas(w, h);
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wrapX) t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

/** Deterministic PRNG so the world looks the same on every reload. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── Interior ────────────────────────────────────────────────────────────────

export function floorTexture() {
  return tex('floor', 256, 256, (ctx, w, h) => {
    const r = rng(7);
    ctx.fillStyle = '#b98a5a';
    ctx.fillRect(0, 0, w, h);
    const planks = 4;
    const pw = w / planks;
    for (let i = 0; i < planks; i++) {
      const shade = 0.92 + r() * 0.16;
      ctx.fillStyle = `rgb(${Math.round(185 * shade)},${Math.round(138 * shade)},${Math.round(90 * shade)})`;
      ctx.fillRect(i * pw, 0, pw - 1.5, h);
      ctx.strokeStyle = 'rgba(90,60,35,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(i * pw + pw - 1, 0);
      ctx.lineTo(i * pw + pw - 1, h);
      ctx.stroke();
      // grain
      ctx.strokeStyle = 'rgba(120,80,45,0.25)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 7; g++) {
        const x = i * pw + 4 + r() * (pw - 8);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (r() - 0.5) * 6, h / 3, x + (r() - 0.5) * 6, (2 * h) / 3, x, h);
        ctx.stroke();
      }
    }
    // plank ends, offset per row so it tiles
    ctx.strokeStyle = 'rgba(80,52,30,0.5)';
    for (let row = 0; row < 2; row++) {
      const r0 = rng(31 + row);
      for (let i = 0; i < planks; i++) {
        const x = (i + 0.5 + r0() * 0.4) * pw;
        ctx.beginPath();
        ctx.moveTo(x, row * (h / 2));
        ctx.lineTo(x, row * (h / 2) + h / 2);
        ctx.stroke();
      }
    }
  });
}

export function rugTexture() {
  return tex('rug', 128, 128, (ctx, w, h) => {
    const bands = ['#c96f5a', '#e6c07b', '#6fa8a0', '#4b5a7a', '#d9a4b8'];
    const bh = h / bands.length;
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, i * bh, w, bh - 1);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 60; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 1);
  });
}

export function cushionTexture() {
  return tex('cushion', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 8; i++) ctx.fillRect(i * 8, 0, 3, h);
    for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 8, w, 3);
  });
}

// ── Panorama ────────────────────────────────────────────────────────────────

const PANO_W = 2048;
const PANO_H = 512;

/** draws at x and x±W so shapes wrap seamlessly */
function wrapped(ctx: CanvasRenderingContext2D, x: number, w: number, draw: (x: number) => void) {
  void ctx;
  draw(x);
  if (x - w < 0) draw(x + PANO_W);
  if (x + w > PANO_W) draw(x - PANO_W);
}

/** Tiling ridge line: sum of sines with integer frequencies. */
function ridge(ctx: CanvasRenderingContext2D, baseY: number, amp: number, freqs: Array<[number, number]>, color: string, phase: number) {
  ctx.beginPath();
  ctx.moveTo(0, PANO_H);
  for (let x = 0; x <= PANO_W; x += 4) {
    let y = 0;
    for (const [f, w] of freqs) y += Math.sin((x / PANO_W) * Math.PI * 2 * f + phase) * w;
    ctx.lineTo(x, baseY + y * amp);
  }
  ctx.lineTo(PANO_W, PANO_H);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function conifers(ctx: CanvasRenderingContext2D, baseY: number, count: number, height: number, color: string, seed: number) {
  const r = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = (i / count) * PANO_W + r() * 12;
    const hgt = height * (0.6 + r() * 0.8);
    wrapped(ctx, x, 20, (cx) => {
      ctx.beginPath();
      ctx.moveTo(cx, baseY - hgt);
      ctx.lineTo(cx + hgt * 0.32, baseY);
      ctx.lineTo(cx - hgt * 0.32, baseY);
      ctx.closePath();
      ctx.fill();
    });
  }
}

export function panoramaTexture(day: boolean) {
  const key = day ? 'pano-day' : 'pano-night';
  return tex(
    key,
    PANO_W,
    PANO_H,
    (ctx, w, h) => {
      const groundY = h - 26; // where the world's ground plane line sits
      const g = ctx.createLinearGradient(0, 0, 0, groundY);
      if (day) {
        g.addColorStop(0, '#5f9fe0');
        g.addColorStop(0.55, '#9ecdf2');
        g.addColorStop(1, '#e6f2f7');
      } else {
        g.addColorStop(0, '#070d1e');
        g.addColorStop(0.6, '#101c38');
        g.addColorStop(1, '#1d2c4c');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, groundY);

      if (day) {
        // sun with a fat halo
        const sx = 1420;
        const sy = 150;
        const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, 150);
        halo.addColorStop(0, 'rgba(255,247,214,0.95)');
        halo.addColorStop(0.25, 'rgba(255,236,180,0.35)');
        halo.addColorStop(1, 'rgba(255,236,180,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(sx - 170, sy - 170, 340, 340);
        ctx.fillStyle = '#fff8d8';
        ctx.beginPath();
        ctx.arc(sx, sy, 26, 0, Math.PI * 2);
        ctx.fill();

        // clouds
        const rc = rng(11);
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        for (let i = 0; i < 14; i++) {
          const cx = rc() * w;
          const cy = 60 + rc() * 130;
          const cw = 60 + rc() * 90;
          wrapped(ctx, cx, cw, (x) => {
            ctx.beginPath();
            ctx.ellipse(x, cy, cw, cw * 0.28, 0, 0, Math.PI * 2);
            ctx.ellipse(x + cw * 0.5, cy - cw * 0.14, cw * 0.6, cw * 0.24, 0, 0, Math.PI * 2);
            ctx.fill();
          });
        }

        ridge(ctx, groundY - 62, 0.7, [[1, 22], [3, 9], [7, 4]], '#8fa9c9', 0.6);
        ridge(ctx, groundY - 40, 0.6, [[2, 18], [5, 8]], '#7f9f96', 2.1);
        // lake
        ctx.fillStyle = '#79b8d6';
        ctx.beginPath();
        ctx.ellipse(520, groundY - 26, 190, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(520, groundY - 28, 120, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ridge(ctx, groundY - 22, 0.5, [[3, 12], [9, 5]], '#6f9a6a', 4.4);
        conifers(ctx, groundY - 20, 90, 26, '#3f6b46', 5);
        // meadow
        ctx.fillStyle = '#7ba05e';
        ctx.fillRect(0, groundY - 6, w, 8);
        ctx.fillStyle = '#5d8a4d';
        ctx.fillRect(0, groundY, w, h - groundY);
      } else {
        // stars
        const rs = rng(23);
        for (let i = 0; i < 420; i++) {
          const x = rs() * w;
          const y = rs() * (groundY - 60);
          const s = rs();
          ctx.fillStyle = `rgba(255,255,255,${0.35 + s * 0.6})`;
          if (s > 0.97) {
            ctx.beginPath();
            ctx.arc(x, y, 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(200,220,255,0.22)';
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, s > 0.8 ? 2 : 1.4, s > 0.8 ? 2 : 1.4);
          }
        }
        // moon
        const mx = 610;
        const my = 118;
        const halo = ctx.createRadialGradient(mx, my, 8, mx, my, 120);
        halo.addColorStop(0, 'rgba(214,229,255,0.5)');
        halo.addColorStop(1, 'rgba(214,229,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(mx - 130, my - 130, 260, 260);
        ctx.fillStyle = '#e8f0ff';
        ctx.beginPath();
        ctx.arc(mx, my, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(150,170,210,0.5)';
        ctx.beginPath();
        ctx.arc(mx - 7, my + 5, 6, 0, Math.PI * 2);
        ctx.arc(mx + 8, my - 6, 4, 0, Math.PI * 2);
        ctx.fill();

        // distant city glow on the horizon
        const glow = ctx.createLinearGradient(0, h - 120, 0, h - 20);
        glow.addColorStop(0, 'rgba(255,190,120,0)');
        glow.addColorStop(1, 'rgba(255,176,96,0.5)');
        ctx.fillStyle = glow;
        ctx.fillRect(1200, h - 120, 700, 110);

        ridge(ctx, groundY - 58, 0.75, [[1, 24], [3, 10], [7, 5]], '#16203a', 0.6);
        // far city lights
        const rl = rng(77);
        for (let i = 0; i < 70; i++) {
          const x = 1210 + rl() * 660;
          const y = groundY - 44 + rl() * 10;
          ctx.fillStyle = `rgba(255,206,140,${0.35 + rl() * 0.5})`;
          ctx.fillRect(x, y, 2, 2);
        }
        ridge(ctx, groundY - 34, 0.6, [[2, 18], [5, 8]], '#0e1730', 2.1);
        ridge(ctx, groundY - 18, 0.5, [[3, 12], [9, 5]], '#0a1024', 4.4);
        conifers(ctx, groundY - 16, 90, 24, '#070c1a', 5);
        ctx.fillStyle = '#0d1626';
        ctx.fillRect(0, groundY - 4, w, 6);
        ctx.fillStyle = '#0a1220';
        ctx.fillRect(0, groundY, w, h - groundY);

        // headlights of a car going the other way
        const rl2 = rng(99);
        for (let i = 0; i < 3; i++) {
          const x = rl2() * w;
          const y = groundY - 6 + rl2() * 4;
          wrapped(ctx, x, 30, (cx) => {
            const streak = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0);
            streak.addColorStop(0, 'rgba(255,240,190,0)');
            streak.addColorStop(0.5, 'rgba(255,246,214,0.85)');
            streak.addColorStop(1, 'rgba(255,240,190,0)');
            ctx.fillStyle = streak;
            ctx.fillRect(cx - 30, y, 60, 3);
          });
        }
      }
    },
    true,
  );
}

// ── Dashboards ──────────────────────────────────────────────────────────────

export function gpsTexture() {
  return tex(
    'gps',
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#0d2436';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#4fe3d0';
      ctx.lineWidth = 2;
      // a little grid + a route squiggle
      ctx.globalAlpha = 0.35;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo((i * w) / 5, 0);
        ctx.lineTo((i * w) / 5, h);
        ctx.moveTo(0, (i * h) / 5);
        ctx.lineTo(w, (i * h) / 5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#7cf7e0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, 112);
      ctx.bezierCurveTo(40, 90, 30, 60, 64, 54);
      ctx.bezierCurveTo(100, 48, 92, 24, 118, 12);
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(64, 54, 6, 0, Math.PI * 2);
      ctx.fill();
    },
    false,
  );
}
