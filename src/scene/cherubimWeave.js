import * as THREE from 'three';
import { seeded } from './textiles.js';

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
