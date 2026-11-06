import * as THREE from 'three';
import { TABERNACLE as T, m } from '../config/dimensions.js';
import { createGoatHairTexture, createSkinTexture, createLinenTexture } from './textiles.js';
import { createCherubimTexture } from './cherubimWeave.js';
import { addMacroVariation } from './materials.js';
import { addCloth, addWindShadow, windAttributes } from './cloth.js';
import { part } from './bronzeParts.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Tabernacle coverings (Ex 26:1-14) over a flat roof. Everything here is computed in cubits and
// converted with m() when written to geometry.
//
// Four layers, bottom to top: linen (only its ceiling, seen from inside), goat hair, ram skins
// dyed red, tachash. The outer three each = a roof grid (sagging slightly between the walls), a
// strip round the back of the roof (south side, SW corner, west, NW corner, north side) that
// rounds over the roof edge and runs down at a slant to a hem pulled out by cords to bronze
// stakes, and a short flap over the front edge. The goat hair reaches furthest; the skins above
// it lie on it at a small normal offset and stop shorter, so the layers step out. The back
// corners fan round the corner point (a cone with soft folds).

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const HW = T.interiorWidth / 2;
const TOP = T.boardHeight;

/** Roof sag (cubits, >= 0) at plan point x,z. Zero over the walls and at the entrance. */
export function roofSag(x, z) {
  const dz = Math.abs(z - T.centerZ);
  if (dz >= HW) return 0;
  const sz = Math.cos((Math.PI / 2) * (dz / HW));
  const sx = smooth(T.interiorMinX, T.interiorMinX + 4, x) * (1 - smooth(T.interiorMaxX - 4, T.interiorMaxX, x));
  return T.roofSag * sz * sx;
}

// Ceiling texture tile (cubits): the full 10 across the tent (N-S) x one 4-cubit curtain (E-W),
// so each row's 4 cherubim can face the middle: the two north ones south, the two south north.
const CEIL_TILE = { across: 10 };

/**
 * Inner linen covering (Ex 26:1-6) as seen from inside: a flat sheet just above the board
 * tops (sagging with the goat hair), reaching over the boards so no gap shows at the walls.
 * Its curtains run N-S; figures stand head to the east, seams fall every 4 cubits from the
 * front edge, and the gold clasps (26:6) hang under the clasp line. Returns { mesh, goldParts }.
 */
