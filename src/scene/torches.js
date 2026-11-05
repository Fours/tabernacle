import * as THREE from 'three';
import { TORCHES, m } from '../config/dimensions.js';
import { ACACIA } from './materials.js';
import { createFire } from './fire.js';
import { circle } from './colliders.js';

// Period torches: a wooden post set in a small cairn of stones, topped by a head of cloth
// wrapped around a tow core and soaked in pitch. Posts, heads and cairns are instanced
// (3 draw calls for all torches); each torch adds a small fire (2 draws) and, for most, a
// warm non-shadow point light.

export function createTorches() {
  const group = new THREE.Group();
  group.name = 'torches';
  const list = TORCHES.list;
  const H = TORCHES.postHeight;

  const postGeo = new THREE.CylinderGeometry(0.04, 0.06, H, 8);
  postGeo.translate(0, H / 2 - 0.1, 0); // set 10 cm into the ground/cairn
  const headH = 0.26;
  const headGeo = new THREE.CylinderGeometry(0.1, 0.06, headH, 10);
  headGeo.translate(0, H - 0.1 - 0.02 + headH / 2 - 0.08, 0);
  const cairnGeo = new THREE.CylinderGeometry(0.17, 0.3, 0.28, 7);
  cairnGeo.translate(0, 0.1, 0);

  const wrapMat = new THREE.MeshStandardMaterial({
    color: 0x1c130b,
    roughness: 0.9,
    emissive: 0xff5a14,
    emissiveIntensity: 0.9,
  });
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
      radius: 0.07,
      height: 0.5,
      flameSize: 0.17,
      flames: 16,
      embers: t.light ? 8 : 0,
      smoke: 0,
      intensity: t.light ? 28 : 0,
      lightOffset: [0, 0.3, 0],
      flicker: 0.3,
      wind: [0.03, 0.01],
      seed: 100 + i,
    });
    fire.group.position.set(x, H + 0.02, z);
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
    wrapMat.emissiveIntensity = 0.75 + 0.3 * (lvl / fires.length);
  };
  return group;
}
