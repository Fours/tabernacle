import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHOWBREAD as S, m } from '../config/dimensions.js';
import { GOLD } from './materials.js';
import { part, boxPart, merge } from './bronzeParts.js';
import { box } from './colliders.js';

// The table of showbread (Ex 25:23-30; 37:10-16; Lev 24:5-9): a gold-overlaid table with a
// frame a handbreadth wide, two crowns, four rings and two poles; twelve loaves in two stacks
// of six with a gold cup of frankincense on each; and the table's gold utensils standing on the
// floor beside it. Two merged meshes: gold, and bread with frankincense (vertex colours).
// Local frame: origin on the floor at the table's center, long axis along x.

const L = m(S.length), W = m(S.width), H = m(S.height);
const TOP = m(S.topThickness), FRAME_H = m(S.hb), FT = m(S.frameThickness), INSET = m(S.frameInset);
const LEG = m(S.legSize), CW = m(S.crownWidth), CH = m(S.crownHeight), FC = m(S.frameCrownSize);
const RING_R = m(S.ringRadius), RING_T = m(S.ringTube), POLE_R = m(S.poleRadius);
const ringY = H - TOP - FRAME_H / 2; // rings sit level with the frame
const legX = L / 2 - INSET - LEG / 2, legZ = W / 2 - INSET - LEG / 2;
const ringZ = W / 2 - INSET + RING_R + RING_T * 0.3; // ring/pole axis, just outside the legs

/** Lathe of a [radius, height] profile given in cubits (bottom to top, outer then inner). */
function lathe(profile, segments = 20) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(m(r), m(y))), segments);
}

function goldFrame() {
  const g = [];
  // Slab, frame, crown, legs and rings are gold-overlaid acacia (Ex 25:24, 26).
  g.push(boxPart(L, TOP, W, [0, H - TOP / 2, 0]));
  // Frame (misgeret), a handbreadth wide, set under the slab a little inside its edge.
  const fy = H - TOP - FRAME_H / 2;
  const fx = L / 2 - INSET - FT / 2, fz = W / 2 - INSET - FT / 2;
  for (const s of [-1, 1]) {
    g.push(boxPart(L - 2 * INSET, FRAME_H, FT, [0, fy, s * fz]));
    g.push(boxPart(FT, FRAME_H, W - 2 * INSET - 2 * FT, [s * fx, fy, 0]));
  }
  // The frame's own crown: a bead along its lower edge (25:25).
  const by = H - TOP - FRAME_H + FC / 2;
  const bx = L / 2 - INSET + FC / 2, bz = W / 2 - INSET + FC / 2;
  for (const s of [-1, 1]) {
    g.push(boxPart(L - 2 * INSET + 2 * FC, FC, FC, [0, by, s * bz]));
    g.push(boxPart(FC, FC, W - 2 * INSET, [s * bx, by, 0]));
  }
  // The crown (zer) around the top: wraps the slab's edge and rises above it (25:24).
  const wrap = m(0.03);
  const cy = H - wrap + (CH + wrap) / 2;
  for (const s of [-1, 1]) {
    g.push(boxPart(L + 2 * m(0.008), CH + wrap, CW, [0, cy, s * (W / 2 - CW / 2 + m(0.008))]));
    g.push(boxPart(CW, CH + wrap, W - 2 * CW, [s * (L / 2 - CW / 2 + m(0.008)), cy, 0]));
  }
  // Legs with small foot caps.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.push(boxPart(LEG, H - TOP, LEG, [sx * legX, (H - TOP) / 2, sz * legZ]));
      g.push(boxPart(LEG * 1.35, m(0.035), LEG * 1.35, [sx * legX, m(0.0175), sz * legZ]));
      // Four rings at the feet, near the frame (25:26-27), on the long sides.
      g.push(part(new THREE.TorusGeometry(RING_R, RING_T, 8, 20).rotateY(Math.PI / 2),
        { pos: [sx * legX, ringY, sz * ringZ] }));
    }
  }
  // Two poles of acacia overlaid with gold, through the rings along the long sides (25:28).
  const poleHalf = L / 2 + m(S.poleOverhang);
  for (const sz of [-1, 1]) {
    g.push(part(new THREE.CylinderGeometry(POLE_R, POLE_R, 2 * poleHalf, 10).rotateZ(Math.PI / 2),
      { pos: [0, ringY, sz * ringZ] }));
  }
  return g;
}

// ---- Bread and frankincense (vertex-coloured, one material) --------------------------------

