import * as THREE from 'three';
import { PILLAR_OF_FIRE as P, m } from '../config/dimensions.js';
import { NOISE_GLSL, FOG_ADDITIVE_GLSL, FIRE_RAMP_GLSL, FLAME_GLSL, HASH_GLSL, fogUniforms, rng, randAttribute, createNoiseTexture } from './fireCommon.js';

// The pillar of fire over the tent by night (Num 9:15-16): a tall column of slowly churning fire
// standing in the sky above the Holy of Holies, and above it a long shaft of yellowish light
// fading up into the stars.
//
// Two draws:
// 1. The volume: a closed, flared cylinder (back faces only, so it still draws when the camera
//    is close) bounds the effect. For the fire column its fragment shader intersects the view
//    ray with an inner cylinder around the axis (rays that miss skip the march) and raymarches
//    that segment in steps of ~2.5 px (0.1-0.5 m by distance, at most MAX_STEPS), jittered per
//    pixel with interleaved gradient noise (stable over time, so it never crawls). Samples beyond
//    the tongues' reach leap toward it (empty space costs a few steps) and the march stops once
//    the column is nearly opaque. The column speaks the altar's flame language (FLAME_GLSL in
//    fireCommon.js, the tiling 64^3 noise texture): its slowly rolling surface (at ~70% of the
//    decided envelope: a soft point at the foot, then narrowing steadily to ~45% at the top) is
//    the "bed" of a mass of altar-like flames ~5 m tall and a few tenths of a meter across. Heat
//    is high inside (one coherent body) and eroded by the noise toward and beyond the surface,
//    so the surface breaks into tongues licking up the rim, rising in a buoyant frame, with fine
//    fast turbulence at the foot; two tongue layers with staggered life cycles make tongues
//    form, break up and burn out. Heat → density and temperature as for the altar (shared
//    blackbody ramp, HDR core blooms); emission and absorption follow the density, so thick
//    flame settles on its ramp colour, edges stay translucent and the column dims the sky behind
//    it a little (premultiplied alpha). Over its upper 60% brightness, density and absorption
//    fade and the colour drifts to the shaft's yellow, handing over to the shaft without a neck.
//    The shaft above stays analytic (closest approach of the ray to the axis, Gaussian across,
//    slow rippling streaks), below bloom's threshold.
// 2. Embers: a swirl of 480 small embers spiralling slowly up around the column (one
//    instanced draw, placed in the vertex shader from time).
//
// Fog: half the scene's fog, faded to black. Full fog would bury the shaft from the courtyard
// (60-80 m away, ~50% fog), none would make the column's foot look pasted on.

const MAX_STEPS = 96;
const REACH = 1.0; // m: how far tongues can lick outside the column's envelope
const viewport = new THREE.Vector4();

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
uniform float uTime;
uniform vec3 uBase;          // world position of the column's foot (m)
uniform float uColH;         // column height (m)
uniform float uColR;         // column radius scale (m)
uniform float uMarchR;       // radius of the marched cylinder (m)
uniform float uShaftH;       // shaft height above the column (m)
uniform float uShaftR;       // shaft radius at its foot (m)
uniform float uShaftSpread;  // radius gained per meter
uniform vec2 uBound;         // bounding radius at the foot and at the top (m)
uniform float uColGain;
uniform vec2 uOptics;        // emission, absorption per meter at full density
uniform vec3 uFlame;         // flame height of the tongues' noise (m), heat depth scale (m), raggedness
uniform vec2 uHeat;          // heat at the surface, gained per unit of depth
uniform float uReach;        // how far tongues can lick outside the envelope (m)
uniform float uPix;          // meters per pixel per meter of distance (2 tan(fov/2) / viewport px)
uniform float uOcclusion;    // how much the column dims what's behind it
uniform float uShaftGain;
uniform float uFogMix;
varying vec3 vWorld;
${NOISE_GLSL}
${FOG_ADDITIVE_GLSL}
${FIRE_RAMP_GLSL}
${FLAME_GLSL}

// Radius of the column's envelope at height y: the foot tapers almost to a point over its lowest
// ~4.5 m; above that it narrows slowly and steadily to ~45% at its top (no shoulder).
float narrowing(float y) { return mix(1.0, 0.45, clamp((y - 4.5) / (uColH - 4.5), 0.0, 1.0)); }
float envelope(float y) {
  float taper = mix(0.06, 1.0, pow(smoothstep(0.0, 4.5, y), 0.6));
  return 1.9 * uColR * taper * narrowing(y);
}

