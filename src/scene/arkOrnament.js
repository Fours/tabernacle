import * as THREE from 'three';
import { part, merge } from './bronzeParts.js';

// Ornament for the ark (reconstruction, at the user's direction; the text gives only the crown,
// Ex 25:11): a profiled crown with bead-and-reel and leaf tips, a moulded plinth, framed and
// recessed panels on all four sides with almond-leaf scrollwork and rosettes, corner pilasters,
// leaf feet, lobed plates behind the rings, and a palmette-and-almond frieze with corner
// rosettes around the mercy seat inside the crown. Ancient Near Eastern plant motifs only.
//
// Everything is real relief geometry, returned as non-indexed parts for the ark's single
// merged gold mesh. Ornament sizes are not biblical, so they are given here in meters.
// Reliefs are built flat in a local plane (x, y in the plane, z out of the surface) and mapped
// onto a face of the chest with a rotation matrix.

const TAU = Math.PI * 2;
const tmpM = new THREE.Matrix4();

// ---- Relief primitives (local plane, z = out of the surface) ------------------------------

/**
 * A leaf or petal lying on the surface: length along +x from the origin, width along y, domed
 * toward +z with a groove along the midrib. Single-sided (its edges tuck just under the surface).
 */
function leafGeo(len, wid, h, { nu = 5, nv = 3, blunt = false, curl = 0 } = {}) {
  const pos = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const t = i / nu;
    const s = blunt
      ? Math.pow(Math.sin(Math.PI * Math.pow(t, 1.3) * 0.98 + 0.01), 0.55)
      : Math.sin(Math.PI * Math.pow(t, 0.75) * 0.98 + 0.01);
    const half = (wid / 2) * Math.max(0.06, s);
    const hh = h * Math.max(0.15, Math.sqrt(Math.max(0, s)));
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * 2 - 1;
      let z = hh * Math.sqrt(Math.max(0, 1 - v * v)) - 0.0006;
      z -= hh * 0.3 * Math.exp(-v * v * 16) * (blunt ? 0.3 : 1); // midrib groove
      z += curl * t * t * t;
      pos.push(t * len, v * half, z);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1, c = a + 1, d = b + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A tapered round stem along a 2D polyline: the upper half of a tube lying on the surface
 * (the lower half would be hidden). Built directly from the points, resampled to <= 6 mm.
 */
function stemGeo(pts0, r0, r1, radial = 3, step = 0.008) {
  const pts = [pts0[0]];
  for (let i = 1; i < pts0.length; i++) {
    const [ax, ay] = pts0[i - 1], [bx, by] = pts0[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  const np = pts.length, pos = [], nor = [], idx = [];
  for (let i = 0; i < np; i++) {
    const [px, py] = pts[i], [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(np - 1, i + 1)];
    const tl = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / tl, ny = (bx - ax) / tl;
    const r = r0 + ((r1 - r0) * i) / (np - 1);
    for (let j = 0; j <= radial; j++) {
      const th = (Math.PI * j) / radial, c = Math.cos(th), sn = Math.sin(th);
      pos.push(px + nx * r * c, py + ny * r * c, r * sn * 0.85 - 0.0003);
      nor.push(nx * c, ny * c, sn);
    }
  }
  for (let i = 0; i < np - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1, c = a + 1, d = b + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Bead profile along a rod: round beads, or bead-and-reel (a long bead, then two thin discs). */
function beadProfile(s, reel) {
  if (!reel) return 0.3 + 0.7 * Math.sqrt(Math.max(0, Math.sin(Math.PI * s)));
  if (s < 0.6) return 0.35 + 0.65 * Math.sqrt(Math.max(0, Math.sin((Math.PI * s) / 0.6)));
  const q = (s - 0.6) / 0.4;
  return 0.3 + 0.45 * Math.sqrt(Math.abs(Math.sin(TAU * q)));
}

/**
 * A beaded rod of length len along x, centered on the origin. Half-round (z >= 0) unless full.
 * reel: bead-and-reel instead of plain beads.
 */
function beadRod(len, r, pitch, { reel = false, full = false, radial = full ? 5 : 3 } = {}) {
  const n = Math.max(1, Math.round(len / pitch)), per = reel ? 6 : 4;
  const g = full
    ? new THREE.CylinderGeometry(1, 1, len, radial, n * per, true)
    : new THREE.CylinderGeometry(1, 1, len, radial, n * per, true, -Math.PI / 2, Math.PI);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = (((p.getY(i) + len / 2) / len) * n) % 1;
    const k = r * beadProfile(s, reel);
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g.rotateZ(-Math.PI / 2);
}

/** A ring of n beads (radius r) at radius R around the origin, half sunk into the surface. */
function beadRingGeo(R, r, n) {
  const g = new THREE.TorusGeometry(R, 1, 4, n * 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const phi = Math.atan2(y, x), cx = R * Math.cos(phi), cy = R * Math.sin(phi);
    const s = ((((phi / TAU) * n) % 1) + 1) % 1;
    const k = r * beadProfile(s, false);
    p.setXYZ(i, cx + (x - cx) * k, cy + (y - cy) * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A low dome of radius r and height h on the surface. */
const domeGeo = (r, h, seg = 8) =>
  new THREE.SphereGeometry(1, seg, 3, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(r, r, h);

/** A flat plate with a lobed (scalloped) outline, n lobes, outer radius R, thickness t. */
function lobedPlateGeo(R, n, t) {
  const sh = new THREE.Shape();
  const N = n * 6;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const r = R * (0.86 + 0.14 * Math.abs(Math.cos((a * n) / 2)));
    if (i === 0) sh.moveTo(r * Math.cos(a), r * Math.sin(a));
    else sh.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  return new THREE.ExtrudeGeometry(sh, {
    depth: t, bevelEnabled: true, bevelThickness: t * 0.5, bevelSize: t * 0.5, bevelSegments: 1, curveSegments: 4,
  });
}

/** Collects relief parts in a local plane and maps them onto a surface. */
class Relief {
  constructor() { this.parts = []; }

  push(g, x = 0, y = 0, a = 0, z = 0) {
    g.applyMatrix4(tmpM.makeRotationZ(a).setPosition(x, y, z));
    const out = part(g);
    // No zero or NaN normals (they turn into black squares under bloom).
    const n = out.attributes.normal;
    for (let i = 0; i < n.count; i++) {
      const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
      if (!(l > 1e-6)) n.setXYZ(i, 0, 0, 1);
    }
    this.parts.push(out);
  }

  leaf(x, y, a, len, wid, h, opt) { this.push(leafGeo(len, wid, h, opt), x, y, a); }
  stem(pts, r0, r1 = r0, step) { this.push(stemGeo(pts, r0, r1, 3, step)); }
  dome(x, y, r, h, z = 0) { this.push(domeGeo(r, h), x, y, 0, z); }
  beadRing(x, y, R, r, n) { this.push(beadRingGeo(R, r, n), x, y); }

  beadLine(x0, y0, x1, y1, r, pitch, reel = false) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    this.push(beadRod(len, r, pitch, { reel }), (x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(y1 - y0, x1 - x0));
  }

  /** A raised flat slab from (x0,y0) to (x1,y1), standing `depth` proud of the surface. */
  slab(x0, y0, x1, y1, depth) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), depth + 0.002);
    this.push(g, (x0 + x1) / 2, (y0 + y1) / 2, 0, depth / 2 - 0.001);
  }

  /** Rosette: n broad petals in two layers around a domed boss, radius R, relief height h. */
  rosette(x, y, R, n = 12, h = R * 0.12, z = 0) {
    const w1 = ((TAU * R * 0.62) / n) * 1.25;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      this.push(leafGeo(R * 0.74, w1, h, { blunt: true, nu: 4, nv: 2 }), x + Math.cos(a) * R * 0.26, y + Math.sin(a) * R * 0.26, a, z);
      if (R < 0.03) continue; // small rosettes: one ring of petals
      const b = a + Math.PI / n;
      this.push(leafGeo(R * 0.48, w1 * 0.7, h * 0.9, { blunt: true, nu: 3, nv: 2 }),
        x + Math.cos(b) * R * 0.22, y + Math.sin(b) * R * 0.22, b, z + h * 0.45);
    }
    this.dome(x, y, R * 0.27, h * 1.9, z);
  }

  /** Palmette: a fan of 7 leaves rising from a small boss with two curled volutes. */
  palmette(x, y, a, size) {
    const h = size * 0.13;
    for (let i = -2; i <= 2; i++) {
      const la = a + i * 0.4;
      const len = size * (0.62 + 0.38 * Math.cos(i * 0.55));
      this.leaf(x + Math.cos(la) * size * 0.12, y + Math.sin(la) * size * 0.12, la, len, size * 0.24, h, { blunt: true, nu: 4, nv: 3 });
    }
    this.dome(x, y, size * 0.16, h * 1.6);
    for (const s of [-1, 1]) {
      const px = -Math.sin(a) * s, py = Math.cos(a) * s; // sideways
      const cx = x + px * size * 0.2 - Math.cos(a) * size * 0.02, cy = y + py * size * 0.2 - Math.sin(a) * size * 0.02;
      const pts = [];
      const th0 = Math.atan2(y - cy, x - cx);
      for (let j = 0; j <= 6; j++) {
        const f = j / 6, th = th0 - s * f * 1.5 * Math.PI, r = size * 0.16 * Math.pow(0.35, f);
        pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
      }
      this.stem(pts, size * 0.045, size * 0.025);
    }
  }

  /** Almond bud: one upright almond leaf between two small sepals. */
  bud(x, y, a, size) {
    const h = size * 0.13;
    this.leaf(x, y, a, size * 0.8, size * 0.3, h);
    for (const s of [-1, 1]) this.leaf(x, y, a + s * 0.75, size * 0.32, size * 0.16, h * 0.8, { nu: 4, nv: 3 });
    this.dome(x, y, size * 0.1, h * 1.2);
  }

  build(matrix) {
    const g = merge(this.parts);
    this.parts = [];
    if (matrix) g.applyMatrix4(matrix);
    return g;
  }
}

/**
 * A running almond scroll (canonical frame: stem along +s from 0 to len, lateral t): a wave
 * stem with a spiral tendril curling into each hollow around a small rosette, almond leaves
 * where the stem crosses its axis, and a bud at its end. map(s, t) -> [x, y] places it.
 */
function runningScroll(rel, map, len, A, waves, stemR, palm = 0) {
  const lam = len / waves;
  const mapA = (s, t, a) => {
    const [x0, y0] = map(s, t), [x1, y1] = map(s + Math.cos(a) * 1e-3, t + Math.sin(a) * 1e-3);
    return [x0, y0, Math.atan2(y1 - y0, x1 - x0)];
  };
  const wave = (s) => A * Math.sin((TAU * s) / lam);
  const slope = (s) => Math.atan2(A * (TAU / lam) * Math.cos((TAU * s) / lam), 1);
  const n = Math.ceil(len / 0.006);
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(map((i / n) * len, wave((i / n) * len)));
  rel.stem(pts, stemR, stemR * 0.7);
  const leafLen = Math.min(0.062, lam * 0.3), leafW = leafLen * 0.4, lh = stemR * 0.9;
  // Tendrils into the hollows: under each crest, over each trough.
  for (let k = 0; ; k++) {
    const sc = lam / 4 + (k * lam) / 2;
    if (sc > len - lam / 10) break;
    const sg = k % 2 === 0 ? 1 : -1;
    const C = [sc, sg * 0.3 * A];
    const S = [sc - lam / 8, wave(sc - lam / 8)];
    const r0 = Math.hypot(S[0] - C[0], S[1] - C[1]);
    const th0 = Math.atan2(S[1] - C[1], S[0] - C[0]);
    const tp = [];
    for (let j = 0; j <= 20; j++) {
      const f = j / 20, th = th0 - sg * f * 1.6 * Math.PI, r = r0 * Math.pow(0.28, f);
      tp.push(map(C[0] + r * Math.cos(th), C[1] + r * Math.sin(th)));
    }
    rel.stem(tp, stemR * 0.7, stemR * 0.4);
    const [rx, ry] = map(C[0], C[1]);
    rel.rosette(rx, ry, r0 * 0.24, 6, r0 * 0.24 * 0.16);
    // A leaf on the outside of the tendril, a third of the way round.
    const f = 0.3, th = th0 - sg * f * 1.6 * Math.PI, r = r0 * Math.pow(0.28, f);
    const [lx, ly, la] = mapA(C[0] + r * Math.cos(th), C[1] + r * Math.sin(th), th + sg * 0.5);
    rel.leaf(lx, ly, la, leafLen * 0.8, leafW * 0.8, lh);
    // A palmette standing off the crest toward the edge, and a rosette in the open bay
    // beyond the tendril.
    if (palm > 0) {
      const [px, py, pa] = mapA(sc, sg * (A + stemR * 0.5), sg * Math.PI / 2);
      rel.palmette(px, py, pa, palm);
      const [qx, qy] = map(sc, -sg * 0.62 * A);
      rel.rosette(qx, qy, palm * 0.55, 10, palm * 0.55 * 0.14);
    }
  }
  // Pairs of almond leaves where the stem crosses its axis.
  for (let k = 1; (k * lam) / 2 < len - lam / 8; k++) {
    const s = (k * lam) / 2, a = slope(s);
    for (const side of [-1, 1]) {
      const [lx, ly, la] = mapA(s, wave(s), a + side * 0.75);
      rel.leaf(lx, ly, la, leafLen, leafW, lh);
    }
  }
  // An almond bud at the end.
  const [bx, by, ba] = mapA(len, wave(len), slope(len));
  rel.bud(bx, by, ba, leafLen * 0.9);
}

// ---- Swept mouldings ----------------------------------------------------------------------

/**
 * Sweep a moulding profile around the chest: prof is [o, y] pairs (o = meters out from the
 * faces at x = ±hx, z = ±hz; y = height), walked so the outside is on its right (bottom ->
 * top on the outer face). Corners are mitred. Smooth normals except at creases.
 */
function sweepRect(prof0, hx, hz) {
  const prof = prof0.filter((p, i) => i === 0 || Math.hypot(p[0] - prof0[i - 1][0], p[1] - prof0[i - 1][1]) > 1e-6);
  const segN = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const dO = prof[i + 1][0] - prof[i][0], dY = prof[i + 1][1] - prof[i][1], l = Math.hypot(dO, dY) || 1;
    segN.push([dY / l, -dO / l]);
  }
  const nAt = (pt, seg) => {
    const a = segN[seg], b = pt === seg ? segN[seg - 1] : segN[seg + 1];
    if (!b || a[0] * b[0] + a[1] * b[1] < 0.6) return a;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y);
    return [x / l, y / l];
  };
  const pos = [], nor = [];
  const sides = [[1, 0, hx, hz], [-1, 0, hx, hz], [0, 1, hz, hx], [0, -1, hz, hx]];
  const P = (side, o, y, end) => {
    const [nx, nz, hn, ht] = side, tx = -nz, tz = nx;
    return [nx * (hn + o) + end * tx * (ht + o), y, nz * (hn + o) + end * tz * (ht + o)];
  };
  for (const side of sides) {
    for (let i = 0; i < segN.length; i++) {
      const [o1, y1] = prof[i], [o2, y2] = prof[i + 1];
      const A = P(side, o1, y1, -1), B = P(side, o1, y1, 1), C = P(side, o2, y2, -1), D = P(side, o2, y2, 1);
      const n1 = nAt(i, i), n2 = nAt(i + 1, i);
      const N1 = [side[0] * n1[0], n1[1], side[1] * n1[0]], N2 = [side[0] * n2[0], n2[1], side[1] * n2[0]];
      const sn = segN[i], SN = [side[0] * sn[0], sn[1], side[1] * sn[0]];
      // Winding: (A, B, D) must face along the segment normal.
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const flip = cr[0] * SN[0] + cr[1] * SN[1] + cr[2] * SN[2] < 0;
      const tris = flip ? [[A, N1], [D, N2], [B, N1], [A, N1], [C, N2], [D, N2]] : [[A, N1], [B, N1], [D, N2], [A, N1], [D, N2], [C, N2]];
      for (const [p, n] of tris) { pos.push(...p); nor.push(...n); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return part(g);
}

/** Points along an arc (center c, radius r) from angle a0 to a1 (radians), n steps. */
function arc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

// ---- Face frames --------------------------------------------------------------------------

const Y = new THREE.Vector3(0, 1, 0);
/** Matrix from a face's (u, v=height, out) plane to ark-local space; normal n, distance d. */
function faceMatrix(nx, nz, d) {
  const N = new THREE.Vector3(nx, 0, nz), U = new THREE.Vector3().crossVectors(Y, N);
  return new THREE.Matrix4().makeBasis(U, Y, N).setPosition(nx * d, 0, nz * d);
}

// ---- The ornament -------------------------------------------------------------------------

/**
 * All ornament parts of the chest. d: the ark's dimensions in meters:
 * { W, L, H, FH, FS, SEAT_TOP, CW, C_BELOW, C_LIP, ringX, ringY, RING_R }.
 */
export function arkOrnamentParts(d) {
  const { W, L, H, FH, FS, SEAT_TOP, CW, C_BELOW, C_LIP, ringX, ringY } = d;
  const out = [];
  const y0 = H - C_BELOW, y1 = SEAT_TOP + C_LIP;

  // Crown (zer): astragal, flaring cove, a tall band, a fat roll on top, and its inner lip
  // standing above the mercy seat.
  const rr = CW * 0.55, rcx = CW - rr * 0.4;
  const crown = [[0, y0], [0.008, y0], ...arc(0.008, y0 + 0.007, 0.007, -Math.PI / 2, Math.PI / 2, 6)];
  for (let i = 1; i <= 6; i++) { const t = i / 6; crown.push([0.006 + (CW - 0.006 - 0.0015) * t * t, y0 + 0.014 + 0.031 * t]); }
  crown.push([CW, y0 + 0.047], [CW, y1 - 0.024], [CW - 0.002, y1 - 0.02]);
  crown.push(...arc(rcx, y1, rr, -Math.PI * 0.42, Math.PI * 1.05, 14));
  crown.push([0, y1 - 0.006], [0, SEAT_TOP - 0.002]);
  out.push(sweepRect(crown, W / 2, L / 2));

  // Plinth near the foot of the body: a roll, a fillet and a cove.
  const PL = FH + 0.045;
  const plinth = [[0, FH], [0.006, FH], ...arc(0.006, FH + 0.009, 0.009, -Math.PI / 2, Math.PI / 2, 8),
    [0.009, FH + 0.02], [0.009, FH + 0.026]];
  for (let i = 1; i <= 5; i++) { const t = i / 5; plinth.push([0.009 * (1 - t) * (1 - t) + 0.0005, FH + 0.026 + 0.019 * t]); }
  plinth.push([0, PL]);
  out.push(sweepRect(plinth, W / 2, L / 2));

  // Crown band: bead-and-reel under the roll and a row of tongue leaves hanging below it.
  for (const [nx, nz, half, span] of [[1, 0, W / 2, L], [-1, 0, W / 2, L], [0, 1, L / 2, W], [0, -1, L / 2, W]]) {
    const r = new Relief();
    const hl = span / 2 + CW;
    r.beadLine(-hl, y1 - 0.031, hl, y1 - 0.031, 0.0055, 0.022, true);
    const n = Math.round((2 * hl - 0.02) / 0.024);
    for (let i = 0; i <= n; i++) {
      const u = -hl + 0.01 + ((2 * hl - 0.02) * i) / n;
      r.leaf(u, y1 - 0.038, -Math.PI / 2, 0.036, 0.017, 0.0045, { blunt: true, nu: 4, nv: 2 });
    }
    out.push(r.build(faceMatrix(nx, nz, half + CW)));
  }

  // Panels: raised frames with beaded inner edges around recessed fields.
  const vb = PL + 0.007, vt = y0 - 0.016, fw = 0.024, fd = 0.007, vc = (vb + vt) / 2;
  const frame = (r, u0, v0, u1, v1, beads = true) => {
    r.slab(u0, v0, u1, v0 + fw, fd);
    r.slab(u0, v1 - fw, u1, v1, fd);
    r.slab(u0, v0 + fw, u0 + fw, v1 - fw, fd);
    r.slab(u1 - fw, v0 + fw, u1, v1 - fw, fd);
    if (!beads) return;
    const e = fw + 0.004, br = 0.004, p = 0.014;
    r.beadLine(u0 + e, v0 + e, u1 - e, v0 + e, br, p);
    r.beadLine(u0 + e, v1 - e, u1 - e, v1 - e, br, p);
    r.beadLine(u0 + e, v0 + e, u0 + e, v1 - e, br, p);
    r.beadLine(u1 - e, v0 + e, u1 - e, v1 - e, br, p);
  };
  const PIL = 0.028; // corner pilasters reach this far in from each corner
  // Long sides (east and west): one panel with a central medallion and scrolls to each end.
  for (const s of [1, -1]) {
    const r = new Relief();
    const ue = L / 2 - PIL - 0.006;
    frame(r, -ue, vb, ue, vt);
    r.beadRing(0, vc, 0.1, 0.0055, 40);
    r.rosette(0, vc, 0.084, 16, 0.009);
    const fe = ue - fw - 0.012;
    for (const dir of [1, -1]) {
      runningScroll(r, (a, t) => [dir * (0.11 + a), vc + t], fe - 0.11, 0.115, 1.5, 0.0055, 0.05);
    }
    out.push(r.build(faceMatrix(s, 0, W / 2)));
  }
  // Short sides (north and south): a central panel with a medallion and scrolls up and down,
  // and narrow side panels above the rings with an almond-leaf palmette column; lobed plates
  // behind the rings.
  for (const s of [1, -1]) {
    const r = new Relief();
    const uc = 0.19;
    frame(r, -uc, vb, uc, vt);
    r.beadRing(0, vc, 0.072, 0.005, 30);
    r.rosette(0, vc, 0.06, 12, 0.007);
    const fe = (vt - vb) / 2 - fw - 0.012;
    for (const dir of [1, -1]) runningScroll(r, (a, t) => [t, vc + dir * (0.078 + a)], fe - 0.078, 0.05, 1, 0.0036);
    const so = W / 2 - PIL - 0.006, si = uc + 0.008, sb = ringY + 0.075;
    for (const side of [1, -1]) {
      const a0 = side * si, a1 = side * so, um = (a0 + a1) / 2;
      frame(r, Math.min(a0, a1), sb, Math.max(a0, a1), vt, false);
      const cb = sb + fw + 0.03, ct = vt - fw - 0.06;
      r.rosette(um, cb - 0.012, 0.016, 8, 0.003);
      r.stem([[um, cb], [um, ct]], 0.0035, 0.003);
      for (let k = 0; k < 4; k++) {
        const v = cb + 0.02 + ((ct - cb - 0.03) * k) / 3;
        for (const sd of [-1, 1]) r.leaf(um, v, Math.PI / 2 + sd * 0.9, 0.034, 0.013, 0.003);
      }
      r.palmette(um, ct, Math.PI / 2, 0.052);
      // Ring plate: a lobed plate with a rosette, behind the ring and its staple.
      r.push(lobedPlateGeo(0.034, 12, 0.003), side * ringX, ringY + 0.016);
      r.rosette(side * ringX, ringY + 0.016, 0.022, 10, 0.0028, 0.0045);
    }
    out.push(r.build(faceMatrix(0, s, L / 2)));
  }

  // Corner pilasters: a square post proud of both faces with a base, a capital and a
  // bead-and-reel roll down its edge.
  const pp = 0.007;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (W / 2 + pp - (PIL + pp) / 2), cz = sz * (L / 2 + pp - (PIL + pp) / 2);
      const ph = y0 - PL;
      out.push(part(new THREE.BoxGeometry(PIL + pp, ph, PIL + pp), { pos: [cx, PL + ph / 2, cz] }));
      for (const [yy, hh] of [[PL + 0.007, 0.014], [y0 - 0.008, 0.016]]) {
        out.push(part(new THREE.BoxGeometry(PIL + pp + 0.006, hh, PIL + pp + 0.006), { pos: [cx, yy, cz] }));
      }
      const rod = beadRod(ph - 0.034, 0.0062, 0.02, { reel: true, full: true, radial: 4 }).rotateZ(Math.PI / 2);
      out.push(part(rod, { pos: [sx * (W / 2 + pp - 0.001), PL + 0.015 + (ph - 0.034) / 2, sz * (L / 2 + pp - 0.001)] }));
    }
  }

  // Feet: a round bun under a collar, wrapped in six almond leaves turned down.
  const footProf = [[0.0001, 0], [0.03, 0], [0.04, 0.006], [0.045, 0.016], [0.043, 0.026], [0.035, 0.036], [0.031, 0.042],
    [0.036, 0.046], [0.047, 0.05], [0.049, 0.055], [0.045, 0.058], [0.05, FH], [0.0001, FH]];
  const footBase = new THREE.LatheGeometry(footProf.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const leafT = leafGeo(0.042, 0.026, 0.004, { nu: 6, nv: 4, curl: 0.004 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const fx = sx * (W / 2 - FS / 2), fz = sz * (L / 2 - FS / 2);
      out.push(part(footBase.clone(), { pos: [fx, 0, fz] }));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + Math.PI / 6;
        // Leaf frame: length down and out over the bun, z (its face) outward.
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const L1 = new THREE.Vector3(0, -1, 0).addScaledVector(dir, 0.25).normalize();
        const Z1 = dir.clone().addScaledVector(new THREE.Vector3(0, 1, 0), 0.25).normalize();
        const W1 = new THREE.Vector3().crossVectors(Z1, L1).normalize();
        const Zc = new THREE.Vector3().crossVectors(L1, W1);
        const m4 = new THREE.Matrix4().makeBasis(L1, W1, Zc).setPosition(fx + dir.x * 0.034, 0.047, fz + dir.z * 0.034);
        out.push(part(leafT.clone().applyMatrix4(m4)));
      }
    }
  }
  footBase.dispose();
  leafT.dispose();

  // Mercy seat border inside the crown: a beaded edge, a frieze of palmettes and almond buds
  // linked by arcs, rosettes at the corners, then a half-round rail.
  // Lid plane: x along the ark's length (z), y across (x), z up. The frieze stops short of the
  // cherubim's feet at the ends, so the seat around them stays plain.
  {
    const r = new Relief();
    const hu = L / 2, hv = W / 2;
    const ins = (k) => [hu - k, hv - k];
    const rect = (k, rad, pitch, reel = false) => {
      const [a, b] = ins(k);
      r.beadLine(-a, -b, a, -b, rad, pitch, reel);
      r.beadLine(-a, b, a, b, rad, pitch, reel);
      r.beadLine(-a, -b, -a, b, rad, pitch, reel);
      r.beadLine(a, -b, a, b, rad, pitch, reel);
    };
    rect(0.0075, 0.0045, 0.015);
    {
      const [a, b] = ins(0.07);
      r.stem([[-a, -b], [a, -b], [a, b], [-a, b], [-a, -b]], 0.0042, 0.0042, 1); // half-round rail
    }
    for (const su of [-1, 1]) for (const sv of [-1, 1]) r.rosette(su * (hu - 0.04), sv * (hv - 0.04), 0.026, 12, 0.004);
    // Frieze along each edge: position s along the edge, inward direction, keep-out test.
    const edges = [
      { o: [-hu, hv], t: [1, 0], n: [0, -1], len: L },
      { o: [-hu, -hv], t: [1, 0], n: [0, 1], len: L },
      { o: [hu, -hv], t: [0, 1], n: [-1, 0], len: W },
      { o: [-hu, -hv], t: [0, 1], n: [1, 0], len: W },
    ];
    const base = 0.02, pitch = 0.042;
    for (const e of edges) {
      const s0 = 0.08, s1 = e.len - 0.08, n = Math.round((s1 - s0) / pitch);
      const at = (s, k) => [e.o[0] + e.t[0] * s + e.n[0] * k, e.o[1] + e.t[1] * s + e.n[1] * k];
      const ang = Math.atan2(e.n[1], e.n[0]);
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const s = s0 + ((s1 - s0) * i) / n;
        const [x, y] = at(s, base);
        const blocked = e.t[1] !== 0 && Math.abs(y) < 0.12; // under the cherubim's feet
        if (blocked) { prev = null; continue; }
        if (i % 2 === 0) r.palmette(x, y, ang, 0.042);
        else r.bud(x, y, ang, 0.04);
        if (prev !== null) {
          const pts = [];
          for (let j = 0; j <= 8; j++) {
            const f = j / 8, ss = prev + (s - prev) * f, k = base - 0.007 * Math.sin(Math.PI * f);
            pts.push(at(ss, k));
          }
          r.stem(pts, 0.0026, 0.0026, 0.012);
        }
        prev = s;
      }
    }
    const lid = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
      .setPosition(0, SEAT_TOP, 0);
    out.push(r.build(lid));
  }
  return out;
}
