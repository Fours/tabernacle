import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TORCHES, m } from '../config/dimensions.js';
import { ACACIA } from './materials.js';
import { createFire } from './fire.js';
import { circle } from './colliders.js';
import { groundHeight } from './terrain.js';
import { aoCircle } from './ao.js';

// Period torches: a wooden post set in a mound of heaped earth, topped by a head of cloth
// wrapped around a tow core and soaked in pitch. Posts and heads are instanced and the
// mounds merged (3 draw calls for all torches); each torch adds a small fire (2 draws) and, for most, a
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

/** Seeded 0..1 random (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Earth heaped round the post (meters, local, origin on the ground at the post): a smooth,
 * low bell (~0.5 m radius, ~0.18 m high) with a long toe that meets the sand at zero slope,
 * so it grows out of the ground, and a gentle lopsided swell. Indexed polar grid (smooth
 * normals).
 */
function moundGeometry(rnd) {
  const R = 0.5, H = 0.18, RINGS = 16, SEG = 40;
  const ph = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3];
  const pos = [], idx = [];
  const height = (t, a) => {
    // Bell with a long, flat toe: (1 - t^2)^2 has zero slope at the rim.
    const bell = Math.pow(Math.max(0, 1 - t * t), 2);
    const swell = 1 + 0.12 * Math.sin(a * 2 + ph[0]) + 0.06 * Math.sin(a * 3 + ph[1] + t * 3);
    return H * bell * swell - 0.004; // the rim tucks just under the sand
  };
  pos.push(0, height(0, 0), 0);
  for (let i = 1; i <= RINGS; i++) {
    const t = i / RINGS;
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      const r = R * t * (1 + 0.08 * t * Math.sin(a * 2 + ph[1]) + 0.05 * t * Math.sin(a * 3 + ph[2]));
      pos.push(Math.cos(a) * r, height(t, a), Math.sin(a) * r);
    }
  }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
  for (let i = 1; i < RINGS; i++) {
    const r0 = 1 + (i - 1) * SEG, r1 = 1 + i * SEG;
    for (let j = 0; j < SEG; j++) {
      const j1 = (j + 1) % SEG;
      idx.push(r0 + j, r0 + j1, r1 + j, r0 + j1, r1 + j1, r1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/**
 * All torch mounds as one mesh in world space, with the ground's own UVs (as its 600 m relief
 * plane, ground.js), so it can wear the sand material itself and match the ground exactly at
 * its edge: colour, grain, ripples, tone patches and baked contact AO.
 */
function moundsMesh(placements) {
  const rnd = seeded(11);
  const parts = placements.map(({ x, y, z, rot, sx, sy, sz }) => {
    const g = moundGeometry(rnd);
    g.scale(sx, sy, sz);
    g.rotateY(rot);
    // Height of the heaped earth above the ground, for the mound's darker, browner earth.
    const lp = g.attributes.position;
    const hgt = new Float32Array(lp.count);
    for (let i = 0; i < lp.count; i++) hgt[i] = Math.max(0, lp.getY(i));
    g.setAttribute('aMound', new THREE.BufferAttribute(hgt, 1));
    g.translate(x, y, z);
    const p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) uv.set([p.getX(i) / 600 + 0.5, 0.5 - p.getZ(i) / 600], i * 2);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  });
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  geo.computeVertexNormals();
  // Placeholder until main.js hands over the ground's sand material (userData.useGroundMaterial).
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a8566, roughness: 1 }));
  mesh.name = 'torch-mounds';
  mesh.receiveShadow = true;
  return mesh;
}

