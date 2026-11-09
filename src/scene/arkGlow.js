import * as THREE from 'three';
import { ARK, TABERNACLE as T, m } from '../config/dimensions.js';
import { FOG_ADDITIVE_GLSL } from './fireCommon.js';
import { QUALITY } from '../config/quality.js';

// The glow over the ark: a warm, unseen light hanging under the ceiling of the Holy of Holies
// above the mercy seat, falling in slow, wavering caustic bands, like sunlight through water.
// Not a THREE light (the light budget stays at 8 and no shader recompiles):
// - Surfaces: interiorLight.js adds it per fragment west of the veil (AG_GLSL's agLight, through
//   the material's own RE_Direct, so gold gets real highlights).
// - Air: one raymarched draw over the room's box (createArkGlow), whose density is the same light,
//   so the bands on the floor and the ark continue up as shafts converging on the source.
// - Dust: dustMotes.js lights its motes west of the veil with agLight too.
// The pattern is a function of the direction from the source only, so the same caustic is
// projected on every surface and streaks the air along the rays.

const f = (v) => v.toFixed(4);
const ARK_X = m(ARK.x), ARK_Z = m(ARK.z);
const SOURCE_Y = 3.75; // m: the hidden source, ~0.75 m under the 4.5 m ceiling (not in text)

/** Shared uniforms (createArkGlow's update drives time, colour and the source's drift). */
export const ARK_GLOW = {
  uAgOn: { value: 1 },
  uAgPos: { value: new THREE.Vector3(ARK_X, SOURCE_Y, ARK_Z) },
  uAgCol: { value: new THREE.Color() }, // colour × intensity, breathing (set each frame)
  uAgTime: { value: 0 },
  uAgCell: { value: 4.5 }, // caustic tiles per unit of tan(angle from straight down)
  uAgCone: { value: new THREE.Vector2(Math.cos(THREE.MathUtils.degToRad(40)), Math.cos(THREE.MathUtils.degToRad(14))) },
  uAgSpill: { value: 0.04 }, // light outside the cone on surfaces (the room's glow)
  uAgCaustic: { value: 5.0 }, // caustic band contrast over the base light
};
const BASE_COLOR = new THREE.Color().setRGB(1.0, 0.46, 0.14); // linear: firelight
const BASE_INTENSITY = 7.0;

// Caustic: an iterated, time-warped sine field (the well-known tileable water caustic, here
// untiled), bright thin veins on a dark ground, about 0..1. `t` is in slow seconds.
export const AG_GLSL = /* glsl */ `
uniform float uAgOn;
uniform vec3 uAgPos;
uniform vec3 uAgCol;
uniform float uAgTime;
uniform float uAgCell;
uniform vec2 uAgCone;
uniform float uAgSpill;
uniform float uAgCaustic;
float agCaustic(vec2 uv, float t) {
  vec2 p = uv * 6.2831853 - 250.0;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    vec2 q = vec2(p.x / max(abs(sin(i.x + tt)), 1e-3), p.y / max(abs(cos(i.y + tt)), 1e-3)) * 0.005;
    c += 1.0 / max(length(q), 1e-3);
  }
  c = min(c / 4.0, 1.6);
  c = 1.17 - pow(c, 1.4);
  return min(pow(abs(c), 8.0), 2.0);
}
// The glow's light at world point p: returns the intensity factor (times uAgCol), L the unit
// direction from p to the source. soft (m²) softens the inverse square near the source; base is
// the light between the bands, sharp (>= 1) thins the bands and cell scales them (the air uses
// broader, thinner ones: separate soft shafts rather than an even haze, and no aliasing between
// its march steps).
float agLight(vec3 p, out vec3 L, float spill, float soft, float base, float sharp, float cell) {
  vec3 d = p - uAgPos;
  float r2 = dot(d, d);
  vec3 dir = d * inversesqrt(r2 + 1e-6);
  L = -dir;
  float cone = mix(spill, 1.0, smoothstep(uAgCone.x, uAgCone.y, -dir.y));
  vec2 uv = dir.xz / (abs(dir.y) + 0.35) * (uAgCell * cell);
  float t = uAgTime * 0.32;
  // Two layers drifting apart: the bands cross, merge and part as the "surface" moves.
  float c = agCaustic(uv, t) * 0.65 + agCaustic(uv * 0.63 + vec2(0.37, 0.71), t * 0.8 + 11.0) * 0.5;
  return cone * (base + uAgCaustic * pow(c, sharp)) / (r2 + soft);
}
`;

