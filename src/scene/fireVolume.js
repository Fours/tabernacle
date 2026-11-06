import * as THREE from 'three';
import { FOG_ADDITIVE_GLSL, FIRE_RAMP_GLSL, FLAME_GLSL, fogUniforms, createNoiseTexture, noise1 } from './fireCommon.js';

// The body of a fire (createFlames, used by createFire): a raymarched volume of flame inside a
// tight cylinder round the burning bed, one draw per fire.
//
// The field is fuel-driven rather than a fixed silhouette: heat is highest in the middle of the
// bed and falls with height, and noise erodes it more and more as it rises, so the flame is a
// continuous hot body low down that splits into separate tongues higher up, whose tips pinch off
// into flamelets that cool and burn out above the body. The noise is advected in a buoyant
// frame (sampled at sqrt(height) minus time), so features rise slowly at the bed, accelerate
// upward and stretch as they go, as hot gas does. Fine, fast turbulence dominates low, a larger,
// slower roll of tongues higher; a low-frequency domain warp bends the tongues side to side,
// the whole flame leans with the per-fire wind and its height and heat pulse with the fire's
// `level` (the same value that drives the light's flicker).
//
// Colour comes from the shared temperature ramp (FIRE_RAMP_GLSL): emission and absorption both
// follow the density, so a thick flame converges on its ramp colour (a bright yellow-orange
// body, its yellow core in HDR for bloom) instead of summing to white, thin edges stay
// translucent and the cooler tips go orange-red. Output is premultiplied: rgb is emitted light,
// alpha how much the flame hides what's behind it.
//
// Rendering: the cylinder's front faces are drawn (its back faces when the camera is inside it)
// and the fragment shader intersects the view ray with the cylinder analytically, marching only
// the segment inside it (rays that miss do nothing) in up to MAX_STEPS steps, jittered per
// pixel with interleaved gradient noise. The step grows as the flame gets small on screen and the
// warp and fine noise fade out (level of detail per draw, set in onBeforeRender). Samples outside the flame's envelope skip the noise
// lookups, and the march stops once the flame is nearly opaque. The 3D noise is a tiling 64^3
// value-noise texture shared by all fires. An optional grate (the altar's bars) is intersected
// analytically and ends the ray where it hits a bar, so the bars cut the flames' bases.
//
// The fire's group may be translated but not rotated or scaled (rays are traced in its frame).

const MAX_STEPS = 56;
const SEGMENTS = 16;
// Level of detail by the flame's projected height (px): step in flame heights is
// clamp(STEP_PX / px, STEP_MIN, STEP_MAX); the warp and fine noise fade in over DETAIL_PX.
const STEP_MIN = 0.025;
const STEP_MAX = 0.15;
const STEP_PX = 3;
const DETAIL_PX = [10, 30];
const GUST = 0.4; // gusts vary the flame's lean by ±40%
const viewport = new THREE.Vector4();

