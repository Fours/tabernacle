import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ACACIA } from './materials.js';

// A stacked wood fire (log-cabin crib on a bed of coals), one mesh / one draw call.
// Charring is baked into vertex colors; the glowing embers are an animated emissive term
// (crack pattern from 3D noise, pulsing with the fire's flicker) added via onBeforeCompile.

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const BARK = new THREE.Color(0x6e4a2c);
const CHAR = new THREE.Color(0x0c0907);

/** Irregular log along +y, centered at the origin. */
function logGeometry(r, len, rnd) {
  const g = new THREE.CylinderGeometry(r, r, len, 9, 5);
  const p = g.attributes.position;
  const ph = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.1 * Math.sin(a * 3 + ph) + 0.06 * Math.sin(y * 9 + a * 2 + ph) + 0.05 * (rnd() - 0.5);
    p.setXYZ(i, x * k, y + Math.sin(a + ph) * 0.004, z * k);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Bakes vertex colors (charring) and glow per vertex in fire-local space. */
function bake(g, glowAt) {
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3), glow = new Float32Array(p.count);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const gl = glowAt(p.getX(i), p.getY(i), p.getZ(i), n.getY(i));
    glow[i] = gl;
    c.copy(BARK).lerp(CHAR, Math.min(1, 0.6 + gl * 1.2));
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  return g;
}

/**
 * @param {object} o
 * @param {number} [o.size=1.2]          Stack footprint (m).
 * @param {number} [o.layers=4]
 * @param {number} [o.logsPerLayer=4]
 * @param {number} [o.logRadius=0.065]   (m)
 * @param {number} [o.leaners=4]         Loose logs leaning on the stack.
 * @param {number} [o.coals=70]          Glowing coal lumps on the bed.
 * @param {number} [o.glow=2.2]          Ember emissive strength.
 * @param {number} [o.seed=5]
 * @returns {{ mesh: THREE.Mesh, height: number, update(time:number, level:number):void, dispose():void }}
 */
export function createFirewood(o = {}) {
  const { size = 1.2, layers = 4, logsPerLayer = 4, logRadius = 0.065, leaners = 4, coals = 70, glow = 2.2, seed = 5 } = o;
  const rnd = rng(seed);
  const half = size / 2;
  const step = logRadius * 1.75; // logs of the next layer rest in the notches
  const stackH = logRadius * 2 + step * (layers - 1);
  const parts = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

  // Glow: strongest low in the middle of the stack and on undersides facing the coals.
  const glowAt = (x, y, z, ny) => {
    const radial = 1 - Math.min(1, Math.hypot(x, z) / (half * 1.15));
    const low = 1 - Math.min(1, y / (stackH * 1.1));
    return Math.max(0, Math.min(1, (0.25 + 0.75 * low) * (0.35 + 0.65 * radial) + 0.35 * Math.max(0, -ny)));
  };

  // ---- Crib stack ----------------------------------------------------------------------
  for (let L = 0; L < layers; L++) {
    const alongX = L % 2 === 0;
    const n = L === layers - 1 ? logsPerLayer - 1 : logsPerLayer;
    for (let i = 0; i < n; i++) {
      const r = logRadius * (0.8 + 0.4 * rnd());
      const len = size * (0.85 + 0.2 * rnd());
      const off = n === 1 ? 0 : -half * 0.8 + (i * (half * 1.6)) / (n - 1);
      const g = logGeometry(r, len, rnd);
      e.set(0, 0, 0);
      // Cylinder runs along y: lay it along x or z with a little yaw/tilt.
      if (alongX) e.set((rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.15, Math.PI / 2);
      else e.set(Math.PI / 2, (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.08);
      q.setFromEuler(e);
      const y = r + L * step;
      const jitter = (rnd() - 0.5) * logRadius * 0.6;
      v.set(alongX ? jitter : off, y, alongX ? off : jitter);
      g.applyMatrix4(m4.compose(v, q, one));
      parts.push(bake(g, glowAt));
    }
  }

  // ---- A few loose logs leaning on the stack -------------------------------------------
  for (let i = 0; i < leaners; i++) {
    const a = (i / leaners) * Math.PI * 2 + 0.6 + rnd() * 0.4;
    const r = logRadius * (0.7 + 0.3 * rnd());
    const len = size * (0.55 + 0.15 * rnd());
    const g = logGeometry(r, len, rnd);
    const tilt = 0.9 + rnd() * 0.25; // from vertical
    q.setFromEuler(e.set(0, -a, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
    const d = half * 0.95;
    v.set(Math.cos(a) * d, Math.cos(tilt) * len * 0.5 * 0.9 + r * 0.6, Math.sin(a) * d);
    g.applyMatrix4(m4.compose(v, q, one));
    parts.push(bake(g, glowAt));
  }

  // ---- Coal bed --------------------------------------------------------------------------
  for (let i = 0; i < coals; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * half * 1.15;
    const s = logRadius * (0.35 + 0.6 * rnd());
    const g = new THREE.IcosahedronGeometry(1, 0);
    q.setFromEuler(e.set(rnd() * 3, rnd() * 3, rnd() * 3));
    g.applyMatrix4(m4.compose(v.set(Math.cos(a) * d, s * 0.25, Math.sin(a) * d), q, new THREE.Vector3(s, s * 0.6, s * 1.2)));
    g.deleteAttribute('uv');
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const lumpGlow = 0.55 + 0.45 * (1 - d / (half * 1.15)) * rnd();
    parts.push(bake(g, () => lumpGlow));
  }

  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());

  const uniforms = { uTime: { value: 0 }, uLevel: { value: 0 }, uGlow: { value: glow } };
  const mat = new THREE.MeshStandardMaterial({
    name: 'firewood',
    color: 0xffffff,
    map: ACACIA.map,
    vertexColors: true,
    roughness: 0.95,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uLevel = uniforms.uLevel;
    shader.uniforms.uGlow = uniforms.uGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uLevel;
uniform float uGlow;
varying float vGlow;
varying vec3 vLocal;
float wHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float wNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), u.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), u.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), u.x), u.y), u.z);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  float cracks = smoothstep(0.42, 0.78, wNoise(vLocal * 26.0 + vec3(0.0, -uTime * 0.12, uTime * 0.05)));
  float pulse = 0.7 + 0.3 * wNoise(vLocal * 5.0 + vec3(uTime * 0.6)) + 0.25 * uLevel;
  float g = pow(max(vGlow, 0.0), 1.6) * mix(0.15, 1.0, cracks) * pulse;
  totalEmissiveRadiance += vec3(1.0, 0.22, 0.03) * g * uGlow;
}`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'firewood';
  mesh.receiveShadow = false;
  mesh.castShadow = false;

  return {
    mesh,
    height: stackH,
    update(time, level = 0) {
      uniforms.uTime.value = time % 3600;
      uniforms.uLevel.value = level;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
