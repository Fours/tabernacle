import * as THREE from 'three';
import { TABERNACLE as T, m } from '../config/dimensions.js';
import { box, circle } from './colliders.js';
import { GOLD, GOLD_OVERLAY, SILVER, BRONZE, ROPE } from './materials.js';
import { part, merge } from './bronzeParts.js';
import { createEmbroideredScreenTextures } from './embroidery.js';
import { createCoverings, createLinenCeiling } from './tentCoverings.js';
import { createVeil } from './veil.js';
import { addGatheredDrape, clothGeometry } from './drape.js';

// Tabernacle tent (Ex 26; 36:8-38): boards, bars, entrance, plus the interior shell (linen
// ceiling, veil). The door stands open: no entrance pillars (see DOOR below). Dimensions in cubits from dimensions.js.
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

function buildBoardsAndSockets(group, veilSockets = []) {
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
  const sockMesh = new THREE.InstancedMesh(sockGeo, SILVER, boards.length * 2 + veilSockets.length);
  sockMesh.name = 'silver-sockets';
  sockMesh.receiveShadow = true;
  const c = new THREE.Color();
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  boards.forEach((b, i) => {
    const M = mat4(b.x, 0, b.z, b.rot);
    boardMesh.setMatrixAt(i, M);
    boardMesh.setColorAt(i, c.setScalar(0.96 + rnd() * 0.06));
    for (const k of [0, 1]) {
      const off = new THREE.Matrix4().makeTranslation(m((k - 0.5) * (BW / 2)), 0, 0);
      sockMesh.setMatrixAt(i * 2 + k, M.clone().multiply(off));
    }
  });
  // The veil pillars' silver sockets (Ex 26:32): same casting, scaled to a square footprint.
  const sx = T.veil.socket / (BW / 2 - 0.06), sz = T.veil.socket / (BT + 2 * T.socketProud);
  veilSockets.forEach(([x, z], i) => {
    sockMesh.setMatrixAt(boards.length * 2 + i, mat4(x, 0, z).multiply(new THREE.Matrix4().makeScale(sx, 1, sz)));
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

// ---- East door (Ex 26:36): beam, and the screen split, one half drawn, one tied back ---------
// Departure from Ex 26:37 at the user's direction: no entrance pillars. The south half (the
// left, seen from the courtyard) hangs drawn across to the middle; the north half is tied back.
// The cloth line runs N-S under the beam's centre; `off` is measured westward (into the tent).
const DOOR = {
  wall: { c: [m(T.doorBeam.x), 0], a: [0, 1], n: [-1, 0] },
  hangTop: m(T.screenTop) - 0.02, // cloth top, just under the hooks
  half: m(HW), // each half hangs from the centre to a side wall
  closedSide: 1, // +z (south): hangs straight across to the middle, no tie, walk-through
};
DOOR.hangH = DOOR.hangTop - m(T.screenHem);
// The cloth's v coordinate of the door texture's top blue band (canvas rows 14-20 of 965): the
// tie-back cords sample it so they share the screen material.
const DOOR_TEX_H = Math.round((1024 * (T.screenTop - T.screenHem)) / T.interiorWidth);
const DOOR_TIE_TEX_V = 1 - 17 / DOOR_TEX_H;
// Each half: 5 cubits of cloth gathered into ~0.55 m at the beam, cinched at the tie, flaring
// below it. Taller than the gate's panels, so more pleats and a deeper swag (drape.js).
const DOOR_SHAPE = {
  pleats: 9,
  cols: 150,
  rows: 90,
  wTop: 0.55, wTie: 0.2, swag: 0.42, flare: 0.75,
  aTop: 0.1, aTie: 0.05, aHem: 0.12,
  lift: 0.16, droop: 0.06, pinch: 0, outDrift: 0.012,
  // Cord round the bundle, through a gold staple on the board's inner face (along 0); knotted on
  // the east (courtyard) side, so the tassels show to someone approaching.
  loop: Array.from({ length: 12 }, (_, k) => {
    const a = (k / 12) * 2 * Math.PI;
    return [0.125 + 0.13 * Math.cos(a), 0.085 * Math.sin(a)];
  }),
  knot: [0.15, -0.095],
  cordR: 0.013,
  tasselLen: 0.36,
  collider: [0.14, 0],
};

/** Gold parts for the door: the beam, hooks under it holding the gathered cloth, tie staples. */
function doorGoldParts() {
  const B = T.doorBeam, parts = [];
  // Beam between the side walls' front boards, its ends let into them a little.
  parts.push(part(new THREE.BoxGeometry(m(B.depth), m(B.height), m(T.interiorWidth + 0.4)), {
    pos: [m(B.x), m(T.screenTop + B.height / 2), 0],
  }));
  const x = DOOR.wall.c[0];
  // Hooks across the drawn half, one every ~0.32 m from the wall to the middle.
  const nHooks = Math.round(DOOR.half / 0.32);
  for (let k = 0; k <= nHooks; k++) {
    const z = DOOR.closedSide * (DOOR.half - 0.04 - (k / nHooks) * (DOOR.half - 0.08));
    parts.push(part(new THREE.TorusGeometry(0.022, 0.006, 4, 10), { pos: [x, m(T.screenTop) - 0.02, z], rot: [0, Math.PI / 2, 0] }));
  }
  for (const side of [-1, 1]) {
    if (side === DOOR.closedSide) continue;
    // Hooks under the beam over the gathered top of the cloth.
    for (let k = 0; k < 6; k++) {
      const z = side * (DOOR.half - (0.04 + (k / 5) * (DOOR_SHAPE.wTop - 0.08)));
      parts.push(part(new THREE.TorusGeometry(0.022, 0.006, 4, 10), { pos: [x, m(T.screenTop) - 0.02, z], rot: [0, Math.PI / 2, 0] }));
    }
    // Staple on the board face that the tie-back cord runs through.
    // (A half ring bulging out of the face toward the opening.)
    const staple = new THREE.TorusGeometry(0.03, 0.007, 5, 10, Math.PI).rotateZ(Math.PI / 2).rotateY(-side * Math.PI / 2);
    parts.push(part(staple, { pos: [x, m(T.doorTieHeight), side * DOOR.half] }));
  }
  return parts;
}

/**
 * Append the drawn half of the door screen to `buf`: flat cloth hung from the hooks from the
 * side wall (along `sp`) to the middle, with soft vertical folds, slight scallops between the
 * hooks and a gently uneven hem. UVs as the tied halves (uvFn), so the embroidery lines up.
 */
function addHangingHalf(buf, sp, uvFn) {
  const { hangTop, hangH } = DOOR;
  const [cx] = DOOR.wall.c;
  const cols = 120, rows = 40, hookGap = 0.32;
  const base = buf.pos.length / 3;
  const zWall = sp - Math.sign(sp) * 0.02, zMid = 0; // leading edge at the doorway's middle
  for (let j = 0; j <= rows; j++) {
    const t = j / rows; // 0 top .. 1 hem
    for (let i = 0; i <= cols; i++) {
      const u = i / cols; // 0 at the wall .. 1 leading edge
      const z = zWall + (zMid - zWall) * u;
      const d = Math.abs(sp - z);
      const scallop = Math.abs(Math.sin((Math.PI * d) / hookGap));
      // Folds: deeper toward the hem, damped at the wall; the free edge curls in a little.
      const amp = 0.055 * (0.45 + 0.55 * t) * Math.min(1, d / 0.25);
      const fold = amp * (0.6 * Math.sin((2 * Math.PI * d) / 0.62 + 0.4 + 0.3 * t)
        + 0.4 * Math.sin((2 * Math.PI * d) / 1.45 + 1.7)) + 0.03 * Math.pow(u, 6) * t;
      const y = hangTop - t * hangH - 0.02 * scallop * (1 - t) - 0.012 * Math.sin(9 * d + 1.3) * Math.pow(t, 4);
      buf.pos.push(cx - fold, y, z);
      const [uu, vv] = uvFn(z, 1 - t);
      buf.uv.push(uu, vv);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      buf.idx.push(a, c, b, b, c, d);
    }
  }
}

/** The embroidered door screen, split in the middle: one half drawn across, one tied back. */
function doorScreen() {
  const buf = { pos: [], uv: [], idx: [] };
  const W = 2 * DOOR.half;
  // u runs left to right as seen from outside (east): +z -> -z, as before the split.
  const uvFn = (s, vv) => [(DOOR.half - s) / W, vv];
  const opts = {
    ...DOOR_SHAPE,
    hangTop: DOOR.hangTop, hangH: DOOR.hangH, tieY: m(T.doorTieHeight),
    clothOffset: 0, clothW: DOOR.half, tieTexV: DOOR_TIE_TEX_V,
  };
  addHangingHalf(buf, DOOR.closedSide * DOOR.half, uvFn);
  const ties = [-DOOR.closedSide].map((side) => {
    const sp = side * DOOR.half;
    const [al, off] = addGatheredDrape(buf, DOOR.wall, sp, uvFn, opts);
    return [DOOR.wall.c[0] - off, sp - side * al];
  });
  const tex = createEmbroideredScreenTextures({ design: 'door', width: 1024, height: DOOR_TEX_H });
  const mat = new THREE.MeshStandardMaterial({
    name: 'tent-screen',
    map: tex.map,
    bumpMap: tex.bumpMap,
    bumpScale: 0.6,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(clothGeometry(buf), mat);
  mesh.name = 'door-screen';
  mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, ties };
}

export function createTabernacle() {
  const group = new THREE.Group();
  group.name = 'tabernacle';

  const veil = createVeil();
  buildBoardsAndSockets(group, veil.socketPositions);

  const ceiling = createLinenCeiling();
  group.add(ceiling.mesh, veil.mesh);

  const goldMesh = new THREE.Mesh(merge([...barParts(), ...doorGoldParts(), ...veil.goldParts, ...ceiling.goldParts]), GOLD);
  goldMesh.name = 'gold-bars-rings-door-beam-veil-clasps';
  goldMesh.castShadow = goldMesh.receiveShadow = true;
  group.add(goldMesh);

  const door = doorScreen();
  group.add(door.mesh);

  const cov = createCoverings();
  group.add(cov.group);

  const bronzeMesh = new THREE.Mesh(merge(cov.bronzeParts), BRONZE);
  bronzeMesh.name = 'bronze-clasps-stakes';
  group.add(bronzeMesh);
  const ropeMesh = new THREE.Mesh(merge(cov.ropeParts), ROPE);
  ropeMesh.name = 'tent-cords';
  group.add(ropeMesh);

  // Colliders: the side and west walls with the slanted coverings out to their furthest stakes,
  // the front corners' diagonal stakes, the tied-back door cloth at the north side of the
  // opening, and the veil. The drawn south half has none: the player can walk through it.
  const { xE, zN, zS } = cov.rect;
  const fp = cov.footprint;
  const pad = 0.4;
  const x0 = fp.minX - pad, x1 = xE + 0.8, xF = fp.maxX + pad;
  const z0 = fp.minZ - pad, z1 = fp.maxZ + pad;
  const zIn = T.centerZ - HW, zIs = T.centerZ + HW; // interior faces of the side walls
  const span = (a, b) => [m((a + b) / 2), m(b - a)];
  const boxAB = (xa, xb, za, zb) => {
    const [cx, sx] = span(xa, xb), [cz, sz] = span(za, zb);
    return box(cx, cz, sx, sz);
  };
  const colliders = [
    boxAB(x0, x1, z0, zIn),
    boxAB(x0, x1, zIs, z1),
    boxAB(x0, T.interiorMinX, z0, z1),
    boxAB(x1, xF, z0, zN),
    boxAB(x1, xF, zS, z1),
    ...door.ties.map(([x, z]) => circle(x, z, 0.2)),
    ...veil.colliders,
  ];
  group.userData.colliders = colliders;
  // Ground kept free of rocks and scrub: the whole tent, floor included, out to its stakes.
  group.userData.groundKeepOut = [boxAB(x0, xF, z0, z1)];
  // Interior meshes main.js hides while the camera is outside the tent.
  group.userData.interior = [veil.mesh];
  return group;
}
