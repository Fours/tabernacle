import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { ARK as A, m } from '../config/dimensions.js';
import { GOLD } from './materials.js';
import { part, boxPart, merge } from './bronzeParts.js';
import { box } from './colliders.js';

// The ark of the covenant (Ex 25:10-22; 37:1-9) in the Holy of Holies: a 2.5 x 1.5 x 1.5 cubit
// gold-overlaid chest with a crown around its top, four short feet with a gold ring on each, two
// gold-overlaid poles that stay in the rings, and the pure gold mercy seat (kapporet) resting
// inside the crown with two cherubim of one piece with it, one at each end. The cherubim follow
// the rabbinic tradition of winged figures with childlike faces (Sukkah 5b, Rashi on 25:18):
// here kneeling, facing each other, heads bowed toward the mercy seat, hands joined, and their
// wings raised and spread forward so the tips nearly meet above its center (25:20).
//
// Everything is one merged mesh in the shared GOLD material (one draw call). The cherub's body
// is a signed-distance sculpture baked to a mesh once at load (marching cubes); its wings are
// layered feather blades along a curved wing bone. One cherub is built and the other is the
// same geometry turned 180 degrees. Local frame: origin on the floor under the ark's center.

const hb = (n) => m(n * A.hb);
const L = m(A.length), W = m(A.width), H = m(A.height);
const KT = hb(A.mercySeat), FH = m(A.footHeight);
const CW = m(A.crownWidth), C_BELOW = m(A.crownBelow), C_LIP = m(A.crownLip);
const RING_R = m(A.ringRadius), RING_T = m(A.ringTube), POLE_R = m(A.poleRadius);
const ringZ = L / 2 + RING_R + RING_T * 0.3; // pole axis, just outside the N and S faces
const ringX = W / 2 - m(A.ringInset);
const poleY = m(A.ringHeight) - (RING_R - RING_T) + POLE_R; // the pole rests in the rings
const SEAT_TOP = H + KT;

// ---- Chest, crown, feet, rings, poles, mercy seat ------------------------------------------

function chestParts() {
  const g = [];
  // Body (gold-overlaid acacia) on four short, slightly tapered square feet.
  g.push(boxPart(W, H - FH, L, [0, (H + FH) / 2, 0]));
  const fs = m(A.footSize);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.CylinderGeometry(fs / Math.SQRT2, fs * 0.82 / Math.SQRT2, FH, 4).rotateY(Math.PI / 4);
      g.push(part(foot, { pos: [sx * (W / 2 - fs / 2), FH / 2, sz * (L / 2 - fs / 2)] }));
    }
  }
  // A plain band around the foot of the body.
  const bp = m(0.02), bh = m(0.06);
  for (const s of [-1, 1]) {
    g.push(boxPart(W + 2 * bp, bh, bp, [0, FH + bh / 2, s * (L / 2 + bp / 2)]));
    g.push(boxPart(bp, bh, L, [s * (W / 2 + bp / 2), FH + bh / 2, 0]));
  }
  // Crown (zer) around the top: a band projecting from the sides, rising above the rim so the
  // mercy seat sits inside it, with a rounded roll along its top and a bead along its foot.
  const y0 = H - C_BELOW, y1 = SEAT_TOP + C_LIP, ch = y1 - y0, cy = (y0 + y1) / 2;
  const roll = CW * 0.55, bead = m(0.025);
  for (const s of [-1, 1]) {
    g.push(boxPart(W + 2 * CW, ch, CW, [0, cy, s * (L / 2 + CW / 2)]));
    g.push(boxPart(CW, ch, L, [s * (W / 2 + CW / 2), cy, 0]));
    const rx = new THREE.CylinderGeometry(roll, roll, W + 2 * CW + 2 * roll * 0.6, 10).rotateZ(Math.PI / 2);
    g.push(part(rx, { pos: [0, y1, s * (L / 2 + CW - roll * 0.4)] }));
    const rz = new THREE.CylinderGeometry(roll, roll, L + 2 * CW + 2 * roll * 0.6, 10).rotateX(Math.PI / 2);
    g.push(part(rz, { pos: [s * (W / 2 + CW - roll * 0.4), y1, 0] }));
    const bx = new THREE.CylinderGeometry(bead, bead, W + 2 * CW, 8).rotateZ(Math.PI / 2);
    g.push(part(bx, { pos: [0, y0 + bead * 0.3, s * (L / 2 + CW)] }));
    const bz = new THREE.CylinderGeometry(bead, bead, L + 2 * CW, 8).rotateX(Math.PI / 2);
    g.push(part(bz, { pos: [s * (W / 2 + CW), y0 + bead * 0.3, 0] }));
  }
  // Mercy seat: a slab of pure gold the size of the ark, one handbreadth thick, inside the crown.
  g.push(boxPart(W, KT, L, [0, H + KT / 2, 0]));
  // A gold ring on each foot (on the N and S faces), held by a short staple, and the two poles
  // running E-W through them. Their ends point east, toward the veil (1 Kgs 8:8).
  const ry = m(A.ringHeight);
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      g.push(part(new THREE.TorusGeometry(RING_R, RING_T, 8, 22).rotateY(Math.PI / 2), { pos: [sx * ringX, ry, sz * ringZ] }));
      g.push(boxPart(RING_T * 2.2, RING_T * 3, RING_T * 2.4, [sx * ringX, ry + RING_R * 0.55, sz * (L / 2 + RING_T)]));
    }
    const e = m(A.poleEast), w = m(A.poleWest);
    g.push(part(new THREE.CylinderGeometry(POLE_R, POLE_R, e + w, 12).rotateZ(Math.PI / 2), { pos: [(e - w) / 2, poleY, sz * ringZ] }));
    for (const x of [e, -w]) {
      const cap = new THREE.CylinderGeometry(POLE_R * 1.15, POLE_R * 1.15, m(0.08), 12).rotateZ(Math.PI / 2);
      g.push(part(cap, { pos: [x - Math.sign(x) * m(0.04), poleY, sz * ringZ] }));
    }
  }
  return g;
}