vec2 axisSway(float y, float T) {
  return vec2(0.22 * sin(y * 0.33 - T * 0.37) + 0.12 * sin(y * 0.71 + T * 0.23),
              0.16 * sin(y * 0.29 + T * 0.31 + 1.3));
}

const vec3 SEED_W = vec3(0.11, 0.53, 0.29);
const vec3 SEED_A = vec3(0.67, 0.21, 0.83);
const vec3 SEED_B = vec3(0.39, 0.91, 0.47);

// Density (0..1), temperature (0..1) and brightness (the long fade toward the shaft) at p
// (relative to the foot, swayed onto the axis, m), r = distance from the axis. The column is a
// mass of altar-like flames: the heat is that of the altar's flame field (FLAME_GLSL), its
// "bed" being the column's slowly rolling surface. Deep inside it stays hot (one coherent body);
// at the surface the tongue noise erodes it into tongues that lick upward along the rim, pinch
// off and burn out, with fine fast turbulence at the foot.
vec3 fireField(vec3 p, float r, float T, float detail) {
  float y = p.y;
  float R = envelope(y);
  float Hf = uFlame.x;
  // Slow large rolls of the surface (about +-15% of the radius) rising up the column.
  float nb = tn(vec3(p.x * 0.045, y * 0.03 - T * 0.05, p.z * 0.045));
  float foot = smoothstep(0.0, 4.5, y);
  // Depth inside the rolling surface (in units of the heat's depth scale, smaller at the point).
  // The flames' mean surface lies at 70% of the envelope; tongues lick out to about its edge.
  float depth = (R * (0.7 + (nb - 0.5) * 0.2) - r) / (uFlame.y * mix(0.25, 1.0, foot));
  float tip = clamp(0.55 - depth, 0.0, 1.0); // like the altar's height up the flame: the rim is its tips
  float v = foot * (0.45 + 0.55 * tip); // fine at the foot, tongues on the rim
  // Buoyant frame in flame heights: sqrt over the lowest flame height (features leave the
  // foot slowly and accelerate), then linear (the same rise speed all the way up).
  float yh = y / Hf;
  float g = yh < 1.0 ? flameRise(yh) : 1.0247 + (yh - 1.0) * 0.488;
  // A slow twist with height: the noise tile (~2 m across) never lines up down the column.
  float ang = y * 0.06;
  vec2 xz = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * p.xz / Hf;
  float nF = 0.5;
  if (detail > 0.0) {
    xz = flameWarp(xz, g, v, T, SEED_W, detail);
    nF = flameFine(xz, g, T, SEED_W, detail);
  }
  // Two layers of tongues with staggered life cycles (each fades out and is reseeded while
  // the other carries the fire), the phase varying over the column so they never pulse
  // together: tongues are born, rise, break up and burn out instead of scrolling for ever.
  float ph = T * 0.45 + y * 0.045 + nb * 2.0;
  float wA = 1.0 - abs(2.0 * fract(ph) - 1.0), wB = 1.0 - wA;
  vec3 oA = fract(vec3(0.37, 0.71, 0.13) * floor(ph));
  vec3 oB = fract(vec3(0.59, 0.23, 0.87) * floor(ph + 0.5));
  float nT = ((flameTongue(xz, g, T, SEED_A + oA) - 0.5) * wA + (flameTongue(xz, g, T, SEED_B + oB) - 0.5) * wB)
    * inversesqrt(wA * wA + wB * wB) + 0.5;
  float n = flameMix(nF, nT, v) * uFlame.z;
  // Heat: hot inside, eroded by the noise more and more toward and beyond the rim.
  float heat = uHeat.x + uHeat.y * min(depth, 1.2) + n * (0.4 + 0.6 * tip);
  heat -= (1.0 - smoothstep(0.0, 2.5, y)) * 0.6; // the foot's very point is cooler
  heat -= smoothstep(0.4, 1.0, (r - R * 1.15) / uReach); // soft fade before the march's reach
  if (heat <= 0.0) return vec3(0.0);
  vec2 f = flameShade(heat, tip);
  float dens = f.x * (1.0 - smoothstep(uColH * 0.5, uColH * 1.02, y));
  // Higher up the profile flattens (the rim stays hot), so the column keeps its width as it fades.
  float up = smoothstep(uColH * 0.4, uColH, y);
  float temp = clamp(f.y + up * 0.2 * tip, 0.0, 1.0);
  // Brightness per meter grows as the column narrows (so it doesn't dim just by thinning) and
  // falls over the upper 60% toward the shaft's level.
  float bright = mix(1.0, 0.35, up) / narrowing(y);
  return vec3(dens, temp, bright);
}

