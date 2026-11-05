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
 */
export function createEmbroideredScreenTexture({ width = 2048, height = 512, panels = 4 } = {}) {
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

  // Central field: diamond lattice of embroidered lines, cycling the three dyes,
  // with an eight-pointed star in each cell.
  const top = 112, bot = height - 112, mid = (top + bot) / 2, hh = (bot - top) / 2;
  const cell = hh; // half-diagonal of each diamond in px
  const cols = Math.round(width / (2 * cell));
  const cw = width / cols;
  for (let i = 0; i < cols; i++) {
    const cx = (i + 0.5) * cw;
    const col = DYES[i % 3];
    // dyed diamond field, then a double embroidered outline
    g.save();
    g.globalAlpha = 0.88;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, top);
    g.lineTo(cx + cw / 2, mid);
    g.lineTo(cx, bot);
    g.lineTo(cx - cw / 2, mid);
    g.closePath();
    g.fill();
    g.restore();
    for (const inset of [0, 14]) {
      stitch(() => {
        g.moveTo(cx, top + inset);
        g.lineTo(cx + cw / 2 - inset, mid);
        g.lineTo(cx, bot - inset);
        g.lineTo(cx - cw / 2 + inset, mid);
        g.closePath();
      }, inset ? '#efe8d6' : DYES[(i + 1) % 3], inset ? 3 : 6);
    }
    // eight-pointed star (two overlapping squares), filled
    const r = Math.min(cw, bot - top) * 0.2;
    g.save();
    g.translate(cx, mid);
    for (let k = 0; k < 2; k++) {
      g.rotate(Math.PI / 4);
      g.fillStyle = 'rgba(40,25,20,0.3)';
      g.fillRect(-r * 0.7 + 1, -r * 0.7 + 1.5, r * 1.4, r * 1.4);
      g.fillStyle = DYES[(i + 2) % 3];
      g.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
    }
    g.fillStyle = '#efe8d6';
    g.beginPath();
    g.arc(0, 0, r * 0.32, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // triangles in the spandrels between diamonds
    for (const ty of [top + 6, bot - 6]) {
      const dir = ty < mid ? 1 : -1;
      const x = i * cw;
      g.fillStyle = DYES[(i + 1) % 3];
      g.beginPath();
      g.moveTo(x - 18, ty);
      g.lineTo(x + 18, ty);
      g.lineTo(x, ty + 26 * dir);
      g.closePath();
      g.fill();
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
