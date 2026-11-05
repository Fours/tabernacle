import * as THREE from 'three';
import { ALTAR as A, ALTAR_UTENSILS as U, m } from '../config/dimensions.js';
import { box } from './colliders.js';
import { BRONZE_PLATED, ACACIA, EARTH } from './materials.js';
import { part, boxPart, merge } from './bronzeParts.js';

/** Lathe of a [radius, height] profile given in cubits (bottom to top, outer then inner). */
function lathe(profile, segments = 24) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(m(r), m(y))), segments);
}

/** Tapered, outward-curving horn rising from a corner; sits at the local origin. */
function hornGeometry(outDir) {
  const hh = m(A.hornHeight), out = m(A.hornOutward);
  const pts = [[0, 0], [0.05, 0.4], [0.35, 0.75], [1, 1]].map(
    ([o, h]) => new THREE.Vector3(outDir.x * o * out, h * hh, outDir.z * o * out),
  );
  const curve = new THREE.CatmullRomCurve3(pts);
  const ts = 18, rs = 10;
  const tube = new THREE.TubeGeometry(curve, ts, 1, rs, false);
  const p = tube.attributes.position;
  const rBase = m(A.hornBaseRadius), rTip = m(A.hornTipRadius);
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= ts; i++) {
    const t = i / ts;
    curve.getPointAt(t, c);
    const r = THREE.MathUtils.lerp(rBase, rTip, Math.pow(t, 1.4)); // stays stout, then rounds off
    for (let j = 0; j <= rs; j++) {
      const k = i * (rs + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return [tube, new THREE.SphereGeometry(rTip, 8, 6).translate(pts[3].x, pts[3].y, pts[3].z)];
}

/** Diagonal bronze network on one side (local frame: width along x, normal +z, at origin). */
function gratingSide(w, h, yaw, y0, gHalf, bar, pitch) {
  const parts = [];
  const add = (len, ang, cu, cv, nOff) => {
    const g = new THREE.BoxGeometry(len, bar, bar);
    g.rotateZ(ang);
    g.translate(cu - w / 2, y0 + cv, gHalf + nOff);
    g.rotateY(yaw);
    parts.push(part(g));
  };
  const r2 = Math.SQRT2;
  for (let c = -h; c <= w; c += pitch) {
    // y = x - c  (rising)
    const a0 = Math.max(0, c), a1 = Math.min(w, c + h);
    if (a1 - a0 > bar) add((a1 - a0) * r2, Math.PI / 4, (a0 + a1) / 2, (a0 - c + a1 - c) / 2, bar / 2);
  }
  for (let c = 0; c <= w + h; c += pitch) {
    // y = c - x  (falling)
    const a0 = Math.max(0, c - h), a1 = Math.min(w, c);
    if (a1 - a0 > bar) add((a1 - a0) * r2, -Math.PI / 4, (a0 + a1) / 2, (c - a0 + c - a1) / 2, -bar / 2);
  }
  return parts;
}

/** Ground-level bronze utensils (Ex 27:3): ash pot, basin, shovel, fork, firepan. */
function utensils() {
  const parts = [];
  const z = m(U.offsetZ);
  // Ash pot (sir): bulging pot with a rim, walls thick enough for front-face-only rendering.
  parts.push(part(lathe([[0, 0], [0.25, 0], [0.33, 0.15], [0.38, 0.38], [0.3, 0.52], [0.34, 0.57], [0.3, 0.57],
    [0.26, 0.52], [0.33, 0.38], [0.28, 0.15], [0, 0.06]]), { pos: [m(-2.2), 0, z] }));
  // Basin (mizraq): wide shallow bowl.
  parts.push(part(lathe([[0, 0], [0.2, 0], [0.48, 0.1], [0.55, 0.26], [0.5, 0.26], [0.44, 0.15], [0, 0.07]]),
    { pos: [m(-1.1), 0, z] }));
  // Shovel (ya): blade + long handle, lying on the ground.
  const shovel = [
    new THREE.BoxGeometry(m(0.32), m(0.03), m(0.45)).translate(0, m(0.03), m(0.5)),
    new THREE.CylinderGeometry(m(0.035), m(0.035), m(0.9), 8).rotateX(Math.PI / 2).translate(0, m(0.05), m(-0.2)),
  ];
  shovel.forEach((g) => parts.push(part(g, { pos: [m(0.1), 0, z - m(0.4)], rot: [0, 0.35, 0] })));
  // Fork (mazleg): handle, cross bar and three tines.
  const fork = [
    new THREE.CylinderGeometry(m(0.035), m(0.035), m(0.8), 8).rotateX(Math.PI / 2).translate(0, m(0.05), m(-0.3)),
    new THREE.BoxGeometry(m(0.3), m(0.04), m(0.04)).translate(0, m(0.05), m(0.1)),
    ...[-0.12, 0, 0.12].map((dx) => new THREE.BoxGeometry(m(0.035), m(0.035), m(0.4)).translate(m(dx), m(0.05), m(0.3))),
  ];
  fork.forEach((g) => parts.push(part(g, { pos: [m(1.2), 0, z - m(0.3)], rot: [0, -0.25, 0] })));
  // Firepan (machta): shallow pan with a handle.
  parts.push(part(lathe([[0, 0], [0.34, 0], [0.4, 0.1], [0.36, 0.1], [0.3, 0.03], [0, 0.03]]), { pos: [m(2.3), 0, z] }));
  parts.push(part(new THREE.BoxGeometry(m(0.08), m(0.05), m(0.7)).translate(0, m(0.1), m(-0.7)), { pos: [m(2.3), 0, z], rot: [0, 0.2, 0] }));
  return parts;
}

export function createAltar() {
  const group = new THREE.Group();
  group.name = 'altar';
  const L = m(A.length), W = m(A.width), H = m(A.height), t = m(A.wallThickness);
  const bronze = [];
  const acacia = [];

  // Hollow body: four bronze-overlaid walls with an open top.
  bronze.push(boxPart(L, H, t, [0, H / 2, -(W - t) / 2], 'cubit'));
  bronze.push(boxPart(L, H, t, [0, H / 2, (W - t) / 2], 'cubit'));
  bronze.push(boxPart(t, H, W - 2 * t, [-(L - t) / 2, H / 2, 0], 'cubit'));
  bronze.push(boxPart(t, H, W - 2 * t, [(L - t) / 2, H / 2, 0], 'cubit'));

  // Horns: one piece with the corners. Own mesh so they don't cast shadows: the real fire is a
  // broad source whose flames rise above the horns, so their shadows would be very soft, not
  // the long hard wedges a point light throws across the courtyard.
  const horns = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const dir = new THREE.Vector3(sx, 0, sz).normalize();
      for (const g of hornGeometry(dir)) {
        horns.push(part(g, { pos: [sx * (L - t) / 2, H - m(0.03), sz * (W - t) / 2] }));
      }
    }
  }

  // Ledge (karkov): a frame around the altar.
  const proj = m(A.ledgeProjection), lt = m(A.ledgeThickness);
  const ly = m(A.ledgeTop) - lt / 2;
  const oL = L + 2 * proj, oW = W + 2 * proj;
  bronze.push(boxPart(oL, lt, proj, [0, ly, -(W + proj) / 2], 'cubit'));
  bronze.push(boxPart(oL, lt, proj, [0, ly, (W + proj) / 2], 'cubit'));
  bronze.push(boxPart(proj, lt, W, [-(L + proj) / 2, ly, 0], 'cubit'));
  bronze.push(boxPart(proj, lt, W, [(L + proj) / 2, ly, 0], 'cubit'));

  // Bronze network grating: hangs from the ledge's outer edge down to halfway up the altar.
  const bar = m(A.gratingBarSize);
  const gHalf = L / 2 + proj - bar / 2; // grating plane distance from the center (square footprint)
  const gTop = m(A.ledgeTop) - lt, gBot = m(A.gratingBottom);
  const gw = 2 * gHalf, gh = gTop - gBot;
  const gRail = bar * 1.8;
  // Frame: top & bottom rails and four corner posts.
  for (const yy of [gTop - gRail / 2, gBot + gRail / 2]) {
    bronze.push(boxPart(2 * gHalf + gRail, gRail, gRail, [0, yy, gHalf], 'cubit'));
    bronze.push(boxPart(2 * gHalf + gRail, gRail, gRail, [0, yy, -gHalf], 'cubit'));
    bronze.push(boxPart(gRail, gRail, 2 * gHalf, [gHalf, yy, 0], 'cubit'));
    bronze.push(boxPart(gRail, gRail, 2 * gHalf, [-gHalf, yy, 0], 'cubit'));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bronze.push(boxPart(gRail, gh, gRail, [sx * gHalf, gBot + gh / 2, sz * gHalf], 'cubit'));
      // Stays tying the net back to the altar wall at the bottom corners.
      bronze.push(boxPart(proj, bar, bar, [sx * (L / 2 + proj / 2), gBot + gRail, sz * (W / 2 - t / 2)], 'cubit'));
      bronze.push(boxPart(bar, bar, proj, [sx * (L / 2 - t / 2), gBot + gRail, sz * (W / 2 + proj / 2)], 'cubit'));
    }
  }
  const innerH = gh - 2 * gRail;
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((yaw) => {
    bronze.push(...gratingSide(gw - gRail, innerH, yaw, gBot + gRail, gHalf, bar, m(A.gratingSpacing)));
  });

  // Four rings at the grating's corners, with two poles (E-W, on the north and south sides).
  const ringR = m(A.ringRadius), ringTube = m(A.ringTube), poleR = m(A.poleRadius);
  const ry = (gBot + gTop) / 2;
  const poleHalf = gHalf + m(A.poleOverhang);
  const poleZ = gHalf + ringR; // distance of each pole from the altar's E-W axis
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bronze.push(part(new THREE.TorusGeometry(ringR, ringTube, 8, 24).rotateY(Math.PI / 2),
        { pos: [sx * gHalf, ry, sz * poleZ] }));
    }
  }
  for (const sz of [-1, 1]) {
    const shell = new THREE.CylinderGeometry(poleR, poleR, 2 * poleHalf, 14, 1, true).rotateZ(Math.PI / 2);
    bronze.push(part(shell, { pos: [0, ry, sz * poleZ] }));
    // Acacia core, showing at both ends of the bronze overlay.
    acacia.push(new THREE.CylinderGeometry(poleR * 0.8, poleR * 0.8, 2 * poleHalf + 0.006, 10)
      .rotateZ(Math.PI / 2).translate(0, ry, sz * poleZ));
  }

  bronze.push(...utensils());

  const bronzeMesh = new THREE.Mesh(merge(bronze), BRONZE_PLATED);
  bronzeMesh.name = 'altar-bronze';
  bronzeMesh.castShadow = bronzeMesh.receiveShadow = true;
  // The fire light sits inside the walls' outline: render the walls' light-facing (inner)
  // faces into the shadow map too, so the depth at the wall foot isn't equal to the sand's
  // (that coincidence leaked a thin bright line along the base).
  BRONZE_PLATED.shadowSide = THREE.DoubleSide;
  group.add(bronzeMesh);

  const hornMesh = new THREE.Mesh(merge(horns), BRONZE_PLATED);
  hornMesh.name = 'altar-horns';
  hornMesh.receiveShadow = true;
  group.add(hornMesh);

  const acaciaMesh = new THREE.Mesh(merge(acacia), ACACIA);
  acaciaMesh.name = 'altar-pole-cores';
  group.add(acaciaMesh);

  // Hearth: earth fill inside the hollow, a bit below the rim, slightly uneven.
  const hy = H - m(A.hearthDrop);
  const inner = L - 2 * t;
  const hearthGeo = new THREE.PlaneGeometry(inner, inner, 14, 14).rotateX(-Math.PI / 2);
  const hp = hearthGeo.attributes.position, huv = hearthGeo.attributes.uv;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), z = hp.getZ(i);
    hp.setY(i, hy + 0.012 * Math.sin(x * 23.0) * Math.cos(z * 19.0) + 0.008 * Math.sin((x + z) * 41.0));
    huv.setXY(i, huv.getX(i) * 3, huv.getY(i) * 3);
  }
  hearthGeo.computeVertexNormals();
  const hearth = new THREE.Mesh(hearthGeo, EARTH);
  hearth.name = 'altar-hearth';
  hearth.receiveShadow = true;
  group.add(hearth);

  group.position.set(m(A.x), 0, m(A.z));
  // World-space hearth info for the fire (Step 5): center, surface height, inner side (meters).
  group.userData.hearth = { x: m(A.x), y: hy, z: m(A.z), size: inner };
  group.userData.colliders = [
    box(m(A.x), m(A.z), oL, oW), // body + ledge + net
    ...[-1, 1].map((sz) => box(m(A.x), m(A.z) + sz * poleZ, 2 * poleHalf, 2 * poleR + 0.06)), // carrying poles
  ];
  return group;
}
