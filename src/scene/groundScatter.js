import * as THREE from 'three';
import { COURTYARD as C, TORCHES, m } from '../config/dimensions.js';
import { QUALITY } from '../config/quality.js';
import { courtDistance, groundHeight } from './terrain.js';

export { courtDistance };

// Rocks and low scrub on the desert floor: "the wilderness of Sinai" read as stony steppe, not
// dunes (DECISIONS.md "World"). Seeded and deterministic; no colliders, no shadows cast.
// 4 kinds: rocks, pebbles (one shared material), grass, shrubs, each split into spatial tiles
// (TILES; one InstancedMesh and draw per tile in view) so off-screen ground costs no vertex
// work; the mobile tier also drops far scatter by tile (`cull`). Each rock's shape is made in
// the vertex shader from its own position (noise displacement plus flat cuts), so every stone
// differs while all share one icosphere.
//
// Placement is clumped: clump centres are sampled by a seeded noise mask and a density that
// falls off with distance from the courtyard (dense within ~55 m, thin by 130 m, none past
// ~190 m where the fog has swallowed the ground). The court is covered like the ground outside
// it, and so are the open lanes through the camp. Kept clear here: the hangings, pegs and
// cords band, and the torches. Every item stands on the relief (terrain.js groundHeight).
// main.js then clears scatter inside colliders, under the tent and the camp's tents,
// and on the altar's utensils with `group.userData.removeWhere((x, z, r) => bool)`.

const HX = m(C.length / 2);
const HZ = m(C.width / 2);
/** Keep-out zones shared with other ground placement (meters). */
export const SCATTER_KEEP_OUT = {
  // Outside the pillar line: the pegs stand C.pegDistance out (leaning away); plus a margin.
  band: m(C.pegDistance + 0.7),
  // Inside the pillar line: clear of the sockets and the hanging's hem (meters).
  inner: 0.5,
  torchClear: 1.5, // around the torch posts outside the lane
  far: 170, // nothing beyond this distance from the courtyard
};
const K = SCATTER_KEEP_OUT;
const TORCH_XZ = TORCHES.list.map((t) => [m(t.x), m(t.z)]);


/** True if a scatter item of radius r at (x, z) is clear of the keep-outs. */
export function isScatterClear(x, z, r = 0) {
  // The ring from just inside the pillar line out past the pegs.
  const ax = Math.abs(x), az = Math.abs(z);
  const inCourt = ax < HX - K.inner - r && az < HZ - K.inner - r;
  if (ax < HX + K.band + r && az < HZ + K.band + r && !inCourt) return false;
  for (const [tx, tz] of TORCH_XZ) if (Math.hypot(x - tx, z - tz) < K.torchClear + r) return false;
  return Math.abs(x) < 299 - r && Math.abs(z) < 299 - r;
}

// ---- Seeded randomness and noise (CPU) ------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz, s) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise2(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const fbm = (x, z, s) => 0.55 * noise2(x, z, s) + 0.3 * noise2(x * 2.1 + 5.3, z * 2.1 - 1.7, s + 1) + 0.15 * noise2(x * 4.3, z * 4.3, s + 2);
const smooth = (a, b, v) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
/** Placement density by distance from the courtyard: the near band is dense, the far field sparse. */
function density(d) {
  if (d < 15) return 1;
  if (d < 45) return 1 - 0.7 * ((d - 15) / 30);
  if (d < 90) return 0.3 - 0.26 * ((d - 45) / 45);
  return Math.max(0, 0.04 * (1 - (d - 90) / (K.far - 90)));
}
/** Rocks farther than this (m from the court) use the coarse 20-triangle mesh. */
const ROCK_LOD = 30;
const gauss = (rnd) => (rnd() + rnd() + rnd() - 1.5) / 1.5; // ~[-1, 1], peaked

/**
 * Tile layout (DECISIONS.md "Mobile"): each kind is cut into a grid by these x and z
 * lines (m); the outer rows and columns run on to the edge of the scatter. ±25 / ±15 fall in
 * the bare band round the hangings, so the middle tile is the court.
 */
