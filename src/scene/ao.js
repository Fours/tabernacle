import * as THREE from 'three';

// Ambient occlusion without a screen-space pass (DECISIONS, "Rendering"). Three parts, all
// folded into existing draws (0 extra draw calls):
// - Ground contact AO: scene modules list their footprints as `userData.aoShapes` (circles,
//   boxes, segments in world XZ, each with a falloff `spread` in m and a strength `k`); main.js
//   bakes them once into a single-channel texture over the court (`bakeGroundAO`) that the
//   sand shader samples (ground.js).
// - Global terms in the interior light mask's patch (interiorLight.js, every lit material):
//   surfaces near the ground and not facing up darken (the foot of everything), and inside the
//   tent the walls, ceiling, west wall and veil darken each other where they meet.
// - Crease AO on generated geometry (`addBoxAO`): analytic occlusion from a few boxes placed
//   where the geometry overhangs (the altar's ledge, the pillars' capitals and sockets, the
//   ark's crown), per material.
// Every term multiplies the indirect light (sky fill, environment, the tent's room ambient)
// fully and the direct light only by `uAoDirect`, so the altar's real shadow isn't doubled.

/** Shared uniforms. `?ao=0` sets uAoOn to 0; window.__tabernacle.ao exposes them for tuning. */
export const AO = {
  uAoOn: { value: 1 },
  uAoDirect: { value: 0.7 }, // fraction of the AO applied to direct light
  uAoGround: { value: 1.0 }, // baked contact AO on the sand (scales the baked occlusion)
  uAoContact: { value: 0.45 }, // global: surfaces near the ground, not facing up
  uAoContactR: { value: 0.45 }, // m: height over which that fades out
  uAoRoom: { value: 0.55 }, // tent interior: walls/ceiling/veil where they meet
  uAoRoomR: { value: 1.1 }, // m: distance from a wall over which that fades out
  uAoCrease: { value: 0.6 }, // crease AO from addBoxAO
  uAoGroundTex: { value: null }, // baked visibility (R: 1 = open, 0 = fully occluded)
  uAoGroundRect: { value: new THREE.Vector4(0, 0, 1, 1) }, // minX, minZ, 1/sizeX, 1/sizeZ (m)
};

// ---- Ground contact shapes (world XZ, meters) -----------------------------------------------
// spread: falloff distance from the footprint's edge (m); k: occlusion at the edge (0..1).
export const aoCircle = (x, z, r, spread, k) => ({ type: 'circle', x, z, r, spread, k });
/** Box centred at (x, z) with full sizes sx, sz, rotated by yaw about +Y. */
export const aoBox = (x, z, sx, sz, spread, k, yaw = 0) =>
  ({ type: 'box', x, z, hx: sx / 2, hz: sz / 2, c: Math.cos(yaw), s: Math.sin(yaw), spread, k });
/** Capsule from (x1, z1) to (x2, z2) with radius r. */
export const aoSegment = (x1, z1, x2, z2, r, spread, k) => ({ type: 'seg', x1, z1, x2, z2, r, spread, k });

function shapeBounds(s) {
  const pad = s.spread;
  if (s.type === 'circle') return [s.x - s.r - pad, s.x + s.r + pad, s.z - s.r - pad, s.z + s.r + pad];
  if (s.type === 'box') {
    const ex = Math.abs(s.c) * s.hx + Math.abs(s.s) * s.hz, ez = Math.abs(s.s) * s.hx + Math.abs(s.c) * s.hz;
    return [s.x - ex - pad, s.x + ex + pad, s.z - ez - pad, s.z + ez + pad];
  }
  const p = s.r + pad;
  return [Math.min(s.x1, s.x2) - p, Math.max(s.x1, s.x2) + p, Math.min(s.z1, s.z2) - p, Math.max(s.z1, s.z2) + p];
}

/** Distance (m) from (x, z) to the shape's footprint; 0 inside. */
function shapeDist(s, x, z) {
  if (s.type === 'circle') return Math.max(Math.hypot(x - s.x, z - s.z) - s.r, 0);
  if (s.type === 'box') {
    const dx = x - s.x, dz = z - s.z;
    // Into the box's frame (same convention as colliders.js obb).
    const lx = Math.abs(dx * s.c - dz * s.s) - s.hx, lz = Math.abs(dx * s.s + dz * s.c) - s.hz;
    return Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
  }
  const ax = s.x2 - s.x1, az = s.z2 - s.z1;
  const t = Math.min(Math.max(((x - s.x1) * ax + (z - s.z1) * az) / Math.max(ax * ax + az * az, 1e-9), 0), 1);
  return Math.max(Math.hypot(x - s.x1 - ax * t, z - s.z1 - az * t) - s.r, 0);
}

/**
 * Bake the shapes into a visibility texture (R8, linear filtered) covering their bounds. Each
 * shape occludes k·(1 − d/spread)² at distance d outside its footprint (k inside); shapes
 * combine as 1 − Π(1 − occlusion). Sets AO.uAoGroundTex / uAoGroundRect. Returns the texture
 * and the bake time (ms).
 */
