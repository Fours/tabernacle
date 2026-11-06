import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURTYARD as C, m } from '../config/dimensions.js';
import { box, circle } from './colliders.js';
import { ACACIA, BRONZE, SILVER, ROPE, COLORS, addMacroVariation } from './materials.js';
import { createLinenTexture } from './textiles.js';
import { createEmbroideredScreenTextures } from './embroidery.js';
import { addGatheredDrape, clothGeometry } from './drape.js';
import { addCloth, addWindShadow, pushWind } from './cloth.js';
import { aoBox, aoCircle, aoSegment, addBoxAO } from './ao.js';
import { addBronzeWear, addSilverWear, addWoodGrain } from './metalWear.js';

// Courtyard enclosure (Ex 27:9-19; 38:9-20): pillars on bronze sockets with silver capitals,
// hooks and fillets; fine linen hangings hung on the inner side of the pillar line; the
// embroidered east gate screen; bronze pegs and cords staking each pillar outward.

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

// ---- Derived sizes (meters) ------------------------------------------------------------
const PR = m(C.pillarDiameter / 2); // shaft radius
const SHAFT_TOP = m(C.pillarHeight);
const SLEEVE_R = PR * 1.1; // silver overlay radius
const SLEEVE_H = m(C.capitalSleeve);
const CAP_H = m(C.capitalHeight);
const SOCKET_W = m(C.socketWidth), SOCKET_H = m(C.socketHeight);
// Hook: stem out from the sleeve, then a J-curve opening upward. Local +X = outward.
const HOOK_STEM = 0.07, HOOK_R = 0.028, HOOK_TUBE = 0.01;
const HOOK_REACH = HOOK_STEM + HOOK_R; // from sleeve surface to bowl centre
const HANG_H = m(C.hangingHeight);
const HANG_TOP = HANG_H + m(C.hangingClearance); // top edge at the hooks
const HOOK_Y = HANG_TOP + HOOK_R - 0.006; // hook attach height (bowl bottom ~ cloth top)
const CLOTH_OFFSET = SLEEVE_R + HOOK_REACH; // cloth plane, inward from the pillar line
const FILLET_Y = SHAFT_TOP - 0.035;
const CORD_HOOK_Y = HOOK_Y - 0.05;
const GATE_OPEN = m(C.gateOpenHalf); // the middle gate posts stand at z = +/-GATE_OPEN
const TIE_Y = m(C.gateTieHeight);
// v coordinate of the gate texture's plain purple border band (canvas rows 74-81 of 512):
// the tie-back cords sample it so they share the gate material.
const TIE_TEX_V = 1 - 77.5 / 512;
// Wind billow amplitude (m) of a hanging at mid-span and mid-height (cloth.js); none at the
// hooks, the pillars and the pegged hem.
const HANG_WIND = 0.045;
// The gate drapes' hems below the tie (drape.js).
const DRAPE_WIND = 0.03;

