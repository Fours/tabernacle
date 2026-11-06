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
//   the outside air's. That part gets the room's own air instead (`atmoInterior`): a faint warm
//   haze, the menorah's glow in it (the same closed-form point-source integral, over the part of
//   the ray east of the veil only), and a thin layer of incense haze under the ceiling (linear
//   density ramp over its top `IN_CEIL` metres, integrated in closed form), denser toward the
//   incense altar and the veil and drifting slowly. West of the veil only a trace of haze, dim.
//   Rays from outside get the interior part from where they enter the box, so the door shows no
//   seam.
// Additive sprites use `atmoFogAmount()` (via FOG_ADDITIVE_GLSL) to fade toward black. The sky
// dome (no fog) calls `atmoSky()` so the halos and the horizon haze continue against the sky.
// Materials get the shared uniforms through `applyAtmosphere(root)`; a material that misses
// them reads uAtmoOn = 0 and keeps plain FogExp2.

export const ATMO_GLOWS = 8;

const f = (v) => v.toFixed(4);
const BOX_MIN = [m(T.interiorMinX), -1, -m(T.interiorWidth / 2)];
const BOX_MAX = [m(T.interiorMaxX), m(T.interiorHeight), m(T.interiorWidth / 2)];
const VEIL_X = m(T.veil.x);
const IN_CEIL = 0.8; // m: depth of the incense layer under the ceiling

/** Shared uniforms (tunable live through window.__tabernacle.atmosphere). */
export const ATMO = {
  uAtmoOn: { value: 1 },
  uAtmoHaze: { value: 0.05 }, // haze extinction at the ground, 1/m
  uAtmoFalloff: { value: 1.3 }, // 1/m: the haze thins to ~14% by 1.5 m
  uAtmoHazeColor: { value: new THREE.Color() }, // set from the fog colour in main.js
  // The haze's in-scattered light on steep downward rays, as a fraction of uAtmoHazeColor: the
  // mist is lit from above (sky, moon), so a viewer looking down sees it back-scattered and dim.
  uAtmoHazeDown: { value: 0.25 },
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
  // Inside the tent (set by createAtmosphere's interior source each frame):
  uAtmoInHaze: { value: 0.012 }, // room haze extinction, 1/m
  uAtmoInHazeCol: { value: new THREE.Color() }, // its colour (warm room ambient scattered)
  uAtmoInScatter: { value: 0.022 }, // scattering of the menorah's light, 1/m
  uAtmoInG: { value: 0.35 }, // its forward scattering (smoke and dust: broader than the night air)
  uAtmoInGlowPos: { value: new THREE.Vector4(0, -1000, 0, 0.3) }, // xyz m, w core radius m
  uAtmoInGlowCol: { value: new THREE.Vector4(0, 0, 0, 1) }, // rgb colour × cd × gain, w reach m
  uAtmoInCeil: { value: 0.25 }, // incense layer extinction at the ceiling, 1/m
  uAtmoInCeilCol: { value: new THREE.Color() }, // its colour (lit from below by the lamps)
  uAtmoInHoh: { value: 0.15 }, // haze density west of the veil, fraction of the Holy Place's
  uAtmoInHohCol: { value: 0.1 }, // and its brightness there
};

