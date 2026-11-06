import * as THREE from 'three';
import { part } from './bronzeParts.js';
import {
  TAU, leafGeo, beadRod, lobedPlateGeo, Relief, runningScroll, sweepRect, arc, faceMatrix,
} from './ornament.js';

// Ornament for the ark (reconstruction, at the user's direction; the text gives only the crown,
// Ex 25:11): a profiled crown with bead-and-reel and leaf tips, a moulded plinth, framed and
// recessed panels on all four sides with almond-leaf scrollwork and rosettes, corner pilasters,
// leaf feet, lobed plates behind the rings, and a palmette-and-almond frieze with corner
// rosettes around the mercy seat inside the crown. Ancient Near Eastern plant motifs only.
//
// Everything is real relief geometry, returned as non-indexed parts for the ark's single
// merged gold mesh. Ornament sizes are not biblical, so they are given here in meters.
// Reliefs are built flat in a local plane (x, y in the plane, z out of the surface) and mapped
// onto a face of the chest with a rotation matrix. The helpers are in ornament.js.

// ---- The ornament -------------------------------------------------------------------------

/**
 * All ornament parts of the chest. d: the ark's dimensions in meters:
 * { W, L, H, FH, FS, SEAT_TOP, CW, C_BELOW, C_LIP, ringX, ringY, RING_R }.
 */