function pillarGeometries() {
  // Bronze socket: square block with a stepped top and a collar around the shaft foot.
  const sock = [
    new THREE.BoxGeometry(SOCKET_W, SOCKET_H * 0.78, SOCKET_W).translate(0, SOCKET_H * 0.39, 0),
    new THREE.BoxGeometry(SOCKET_W * 0.82, SOCKET_H * 0.22, SOCKET_W * 0.82).translate(0, SOCKET_H * 0.89, 0),
    new THREE.CylinderGeometry(PR * 1.25, PR * 1.4, 0.03, 16).translate(0, SOCKET_H + 0.015, 0),
  ];
  // Acacia shaft (slight taper), from socket to the capital.
  const shaftH = SHAFT_TOP - SOCKET_H;
  const shaft = new THREE.CylinderGeometry(PR * 0.95, PR, shaftH, 16).translate(0, SOCKET_H + shaftH / 2, 0);
  // Silver-overlaid capital: sleeve down the shaft, bead, flared top, abacus and knob.
  const T = SHAFT_TOP;
  const cap = [
    new THREE.CylinderGeometry(SLEEVE_R, SLEEVE_R, SLEEVE_H, 16).translate(0, T - SLEEVE_H / 2, 0),
    new THREE.TorusGeometry(SLEEVE_R, 0.008, 6, 20).rotateX(Math.PI / 2).translate(0, T - SLEEVE_H, 0),
    new THREE.TorusGeometry(SLEEVE_R, 0.007, 6, 20).rotateX(Math.PI / 2).translate(0, T - 0.012, 0),
    new THREE.CylinderGeometry(PR * 1.55, SLEEVE_R, CAP_H * 0.4, 16).translate(0, T + CAP_H * 0.2, 0),
    new THREE.CylinderGeometry(PR * 1.55, PR * 1.55, CAP_H * 0.15, 16).translate(0, T + CAP_H * 0.475, 0),
    new THREE.SphereGeometry(PR * 0.85, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2)
      .scale(1, (CAP_H * 0.45) / (PR * 0.85), 1)
      .translate(0, T + CAP_H * 0.55, 0),
  ];
  // Hook: stem along +X, J-bend (lower half-torus) and a short upturned tip.
  const hook = [
    new THREE.CylinderGeometry(HOOK_TUBE, HOOK_TUBE, HOOK_STEM, 6).rotateZ(Math.PI / 2).translate(HOOK_STEM / 2, 0, 0),
    new THREE.TorusGeometry(HOOK_R, HOOK_TUBE, 6, 10, Math.PI).rotateZ(Math.PI).translate(HOOK_STEM + HOOK_R, 0, 0),
    new THREE.CylinderGeometry(HOOK_TUBE * 0.9, HOOK_TUBE * 0.6, 0.014, 6).translate(HOOK_STEM + 2 * HOOK_R, 0.007, 0),
  ];
  return {
    socket: mergeGeometries(sock.map((g) => g.toNonIndexed())),
    shaft,
    capital: mergeGeometries(cap.map((g) => g.toNonIndexed())),
    hook: mergeGeometries(hook.map((g) => g.toNonIndexed())),
  };
}

/**
 * Walls: centre point, along-axis a, inward normal n (XZ), half-length (m) and pillar
 * along-coordinates (m). Cloth ranges exclude the gate on the east wall.
 */
function walls() {
  const hx = m(C.length / 2), hz = m(C.width / 2), s = m(C.pillarSpacing);
  const coords = (half) => {
    const out = [];
    for (let v = -half; v <= half + 1e-6; v += s) out.push(v);
    return out;
  };
  const gw = m(C.gateWidth) / 2;
  return [
    { name: 'north', c: [0, -hz], a: [1, 0], n: [0, 1], half: hx, pillars: coords(hx) },
    { name: 'south', c: [0, hz], a: [1, 0], n: [0, -1], half: hx, pillars: coords(hx) },
    { name: 'west', c: [-hx, 0], a: [0, 1], n: [1, 0], half: hz, pillars: coords(hz) },
    // No middle gate post at z = 0 (artistic license: the gate stands open).
    { name: 'east', c: [hx, 0], a: [0, 1], n: [-1, 0], half: hz, pillars: coords(hz).filter((v) => Math.abs(v) > 1e-6), gate: [-gw, gw] },
  ];
}

/**
 * Append a hanging between along-coords s0..s1 of a wall to `buf`. Hung from hooks at both
 * ends: the top edge sags between them, with vertical folds (function of the world
 * along-coordinate so adjacent spans join without seams).
 */