const TILES = {
  rocks: { xs: [-25, 25], zs: [] }, // only within ~30 m of the court
  pebbles: { xs: [-25, 25], zs: [] }, // mostly near; the far field's few coarse rocks
  grass: { xs: [-25, 25], zs: [-15, 15] },
  shrubs: { xs: [-25, 25], zs: [-15, 15] },
};
const cellOf = (lines, v) => {
  let i = 0;
  while (i < lines.length && v >= lines[i]) i++;
  return i;
};
const tileOf = (key, x, z) => `${cellOf(TILES[key].xs, x)}${cellOf(TILES[key].zs, z)}`;

// ---- Geometry ---------------------------------------------------------------------------------
/** Grass tuft: N thin tapered blades, unit height. aBlade = blade index / N (per-instance culling). */
function tuftGeometry(rnd, N = 16) {
  const pos = [], nrm = [], col = [], bl = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let b = 0; b < N; b++) {
    // Blade 0 is the central upright one, so single blades/sprigs keep it.
    const a = rnd() * Math.PI * 2;
    const r0 = b === 0 ? 0 : 0.03 + rnd() * 0.1;
    const lean = b === 0 ? 0.08 : 0.2 + rnd() * 0.5; // outward lean at the tip (per unit height)
    const h = b === 0 ? 1 : 0.55 + rnd() * 0.45;
    const w = 0.045 + rnd() * 0.03;
    const face = a + Math.PI / 2 + (rnd() - 0.5) * 1.2; // blade face orientation
    const dx = Math.cos(a), dz = Math.sin(a);
    const fx = Math.cos(face), fz = Math.sin(face);
    const ts = [0, 0.55, 1];
    const ring = ts.map((t) => {
      const bend = lean * t * t * h; // curving outward with height
      const cx = dx * (r0 + bend), cz = dz * (r0 + bend), cy = h * t * (1 - 0.15 * t * lean);
      const hw = w * (1 - t) * 0.5;
      return [[cx - fx * hw, cy, cz - fz * hw], [cx + fx * hw, cy, cz + fz * hw], t];
    });
    const n = new THREE.Vector3(dx, 0, dz).multiplyScalar(0.35).add(up).normalize();
    const shade = (t) => {
      const k = 0.5 + 0.5 * t;
      const dry = t > 0.7 ? (t - 0.7) * 0.8 : 0; // pale dry tips
      return [k + dry, k + dry * 0.9, k + dry * 0.6];
    };
    const push = (p, t) => { pos.push(...p); nrm.push(n.x, n.y, n.z); col.push(...shade(t)); bl.push(b / N); };
    for (let i = 0; i < 2; i++) {
      const [l0, r0v, t0] = ring[i], [l1, r1v, t1] = ring[i + 1];
      if (i < 1) {
        push(l0, t0); push(r0v, t0); push(r1v, t1);
        push(l0, t0); push(r1v, t1); push(l1, t1);
      } else {
        const tip = [(l1[0] + r1v[0]) / 2, l1[1], (l1[2] + r1v[2]) / 2];
        push(l0, t0); push(r0v, t0); push(tip, t1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 1));
  return g;
}

/**
 * Small round shrub, unit size (~1 wide, ~0.6 high): a mound of thin twigs radiating from the
 * base around a squashed leafy core. aBlade: twig index / TW / 2 (< 0.5), 1 = core (scaled per instance: white
 * broom is mostly twigs, wormwood a grey-green cushion).
 */
function shrubGeometry(rnd) {
  const pos = [], nrm = [], col = [], part = [];
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), v = new THREE.Vector3();
  const TW = 44;
  for (let i = 0; i < TW; i++) {
    const a = rnd() * Math.PI * 2;
    const el = 0.35 + rnd() * 1.1; // elevation from horizontal
    const L = 0.45 + rnd() * 0.3;
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) * 0.9, Math.sin(a) * Math.cos(el));
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    if (rnd() < 0.5) side.applyAxisAngle(dir, 0.9 + rnd()); // mix of face orientations
    const w = 0.034;
    const pts = [0, 0.5, 1].map((t) => {
      const p = dir.clone().multiplyScalar(L * t);
      p.y -= 0.12 * t * t * Math.cos(el); // outer twigs droop a little
      return [p, w * (1 - t * 0.85)];
    });
    n.copy(dir).setY(0).normalize().multiplyScalar(0.7).add(up).normalize();
    const push = (p, t) => { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); col.push(0.55 + 0.45 * t, 0.5 + 0.5 * t, 0.45 + 0.45 * t); part.push((0.5 * i) / TW); };
    for (let s = 0; s < 2; s++) {
      const [p0, w0] = pts[s], [p1, w1] = pts[s + 1];
      const a0 = p0.clone().addScaledVector(side, -w0), b0 = p0.clone().addScaledVector(side, w0);
      const a1 = p1.clone().addScaledVector(side, -w1), b1 = p1.clone().addScaledVector(side, w1);
      const t0 = s / 2, t1 = (s + 1) / 2;
      push(a0, t0); push(b0, t0); push(b1, t1);
      push(a0, t0); push(b1, t1); push(a1, t1);
    }
  }
  // Leafy core: a cushion of small faceted lumps, lit as one rounded mass.
  for (let l = 0; l < 6; l++) {
    const a = (l / 6) * Math.PI * 2 + rnd(), rr = l === 0 ? 0 : 0.16 + rnd() * 0.08;
    const c = new THREE.Vector3(Math.cos(a) * rr, 0.12 + (l === 0 ? 0.08 : rnd() * 0.06), Math.sin(a) * rr);
    const lr = l === 0 ? 0.22 : 0.15 + rnd() * 0.06;
    const lump = new THREE.IcosahedronGeometry(1, 0);
    const lp = lump.attributes.position;
    const tone = 0.62 + rnd() * 0.25;
    const fn = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), vs = [];
    for (let i = 0; i < lp.count; i++) {
      v.fromBufferAttribute(lp, i);
      const k = 1 + 0.3 * (hash2(Math.round(v.x * 50) + l * 7, Math.round(v.z * 50 + v.y * 23), 7) - 0.5);
      v.multiplyScalar(lr * k);
      v.y *= 0.75;
      v.add(c);
      vs.push(v.clone());
    }
    for (let i = 0; i < vs.length; i += 3) {
      // Half face normal, half rounded: faceted clumps of leaves on a round cushion.
      fn.crossVectors(e1.subVectors(vs[i + 1], vs[i]), e2.subVectors(vs[i + 2], vs[i])).normalize();
      for (let j = 0; j < 3; j++) {
        const p = vs[i + j];
        pos.push(p.x, p.y, p.z);
        n.set(p.x, p.y - 0.02, p.z).normalize().add(fn).normalize();
        n.y += 0.3;
        n.normalize();
        nrm.push(n.x, n.y, n.z);
        const sh = tone * (0.5 + 0.5 * Math.min(1, Math.max(0, p.y / 0.3))) * (0.85 + 0.3 * hash2(i, l, 3));
        col.push(sh, sh, sh);
        part.push(1);
      }
    }
    lump.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(part, 1));
  return g;
}

