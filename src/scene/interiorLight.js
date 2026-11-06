import * as THREE from 'three';
import { TABERNACLE as T, m } from '../config/dimensions.js';
import { COLORS } from './materials.js';
import { AO_PARS_GLSL, aoApplyGlsl, bindAOUniforms } from './ao.js';

// Interior light mask. Point lights have no occlusion (only the altar fire casts shadows), so
// the altar, torches, moon, hemisphere fill and night environment would otherwise all light the
// inside of the tent, and the menorah would light the outside of the walls. Every
// MeshStandardMaterial in the scene gets a small patch (`applyInteriorMask`) that classifies each
// fragment as inside or outside the tent and each point light the same way, and only lets lights
// reach surfaces on their own side:
// - The test point is the fragment pushed `NORMAL_PUSH` along its (camera-facing) normal, so a
//   wall's inner face counts as inside and its outer face as outside, the roof coverings' top as
//   outside and the linen ceiling's underside as inside, and the door's tied-back cloth splits
//   the same way.
// - Inside, the night environment (cool sky) is replaced by a warm "room" ambient that stands in
//   for the menorah's light bouncing off the gold walls and linen; it flickers with the lamps and
//   falls off with distance from the menorah.
// - The Holy of Holies (west of the veil) gets only a small leak of the menorah's light and room
//   ambient (light over and around the veil), so it stays very dark.
// - A little cool sky/moon light and exterior firelight spills in just inside the open door.
// Lights are never toggled; this is all per-fragment weighting.

const NORMAL_PUSH = 0.3; // m
const BOX = {
  xW: m(T.interiorMinX),
  xE: m(T.interiorMaxX), // the board ends; the open door's beam and cloth hang at x ≈ 0
  zH: m(T.interiorWidth / 2),
  yT: m(T.interiorHeight),
  veilX: m(T.veil.x),
};
const SPILL = 0.3; // cool sky/moon/env fraction at the entrance, fading out 1.5 m in
// Exterior point lights (mostly the altar fire, whose shadow map already limits it to what the
// open door lets through): this fraction at the threshold, fading out 2 m in, so the floor
// doesn't change light in a hard line at the door.
const EXT_SPILL = 0.5;

/** Shared uniforms; menorah.js drives them each frame. */
export const INTERIOR = {
  uIlSource: { value: new THREE.Vector3() }, // world position the room ambient falls off from (m)
  uIlAmbient: { value: new THREE.Color(0, 0, 0) }, // warm room ambient (already flicker-scaled)
  uIlFalloff: { value: 0.28 }, // 1 / (1 + (d * falloff)^2) shaping, 1/m
  uIlSpec: { value: 5.0 }, // room ambient seen in reflections (metals), relative to diffuse
  uIlLobe: { value: 4.0 }, // extra reflected glow toward the menorah
  uIlUp: { value: 2.5 }, // extra reflected glow from the lit linen ceiling
  uIlMetalRough: { value: 0.45 }, // minimum roughness of metals inside
  uIlMetalDiffuse: { value: 0.25 }, // Lambert diffuse given to metals inside (fraction of their colour)
  // Interior gold (linear): polished gold's own reflectance (~ (1, 0.77, 0.34)), more saturated
  // to survive ACES and the night grade. The shared GOLD colour is a dull, dark orange tuned for
  // the exterior night; inside, gold-hued metal is re-coloured to this, keeping its texture's
  // light/dark detail.
  uIlGold: { value: new THREE.Color().setRGB(1.0, 0.7, 0.2) },
  uIlDirect: { value: 0.7 }, // direct (menorah) highlight strength on metals inside
  uIlTint: { value: 0.5 }, // how much room reflections on metal take the metal's color
  // Fraction of the menorah's light and room ambient west of the veil: just enough for the ark
  // to show as a faint gold glint. `?light=work` sets it to 1 so the ark can be inspected.
  uIlHoh: { value: 0.08 },
  // Room reflections on metal west of the veil, relative to uIlHoh: the dim light there shows as
  // gold glints rather than as an evenly dim, brown ark.
  uIlHohGlint: { value: 5.0 },
  // Static reflection probe (main.js captures it once at load from the middle of the Holy
  // Place): gold east of the veil reflects the room's actual image, box-projected onto the Holy
  // Place's walls so the reflections sit in the right place. Off (and unbound) during capture.
  uIlProbe: { value: null }, // cube render target texture (HDR, mipmapped)
  uIlProbeOn: { value: 0 },
  uIlProbePos: { value: new THREE.Vector3() }, // world position the probe was captured from (m)
  uIlProbeMix: { value: 0.85 }, // fraction of a gold surface's reflection taken from the probe
  uIlProbeGain: { value: 1.15 },
  uIlProbeLod: { value: 5.5 }, // mip level per unit roughness (blur: burnished, not a mirror)
  // Ark glint (materials with the IL_GLINT define only): the menorah's glow coming over the veil
  // shows as soft gold highlights on the ark and cherubim, without lighting the walls.
  uIlGlint: { value: 14.0 },
  uIlGlintPow: { value: 4.0 },
  uIlGlintBase: { value: 0.03 }, // broad part of the glint (faces turned away from the veil)
  uIlGlintSrc: { value: new THREE.Vector3(m(T.veil.x), m(6), 0) }, // over the veil's middle

};