function addClothSpan(buf, wall, s0, s1, uvFn) {
  const len = s1 - s0;
  const cols = Math.max(4, Math.round(len / 0.045));
  const rows = 10;
  const sag = m(C.hangingSag);
  const [cx, cz] = wall.c, [ax, az] = wall.a, [nx, nz] = wall.n;
  const base = buf.pos.length / 3;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows; // 0 top .. 1 hem
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const s = s0 + u * len;
      const bell = Math.sin(Math.PI * u);
      const amp = 0.022 * (0.3 + 0.7 * bell) * (0.85 + 0.35 * t);
      const fold = amp * (0.65 * Math.sin((2 * Math.PI * s) / 0.3 + 0.7) + 0.35 * Math.sin((2 * Math.PI * s) / 0.71 + 2.1));
      // Slight inward billow low on the cloth, mid-span.
      const off = CLOTH_OFFSET + fold + 0.012 * bell * t;
      const y = HANG_TOP - t * HANG_H - sag * bell * (1 - 0.65 * t);
      buf.pos.push(cx + ax * s + nx * off, y, cz + az * s + nz * off);
      const [uu, vv] = uvFn(s, 1 - t);
      buf.uv.push(uu, vv);
      // Wind: sin(pi u) sin(pi t) billow and its gradient (along the wall and in height).
      const st = Math.sin(Math.PI * t);
      const dws = ((HANG_WIND * Math.PI) / len) * Math.cos(Math.PI * u) * st;
      const dwy = -((HANG_WIND * Math.PI) / HANG_H) * bell * Math.cos(Math.PI * t);
      pushWind(buf, [nx, 0, nz], HANG_WIND * bell * st, [ax * dws, dwy, az * dws]);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      buf.idx.push(a, c, b, b, c, d);
    }
  }
}

/** Add cloth spans for along-range [r0, r1] of a wall, splitting at pillars (hook points). */
function addClothRange(buf, wall, r0, r1, uvFn) {
  const stops = [r0, ...wall.pillars.filter((p) => p > r0 + 1e-6 && p < r1 - 1e-6), r1];
  for (let k = 0; k < stops.length - 1; k++) addClothSpan(buf, wall, stops[k], stops[k + 1], uvFn);
}

