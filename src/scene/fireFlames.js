import * as THREE from 'three';
import { NOISE_GLSL, BILLBOARD_GLSL, FOG_ADDITIVE_GLSL, fogUniforms, rng, randAttribute } from './fireCommon.js';

// Flame rendering: the body of a fire (createFlames, used by createFire) and small oil-lamp
// flames (createLampFlames, the menorah).

// ---- Fire body ------------------------------------------------------------------------
// A few camera-facing "flame sheets" per fire (one instanced draw). Each sheet is anchored at a
// point on the burning bed and spans the whole flame height; its shape is computed per pixel
// from domain-warped, upward-scrolling value noise thresholded against a tapering envelope, so
// tongues form, separate and lick upward continuously (no sprites to pop, no baked loop).
// Fine, fast turbulence dominates at the base and a broad, slow roll at the top. Colour comes
// from a temperature ramp (deep red → orange → yellow → small yellow-white core) in HDR.
// Sheets blend as premultiplied "over" with partial alpha rather than additively, so overlaps
// converge to the ramp's colour instead of summing to a flat white blob.
//
// Chosen over a baked flipbook atlas (fixed frames loop and blend visibly at this size, and
// can't follow the per-fire wind and flicker) and over many small sprites (the old approach:
// soft blobs that only read as fire in sum, and sum to white).
const SHEET_SEGMENTS = 8;

const FLAME_VERT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uSize;
uniform vec2 uWind;
attribute vec4 aRand;
varying vec2 vUv;
varying float vSeed;
varying float vAspect;
#include <fog_pars_vertex>
void main() {
  // Anchor on the bed (sqrt: uniform over the disk), smaller and shorter toward the rim.
  float ang = aRand.x * 6.2831853;
  float rr = sqrt(aRand.y);
  vec3 c = vec3(cos(ang), 0.0, sin(ang)) * rr * uRadius * 0.8;
  float w = uSize * mix(0.85, 1.2, aRand.w) * (1.0 - 0.35 * rr);
  float h = uHeight * mix(0.75, 1.15, fract(aRand.w * 7.31 + aRand.z)) * (1.0 - 0.3 * rr);
  float x = position.x; // -0.5..0.5
  float y = position.y; // 0..1
  float s = aRand.z * 23.0;
  // Low-frequency sway of the upper flame (the fragment noise adds the fast licking).
  float sway = w * y * y * (0.1 * sin(uTime * 1.9 + s + y * 2.5) + 0.05 * sin(uTime * 4.3 + s * 1.7));
  vec3 windOff = vec3(uWind.x, 0.0, uWind.y) * (y * h) * (y * h) / uHeight;
  // Face the camera; "up" is world up as seen from the camera (its depth part keeps the top
  // nearer the camera when looking down), plus some screen-up so the flame keeps height when
  // seen from above.
  vec3 upV = (modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  float l = length(upV.xy);
  vec2 sUp = l > 0.15 ? upV.xy / l : vec2(0.0, 1.0);
  vec3 rightV = vec3(sUp.y, -sUp.x, 0.0);
  vec3 up = upV + vec3(sUp, 0.0) * max(0.0, 0.6 - l);
  vec4 mv = modelViewMatrix * vec4(c + windOff, 1.0);
  mv.xyz += rightV * (x * w + sway) + up * (y * h);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  vUv = vec2(x * 2.0, y);
  vSeed = aRand.z;
  vAspect = w / h;
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uBrightness;
uniform float uCore;
varying vec2 vUv;
varying float vSeed;
varying float vAspect;
${NOISE_GLSL}
${FOG_ADDITIVE_GLSL}
// Blackbody-like ramp in linear HDR: dull red at the edges and tips, orange, yellow body, a
// pale yellow core. Values stay finite and positive (bloom-safe).
vec3 fireRamp(float t) {
  vec3 c = mix(vec3(0.14, 0.01, 0.0), vec3(0.7, 0.085, 0.005), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.3, 0.34, 0.03), smoothstep(0.25, 0.6, t));
  c = mix(c, vec3(1.7, 0.7, 0.1), smoothstep(0.55, 0.85, t));
  return mix(c, vec3(2.2, 1.25, 0.36) * uCore, smoothstep(0.88, 1.0, t));
}
void main() {
  float x = vUv.x; // -1..1 across the sheet
  float y = vUv.y; // 0..1 up the sheet
  float t = uTime * mix(0.85, 1.15, vSeed) + vSeed * 37.0;
  float xm = x * 0.5 * vAspect; // across, in units of the sheet's height
  // Domain warp: broad eddies rising with the flow bend the tongues side to side.
  float warp = fFbm(vec2(xm * 2.0 + vSeed * 11.0, y * 1.8 - t * 0.9)) - 0.5;
  float xw = x + warp * 1.1 * y;
  // Tongue noise, stretched vertically so it forms streaks: a fine, fast layer at the base and a
  // broad, slow roll higher up.
  float nFast = fFbm(vec2(xm * 12.0 + warp * 3.0 + vSeed * 5.0, y * 4.5 - t * 3.8));
  float nSlow = fFbm(vec2(xm * 6.5 + warp * 2.2 + vSeed * 9.0, y * 2.4 - t * 1.5));
  // Stretch the fbm's narrow range (~0.25..0.75) to about -1..1.
  float n = (mix(nFast, nSlow, smoothstep(0.05, 0.75, y)) - 0.5) * 2.6;
  // Envelope: wide, rounded base tapering toward the tip.
  float wy = mix(1.0, 0.3, pow(y, 1.2));
  float env = 1.0 - smoothstep(0.1, 1.0, abs(xw) / wy);
  // Heat: highest low in the middle, eroded by the noise more and more with height, so the
  // body is continuous near the bed and splits into separate tongues above.
  float heat = env * 1.3 - y * 0.85 + n * (0.3 + 0.75 * y);
  heat -= (1.0 - smoothstep(0.0, 0.1, y)) * 0.5;
  // Nothing reaches the quad's edges (no cut-off tips or sides).
  heat -= smoothstep(0.7, 1.0, y) * 1.2 + smoothstep(0.7, 1.0, abs(x)) * 1.2;
  if (heat <= 0.0) discard;
  float a = smoothstep(0.0, 0.22, heat);
  // Streaks inside the body: hotter tongues with cooler, darker gaps between them.
  float streak = fNoise(vec2(xm * 16.0 + warp * 4.0 + vSeed * 3.0, y * 3.0 - t * 2.6));
  float temp = clamp(heat * 0.75 + (streak - 0.5) * 0.35, 0.0, 1.0);
  vec3 col = fireRamp(temp) * uBrightness * mix(0.7, 1.15, streak);
  float fade = 1.0 - fogAmount();
  // Premultiplied: rgb is emitted light, alpha how much it hides what's behind.
  gl_FragColor = vec4(col * a * fade, a * fade * 0.7);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Flame sheets (one instanced draw) sharing the fire's uniforms `u`. */
export function createFlames(count, u, rnd, { bounds, core = 1 }) {
  const base = new THREE.PlaneGeometry(1, 1, 1, SHEET_SEGMENTS).translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(randAttribute(count, rnd), 4));
  geo.instanceCount = count;
  geo.boundingSphere = bounds.clone();
  geo.boundingBox = null;
  const mat = new THREE.ShaderMaterial({
    name: 'fire-flames',
    uniforms: { ...u, ...fogUniforms(), uCore: { value: core } },
    fog: true,
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
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
  return { object: mesh, disposables: [base, geo, mat] };
}

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
