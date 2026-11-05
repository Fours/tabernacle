import * as THREE from 'three';
import { MENORAH as M, m } from '../config/dimensions.js';
import { GOLD } from './materials.js';
import { part, merge } from './bronzeParts.js';
import { circle } from './colliders.js';
import { createLampFlames } from './fire.js';
import { INTERIOR } from './interiorLight.js';

// The menorah (Ex 25:31-40): one merged gold mesh (shaft, six semicircular arms, cups, knobs,
// flowers, tripod base, seven lamps), one instanced draw for the seven flames, and the Holy
// Place's only light. Vertical layout per Menachot 28b (see MENORAH in dimensions.js).
// Ornament (reconstruction): fluted almond cups with pointed calyx lobes, lobed knobs with a
// bead ring, five-petalled almond blossoms, small almond leaves curling down under every knob
// and cup, beaded fillets at the joints, and a moulded tripod base on leaf-scroll feet.
// Gold tongs and snuff dishes (25:38) are not modelled.

const H = m(M.hb); // one handbreadth in meters
const hb = (v) => v * H; // handbreadths -> meters

/** LatheGeometry from [r, y] pairs in handbreadths, shifted up by y0 (hb). */
function lathe(profile, y0 = 0, segments = 16) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(hb(r), hb(y + y0))), segments);
}

/**
 * Displace a lathe's vertices by f(r, y, theta) -> [rScale, dy] (y in hb, relative to y0).
 * Recomputes normals.
 */
function sculpt(g, y0, f) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i) / H - y0;
    const [s, dy] = f(Math.hypot(x, z) / H, y, Math.atan2(z, x));
    p.setXYZ(i, x * s, p.getY(i) + hb(dy), z * s);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A leaf or petal (hb units), a closed lens-shaped shell rooted at the origin and growing along
 * +x, bending in the x-y plane from angle a0 by `curl` (radians; negative curls down). Width
 * runs along z. `fold` drops the edges below a raised midrib; `cup` lifts them (petals).
 */