export function createCourtyard() {
  const group = new THREE.Group();
  group.name = 'courtyard';
  const colliders = [];
  const geo = pillarGeometries();

  // ---- Pillars: socket / shaft / capital as three InstancedMeshes -------------------------
  const all = pillarPositions();
  if (all.length !== C.pillarCount) console.warn(`Expected ${C.pillarCount} pillars, got ${all.length}`);
  // The middle gate post (east wall, z = 0) is left out so the gate stands open.
  const pts = all.filter(([x, z]) => !(Math.abs(x - C.length / 2) < 1e-6 && Math.abs(z) < 1e-6));
  const mats = pillarMaterials();
  const sockets = new THREE.InstancedMesh(geo.socket, mats.socket, pts.length);
  const shafts = new THREE.InstancedMesh(geo.shaft, mats.shaft, pts.length);
  const capitals = new THREE.InstancedMesh(geo.capital, mats.capital, pts.length);
  const aoShapes = [];
  sockets.name = 'pillar-sockets';
  shafts.name = 'pillar-shafts';
  capitals.name = 'pillar-capitals';
  const M = new THREE.Matrix4();
  pts.forEach(([x, z], i) => {
    M.makeTranslation(m(x), 0, m(z));
    sockets.setMatrixAt(i, M);
    shafts.setMatrixAt(i, M);
    capitals.setMatrixAt(i, M);
    colliders.push(circle(m(x), m(z), (SOCKET_W / 2) * 1.1));
    // Contact AO: tight round the socket, broad and faint from the tall pillar.
    aoShapes.push(aoBox(m(x), m(z), SOCKET_W, SOCKET_W, 0.35, 0.7), aoCircle(m(x), m(z), PR, 0.9, 0.18));
  });
  for (const im of [sockets, shafts, capitals]) im.castShadow = im.receiveShadow = true;
  group.add(sockets, shafts, capitals);

  // ---- Hangings, gate screen, fillets, hooks ---------------------------------------------
  const linenBuf = { pos: [], uv: [], idx: [], wind: [], windG: [] };
  const gateBuf = { pos: [], uv: [], idx: [], wind: [], windG: [] };
  const fillets = []; // [x0,z0,x1,z1]
  const hookMats = [];
  const hx = m(C.length / 2), hz = m(C.width / 2);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const hookAt = (x, z, dirX, dirZ, y, stretch = 1) => {
    // Hook local +X -> (dirX, dirZ); positioned on the sleeve surface.
    q.setFromAxisAngle(Y, Math.atan2(-dirZ, dirX));
    v.set(x + dirX * SLEEVE_R * 0.97, y, z + dirZ * SLEEVE_R * 0.97);
    sc.set(stretch, 1, 1);
    hookMats.push(new THREE.Matrix4().compose(v.clone(), q.clone(), sc.clone()));
  };
  const linenUV = (s, vv) => [s / 0.5, (vv * HANG_H) / 0.5];

  for (const w of walls()) {
    const [cx, cz] = w.c, [ax, az] = w.a, [nx, nz] = w.n;
    const at = (s) => [cx + ax * s, cz + az * s];
    // Cloth ends at the crossing with the neighbouring wall's cloth at each corner.
    const r0 = -w.half + CLOTH_OFFSET, r1 = w.half - CLOTH_OFFSET;
    if (w.gate) {
      const [g0, g1] = w.gate;
      addClothRange(linenBuf, w, r0, g0, linenUV);
      addClothRange(linenBuf, w, g1, r1, linenUV);
      // Gate screen: u runs left->right as seen from outside (east), i.e. +z -> -z.
      // Outer panels hang as before; the two middle panels are drawn aside and tied back.
      const gateUV = (s, vv) => [(g1 - s) / (g1 - g0), vv];
      addClothRange(gateBuf, w, g0, -GATE_OPEN, gateUV);
      addClothRange(gateBuf, w, GATE_OPEN, g1, gateUV);
      for (const sp of [-GATE_OPEN, GATE_OPEN]) {
        // One middle panel drawn aside: gathered against the post at sp, tied back (drape.js).
        const [al, off] = addGatheredDrape(gateBuf, w, sp, gateUV, {
          hangTop: HANG_TOP, hangH: HANG_H, tieY: TIE_Y, clothOffset: CLOTH_OFFSET, tieTexV: TIE_TEX_V, windAmp: DRAPE_WIND,
        });
        const [px, pz] = at(sp - Math.sign(sp) * al);
        colliders.push(circle(px + nx * off, pz + nz * off, 0.17)); // gathered cloth
        aoShapes.push(aoCircle(px + nx * off, pz + nz * off, 0.1, 0.35, 0.45));
      }
      // Hanging colliders exclude the gate (screen is passable; gate pillars collide).
      for (const [a0, a1] of [[-w.half, g0], [g1, w.half]]) {
        const [mx, mz] = at((a0 + a1) / 2);
        const l = a1 - a0;
        colliders.push(box(mx + nx * CLOTH_OFFSET / 2, mz + nz * CLOTH_OFFSET / 2,
          Math.abs(ax) * l + Math.abs(nx) * (CLOTH_OFFSET + 0.12),
          Math.abs(az) * l + Math.abs(nz) * (CLOTH_OFFSET + 0.12)));
      }
    } else {
      addClothRange(linenBuf, w, r0, r1, linenUV);
      const [mx, mz] = at(0);
      const l = 2 * w.half;
      colliders.push(box(mx + nx * CLOTH_OFFSET / 2, mz + nz * CLOTH_OFFSET / 2,
        Math.abs(ax) * l + Math.abs(nx) * (CLOTH_OFFSET + 0.12),
        Math.abs(az) * l + Math.abs(nz) * (CLOTH_OFFSET + 0.12)));
    }
    // Contact AO along the hem (3 cm above the sand), where cloth hangs: all but the open gate.
    const hem = (a0, a1) => {
      const [x0, z0] = at(a0), [x1, z1] = at(a1);
      aoShapes.push(aoSegment(x0 + nx * CLOTH_OFFSET, z0 + nz * CLOTH_OFFSET, x1 + nx * CLOTH_OFFSET, z1 + nz * CLOTH_OFFSET, 0.02, 0.5, 0.42));
    };
    if (w.gate) {
      hem(r0, -GATE_OPEN);
      hem(GATE_OPEN, r1);
    } else hem(r0, r1);
    // Fillets join each pair of adjacent pillars on this wall.
    for (let k = 0; k < w.pillars.length - 1; k++) fillets.push([...at(w.pillars[k]), ...at(w.pillars[k + 1])]);
    // Inner hooks (cloth side). Corner pillars get one diagonal hook, added once below.
    for (const s of w.pillars) {
      if (Math.abs(Math.abs(s) - w.half) < 1e-6) continue;
      const [px, pz] = at(s);
      hookAt(px, pz, nx, nz, HOOK_Y);
    }
  }
  // Corner hooks reach diagonally to where the two hangings cross.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const reach = Math.SQRT2 * CLOTH_OFFSET - SLEEVE_R;
    hookAt(sx * hx, sz * hz, -sx * Math.SQRT1_2, -sz * Math.SQRT1_2, HOOK_Y, reach / HOOK_REACH);
  }

  const linen = new THREE.MeshStandardMaterial({
    name: 'linen',
    color: COLORS.linen,
    map: createLinenTexture(),
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  linen.bumpMap = linen.map;
  linen.bumpScale = 0.6;
  // Slightly uneven bleaching between panels, and desert dust soaking up the lower hem.
  addMacroVariation(linen, { scale: 0.18, amount: 0.07, dust: 0.3, dustHeight: 0.7, tint: [1.0, 0.97, 0.92] });
  // Fine linen: firelight shows through it; a soft fibre sheen; billows in the wind.
  addCloth(linen, { transmission: 0.35, sheen: 0.35, sheenRoughness: 0.5, wind: true });
  const hangings = new THREE.Mesh(clothGeometry(linenBuf), linen);
  hangings.name = 'hangings';
  addWindShadow(hangings);
  hangings.castShadow = hangings.receiveShadow = true;
  group.add(hangings);

  const gateTex = createEmbroideredScreenTextures({ design: 'gate', width: 2048, height: 512 });
  const gateMat = new THREE.MeshStandardMaterial({
    name: 'gate-screen',
    map: gateTex.map,
    bumpMap: gateTex.bumpMap,
    bumpScale: 0.6,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  addMacroVariation(gateMat, { scale: 0.2, amount: 0.05, dust: 0.3, dustHeight: 0.7 });
  // Embroidered linen, denser than the plain hangings: a little less light through it.
  addCloth(gateMat, { transmission: 0.3, sheen: 0.3, sheenRoughness: 0.5, wind: true });
  const gate = new THREE.Mesh(clothGeometry(gateBuf), gateMat);
  gate.name = 'gate-screen'; // non-colliding (Decisions log)
  addWindShadow(gate);
  gate.castShadow = gate.receiveShadow = true;
  group.add(gate);

  // Silver fillets: rods between capitals (unit cylinder along X, scaled per span).
  const filletGeo = new THREE.CylinderGeometry(m(C.filletDiameter / 2), m(C.filletDiameter / 2), 1, 8)
    .rotateZ(Math.PI / 2);
  const filletMesh = new THREE.InstancedMesh(filletGeo, SILVER, fillets.length);
  filletMesh.name = 'fillets';
  fillets.forEach(([x0, z0, x1, z1], i) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    q.setFromAxisAngle(Y, Math.atan2(-(z1 - z0), x1 - x0));
    M.compose(v.set((x0 + x1) / 2, FILLET_Y, (z0 + z1) / 2), q, sc.set(len, 1, 1));
    filletMesh.setMatrixAt(i, M);
  });
  group.add(filletMesh);

  // ---- Bronze pegs and cords: each pillar staked outward ---------------------------------
  const pegGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.013, 0.004, 0.3, 8).translate(0, -0.03, 0),
    new THREE.CylinderGeometry(0.026, 0.02, 0.025, 10).translate(0, 0.125, 0),
    new THREE.TorusGeometry(0.016, 0.005, 5, 10).rotateX(Math.PI / 2).translate(0, 0.095, 0),
  ].map((g) => g.toNonIndexed()));
  const cordGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 5);
  const pegs = new THREE.InstancedMesh(pegGeo, BRONZE, pts.length);
  const cords = new THREE.InstancedMesh(cordGeo, ROPE, pts.length);
  pegs.name = 'pegs';
  cords.name = 'cords';
  const pegDist = m(C.pegDistance), tilt = THREE.MathUtils.degToRad(22);
  const axis = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  pts.forEach(([xc, zc], i) => {
    const x = m(xc), z = m(zc);
    // Outward direction: wall normal(s) away from the courtyard (diagonal at corners).
    let ox = Math.abs(Math.abs(x) - hx) < 1e-6 ? Math.sign(x) : 0;
    let oz = Math.abs(Math.abs(z) - hz) < 1e-6 ? Math.sign(z) : 0;
    const ol = Math.hypot(ox, oz);
    ox /= ol;
    oz /= ol;
    hookAt(x, z, ox, oz, CORD_HOOK_Y);
    // Peg in the ground, top leaning away from the pillar.
    const px = x + ox * pegDist, pz = z + oz * pegDist;
    axis.set(oz, 0, -ox).normalize();
    q.setFromAxisAngle(axis, tilt);
    M.compose(v.set(px, 0, pz), q, sc.set(1, 1, 1));
    pegs.setMatrixAt(i, M);
    aoShapes.push(aoCircle(px, pz, 0.02, 0.1, 0.45));
    // Cord from the outer hook's bowl to the peg's neck.
    const r = SLEEVE_R + HOOK_REACH;
    a.set(x + ox * r, CORD_HOOK_Y - HOOK_R * 0.7, z + oz * r);
    b.set(0, 0.1, 0).applyQuaternion(q).add(v);
    const len = a.distanceTo(b);
    q.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    M.compose(v.copy(a).add(b).multiplyScalar(0.5), q, sc.set(1, len, 1));
    cords.setMatrixAt(i, M);
  });
  group.add(pegs, cords);

  const hooks = new THREE.InstancedMesh(geo.hook, SILVER, hookMats.length);
  hooks.name = 'hooks';
  hookMats.forEach((mm, i) => hooks.setMatrixAt(i, mm));
  group.add(hooks);

  group.userData.colliders = colliders;
  group.userData.aoShapes = aoShapes;
  return group;
}

