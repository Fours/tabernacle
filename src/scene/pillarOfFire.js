import * as THREE from 'three';
import { PILLAR_OF_FIRE as P, m } from '../config/dimensions.js';
import { NOISE_GLSL, FOG_ADDITIVE_GLSL, FIRE_RAMP_GLSL, HASH_GLSL, fogUniforms, rng, randAttribute, createNoiseTexture } from './fireCommon.js';

// The pillar of fire over the tent by night (Num 9:15-16): a tall column of slowly churning fire
// standing in the sky above the Holy of Holies, and above it a long shaft of yellowish light
// fading up into the stars.
//
// Two draws:
// 1. The volume: a closed, flared cylinder (back faces only, so it still draws when the camera
//    is close) bounds the effect. For the fire column its fragment shader intersects the view
//    ray with an inner cylinder around the axis (rays that miss skip the march) and raymarches
//    that segment in 6-28 steps (~0.35 m apart, jittered per pixel with interleaved gradient
//    noise, which is stable over time so it never crawls). Each step samples a tiling 3D value
//    noise texture (64^3, `createNoiseTexture` in fireCommon.js). The column is one coherent
//    body: its radius follows the decided envelope (a soft point at the foot, then narrowing steadily to ~45% at the
//    top), and the noise only displaces its surface (slow billows rolling up it, upward-stretched
//    tongues at the rim) and modulates the brightness inside, so there are no holes. Temperature
//    is highest along the axis and drives the shared blackbody ramp (HDR core blooms). Mostly
//    emissive: absorption is weak (it only deepens the rim) and the volume dims the sky behind
//    it a little (premultiplied alpha). Over its upper 60% brightness and density fade, the
//    profile flattens so it keeps its width while fading, and the colour drifts to the shaft's
//    yellow, handing over to the shaft without a neck.
//    The shaft above stays analytic (closest approach of the ray to the axis, Gaussian across,
//    slow rippling streaks), below bloom's threshold.
// 2. Embers: a sparse swirl of large embers spiralling slowly up around the column (one
//    instanced draw, placed in the vertex shader from time).
//
// Fog: half the scene's fog, faded to black. Full fog would bury the shaft from the courtyard
// (60-80 m away, ~50% fog), none would make the column's foot look pasted on.

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
uniform sampler3D uNoise;
uniform vec3 uBase;          // world position of the column's foot (m)
uniform float uColH;         // column height (m)
uniform float uColR;         // column radius scale (m)
uniform float uMarchR;       // radius of the marched cylinder (m)
uniform float uShaftH;       // shaft height above the column (m)
uniform float uShaftR;       // shaft radius at its foot (m)
uniform float uShaftSpread;  // radius gained per meter
uniform vec2 uBound;         // bounding radius at the foot and at the top (m)
uniform float uColGain;
uniform float uEmission;     // per meter at full density
uniform float uExtinction;   // per meter at full density
uniform float uOcclusion;    // how much the column dims what's behind it
uniform float uShaftGain;
uniform float uFogMix;
varying vec3 vWorld;
${NOISE_GLSL}
${FOG_ADDITIVE_GLSL}
${FIRE_RAMP_GLSL}
float tn(vec3 p) { return texture(uNoise, p).r; }

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

