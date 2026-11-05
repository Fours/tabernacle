import * as THREE from 'three';
import { TABERNACLE as T, m } from '../config/dimensions.js';
import { createGoatHairTexture, createSkinTexture } from './textiles.js';
import { part } from './bronzeParts.js';

// Tabernacle coverings (Ex 26:7-14) draped over a flat roof. Everything here is computed in
// cubits and converted with m() when written to geometry.
//
// A covering = a flat roof grid (with a slight sag between the walls) plus a "skirt": one
// closed strip running around the roof perimeter that rounds over the roof edge and hangs
// down to a hem. At the corners the skirt fans around the corner point, so the cloth drapes
// as a rounded cone with extra folds instead of a sharp box corner.

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

/**
 * Perimeter of rect {xW, xE, zN, zS} as segments, counter-clockwise seen from above starting
 * at the east end of the south side: S, SW corner, W, NW corner, N, NE corner, E, SE corner.
 * `at(s)` returns a sample {x, z, nx, nz, side, from, to, f, s}.
 */
function makePerimeter(rect, cornerLen) {
  const { xW, xE, zN, zS } = rect;
  const segs = [
    { line: [xE, zS, xW, zS], a: Math.PI / 2, side: 'S' },
    { corner: [xW, zS], a0: Math.PI / 2, a1: Math.PI, from: 'S', to: 'W' },
    { line: [xW, zS, xW, zN], a: Math.PI, side: 'W' },
    { corner: [xW, zN], a0: Math.PI, a1: 1.5 * Math.PI, from: 'W', to: 'N' },
    { line: [xW, zN, xE, zN], a: 1.5 * Math.PI, side: 'N' },
    { corner: [xE, zN], a0: 1.5 * Math.PI, a1: 2 * Math.PI, from: 'N', to: 'E' },
    { line: [xE, zN, xE, zS], a: 0, side: 'E' },
    { corner: [xE, zS], a0: 0, a1: Math.PI / 2, from: 'E', to: 'S' },
  ];
  let s = 0;
  for (const g of segs) {
    g.s0 = s;
    g.len = g.line ? Math.hypot(g.line[2] - g.line[0], g.line[3] - g.line[1]) : cornerLen;
    s += g.len;
  }
  const total = s;
  const at = (sIn) => {
    const sv = ((sIn % total) + total) % total;
    const g = segs.find((q) => sv < q.s0 + q.len) || segs[segs.length - 1];
    const f = (sv - g.s0) / g.len;
    if (g.line) {
      const [x0, z0, x1, z1] = g.line;
      return { x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f, nx: Math.cos(g.a), nz: Math.sin(g.a), side: g.side, f, s: sv };
    }
    const a = g.a0 + (g.a1 - g.a0) * f;
    return { x: g.corner[0], z: g.corner[1], nx: Math.cos(a), nz: Math.sin(a), side: 'corner', from: g.from, to: g.to, f, s: sv };
  };
  // Sample positions: ~`step` apart on the sides, `cornerSteps` per corner.
  const samples = (step, cornerSteps) => {
    const out = [];
    for (const g of segs) {
      const n = g.line ? Math.max(1, Math.round(g.len / step)) : cornerSteps;
      for (let i = 0; i < n; i++) out.push(at(g.s0 + (g.len * i) / n));
    }
    return out;
  };
  const cornerS = segs.filter((g) => g.corner).map((g) => g.s0 + g.len / 2);
  // s at a given x on the south/north side.
  const sideS = (side, x) => (side === 'S' ? xE - x : segs[4].s0 + (x - xW));
  return { at, samples, total, cornerS, sideS };
}

/**
 * Build one covering. opts: rect, y (roof surface height), edgeR, hem(sample) -> hem y,
 * standOff(y, sample) -> extra outward offset, fold(sample, t) -> extra outward offset at
 * drop fraction t, uv(xu, zu) -> [u, v] from "unfolded" plan coordinates.
 */
