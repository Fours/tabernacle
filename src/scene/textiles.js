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

// ---------------------------------------------------------------------------------------------
// Embroidered screens: the courtyard gate (Ex 27:16) and the tent door (Ex 26:36), "the work of
// an embroiderer" in blue, purple and scarlet on fine twined linen. Garden motifs in an ancient
// Near Eastern manner (palmette-and-lotus friezes, sacred palms, pomegranates, almond blossom);
// no figures. Every design repeats across the width, so the screens can be gathered or split.
// Each screen gets a colour map and a matching height map (linen weave + raised stitching) for
// bump. Canvas coordinates: x across the screen, y down from the top edge.
// ---------------------------------------------------------------------------------------------

const EMB_THREAD = '#f3eedf'; // undyed linen thread
const EMB_OUTLINE = '#22152a'; // dark couched outline thread
const grey = (v) => {
  const k = Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${k},${k},${k})`;
};

/** Stitch primitives drawing on a colour context `g` and a height context `h` at once. */
function embroideryKit(g, h) {
  const K = {};
  const both = (fn) => {
    fn(g, false);
    fn(h, true);
  };

  /** Couched outline: a laid dark thread tied down by small cross stitches. */
  K.couch = (path, lw = 1.6, color = EMB_OUTLINE) => {
    g.save();
    path(g);
    g.lineJoin = 'round';
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.stroke();
    g.setLineDash([0.9, 2.3]);
    g.strokeStyle = 'rgba(255,236,215,0.2)';
    g.lineWidth = lw + 0.5;
    g.stroke();
    g.restore();
    h.save();
    path(h);
    h.lineJoin = 'round';
    h.strokeStyle = grey(0.84);
    h.lineWidth = lw + 0.6;
    h.stroke();
    h.restore();
  };

  /**
   * Satin-stitched filled shape. `path(ctx)` builds the path; stitches run at angle `ang`
   * across a disc (cx, cy, r) covering the shape.
   */
  K.satin = (path, color, ang, cx, cy, r, { outline = true, sp = 3, lw = 1.5 } = {}) => {
    both((c, isH) => {
      c.save();
      path(c);
      c.fillStyle = isH ? grey(0.76) : color;
      c.fill();
      c.clip();
      // padded edge: darker / lower rim just inside the outline
      c.lineWidth = 3.2;
      c.strokeStyle = isH ? grey(0.62) : 'rgba(10,0,15,0.22)';
      c.stroke();
      c.translate(cx, cy);
      c.rotate(ang);
      c.lineWidth = sp * 0.42;
      const lines = (off) => {
        c.beginPath();
        for (let y = -r + off; y <= r; y += sp) {
          c.moveTo(-r, y);
          c.lineTo(r, y);
        }
        c.stroke();
      };
      c.strokeStyle = isH ? grey(0.64) : 'rgba(0,0,0,0.2)';
      lines(0);
      c.strokeStyle = isH ? grey(0.88) : 'rgba(255,248,240,0.16)';
      lines(sp * 0.5);
      c.restore();
    });
    if (outline) K.couch(path, lw);
  };

  /** Stem stitch along an open path: a corded line with a dark outline. */
  K.stem = (path, color, lw = 4, outline = true) => {
    g.save();
    path(g);
    g.lineCap = g.lineJoin = 'round';
    if (outline) {
      g.strokeStyle = EMB_OUTLINE;
      g.lineWidth = lw + 2.4;
      g.stroke();
    }
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.stroke();
    g.setLineDash([2.4, 1.6]);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = lw * 0.45;
    g.stroke();
    g.restore();
    h.save();
    path(h);
    h.lineCap = h.lineJoin = 'round';
    h.strokeStyle = grey(0.8);
    h.lineWidth = lw + 1.6;
    h.stroke();
    h.setLineDash([2.4, 1.6]);
    h.strokeStyle = grey(0.9);
    h.lineWidth = lw * 0.5;
    h.stroke();
    h.restore();
  };

  /** Satin-filled band (rectangle) with stitches across it. */
  K.band = (x, y, w, hh, color, vertical = false) =>
    K.satin((c) => {
      c.beginPath();
      c.rect(x, y, w, hh);
    }, color, vertical ? 0 : Math.PI / 2, x + w / 2, y + hh / 2, Math.hypot(w, hh) / 2, { lw: 1.2 });

  // ---- shape helpers -------------------------------------------------------------------------
  const frame = (x, y, a) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    return (u, v) => [x + ca * u - sa * v, y + sa * u + ca * v];
  };
  /** Pointed leaf, fishbone stitched (two halves angled from the midrib), with midrib. */
  K.leaf = (x, y, a, len, wid, color) => {
    const P = frame(x, y, a);
    for (const s of [1, -1]) {
      K.satin((c) => {
        c.beginPath();
        c.moveTo(...P(0, 0));
        c.quadraticCurveTo(...P(len * 0.42, wid * s), ...P(len, 0));
        c.closePath();
      }, color, a + 0.95 * s, ...P(len / 2, (wid / 4) * s), len * 0.6, { outline: false });
    }
    K.couch((c) => {
      c.beginPath();
      c.moveTo(...P(0, 0));
      c.quadraticCurveTo(...P(len * 0.42, wid), ...P(len, 0));
      c.quadraticCurveTo(...P(len * 0.42, -wid), ...P(0, 0));
      c.closePath();
      c.moveTo(...P(len * 0.08, 0));
      c.lineTo(...P(len * 0.8, 0));
    }, 1.3);
  };
  /** Petal with a rounded outer end, stitched lengthwise. */
  K.petal = (x, y, a, len, wid, color, opts) => {
    const P = frame(x, y, a);
    K.satin((c) => {
      c.beginPath();
      c.moveTo(...P(0, 0));
      c.bezierCurveTo(...P(len * 0.25, wid * 0.45), ...P(len * 0.98, wid * 1.0), ...P(len, 0));
      c.bezierCurveTo(...P(len * 0.98, -wid * 1.0), ...P(len * 0.25, -wid * 0.45), ...P(0, 0));
      c.closePath();
    }, color, a, ...P(len / 2, 0), len * 0.6 + wid, opts);
  };
  K.disc = (x, y, r, color, ang = 0.4, opts) =>
    K.satin((c) => {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
    }, color, ang, x, y, r + 1, opts);
  /** Curved leaf / frond: quadratic centreline p0 → p2 via c1, half-width `w`. */
  K.curvedLeaf = (p0, c1, p2, w, color, slant = 0.9) => {
    const N = 14, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, it = 1 - t;
      const px = it * it * p0[0] + 2 * it * t * c1[0] + t * t * p2[0];
      const py = it * it * p0[1] + 2 * it * t * c1[1] + t * t * p2[1];
      const dx = 2 * it * (c1[0] - p0[0]) + 2 * t * (p2[0] - c1[0]);
      const dy = 2 * it * (c1[1] - p0[1]) + 2 * t * (p2[1] - c1[1]);
      const dl = Math.hypot(dx, dy) || 1;
      const ww = w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.02)), 0.7);
      L.push([px - (dy / dl) * ww, py + (dx / dl) * ww]);
      R.push([px + (dy / dl) * ww, py - (dx / dl) * ww]);
    }
    const ang = Math.atan2(p2[1] - p0[1], p2[0] - p0[0]);
    const cx = (p0[0] + 2 * c1[0] + p2[0]) / 4, cy = (p0[1] + 2 * c1[1] + p2[1]) / 4;
    const r = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) * 0.7 + w;
    for (const [side, s] of [[L, 1], [R, -1]]) {
      K.satin((c) => {
        c.beginPath();
        c.moveTo(...p0);
        for (let i = 0; i <= N; i++) c.lineTo(...side[i]);
        c.quadraticCurveTo(...c1, ...p0);
        c.closePath();
      }, color, ang + slant * s, cx, cy, r, { outline: false });
    }
    K.couch((c) => {
      c.beginPath();
      c.moveTo(...L[0]);
      for (const p of L) c.lineTo(...p);
      for (let i = N; i >= 0; i--) c.lineTo(...R[i]);
      c.closePath();
      c.moveTo(...p0);
      c.quadraticCurveTo(...c1, ...p2);
    }, 1.3);
  };
  /** Spiral (volute) path: centre, start radius, start angle, sweep (signed), shrink 0–1. */
  K.spiral = (cx, cy, R, a0, sweep, shrink = 0.8) => (c) => {
    c.beginPath();
    const n = Math.ceil(Math.abs(sweep) * 8);
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + sweep * t, r = R * (1 - shrink * t);
      const p = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      if (i) c.lineTo(...p);
      else c.moveTo(...p);
    }
  };

  // ---- motifs --------------------------------------------------------------------------------
  /** Rosette of `n` petals with a satin centre. */
  K.rosette = (x, y, r, petals, center, n = 8, rot = 0) => {
    const wid = r * Math.sin(Math.PI / n) * 0.95;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      K.petal(x + Math.cos(a) * r * 0.18, y + Math.sin(a) * r * 0.18, a, r * 0.82, wid, petals[i % petals.length], { lw: 1.2 });
    }
    K.disc(x, y, r * 0.3, center, 0.4, { lw: 1.2 });
  };
  /** Pomegranate: `dir` 1 = crown up (stalk below), −1 = hanging (crown down). */
  K.pomegranate = (x, y, s, dir, body, crown) => {
    const yc = y - dir * s * 0.9;
    K.satin((c) => {
      c.beginPath();
      const p = (u, v) => [x + u * s, yc - dir * v * s];
      c.moveTo(...p(-0.3, -0.15));
      c.lineTo(...p(-0.44, 0.42));
      c.lineTo(...p(-0.18, 0.2));
      c.lineTo(...p(0, 0.5));
      c.lineTo(...p(0.18, 0.2));
      c.lineTo(...p(0.44, 0.42));
      c.lineTo(...p(0.3, -0.15));
      c.closePath();
    }, crown, Math.PI / 2, x, yc, s * 0.6);
    for (const side of [-1, 1]) {
      K.satin((c) => {
        c.beginPath();
        c.ellipse(x, y, s * 0.95, s, 0, -Math.PI / 2, Math.PI / 2, side < 0);
        c.closePath();
      }, body, Math.PI / 2 + 0.55 * side, x + side * s * 0.45, y, s * 1.1, { outline: false });
    }
    K.couch((c) => {
      c.beginPath();
      c.ellipse(x, y, s * 0.95, s, 0, 0, Math.PI * 2);
      c.moveTo(x, y - s * 0.92);
      c.lineTo(x, y + s * 0.92);
    }, 1.5);
    // a light couched sheen line along one shoulder
    K.couch((c) => {
      c.beginPath();
      c.ellipse(x, y, s * 0.68, s * 0.74, 0, Math.PI * 1.08, Math.PI * 1.42);
    }, 1.6, EMB_THREAD);
  };
  /** Palmette: two volutes and a fan of petals. `dir` 1 = up, −1 = down. */
  K.palmette = (x, y, s, dir, cols, n = 7) => {
    const up = -Math.PI / 2 * dir;
    const ox = x, oy = y - dir * s * 0.14;
    // outer petals first so the centre petal sits on top
    for (let i = 0; i < n; i++) {
      const kk = i % 2 ? n - 1 - (i >> 1) : i >> 1;
      const off = (kk / (n - 1) - 0.5) * 2.5;
      const len = s * (0.58 + 0.34 * Math.cos(off * 0.9));
      K.petal(ox, oy, up + off, len, s * 0.12, cols[kk % cols.length]);
    }
    for (const side of [-1, 1]) {
      const cx = x + side * s * 0.25, cy = y - dir * s * 0.02;
      const a0 = side < 0 ? 0 : Math.PI;
      const sweep = -side * dir * Math.PI * 2.2;
      K.stem(K.spiral(cx, cy, s * 0.22, dir < 0 ? -a0 : a0, sweep, 0.78), cols[0], 3.4);
    }
    K.satin((c) => {
      c.beginPath();
      c.arc(ox, oy, s * 0.2, up - Math.PI / 2, up + Math.PI / 2);
      c.closePath();
    }, cols[2 % cols.length], up + Math.PI / 2, ox, oy, s * 0.25);
  };
  /** Lily (lotus): central petal, two out-curling side petals, sepals and a calyx band. */
  K.lily = (x, y, s, dir, cols) => {
    const by = y - dir * s * 0.16;
    for (const side of [-1, 1]) {
      K.curvedLeaf([x + side * s * 0.06, by], [x + side * s * 0.2, by - dir * s * 0.8], [x + side * s * 0.58, by - dir * s * 0.5], s * 0.11, cols[1], 1.0);
    }
    K.petal(x, by, -Math.PI / 2 * dir, s * 0.86, s * 0.17, cols[0]);
    for (const side of [-1, 1]) K.leaf(x, by, -Math.PI / 2 * dir + side * 1.05, s * 0.36, s * 0.13, cols[2]);
    K.satin((c) => {
      c.beginPath();
      c.ellipse(x, by + dir * s * 0.05, s * 0.17, s * 0.1, 0, 0, Math.PI * 2);
    }, cols[2], 0, x, by, s * 0.2);
  };
  /** Bud: a closed lotus/lily bud on a short stalk. */
  K.bud = (x, y, s, dir, col, sepal) => {
    K.petal(x, y - dir * s * 0.1, -Math.PI / 2 * dir, s * 0.8, s * 0.24, col);
    for (const side of [-1, 1]) K.leaf(x, y - dir * s * 0.08, -Math.PI / 2 * dir + side * 0.5, s * 0.5, s * 0.16, sepal);
  };
  /** Almond blossom: five rounded petals, a centre and stamens. */
  K.blossom = (x, y, r, petal, center, rot = 0, heart = center) => {
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      K.petal(x, y, a, r, r * 0.52, petal, { lw: 1.2 });
    }
    K.disc(x, y, r * 0.48, heart, 0, { outline: false });
    K.disc(x, y, r * 0.24, center, 0, { lw: 1 });
    for (let i = 0; i < 5; i++) {
      const a = rot + ((i + 0.5) / 5) * Math.PI * 2;
      K.disc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, Math.max(1.2, r * 0.07), EMB_OUTLINE, 0, { outline: false });
    }
  };
  /** Sacred palm: scaled trunk with volute nodes, drooping fronds, crown palmette, dates. */
  K.palm = (x, yb, H, cols) => {
    const [BL, PU, SC] = cols;
    const Ht = H * 0.64, yc = yb - Ht;
    // base volutes and a little mound
    for (const side of [-1, 1]) K.stem(K.spiral(x + side * H * 0.07, yb - H * 0.05, H * 0.055, side < 0 ? 0 : Math.PI, -side * Math.PI * 2, 0.75), BL, 3);
    // fronds (behind the trunk top)
    for (let k = 3; k >= 0; k--) {
      for (const side of [-1, 1]) {
        const phi = 0.35 + 0.38 * k, Lf = H * (0.31 - 0.02 * k);
        const v = [side * Math.sin(phi), -Math.cos(phi)], e = [side * Math.sin(phi + 0.95), -Math.cos(phi + 0.95)];
        const c1 = [x + v[0] * Lf * 0.62, yc + v[1] * Lf * 0.62];
        const p2 = [c1[0] + e[0] * Lf * 0.55, c1[1] + e[1] * Lf * 0.55];
        K.curvedLeaf([x, yc], c1, p2, H * 0.034, k % 2 ? PU : BL, 0.95);
      }
    }
    // trunk: stacked chevron scales, herringbone satin alternating purple / scarlet
    const n = 8;
    for (let i = 0; i < n; i++) {
      const y0 = yb - (Ht * i) / n, y1 = yb - (Ht * (i + 1)) / n;
      const w0 = H * (0.05 - 0.016 * (i / n)), w1 = H * (0.05 - 0.016 * ((i + 1) / n));
      const notch = (y0 - y1) * 0.35;
      K.satin((c) => {
        c.beginPath();
        c.moveTo(x - w0, y0);
        c.lineTo(x, y0 - notch);
        c.lineTo(x + w0, y0);
        c.lineTo(x + w1, y1);
        c.lineTo(x, y1 - notch);
        c.lineTo(x - w1, y1);
        c.closePath();
      }, i % 2 ? SC : PU, Math.PI / 2 + (i % 2 ? 0.5 : -0.5), x, (y0 + y1) / 2, H * 0.07, { lw: 1.3 });
    }
    // volute node mid-trunk with small buds
    const ym = yb - Ht * 0.5;
    for (const side of [-1, 1]) {
      K.stem(K.spiral(x + side * H * 0.075, ym - H * 0.03, H * 0.04, side < 0 ? 0 : Math.PI, side * Math.PI * 1.8, 0.7), BL, 2.6);
      K.bud(x + side * H * 0.12, ym - H * 0.07, H * 0.07, 1, SC, PU);
    }
    // date clusters
    for (const side of [-1, 1]) {
      const dx = x + side * H * 0.085, dy = yc + H * 0.06;
      for (const [u, v] of [[0, 0], [-1, 0], [1, 0], [-0.5, 0.85], [0.5, 0.85], [0, 1.7]]) {
        K.disc(dx + u * H * 0.022, dy + v * H * 0.02, H * 0.012, SC, 0.3, { lw: 1 });
      }
    }
    // crown palmette
    K.palmette(x, yc + H * 0.01, H * 0.15, 1, [SC, BL, PU], 5);
  };
  return K;
}

/** Fill the canvas pair with linen: colour weave on `g`, a matching height weave on `h`. */
function paintEmbroideryGround(g, h, w, hh, rnd) {
  paintWeave(g, w, hh, rnd, '#ebe4d2');
  h.fillStyle = grey(0.5);
  h.fillRect(0, 0, w, hh);
  for (let y = 0; y < hh; y += 2) {
    h.fillStyle = grey(0.46 + rnd() * 0.06);
    h.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 2) {
    h.fillStyle = `rgba(80,80,80,${0.25 + rnd() * 0.2})`;
    h.fillRect(x, 0, 1, hh);
  }
}

/** Gate design: a running vine scroll with palmettes, lilies and pomegranates; rosette borders. */
function drawGateEmbroidery(K, W, H) {
  const BLUE = hex(COLORS.blue), PURPLE = hex(COLORS.purple), SCARLET = hex(COLORS.scarlet);
  const DYES = [BLUE, PURPLE, SCARLET];
  // Borders (top and mirrored bottom): scarlet / blue rosette band / purple / scarlet.
  const border = (y0, s) => {
    const at = (o, hh) => (s > 0 ? y0 + o : y0 - o - hh);
    K.band(-4, at(0, 6), W + 8, 6, SCARLET);
    K.band(-4, at(9, 52), W + 8, 52, BLUE);
    K.band(-4, at(64, 7), W + 8, 7, PURPLE);
    K.band(-4, at(74, 4), W + 8, 4, SCARLET);
    const yc = at(9, 52) + 26;
    for (let i = 0; i < W / 64; i++) {
      const x = 32 + i * 64;
      K.rosette(x, yc, 21, [EMB_THREAD], i % 2 ? SCARLET : PURPLE, 8, Math.PI / 8);
      // small purple-and-scarlet lozenge between rosettes
      const lx = x + 32;
      K.satin((c) => {
        c.beginPath();
        c.moveTo(lx, yc - 9);
        c.lineTo(lx + 6, yc);
        c.lineTo(lx, yc + 9);
        c.lineTo(lx - 6, yc);
        c.closePath();
      }, i % 2 ? PURPLE : SCARLET, 0, lx, yc, 10, { lw: 1.2 });
      // little pendant bud into the field
      K.bud(lx, at(78, 0) + s * 2, 30, -s, i % 2 ? SCARLET : PURPLE, BLUE);
    }
  };
  border(10, 1);
  border(H - 10, -1);

  // Field: a running vine (stem stitch) with alternating upright palmettes / hanging lilies at
  // its peaks and pomegranates curled into its bays. Period P divides the panel width.
  const P = 256, mid = H / 2, A = 60;
  const yAt = (x) => mid + A * Math.sin((2 * Math.PI * x) / P);
  const tan = (x) => Math.atan2(((A * 2 * Math.PI) / P) * Math.cos((2 * Math.PI * x) / P), 1);
  for (let j = -1; j <= W / P; j++) {
    const x0 = j * P, idx = j + 1;
    const body = DYES[(idx * 2 + 2) % 3], body2 = DYES[(idx * 2) % 3];
    // stalks into the bays (behind)
    K.stem((c) => {
      c.beginPath();
      c.moveTo(x0 + P / 4 + 40, yAt(x0 + P / 4 + 40));
      c.quadraticCurveTo(x0 + P / 4 + 34, mid + 6, x0 + P / 4, mid - 6);
    }, BLUE, 3);
    K.stem((c) => {
      c.beginPath();
      c.moveTo(x0 + (3 * P) / 4 - 40, yAt(x0 + (3 * P) / 4 - 40));
      c.quadraticCurveTo(x0 + (3 * P) / 4 - 34, mid - 6, x0 + (3 * P) / 4, mid + 6);
    }, BLUE, 3);
    // tendril curls at the stem's crossings
    for (const [xx, side] of [[x0 + 6, -1], [x0 + P / 2 + 6, 1]]) {
      const cy = yAt(xx) + side * 34;
      K.stem(K.spiral(xx + 16, cy, 15, side > 0 ? -Math.PI / 2 : Math.PI / 2, side * Math.PI * 2, 0.75), PURPLE, 2.4);
    }
    // leaves along the stem, alternating sides
    for (const [dx, side, col] of [[-30, 1, BLUE], [26, -1, PURPLE], [P / 2 - 30, -1, BLUE], [P / 2 + 26, 1, PURPLE], [-12, -1, SCARLET], [P / 2 - 10, 1, SCARLET]]) {
      const xx = x0 + dx, a = tan(xx) + side * (Math.PI / 2 - 0.55);
      K.leaf(xx, yAt(xx), a, dx === -12 || dx === P / 2 - 10 ? 28 : 40, dx === -12 || dx === P / 2 - 10 ? 12 : 17, col);
    }
    // pomegranates in the bays
    K.rosette(x0 + P / 4, mid - 110, 22, [DYES[idx % 3], EMB_THREAD], DYES[(idx + 1) % 3], 8);
    K.rosette(x0 + (3 * P) / 4, mid + 110, 22, [DYES[(idx + 1) % 3], EMB_THREAD], DYES[(idx + 2) % 3], 8);
    for (const sx of [-1, 1]) {
      K.leaf(x0 + P / 4 + sx * 24, mid - 110, sx > 0 ? 0.2 : Math.PI - 0.2, 36, 14, BLUE);
      K.leaf(x0 + (3 * P) / 4 + sx * 24, mid + 110, sx > 0 ? -0.2 : Math.PI + 0.2, 36, 14, BLUE);
    }
    K.pomegranate(x0 + P / 4, mid - 34, 25, 1, body, body2);
    K.pomegranate(x0 + (3 * P) / 4, mid + 34, 25, -1, body2, body);
  }
  // the vine itself, on top of the stalk roots
  K.stem((c) => {
    c.beginPath();
    for (let x = -20; x <= W + 20; x += 4) (x === -20 ? c.moveTo : c.lineTo).call(c, x, yAt(x));
  }, BLUE, 6);
  for (let j = -1; j <= W / P; j++) {
    const x0 = j * P;
    K.lily(x0 + P / 4, yAt(x0 + P / 4) + 2, 78, -1, [SCARLET, BLUE, PURPLE]);
    K.palmette(x0 + (3 * P) / 4, yAt(x0 + (3 * P) / 4) - 2, 88, 1, [BLUE, SCARLET, PURPLE]);
  }
}

/** Tent door design: rows of sacred palms and an almond-blossom branch; lotus-and-bud borders. */
function drawDoorEmbroidery(K, W, H) {
  const BLUE = hex(COLORS.blue), PURPLE = hex(COLORS.purple), SCARLET = hex(COLORS.scarlet);
  // Lotus-and-bud frieze between dyed bands (top, and the same at the bottom).
  const frieze = (y0) => {
    K.band(-4, y0, W + 8, 5, SCARLET);
    K.band(-4, y0 + 8, W + 8, 6, BLUE);
    K.band(-4, y0 + 82, W + 8, 6, BLUE);
    K.band(-4, y0 + 91, W + 8, 5, PURPLE);
    const base = y0 + 68;
    K.stem((c) => {
      c.beginPath();
      for (let x = -32; x < W + 32; x += 64) {
        c.moveTo(x, base);
        c.quadraticCurveTo(x + 32, base + 22, x + 64, base);
      }
    }, PURPLE, 2.6);
    for (let i = -1; i <= W / 64; i++) {
      const x = i * 64;
      K.lily(x, base, 52, 1, [SCARLET, BLUE, PURPLE]);
      K.stem((c) => {
        c.beginPath();
        c.moveTo(x + 32, base + 10);
        c.lineTo(x + 32, base - 6);
      }, BLUE, 2.4);
      K.bud(x + 32, base - 4, 34, 1, i % 2 ? PURPLE : SCARLET, BLUE);
    }
  };
  frieze(6);
  frieze(H - 102);

  // Field rows between the friezes.
  const top = 104, bot = H - 104;
  const divH = 34;
  const rowsH = bot - top - 2 * divH;
  const palmH = Math.round(rowsH * 0.395), almH = rowsH - 2 * palmH;
  const divider = (y) => {
    K.band(-4, y + 2, W + 8, 4, BLUE);
    K.band(-4, y + divH - 6, W + 8, 4, BLUE);
    for (let i = 0; i < W / 32; i++) {
      const x = 16 + i * 32;
      K.rosette(x, y + divH / 2, 10, [i % 2 ? SCARLET : PURPLE], BLUE, 6, i * 0.3);
    }
  };
  const palmRow = (y0, flipCols) => {
    const yb = y0 + palmH - 10;
    K.stem((c) => {
      c.beginPath();
      c.moveTo(-4, yb + 2);
      c.lineTo(W + 4, yb + 2);
    }, BLUE, 3.4);
    for (let i = 0; i < W / 128; i++) {
      const x = 64 + i * 128;
      K.palm(x, yb, palmH - 14, (i + flipCols) % 2 ? [BLUE, SCARLET, PURPLE] : [BLUE, PURPLE, SCARLET]);
      // between the palms: a lily on a tall stalk with leaves
      const lx = x + 64, ly = yb - palmH * 0.36;
      K.stem((c) => {
        c.beginPath();
        c.moveTo(lx, yb);
        c.lineTo(lx, ly);
      }, BLUE, 2.6);
      K.leaf(lx, yb - palmH * 0.12, -Math.PI / 2 - 0.75, palmH * 0.13, palmH * 0.05, PURPLE);
      K.leaf(lx, yb - palmH * 0.18, -Math.PI / 2 + 0.75, palmH * 0.13, palmH * 0.05, PURPLE);
      K.lily(lx, ly, palmH * 0.2, 1, [i % 2 ? PURPLE : SCARLET, BLUE, SCARLET]);
    }
  };
  const almondRow = (y0) => {
    const mid = y0 + almH / 2, A = almH * 0.14, P = 128;
    const yAt = (x) => mid + A * Math.sin((2 * Math.PI * x) / P);
    const tan = (x) => Math.atan(((A * 2 * Math.PI) / P) * Math.cos((2 * Math.PI * x) / P));
    for (let j = -1; j <= W / P; j++) {
      const x0 = j * P;
      // leaves, almonds (ripe nuts) and buds off the branch
      for (const [dx, side, col] of [[-22, 1, BLUE], [18, -1, BLUE], [P / 2 - 22, -1, BLUE], [P / 2 + 18, 1, BLUE]]) {
        const xx = x0 + dx;
        K.leaf(xx, yAt(xx), tan(xx) + side * (Math.PI / 2 - 0.6), almH * 0.2, almH * 0.07, col);
      }
      const xa = x0 + P / 4, xb = x0 + (3 * P) / 4;
      K.leaf(xa - 10, yAt(xa) - 4, -Math.PI / 2 - 0.3, almH * 0.22, almH * 0.11, PURPLE);
      K.bud(xb + 4, yAt(xb) + 6, almH * 0.2, -1, SCARLET, PURPLE);
    }
    K.stem((c) => {
      c.beginPath();
      for (let x = -20; x <= W + 20; x += 4) (x === -20 ? c.moveTo : c.lineTo).call(c, x, yAt(x));
    }, PURPLE, 4.4);
    for (let j = -1; j <= W / P; j++) {
      const x0 = j * P;
      for (const [bx, by, cen] of [[x0 + (3 * P) / 4 - 24, yAt(x0 + (3 * P) / 4) - almH * 0.27, BLUE], [x0 + P / 4 + 24, yAt(x0 + P / 4) + almH * 0.27, PURPLE]]) {
        const sx = bx + (by < mid ? 14 : -14);
        K.stem((c) => {
          c.beginPath();
          c.moveTo(sx, yAt(sx));
          c.quadraticCurveTo(sx, by, bx, by);
        }, PURPLE, 2.4);
        K.blossom(bx, by, almH * 0.13, EMB_THREAD, cen, j * 0.4, SCARLET);
      }
      K.blossom(x0 + P / 2, yAt(x0 + P / 2), almH * 0.1, SCARLET, BLUE, j * 0.7);
    }
  };
  palmRow(top, 0);
  divider(top + palmH);
  almondRow(top + palmH + divH);
  divider(top + palmH + divH + almH);
  palmRow(top + palmH + 2 * divH + almH, 1);
  // narrow side borders at the outer edges
  for (const x of [0, W - 14]) {
    K.band(x, 0, 14, H, BLUE, true);
    K.band(x === 0 ? 14 : W - 18, 0, 4, H, SCARLET, true);
  }
}

/**
 * Embroidered screen textures. `design` is 'gate' (courtyard gate) or 'door' (tent entrance).
 * `width`×`height` is the canvas in px for the whole screen (u across, v = 1 at the top edge);
 * the design is drawn in a fixed layout space `designWidth` px wide and scaled to fit, so the
 * two screens keep about the same stitch size per metre. Returns { map, bumpMap, ms }.
 */
export function createEmbroideredScreenTextures({ design = 'gate', width = 2048, height = 512, designWidth = width } = {}) {
  const t0 = performance.now();
  const k = width / designWidth;
  const W = designWidth, H = Math.round(height / k);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  };
  const cc = mk(), hc = mk();
  const g = cc.getContext('2d'), h = hc.getContext('2d');
  const rnd = seeded(design === 'gate' ? 23 : 29);
  paintEmbroideryGround(g, h, width, height, rnd);
  g.setTransform(k, 0, 0, k, 0, 0);
  h.setTransform(k, 0, 0, k, 0, 0);
  const K = embroideryKit(g, h);
  if (design === 'gate') drawGateEmbroidery(K, W, H);
  else drawDoorEmbroidery(K, W, H);
  const map = new THREE.CanvasTexture(cc);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(hc);
  bumpMap.anisotropy = 8;
  return { map, bumpMap, ms: performance.now() - t0 };
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

/** Canvas helpers shared by the cherub drawings. */
function poly(g, pts, fill) {
  g.fillStyle = fill;
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
  g.closePath();
  g.fill();
}
function line(g, pts, color, w) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
  g.stroke();
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * One cherub wing: a band of scale-like coverts along the leading edge (root -> tip, lower edge
 * cRoot -> cTip) and 8 straight primaries down to a stepped trailing edge (eRoot -> eTip).
 * Points in px; `s` the figure height in px.
 */
function drawWing(g, { root, tip, cRoot, cTip, eRoot, eTip }, s, dye, lw, linen) {
  const [cW, cR, cA] = dye;
  const K = 8; // primaries per wing
  for (let i = 0; i < K; i++) {
    const t0 = i / K, t1 = (i + 1) / K;
    const a0 = lerp2(cRoot, cTip, t0), a1 = lerp2(cRoot, cTip, t1);
    const drop = 0.025 * s * (1 - Math.abs(t0 + t1 - 1)); // a gentle droop mid-wing
    const b0 = lerp2(eRoot, eTip, t0), b1 = lerp2(eRoot, eTip, t1);
    poly(g, [a0, a1, [b1[0], b1[1] + drop], [b0[0], b0[1] + drop + 0.02 * s]], i % 2 ? cW : cR);
    line(g, [a1, [b1[0], b1[1] + drop]], linen, lw * 0.35);
    // A midrib down each feather.
    line(g, [lerp2(a0, a1, 0.5), [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2 + drop + 0.01 * s]], cA, lw * 0.25);
  }
  // Coverts: a band of the accent dye with two rows of linen-edged scales.
  poly(g, [root, tip, cTip, cRoot], cA);
  for (const [r0, r1, n] of [[0.25, 0.55, 9], [0.6, 0.92, 10]]) {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const top = lerp2(lerp2(root, tip, t), lerp2(cRoot, cTip, t), r0);
      const bot = lerp2(lerp2(root, tip, t), lerp2(cRoot, cTip, t), r1);
      const r = Math.abs(tip[0] - root[0]) / n * 0.5;
      g.fillStyle = cW;
      g.beginPath();
      g.ellipse((top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, r * 0.8, Math.abs(bot[1] - top[1]) * 0.55 + 1, 0, 0, Math.PI);
      g.fill();
    }
  }
  line(g, [root, tip], linen, lw * 0.3);
  line(g, [cRoot, cTip], linen, lw * 0.3);
}

/**
 * One woven cherub in profile, facing +x (mirror the canvas to face -x): the same manner and
 * dress as drawCherub, striding forward, the far wing raised up and back and the near wing swept
 * forward below the face, as on Phoenician and Egyptian winged guardians (cf. Ex 25:20, wings
 * spread, faces toward one another). (cx, cy) center, `s` height in px.
 */
function drawCherubProfile(g, cx, cy, s, dye, lw, linen) {
  const [cW, cR, cA] = dye;
  const P = (x, y) => [cx + x * s, cy + y * s];
  // Far wing, raised up and back behind the body.
  drawWing(g, {
    root: P(-0.03, -0.22), tip: P(-0.44, -0.6),
    cRoot: P(-0.04, -0.14), cTip: P(-0.46, -0.52),
    eRoot: P(-0.06, 0.03), eTip: P(-0.5, -0.37),
  }, s, [cR, cW, cA], lw, linen);
  // Robe in profile: narrow shoulders, widening to a hem that steps forward with the stride.
  const robe = [P(-0.075, -0.24), P(0.055, -0.24), P(0.11, 0.42), P(-0.13, 0.42)];
  poly(g, robe, cR);
  g.save();
  g.beginPath();
  robe.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
  g.closePath();
  g.clip();
  poly(g, [P(-0.2, 0.0), P(-0.08, -0.02), P(0.2, 0.26), P(0.2, 0.33)], cA);
  for (let k = 0; k < 10; k++) {
    const a = lerp2(P(-0.2, 0.0), P(0.2, 0.33), k / 9);
    line(g, [a, [a[0] - 0.012 * s, a[1] + 0.03 * s]], linen, lw * 0.25);
  }
  poly(g, [P(-0.2, 0.36), P(0.2, 0.36), P(0.2, 0.42), P(-0.2, 0.42)], cW);
  g.restore();
  for (let k = 0; k <= 12; k++) {
    const x = -0.13 + (0.24 * k) / 12;
    line(g, [P(x, 0.42), P(x, 0.455)], cA, lw * 0.3);
  }
  // Feet pointing forward, the front one advanced.
  poly(g, [P(-0.1, 0.46), P(-0.03, 0.46), P(0.01, 0.49), P(-0.1, 0.49)], cW);
  poly(g, [P(0.0, 0.46), P(0.07, 0.46), P(0.12, 0.49), P(0.0, 0.49)], cW);
  // Near wing, swept forward from the shoulder, rising a little, its feathers hanging below.
  drawWing(g, {
    root: P(-0.01, -0.2), tip: P(0.64, -0.4),
    cRoot: P(0.0, -0.11), cTip: P(0.65, -0.32),
    eRoot: P(0.02, 0.1), eTip: P(0.68, -0.15),
  }, s, dye, lw, linen);
  // Head: the hair a squared mass behind the face down to the shoulders, ending in curls.
  poly(g, [P(-0.105, -0.45), P(0.03, -0.46), P(0.015, -0.225), P(-0.11, -0.225)], cW);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = cA;
    g.beginPath();
    g.arc(...P(-0.095 + k * 0.034, -0.232), 0.013 * s, 0, Math.PI * 2);
    g.fill();
  }
  // Face in profile: brow, straight nose, lips, chin.
  const face = [P(0.0, -0.45), P(0.05, -0.44), P(0.068, -0.385), P(0.1, -0.343), P(0.076, -0.332),
    P(0.081, -0.316), P(0.071, -0.306), P(0.074, -0.288), P(0.056, -0.268), P(0.014, -0.26), P(0.0, -0.33)];
  poly(g, face, linen);
  // Outline the profile in the dark dye so it reads against the linen ground.
  line(g, face.slice(1, 10), cW, lw * 0.3);
  // The archaic large almond eye, seen from the front even in profile; brow; mouth.
  g.fillStyle = cW;
  g.beginPath();
  g.ellipse(...P(0.047, -0.366), 0.018 * s, 0.008 * s, 0, 0, Math.PI * 2);
  g.fill();
  line(g, [P(0.026, -0.388), P(0.066, -0.382)], cW, lw * 0.3);
  line(g, [P(0.057, -0.313), P(0.078, -0.313)], cR, lw * 0.35);
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
  for (const side of [-1, 1]) {
    drawWing(g, {
      root: P(0.07 * side, -0.21), tip: P(0.62 * side, -0.56),
      cRoot: P(0.08 * side, -0.13), cTip: P(0.62 * side, -0.48),
      eRoot: P(0.1 * side, 0.06), eTip: P(0.64 * side, -0.34),
    }, s, dye, lw, linen);
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

/** A leaf: a pointed ellipse from (x0, y0) to (x1, y1), `w` px wide. */
function drawLeaf(g, x0, y0, x1, y1, w, color) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  g.fillStyle = color;
  g.beginPath();
  g.ellipse((x0 + x1) / 2, (y0 + y1) / 2, len / 2, w / 2, Math.atan2(y1 - y0, x1 - x0), 0, Math.PI * 2);
  g.fill();
}

/** Point on a quadratic Bezier. */
const quad = (a, b, c, t) => [
  (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0],
  (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1],
];

/**
 * A stylized date palm, the "sacred tree" of Near Eastern art that cherubim flank (cf. 1 Kings
 * 6:29, cherubim, palm trees and open flowers): a scaled trunk, a crown of drooping fronds with
 * volutes at its base, and hanging date clusters. Base at (x, yb), height `h` px.
 * `dye` = [trunk, fronds, fruit].
 */
function drawPalm(g, x, yb, h, dye, lw, linen) {
  const [cT, cF, cD] = dye;
  const yc = yb - 0.66 * h; // crown center
  // Trunk, tapering, with chevron scales.
  poly(g, [[x - 0.045 * h, yb], [x + 0.045 * h, yb], [x + 0.028 * h, yc], [x - 0.028 * h, yc]], cT);
  for (let y = yb - 0.04 * h; y > yc + 0.03 * h; y -= 0.05 * h) {
    const hw = 0.028 * h + 0.017 * h * ((y - yc) / (yb - yc));
    line(g, [[x - hw, y - 0.02 * h], [x, y], [x + hw, y - 0.02 * h]], linen, lw * 0.3);
  }
  // Roots / base mound.
  for (const sd of [-1, 1]) drawLeaf(g, x, yb, x + sd * 0.12 * h, yb - 0.035 * h, 0.035 * h, cT);
  // Fronds: 5 a side, from nearly upright to drooping, each a curved rib with leaflets.
  const R = 0.36 * h;
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      // From nearly upright to arching out and drooping: each rib rises, then bends down.
      const a = (-78 + k * 24) * (Math.PI / 180);
      const ctl = [x + sd * Math.cos(a) * R * 0.55, yc + Math.sin(a) * R * 0.55 - 0.1 * h];
      const tip = [x + sd * (0.12 + 0.2 * Math.cos(a * 0.6)) * h * (0.7 + 0.08 * k),
        yc + Math.sin(a) * R * 0.5 + 0.035 * h * k];
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.1) pts.push(quad([x, yc], ctl, tip, t));
      for (let n = 2; n < pts.length; n++) {
        const [px, py] = pts[n], [qx, qy] = pts[n - 1];
        const ang = Math.atan2(py - qy, px - qx), ll = 0.07 * h * (1 - (n / pts.length) * 0.55);
        // Leaflets angled back along the rib, both sides.
        for (const e of [-1, 1]) {
          const la = ang + e * 2.3;
          drawLeaf(g, px, py, px + Math.cos(la) * ll, py + Math.sin(la) * ll, 0.016 * h, cF);
        }
      }
      line(g, pts, k % 2 ? cT : cF, lw * 0.45);
    }
  }
  // Volutes at the crown's base (the palmette's curls) and the crown's knot.
  for (const sd of [-1, 1]) {
    g.strokeStyle = cD;
    g.lineWidth = lw * 0.5;
    g.beginPath();
    g.arc(x + sd * 0.055 * h, yc + 0.035 * h, 0.03 * h, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = cT;
  g.beginPath();
  g.ellipse(x, yc, 0.04 * h, 0.03 * h, 0, 0, Math.PI * 2);
  g.fill();
  // Date clusters hanging under the crown.
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const row = Math.floor(Math.sqrt(k * 2)), col = k - (row * (row + 1)) / 2;
      g.fillStyle = cD;
      g.beginPath();
      g.arc(x + sd * (0.085 * h + (col - row / 2) * 0.022 * h), yc + 0.07 * h + row * 0.022 * h, 0.011 * h, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** A pomegranate hanging from (x, y): round fruit with a crowned calyx (cf. Ex 28:33). */
function drawPomegranate(g, x, y, r, fill, accent, linen, lw) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y + r, r, 0, Math.PI * 2);
  g.fill();
  // Calyx crown pointing down, and a highlight seam.
  poly(g, [[x - 0.45 * r, y + 1.9 * r], [x - 0.3 * r, y + 2.35 * r], [x - 0.1 * r, y + 2.0 * r], [x, y + 2.4 * r],
    [x + 0.1 * r, y + 2.0 * r], [x + 0.3 * r, y + 2.35 * r], [x + 0.45 * r, y + 1.9 * r]], accent);
  line(g, [[x - 0.35 * r, y + 0.5 * r], [x - 0.5 * r, y + 1.2 * r]], linen, lw * 0.3);
  line(g, [[x, y - 0.25 * r], [x, y + 0.05 * r]], accent, lw * 0.4);
}

/**
 * A lily plant (the Temple's "lily-work", 1 Kings 7:19): a stem with long leaves, an open lily
 * at the top (an upright petal between two out-curling ones), and two side branches each
 * ending in a hanging pomegranate. Base at (x, yb), height `h` px. `dye` = [stem, petal, fruit].
 */
function drawLily(g, x, yb, h, dye, lw, linen) {
  const [cS, cP, cF] = dye;
  const yt = yb - 0.8 * h;
  line(g, [[x, yb], [x, yt]], cS, lw * 0.6);
  // Leaves from the base, and pairs up the stem.
  for (const sd of [-1, 1]) {
    drawLeaf(g, x, yb - 0.02 * h, x + sd * 0.16 * h, yb - 0.3 * h, 0.05 * h, cS);
    drawLeaf(g, x, yb - 0.32 * h, x + sd * 0.11 * h, yb - 0.46 * h, 0.035 * h, cS);
  }
  // Side branches with pomegranates.
  for (const sd of [-1, 1]) {
    const b0 = [x, yb - 0.55 * h], b1 = [x + sd * 0.1 * h, yb - 0.68 * h], b2 = [x + sd * 0.17 * h, yb - 0.6 * h];
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.2) pts.push(quad(b0, b1, b2, t));
    line(g, pts, cS, lw * 0.4);
    drawPomegranate(g, b2[0], b2[1], 0.045 * h, cF, cS, linen, lw);
  }
  // The open lily: sepals curling out and down, the upright petal, stamens.
  for (const sd of [-1, 1]) {
    const p0 = [x, yt + 0.02 * h], p1 = [x + sd * 0.13 * h, yt - 0.06 * h], p2 = [x + sd * 0.13 * h, yt + 0.04 * h];
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.125) pts.push(quad(p0, p1, p2, t));
    line(g, pts, cP, lw * 1.1);
    g.fillStyle = cP;
    g.beginPath();
    g.arc(p2[0] - sd * 0.015 * h, p2[1], 0.022 * h, 0, Math.PI * 2);
    g.fill();
    line(g, [[x + sd * 0.012 * h, yt - 0.02 * h], [x + sd * 0.05 * h, yt - 0.14 * h]], cF, lw * 0.3);
  }
  drawLeaf(g, x, yt + 0.02 * h, x, yt - 0.17 * h, 0.06 * h, cP);
  poly(g, [[x - 0.035 * h, yt + 0.04 * h], [x + 0.035 * h, yt + 0.04 * h], [x, yt - 0.02 * h]], cF);
}

/** A small flowering sprig for the ground line: three stems, leaves and little open flowers. */
function drawSprig(g, x, yb, h, dye, lw) {
  const [cS, cP, cC] = dye;
  for (const [dx, hh] of [[-0.3, 0.7], [0, 1], [0.3, 0.75]]) {
    const tx = x + dx * h * 0.5, ty = yb - hh * h;
    line(g, [[x, yb], [x + dx * h * 0.25, yb - hh * h * 0.5], [tx, ty]], cS, lw * 0.35);
    drawLeaf(g, x + dx * h * 0.2, yb - hh * h * 0.4, x + dx * h * 0.2 + (dx >= 0 ? 1 : -1) * 0.22 * h, yb - hh * h * 0.55, 0.08 * h, cS);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.fillStyle = cP;
      g.beginPath();
      g.arc(tx + Math.cos(a) * 0.07 * h, ty + Math.sin(a) * 0.07 * h, 0.05 * h, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = cC;
    g.beginPath();
    g.arc(tx, ty, 0.04 * h, 0, Math.PI * 2);
    g.fill();
  }
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
 * diamond lattice behind the figures (veil, denser work). `facing`: 'front' (frontal figures) or
 * 'center' (profile figures, each half of the columns turned toward the canvas's middle, the
 * facing pairs in matching dyes; ceiling).
 */
export function createCherubimTexture({ w = 5, h = 4, ppc = 256, cols = 2, rows = 2, seams = false, border = false, seed = 47, facing = 'front' } = {}) {
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
  // Garden between the figures (drawn first, so the cherubim lie over any overlap): sacred palms
  // in the wide gaps, lily-and-pomegranate stalks in the narrow ones, flowering sprigs along
  // each row's ground line at the figures' feet.
  for (let j = 0; j < rows; j++) {
    const yb = top + (j + 0.5) * ch + s * 0.51; // ground line, just under the feet
    const dyeAt = (k) => [DYES[k % 3], DYES[(k + 1) % 3], DYES[(k + 2) % 3]];
    if (facing === 'center') {
      // Palm between each facing pair (the middle of the canvas), lilies between figures facing
      // the same way and at the canvas edges (which meet the next tile's edge).
      drawPalm(g, W / 2, yb, s * 1.0, dyeAt(2 + j), lw, LINEN);
      for (let i = 1; i < cols; i++) if (i !== cols / 2) drawLily(g, i * cw, yb, s * 0.95, dyeAt(i + j), lw, LINEN);
      for (const x of [0, W]) drawLily(g, x, yb, s * 0.95, dyeAt(j + 1), lw, LINEN);
    } else {
      // A palm in each gap between frontal figures, under their wingtips.
      for (let i = 1; i < cols; i++) drawPalm(g, i * cw, yb, s * 0.71, dyeAt(i + j + 1), lw, LINEN);
    }
    for (let i = 0; i < cols; i++) {
      for (const sd of [-1, 1]) {
        drawSprig(g, (i + 0.5) * cw + sd * cw * 0.3, yb, s * 0.2, dyeAt(i + j + (sd > 0 ? 1 : 2)), lw);
      }
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const fx = (i + 0.5) * cw, fy = top + (j + 0.5) * ch + s * 0.02;
      if (facing === 'center') {
        const dir = i + 0.5 < cols / 2 ? 1 : -1; // toward the middle column line
        const k = Math.min(i, cols - 1 - i) + j; // mirrored pairs share their dyes
        g.save();
        g.translate(fx, 0);
        g.scale(dir, 1);
        // Shift back a little so the forward-reaching wing doesn't crowd the middle.
        drawCherubProfile(g, -0.06 * s, fy, s, [DYES[k % 3], DYES[(k + 1) % 3], DYES[(k + 2) % 3]], lw, LINEN);
        g.restore();
      } else {
        const k = i + j;
        drawCherub(g, fx, fy, s, [DYES[k % 3], DYES[(k + 1) % 3], DYES[(k + 2) % 3]], lw, LINEN);
      }
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
