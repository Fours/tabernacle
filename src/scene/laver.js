import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAVER as L, m } from '../config/dimensions.js';
import { circle } from './colliders.js';
import { aoCircle } from './ao.js';
import { WATER } from './materials.js';

// Laver (Ex 30:17-21; 38:8): bronze basin on a bronze base, for the priests' washing, made from
// the bronze mirrors of the serving women. The form is a reconstruction (the text gives none):
// a lathe-turned body (stepped, beaded foot; fluted stem with a knop; a basin with a lotus
// frieze and a thick rolled rim), four spouts with plug taps, two ring handles. Three draws:
// bronze (one merged mesh), water + drips (one mesh, animated in the shader), damp sand.

const TAU = Math.PI * 2;
const SEG = 96; // lathe segments (6 per flute)

// Profile, bottom -> rim (outer) -> basin floor (inner), in cubits: [r, y, opts].
// opts.p: patina weight in this recess; opts.f: flute depth factor; opts.crease: duplicate the
// point so the normals break there (crisp step).
const C = { crease: true };
function laverProfile() {
  const R = L.radius;
  const pts = [
    [0, 0], [0.82, 0, C], [0.84, 0.005], [0.85, 0.02], [0.85, 0.06, C],
    [0.8, 0.075, C], [0.8, 0.115, C], [0.73, 0.125, { p: 1, crease: true }],
    // bead
    [0.715, 0.135, { p: 0.6 }], [0.735, 0.155], [0.745, 0.18], [0.735, 0.205], [0.715, 0.225, { p: 0.6 }],
    [0.66, 0.235, { p: 1, crease: true }],
    // domed foot rising into the stem
    [0.6, 0.255], [0.5, 0.29], [0.41, 0.34], [0.35, 0.4], [0.31, 0.46, { p: 0.7 }],
    // collar
    [0.3, 0.49, { p: 1, crease: true }], [0.34, 0.505], [0.345, 0.53], [0.34, 0.555], [0.29, 0.575, { p: 1, crease: true }],
    // fluted lower stem
    [0.26, 0.6, { p: 0.6 }], [0.255, 0.63, { f: 1 }], [0.25, 0.71, { f: 1 }], [0.25, 0.79, { f: 1 }], [0.26, 0.815, { p: 0.6 }],
    // knop
    [0.3, 0.83, { p: 0.8 }], [0.35, 0.85], [0.38, 0.88], [0.38, 0.9], [0.35, 0.93], [0.3, 0.95, { p: 0.8 }],
    // fluted upper stem
    [0.26, 0.965, { p: 0.6 }], [0.245, 0.99, { f: 1 }], [0.24, 1.06, { f: 1 }], [0.25, 1.09, { p: 1 }],
    // upper collar under the basin
    [0.31, 1.1, { crease: true }], [0.32, 1.13, C], [0.38, 1.145, { p: 0.9 }],
    // basin underside
    [0.5, 1.17], [0.63, 1.21], [0.76, 1.27], [0.86, 1.34], [0.92, 1.42], [0.955, 1.5], [0.97, 1.56],
    // fillet, frieze band, fillet
    [0.985, 1.575, C], [0.985, 1.595, C], [0.972, 1.605, { p: 0.6, crease: true }],
    [0.972, 1.765, { p: 0.6, crease: true }], [0.985, 1.775, C], [0.985, 1.795, C],
    [0.975, 1.81, { p: 0.5 }], [0.975, 1.85],
    // thick rolled rim (stays within the collider radius R)
    [0.99, 1.87], [1.01, 1.9], [1.015, 1.935], [1.0, 1.97], [0.975, 1.99], [0.945, 2.0], [0.92, 1.99],
    [0.905, 1.97],
    // inner wall down to the basin floor
    [0.91, 1.9], [0.905, 1.78], [0.885, 1.6], [0.84, 1.46], [0.74, 1.34], [0.58, 1.27], [0.38, 1.235],
    [0.18, 1.225], [0, 1.222],
  ];
  const out = [];
  for (const [r, y, o = {}] of pts) {
    const q = { r: m(r * R), y: m(y * (L.height / 2)), p: o.p || 0, f: o.f || 0 };
    out.push(q);
    if (o.crease) out.push({ ...q });
  }
  return out;
}

