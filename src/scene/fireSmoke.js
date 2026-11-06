import * as THREE from 'three';
import { NOISE_GLSL, fogUniforms, rng } from './fireCommon.js';

// The incense altar's thin smoke thread (createIncenseSmoke). The fires' sparks and smoke are in
// fireParticles.js.

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
