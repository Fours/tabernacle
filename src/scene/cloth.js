import * as THREE from 'three';

// Cloth shading and wind (DECISIONS, "Rendering"), as a patch on the textiles' own
// MeshStandardMaterials. Coexists with the interior mask (interiorLight.js, applied later in
// main.js), the AO terms (ao.js), addMacroVariation and the atmosphere's fog chunks.
// - Translucency: for every point light behind the cloth (relative to the viewer) the side
//   facing the viewer gets a diffuse transmission term: wrapped −N·L, a forward-scatter lobe
//   toward the light, tinted by the cloth's own colour (so the weave and embroidery show),
//   scaled by the material's `transmission`. The light is unshadowed (the altar's shadow map is
//   computed for the lit face, and the back face is in its shadow by definition) but
//   distance-attenuated, and classed by the interior mask from the cloth's *back* side: the
//   menorah only shines through cloth whose back faces the tent's interior, the altar and
//   torches only through cloth whose back faces outside.
// - Sheen: a Charlie fibre-sheen lobe (Estevez & Kulla) with Neubelt visibility on every direct
//   light (after the interior classing and shadow), and a grazing rim on the indirect light,
//   tinted by the cloth's colour.
// - Wind: vertex displacement along a per-vertex direction with a per-vertex amplitude
//   (attributes aWind = (dir.xyz, amplitude m) and aWindG = the amplitude's gradient), from a
//   shared travelling-wave field (WIND). Normals are bent by the field's analytic gradient.
//   The altar's point-light shadow gets the same displacement (`addWindShadow`).

/** Shared wind uniforms; main.js advances uWindTime. `?wind=0` sets uWindStrength to 0. */
export const WIND = {
  uWindTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() }, // direction it blows toward (x, z): from the north-west
  uWindStrength: { value: 1 },
};

export const updateWind = (dt) => {
  WIND.uWindTime.value += Math.min(dt, 0.1);
};

const WIND_GLSL = /* glsl */ `
uniform float uWindTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
attribute vec4 aWind;
attribute vec3 aWindG;
// Displacement (m) along aWind.xyz at object-space p; g: its gradient.
float clothWind(vec3 p, out vec3 g) {
  vec2 d = uWindDir, c = vec2(-d.y, d.x);
  float t = uWindTime;
  // A slow gust travelling downwind, a gentler billow and a faster small ripple.
  vec3 k1 = vec3(0.32 * d.x + 0.12 * c.x, 0.0, 0.32 * d.y + 0.12 * c.y);
  vec3 k2 = vec3(0.9 * d.x + 0.6 * c.x, 0.7, 0.9 * d.y + 0.6 * c.y);
  vec3 k3 = vec3(-0.5 * d.x + 2.1 * c.x, -1.3, -0.5 * d.y + 2.1 * c.y);
  float a1 = dot(k1, p) - 0.8 * t;
  float a2 = dot(k2, p) - 1.6 * t + 1.3;
  float a3 = dot(k3, p) - 2.7 * t + 4.1;
  // Mean push: cloth facing into the wind bulges downwind.
  float push = 0.5 * dot(aWind.xz, d);
  float s = 0.45 * sin(a1) + 0.35 * sin(a2) + 0.2 * sin(a3) + push * (0.6 + 0.4 * sin(a1));
  vec3 ds = cos(a1) * k1 * (0.45 + 0.4 * push) + 0.35 * cos(a2) * k2 + 0.2 * cos(a3) * k3;
  g = uWindStrength * (aWind.w * ds + aWindG * s);
  return uWindStrength * aWind.w * s;
}
`;