function buildCovering(opts) {
  const { rect, y: Y, edgeR: R, uv } = opts;
  const per = makePerimeter(rect, opts.cornerLen ?? 1.2);
  const ARC = opts.arcRows ?? 4, DROP = opts.dropRows ?? 20;

  // Profile from the roof edge to the hem for one sample: [{o, y, q}] (o = outward offset,
  // q = distance along the cloth from the roof edge).
  const profile = (smp) => {
    const Yt = Y - roofSag(smp.x, smp.z);
    const pts = [];
    for (let k = 0; k <= ARC; k++) {
      const a = (k / ARC) * (Math.PI / 2);
      pts.push({ o: R * Math.sin(a), y: Yt - R * (1 - Math.cos(a)), q: R * a });
    }
    const y0 = Yt - R, q0 = (R * Math.PI) / 2;
    const H = Math.min(opts.hem(smp), y0 - 1e-3);
    for (let k = 1; k <= DROP; k++) {
      const t = k / DROP;
      const yy = y0 + (H - y0) * t;
      pts.push({ o: R + opts.standOff(yy, smp) + opts.fold(smp, t), y: yy, q: q0 + (y0 - yy) });
    }
    return pts;
  };
  // World point (cubits) at distance q down the cloth from the roof edge.
  const pointAt = (smp, q) => {
    const pts = profile(smp);
    let k = 1;
    while (k < pts.length - 1 && pts[k].q < q) k++;
    const a = pts[k - 1], b = pts[k];
    const f = Math.min(1, Math.max(0, (q - a.q) / (b.q - a.q || 1)));
    const o = a.o + (b.o - a.o) * f, yy = a.y + (b.y - a.y) * f;
    return new THREE.Vector3(smp.x + smp.nx * o, yy, smp.z + smp.nz * o);
  };
  const hemPoint = (smp) => {
    const p = profile(smp).at(-1);
    return new THREE.Vector3(smp.x + smp.nx * p.o, p.y, smp.z + smp.nz * p.o);
  };

  const pos = [], uvs = [], idx = [];
  // Roof grid.
  const { xW, xE, zN, zS } = rect;
  const nx = Math.max(2, Math.round((xE - xW) / (opts.roofStepX ?? 1)));
  const nz = Math.max(2, Math.round((zS - zN) / (opts.roofStepZ ?? 0.5)));
  for (let j = 0; j <= nz; j++) {
    const z = zN + ((zS - zN) * j) / nz;
    for (let i = 0; i <= nx; i++) {
      const x = xW + ((xE - xW) * i) / nx;
      pos.push(m(x), m(Y - roofSag(x, z)), m(z));
      uvs.push(...uv(x, z));
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Skirt.
  const samples = per.samples(opts.step ?? 0.25, opts.cornerSteps ?? 10);
  const base = pos.length / 3;
  const rows = ARC + DROP + 1;
  for (const smp of samples) {
    for (const p of profile(smp)) {
      pos.push(m(smp.x + smp.nx * p.o), m(p.y), m(smp.z + smp.nz * p.o));
      uvs.push(...uv(smp.x + smp.nx * p.q, smp.z + smp.nz * p.q));
    }
  }
  const N = samples.length;
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    for (let j = 0; j < rows - 1; j++) {
      const a = base + i * rows + j, b = base + i2 * rows + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, per, pointAt, hemPoint };
}

/** Cylinder between two points (cubits), as a mergeable part. */
function rod(a, b, r, radial = 5) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(m(r), m(r), m(d.length()), radial, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const c = a.clone().add(b).multiplyScalar(0.5);
  return part(g, { pos: [m(c.x), m(c.y), m(c.z)] });
}

/**
 * Build the goat-hair, ram-skin and tachash coverings.
 * Returns { group, bronzeParts, ropeParts, footprint } (parts are geometries to merge).
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

  // ---- Goat hair -------------------------------------------------------------------------
  // Material coordinates (cubits): E-W from the front flap's hem (0) westward; N-S across the
  // 30-cubit curtains. Curtain joins fall every 4 cubits; the clasp line at G.claspAt.
  const matU = (x) => G.flap + (xE - x);
  const matV = (z) => G.curtainLength / 2 + (z - T.centerZ);
  const hemOf = { S: G.hemSide, N: G.hemSide, W: G.hemBack, E: yG - G.flap };
  // Tent pins along the sides, at the hem under each curtain join, plus the two back corners.
  const pegXs = [];
  for (let u = G.flap + G.curtainWidth; u < G.flap + (xE - xW); u += G.curtainWidth) pegXs.push(xE - (u - G.flap));
  const perG = makePerimeter(rect, 1.2);
  const pegS = [...pegXs.flatMap((x) => [perG.sideS('S', x), perG.sideS('N', x)]), perG.cornerS[0], perG.cornerS[1]];
  const near = (s, list, w) => {
    let v = 0;
    for (const p of list) {
      let d = Math.abs(s - p);
      d = Math.min(d, perG.total - d);
      v = Math.max(v, Math.exp(-((d / w) ** 2)));
    }
    return v;
  };
  const bars = T.barHeights;
  const goat = buildCovering({
    rect,
    y: yG,
    edgeR: G.edgeRadius,
    dropRows: 26,
    hem(smp) {
      let h = hemOf[smp.side];
      if (smp.side === 'corner') {
        // Back corners blend across the corner; at the front the side curtain keeps its hem
        // round the corner and the flap starts at the front face (a near-vertical edge).
        let w = smooth(0, 1, smp.f);
        if (smp.to === 'E') w = smooth(0.8, 1, smp.f);
        if (smp.from === 'E') w = smooth(0, 0.2, smp.f);
        h = hemOf[smp.from] + (hemOf[smp.to] - hemOf[smp.from]) * w;
      }
      const wave = smp.side === 'E' ? 0.02 * Math.sin(smp.s * 3.1) : 0.07 * Math.sin(smp.s * 1.9) + 0.04 * Math.sin(smp.s * 4.7 + 1);
      return h + wave + 0.06 * near(smp.s, pegS, 0.6);
    },
    standOff(y, smp) {
      if (smp.side === 'E') return 0.02;
      // Out over the top bar, then hanging just clear of the bars and rings.
      let o = G.standOff * (1 - smooth(bars[2] - 0.2, yG - G.edgeRadius, y));
      for (const b of bars) o += 0.05 * Math.exp(-(((y - b) / 0.35) ** 2));
      return o;
    },
    fold(smp, t) {
      const s = smp.s;
      const wave =
        0.5 +
        0.5 *
          (0.5 * Math.sin((2 * Math.PI * s) / 2.3 + 0.4) +
            0.3 * Math.sin((2 * Math.PI * s) / 1.1 + 1.3) +
            0.2 * Math.sin((2 * Math.PI * s) / 0.53 + 2.9));
      const corner = near(s, perG.cornerS, 1.3);
      const amp = (smp.side === 'E' ? 0.04 : G.foldAmp) * t ** 1.2 * (1 + 1.8 * corner);
      const pull = 0.3 * near(s, pegS, 0.8) * t ** 2.5;
      return amp * wave + pull;
    },
    uv: (x, z) => [matU(x) / G.curtainWidth, matV(z) / 2],
  });
  const hairTex = createGoatHairTexture();
  const hairMat = new THREE.MeshStandardMaterial({
    name: 'goat-hair',
    color: 0xffffff,
    map: hairTex,
    bumpMap: hairTex,
    bumpScale: 0.5,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const goatMesh = new THREE.Mesh(goat.geo, hairMat);
  goatMesh.name = 'goat-hair-covering';
  goatMesh.castShadow = goatMesh.receiveShadow = true;
  group.add(goatMesh);

  // ---- Ram skins dyed red, then tachash: roof only ----------------------------------------
  const R = T.ramSkins, K = T.tachash;
  const skinLayer = (name, base, seed, r, y, edgeR, droop, amp) => {
    const layer = buildCovering({
      rect: r,
      y,
      edgeR,
      arcRows: 3,
      dropRows: 2,
      roofStepX: 1,
      roofStepZ: 0.5,
      step: 0.5,
      cornerSteps: 4,
      cornerLen: 0.6,
      hem: (smp) => y - edgeR - droop + 0.04 * Math.sin(smp.s * 2.3),
      standOff: () => 0,
      fold: (smp, t) => amp * t * (0.5 + 0.5 * Math.sin(smp.s * 3.7)),
      uv: (x, z) => [x / 4, z / 4],
    });
    const mat = new THREE.MeshStandardMaterial({
      name,
      color: 0xffffff,
      map: createSkinTexture({ base, seed }),
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    mat.bumpMap = mat.map;
    mat.bumpScale = 0.8;
    const mesh = new THREE.Mesh(layer.geo, mat);
    mesh.name = name;
    group.add(mesh);
  };
  skinLayer(
    'ram-skins',
    [128, 36, 26],
    5,
    { xW: xW - R.margin, xE: xE + R.margin, zN: rect.zN - R.margin, zS: rect.zS + R.margin },
    TOP + R.above,
    R.edgeRadius,
    R.droop - R.edgeRadius,
    0.04,
  );
  skinLayer(
    'tachash-skins',
    [80, 74, 66],
    9,
    { xW: xW + K.inset, xE: xE - K.inset, zN: rect.zN + K.inset, zS: rect.zS - K.inset },
    TOP + K.above,
    K.edgeRadius,
    K.droop,
    0,
  );

  // ---- Bronze clasps on the clasp line (Ex 26:11) -----------------------------------------
  const bronzeParts = [];
  const xC = xE - (G.claspAt - G.flap);
  const claspGeo = () => new THREE.TorusGeometry(m(0.09), m(0.025), 4, 10);
  for (let k = 0; k < G.clasps; k++) {
    const v = ((k + 0.5) / G.clasps) * G.curtainLength; // across the material
    const across = v - G.curtainLength / 2; // + south
    if (Math.abs(across) <= zO) {
      const z = T.centerZ + across;
      const p = [m(xC), m(yG - roofSag(xC, z) + 0.03), m(z)];
      bronzeParts.push(part(claspGeo().scale(1.6, 1, 1), { pos: p, rot: [Math.PI / 2, 0, 0] }));
    } else {
      const side = across > 0 ? 'S' : 'N';
      const smp = goat.per.at(goat.per.sideS(side, xC));
      const q = Math.abs(across) - zO;
      const p = goat.pointAt(smp, q).addScaledVector(new THREE.Vector3(smp.nx, 0, smp.nz), 0.03);
      bronzeParts.push(part(claspGeo().scale(1.6, 1, 1), { pos: [m(p.x), m(p.y), m(p.z)] }));
    }
  }

  // ---- Tent pins and cords (Ex 35:18) -----------------------------------------------------
  const ropeParts = [];
  for (const s of pegS) {
    const smp = goat.per.at(s);
    const hem = goat.hemPoint(smp);
    const peg = new THREE.Vector3(hem.x + smp.nx * G.pegDistance, 0, hem.z + smp.nz * G.pegDistance);
    const top = new THREE.Vector3(peg.x, 0.45, peg.z);
    bronzeParts.push(part(new THREE.CylinderGeometry(m(0.05), m(0.035), m(0.6), 6), { pos: [m(peg.x), m(0.2), m(peg.z)] }));
    bronzeParts.push(part(new THREE.CylinderGeometry(m(0.09), m(0.07), m(0.08), 8), { pos: [m(peg.x), m(0.52), m(peg.z)] }));
    ropeParts.push(rod(hem.clone().add(new THREE.Vector3(0, 0.05, 0)), top, 0.022));
  }

  return { group, bronzeParts, ropeParts, rect, standOut: G.edgeRadius + G.standOff + 0.25 };
}