// Density (0..1), temperature (0..1) and brightness (0..1, the long fade toward the shaft) at p
// (relative to the foot, m). The noise displaces the column's surface (billows rolling up it,
// upward-stretched tongues at its rim) instead of carving holes in it, so the body stays one
// coherent glowing mass with a hot core along the axis.
vec3 fireField(vec3 p, float T) {
  float y = p.y;
  p.xz -= axisSway(y, T);
  float R = envelope(y);
  float r = length(p.xz);
  if (r > R * 1.5 + 0.3) return vec3(0.0);
  // Slow twist with height and time: the billows roll gently around the axis as they rise.
  float ang = y * 0.05 + T * 0.06;
  float ca = cos(ang), sa = sin(ang);
  vec2 rxz = mat2(ca, sa, -sa, ca) * p.xz;
  vec3 q = vec3(rxz.x, y, rxz.y);
  // Gentle domain warp (large, slow eddies), only for the noise lookups.
  vec3 wq = q * vec3(0.05, 0.025, 0.05) - vec3(0.0, T * 0.012, 0.0);
  q += (vec3(tn(wq), tn(wq + vec3(0.37, 0.61, 0.73)), tn(wq + vec3(0.71, 0.17, 0.43))) - 0.5) * 2.4;
  // Billows rising (~1.2 and ~1.7 m/s) and upward-stretched tongues rising faster (~3 m/s).
  float nb = 0.6 * tn(q * vec3(0.06, 0.045, 0.06) - vec3(0.0, T * 0.055, 0.0))
           + 0.4 * tn(q * 0.13 + vec3(0.5, 0.3 - T * 0.22, 0.2));
  float nt = tn(q * vec3(0.22, 0.055, 0.22) + vec3(0.13, -T * 0.17, 0.71));
  float nf = tn(q * 0.32 + vec3(0.2, 0.4 - T * 0.45, 0.4));
  float rim = smoothstep(0.35, 1.0, r / R);
  // Surface displacement (fraction of the radius): billows everywhere, tongues near the rim.
  float disp = (nb - 0.5) * 0.55 + (nt - 0.5) * 0.5 * rim + (nf - 0.5) * 0.15;
  float e = clamp(1.0 - r / R + disp, 0.0, 1.0); // ~1 on the axis, 0 at the (rolling) surface
  // The foot narrows to a soft point.
  float foot = smoothstep(0.0, 4.5, y);
  float up = smoothstep(uColH * 0.4, uColH, y);
  float dens = smoothstep(0.0, 0.3, e) * (0.8 + 0.4 * (nb - 0.5)) * smoothstep(-0.3, 1.2, y)
    * mix(0.6, 1.0, foot) * (1.0 - smoothstep(uColH * 0.5, uColH * 1.02, y));
  // Hot continuous core, gently cooler billow seams, deeper orange-red only at the very rim.
  float temp = 0.22 + 0.7 * e + (nb - 0.5) * 0.9 + (nf - 0.5) * 0.25;
  // Higher up the profile flattens (the rim stays hot), so the column keeps its width as it fades.
  temp += up * 0.35 * (1.0 - e);
  temp = clamp(temp - (1.0 - smoothstep(0.0, 3.5, y)) * 0.2, 0.0, 1.0);
  // Brightness per meter grows as the column narrows (so it doesn't dim just by thinning) and
  // falls over the upper 60% toward the shaft's level.
  float narrow = narrowing(y);
  float bright = mix(1.0, 0.35, smoothstep(uColH * 0.4, uColH, y)) / narrow;
  // Rolling billows: brighter swelling cells and dimmer seams between them, inside the body.
  bright *= 0.45 + 1.1 * smoothstep(0.3, 0.7, nb);
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
      float len = t1 - t0;
      float n = clamp(ceil(len / 0.35), 6.0, 28.0);
      float dt = len / n;
      // Interleaved gradient noise: per-pixel jitter, stable over time.
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float t = t0 + dt * ign;
      for (int i = 0; i < 28; i++) {
        if (float(i) >= n || tr < 0.03) break;
        vec3 p = o + d * t;
        vec3 f = fireField(p, T);
        if (f.x > 0.002) {
          // Emission and absorption: the fire is mostly emissive, absorption only deepens the
          // rim a little, so the core shows through as one luminous body.
          float od = f.x * dt;
          float rise = smoothstep(uColH * 0.3, uColH, p.y);
          vec3 em = mix(fireRampCore(f.y, 1.0), vec3(1.3, 0.88, 0.31), 0.7 * rise) * f.z;
          col += tr * od * uEmission * em;
          tr *= exp(-od * uExtinction);
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
  float r = uColR * mix(1.3, 2.8, h2) * foot * (1.0 + 0.4 * age);
  float ang = (aRand.z + h) * 6.2831853 + uTime * mix(0.22, 0.45, aRand.w) + y * 0.08;
  vec3 c = vec3(cos(ang) * r, y, sin(ang) * r);
  c.y += 0.25 * sin(uTime * 1.3 + aRand.x * 20.0);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float size = mix(0.1, 0.24, aRand.x * aRand.x);
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
      uBrightness: { value: 2.2 },
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
  const marchR = 3.0 * P.columnRadius + 0.5; // envelope (1.9 colR) × 1.5 + 0.3, plus the axis sway
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
    uEmission: { value: 0.4 },
    uExtinction: { value: 0.35 },
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
  group.add(mesh);

  const embers = createEmbers(56, 71);
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
