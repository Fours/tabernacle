import * as THREE from 'three';
import { TORCHES, m } from '../config/dimensions.js';
import { ACACIA } from './materials.js';
import { createFire } from './fire.js';
import { circle } from './colliders.js';

// Period torches: a wooden post set in a small cairn of stones, topped by a head of cloth
// wrapped around a tow core and soaked in pitch. Posts, heads and cairns are instanced
// (3 draw calls for all torches); each torch adds a small fire (2 draws) and, for most, a
// warm non-shadow point light.

/**
 * Wrapped torch head: cloth bound round the post top in a few lumpy turns, swelling a little
 * below the burning crown and rounded over the top (origin at its bottom).
 */
function headGeometry(h) {
  const pts = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Swelling profile: post-thin at the bottom, widest at 60%, domed top.
    let r = 0.045 + 0.04 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62);
    if (t > 0.8) r *= Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) * 0.6 + 0.4;
    // Binding turns (ridges).
    r += 0.006 * Math.sin(t * Math.PI * 9);
    pts.push(new THREE.Vector2(Math.max(r, 0.002), t * h));
  }
  pts.push(new THREE.Vector2(0.001, h));
  const g = new THREE.LatheGeometry(pts, 14);
  // Lumpy, slightly spiralled wrapping.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.08 * Math.sin(a * 3 + y * 40) + 0.05 * Math.sin(a * 5 - y * 23);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Charred, pitch-soaked cloth: near-black with glowing cracks that are brightest under the
 * burning crown and pulse with the flame (HDR emissive, so the cracks bloom).
 */
function charredWrapMaterial(y0, h) {
  const uniforms = { uTime: { value: 0 }, uLevel: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({
    name: 'torch-wrap',
    color: 0x17110c,
    roughness: 0.95,
    emissive: 0x000000,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uLevel = uniforms.uLevel;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHead;\nvarying float vSeed;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vHead = position;
#ifdef USE_INSTANCING
vSeed = dot(instanceMatrix[3].xz, vec2(0.37, 0.61));
#else
vSeed = 0.0;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uLevel;
varying vec3 vHead;
varying float vSeed;
float tHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float tNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tHash(i), tHash(i + vec3(1,0,0)), u.x), mix(tHash(i + vec3(0,1,0)), tHash(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(tHash(i + vec3(0,0,1)), tHash(i + vec3(1,0,1)), u.x), mix(tHash(i + vec3(0,1,1)), tHash(i + vec3(1,1,1)), u.x), u.y), u.z);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  // Height within the head, 0 at the bottom of the wrap, 1 at the crown (local y).
  float hy = clamp((vHead.y - ${y0.toFixed(3)}) / ${h.toFixed(3)}, 0.0, 1.0);
  vec3 q = vHead * 38.0 + vec3(vSeed * 13.0, -uTime * 0.08, vSeed * 7.0);
  float n = tNoise(q) * 0.65 + tNoise(q * 2.3) * 0.35;
  // Thin bright veins where the noise crosses mid-level: cracks in the charred crust.
  float crack = 1.0 - smoothstep(0.0, 0.07, abs(n - 0.5));
  float heat = smoothstep(0.25, 0.95, hy);
  float pulse = 0.75 + 0.25 * tNoise(vec3(vSeed * 3.0, uTime * 1.7, 0.0)) + 0.2 * uLevel;
  float glow = (crack * 0.85 + 0.15) * heat * heat * pulse;
  // Crown: the burning top glows more evenly.
  glow += smoothstep(0.85, 1.0, hy) * 0.6 * pulse;
  totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * glow * 3.2;
  diffuseColor.rgb *= 1.0 - 0.5 * heat;
}`,
      );
  };
  material.customProgramCacheKey = () => 'torch-wrap-v1';
  return { material, uniforms };
}

export function createTorches() {
  const group = new THREE.Group();
  group.name = 'torches';
  const list = TORCHES.list;
  const H = TORCHES.postHeight;

  const postGeo = new THREE.CylinderGeometry(0.04, 0.06, H, 8);
  postGeo.translate(0, H / 2 - 0.1, 0); // set 10 cm into the ground/cairn
  const headH = 0.26;
  const headY = H - 0.2; // bottom of the wrap
  const headGeo = headGeometry(headH);
  headGeo.translate(0, headY, 0);
  const cairnGeo = new THREE.CylinderGeometry(0.17, 0.3, 0.28, 7);
  cairnGeo.translate(0, 0.1, 0);

  const wrap = charredWrapMaterial(headY, headH);
  const wrapMat = wrap.material;
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6d655a, roughness: 1, flatShading: true });

  const posts = new THREE.InstancedMesh(postGeo, ACACIA, list.length);
  const heads = new THREE.InstancedMesh(headGeo, wrapMat, list.length);
  const cairns = new THREE.InstancedMesh(cairnGeo, stoneMat, list.length);
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const colliders = [];
  const fires = [];

  list.forEach((t, i) => {
    const x = m(t.x), z = m(t.z);
    p.set(x, 0, z);
    mat.compose(p, q.identity(), s);
    posts.setMatrixAt(i, mat);
    heads.setMatrixAt(i, mat);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3);
    s.set(1 + 0.1 * Math.sin(i * 2.1), 1, 1 + 0.1 * Math.cos(i * 1.7));
    mat.compose(p, q, s);
    cairns.setMatrixAt(i, mat);
    s.set(1, 1, 1);
    colliders.push(circle(x, z, 0.3));

    const fire = createFire({
      radius: 0.08,
      height: 0.5,
      flameSize: 0.34,
      flames: 4,
      core: 0.8,
      embers: t.light ? 8 : 0,
      smoke: 0,
      intensity: t.light ? 28 : 0,
      lightOffset: [0, 0.35, 0], // same height as before (base lowered 5 cm)
      flicker: 0.3,
      wind: [0.03, 0.01],
      seed: 100 + i,
    });
    fire.group.position.set(x, H - 0.03, z); // flames wrap the burning crown
    group.add(fire.group);
    fires.push(fire);
  });
  for (const mesh of [posts, heads, cairns]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  group.userData.fires = fires;
  group.userData.colliders = colliders;
  group.userData.update = (dt, time) => {
    let lvl = 0;
    for (const f of fires) {
      f.update(dt, time);
      lvl += f.level;
    }
    wrap.uniforms.uTime.value = time % 3600;
    wrap.uniforms.uLevel.value = lvl / fires.length;
  };
  return group;
}
