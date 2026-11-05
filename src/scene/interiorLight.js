import * as THREE from 'three';
import { TABERNACLE as T, m } from '../config/dimensions.js';

// Interior light mask. Point lights have no occlusion (only the altar fire casts shadows), so
// the altar, torches, moon, hemisphere fill and night environment would otherwise all light the
// inside of the tent, and the menorah would light the outside of the walls. Every
// MeshStandardMaterial in the scene gets a small patch (`applyInteriorMask`) that classifies each
// fragment as inside or outside the tent and each point light the same way, and only lets lights
// reach surfaces on their own side:
// - The test point is the fragment pushed `NORMAL_PUSH` along its (camera-facing) normal, so a
//   wall's inner face counts as inside and its outer face as outside, the roof coverings' top as
//   outside and the linen ceiling's underside as inside, and the entrance screen splits the same
//   way.
// - Inside, the night environment (cool sky) is replaced by a warm "room" ambient that stands in
//   for the menorah's light bouncing off the gold walls and linen; it flickers with the lamps and
//   falls off with distance from the menorah.
// - The Holy of Holies (west of the veil) gets only a small leak of the menorah's light and room
//   ambient (light over and around the veil), so it stays very dark.
// - A little cool sky/moon light spills in just inside the entrance.
// Lights are never toggled; this is all per-fragment weighting.

const NORMAL_PUSH = 0.3; // m
const BOX = {
  xW: m(T.interiorMinX),
  xE: m(T.interiorMaxX), // the entrance screen hangs at x ≈ 0
  zH: m(T.interiorWidth / 2),
  yT: m(T.interiorHeight),
  veilX: m(T.veil.x),
};
const HOH_LEAK = 0.05; // fraction of the menorah's light and room ambient west of the veil
const SPILL = 0.3; // cool sky/moon/env fraction at the entrance, fading out 1.5 m in

/** Shared uniforms; menorah.js drives them each frame. */
export const INTERIOR = {
  uIlSource: { value: new THREE.Vector3() }, // world position the room ambient falls off from (m)
  uIlAmbient: { value: new THREE.Color(0, 0, 0) }, // warm room ambient (already flicker-scaled)
  uIlFalloff: { value: 0.28 }, // 1 / (1 + (d * falloff)^2) shaping, 1/m
  uIlSpec: { value: 14.0 }, // room ambient seen in reflections (metals), relative to diffuse
  uIlLobe: { value: 3.0 }, // extra reflected glow toward the menorah
  uIlUp: { value: 2.5 }, // extra reflected glow from the lit linen ceiling
  uIlMetalRough: { value: 0.45 }, // minimum roughness of metals inside
  uIlMetalDiffuse: { value: 0.65 }, // diffuse fraction given to metals inside
  uIlTint: { value: 1.0 }, // how much room reflections on metal take the metal's color
};

const f = (v) => v.toFixed(4);

const PARS = /* glsl */ `
uniform vec3 uIlSource;
uniform vec3 uIlAmbient;
uniform float uIlFalloff;
uniform float uIlSpec;
uniform float uIlLobe;
uniform float uIlUp;
uniform float uIlMetalRough;
uniform float uIlMetalDiffuse;
uniform float uIlTint;
vec3 ilToWorld(vec3 viewPos) { return ((vec4(viewPos, 1.0) - viewMatrix[3]) * viewMatrix).xyz; }
// Soft inside-ness of a world point (1 inside the tent's interior box, 0 outside).
float ilInside(vec3 p) {
  float x = smoothstep(${f(BOX.xW - 0.25)}, ${f(BOX.xW - 0.05)}, p.x) * (1.0 - smoothstep(${f(BOX.xE - 0.04)}, ${f(BOX.xE + 0.04)}, p.x));
  float z = 1.0 - smoothstep(${f(BOX.zH + 0.05)}, ${f(BOX.zH + 0.25)}, abs(p.z));
  float y = 1.0 - smoothstep(${f(BOX.yT + 0.05)}, ${f(BOX.yT + 0.15)}, p.y);
  return x * z * y;
}
// Hard test for a light's position (given in view space).
float ilLightInside(vec3 lightView) {
  vec3 l = ilToWorld(lightView);
  return (l.x > ${f(BOX.xW)} && l.x < ${f(BOX.xE)} && abs(l.z) < ${f(BOX.zH)} && l.y < ${f(BOX.yT)}) ? 1.0 : 0.0;
}
`;

