import * as THREE from 'three';
import { ATMO, ATMO_GLSL } from '../render/atmosphere.js';

// Night sky dome: gradient, procedural star field (anti-aliased hashed-cell discs), a faint
// Milky Way band with dust lanes, slow twinkle; no moon. One mesh, one draw call.
// The dome follows the camera, ignores depth/fog, and is drawn first so everything covers it.
// With the atmosphere on (render/atmosphere.js) the ground haze closes the horizon and the
// fires' glow in the air continues against the sky (atmoSky), matching the fogged ground.

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uHorizon;
uniform vec3 uZenith;
varying vec3 vDir;
#ifdef ATMO
${ATMO_GLSL}
#endif

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
                 mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                 mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

// Galactic plane: normal tilted across the sky, with a brighter "core" direction along it.
const vec3 GAL_N = vec3(0.50, 0.62, -0.60);
const vec3 GAL_CORE = vec3(-0.78, 0.20, 0.45);

float galBand(vec3 d) {
  float b = dot(d, normalize(GAL_N));
  return exp(-b * b / (2.0 * 0.17 * 0.17));
}

// One layer of stars: a jittered point per 3D cell, projected onto the sphere. The disc radius
// never drops below ~1 pixel (energy-conserving), so stars stay stable while the camera turns.
vec3 starLayer(vec3 d, float N, float prob, float rBase, float gain, bool galactic) {
  vec3 p = d * N;
  float px = length(fwidth(p));
  vec3 c = floor(p);
  vec3 h = hash33(c);
  vec3 sp = normalize(c + 0.2 + 0.6 * hash33(c + 17.3));
  float pr = prob;
  if (galactic) pr = prob * galBand(sp);
  if (h.x > pr) return vec3(0.0);
  float r = max(rBase, px * 0.85);
  float dist = length(p - sp * N);
  float disc = smoothstep(r, 0.0, dist);
  disc *= disc;
  disc *= min(1.0, (rBase * rBase) / (r * r) * 1.6);
  float mag = 0.14 + pow(h.y, 6.0);
  // Slow, low-amplitude twinkle.
  float tw = 1.0 + 0.16 * sin(uTime * (0.7 + 2.0 * h.z) + h.y * 40.0);
  float t = hash13(c + 3.7);
  vec3 tint = mix(vec3(0.62, 0.76, 1.0), vec3(1.0, 0.95, 0.88), smoothstep(0.1, 0.6, t));
  tint = mix(tint, vec3(1.0, 0.72, 0.45), smoothstep(0.82, 1.0, t));
  return tint * disc * mag * gain * tw;
}

void main() {
  vec3 d = normalize(vDir);
  float up = d.y;

  // Gradient: near-black blue at the zenith, slightly lighter haze toward the horizon (matches
  // the ground fog color, so the desert dissolves into the sky). Below the horizon: fog color.
  float h = clamp(up, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
  // Subtle warm glow low in the east, from the firelit camp (very faint).
  col += vec3(0.0016, 0.0009, 0.0004) * exp(-abs(up) * 7.0) * smoothstep(-0.2, 0.9, d.x);

  float horizonFade = smoothstep(-0.02, 0.22, up);

  // Milky Way: soft glow modulated by noise, with dark dust lanes along the plane.
  float band = galBand(d);
  float n1 = fbm(d * 3.2);
  float n2 = fbm(d * 7.5 + 4.0);
  float core = pow(max(dot(d, normalize(GAL_CORE)), 0.0), 3.0);
  float glow = band * (0.35 + 0.9 * n1) * (0.55 + 0.9 * core);
  float lane = smoothstep(0.52, 0.72, n2) * exp(-pow(dot(d, normalize(GAL_N)) / 0.06, 2.0));
  glow *= 1.0 - 0.75 * lane;
  vec3 mwCol = mix(vec3(0.42, 0.52, 0.80), vec3(0.95, 0.78, 0.62), core);
  col += mwCol * glow * 0.07 * horizonFade;

  // Stars: dim dense field, medium field, rare bright ones, plus galactic population.
  vec3 stars = vec3(0.0);
  stars += starLayer(d, 90.0, 0.35, 0.030, 1.4, false);
  stars += starLayer(d, 36.0, 0.2, 0.040, 1.8, false);
  stars += starLayer(d, 11.0, 0.12, 0.034, 2.4, false);
  stars += starLayer(d, 150.0, 0.9, 0.035, 0.8, true);
  stars += starLayer(d, 55.0, 0.6, 0.040, 1.3, true);
  // Dust lanes also dim the stars behind them a little.
  stars *= 1.0 - 0.5 * lane;
  col += stars * horizonFade;
#ifdef ATMO
  col = atmoSky(col, d);
#endif

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Returns a Mesh; call `mesh.userData.update(camera, time)` each frame. */
export function createSky({ fogColor = 0x0b0f1c, atmosphere = false } = {}) {
  const horizon = new THREE.Color(fogColor).multiplyScalar(1.0);
  // A touch lighter/warmer just above the horizon is done in the shader; zenith is darker.
  const zenith = new THREE.Color(fogColor).multiplyScalar(0.28);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uHorizon: { value: new THREE.Vector3(horizon.r, horizon.g, horizon.b) },
      uZenith: { value: new THREE.Vector3(zenith.r, zenith.g, zenith.b) },
      ...(atmosphere ? ATMO : {}),
    },
    defines: atmosphere ? { ATMO: '' } : {},
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 32), material);
  mesh.name = 'sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  mesh.userData.update = (camera, time) => {
    mesh.position.copy(camera.position);
    material.uniforms.uTime.value = time % 1000;
  };
  return mesh;
}
