import * as THREE from 'three';
import { TABERNACLE as T, m } from '../config/dimensions.js';
import { box } from './colliders.js';
import { GOLD, GOLD_OVERLAY, SILVER, BRONZE, ROPE } from './materials.js';
import { part, merge } from './bronzeParts.js';
import { createLinenTexture, createEmbroideredScreenTexture } from './textiles.js';
import { createCoverings } from './tentCoverings.js';

// Tabernacle tent exterior (Ex 26; 36:8-38). Dimensions in cubits from dimensions.js.
// Interior spans x = interiorMinX..interiorMaxX, z = centerZ ± interiorWidth/2; the boards
// stand outside that box (1 cubit thick). East (+X) is the entrance.

const HW = T.interiorWidth / 2;
const BT = T.boardThickness;
const BW = T.boardWidth;
const H = T.boardHeight;

/** Board placements (cubits): {x, z, rotY, out:[nx, nz]} at each board's center. */
function boardPlacements() {
  const out = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < T.sideBoards; i++) {
      out.push({ x: T.interiorMinX + BW * (i + 0.5), z: T.centerZ + side * (HW + BT / 2), rot: 0, n: [0, side] });
    }
  }
  // West wall: 6 boards plus 2 corner boards, covering the side walls' ends.
  const nW = T.westBoards + T.cornerBoards;
  for (let i = 0; i < nW; i++) {
    out.push({ x: T.interiorMinX - BT / 2, z: T.centerZ - (nW * BW) / 2 + BW * (i + 0.5), rot: Math.PI / 2, n: [-1, 0] });
  }
  return out;
}

const mat4 = (x, y, z, rotY = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(m(x), m(y), m(z)),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(1, 1, 1),
  );

function buildBoardsAndSockets(group) {
  const boards = boardPlacements();
  const boardGeo = new THREE.BoxGeometry(m(BW - T.boardGap), m(H), m(BT));
  boardGeo.translate(0, m(H / 2), 0);
  const boardMesh = new THREE.InstancedMesh(boardGeo, GOLD_OVERLAY, boards.length);
  boardMesh.name = 'boards';
  boardMesh.castShadow = boardMesh.receiveShadow = true;
  // Square frustum (slightly narrower at the top) so neighbouring sockets read separately.
  const sockGeo = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.9, Math.SQRT1_2, 1, 4, 1).toNonIndexed();
  sockGeo.rotateY(Math.PI / 4);
  sockGeo.computeVertexNormals();
  sockGeo.scale(m(BW / 2 - 0.06), m(T.socketHeight), m(BT + 2 * T.socketProud));
  sockGeo.translate(0, m(T.socketHeight / 2), 0);
  const sockMesh = new THREE.InstancedMesh(sockGeo, SILVER, boards.length * 2);
  sockMesh.name = 'silver-sockets';
  sockMesh.receiveShadow = true;
  const c = new THREE.Color();
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  boards.forEach((b, i) => {
    const M = mat4(b.x, 0, b.z, b.rot);
    boardMesh.setMatrixAt(i, M);
    boardMesh.setColorAt(i, c.setScalar(0.9 + rnd() * 0.16));
    for (const k of [0, 1]) {
      const off = new THREE.Matrix4().makeTranslation(m((k - 0.5) * (BW / 2)), 0, 0);
      sockMesh.setMatrixAt(i * 2 + k, M.clone().multiply(off));
    }
  });
  group.add(boardMesh, sockMesh);
}