/**
 * The pillars' own materials (copies of the shared ones) with crease AO in the pillar's local
 * frame (scene/ao.js): the shaft darkens just above the socket and under the capital's flare,
 * the socket's top round the shaft foot, the silver sleeve under the flare.
 */
function pillarMaterials() {
  const T = SHAFT_TOP;
  const socketBox = { c: [0, SOCKET_H / 2, 0], e: [SOCKET_W / 2, SOCKET_H / 2, SOCKET_W / 2], r: 0.22, k: 0.7 };
  const shaftBox = { c: [0, SOCKET_H + 0.6, 0], e: [PR, 0.6, PR], r: 0.14, k: 0.6 };
  const flareBox = { c: [0, T + CAP_H * 0.25, 0], e: [PR * 1.55, CAP_H * 0.25, PR * 1.55], r: 0.18, k: 0.7 };
  const socket = BRONZE.clone();
  const shaft = ACACIA.clone();
  const capital = SILVER.clone();
  socket.name = 'pillar-socket';
  shaft.name = 'pillar-shaft';
  capital.name = 'pillar-capital';
  addBoxAO(socket, [shaftBox], { space: 'local', key: 'pillar-socket' });
  addBoxAO(shaft, [socketBox, flareBox], { space: 'local', key: 'pillar-shaft' });
  addBoxAO(capital, [flareBox], { space: 'local', key: 'pillar-capital' });
  // Clones drop the shared materials' patches: add the wear again (metalWear.js).
  addBronzeWear(socket);
  addWoodGrain(shaft);
  addSilverWear(capital);
  return { socket, shaft, capital };
}
