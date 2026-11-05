import * as THREE from 'three';
import { COLORS } from './materials.js';

// Procedural textile textures (CanvasTexture). Reusable for the tent's linen and screens.

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Paint a fine plain-weave linen ground onto a 2D context region. */
function paintWeave(g, w, h, rnd, base = '#ece6d6', strength = 1) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // Weft (horizontal) and warp (vertical) threads, every 2px, with slight tone variation.
  for (let y = 0; y < h; y += 2) {
    const a = (0.03 + rnd() * 0.06) * strength;
    g.fillStyle = rnd() < 0.5 ? `rgba(120,105,80,${a})` : `rgba(255,252,240,${a * 1.4})`;
    g.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 2) {
    const a = (0.02 + rnd() * 0.05) * strength;
    g.fillStyle = `rgba(110,95,70,${a})`;
    g.fillRect(x, 0, 1, h);
  }
  // Slubs: short thicker thread bits typical of hand-spun linen.
  for (let i = 0; i < (w * h) / 900; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,250,235,${0.25 * strength})` : `rgba(130,115,90,${0.18 * strength})`;
    g.fillRect(rnd() * w, Math.floor(rnd() * h / 2) * 2, 4 + rnd() * 14, 1);
  }
}

/** Tileable fine twined linen texture (white). Tile represents ~0.5 m. */
export function createLinenTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  paintWeave(c.getContext('2d'), 256, 256, seeded(11));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Embroidered screen: blue, purple and scarlet on fine linen ("work of the embroiderer",
 * Ex 27:16). Purely geometric bands and lattice; no figurative imagery.
 * The canvas maps to the whole screen: u across its width, v = 1 at the top edge.
 * `rows` stacks that many rows of lattice diamonds in the central field (tall screens).
 */
export function createEmbroideredScreenTexture({ width = 2048, height = 512, panels = 4, rows = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  const rnd = seeded(23);
  paintWeave(g, width, height, rnd, '#ebe4d2');

  const BLUE = hex(COLORS.blue), PURPLE = hex(COLORS.purple), SCARLET = hex(COLORS.scarlet);
  const DYES = [BLUE, PURPLE, SCARLET];

  // Stitched line: dark under-shadow + dashed thread on top so it reads as raised embroidery.
  const stitch = (draw, color, lw) => {
    g.save();
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(40,25,20,0.35)';
    g.lineWidth = lw + 1.5;
    g.translate(0.8, 1.2);
    g.beginPath();
    draw();
    g.stroke();
    g.restore();
    g.save();
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.setLineDash([3, 1]);
    g.beginPath();
    draw();
    g.stroke();
    g.restore();
  };
  const band = (y, h, color) => {
    g.fillStyle = color;
    g.fillRect(0, y, width, h);
    // thread texture across the band
    for (let yy = y; yy < y + h; yy += 2) {
      g.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.08})`;
      g.fillRect(0, yy, width, 1);
    }
  };
  const zigzag = (y, amp, period, color, lw) =>
    stitch(() => {
      g.moveTo(0, y);
      for (let x = 0; x <= width; x += period / 2) g.lineTo(x, y + ((x / (period / 2)) % 2 ? -amp : amp));
    }, color, lw);

  // Border: stacked dyed bands with embroidered chevrons.
  const border = (y0, flip) => {
    const s = flip ? -1 : 1;
    const at = (o) => (flip ? y0 - o : y0 + o);
    band(Math.min(at(0), at(6)), 6, SCARLET);
    band(Math.min(at(10), at(44)), 34, BLUE);
    zigzag(at(27), 10, 36, '#efe8d6', 3);
    band(Math.min(at(48), at(60)), 12, PURPLE);
    band(Math.min(at(64), at(72)), 8, SCARLET);
    // small lozenges hanging off the border
    for (let x = 24; x < width; x += 48) {
      const col = DYES[Math.floor(x / 48) % 3];
      const yb = at(84);
      stitch(() => {
        g.moveTo(x, yb - 9 * s);
        g.lineTo(x + 8, yb);
        g.lineTo(x, yb + 9 * s);
        g.lineTo(x - 8, yb);
        g.closePath();
      }, col, 3);
    }
  };
  border(14, false);
  border(height - 14, true);

  // Central field: rows of diamond lattice embroidered lines, cycling the three dyes,
  // with an eight-pointed star in each cell.
  const top = 112, bot = height - 112;
  const rowH = (bot - top) / rows;
  const cell = rowH / 2; // half-diagonal of each diamond in px
  const cols = Math.round(width / (2 * cell));
  const cw = width / cols;
  for (let r = 0; r < rows; r++) {
    const rTop = top + r * rowH, rBot = rTop + rowH, mid = rTop + rowH / 2;
    for (let i = 0; i < cols; i++) {
      const k = i + r;
      const cx = (i + 0.5) * cw;
      const col = DYES[k % 3];
      // dyed diamond field, then a double embroidered outline
      g.save();
      g.globalAlpha = 0.88;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(cx, rTop);
      g.lineTo(cx + cw / 2, mid);
      g.lineTo(cx, rBot);
      g.lineTo(cx - cw / 2, mid);
      g.closePath();
      g.fill();
      g.restore();
      for (const inset of [0, 14]) {
        stitch(() => {
          g.moveTo(cx, rTop + inset);
          g.lineTo(cx + cw / 2 - inset, mid);
          g.lineTo(cx, rBot - inset);
          g.lineTo(cx - cw / 2 + inset, mid);
          g.closePath();
        }, inset ? '#efe8d6' : DYES[(k + 1) % 3], inset ? 3 : 6);
      }
      // eight-pointed star (two overlapping squares), filled
      const rad = Math.min(cw, rowH) * 0.2;
      g.save();
      g.translate(cx, mid);
      for (let q = 0; q < 2; q++) {
        g.rotate(Math.PI / 4);
        g.fillStyle = 'rgba(40,25,20,0.3)';
        g.fillRect(-rad * 0.7 + 1, -rad * 0.7 + 1.5, rad * 1.4, rad * 1.4);
        g.fillStyle = DYES[(k + 2) % 3];
        g.fillRect(-rad * 0.7, -rad * 0.7, rad * 1.4, rad * 1.4);
      }
      g.fillStyle = '#efe8d6';
      g.beginPath();
      g.arc(0, 0, rad * 0.32, 0, Math.PI * 2);
      g.fill();
      g.restore();
      // triangles in the spandrels between diamonds
      for (const ty of [rTop + 6, rBot - 6]) {
        const dir = ty < mid ? 1 : -1;
        const x = i * cw;
        g.fillStyle = DYES[(k + 1) % 3];
        g.beginPath();
        g.moveTo(x - 18, ty);
        g.lineTo(x + 18, ty);
        g.lineTo(x, ty + 26 * dir);
        g.closePath();
        g.fill();
      }
    }
  }
  // Vertical dividers where the screen meets each pillar (panel seams).
  for (let p = 1; p < panels; p++) {
    const x = (p / panels) * width;
    for (const [dx, colr] of [[-5, SCARLET], [0, BLUE], [5, PURPLE]]) {
      stitch(() => {
        g.moveTo(x + dx, top - 8);
        g.lineTo(x + dx, bot + 8);
      }, colr, 3);
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Goat-hair cloth (Ex 26:7): dark, nearly black, coarse hand-spun weave. The tile spans
 * `curtains` curtain widths (4 cubits each) in u and `heightCubits` in v, with a sewn join
 * at the start of each curtain. Each curtain gets its own batch tone and band layout, so the
 * repeat is long and irregular.
 */
export function createGoatHairTexture({ curtains = 2, heightCubits = 4 } = {}) {
  const CW = 512; // px per curtain (4 cubits)
  const W = CW * curtains, H = 128 * heightCubits;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rnd = seeded(31);
  g.fillStyle = '#2a2420';
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < curtains; k++) {
    const x0 = k * CW;
    // Batch tone of this curtain (hair from different goats / spinning).
    const tone = rnd();
    g.fillStyle = tone < 0.5 ? `rgba(0,0,0,${0.06 + rnd() * 0.12})` : `rgba(80,68,58,${0.05 + rnd() * 0.1})`;
    g.fillRect(x0, 0, CW, H);
    // Irregular broad bands across the curtain (warp batches), varying in width and strength.
    for (let x = x0; x < x0 + CW; ) {
      const bw = 10 + rnd() * 70;
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '95,85,72'},${0.03 + rnd() * 0.12})`;
      g.fillRect(x, 0, Math.min(bw, x0 + CW - x), H);
      x += bw;
    }
    // Weft batches along the length, so rows don't repeat every tile either.
    for (let y = 0; y < H; ) {
      const bh = 8 + rnd() * 60;
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '95,85,72'},${0.02 + rnd() * 0.08})`;
      g.fillRect(x0, y, CW, bh);
      y += bh;
    }
  }
  // Coarse weave: 4px cells alternating warp / weft floats, low contrast, with occasional
  // irregular (thicker / skipped) threads.
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const a = 0.08 + rnd() * 0.18;
      g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(95,85,75,${a})`;
      if (((x + y) >> 2) % 2) g.fillRect(x, y + 1, 4, 2 + (rnd() < 0.1 ? 1 : 0));
      else g.fillRect(x + 1, y, 2 + (rnd() < 0.1 ? 1 : 0), 4);
    }
  }
  for (let x = 0; x < W; x += 4) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '120,110,100'},${rnd() * 0.12})`;
    g.fillRect(x, 0, 3, H);
  }
  for (let y = 0; y < H; y += 4) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '120,110,100'},${rnd() * 0.1})`;
    g.fillRect(0, y, W, 3);
  }
  // Stray grey hairs and a few lighter tufts.
  g.lineWidth = 0.7;
  for (let i = 0; i < 400 * curtains * heightCubits / 2; i++) {
    const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI;
    const l = 4 + rnd() * 14;
    g.strokeStyle = `rgba(170,160,150,${0.06 + rnd() * 0.16})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // Sewn joins at the start of each curtain (u = k / curtains; wraps).
  for (let k = 0; k <= curtains; k++) {
    const xj = k * CW;
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(xj - 4, 0, 8, H);
    g.fillStyle = 'rgba(110,100,90,0.3)';
    g.fillRect(xj + 5, 0, 2, H);
    g.fillRect(xj - 7, 0, 2, H);
    g.fillStyle = 'rgba(150,140,125,0.4)';
    for (let y = rnd() * 4; y < H; y += 7 + rnd() * 3) g.fillRect(xj - 6, y, 12, 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Pieced animal skins stitched into a covering (ram skins dyed red, tachash). The tile spans
 * `tile` cubits square: rows of irregular hides (`hide` = [width, height] in cubits, widths
 * varying per hide, rows of varying height), overlapping at sewn seams, with mottling, a
 * darker spine and creases. Low hide-to-hide contrast so it reads as leather, not paving.
 */
export function createSkinTexture({ base = [126, 42, 31], seed = 5, variation = 18, tile = 8, hide = [1.4, 1.1], contrast = 1 } = {}) {
  const S = 1024;
  const px = S / tile; // px per cubit
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = seeded(seed);
  const rgb = (k, a = 1) => `rgba(${base.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')},${a})`;
  g.fillStyle = rgb(0.92);
  g.fillRect(0, 0, S, S);
  // Irregular hide outline: a rounded rectangle with wobbly edges.
  const hidePath = (x, y, w, h) => {
    const n = 28;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      // Superellipse (squarish) radius with wobble.
      const p = 4;
      const r = 1 / Math.pow(Math.pow(Math.abs(cx), p) + Math.pow(Math.abs(cy), p), 1 / p);
      const wob = 1 + 0.05 * Math.sin(a * 5 + x) + 0.03 * Math.sin(a * 9 + y);
      const X = x + w / 2 + cx * r * (w / 2) * wob;
      const Y = y + h / 2 + cy * r * (h / 2) * wob;
      if (i === 0) g.moveTo(X, Y);
      else g.lineTo(X, Y);
    }
    g.closePath();
  };
  let y = -px * 0.3;
  while (y < S) {
    const rowH = hide[1] * px * (0.85 + rnd() * 0.3);
    let x = -rnd() * hide[0] * px;
    while (x < S) {
      const w = hide[0] * px * (0.75 + rnd() * 0.5);
      const k = 1 + (rnd() - 0.5) * (variation / 60) * contrast;
      const ox = (rnd() - 0.5) * 6, oy = (rnd() - 0.5) * 6;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        const X = x + dx + ox, Y = y + dy + oy;
        if (X > S || X + w < 0 || Y > S || Y + rowH < 0) continue;
        // Hide body (slightly larger than its cell: neighbours overlap at the seams), with a
        // gentle darkening toward the edges and a faint darker spine along its length.
        const grd = g.createRadialGradient(X + w / 2, Y + rowH / 2, 4, X + w / 2, Y + rowH / 2, Math.max(w, rowH) * 0.7);
        grd.addColorStop(0, rgb(k * (1 + 0.03 * contrast)));
        grd.addColorStop(1, rgb(k * (1 - 0.1 * contrast)));
        g.fillStyle = grd;
        hidePath(X - 3, Y - 3, w + 6, rowH + 6);
        g.fill();
        g.fillStyle = rgb(k * 0.93, 0.35);
        g.fillRect(X + w * 0.15, Y + rowH * 0.47, w * 0.7, rowH * 0.06);
        // Seam: thin dark line and a subtle stitch row just inside.
        g.strokeStyle = 'rgba(15,8,4,0.32)';
        g.lineWidth = 1.5;
        g.stroke();
        g.save();
        g.setLineDash([2, 5]);
        g.strokeStyle = rgb(1.35, 0.25);
        g.lineWidth = 1;
        hidePath(X + 2, Y + 2, w - 4, rowH - 4);
        g.stroke();
        g.restore();
      }
      x += w;
    }
    y += rowH;
  }
  // Mottling at two scales.
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S, rr = 1 + rnd() * 5;
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${rnd() * 0.1})` : `rgba(255,235,210,${rnd() * 0.05})`;
    g.beginPath();
    g.arc(x, y, rr, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S, y = rnd() * S, rr = 20 + rnd() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,235,210,0.04)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
  }
  // Creases.
  for (let i = 0; i < 140; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2, l = 15 + rnd() * 50;
    g.strokeStyle = `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
    g.lineWidth = 1 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
