import * as THREE from 'three';
import { TABERNACLE as T, m } from '../config/dimensions.js';

// Night atmosphere in the fog term: a thin ground-hugging haze on top of the scene's FogExp2,
// and the glow of the fires seen through the air (analytic in-scattering, no extra passes).
//
// `installAtmosphereChunks()` replaces three's fog shader chunks before anything compiles, so
// every built-in material and every custom ShaderMaterial that includes the fog chunks gets the
// same fog. The vertex chunk passes the world position; the fragment chunk then, for the view
// ray from the camera to the fragment:
// - Height haze: optical depth of an exponential height profile (density `uAtmoHaze` per metre
//   at the ground, falling off by `uAtmoFalloff` per metre of height), integrated in closed form
//   along the ray and modulated by a slowly drifting 2D noise. Mixes toward `uAtmoHazeColor`.
// - Glows: for each source (a point with a core radius), the single-scattered light of a point
//   source along the ray, ∫ I σ p / r² dt, which has the closed form
//   I σ p / h · [atan((t1 − tS)/h) − atan((t0 − tS)/h)] with h the ray's closest approach to
//   the source and tS where it happens. σ is a thin base air density plus the haze density at
//   the closest point; p a Henyey-Greenstein phase (forward scattering: tight halos round the
//   flames, little brown wash over the whole sky); the result is dimmed by the night fog between
//   the source and the eye.
// - The part of the ray inside the tent (the interior box) gets neither: the haze and glows are
//   the outside air's. Step 10 does the interior atmosphere.
// Additive sprites use `atmoFogAmount()` (via FOG_ADDITIVE_GLSL) to fade toward black. The sky
// dome (no fog) calls `atmoSky()` so the halos and the horizon haze continue against the sky.
// Materials get the shared uniforms through `applyAtmosphere(root)`; a material that misses
// them reads uAtmoOn = 0 and keeps plain FogExp2.

export const ATMO_GLOWS = 8;

const f = (v) => v.toFixed(4);
const BOX_MIN = [m(T.interiorMinX), -1, -m(T.interiorWidth / 2)];
const BOX_MAX = [m(T.interiorMaxX), m(T.interiorHeight), m(T.interiorWidth / 2)];

/** Shared uniforms (tunable live through window.__tabernacle.atmosphere). */
export const ATMO = {
  uAtmoOn: { value: 1 },
  uAtmoHaze: { value: 0.05 }, // haze extinction at the ground, 1/m
  uAtmoFalloff: { value: 1.3 }, // 1/m: the haze thins to ~14% by 1.5 m
  uAtmoHazeColor: { value: new THREE.Color() }, // set from the fog colour in main.js
  uAtmoNoise: { value: 0.7 }, // how patchy the haze is (0 = uniform)
  uAtmoNoiseScale: { value: 0.06 }, // 1/m
  uAtmoWind: { value: new THREE.Vector2(0.22, 0.09) }, // m/s drift of the haze pattern
  uAtmoTime: { value: 0 },
  uAtmoScatter: { value: 0.003 }, // base scattering of the night air for the glows, 1/m
  uAtmoGlowHaze: { value: 0.5 }, // how much the ground haze adds to the glows' scattering
  uAtmoG: { value: 0.6 }, // Henyey-Greenstein forward-scattering of the haze (0 = isotropic)
  uAtmoFogD: { value: 0.012 }, // FogExp2 density (glow extinction; the sky has no fog uniform)
  uAtmoGlowPos: { value: Array.from({ length: ATMO_GLOWS }, () => new THREE.Vector4(0, -1000, 0, 1)) }, // xyz m, w core radius m
  // rgb: linear colour × cd × gain; w: the halo's reach (m)
  uAtmoGlowCol: { value: Array.from({ length: ATMO_GLOWS }, () => new THREE.Vector4(0, 0, 0, 1)) },
};

