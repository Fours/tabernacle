import * as THREE from 'three';
import { ALTAR as A, ALTAR_UTENSILS as U, CUBIT, m } from '../config/dimensions.js';
import { box } from './colliders.js';
import { BRONZE_PLATED, ACACIA, EARTH, addFireBounce } from './materials.js';
import { part, boxPart, merge } from './bronzeParts.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Lathe of a [radius, height] profile given in cubits (bottom to top, outer then inner). */
function lathe(profile, segments = 24) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(m(r), m(y))), segments);
}

/**
 * Tapered, outward-curving horn rising from a corner; sits at the local origin (the center of
 * the wall corner). The upper horn is a round tube along the curve; toward the bottom its
 * cross-section morphs into a square whose two outer faces are flush with the altar's outer
 * walls, so the horn grows out of the corner as one cast piece. `sx`, `sz` give the corner.
 */
function hornGeometry(sx, sz) {
  const hh = m(A.hornHeight), out = m(A.hornOutward), outDir = new THREE.Vector3(sx, 0, sz).normalize();
  const pts = [[0, 0], [0.05, 0.4], [0.35, 0.75], [1, 1]].map(
    ([o, h]) => new THREE.Vector3(outDir.x * o * out, h * hh, outDir.z * o * out),
  );
  const curve = new THREE.CatmullRomCurve3(pts);
  const ts = 24, rs = 32; // rs divisible by 8 so ring vertices land on the square's corners
  const rBase = m(A.hornBaseRadius), rTip = m(A.hornTipRadius);
  // Square foot: outer faces on the outer walls (half a wall thickness out from the corner
  // center), side = the horn's base diameter, so it overhangs the rim inward a little.
  const half = rBase, outer = m(A.wallThickness) / 2;
  const sqC = new THREE.Vector3(sx * (outer - half), 0, sz * (outer - half));
  const f = A.hornFoot; // fraction of the horn over which the square foot rounds into the horn
  const c = new THREE.Vector3(), tan = new THREE.Vector3(), v = new THREE.Vector3(), sq = new THREE.Vector3();
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const pos = [];
  for (let i = 0; i <= ts; i++) {
    const t = i / ts;
    curve.getPointAt(t, c);
    curve.getTangentAt(t, tan);
    q.setFromUnitVectors(up, tan);
    const r = THREE.MathUtils.lerp(rBase, rTip, Math.pow(t, 1.4)); // stays stout, then rounds off
    const w = 1 - THREE.MathUtils.smoothstep(t, 0, f); // 1 = square foot, 0 = round horn
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      v.set(ca * r, 0, sa * r).applyQuaternion(q).add(c);
      if (w > 0) {
        const k = half / Math.max(Math.abs(ca), Math.abs(sa));
        sq.set(sqC.x + ca * k, c.y, sqC.z + sa * k);
        v.lerp(sq, w);
      }
      pos.push(v.x, v.y, v.z);
    }
  }
  const idx = [];
  for (let i = 0; i < ts; i++) {
    for (let j = 0; j < rs; j++) {
      const a = i * (rs + 1) + j, b = a + rs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Weld the normals along the ring seam (first and last vertex of each ring coincide).
  const n = g.attributes.normal;
  for (let i = 0; i <= ts; i++) {
    const a = i * (rs + 1), b = a + rs;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  // Bottom cap (the foot overhangs the hollow, so it can be seen from inside).
  const cap = new THREE.PlaneGeometry(2 * half, 2 * half).rotateX(Math.PI / 2).translate(sqC.x, 0, sqC.z);
  return [g, cap, new THREE.SphereGeometry(rTip, 8, 6).translate(pts[3].x, pts[3].y, pts[3].z)];
}

/**
 * Box-project UVs in cubits, like part(…, 'cubit'), but choosing the projection per triangle
 * (from its face normal) so curved surfaces don't smear where the dominant axis changes. Lets
 * the horns carry the same plate texture (mottling, patina, seams) as the walls.
 */
function cubitUVsPerFace(g) {
  const p = g.attributes.position, uv = g.attributes.uv;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    fn.subVectors(c, b).cross(a.clone().sub(b));
    const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      let u, w;
      if (ax >= ay && ax >= az) { u = z; w = y; } else if (ay >= az) { u = x; w = z; } else { u = x; w = y; }
      uv.setXY(i + k, u / CUBIT, w / CUBIT);
    }
  }
  return g;
}