// ---- Cherub body: signed-distance sculpture -----------------------------------------------
// Meters, cherub-local frame: y up from the mercy seat's top, +z the way the figure faces
// (toward the other cherub), knees on the seat at z = 0, shins and feet behind (-z).

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const smax = (a, b, k) => -smin(-a, -b, k);
/** Capsule a-b whose radius tapers from ra to rb. */
function cap(x, y, z, ax, ay, az, bx, by, bz, ra, rb = ra) {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const h = clamp01((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz));
  const qx = px - dx * h, qy = py - dy * h, qz = pz - dz * h;
  return Math.sqrt(qx * qx + qy * qy + qz * qz) - (ra + (rb - ra) * h);
}
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const k1 = Math.sqrt((px * px) / (rx * rx) + (py * py) / (ry * ry) + (pz * pz) / (rz * rz));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

// Head: a child's proportions (large rounded cranium, full cheeks, small chin and nose), bowed
// toward the mercy seat, the eyes closed. Head-local axes: hx right, hy up, hz forward.
const HEAD = [0, 0.462, 0.014];
const BOW = 0.5; // rad
const CB = Math.cos(BOW), SB = Math.sin(BOW);
function head(x, y, z) {
  const qx = x - HEAD[0], qy = y - HEAD[1], qz = z - HEAD[2];
  const hx = Math.abs(qx);
  const hy = qy * CB + qz * SB;
  const hz = -qy * SB + qz * CB;
  let d = ell(hx, hy, hz, 0, 0.008, -0.006, 0.058, 0.062, 0.064); // cranium
  d = smin(d, ell(hx, hy, hz, 0, -0.024, 0.018, 0.046, 0.042, 0.043), 0.02); // face
  d = smin(d, ell(hx, hy, hz, 0.026, -0.022, 0.034, 0.024, 0.021, 0.022), 0.012); // cheeks
  d = smin(d, ell(hx, hy, hz, 0, -0.049, 0.032, 0.018, 0.014, 0.016), 0.012); // chin
  d = smin(d, ell(hx, hy, hz, 0, -0.008, 0.061, 0.008, 0.013, 0.01), 0.006); // nose
  d = smin(d, ell(hx, hy, hz, 0.057, -0.006, -0.004, 0.008, 0.016, 0.011), 0.006); // ears
  // Eye sockets with closed lids, and a soft mouth line.
  d = smax(d, -ell(hx, hy, hz, 0.021, 0.004, 0.06, 0.012, 0.009, 0.01), 0.008);
  d = smin(d, ell(hx, hy, hz, 0.021, 0.002, 0.052, 0.011, 0.007, 0.008), 0.004);
  d = smax(d, -ell(hx, hy, hz, 0, -0.033, 0.06, 0.011, 0.0025, 0.006), 0.004);
  // Short curly hair: a raised cap behind a hairline over the forehead and down to the ears.
  const mask = sstep(-0.006, 0.006, hy - (0.03 - 0.9 * (0.055 - hz)));
  if (mask > 0) {
    const curls = Math.sin(hx * 290 + 1.3) * Math.sin(hy * 290) * Math.sin(hz * 290 + 0.7);
    d -= mask * (0.006 + 0.0035 * curls);
  }
  return d;
}

