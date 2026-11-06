import * as THREE from 'three';
import { INCENSE_ALTAR as A, m } from '../config/dimensions.js';
import { GOLD, GOLD_PATINA, addGoldPatina } from './materials.js';
import { addGoldWear } from './metalWear.js';
import { part, boxPart, merge } from './bronzeParts.js';
import { box } from './colliders.js';
import { aoBox } from './ao.js';
import { createIncenseSmoke } from './fire.js';
import { incenseOrnamentParts, incenseGroundBoxes } from './incenseOrnament.js';

// The altar of incense (Ex 30:1-10; 37:25-28): a 1 x 1 x 2 cubit gold-overlaid altar with four
// horns of one piece with it, a crown around the top, two rings under the crown on each of the
// north and south sides, and two poles. On top, a gold firepan with a few glowing coals and a
// thin wisp of incense smoke. One merged gold mesh, one coals mesh (emissive: no light), one
// ribbon smoke draw. Local frame: origin on the floor at the altar's center.

const S = m(A.size), H = m(A.height);
const CW = m(A.crownWidth), CH = m(A.crownHeight), LIP = m(A.crownLip);
const RING_R = m(A.ringRadius), RING_T = m(A.ringTube), POLE_R = m(A.poleRadius);
const ringY = H - m(A.ringDrop);
const ringZ = S / 2 + RING_R + RING_T * 0.3; // ring/pole axis, just outside the side
const ringX = m(A.ringSpacing);
const hornX = S / 2 - m(A.hornBaseRadius) * 0.9; // horn axes from the center along x and z
/** Dimensions for the ornament (meters). */
const ORN = { S, H, CW, CH, LIP, ringX, ringY, hornX, hornR: m(A.hornBaseRadius) };

/** Tapered, outward-leaning horn (same shape as the bronze altar's); sits at the local origin. */
function horn(outDir) {
  const hh = m(A.hornHeight), out = m(A.hornOutward);
  const pts = [[0, 0], [0.05, 0.4], [0.35, 0.75], [1, 1]].map(
    ([o, h]) => new THREE.Vector3(outDir.x * o * out, h * hh, outDir.z * o * out),
  );
  const curve = new THREE.CatmullRomCurve3(pts);
  const ts = 12, rs = 8;
  const tube = new THREE.TubeGeometry(curve, ts, 1, rs, false);
  const p = tube.attributes.position;
  const rBase = m(A.hornBaseRadius), rTip = m(A.hornTipRadius);
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= ts; i++) {
    curve.getPointAt(i / ts, c);
    const r = THREE.MathUtils.lerp(rBase, rTip, Math.pow(i / ts, 1.4));
    for (let j = 0; j <= rs; j++) {
      const k = i * (rs + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return [tube, new THREE.SphereGeometry(rTip, 8, 6).translate(pts[3].x, pts[3].y, pts[3].z)];
}

function goldParts() {
  const g = [];
  // Body (gold-overlaid acacia on all sides, Ex 30:3). The crown (zer) round the top, the
  // plinth and the relief (reconstruction) are in incenseOrnament.js.
  g.push(boxPart(S, H, S, [0, H / 2, 0]));
  g.push(...incenseOrnamentParts(ORN));
  // Horns of one piece with the top, at the four corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const dir = new THREE.Vector3(sx, 0, sz).normalize();
      for (const geo of horn(dir)) g.push(part(geo, { pos: [sx * hornX, H - m(0.01), sz * hornX] }));
    }
  }
  // Two rings under the crown on each of two opposite sides (north and south), and the poles.
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      g.push(part(new THREE.TorusGeometry(RING_R, RING_T, 8, 20).rotateY(Math.PI / 2),
        { pos: [sx * ringX, ringY, sz * ringZ] }));
    }
    const half = S / 2 + m(A.poleOverhang);
    g.push(part(new THREE.CylinderGeometry(POLE_R, POLE_R, 2 * half, 10).rotateZ(Math.PI / 2),
      { pos: [0, ringY, sz * ringZ] }));
  }
  // The firepan on top (a shallow gold dish), holding the coals.
  const r = m(A.panRadius);
  const prof = [[0, 0], [0.7, 0], [0.92, 0.35], [1, 1], [0.94, 1], [0.84, 0.45], [0.65, 0.3], [0, 0.3]];
  const pan = new THREE.LatheGeometry(prof.map(([f, y]) => new THREE.Vector2(f * r, y * m(0.07))), 28);
  g.push(part(pan, { pos: [0, H, 0] }));
  return g;
}

/**
 * The altar's own gold (only its mesh; the shared GOLD is unchanged): an altar burned on twice
 * a day (Ex 30:7-8). Soot and resin blacken the top round the firepan, the crown's and the
 * horns' inner faces, and run down the outer sides in streaks; grime sits on the ground of the
 * relief and in the inner corners; the pole ends and the crown's edge are dull and smudged
 * where it is carried and steadied; a little grey ash lies on the top. Masks are in the
 * altar's local frame (metalWear.js addGoldWear).
 */
