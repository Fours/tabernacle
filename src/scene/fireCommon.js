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
#ifdef USE_FOG
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

/** Instanced camera-facing quads (one draw call). */
export function quadParticles(count, rnd, bounds) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(randAttribute(count, rnd), 4));
  geo.instanceCount = count;
  geo.boundingSphere = bounds.clone();
  geo.boundingBox = null;
  return geo;
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
