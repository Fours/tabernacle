import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURTYARD as C, m } from '../config/dimensions.js';
import { createTentClothTexture } from './textiles.js';
import { obb, grid } from './colliders.js';
import { courtDistance } from './groundScatter.js';

// The camp of Israel around the Tabernacle (Num 2-3), thousands of cheap tents in six draws.
//
// Layout: distances are measured from the courtyard rectangle as d = max(|x| - HX, |z| - HZ),
// so the bands are rectangles around the court. The four sides are split by diagonal lanes
// running out from the court's corners. The Levites camp in an inner band (Num 3:23-38): Moses,
// Aaron and the priests east, Gershon west, Kohath south, Merari north. Beyond an open band
// the four tribal camps (Num 2): Judah east, Reuben south, Ephraim west, Dan north, each split
// into its three tribes by two lanes (the camp's leader in the middle), with cross streets.
// The east approach to the gate stays open all the way out. The Levites stand in rows along
// the court's sides, facing it; the tribes in family clusters (24 m cells) of rows, each
// cluster on its own axis. Density follows each tribe's census (Num 2) a little, and a noise
// field thins or empties some clusters, leaving open ground.
//
// Tents: 3 procedural variants, near (detailed) and far (coarse) LOD, split statically by
// distance from the court (the camera spends its time near it). One shared cloth texture;
// per-tent instanceColor (black goat hair .. faded undyed cloth). No lights, no shadow
// casting; near tents receive the altar fire's shadows. All tents collide through one
// spatial-grid collider (colliders.js grid/obb).

const HX = m(C.length / 2);
const HZ = m(C.width / 2);
const TILE = 1.5; // m per texture tile

export const CAMP = {
  seed: 4011,
  levite: [10, 30], // band of the Levites' tents (d, m): nearest tents ~10 m outside the hangings
  tribes: 36, // tribal camps start here (d, m)
  edge: 286, // nothing beyond |x|, |z| = edge (the ground is ±300 m)
  diagLane: 9, // |dx - dz| below this is a lane between the four sides
  eastLane: 7, // the gate's approach: |z| < eastLane for x > HX stays open
  tribeLane: 3.5, // half width of the lanes between tribes
  streets: [105, 170, 235], // cross streets in the tribal camps (d, m)
  streetHalf: 2.5,
  gap: 0.5, // clear ground kept around each tent's cloth (m, each side)
  nearLod: 60, // court distance (m) below which tents use the detailed geometry
  cluster: 24, // family-cluster cells (m)
  keepClear: [[130, 70, 5]], // free-camera spots at eye height (firepillarfar) [x, z, r]
};

// Sides: u runs across the side (E/W: u = z; N/S: u = x), tribes in order of increasing u,
// leader in the middle. Census figures from Num 2.
const SIDES = {
  E: { levites: 'Moses, Aaron and the priests', lev: 0.8, tribes: [['Issachar', 54400], ['Judah', 74600], ['Zebulun', 57400]], face: [-1, 0] },
  S: { levites: 'Kohath', lev: 0.9, tribes: [['Gad', 45650], ['Reuben', 46500], ['Simeon', 59300]], face: [0, -1] },
  W: { levites: 'Gershon', lev: 0.85, tribes: [['Benjamin', 35400], ['Ephraim', 40500], ['Manasseh', 32200]], face: [1, 0] },
  N: { levites: 'Merari', lev: 0.75, tribes: [['Naphtali', 53400], ['Dan', 62700], ['Asher', 41500]], face: [0, 1] },
};
const SIDE_KEYS = ['E', 'S', 'W', 'N'];