function cherubSDF(x, y, z) {
  const ax = Math.abs(x);
  // Legs, kneeling: shins and feet along the seat behind the knees, thighs rising to the hips.
  let d = cap(ax, y, z, 0.05, 0.032, 0, 0.045, 0.03, -0.15, 0.031, 0.027);
  d = smin(d, cap(ax, y, z, 0.045, 0.03, -0.15, 0.04, 0.02, -0.205, 0.024, 0.016), 0.015);
  d = smin(d, cap(ax, y, z, 0.05, 0.045, 0, 0.056, 0.2, -0.05, 0.037, 0.05), 0.02);
  // Tunic skirt from the waist to the knees, with soft vertical folds.
  let skirt = cap(x, y, z, 0, 0.245, -0.05, 0, 0.09, -0.02, 0.074, 0.096);
  skirt += 0.003 * Math.sin(Math.atan2(x, z + 0.03) * 11) * sstep(0.24, 0.12, y);
  d = smin(d, skirt, 0.02);
  // Torso: hips, belly, chest, shoulders; wing roots on the shoulder blades.
  d = smin(d, ell(x, y, z, 0, 0.225, -0.05, 0.085, 0.06, 0.062), 0.03);
  d = smin(d, ell(x, y, z, 0, 0.275, -0.04, 0.074, 0.06, 0.06), 0.03);
  d = smin(d, ell(x, y, z, 0, 0.335, -0.035, 0.086, 0.07, 0.058), 0.03);
  d = smin(d, ell(x, y, z, 0, 0.372, -0.04, 0.098, 0.03, 0.05), 0.025);
  d = smin(d, ell(ax, y, z, 0.05, 0.36, -0.083, 0.042, 0.05, 0.028), 0.02);
  // Neck, arms, and hands joined (palms together) beneath the bowed chin.
  d = smin(d, cap(x, y, z, 0, 0.37, -0.038, 0, 0.42, -0.012, 0.025), 0.02);
  d = smin(d, cap(ax, y, z, 0.088, 0.365, -0.04, 0.084, 0.28, -0.005, 0.024, 0.022), 0.015);
  d = smin(d, cap(ax, y, z, 0.084, 0.28, -0.005, 0.02, 0.33, 0.05, 0.022, 0.017), 0.012);
  d = smin(d, cap(ax, y, z, 0.011, 0.33, 0.052, 0.006, 0.39, 0.075, 0.016, 0.01), 0.01);
  return smin(d, head(x, y, z), 0.02);
}