// ---- Materials --------------------------------------------------------------------------------
const ROCK_GLSL = /* glsl */ `
float rkHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rkNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkHash(i), rkHash(i + vec3(1, 0, 0)), f.x), mix(rkHash(i + vec3(0, 1, 0)), rkHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rkHash(i + vec3(0, 0, 1)), rkHash(i + vec3(1, 0, 1)), f.x), mix(rkHash(i + vec3(0, 1, 1)), rkHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

/** Rock material: per-instance shape in the vertex shader (lumpy, with 3 flat fracture cuts). */
function rockMaterial() {
  const mat = new THREE.MeshStandardMaterial({ name: 'rock', roughness: 0.88, metalness: 0, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ROCK_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
#ifdef USE_INSTANCING
{
  vec3 sd = vec3(instanceMatrix[3][0], instanceMatrix[3][2], 0.0) * 1.37;
  vec3 dn = normalize(position);
  float r = 1.0 + 0.55 * (rkNoise(dn * 1.4 + sd) - 0.5) + 0.2 * (rkNoise(dn * 3.1 + sd.yxz) - 0.5);
  // Flat fracture faces: clip the radius against 3 planes with seeded normals.
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec3 pn = normalize(vec3(rkHash(sd + fk * 3.1) - 0.5, rkHash(sd + fk * 5.7 + 1.3) - 0.3, rkHash(sd + fk * 7.3 + 2.9) - 0.5));
    float dd = 0.6 + 0.3 * rkHash(sd + fk * 11.1);
    float c = dot(dn, pn);
    if (c > 0.05) r = min(r, dd / c);
  }
  transformed = dn * r;
}
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'scatter-rock-v1';
  return mat;
}

/**
 * Foliage material (grass and shrubs): vertex colors x instance color, upward-biased normals,
 * per-instance part culling/scaling (aParams.x) and a gentle wind sway that grows with height.
 */
function foliageMaterial(kind, wind) {
  const mat = new THREE.MeshStandardMaterial({
    name: `scatter-${kind}`,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const isGrass = kind === 'grass';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = wind.time;
    // Keep the upward-biased normal on both faces (no back-face flip), so thin blades are lit
    // like the ground they stand on instead of going dark from behind.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n  normal = normalize(vNormal);',
    );
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aBlade;
attribute vec2 aParams;
uniform float uWindTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
#ifdef USE_INSTANCING
{
  float camDist = distance((modelMatrix * instanceMatrix[3]).xyz, cameraPosition);
  ${isGrass
    ? '// Single blades and sprigs: drop blades past this instance\'s count; far tufts keep half.\n  if (aBlade >= aParams.x || (aBlade >= 0.5 && camDist > 35.0)) transformed = vec3(0.0);'
    : '// Leafy core size: small in white broom, a full cushion in wormwood. Far shrubs keep half their twigs.\n  if (aBlade > 0.75) transformed = (transformed - vec3(0.0, 0.14, 0.0)) * aParams.x + vec3(0.0, 0.14 * aParams.x, 0.0);\n  else if (aBlade >= 0.25 && camDist > 40.0) transformed = vec3(0.0);'}
  // Wind from the west-north-west, turned into this instance's local frame.
  vec3 wl = transpose(mat3(instanceMatrix)) * vec3(0.92, 0.0, 0.38);
  vec2 wd = normalize(wl.xz);
  float ph = aParams.y + uWindTime * ${isGrass ? '1.9' : '1.1'};
  float h = max(transformed.y, 0.0);
  float s = (0.55 + 0.3 * sin(ph) + 0.15 * sin(ph * 2.3 + 1.7)) * h * h * ${isGrass ? '0.16' : '0.05'};
  transformed.xz += wd * s;
}
#endif`,
      );
  };
  mat.customProgramCacheKey = () => `scatter-${kind}-v1`;
  return mat;
}