/** Zone id at (x, z): 0 = none (lane, court, beyond the edge), 1..4 Levites, 5..16 tribes. */
function zoneAt(x, z) {
  const K = CAMP;
  if (Math.abs(x) > K.edge || Math.abs(z) > K.edge) return 0;
  const dx = Math.abs(x) - HX, dz = Math.abs(z) - HZ;
  const d = Math.max(dx, dz);
  if (d < K.levite[0]) return 0;
  if (Math.abs(dx - dz) < K.diagLane) return 0;
  if (x > 0 && Math.abs(z) < K.eastLane) return 0;
  const ew = dx > dz;
  const s = ew ? (x > 0 ? 0 : 2) : (z > 0 ? 1 : 3);
  if (d <= K.levite[1]) return 1 + s;
  if (d < K.tribes) return 0;
  for (const st of K.streets) if (Math.abs(d - st) < K.streetHalf) return 0;
  // Tribes side by side across the side, split by two straight lanes a third of the way out
  // toward the corners: the leader's tribe takes the middle, nearest the court.
  const u = ew ? z : x;
  const B = K.edge / 3;
  if (Math.abs(Math.abs(u) - B) < K.tribeLane) return 0;
  return 5 + s * 3 + (u < -B ? 0 : u > B ? 2 : 1);
}

function zoneDensity(id) {
  if (id <= 4) return SIDES[SIDE_KEYS[id - 1]].lev;
  const t = id - 5;
  const pop = SIDES[SIDE_KEYS[Math.floor(t / 3)]].tribes[t % 3][1];
  return 0.75 + 0.25 * (pop / 74600);
}

