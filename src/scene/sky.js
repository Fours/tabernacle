import * as THREE from 'three';
import { ATMO, ATMO_GLSL } from '../render/atmosphere.js';
import { HORIZON_GLSL } from './horizon.js';
import { PILLAR_OF_FIRE as P, m } from '../config/dimensions.js';

// Night sky dome: gradient, airglow, procedural star field (anti-aliased hashed-cell discs), the
// Milky Way with its dust lanes, slow twinkle, an occasional meteor, the thin high haze lit by
// the pillar of fire's shaft and the distant ridges (scene/horizon.js); no moon. One mesh, one
// draw call.
// The dome follows the camera, ignores fog, and is drawn after the opaque scene, depth-tested,
// so only the pixels where the sky shows run its shader.
// With the atmosphere on (render/atmosphere.js) the ground haze closes the horizon and the
// fires' glow in the air continues against the sky (atmoSky), matching the fogged ground.

const f = (v) => v.toFixed(3);
// The thin high haze sits where the pillar's shaft has faded (pillarOfFire.js: the shaft's light
// falls off over ~60 m and is gone ~150 m above the fire's top), over the shaft's axis.
const CLOUD = { x: m(P.x), z: m(P.z), y: P.baseY + P.columnHeight + 0.8 * P.shaftHeight };

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
${HORIZON_GLSL}

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

// Milky Way: soft glow with star clouds, a brighter, wider bulge round the core, and dark dust
// lanes: a fine mottled network everywhere plus the Great Rift splitting the band toward the
// core. Colour drifts from cool blue-white in the arms to warm cream in the bulge, with a few
// faint pinkish nebular patches. Returns the glow; lane (0..1) dims the stars behind it.
vec3 milkyWay(vec3 d, out float lane) {
  lane = 0.0;
  vec3 gn = normalize(GAL_N);
  float b = dot(d, gn);
  float core = pow(max(dot(d, normalize(GAL_CORE)), 0.0), 3.0);
  float width = 0.15 + 0.09 * core; // the bulge is wider
  float band = exp(-b * b / (2.0 * width * width));
  if (band < 0.01) return vec3(0.0);
  float n1 = fbm(d * 3.2);
  float n2 = fbm(d * 7.5 + 4.0);
  float n3 = vnoise(d * 22.0 + 9.0);
  float clouds = 0.3 + 0.9 * n1 + 0.35 * (n3 - 0.5);
  float glow = band * clouds * (0.5 + 1.3 * core);
  // Great Rift: a dark lane just off the plane, widening and deepening toward the core.
  float rift = exp(-pow((b - 0.02 - 0.07 * (n2 - 0.5)) / (0.02 + 0.03 * core), 2.0))
    * smoothstep(0.1, 0.7, core + 0.5 * (n1 - 0.4)) * smoothstep(0.3, 0.6, n3 * 0.5 + n2 * 0.6);
  // Fine dust: mottled filaments along the plane.
  float fine = smoothstep(0.5, 0.72, n2) * exp(-pow(b / 0.07, 2.0));
  lane = clamp(max(rift * 0.7, fine * 0.75) * (0.7 + 0.5 * n3), 0.0, 1.0);
  glow *= 1.0 - 0.85 * lane;
  vec3 tint = mix(vec3(0.42, 0.52, 0.80), vec3(0.98, 0.80, 0.60), clamp(core * 1.3, 0.0, 1.0));
  tint = mix(tint, vec3(0.62, 0.62, 0.78), 0.4 * smoothstep(0.55, 0.8, n1) * (1.0 - core));
  tint += vec3(0.12, 0.02, 0.04) * smoothstep(0.72, 0.88, n3) * band * (0.4 + core); // HII
  return tint * glow * 0.075;
}

// Airglow: a faint green-olive band peaking ~8 degrees up (the van Rhijn brightening of the
// upper atmosphere's emission toward the horizon), slightly patchy.
vec3 airglow(vec3 d) {
  float up = d.y;
  float prof = exp(-pow((up - 0.13) / 0.11, 2.0)) + 0.45 * exp(-max(up, 0.0) * 9.0);
  float patchy = 0.8 + 0.2 * sin(d.x * 9.0 + 1.3 * sin(d.z * 7.0)) * sin(d.z * 6.0 + 0.7);
  return vec3(0.0006, 0.0011, 0.0006) * prof * patchy * smoothstep(-0.05, 0.02, up);
}

