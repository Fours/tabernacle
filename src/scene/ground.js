import * as THREE from 'three';
import { WORLD_NOISE_GLSL } from './materials.js';
import { AO, AO_PARS_GLSL, aoApplyGlsl, bindAOUniforms } from './ao.js';
import { GROUND_HEIGHT_GLSL } from './terrain.js';
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
 * the ground bare, used to clear the scatter off them (main.js).
 */
export function isTrodden(x, z, r = 0) {
  if (x < TABERNACLE.interiorMaxX - 3 || x > HX + 9 || Math.abs(z) > HZ) return false;
  const [ax, az] = [m(ALTAR.x), m(ALTAR.z)], [lx, lz] = [m(LAVER.x), m(LAVER.z)];
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
  mat.onBeforeCompile = (shader) => {
    bindAOUniforms(shader);
    shader.uniforms.uAoGround = AO.uAoGround;
    shader.uniforms.uAoGroundTex = AO.uAoGroundTex;
    shader.uniforms.uAoGroundRect = AO.uAoGroundRect;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSandPos;\n${GROUND_HEIGHT_GLSL}`)
      // Relief (terrain.js): displace the flat grid and take the normal from the height field.
      .replace(
        '#include <beginnormal_vertex>',
        `vec2 sandXZ = (modelMatrix * vec4(position, 1.0)).xz;
vec3 objectNormal;
{
  const float e = 0.75;
  float hx = groundHeight(sandXZ + vec2(e, 0.0)) - groundHeight(sandXZ - vec2(e, 0.0));
  float hz = groundHeight(sandXZ + vec2(0.0, e)) - groundHeight(sandXZ - vec2(0.0, e));
  objectNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
}`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += groundHeight(sandXZ);')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSandPos;\n${WORLD_NOISE_GLSL}\n${TROD_GLSL}\n${AO_PARS_GLSL}
uniform float uAoGround;
uniform sampler2D uAoGroundTex;
uniform vec4 uAoGroundRect;`)
      .replace(
        '#include <map_fragment>',
        `float sandTrod = sandTrodden(vSandPos.xz);
vec2 sandPrintDir;
float sandPrint = sandPrints(vSandPos.xz, sandPrintDir) * sandTrod;
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
roughnessFactor = mix(roughnessFactor, 0.13, sandSpark);`,
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
  mat.customProgramCacheKey = () => 'sand-v3';
  return mat;
}

export function createGround() {
  const group = new THREE.Group();
  group.name = 'ground';
  // 2 m grid: the relief's shortest waves are ~19 m, so the mesh follows groundHeight() to ~1 cm.
  const geo = new THREE.PlaneGeometry(600, 600, 300, 300).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, sandMaterial());
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.colliders = [];
  return group;
}