const VERT = /* glsl */ `
varying vec3 vLocal;
#include <fog_pars_vertex>
void main() {
  vLocal = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform float uBrightness;
uniform float uCore;
uniform float uLevel;
uniform vec2 uWind;
uniform vec3 uCam;       // camera position in the fire's frame (m)
uniform vec3 uShape;     // foot radius, bounding radius, bounding top (m)
uniform vec3 uSeed;      // per-fire offset into the noise
uniform vec4 uGrate;     // bars: bottom y, top y, pitch, half width (m); pitch 0 = no grate
uniform float uGrateO;   // a bar's centre (x and z) (m)
uniform float uGrateR;   // half extent of the grate (m)
uniform vec2 uOptics;    // absorption, emission per flame height at full density
uniform vec4 uFlow;      // speed, raggedness, lean (x wind), fine detail 0..1 (by screen size)
uniform vec2 uSolid;     // a solid core the flame wraps (the torch's crown): radius, top (m); radius 0 = none
uniform float uStep;     // march step in flame heights (by screen size)
varying vec3 vLocal;
${FOG_ADDITIVE_GLSL}
${FIRE_RAMP_GLSL}
${FLAME_GLSL}

bool inBar(vec2 xz) {
  if (max(abs(xz.x), abs(xz.y)) > uGrateR) return false;
  vec2 c = (xz - uGrateO) / uGrate.z;
  vec2 d = abs(c - floor(c + 0.5)) * uGrate.z;
  return min(d.x, d.y) < uGrate.w;
}

// Density (0..1) and temperature (0..1) at p (m, in the fire's frame).
vec2 flame(vec3 p, float T) {
  float H = uHeight;
  vec3 q = p / H;              // in flame heights
  float top = 1.0 + 0.16 * uLevel;
  float v = q.y / top;         // 0 at the bed, ~1 at the typical tip
  q.xz -= uWind * uFlow.z * q.y * q.y; // lean with the wind, growing with the rise
  float foot = uShape.x / H;
  // Envelope: a broad base narrowing upward (a soft cone), widening the noise's reach.
  float envR = foot * (1.0 - 0.62 * smoothstep(0.0, 1.15, v));
  float r0 = length(q.xz);
  if (r0 > envR * 1.55 + 0.05 || v > 1.45) return vec2(0.0);
  // Buoyant frame: g is concave in height, so a pattern scrolling uniformly in g rises slowly at
  // the bed and accelerates (and stretches) as it climbs.
  float g = flameRise(q.y);
  // Large, slow eddies bend the tongues side to side, more so higher up.
  // (A fire only a few pixels tall skips the warp and the fine noise: sub-pixel detail would
  // only shimmer.)
  vec2 xz = q.xz;
  float nF = 0.5;
  if (uFlow.w > 0.0) {
    xz = flameWarp(xz, g, v, T, uSeed, uFlow.w);
    nF = flameFine(xz, g, T, uSeed, uFlow.w);
  }
  // Tongues: upward-stretched cells rising with the flow; fine fast turbulence near the bed.
  float n = flameMix(nF, flameTongue(xz, g, T, uSeed), v) * uFlow.y;
  float prof = 1.0 - length(xz) / envR; // 1 on the axis, 0 at the envelope
  // Heat: hot over the middle of the bed, cooling with height; the noise erodes it more and
  // more as it rises, so the body splits into tongues and their tips into flamelets.
  float heat = 0.95 * prof + 0.45 - 1.2 * v + n * (0.4 + 0.6 * v) + 0.1 * uLevel;
  heat += 0.3 * (1.0 - smoothstep(0.0, 0.4, v)) * smoothstep(-0.3, 0.3, prof); // dense over the bed
  heat -= (1.0 - smoothstep(0.0, 0.035, q.y)) * 0.6;
  // Soft fade well inside the bounding cylinder (never a cut edge).
  heat -= smoothstep(uShape.y * 0.8, uShape.y, length(p.xz)) + smoothstep(0.85, 1.0, p.y / uShape.z);
  if (heat <= 0.0) return vec2(0.0);
  return flameShade(heat, v);
}

void main() {
  vec3 o = uCam;
  vec3 d = normalize(vLocal - o);
  float rB = uShape.y, yTop = uShape.z;
  // Ray against the bounding cylinder (axis y, 0 <= y <= yTop).
  float a = max(dot(d.xz, d.xz), 1e-6);
  float b = dot(o.xz, d.xz);
  float c = dot(o.xz, o.xz) - rB * rB;
  float disc = b * b - a * c;
  if (disc <= 0.0) discard;
  float sq = sqrt(disc);
  float t0 = (-b - sq) / a, t1 = (-b + sq) / a;
  if (abs(d.y) > 1e-5) {
    float ty0 = -o.y / d.y, ty1 = (yTop - o.y) / d.y;
    t0 = max(t0, min(ty0, ty1));
    t1 = min(t1, max(ty0, ty1));
  } else if (o.y < 0.0 || o.y > yTop) {
    discard;
  }
  t0 = max(t0, 0.0);
  // The grate: the first bar the ray meets within the bars' slab ends it.
  if (uGrate.z > 0.0 && abs(d.y) > 1e-4) {
    float ts0 = max((uGrate.x - o.y) / d.y, t0), ts1 = min((uGrate.y - o.y) / d.y, t1);
    if (ts0 > ts1) { float tmp = ts0; ts0 = ts1; ts1 = tmp; }
    ts0 = max(ts0, t0); ts1 = min(ts1, t1);
    if (ts1 > ts0) {
      for (int k = 0; k <= 6; k++) {
        float ts = mix(ts0, ts1, float(k) / 6.0);
        if (inBar((o + d * ts).xz)) { t1 = ts; break; }
      }
    }
  }
  // The solid core (a vertical cylinder up to uSolid.y) ends the ray where it enters it.
  if (uSolid.x > 0.0) {
    float cs = dot(o.xz, o.xz) - uSolid.x * uSolid.x;
    float ds = b * b - a * cs;
    if (ds > 0.0) {
      float ts = (-b - sqrt(ds)) / a;
      float ys = o.y + d.y * ts;
      if (ts > t0 && ys < uSolid.y) t1 = min(t1, ts);
      else if (cs > 0.0 && d.y < 0.0 && o.y > uSolid.y) {
        // From above: the cap.
        float tc = (uSolid.y - o.y) / d.y;
        vec2 pc = o.xz + d.xz * tc;
        if (dot(pc, pc) < uSolid.x * uSolid.x) t1 = min(t1, tc);
      }
    }
  }
  if (t1 <= t0) discard;

  float H = uHeight;
  float len = t1 - t0;
  float n = clamp(ceil(len / (uStep * H)), 6.0, ${MAX_STEPS}.0);
  float dt = len / n;
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float t = t0 + dt * ign;
  float T = uTime * uFlow.x;
  // Straight down a flame the ray runs its whole hot core and would settle on the ramp's palest
  // yellow; damp the core a little on near-vertical rays so the top view stays fire-coloured.
  float vert = smoothstep(0.4, 0.9, abs(d.y));
  float coreK = uCore * (1.0 - 0.45 * vert);
  float tempK = 1.0 - 0.12 * vert;
  float dtn = dt / H; // step in flame heights (the look is independent of the fire's size)
  vec3 col = vec3(0.0);
  float tr = 1.0;
  for (int i = 0; i < ${MAX_STEPS}; i++) {
    if (float(i) >= n || tr < 0.02) break;
    vec2 f = flame(o + d * t, T);
    if (f.x > 0.0) {
      float od = f.x * dtn;
      col += tr * od * uOptics.y * fireRampCore(f.y * tempK, coreK);
      tr *= exp(-od * uOptics.x);
    }
    t += dt;
  }
  float alpha = 1.0 - tr;
  if (alpha < 0.002) discard;
  float fade = 1.0 - fogAmount();
  gl_FragColor = vec4(max(col, vec3(0.0)) * uBrightness * fade, alpha * 0.85 * fade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

let sharedNoise = null;
let noiseUsers = 0;

/**
 * The flame volume (one draw) sharing the fire's uniforms `u` (uTime, uHeight, uWind,
 * uBrightness, uLevel).
 * @param {object} o
 * @param {number} o.foot     Radius of the flame's base (m).
 * @param {number} o.height   Typical flame height (m).
 * @param {number} [o.core=1] Brightness of the yellow core.
 * @param {number[]} [o.seed] Offset into the noise (3 numbers in 0..1).
 * @param {{y:number[], pitch:number, bar:number, origin:number, half:number}} [o.grate]
 *   Bars that cut the flame (fire frame, m): slab y range, centre-to-centre pitch, bar width, a
 *   bar's centre, half extent.
 * @param {number} [o.speed=1]  Time scale of the flame's motion (small fires flicker faster).
 * @param {number} [o.ragged=1] Strength of the noise eroding the flame (more, ragged tongues).
 * @param {number} [o.lean=1]   Lean with the wind relative to the particles' drift; gusts
 *   vary it by ±GUST.
 * @param {number} [o.thickness=1] Optical thickness (absorption and emission per flame height):
 *   a small flame is optically thinner, so more translucent and less saturated.
 * @param {number[]} [o.solid]  A solid core the flame wraps, [radius, top] (m, fire frame): a
 *   vertical cylinder that ends the ray (the torch's burning crown).
 */
export function createFlames(u, {
  foot, height, core = 1, seed = [0, 0, 0], grate = null, speed = 1, ragged = 1, lean: leanK = 1, solid = null, thickness = 1,
}) {
  if (!sharedNoise) sharedNoise = createNoiseTexture(53);
  noiseUsers++;
  const lean = Math.hypot(u.uWind.value.x, u.uWind.value.y) * height * leanK * (1 + GUST);
  const rB = foot * 1.45 + lean * 0.5;
  const yTop = height * 1.4;
  const geo = new THREE.CylinderGeometry(rB / Math.cos(Math.PI / SEGMENTS), rB / Math.cos(Math.PI / SEGMENTS), yTop, SEGMENTS, 1, false);
  geo.translate(0, yTop / 2, 0);
  const g = grate ?? { y: [0, 0], pitch: 0, bar: 0, origin: 0, half: 0 };
  const mat = new THREE.ShaderMaterial({
    name: 'fire-volume',
    uniforms: {
      ...u,
      ...fogUniforms(),
      uCore: { value: core },
      uNoise: { value: sharedNoise },
      uCam: { value: new THREE.Vector3() },
      uShape: { value: new THREE.Vector3(foot, rB, yTop) },
      uSeed: { value: new THREE.Vector3(...seed) },
      uGrate: { value: new THREE.Vector4(g.y[0], g.y[1], g.pitch, g.bar / 2) },
      uGrateO: { value: g.origin },
      uGrateR: { value: g.half },
      uOptics: { value: new THREE.Vector2(5.0 * thickness, 8.0 * thickness) },
      uFlow: { value: new THREE.Vector4(speed, ragged, leanK, 1) },
      uSolid: { value: new THREE.Vector2(...(solid ?? [0, 0])) },
      uStep: { value: STEP_MIN },
    },
    fog: true,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fire-flames';
  mesh.renderOrder = 2;
  const cam = mat.uniforms.uCam.value;
  const flow = mat.uniforms.uFlow.value;
  const seedPhase = seed[0] * 97;
  // Camera in the fire's frame; inside the cylinder draw its back faces (the front ones are
  // behind the camera). Level of detail from the flame's projected height in pixels: the step
  // grows (fewer samples) and the warp and fine noise fade out as the fire gets small on screen.
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.worldToLocal(cam.setFromMatrixPosition(camera.matrixWorld));
    const inside = Math.hypot(cam.x, cam.z) < rB * 1.08 + camera.near && cam.y > -camera.near && cam.y < yTop + camera.near;
    mat.side = inside ? THREE.BackSide : THREE.FrontSide;
    const dist = Math.max(Math.hypot(cam.x, cam.y - height * 0.5, cam.z), 1e-3);
    renderer.getCurrentViewport(viewport);
    const fy = camera.isPerspectiveCamera ? Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) : 1;
    const px = (height / (dist * fy)) * viewport.w * 0.5;
    mat.uniforms.uStep.value = Math.min(Math.max(STEP_MIN, STEP_PX / px), STEP_MAX);
    flow.w = THREE.MathUtils.smoothstep(px, DETAIL_PX[0], DETAIL_PX[1]);
    flow.z = leanK * (1 + GUST * noise1(u.uTime.value * 0.45 + seedPhase));
  };
  const noiseRef = {
    dispose() {
      if (--noiseUsers === 0) {
        sharedNoise.dispose();
        sharedNoise = null;
      }
    },
  };
  return { object: mesh, disposables: [geo, mat, noiseRef] };
}
