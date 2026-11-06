import * as THREE from 'three';
import { part } from './bronzeParts.js';
import { TAU, leafGeo, beadRod, beadRingGeo, lobedPlateGeo, Relief, runningScroll, sweepRect, arc, faceMatrix } from './ornament.js';

// Ornament for the altar of incense (reconstruction, at the user's direction; the text gives
// only the crown, Ex 30:3). The ark's vocabulary (ornament.js), plant motifs only, in the
// altar's own tall layout: the crown a profiled moulding (astragal, cove, band with
// bead-and-reel and hanging leaf tips, roll, inner lip); a moulded plinth (roll, a band of
// upright leaves and darts, cove); on each side one tall framed panel holding an almond tree
// rising from a leaf base (volute branches ending in rosettes, almond leaves, a beaded rosette
// medallion at mid-height and a palmette at the top), and above it a frieze under the crown
// with a beaded rosette between two short almond scrolls and, over the ring positions, lobed
// rosette plates (behind the rings on the north and south) or beaded rosettes (east and west);
// a bead-and-reel roll down each corner; leaf calyces round the foot of each horn.
// Ornament sizes are not biblical, so they are in meters. Everything is non-indexed parts for
// the altar's single merged gold mesh. Altar-local frame: origin on the floor at its center.

/** Heights of the mouldings and panels (meters, altar-local), shared with the ground boxes. */
function layout(d) {
  const { S, H, CH } = d;
  const plinthTop = 0.051, crownFoot = H - CH;
  const vb = plinthTop + 0.007, vt = crownFoot - 0.09; // the tall panel's frame
  return { plinthTop, crownFoot, vb, vt, frieze: (vt + crownFoot) / 2, half: S / 2, band: 0.0145 };
}

/**
 * Local-space blocks whose faces are the ground of the relief (for addGoldWear `boxes`): the
 * body (panels, frieze, ring plates), the crown's band and the plinth's leaf band.
 */
export function incenseGroundBoxes(d) {
  const { H, CW, LIP } = d;
  const { plinthTop, crownFoot, half, band } = layout(d);
  const yt = H + LIP;
  return {
    body: { min: [-half, plinthTop, -half], max: [half, crownFoot, half] },
    crownBand: { min: [-half - CW, yt - 0.034, -half - CW], max: [half + CW, yt - 0.0175, half + CW] },
    plinthBand: { min: [-half - band, 0.0135, -half - band], max: [half + band, 0.031, half + band] },
  };
}

/**
 * All ornament parts of the altar. d (meters): { S, H, CW, CH, LIP, ringX, ringY, hornX,
 * hornR } (hornX: the horns' axis from the center along x and z; hornR: their base radius).
 */