const f = (v) => v.toFixed(4);
// Linear luminance of the shared GOLD colour: the reference for the gold re-colouring's detail.
const GOLD_LUM = (() => {
  const c = new THREE.Color(COLORS.gold);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
})();

const PARS = /* glsl */ `
#define IL_MASK
#define IL_VEIL_X ${f(BOX.veilX)}
uniform vec3 uIlSource;
uniform vec3 uIlAmbient;
uniform float uIlFalloff;
uniform float uIlSpec;
uniform float uIlLobe;
uniform float uIlUp;
uniform float uIlMetalRough;
uniform float uIlMetalDiffuse;
uniform vec3 uIlGold;
uniform float uIlDirect;
uniform float uIlTint;
uniform float uIlHoh;
uniform float uIlHohGlint;
uniform samplerCube uIlProbe;
uniform float uIlProbeOn;
uniform vec3 uIlProbePos;
uniform float uIlProbeMix;
uniform float uIlProbeGain;
uniform float uIlProbeLod;
uniform float uIlGlint;
uniform float uIlGlintPow;
uniform float uIlGlintBase;
uniform vec3 uIlGlintSrc;
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
float ilEastOfVeil = smoothstep(${f(BOX.veilX - 0.05)}, ${f(BOX.veilX + 0.05)}, ilP.x);
float ilInterior = ilIn * mix(uIlHoh, 1.0, ilEastOfVeil);
// Exterior point lights (altar, torches): none inside, except a faint spill through the door.
float ilExterior = 1.0 - ilIn * (1.0 - ${f(EXT_SPILL)} * smoothstep(${f(BOX.xE - 2.0)}, ${f(BOX.xE)}, ilP.x));
// Cool sky (moon, hemisphere, environment): a faint spill just inside the entrance.
float ilSky = 1.0 - ilIn * (1.0 - ${f(SPILL)} * smoothstep(${f(BOX.xE - 1.5)}, ${f(BOX.xE)}, ilP.x));
// Inside, metals (the gold boards, furniture) are treated as burnished rather than polished:
// rougher, with some real diffuse, so a single small light spreads over them instead of showing
// only as a narrow glint on otherwise black-looking metal. Gold-hued metal (gold, not the silver
// sockets) is re-coloured to uIlGold, keeping its texture's light/dark detail. In three r187 the
// metal's reflectance (F0) is material.diffuseColor (indirect) and specularColorBlended (direct);
// the Lambert term is material.diffuseContribution.
float ilMetal = 0.0;
vec3 ilTint = vec3(1.0);
#ifdef STANDARD
{
  ilMetal = ilIn * smoothstep(0.5, 0.7, metalnessFactor);
  vec3 ilC = diffuseColor.rgb;
  float ilMax = max(max(ilC.r, ilC.g), max(ilC.b, 1e-3));
  float ilGoldness = ilMetal * smoothstep(0.55, 0.8, 1.0 - ilC.b / ilMax);
  vec3 ilG = mix(ilC, uIlGold * (dot(ilC, vec3(0.2126, 0.7152, 0.0722)) / ${f(GOLD_LUM)}), ilGoldness);
  // Room reflections take on the metal's own color even at grazing angles (where Fresnel
  // would otherwise turn gold walls grey-white): light inside a gold room is gold.
  ilTint = mix(vec3(1.0), ilG / max(max(ilG.r, ilG.g), max(ilG.b, 1e-3)), ilMetal * uIlTint);
  material.roughness = mix(material.roughness, max(material.roughness, uIlMetalRough), ilMetal);
  material.diffuseColor = mix(material.diffuseColor, ilG, ilMetal);
  material.specularColorBlended = mix(material.specularColorBlended, mix(material.specularColor, ilG, metalnessFactor) * uIlDirect, ilMetal);
  material.diffuseContribution = mix(material.diffuseContribution, ilG * uIlMetalDiffuse, ilMetal);
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
  radiance = radiance * ilSky + ilAmb * ilTint * uIlSpec * mix(uIlHohGlint, 1.0, ilEastOfVeil) * (0.2 + uIlLobe * ilLobe + uIlUp * smoothstep(-0.1, 0.8, ilR.y));
  // Reflection probe, box-projected: find where the reflected ray leaves the Holy Place's box
  // and look that point up from the probe's position. Blurred by roughness (mip level).
  float ilPk = ilMetal * ilEastOfVeil * uIlProbeOn;
  if (ilPk > 0.001) {
    vec3 ilRd = ilR + vec3(1e-5);
    vec3 ilT = max((vec3(${f(BOX.xE)}, ${f(BOX.yT)}, ${f(BOX.zH)}) - ilW) / ilRd, (vec3(${f(BOX.veilX)}, 0.0, ${f(-BOX.zH)}) - ilW) / ilRd);
    float ilHit = max(min(min(ilT.x, ilT.y), ilT.z), 0.0);
    vec3 ilDir = ilW + ilR * ilHit - uIlProbePos;
    vec3 ilPc = textureLod(uIlProbe, ilDir, material.roughness * uIlProbeLod).rgb;
    // Not tinted again: the probe already sees the gold room, and the metal's F0 is applied
    // after this, so a further tint would turn gold in shadow coppery red.
    radiance = mix(radiance, ilPc * uIlProbeGain, ilPk * uIlProbeMix);
  }
  #ifdef IL_GLINT
  // The menorah's glow seen over the veil, as a soft highlight on the ark (west of the veil).
  float ilGl = pow(max(dot(ilR, normalize(uIlGlintSrc - ilW)), 0.0), uIlGlintPow);
  radiance += uIlAmbient * ilTint * ilIn * (1.0 - ilEastOfVeil) * uIlGlint * (uIlGlintBase + ilGl);
  #endif
  #endif
}
`;