const VERTEX_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
vec3 clWindD = vec3(0.0);
{
  vec3 g;
  float a = clothWind(position, g);
  clWindD = aWind.xyz * a;
  // Bend the normal by the displacement's tangential gradient.
  float nd = dot(objectNormal, aWind.xyz);
  objectNormal = normalize(objectNormal - nd * (g - dot(g, objectNormal) * objectNormal));
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uClothTrans;
uniform float uClothSheen;
uniform float uClothSheenRough;
float clCharlie(float r, float NoH) {
  float inv = 1.0 / max(r * r, 1e-3);
  float sin2 = max(1.0 - NoH * NoH, 0.0);
  return (2.0 + inv) * pow(sin2, 0.5 * inv) / (2.0 * PI);
}
float clNeubelt(float NoV, float NoL) {
  return saturate(1.0 / max(4.0 * (NoL + NoV - NoL * NoV), 1e-4));
}
`;

// After lights_physical_pars_fragment: wrap the direct and indirect diffuse equations.
const RE_CLOTH = /* glsl */ `
vec3 clSheenColor(const in PhysicalMaterial material) {
  return sqrt(max(material.diffuseContribution, vec3(0.0))) * uClothSheen;
}
void RE_Direct_Cloth(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  float NoL = saturate(dot(geometryNormal, directLight.direction));
  float NoV = saturate(dot(geometryNormal, geometryViewDir));
  vec3 H = normalize(directLight.direction + geometryViewDir);
  float NoH = saturate(dot(geometryNormal, H));
  reflectedLight.directSpecular += directLight.color * NoL * clCharlie(uClothSheenRough, NoH) * clNeubelt(NoV, NoL) * clSheenColor(material);
}
void RE_IndirectDiffuse_Cloth(const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_IndirectDiffuse_Physical(irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  float rim = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.0);
  reflectedLight.indirectDiffuse += irradiance * RECIPROCAL_PI * clSheenColor(material) * 0.6 * rim;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Cloth
#undef RE_IndirectDiffuse
#define RE_IndirectDiffuse RE_IndirectDiffuse_Cloth
`;

// Before lights_fragment_end: diffuse transmission from the point lights behind the cloth.
// Uses the interior mask's ilW / ilInside / ilLightInside when present (IL_MASK).
const TRANSMISSION = /* glsl */ `
#if NUM_POINT_LIGHTS > 0
if (uClothTrans > 0.0) {
  float clBackExt = 1.0, clBackInt = 1.0;
  #ifdef IL_MASK
  {
    // The cloth's far side, classed like the interior mask's test point.
    vec3 clPb = ilW - inverseTransformDirection(geometryNormal, viewMatrix) * 0.3;
    float clIn = ilInside(clPb);
    clBackExt = 1.0 - clIn;
    clBackInt = clIn * mix(uIlHoh, 1.0, smoothstep(IL_VEIL_X - 0.05, IL_VEIL_X + 0.05, clPb.x));
  }
  #endif
  // Denser or dustier patches of the weave (the texture, the panels' bleaching, the dusty hem)
  // let less light through: the albedo's variation counts twice, around the base colour's tone.
  float clRef = max(dot(diffuse, vec3(0.2126, 0.7152, 0.0722)) * 0.85, 1e-3);
  float clDense = clamp(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / clRef, 0.3, 1.6);
  vec3 clAlb = diffuseColor.rgb * clDense * RECIPROCAL_PI * uClothTrans;
  IncidentLight clL;
  for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
    getPointLightInfo(pointLights[i], geometryPosition, clL);
    float NoL = dot(geometryNormal, clL.direction);
    float back = saturate((0.25 - NoL) / 1.25);
    if (back <= 0.0) continue;
    // Folds: the cloth glows where it faces the light square-on (a single layer, lit fully) and
    // darkens in the fold valleys turned away from it (light crossing the cloth at a slant).
    back = 1.4 * back * back * back;
    // A little more falloff with distance than the light's own, so the glow pools near the fire.
    vec3 clD = pointLights[i].position - geometryPosition;
    back *= clamp(pow(100.0 / max(dot(clD, clD), 1.0), 0.35), 0.0, 1.5);
    float fwd = pow(saturate(dot(-geometryViewDir, clL.direction)), 6.0);
    #ifdef IL_MASK
    float cls = mix(clBackExt, clBackInt, ilLightInside(pointLights[i].position));
    #else
    float cls = 1.0;
    #endif
    reflectedLight.directDiffuse += clL.color * clAlb * back * (0.6 + 1.6 * fwd) * cls;
  }
}
#endif
`;

const DEFAULTS = { transmission: 0, sheen: 0.3, sheenRoughness: 0.5, wind: false };

/**
 * Patch a textile's MeshStandardMaterial (chains any existing onBeforeCompile). Options:
 * transmission (0..1, firelight through the cloth), sheen (fibre sheen strength), sheenRoughness,
 * wind (vertex displacement: the mesh's geometry needs aWind/aWindG, see `windAttributes`).
 * The per-material values live in `mat.userData.cloth` (uniforms) for tuning.
 */
export function addCloth(mat, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const uniforms = {
    uClothTrans: { value: o.transmission },
    uClothSheen: { value: o.sheen },
    uClothSheenRough: { value: o.sheenRoughness },
  };
  mat.userData.cloth = uniforms;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    if (o.wind) {
      Object.assign(shader.uniforms, WIND);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WIND_GLSL}`)
        .replace('#include <beginnormal_vertex>', VERTEX_NORMAL)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += clWindD;');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${RE_CLOTH}`)
      .replace('#include <lights_fragment_end>', `${TRANSMISSION}\n#include <lights_fragment_end>`);
  };
  const own = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey.bind(mat) : null;
  const prevSrc = prev ? prev.toString() : '';
  mat.customProgramCacheKey = () => `${own ? own() : prevSrc}|cloth-v2-${o.wind ? 'w' : ''}`;
  mat.needsUpdate = true;
  return mat;
}

/** Give a wind-displaced mesh a matching shadow (distance material for the altar's point light). */
export function addWindShadow(mesh) {
  const dist = new THREE.MeshDistanceMaterial();
  dist.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WIND);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec3 g; transformed += aWind.xyz * clothWind(position, g); }');
  };
  dist.customProgramCacheKey = () => 'cloth-wind-distance-v1';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = dist.onBeforeCompile;
  depth.customProgramCacheKey = () => 'cloth-wind-depth-v1';
  mesh.customDistanceMaterial = dist;
  mesh.customDepthMaterial = depth;
  return mesh;
}

/**
 * Append one vertex's wind data to a {pos, uv, idx, wind?, windG?} buffer (no-op without
 * `buf.wind`): direction dir [x, y, z] (unit), amplitude w (m) and its gradient g [x, y, z].
 */
export function pushWind(buf, dir = [0, 0, 0], w = 0, g = [0, 0, 0]) {
  if (!buf.wind) return;
  buf.wind.push(dir[0], dir[1], dir[2], w);
  buf.windG.push(g[0], g[1], g[2]);
}

/** Set aWind / aWindG on a geometry from flat arrays (4 and 3 per vertex). */
export function windAttributes(geo, wind, windG) {
  geo.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 4));
  geo.setAttribute('aWindG', new THREE.Float32BufferAttribute(windG, 3));
  return geo;
}
