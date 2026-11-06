import * as THREE from 'three';
import { part, merge } from './bronzeParts.js';

// Shared relief ornament helpers for the gold furnishings (ark, table of showbread, altar of
// incense): leaves, stems, beads, rosettes, palmettes, running scrolls, swept mouldings.
// Reliefs are built flat in a local plane (x, y in the plane, z out of the surface) and mapped
// onto a face with a matrix. Ornament sizes are not biblical, so they are given in meters.

export const TAU = Math.PI * 2;
const tmpM = new THREE.Matrix4();

// ---- Relief primitives (local plane, z = out of the surface) ------------------------------

/**
 * A leaf or petal lying on the surface: length along +x from the origin, width along y, domed
 * toward +z with a groove along the midrib. Single-sided (its edges tuck just under the surface).
 */
export function leafGeo(len, wid, h, { nu = 5, nv = 3, blunt = false, curl = 0 } = {}) {
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
export function stemGeo(pts0, r0, r1, radial = 3, step = 0.008) {
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
export function beadProfile(s, reel) {
  if (!reel) return 0.3 + 0.7 * Math.sqrt(Math.max(0, Math.sin(Math.PI * s)));
  if (s < 0.6) return 0.35 + 0.65 * Math.sqrt(Math.max(0, Math.sin((Math.PI * s) / 0.6)));
  const q = (s - 0.6) / 0.4;
  return 0.3 + 0.45 * Math.sqrt(Math.abs(Math.sin(TAU * q)));
}

/**
 * A beaded rod of length len along x, centered on the origin. Half-round (z >= 0) unless full.
 * reel: bead-and-reel instead of plain beads.
 */
export function beadRod(len, r, pitch, { reel = false, full = false, radial = full ? 5 : 3 } = {}) {
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
export function beadRingGeo(R, r, n) {
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
export const domeGeo = (r, h, seg = 8) =>
  new THREE.SphereGeometry(1, seg, 3, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(r, r, h);

/** A flat plate with a lobed (scalloped) outline, n lobes, outer radius R, thickness t. */
export function lobedPlateGeo(R, n, t) {
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
export class Relief {
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
 * rosK: the tendril rosettes' radius as a fraction of the tendril's.
 */
export function runningScroll(rel, map, len, A, waves, stemR, palm = 0, { rosK = 0.24 } = {}) {
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
    rel.rosette(rx, ry, r0 * rosK, 6, r0 * rosK * 0.16);
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
export function sweepRect(prof0, hx, hz) {
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
export function arc(cx, cy, r, a0, a1, n) {
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
export function faceMatrix(nx, nz, d) {
  const N = new THREE.Vector3(nx, 0, nz), U = new THREE.Vector3().crossVectors(Y, N);
  return new THREE.Matrix4().makeBasis(U, Y, N).setPosition(nx * d, 0, nz * d);
}