function altarGold() {
  const gold = GOLD.clone();
  gold.name = 'incense-altar-gold';
  addGoldPatina(gold, { ...GOLD_PATINA, tarnish: 0.2, grime: 0.4 }); // clone() drops GOLD's patch
  const gb = incenseGroundBoxes(ORN);
  const yc = H + LIP - 0.008; // the crown's top edge
  const poleEnd = S / 2 + m(A.poleOverhang);
  const hc = S / 2 + CW; // the crown's outer face
  const inner = hc - CW - 0.004; // inside the crown (the top's clear area)
  addGoldWear(gold, {
    boxes: [
      { ...gb.body, ground: 0.3, contact: 0.35, reach: 0.02 },
      { ...gb.crownBand, ground: 0.28 },
      { ...gb.plinthBand, ground: 0.28 },
    ],
    crevice: 0.7,
    handling: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        { a: [sx * (S / 2 + 0.12), ringY, sz * ringZ], b: [sx * poleEnd, ringY, sz * ringZ], r: 0.05 }))),
      ...[-1, 1].flatMap((s) => [
        { a: [s * hc, yc, -0.08], b: [s * hc, yc, 0.08], r: 0.04, strength: 0.7 },
        { a: [-0.08, yc, s * hc], b: [0.08, yc, s * hc], r: 0.04, strength: 0.7 },
      ]),
    ],
    soot: {
      center: [0, H, 0], radius: [0.16, 0.4], height: [H - 0.14, H + 0.01], strength: 0.62,
      streak: 0.12, inner: 0.7,
    },
    dust: { y: H - 0.003, height: 0.02, min: [-inner, -inner], max: [inner, inner], amount: 0.3, color: [0.36, 0.34, 0.31],
      spots: [{ min: [-0.13, -0.13], max: [0.13, 0.13], flour: 0.4, crumbs: 0 }] },
    low: { height: 0.1, strength: 0.25 },
  });
  return gold;
}

// ---- Coals -------------------------------------------------------------------------------

const COALS = new THREE.MeshStandardMaterial({
  name: 'incense-coals',
  color: 0x1c110c,
  roughness: 0.95,
  metalness: 0,
  vertexColors: true,
  emissive: 0xff5a14,
  emissiveIntensity: 10.0,
});
// The vertex colour doubles as a per-vertex glow factor, so each coal is hot in patches
// (cracks) and dark ash in others. Past 2.0 the bloom picks it up.
COALS.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;',
  );
};
COALS.customProgramCacheKey = () => 'incense-coals-v1';

function coals() {
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const out = [];
  const spots = [[0, 0, 0.045, 1.0], [0.1, 0.04, 0.038, 0.9], [-0.09, 0.07, 0.04, 0.8], [0.03, -0.11, 0.04, 1.0],
    [-0.12, -0.05, 0.035, 0.6], [0.14, -0.07, 0.03, 0.5], [-0.02, 0.14, 0.03, 0.7], [0.06, 0.1, 0.03, 0.9]];
  for (const [x, z, rad, heat] of spots) {
    const g = new THREE.IcosahedronGeometry(m(rad), 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 0.82 + rnd() * 0.36;
      p.setXYZ(i, p.getX(i) * f * 1.15, p.getY(i) * f * 0.8, p.getZ(i) * f * 1.15);
    }
    g.computeVertexNormals();
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // Hot patches (the glowing cracks) between darker ash.
      const h = heat * Math.pow(rnd(), 2.2) * (p.getY(i) > 0 ? 1.5 : 0.5);
      col.set([h, h * h * 0.8, h * h * h * 0.5], i * 3);
    }
    const pg = part(g, { pos: [m(x), m(0.03 + rad * 0.7 + (x === 0 && z === 0 ? 0.02 : 0)), m(z)] });
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.push(pg);
  }
  return out;
}

export function createIncenseAltar() {
  const group = new THREE.Group();
  group.name = 'incense-altar';
  group.position.set(m(A.x), 0, m(A.z));

  const gold = altarGold();
  const goldMesh = new THREE.Mesh(merge(goldParts()), gold);
  goldMesh.name = 'incense-altar-gold';
  group.add(goldMesh);

  const coalGeo = merge(coals());
  const coalMesh = new THREE.Mesh(coalGeo, COALS);
  coalMesh.name = 'incense-coals';
  coalMesh.position.y = H;
  group.add(coalMesh);

  // Incense smoke rising from the coals: a thin laminar thread that sways, twists and splits
  // into curling wisps, fading into a faint haze about 1.3 m up.
  const smoke = createIncenseSmoke();
  smoke.mesh.position.set(0, H + m(0.14), 0);
  group.add(smoke.mesh);

  group.userData.update = (dt, time) => {
    smoke.update(time);
    // The coals breathe slowly (a gentle pulse, never a flicker).
    COALS.emissiveIntensity = 10.0 + 1.6 * Math.sin(time * 1.3) * Math.sin(time * 0.37 + 1.1) + 0.4 * Math.sin(time * 3.1);
  };
  group.userData.update(0, 0);

  const cx = m(A.x), cz = m(A.z);
  const poleLen = S + 2 * m(A.poleOverhang);
  group.userData.colliders = [
    box(cx, cz, S + 2 * CW, S + 2 * CW),
    ...[-1, 1].map((sz) => box(cx, cz + sz * ringZ, poleLen, 2 * POLE_R + 0.06)), // carrying poles
  ];
  const PL = S + 2 * m(A.plinth);
  group.userData.aoShapes = [aoBox(cx, cz, PL, PL, 0.35, 0.7), aoBox(cx, cz, PL, PL, 0.9, 0.2)]; // contact AO
  group.userData.dispose = () => {
    goldMesh.geometry.dispose();
    gold.dispose();
    coalGeo.dispose();
    COALS.dispose();
    smoke.dispose();
  };
  return group;
}