/** Gradient for the grate's heat glow: uv.x = heat (0 cold .. 1 glowing), sRGB. */
function heatRamp() {
  const stops = [[0, 0, 0], [0, 0, 0], [26, 3, 0], [90, 14, 2], [190, 52, 8], [255, 120, 34]];
  const data = new Uint8Array(stops.length * 4);
  stops.forEach((s, i) => data.set([...s, 255], i * 4));
  const t = new THREE.DataTexture(data, stops.length, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Heavy cast bronze grate filling the hollow at the top of the altar: a perimeter frame and a
 * lattice of deep square bars (one piece, the cross bars cast between the long ones). Heat is
 * baked per vertex: soot/heat tint in the colors, a glow (via uv.x into heatRamp) on the bars'
 * undersides and lower sides, which face the ember bed.
 */
function grateGeometry(inner, top) {
  const b = m(A.grateBar), d = m(A.grateDepth);
  const n = Math.max(2, Math.round(inner / m(A.gratePitch)));
  const p = Array.from({ length: n + 1 }, (_, i) => THREE.MathUtils.lerp(-inner / 2 + b / 2, inner / 2 - b / 2, i / n));
  const y = top - d / 2;
  const boxes = [];
  for (const z of p) boxes.push(new THREE.BoxGeometry(inner, d, b).translate(0, y, z)); // long bars (E-W)
  for (const x of p) {
    for (let k = 0; k < n; k++) {
      const z0 = p[k] + b / 2, z1 = p[k + 1] - b / 2;
      boxes.push(new THREE.BoxGeometry(b, d * 0.92, z1 - z0).translate(x, y + d * 0.04, (z0 + z1) / 2));
    }
  }
  const g = mergeGeometries(boxes.map((x) => x.toNonIndexed()));
  boxes.forEach((x) => x.dispose());
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2), col = new Float32Array(pos.count * 3);
  const soot = new THREE.Color(0.16, 0.13, 0.11), tint = new THREE.Color(0.34, 0.24, 0.3), cast = new THREE.Color(0.7, 0.56, 0.42);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), yy = pos.getY(i), z = pos.getZ(i), ny = nor.getY(i);
    const radial = Math.min(1, Math.hypot(x, z) / (inner * 0.62));
    const low = THREE.MathUtils.clamp((top - yy) / d, 0, 1); // 0 at the top face, 1 at the bottom
    let heat;
    if (ny > 0.5) heat = 0.28 * (1 - radial) ** 2; // top: barely warm in the middle
    else if (ny < -0.5) heat = 0.95 - 0.35 * radial; // underside, over the coals
    else heat = (0.15 + 0.75 * low * low) * (1 - 0.4 * radial); // sides: hotter low down
    uv[i * 2] = 0.04 + 0.92 * heat;
    uv[i * 2 + 1] = 0.5;
    // Albedo: sooty and heat-tinted toward the middle, browner cast bronze at the frame.
    c.copy(cast).lerp(soot, 0.55 + 0.35 * (1 - radial)).lerp(tint, 0.35 * (1 - radial) * (ny > 0.5 ? 1 : 0.3));
    c.toArray(col, i * 3);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
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
      for (const g of hornGeometry(sx, sz)) {
        horns.push(cubitUVsPerFace(part(g, { pos: [sx * (L - t) / 2, H - m(0.005), sz * (W - t) / 2] })));
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

  // Hearth: earth fill inside the hollow, below the grate, slightly uneven.
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
  // Under the grate the earth is an ember bed: dark ash with the speckle glowing orange.
  const hearthMat = new THREE.MeshStandardMaterial({
    name: 'altar-ember-bed',
    map: EARTH.map,
    color: 0x3a2a20,
    emissive: 0xff4a10,
    emissiveMap: EARTH.map,
    emissiveIntensity: 1.6,
    roughness: 1,
  });
  const hearth = new THREE.Mesh(hearthGeo, hearthMat);
  hearth.name = 'altar-hearth';
  hearth.receiveShadow = true;
  group.add(hearth);

  // Top grate over the fire, its glowing undersides lit by the ember bed below. Not a shadow
  // caster (the walls already shadow everything below the rim).
  const grateTop = H - m(A.grateDrop);
  const grateMat = new THREE.MeshStandardMaterial({
    name: 'bronze-grate',
    color: 0x34261a,
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.5,
    emissive: 0xffffff,
    emissiveMap: heatRamp(),
    emissiveIntensity: 2.4,
  });
  const grate = new THREE.Mesh(grateGeometry(inner, grateTop), grateMat);
  grate.name = 'altar-grate';
  grate.receiveShadow = true;
  group.add(grate);

  group.position.set(m(A.x), 0, m(A.z));
  // Firelit sand bounces warm light onto the altar's outer walls (they face away from the
  // flames, so otherwise only the dim night fill reaches them). Flicker via userData.bounce.
  const bounce = { value: 1 };
  addFireBounce(BRONZE_PLATED, { center: group.position, inner: 1.0, outer: 4.0, height: 2.4, strength: 2.6, level: bounce });
  group.userData.bounce = bounce;
  // World-space hearth info for the fire (meters): center, grate top (the fire's base), the
  // ember bed's height below it, and the hollow's inner side.
  group.userData.hearth = { x: m(A.x), y: grateTop, bedY: hy, z: m(A.z), size: inner };
  group.userData.colliders = [
    box(m(A.x), m(A.z), oL, oW), // body + ledge + net
    ...[-1, 1].map((sz) => box(m(A.x), m(A.z) + sz * poleZ, 2 * poleHalf, 2 * poleR + 0.06)), // carrying poles
  ];
  // Ground kept free of rocks and scrub: the utensils lying south of the altar.
  group.userData.groundKeepOut = [box(m(A.x - 0.4), m(A.z + U.offsetZ), m(5.2), m(2.6))];
  return group;
}