export function createTorches() {
  const group = new THREE.Group();
  group.name = 'torches';
  const list = TORCHES.list;
  const H = TORCHES.postHeight;

  const postGeo = new THREE.CylinderGeometry(0.04, 0.06, H, 8);
  postGeo.translate(0, H / 2 - 0.1, 0); // set 10 cm into the ground/mound
  const headH = 0.26;
  const headY = H - 0.2; // bottom of the wrap
  const headGeo = headGeometry(headH);
  headGeo.translate(0, headY, 0);

  const wrap = charredWrapMaterial(headY, headH);
  const wrapMat = wrap.material;

  const posts = new THREE.InstancedMesh(postGeo, ACACIA, list.length);
  const heads = new THREE.InstancedMesh(headGeo, wrapMat, list.length);
  const mounds = [];
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const colliders = [];
  const aoShapes = [];
  const fires = [];

  list.forEach((t, i) => {
    const x = m(t.x), z = m(t.z), gy = groundHeight(x, z); // 0 today: torches stand near the court
    p.set(x, gy, z);
    mat.compose(p, q.identity(), s);
    posts.setMatrixAt(i, mat);
    heads.setMatrixAt(i, mat);
    mounds.push({
      x, y: gy, z, rot: i * 1.3,
      sx: 1 + 0.08 * Math.sin(i * 2.1), sy: 1 + 0.08 * Math.sin(i * 3.3), sz: 1 + 0.08 * Math.cos(i * 1.7),
    });
    colliders.push(circle(x, z, 0.4));
    aoShapes.push(aoCircle(x, z, 0.06, 0.8, 0.12)); // post (the mound wears the ground's AO)

    const fire = createFire({
      radius: 0.08,
      height: 0.5,
      flames: 4,
      // Flame-only shaping (the particles don't read these): a narrower foot hugging the crown,
      // which the flame wraps (a solid core ends the rays), faster and more ragged than the
      // altar's (a small flame flickers faster) and optically thinner (more translucent), and
      // leaning harder in the wind.
      flameSize: 0.24,
      flameThickness: 0.7,
      flameSolid: [0.075, 0.07],
      flameSpeed: 1.7,
      flameRagged: 1.6,
      flameLean: 4,
      core: 0.8,
      // A few sparks and a thin dark wisp (pitch-soaked wrapping smokes).
      sparks: 8,
      bursts: 1,
      embers: 2,
      smoke: 16,
      smokeHeight: 1.6,
      smokeSize: 1.2,
      smokeBase: 0.9,
      smokeOpacity: 0.28,
      smokeGlow: 0.6,
      smokeAmbient: [0.018, 0.017, 0.017],
      intensity: t.light ? 28 : 0,
      lightOffset: [0, 0.35, 0], // same height as before (base lowered 5 cm)
      flicker: 0.3,
      wind: [0.03, 0.01],
      seed: 100 + i,
    });
    fire.group.position.set(x, gy + H - 0.03, z); // flames wrap the burning crown
    group.add(fire.group);
    fires.push(fire);
  });
  for (const mesh of [posts, heads]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  const moundMesh = moundsMesh(mounds);
  group.add(moundMesh);
  /**
   * main.js: give the mounds a copy of the ground's sand material, so they match the ground at
   * their edge, darkening toward heaped, browner earth higher up. Call it before
   * applyInteriorMask/applyAtmosphere: the copy chains the sand patch as it is now, and those
   * then patch both materials once each.
   */
  group.userData.useGroundMaterial = (sand) => {
    const base = sand.onBeforeCompile;
    const baseKey = sand.customProgramCacheKey.bind(sand);
    const earth = sand.clone();
    earth.name = 'torch-mound';
    earth.onBeforeCompile = (shader, renderer) => {
      base(shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aMound;\nvarying float vMound;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMound = aMound;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vMound;')
        .replace(
          '#include <roughnessmap_fragment>',
          `{
  // Heaped earth: the plain sand at the toe, darker and browner up the mound (dug, damper soil).
  float mk = smoothstep(0.0, 0.15, vMound);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.7, 0.62), mk);
}
#include <roughnessmap_fragment>`,
        );
    };
    earth.customProgramCacheKey = () => `${baseKey()}|torch-mound-v1`;
    moundMesh.material.dispose();
    moundMesh.material = earth;
  };

  group.userData.fires = fires;
  group.userData.colliders = colliders;
  group.userData.aoShapes = aoShapes;
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