/** Arc-length v (0..1) per profile point, and a lookup v(y) along the outer wall. */
function profileParams(prof) {
  const s = [0];
  for (let j = 1; j < prof.length; j++) s.push(s[j - 1] + Math.hypot(prof[j].r - prof[j - 1].r, prof[j].y - prof[j - 1].y));
  const total = s[s.length - 1];
  const v = s.map((x) => x / total);
  let top = 0;
  prof.forEach((q, j) => { if (q.y > prof[top].y) top = j; });
  const vOfY = (y) => {
    for (let j = 1; j <= top; j++) {
      const a = prof[j - 1], b = prof[j];
      if (y <= b.y && b.y > a.y) {
        const t = THREE.MathUtils.clamp((y - a.y) / (b.y - a.y), 0, 1);
        return THREE.MathUtils.lerp(v[j - 1], v[j], t);
      }
    }
    return v[top];
  };
  return { v, vOfY, total, top };
}

const uOf = (x, z) => ((Math.atan2(x, z) / TAU) % 1 + 1) % 1;

/** Lathe the profile with fluting, arc-length UVs, crisp creases; returns non-indexed geometry. */
function latheBody(prof, v) {
  const g = new THREE.LatheGeometry(prof.map((q) => new THREE.Vector2(q.r, q.y)), SEG);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const n = prof.length;
  for (let i = 0; i <= SEG; i++) {
    const phi = (i / SEG) * TAU;
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      const f = prof[j].f;
      if (f) {
        // Concave flutes: radius dips between narrow ridges.
        const c = 0.5 + 0.5 * Math.cos(phi * L.flutes);
        const s = 1 - 0.09 * f * Math.pow(c, 0.6);
        pos.setX(k, pos.getX(k) * s);
        pos.setZ(k, pos.getZ(k) * s);
      }
      uv.setXY(k, i / SEG, v[j]);
    }
  }
  g.computeVertexNormals();
  // Weld the seam's normals (first and last columns are separate vertices).
  const nr = g.attributes.normal;
  for (let j = 0; j < n; j++) {
    const a = j, b = SEG * n + j;
    const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l);
    nr.setXYZ(b, x / l, y / l, z / l);
  }
  return g.toNonIndexed();
}

/** Non-indexed part with cylindrical UVs matching the body texture (u by angle, v by height). */
function cylPart(geo, matrix, vOfY) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(matrix);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = uOf(p.getX(i), p.getZ(i));
    uv[i * 2 + 1] = vOfY(p.getY(i));
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}

const mat4 = (pos, rot, scale = [1, 1, 1]) => new THREE.Matrix4().compose(
  new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot, 'YZX')), new THREE.Vector3(...scale));

/**
 * Body textures (procedural), mapped u = angle, v = profile arc length: color, bump and a
 * roughness (G) / metalness (B) map. Mirror-polished bronze with faint hammer and casting
 * marks, verdigris in the recesses and flutes, a tarnished underside, a lotus frieze, mineral
 * streaks under the spouts and a deposit line at the water level inside.
 */