/** Bake the body SDF to a mesh with marching cubes. Returns a BufferGeometry (position, normal). */
function bakeBody(res = 112) {
  const C = [0, 0.27, -0.055], HALF = 0.29; // sampling cube (m)
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 200000);
  mc.isolation = 0;
  const f = mc.field, n = res, n2 = n * n, vox = (2 * HALF) / n;
  const toW = (i, c) => c + ((i - n / 2) / (n / 2)) * HALF;
  // Evaluate in 4^3 blocks; blocks far from the surface are filled with their center value.
  const B = 4, far = 1.6 * vox * B * 0.87 + 3 * vox;
  for (let bz = 0; bz < n; bz += B) {
    for (let by = 0; by < n; by += B) {
      for (let bx = 0; bx < n; bx += B) {
        const dc = cherubSDF(toW(bx + B / 2 - 0.5, C[0]), toW(by + B / 2 - 0.5, C[1]), toW(bz + B / 2 - 0.5, C[2]));
        const full = Math.abs(dc) < far;
        for (let k = bz; k < Math.min(bz + B, n); k++) {
          for (let j = by; j < Math.min(by + B, n); j++) {
            for (let i = bx; i < Math.min(bx + B, n); i++) {
              let d = full ? cherubSDF(toW(i, C[0]), toW(j, C[1]), toW(k, C[2])) : dc;
              // Close the figure where it meets the mercy seat, and keep the cube's border empty.
              if (i < 2 || j < 2 || k < 2 || i > n - 4 || j > n - 4 || k > n - 4) d = Math.max(d, vox);
              f[i + j * n + k * n2] = -d;
            }
          }
        }
      }
    }
  }
  mc.update();
  const count = mc.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const nx = mc.normalArray[i * 3], ny = mc.normalArray[i * 3 + 1], nz = mc.normalArray[i * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    for (let a = 0; a < 3; a++) pos[i * 3 + a] = mc.positionArray[i * 3 + a] * HALF + C[a];
    nor.set([nx / l, ny / l, nz / l], i * 3);
  }
  mc.geometry.dispose();
  mc.material.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// ---- Cherub wings: layered feathers -------------------------------------------------------

/**
 * One feather blade in its own frame: length along +x (0..len), width along z, a raised
 * midrib toward +y, curling slightly toward -y at the tip. A closed thin shell (top + bottom).
 */