// Lighting a lit material's fragment (interiorLight.js, after lights_fragment_maps), west of
// the veil only. Uses ilW, ilIn, ilEastOfVeil from the interior mask.
export const AG_SURFACE_GLSL = /* glsl */ `
#ifdef RE_Direct
{
  float agW = ilIn * (1.0 - ilEastOfVeil) * uAgOn;
  if (agW > 0.001) {
    vec3 agL;
    float agI = agLight(ilW, agL, uAgSpill, 0.3, 0.12, 1.0, 1.0);
    IncidentLight agD;
    agD.direction = normalize((viewMatrix * vec4(agL, 0.0)).xyz);
    agD.color = uAgCol * (agI * agW);
    agD.visible = true;
    RE_Direct(agD, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  }
}
#endif
`;

// The room's air box (a little inside the walls, ceiling and the veil's pillars) and the ark's
// chest, where the shafts stop.
const ROOM = {
  min: [m(T.interiorMinX) + 0.05, 0.02, -m(T.interiorWidth / 2) + 0.05],
  max: [m(T.veil.x) - 0.35, m(T.interiorHeight) - 0.05, m(T.interiorWidth / 2) - 0.05],
};
const ARK_BOX = {
  min: [ARK_X - m(ARK.width / 2 + ARK.crownWidth), 0, ARK_Z - m(ARK.length / 2 + ARK.crownWidth)],
  max: [ARK_X + m(ARK.width / 2 + ARK.crownWidth), m(ARK.height + ARK.mercySeat * ARK.hb + ARK.crownLip), ARK_Z + m(ARK.length / 2 + ARK.crownWidth)],
};
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;

const VERT = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#define STEPS ${QUALITY.name === 'mobile' ? 12 : 20}
${AG_GLSL}
uniform float uCamIn;
uniform float uDensity;
uniform float uPhaseG;
uniform vec4 uAir; // the air's band base, sharpness, frequency and softening (m²)
uniform vec2 uHide; // m: the air fades in from the source over this range
varying vec3 vWorld;
${FOG_ADDITIVE_GLSL}
// The shafts' pattern over the directions from the source: three sets of soft, wavering bands
// crossing. Smooth (unlike agCaustic's fine veins, which a march through the air turns to grain).
float agAir(vec2 uv, float t) {
  uv *= uAir.z;
  vec2 q = uv + 0.45 * vec2(sin(uv.y * 0.9 + t * 1.1), sin(uv.x * 0.8 - t * 0.9));
  float a = 0.5 + 0.5 * sin(q.x + t * 0.7);
  float b = 0.5 + 0.5 * sin(q.y * 0.87 - t * 0.6 + 1.7);
  float c = 0.5 + 0.5 * sin((q.x - q.y) * 0.71 + t * 0.5 + 0.6);
  return pow((a * b + b * c + c * a) / 3.0, uAir.y);
}
vec2 agBox(vec3 ro, vec3 inv, vec3 bmin, vec3 bmax) {
  vec3 a = (bmin - ro) * inv, b = (bmax - ro) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}
