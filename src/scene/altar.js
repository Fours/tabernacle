import * as THREE from 'three';
import { ALTAR as A, m } from '../config/dimensions.js';
import { box } from './colliders.js';

export function createAltar() {
  const group = new THREE.Group();
  group.name = 'altar';
  const L = m(A.length), W = m(A.width), H = m(A.height), hs = m(A.hornSize);
  const bronze = new THREE.MeshStandardMaterial({ color: 0xa8652a, roughness: 0.6, metalness: 0.3 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), bronze);
  body.position.y = H / 2;
  group.add(body);

  // Horns: 4 small corner blocks on top.
  const hornGeo = new THREE.BoxGeometry(hs, hs, hs);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeo, bronze);
      horn.position.set(sx * (L - hs) / 2, H + hs / 2, sz * (W - hs) / 2);
      group.add(horn);
    }
  }

  group.position.set(m(A.x), 0, m(A.z));
  group.userData.colliders = [box(m(A.x), m(A.z), L, W)];
  return group;
}