export function arkOrnamentParts(d) {
  const { W, L, H, FH, FS, SEAT_TOP, CW, C_BELOW, C_LIP, ringX, ringY } = d;
  const out = [];
  const y0 = H - C_BELOW, y1 = SEAT_TOP + C_LIP;

  // Crown (zer): astragal, flaring cove, a tall band, a fat roll on top, and its inner lip
  // standing above the mercy seat.
  const rr = CW * 0.55, rcx = CW - rr * 0.4;
  const crown = [[0, y0], [0.008, y0], ...arc(0.008, y0 + 0.007, 0.007, -Math.PI / 2, Math.PI / 2, 6)];
  for (let i = 1; i <= 6; i++) { const t = i / 6; crown.push([0.006 + (CW - 0.006 - 0.0015) * t * t, y0 + 0.014 + 0.031 * t]); }
  crown.push([CW, y0 + 0.047], [CW, y1 - 0.024], [CW - 0.002, y1 - 0.02]);
  crown.push(...arc(rcx, y1, rr, -Math.PI * 0.42, Math.PI * 1.05, 14));
  crown.push([0, y1 - 0.006], [0, SEAT_TOP - 0.002]);
  out.push(sweepRect(crown, W / 2, L / 2));

  // Plinth near the foot of the body: a roll, a fillet and a cove.
  const PL = FH + 0.045;
  const plinth = [[0, FH], [0.006, FH], ...arc(0.006, FH + 0.009, 0.009, -Math.PI / 2, Math.PI / 2, 8),
    [0.009, FH + 0.02], [0.009, FH + 0.026]];
  for (let i = 1; i <= 5; i++) { const t = i / 5; plinth.push([0.009 * (1 - t) * (1 - t) + 0.0005, FH + 0.026 + 0.019 * t]); }
  plinth.push([0, PL]);
  out.push(sweepRect(plinth, W / 2, L / 2));

  // Crown band: bead-and-reel under the roll and a row of tongue leaves hanging below it.
  for (const [nx, nz, half, span] of [[1, 0, W / 2, L], [-1, 0, W / 2, L], [0, 1, L / 2, W], [0, -1, L / 2, W]]) {
    const r = new Relief();
    const hl = span / 2 + CW;
    r.beadLine(-hl, y1 - 0.031, hl, y1 - 0.031, 0.0055, 0.022, true);
    const n = Math.round((2 * hl - 0.02) / 0.024);
    for (let i = 0; i <= n; i++) {
      const u = -hl + 0.01 + ((2 * hl - 0.02) * i) / n;
      r.leaf(u, y1 - 0.038, -Math.PI / 2, 0.036, 0.017, 0.0045, { blunt: true, nu: 4, nv: 2 });
    }
    out.push(r.build(faceMatrix(nx, nz, half + CW)));
  }

  // Panels: raised frames with beaded inner edges around recessed fields.
  const vb = PL + 0.007, vt = y0 - 0.016, fw = 0.024, fd = 0.007, vc = (vb + vt) / 2;
  const frame = (r, u0, v0, u1, v1, beads = true) => {
    r.slab(u0, v0, u1, v0 + fw, fd);
    r.slab(u0, v1 - fw, u1, v1, fd);
    r.slab(u0, v0 + fw, u0 + fw, v1 - fw, fd);
    r.slab(u1 - fw, v0 + fw, u1, v1 - fw, fd);
    if (!beads) return;
    const e = fw + 0.004, br = 0.004, p = 0.014;
    r.beadLine(u0 + e, v0 + e, u1 - e, v0 + e, br, p);
    r.beadLine(u0 + e, v1 - e, u1 - e, v1 - e, br, p);
    r.beadLine(u0 + e, v0 + e, u0 + e, v1 - e, br, p);
    r.beadLine(u1 - e, v0 + e, u1 - e, v1 - e, br, p);
  };
  const PIL = 0.028; // corner pilasters reach this far in from each corner
  // Long sides (east and west): one panel with a central medallion and scrolls to each end.
  for (const s of [1, -1]) {
    const r = new Relief();
    const ue = L / 2 - PIL - 0.006;
    frame(r, -ue, vb, ue, vt);
    r.beadRing(0, vc, 0.1, 0.0055, 40);
    r.rosette(0, vc, 0.084, 16, 0.009);
    const fe = ue - fw - 0.012;
    for (const dir of [1, -1]) {
      runningScroll(r, (a, t) => [dir * (0.11 + a), vc + t], fe - 0.11, 0.115, 1.5, 0.0055, 0.05);
    }
    out.push(r.build(faceMatrix(s, 0, W / 2)));
  }
  // Short sides (north and south): a central panel with a medallion and scrolls up and down,
  // and narrow side panels above the rings with an almond-leaf palmette column; lobed plates
  // behind the rings.
  for (const s of [1, -1]) {
    const r = new Relief();
    const uc = 0.19;
    frame(r, -uc, vb, uc, vt);
    r.beadRing(0, vc, 0.072, 0.005, 30);
    r.rosette(0, vc, 0.06, 12, 0.007);
    const fe = (vt - vb) / 2 - fw - 0.012;
    for (const dir of [1, -1]) runningScroll(r, (a, t) => [t, vc + dir * (0.078 + a)], fe - 0.078, 0.05, 1, 0.0036);
    const so = W / 2 - PIL - 0.006, si = uc + 0.008, sb = ringY + 0.075;
    for (const side of [1, -1]) {
      const a0 = side * si, a1 = side * so, um = (a0 + a1) / 2;
      frame(r, Math.min(a0, a1), sb, Math.max(a0, a1), vt, false);
      const cb = sb + fw + 0.03, ct = vt - fw - 0.06;
      r.rosette(um, cb - 0.012, 0.016, 8, 0.003);
      r.stem([[um, cb], [um, ct]], 0.0035, 0.003);
      for (let k = 0; k < 4; k++) {
        const v = cb + 0.02 + ((ct - cb - 0.03) * k) / 3;
        for (const sd of [-1, 1]) r.leaf(um, v, Math.PI / 2 + sd * 0.9, 0.034, 0.013, 0.003);
      }
      r.palmette(um, ct, Math.PI / 2, 0.052);
      // Ring plate: a lobed plate with a rosette, behind the ring and its staple.
      r.push(lobedPlateGeo(0.034, 12, 0.003), side * ringX, ringY + 0.016);
      r.rosette(side * ringX, ringY + 0.016, 0.022, 10, 0.0028, 0.0045);
    }
    out.push(r.build(faceMatrix(0, s, L / 2)));
  }

  // Corner pilasters: a square post proud of both faces with a base, a capital and a
  // bead-and-reel roll down its edge.
  const pp = 0.007;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (W / 2 + pp - (PIL + pp) / 2), cz = sz * (L / 2 + pp - (PIL + pp) / 2);
      const ph = y0 - PL;
      out.push(part(new THREE.BoxGeometry(PIL + pp, ph, PIL + pp), { pos: [cx, PL + ph / 2, cz] }));
      for (const [yy, hh] of [[PL + 0.007, 0.014], [y0 - 0.008, 0.016]]) {
        out.push(part(new THREE.BoxGeometry(PIL + pp + 0.006, hh, PIL + pp + 0.006), { pos: [cx, yy, cz] }));
      }
      const rod = beadRod(ph - 0.034, 0.0062, 0.02, { reel: true, full: true, radial: 4 }).rotateZ(Math.PI / 2);
      out.push(part(rod, { pos: [sx * (W / 2 + pp - 0.001), PL + 0.015 + (ph - 0.034) / 2, sz * (L / 2 + pp - 0.001)] }));
    }
  }

  // Feet: a round bun under a collar, wrapped in six almond leaves turned down.
  const footProf = [[0.0001, 0], [0.03, 0], [0.04, 0.006], [0.045, 0.016], [0.043, 0.026], [0.035, 0.036], [0.031, 0.042],
    [0.036, 0.046], [0.047, 0.05], [0.049, 0.055], [0.045, 0.058], [0.05, FH], [0.0001, FH]];
  const footBase = new THREE.LatheGeometry(footProf.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const leafT = leafGeo(0.042, 0.026, 0.004, { nu: 6, nv: 4, curl: 0.004 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const fx = sx * (W / 2 - FS / 2), fz = sz * (L / 2 - FS / 2);
      out.push(part(footBase.clone(), { pos: [fx, 0, fz] }));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + Math.PI / 6;
        // Leaf frame: length down and out over the bun, z (its face) outward.
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const L1 = new THREE.Vector3(0, -1, 0).addScaledVector(dir, 0.25).normalize();
        const Z1 = dir.clone().addScaledVector(new THREE.Vector3(0, 1, 0), 0.25).normalize();
        const W1 = new THREE.Vector3().crossVectors(Z1, L1).normalize();
        const Zc = new THREE.Vector3().crossVectors(L1, W1);
        const m4 = new THREE.Matrix4().makeBasis(L1, W1, Zc).setPosition(fx + dir.x * 0.034, 0.047, fz + dir.z * 0.034);
        out.push(part(leafT.clone().applyMatrix4(m4)));
      }
    }
  }
  footBase.dispose();
  leafT.dispose();

  // Mercy seat border inside the crown: a beaded edge, a frieze of palmettes and almond buds
  // linked by arcs, rosettes at the corners, then a half-round rail.
  // Lid plane: x along the ark's length (z), y across (x), z up. The frieze stops short of the
  // cherubim's feet at the ends, so the seat around them stays plain.
  {
    const r = new Relief();
    const hu = L / 2, hv = W / 2;
    const ins = (k) => [hu - k, hv - k];
    const rect = (k, rad, pitch, reel = false) => {
      const [a, b] = ins(k);
      r.beadLine(-a, -b, a, -b, rad, pitch, reel);
      r.beadLine(-a, b, a, b, rad, pitch, reel);
      r.beadLine(-a, -b, -a, b, rad, pitch, reel);
      r.beadLine(a, -b, a, b, rad, pitch, reel);
    };
    rect(0.0075, 0.0045, 0.015);
    {
      const [a, b] = ins(0.07);
      r.stem([[-a, -b], [a, -b], [a, b], [-a, b], [-a, -b]], 0.0042, 0.0042, 1); // half-round rail
    }
    for (const su of [-1, 1]) for (const sv of [-1, 1]) r.rosette(su * (hu - 0.04), sv * (hv - 0.04), 0.026, 12, 0.004);
    // Frieze along each edge: position s along the edge, inward direction, keep-out test.
    const edges = [
      { o: [-hu, hv], t: [1, 0], n: [0, -1], len: L },
      { o: [-hu, -hv], t: [1, 0], n: [0, 1], len: L },
      { o: [hu, -hv], t: [0, 1], n: [-1, 0], len: W },
      { o: [-hu, -hv], t: [0, 1], n: [1, 0], len: W },
    ];
    const base = 0.02, pitch = 0.042;
    for (const e of edges) {
      const s0 = 0.08, s1 = e.len - 0.08, n = Math.round((s1 - s0) / pitch);
      const at = (s, k) => [e.o[0] + e.t[0] * s + e.n[0] * k, e.o[1] + e.t[1] * s + e.n[1] * k];
      const ang = Math.atan2(e.n[1], e.n[0]);
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const s = s0 + ((s1 - s0) * i) / n;
        const [x, y] = at(s, base);
        const blocked = e.t[1] !== 0 && Math.abs(y) < 0.12; // under the cherubim's feet
        if (blocked) { prev = null; continue; }
        if (i % 2 === 0) r.palmette(x, y, ang, 0.042);
        else r.bud(x, y, ang, 0.04);
        if (prev !== null) {
          const pts = [];
          for (let j = 0; j <= 8; j++) {
            const f = j / 8, ss = prev + (s - prev) * f, k = base - 0.007 * Math.sin(Math.PI * f);
            pts.push(at(ss, k));
          }
          r.stem(pts, 0.0026, 0.0026, 0.012);
        }
        prev = s;
      }
    }
    const lid = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
      .setPosition(0, SEAT_TOP, 0);
    out.push(r.build(lid));
  }
  return out;
}