function leafGeo({ len, wid, thick = 0.03, a0 = 0, curl = 0, fold = 0.2, cup = 0, petal = false, nu = 8, nv = 4 }) {
  const rows = [];
  let x = 0, y = 0;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, a = a0 + curl * u;
    if (i > 0) { const am = a0 + curl * (u - 0.5 / nu); x += Math.cos(am) * len / nu; y += Math.sin(am) * len / nu; }
    const w = petal
      ? wid * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.4)), 0.55) // broad, rounded tip
      : wid * Math.sin(Math.PI * Math.pow(u, 0.75)); // almond: widest at 40%, pointed tip
    rows.push({ x, y, nx: -Math.sin(a), ny: Math.cos(a), w, t: thick * Math.sqrt(Math.sin(Math.PI * Math.min(u, 0.97))) + 0.004 });
  }
  const pos = [], idx = [];
  const cols = 2 * nv;
  for (const side of [1, -1]) {
    const o = pos.length / 3;
    for (const r of rows) {
      for (let j = 0; j <= cols; j++) {
        const v = j / nv - 1, av = Math.abs(v);
        const rib = 0.6 * r.t * Math.max(0, 1 - av * 4); // raised midrib
        const lift = -fold * r.w * av + cup * r.w * v * v + side * (r.t * (1 - v * v) * 0.5 + rib * (side > 0 ? 1 : 0.3));
        pos.push(r.x + r.nx * lift, r.y + r.ny * lift, r.w * v);
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < cols; j++) {
        const a = o + i * (cols + 1) + j, b = a + cols + 1, c = a + 1, d = b + 1;
        if (side > 0) idx.push(a, c, b, c, d, b);
        else idx.push(a, b, c, c, b, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** n copies of a leaf template (hb) set radially at radius r, height y (hb); returns meters. */
function whorl(tpl, n, r, y, phase = 0, out = []) {
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2;
    out.push(tpl.clone().rotateY(-a).translate(r * Math.cos(a), y, r * Math.sin(a)).scale(H, H, H));
  }
  return out;
}

const BEAD = new THREE.SphereGeometry(1, 6, 4);
/** A ring of n beads of radius br at radius r, height y (hb); returns meters. */
function beads(n, r, y, br, phase = 0, out = []) {
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2;
    out.push(BEAD.clone().scale(br, br, br).translate(r * Math.cos(a), y, r * Math.sin(a)).scale(H, H, H));
  }
  return out;
}

/** Horizontal round fillet (torus) of radius r, tube t at height y (hb). */
const fillet = (r, t, y) => new THREE.TorusGeometry(hb(r), hb(t), 6, 28).rotateX(Math.PI / 2).translate(0, hb(y), 0);

// Leaf templates (hb). Knob leaves hang from the knob's lower shoulder and curl down over the
// cup below; cup leaves hang from under each calyx over the cup's body; petals rise and open outward, cupped.
const KNOB_LEAF = leafGeo({ len: 0.42, wid: 0.12, a0: -0.15, curl: -1.5, fold: 0.25 });
const CUP_LEAF = leafGeo({ len: 0.34, wid: 0.11, thick: 0.025, a0: -0.2, curl: -1.3, fold: 0.25 });
const PETAL = leafGeo({ len: 0.42, wid: 0.2, thick: 0.025, a0: 0.75, curl: -0.6, fold: 0, cup: 0.45, petal: true, nu: 8, nv: 4 });
const HUB_LEAF = leafGeo({ len: 0.6, wid: 0.17, thick: 0.04, a0: -0.3, curl: -1.1, fold: 0.25 });
const FOOT_LEAF = leafGeo({ len: 1.0, wid: 0.42, thick: 0.12, a0: 0.05, curl: 1.8, fold: 0.15, nu: 12 });

const sstep = THREE.MathUtils.smoothstep;

// Almond-blossom cup (gavia): a narrow foot swelling into a fluted almond body, pinched at the
// waist and flaring to a calyx rim drawn up into five pointed lobes. Five small leaves hang
// from under the calyx and curl down over the body. 0.66 hb.
const CUP = [[0.07, 0], [0.13, 0.04], [0.23, 0.13], [0.3, 0.25], [0.3, 0.36], [0.25, 0.46], [0.24, 0.5], [0.32, 0.58], [0.43, 0.66], [0.39, 0.67], [0.24, 0.58], [0.16, 0.5]];
const CUP_H = 0.66;
function cup(y0, out) {
  out.push(sculpt(lathe(CUP, y0, 40), y0, (r, y, th) => {
    const flute = sstep(y, 0.02, 0.1) * (1 - sstep(y, 0.42, 0.5));
    const rim = sstep(y, 0.55, 0.66);
    const lobe = Math.pow(0.5 + 0.5 * Math.cos(5 * th), 3);
    return [1 + 0.16 * flute * (0.5 - Math.abs(Math.sin(4 * th))) + 0.1 * rim * (lobe - 0.35), 0.1 * rim * lobe];
  }));
  whorl(CUP_LEAF, 5, 0.23, y0 + 0.5, Math.PI / 5, out);
}

// Flower (perach): an open almond blossom, five cupped petals round a receptacle with a ring
// of stamens. 0.44 hb tall (the receptacle carries what sits above).
const FLOWER_H = 0.44;
const RECEPT = [[0.2, 0], [0.24, 0.08], [0.3, 0.2], [0.34, 0.32], [0.33, 0.4], [0.28, 0.44], [0.01, 0.44]];
function flower(y0, out) {
  out.push(lathe(RECEPT, y0, 20));
  whorl(PETAL, 5, 0.22, y0 + 0.12, 0, out);
  beads(10, 0.3, y0 + 0.41, 0.04, 0, out);
}

// Knob (kaftor): a lobed, apple-like boss with fillets at both necks and a bead ring, almond
// leaves hanging from its lower shoulder. Radius R, half height R * KNOB_SQUASH (hb).
const KNOB_R = 0.42, KNOB_SQUASH = 0.75;
const KNOB = [[0.45, -1], [0.6, -0.93], [0.85, -0.72], [1, -0.3], [1, 0.1], [0.88, 0.55], [0.66, 0.85], [0.45, 1]];
function knob(yc, out, R = KNOB_R, leafPhase = 0) {
  const h = R * KNOB_SQUASH;
  out.push(sculpt(lathe(KNOB.map(([r, y]) => [r * R, y * h]), yc, 30), yc, (r, y, th) => [1 + 0.06 * Math.cos(10 * th) * (1 - Math.min(1, (y / h) ** 2)), 0]));
  out.push(fillet(0.47 * R, 0.05, yc - h), fillet(0.47 * R, 0.05, yc + h));
  beads(16, R * 1.02, yc - 0.1 * h, 0.045, 0, out);
  whorl(KNOB_LEAF, 6, 0.85 * R, yc - 0.45 * h, leafPhase, out);
}

/** Three cups, a knob and a flower stacked from y0 (hb); returns the top (hb). */
function topStack(y0, out) {
  let y = y0;
  for (let i = 0; i < 3; i++, y += CUP_H) cup(y, out);
  knob(y + KNOB_R * KNOB_SQUASH, out);
  y += 2 * KNOB_R * KNOB_SQUASH;
  flower(y, out);
  return y + FLOWER_H;
}

// Oil lamp: a small closed bowl with a filling hole, pinched into a spout along +x. 0.42 hb tall.
const LAMP = [[0.01, 0], [0.28, 0], [0.44, 0.08], [0.5, 0.2], [0.46, 0.32], [0.3, 0.4], [0.17, 0.38], [0.12, 0.3]];
const SPOUT = 0.75; // spout reach as a fraction of the bowl radius
function lamp() {
  const g = lathe(LAMP, 0, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const c = Math.cos(Math.atan2(z, x));
    const k = Math.pow(Math.max(c, 0), 8);
    p.setX(i, x * (1 + SPOUT * k));
    p.setZ(i, z * (1 - 0.35 * k));
    p.setY(i, p.getY(i) * (1 + 0.15 * k));
  }
  g.computeVertexNormals();
  return g;
}

/** Arm: quarter circle from the shaft (bottom of the arc) out to x = side*r, then straight up. */
class ArmCurve extends THREE.Curve {
  constructor(r, side, yc, yTop) {
    super();
    this.r = r; this.side = side; this.yc = yc; this.yTop = yTop;
    this.arc = (Math.PI / 2) * r;
    this.len = this.arc + (yTop - yc);
  }
  getPoint(t, out = new THREE.Vector3()) {
    const s = t * this.len;
    if (s <= this.arc) {
      const a = s / this.r;
      return out.set(hb(this.side * this.r * Math.sin(a)), hb(this.yc - this.r * Math.cos(a)), 0);
    }
    return out.set(hb(this.side * this.r), hb(this.yc + (s - this.arc)), 0);
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Beaded collar (bead ring between two fillets) round a tube of radius r, axis `dir`, at p (m). */
function collar(r, p, dir, out) {
  const parts = [fillet(r + 0.01, 0.045, -0.08), fillet(r + 0.01, 0.045, 0.08)];
  beads(12, r + 0.02, 0, 0.045, 0, parts);
  const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir);
  for (const g of parts) out.push(g.applyQuaternion(q).translate(p.x, p.y, p.z));
}

/** TubeGeometry along `curve` whose radius runs from r0 to r1 (meters). */
function taperTube(curve, segs, radial, r0, r1) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
  }
  g.computeVertexNormals();
  return g;
}

// Tripod base (Rashi 25:31): a moulded, gadrooned dome with a beaded collar and a ring of
// leaves, on three tapering legs ending in paws set on scrolled leaf feet; its flower on top.
const HUB = [[0.01, 0.5], [0.8, 0.52], [0.95, 0.6], [0.97, 0.7], [0.88, 0.78], [0.84, 0.84], [0.86, 0.9], [0.78, 0.98], [0.66, 1.12], [0.5, 1.35], [0.38, 1.6], [0.32, 1.78], [0.4, 1.84], [0.43, 1.92], [0.36, 1.99], [0.3, 2.05], [0.34, 2.12], [0.27, 2.2], [0.24, 2.4]];
const LEGS = [-90, 30, 150].map((d) => THREE.MathUtils.degToRad(d));
function base(out) {
  out.push(sculpt(lathe(HUB, 0, 48), 0, (r, y, th) => [1 + 0.07 * Math.cos(12 * th) * sstep(y, 0.95, 1.1) * (1 - sstep(y, 1.4, 1.6)), 0]));
  beads(24, 0.87, 0.84, 0.05, 0, out);
  beads(18, 0.44, 1.92, 0.045, 0, out);
  whorl(HUB_LEAF, 6, 0.34, 1.82, LEGS[0] + Math.PI / 6, out);
  flower(2.4, out);
  for (const a of LEGS) {
    const at = (r, y) => new THREE.Vector3(Math.cos(a) * hb(r), hb(y), Math.sin(a) * hb(r));
    const curve = new THREE.CubicBezierCurve3(at(0.55, 1.15), at(1.3, 1.35), at(1.95, 0.95), at(2.1, 0.32));
    out.push(taperTube(curve, 20, 10, hb(0.2), hb(0.12)));
    const paw = new THREE.SphereGeometry(hb(0.2), 12, 8);
    paw.scale(1.15, 0.7, 1.15).translate(Math.cos(a) * hb(2.12), hb(0.22), Math.sin(a) * hb(2.12));
    out.push(paw);
  }
  whorl(FOOT_LEAF, 3, 1.72, 0.12, LEGS[0], out);
}

export function createMenorah() {
  const group = new THREE.Group();
  group.name = 'menorah';
  group.position.set(m(M.x), 0, m(M.z));

  const geos = [];
  base(geos);
  // Shaft from inside the base flower up to the top stack, with its lowest cup, knob and flower.
  const y0 = 2.6, shaftTop = M.topCups;
  geos.push(new THREE.CylinderGeometry(hb(M.shaftRadius), hb(M.shaftRadius), hb(shaftTop - y0), 16, 1, true).translate(0, hb((shaftTop + y0) / 2), 0));
  cup(M.lowerCup - 0.4, geos);
  knob(M.lowerCup + 0.2 + KNOB_R * KNOB_SQUASH, geos);
  flower(M.lowerCup + 0.2 + 2 * KNOB_R * KNOB_SQUASH, geos);
  // A knob under each pair of branches (25:35), slightly fuller; its leaves clear the arms.
  for (const y of M.branchKnobs) knob(y, geos, 0.5, Math.PI / 6);

  // Lamp positions (hb, local x) and the arms that carry them, beaded where they leave the
  // knob and below the cups.
  const columns = [0];
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  for (const r of M.armRadii) {
    for (const side of [-1, 1]) {
      const curve = new ArmCurve(r, side, M.armCenter, M.topCups + 0.05);
      geos.push(new THREE.TubeGeometry(curve, 24 + Math.round(12 * r), hb(M.armRadius), 12, false));
      const t = 0.68 / curve.len;
      collar(M.armRadius, curve.getPoint(t, p), curve.getTangent(t, d), geos);
      columns.push(side * r);
    }
  }
  for (const x of columns) collar(x === 0 ? M.shaftRadius : M.armRadius, p.set(hb(x), hb(M.topCups - 0.3), 0), Y_AXIS, geos);

  // Cups, knob, flower and lamp at the top of the shaft and every arm. The six outer lamps'
  // spouts turn toward the center (Ex 25:37, Rashi); the middle lamp's faces west (toward the
  // veil; Menachot 98b, the "western lamp").
  const wicks = [];
  const lampGeo = lamp();
  for (const x of columns) {
    const stack = [];
    const top = topStack(M.topCups, stack);
    for (const g of stack) geos.push(g.translate(hb(x), 0, 0));
    const dir = x > 0 ? -1 : 1;
    const spoutDir = x === 0 ? -1 : dir;
    geos.push(part(lampGeo.clone(), { pos: [hb(x), hb(top), 0], rot: [0, spoutDir > 0 ? 0 : Math.PI, 0] }));
    const reach = 0.5 * (1 + SPOUT) - 0.12;
    wicks.push([hb(x + spoutDir * reach), hb(top + 0.38), 0]);
  }
  lampGeo.dispose();

  const mesh = new THREE.Mesh(merge(geos.map((g) => part(g))), GOLD);
  mesh.name = 'menorah-gold';
  // No shadows: the only shadow caster (the altar fire) is masked out of the tent anyway.
  group.add(mesh);

  const flames = createLampFlames(wicks, { width: 0.026, height: 0.068, brightness: 1.6, halo: 0.5 });
  group.add(flames.mesh);

  // The Holy Place's only light: warm, unshadowed, a little in front of (north of) and above
  // the lamps so the menorah itself isn't blown out by a light inside it.
  const LIGHT = 8; // cd
  const light = new THREE.PointLight(0xffc080, LIGHT, 0, 1.6);
  light.name = 'menorah-light';
  const lightPos = new THREE.Vector3(0, hb(M.height) + 0.3, -0.35);
  light.position.copy(lightPos);
  group.add(light);
  INTERIOR.uIlSource.value.copy(lightPos).add(group.position);
  const AMBIENT = new THREE.Color(0xffd8a8).multiplyScalar(0.06);

  group.userData.update = (dt, time) => {
    flames.update(time);
    // Seven small flames together: a gentle, uneven breathing rather than a fire's flicker.
    const f = 0.5 * Math.sin(time * 7.3) * Math.sin(time * 2.1 + 1.3) + 0.3 * Math.sin(time * 13.1 + 0.4) * Math.sin(time * 0.7);
    const level = 1 + 0.06 * f;
    light.intensity = LIGHT * level;
    INTERIOR.uIlAmbient.value.copy(AMBIENT).multiplyScalar(level);
  };
  group.userData.update(0, 0);

  const cr = m(M.colliderRadius);
  group.userData.colliders = [-1, 0, 1].map((k) => circle(m(M.x) + k * hb(M.armRadii[0]) * 0.75, m(M.z), cr));
  group.userData.dispose = () => flames.dispose();
  return group;
}
