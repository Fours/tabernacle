import * as THREE from 'three';
import { pushWind, windAttributes } from './cloth.js';

// Gathered, tied-back drapes: a hanging drawn aside to one side of an opening, gathered in
// vertical pleats, cinched by a cord and flaring out below it. Shared by the courtyard gate
// (courtyard.js) and the tent door (tabernacle.js). All values in meters.

export const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Indexed BufferGeometry from a {pos, uv, idx} buffer, with vertex normals. */
export function clothGeometry(buf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  g.setIndex(buf.idx);
  g.computeVertexNormals();
  if (buf.wind) windAttributes(g, buf.wind, buf.windG);
  return g;
}

// Defaults: the courtyard gate's middle panels (5 cubits wide and tall). Shape values are
// gathered widths along the wall from the post: at the hook line, at the tie, the upper swag's
// extra bulge and the flare from tie to hem; pleat depths at the hook line, tie and hem.
const GATE_SHAPE = {
  pleats: 6,
  cols: 132,
  rows: 64,
  wTop: 0.5, wTie: 0.17, swag: 0.32, flare: 0.7,
  aTop: 0.085, aTie: 0.045, aHem: 0.1,
  lift: 0.12, droop: 0.04, pinch: 0.03, outDrift: 0.015,
  // Tie-back cord loop around the bundle and the post (along from the post, offset from the
  // wall line), its two tasselled ends hanging from `knot`.
  loop: [
    [0.0, 0.272], [0.1, 0.268], [0.19, 0.25], [0.225, 0.19], [0.2, 0.13], [0.1, 0.1],
    [0.03, 0.02], [-0.02, -0.105], [-0.1, -0.1], [-0.13, -0.02], [-0.1, 0.1], [-0.05, 0.2],
  ],
  knot: [0.05, 0.28],
  cordR: 0.011,
  tasselLen: 0.3,
  collider: [0.09, -0.01], // tie collider centre: along, offset relative to clothOffset
  windAmp: 0.03, // wind flutter (m) at the hem's leading edge (cloth.js); none above the tie
};

/**
 * Append one gathered drape to `buf`: the cloth that hung from along-coordinate `sp` toward the
 * opening's centre (along 0) is gathered against `sp`, cinched by a cord at `o.tieY`, the
 * leading edge swagging between hook line and tie. UVs follow the flat cloth (material
 * coordinate, via uvFn(along, v)), so embroidery runs along the folds.
 * `wall`: {c:[x,z] centre, a:[ax,az] along axis, n:[nx,nz] offset normal}.
 * `o`: {hangTop, hangH, tieY, clothOffset, tieTexV, clothW?, ...shape overrides}.
 * Returns the tie collider centre [along from sp, offset] in meters.
 */