function bodyTextures(prof, pp, spoutUs, spoutV, collarV) {
  const W = 1024, H = 512;
  const mk = (fill) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = fill;
    g.fillRect(0, 0, W, H);
    return { c, g };
  };
  const col = mk('#c08a4c'), bump = mk('#808080'), orm = mk('rgb(255,46,240)'); // rough ~0.18, metal ~0.94
  let seed = 29;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const py = (v) => (1 - v) * H;
  // Draw f(px) at x and its wrapped copies.
  const wrap = (x, r, f) => { for (const dx of [-W, 0, W]) if (x + dx + r >= 0 && x + dx - r <= W) f(x + dx); };
  const blob = (g, x, y, rx, ry, color) => wrap(x, rx, (px) => {
    g.save();
    g.translate(px, y);
    g.scale(1, ry / rx);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grd.addColorStop(0, color);
    grd.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grd;
    g.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    g.restore();
  });

  // Casting / polishing mottle.
  for (let i = 0; i < 120; i++) {
    const x = rnd() * W, y = rnd() * H, r = 15 + rnd() * 60, a = 0.04 + rnd() * 0.07;
    blob(col.g, x, y, r, r * 0.6, rnd() < 0.5 ? `rgba(90,55,25,${a})` : `rgba(255,225,170,${a})`);
    blob(orm.g, x, y, r, r * 0.6, `rgba(255,${rnd() < 0.5 ? 30 : 80},235,${a * 3})`);
  }
  // Hammer dimples (mirrors were beaten sheet; the casting was finished by hammer and polish).
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W, y = rnd() * H, r = 1.5 + rnd() * 3.5;
    wrap(x, r, (px) => {
      bump.g.fillStyle = `rgba(40,40,40,${0.06 + rnd() * 0.08})`;
      bump.g.beginPath(); bump.g.ellipse(px, y, r, r * 0.8, 0, 0, TAU); bump.g.fill();
      col.g.fillStyle = `rgba(255,235,200,${0.03 + rnd() * 0.04})`;
      col.g.beginPath(); col.g.ellipse(px, y - 0.6, r, r * 0.8, 0, 0, TAU); col.g.fill();
    });
  }

  // Verdigris: in each recess row, a band of crusty blue-green, broken up by blotches.
  const patina = (v, weight, spread) => {
    const y = py(v);
    for (let i = 0; i < 35 * weight; i++) {
      const x = rnd() * W, r = 6 + rnd() * 18, a = (0.25 + rnd() * 0.35) * weight;
      const yy = y + (rnd() - 0.5) * spread;
      blob(col.g, x, yy, r, spread * 0.7, `rgba(${70 + rnd() * 30},${115 + rnd() * 30},${95 + rnd() * 20},${a})`);
      blob(orm.g, x, yy, r, spread * 0.7, `rgba(255,${200 + rnd() * 55},${30 + rnd() * 40},${a * 1.4})`);
      blob(bump.g, x, yy, r * 0.6, spread * 0.4, `rgba(170,170,170,${a * 0.6})`);
    }
    col.g.fillStyle = `rgba(60,100,80,${0.35 * weight})`;
    col.g.fillRect(0, y - 1, W, 2);
    orm.g.fillStyle = `rgba(255,210,60,${0.6 * weight})`;
    orm.g.fillRect(0, y - 1, W, 2);
  };
  prof.forEach((q, j) => { if (q.p) patina(pp.v[j], q.p, 7); });

  // Flute grooves: dark verdigris lines down the deepest part of each flute.
  const fl = prof.map((q, j) => (q.f ? pp.v[j] : null)).filter((x) => x !== null);
  const flRanges = [[fl[0], fl[2]], [fl[3], fl[4]]];
  for (const [v0, v1] of flRanges) {
    for (let k = 0; k < L.flutes; k++) {
      const x = (k / L.flutes) * W; // the flute is deepest where cos(n phi) = 1
      const y0 = py(v1) - 4, y1 = py(v0) + 4;
      const grd = col.g.createLinearGradient(x - 9, 0, x + 9, 0);
      grd.addColorStop(0, 'rgba(60,100,80,0)'); grd.addColorStop(0.5, 'rgba(60,100,80,0.55)'); grd.addColorStop(1, 'rgba(60,100,80,0)');
      col.g.fillStyle = grd;
      col.g.fillRect(x - 9, y0, 18, y1 - y0);
      orm.g.fillStyle = 'rgba(255,200,60,0.5)';
      orm.g.fillRect(x - 4, y0, 8, y1 - y0);
    }
  }

  // Tarnish on the basin's underside and dust on the foot.
  const vUnder0 = collarV, vUnder1 = pp.vOfY(m(1.45));
  const tg = col.g.createLinearGradient(0, py(vUnder1), 0, py(vUnder0));
  tg.addColorStop(0, 'rgba(70,45,25,0)'); tg.addColorStop(1, 'rgba(70,45,25,0.35)');
  col.g.fillStyle = tg;
  col.g.fillRect(0, py(vUnder1), W, py(vUnder0) - py(vUnder1));
  const vFoot = pp.vOfY(m(0.12));
  const dg = col.g.createLinearGradient(0, py(vFoot), 0, H);
  dg.addColorStop(0, 'rgba(150,120,85,0)'); dg.addColorStop(1, 'rgba(150,120,85,0.45)');
  col.g.fillStyle = dg;
  col.g.fillRect(0, py(vFoot), W, H - py(vFoot));
  orm.g.fillStyle = 'rgba(255,170,120,0.5)';
  orm.g.fillRect(0, py(vFoot), W, H - py(vFoot));

  // Lotus frieze between the fillets: alternating open lotus and bud, raised in the bump map,
  // with verdigris in the outlines.
  const bandJ = prof.findIndex((q) => q.p === 0.6 && q.r < m(L.radius) && q.y > m(1.5));
  const vb0 = pp.v[bandJ + 1], vb1 = pp.v[bandJ + 2];
  const yTop = py(vb1), yBot = py(vb0), bh = yBot - yTop;
  const N = L.lotus * 2;
  for (let k = 0; k < N; k++) {
    const cx = ((k + 0.5) / N) * W, w = W / N;
    const draw = (g, fill, stroke, lw) => wrap(cx, w, (x) => {
      g.beginPath();
      if (k % 2 === 0) { // open lotus: three pointed petals
        for (const [dx, hgt, wd] of [[-0.24, 0.66, 0.26], [0.24, 0.66, 0.26], [0, 0.86, 0.3]]) {
          const bx = x + dx * w, tip = yBot - hgt * bh;
          g.moveTo(bx, yBot - 0.08 * bh);
          g.quadraticCurveTo(bx - wd * w, yBot - 0.5 * hgt * bh, bx, tip);
          g.quadraticCurveTo(bx + wd * w, yBot - 0.5 * hgt * bh, bx, yBot - 0.08 * bh);
        }
      } else { // bud on a short stalk
        g.moveTo(x, yBot - 0.08 * bh);
        g.lineTo(x, yBot - 0.3 * bh);
        g.moveTo(x, yBot - 0.28 * bh);
        g.quadraticCurveTo(x - 0.2 * w, yBot - 0.45 * bh, x, yBot - 0.66 * bh);
        g.quadraticCurveTo(x + 0.2 * w, yBot - 0.45 * bh, x, yBot - 0.28 * bh);
      }
      if (fill) { g.fillStyle = fill; g.fill(); }
      g.strokeStyle = stroke; g.lineWidth = lw; g.stroke();
    });
    draw(bump.g, 'rgb(210,210,210)', 'rgb(60,60,60)', 2);
    draw(col.g, 'rgba(255,225,170,0.18)', 'rgba(55,95,75,0.8)', 2);
    draw(orm.g, null, 'rgba(255,200,70,0.8)', 1.5);
  }
  // Base line under the frieze.
  bump.g.fillStyle = 'rgb(180,180,180)';
  bump.g.fillRect(0, yBot - 0.08 * bh - 1, W, 2);

  // Mineral streaks below each spout, down the basin wall to the underside.
  for (const u of spoutUs) {
    const x0 = u * W, y0 = py(spoutV), y1 = py(collarV) + 10;
    for (let s = 0; s < 9; s++) {
      const x = x0 + (rnd() - 0.5) * 22, len = (0.4 + rnd() * 0.6) * (y1 - y0), wd = 2 + rnd() * 4;
      wrap(x, wd, (px) => {
        const gc = col.g.createLinearGradient(0, y0, 0, y0 + len);
        gc.addColorStop(0, 'rgba(75,95,70,0.55)'); gc.addColorStop(0.6, 'rgba(95,105,80,0.35)'); gc.addColorStop(1, 'rgba(95,105,80,0)');
        col.g.fillStyle = gc;
        col.g.fillRect(px - wd / 2, y0, wd, len);
        const go = orm.g.createLinearGradient(0, y0, 0, y0 + len);
        go.addColorStop(0, 'rgba(255,160,130,0.8)'); go.addColorStop(1, 'rgba(255,160,130,0)');
        orm.g.fillStyle = go;
        orm.g.fillRect(px - wd / 2, y0, wd, len);
      });
    }
    blob(col.g, x0, y0, 22, 10, 'rgba(70,110,85,0.6)');
  }

  // Inside: a pale deposit line at the water level, darker metal below it.
  const top = pp.top, n = prof.length;
  let vw = pp.v[n - 1];
  for (let j = top + 1; j < n; j++) if (prof[j].y <= m(L.waterLevel)) { vw = pp.v[j]; break; }
  const yw = py(vw);
  col.g.fillStyle = 'rgba(70,95,75,0.6)';
  col.g.fillRect(0, yw - 2, W, H - yw + 2);
  col.g.fillStyle = 'rgba(205,200,170,0.45)';
  col.g.fillRect(0, yw - 4, W, 3);
  orm.g.fillStyle = 'rgba(255,200,90,0.8)';
  orm.g.fillRect(0, yw - 4, W, H - yw + 4);

  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(col.c, true), bumpMap: tex(bump.c), ormMap: tex(orm.c) };
}