const BEGIN_SETUP = /* glsl */ `
vec3 ilW = ilToWorld(geometryPosition);
vec3 ilP = ilW + inverseTransformDirection(geometryNormal, viewMatrix) * ${f(NORMAL_PUSH)};
float ilIn = ilInside(ilP);
// Interior lights: full in the Holy Place, a small leak behind the veil.
float ilInterior = ilIn * mix(${f(HOH_LEAK)}, 1.0, smoothstep(${f(BOX.veilX - 0.05)}, ${f(BOX.veilX + 0.05)}, ilP.x));
// Exterior point lights (altar, torches): none inside.
float ilExterior = 1.0 - ilIn;
// Cool sky (moon, hemisphere, environment): a faint spill just inside the entrance.
float ilSky = 1.0 - ilIn * (1.0 - ${f(SPILL)} * smoothstep(${f(BOX.xE - 1.5)}, ${f(BOX.xE)}, ilP.x));
// Inside, metals (the gold boards, furniture) are treated as burnished rather than polished:
// rougher, with some diffuse, so a single small light spreads over them instead of showing only
// as a narrow glint on otherwise black-looking metal.
float ilMetal = 0.0;
vec3 ilTint = vec3(1.0);
#ifdef STANDARD
{
  ilMetal = ilIn * smoothstep(0.5, 0.7, metalnessFactor);
  // Room reflections take on the metal's own color even at grazing angles (where Fresnel
  // would otherwise turn gold walls grey-white): light inside a gold room is gold.
  ilTint = mix(vec3(1.0), diffuseColor.rgb / max(max(diffuseColor.r, diffuseColor.g), max(diffuseColor.b, 1e-3)), ilMetal * uIlTint);
  material.roughness = mix(material.roughness, max(material.roughness, uIlMetalRough), ilMetal);
  material.diffuseColor = mix(material.diffuseColor, diffuseColor.rgb * uIlMetalDiffuse, ilMetal);
}
#endif
`;

function patchedLightsBegin() {
  let s = THREE.ShaderChunk.lights_fragment_begin;
  const rep = (a, b) => {
    if (!s.includes(a)) throw new Error(`interiorLight: chunk changed, missing "${a}"`);
    s = s.replace(a, b);
  };
  rep(
    'vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );',
    `vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );\n${BEGIN_SETUP}`,
  );
  rep(
    'getPointLightInfo( pointLight, geometryPosition, directLight );',
    'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tdirectLight.color *= mix( ilExterior, ilInterior, ilLightInside( pointLight.position ) );',
  );
  rep(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ilSky;',
  );
  rep(
    'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',
    'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * ilSky;',
  );
  return s;
}

const MAPS_AFTER = /* glsl */ `
{
  float ilD = distance(ilW, uIlSource) * uIlFalloff;
  vec3 ilAmb = uIlAmbient * ilInterior * (0.3 + 1.0 / (1.0 + ilD * ilD));
  #if defined( RE_IndirectDiffuse )
  iblIrradiance = iblIrradiance * ilSky + ilAmb;
  #endif
  #if defined( RE_IndirectSpecular )
  // Reflections see the lit room: brightest toward the menorah (its glow on the nearby walls,
  // floor and linen), a broad lobe that narrows on smoother metal, and the pale linen ceiling
  // above; dim elsewhere.
  vec3 ilR = inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix);
  vec3 ilToSrc = normalize(uIlSource - ilW);
  float ilLobe = pow(max(dot(ilR, ilToSrc), 0.0), mix(10.0, 2.0, material.roughness));
  radiance = radiance * ilSky + ilAmb * ilTint * uIlSpec * (0.2 + uIlLobe * ilLobe + uIlUp * smoothstep(-0.1, 0.8, ilR.y));
  #endif
}
`;

let beginChunk = null;
const patched = new WeakSet();

/** Patch one MeshStandardMaterial (chains any existing onBeforeCompile). */
export function addInteriorMask(mat) {
  if (patched.has(mat) || !mat.isMeshStandardMaterial) return mat;
  patched.add(mat);
  beginChunk ??= patchedLightsBegin();
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, INTERIOR);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace('#include <lights_fragment_begin>', beginChunk)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${MAPS_AFTER}`);
  };
  // Keep the previous patch's cache identity (three's default key is onBeforeCompile's source,
  // which is now this wrapper for every material).
  const own = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey.bind(mat) : null;
  const prevSrc = prev ? prev.toString() : '';
  mat.customProgramCacheKey = () => `${own ? own() : prevSrc}|interior-v1`;
  mat.needsUpdate = true;
  return mat;
}

/** Patch every MeshStandardMaterial under `root`. Call once after the scene is assembled. */
export function applyInteriorMask(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mm) => mm && addInteriorMask(mm));
  });
}
