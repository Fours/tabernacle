import * as THREE from 'three';
import { LAVER as L, m } from '../config/dimensions.js';
import { circle } from './colliders.js';
import { BRONZE_PLATED, WATER } from './materials.js';
import { part, merge } from './bronzeParts.js';

// Laver (Ex 30:17-21; 38:8): bronze basin on a bronze base, for the priests' washing. One lathe
// body (foot, stem with a knop, flared bowl) plus a few spouts and a water surface.
export function createLaver() {
  const group = new THREE.Group();
  group.name = 'laver';
  const R = L.radius, hs = L.height / 2; // profile y values below are in half-heights
  const foot = L.footRadius, stem = L.stemRadius;
  // [radius (cubits), height (cubits)], outer wall bottom -> rim, then inner wall rim -> bottom.
  const profile = [
    [0, 0], [foot, 0], [foot, 0.08 * hs], [foot * 0.8, 0.14 * hs], [stem + 0.05, 0.22 * hs],
    [stem, 0.35 * hs], [stem + 0.1, 0.45 * hs], [stem + 0.1, 0.55 * hs], [stem, 0.65 * hs],
    [stem, 0.88 * hs], [0.45 * R, 0.96 * hs], [0.8 * R, 1.08 * hs], [0.97 * R, 1.32 * hs],
    [R, 1.75 * hs], [0.98 * R, 1.94 * hs], [R, hs * 2],
    [0.93 * R, hs * 2], [0.9 * R, 1.94 * hs], [0.9 * R, 1.75 * hs], [0.85 * R, 1.36 * hs],
    [0.4 * R, 1.12 * hs], [0, 1.1 * hs],
  ].map(([r, y]) => new THREE.Vector2(m(r), m(y)));
  const parts = [part(new THREE.LatheGeometry(profile, 32))];
  for (let i = 0; i < L.spouts; i++) {
    const g = new THREE.CylinderGeometry(m(0.045), m(0.065), m(0.3), 8)
      .rotateZ(-Math.PI / 2 + 0.35)
      .translate(m(0.95 * R + 0.1), m(1.4 * hs), 0)
      .rotateY((i / L.spouts) * Math.PI * 2 + Math.PI / 4);
    parts.push(part(g));
  }
  const body = new THREE.Mesh(merge(parts), BRONZE_PLATED);
  body.name = 'laver-bronze';
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  const water = new THREE.Mesh(new THREE.CircleGeometry(m(0.9 * R), 32).rotateX(-Math.PI / 2), WATER);
  water.name = 'laver-water';
  water.position.y = m(1.68 * hs);
  group.add(water);

  group.position.set(m(L.x), 0, m(L.z));
  group.userData.colliders = [circle(m(L.x), m(L.z), m(R))];
  return group;
}
