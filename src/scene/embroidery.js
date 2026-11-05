import * as THREE from 'three';
import { COLORS } from './materials.js';
import { hex, seeded, paintWeave, grey } from './textiles.js';

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
