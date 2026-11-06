import * as THREE from 'three';
import { FOG_ADDITIVE_GLSL, rng } from './fireCommon.js';
import { ATMO, ATMO_GLOWS } from '../render/atmosphere.js';
import { TABERNACLE as T, m } from '../config/dimensions.js';

const f = (v) => v.toFixed(4);

// Dust drifting in the firelight around the altar, the torches and the menorah: one instanced
// draw of tiny additive quads. Each mote wanders slowly about its home point (layered sines in the vertex
// shader, no per-frame JS), is lit by the glow sources of render/atmosphere.js (I / d², the same
// positions and flicker as the haze glows), glints now and then as it tumbles, and fades out
// close to the camera and beyond ~15 m. Inside the tent's interior box only the menorah lights
// them (render/atmosphere.js's interior source, east of the veil); outside only the fires. Motes too dim to see collapse in the vertex shader.

const VERT = /* glsl */ `
#define GLOWS ${ATMO_GLOWS}
uniform float uTime;
uniform float uViewportH;
uniform float uSize;
uniform float uGain;
uniform float uFar;
uniform vec4 uAtmoGlowPos[GLOWS];
uniform vec4 uAtmoGlowCol[GLOWS];
uniform vec4 uAtmoInGlowPos;
uniform vec4 uAtmoInGlowCol;
uniform float uInGain;
attribute vec3 aHome;
attribute vec4 aRand;
varying vec2 vUv;
varying vec3 vCol;
#include <fog_pars_vertex>
void main() {
  float t = uTime;
  vec3 ph = aRand.xyz * 6.2831853;
  float amp = mix(0.2, 0.55, aRand.w);
  vec3 p = aHome + amp * vec3(
    sin(t * 0.13 * (0.6 + aRand.x) + ph.x) + 0.4 * sin(t * 0.41 + ph.y),
    0.6 * sin(t * 0.11 * (0.6 + aRand.y) + ph.z) + 0.2 * sin(t * 0.37 + ph.x),
    cos(t * 0.12 * (0.6 + aRand.z) + ph.y) + 0.4 * sin(t * 0.33 + ph.z));
  // Light from the fires (inverse square, softened inside each source's core).
  vec3 L = vec3(0.0);
  for (int i = 0; i < GLOWS; i++) {
    vec3 dv = uAtmoGlowPos[i].xyz - p;
    float r = uAtmoGlowPos[i].w + 0.4;
    L += uAtmoGlowCol[i].rgb / (dot(dv, dv) + r * r);
  }
  float inBox = step(${f(m(T.interiorMinX))}, p.x) * step(p.x, ${f(m(T.interiorMaxX))})
    * step(abs(p.z), ${f(m(T.interiorWidth / 2))}) * step(p.y, ${f(m(T.interiorHeight))});
  vec3 dm = uAtmoInGlowPos.xyz - p;
  float rm = uAtmoInGlowPos.w + 0.2;
  L = L * (1.0 - inBox) + inBox * step(${f(m(T.veil.x))}, p.x) * uInGain * uAtmoInGlowCol.rgb / (dot(dm, dm) + rm * rm);
  // Flat flakes catch the light as they tumble.
  float glint = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(t * (0.6 + 1.8 * aRand.y) + aRand.x * 40.0), 6.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float z = -mv.z;
  // At least ~1.3 px wide, with the brightness scaled to keep the energy.
  float pix = 2.0 * max(z, 0.05) / (projectionMatrix[1][1] * uViewportH);
  float w = max(uSize, 1.3 * pix);
  float energy = (uSize / w) * (uSize / w);
  float fade = smoothstep(0.4, 1.2, z) * (1.0 - smoothstep(uFar * 0.5, uFar, z));
  vCol = L * (uGain * glint * fade * energy);
  if (z < 0.1 || max(vCol.r, max(vCol.g, vCol.b)) < 2e-4) mv = vec4(0.0, 0.0, 1.0, 1.0); // collapse
  mv.xy += position.xy * 2.0 * w;
  vUv = position.xy * 2.0;
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
${FOG_ADDITIVE_GLSL}
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 >= 1.0) discard;
  float a = (1.0 - r2) * (1.0 - r2);
  gl_FragColor = vec4(vCol * a * (1.0 - fogAmount()), 1.0);
}
`;

/**
 * @param {{x:number, y0:number, y1:number, z:number, r:number, count:number}[]} clouds
 *   Cylinders (world metres) the motes' home points fill.
 * @returns {THREE.Mesh} with userData.update(dt, time) and userData.uniforms.
 */
export function createDustMotes(clouds, { size = 0.008, gain = 0.1, inGain = 1, far = 16, seed = 11 } = {}) {
  const rnd = rng(seed);
  const n = clouds.reduce((s, c) => s + c.count, 0);
  const home = new Float32Array(n * 3);
  const rand = new Float32Array(n * 4);
  let i = 0;
  for (const c of clouds) {
    for (let k = 0; k < c.count; k++, i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * c.r;
      home[i * 3] = c.x + Math.cos(a) * r;
      home[i * 3 + 1] = c.y0 + (c.y1 - c.y0) * rnd();
      home[i * 3 + 2] = c.z + Math.sin(a) * r;
      for (let j = 0; j < 4; j++) rand[i * 4 + j] = rnd();
    }
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 3));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 4));
  geo.instanceCount = n;

  const uniforms = {
    uTime: { value: 0 },
    uViewportH: { value: 1000 },
    uSize: { value: size },
    uGain: { value: gain },
    uFar: { value: far },
    uAtmoGlowPos: ATMO.uAtmoGlowPos,
    uAtmoGlowCol: ATMO.uAtmoGlowCol,
    uAtmoInGlowPos: ATMO.uAtmoInGlowPos,
    uAtmoInGlowCol: ATMO.uAtmoInGlowCol,
    uInGain: { value: inGain },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };
  const mat = new THREE.ShaderMaterial({
    name: 'dust-motes',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'dust-motes';
  mesh.frustumCulled = false; // placed in the vertex shader
  mesh.renderOrder = 5;
  const size2 = new THREE.Vector2();
  mesh.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(size2);
    uniforms.uViewportH.value = size2.y;
  };
  mesh.userData.uniforms = uniforms;
  mesh.userData.update = (dt, time) => {
    uniforms.uTime.value = time % 3600;
  };
  mesh.userData.dispose = () => {
    geo.dispose();
    mat.dispose();
  };
  return mesh;
}