export function createLinenCeiling() {
  const L = T.linen;
  const xW = T.interiorMinX - T.boardThickness, xE = T.interiorMaxX;
  const zO = HW + T.boardThickness;
  const yAt = (x, z) => TOP + L.above - roofSag(x, z);
  const nx = Math.round(xE - xW), nz = Math.round((2 * zO) / 0.5);
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    const z = T.centerZ - zO + (2 * zO * j) / nz;
    for (let i = 0; i <= nx; i++) {
      const x = xW + ((xE - xW) * i) / nx;
      pos.push(m(x), m(yAt(x, z)), m(z));
      // One curtain per tile in v, from the front edge (x = 0) westward. Figures' heads point
      // east, so they stand upright to someone entering and looking up toward the veil.
      uv.push((z - T.centerZ + HW) / CEIL_TILE.across, (x - T.interiorMaxX) / L.curtainWidth);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, b, c, b, d, c); // facing down
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const weave = createLinenTexture();
  weave.repeat.set(m(CEIL_TILE.across) / 0.5, m(L.curtainWidth) / 0.5);
  const mat = new THREE.MeshStandardMaterial({
    name: 'linen-ceiling',
    map: createCherubimTexture({ w: CEIL_TILE.across, h: L.curtainWidth, ppc: 256, cols: 4, rows: 2, seams: true, facing: 'center' }),
    bumpMap: weave,
    bumpScale: 0.5,
    roughness: 0.9,
  });
  addMacroVariation(mat, { scale: 0.5, amount: 0.08 });
  // Fibre sheen only: no light behind it reaches through the coverings above.
  addCloth(mat, { transmission: 0, sheen: 0.2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'linen-ceiling';
  mesh.receiveShadow = true;

  // Gold clasps joining the two sets of five curtains, hanging just under the clasp line.
  const goldParts = [];
  const xC = T.interiorMaxX - L.claspAt;
  for (let k = 0; k < L.clasps; k++) {
    const z = T.centerZ + ((k + 0.5) / L.clasps) * L.curtainLength - L.curtainLength / 2;
    if (Math.abs(z - T.centerZ) >= HW - 0.1) continue;
    const g = new THREE.TorusGeometry(m(0.08), m(0.022), 4, 10).scale(1.7, 1, 1);
    goldParts.push(part(g, { pos: [m(xC), m(yAt(xC, z) - 0.035), m(z)], rot: [Math.PI / 2, 0, 0] }));
  }
  return { mesh, goldParts };
}

// ---- Outer coverings ------------------------------------------------------------------------

/**
 * Open path round the back of roof rect {xW, xE, zN, zS}, counter-clockwise seen from above:
 * the south side from its front end (`ext` past xE) westward, SW corner, west side, NW corner,
 * north side to its front end. Corners are fans round the corner point taking `cornerLen` of s.
 * `at(s)` returns a sample {x, z, nx, nz, side, from, to, f, s}.
 */
function makeBackPath(rect, ext, cornerLen) {
  const { xW, xE, zN, zS } = rect;
  const xF = xE + ext;
  const segs = [
    { line: [xF, zS, xW, zS], a: Math.PI / 2, side: 'S' },
    { corner: [xW, zS], a0: Math.PI / 2, a1: Math.PI, from: 'S', to: 'W' },
    { line: [xW, zS, xW, zN], a: Math.PI, side: 'W' },
    { corner: [xW, zN], a0: Math.PI, a1: 1.5 * Math.PI, from: 'W', to: 'N' },
    { line: [xW, zN, xF, zN], a: 1.5 * Math.PI, side: 'N' },
  ];
  let s = 0;
  for (const g of segs) {
    g.s0 = s;
    g.len = g.line ? Math.hypot(g.line[2] - g.line[0], g.line[3] - g.line[1]) : cornerLen;
    s += g.len;
  }
  const total = s;
  const at = (sIn) => {
    const sv = Math.min(total, Math.max(0, sIn));
    const g = segs.find((q) => sv <= q.s0 + q.len) || segs[segs.length - 1];
    const f = (sv - g.s0) / g.len;
    if (g.line) {
      const [x0, z0, x1, z1] = g.line;
      return { x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f, nx: Math.cos(g.a), nz: Math.sin(g.a), side: g.side, f, s: sv };
    }
    const a = g.a0 + (g.a1 - g.a0) * f;
    return { x: g.corner[0], z: g.corner[1], nx: Math.cos(a), nz: Math.sin(a), side: 'corner', from: g.from, to: g.to, f, s: sv };
  };
  const samples = (step, cornerSteps) => {
    const out = [];
    for (const g of segs) {
      const n = g.line ? Math.max(1, Math.round(g.len / step)) : cornerSteps;
      for (let i = 0; i < n; i++) out.push(at(g.s0 + (g.len * i) / n));
    }
    out.push(at(total));
    return out;
  };
  return {
    at,
    samples,
    total,
    xF,
    cornerS: (k, f) => segs[k === 'SW' ? 1 : 3].s0 + f * cornerLen,
    sideS: (side, x) => (side === 'S' ? xF - x : segs[4].s0 + (x - xW)),
    backS: (z) => segs[2].s0 + (zS - z),
  };
}

/** Cylinder between two points (cubits), as a mergeable part. */
function rod(a, b, r, radial = 5) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(m(r), m(r), m(d.length()), radial, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const c = a.clone().add(b).multiplyScalar(0.5);
  return part(g, { pos: [m(c.x), m(c.y), m(c.z)] });
}

/** Bronze tent stake (meters, local): a tapered pin with a collar and a cord ring; neck at y 0.1. */
function stakeGeometry() {
  const g = mergeGeometries(
    [
      new THREE.CylinderGeometry(0.016, 0.005, 0.36, 7).translate(0, -0.04, 0),
      new THREE.CylinderGeometry(0.03, 0.024, 0.03, 9).translate(0, 0.14, 0),
      new THREE.TorusGeometry(0.019, 0.006, 5, 10).rotateX(Math.PI / 2).translate(0, 0.1, 0),
    ].map((q) => q.toNonIndexed()),
  );
  g.deleteAttribute('uv');
  return g;
}
const STAKE_NECK = 0.1; // m above the stake's origin
const STAKE_TILT = THREE.MathUtils.degToRad(20); // top leans away from the tent

// Texture tiles (cubits): goat hair spans 2 curtains × 4 cubits; skins 8 × 8 cubits.
const HAIR_TILE = { curtains: 2, heightCubits: 4 };
const SKIN_TILE = 8;
// Wind ripple (m) at the coverings' hems and the front flaps' lower edge (cloth.js).
const HEM_WIND = 0.014;
// Front-end ties sit this far (cubits along the path) in from the side slants' front edges.
const TIE_END = 0.12;
// Silver hem ring (m): wire-centre radius and wire radius (outer diameter ~4.5 cm, 6 mm wire).
const RING_R = 0.0195, RING_T = 0.003;

/**
 * Build the goat-hair, ram-skin and tachash coverings with their stakes and cords.
 * Returns { group, bronzeParts, ropeParts, silverParts, rect, footprint, stakes } (parts are geometries to
 * merge; footprint {minX, maxX, minZ, maxZ} in cubits bounds the slants and stakes; stakes are
 * their [x, z] positions in meters).
 */
export function createCoverings() {
  const group = new THREE.Group();
  group.name = 'coverings';
  const G = T.goatHair;
  const xW = T.interiorMinX - T.boardThickness;
  const xE = T.interiorMaxX + T.coverEastOverhang;
  const zO = HW + T.boardThickness;
  const rect = { xW, xE, zN: T.centerZ - zO, zS: T.centerZ + zO };
  const yG = TOP + G.clearance;
  const R = G.edgeRadius;
  const path = makeBackPath(rect, G.frontExtend, 5);

  // Layers, bottom to top. `reach`: fraction of the goat hair's slant; `gap`: normal offset.
  const goatL = { ...G, gap: 0, reach: 1, frontDroop: G.flap - R };
  const layers = [goatL, T.ramSkins, T.tachash];

  // ---- Stake positions along the path (s), per layer ---------------------------------------
  // North/south: every curtain width from the front, shifted per layer so no two layers' cords
  // share a line. West: a few across the back. Back corners: radial, at different angles.
  const BACK_Z = [[-4, 0, 4], [-2, 2], [-3.2, 3.2]];
  const CORNER_F = [[0.5], [0.2, 0.8], [0.35, 0.65]];
  const stakeS = layers.map((L, li) => {
    const out = [];
    for (let k = 1; ; k++) {
      const x = xE - G.curtainWidth * k - L.stakePhase;
      if (x < xW + 1.2) break;
      if (x > xE - 1.5) continue;
      out.push(path.sideS('S', x), path.sideS('N', x));
    }
    for (const z of BACK_Z[li]) out.push(path.backS(T.centerZ + z));
    for (const f of CORNER_F[li]) out.push(path.cornerS('SW', f), path.cornerS('NW', f));
    return out.sort((a, b) => a - b);
  });
  // Scallop weight: 0 at a stake (or a front end, staked diagonally), 1 midway between; a
  // little pointed at the stake where the cord pulls, rounded elsewhere.
  const scallopK = (li, s) => {
    const list = stakeS[li];
    let a = 0, b = path.total;
    for (const p of list) {
      if (p <= s) a = p;
      else { b = p; break; }
    }
    const k = Math.sin(Math.PI * Math.min(1, Math.max(0, (s - a) / (b - a || 1))));
    return 0.35 * k + 0.65 * k * k;
  };
  // Tie points (s) per layer: where a cord holds the hem through a silver ring. The stakes, and
  // a little in from each front end (the diagonal cords). The hem's wind ripple dies out toward
  // them, so the ring, patch and cord can stay still with the cloth they're sewn to.
  const ties = stakeS.map((list) => [...list, TIE_END, path.total - TIE_END].sort((a, b) => a - b));
  const tieWind = (li, s) => {
    let dmin = Infinity;
    for (const p of ties[li]) dmin = Math.min(dmin, Math.abs(s - p));
    return smooth(0.04, 0.6, dmin);
  };

  // ---- Shared shape: the goat hair's slant per path sample ---------------------------------
  const sideKey = (side) => (side === 'W' ? 'back' : 'side');
  const mixSide = (smp, get) => {
    if (smp.side !== 'corner') return get(sideKey(smp.side));
    const w = smooth(0, 1, smp.f);
    return get(sideKey(smp.from)) * (1 - w) + get(sideKey(smp.to)) * w;
  };
  // Arc of radius R over the roof edge (center at o = 0, y = yG - R) turning down to slant
  // angle th, then a straight run to the hem H = (reach, hem) in (outward, up) coordinates.
  const slantOf = (smp) => {
    const reach = mixSide(smp, (k) => G[k].reach), hem = mixSide(smp, (k) => G[k].hem);
    let th = Math.atan2(yG - hem, reach);
    for (let i = 0; i < 4; i++) th = Math.atan2(yG - R * (1 - Math.cos(th)) - hem, reach - R * Math.sin(th));
    const A = [R * Math.sin(th), yG - R * (1 - Math.cos(th))];
    return { th, A, H: [reach, hem], L: Math.hypot(reach - A[0], A[1] - hem), arc: R * th, cy: yG - R };
  };
  // Inward sag of the slant (deeper between the goat hair's stakes) and corner folds. These
  // move every layer alike, so the layers stay parallel and never cut through each other.
  const shapeOff = (smp, t) => {
    const back = smp.side === 'W' ? 0.6 : smp.side === 'corner' ? 0.8 : 1;
    let off = -G.belly * back * Math.sin(Math.PI * t) * (0.55 + 0.45 * scallopK(0, smp.s));
    if (smp.side === 'corner') off += G.cornerFold * t ** 1.2 * Math.sin(Math.PI * smp.f) * Math.sin(6 * Math.PI * smp.f + 0.7);
    return off;
  };
  // World point (cubits) at distance q down the cloth from the roof edge, offset d.
  const pointAt = (smp, sl, q, d) => {
    let o, y;
    if (q <= sl.arc) {
      const a = q / R;
      o = (R + d) * Math.sin(a);
      y = sl.cy + (R + d) * Math.cos(a);
    } else {
      const t = (q - sl.arc) / sl.L;
      const off = d + shapeOff(smp, t);
      o = sl.A[0] + (sl.H[0] - sl.A[0]) * t + Math.sin(sl.th) * off;
      y = sl.A[1] + (sl.H[1] - sl.A[1]) * t + Math.cos(sl.th) * off;
    }
    return new THREE.Vector3(smp.x + smp.nx * o, y, smp.z + smp.nz * o);
  };
  // Hem distance (along the cloth) of layer li at a sample: scalloped between its stakes.
  const hemQ = (li, smp, sl) => {
    const L = layers[li];
    const wob = 0.05 * Math.sin(smp.s * 1.9 + li * 2.1) + 0.03 * Math.sin(smp.s * 4.3 + li);
    return sl.arc + L.reach * sl.L - (L.scallop + wob) * scallopK(li, smp.s);
  };

  // Path samples, with a column exactly at every layer's tie so the hem there is where the
  // ring is put (the scallop is pointed at a stake).
  const sList = path.samples(0.33, 24);
  for (const s of ties.flat()) {
    if (sList.every((q) => Math.abs(q.s - s) > 0.01)) sList.push(path.at(s));
  }
  sList.sort((a, b) => a.s - b.s);
  const samples = sList.map((smp) => ({ smp, sl: slantOf(smp) }));
  const FRONT_N = 48;

  // ---- One layer's geometry ----------------------------------------------------------------
  const buildLayer = (li, dropRows, uv) => {
    const L = layers[li], d = L.gap;
    const pos = [], uvs = [], idx = [], wts = [];
    // w: wind ripple amplitude (m) at the vertex (cloth.js), along the cloth's normal.
    const push = (p, u, w = 0) => {
      pos.push(m(p.x), m(p.y), m(p.z));
      uvs.push(...u);
      wts.push(w);
    };
    // Roof grid.
    const nx = Math.round(xE - xW), nz = Math.round((rect.zS - rect.zN) / 0.5);
    for (let j = 0; j <= nz; j++) {
      const z = rect.zN + ((rect.zS - rect.zN) * j) / nz;
      for (let i = 0; i <= nx; i++) {
        const x = xW + ((xE - xW) * i) / nx;
        push({ x, y: yG + d - roofSag(x, z), z }, uv(x, z));
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1;
        idx.push(a, c, b, b, c, e);
      }
    }
    // A strip of columns x rows; quads between neighbouring columns.
    const strip = (cols, rows, wrapIdx) => {
      for (let i = 0; i < cols - 1; i++) {
        for (let j = 0; j < rows - 1; j++) {
          const a = wrapIdx + i * rows + j, b = a + rows;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    };
    // Back strip: arc rows then slant rows down to the scalloped hem.
    const ARC = 4;
    let base = pos.length / 3;
    for (const { smp, sl } of samples) {
      const Q = hemQ(li, smp, sl), tw = tieWind(li, smp.s);
      for (let k = 0; k <= ARC + dropRows; k++) {
        const q = k <= ARC ? (sl.arc * k) / ARC : sl.arc + ((Q - sl.arc) * (k - ARC)) / dropRows;
        // Ripple over the last ~1.5 cubits above the layer's own hem (layers stay apart).
        const r = Math.max(0, 1 - (Q - q) / 1.5);
        push(pointAt(smp, sl, q, d), uv(smp.x + smp.nx * q, smp.z + smp.nz * q), HEM_WIND * r * r * tw);
      }
    }
    strip(samples.length, ARC + dropRows + 1, base);
    // Reinforcing patches at the ties: the cloth doubled over the hem (goat hair) or a leather
    // tab (skins, narrower at the top), folded round the hem edge. They don't ripple (nor does
    // the hem there).
    const P = li === 0 ? { w: 0.11, h: 0.2, top: 1 } : { w: 0.08, h: 0.16, top: 0.75 };
    const PE = 0.008; // each face's normal offset from the cloth (cubits)
    const rows = [[1, PE], [0.5, PE], [0, PE], [0, -PE], [0.5, -PE], [1, -PE]]; // [height fraction, offset]
    for (const s of ties[li]) {
      base = pos.length / 3;
      const COLS = 5;
      for (let i = 0; i < COLS; i++) {
        const fc = (2 * i) / (COLS - 1) - 1;
        for (const [hf, e] of rows) {
          const sp = Math.min(path.total, Math.max(0, s + fc * P.w * (1 - hf + hf * P.top)));
          const smp = path.at(sp), sl = slantOf(smp);
          const q = hemQ(li, smp, sl) - hf * P.h;
          // Texture shifted so the patch's weave (or hide) doesn't line up with the cloth's.
          const [pu, pv] = uv(smp.x + smp.nx * q, smp.z + smp.nz * q);
          push(pointAt(smp, sl, q, d + e), [pu + 0.37, pv + 0.21], 0);
        }
      }
      strip(COLS, rows.length, base);
    }
    // Front flap: over the front edge and straight down, soft vertical folds.
    base = pos.length / 3;
    const FROWS = 6;
    for (let i = 0; i <= FRONT_N; i++) {
      const z = rect.zN + ((rect.zS - rect.zN) * i) / FRONT_N; // N to S: same winding as the back strip
      const drop = L.frontDroop + 0.02 * Math.sin(z * 3.1 + li);
      for (let k = 0; k <= ARC + FROWS; k++) {
        let o, y, q;
        if (k <= ARC) {
          const a = ((Math.PI / 2) * k) / ARC;
          o = (R + d) * Math.sin(a);
          y = yG - R + (R + d) * Math.cos(a);
          q = R * a;
        } else {
          const t = (k - ARC) / FROWS;
          o = R + d + 0.04 * t * Math.sin(z * 2.3 + 0.5);
          y = yG - R - drop * t;
          q = (R * Math.PI) / 2 + drop * t;
        }
        const tf = k > ARC ? (k - ARC) / FROWS : 0;
        push({ x: xE + o, y, z }, uv(xE + q, z), HEM_WIND * tf * tf);
      }
    }
    strip(FRONT_N + 1, ARC + FROWS + 1, base);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal.array;
    const wind = new Float32Array(wts.length * 4);
    wts.forEach((w, k) => {
      wind.set([nrm[3 * k], nrm[3 * k + 1], nrm[3 * k + 2], w], 4 * k);
    });
    // The ripple's amplitude gradient is left out (small next to the wave's own).
    return windAttributes(geo, wind, new Float32Array(wts.length * 3));
  };

  // ---- Goat hair ---------------------------------------------------------------------------
  // Material coordinates (cubits): E-W from the front flap's hem (0) westward; N-S across the
  // 30-cubit curtains. Curtain joins fall every 4 cubits; the clasp line at G.claspAt.
  const matU = (x) => G.flap + (xE - x);
  const matV = (z) => G.curtainLength / 2 + (z - T.centerZ);
  const hairTex = createGoatHairTexture(HAIR_TILE);
  const hairMat = new THREE.MeshStandardMaterial({
    name: 'goat-hair',
    color: 0xffffff,
    map: hairTex,
    bumpMap: hairTex,
    bumpScale: 0.5,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  // Weathering over the whole covering (breaks up the repeat).
  addMacroVariation(hairMat, { scale: 0.35, amount: 0.22, dust: 0.0, tint: [1.15, 1.05, 0.95] });
  // Dense, dark goat hair: a wool sheen, hardly any light through it; hems ripple.
  addCloth(hairMat, { transmission: 0.04, sheen: 0.3, sheenRoughness: 0.6, wind: true });
  const goatGeo = buildLayer(0, 26, (x, z) => [matU(x) / (G.curtainWidth * HAIR_TILE.curtains), matV(z) / HAIR_TILE.heightCubits]);
  const goatMesh = new THREE.Mesh(goatGeo, hairMat);
  goatMesh.name = 'goat-hair-covering';
  goatMesh.castShadow = goatMesh.receiveShadow = true;
  addWindShadow(goatMesh);
  group.add(goatMesh);

  // ---- Ram skins dyed red, then tachash ----------------------------------------------------
  const skinLayer = (li, name, base, seed, rows, look) => {
    const mat = new THREE.MeshStandardMaterial({
      name,
      color: 0xffffff,
      map: createSkinTexture({ base, seed, tile: SKIN_TILE, hide: look.hide, contrast: look.contrast }),
      roughness: look.roughness,
      side: THREE.DoubleSide,
    });
    mat.bumpMap = mat.map;
    mat.bumpScale = 0.5;
    addMacroVariation(mat, { scale: 0.4, amount: look.macro });
    // Skins: no light through them, no fibre sheen; the hems ripple with the goat hair's.
    addCloth(mat, { transmission: 0, sheen: 0, wind: true });
    const mesh = new THREE.Mesh(buildLayer(li, rows, (x, z) => [x / SKIN_TILE, z / SKIN_TILE]), mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  skinLayer(1, 'ram-skins', [128, 36, 26], 5, 16, { hide: [1.4, 1.1], contrast: 1, roughness: 0.8, macro: 0.12 });
  // Larger hides, low contrast and a slight oily sheen: leathery rather than paved.
  skinLayer(2, 'tachash-skins', [72, 60, 49], 9, 9, { hide: [2.2, 1.7], contrast: 0.45, roughness: 0.62, macro: 0.16 });

  // ---- Bronze clasps on the goat hair's clasp line (Ex 26:11) ------------------------------
  const bronzeParts = [];
  const xC = xE - (G.claspAt - G.flap);
  const Z = new THREE.Vector3(0, 0, 1);
  const claspGeo = () => new THREE.TorusGeometry(m(0.09), m(0.025), 4, 10).scale(1.6, 1, 1);
  for (let k = 0; k < G.clasps; k++) {
    const across = ((k + 0.5) / G.clasps) * G.curtainLength - G.curtainLength / 2; // + south
    if (Math.abs(across) <= zO) {
      const z = T.centerZ + across;
      const p = [m(xC), m(yG - roofSag(xC, z) + 0.03), m(z)];
      bronzeParts.push(part(claspGeo(), { pos: p, rot: [Math.PI / 2, 0, 0] }));
      continue;
    }
    const smp = path.at(path.sideS(across > 0 ? 'S' : 'N', xC));
    const sl = slantOf(smp);
    const q = Math.abs(across) - zO;
    if (q > hemQ(0, smp, sl) - 0.1) continue;
    const p = pointAt(smp, sl, q, 0.03);
    const n = pointAt(smp, sl, q, 0.13).sub(p).normalize();
    const g = claspGeo().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, n));
    bronzeParts.push(part(g, { pos: [m(p.x), m(p.y), m(p.z)] }));
  }

  // ---- Stakes, cords and hem rings (Ex 35:18; 38:20) ---------------------------------------
  // Each stake's cord runs straight from a silver ring in its layer's hem; the cords of the
  // upper layers pass over the lower layers' slants, so their stakes stand out beyond where the
  // slant would meet the ground. Front ends: a diagonal cord from a ring just in from each
  // side's hem corner, east and outward. The ring lies in the cloth's plane, set through the
  // patch with most of it below the hem; the cord loops round its wire and is knotted.
  const ropeParts = [], silverParts = [];
  const stakeGeo = stakeGeometry();
  const fp = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const stakes = []; // [x, z] in meters (contact AO)
  const tiePoints = []; // ring centres [x, y, z] in meters, per layer (debug, presets)
  const Y = new THREE.Vector3(0, 1, 0), M = new THREE.Matrix4(), qt = new THREE.Quaternion();
  const cub = (v) => v / m(1); // meters to cubits
  const toM = (v) => [m(v.x), m(v.y), m(v.z)];
  const basisPart = (geo, X, Yv, at) => {
    const B = new THREE.Matrix4().makeBasis(X, Yv, new THREE.Vector3().crossVectors(X, Yv));
    B.setPosition(...toM(at));
    return part(geo.applyMatrix4(B));
  };
  // Ring, loop and knot at tie s of layer li; returns the knot (cubits), where the cord leaves.
  const addRing = (li, s, neckOf) => {
    const d = layers[li].gap;
    const smp = path.at(s), sl = slantOf(smp), Q = hemQ(li, smp, sl);
    const hem = pointAt(smp, sl, Q, d);
    const u = hem.clone().sub(pointAt(smp, sl, Q - 0.1, d)).normalize(); // down the cloth
    const n = pointAt(smp, sl, Q, d + 0.1).sub(hem).normalize(); // out of the cloth
    const t = new THREE.Vector3().crossVectors(u, n).normalize(); // along the hem
    const c = pointAt(smp, sl, Q + 0.01, d); // centre just below the hem: the upper third in the patch
    tiePoints.push([...toM(c), li]);
    silverParts.push(basisPart(new THREE.TorusGeometry(RING_R, RING_T, 6, 20), t, u.clone().negate(), c));
    // Loop round the wire's lowest point, in the plane across the wire, toward the stake.
    const b = c.clone().addScaledVector(u, cub(RING_R));
    const neck = neckOf(b);
    const dp = neck.clone().sub(b);
    dp.addScaledVector(t, -dp.dot(t)).normalize();
    const e = new THREE.Vector3().crossVectors(dp, t).normalize();
    const LOOP_T = 0.006, LOOP_R = RING_T + LOOP_T + 0.0005, KNOT = 0.035; // m
    ropeParts.push(basisPart(new THREE.TorusGeometry(LOOP_R, LOOP_T, 5, 8, Math.PI), e, dp.clone().negate(), b));
    const knot = b.clone().addScaledVector(dp, cub(KNOT));
    for (const sg of [1, -1]) {
      const a = b.clone().addScaledVector(e, sg * cub(LOOP_R));
      ropeParts.push(rod(a, knot.clone().addScaledVector(e, sg * cub(0.004)), cub(LOOP_T), 5));
    }
    // Knot: a lump with two wraps.
    ropeParts.push(basisPart(new THREE.SphereGeometry(1, 7, 5).scale(0.011, 0.016, 0.011), e, dp, knot));
    for (const k of [-0.007, 0.007]) {
      const w = new THREE.TorusGeometry(0.0105, 0.0028, 4, 9).rotateX(Math.PI / 2);
      ropeParts.push(basisPart(w, e, dp, knot.clone().addScaledVector(dp, cub(k))));
    }
    return knot;
  };
  // Stake at (sx, sz), leaning away from `from`; its cord runs from layer li's ring at tie s.
  const addStake = (from, sx, sz, li, s) => {
    const ox = sx - from.x, oz = sz - from.z, ol = Math.hypot(ox, oz);
    qt.setFromAxisAngle(new THREE.Vector3(oz / ol, 0, -ox / ol), STAKE_TILT);
    M.compose(new THREE.Vector3(m(sx), 0, m(sz)), qt, new THREE.Vector3(1, 1, 1));
    bronzeParts.push(part(stakeGeo.clone().applyMatrix4(M)));
    stakes.push([m(sx), m(sz)]);
    const neck = new THREE.Vector3(0, STAKE_NECK, 0).applyQuaternion(qt).divideScalar(m(1)).add(new THREE.Vector3(sx, 0, sz));
    const knot = addRing(li, s, () => neck);
    ropeParts.push(rod(knot, neck, 0.016, 4));
    fp.minX = Math.min(fp.minX, sx);
    fp.maxX = Math.max(fp.maxX, sx);
    fp.minZ = Math.min(fp.minZ, sz);
    fp.maxZ = Math.max(fp.maxZ, sz);
  };
  layers.forEach((L, li) => {
    const out = (smp) => mixSide(smp, (k) => L.stakes[k]);
    for (const s of stakeS[li]) {
      const smp = path.at(s);
      const sl = slantOf(smp);
      const hem = pointAt(smp, sl, hemQ(li, smp, sl) - 0.06, L.gap + 0.03);
      addStake(hem, smp.x + smp.nx * out(smp), smp.z + smp.nz * out(smp), li, s);
    }
    for (const [s, sTie] of [[0, TIE_END], [path.total, path.total - TIE_END]]) {
      const smp = path.at(s);
      const sl = slantOf(smp);
      const hem = pointAt(smp, sl, hemQ(li, smp, sl) - 0.06, L.gap + 0.03);
      const hemO = sl.H[0] * L.reach;
      const run = out(smp) - hemO;
      addStake(hem, hem.x + 0.45 * run, smp.z + smp.nz * (hemO + 0.85 * run), li, sTie);
    }
  });
  stakeGeo.dispose();
  group.userData.tiePoints = tiePoints;

  return { group, bronzeParts, ropeParts, silverParts, rect, footprint: fp, stakes };
}
