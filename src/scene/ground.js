import * as THREE from 'three';
import { WORLD_NOISE_GLSL } from './materials.js';
import { AO, AO_PARS_GLSL, aoApplyGlsl, bindAOUniforms } from './ao.js';
import { GROUND_GRID, reliefHeight } from './terrain.js';
import { ALTAR, LAVER, TABERNACLE, COURTYARD, m } from '../config/dimensions.js';

const TILE = 2; // meters covered by one sand texture tile

/** Fine desert sand with grit and small pebbles (procedural, tileable). */
function sandTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#c2a87c';
  g.fillRect(0, 0, S, S);
  let seed = 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Soft blotches (wrapping) so the tile itself isn't uniform.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
    const col = rnd() < 0.5 ? `rgba(120,95,60,${0.05 + rnd() * 0.06})` : `rgba(235,220,190,${0.05 + rnd() * 0.06})`;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grd.addColorStop(0, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
  }
  // Grains.
  for (let i = 0; i < 22000; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(95,75,50,${0.12 + rnd() * 0.25})` : `rgba(250,238,210,${0.1 + rnd() * 0.25})`;
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  // Grit and small pebbles (grey/brown flint), with a lit top and a dark underside.
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.8 + Math.pow(rnd(), 3) * 4.5;
    const k = 70 + rnd() * 80;
    g.fillStyle = 'rgba(40,30,20,0.35)';
    g.beginPath(); g.ellipse(x + 0.6, y + 0.8, r, r * 0.75, 0, 0, 7); g.fill();
    g.fillStyle = `rgb(${k},${k * 0.9},${k * 0.78})`;
    g.beginPath(); g.ellipse(x, y, r, r * 0.75, rnd() * 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,245,225,0.25)';
    g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.4, r * 0.3, 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const f3 = (v) => v.toFixed(3);
const HX = m(COURTYARD.length / 2), HZ = m(COURTYARD.width / 2);
const ALTAR_XZ = `vec2(${f3(m(ALTAR.x))}, ${f3(m(ALTAR.z))})`;
const LAVER_XZ = `vec2(${f3(m(LAVER.x))}, ${f3(m(LAVER.z))})`;

const segDist = (px, pz, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az;
  const t = Math.min(Math.max(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0), 1);
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
};
/**
 * JS twin of the trodden-path core (no edge wobble): true where the priests' paths have worn
 * the ground bare (and on the slaughter ground north of the altar), used to clear the scatter off them (main.js).
 */
export function isTrodden(x, z, r = 0) {
  if (x < TABERNACLE.interiorMaxX - 3 || x > HX + 9 || Math.abs(z) > HZ) return false;
  const [ax, az] = [m(ALTAR.x), m(ALTAR.z)], [lx, lz] = [m(LAVER.x), m(LAVER.z)];
  // The slaughter ground north of the altar (bloodTexture's patch) is trampled bare too.
  if (Math.abs(x - ax) < 1.5 + r && Math.abs(z - az + m(ALTAR.length / 2) + 2.15) < 1.9 + r) return true;
  const qx = Math.abs(x - ax) - m(ALTAR.length / 2), qz = Math.abs(z - az) - m(ALTAR.length / 2);
  const dAltar = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
  let d = Math.min(
    segDist(x, z, HX + 8, 0, ax, az) - 0.85,
    segDist(x, z, ax, az, lx, lz) - 0.7,
    segDist(x, z, lx, lz, -1, 0.2) - 0.8,
    Math.min(dAltar, Math.hypot(x - lx, z - lz) - m(LAVER.radius)) - 1.0,
  );
  if (x > HX) d += 0.6; // the approach outside the gate is less worn
  return d < 0.3 + r;
}

/**
 * Trodden ground in the court (GLSL): the priests' daily round, gate -> altar -> laver -> tent
 * door, and the ground worn round the altar and the laver. sandTrodden(p) is 0..1 (darker,
 * compacted, no ripples); sandPrints(p) adds faint footprints near the altar and the laver,
 * returning the print depth and, in `dir`, the world xz direction up its wall.
 */
const TROD_GLSL = /* glsl */ `
float sdSandSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float sandNearAltarLaver(vec2 p) {
  vec2 q = abs(p - ${ALTAR_XZ}) - vec2(${f3(m(ALTAR.length / 2))});
  float dAltar = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float dLaver = length(p - ${LAVER_XZ}) - ${f3(m(LAVER.radius))};
  return min(dAltar, dLaver);
}
bool sandNearAltarLaverIsLaver(vec2 p) {
  return length(p - ${LAVER_XZ}) < length(p - ${ALTAR_XZ}) - 0.8;
}
float sandTrodden(vec2 p) {
  if (p.x < ${f3(TABERNACLE.interiorMaxX - 3)} || p.x > ${f3(HX + 9)} || abs(p.y) > ${f3(HZ)}) return 0.0;
  float d = sdSandSeg(p, vec2(${f3(HX + 8)}, 0.0), ${ALTAR_XZ}) - 0.85;
  d = min(d, sdSandSeg(p, ${ALTAR_XZ}, ${LAVER_XZ}) - 0.7);
  d = min(d, sdSandSeg(p, ${LAVER_XZ}, vec2(-1.0, 0.2)) - 0.8);
  d = min(d, sandNearAltarLaver(p) - 1.0);
  d += (wvFbm(p * 0.7 + 5.0) - 0.5) * 1.1;
  // Fainter beyond the gate: the approach is used, but less worn than the court.
  float outside = smoothstep(${f3(HX)}, ${f3(HX + 9)}, p.x);
  return (1.0 - smoothstep(0.0, 1.5, d)) * (1.0 - 0.6 * outside);
}
float sandHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float sandPrints(vec2 p, out vec2 dir) {
  dir = vec2(0.0);
  float near = 1.0 - smoothstep(0.5, 2.2, sandNearAltarLaver(p));
  if (near <= 0.0) return 0.0;
  const float S = 0.45;
  vec2 cell = floor(p / S);
  float h1 = sandHash(cell + 17.0);
  if (h1 > 0.6 * near) return 0.0;
  vec2 c = (cell + 0.3 + 0.4 * vec2(sandHash(cell + 3.1), sandHash(cell + 9.7))) * S;
  // Walking round the altar or the laver (either way), with some scatter.
  vec2 rc = p - (sandNearAltarLaverIsLaver(p) ? ${LAVER_XZ} : ${ALTAR_XZ});
  float a = atan(rc.x, -rc.y) + (sandHash(cell + 5.3) - 0.5) * 1.2 + step(0.5, sandHash(cell + 8.1)) * 3.1416;
  vec2 ax = vec2(cos(a), sin(a));
  vec2 d = p - c;
  vec2 lp = vec2(dot(d, ax), dot(d, vec2(-ax.y, ax.x)));
  lp.y *= 1.0 + 0.35 * smoothstep(-0.02, 0.1, lp.x); // wider at the ball than the heel
  float e = length(lp / vec2(0.13, 0.05));
  dir = -normalize(d + 1e-5);
  return (1.0 - smoothstep(0.75, 1.0, e)) * (0.6 + 0.4 * sandHash(cell + 1.9));
}
`;

// Blood at the bronze altar (Lev 1:5, 1:11, 4:7): the flock's burnt offerings were killed on its
// north side, and blood was dashed against its walls and poured out at its base. Dried into the
// sand, so dark rust-brown, not red: a ragged ring at the base (heaviest; G is the fresher,
// glossier pooled part), a matted patch north of the altar, and drops scattered round both.
// Over the north patch lies a larger, darker, redder layer (Kyle): the most-used ground.
// Painted once into a small texture round the altar (R stain, G pool, B the dark layer): one
// lookup in the sand shader instead of a dozen noise calls on every sand pixel.
const BLOOD_SIZE = 13; // m square round the altar...
const BLOOD_SHIFT = 1.5; // ...its centre this far north of the altar's (the patch reaches ~6 m out)
const BLOOD_RES = 448; // ~2.9 cm a texel
function bloodTexture() {
  const hash = (x, y) => {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (x, y) => 0.5 * noise(x, y) + 0.3 * noise(x * 2.13 + 3.7, y * 2.13 + 3.7) + 0.2 * noise(x * 4.57 + 9.1, y * 4.57 + 9.1);
  const smooth = (a, b, v) => { const t = Math.min(Math.max((v - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const ax = m(ALTAR.x), az = m(ALTAR.z), half = m(ALTAR.length / 2);
  const northZ = -(half + 2.15); // the patch's centre (z, from the altar's)
  const darkZ = -(half + 2.6); // the dark layer's centre
  const data = new Uint8Array(BLOOD_RES * BLOOD_RES * 4);
  const px = BLOOD_SIZE / BLOOD_RES;
  for (let j = 0; j < BLOOD_RES; j++) {
    for (let i = 0; i < BLOOD_RES; i++) {
      const ex = (i + 0.5) * px - BLOOD_SIZE / 2, ez = (j + 0.5) * px - BLOOD_SIZE / 2; // from the texture's centre
      const rx = ex, rz = ez - BLOOD_SHIFT;
      const x = ax + rx, z = az + rz;
      const qx = Math.abs(rx) - half, qz = Math.abs(rz) - half;
      const dA = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
      // Base ring: ragged outer edge, ~15-90 cm out from the walls. (Noise only where it can
      // reach: most of the square is bare sand.)
      const base = dA > 0.9 ? 0 : 1 - smooth(0.12, 0.4 + 0.5 * fbm(x * 2.6 + 4, z * 2.6 + 4), dA);
      const pool = base > 0 ? base * smooth(0.35, 0.65, fbm(x * 4 + 1.7, z * 4 + 1.7)) : 0;
      // The slaughter ground north of the altar: a matted patch with darker blotches in it.
      const cx = Math.abs(rx) - 1.1, cz = Math.abs(rz - northZ) - 1.5;
      const dN0 = Math.hypot(Math.max(cx, 0), Math.max(cz, 0)) - 0.45; // edge wobble is +/-0.6
      const dN = dN0 > 1.8 ? dN0 : dN0 + (fbm(x * 1.3 + 2, z * 1.3 + 2) - 0.5) * 1.2;
      const north = dN >= 0.45 ? 0 : (1 - smooth(-0.3, 0.45, dN)) * (0.55 + 0.45 * smooth(0.3, 0.75, fbm(x * 2.2 + 9, z * 2.2 + 9)));
      // The dark layer: a big rounded area (~3.4 x 3.2 m) over the north patch, ragged edged.
      const dD0 = (Math.hypot(rx / 1.7, (rz - darkZ) / 1.6) - 1) * 1.6;
      const dD = dD0 > 1 ? dD0 : dD0 + (fbm(x * 0.9 + 6, z * 0.9 + 6) - 0.5) * 1.1;
      const dark = dD >= 0.3 ? 0 : (1 - smooth(-0.45, 0.3, dD)) * (0.6 + 0.4 * smooth(0.3, 0.7, fbm(x * 1.8 + 13, z * 1.8 + 13)));
      // Drops and splashes: a few per 18 cm cell, densest near the walls and in the patch.
      const S = 0.18, gx = Math.floor(x / S), gz = Math.floor(z / S);
      const dens = 0.55 * (1 - smooth(0, 2.2, dA)) + 0.45 * (1 - smooth(-0.3, 1.2, dN));
      let drop = 0;
      if (dens > 0 && hash(gx + 41, gz + 41) < dens) {
        const dx = (gx + 0.2 + 0.6 * hash(gx + 43.1, gz + 43.1)) * S, dz = (gz + 0.2 + 0.6 * hash(gx + 47.9, gz + 47.9)) * S;
        const r = 0.015 + 0.04 * hash(gx + 53.3, gz + 53.3) * hash(gx + 59.7, gz + 59.7);
        drop = 1 - smooth(r * 0.6, r, Math.hypot(x - dx, z - dz));
      }
      // Faded to nothing at the texture's edge.
      const edge = 1 - smooth(BLOOD_SIZE / 2 - 0.8, BLOOD_SIZE / 2 - 0.1, Math.max(Math.abs(ex), Math.abs(ez)));
      const st = Math.min(Math.max(base, north, drop * 0.85), 1) * edge;
      const k = (j * BLOOD_RES + i) * 4;
      data[k] = Math.round(st * 255);
      data[k + 1] = Math.round(pool * edge * 255);
      data[k + 2] = Math.round(dark * edge * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, BLOOD_RES, BLOOD_RES, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Sand material: the texture is sampled at two scales/rotations blended by world noise
 * (no visible tiling), with broad tone patches and gravelly darker areas, and wind ripples
 * that perturb the normal (faded out with distance before they alias).
 */
function sandMaterial() {
  const tex = sandTexture();
  const size = 600;
  tex.repeat.set(size / TILE, size / TILE);
  const mat = new THREE.MeshStandardMaterial({
    name: 'sand',
    color: 0xffffff,
    map: tex,
    bumpMap: tex,
    bumpScale: 1.2,
    roughness: 1,
  });
  // Albedo of the open plain away from the court (multiplier; see the map_fragment patch).
  mat.userData.far = { value: new THREE.Color(0.32, 0.29, 0.25) };
  mat.userData.blood = { value: bloodTexture() };
  mat.userData.bloodRect = { value: new THREE.Vector4(m(ALTAR.x) - BLOOD_SIZE / 2, m(ALTAR.z) - BLOOD_SHIFT - BLOOD_SIZE / 2, 1 / BLOOD_SIZE, 1 / BLOOD_SIZE) };
  mat.onBeforeCompile = (shader) => {
    bindAOUniforms(shader);
    shader.uniforms.uAoGround = AO.uAoGround;
    shader.uniforms.uAoGroundTex = AO.uAoGroundTex;
    shader.uniforms.uAoGroundRect = AO.uAoGroundRect;
    shader.uniforms.uSandFar = mat.userData.far;
    shader.uniforms.uSandBlood = mat.userData.blood;
    shader.uniforms.uSandBloodRect = mat.userData.bloodRect;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSandPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSandPos;\n${WORLD_NOISE_GLSL}\n${TROD_GLSL}\n${AO_PARS_GLSL}
uniform float uAoGround;
uniform sampler2D uAoGroundTex;
uniform vec4 uAoGroundRect;
uniform vec3 uSandFar;
uniform sampler2D uSandBlood;
uniform vec4 uSandBloodRect;`)
      .replace(
        '#include <map_fragment>',
        `float sandTrod = sandTrodden(vSandPos.xz);
vec2 sandPrintDir;
float sandPrint = sandPrints(vSandPos.xz, sandPrintDir) * sandTrod;
vec2 sandBlUv = (vSandPos.xz - uSandBloodRect.xy) * uSandBloodRect.zw;
vec3 sandBlTex = texture2D(uSandBlood, clamp(sandBlUv, 0.0, 1.0)).rgb; // zero at its edges
float sandBl = sandBlTex.r, sandPool = sandBlTex.g, sandBlDark = sandBlTex.b;
// Grain sparkle: a few sand grains per cm² are quartz facets that catch the firelight. One
// random facet per 7 mm cell, world-anchored (stable), faded out before a cell gets smaller than
// a pixel so it never turns into shimmer.
float sandSpark = 0.0;
vec3 sandFacet = vec3(0.0, 1.0, 0.0);
{
  const float G = 0.007;
  vec2 gc = mod(floor(vSandPos.xz / G), 8192.0);
  float cpp = max(fwidth(vSandPos.x), fwidth(vSandPos.z)) / G;
  float h = sandHash(gc);
  sandSpark = step(0.945, h) * (1.0 - smoothstep(0.6, 1.4, cpp)) * (1.0 - 0.7 * sandTrod);
  sandFacet = normalize(vec3(sandHash(gc + 11.3) * 2.0 - 1.0, 1.1, sandHash(gc + 23.9) * 2.0 - 1.0));
}
{
  vec2 wp = vSandPos.xz;
  vec4 sA = texture2D(map, vMapUv);
  // Second lookup: different scale and a rotation, blended in by low-frequency noise.
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  vec4 sB = texture2D(map, rot * wp / ${(TILE * 1.37).toFixed(3)} + 0.31);
  float blend = smoothstep(0.3, 0.7, wvFbm(wp * 0.21 + 7.0));
  vec4 s = mix(sA, sB, blend);
  diffuseColor *= s;
  // Broad tone patches (8-40 m) and gravelly darker, greyer areas.
  float macro = wvFbm(wp * 0.035);
  diffuseColor.rgb *= mix(0.8, 1.12, macro);
  float gravel = smoothstep(0.55, 0.8, wvFbm(wp * 0.11 + 3.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.76, 0.76), gravel * 0.7);
  // Cooler, less orange night sand: the firelight warms it where it falls, the rest stays a
  // pale grey-beige under the sky.
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, 0.68) * vec3(0.97, 0.99, 1.04);
  // Relief: wind-sorted paler crests, darker, coarser swales.
  diffuseColor.rgb *= 1.0 + 0.35 * clamp(vSandPos.y, -0.5, 0.5);
  // Trodden paths: compacted, darker and greyer; footprints a shade darker still.
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72, 0.7, 0.69), sandTrod * 0.85);
  diffuseColor.rgb *= 1.0 - 0.24 * sandPrint;
  // Blood soaked into the sand at the altar (bloodTexture): dried rust-brown, darker where pooled.
  diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.3, 0.15, 0.12), vec3(0.13, 0.04, 0.03), sandPool), sandBl * 0.95);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.55, 0.26, 0.23), sandBlDark * 0.9); // the darker, redder layer to the north
  // Away from the court the open plain is darker and a touch warmer (less sky-grey): under the
  // moon and sky fill alone the pale sand would read as snow from above the camp; the court's
  // firelight stays the bright focus.
  // Distance from the court's rectangle: full darkening ~40 m out, over the camp.
  float sandFar = smoothstep(4.0, 40.0, length(max(abs(vSandPos.xz) - vec2(${f3(HX)}, ${f3(HZ)}), 0.0)));
  diffuseColor.rgb *= mix(vec3(1.0), uSandFar, sandFar);
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 sandN0 = normal;
#include <normal_fragment_maps>
normal = normalize(mix(normal, sandN0, sandTrod * 0.7)); // compacted: grain relief pressed flat
{
  // Wind ripples (~13 cm wavelength) in patches, along a slowly wandering direction.
  vec2 wp = vSandPos.xz;
  float warp = wvFbm(wp * 0.15) * 6.0;
  vec2 dir = normalize(vec2(1.0, 0.35));
  float phase = dot(wp, dir) * 48.0 + warp * 6.0 + 2.0 * sin(dot(wp, vec2(-0.35, 1.0)) * 1.3);
  float fw = fwidth(phase);
  float fade = (1.0 - smoothstep(0.25, 0.9, fw)) * smoothstep(0.35, 0.65, wvFbm(wp * 0.08 + 11.0)) * (1.0 - sandTrod);
  // Asymmetric ripple profile: gentle windward slope, steeper lee side.
  float sl = cos(phase) + 0.35 * cos(2.0 * phase + 0.7);
  vec3 grad = vec3(dir.x, 0.0, dir.y) * sl * 0.14 * fade;
  normal = normalize(normal - (viewMatrix * vec4(grad, 0.0)).xyz);
  // Footprint walls: the sand slopes up out of each print.
  normal = normalize(normal + (viewMatrix * vec4(sandPrintDir.x, 0.0, sandPrintDir.y, 0.0)).xyz * 0.45 * sandPrint * (1.0 - sandPrint));
  normal = normalize(mix(normal, (viewMatrix * vec4(sandFacet, 0.0)).xyz, sandSpark));
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.8, sandTrod * 0.7);
roughnessFactor = mix(roughnessFactor, 0.13, sandSpark * (1.0 - sandBl));
roughnessFactor = mix(roughnessFactor, 0.55, sandPool * 0.6); // the freshest blood keeps a dull sheen`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
{
  // Baked contact AO (scene/ao.js): soft darkening round everything standing on the sand.
  vec2 aoUv = (vSandPos.xz - uAoGroundRect.xy) * uAoGroundRect.zw;
  float aoIn = step(0.0, aoUv.x) * step(aoUv.x, 1.0) * step(0.0, aoUv.y) * step(aoUv.y, 1.0);
  float aoVisG = 1.0 - aoIn * uAoGround * uAoOn * (1.0 - texture2D(uAoGroundTex, clamp(aoUv, 0.0, 1.0)).r);
  ${aoApplyGlsl('aoVisG')}
}`,
      );
  };
  mat.customProgramCacheKey = () => 'sand-v6';
  return mat;
}

/**
 * The sand mesh on the relief: terrain.js GROUND_GRID (graded: 4 m cells near the centre,
 * coarser out in the fog), heights and normals from the analytic relief, same triangulation
 * that terrain.js groundHeight() interpolates. ~5k vertices: every triangle edge costs some
 * quad overshading of the (heavy) sand shader, so the grid is kept coarse.
 */
function reliefGeometry() {
  const { xs, n, h } = GROUND_GRID;
  const pos = new Float32Array(n * n * 3), nrm = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  const e = 0.75;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i, x = xs[i], z = xs[j];
      pos.set([x, h[k], z], k * 3);
      const hx = (reliefHeight(x + e, z) - reliefHeight(x - e, z)) / (2 * e);
      const hz = (reliefHeight(x, z + e) - reliefHeight(x, z - e)) / (2 * e);
      const l = Math.hypot(hx, 1, hz);
      nrm.set([-hx / l, 1 / l, -hz / l], k * 3);
      uv.set([x / 600 + 0.5, 0.5 - z / 600], k * 2); // as PlaneGeometry(600, 600) laid flat
    }
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1; // a = (x0, z0), b = (x1, z0), c = (x0, z1)
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export function createGround() {
  const group = new THREE.Group();
  group.name = 'ground';
  const geo = reliefGeometry();
  const mesh = new THREE.Mesh(geo, sandMaterial());
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.colliders = [];
  group.userData.material = mesh.material; // shared with the torch mounds (torches.js)
  return group;
}
