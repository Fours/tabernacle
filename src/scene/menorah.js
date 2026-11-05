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
// Gold tongs and snuff dishes (25:38) are not modelled.

const hb = (v) => m(v * M.hb); // handbreadths -> meters

/** LatheGeometry from [r, y] pairs in handbreadths, shifted up by y0 (hb). */
function lathe(profile, y0 = 0, segments = 16) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(hb(r), hb(y + y0))), segments);
}

// Almond-blossom cup (gavia): a narrow foot swelling into an almond-shaped body, pinched at
// the waist and flaring to an open calyx rim, so it reads apart from the round knobs. 0.66 hb.
const CUP = [[0.17, 0], [0.24, 0.07], [0.38, 0.22], [0.4, 0.34], [0.31, 0.47], [0.36, 0.57], [0.52, 0.66], [0.46, 0.67], [0.3, 0.6], [0.22, 0.45]];
const CUP_H = 0.66;
// Flower (perach): a flared bell whose rim is scalloped into six petals. 0.44 hb tall.
const FLOWER = [[0.22, 0], [0.26, 0.1], [0.34, 0.22], [0.5, 0.33], [0.62, 0.4], [0.57, 0.44], [0.4, 0.37], [0.24, 0.28]];
const FLOWER_H = 0.44;
const KNOB_R = 0.42, KNOB_SQUASH = 0.75; // knob (kaftor): a squashed sphere

function flower(y0) {
  const g = lathe(FLOWER, y0, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    const w = THREE.MathUtils.smoothstep(r, hb(0.3), hb(0.6)); // petals only toward the rim
    const k = Math.cos(6 * Math.atan2(z, x));
    p.setX(i, x * (1 + 0.14 * k * w));
    p.setZ(i, z * (1 + 0.14 * k * w));
    p.setY(i, p.getY(i) + hb(0.06) * k * w);
  }
  g.computeVertexNormals();
  return g;
}

function knob(yc, r = KNOB_R) {
  const g = new THREE.SphereGeometry(hb(r), 14, 8);
  g.scale(1, KNOB_SQUASH, 1);
  g.translate(0, hb(yc), 0);
  return g;
}

/** Three cups, a knob and a flower stacked from y0 (hb); returns [parts, top (hb)]. */
function topStack(y0) {
  const g = [];
  let y = y0;
  for (let i = 0; i < 3; i++, y += CUP_H) g.push(lathe(CUP, y));
  g.push(knob(y + KNOB_R * KNOB_SQUASH));
  y += 2 * KNOB_R * KNOB_SQUASH;
  g.push(flower(y));
  return [g, y + FLOWER_H];
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

// Tripod base (Rashi 25:31): a domed hub on three curved feet, with its flower on top.
function base() {
  const g = [];
  const HUB = [[0.01, 0.55], [0.7, 0.6], [0.85, 0.8], [0.72, 1.1], [0.46, 1.5], [0.32, 2.0], [0.26, 2.4]];
  g.push(lathe(HUB, 0, 20));
  g.push(flower(2.4));
  for (const deg of [-90, 30, 150]) {
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const at = (r, y) => new THREE.Vector3(dir.x * hb(r), hb(y), dir.z * hb(r));
    const curve = new THREE.QuadraticBezierCurve3(at(0.5, 1.1), at(1.8, 1.15), at(2.3, 0.25));
    g.push(new THREE.TubeGeometry(curve, 10, hb(0.17), 7, false));
    const foot = new THREE.SphereGeometry(hb(0.3), 10, 6);
    foot.scale(1.2, 0.45, 1.2);
    foot.translate(dir.x * hb(2.35), hb(0.14), dir.z * hb(2.35));
    g.push(foot);
  }
  return g;
}

export function createMenorah() {
  const group = new THREE.Group();
  group.name = 'menorah';
  group.position.set(m(M.x), 0, m(M.z));

  const geos = [...base()];
  // Shaft from the base flower up to the top stack, with its lowest cup, knob and flower.
  const shaftTop = M.topCups;
  geos.push(new THREE.CylinderGeometry(hb(M.shaftRadius), hb(M.shaftRadius), hb(shaftTop - M.base), 10).translate(0, hb((shaftTop + M.base) / 2), 0));
  geos.push(lathe(CUP, M.lowerCup - 0.4));
  geos.push(knob(M.lowerCup + 0.2 + KNOB_R * KNOB_SQUASH));
  geos.push(flower(M.lowerCup + 0.2 + 2 * KNOB_R * KNOB_SQUASH));
  // A knob under each pair of branches (25:35), slightly fuller than the others.
  for (const y of M.branchKnobs) geos.push(knob(y, 0.5));

  // Lamp positions (hb, local x) and the arms that carry them.
  const columns = [0];
  for (const r of M.armRadii) {
    for (const side of [-1, 1]) {
      const curve = new ArmCurve(r, side, M.armCenter, M.topCups + 0.05);
      geos.push(new THREE.TubeGeometry(curve, 28, hb(M.armRadius), 8, false));
      columns.push(side * r);
    }
  }

  // Cups, knob, flower and lamp at the top of the shaft and every arm. The six outer lamps'
  // spouts turn toward the center (Ex 25:37, Rashi); the middle lamp's faces west (toward the
  // veil; Menachot 98b, the "western lamp").
  const wicks = [];
  const lampGeo = lamp();
  for (const x of columns) {
    const [stack, top] = topStack(M.topCups);
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

  const flames = createLampFlames(wicks, { width: 0.026, height: 0.068, brightness: 1.6 });
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