export function addGatheredDrape(buf, wall, sp, uvFn, opts) {
  const o = { ...GATE_SHAPE, ...opts };
  const { hangTop, hangH, tieY, clothOffset } = o;
  const dir = -Math.sign(sp); // from the post toward the opening's centre
  const clothW = o.clothW ?? Math.abs(sp); // flat panel width
  const [cx, cz] = wall.c, [ax, az] = wall.a, [nx, nz] = wall.n;
  const { cols, rows } = o;
  const vt = (hangTop - tieY) / hangH; // tie in v (0 top .. 1 hem)
  const N = o.pleats;
  const base = buf.pos.length / 3;
  for (let j = 0; j <= rows; j++) {
    // Rows bunched toward the tie so the cinch reads crisply.
    const t = j / rows;
    const v = t < 0.5 ? vt * (1 - Math.pow(1 - 2 * t, 1.6)) : vt + (1 - vt) * Math.pow(2 * t - 1, 1.6);
    let W, A, lift = 0;
    if (v <= vt) {
      const k = v / vt;
      // Gathered at the hook line, swagging toward the opening, pinched at the tie.
      W = o.wTop + (o.wTie - o.wTop) * k + o.swag * Math.sin(Math.PI * Math.pow(k, 0.75)) * (1 - 0.3 * k);
      A = o.aTop + (o.aTie - o.aTop) * smooth(0, 1, k);
    } else {
      const k = (v - vt) / (1 - vt);
      W = o.wTie + o.flare * Math.pow(k, 0.7);
      A = o.aTie + (o.aHem - o.aTie) * Math.pow(k, 0.6);
      lift = o.lift * smooth(0, 1, k); // leading edge pulled up by the diagonal pull
    }
    const pinch = Math.exp(-Math.pow((v - vt) / 0.05, 2)); // bundle pressed to the post at the tie
    const ctr = clothOffset - o.pinch * pinch;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols; // 0 at the post .. 1 leading edge
      const ramp = smooth(0, 0.08, u);
      // Uneven pleat widths that wander a little with height.
      const uw = u + 0.025 * Math.sin(2 * Math.PI * 2.3 * u + 0.8) + 0.012 * Math.sin(2 * Math.PI * 5.1 * u + 2.0 * v);
      const ph = 2 * Math.PI * N * uw + 0.5 * Math.sin(3.1 * v + 2.3 * u) + 0.4 * v;
      const amp = A * (0.7 + 0.35 * Math.sin(2 * Math.PI * 1.7 * u + 1.3) + 0.12 * Math.sin(9 * v + 4 * u)) * ramp;
      const off = ctr + amp * Math.sin(ph) + o.outDrift * u * (1 - pinch);
      const along = u * W + amp * 0.3 * Math.cos(ph) * ramp;
      const s = sp + dir * along;
      const droop = v < vt ? o.droop * u * (1 - v / vt) : 0;
      const y = hangTop - v * hangH - droop + lift * u;
      buf.pos.push(cx + ax * s + nx * off, y, cz + az * s + nz * off);
      const [uu, vv] = uvFn(sp + dir * u * clothW, 1 - v);
      buf.uv.push(uu, vv);
      // Wind: the flared part below the tie flutters, most at the hem's leading edge, none at
      // the post. Gradient: in height and along the wall (W per unit u).
      if (v > vt) {
        const k = (v - vt) / (1 - vt);
        const fu = smooth(0, 0.15, u) * (0.5 + 0.5 * u);
        const fu1 = smooth(0, 0.15, Math.min(1, u + 0.01)) * (0.5 + 0.5 * Math.min(1, u + 0.01));
        const w = o.windAmp * Math.pow(k, 1.5) * fu;
        const dwy = (-o.windAmp * 1.5 * Math.sqrt(k) * fu) / ((1 - vt) * hangH);
        const dwa = (o.windAmp * Math.pow(k, 1.5) * (fu1 - fu)) / (0.01 * Math.max(W, 0.1));
        pushWind(buf, [nx, 0, nz], w, [ax * dir * dwa, dwy, az * dir * dwa]);
      } else pushWind(buf);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      buf.idx.push(a, c, b, b, c, d);
    }
  }

  // Tie-back cord: around the bundle (and the post), knotted with two short tasselled ends.
  const world = (al, off, y) => new THREE.Vector3(
    cx + ax * (sp + dir * al) + nx * off, y, cz + az * (sp + dir * al) + nz * off);
  const loop = o.loop.map(([al, off], k) => world(al, off, tieY + 0.006 * Math.sin(k * 1.9)));
  const parts = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true), 72, o.cordR, 6, true)];
  const cs = o.cordR / 0.011; // tassel thickness follows the cord
  const kd = Math.sign(o.knot[1] - clothOffset) || 1; // tassels drift away from the cloth
  for (const [da, dd, len] of [[0.0, 0.0, o.tasselLen], [0.03, 0.012, o.tasselLen * 0.8]]) {
    const top = [o.knot[0] + da, o.knot[1] + kd * dd];
    const pts = [0, 0.35, 0.7, 1].map((f) =>
      world(top[0] + 0.02 * f * f, top[1] + kd * 0.015 * Math.sin(f * 3), tieY - f * len));
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.008 * cs, 5, false));
    const end = pts[3];
    parts.push(new THREE.CylinderGeometry(0.012 * cs, 0.02 * cs, 0.07, 6).translate(end.x, end.y - 0.03, end.z));
  }
  for (const g of parts) {
    const b0 = buf.pos.length / 3;
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      buf.pos.push(p.getX(k), p.getY(k), p.getZ(k));
      buf.uv.push(0.3 + 0.4 * (k / p.count), o.tieTexV);
      pushWind(buf);
    }
    for (const ix of g.index.array) buf.idx.push(b0 + ix);
    g.dispose();
  }
  return [o.collider[0], clothOffset + o.collider[1]];
}