export function incenseOrnamentParts(d) {
  const { H, CW, LIP, ringX, ringY, hornX, hornR } = d;
  const { plinthTop, crownFoot, vb, vt, frieze, half, band } = layout(d);
  const out = [];
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // The four faces are alike: build a relief once and copy it onto each face in `list`.
  const onFaces = (r, dist, list = sides) => {
    const g = r.build();
    for (const [nx, nz] of list) out.push(g.clone().applyMatrix4(faceMatrix(nx, nz, dist)));
    g.dispose();
  };

  // ---- The crown (zer, 30:3) --------------------------------------------------------------
  // Astragal, flaring cove, a band, a roll on top, then the inner lip down to the top.
  const y0 = crownFoot, yt = H + LIP;
  const crown = [[0, y0], [0.004, y0], ...arc(0.004, y0 + 0.004, 0.004, -Math.PI / 2, Math.PI / 2, 6)];
  for (let i = 1; i <= 6; i++) { const t = i / 6; crown.push([0.0035 + (CW - 0.005) * t * t, y0 + 0.009 + 0.017 * t]); }
  crown.push([CW, y0 + 0.027], [CW, yt - 0.0175], [CW - 0.0012, yt - 0.0165]);
  crown.push(...arc(CW - 0.0035, yt - 0.0075, 0.0075, -Math.PI * 0.42, Math.PI * 1.05, 12));
  crown.push([0.006, yt - 0.0095], [0, yt - 0.0095], [0, H - 0.002]);
  out.push(sweepRect(crown, half, half));
  // Bead-and-reel on the band and tongue leaves hanging over the cove.
  {
    const r = new Relief();
    const hl = half + CW;
    r.beadLine(-hl, yt - 0.0235, hl, yt - 0.0235, 0.0026, 0.011, true);
    const n = Math.round((2 * hl - 0.01) / 0.0105);
    for (let i = 0; i <= n; i++) {
      const u = -hl + 0.005 + ((2 * hl - 0.01) * i) / n;
      r.leaf(u, yt - 0.027, -Math.PI / 2, 0.016, 0.0085, 0.0022, { blunt: true, nu: 4, nv: 2, curl: -0.004 });
    }
    onFaces(r, hl);
  }

  // ---- Plinth: a roll, a band of upright leaves and darts, a cove into the body ---------------
  const plinth = [[0.016, 0], ...arc(0.016, 0.0065, 0.0065, -Math.PI / 2, Math.PI / 2, 8),
    [band, 0.0135], [band, 0.031], [0.0165, 0.032], [0.0165, 0.035]];
  for (let i = 1; i <= 5; i++) { const t = i / 5; plinth.push([0.0165 * (1 - t) * (1 - t) + 0.0005 * (1 - t), 0.035 + 0.016 * t]); }
  plinth.push([0, plinthTop]);
  out.push(sweepRect(plinth, half, half));
  {
    const r = new Relief();
    const hl = half + band - 0.007, n = Math.round((2 * hl) / 0.012);
    for (let i = 0; i <= n; i++) {
      const u = -hl + (2 * hl * i) / n;
      r.leaf(u, 0.0145, Math.PI / 2, 0.0155, 0.0095, 0.0022, { blunt: true, nu: 4, nv: 2 });
      if (i < n) r.leaf(u + hl / n, 0.0155, Math.PI / 2, 0.011, 0.0034, 0.0016, { nu: 3, nv: 2 }); // dart
    }
    onFaces(r, half + band);
  }

  // ---- Panels and frieze on each side -------------------------------------------------------
  const fw = 0.016, fd = 0.005, ue = half - 0.02;
  const frame = (r) => {
    r.slab(-ue, vb, ue, vb + fw, fd);
    r.slab(-ue, vt - fw, ue, vt, fd);
    r.slab(-ue, vb + fw, -ue + fw, vt - fw, fd);
    r.slab(ue - fw, vb + fw, ue, vt - fw, fd);
    const e = fw + 0.0035, br = 0.003, p = 0.011;
    r.beadLine(-ue + e, vb + e, ue - e, vb + e, br, p);
    r.beadLine(-ue + e, vt - e, ue - e, vt - e, br, p);
    r.beadLine(-ue + e, vb + e, -ue + e, vt - e, br, p);
    r.beadLine(ue - e, vb + e, ue - e, vt - e, br, p);
  };
  // A volute branch from the stem at height v, curling up and out over its eye and down to a
  // rosette, with a leaf on its outer curve.
  const volute = (r, side, v, k) => {
    const C = [side * 0.075 * k, v + 0.05 * k], S0 = [side * 0.004, v];
    const r0 = Math.hypot(S0[0] - C[0], S0[1] - C[1]), th0 = Math.atan2(S0[1] - C[1], S0[0] - C[0]);
    const pts = [];
    for (let j = 0; j <= 28; j++) {
      const f = j / 28, th = th0 - side * f * 1.6 * Math.PI, rr = r0 * Math.pow(0.28, f);
      pts.push([C[0] + rr * Math.cos(th), C[1] + rr * Math.sin(th)]);
    }
    r.stem(pts, 0.0042, 0.0022);
    r.rosette(C[0], C[1], r0 * 0.2, 8, r0 * 0.2 * 0.16);
    for (const [f, len] of [[0.2, 0.04], [0.42, 0.034], [0.64, 0.026]]) {
      const th = th0 - side * f * 1.6 * Math.PI, rr = r0 * Math.pow(0.28, f);
      r.leaf(C[0] + rr * Math.cos(th), C[1] + rr * Math.sin(th), th + side * 0.35, len * k, len * k * 0.38, 0.003);
    }
    // An almond bud on a short shoot inside the curl's foot.
    const f = 0.08, th = th0 - side * f * 1.6 * Math.PI, rr = r0 * Math.pow(0.28, f);
    r.bud(C[0] + rr * Math.cos(th), C[1] + rr * Math.sin(th), Math.PI / 2 - side * 0.5, 0.034 * k);
  };
  const vc = (vb + vt) / 2, mR = 0.068; // the medallion
  const tree = (r) => {
    const v0 = vb + fw + 0.009, vtop = vt - fw - 0.07;
    // Base: a palmette and two leaves lying out along the frame.
    r.palmette(0, v0 + 0.004, Math.PI / 2, 0.052);
    for (const s of [-1, 1]) r.leaf(s * 0.012, v0 + 0.003, Math.PI / 2 - s * 1.25, 0.06, 0.017, 0.003, { curl: 0.002 });
    // Stem in two lengths, broken by the medallion.
    r.stem([[0, v0 + 0.03], [0, vc - mR]], 0.0055, 0.0045);
    r.stem([[0, vc + mR], [0, vtop]], 0.0045, 0.0035);
    r.beadRing(0, vc, mR, 0.004, 34);
    r.rosette(0, vc, mR - 0.012, 14, 0.0065);
    for (const s of [-1, 1]) {
      volute(r, s, v0 + 0.055, 1.3);
      volute(r, s, vc + mR + 0.006, 1.2);
      // Small beaded rosettes in the field's corners.
      for (const v of [v0 + 0.024, vt - fw - 0.03]) {
        r.beadRing(s * 0.157, v, 0.021, 0.0021, 18);
        r.rosette(s * 0.157, v, 0.017, 8, 0.0026);
      }
      // Almond leaf pairs below the medallion and the palmette, and buds beside the medallion.
      r.leaf(s * 0.004, vc - mR - 0.03, Math.PI / 2 - s * 0.6, 0.036, 0.013, 0.003);
      r.leaf(s * 0.004, vc - mR - 0.06, Math.PI / 2 - s * 0.75, 0.03, 0.011, 0.0028);
      r.leaf(s * 0.0035, vtop - 0.025, Math.PI / 2 - s * 0.6, 0.032, 0.012, 0.003);
      r.bud(s * (mR + 0.012), vc, s > 0 ? 0 : Math.PI, 0.05);
      r.leaf(s * (mR + 0.02), vc + 0.005, s > 0 ? 0.7 : Math.PI - 0.7, 0.03, 0.011, 0.0026);
      r.leaf(s * (mR + 0.02), vc - 0.005, s > 0 ? -0.7 : Math.PI + 0.7, 0.03, 0.011, 0.0026);
    }
    r.palmette(0, vtop, Math.PI / 2, 0.058);
  };
  {
    const r = new Relief();
    frame(r);
    tree(r);
    // Frieze: a beaded rosette between two short almond scrolls, a bud at each end.
    r.beadRing(0, frieze, 0.03, 0.0026, 24);
    r.rosette(0, frieze, 0.024, 12, 0.0035);
    for (const dir of [1, -1]) {
      runningScroll(r, (a, t) => [dir * (0.037 + a), frieze + t], ringX - 0.072, 0.012, 1, 0.0026, 0, { rosK: 0.42 });
      r.bud(dir * (ue - 0.016), frieze, dir > 0 ? Math.PI : 0, 0.03);
    }
    onFaces(r, half);
  }
  // Over the ring positions: lobed rosette plates behind the rings and their staples (north
  // and south), beaded rosettes on the east and west.
  {
    const r = new Relief(), e = new Relief();
    for (const u of [-ringX, ringX]) {
      r.push(lobedPlateGeo(0.03, 12, 0.0024), u, ringY);
      r.beadRing(u, ringY, 0.0215, 0.002, 20);
      r.rosette(u, ringY, 0.0175, 10, 0.0026, 0.0036);
      e.beadRing(u, frieze, 0.027, 0.0024, 22);
      e.rosette(u, frieze, 0.022, 10, 0.0032);
    }
    onFaces(r, half, [[0, 1], [0, -1]]);
    onFaces(e, half, [[1, 0], [-1, 0]]);
  }

  // ---- Corners: a bead-and-reel roll down each vertical edge ---------------------------------
  const ch = crownFoot - plinthTop;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rod = beadRod(ch, 0.0055, 0.02, { reel: true, full: true, radial: 4 }).rotateZ(Math.PI / 2);
      out.push(part(rod, { pos: [sx * (half - 0.0008), plinthTop + ch / 2, sz * (half - 0.0008)] }));
    }
  }

  // ---- Horns: a calyx of almond leaves and a bead ring round each foot -----------------------
  const leafA = leafGeo(0.056, 0.027, 0.0036, { nu: 6, nv: 4, curl: 0.006 });
  const leafB = leafGeo(0.036, 0.019, 0.003, { nu: 5, nv: 3, curl: 0.005 });
  const Yv = new THREE.Vector3(0, 1, 0);
  const ring = beadRingGeo(hornR + 0.002, 0.0028, 16).rotateX(-Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const hx = sx * hornX, hz = sz * hornX;
      out.push(part(ring.clone(), { pos: [hx, H + 0.0015, hz] }));
      for (let k = 0; k < 16; k++) {
        const long = k % 2 === 0, a = (k / 16) * TAU + Math.PI / 16;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const rad = hornR + (long ? 0.0012 : 0.0028);
        const px = hx + dir.x * rad, pz = hz + dir.z * rad;
        if (Math.abs(px) > half + 0.001 || Math.abs(pz) > half + 0.001) continue; // inside the crown's lip
        // Leaf frame: length up the horn (leaning in with its taper), face outward.
        const L1 = Yv.clone().addScaledVector(dir, -0.06).normalize();
        const Z1 = dir.clone().addScaledVector(Yv, 0.06).normalize();
        const W1 = new THREE.Vector3().crossVectors(Z1, L1).normalize();
        const Zc = new THREE.Vector3().crossVectors(L1, W1);
        const m4 = new THREE.Matrix4().makeBasis(L1, W1, Zc).setPosition(px, H + 0.002, pz);
        out.push(part((long ? leafA : leafB).clone().applyMatrix4(m4)));
      }
    }
  }
  leafA.dispose();
  leafB.dispose();
  ring.dispose();
  return out;
}
