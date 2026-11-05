import * as THREE from 'three';
import { PILLAR_OF_FIRE as P, m } from '../config/dimensions.js';
import { NOISE_GLSL, FOG_ADDITIVE_GLSL } from './fire.js';

// The pillar of fire over the tent by night (Num 9:15-16): a tall column of slowly rolling fire
// standing on the roof above the Holy of Holies, and above it a long shaft of yellowish light
// fading up into the stars.
//
// One draw call: a closed, flared cylinder (rendered back faces only, so it still draws when the
// camera is close) bounds the effect; its fragment shader treats the column as a soft volume
// around a vertical axis. For each pixel the camera ray's closest approach to the axis is found
// analytically; the density there is a Gaussian in that distance (wobbled and billowed by the
// fire.js noise), scaled by the ray's path length through the volume (longer when looking up
// along it). So there are no hard geometric edges and it reads as a volume from any angle,
// including from the courtyard looking up. Emissive and additive; the fire's core is HDR (> 2)
// so bloom picks it up, the shaft stays below the bloom threshold as a soft glow.
//
// Fog: half the scene's fog, faded to black (additive). Full fog would bury the shaft from the
// courtyard (60-80 m away, ~50% fog), none would make the column's foot look pasted on.

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
uniform float uColR;         // column Gaussian radius (m)
uniform float uShaftH;       // shaft height above the column (m)
uniform float uShaftR;       // shaft radius at its foot (m)
uniform float uShaftSpread;  // radius gained per meter
uniform vec2 uBound;         // bounding radius at the foot and at the top (m)
uniform float uColGain;
uniform float uShaftGain;
uniform float uFogMix;
varying vec3 vWorld;
${NOISE_GLSL}
${FOG_ADDITIVE_GLSL}
vec3 pillarRamp(float t) {
  vec3 c = mix(vec3(0.45, 0.06, 0.0), vec3(1.0, 0.32, 0.04), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(1.0, 0.62, 0.2), smoothstep(0.35, 0.7, t));
  return mix(c, vec3(1.0, 0.9, 0.68), smoothstep(0.7, 1.0, t));
}
void main() {
  vec3 o = cameraPosition - uBase;
  vec3 rd = vWorld - cameraPosition;
  float tEnd = length(rd);
  vec3 d = rd / max(tEnd, 1e-4);
  float a = max(dot(d.xz, d.xz), 1e-4);
  // Closest approach of the ray to the vertical axis (in front of the camera, before the far
  // face of the bounding volume).
  float t = clamp(-dot(o.xz, d.xz) / a, 0.0, tEnd);
  vec3 p = o + d * t;
  float y = p.y;
  float H = uColH + uShaftH;
  if (y < 0.0 || y > H) discard;
  // Signed sideways distance from the axis as seen along the ray.
  vec2 perp = vec2(-d.z, d.x) / sqrt(a);
  float s = dot(p.xz, perp);
  // Path length through the volume relative to a level view: brighter looking up into it.
  float path = clamp(inversesqrt(a), 1.0, 3.0);
  float bound = mix(uBound.x, uBound.y, y / H);
  float win = 1.0 - smoothstep(0.75, 1.0, abs(s) / bound);
  float T = uTime;

  // Fire column: rolling billows rising slowly, a gentle sway of its axis.
  float sway = 0.22 * sin(y * 0.33 - T * 0.37) + 0.12 * sin(y * 0.71 + T * 0.23);
  float sc = s - sway;
  float n1 = fFbm(vec2(sc * 0.75 + 3.0, y * 0.42 - T * 0.55));
  float n2 = fFbm(vec2(sc * 1.6 + 11.0, y * 0.95 - T * 1.05));
  // Foot tapers down almost to a point: radius grows from ~6% over the lowest ~38%.
  float taper = mix(0.06, 1.0, pow(smoothstep(0.0, uColH * 0.38, y), 0.6));
  float sig = uColR * (0.7 + 0.65 * n1) * taper;
  float g = exp(-(sc * sc) / max(sig * sig, 1e-3));
  float colY = smoothstep(0.0, 0.6, y) * mix(0.55, 1.0, taper)
    * (1.0 - smoothstep(uColH * 0.72, uColH * 1.08, y));
  float dens = g * colY * clamp(0.2 + 1.5 * (n2 - 0.15), 0.0, 1.6);
  float heat = clamp(dens * 0.85 * (1.0 - 0.2 * smoothstep(uColH * 0.5, uColH, y)), 0.0, 1.0);
  vec3 col = pillarRamp(heat) * dens * uColGain;

  // Shaft of light above it: widening, faint slow streaks rising, fading into the sky.
  float ys = y - uColH * 0.75;
  float sigS = uShaftR + uShaftSpread * max(ys, 0.0);
  float sw = s - 0.5 * sway;
  float gs = exp(-(sw * sw) / (sigS * sigS));
  float streak = fNoise(vec2(sw / sigS * 2.2 + 5.0, y * 0.06 - T * 0.12));
  float shaftY = smoothstep(uColH * 0.45, uColH * 1.05, y) * exp(-max(ys, 0.0) / (uShaftH * 0.4))
    * (1.0 - smoothstep(uShaftH * 0.2, uShaftH * 1.0, ys));
  col += vec3(1.0, 0.68, 0.24) * gs * shaftY * (0.7 + 0.6 * streak) * uShaftGain;

  col *= win * path;
  // Fine multiplicative dither: breaks 8-bit banding in the long, faint fade (stays >= 0).
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col *= 1.0 + (dn - 0.5) * 0.04;
  col = max(col, vec3(0.0)) * (1.0 - uFogMix * fogAmount());
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

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
  const bound = new THREE.Vector2(
    Math.max(3.2 * P.columnRadius, 2.5 * P.shaftRadius) + 0.6,
    2.4 * (P.shaftRadius + P.shaftSpread * H),
  );
  const geo = new THREE.CylinderGeometry(bound.y, bound.x, H, 24, 1, false);
  geo.translate(0, H / 2, 0);

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uBase: { value: base.clone() },
    uColH: { value: P.columnHeight },
    uColR: { value: P.columnRadius },
    uShaftH: { value: P.shaftHeight },
    uShaftR: { value: P.shaftRadius },
    uShaftSpread: { value: P.shaftSpread },
    uBound: { value: bound },
    uColGain: { value: 2.6 },
    uShaftGain: { value: 0.5 },
    uFogMix: { value: 0.5 },
  }]);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pillar-of-fire-volume';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 10; // after the other additive fires (it's mostly sky-backed)
  group.add(mesh);

  // Warm light in the column: softly lights the roof coverings and the courtyard. Above the
  // tent's interior box, so the interior mask classes it as outside. No shadow.
  const light = new THREE.PointLight(P.light.color, P.light.intensity, 0, P.light.decay);
  light.position.set(0, P.light.y, 0);
  light.castShadow = false;
  light.userData.baseIntensity = P.light.intensity; // tunable live; update() breathes around it
  group.add(light);

  group.userData.light = light;
  group.userData.uniforms = uniforms;
  group.userData.update = (dt, time) => {
    uniforms.uTime.value = time;
    // Slow breathing, not a campfire flicker.
    light.intensity = light.userData.baseIntensity * (1 + 0.06 * Math.sin(time * 0.9) + 0.04 * Math.sin(time * 2.3 + 1.7));
  };
  group.userData.dispose = () => {
    geo.dispose();
    mat.dispose();
    light.dispose();
    group.removeFromParent();
  };
  return group;
}
