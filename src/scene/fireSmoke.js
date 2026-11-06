import * as THREE from 'three';
import { NOISE_GLSL, BILLBOARD_GLSL, FOG_ADDITIVE_GLSL, HASH_GLSL, fogUniforms, rng, randAttribute, quadParticles } from './fireCommon.js';

// The fire's secondary effects: embers (sparks) and smoke puffs for createFire, and the incense
// altar's thin smoke thread (createIncenseSmoke).

const EMBER_VERT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uSize;
uniform float uViewportH;
uniform vec2 uWind;
attribute vec4 aRand;
varying float vAge;
varying float vTwinkle;
#include <fog_pars_vertex>
${HASH_GLSL}
void main() {
  float life = mix(1.4, 3.4, aRand.w);
  float t = uTime / life + aRand.z;
  float age = fract(t);
  float cyc = floor(t);
  float hc = h11(cyc + aRand.x * 31.0);
  float ang = (aRand.x + hc) * 6.2831853;
  float r = sqrt(fract(aRand.y + hc * 7.13)) * uRadius * 0.8;
  float speed = mix(0.55, 1.45, fract(aRand.w * 7.7 + hc));
  float rise = uHeight * 2.4 * speed * age * (1.0 - 0.3 * age);
  vec3 p = vec3(cos(ang) * r, uHeight * 0.12 + rise, sin(ang) * r);
  float s = aRand.x * 40.0;
  float turb = 0.35 * uRadius * age;
  p.x += turb * (sin(uTime * 1.7 + s) + 0.5 * sin(uTime * 4.1 + s * 1.3));
  p.z += turb * (cos(uTime * 1.3 + s * 0.7) + 0.5 * sin(uTime * 3.7 + s * 2.1));
  p.xz += uWind * rise;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  float size = uSize * mix(0.6, 1.4, aRand.y);
  gl_PointSize = clamp(size * projectionMatrix[1][1] * 0.5 * uViewportH / -mv.z, 1.5, 9.0);
  vAge = age;
  vTwinkle = 0.5 + 0.5 * sin(uTime * (7.0 + aRand.y * 11.0) + s);
}
`;

const EMBER_FRAG = /* glsl */ `
uniform float uBrightness;
varying float vAge;
varying float vTwinkle;
${FOG_ADDITIVE_GLSL}
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float fade = smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge));
  vec3 col = mix(vec3(1.0, 0.72, 0.3), vec3(0.85, 0.16, 0.02), smoothstep(0.0, 0.8, vAge));
  gl_FragColor = vec4(col * uBrightness * 1.6 * (1.0 - fogAmount()), (1.0 - d) * fade * (0.45 + 0.55 * vTwinkle));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SMOKE_VERT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uSmokeHeight;
