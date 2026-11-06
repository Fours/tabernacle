import * as THREE from 'three';
import { BILLBOARD_GLSL, FOG_ADDITIVE_GLSL, fogUniforms, rng } from './fireCommon.js';

// Small oil-lamp flames (createLampFlames, the menorah). The body of a large fire is in
// fireVolume.js.

// ---- Lamp flames ----------------------------------------------------------------------
// Small, steady oil-lamp flames (menorah): one instanced camera-facing quad per wick with a
// teardrop shape that flickers and sways in the shader, inside a larger quad that also carries a
// soft warm halo (the glow round a small flame, which bloom alone shows only as a point at a
// distance). One draw call for all of them.
const LAMP_HALO = [7.0, 3.5]; // quad size relative to the flame (width, height)

const LAMP_VERT = /* glsl */ `
uniform float uTime;
uniform float uWidth;
uniform float uHeight;
attribute vec4 aWick; // xyz: wick position (local), w: seed
varying vec2 vUv;
varying float vSway;
varying float vHeat;
#include <fog_pars_vertex>
${BILLBOARD_GLSL}
void main() {
  float s = aWick.w * 17.0;
  float t = uTime;
  // Gusts are rare and soft; most of the time the flame just breathes.
  float flick = 0.08 * sin(t * 11.0 + s) + 0.05 * sin(t * 23.7 + s * 2.3) + 0.04 * sin(t * 3.1 + s * 0.7);
  float h = uHeight * (1.0 + flick);
  vec3 c = aWick.xyz + vec3(0.0, h * 0.5 - uHeight * 0.08, 0.0);
  vec4 mv = billboard(c, position.xy * vec2(${LAMP_HALO[0].toFixed(2)}, ${LAMP_HALO[1].toFixed(2)}), uWidth, h / uWidth);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  vUv = uv;
  vSway = 0.12 * sin(t * 2.3 + s) + 0.06 * sin(t * 7.9 + s * 1.7);
  vHeat = 1.0 + 1.5 * flick;
}
`;

const LAMP_FRAG = /* glsl */ `
uniform float uBrightness;
uniform float uHalo;
varying vec2 vUv;
varying float vSway;
varying float vHeat;
${FOG_ADDITIVE_GLSL}
void main() {
  vec2 c = (vUv * 2.0 - 1.0) * vec2(${LAMP_HALO[0].toFixed(2)}, ${LAMP_HALO[1].toFixed(2)});
  // Halo: a soft warm glow centred a little above the flame's root, fading to zero at the quad
  // edge.
  vec2 hq = vec2(c.x / ${LAMP_HALO[0].toFixed(2)}, (c.y + 0.2) / ${LAMP_HALO[1].toFixed(2)});
  float halo = uHalo * vHeat * max(exp(-9.0 * dot(hq, hq)) - 0.0002, 0.0);
  vec3 haloCol = vec3(1.0, 0.5, 0.16) * halo;
  float v = clamp(c.y * 0.5 + 0.5, 0.0, 1.0);
  c.x -= vSway * v * v * 1.6;
  // Teardrop: round base low in the quad, tapering to a point at the top.
  float halfW = 0.62 * (1.0 - 0.82 * smoothstep(0.2, 1.0, v));
  float yy = c.y + 0.45;
  float d = length(vec2(c.x / max(halfW, 0.02), yy / (yy > 0.0 ? 1.45 : 0.55)));
  float body = abs(c.y) > 1.0 ? 0.0 : 1.0 - smoothstep(0.55, 1.0, d);
  if (body + halo <= 0.001) discard;
  float core = 1.0 - smoothstep(0.0, 0.6, d);
  vec3 outer = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.55, 0.16), v);
  vec3 col = mix(outer, vec3(1.0, 0.86, 0.6), core);
  // Faint blue at the root of the flame.
  col = mix(col, vec3(0.25, 0.35, 1.0), (1.0 - smoothstep(0.0, 0.22, v)) * (1.0 - core) * 0.6);
  float glow = body * (1.2 + 4.5 * core * core) * vHeat;
  gl_FragColor = vec4((col * glow * body + haloCol) * uBrightness * (1.0 - fogAmount()), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Small lamp flames, one per wick, in a single instanced draw.
 * @param {number[][]} wicks  Wick positions [x, y, z] (local, meters).
 * @param {{ width?: number, height?: number, brightness?: number, halo?: number, seed?: number }} o
 *   halo: strength of the soft glow round each flame.
 * @returns {{ mesh: THREE.Mesh, uniforms: object, update(time:number):void, dispose():void }}
 */
export function createLampFlames(wicks, { width = 0.028, height = 0.06, brightness = 1, halo = 0.6, seed = 3 } = {}) {
  const rnd = rng(seed * 104729 + 7);
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const a = new Float32Array(wicks.length * 4);
  wicks.forEach((w, i) => a.set([w[0], w[1], w[2], rnd()], i * 4));
  geo.setAttribute('aWick', new THREE.InstancedBufferAttribute(a, 4));
  geo.instanceCount = wicks.length;
  geo.boundingSphere = new THREE.Box3().setFromArray(wicks.flat()).getBoundingSphere(new THREE.Sphere());
  geo.boundingSphere.radius += height * 2;
  const uniforms = {
    uTime: { value: 0 },
    uWidth: { value: width },
    uHeight: { value: height },
    uBrightness: { value: brightness },
    uHalo: { value: halo },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'lamp-flames',
    uniforms: { ...uniforms, ...fogUniforms() },
    fog: true,
    vertexShader: LAMP_VERT,
    fragmentShader: LAMP_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lamp-flames';
  mesh.renderOrder = 2;
  const tOffset = rnd() * 100;
  return {
    mesh,
    uniforms,
    update(time) {
      uniforms.uTime.value = (time + tOffset) % 3600;
    },
    dispose() {
      base.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}
