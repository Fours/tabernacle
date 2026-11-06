import * as THREE from 'three';

// Shared pieces of the fire modules: GLSL chunks (noise, billboarding, additive fog, hash) and
// small JS helpers (seeded random, instanced quads, 1D flicker noise, fog uniforms).

export const NOISE_GLSL = /* glsl */ `
float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), u.x),
             mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fFbm(vec2 p) {
  return 0.55 * fNoise(p) + 0.3 * fNoise(p * 2.07 + 1.7) + 0.15 * fNoise(p * 4.31 + 3.1);
}
`;

// Billboard helper: offsets a view-space center by a quad corner, with the quad's "up"
// following world up as projected on screen (so flames and smoke stay upright when the camera
// looks down), falling back to screen-up when looking straight down.
export const BILLBOARD_GLSL = /* glsl */ `
vec4 billboard(vec3 center, vec2 corner, float size, float stretch) {
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  vec2 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xy;
  float l = length(up);
  up = l > 0.15 ? up / l : vec2(0.0, 1.0);
  vec2 right = vec2(up.y, -up.x);
  float st = mix(1.0, stretch, clamp(l, 0.0, 1.0));
  mv.xy += right * corner.x * size + up * corner.y * size * st;
  return mv;
}
`;

// Fog for additive sprites: fade toward black (adding the fog color would brighten them).
export const FOG_ADDITIVE_GLSL = /* glsl */ `
#include <fog_pars_fragment>
float fogAmount() {
#if defined(USE_FOG) && defined(ATMO_FOG)
  return atmoFogAmount(); // FogExp2 plus the ground haze (render/atmosphere.js)
#elif defined(USE_FOG)
  #ifdef FOG_EXP2
  return 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
  return smoothstep(fogNear, fogFar, vFogDepth);
  #endif
#else
  return 0.0;
#endif
}
`;

// Blackbody-like ramp in linear HDR: dull red at the edges and tips, orange, yellow body, a
// pale yellow core (scaled by \`core\`). Values stay finite and positive (bloom-safe). Shared by
// the flame sheets and the pillar of fire.
export const FIRE_RAMP_GLSL = /* glsl */ `
vec3 fireRampCore(float t, float core) {
  vec3 c = mix(vec3(0.14, 0.01, 0.0), vec3(0.7, 0.085, 0.005), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.3, 0.34, 0.03), smoothstep(0.25, 0.6, t));
  c = mix(c, vec3(1.7, 0.7, 0.1), smoothstep(0.55, 0.85, t));
  return mix(c, vec3(2.2, 1.25, 0.36) * core, smoothstep(0.88, 1.0, t));
}
`;

// The flame language shared by the altar/torch flame volume (fireVolume.js) and the pillar of
// fire: lookups into the tiling 3D noise (createNoiseTexture), in units of a flame height.
// - flameRise: the buoyant frame. Noise is sampled at g = sqrt(height) and scrolled in g, so
//   features rise slowly at the bed, accelerate upward and stretch as they climb.
// - flameWarp: large, slow eddies bending the tongues side to side (more so higher, v = 0..1
//   up the flame), faded out by `detail` (0..1, by screen size).
// - flameFine: fine, fast turbulence; flameTongue: upward-stretched tongue cells rising with
//   the flow; flameMix: fine noise dominating low, tongues higher, centred and scaled (about
//   ±1.6) to erode the heat.
// - flameShade: heat → density and temperature (the input of FIRE_RAMP_GLSL).
export const FLAME_GLSL = /* glsl */ `
uniform sampler3D uNoise;
float tn(vec3 p) { return texture(uNoise, p).r; }
float flameRise(float y) { return sqrt(max(y, 0.0) + 0.05); }
vec2 flameWarp(vec2 xz, float g, float v, float T, vec3 seed, float detail) {
  vec3 wq = vec3(xz.x * 0.8, g * 0.5 - T * 0.33, xz.y * 0.8) + seed;
  vec2 warp = vec2(tn(wq), tn(wq + vec3(0.43, 0.17, 0.61))) - 0.5;
  return xz + warp * (0.12 + 0.3 * v) * detail;
}
float flameFine(vec2 xz, float g, float T, vec3 seed, float detail) {
  return mix(0.5, tn(vec3(xz.x * 4.1, (g - T * 1.3) * 1.5, xz.y * 4.1) + seed.yzx), detail);
}
float flameTongue(vec2 xz, float g, float T, vec3 seed) {
  return tn(vec3(xz.x * 1.73, (g - T * 0.78) * 0.55, xz.y * 1.73) + seed.zxy);
}
float flameMix(float nF, float nT, float v) {
  return (mix(nF, nT, smoothstep(0.0, 0.6, v) * 0.5 + 0.35) - 0.5) * 3.2;
}
vec2 flameShade(float heat, float v) {
  return vec2(smoothstep(0.0, 0.2, heat), clamp(0.36 + 0.55 * heat - 0.15 * v, 0.0, 1.0));
}
`;

export const HASH_GLSL = /* glsl */ `
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
`;

/** Per-material copy of three's fog uniforms (filled in by the renderer when scene.fog is set). */
export const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/** Deterministic pseudo-random generator. */
export function rng(seed) {
  let s = (seed * 16807) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function randAttribute(count, rnd) {
  const a = new Float32Array(count * 4);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return a;
}

// Smooth 1D value noise in [-1, 1] for the light flicker.
const hash1 = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash1(i) + (hash1(i + 1) - hash1(i)) * u) * 2 - 1;
}

// Tiling 3D value noise texture, shared by the pillar of fire and the flame volumes.
const NOISE_SIZE = 64; // texels per side
const NOISE_CELLS = 8; // lattice cells per tile (8 texels per cell, smooth under trilinear)

/** Tiling 3D value noise (quintic-interpolated lattice), one byte per texel. */
export function createNoiseTexture(seed) {
  const rnd = rng(seed);
  const C = NOISE_CELLS, N = NOISE_SIZE, s = N / C;
  const lat = new Float32Array(C * C * C);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const L = (x, y, z) => lat[((z % C) * C + (y % C)) * C + (x % C)];
  const fade = new Float32Array(s);
  for (let i = 0; i < s; i++) {
    const f = i / s;
    fade[i] = f * f * f * (f * (f * 6 - 15) + 10);
  }
  const data = new Uint8Array(N * N * N);
  let k = 0;
  for (let z = 0; z < N; z++) {
    const cz = Math.floor(z / s), wz = fade[z % s];
    for (let y = 0; y < N; y++) {
      const cy = Math.floor(y / s), wy = fade[y % s];
      for (let x = 0; x < N; x++) {
        const cx = Math.floor(x / s), wx = fade[x % s];
        const x0 = cx, x1 = cx + 1, y0 = cy, y1 = cy + 1, z0 = cz, z1 = cz + 1;
        const a = L(x0, y0, z0) + (L(x1, y0, z0) - L(x0, y0, z0)) * wx;
        const b = L(x0, y1, z0) + (L(x1, y1, z0) - L(x0, y1, z0)) * wx;
        const c = L(x0, y0, z1) + (L(x1, y0, z1) - L(x0, y0, z1)) * wx;
        const d = L(x0, y1, z1) + (L(x1, y1, z1) - L(x0, y1, z1)) * wx;
        const v = (a + (b - a) * wy) + ((c + (d - c) * wy) - (a + (b - a) * wy)) * wz;
        data[k++] = Math.round(v * 255);
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
