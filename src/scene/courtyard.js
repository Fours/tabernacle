import * as THREE from 'three';
import { COURTYARD as C, m } from '../config/dimensions.js';
import { box, circle } from './colliders.js';

/** Pillar positions (cubits) around the perimeter, corners counted once. */
export function pillarPositions() {
  const hx = C.length / 2, hz = C.width / 2, s = C.pillarSpacing;
  const pts = [];
  for (let x = -hx; x <= hx + 1e-9; x += s) {
    pts.push([x, -hz]); // north
    pts.push([x, hz]); // south
  }
  for (let z = -hz + s; z <= hz - s + 1e-9; z += s) {
    pts.push([-hx, z]); // west
    pts.push([hx, z]); // east
  }
  return pts;
}

export function createCourtyard() {
  const group = new THREE.Group();
  group.name = 'courtyard';
  const colliders = [];

  const hx = m(C.length / 2), hz = m(C.width / 2);
  const H = m(C.hangingHeight), T = m(C.hangingThickness);

  // Pillars (InstancedMesh)
  const pts = pillarPositions();
  if (pts.length !== C.pillarCount) {
    console.warn(`Expected ${C.pillarCount} pillars, got ${pts.length}`);
  }
  const pr = m(C.pillarDiameter / 2), ph = m(C.pillarHeight);
  const pillarGeo = new THREE.CylinderGeometry(pr, pr, ph, 12);
  pillarGeo.translate(0, ph / 2, 0);
  const pillars = new THREE.InstancedMesh(
    pillarGeo,
    new THREE.MeshStandardMaterial({ color: 0x7a5a32, roughness: 0.8 }),
    pts.length,
  );
  pillars.name = 'pillars';
  const mat4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => {
    mat4.makeTranslation(m(x), 0, m(z));
    pillars.setMatrixAt(i, mat4);
    colliders.push(circle(m(x), m(z), pr));
  });
  pillars.instanceMatrix.needsUpdate = true;
  group.add(pillars);

  // Hangings: thin flat panels along the pillar line.
  const linen = new THREE.MeshStandardMaterial({ color: 0xeee8d8, roughness: 0.9, side: THREE.DoubleSide });
  const addPanel = (cx, cz, sx, sz, mat, collide = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), mat);
    mesh.position.set(cx, H / 2, cz);
    group.add(mesh);
    if (collide) colliders.push(box(cx, cz, sx, sz));
    return mesh;
  };
  addPanel(0, -hz, 2 * hx, T, linen).name = 'hanging-north';
  addPanel(0, hz, 2 * hx, T, linen).name = 'hanging-south';
  addPanel(-hx, 0, T, 2 * hz, linen).name = 'hanging-west';
  // East: two 15-cubit hangings, gate opening centered.
  const gw = m(C.gateWidth), sw = m(C.sideHangingWidth);
  addPanel(hx, -(gw / 2 + sw / 2), T, sw, linen).name = 'hanging-east-north';
  addPanel(hx, gw / 2 + sw / 2, T, sw, linen).name = 'hanging-east-south';

  // Gate screen: distinct color, semi-transparent and NON-colliding in the blockout
  // (it is a hanging people pass through; the gate pillars still collide).
  const gateMat = new THREE.MeshStandardMaterial({
    color: 0x4a3aa0,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  addPanel(hx, 0, T, gw, gateMat, false).name = 'gate-screen';

  group.userData.colliders = colliders;
  return group;
}