void main() {
  vec3 o = cameraPosition - uBase;
  vec3 rd = vWorld - cameraPosition;
  float tEnd = length(rd);
  vec3 d = rd / max(tEnd, 1e-4);
  float a = max(dot(d.xz, d.xz), 1e-6);
  float T = uTime;
  vec3 col = vec3(0.0);
  float tr = 1.0;

  // ---- Fire column: raymarch the ray's segment inside the marched cylinder --------------
  float b = dot(o.xz, d.xz);
  float c = dot(o.xz, o.xz) - uMarchR * uMarchR;
  float disc = b * b - a * c;
  if (disc > 0.0) {
    float sq = sqrt(disc);
    float t0 = (-b - sq) / a, t1 = (-b + sq) / a;
    // Clip to the column's height range.
    float yLo = -0.5, yHi = uColH;
    if (abs(d.y) > 1e-5) {
      float ty0 = (yLo - o.y) / d.y, ty1 = (yHi - o.y) / d.y;
      t0 = max(t0, min(ty0, ty1));
      t1 = min(t1, max(ty0, ty1));
    } else if (o.y < yLo || o.y > yHi) {
      t1 = -1.0;
    }
    t0 = max(t0, 0.0);
    t1 = min(t1, tEnd);
    if (t1 > t0) {
      // Level of detail by distance: steps of ~2.5 px (0.1-0.5 m); the warp and the fine
      // noise fade out as a flame height shrinks below ~45 px (they would only shimmer).
      float pix = uPix * max(t0, 1.0);
      float dt = clamp(2.5 * pix, 0.1, 0.5);
      float detail = smoothstep(15.0, 45.0, uFlame.x / pix);
      // Interleaved gradient noise: per-pixel jitter, stable over time.
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float t = t0 + dt * ign;
      for (int i = 0; i < ${MAX_STEPS}; i++) {
        if (t >= t1 || tr < 0.03) break;
        vec3 p = o + d * t;
        p.xz -= axisSway(p.y, T);
        float r = length(p.xz);
        // Empty space: leap toward the reach of the tongues (the envelope's slope is < 0.6).
        float gap = r - envelope(p.y) * 1.15 - uReach;
        if (gap > 0.0) { t += max(gap * 0.75, dt); continue; }
        vec3 f = fireField(p, r, T, detail);
        if (f.x > 0.002) {
          // Emission and absorption both follow the density (as in the altar's flames), so
          // thick flame settles on its ramp colour and the edges stay translucent. Higher up
          // the column thins optically, glowing into the shaft.
          float rise = smoothstep(uColH * 0.3, uColH, p.y);
          float h = min(dt, t1 - t);
          float od = f.x * h;
          vec3 em = mix(fireRampCore(f.y, 1.0), vec3(1.3, 0.88, 0.31), 0.7 * rise) * f.z;
          col += tr * od * uOptics.x * em;
          tr *= exp(-od * uOptics.y * mix(1.0, 0.3, rise));
        }
        t += dt;
      }
      col *= uColGain;
    }
  }

  // ---- Shaft of light above it: closest approach of the ray to the axis ------------------
  float tc = clamp(-b / a, 0.0, tEnd);
  vec3 pc = o + d * tc;
  float y = pc.y;
  float H = uColH + uShaftH;
  if (y > uColH * 0.3 && y < H) {
    vec2 perp = vec2(-d.z, d.x) * inversesqrt(a);
    float s = dot(pc.xz, perp);
    float bound = mix(uBound.x, uBound.y, y / H);
    float win = 1.0 - smoothstep(0.75, 1.0, abs(s) / bound);
    float path = clamp(inversesqrt(a), 1.0, 3.0);
    float sw = s - 0.5 * axisSway(y, T).x;
    float ys = y - uColH * 0.7;
    float sigS = uShaftR + uShaftSpread * max(ys, 0.0);
    float gs = exp(-(sw * sw) / (sigS * sigS));
    // Slow ripples rising along it.
    float streak = fNoise(vec2(sw / sigS * 2.2 + 5.0, y * 0.06 - T * 0.12));
    float ripple = 0.85 + 0.15 * sin(y * 0.21 - T * 0.8 + streak * 3.0);
    float shaftY = smoothstep(uColH * 0.5, uColH * 0.95, y) * exp(-max(ys, 0.0) / (uShaftH * 0.4))
      * (1.0 - smoothstep(uShaftH * 0.2, uShaftH * 1.0, ys));
    col += tr * vec3(1.0, 0.68, 0.24) * gs * shaftY * (0.7 + 0.6 * streak) * ripple * uShaftGain * win * path;
  }

  float alpha = (1.0 - tr) * uOcclusion;
  if (col.r + col.g + alpha < 1e-4) discard;
  // Fine multiplicative dither against 8-bit banding in the long faint fade (stays >= 0).
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float fog = 1.0 - uFogMix * fogAmount();
  col = max(col, vec3(0.0)) * (1.0 + (dn - 0.5) * 0.04) * fog;
  gl_FragColor = vec4(col, alpha * fog);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---- Embers spiralling up around the column -----------------------------------------------

const EMBER_VERT = /* glsl */ `
uniform float uTime;
uniform float uColH;
uniform float uColR;
uniform float uViewportH;
attribute vec4 aRand;
attribute vec4 aRand2;
varying vec2 vUv;
varying float vTemp;
varying float vI;
#include <fog_pars_vertex>
${HASH_GLSL}
void main() {
  float life = mix(10.0, 18.0, aRand.x);
  float cyc = uTime / life + aRand.y;
  float age = fract(cyc);
  float h = h11(floor(cyc) + aRand.z * 41.0);
  float h2 = h11(floor(cyc) * 1.7 + aRand.w * 23.0);
  float y = mix(0.5, 5.0, h) + age * uColH * mix(0.75, 1.1, aRand.w);
  float foot = mix(0.35, 1.0, smoothstep(0.0, 4.5, y));
  float r = uColR * mix(1.3, 2.8, h2) * foot * (1.0 + 0.4 * age) * mix(0.88, 1.12, aRand2.x);
  float ang = (aRand.z + h) * 6.2831853 + uTime * mix(0.22, 0.45, aRand.w) * mix(0.94, 1.06, aRand2.y) + y * 0.08;
  vec3 c = vec3(cos(ang) * r, y, sin(ang) * r);
  c.y += 0.25 * sin(uTime * 1.3 + aRand.x * 20.0) + 0.4 * sin(uTime * 0.7 + aRand2.z * 6.2831853);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  // Small motes (0.025-0.06 m); about one in ten is a bit larger (0.07-0.11 m).
  float size = aRand2.w > 0.9 ? mix(0.07, 0.11, (aRand2.w - 0.9) * 10.0) : mix(0.025, 0.06, aRand2.w * 1.111);
  // Keep at least ~1.5 px across (dimming to match) so distant embers don't shimmer.
  float px = size * projectionMatrix[1][1] * 0.5 * uViewportH / max(-mv.z, 0.1);
  float grow = max(1.5 / max(px, 1e-3), 1.0);
  mv.xy += position.xy * 2.0 * size * grow;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0;
  vTemp = mix(0.9, 0.4, age) * mix(0.85, 1.0, h2);
  float flick = 0.75 + 0.25 * sin(uTime * mix(4.0, 9.0, aRand.y) + aRand.z * 30.0);
  vI = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.55, 1.0, age)) * flick / (grow * grow);
  vec4 mvPosition = mv;
  #include <fog_vertex>
}
`;

const EMBER_FRAG = /* glsl */ `
uniform float uBrightness;
uniform float uFogMix;
varying vec2 vUv;
varying float vTemp;
varying float vI;
${FOG_ADDITIVE_GLSL}
${FIRE_RAMP_GLSL}
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 >= 1.0) discard;
  float g = exp(-r2 * 5.0) * (1.0 - r2);
  vec3 col = fireRampCore(vTemp, 1.0) * g * vI * uBrightness * (1.0 - uFogMix * fogAmount());
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function createEmbers(count, seed) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(randAttribute(count, rng(seed)), 4));
  geo.setAttribute('aRand2', new THREE.InstancedBufferAttribute(randAttribute(count, rng(seed + 1)), 4));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, P.columnHeight * 0.55, 0), P.columnHeight * 0.75);
  const mat = new THREE.ShaderMaterial({
    name: 'pillar-embers',
    uniforms: {
      ...fogUniforms(),
      uTime: { value: 0 },
      uColH: { value: P.columnHeight },
      uColR: { value: P.columnRadius },
      uViewportH: { value: 1000 },
      uBrightness: { value: 2.8 },
      uFogMix: { value: 0.5 },
    },
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pillar-of-fire-embers';
  mesh.renderOrder = 11;
  const size = new THREE.Vector2();
  mesh.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(size);
    mat.uniforms.uViewportH.value = size.y;
  };
  return { mesh, disposables: [base, geo, mat] };
}

/**
 * @returns {THREE.Group} with userData.update(dt, time), userData.light, userData.uniforms,
 *   userData.dispose().
 */
export function createPillarOfFire() {
  const group = new THREE.Group();
  group.name = 'pillar-of-fire';
  const base = new THREE.Vector3(m(P.x), P.baseY, m(P.z));
  group.position.copy(base);

  const H = P.columnHeight + P.shaftHeight;
  const marchR = 1.9 * P.columnRadius * 1.15 + REACH + 0.4; // envelope × 1.15 + the tongues' reach, plus the axis sway
  const bound = new THREE.Vector2(
    Math.max(marchR, 2.5 * P.shaftRadius) + 0.6,
    2.4 * (P.shaftRadius + P.shaftSpread * H),
  );
  const geo = new THREE.CylinderGeometry(bound.y, bound.x, H, 24, 1, false);
  geo.translate(0, H / 2, 0);
  const noise = createNoiseTexture(29);

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uNoise: { value: null },
    uBase: { value: base.clone() },
    uColH: { value: P.columnHeight },
    uColR: { value: P.columnRadius },
    uMarchR: { value: marchR },
    uShaftH: { value: P.shaftHeight },
    uShaftR: { value: P.shaftRadius },
    uShaftSpread: { value: P.shaftSpread },
    uBound: { value: bound },
    uColGain: { value: 1.3 },
    uOptics: { value: new THREE.Vector2(0.8, 2.2) },
    uFlame: { value: new THREE.Vector3(5.0, 0.7, 1.0) },
    uReach: { value: REACH },
    uHeat: { value: new THREE.Vector2(0.2, 0.5) },
    uPix: { value: 0.001 },
    uOcclusion: { value: 0.35 },
    uShaftGain: { value: 0.5 },
    uFogMix: { value: 0.5 },
  }]);
  uniforms.uNoise.value = noise; // set after merge (merge would clone the texture)
  const mat = new THREE.ShaderMaterial({
    name: 'pillar-of-fire',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    transparent: true,
    depthWrite: false,
    // Premultiplied: rgb is emitted light, alpha how much the column dims what's behind it.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pillar-of-fire-volume';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 10; // after the other fires (it's mostly sky-backed)
  // Meters per pixel per meter of distance, for the march's level of detail.
  mesh.onBeforeRender = (renderer, scene, camera) => {
    renderer.getCurrentViewport(viewport);
    const fy = camera.isPerspectiveCamera ? Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) : 1;
    uniforms.uPix.value = (2 * fy) / Math.max(viewport.w, 1);
  };
  group.add(mesh);

  const embers = createEmbers(480, 71);
  group.add(embers.mesh);

  // Warm light in the column: softly lights the roof coverings and the courtyard. Above the
  // tent's interior box, so the interior mask classes it as outside. No shadow.
  const light = new THREE.PointLight(P.light.color, P.light.intensity, 0, P.light.decay);
  light.position.set(0, P.light.y, 0);
  light.castShadow = false;
  light.userData.baseIntensity = P.light.intensity; // tunable live; update() breathes around it
  group.add(light);

  group.userData.light = light;
  group.userData.uniforms = uniforms;
  group.userData.emberUniforms = embers.mesh.material.uniforms;
  group.userData.update = (dt, time) => {
    uniforms.uTime.value = time;
    embers.mesh.material.uniforms.uTime.value = time;
    // Slow breathing, not a campfire flicker.
    light.intensity = light.userData.baseIntensity * (1 + 0.06 * Math.sin(time * 0.9) + 0.04 * Math.sin(time * 2.3 + 1.7));
  };
  group.userData.dispose = () => {
    geo.dispose();
    mat.dispose();
    noise.dispose();
    for (const d of embers.disposables) d.dispose();
    light.dispose();
    group.removeFromParent();
  };
  return group;
}