/** Damp sand under the laver: a soft ring round the foot and darker spots under each spout. */
function dampTexture(spoutDirs, extent, spoutR) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 53;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const toPx = (meters) => (meters / (2 * extent)) * S;
  const spot = (x, y, r, a) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(30,20,10,${a})`);
    grd.addColorStop(1, 'rgba(40,28,16,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  spot(S / 2, S / 2, toPx(m(1.3)), 0.55);
  for (let i = 0; i < 30; i++) {
    const a = rnd() * TAU, d = toPx(m(0.6 + rnd() * 0.6));
    spot(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, toPx(m(0.12 + rnd() * 0.2)), 0.2 + rnd() * 0.15);
  }
  for (const [dx, dz] of spoutDirs) {
    // Plane is rotated -90 deg about X: texture +x = world +x, texture down = world +z.
    const x = S / 2 + toPx(dx * spoutR), y = S / 2 + toPx(dz * spoutR);
    spot(x, y, toPx(m(0.42)), 0.65);
    spot(x, y, toPx(m(0.16)), 0.6);
    for (let i = 0; i < 5; i++) spot(x + (rnd() - 0.5) * toPx(m(0.4)), y + (rnd() - 0.5) * toPx(m(0.4)), toPx(m(0.05 + rnd() * 0.06)), 0.4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Water + drips in one mesh. aDrip = (isDrip, phase, fall height) and aCenter (drop center)
 * drive the drops in the vertex shader; the surface gets small animated ripples via normals.
 */
function patchWater(mat, time, center) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aDrip;
attribute vec3 aCenter;
uniform float uTime;
varying vec3 vWPos;
varying float vIsDrip;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vIsDrip = aDrip.x;
if (aDrip.x > 0.5) {
  // Each drop swells at the spout's lip, then falls under gravity and vanishes at the ground.
  float period = 2.3 + aDrip.y * 1.4;
  float tl = mod(uTime + aDrip.y * 7.0, period);
  float fallT = 0.38;
  float hang = period - fallT;
  float grow = clamp(tl / hang, 0.0, 1.0);
  float ft = max(tl - hang, 0.0);
  float drop = 4.9 * ft * ft;
  float s = mix(0.35, 1.0, grow) * step(drop, aDrip.z);
  transformed = aCenter + (transformed - aCenter) * s;
  transformed.y -= drop;
}`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;\nvarying float vIsDrip;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (vIsDrip < 0.5) {
  // Gentle wind ripples plus a slow ring spreading from the center (gradient of a height sum).
  vec2 p = vWPos.xz;
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 38.0 - uTime * 2.1) * 0.03;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 53.0 - uTime * 2.7 + 1.3) * 0.02;
  g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 71.0 - uTime * 3.4 + 4.1) * 0.012;
  vec2 c = p - vec2(${center.x.toFixed(4)}, ${center.y.toFixed(4)});
  float d = length(c) + 1e-4;
  g += (c / d) * cos(d * 60.0 - uTime * 3.0) * 0.02 * (1.0 - smoothstep(0.1, 0.42, d));
  // Fake depth/sky variation so the ripples read even without a bright reflection.
  diffuseColor.rgb *= 1.0 + 6.0 * (g.x + 0.6 * g.y);
  normal = normalize(normal - (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz);
}`);
  };
  mat.customProgramCacheKey = () => 'laver-water-v1';
}

export function createLaver() {
  const group = new THREE.Group();
  group.name = 'laver';
  const R = L.radius;
  const prof = laverProfile();
  const pp = profileParams(prof);

  // Spouts on the lower basin wall, pointing out and slightly down, with a plug tap on top.
  const spoutY = m(1.48), spoutR0 = m(0.9), spoutLen = m(0.34), tilt = 0.32;
  const spoutDirs = [], spoutUs = [], tips = [];
  const matrices = [];
  for (let i = 0; i < L.spouts; i++) {
    const a = (i / L.spouts) * TAU + Math.PI / 4;
    const dx = Math.cos(a), dz = -Math.sin(a);
    spoutDirs.push([dx, dz]);
    spoutUs.push(uOf(dx, dz));
    const mid = spoutR0 + (spoutLen / 2) * Math.cos(tilt);
    const tipR = spoutR0 + spoutLen * Math.cos(tilt), tipY = spoutY - spoutLen * Math.sin(tilt);
    tips.push(new THREE.Vector3(dx * tipR, tipY - m(0.04), dz * tipR));
    matrices.push({ a, mid, tipR, tipY });
  }

  const parts = [latheBody(prof, pp.v)];
  const vOfY = pp.vOfY;
  for (const { a, mid, tipR, tipY } of matrices) {
    // Spout tube (axis along local +x after rotation), tapering outward.
    const rotSpout = [0, a, -Math.PI / 2 - tilt];
    const midY = spoutY - (spoutLen / 2) * Math.sin(tilt);
    const tube = new THREE.CylinderGeometry(m(0.04), m(0.065), spoutLen, 12, 1, true);
    parts.push(cylPart(tube, mat4([Math.cos(a) * mid, midY, -Math.sin(a) * mid], rotSpout), vOfY));
    // Lip at the mouth and a boss where it meets the wall.
    const lip = new THREE.TorusGeometry(m(0.045), m(0.012), 6, 12).rotateY(Math.PI / 2);
    parts.push(cylPart(lip, mat4([Math.cos(a) * tipR, tipY, -Math.sin(a) * tipR], [0, a, -tilt]), vOfY));
    const boss = new THREE.TorusGeometry(m(0.07), m(0.02), 6, 14).rotateY(Math.PI / 2);
    const bR = spoutR0 + m(0.03);
    parts.push(cylPart(boss, mat4([Math.cos(a) * bR, spoutY, -Math.sin(a) * bR], [0, a, -tilt]), vOfY));
    // Plug tap: a stem through the spout with a flat lever on top.
    const tapR = spoutR0 + spoutLen * 0.55 * Math.cos(tilt), tapY = spoutY - spoutLen * 0.55 * Math.sin(tilt);
    const stem = new THREE.CylinderGeometry(m(0.022), m(0.026), m(0.16), 8);
    parts.push(cylPart(stem, mat4([Math.cos(a) * tapR, tapY + m(0.07), -Math.sin(a) * tapR], [0, 0, 0]), vOfY));
    const lever = new THREE.BoxGeometry(m(0.2), m(0.025), m(0.04));
    parts.push(cylPart(lever, mat4([Math.cos(a) * tapR, tapY + m(0.16), -Math.sin(a) * tapR], [0, a + Math.PI / 2, 0]), vOfY));
    const knob = new THREE.SphereGeometry(m(0.028), 8, 6);
    parts.push(cylPart(knob, mat4([Math.cos(a) * tapR, tapY + m(0.17), -Math.sin(a) * tapR], [0, 0, 0]), vOfY));
  }
  // Two cast ring handles hanging from lugs just under the rim (east and west).
  for (let i = 0; i < L.handles; i++) {
    const a = (i / L.handles) * TAU;
    const dx = Math.cos(a), dz = -Math.sin(a);
    const lugR = m(0.99), lugY = m(1.83);
    const lug = new THREE.CylinderGeometry(m(0.035), m(0.045), m(0.1), 10).rotateZ(Math.PI / 2);
    parts.push(cylPart(lug, mat4([dx * lugR, lugY, dz * lugR], [0, a, 0]), vOfY));
    const ringR = m(0.12), ringC = m(1.04);
    const ring = new THREE.TorusGeometry(ringR, m(0.022), 8, 24);
    // Ring hangs in the plane tangent to the wall, its top through the lug.
    parts.push(cylPart(ring, mat4([dx * ringC, lugY - ringR + m(0.02), dz * ringC], [0, a + Math.PI / 2, 0]), vOfY));
  }

  const tex = bodyTextures(prof, pp, spoutUs, vOfY(spoutY), vOfY(m(1.13)));
  const bronze = new THREE.MeshStandardMaterial({
    name: 'laver-bronze',
    color: 0xffffff,
    map: tex.map,
    bumpMap: tex.bumpMap,
    bumpScale: 0.7,
    roughnessMap: tex.ormMap,
    metalnessMap: tex.ormMap,
    roughness: 1,
    metalness: 1,
  });
  const body = new THREE.Mesh(mergeGeometries(parts), bronze);
  parts.forEach((p) => p.dispose());
  body.name = 'laver-bronze';
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // Water surface (meets the inner wall just below the rim) and four drops in one mesh.
  const surf = new THREE.CircleGeometry(m(0.912 * R), 48).rotateX(-Math.PI / 2).translate(0, m(L.waterLevel), 0);
  const geos = [surf];
  const dripAttr = [], centerAttr = [];
  const pushAttr = (count, d, c) => { for (let i = 0; i < count; i++) { dripAttr.push(...d); centerAttr.push(c.x, c.y, c.z); } };
  pushAttr(surf.attributes.position.count, [0, 0, 0], new THREE.Vector3());
  tips.forEach((tip, i) => {
    const g = new THREE.SphereGeometry(0.009, 8, 6).scale(1, 1.35, 1).translate(tip.x, tip.y, tip.z);
    g.deleteAttribute('uv'); // keep attribute sets equal
    geos.push(g);
    pushAttr(g.attributes.position.count, [1, (i * 0.37) % 1, tip.y], tip);
  });
  surf.deleteAttribute('uv');
  const wg = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  wg.setAttribute('aDrip', new THREE.Float32BufferAttribute(dripAttr, 3));
  wg.setAttribute('aCenter', new THREE.Float32BufferAttribute(centerAttr, 3));
  const time = { value: 0 };
  patchWater(WATER, time, new THREE.Vector2(m(L.x), m(L.z)));
  const water = new THREE.Mesh(wg, WATER);
  water.name = 'laver-water';
  water.frustumCulled = false; // drops move in the shader
  group.add(water);

  // Damp sand: transparent decal just above the ground (polygon offset, no depth write).
  const extent = m(1.9);
  const dampMat = new THREE.MeshStandardMaterial({
    name: 'laver-damp',
    map: dampTexture(spoutDirs, extent, tips[0] ? Math.hypot(tips[0].x, tips[0].z) : m(1.2)),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 0.62,
  });
  const damp = new THREE.Mesh(new THREE.PlaneGeometry(2 * extent, 2 * extent).rotateX(-Math.PI / 2), dampMat);
  damp.name = 'laver-damp';
  damp.position.y = 0.003;
  damp.receiveShadow = true;
  group.add(damp);

  group.position.set(m(L.x), 0, m(L.z));
  group.userData.colliders = [circle(m(L.x), m(L.z), m(R))];
  // Contact AO: tight round the foot, broad and faint under the basin.
  group.userData.aoShapes = [aoCircle(m(L.x), m(L.z), m(L.footRadius), 0.35, 0.6), aoCircle(m(L.x), m(L.z), m(L.stemRadius), m(R) + 0.5, 0.22)];
  group.userData.update = (dt, t) => { time.value = t; };
  return group;
}