/** GLSL shared by the fog chunk and the sky: uniforms, haze and glow integrals. */
export const ATMO_GLSL = /* glsl */ `
#define ATMO_GLOWS ${ATMO_GLOWS}
uniform float uAtmoOn;
uniform float uAtmoHaze;
uniform float uAtmoFalloff;
uniform vec3 uAtmoHazeColor;
uniform float uAtmoNoise;
uniform float uAtmoNoiseScale;
uniform vec2 uAtmoWind;
uniform float uAtmoTime;
uniform float uAtmoScatter;
uniform float uAtmoGlowHaze;
uniform float uAtmoG;
uniform float uAtmoFogD;
uniform vec4 uAtmoGlowPos[ATMO_GLOWS];
uniform vec4 uAtmoGlowCol[ATMO_GLOWS];

float atmoHash(vec2 p) { // sin-free hash (cheap; this runs for every fogged fragment)
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float atmoVNoise(vec2 p) {
  vec2 i = floor(p), u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(atmoHash(i), atmoHash(i + vec2(1.0, 0.0)), u.x),
             mix(atmoHash(i + vec2(0.0, 1.0)), atmoHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Patchiness of the haze around a world point (mean ~1).
float atmoPatch(vec2 xz) {
  if (uAtmoNoise <= 0.0) return 1.0;
  vec2 q = xz * uAtmoNoiseScale - uAtmoWind * uAtmoNoiseScale * uAtmoTime;
  float n = 0.65 * atmoVNoise(q) + 0.35 * atmoVNoise(q * 2.3 + vec2(5.2, 1.3) + uAtmoTime * 0.013);
  return mix(1.0, 0.25 + 1.5 * n, uAtmoNoise);
}
// The outside part [s0, s1] of the ray c + d t, t in [0, L]: the tent's interior box is cut out
// (from the camera to where the ray leaves the box, or from where it enters the box onward).
vec2 atmoSpan(vec3 c, vec3 d, float L) {
  vec3 inv = 1.0 / (d + vec3(equal(d, vec3(0.0))) * 1e-6);
  vec3 ta = (vec3(${f(BOX_MIN[0])}, ${f(BOX_MIN[1])}, ${f(BOX_MIN[2])}) - c) * inv;
  vec3 tb = (vec3(${f(BOX_MAX[0])}, ${f(BOX_MAX[1])}, ${f(BOX_MAX[2])}) - c) * inv;
  vec3 tn = min(ta, tb), tx = max(ta, tb);
  float a = max(max(tn.x, tn.y), tn.z);
  float b = min(min(tx.x, tx.y), tx.z);
  if (b <= a || b <= 0.0) return vec2(0.0, L); // misses the box
  if (a < 0.0) return vec2(min(b, L), L); // the camera is inside
  return vec2(0.0, min(a, L));
}
// Optical depth of the height haze along [s0, s1] (closed form for an exponential profile).
float atmoHazeDepth(vec3 c, vec3 d, vec2 s) {
  float y0 = max(c.y + d.y * s.x, 0.0), y1 = max(c.y + d.y * s.y, 0.0);
  float b = uAtmoFalloff;
  float e0 = exp(-b * y0), e1 = exp(-b * y1);
  float dy = (y1 - y0) * b;
  float avg = abs(dy) > 1e-3 ? (e0 - e1) / dy : e0;
  return uAtmoHaze * max(s.y - s.x, 0.0) * avg;
}
// Light of the glow sources scattered toward the eye along [s0, s1].
vec3 atmoGlow(vec3 c, vec3 d, vec2 s, float pch) {
  vec3 sum = vec3(0.0);
  float g2 = uAtmoG * uAtmoG;
  for (int i = 0; i < ATMO_GLOWS; i++) {
    vec4 g = uAtmoGlowPos[i];
    vec3 toS = g.xyz - c;
    float tS = dot(toS, d);
    float dd = dot(toS, toS);
    float h = sqrt(max(dd - tS * tS, 0.0) + g.w * g.w);
    vec4 gc = uAtmoGlowCol[i];
    if (h > 6.0 * gc.w) continue; // beyond the halo's reach (< 0.25%)
    float I = (atan((s.y - tS) / h) - atan((s.x - tS) / h)) / h;
    float yc = max(c.y + d.y * clamp(tS, s.x, s.y), 0.0);
    float sigma = uAtmoScatter + uAtmoGlowHaze * uAtmoHaze * pch * exp(-uAtmoFalloff * yc);
    float ext = exp(-uAtmoFogD * uAtmoFogD * dd);
    // Phase: Henyey-Greenstein at the angle between the view ray and the source as seen from
    // the camera (exact near the eye, where most of a distant source's halo is scattered).
    float ct = tS * inversesqrt(max(dd, 1e-6));
    float q = 1.0 + g2 - 2.0 * uAtmoG * ct;
    float phase = (1.0 - g2) / (q * sqrt(q));
    // Reach: the haze swallows each source's light within some metres (extinction and
    // multiple scattering), so the glow is a halo round the fire, not a wash over the sky.
    sum += gc.rgb * (max(I, 0.0) * sigma * ext * phase * exp(-h / gc.w));
  }
  return sum * 0.0795775; // 1 / (4 pi)
}
// Sky (no geometry): the ray runs out to the dome.
vec3 atmoSky(vec3 col, vec3 dir) {
  if (uAtmoOn <= 0.0) return col;
  vec3 c = cameraPosition;
  vec2 s = atmoSpan(c, dir, 3000.0);
  float tau = atmoHazeDepth(c, dir, s);
  col = mix(col, uAtmoHazeColor, 1.0 - exp(-tau));
  return col + atmoGlow(c, dir, s, 1.0);
}
`;

const PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif
`;

const VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);
#endif
`;

const PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #define ATMO_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${ATMO_GLSL}
  float atmoBaseFog() {
  #ifdef FOG_EXP2
    return 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    return smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  }
  float atmoHazeTau() {
    if (uAtmoOn <= 0.0) return 0.0;
    vec3 c = cameraPosition;
    vec3 r = vFogWorld - c;
    float L = length(r);
    vec3 d = r / max(L, 1e-4);
    return atmoHazeDepth(c, d, atmoSpan(c, d, L)) * atmoPatch(vFogWorld.xz) * uAtmoOn;
  }
  // Total fog amount for additive sprites (they fade toward black, never toward the fog colour).
  float atmoFogAmount() {
    return 1.0 - (1.0 - atmoBaseFog()) * exp(-atmoHazeTau());
  }
  // Night fog, ground haze and the fires' glow in the air, applied to a surface colour.
  vec3 atmoApply(vec3 col) {
    col = mix(col, fogColor, atmoBaseFog());
    if (uAtmoOn <= 0.0) return col;
    vec3 c = cameraPosition;
    vec3 r = vFogWorld - c;
    float L = length(r);
    vec3 d = r / max(L, 1e-4);
    vec2 s = atmoSpan(c, d, L);
    float pch = atmoPatch(vFogWorld.xz);
    float tau = atmoHazeDepth(c, d, s) * pch;
    col = mix(col, uAtmoHazeColor, (1.0 - exp(-tau)) * uAtmoOn);
    return col + atmoGlow(c, d, s, pch) * uAtmoOn;
  }
#endif
`;

const FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = atmoApply(gl_FragColor.rgb);
#endif
`;

/** Replace three's fog chunks. Call once at startup, before any material compiles. */
export function installAtmosphereChunks() {
  THREE.ShaderChunk.fog_pars_vertex = PARS_VERTEX;
  THREE.ShaderChunk.fog_vertex = VERTEX;
  THREE.ShaderChunk.fog_pars_fragment = PARS_FRAGMENT;
  THREE.ShaderChunk.fog_fragment = FRAGMENT;
}

const patched = new WeakSet();

/** Give one fogged material the shared atmosphere uniforms (no shader change, no recompile). */
export function addAtmosphere(mat) {
  if (!mat || patched.has(mat) || !mat.fog) return;
  patched.add(mat);
  if (mat.isShaderMaterial) {
    if (!mat.isRawShaderMaterial) Object.assign(mat.uniforms, ATMO);
    return;
  }
  const prev = mat.onBeforeCompile;
  // Keep the program cache identity: three's default key is onBeforeCompile's source.
  if (!Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey')) {
    const prevSrc = prev.toString();
    mat.customProgramCacheKey = () => prevSrc;
  }
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, ATMO);
  };
}

/** Patch every fogged material under `root`. Call once after the scene is assembled. */
export function applyAtmosphere(root) {
  root.traverse((o) => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(addAtmosphere);
  });
}

/**
 * Glow sources, filled each frame (no allocations).
 * @param {{pos: THREE.Vector3, radius: number, reach: number, color: THREE.Color, gain: number,
 *   intensity: () => number}[]} sources  pos in world metres; radius: core (m); reach: halo
 *   falloff (m); intensity in candela.
 */
export function createAtmosphere(sources) {
  if (sources.length > ATMO_GLOWS) throw new Error(`atmosphere: at most ${ATMO_GLOWS} glow sources`);
  const pos = ATMO.uAtmoGlowPos.value;
  const col = ATMO.uAtmoGlowCol.value;
  sources.forEach((s, i) => pos[i].set(s.pos.x, s.pos.y, s.pos.z, s.radius));
  return {
    uniforms: ATMO,
    sources,
    update(time) {
      ATMO.uAtmoTime.value = time % 3600;
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        const k = s.intensity() * s.gain;
        col[i].set(s.color.r * k, s.color.g * k, s.color.b * k, s.reach);
      }
    },
  };
}
