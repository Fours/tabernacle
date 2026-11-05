import * as THREE from 'three';
import { TABERNACLE as T, m } from '../config/dimensions.js';
import { box } from './colliders.js';

export function createTabernacle() {
  const group = new THREE.Group();
  group.name = 'tabernacle';
  const colliders = [];

  const t = m(T.boardThickness);
  const x0 = m(T.interiorMinX), x1 = m(T.interiorMaxX);
  const hw = m(T.interiorWidth / 2), cz = m(T.centerZ);
  const H = m(T.boardHeight);
  const len = x1 - x0;

  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.5, metalness: 0.4 });
  const addWall = (cx, czz, sx, sz, name) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), gold);
    mesh.position.set(cx, H / 2, czz);
    mesh.name = name;
    group.add(mesh);
    colliders.push(box(cx, czz, sx, sz));
  };
  // North & south walls span the interior length plus the west wall thickness.
  const sideLen = len + t;
  const sideCx = (x0 - t + x1) / 2;
  addWall(sideCx, cz - hw - t / 2, sideLen, t, 'wall-north');
  addWall(sideCx, cz + hw + t / 2, sideLen, t, 'wall-south');
  addWall(x0 - t / 2, cz, t, 2 * hw, 'wall-west');

  // Flat roof slab covering walls.
  const rt = m(T.roofThickness);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(sideLen, rt, 2 * (hw + t)),
    new THREE.MeshStandardMaterial({ color: 0x3a2c24, roughness: 1 }),
  );
  roof.position.set(sideCx, H + rt / 2, cz);
  roof.name = 'roof';
  group.add(roof);

  // East entrance screen (marked; collides because interiors are out of scope).
  const st = m(T.entranceScreenThickness);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(st, H, 2 * hw),
    new THREE.MeshStandardMaterial({ color: 0x8a2a4a, roughness: 0.9 }),
  );
  screen.position.set(x1 + st / 2, H / 2, cz);
  screen.name = 'entrance-screen';
  group.add(screen);
  colliders.push(box(x1 + st / 2, cz, st, 2 * hw));

  group.userData.colliders = colliders;
  return group;
}