// Ambient occlusion (scene/ao.js), on every lit material after the lighting is summed:
// - Contact: surfaces near the ground and not facing up (the foot of every pillar, wall, hem,
//   furnishing) darken over uAoContactR; the sand itself faces up and gets none from this.
// - Inside the tent: the side walls, west wall, ceiling and veil each darken the surfaces near
//   them that face them (wall bases on the floor, the wall/ceiling seam, the corners, where two
//   terms multiply). The open door end has none.
const AO_AFTER = /* glsl */ `
{
  vec3 aoN = inverseTransformDirection(geometryNormal, viewMatrix);
  float aoVis = 1.0 - uAoContact * aoOcc(max(ilW.y, 1e-3), uAoContactR, aoN, vec3(0.0, -1.0, 0.0));
  if (ilIn > 0.001) {
    float r = uAoRoomR, k = uAoRoom * ilIn;
    float room = (1.0 - k * aoOcc(${f(BOX.yT)} - ilW.y, r, aoN, vec3(0.0, 1.0, 0.0)))
      * (1.0 - k * aoOcc(ilW.z + ${f(BOX.zH)}, r, aoN, vec3(0.0, 0.0, -1.0)))
      * (1.0 - k * aoOcc(${f(BOX.zH)} - ilW.z, r, aoN, vec3(0.0, 0.0, 1.0)))
      * (1.0 - k * aoOcc(ilW.x - ${f(BOX.xW)}, r, aoN, vec3(-1.0, 0.0, 0.0)));
    float dv = ilW.x - ${f(BOX.veilX)};
    room *= 1.0 - k * aoOcc(abs(dv), r, aoN, vec3(-sign(dv), 0.0, 0.0));
    aoVis *= room;
  }
  aoVis = mix(1.0, aoVis, uAoOn);
  ${aoApplyGlsl('aoVis')}
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
    bindAOUniforms(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}\n${AO_PARS_GLSL}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${AO_AFTER}`)
      .replace('#include <lights_fragment_begin>', beginChunk)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${MAPS_AFTER}`);
  };
  // Keep the previous patch's cache identity (three's default key is onBeforeCompile's source,
  // which is now this wrapper for every material).
  const own = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey.bind(mat) : null;
  const prevSrc = prev ? prev.toString() : '';
  mat.customProgramCacheKey = () => `${own ? own() : prevSrc}|interior-v5`;
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