// ---- Placement --------------------------------------------------------------------------------
const ROCK_TINTS = {
  flint: [0x6b5f55, 0x5d554d, 0x786858, 0x4f4842],
  lime: [0xbdb29c, 0xa89c86, 0xcbc2ad, 0xb3a58a],
};
const GRASS_TINTS = [0xc4ad78, 0xa99a64, 0x9c9466, 0x8f8360, 0xb8a170];
const SHRUB_TINTS = { broom: [0x7f8a50, 0x737d4a, 0x8a8d5c], wormwood: [0x8a8e66, 0x959470, 0x7c815c] };

/**
 * Create the ground scatter. Options: `seed`, `exclude(x, z, r)` returning true for extra
 * keep-out areas, and `camera` (the view the tiles are culled to each frame). Returns a Group
 * with userData.update (wind + cull), userData.cull(cam?) (`null` shows every tile), userData.tiles,
 * userData.colliders = [], userData.stats, and userData.removeWhere(test) to drop instances
 * (e.g. under camp tents).
 */
export function createGroundScatter({ seed = 1907, exclude = null, camera = null } = {}) {
  const t0 = performance.now();
  const rnd = rng(seed);
  const clear = (x, z, r) => isScatterClear(x, z, r) && !(exclude && exclude(x, z, r));
  const sets = { rocks: [], pebbles: [], grass: [], shrubs: [] };
  const color = new THREE.Color();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const jitterColor = (hex, k = 0.08) => {
    color.set(hex);
    const f = 1 + (rnd() - 0.5) * 2 * k;
    return [color.r * f, color.g * f * (1 + (rnd() - 0.5) * 0.04), color.b * f];
  };

  // Stone of diameter `size` (m): rocks (>= 7 cm) or pebbles.
  const addStone = (x, z, size, kind, d = 0) => {
    const r = size / 2;
    const flat = 0.5 + rnd() * 0.4;
    const sx = r * (0.8 + rnd() * 0.4), sz = r * (0.8 + rnd() * 0.4), sy = r * flat;
    sets[size >= 0.07 && d < ROCK_LOD ? 'rocks' : 'pebbles'].push({
      x, z, r,
      y: -sy * (0.1 + rnd() * 0.35), // partly buried
      rx: (rnd() - 0.5) * 0.5, ry: rnd() * Math.PI * 2, rz: (rnd() - 0.5) * 0.5,
      s: [sx, sy, sz],
      c: jitterColor(pick(ROCK_TINTS[kind])),
    });
  };
  const addGrass = (x, z, single) => {
    const h = single ? 0.12 + rnd() * 0.22 : 0.15 + rnd() * 0.3;
    const w = h * (0.8 + rnd() * 0.6) * (single ? 1 : 1.3);
    sets.grass.push({
      x, z, r: w * 0.5, y: 0, rx: (rnd() - 0.5) * 0.15, ry: rnd() * Math.PI * 2, rz: (rnd() - 0.5) * 0.15,
      s: [w, h, w],
      c: jitterColor(pick(GRASS_TINTS), 0.12),
      p: [single ? (1 + Math.floor(rnd() * 3)) / 16 - 0.001 : 0.55 + rnd() * 0.46, rnd() * 6.283],
    });
  };
  const addShrub = (x, z) => {
    const broom = rnd() < 0.4; // white broom (retem) vs wormwood-like cushion
    const d = broom ? 0.35 + rnd() * 0.3 : 0.25 + rnd() * 0.3;
    const hy = broom ? d * (1.1 + rnd() * 0.5) : d * (0.55 + rnd() * 0.3);
    sets.shrubs.push({
      x, z, r: d / 2, y: -0.02, rx: 0, ry: rnd() * Math.PI * 2, rz: 0,
      s: [d * (0.85 + rnd() * 0.3), hy, d * (0.85 + rnd() * 0.3)],
      c: jitterColor(pick(broom ? SHRUB_TINTS.broom : SHRUB_TINTS.wormwood), 0.1),
      p: [broom ? 0.35 : 0.7 + rnd() * 0.25, rnd() * 6.283],
    });
  };

  const vegClump = (cx, cz, d) => {
    const R = 0.4 + rnd() * 1.2;
    const tufts = Math.floor(3 + rnd() * 7);
    const shrubs = rnd() < 0.45 ? 1 + Math.floor(rnd() * 2.5) : 0;
    for (let i = 0; i < shrubs; i++) {
      const x = cx + gauss(rnd) * R * 0.6, z = cz + gauss(rnd) * R * 0.6;
      if (clear(x, z, 0.3)) addShrub(x, z);
    }
    for (let i = 0; i < (d < 35 ? tufts : d < 60 ? Math.ceil(tufts / 3) : 0); i++) {
      const x = cx + gauss(rnd) * R, z = cz + gauss(rnd) * R;
      if (clear(x, z, 0.2)) addGrass(x, z, false);
    }
    if (d < 40) {
      const singles = Math.floor(rnd() * 7);
      for (let i = 0; i < singles; i++) {
        const x = cx + gauss(rnd) * R * 1.6, z = cz + gauss(rnd) * R * 1.6;
        if (clear(x, z, 0.15)) addGrass(x, z, true);
      }
    }
  };

  // Clump centres over the whole visible ground, accepted by distance density x noise mask.
  const SPAN = 200;
  const CANDIDATES = 28000;
  for (let i = 0; i < CANDIDATES; i++) {
    const x = (rnd() * 2 - 1) * SPAN, z = (rnd() * 2 - 1) * SPAN;
    const d = courtDistance(x, z);
    const dens = density(d);
    if (dens <= 0) { rnd(); rnd(); continue; }
    // Just outside the hangings (where the eye usually is) no stretch is left bare.
    const nearFloor = 0.5 * smooth(10, 4, d);
    const rockMask = Math.max(nearFloor, smooth(0.25, 0.62, fbm(x * 0.045, z * 0.045, 11)));
    const vegMask = Math.max(nearFloor, smooth(0.22, 0.6, fbm(x * 0.06 + 40, z * 0.06, 23)));
    const roll = rnd(), roll2 = rnd();
    if (roll < dens * 0.85 * rockMask && clear(x, z, 0.5)) {
      // Rock clump: one or two larger stones and smaller ones round them.
      const kind = rnd() < 0.5 ? 'flint' : 'lime';
      const n = 3 + Math.floor(Math.pow(rnd(), 1.6) * 18);
      const R = 0.25 + rnd() * 1.0;
      for (let k = 0; k < n; k++) {
        const x2 = x + gauss(rnd) * R, z2 = z + gauss(rnd) * R;
        const size = k < 3 ? 0.08 + Math.pow(rnd(), 1.3) * 0.17 : 0.03 + Math.pow(rnd(), 2) * 0.07;
        if (d > 45 && size < 0.07) continue; // pebbles vanish in the far field
        if (clear(x2, z2, size / 2)) addStone(x2, z2, size, rnd() < 0.85 ? kind : kind === 'flint' ? 'lime' : 'flint', d);
      }
      if (rnd() < 0.5) {
        const a = rnd() * 6.283, o = 0.5 + rnd() * 2;
        vegClump(x + Math.cos(a) * o, z + Math.sin(a) * o, d);
      }
    }
    if (roll2 < dens * 1.0 * vegMask && clear(x, z, 0.4)) vegClump(x, z, d);
  }
  // Loose pebbles sprinkled over the near ground.
  for (let i = 0; i < 4000; i++) {
    const x = (rnd() * 2 - 1) * 65, z = (rnd() * 2 - 1) * 55;
    const d = courtDistance(x, z);
    const roll = rnd(), size = 0.03 + Math.pow(rnd(), 2.5) * 0.06, kind = rnd() < 0.5 ? 'flint' : 'lime';
    if (d < 40 && roll < 0.8 * density(d) && clear(x, z, size)) addStone(x, z, size, kind);
  }
  // ---- Build the instanced meshes, one per tile -------------------------------------------
  const group = new THREE.Group();
  group.name = 'groundScatter';
  const wind = { time: { value: 0 } };
  const rockMat = rockMaterial();
  const geos = {
    rocks: new THREE.IcosahedronGeometry(1, 1),
    pebbles: new THREE.IcosahedronGeometry(1, 0),
    grass: tuftGeometry(rng(seed + 1)),
    shrubs: shrubGeometry(rng(seed + 2)),
  };
  const mats = { rocks: rockMat, pebbles: rockMat, grass: foliageMaterial('grass', wind), shrubs: foliageMaterial('shrub', wind) };
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();

  // Each tile is its own InstancedMesh (same geometry attributes and material as the rest of its
  // kind), so tiles off screen are skipped and the mobile tier can drop far ones (`cull`). Tiles are fixed at creation; removeWhere only empties them.
  const tiles = [];
  for (const key of Object.keys(sets)) {
    const byTile = new Map();
    for (const it of sets[key]) {
      const id = tileOf(key, it.x, it.z);
      if (!byTile.has(id)) byTile.set(id, []);
      byTile.get(id).push(it);
    }
    const base = geos[key];
    for (const [id, list] of byTile) {
      // Per-tile geometry: shares the kind's vertex attributes, owns the per-instance aParams.
      let geo = base;
      if (key === 'grass' || key === 'shrubs') {
        geo = new THREE.BufferGeometry();
        for (const name of Object.keys(base.attributes)) geo.setAttribute(name, base.attributes[name]);
        geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(list.length * 2), 2));
        geo.boundingSphere = base.boundingSphere || (base.computeBoundingSphere(), base.boundingSphere);
      }
      const mesh = new THREE.InstancedMesh(geo, mats[key], list.length);
      mesh.name = `scatter-${key}-${id}`;
      mesh.receiveShadow = true; // the hangings' shadows fall on them, as on the sand
      mesh.castShadow = false;
      const tile = { key, mesh, list, n: 0, box: new THREE.Box3() };
      mesh.userData.tile = tile;
      tiles.push(tile);
      group.add(mesh);
    }
  }
  const lo = new THREE.Vector3(), hi = new THREE.Vector3();
  const write = (tile) => {
    const { mesh, box } = tile;
    const params = mesh.geometry.getAttribute('aParams');
    // Nearest the court first, so the mobile tier can draw a prefix of each tile (`cull`).
    for (const it of tile.list) it.cd ??= courtDistance(it.x, it.z);
    const list = (tile.list = tile.list.sort((a, b) => a.cd - b.cd));
    tile.cds = Float32Array.from(list, (it) => it.cd);
    box.makeEmpty();
    list.forEach((it, i) => {
      const y = it.y + groundHeight(it.x, it.z);
      M.compose(v.set(it.x, y, it.z), q.setFromEuler(e.set(it.rx, it.ry, it.rz)), s.set(...it.s));
      mesh.setMatrixAt(i, M);
      mesh.setColorAt(i, color.setRGB(...it.c));
      if (params) params.setXY(i, it.p[0], it.p[1]);
      // Bounds: the geometry is within ~1.4 x its largest scale of the origin (rock lumps,
      // grass lean, wind sway), plus a margin, so nothing pops at the screen edges.
      const rr = 1.5 * Math.max(...it.s) + 0.1;
      box.expandByPoint(lo.set(it.x - rr, y - rr, it.z - rr)).expandByPoint(hi.set(it.x + rr, y + rr, it.z + rr));
    });
    tile.n = mesh.count = list.length;
    mesh.visible = list.length > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (params) params.needsUpdate = true;
    // three's own test: every instance's transformed geometry sphere, padded as above.
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += 0.5;
  };
  tiles.forEach(write);

  // Per-frame tile culling (`cull`, from update and main.js's rig calls), before three's own:
  // 1. Frustum against each tile's box (both tiers). A box is much tighter than three's sphere
  //    for the long outer tiles, whose spheres would contain the camera.
  // 2. Distance (QUALITY knobs in m, 0 = off; all off in `high`): a tile is hidden when the
  //    nearest point of its xz footprint is farther than its kind's limit. Otherwise it draws
  //    the prefix of its instances (sorted by court distance) within courtDistance(camera) +
  //    the limit: court distance changes no faster than distance, so everything nearer than the
  //    limit is kept, and the far outer ground is dropped without more tiles.
  const FAR = { rocks: QUALITY.rockFar, pebbles: QUALITY.pebbleFar, grass: QUALITY.grassFar, shrubs: QUALITY.shrubFar };
  const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4();
  const upTo = (cds, v) => { // number of entries <= v (ascending array)
    let a = 0, b = cds.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (cds[mid] <= v) a = mid + 1;
      else b = mid;
    }
    return a;
  };
  /** Show the tiles `cam` can see (default: the camera passed in); `cull(null)` shows them all. */
  const cull = (cam = camera) => {
    let camCd = 0;
    if (cam) {
      cam.updateMatrixWorld();
      frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      camCd = courtDistance(cam.position.x, cam.position.z);
    }
    for (const tile of tiles) {
      const { box, mesh, n } = tile;
      if (n === 0) continue;
      mesh.count = n;
      if (!cam) {
        mesh.visible = true;
        continue;
      }
      mesh.visible = frustum.intersectsBox(box);
      const far = FAR[tile.key];
      if (!(far > 0) || !mesh.visible) continue;
      const p = cam.position;
      const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x), dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
      mesh.count = dx * dx + dz * dz > far * far ? 0 : upTo(tile.cds, camCd + far);
      mesh.visible = mesh.count > 0;
    }
  };

  const stats = () => {
    const out = { ms: 0, instances: {}, triangles: 0, tiles: {} };
    for (const { key, mesh, n } of tiles) {
      const tris = mesh.geometry.attributes.position.count / 3;
      out.instances[key] = (out.instances[key] || 0) + n;
      out.tiles[key] = (out.tiles[key] || 0) + (n > 0 ? 1 : 0);
      out.triangles += tris * n;
    }
    return out;
  };
  group.userData.colliders = [];
  group.userData.tiles = tiles;
  group.userData.cull = cull;
  group.userData.update = (dt, t) => {
    wind.time.value = t;
    cull();
  };
  /** Remove every instance for which test(x, z, r) is true (e.g. under a tent). */
  group.userData.removeWhere = (test) => {
    for (const tile of tiles) {
      const kept = tile.list.filter((it) => !test(it.x, it.z, it.r));
      if (kept.length === tile.list.length) continue;
      tile.list = kept;
      write(tile);
    }
    cull();
    group.userData.stats = { ...stats(), ms: group.userData.stats.ms };
  };
  group.userData.stats = { ...stats(), ms: +(performance.now() - t0).toFixed(1) };
  return group;
}
