import * as THREE from 'three';
import { NOISE_GLSL, BILLBOARD_GLSL, FOG_ADDITIVE_GLSL, HASH_GLSL, fogUniforms, randAttribute } from './fireCommon.js';

// A fire's secondary effects in ONE instanced draw: smoke puffs, fast sparks, slow drifting
// embers and falling ash. Every instance is a quad placed in the vertex shader from the time
// uniform, so the per-frame JS cost is the fire's uniform writes.
//
// One premultiplied-alpha blend serves all kinds: sparks and embers write alpha 0 (purely
// additive, order-free), smoke and ash write (colour × a, a). Instances draw in index order:
// smoke first, then ash, embers and sparks, so sparks always add on top of the smoke. The puffs
// are many and individually thin and their colour changes smoothly with height, so their
// fixed (unsorted) order doesn't show from any side, and a fixed order never pops.
//
// Sparks are velocity-aligned capsules: the vertex shader evaluates each spark's analytic path
// now and a short shutter time earlier and stretches the quad between the two (motion blur).
// Their widths are clamped to ~1 px with the brightness scaled down to match, so distant sparks
// don't shimmer.

const KIND_SMOKE = 0, KIND_ASH = 1, KIND_EMBER = 2, KIND_SPARK = 3;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uBrightness;
uniform vec2 uWind;
uniform float uViewportH;
uniform float uSparkSize;
uniform float uSmokeHeight;
uniform float uSmokeSize;
uniform float uSmokeBase;
uniform float uSmokeGlow;
uniform float uLightY;
attribute vec4 aRand;
attribute vec4 aInfo; // x: kind, y: burst group seed, z: 1 = burst member
varying vec2 vUv;
varying vec4 vA;      // smoke: (kind, age, warm, seed)  streaks: (kind, half-length/width, temp, intensity)
varying vec3 vL;      // smoke: view-space direction to the fire
#include <fog_pars_vertex>
${HASH_GLSL}
${BILLBOARD_GLSL}

// Spark/ember path at time tau after birth (absolute time tAbs), model space.
vec3 sparkPath(float tau, float tAbs, vec3 o, vec3 v0, float k, float b, float sw, float s) {
  float e = (1.0 - exp(-k * tau)) / k;
  vec3 p = o + v0 * e;
  p.y += b * tau;
  float rise = max(p.y - o.y, 0.0);
  // Own jitter (grows as the spark leaves the flame) plus a shared eddy field, so neighbours
  // swirl together.
  float a = sw * (1.0 - exp(-2.0 * tau));
  p.x += a * (sin(tau * 3.1 + s) + 0.5 * sin(tau * 7.3 + s * 1.7));
  p.z += a * (cos(tau * 2.7 + s * 0.6) + 0.5 * sin(tau * 6.1 + s * 2.3));
  float f = uHeight * 0.18 * smoothstep(0.0, uHeight, rise);
  p.x += f * sin(p.y * 1.7 / uHeight * 1.8 - tAbs * 1.3 + 0.7);
  p.z += f * cos(p.y * 1.3 / uHeight * 1.8 - tAbs * 1.1 + 2.0);
  p.xz += uWind * rise;
  return p;
}