function featherGeometry(len, width) {
  const nl = 6, nw = 4, th = 0.0028, rib = 0.0022, curl = 0.08;
  const make = (top) => {
    const pos = [], idx = [];
    for (let i = 0; i <= nl; i++) {
      const t = i / nl;
      const w = width * 0.5 * (0.3 + 0.7 * sstep(0, 0.35, t)) * Math.sqrt(Math.max(0, 1 - t * t * t));
      for (let j = 0; j <= nw; j++) {
        const v = (j / nw) * 2 - 1;
        let y = rib * (1 - Math.abs(v)) - curl * t * t * len;
        if (!top) y -= th * (1 - v * v) * (1 - t * 0.6);
        pos.push(t * len, y, v * w);
      }
    }
    for (let i = 0; i < nl; i++) {
      for (let j = 0; j < nw; j++) {
        const a = i * (nw + 1) + j, b = a + 1, c = a + nw + 1, d = c + 1;
        if (top) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g.toNonIndexed();
  };
  return [make(true), make(false)];
}

// Wing bone (leading edge) for the right wing (x > 0); the left mirrors it.
const WING = [
  [0.055, 0.38, -0.095],
  [0.14, 0.47, -0.115],
  [0.21, 0.575, -0.07],
  [0.235, 0.65, 0.03],
  [0.22, 0.705, 0.13],
  [0.19, 0.722, 0.2],
];
// Feather rows from the flight feathers (longest, innermost layer) to the small coverts over
// the bone. len: feather length (m) along the wing; fan: how far the feathers sweep from
// trailing straight back to pointing along the wing toward the tip (or th: a fixed sweep).
const ROWS = [
  { n: 20, u0: 0.02, u1: 1, len: (u) => 0.15 + 0.07 * sstep(0.3, 0.9, u) - 0.03 * sstep(0.1, 0.0, u), w: 0.04, out: 0, fan: 1.15 },
  { n: 16, u0: 0.0, u1: 0.96, len: (u) => 0.085 + 0.04 * sstep(0.3, 0.85, u), w: 0.038, out: 0.0045, fan: 1.05 },
  { n: 13, u0: 0.0, u1: 0.92, len: (u) => 0.045 + 0.015 * u, w: 0.032, out: 0.009, fan: 0.95 },
  // Marginal coverts sheathing the bone from the shoulder to near the tip, on both faces of
  // the wing: short blades lying along the bone toward the tip (th: fixed sweep, rad), so the
  // root reads as feathered rather than as a bare arc.
  { n: 24, u0: 0.0, u1: 0.88, len: (u) => 0.065 - 0.03 * u, w: 0.04, out: 0.011, th: 1.25 },
  { n: 24, u0: 0.02, u1: 0.9, len: (u) => 0.06 - 0.03 * u, w: 0.038, out: -0.011, th: 1.3 },
];

function wingParts(side) {
  const curve = new THREE.CatmullRomCurve3(WING.map(([x, y, z]) => new THREE.Vector3(side * x, y, z)));
  const out = [];
  // Bone: a tapered tube.
  const ts = 28, rs = 8;
  const tube = new THREE.TubeGeometry(curve, ts, 1, rs, false);
  const p = tube.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= ts; i++) {
    curve.getPointAt(i / ts, c);
    const r = THREE.MathUtils.lerp(0.016, 0.006, i / ts);
    for (let j = 0; j <= rs; j++) {
      const k = i * (rs + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  tube.computeVertexNormals();
  out.push(tube);
  const T = new THREE.Vector3(), D0 = new THREE.Vector3(), D = new THREE.Vector3(), N = new THREE.Vector3();
  const Z = new THREE.Vector3(), P = new THREE.Vector3();
  const base = new THREE.Vector3(side * 0.22, -1, -0.3).normalize(); // down, back, a little out
  const mat = new THREE.Matrix4();
  ROWS.forEach((row, ri) => {
    for (let i = 0; i < row.n; i++) {
      const u = THREE.MathUtils.lerp(row.u0, row.u1, i / (row.n - 1));
      curve.getPointAt(u, P);
      curve.getTangentAt(u, T);
      D0.copy(base).addScaledVector(T, -base.dot(T)).normalize();
      const th = row.th ?? row.fan * Math.pow(u, 1.8) + 0.08;
      D.copy(D0).multiplyScalar(Math.cos(th)).addScaledVector(T, Math.sin(th)).normalize();
      N.crossVectors(T, D0).multiplyScalar(side).normalize();
      // Shingle: each blade tips slightly about its own axis so its tip-ward edge rides over
      // the next feather.
      N.applyAxisAngle(D, side * 0.14).normalize();
      N.addScaledVector(D, -N.dot(D)).normalize();
      Z.crossVectors(D, N);
      const len = row.len(u) * (1 + 0.06 * Math.sin(i * 2.7 + ri));
      const root = P.clone().addScaledVector(N, row.out + 0.002 * (i % 2)).addScaledVector(D, -0.008);
      mat.makeBasis(D, N, Z).setPosition(root);
      for (const g of featherGeometry(len, row.w)) out.push(g.applyMatrix4(mat));
    }
  });
  return out;
}

function cherubParts() {
  return [bakeBody(), ...wingParts(1), ...wingParts(-1)];
}

// ---- Assembly -----------------------------------------------------------------------------

export function createArk() {
  const group = new THREE.Group();
  group.name = 'ark';
  group.position.set(m(A.x), 0, m(A.z));

  const parts = chestParts();
  // The two cherubim on the mercy seat, facing each other along the ark's (N-S) length.
  const zc = L / 2 - hb(A.cherubKnees);
  const cherub = merge(cherubParts().map((g) => part(g)));
  for (const s of [-1, 1]) {
    const g = cherub.clone();
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(s < 0 ? 0 : Math.PI).setPosition(0, SEAT_TOP, s * zc));
    parts.push(g);
  }
  cherub.dispose();

  const mesh = new THREE.Mesh(merge(parts), GOLD);
  mesh.name = 'ark-gold';
  group.add(mesh);

  const cx = m(A.x), cz = m(A.z);
  const e = m(A.poleEast), w = m(A.poleWest);
  group.userData.colliders = [
    box(cx, cz, W + 2 * CW, L + 2 * CW),
    ...[-1, 1].map((sz) => box(cx + (e - w) / 2, cz + sz * ringZ, e + w, 2 * (RING_R + RING_T))),
  ];
  group.userData.dispose = () => mesh.geometry.dispose();
  return group;
}
