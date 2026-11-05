import * as THREE from 'three';
import { LAVER as L, m } from '../config/dimensions.js';
import { circle } from './colliders.js';

export function createLaver() {
  const group = new THREE.Group();
  group.name = 'laver';
  const r = m(L.radius), h = m(L.height);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.8, h, 20),
    new THREE.MeshStandardMaterial({ color: 0xb87a3a, roughness: 0.5, metalness: 0.4 }),
  );
  mesh.position.y = h / 2;
  group.add(mesh);
  group.position.set(m(L.x), 0, m(L.z));
  group.userData.colliders = [circle(m(L.x), m(L.z), r)];
  return group;
}