// ---------------------------------------------------------------------------------------
// Seeded randomness and value noise

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(i, j, seed) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, seed), b = hash2(i + 1, j, seed);
  const c = hash2(i, j + 1, seed), d = hash2(i + 1, j + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------
// Geometry. Parts carry an `aKind` attribute: 0 cloth, 1 wood (poles), 2 rope.

const INSIDE = new THREE.Vector3(0, 0.4, 0); // faces are wound to face away from this point

/**
 * A surface through a grid of points (rows of equal length), indexed, uv in metres / TILE
 * along rows (u) and columns (v). Triangles are wound to face away from the tent's inside
 * so the shader can darken the inner (back) faces.
 */
function surface(rows, kind = 0) {
  const nr = rows.length, nc = rows[0].length;
  const pos = [], uv = [], idx = [];
  const P = (r, c) => rows[r][c];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const vAcc = new Array(nc).fill(0);
  for (let r = 0; r < nr; r++) {
    let u = 0;
    for (let c = 0; c < nc; c++) {
      if (c > 0) u += dist(P(r, c - 1), P(r, c));
      if (r > 0) vAcc[c] += dist(P(r - 1, c), P(r, c));
      pos.push(...P(r, c));
      uv.push(u / TILE, vAcc[c] / TILE);
    }
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c3 = new THREE.Vector3();
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const tri = (i0, i1, i2) => {
    a.fromArray(pos, i0 * 3);
    b.fromArray(pos, i1 * 3);
    c3.fromArray(pos, i2 * 3);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c3, a));
    if (n.lengthSq() < 1e-10) return; // degenerate
    const cen = a.add(b).add(c3).multiplyScalar(1 / 3).sub(INSIDE);
    if (n.dot(cen) >= 0) idx.push(i0, i1, i2);
    else idx.push(i0, i2, i1);
  };
  for (let r = 0; r < nr - 1; r++) {
    for (let c = 0; c < nc - 1; c++) {
      const i = r * nc + c;
      tri(i, i + 1, i + nc);
      tri(i + 1, i + nc + 1, i + nc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(new Array(nr * nc).fill(kind), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A thin 4-sided prism (pole, rope) from a to b, sides only. */
function prism(a, b, r, kind) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A).normalize();
  const ref = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(d, ref).normalize().multiplyScalar(r);
  const w = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(r);
  const ring = (P) => [P.clone().add(u), P.clone().add(w), P.clone().sub(u), P.clone().sub(w)].map((v) => v.toArray());
  const ra = ring(A), rb = ring(B);
  // Close the loop: rows = [ring at A, ring at B], 5 columns (first repeated).
  const g = surface([[...ra, ra[0]], [...rb, rb[0]]], kind);
  // Winding check against INSIDE is meaningless for a prism: wind outward from its own axis.
  const p = g.getAttribute('position');
  const idx = g.getIndex().array;
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    v0.fromBufferAttribute(p, idx[i]);
    v1.fromBufferAttribute(p, idx[i + 1]);
    v2.fromBufferAttribute(p, idx[i + 2]);
    const n = new THREE.Vector3().crossVectors(v1.clone().sub(v0), v2.clone().sub(v0));
    const out = v0.clone().add(v1).add(v2).multiplyScalar(1 / 3).sub(mid);
    out.addScaledVector(d, -out.dot(d));
    if (n.dot(out) < 0) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  g.computeVertexNormals();
  return g;
}

const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

/**
 * A roof held up by rows of poles: rows (z, height) linearly interpolated across, sagging
 * between pole columns along x, a bump where each pole pushes the cloth, dropping past the
 * end poles to the end walls.
 */
function poleRoof({ halfL, cols, rows, sag, bump, endDrop }) {
  const xEnd = cols[cols.length - 1];
  const sp = cols[1] - cols[0];
  const base = (z) => {
    for (let i = 0; i < rows.length - 1; i++) {
      const [z0, h0] = rows[i], [z1, h1] = rows[i + 1];
      if (z <= z1 || i === rows.length - 2) return h0 + ((h1 - h0) * (z - z0)) / (z1 - z0);
    }
    return rows[0][1];
  };
  return (x, z) => {
    let h = base(z);
    const ax = Math.abs(x);
    if (ax <= xEnd) h -= sag * Math.sin((Math.PI * (x - cols[0])) / sp) ** 2;
    else h -= endDrop * ((ax - xEnd) / (halfL - xEnd));
    for (const cx of cols) {
      for (const [rz] of rows) {
        const d2 = (x - cx) ** 2 + (z - rz) ** 2;
        h += bump * Math.exp(-d2 / 0.12);
      }
    }
    return h;
  };
}

const roofRows = (xs, zs, h) => zs.map((z) => xs.map((x) => [x, h(x, z), z]));
// A hanging wall below a roof edge: top = edge points, bottom pushed out by `out` at height y0.
const wall = (edge, out, y0 = 0) => surface([edge, edge.map(([x, , z]) => [x + out[0], y0, z + out[1]])]);

/** Small low ridge tent: ridge along z, door (half open) at +z. ~2.8 x 2.3 m, 1.35 m high. */
function smallTent(lod) {
  const L2 = 1.4, W2 = 1.15, R = 1.35, E = 0.05;
  const ridge = (x) => R - 0.1 * (1 - (x / L2) ** 2);
  const h = (x, z) => {
    const a = Math.abs(z) / W2;
    return E + (ridge(x) - E) * (1 - a) - 0.05 * Math.sin(Math.PI * a);
  };
  const near = lod === 'near';
  const xs = near ? range(-L2, L2, 4) : [-L2, L2];
  const zs = near ? range(-W2, W2, 6) : [-W2, 0, W2];
  const parts = [surface(roofRows(xs, zs, h))];
  const gable = (x, zsel, out) => surface([zsel.map((z) => [x, h(x, z), z]), zsel.map((z) => [x + out, 0, z])]);
  parts.push(gable(-L2, zs, -0.05));
  const cloth = [];
  if (near) {
    parts.push(gable(L2, zs.filter((z) => z <= 1e-6), 0.05));
    // The other door flap pulled back and pegged out.
    parts.push(surface([[[L2, ridge(L2), 0], [L2, E, W2]], [[L2 + 0.45, 0, 0.75], [L2 + 0.45, 0, 0.75]]]));
    cloth.push(...parts);
    for (const sx of [-1, 1]) {
      parts.push(prism([sx * L2, 0, 0], [sx * L2, ridge(L2) + 0.08, 0], 0.025, 1));
      parts.push(prism([sx * L2, R + 0.05, 0], [sx * (L2 + 0.8), 0, 0], 0.01, 2));
    }
  } else {
    parts.push(gable(L2, zs, 0.05));
  }
  return finish(parts, near ? cloth : parts, -Math.PI / 2);
}

/** Medium black goat-hair tent: 3 x 3 poles, sagging roof, open front with a propped flap. */
function mediumTent(lod) {
  const halfL = 2.8, D2 = 1.8;
  const cols = [-1.9, 0, 1.9];
  const h = poleRoof({ halfL, cols, rows: [[-D2, 1.2], [0, 1.72], [D2, 1.48]], sag: 0.12, bump: 0.14, endDrop: 0.3 });
  const near = lod === 'near';
  const xs = near ? [-halfL, -2.35, ...range(-1.9, 1.9, 8), 2.35, halfL] : [-halfL, -1.9, 0, 1.9, halfL];
  const zs = near ? range(-D2, D2, 6) : [-D2, 0, D2];
  const parts = [surface(roofRows(xs, zs, h))];
  const edge = (z, xsel) => xsel.map((x) => [x, h(x, z), z]);
  parts.push(wall(edge(-D2, xs), [0, -0.25]));
  // End walls on the rear half only.
  const zRear = zs.filter((z) => z <= 1e-6);
  for (const sx of [-1, 1]) parts.push(wall(zRear.map((z) => [sx * halfL, h(sx * halfL, z), z]), [sx * 0.2, 0]));
  // Front flap propped out as an awning, pitched slightly up.
  const xa = xs.filter((x) => Math.abs(x) <= 1.9 + 1e-6);
  const fz = D2 + 0.9;
  const fh = (x) => h(x, D2) + 0.06;
  parts.push(surface([edge(D2, xa), xa.map((x) => [x, fh(x), fz])]));
  const cloth = [...parts];
  if (near) {
    for (const x of cols) {
      parts.push(prism([x, 0, 0], [x, h(x, 0), 0], 0.035, 1));
      parts.push(prism([x, 0, D2], [x, h(x, D2), D2], 0.03, 1));
    }
    for (const sx of [-1, 1]) {
      parts.push(prism([sx * 1.9, 0, fz], [sx * 1.9, fh(sx * 1.9) + 0.05, fz], 0.03, 1));
      parts.push(prism([sx * 1.9, fh(sx * 1.9), fz], [sx * 2.5, 0, fz + 0.8], 0.01, 2));
      parts.push(prism([sx * halfL, h(sx * halfL, -D2), -D2], [sx * 3.5, 0, -2.6], 0.01, 2));
      parts.push(prism([sx * halfL, h(sx * halfL, 0), 0], [sx * 3.8, 0, 0], 0.01, 2));
    }
  }
  return finish(parts, cloth, 0);
}

/** Large multi-pole family tent: 3 x 5 poles, side wall down in part, front partly open. */
function largeTent(lod) {
  const halfL = 4.6, D2 = 2.3;
  const cols = [-3.6, -1.8, 0, 1.8, 3.6];
  const h = poleRoof({ halfL, cols, rows: [[-D2, 1.3], [0, 1.9], [D2, 1.6]], sag: 0.14, bump: 0.15, endDrop: 0.35 });
  const near = lod === 'near';
  const xs = near ? [-halfL, -4.1, ...range(-3.6, 3.6, 16), 4.1, halfL] : [-halfL, -3.6, -1.8, 0, 1.8, 3.6, halfL];
  const zs = near ? range(-D2, D2, 6) : [-D2, 0, D2];
  const parts = [surface(roofRows(xs, zs, h))];
  const edge = (z, xsel) => xsel.map((x) => [x, h(x, z), z]);
  parts.push(wall(edge(-D2, xs), [0, -0.25]));
  for (const sx of [-1, 1]) parts.push(wall(zs.map((z) => [sx * halfL, h(sx * halfL, z), z]), [sx * 0.2, 0]));
  // Front: west bays let down to the ground, east bays half down, the middle rolled up open.
  parts.push(wall(edge(D2, xs.filter((x) => x <= -1.8 + 1e-6)), [0, 0.2]));
  parts.push(wall(edge(D2, xs.filter((x) => x >= 1.8 - 1e-6)), [0, 0.08], 0.8));
  const cloth = [...parts];
  if (near) {
    // The rolled-up wall along the open bays.
    const xr = range(-1.8, 1.8, 4);
    for (let i = 0; i < xr.length - 1; i++) {
      parts.push(prism([xr[i], h(xr[i], D2) - 0.1, D2 + 0.03], [xr[i + 1], h(xr[i + 1], D2) - 0.1, D2 + 0.03], 0.07, 0));
    }
    for (const x of cols) {
      parts.push(prism([x, 0, 0], [x, h(x, 0), 0], 0.04, 1));
      parts.push(prism([x, 0, D2], [x, h(x, D2), D2], 0.035, 1));
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) parts.push(prism([sx * halfL, h(sx * halfL, sz * D2), sz * D2], [sx * 5.4, 0, sz * 3.1], 0.01, 2));
      parts.push(prism([sx * 1.8, h(sx * 1.8, D2), D2], [sx * 1.8, 0, 3.4], 0.01, 2));
      parts.push(prism([sx * 1.8, h(sx * 1.8, -D2), -D2], [sx * 1.8, 0, -3.4], 0.01, 2));
    }
  }
  return finish(parts, cloth, 0);
}

/** Merge parts; return the geometry and the cloth footprint (local rect, metres). */
function finish(parts, clothParts, rotY) {
  const geo = mergeGeometries(parts);
  const box = new THREE.Box3();
  for (const p of clothParts) {
    p.computeBoundingBox();
    box.union(p.boundingBox);
  }
  if (rotY) {
    geo.rotateY(rotY);
    box.applyMatrix4(new THREE.Matrix4().makeRotationY(rotY));
  }
  for (const p of parts) p.dispose();
  return { geo, rect: [box.min.x, box.max.x, box.min.z, box.max.z] };
}

// goatHair: share of tents of this kind in black goat hair (the rest undyed cloth). Rows are
// either of small tents or of the bigger ones (60% medium, 40% large).
const VARIANTS = [
  { name: 'small', build: smallTent, goatHair: 0.45 },
  { name: 'medium', build: mediumTent, goatHair: 0.85 },
  { name: 'large', build: largeTent, goatHair: 0.7 },
];

// ---------------------------------------------------------------------------------------
// Material: cloth texture x instance colour; poles and ropes keep their own colours; the
// inner (back) faces of the cloth are darker (shade under the roof).

function tentMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    map: createTentClothTexture(),
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKind;\nvarying float vKind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = aKind;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKind;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vKind > 1.5) diffuseColor.rgb = vec3(0.30, 0.26, 0.20);
        else if (vKind > 0.5) diffuseColor.rgb = vec3(0.085, 0.06, 0.04);
        else if (!gl_FrontFacing) diffuseColor.rgb *= 0.4;`,
      );
  };
  mat.customProgramCacheKey = () => 'camp-tent-v1';
  return mat;
}

// ---------------------------------------------------------------------------------------
// Placement

/** Oriented rect from a tent: centre, axes, half extents (cloth rect + margin). */
function tentRect(t, rect, margin) {
  const [x0, x1, z0, z1] = rect;
  const s = t.s;
  const lcx = ((x0 + x1) / 2) * s, lcz = ((z0 + z1) / 2) * s;
  const c = Math.cos(t.yaw), sn = Math.sin(t.yaw);
  return {
    x: t.x + lcx * c + lcz * sn,
    z: t.z - lcx * sn + lcz * c,
    c, s: sn,
    hx: ((x1 - x0) / 2) * s + margin,
    hz: ((z1 - z0) / 2) * s + margin,
  };
}
const rectCorners = (r) => [
  [r.x + r.hx * r.c + r.hz * r.s, r.z - r.hx * r.s + r.hz * r.c],
  [r.x - r.hx * r.c + r.hz * r.s, r.z + r.hx * r.s + r.hz * r.c],
  [r.x - r.hx * r.c - r.hz * r.s, r.z + r.hx * r.s - r.hz * r.c],
  [r.x + r.hx * r.c - r.hz * r.s, r.z - r.hx * r.s - r.hz * r.c],
];
// Separating-axis test for two oriented rects.
function rectsOverlap(a, b) {
  const axes = [[a.c, -a.s], [a.s, a.c], [b.c, -b.s], [b.s, b.c]];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const ra = a.hx * Math.abs(a.c * ax - a.s * az) + a.hz * Math.abs(a.s * ax + a.c * az);
    const rb = b.hx * Math.abs(b.c * ax - b.s * az) + b.hz * Math.abs(b.s * ax + b.c * az);
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}
function inRect(r, x, z, pad) {
  const dx = x - r.x, dz = z - r.z;
  return Math.abs(dx * r.c - dz * r.s) < r.hx + pad && Math.abs(dx * r.s + dz * r.c) < r.hz + pad;
}

function layout(variants) {
  const K = CAMP;
  const rnd = rng(K.seed);
  const tents = [];
  const CELL = 16;
  const hash = new Map();
  const key = (i, j) => i * 100003 + j;
  const cellsOf = (x, z, r, fn) => {
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) fn(key(i, j));
    }
  };
  // Try to pitch one tent; returns true if it fits (in one zone, clear of every other tent).
  const tryPlace = (t) => {
    const v = variants[t.v];
    const rect = tentRect(t, v.rect, K.gap);
    if (rectCorners(rect).some(([cx, cz]) => zoneAt(cx, cz) !== t.zone)) return false;
    const R = Math.hypot(rect.hx, rect.hz);
    let hit = false;
    cellsOf(rect.x, rect.z, R, (k) => {
      if (hit) return;
      for (const o of hash.get(k) || []) {
        if (Math.hypot(o.rect.x - rect.x, o.rect.z - rect.z) > o.R + R) continue;
        if (rectsOverlap(o.rect, rect)) { hit = true; return; }
      }
    });
    if (hit) return false;
    t.rect = rect;
    t.R = R;
    t.cloth = tentRect(t, v.rect, 0);
    tents.push(t);
    cellsOf(rect.x, rect.z, R, (k) => {
      let list = hash.get(k);
      if (!list) hash.set(k, (list = []));
      list.push(t);
    });
    return true;
  };

  // The Levites: orderly rows parallel to each side of the court, facing it (Num 3:23-38).
  for (let side = 0; side < 4; side++) {
    const ew = side % 2 === 0;
    const sgn = side < 2 ? 1 : -1; // E, S positive; W, N negative
    const face = SIDES[SIDE_KEYS[side]].face;
    const baseYaw = Math.atan2(face[0], face[1]);
    let prevDepth = 0;
    for (let w = K.levite[0] - K.gap; ; ) {
      const big = rnd() < 0.45;
      const depth = (big ? 5.3 : 3.3) * 1.1;
      w += (prevDepth + depth) / 2 + 2 * K.gap + rnd() * 0.6;
      prevDepth = depth;
      if (w > K.levite[1]) break;
      const half = w + (ew ? HZ : HX);
      for (let u = -half + rnd() * 3; u < half; ) {
        const rV = rnd(), rS = rnd(), rH = rnd(), rY = rnd(), rC = rnd(), rC2 = rnd(), rA = rnd();
        const vi = big ? (rV < 0.6 ? 1 : 2) : 0;
        const s = big ? 0.8 + rS * 0.35 : 0.75 + rS * 0.5;
        const len = (variants[vi].rect[1] - variants[vi].rect[0]) * s;
        const lu = u + len / 2;
        u += len + 2 * K.gap + rnd() * 0.8 + (rnd() < 0.08 ? 3 + rnd() * 3 : 0);
        const x = ew ? sgn * (HX + w) : lu, z = ew ? lu : sgn * (HZ + w);
        const zone = zoneAt(x, z);
        if (zone !== side + 1 || rA > 0.75 + 0.25 * zoneDensity(zone)) continue;
        const t = { x, z, yaw: baseYaw + (rY - 0.5) * 0.12, s, hs: 0.9 + rH * 0.2, v: vi, zone, rC, rC2 };
        while (!tryPlace(t) && t.v > 0) t.v--;
      }
    }
  }

  // Family clusters: square cells, each laid out in rows of tents along the cluster's own
  // axis (facing the Tabernacle, or one of the camp's axes, now and then turned 45 degrees).
  // Within a row the tents stand a varying step apart with the odd wider gap; some clusters
  // (by a broad noise field) are thin or empty, leaving open ground between families.
  const CC = K.cluster;
  const n = Math.ceil(K.edge / CC);
  for (let ci = -n; ci < n; ci++) {
    for (let cj = -n; cj < n; cj++) {
      const x0 = ci * CC, z0 = cj * CC;
      const cx = x0 + CC / 2, cz = z0 + CC / 2;
      const h1 = hash2(ci, cj, 31), h2 = hash2(ci, cj, 37);
      let fill = smooth(0.12, 0.32, vnoise(cx / 70, cz / 70, 7)) * (0.6 + 0.4 * hash2(ci, cj, 41));
      // Near the court (in view from the gate) the camp is never left empty.
      if (courtDistance(cx, cz) < 70) fill = Math.max(fill, 0.75);
      if (fill < 0.25) continue;
      const side = Math.abs(cx) - HX > Math.abs(cz) - HZ ? (cx > 0 ? 0 : 2) : cz > 0 ? 1 : 3;
      const face = SIDES[SIDE_KEYS[side]].face;
      let yaw = h1 < 0.55 ? Math.atan2(face[0], face[1]) : Math.floor(h1 * 8) * (Math.PI / 2);
      if (h2 < 0.15) yaw += Math.PI / 4;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const span = CC * 0.75; // half-extent of the rotated lattice (covers the cell)
      // Rows of small tents, or of the bigger family tents; each row sits half its own depth
      // plus half the previous row's depth (and the gaps) beyond the previous one.
      let prevDepth = 0;
      for (let w = -span; w < span; ) {
        const big = rnd() < 0.5;
        const depth = (big ? 5.3 : 3.3) * 1.1;
        w += (prevDepth + depth) / 2 + 2 * K.gap + rnd() * 0.8;
        prevDepth = depth;
        for (let u = -span + rnd() * 4; u < span; ) {
          const rV = rnd(), rS = rnd(), rH = rnd(), rY = rnd(), rC = rnd(), rC2 = rnd(), rA = rnd(), rF = rnd();
          const vi = big ? (rV < 0.6 ? 1 : 2) : 0;
          const s = big ? 0.8 + rS * 0.35 : 0.75 + rS * 0.5;
          const len = (variants[vi].rect[1] - variants[vi].rect[0]) * s;
          const lu = u + len / 2, lw = w + (rnd() - 0.5) * 0.8;
          const x = cx + lu * c + lw * sn, z = cz - lu * sn + lw * c;
          u += len + 2 * K.gap + rnd() * 0.6 + (rnd() < 0.06 ? 3 + rnd() * 4 : 0);
          if (x < x0 || x >= x0 + CC || z < z0 || z >= z0 + CC) continue;
          const zone = zoneAt(x, z);
          if (zone <= 4) continue; // Levites are laid out above
          if (K.keepClear.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr + 6)) continue;
          if (rA > 0.7 + 0.3 * fill * zoneDensity(zone)) continue;
          const t = { x, z, yaw: yaw + (rY - 0.5) * 0.2 + (rF < 0.12 ? Math.PI : 0), s, hs: 0.9 + rH * 0.2, v: vi, zone, rC, rC2 };
          // A bigger tent that does not fit may leave room for a small one.
          while (!tryPlace(t) && t.v > 0) t.v--;
        }
      }
    }
  }
  return { tents, hash, CELL, key };
}

// ---------------------------------------------------------------------------------------

/**
 * The camp: a Group with six InstancedMeshes (3 variants x near/far LOD), userData.colliders
 * (one grid collider over every tent), userData.covers(x, z, r) (is this point under a tent?
 * for clearing ground scatter), userData.stats.
 */
export function createCamp() {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'camp';
  const variants = VARIANTS.map((v) => {
    const near = v.build('near');
    const far = v.build('far');
    return { ...v, near: near.geo, far: far.geo, rect: near.rect };
  });
  const { tents, hash, CELL, key } = layout(variants);

  const mat = tentMaterial();
  const goat = [new THREE.Color(), new THREE.Color()];
  goat[0].setRGB(0.12, 0.1, 0.088, THREE.SRGBColorSpace);
  goat[1].setRGB(0.22, 0.16, 0.115, THREE.SRGBColorSpace);
  const cloth = [new THREE.Color(), new THREE.Color()];
  cloth[0].setRGB(0.66, 0.6, 0.5, THREE.SRGBColorSpace);
  cloth[1].setRGB(0.46, 0.4, 0.32, THREE.SRGBColorSpace);
  const col = new THREE.Color();
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const stats = { tents: tents.length, near: 0, far: 0, byVariant: {}, triangles: 0 };
  for (const [vi, v] of variants.entries()) {
    for (const lod of ['near', 'far']) {
      const list = tents.filter((t) => t.v === vi && (courtDistance(t.x, t.z) < CAMP.nearLod) === (lod === 'near'));
      if (!list.length) continue;
      const geo = v[lod];
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = `camp-${v.name}-${lod}`;
      mesh.castShadow = false;
      mesh.receiveShadow = lod === 'near';
      list.forEach((t, i) => {
        p.set(t.x, 0, t.z);
        q.setFromAxisAngle(Y, t.yaw);
        sc.set(t.s, t.s * t.hs, t.s);
        mtx.compose(p, q, sc);
        mesh.setMatrixAt(i, mtx);
        const pal = t.rC < v.goatHair ? goat : cloth;
        col.copy(pal[0]).lerp(pal[1], t.rC2).multiplyScalar(0.8 + 0.4 * ((t.rC * 7.3) % 1));
        mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      stats[lod] += list.length;
      stats.byVariant[`${v.name}-${lod}`] = list.length;
      stats.triangles += (geo.index.count / 3) * list.length;
    }
    // Geometries not used by any mesh would leak; both LODs are normally used.
  }

  // Collision: every tent's cloth rect, through one spatial grid.
  const obbs = tents.map((t) => obb(t.cloth.x, t.cloth.z, t.yaw, t.cloth.hx, t.cloth.hz));
  group.userData.colliders = [grid(obbs, (o) => [o.x, o.z, Math.hypot(o.hx, o.hz)], { cell: 8, pad: 0.5 })];

  /** Is (x, z), with radius r, under (or right beside) a tent's cloth? */
  group.userData.covers = (x, z, r = 0) => {
    const list = hash.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return false;
    for (const t of list) if (inRect(t.cloth, x, z, r + 0.3)) return true;
    return false;
  };
  stats.ms = Math.round(performance.now() - t0);
  group.userData.stats = stats;
  group.userData.tents = tents;
  return group;
}
