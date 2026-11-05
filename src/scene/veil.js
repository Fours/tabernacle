import * as THREE from 'three';
import { TABERNACLE as T, m } from '../config/dimensions.js';
import { part } from './bronzeParts.js';
import { createLinenTexture } from './textiles.js';
import { createCherubimTexture } from './cherubimWeave.js';
import { roofSag } from './tentCoverings.js';

// The veil (Ex 26:31-33; 36:35-36) between the Holy Place and the Holy of Holies: a curtain
// woven with cherubim, hung on gold hooks from 4 gold-overlaid acacia pillars on silver
// sockets. The cloth hangs under the linen clasp line; the pillars stand on its west side.

const V = T.veil;
const HW = T.interiorWidth / 2;

/** Pillar z positions (cubits): one in the middle of each quarter of the width. */
export const veilPillarZs = () =>
  Array.from({ length: V.pillars }, (_, i) => T.centerZ - HW + (T.interiorWidth * (i + 0.5)) / V.pillars);

/** Ceiling height (cubits) under the linen covering at the veil line. */
const ceilingAt = (z) => T.boardHeight + T.linen.above - roofSag(V.x, z);

function clothMesh() {
  const zs = veilPillarZs();
  // Supports along the top edge: the walls and the four hooks.
  const sup = [T.centerZ - HW, ...zs, T.centerZ + HW];
  const z0 = T.centerZ - HW + 0.02, z1 = T.centerZ + HW - 0.02, W = z1 - z0;
  const cols = 180, rows = 16, sag = 0.06;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (let i = 0; i <= cols; i++) {
      const z = z0 + (W * i) / cols;
      let k = 0;
      while (k < sup.length - 2 && z > sup[k + 1]) k++;
      const bell = Math.sin((Math.PI * (z - sup[k])) / (sup[k + 1] - sup[k]));
      const top = ceilingAt(z) - V.topGap;
      const y = top - t * (top - V.hem) - sag * bell * (1 - t);
      // Soft vertical folds, deeper between the hooks and toward the hem.
      const amp = 0.05 * (0.35 + 0.65 * bell) * (0.6 + 0.4 * t);
      const fold = amp * (0.6 * Math.sin((2 * Math.PI * z) / 0.7 + 0.3) + 0.4 * Math.sin((2 * Math.PI * z) / 1.7 + 1.9));
      pos.push(m(V.x + 0.05 + fold), m(y), m(z));
      // u: south on the left seen from the Holy Place (facing west); v = 1 at the top.
      uv.push((z1 - z) / W, 1 - t);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const weave = createLinenTexture();
  weave.repeat.set(m(W) / 0.5, m(T.boardHeight) / 0.5);
  const mat = new THREE.MeshStandardMaterial({
    name: 'veil',
    map: createCherubimTexture({ w: 10, h: 10, ppc: 160, cols: 3, rows: 3, border: true, seed: 53 }),
    bumpMap: weave,
    bumpScale: 0.6,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'veil';
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Build the veil. Returns { mesh, goldParts, socketPositions (cubits, [x, z]), colliders }.
 * colliders is empty: the player can walk through the veil and its pillars into the Holy of
 * Holies (at the user's direction).
 * Gold parts merge into the tent's gold mesh; sockets join the boards' silver sockets.
 */
export function createVeil() {
  const zs = veilPillarZs();
  const px = V.x - V.pillarOffset, r = V.pillarRadius;
  const goldParts = [];
  for (const z of zs) {
    const topY = ceilingAt(z);
    const h = topY - T.socketHeight;
    goldParts.push(part(new THREE.CylinderGeometry(m(r), m(r), m(h), 14, 1, true), { pos: [m(px), m(T.socketHeight + h / 2), m(z)] }));
    // Gold hook on the east face holding the cloth's top edge.
    goldParts.push(part(new THREE.TorusGeometry(m(0.07), m(0.022), 4, 8, Math.PI), {
      pos: [m(px + r + 0.05), m(topY - V.topGap - 0.1), m(z)],
      rot: [0, Math.PI / 2, Math.PI],
    }));
  }
  return {
    mesh: clothMesh(),
    goldParts,
    socketPositions: zs.map((z) => [px, z]),
    colliders: [],
  };
}