/** Bars (5 per wall) and their gold rings, as mergeable parts. */
function barParts() {
  const parts = [];
  const r = T.barRadius, ringR = r + 0.06;
  const walls = [
    // along: axis 'x' or 'z'; a0..a1 range; fixed coordinate of the bar line.
    { axis: 'x', a0: T.interiorMinX, a1: T.interiorMaxX, fixed: T.centerZ - HW - BT - T.barOffset, face: T.centerZ - HW - BT, boards: T.sideBoards },
    { axis: 'x', a0: T.interiorMinX, a1: T.interiorMaxX, fixed: T.centerZ + HW + BT + T.barOffset, face: T.centerZ + HW + BT, boards: T.sideBoards },
    { axis: 'z', a0: T.centerZ - HW - BT, a1: T.centerZ + HW + BT, fixed: T.interiorMinX - BT - T.barOffset, face: T.interiorMinX - BT, boards: T.westBoards + T.cornerBoards },
  ];
  const at = (w, a, y) => (w.axis === 'x' ? [m(a), m(y), m(w.fixed)] : [m(w.fixed), m(y), m(a)]);
  const barRot = (w) => (w.axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  const ringRot = (w) => (w.axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0]);
  for (const w of walls) {
    const L = w.a1 - w.a0, inset = 0.15, gap = 0.1;
    T.barHeights.forEach((y, row) => {
      const segs = row === 1 ? [[w.a0 + inset, w.a1 - inset]] : [[w.a0 + inset, w.a0 + L / 2 - gap / 2], [w.a0 + L / 2 + gap / 2, w.a1 - inset]];
      for (const [s0, s1] of segs) {
        parts.push(part(new THREE.CylinderGeometry(m(r), m(r), m(s1 - s0), 10), { pos: at(w, (s0 + s1) / 2, y), rot: barRot(w) }));
        // End caps.
        for (const e of [s0, s1]) parts.push(part(new THREE.SphereGeometry(m(r), 8, 6), { pos: at(w, e, y) }));
      }
      // Rings: one per board on the top and bottom rows, every other board on the middle row.
      const pitch = L / w.boards;
      for (let i = 0; i < w.boards; i++) {
        if (row === 1 && i % 2) continue;
        const a = w.a0 + pitch * (i + 0.5);
        parts.push(part(new THREE.TorusGeometry(m(ringR), m(T.ringTube), 5, 12), { pos: at(w, a, y), rot: ringRot(w) }));
        // Staple from the ring back to the board face.
        const d = Math.abs(w.fixed - w.face) - ringR;
        const mid = w.face + Math.sign(w.fixed - w.face) * (d / 2);
        const sz = [m(0.07), m(0.1), m(d)];
        const g = new THREE.BoxGeometry(...(w.axis === 'x' ? sz : [sz[2], sz[1], sz[0]]));
        parts.push(part(g, { pos: w.axis === 'x' ? [m(a), m(y), m(mid)] : [m(mid), m(y), m(a)] }));
      }
    });
  }
  return parts;
}

/** Entrance pillar z positions (cubits): evenly across the opening, ends at the side walls. */
const pillarZs = () =>
  Array.from({ length: T.entrancePillars }, (_, i) => T.centerZ - HW + (i * T.interiorWidth) / (T.entrancePillars - 1));

/** Entrance pillars: gold parts (shaft, capital, band, hooks, fillets) and bronze sockets. */
function entranceParts() {
  const gold = [], bronze = [];
  const x = T.entrancePillarX, r = T.entrancePillarRadius, s = T.entranceSocket;
  const capH = T.entranceCapitalHeight, capY = H - capH;
  const zs = pillarZs();
  for (const z of zs) {
    bronze.push(part(new THREE.BoxGeometry(m(s), m(T.socketHeight), m(s)), { pos: [m(x), m(T.socketHeight / 2), m(z)] }));
    const shaftH = capY - T.socketHeight;
    gold.push(part(new THREE.CylinderGeometry(m(r), m(r), m(shaftH), 14, 1, true), { pos: [m(x), m(T.socketHeight + shaftH / 2), m(z)] }));
    gold.push(part(new THREE.CylinderGeometry(m(r + 0.1), m(r), m(capH), 14), { pos: [m(x), m(capY + capH / 2), m(z)] }));
    gold.push(part(new THREE.TorusGeometry(m(r + 0.02), m(0.04), 5, 14), { pos: [m(x), m(capY), m(z)], rot: [Math.PI / 2, 0, 0] }));
    gold.push(part(new THREE.TorusGeometry(m(r + 0.02), m(0.04), 5, 14), { pos: [m(x), m(T.socketHeight + 0.15), m(z)], rot: [Math.PI / 2, 0, 0] }));
    // Hook on the inner (west) side holding the screen.
    gold.push(part(new THREE.TorusGeometry(m(0.07), m(0.022), 4, 8, Math.PI), { pos: [m(x - r - 0.04), m(T.screenTop), m(z)], rot: [0, Math.PI / 2, Math.PI] }));
  }
  // Gold fillets (Ex 36:38) joining the capitals.
  for (let i = 0; i < zs.length - 1; i++) {
    const L = zs[i + 1] - zs[i];
    gold.push(part(new THREE.CylinderGeometry(m(0.05), m(0.05), m(L), 6), { pos: [m(x), m(H - 0.12), m((zs[i] + zs[i + 1]) / 2)], rot: [Math.PI / 2, 0, 0] }));
  }
  return { gold, bronze };
}