// The pillar's shaft fading into a thin, high haze: a layer of faint cirrus streaks at
// CLOUD_Y metres, lit warmly around the shaft's top and invisible away from it.
uniform float uCloudGain;
const float CLOUD_Y = ${f(CLOUD.y)};
const vec2 SHAFT_XZ = vec2(${f(CLOUD.x)}, ${f(CLOUD.z)});
vec3 shaftHaze(vec3 d, out float veil) {
  veil = 0.0;
  vec3 c = cameraPosition;
  if (d.y < 0.02 || c.y > CLOUD_Y) return vec3(0.0);
  float t = (CLOUD_Y - c.y) / d.y;
  vec2 p = c.xz + d.xz * t;
  vec2 q = p - SHAFT_XZ;
  float r2 = dot(q, q);
  float near = exp(-r2 / (260.0 * 260.0));
  if (near < 0.005) return vec3(0.0);
  // Streaks stretched along the high wind, drifting slowly.
  const vec2 W = vec2(0.42, -0.907);
  vec2 s = vec2(dot(p, W), dot(p, vec2(-W.y, W.x))) + vec2(uTime * 1.2, 0.0);
  float n = vnoise(vec3(s.x / 70.0, s.y / 14.0, 1.7)) * 0.65 + vnoise(vec3(s.x / 30.0, s.y / 6.0, 5.3)) * 0.35;
  float cir = smoothstep(0.3, 0.8, n);
  float dens = (0.2 + 0.8 * cir) * min(0.35 / d.y, 3.0); // seen obliquely, a thicker path
  float lit = exp(-r2 / (40.0 * 40.0)) + 0.3 * exp(-sqrt(r2) / 90.0);
  veil = 0.3 * cir * near;
  return vec3(1.0, 0.62, 0.26) * lit * dens * uCloudGain;
}

// An occasional faint meteor: one slot per METEOR_P seconds, starting at a deterministic time
// in its first 12 s (so 18-42 s apart), a short streak along a great circle.
const float METEOR_P = 30.0;
const float METEOR_DUR = 0.8;
vec3 meteor(vec3 d) {
  float k = floor(uTime / METEOR_P);
  float t0 = k * METEOR_P + fract(k * 0.618034) * 12.0;
  float tau = uTime - t0;
  if (tau < 0.0 || tau > METEOR_DUR) return vec3(0.0);
  vec3 h = hash33(vec3(k * 3.7 + 1.3, 7.1, 3.3));
  float az = h.x * 6.2831853, el = mix(0.35, 1.2, h.y);
  vec3 A = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  vec3 side = normalize(cross(A, vec3(0.0, 1.0, 0.0)));
  vec3 upT = normalize(vec3(0.0, 1.0, 0.0) - A * A.y);
  vec3 T = normalize(-upT * 0.8 + side * (h.z * 2.0 - 1.0));
  vec3 N = cross(A, T);
  float perp = dot(d, N);
  float along = atan(dot(d, T), dot(d, A));
  float head = 0.32 * tau / METEOR_DUR + 0.02;
  float tail = 0.09;
  float w = max(fwidth(perp) * 0.9, 0.0004);
  float line = exp(-perp * perp / (w * w));
  float s = clamp((along - (head - tail)) / tail, 0.0, 1.0);
  float body = s * s * smoothstep(head + 0.003, head, along);
  float env = sin(3.14159 * tau / METEOR_DUR);
  return vec3(0.85, 0.93, 1.0) * line * body * env * env * 0.5 * smoothstep(0.03, 0.15, d.y);
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
  col += airglow(d);

  float horizonFade = smoothstep(-0.02, 0.22, up);

  float lane;
  col += milkyWay(d, lane) * horizonFade;

  // Stars: dim dense field, medium field, rare bright ones, plus galactic population.
  vec3 stars = vec3(0.0);
  stars += starLayer(d, 90.0, 0.35, 0.030, 1.4, false);
  stars += starLayer(d, 36.0, 0.2, 0.040, 1.8, false);
  stars += starLayer(d, 11.0, 0.12, 0.034, 2.4, false);
  stars += starLayer(d, 150.0, 0.9, 0.035, 0.8, true);
  stars += starLayer(d, 55.0, 0.6, 0.040, 1.3, true);
  // Dust lanes also dim the stars behind them a little.
  stars *= 1.0 - 0.55 * lane;
  float veil;
  vec3 haze = shaftHaze(d, veil);
  col += stars * horizonFade * (1.0 - veil);
  col += meteor(d) * (1.0 - veil);
  col += haze;
  // Distant ridges (scene/horizon.js) in front of all of it.
  col = horizonRidges(col, d, uHorizon, cameraPosition.y);
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
      uCloudGain: { value: 0.03 },
      uHorizon: { value: new THREE.Vector3(horizon.r, horizon.g, horizon.b) },
      uZenith: { value: new THREE.Vector3(zenith.r, zenith.g, zenith.b) },
      ...(atmosphere ? ATMO : {}),
    },
    defines: atmosphere ? { ATMO: '' } : {},
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 32), material);
  mesh.name = 'sky';
  // Drawn after every opaque mesh (and before the transparent ones), depth-tested against them,
  // so its fairly heavy shader only runs where the sky is actually seen. The dome (500 m)
  // lies beyond the ground and the camp (< 430 m) and inside the camera's far plane (1000 m).
  mesh.renderOrder = 1000;
  mesh.frustumCulled = false;
  // `timeOverride` (seconds) pins the sky's clock, e.g. to show a meteor: they start at
  // k * 30 + fract(k * 0.618034) * 12 s and last 0.8 s (k = 0..32).
  mesh.userData.timeOverride = null;
  mesh.userData.update = (camera, time) => {
    mesh.position.copy(camera.position);
    material.uniforms.uTime.value = (mesh.userData.timeOverride ?? time) % 990;
  };
  return mesh;
}