/** GLSL shared by the fog chunk and the sky: uniforms, haze and glow integrals. */
export const ATMO_GLSL = /* glsl */ `
#define ATMO_GLOWS ${ATMO_GLOWS}
uniform float uAtmoOn;
uniform float uAtmoHaze;
uniform float uAtmoFalloff;
uniform vec3 uAtmoHazeColor;
uniform float uAtmoHazeDown;
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
uniform float uAtmoInHaze;
uniform vec3 uAtmoInHazeCol;
uniform float uAtmoInScatter;
uniform float uAtmoInG;
uniform vec4 uAtmoInGlowPos;
uniform vec4 uAtmoInGlowCol;
uniform float uAtmoInCeil;
uniform vec3 uAtmoInCeilCol;
uniform float uAtmoInHoh;
uniform float uAtmoInHohCol;

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
// Entry and exit of the ray c + d t in the tent's interior box (b <= a: misses it).
vec2 atmoBoxT(vec3 c, vec3 d) {
  vec3 inv = 1.0 / (d + vec3(equal(d, vec3(0.0))) * 1e-6);
  vec3 ta = (vec3(${f(BOX_MIN[0])}, ${f(BOX_MIN[1])}, ${f(BOX_MIN[2])}) - c) * inv;
  vec3 tb = (vec3(${f(BOX_MAX[0])}, ${f(BOX_MAX[1])}, ${f(BOX_MAX[2])}) - c) * inv;
  vec3 tn = min(ta, tb), tx = max(ta, tb);
  return vec2(max(max(tn.x, tn.y), tn.z), min(min(tx.x, tx.y), tx.z));
}
// The outside part [s0, s1] of the ray, t in [0, L]: the tent's interior box is cut out
// (from the camera to where the ray leaves the box, or from where it enters the box onward).
vec2 atmoSpanT(vec2 ab, float L) {
  if (ab.y <= ab.x || ab.y <= 0.0) return vec2(0.0, L); // misses the box
  if (ab.x < 0.0) return vec2(min(ab.y, L), L); // the camera is inside
  return vec2(0.0, min(ab.x, L));
}
vec2 atmoSpan(vec3 c, vec3 d, float L) { return atmoSpanT(atmoBoxT(c, d), L); }
// The inside part of the ray (empty when s.y <= s.x).
vec2 atmoInSpanT(vec2 ab, float L) {
  return vec2(max(ab.x, 0.0), min(ab.y, L));
}
// ∫ of the incense layer's density profile (0 below the layer, rising linearly to 1 at the
// ceiling) over y: the antiderivative, so the optical depth along a ray is closed form.
float atmoCeilG(float y) {
  float u = clamp(y - ${f(BOX_MAX[1] - IN_CEIL)}, 0.0, ${f(IN_CEIL)});
  return u * u * ${f(0.5 / IN_CEIL)} + max(y - ${f(BOX_MAX[1])}, 0.0);
}
// Optical depth of the incense layer along [s0, s1] (before its horizontal weighting).
float atmoCeilDepth(vec3 c, vec3 d, vec2 s) {
  float len = max(s.y - s.x, 0.0);
  if (len <= 0.0) return 0.0;
  float y0 = c.y + d.y * s.x, y1 = c.y + d.y * s.y;
  if (abs(d.y) < 1e-3) return len * clamp((y0 - ${f(BOX_MAX[1] - IN_CEIL)}) * ${f(1 / IN_CEIL)}, 0.0, 1.0);
  return (atmoCeilG(y1) - atmoCeilG(y0)) / d.y;
}
// The room's air along the inside part [s0, s1] of the ray, applied to a colour.
vec3 atmoInterior(vec3 col, vec3 c, vec3 d, vec2 s) {
  if (s.y <= s.x) return col;
  // Split at the veil: the Holy Place (east) and the Holy of Holies (west).
  float tv = (${f(VEIL_X)} - c.x) / (abs(d.x) > 1e-5 ? d.x : 1e-5);
  vec2 hp = s, hh = vec2(0.0);
  if (abs(d.x) <= 1e-5) {
    if (c.x < ${f(VEIL_X)}) { hh = s; hp = vec2(0.0); }
  } else if (d.x > 0.0) {
    hh = vec2(s.x, min(s.y, tv)); hp = vec2(max(s.x, tv), s.y);
  } else {
    hp = vec2(s.x, min(s.y, tv)); hh = vec2(max(s.x, tv), s.y);
  }
  float lp = max(hp.y - hp.x, 0.0), lh = max(hh.y - hh.x, 0.0);
  // Room haze: thin, warm, the same everywhere east of the veil; a trace west of it.
  float tau = uAtmoInHaze * (lp + uAtmoInHoh * lh);
  vec3 hazeCol = uAtmoInHazeCol * (lp + uAtmoInHoh * uAtmoInHohCol * lh) / max(lp + uAtmoInHoh * lh, 1e-4);
  col = mix(col, hazeCol, 1.0 - exp(-tau));
  // Incense under the ceiling: denser toward the incense altar and the veil, slowly drifting.
  float cp = atmoCeilDepth(c, d, hp), ch = atmoCeilDepth(c, d, hh) * uAtmoInHoh;
  if (cp + ch > 0.0) {
    vec2 sc = lp > 0.0 ? hp : hh;
    float ts = d.y > 0.0 ? sc.y : sc.x; // the span's highest point: where the layer is
    vec3 q = c + d * ts;
    float w = mix(0.35, 1.0, smoothstep(${f(BOX_MAX[0] - 2)}, ${f(VEIL_X + 1.5)}, q.x));
    w *= 0.4 + 1.2 * atmoVNoise(q.xz * 0.45 + vec2(0.05, 0.02) * uAtmoTime);
    float tc = uAtmoInCeil * w * (cp + ch);
    col = mix(col, uAtmoInCeilCol * mix(uAtmoInHohCol, 1.0, cp / (cp + ch)), 1.0 - exp(-tc));
  }
  // The menorah's glow in the air of the Holy Place (as atmoGlow, one source, no extinction).
  if (lp > 0.0) {
    vec4 g = uAtmoInGlowPos;
    vec3 toS = g.xyz - c;
    float tS = dot(toS, d);
    float dd = dot(toS, toS);
    float h = sqrt(max(dd - tS * tS, 0.0) + g.w * g.w);
    float I = (atan((hp.y - tS) / h) - atan((hp.x - tS) / h)) / h;
    float g2 = uAtmoInG * uAtmoInG;
    float ct = tS * inversesqrt(max(dd, 1e-6));
    float qh = 1.0 + g2 - 2.0 * uAtmoInG * ct;
    float phase = (1.0 - g2) / (qh * sqrt(qh));
    col += uAtmoInGlowCol.rgb * (max(I, 0.0) * uAtmoInScatter * phase * exp(-h / uAtmoInGlowCol.w) * 0.0795775);
  }
  return col;
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
// The haze's colour along a ray of direction d: full on level rays, dimmer looking down.
vec3 atmoHazeCol(vec3 d) {
  return uAtmoHazeColor * mix(1.0, uAtmoHazeDown, smoothstep(0.08, 0.45, -d.y));
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
// Sky (no geometry): the ray runs out to the dome, or, below the horizon, to where it would meet
// the (flat) desert beyond the ground mesh, so the sky there matches the fogged far ground.
vec3 atmoSky(vec3 col, vec3 dir) {
  if (uAtmoOn <= 0.0) return col;
  vec3 c = cameraPosition;
  float L = dir.y < 0.0 ? min(3000.0, max(c.y, 0.0) / -dir.y) : 3000.0;
  vec2 ab = atmoBoxT(c, dir);
  vec2 s = atmoSpanT(ab, L);
  float tau = atmoHazeDepth(c, dir, s);
  col = mix(col, atmoHazeCol(dir), 1.0 - exp(-tau));
  col += atmoGlow(c, dir, s, 1.0);
  return atmoInterior(col, c, dir, atmoInSpanT(ab, L)); // seen from inside, out of the door
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
    vec2 ab = atmoBoxT(c, d);
    vec2 s = atmoSpanT(ab, L);
    float pch = atmoPatch(vFogWorld.xz);
    float tau = atmoHazeDepth(c, d, s) * pch;
    col = mix(col, atmoHazeCol(d), 1.0 - exp(-tau));
    col += atmoGlow(c, d, s, pch);
    return atmoInterior(col, c, d, atmoInSpanT(ab, L));
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
 * @param {{source: object, ambient: THREE.Color, haze: number, ceiling: number}} [interior]
 *   The tent's own air: `source` (same shape) glows only inside; the room haze takes `ambient`
 *   (the warm room ambient, flicker-scaled) × `haze`, the incense layer × `ceiling`.
 */
export function createAtmosphere(sources, interior = null) {
  if (sources.length > ATMO_GLOWS) throw new Error(`atmosphere: at most ${ATMO_GLOWS} glow sources`);
  const pos = ATMO.uAtmoGlowPos.value;
  const col = ATMO.uAtmoGlowCol.value;
  sources.forEach((s, i) => pos[i].set(s.pos.x, s.pos.y, s.pos.z, s.radius));
  if (interior) {
    const s = interior.source;
    ATMO.uAtmoInGlowPos.value.set(s.pos.x, s.pos.y, s.pos.z, s.radius);
  }
  return {
    uniforms: ATMO,
    sources,
    interior,
    update(time) {
      ATMO.uAtmoTime.value = time % 3600;
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        const k = s.intensity() * s.gain;
        col[i].set(s.color.r * k, s.color.g * k, s.color.b * k, s.reach);
      }
      if (interior) {
        const s = interior.source;
        const k = s.intensity() * s.gain;
        ATMO.uAtmoInGlowCol.value.set(s.color.r * k, s.color.g * k, s.color.b * k, s.reach);
        ATMO.uAtmoInHazeCol.value.copy(interior.ambient).multiplyScalar(interior.haze);
        ATMO.uAtmoInCeilCol.value.copy(interior.ambient).multiplyScalar(interior.ceiling);
      }
    },
  };
}
