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

/**
 * One woven cherub (Ex 26:1, 31) in an ancient Near Eastern manner (after Phoenician ivories and
 * Assyrian winged figures): a standing robed figure seen from the front, rigid and symmetrical,
 * wings spread up and out with a band of scale-like coverts along the top and long straight
 * primaries below, a fringed robe with a diagonal shawl, and a squared mass of hair ending in a
 * row of curls. (cx, cy) is the figure's center and `s` its height in px; the wingspan is about
 * 1.25 s. `dye` = [wing, robe, accent] colors; `linen` the ground.
 */
function drawCherub(g, cx, cy, s, dye, lw, linen) {
  const [cW, cR, cA] = dye;
  const P = (x, y) => [cx + x * s, cy + y * s];
  const poly = (pts, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
    g.closePath();
    g.fill();
  };
  const line = (pts, color, w) => {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
    g.stroke();
  };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const K = 8; // primaries per wing
  for (const side of [-1, 1]) {
    // Leading edge (shoulder to tip), the covert band's lower edge, and the trailing edge.
    const root = P(0.07 * side, -0.21), tip = P(0.62 * side, -0.56);
    const cRoot = P(0.08 * side, -0.13), cTip = P(0.62 * side, -0.48);
    const eRoot = P(0.1 * side, 0.06), eTip = P(0.64 * side, -0.34);
    // Primaries: straight strips from the coverts to a stepped, squared-off trailing edge.
    for (let i = 0; i < K; i++) {
      const t0 = i / K, t1 = (i + 1) / K;
      const a0 = lerp(cRoot, cTip, t0), a1 = lerp(cRoot, cTip, t1);
      const drop = 0.025 * s * (1 - Math.abs(t0 + t1 - 1)); // a gentle droop mid-wing
      const b0 = lerp(eRoot, eTip, t0), b1 = lerp(eRoot, eTip, t1);
      poly([a0, a1, [b1[0], b1[1] + drop], [b0[0], b0[1] + drop + 0.02 * s]], i % 2 ? cW : cR);
      line([a1, [b1[0], b1[1] + drop]], linen, lw * 0.35);
      // A midrib down each feather.
      line([lerp(a0, a1, 0.5), [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2 + drop + 0.01 * s]], cA, lw * 0.25);
    }
    // Coverts: a band of the accent dye with two rows of linen-edged scales.
    poly([root, tip, cTip, cRoot], cA);
    for (const [r0, r1, n] of [[0.25, 0.55, 9], [0.6, 0.92, 10]]) {
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const top = lerp(lerp(root, tip, t), lerp(cRoot, cTip, t), r0);
        const bot = lerp(lerp(root, tip, t), lerp(cRoot, cTip, t), r1);
        const r = Math.abs(tip[0] - root[0]) / n * 0.5;
        g.fillStyle = cW;
        g.beginPath();
        g.ellipse((top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, r * 0.8, Math.abs(bot[1] - top[1]) * 0.55 + 1, 0, 0, Math.PI);
        g.fill();
      }
    }
    line([root, tip], linen, lw * 0.3);
    line([cRoot, cTip], linen, lw * 0.3);
  }
  // Robe: shoulders to ankles, straight-sided, with a fringed hem and a diagonal fringed shawl.
  const robe = [P(-0.09, -0.22), P(0.09, -0.22), P(0.13, 0.42), P(-0.13, 0.42)];
  poly(robe, cR);
  g.save();
  g.beginPath();
  robe.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
  g.closePath();
  g.clip();
  poly([P(-0.2, -0.2), P(-0.08, -0.22), P(0.2, 0.14), P(0.2, 0.24)], cA);
  for (let k = 0; k < 12; k++) {
    const t = k / 11;
    const a = lerp(P(-0.2, -0.2), P(0.2, 0.24), t);
    line([a, [a[0] - 0.012 * s, a[1] + 0.03 * s]], linen, lw * 0.25);
  }
  poly([P(-0.2, 0.35), P(0.2, 0.35), P(0.2, 0.42), P(-0.2, 0.42)], cW);
  for (const x of [-0.04, 0.04]) line([P(x, -0.05), P(x * 1.4, 0.35)], 'rgba(20,12,16,0.35)', lw * 0.3);
  g.restore();
  for (let k = 0; k <= 12; k++) {
    const x = -0.13 + (0.26 * k) / 12;
    line([P(x, 0.42), P(x, 0.455)], cA, lw * 0.3);
  }
  for (const x of [-0.05, 0.05]) poly([P(x - 0.035, 0.46), P(x + 0.035, 0.46), P(x + 0.04, 0.49), P(x - 0.04, 0.49)], cW);
  // Arms bent up toward the wings, with a bracelet.
  for (const side of [-1, 1]) {
    line([P(0.08 * side, -0.17), P(0.16 * side, -0.09), P(0.2 * side, -0.19)], linen, lw * 0.75);
    line([P(0.17 * side, -0.115), P(0.19 * side, -0.135)], cA, lw * 0.8);
  }
  // Head: hair as a squared mass to the shoulders, ending in a row of curls; a linen face.
  poly([P(-0.075, -0.39), P(0.075, -0.39), P(0.085, -0.22), P(-0.085, -0.22)], cW);
  for (let k = 0; k < 5; k++) {
    g.fillStyle = cA;
    g.beginPath();
    g.arc(...P(-0.068 + k * 0.034, -0.225), 0.012 * s, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = linen;
  g.beginPath();
  g.ellipse(...P(0, -0.315), 0.052 * s, 0.065 * s, 0, 0, Math.PI * 2);
  g.fill();
  // Large almond eyes and brows, a straight nose: the archaic frontal face.
  for (const side of [-1, 1]) {
    g.fillStyle = cW;
    g.beginPath();
    g.ellipse(...P(0.022 * side, -0.325), 0.013 * s, 0.006 * s, 0, 0, Math.PI * 2);
    g.fill();
    line([P(0.008 * side, -0.343), P(0.04 * side, -0.338)], cW, lw * 0.25);
  }
  line([P(0, -0.33), P(0, -0.3)], 'rgba(60,35,30,0.5)', lw * 0.2);
  line([P(-0.012, -0.285), P(0.012, -0.285)], cR, lw * 0.3);
}

/** Small eight-petal rosette. */
function drawRosette(g, x, y, r, petal, center) {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.fillStyle = petal;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.2, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = center;
  g.beginPath();
  g.arc(x, y, r * 0.25, 0, Math.PI * 2);
  g.fill();
}

/**
 * Linen woven with cherubim in blue, purple and scarlet (Ex 26:1 inner covering; 26:31 veil).
 * The canvas spans `w` x `h` cubits at `ppc` px per cubit, with `cols` x `rows` figures; figure
 * "up" is the canvas top. `seams`: a sewn curtain join along the top and bottom edges (half on
 * each, so tiles join into one seam; ceiling). `border`: dyed bands at top and bottom and a
 * diamond lattice behind the figures (veil, denser work).
 */
export function createCherubimTexture({ w = 5, h = 4, ppc = 256, cols = 2, rows = 2, seams = false, border = false, seed = 47 } = {}) {
  const W = Math.round(w * ppc), H = Math.round(h * ppc);
  // The design is drawn at one pixel per thread (TH px), then enlarged without smoothing and
  // given a plain-weave thread texture, so outlines step like real tapestry weaving.
  const TH = 3;
  const lo = document.createElement('canvas');
  lo.width = Math.ceil(W / TH);
  lo.height = Math.ceil(H / TH);
  const g = lo.getContext('2d');
  g.scale(1 / TH, 1 / TH);
  const rnd = seeded(seed);
  // Unbleached linen and natural dyes, muted and slightly uneven: indigo-dyed tekhelet, murex
  // (Tyrian) purple, kermes scarlet. Exterior screens keep COLORS; this is the inner work.
  const LINEN = '#d9cfb8';
  const BLUE = '#2e3a5c', PURPLE = '#55253f', SCARLET = '#93332b';
  const DYES = [BLUE, PURPLE, SCARLET];
  g.fillStyle = LINEN;
  g.fillRect(0, 0, W, H);
  const lw = Math.max(3, ppc * 0.035);

  let top = 0, bot = H;
  const band = (y, bh, color) => {
    g.fillStyle = color;
    g.fillRect(0, y, W, bh);
  };
  if (border) {
    const u = ppc * 0.12;
    for (const flip of [false, true]) {
      const at = (o, bh) => (flip ? H - o - bh : o);
      band(at(0, u * 0.5), u * 0.5, SCARLET);
      band(at(u * 0.8, u * 1.6), u * 1.6, BLUE);
      band(at(u * 2.7, u * 0.6), u * 0.6, PURPLE);
      band(at(u * 3.6, u * 0.35), u * 0.35, SCARLET);
      // Rosettes along the blue band.
      for (let x = u; x < W; x += u * 2.2) drawRosette(g, x, at(u * 1.6, 0), u * 0.6, LINEN, SCARLET);
    }
    top = ppc * 0.12 * 4.3;
    bot = H - top;
  }
  if (seams) {
    // Selvage stripes (blue, scarlet) and the sewn join, centered on the canvas edges.
    for (const y0 of [0, H]) {
      const s = y0 ? -1 : 1;
      const at = (o, bh) => (s > 0 ? y0 + o : y0 - o - bh);
      band(at(ppc * 0.05, ppc * 0.06), ppc * 0.06, BLUE);
      band(at(ppc * 0.14, ppc * 0.03), ppc * 0.03, SCARLET);
      band(at(ppc * 0.2, ppc * 0.04), ppc * 0.04, PURPLE);
      g.fillStyle = 'rgba(60,45,30,0.55)';
      g.fillRect(0, at(0, ppc * 0.018), W, ppc * 0.018);
    }
    top = ppc * 0.28;
    bot = H - top;
  }

  const cw = W / cols, ch = (bot - top) / rows;
  if (border) {
    // Diamond lattice in the field behind the figures, in the dyes.
    g.save();
    g.beginPath();
    g.rect(0, top, W, bot - top);
    g.clip();
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        const x = i * cw, y = top + j * ch;
        g.beginPath();
        g.moveTo(x, y - ch / 2);
        g.lineTo(x + cw / 2, y);
        g.lineTo(x, y + ch / 2);
        g.lineTo(x - cw / 2, y);
        g.closePath();
        g.strokeStyle = DYES[(i + j) % 3];
        g.lineWidth = lw * 0.6;
        g.setLineDash([lw, lw * 0.6]);
        g.stroke();
        g.setLineDash([]);
        drawRosette(g, x, y, Math.min(cw, ch) * 0.09, DYES[(i + j + 1) % 3], LINEN);
      }
    }
    g.restore();
  } else {
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        if (seams && (j === 0 || j === rows)) continue;
        drawRosette(g, i * cw, top + j * ch, Math.min(cw, ch) * 0.07, DYES[(i + j) % 3], LINEN);
      }
    }
  }
  const s = Math.min(ch * 0.86, (cw * 0.9) / 1.26);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = i + j;
      drawCherub(g, (i + 0.5) * cw, top + (j + 0.5) * ch + s * 0.02, s, [DYES[k % 3], DYES[(k + 1) % 3], DYES[(k + 2) % 3]], lw, LINEN);
    }
  }

  // Enlarge, then weave: each TH x TH cell is one thread crossing; in a plain weave warp and
  // weft alternate on top, each rounded (lighter along its middle). Each weft row and warp
  // column has its own slight tone (hand-spun, unevenly dyed), with occasional slubs.
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const out = c.getContext('2d');
  out.imageSmoothingEnabled = false;
  out.drawImage(lo, 0, 0, lo.width * TH, lo.height * TH);
  const img = out.getImageData(0, 0, W, H);
  const d = img.data;
  const nx = lo.width, ny = lo.height;
  const colTone = Float32Array.from({ length: nx }, () => (rnd() - 0.5) * 0.08);
  const rowTone = Float32Array.from({ length: ny }, () => (rnd() - 0.5) * 0.12 + (rnd() < 0.03 ? 0.1 : 0));
  const prof = [0.82, 1.06, 0.9]; // across a thread: edge, middle, edge (TH = 3)
  for (let y = 0; y < H; y++) {
    const cy = (y / TH) | 0, v = y % TH;
    for (let x = 0; x < W; x++) {
      const cx = (x / TH) | 0, u = x % TH;
      const warpUp = (cx + cy) & 1;
      const k = (warpUp ? prof[u] * (1 + colTone[cx]) : prof[v] * (1 + rowTone[cy])) * (0.97 + 0.03 * prof[warpUp ? v : u]);
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
  }
  out.putImageData(img, 0, 0);
  // Faint broad unevenness (age, uneven dyeing).
  for (let i = 0; i < 30; i++) {
    const x = rnd() * W, y = rnd() * H, r = (0.2 + rnd() * 0.5) * ppc;
    const grd = out.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rnd() < 0.6 ? 'rgba(90,70,40,0.06)' : 'rgba(255,248,230,0.05)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    out.fillStyle = grd;
    out.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  if (seams) {
    out.fillStyle = 'rgba(255,250,235,0.45)';
    for (const y0 of [0, H]) {
      const y = y0 ? y0 - ppc * 0.022 - 2 : ppc * 0.022;
      for (let x = rnd() * 6; x < W; x += 9 + rnd() * 3) out.fillRect(x, y, 5, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