void main() {
  // Front faces from outside the box, back faces from inside it (main.js turns the depth test
  // off then: nothing stands between but the ark, which is cut analytically).
  if ((uCamIn > 0.5) == gl_FrontFacing) discard;
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec3 inv = 1.0 / (rd + vec3(1e-6));
  vec2 tr = agBox(ro, inv, ${v3(ROOM.min)}, ${v3(ROOM.max)});
  float a = max(tr.x, 0.0), b = tr.y;
  vec2 ta = agBox(ro, inv, ${v3(ARK_BOX.min)}, ${v3(ARK_BOX.max)});
  if (ta.x < ta.y && ta.y > 0.0) b = min(b, max(ta.x, 0.0));
  if (b <= a) discard;
  float dt = (b - a) / float(STEPS);
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float acc = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * (a + (float(i) + j) * dt);
    vec3 d = p - uAgPos;
    float r2 = dot(d, d);
    vec3 L = -d * inversesqrt(r2 + 1e-6);
    float cone = smoothstep(uAgCone.x, uAgCone.y, L.y);
    if (cone <= 0.0) continue; // outside the cone: dark air, skip the pattern
    vec2 uv = -L.xz / (abs(L.y) + 0.35);
    float I = cone * (uAir.x + agAir(uv, uAgTime * 0.32)) / (r2 + uAir.w);
    // Henyey-Greenstein: brighter looking up into the light.
    float mu = dot(L, rd);
    float g = uPhaseG;
    float ph = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * mu, 1e-3), 1.5);
    // Faded right under the source, so it reads as a glow in the air, not a bulb.
    float hide = smoothstep(uHide.x, uHide.y, distance(p, uAgPos));
    acc += I * ph * hide;
  }
  vec3 col = uAgCol * (acc * dt * uDensity * uAgOn);
  gl_FragColor = vec4(col * (1.0 - fogAmount()), 1.0);
}
`;

/**
 * The ark's glow: the air box with its shafts, and the uniforms' per-frame drive.
 * @returns {THREE.Group} with userData.update(dt, time), userData.shaft (the mesh) and dispose.
 */
export function createArkGlow() {
  const group = new THREE.Group();
  group.name = 'ark-glow';
  const size = ROOM.max.map((v, i) => v - ROOM.min[i]);
  const geo = new THREE.BoxGeometry(...size);
  geo.translate(...ROOM.min.map((v, i) => v + size[i] / 2));
  const uniforms = {
    ...ARK_GLOW,
    uCamIn: { value: 0 },
    uDensity: { value: 0.75 },
    uPhaseG: { value: 0.35 },
    uAir: { value: new THREE.Vector4(0.01, 2.6, 30.0, 1.5) },
    uHide: { value: new THREE.Vector2(0.3, 1.4) },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };
  const mat = new THREE.ShaderMaterial({
    name: 'ark-glow-air',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const shaft = new THREE.Mesh(geo, mat);
  shaft.name = 'ark-glow-air';
  shaft.renderOrder = 4;
  shaft.onBeforeRender = (renderer, scene, camera) => {
    const p = camera.position, e = 0.12; // a margin past the near plane
    const inside = p.x > ROOM.min[0] - e && p.x < ROOM.max[0] + e && p.y > ROOM.min[1] - e && p.y < ROOM.max[1] + e
      && p.z > ROOM.min[2] - e && p.z < ROOM.max[2] + e;
    uniforms.uCamIn.value = inside ? 1 : 0;
    mat.depthTest = !inside;
  };
  group.add(shaft);

  group.userData.shaft = shaft;
  group.userData.uniforms = uniforms;
  group.userData.intensity = BASE_INTENSITY;
  group.userData.update = (dt, time) => {
    const t = time % 3600;
    ARK_GLOW.uAgTime.value = t;
    // Breathing slowly, never flickering like the fires.
    const k = 1 + 0.1 * Math.sin(t * 0.55) + 0.05 * Math.sin(t * 1.37 + 1.3);
    ARK_GLOW.uAgCol.value.copy(BASE_COLOR).multiplyScalar(group.userData.intensity * k);
    // The source drifts a little, so the whole pattern sways.
    ARK_GLOW.uAgPos.value.set(ARK_X + 0.07 * Math.sin(t * 0.21), SOURCE_Y + 0.05 * Math.sin(t * 0.17 + 2), ARK_Z + 0.07 * Math.cos(t * 0.19));
  };
  group.userData.dispose = () => {
    geo.dispose();
    mat.dispose();
  };
  return group;
}