export function bakeGroundAO(shapes, { res = 0.04 } = {}) {
  const t0 = performance.now();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of shapes) {
    const [a, b, c, d] = shapeBounds(s);
    minX = Math.min(minX, a); maxX = Math.max(maxX, b); minZ = Math.min(minZ, c); maxZ = Math.max(maxZ, d);
  }
  // A clear margin so the clamped edge texels are fully open.
  minX -= 4 * res; maxX += 4 * res; minZ -= 4 * res; maxZ += 4 * res;
  const W = Math.ceil((maxX - minX) / res), H = Math.ceil((maxZ - minZ) / res);
  const vis = new Float32Array(W * H).fill(1);
  for (const s of shapes) {
    const [a, b, c, d] = shapeBounds(s);
    const i0 = Math.max(0, Math.floor((a - minX) / res)), i1 = Math.min(W - 1, Math.ceil((b - minX) / res));
    const j0 = Math.max(0, Math.floor((c - minZ) / res)), j1 = Math.min(H - 1, Math.ceil((d - minZ) / res));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + (j + 0.5) * res;
      for (let i = i0; i <= i1; i++) {
        const t = shapeDist(s, minX + (i + 0.5) * res, z) / s.spread;
        if (t >= 1) continue;
        vis[j * W + i] *= 1 - s.k * (1 - t) * (1 - t);
      }
    }
  }
  const data = new Uint8Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(vis[i] * 255);
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  AO.uAoGroundTex.value?.dispose();
  AO.uAoGroundTex.value = tex;
  AO.uAoGroundRect.value.set(minX, minZ, 1 / (W * res), 1 / (H * res));
  return { texture: tex, ms: performance.now() - t0, size: [W, H] };
}

// ---- Applying AO to the lighting ------------------------------------------------------------

/** GLSL (after `#include <aomap_fragment>`): scale reflectedLight by visibility `v`. */
export const aoApplyGlsl = (v) => /* glsl */ `
  reflectedLight.indirectDiffuse *= ${v};
  reflectedLight.indirectSpecular *= ${v};
  reflectedLight.directDiffuse *= mix(1.0, ${v}, uAoDirect);
  reflectedLight.directSpecular *= mix(1.0, ${v}, uAoDirect);`;

/**
 * GLSL declarations (guarded: several patches on one material may each include them).
 * aoOcc: occlusion (0..1) of a surface with normal n by an occluder at distance d in direction
 * `to` (unit), fading out by r; surfaces facing away get none, those facing it the most.
 * aoBoxOcc: the same from an axis-aligned box (centre c, half sizes e).
 */
export const AO_PARS_GLSL = /* glsl */ `
#ifndef AO_PARS
#define AO_PARS
uniform float uAoOn;
uniform float uAoDirect;
uniform float uAoCrease;
uniform float uAoContact;
uniform float uAoContactR;
uniform float uAoRoom;
uniform float uAoRoomR;
float aoOcc(float d, float r, vec3 n, vec3 to) {
  if (d <= 1e-4 || d >= r) return 0.0;
  float f = 1.0 - d / r;
  return clamp(0.5 + 0.6 * dot(n, to), 0.0, 1.0) * f * f;
}
float aoBoxOcc(vec3 p, vec3 n, vec3 c, vec3 e, float r) {
  vec3 q = p - c;
  vec3 dc = max(abs(q) - e, 0.0);
  float d = length(dc);
  if (d <= 1e-4 || d >= r) return 0.0;
  return aoOcc(d, r, n, -sign(q) * dc / d);
}
#endif
`;

/** Bind the AO uniforms (all but the ground texture) to a shader in onBeforeCompile. */
export function bindAOUniforms(shader) {
  for (const k of ['uAoOn', 'uAoDirect', 'uAoCrease', 'uAoContact', 'uAoContactR', 'uAoRoom', 'uAoRoomR']) shader.uniforms[k] = AO[k];
}

const f4 = (v) => v.toFixed(4);
const v3 = (a) => `vec3(${a.map(f4).join(', ')})`;

/**
 * Crease AO from boxes: each box {c: [x, y, z], e: [half sizes], r: falloff (m), k: strength}
 * darkens nearby surfaces of `mat` that face it (a surface on or inside a box gets none from
 * it). space 'world' uses world positions; 'local' the geometry's own coordinates before the
 * object and instance transforms (for instanced parts such as the courtyard pillars; their
 * instances must not rotate). Patches `onBeforeCompile` (chains any existing patch).
 */
export function addBoxAO(mat, boxes, { space = 'world', key = 'box' } = {}) {
  const prev = mat.onBeforeCompile;
  const terms = boxes.map((b) => `vis *= 1.0 - ${f4(b.k)} * uAoCrease * aoBoxOcc(p, n, ${v3(b.c)}, ${v3(b.e)}, ${f4(b.r)});`).join('\n  ');
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    bindAOUniforms(shader);
    const pos = space === 'local' ? 'transformed' : 'aoW.xyz';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAoBoxPos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
{
  vec4 aoW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  aoW = instanceMatrix * aoW;
  #endif
  aoW = modelMatrix * aoW;
  vAoBoxPos = ${pos};
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAoBoxPos;\n${AO_PARS_GLSL}`)
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
{
  vec3 p = vAoBoxPos;
  vec3 n = inverseTransformDirection(geometryNormal, viewMatrix);
  float vis = 1.0;
  ${terms}
  vis = mix(1.0, vis, uAoOn);
  ${aoApplyGlsl('vis')}
}`,
      );
  };
  const own = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey.bind(mat) : null;
  const prevSrc = prev ? prev.toString() : '';
  mat.customProgramCacheKey = () => `${own ? own() : prevSrc}|boxao-${key}`;
  mat.needsUpdate = true;
  return mat;
}
