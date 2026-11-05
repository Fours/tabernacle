import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUBIT } from '../config/dimensions.js';

// Helpers for building many small static parts that share one material and draw call
// (altar, utensils, laver). Parts are non-indexed with position/normal/uv so they merge.

const FLAT_UV = [0.5, 0.5]; // blank area of the bronze plate texture (no seams / rivets)

/**
 * Transform `geo` by position/euler (meters) and give it UVs.
 * mode 'cubit': box-projected UVs in cubits (plate seams line up on flat faces).
 * mode 'flat': constant UV (plain bronze) for curved or rotated parts.
 */
export function part(geo, { pos = [0, 0, 0], rot = [0, 0, 0], mode = 'flat' } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  const mat = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(1, 1, 1),
  );
  g.applyMatrix4(mat);
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    if (mode === 'cubit') {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
      else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
      else { u = p.getX(i); v = p.getY(i); }
      uv[i * 2] = u / CUBIT;
      uv[i * 2 + 1] = v / CUBIT;
    } else {
      uv[i * 2] = FLAT_UV[0];
      uv[i * 2 + 1] = FLAT_UV[1];
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}

/** Axis-aligned box centered at pos (meters), size w,h,d (meters). */
export const boxPart = (w, h, d, pos, mode = 'cubit', rot) =>
  part(new THREE.BoxGeometry(w, h, d), { pos, rot, mode });

export function merge(parts) {
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}
