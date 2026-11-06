import * as THREE from 'three';
import { part } from './bronzeParts.js';
import { TAU, leafGeo, Relief, runningScroll, sweepRect, arc, faceMatrix, lobedPlateGeo } from './ornament.js';

// Ornament for the table of showbread (reconstruction, at the user's direction; the text gives
// only the crown round the top and the frame with its own crown, Ex 25:24-25). The ark's
// vocabulary (ornament.js), plant motifs only, in the table's own layout: a profiled crown with
// bead-and-reel and hanging leaf tips; the frame's crown as a rolled moulding along its foot;
// on the frame's band a running almond scroll with rosettes between beaded edges, a rosette
// over each leg and lobed rosette plates behind the rings; leaf collars at the head and near
// the foot of each leg, an almond vine up each leg face, and leaf-wrapped bun feet.
// Ornament sizes are not biblical, so they are in meters. Everything is non-indexed parts for
// the table's single merged gold mesh. Table-local frame: origin on the floor, long axis x.

const tmp = new THREE.Matrix4();

/**
 * All ornament parts of the table. d (meters): { L, W, H, TOP, FRAME_H, INSET, LEG, CW, CH,
 * FC, wrap, legX, legZ, ringY }.
 */
export function showbreadOrnamentParts(d) {
  const { L, W, H, TOP, FRAME_H, INSET, LEG, CW, CH, FC, wrap, legX, legZ, ringY } = d;
  const out = [];

  // ---- The crown (zer) round the top: wraps the slab's edge and rises CH above it ----------
  // Astragal, flaring cove, a band, a fat roll on top, then the inner lip down to the slab.
  const y0 = H - wrap, yt = H + CH, band = 0.005, inner = -(CW - 0.0036);
  const crown = [[0, y0], ...arc(0.0035, y0 + 0.0035, 0.0035, -Math.PI / 2, Math.PI / 2, 6)];
  for (let i = 1; i <= 5; i++) { const t = i / 5; crown.push([0.0032 + (band - 0.0032) * t * t, y0 + 0.007 + 0.009 * t]); }
  crown.push([band, yt - 0.0135], [band - 0.001, yt - 0.0122]);
  crown.push(...arc(0.003, yt - 0.0055, 0.0055, -Math.PI * 0.42, Math.PI * 1.05, 12));
  crown.push([-0.003, yt - 0.008], [inner, yt - 0.0105], [inner, H - 0.001]);
  out.push(sweepRect(crown, L / 2, W / 2));
  // Bead-and-reel under the roll and a row of tongue leaves hanging from it.
  for (const [nx, nz, half, span] of [[1, 0, L / 2, W], [-1, 0, L / 2, W], [0, 1, W / 2, L], [0, -1, W / 2, L]]) {
    const r = new Relief();
    const hl = span / 2 + band;
    r.beadLine(-hl, yt - 0.0145, hl, yt - 0.0145, 0.0026, 0.011, true);
    const n = Math.round((2 * hl - 0.008) / 0.0105);
    for (let i = 0; i <= n; i++) {
      const u = -hl + 0.004 + ((2 * hl - 0.008) * i) / n;
      r.leaf(u, yt - 0.017, -Math.PI / 2, 0.013, 0.0075, 0.002, { blunt: true, nu: 4, nv: 2 });
    }
    out.push(r.build(faceMatrix(nx, nz, half + band)));
  }

  // ---- The frame (misgeret) and its crown (25:25) ----------------------------------------
  const fx = L / 2 - INSET, fz = W / 2 - INSET; // the frame's (and legs') outer faces
  const yb = H - TOP - FRAME_H; // foot of the frame
  // The frame's crown: a rolled moulding along its foot, round the legs too.
  const fr = FC / 2;
  const fcrown = [[0, yb], ...arc(fr - 0.0003, yb + fr, fr, -Math.PI / 2, Math.PI / 2, 8),
    [0.003, yb + FC + 0.001], [0.003, yb + FC + 0.003], [0, yb + FC + 0.004]];
  out.push(sweepRect(fcrown, fx, fz));

  // The band: beaded edges, a central rosette in a bead ring, a running almond scroll to each
  // side, and over each leg a rosette (short sides) or a lobed plate behind the ring (long sides).
  const vb = yb + FC + 0.0075, vt = H - TOP - 0.0035, vc = (vb + vt) / 2, A = (vt - vb) / 2 - 0.0135;
  for (const [nx, nz, dist, between, legU, rings] of [
    [0, 1, fz, legX - LEG / 2, legX, true], [0, -1, fz, legX - LEG / 2, legX, true],
    [1, 0, fx, legZ - LEG / 2, legZ, false], [-1, 0, fx, legZ - LEG / 2, legZ, false],
  ]) {
    const r = new Relief();
    r.beadLine(-between, vb, between, vb, 0.0024, 0.009);
    r.beadLine(-between, vt, between, vt, 0.0024, 0.009);
    r.beadRing(0, vc, 0.0215, 0.0022, 22);
    r.rosette(0, vc, 0.0175, 12, 0.0026);
    const s0 = 0.03, len = between - s0 - 0.006;
    const waves = Math.max(1.5, Math.round(len / 0.085 * 2) / 2);
    for (const dir of [1, -1]) {
      runningScroll(r, (a, t) => [dir * (s0 + a), vc + t], len, A, waves, 0.0028, 0, { rosK: 0.42 });
    }
    for (const su of [-1, 1]) {
      if (rings) {
        // Lobed rosette plate behind the ring and its staple.
        r.push(lobedPlateGeo(0.0245, 12, 0.0022), su * legU, ringY);
        r.beadRing(su * legU, ringY, 0.0175, 0.0018, 18);
        r.rosette(su * legU, ringY, 0.0145, 10, 0.0022, 0.0033);
      } else {
        r.beadRing(su * legU, vc, 0.0185, 0.0019, 20);
        r.rosette(su * legU, vc, 0.0155, 10, 0.0024);
      }
    }
    out.push(r.build(faceMatrix(nx, nz, dist)));
  }

  // ---- Legs: leaf collars, an almond vine on each face, leaf-wrapped feet ------------------
  const hl = LEG / 2, cp = 0.0035; // collar's projection from the leg faces
  const cTop = yb, cLow = 0.115, footH = 0.042;
  const legRelief = (r) => {
    // Upper collar: a band under the frame's crown with three leaves hanging from it.
    r.slab(-hl - cp, cTop - 0.009, hl + cp, cTop, cp);
    r.beadLine(-hl - cp, cTop - 0.011, hl + cp, cTop - 0.011, 0.0022, 0.008);
    for (const u of [-0.017, 0, 0.017]) r.push(leafGeo(0.03, 0.018, 0.003, { curl: 0.004 }), u, cTop - 0.012, -Math.PI / 2, cp * 0.6);
    // Lower collar: a band with a bead below and three leaves rising from it.
    r.slab(-hl - cp, cLow - 0.005, hl + cp, cLow + 0.005, cp);
    r.beadLine(-hl - cp, cLow - 0.0075, hl + cp, cLow - 0.0075, 0.0022, 0.008);
    for (const u of [-0.017, 0, 0.017]) r.push(leafGeo(0.03, 0.018, 0.003, { curl: 0.004 }), u, cLow + 0.005, Math.PI / 2, cp * 0.6);
    // Almond vine: a waving stem with a leaf at each bend and a bud at the top.
    const v0 = cLow + 0.03, v1 = cTop - 0.045, lam = 0.07, amp = 0.0065;
    const pts = [];
    for (let i = 0; i <= 80; i++) { const v = v0 + ((v1 - v0) * i) / 80; pts.push([amp * Math.sin((TAU * (v - v0)) / lam), v]); }
    r.stem(pts, 0.0024, 0.0017);
    for (let k = 0; v0 + lam / 4 + (k * lam) / 2 < v1 - 0.01; k++) {
      const v = v0 + lam / 4 + (k * lam) / 2, side = k % 2 === 0 ? 1 : -1;
      r.leaf(side * amp, v, Math.PI / 2 - side * 0.85, 0.017, 0.0068, 0.0021);
      r.leaf(side * amp * 0.4, v - lam * 0.12, Math.PI / 2 + side * 1.9, 0.011, 0.0048, 0.0017, { nu: 4, nv: 2 });
    }
    r.bud(0, v1 + 0.002, Math.PI / 2, 0.016);
    r.rosette(0, v0 - 0.006, 0.0075, 6, 0.0016);
  };
  // Foot: a round bun under a collar, wrapped in eight almond leaves turned down.
  const footProf = [[0.0001, 0], [0.03, 0], [0.037, 0.005], [0.04, 0.012], [0.038, 0.02], [0.032, 0.027], [0.029, 0.031],
    [0.034, 0.034], [0.038, 0.037], [0.035, footH], [0.0001, footH]];
  const footBase = new THREE.LatheGeometry(footProf.map(([rr, y]) => new THREE.Vector2(rr, y)), 16);
  const leafT = leafGeo(0.03, 0.019, 0.003, { nu: 6, nv: 4, curl: 0.003 });
  const Yv = new THREE.Vector3(0, 1, 0), Dn = new THREE.Vector3(0, -1, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = sx * legX, lz = sz * legZ;
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = new Relief();
        legRelief(r);
        out.push(r.build(tmp.makeTranslation(lx, 0, lz).multiply(faceMatrix(nx, nz, hl))));
      }
      out.push(part(footBase.clone(), { pos: [lx, 0, lz] }));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU, rad = k % 2 ? 0.031 : 0.028;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const L1 = Dn.clone().addScaledVector(dir, 0.3).normalize();
        const Z1 = dir.clone().addScaledVector(Yv, 0.3).normalize();
        const W1 = new THREE.Vector3().crossVectors(Z1, L1).normalize();
        const Zc = new THREE.Vector3().crossVectors(L1, W1);
        const m4 = new THREE.Matrix4().makeBasis(L1, W1, Zc).setPosition(lx + dir.x * rad, footH - 0.002, lz + dir.z * rad);
        out.push(part(leafT.clone().applyMatrix4(m4)));
      }
    }
  }
  footBase.dispose();
  leafT.dispose();
  return out;
}
