import { COURTYARD as C, CAMP, m } from '../config/dimensions.js';

// Ground relief: gentle dunes and swales (a few tens of cm) away from the court. One height
// field, written twice: `groundHeight(x, z)` in JS (player eye height, scatter, camp tents,
// anything standing on the sand) and `GROUND_HEIGHT_GLSL` (the sand mesh is displaced in its
// vertex shader). Both are the same sum of sines, so they agree to float precision; no hashes,
// whose JS and GLSL versions would drift apart.
//
// The relief is 0 in the court and up to `TERRAIN.start` m outside the hangings (the pegs, the
// torches and the gate approach stand on level ground), grows to full by `TERRAIN.full` m, and
// is flattened to `TERRAIN.lane` of itself along the camp's lanes and streets (camp.js zoneAt).

const HX = m(C.length / 2);
const HZ = m(C.width / 2);

export const TERRAIN = {
  start: 10, // m outside the hangings where the relief begins
  full: 40, // m outside the hangings where it reaches full height
  lane: 0.3, // relief kept along the camp's lanes (near-level, trodden)
  // Dune waves: [dir x, dir z, wavelength m, amplitude m, phase]. Long crests across the
  // west-north-west wind (the scatter's wind direction), then cross swells and short ripples.
  waves: [
    [0.92, 0.38, 46, 0.2, 0.3],
    [0.6, -0.8, 31, 0.11, 1.9],
    [0.2, 0.98, 67, 0.15, 4.1],
    [-0.85, 0.53, 19, 0.05, 2.6],
    [0.97, -0.24, 23, 0.05, 5.2],
  ],
  warp: 5, // m of domain warp so the crests wander instead of running dead straight
};

/** Distance (m) from (x, z) to the courtyard rectangle (0 inside). */
export function courtDistance(x, z) {
  return Math.hypot(Math.max(Math.abs(x) - HX, 0), Math.max(Math.abs(z) - HZ, 0));
}

const smooth = (a, b, v) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 0..1: how much relief at (x, z) (0 in and near the court, `lane` along the camp's lanes). */
function reliefMask(x, z) {
  const K = CAMP;
  const ramp = smooth(TERRAIN.start, TERRAIN.full, courtDistance(x, z));
  if (ramp <= 0) return 0;
  const dx = Math.abs(x) - HX, dz = Math.abs(z) - HZ, d = Math.max(dx, dz);
  let open = smooth(K.diagLane - 3, K.diagLane + 4, Math.abs(dx - dz));
  if (x > 0) open = Math.min(open, smooth(K.eastLane - 2, K.eastLane + 5, Math.abs(z)));
  const u = dx > dz ? z : x;
  open = Math.min(open, smooth(K.tribeLane - 1, K.tribeLane + 3, Math.abs(Math.abs(u) - K.edge / 3)));
  for (const st of K.streets) open = Math.min(open, smooth(K.streetHalf - 1, K.streetHalf + 3, Math.abs(d - st)));
  return ramp * (TERRAIN.lane + (1 - TERRAIN.lane) * open);
}

/** Unmasked dune field (m). */
function dunes(x, z) {
  const W = TERRAIN.warp;
  const wx = x + W * Math.sin(z * 0.043 + 1.7);
  const wz = z + W * Math.sin(x * 0.037 + 0.6);
  // Broad modulation: some stretches flatter, some with fuller dunes.
  const amp = 0.65 + 0.35 * Math.sin(x * 0.011 + 2.0) * Math.sin(z * 0.013 + 1.0);
  let h = 0;
  for (const [ax, az, len, a, ph] of TERRAIN.waves) {
    const t = ((ax * wx + az * wz) * 2 * Math.PI) / len + ph;
    h += a * (Math.sin(t) + 0.25 * Math.sin(2 * t + 0.8)); // asymmetric: steeper lee faces
  }
  return h * amp;
}

/** Ground height (m) at world (x, z). 0 in the court; gentle dunes away from it. */
export function groundHeight(x, z) {
  const k = reliefMask(x, z);
  return k > 0 ? k * dunes(x, z) : 0;
}

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const waveGlsl = TERRAIN.waves
  .map(([ax, az, len, a, ph]) => `  t = dot(vec2(${f(ax)}, ${f(az)}), w) * ${f((2 * Math.PI) / len)} + ${f(ph)};\n  h += ${f(a)} * (sin(t) + 0.25 * sin(2.0 * t + 0.8));`)
  .join('\n');
const streetGlsl = CAMP.streets
  .map((st) => `  open = min(open, smoothstep(${f(CAMP.streetHalf - 1)}, ${f(CAMP.streetHalf + 3)}, abs(d - ${f(st)})));`)
  .join('\n');

/** GLSL twin of groundHeight: `float groundHeight(vec2 p)` with p = world (x, z). */
export const GROUND_HEIGHT_GLSL = /* glsl */ `
float tgCourtDistance(vec2 p) {
  return length(max(abs(p) - vec2(${f(HX)}, ${f(HZ)}), 0.0));
}
float tgReliefMask(vec2 p) {
  float ramp = smoothstep(${f(TERRAIN.start)}, ${f(TERRAIN.full)}, tgCourtDistance(p));
  if (ramp <= 0.0) return 0.0;
  float dx = abs(p.x) - ${f(HX)}, dz = abs(p.y) - ${f(HZ)}, d = max(dx, dz);
  float open = smoothstep(${f(CAMP.diagLane - 3)}, ${f(CAMP.diagLane + 4)}, abs(dx - dz));
  if (p.x > 0.0) open = min(open, smoothstep(${f(CAMP.eastLane - 2)}, ${f(CAMP.eastLane + 5)}, abs(p.y)));
  float u = dx > dz ? p.y : p.x;
  open = min(open, smoothstep(${f(CAMP.tribeLane - 1)}, ${f(CAMP.tribeLane + 3)}, abs(abs(u) - ${f(CAMP.edge / 3)})));
${streetGlsl}
  return ramp * (${f(TERRAIN.lane)} + ${f(1 - TERRAIN.lane)} * open);
}
float groundHeight(vec2 p) {
  float k = tgReliefMask(p);
  if (k <= 0.0) return 0.0;
  vec2 w = p + ${f(TERRAIN.warp)} * vec2(sin(p.y * 0.043 + 1.7), sin(p.x * 0.037 + 0.6));
  float amp = 0.65 + 0.35 * sin(p.x * 0.011 + 2.0) * sin(p.y * 0.013 + 1.0);
  float h = 0.0, t;
${waveGlsl}
  return k * h * amp;
}
`;