/** Embroidered entrance screen hung from the pillars' hooks, sagging slightly between them. */
function screenMesh() {
  const zs = pillarZs();
  const x0 = T.entrancePillarX - T.entrancePillarRadius - 0.08;
  const top = T.screenTop, hem = T.screenHem, Hh = top - hem;
  const z0 = zs[0], z1 = zs[zs.length - 1], W = z1 - z0;
  const cols = 160, rows = 12, sag = 0.07;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (let i = 0; i <= cols; i++) {
      const z = z0 + (W * i) / cols;
      let k = 0;
      while (k < zs.length - 2 && z > zs[k + 1]) k++;
      const bell = Math.sin((Math.PI * (z - zs[k])) / (zs[k + 1] - zs[k]));
      const amp = 0.035 * (0.3 + 0.7 * bell) * (0.85 + 0.3 * t);
      const fold = amp * (0.65 * Math.sin((2 * Math.PI * z) / 0.6 + 0.7) + 0.35 * Math.sin((2 * Math.PI * z) / 1.4 + 2.1));
      const y = top - t * Hh - sag * bell * (1 - 0.6 * t);
      pos.push(m(x0 - 0.04 - fold), m(y), m(z));
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
  weave.repeat.set(m(W) / 0.5, m(Hh) / 0.5);
  const mat = new THREE.MeshStandardMaterial({
    name: 'tent-screen',
    map: createEmbroideredScreenTexture({ width: 1024, height: 1024, panels: zs.length - 1, rows: 3 }),
    bumpMap: weave,
    bumpScale: 0.6,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'entrance-screen';
  mesh.receiveShadow = true;
  return mesh;
}

export function createTabernacle() {
  const group = new THREE.Group();
  group.name = 'tabernacle';

  buildBoardsAndSockets(group);

  const ent = entranceParts();
  const goldMesh = new THREE.Mesh(merge([...barParts(), ...ent.gold]), GOLD);
  goldMesh.name = 'gold-bars-rings-pillars';
  goldMesh.castShadow = goldMesh.receiveShadow = true;
  group.add(goldMesh);

  group.add(screenMesh());

  const cov = createCoverings();
  group.add(cov.group);

  const bronzeMesh = new THREE.Mesh(merge([...ent.bronze, ...cov.bronzeParts]), BRONZE);
  bronzeMesh.name = 'bronze-sockets-clasps-pins';
  group.add(bronzeMesh);
  const ropeMesh = new THREE.Mesh(merge(cov.ropeParts), ROPE);
  ropeMesh.name = 'tent-cords';
  group.add(ropeMesh);

  // Colliders: the draped body (boards + hanging coverings) and the entrance (screen,
  // pillars, front flap). Pins and cords don't collide (as in the courtyard).
  const { xW, xE, zN, zS } = cov.rect;
  const so = cov.standOut;
  const ex = T.interiorMaxX;
  const colliders = [
    box(m((xW - so + ex) / 2), m((zN + zS) / 2), m(ex - (xW - so)), m(zS - zN + 2 * so)),
    box(m((ex + xE + so) / 2), m((zN + zS) / 2), m(xE + so - ex), m(zS - zN + 2 * so)),
  ];
  group.userData.colliders = colliders;
  return group;
}