uniform vec2 uWind;
attribute vec4 aRand;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
#include <fog_pars_vertex>
${HASH_GLSL}
${BILLBOARD_GLSL}
void main() {
  float life = mix(5.0, 8.0, aRand.w);
  float t = uTime / life + aRand.z;
  float age = fract(t);
  float cyc = floor(t);
  float hc = h11(cyc + aRand.x * 17.0);
  float ang = (aRand.x + hc) * 6.2831853;
  float r = sqrt(fract(aRand.y + hc * 3.7)) * uRadius * 0.5;
  float rise = uSmokeHeight * age * (1.0 - 0.25 * age);
  vec3 p = vec3(cos(ang) * r, uHeight * 0.55 + rise, sin(ang) * r);
  float s = aRand.x * 31.0;
  p.x += 0.3 * uRadius * age * sin(uTime * 0.4 + s);
  p.z += 0.3 * uRadius * age * cos(uTime * 0.33 + s * 1.7);
  p.xz += uWind * rise * 1.5;
  float size = uRadius * mix(0.8, 1.2, aRand.y) * (0.7 + 2.6 * age);
  vec4 mv = billboard(p, position.xy, size, 1.0);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  vUv = uv;
  vAge = age;
  vSeed = aRand.x;
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uBrightness;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float n = fFbm(vUv * 2.5 + vec2(vSeed * 11.0, vSeed * 5.0 - uTime * 0.15));
  float d = length(c) - (n - 0.5) * 0.9;
  float shape = 1.0 - smoothstep(0.2, 1.0, d);
  if (shape <= 0.0) discard;
  float fade = smoothstep(0.0, 0.15, vAge) * (1.0 - smoothstep(0.4, 1.0, vAge));
  // Lit warm by the fire just above the flames, cooling to a dark grey.
  vec3 col = mix(vec3(0.32, 0.12, 0.04) * uBrightness, vec3(0.035, 0.032, 0.03), smoothstep(0.0, 0.35, vAge));
  gl_FragColor = vec4(col, shape * fade * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Embers (one Points draw) sharing the fire's uniforms `u`. */
export function createEmbers(count, u, rnd, { radius, height, bounds }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(randAttribute(count, rnd), 4));
  const eb = bounds.clone();
  eb.center.y = height * 1.5;
  eb.radius = height * 2.5;
  geo.boundingSphere = eb;
  const mat = new THREE.ShaderMaterial({
    name: 'fire-embers',
    uniforms: { ...u, ...fogUniforms(), uSize: { value: Math.max(0.012, radius * 0.05) }, uViewportH: { value: 1000 } },
    fog: true,
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'fire-embers';
  pts.renderOrder = 3;
  const size = new THREE.Vector2();
  pts.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(size);
    mat.uniforms.uViewportH.value = size.y;
  };
  return { object: pts, disposables: [geo, mat] };
}

/** Smoke puffs (one instanced draw) sharing the fire's uniforms `u`. */
export function createSmokePuffs(count, u, rnd, { radius, height, smokeHeight, smokeOpacity, bounds }) {
  const sb = bounds.clone();
  sb.center.y = height * 0.55 + smokeHeight * 0.5;
  sb.radius = smokeHeight * 0.6 + radius * 3;
  const geo = quadParticles(count, rnd, sb);
  const mat = new THREE.ShaderMaterial({
    name: 'fire-smoke',
    uniforms: { ...u, ...fogUniforms(), uSmokeHeight: { value: smokeHeight }, uOpacity: { value: smokeOpacity } },
    fog: true,
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fire-smoke';
  mesh.renderOrder = 1;
  return { object: mesh, disposables: [geo, mat] };
}

// ---- Incense smoke --------------------------------------------------------------------
// A thin thread of incense smoke rising from the coals: one draw of several long ribbons built
// from many segments. The ribbons share one laminar thread near the source; with height the
// thread starts to sway (a wave travelling upward with the flow, not a rigid wobble), each
// ribbon peels away along its own slowly turning, noise-advected path, twists (narrowing where
// seen edge-on, so folds read as brighter lines) and widens, and the wisps fade into a faint
// haze. Streaky density noise scrolls up each ribbon so the smoke visibly flows. Every vertex
// is placed in the vertex shader from a time uniform. Alpha-blended; no light.

const WISP_VERT = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform float uWidth;
uniform float uSpread;
uniform float uLaminar;
attribute vec3 aRibbon; // x: 0..1 along the ribbon, y: -1/1 side, z: ribbon seed 0..1
varying float vS;
varying float vSide;
varying float vSeed;
varying float vDensity;
#include <fog_pars_vertex>
${NOISE_GLSL}
// Centreline of a ribbon at height fraction s (model space, origin at the source).
vec3 centre(float s, float seed) {
  float y = s * uHeight;
  float t = uTime;
  // Laminar for the first few cm, then the thread starts to sway; the sway grows with height.
  float turb = smoothstep(uLaminar, uLaminar + 0.35, y);
  float amp = turb * (0.012 + 0.05 * s);
  // Waves travel upward with the flow (phase in y - v t), so the sway climbs the thread.
  float ph = y * 7.5 - t * 1.6;
  vec2 d = amp * vec2(sin(ph + 1.2 * sin(y * 2.7 - t * 0.37)), cos(ph * 0.83 + 0.7 + 0.9 * sin(y * 1.9 - t * 0.29)));
  // Irregular eddies, also advected upward.
  vec2 q = vec2(y * 4.2 - t * 0.55, 0.0);
  d += turb * (0.02 + 0.06 * s) * (vec2(fNoise(q + vec2(0.0, 1.3)), fNoise(q + vec2(0.0, 7.9))) - 0.5) * 2.0;
  // Slow drift of the upper column (air currents in the room).
  d += s * s * uHeight * vec2(0.06 * sin(t * 0.071) + 0.03 * sin(t * 0.023 + 2.0), 0.05 * sin(t * 0.053 + 1.0));
  // Splitting: each ribbon peels off in its own slowly turning direction, more with height.
  float split = smoothstep(uLaminar + 0.1, uHeight * 0.85, y);
  float a = seed * 6.2832 + 2.2 * (fNoise(vec2(y * 2.3 - t * 0.3, seed * 17.0)) - 0.5) + 0.25 * sin(t * 0.11 + seed * 9.0);
  float r = uSpread * split * mix(0.35, 1.0, fract(seed * 7.31));
  d += r * vec2(cos(a), sin(a));
  // A curl around the split direction gives each wisp its own rolling motion.
  float c = y * 11.0 - t * 2.1 + seed * 13.0;
  d += split * 0.03 * vec2(cos(c), sin(c));
  return vec3(d.x, y, d.y);
}
void main() {
  float s = aRibbon.x;
  float seed = aRibbon.z;
  vec3 p = centre(s, seed);
  vec3 p2 = centre(min(s + 0.01, 1.0), seed);
  vec3 p1 = centre(max(s - 0.01, 0.0), seed);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 tv = (modelViewMatrix * vec4(p2 - p1, 0.0)).xyz;
  vec3 side = cross(tv, mv.xyz);
  float ls = length(side);
  side = ls > 1e-8 ? side / ls : vec3(1.0, 0.0, 0.0);
  // Twist: the ribbon turns about its centreline, narrowing where seen edge-on.
  float y = s * uHeight;
  float tw = abs(cos(y * 5.0 - uTime * 0.9 + seed * 11.0 + 1.5 * sin(y * 2.0 + seed * 5.0)));
  float twist = mix(1.0, mix(0.18, 1.0, tw), smoothstep(uLaminar, uLaminar + 0.4, y));
  float grow = 1.0 + 9.0 * s * s + 4.0 * s;
  float w = uWidth * grow * twist * mix(0.7, 1.2, fract(seed * 3.77));
  mv.xyz += side * aRibbon.y * w;
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  vS = s;
  vSide = aRibbon.y;
  vSeed = seed;
  // Same smoke spread over a wider ribbon is thinner; edge-on folds are denser.
  vDensity = clamp(1.5 / pow(max(grow * twist, 0.01), 0.35), 0.3, 2.5);
}
`;

const WISP_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform float uOpacity;
uniform float uLaminar;
uniform vec3 uColor;
uniform vec3 uGlow;
varying float vS;
varying float vSide;
varying float vSeed;
varying float vDensity;
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  float y = vS * uHeight;
  // Soft edges across the ribbon (no hard sprite or strip edges).
  float e = clamp(1.0 - vSide * vSide, 0.0, 1.0);
  float profile = e * e;
  // Streaky density scrolling upward with the flow; a smooth thread near the source.
  float n = fFbm(vec2(vSide * 0.9 + vSeed * 31.0, y * 5.0 - uTime * 0.45));
  float streak = mix(1.0, smoothstep(0.25, 0.7, n), smoothstep(uLaminar * 0.5, uLaminar + 0.4, y));
  // Larger breaks so the upper wisps come apart into a faint haze.
  float n2 = fNoise(vec2(vSeed * 13.0, y * 1.6 - uTime * 0.16));
  float breakup = mix(1.0, smoothstep(0.15, 0.55, n2), smoothstep(0.35, 0.85, vS));
  float fade = smoothstep(0.0, 0.02, vS) * (1.0 - smoothstep(0.55, 1.0, vS));
  float a = profile * streak * breakup * fade * vDensity * uOpacity;
  if (a < 0.002) discard;
  // Warmed by the coals at its root, then cool grey-blue.
  vec3 col = mix(uGlow, uColor, smoothstep(0.0, 0.18, y));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/**
 * Incense smoke, one draw of `ribbons` noise-advected strips. The mesh's origin is the source.
 * @param {{ ribbons?: number, segments?: number, height?: number, width?: number,
 *   spread?: number, laminar?: number, opacity?: number, color?: number, glow?: number,
 *   seed?: number }} o
 *   height: column height (m); width: half-width of each ribbon at the source (m); spread: how
 *   far the wisps peel away from the thread by the top (m); laminar: height of the straight
 *   thread before it starts to sway (m); opacity: per-ribbon alpha.
 * @returns {{ mesh: THREE.Mesh, update(time:number):void, dispose():void }}
 */
export function createIncenseSmoke({ ribbons = 8, segments = 110, height = 1.3, width = 0.0045, spread = 0.2, laminar = 0.2, opacity = 0.2, color = 0x9aa2b0, glow = 0xd08a50, seed = 5 } = {}) {
  const rnd = rng(seed * 7919 + 29);
  const verts = ribbons * (segments + 1) * 2;
  const pos = new Float32Array(verts * 3); // unused by the shader except for bounds
  const rib = new Float32Array(verts * 3);
  const index = [];
  let v = 0;
  for (let r = 0; r < ribbons; r++) {
    const sd = (r + rnd() * 0.8) / ribbons;
    for (let i = 0; i <= segments; i++) {
      const s = i / segments;
      for (const side of [-1, 1]) {
        rib[v * 3] = s;
        rib[v * 3 + 1] = side;
        rib[v * 3 + 2] = sd;
        pos[v * 3 + 1] = s * height;
        v++;
      }
      if (i < segments) {
        const a = v - 2, b = v - 1, c = v, d = v + 1;
        index.push(a, c, b, b, c, d);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRibbon', new THREE.BufferAttribute(rib, 3));
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height * 0.5, 0), height * 0.75 + spread);
  const mat = new THREE.ShaderMaterial({
    name: 'incense-smoke',
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: height },
      uWidth: { value: width },
      uSpread: { value: spread },
      uLaminar: { value: laminar },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
      uGlow: { value: new THREE.Color(glow) },
      ...fogUniforms(),
    },
    fog: true,
    vertexShader: WISP_VERT,
    fragmentShader: WISP_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'incense-smoke';
  mesh.renderOrder = 1;
  const tOffset = rnd() * 100;
  return {
    mesh,
    update(time) {
      mat.uniforms.uTime.value = (time + tOffset) % 3600;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
