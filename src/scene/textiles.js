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
 * Goat-hair cloth (Ex 26:7): dark, nearly black, coarse hand-spun weave. The tile spans one
 * 4-cubit curtain width in u and 2 cubits in v, with the sewn join between curtains at u = 0.
 */
export function createGoatHairTexture() {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rnd = seeded(31);
  g.fillStyle = '#2a2420';
  g.fillRect(0, 0, W, H);
  // Faint broad bands across the curtain (hand-spun batches of hair).
  for (let x = 0; x < W; ) {
    const bw = 20 + rnd() * 60;
    g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '90,80,70'},${0.05 + rnd() * 0.1})`;
    g.fillRect(x, 0, bw, H);
    x += bw;
  }
  // Coarse basket weave: 4px cells alternating warp / weft floats, low contrast.
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const a = 0.12 + rnd() * 0.16;
      g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(95,85,75,${a})`;
      if (((x + y) >> 2) % 2) g.fillRect(x, y + 1, 4, 2);
      else g.fillRect(x + 1, y, 2, 4);
    }
  }
  // Whole-thread tone variation (hand spun yarn).
  for (let x = 0; x < W; x += 4) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '120,110,100'},${rnd() * 0.12})`;
    g.fillRect(x, 0, 3, H);
  }
  for (let y = 0; y < H; y += 4) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '120,110,100'},${rnd() * 0.1})`;
    g.fillRect(0, y, W, 3);
  }
  // Stray grey hairs.
  g.lineWidth = 0.7;
  for (let i = 0; i < 500; i++) {
    const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI;
    const l = 4 + rnd() * 14;
    g.strokeStyle = `rgba(170,160,150,${0.08 + rnd() * 0.18})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // Sewn join at u = 0 (wraps): dark overlap band, raised edges and cross stitches.
  g.fillStyle = 'rgba(0,0,0,0.75)';
  g.fillRect(0, 0, 4, H);
  g.fillRect(W - 4, 0, 4, H);
  g.fillStyle = 'rgba(110,100,90,0.35)';
  g.fillRect(5, 0, 2, H);
  g.fillRect(W - 7, 0, 2, H);
  g.fillStyle = 'rgba(150,140,125,0.45)';
  for (let y = 0; y < H; y += 8) {
    g.fillRect(W - 6, y, 6, 2);
    g.fillRect(0, y, 6, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Pieced animal skins stitched into a covering (ram skins dyed red, tachash). The tile is
 * 4×4 cubits: four rows of hides about 1.3×1 cubit, offset like brickwork, with stitched
 * seams, mottling and creases.
 */
export function createSkinTexture({ base = [126, 42, 31], seed = 5, variation = 18 } = {}) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = seeded(seed);
  const rgb = (k, a = 1) => `rgba(${base.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')},${a})`;
  g.fillStyle = rgb(0.55);
  g.fillRect(0, 0, S, S);
  const rowsN = 4, rowH = S / rowsN, hideW = S / 3;
  for (let r = 0; r < rowsN; r++) {
    const off = (r % 2) * hideW * 0.5 + rnd() * 20;
    for (let i = -1; i < 4; i++) {
      const x0 = off + i * hideW, y0 = r * rowH;
      const k = 1 + (rnd() - 0.5) * (variation / 50);
      for (const dx of [-S, 0, S]) {
        const x = x0 + dx;
        if (x > S || x + hideW < 0) continue;
        // Hide body: tinted, darker toward its edges.
        const grd = g.createRadialGradient(x + hideW / 2, y0 + rowH / 2, 10, x + hideW / 2, y0 + rowH / 2, hideW * 0.62);
        grd.addColorStop(0, rgb(k * 1.08));
        grd.addColorStop(1, rgb(k * 0.78));
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(x + 2, y0 + 2, hideW - 4, rowH - 4, 10);
        g.fill();
        // Stitched seam around the hide.
        g.strokeStyle = 'rgba(20,10,5,0.55)';
        g.lineWidth = 2;
        g.stroke();
        g.save();
        g.setLineDash([3, 4]);
        g.strokeStyle = rgb(1.5, 0.5);
        g.lineWidth = 1;
        g.beginPath();
        g.roundRect(x + 6, y0 + 6, hideW - 12, rowH - 12, 8);
        g.stroke();
        g.restore();
      }
    }
  }
  // Mottling.
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * S, y = rnd() * S, rr = 1 + rnd() * 6;
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${rnd() * 0.12})` : `rgba(255,235,210,${rnd() * 0.06})`;
    g.beginPath();
    g.arc(x, y, rr, 0, 7);
    g.fill();
  }
  // Creases.
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2, l = 15 + rnd() * 40;
    g.strokeStyle = `rgba(0,0,0,${0.12 + rnd() * 0.15})`;
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
