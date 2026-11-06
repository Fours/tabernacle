import * as THREE from 'three';
import { INCENSE_ALTAR as A, m } from '../config/dimensions.js';
import { GOLD } from './materials.js';
import { part, boxPart, merge } from './bronzeParts.js';
import { box } from './colliders.js';
import { aoBox } from './ao.js';
import { createIncenseSmoke } from './fire.js';

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
  // Footing and body (gold-overlaid acacia on all sides, Ex 30:3).
  const pl = m(A.plinth), ph = m(A.plinthHeight);
  g.push(boxPart(S + 2 * pl, ph, S + 2 * pl, [0, ph / 2, 0]));
  g.push(boxPart(S, H, S, [0, H / 2, 0]));
  // Crown (zer) around the top: projects from the sides, with a raised lip at its outer edge.
  const cy = H - CH / 2;
  for (const s of [-1, 1]) {
    g.push(boxPart(S + 2 * CW, CH, CW, [0, cy, s * (S / 2 + CW / 2)]));
    g.push(boxPart(CW, CH, S, [s * (S / 2 + CW / 2), cy, 0]));
    g.push(boxPart(S + 2 * CW, LIP, CW * 0.45, [0, H + LIP / 2, s * (S / 2 + CW * 0.775)]));
    g.push(boxPart(CW * 0.45, LIP, S, [s * (S / 2 + CW * 0.775), H + LIP / 2, 0]));
  }
  // A fine bead on the crown's lower edge.
  const bead = m(0.02);
  for (const s of [-1, 1]) {
    g.push(boxPart(S + 2 * CW + 2 * bead, bead, bead, [0, H - CH - bead / 2 + m(0.005), s * (S / 2 + CW + bead / 2 - m(0.005))]));
    g.push(boxPart(bead, bead, S + 2 * CW, [s * (S / 2 + CW + bead / 2 - m(0.005)), H - CH - bead / 2 + m(0.005), 0]));
  }
  // Horns of one piece with the top, at the four corners.
  const hx = S / 2 - m(A.hornBaseRadius) * 0.9;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const dir = new THREE.Vector3(sx, 0, sz).normalize();
      for (const geo of horn(dir)) g.push(part(geo, { pos: [sx * hx, H - m(0.01), sz * hx] }));
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

  const goldMesh = new THREE.Mesh(merge(goldParts()), GOLD);
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
    coalGeo.dispose();
    COALS.dispose();
    smoke.dispose();
  };
  return group;
}