void main() {
  float kind = aInfo.x;
  vec4 mv;
  if (kind < 0.5) {
    // ---- Smoke puff -----------------------------------------------------------------
    // Lifetime scales with the column's height (a torch's short wisp turns over faster).
    float life = mix(6.0, 9.0, aRand.w) * clamp(uSmokeHeight / 6.0, 0.35, 1.0);
    float t = uTime / life + aRand.z;
    float age = fract(t);
    float hc = h11(floor(t) + aRand.x * 17.0);
    float ang = (aRand.x + hc) * 6.2831853;
    float r = sqrt(fract(aRand.y + hc * 3.7)) * uRadius * 0.45;
    // Fast off the fire, slowing as it cools and spreads.
    float rise = uSmokeHeight * (1.0 - pow(1.0 - age, 1.6));
    vec3 p = vec3(cos(ang), 0.0, sin(ang)) * r * (1.0 + 2.0 * age);
    p.y = uHeight * uSmokeBase + rise;
    float s = aRand.x * 31.0;
    // The whole column snakes slowly (a field in height and time), each puff wobbles a little.
    float hn = rise / uSmokeHeight;
    p.x += uRadius * 0.8 * hn * sin(rise * 0.7 - uTime * 0.31) + 0.25 * uRadius * age * sin(uTime * 0.4 + s);
    p.z += uRadius * 0.8 * hn * cos(rise * 0.55 - uTime * 0.26 + 1.0) + 0.25 * uRadius * age * cos(uTime * 0.33 + s * 1.7);
    p.xz += uWind * rise * (1.5 + 1.5 * hn);
    float size = uRadius * uSmokeSize * mix(0.8, 1.2, aRand.y) * (1.0 + 3.0 * age);
    mv = billboard(p, position.xy, size, 1.0);
    vec3 toL = vec3(0.0, uLightY, 0.0) - p;
    vL = normalize((modelViewMatrix * vec4(toL, 0.0)).xyz);
    float dl = length(toL) / (uHeight * 0.55);
    vA = vec4(kind, age, uSmokeGlow * uBrightness / (1.0 + dl * dl), aRand.x);
    vUv = uv;
  } else {
    // ---- Streaks: ash, embers, sparks ------------------------------------------------
    float H = uHeight;
    float life, k, b, sw, size, shutter;
    vec3 o, v0;
    float seed = aRand.x;
    float t, age, cyc, vis = 1.0;
    if (kind < 1.5) {
      // Ash: pale flecks drifting slowly down around the altar.
      life = mix(7.0, 11.0, aRand.w);
      t = uTime / life + aRand.z;
      age = fract(t); cyc = floor(t);
      float hc = h11(cyc + seed * 23.0);
      float ang = (seed + hc) * 6.2831853;
      float rr = uRadius * mix(0.8, 4.5, sqrt(fract(aRand.y + hc * 5.3)));
      o = vec3(cos(ang) * rr, H * mix(1.0, 3.0, fract(hc * 7.7 + aRand.y)), sin(ang) * rr);
      v0 = vec3(0.0);
      k = 1.0; b = -H * mix(0.06, 0.12, aRand.y); sw = H * 0.03;
      size = uSparkSize * 0.6; shutter = 0.08;
    } else if (kind < 2.5) {
      // Embers: few, slow, long-lived, drifting high on the updraft.
      life = mix(2.6, 4.6, aRand.w);
      t = uTime / life + aRand.z;
      age = fract(t); cyc = floor(t);
      float hc = h11(cyc + seed * 31.0);
      float ang = (seed + hc) * 6.2831853;
      float rr = sqrt(fract(aRand.y + hc * 7.13)) * uRadius * 0.7;
      o = vec3(cos(ang) * rr, H * mix(0.2, 0.5, hc), sin(ang) * rr);
      float ha = fract(hc * 13.7) * 6.2831853;
      v0 = vec3(cos(ha), 0.0, sin(ha)) * H * 0.3 * fract(hc * 3.1) + vec3(0.0, H * mix(0.8, 1.4, fract(hc * 5.9)), 0.0);
      k = 1.4; b = H * mix(0.35, 0.6, aRand.y); sw = H * 0.22;
      size = uSparkSize * 1.6; shutter = 0.06;
    } else {
      // Sparks: many, fast, short-lived; burst members share a birth time and a spot.
      float gs = aInfo.y;
      float burst = aInfo.z;
      life = mix(0.6, 1.4, burst > 0.5 ? h11(gs * 7.0) : aRand.w);
      float phase = burst > 0.5 ? gs : aRand.z;
      float period = burst > 0.5 ? 3.0 : 1.0; // bursts are occasional
      t = uTime / (life * period) + phase;
      cyc = floor(t);
      age = fract(t) * period;
      vis = step(age, 1.0);
      if (burst > 0.5) vis *= step(h11(cyc * 1.37 + gs * 91.0), 0.55);
      age = min(age, 1.0);
      float hc = h11(cyc + (burst > 0.5 ? gs * 53.0 : seed * 41.0));
      float ang = fract(hc * 3.3 + (burst > 0.5 ? 0.0 : seed)) * 6.2831853;
      float rr = sqrt(fract(hc * 9.1 + (burst > 0.5 ? 0.0 : aRand.y))) * uRadius * 0.75;
      o = vec3(cos(ang) * rr, H * mix(0.1, 0.45, fract(hc * 4.7)), sin(ang) * rr);
      // Bursts fan out; lone sparks shoot mostly up.
      float ha = (seed + hc) * 6.2831853;
      float spread = burst > 0.5 ? mix(0.6, 1.5, aRand.y) : mix(0.0, 0.9, aRand.y);
      v0 = vec3(cos(ha), 0.0, sin(ha)) * H * spread + vec3(0.0, H * mix(1.2, 3.4, fract(aRand.w * 7.3 + hc)), 0.0);
      k = 2.2; b = H * 0.5; sw = H * 0.14;
      size = uSparkSize * mix(0.7, 1.2, aRand.y); shutter = 0.028;
    }
    float tau = age * life;
    float tauP = max(tau - shutter, 0.0);
    float s = seed * 40.0;
    vec3 pN = sparkPath(tau, uTime, o, v0, k, b, sw, s);
    vec3 pP = sparkPath(tauP, uTime - (tau - tauP), o, v0, k, b, sw, s);
    if (kind < 1.5) {
      // Ash flutters as it falls; drifts downwind.
      float fl = H * 0.05;
      pN.x += fl * sin(tau * 1.9 + s); pN.z += fl * cos(tau * 1.6 + s * 0.7);
      pP.x += fl * sin(tauP * 1.9 + s); pP.z += fl * cos(tauP * 1.6 + s * 0.7);
      pN.xz += uWind * tau * 2.0; pP.xz += uWind * tauP * 2.0;
    }
    vec4 a = modelViewMatrix * vec4(pP, 1.0);
    vec4 bb = modelViewMatrix * vec4(pN, 1.0);
    // Width: physical size, but at least ~1.2 px (brightness scaled to keep the energy).
    float zc = max(-0.5 * (a.z + bb.z), 0.05);
    float pix = 2.0 * zc / (projectionMatrix[1][1] * uViewportH);
    float w = max(size, 1.2 * pix);
    float energy = size / w;
    vec2 d = bb.xy - a.xy;
    float len = length(d);
    vec2 dir = len > 1e-5 ? d / len : vec2(0.0, 1.0);
    vec2 side = vec2(dir.y, -dir.x); // (side, dir) keeps the quad front-facing
    float halfLen = 0.5 * len;
    vec2 corner = position.xy * 2.0; // -1..1
    vec4 c = 0.5 * (a + bb);
    mv = c;
    mv.xy += dir * corner.y * (halfLen + w) + side * corner.x * w;
    if (a.z > -0.05 || bb.z > -0.05) vis = 0.0;
    // Temperature and fade.
    float temp, inten;
    if (kind < 1.5) {
      temp = 0.0;
      inten = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.7, 1.0, age));
    } else if (kind < 2.5) {
      temp = 0.8 - 0.7 * age;
      float tw = 0.6 + 0.4 * sin(uTime * (9.0 + aRand.y * 9.0) + s);
      inten = smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.6, 1.0, age)) * tw;
    } else {
      // Each spark winks out at its own age; the hottest burn white-yellow early on.
      float death = mix(0.55, 1.0, fract(aRand.w * 11.3 + seed));
      float ga = age / death;
      temp = clamp(1.0 - pow(ga, 0.5) * mix(0.9, 1.1, aRand.y), 0.0, 1.0);
      inten = smoothstep(0.0, 0.03, ga) * (1.0 - smoothstep(0.75, 1.0, ga)) * step(ga, 1.0);
    }
    // Motion blur spreads the same light over the streak.
    float hw = halfLen / w;
    inten *= energy * vis / (1.0 + 0.15 * hw);
    if (vis < 0.5) mv = vec4(0.0, 0.0, 1.0, 1.0); // behind the camera: collapse
    vA = vec4(kind, hw, temp, inten);
    vUv = corner;
    vL = vec3(0.0);
  }
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uBrightness;
uniform float uSmokeOpacity;
uniform vec3 uSmokeAmbient;
uniform vec3 uAshColor;
varying vec2 vUv;
varying vec4 vA;
varying vec3 vL;
${NOISE_GLSL}
${FOG_ADDITIVE_GLSL}
// Cooling ramp for sparks (linear HDR, finite, positive): red → orange → yellow → pale yellow.
vec3 sparkRamp(float t) {
  vec3 c = mix(vec3(0.35, 0.025, 0.0), vec3(1.6, 0.36, 0.03), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(2.6, 1.15, 0.2), smoothstep(0.3, 0.7, t));
  return mix(c, vec3(3.4, 2.3, 0.9), smoothstep(0.7, 1.0, t));
}
void main() {
  float kind = vA.x;
  float fog = fogAmount();
  if (kind < 0.5) {
    // ---- Smoke: soft circular falloff × drifting noise, lit warm from the fire below ----
    vec2 c = vUv * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 >= 1.0) discard;
    float age = vA.y;
    float seed = vA.w;
    float ang = seed * 6.2831853 + age * mix(-1.2, 1.2, fract(seed * 7.7));
    vec2 rc = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * c;
    float n = fFbm(rc * 1.7 + vec2(seed * 11.0, seed * 5.0 - uTime * 0.12));
    float n2 = fNoise(rc * 4.3 + vec2(seed * 3.0 + uTime * 0.05, seed * 9.0));
    float radial = (1.0 - r2) * (1.0 - r2);
    float dens = radial * clamp((n - 0.3) * 2.0 + (n2 - 0.5) * 0.4 + radial * 0.5, 0.0, 1.2);
    // Thinner as it spreads; appears softly over the flames, dissolves into the haze.
    float fade = smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.35, 1.0, age)) / (1.0 + 1.5 * age);
    float a = 1.0 - exp(-dens * uSmokeOpacity * fade * 3.0);
    if (a < 0.002) discard;
    // Fake volume: a sphere normal; light wraps round from the fire side, dense cores are
    // self-shadowed (darker), thin rims toward the fire glow.
    vec3 nrm = normalize(vec3(c * 0.9, sqrt(1.0 - r2) + 0.25));
    float lit = clamp(dot(nrm, vL) * 0.45 + 0.55, 0.0, 1.0);
    float shadow = mix(1.0, 0.3, smoothstep(0.2, 1.1, dens));
    vec3 warm = vec3(1.0, 0.42, 0.14) * vA.z * lit * shadow;
    vec3 amb = uSmokeAmbient * mix(1.0, 0.65, smoothstep(0.3, 1.2, dens));
    vec3 col = mix(amb + warm, fogColor, fog);
    gl_FragColor = vec4(col * a, a);
  } else {
    // ---- Streaks: capsule of half-length vA.y (in widths) ----
    float h = vA.y;
    float q = vUv.y * (h + 1.0);
    float d2 = vUv.x * vUv.x + pow(max(abs(q) - h, 0.0), 2.0);
    if (d2 >= 1.0) discard;
    float prof = (1.0 - d2) * (1.0 - d2);
    // Brighter head, fading tail (the motion-blur trail).
    float head = mix(0.35, 1.0, clamp((q + h) / (2.0 * h + 1.0), 0.0, 1.0));
    if (kind < 1.5) {
      float a = prof * vA.w * 0.9 * (1.0 - fog);
      gl_FragColor = vec4(uAshColor * a, a);
    } else {
      vec3 col = sparkRamp(vA.z) * uBrightness * vA.w * prof * head;
      gl_FragColor = vec4(col * (1.0 - fog), 0.0);
    }
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Sparks, embers, ash and smoke for one fire (one instanced draw) sharing the fire's uniforms.
 * @param {object} u  The fire's shared uniforms (uTime, uRadius, uHeight, uWind, uBrightness).
 * @param {() => number} rnd
 * @param {object} o
 *   sparks/embers/ash/smoke: counts; bursts: how many burst groups the sparks are split into
 *   (about a third of them burst); sparkSize: streak width (m); smokeHeight: rise (m);
 *   smokeSize: puff size relative to the bed radius; smokeBase: where puffs start (× height);
 *   smokeOpacity; smokeGlow: how strongly the fire lights the smoke; smokeAmbient: unlit smoke
 *   colour (linear); ashColor (linear); lightY: the fire's light height above the base (m).
 */
export function createFireParticles(u, rnd, o) {
  const {
    radius, height, sparks = 0, embers = 0, ash = 0, smoke = 0, bursts = 0,
    sparkSize = Math.max(0.006, radius * 0.02), smokeHeight = height * 3.5, smokeSize = 1.2,
    smokeBase = 0.8, smokeOpacity = 0.3, smokeGlow = 1.2, smokeAmbient = [0.04, 0.05, 0.07],
    ashColor = [0.5, 0.42, 0.36], lightY = height * 0.75,
  } = o;
  const count = smoke + ash + embers + sparks;
  const info = new Float32Array(count * 4);
  let i = 0;
  const push = (kind, n) => {
    for (let j = 0; j < n; j++, i++) info[i * 4] = kind;
  };
  push(KIND_SMOKE, smoke);
  push(KIND_ASH, ash);
  push(KIND_EMBER, embers);
  const sparkStart = i;
  push(KIND_SPARK, sparks);
  // About a third of the sparks fly in bursts of a few, the rest one by one.
  if (bursts > 0) {
    const members = Math.min(sparks, Math.round(sparks / 3));
    for (let j = 0; j < members; j++) {
      const k = sparkStart + j;
      const g = j % bursts;
      info[k * 4 + 1] = (g + 0.37) / bursts * 0.999 + 0.0005;
      info[k * 4 + 2] = 1;
    }
  }

  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(randAttribute(count, rnd), 4));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  geo.instanceCount = count;
  const top = Math.max(smoke > 0 ? height * smokeBase + smokeHeight : 0, height * 4);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, top * 0.5, 0), top * 0.6 + radius * 5);
  geo.boundingBox = null;

  const mat = new THREE.ShaderMaterial({
    name: 'fire-particles',
    uniforms: {
      ...u,
      ...fogUniforms(),
      uViewportH: { value: 1000 },
      uSparkSize: { value: sparkSize },
      uSmokeHeight: { value: smokeHeight },
      uSmokeSize: { value: smokeSize },
      uSmokeBase: { value: smokeBase },
      uSmokeOpacity: { value: smokeOpacity },
      uSmokeGlow: { value: smokeGlow },
      uSmokeAmbient: { value: new THREE.Vector3(...smokeAmbient) },
      uAshColor: { value: new THREE.Vector3(...ashColor) },
      uLightY: { value: lightY },
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
  mesh.name = 'fire-particles';
  mesh.frustumCulled = true;
  // Before the flame sheets (2): sparks behind the fire stay additive, the flames draw over
  // the low smoke.
  mesh.renderOrder = 1;
  const size = new THREE.Vector2();
  mesh.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(size);
    mat.uniforms.uViewportH.value = size.y;
  };
  return { object: mesh, disposables: [base, geo, mat] };
}