const rng = (seed) => {
  let s = (seed * 16807) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

/** A flat, pillowy loaf: squircle outline, softened rims, slight dome. Centered on its base. */
function loaf(rnd) {
  const { length, width, thickness } = S.loaf;
  const w = m(length), d = m(width), h = m(thickness);
  let g = new THREE.BoxGeometry(w, h, d, 10, 2, 6);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  const p = g.attributes.position;
  const ss = THREE.MathUtils.smoothstep;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = x / (w / 2), v = z / (d / 2);
    const rr = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
    const k = rr > 1 ? 1 / rr : 1; // pull the box's corners in toward a rounded outline
    x *= k; z *= k;
    const edge = ss(Math.min(rr, 1), 0.7, 1);
    if (y > 0) y += h * 0.15 * (1 - rr * rr * 0.5) - h * 0.3 * edge; // slight dome, rounded rim
    else if (y < 0) y += h * 0.2 * edge;
    p.setXYZ(i, x + 0.004 * Math.sin(z * 90), y + h / 2, z);
  }
  g.computeVertexNormals();
  // Baked-bread colours: pale golden sides, a browner crust on top, a little mottling.
  const side = new THREE.Color(0xedb866), top = new THREE.Color(0xc58532), c = new THREE.Color();
  const tone = 0.88 + rnd() * 0.24;
  const n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    c.copy(side).lerp(top, ss(n.getY(i), 0.35, 0.95));
    c.multiplyScalar(tone * (0.92 + rnd() * 0.16));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Give a geometry a constant vertex colour (with a little per-vertex variation). */
function colored(g, hex, rnd, vary = 0.08) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const f = 1 + (rnd() - 0.5) * 2 * vary;
    col.set([c.r * f, c.g * f, c.b * f], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Part for the vertex-coloured mesh: like `part` but keeps the colour attribute. */
function cpart(geo, opts) {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  const color = flat.attributes.color;
  const g = part(flat, opts);
  g.setAttribute('color', color);
  return g;
}

const BREAD = new THREE.MeshStandardMaterial({
  name: 'showbread',
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.88,
  metalness: 0,
});

// Gold cup of frankincense (25:29; Lev 24:7): a small footed bowl.
const CUP = [[0, 0], [0.05, 0], [0.055, 0.012], [0.04, 0.025], [0.09, 0.045], [0.105, 0.075], [0.098, 0.075], [0.085, 0.05], [0.03, 0.035], [0, 0.03]];
const CUP_H = 0.075;

function stacks() {
  const rnd = rng(11);
  const bread = [];
  const gold = [];
  const stackX = [-0.5, 0.5]; // cubits from the table's center
  const lt = m(S.loaf.thickness);
  for (const sx of stackX) {
    for (let i = 0; i < 6; i++) {
      const yaw = (rnd() - 0.5) * 0.07;
      const g = loaf(rnd);
      bread.push(cpart(g, { pos: [m(sx) + (rnd() - 0.5) * m(0.025), H + i * lt, (rnd() - 0.5) * m(0.025)], rot: [0, yaw, 0] }));
    }
    // The cup of frankincense on top of the stack, with a heap of pale resin.
    const topY = H + 6 * lt + m(0.012);
    gold.push(part(lathe(CUP), { pos: [m(sx), topY, 0] }));
    for (let k = 0; k < 6; k++) {
      const a = k * 2.1 + rnd();
      const r = k === 0 ? 0 : m(0.028 + rnd() * 0.02);
      const lump = new THREE.IcosahedronGeometry(m(0.022 + rnd() * 0.01), 1);
      colored(lump, 0xe9dca0, rnd, 0.12);
      bread.push(cpart(lump, { pos: [m(sx) + Math.cos(a) * r, topY + m(0.05 + (k === 0 ? 0.025 : 0)), Math.sin(a) * r] }));
    }
  }
  return { bread, gold };
}

// The table's utensils (25:29): dishes, spoon-bowls, jars and bowls for the drink offering,
// standing on the floor on the north side where the poles leave room.
function utensils() {
  const g = [];
  const x0 = m(S.utensilsX), z0 = m(S.utensilsZ);
  const put = (profile, dx, dz, y = 0, segs = 24) => g.push(part(lathe(profile, segs), { pos: [x0 + m(dx), m(y), z0 + m(dz)] }));
  const DISH = [[0, 0], [0.12, 0], [0.26, 0.04], [0.29, 0.065], [0.275, 0.065], [0.25, 0.045], [0.11, 0.02], [0, 0.02]];
  put(DISH, -0.62, 0.05);
  put(DISH, -0.62, 0.05, 0.05); // a second dish stacked on the first
  put(DISH, -0.62, 0.05, 0.1);
  const BOWL = [[0, 0], [0.07, 0], [0.16, 0.05], [0.18, 0.13], [0.17, 0.13], [0.15, 0.06], [0.06, 0.025], [0, 0.025]];
  put(BOWL, -0.12, -0.12);
  // Jars (qesavot): a rounded body, narrow neck, flared lip.
  const JAR = [[0, 0], [0.08, 0], [0.12, 0.07], [0.14, 0.16], [0.11, 0.25], [0.06, 0.31], [0.055, 0.37], [0.085, 0.41], [0.075, 0.41], [0.045, 0.37], [0.045, 0.31], [0.1, 0.25], [0.125, 0.16], [0.105, 0.07], [0, 0.03]];
  put(JAR, 0.28, 0.0);
  put(JAR.map(([r, y]) => [r * 0.85, y * 0.85]), 0.6, -0.02);
  // Pans (kappot): shallow ladle-bowls with a short handle.
  put(BOWL, 0.2, -0.28);
  g.push(part(new THREE.BoxGeometry(m(0.25), m(0.025), m(0.04)).translate(m(0.17), m(0.12), 0), { pos: [x0 + m(0.2), 0, z0 - m(0.28)], rot: [0, 0.4, 0] }));
  return g;
}

export function createShowbread() {
  const group = new THREE.Group();
  group.name = 'showbread';
  group.position.set(m(S.x), 0, m(S.z));

  const st = stacks();
  const goldMesh = new THREE.Mesh(merge([...goldFrame(), ...st.gold, ...utensils()]), GOLD);
  goldMesh.name = 'showbread-gold';
  group.add(goldMesh);

  const breadMesh = new THREE.Mesh(merge(st.bread), BREAD);
  breadMesh.name = 'showbread-loaves';
  group.add(breadMesh);

  const cx = m(S.x), cz = m(S.z);
  const poleLen = L + 2 * m(S.poleOverhang);
  group.userData.colliders = [
    box(cx, cz, L + 2 * m(0.01), W + 2 * m(0.01)),
    ...[-1, 1].map((sz) => box(cx, cz + sz * ringZ, poleLen, 2 * POLE_R + 0.06)), // carrying poles
  ];
  group.userData.dispose = () => {
    goldMesh.geometry.dispose();
    breadMesh.geometry.dispose();
    BREAD.dispose();
  };
  return group;
}
