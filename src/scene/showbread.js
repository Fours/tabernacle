import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHOWBREAD as S, m } from '../config/dimensions.js';
import { GOLD } from './materials.js';
import { part, boxPart, merge } from './bronzeParts.js';
import { box } from './colliders.js';

// The table of showbread (Ex 25:23-30; 37:10-16; Lev 24:5-9): a gold-overlaid table with a
// frame a handbreadth wide, two crowns, four rings and two poles; twelve loaves in two stacks
// of six with a gold cup of frankincense on each; and the table's gold utensils standing on the
// floor beside it. Two merged meshes: gold, and bread with frankincense (vertex colours).
// Local frame: origin on the floor at the table's center, long axis along x.

const L = m(S.length), W = m(S.width), H = m(S.height);
const TOP = m(S.topThickness), FRAME_H = m(S.hb), FT = m(S.frameThickness), INSET = m(S.frameInset);
const LEG = m(S.legSize), CW = m(S.crownWidth), CH = m(S.crownHeight), FC = m(S.frameCrownSize);
const RING_R = m(S.ringRadius), RING_T = m(S.ringTube), POLE_R = m(S.poleRadius);
const ringY = H - TOP - FRAME_H / 2; // rings sit level with the frame
const legX = L / 2 - INSET - LEG / 2, legZ = W / 2 - INSET - LEG / 2;
const ringZ = W / 2 - INSET + RING_R + RING_T * 0.3; // ring/pole axis, just outside the legs

/** Lathe of a [radius, height] profile given in cubits (bottom to top, outer then inner). */
function lathe(profile, segments = 20) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(m(r), m(y))), segments);
}

function goldFrame() {
  const g = [];
  // Slab, frame, crown, legs and rings are gold-overlaid acacia (Ex 25:24, 26).
  g.push(boxPart(L, TOP, W, [0, H - TOP / 2, 0]));
  // Frame (misgeret), a handbreadth wide, set under the slab a little inside its edge.
  const fy = H - TOP - FRAME_H / 2;
  const fx = L / 2 - INSET - FT / 2, fz = W / 2 - INSET - FT / 2;
  for (const s of [-1, 1]) {
    g.push(boxPart(L - 2 * INSET, FRAME_H, FT, [0, fy, s * fz]));
    g.push(boxPart(FT, FRAME_H, W - 2 * INSET - 2 * FT, [s * fx, fy, 0]));
  }
  // The frame's own crown: a bead along its lower edge (25:25).
  const by = H - TOP - FRAME_H + FC / 2;
  const bx = L / 2 - INSET + FC / 2, bz = W / 2 - INSET + FC / 2;
  for (const s of [-1, 1]) {
    g.push(boxPart(L - 2 * INSET + 2 * FC, FC, FC, [0, by, s * bz]));
    g.push(boxPart(FC, FC, W - 2 * INSET, [s * bx, by, 0]));
  }
  // The crown (zer) around the top: wraps the slab's edge and rises above it (25:24).
  const wrap = m(0.03);
  const cy = H - wrap + (CH + wrap) / 2;
  for (const s of [-1, 1]) {
    g.push(boxPart(L + 2 * m(0.008), CH + wrap, CW, [0, cy, s * (W / 2 - CW / 2 + m(0.008))]));
    g.push(boxPart(CW, CH + wrap, W - 2 * CW, [s * (L / 2 - CW / 2 + m(0.008)), cy, 0]));
  }
  // Legs with small foot caps.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.push(boxPart(LEG, H - TOP, LEG, [sx * legX, (H - TOP) / 2, sz * legZ]));
      g.push(boxPart(LEG * 1.35, m(0.035), LEG * 1.35, [sx * legX, m(0.0175), sz * legZ]));
      // Four rings at the feet, near the frame (25:26-27), on the long sides.
      g.push(part(new THREE.TorusGeometry(RING_R, RING_T, 8, 20).rotateY(Math.PI / 2),
        { pos: [sx * legX, ringY, sz * ringZ] }));
    }
  }
  // Two poles of acacia overlaid with gold, through the rings along the long sides (25:28).
  const poleHalf = L / 2 + m(S.poleOverhang);
  for (const sz of [-1, 1]) {
    g.push(part(new THREE.CylinderGeometry(POLE_R, POLE_R, 2 * poleHalf, 10).rotateZ(Math.PI / 2),
      { pos: [0, ringY, sz * ringZ] }));
  }
  return g;
}

// ---- Bread and frankincense (vertex-coloured, one material) --------------------------------

const rng = (seed) => {
  let s = (seed * 16807) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

// ---- Crust textures --------------------------------------------------------------------------

const TILE = 0.36; // meters of loaf surface per texture tile (a bit more than a loaf's length)
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix3 = (out, a, b, t) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
};

/** Seamlessly tiling fractal value noise, 0..1, as a Float32Array(size*size). */
function tileFbm(size, basePeriod, octaves, seed) {
  const out = new Float32Array(size * size);
  const r = rng(seed);
  let amp = 1, total = 0;
  const idx0 = new Int32Array(size), idx1 = new Int32Array(size), wt = new Float32Array(size);
  for (let o = 0; o < octaves; o++) {
    const period = basePeriod * (1 << o);
    const grid = new Float32Array(period * period);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    const k = period / size;
    for (let i = 0; i < size; i++) {
      const f = i * k, i0 = Math.floor(f), t = f - i0;
      idx0[i] = i0 % period;
      idx1[i] = (i0 + 1) % period;
      wt[i] = t * t * (3 - 2 * t);
    }
    for (let y = 0; y < size; y++) {
      const ra = idx0[y] * period, rb = idx1[y] * period, ty = wt[y], row = y * size;
      for (let x = 0; x < size; x++) {
        const a = grid[ra + idx0[x]], b = grid[ra + idx1[x]];
        const c = grid[rb + idx0[x]], d = grid[rb + idx1[x]];
        const tx = wt[x];
        out[row + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/**
 * Baked crust, tileable: a colour map (browning from golden to brown, pale under-baked
 * patches, scorched and charred spots, blisters, cracks, docking pits, a flour dusting) and a
 * data map with the crust height in R (for bump) and roughness in G. The loaves sample it at
 * a different offset, rotation and mirroring each. The edge browning lives in vertex colours.
 */
function createBreadTextures(size = 768) {
  const rnd = rng(77);
  const mott = tileFbm(size, 3, 4, 101);
  const scorchF = tileFbm(size, 4, 4, 202);
  const charF = tileFbm(size, 5, 4, 303);
  const grain = tileFbm(size, 128, 2, 404);
  const heightF = tileFbm(size, 6, 5, 505);

  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const cc = mk(), hc = mk();
  const g = cc.getContext('2d'), h = hc.getContext('2d');

  // Base colour and height from the noise fields.
  // Tan wheat crust: low saturation so the menorah's warm light doesn't push it to red.
  const GOLD_C = [222, 188, 138], BROWN_C = [186, 148, 102], PALE_C = [234, 214, 176];
  const SCORCH_C = [112, 88, 62], CHAR_C = [58, 46, 34];
  const ci = g.createImageData(size, size), hi = h.createImageData(size, size);
  const px = [0, 0, 0];
  for (let i = 0; i < size * size; i++) {
    const m = mott[i], gr = grain[i];
    mix3(px, GOLD_C, BROWN_C, sstep(0.36, 0.62, m));
    mix3(px, px, PALE_C, sstep(0.4, 0.3, m) * 0.4);
    const sc = sstep(0.655, 0.75, scorchF[i]) * (0.6 + 0.4 * sstep(0.35, 0.65, gr));
    mix3(px, px, SCORCH_C, sc * 0.35);
    const ch = sstep(0.75, 0.8, charF[i]) * (0.7 + 0.3 * sstep(0.3, 0.7, gr));
    mix3(px, px, CHAR_C, ch * 0.6);
    const f = 0.92 + 0.16 * gr;
    ci.data[i * 4] = px[0] * f;
    ci.data[i * 4 + 1] = px[1] * f;
    ci.data[i * 4 + 2] = px[2] * f;
    ci.data[i * 4 + 3] = 255;
    const hv = 0.5 + (heightF[i] - 0.5) * 1.1 + (gr - 0.5) * 0.25 - sc * 0.06 + ch * 0.05 * (gr - 0.5) * 4;
    const k = Math.max(0, Math.min(255, hv * 255));
    hi.data[i * 4] = hi.data[i * 4 + 1] = hi.data[i * 4 + 2] = k;
    hi.data[i * 4 + 3] = 255;
  }
  g.putImageData(ci, 0, 0);
  h.putImageData(hi, 0, 0);

  // Features are drawn on both colour and height; `wrap` repeats a stamp across tile edges.
  const wrap = (cx, cy, r, fn) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const x = cx + dx, y = cy + dy;
        if (x + r > 0 && x - r < size && y + r > 0 && y - r < size) fn(x, y);
      }
    }
  };
  const radial = (ctx, x, y, r, stops) => {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (const [t, c] of stops) gr.addColorStop(t, c);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Blisters: raised bubbles, some with a scorched cap, some burst to show the paler crumb.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size, y = rnd() * size, r = 7 + Math.pow(rnd(), 1.6) * 30, kind = rnd();
    wrap(x, y, r * 1.4, (cx, cy) => {
      radial(h, cx, cy, r * 1.25, [[0, 'rgba(255,255,255,0.85)'], [0.7, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
      h.strokeStyle = 'rgba(0,0,0,0.2)';
      h.lineWidth = Math.max(1, r * 0.2);
      h.beginPath();
      h.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
      h.stroke();
      if (kind < 0.45) { // scorched cap
        radial(g, cx, cy, r * 0.9, [[0, 'rgba(92,72,50,0.55)'], [0.6, 'rgba(110,88,62,0.3)'], [1, 'rgba(110,88,62,0)']]);
      } else if (kind < 0.8) { // pale, thin-skinned blister
        radial(g, cx, cy, r, [[0, 'rgba(244,214,150,0.5)'], [0.7, 'rgba(236,196,128,0.25)'], [1, 'rgba(236,196,128,0)']]);
        g.strokeStyle = 'rgba(110,86,60,0.18)';
        g.lineWidth = Math.max(1, r * 0.12);
        g.beginPath();
        g.arc(cx + r * 0.1, cy + r * 0.1, r * 1.1, 0.2, 2.4);
        g.stroke();
      } else { // burst
        radial(g, cx, cy, r * 0.7, [[0, 'rgba(236,200,140,0.9)'], [1, 'rgba(236,200,140,0)']]);
        g.strokeStyle = 'rgba(84,66,46,0.6)';
        g.lineWidth = Math.max(1.2, r * 0.14);
        g.beginPath();
        g.arc(cx, cy, r * 0.75, 0.4, 5.6);
        g.stroke();
        h.fillStyle = 'rgba(0,0,0,0.5)';
        h.beginPath();
        h.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
        h.fill();
      }
    });
  }

  // Cracks: wandering dark fissures, some with the pale crumb showing along one lip.
  for (let i = 0; i < 26; i++) {
    let x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI * 2;
    const n = 8 + Math.floor(rnd() * 22), w = 1 + rnd() * 1.8, crumb = rnd() < 0.4;
    const pts = [[x, y]];
    for (let k = 0; k < n; k++) {
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a) * 6;
      y += Math.sin(a) * 6;
      pts.push([x, y]);
    }
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const stroke = (ctx, style, lw, ox = 0, oy = 0) => {
          ctx.strokeStyle = style;
          ctx.lineWidth = lw;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          pts.forEach(([px_, py_], k) => (k ? ctx.lineTo(px_ + dx + ox, py_ + dy + oy) : ctx.moveTo(px_ + dx + ox, py_ + dy + oy)));
          ctx.stroke();
        };
        if (crumb) stroke(g, 'rgba(238,204,140,0.35)', w * 1.6, 1.5, -1.5);
        stroke(g, 'rgba(78,60,42,0.75)', w);
        stroke(h, 'rgba(0,0,0,0.45)', w * 2.6);
        stroke(h, 'rgba(0,0,0,0.9)', w);
      }
    }
  }

  // Docking pits (flat bread is pricked before baking) and a few tiny air-holes.
  for (let i = 0; i < 140; i++) {
    const x = rnd() * size, y = rnd() * size, r = 1.3 + rnd() * 2;
    wrap(x, y, r * 2, (cx, cy) => {
      radial(g, cx, cy, r * 1.6, [[0, 'rgba(66,52,38,0.6)'], [0.6, 'rgba(90,72,52,0.3)'], [1, 'rgba(90,72,52,0)']]);
      radial(h, cx, cy, r * 1.8, [[0, 'rgba(0,0,0,0.9)'], [1, 'rgba(0,0,0,0)']]);
    });
  }

  // Flour: broad faint smudges and many fine specks.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * size, y = rnd() * size, r = 25 + rnd() * 70, a = 0.05 + rnd() * 0.1;
    wrap(x, y, r, (cx, cy) => radial(g, cx, cy, r, [[0, `rgba(250,242,226,${a})`], [1, 'rgba(250,242,226,0)']]));
  }
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * size, y = rnd() * size, r = 0.5 + Math.pow(rnd(), 3) * 2.2, a = 0.15 + rnd() * 0.45;
    wrap(x, y, r, (cx, cy) => {
      g.fillStyle = `rgba(252,245,230,${a})`;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    });
  }

  // Pack height (R) and roughness (G) into one data map. Roughness follows the colour:
  // matte flour and pale crumb, slightly glossier where the crust is toasted dark.
  const cd = g.getImageData(0, 0, size, size).data, hd = h.getImageData(0, 0, size, size).data;
  const dc = mk(), d = dc.getContext('2d');
  const di = d.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const r = cd[i * 4] / 255, gg = cd[i * 4 + 1] / 255, b = cd[i * 4 + 2] / 255;
    const lum = 0.3 * r + 0.59 * gg + 0.11 * b;
    const mx = Math.max(r, gg, b), sat = mx > 0 ? (mx - Math.min(r, gg, b)) / mx : 0;
    const flour = sstep(0.8, 0.9, lum) * sstep(0.4, 0.2, sat);
    const rough = Math.min(1, 0.93 - 0.22 * sstep(0.42, 0.12, lum) + 0.06 * flour);
    di.data[i * 4] = hd[i * 4];
    di.data[i * 4 + 1] = rough * 255;
    di.data[i * 4 + 2] = 255;
    di.data[i * 4 + 3] = 255;
  }
  d.putImageData(di, 0, 0);

  const finish = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: finish(cc, true), data: finish(dc, false) };
}

// ---- Loaves ----------------------------------------------------------------------------------

/**
 * One flat loaf, a little different each time: wobbly outline, softly rounded rim, uneven
 * dome. Centered on its base; planar crust UVs (turned, shifted and maybe mirrored per loaf);
 * vertex colours carry the edge browning and charred rim spots (rgb) and the "is bread" mask
 * (a = 1; resin lumps use 0 so they skip the crust texture).
 */
function loaf(rnd) {
  const { length, width, thickness } = S.loaf;
  const w = m(length), d = m(width), h = m(thickness);
  let g = new THREE.BoxGeometry(w, h, d, 34, 4, 26);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);

  // Per-loaf shape parameters.
  const TAU = Math.PI * 2;
  const harm = [2, 3, 4, 5, 7].map((k) => ({ k, a: (0.05 / k) * (0.4 + rnd() * 0.6), p: rnd() * TAU }));
  const wob = { a: 18 + rnd() * 14, b: 20 + rnd() * 14, c: 14 + rnd() * 10, d: 12 + rnd() * 12, p: [rnd() * TAU, rnd() * TAU, rnd() * TAU], amp: 0.05 + rnd() * 0.05 };
  const tilt = [(rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12];
  const domeAmp = 0.12 + rnd() * 0.06;
  const charPh = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
  const tone = 0.9 + rnd() * 0.2;
  const warm = (rnd() - 0.5) * 0.08;
  const ss = THREE.MathUtils.smoothstep;
  const uvRot = rnd() * TAU, flip = rnd() < 0.5 ? -1 : 1, uvOff = [rnd(), rnd()];
  const cr = Math.cos(uvRot), sr = Math.sin(uvRot);

  // Displaced position for an original box vertex (xo, yo, zo); also returns outline data.
  const shape = (xo, yo, zo) => {
    const u = xo / (w / 2), v = zo / (d / 2);
    const rr = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
    const k = rr > 1 ? 1 / rr : 1; // pull the box's corners in toward a rounded outline
    const th = Math.atan2(v, u);
    let f = 1;
    for (const q of harm) f += q.a * Math.cos(q.k * th + q.p);
    let x = xo * k * f, z = zo * k * f, y = yo;
    const edge = ss(Math.min(rr, 1), 0.7, 1);
    if (y > 0) {
      const lift = y / (h / 2);
      const uneven = 0.5 * Math.sin(x * wob.a + wob.p[0]) * Math.cos(z * wob.b + wob.p[1]) + 0.5 * Math.sin(x * wob.c + z * wob.d + wob.p[2]);
      y += h * domeAmp * (1 - rr * rr * 0.5) - h * 0.3 * edge;
      y += lift * h * (wob.amp * uneven * (1 - edge * 0.6) + tilt[0] * u + tilt[1] * v);
    } else if (y < 0) {
      y += h * 0.2 * edge;
    }
    return { x, y: y + h / 2, z, rr, th, u, v };
  };

  const p = g.attributes.position;
  const n = p.count;
  const uv = new Float32Array(n * 2), col = new Float32Array(n * 4);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const xo = p.getX(i), yo = p.getY(i), zo = p.getZ(i);
    const s = shape(xo, yo, zo);
    p.setXYZ(i, s.x, s.y, s.z);
    // UVs: planar on the top, with the rim wall unrolled outward by its depth below the top.
    const top = shape(xo, h / 2, zo).y;
    const drop = Math.max(0, top - s.y);
    const len = Math.hypot(s.x, s.z) || 1;
    const px = s.x + (s.x / len) * drop, pz = s.z + (s.z / len) * drop;
    const a = (px / TILE) * flip, b = pz / TILE;
    uv[i * 2] = a * cr - b * sr + uvOff[0];
    uv[i * 2 + 1] = a * sr + b * cr + uvOff[1];
    // Edge browning: a little darker and browner toward the rim, with faint toasted spots.
    const rr = Math.min(s.rr, 1.05);
    const ed = ss(rr, 0.6, 1.0);
    const nE = 0.5 + 0.25 * Math.sin(5 * s.th + charPh[0]) + 0.17 * Math.sin(11 * s.th + charPh[1]) + 0.08 * Math.sin(23 * s.th + charPh[2]);
    const chr = ss(nE, 0.58, 0.84) * ss(rr, 0.82, 1.0);
    const bottom = yo < -h * 0.2 ? 0.85 : 1;
    const m1 = (1 - 0.2 * ed - 0.25 * chr) * tone * bottom;
    c.setRGB(m1, Math.pow(m1, 1.05 + ed * 0.1) * (1 + warm), Math.pow(m1, 1.15 + ed * 0.2));
    col.set([c.r, c.g, c.b, 1], i * 4);
  }
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return g.toNonIndexed();
}

/** Give a geometry a constant vertex colour (with a little per-vertex variation); a = 0 skips the crust. */
function colored(g, hex, rnd, vary = 0.08) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const f = 1 + (rnd() - 0.5) * 2 * vary;
    col.set([c.r * f, c.g * f, c.b * f, 0], i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return g;
}

/** Move a loaf (already non-indexed, with uv/color) into place. */
function lpart(g, { pos, rot }) {
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(1, 1, 1),
  ));
  return g;
}

/** Part for the vertex-coloured mesh: like `part` but keeps the colour attribute. */
function cpart(geo, opts) {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  const color = flat.attributes.color;
  const g = part(flat, opts);
  g.setAttribute('color', color);
  return g;
}

const CRUST = createBreadTextures();
const BREAD = new THREE.MeshStandardMaterial({
  name: 'showbread',
  color: 0xffffff,
  vertexColors: true, // rgb: edge browning; a: 1 = bread (takes the crust texture), 0 = resin
  map: CRUST.map,
  bumpMap: CRUST.data,
  bumpScale: 0.0035,
  roughnessMap: CRUST.data,
  roughness: 1,
  metalness: 0,
});
BREAD.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  #ifdef USE_COLOR_ALPHA
  sampledDiffuseColor.rgb = mix( vec3( 1.0 ), sampledDiffuseColor.rgb, vColor.a );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif`,
  );
};
BREAD.customProgramCacheKey = () => 'showbread-crust';

// Gold cup of frankincense (25:29; Lev 24:7): a small footed bowl.
const CUP = [[0, 0], [0.05, 0], [0.055, 0.012], [0.04, 0.025], [0.09, 0.045], [0.105, 0.075], [0.098, 0.075], [0.085, 0.05], [0.03, 0.035], [0, 0.03]];
const CUP_H = 0.075;

function stacks() {
  const rnd = rng(11);
  const bread = [];
  const gold = [];
  const stackX = [-0.5, 0.5]; // cubits from the table's center
  const lt = m(S.loaf.thickness);
  for (const sx of stackX) {
    for (let i = 0; i < 6; i++) {
      const yaw = (rnd() - 0.5) * 0.07;
      const g = loaf(rnd);
      bread.push(lpart(g, { pos: [m(sx) + (rnd() - 0.5) * m(0.025), H + i * lt, (rnd() - 0.5) * m(0.025)], rot: [0, yaw, 0] }));
    }
    // The cup of frankincense on top of the stack, with a heap of pale resin.
    const topY = H + 6 * lt + m(0.012);
    gold.push(part(lathe(CUP), { pos: [m(sx), topY, 0] }));
    for (let k = 0; k < 6; k++) {
      const a = k * 2.1 + rnd();
      const r = k === 0 ? 0 : m(0.028 + rnd() * 0.02);
      const lump = new THREE.IcosahedronGeometry(m(0.022 + rnd() * 0.01), 1);
      colored(lump, 0xe9dca0, rnd, 0.12);
      bread.push(cpart(lump, { pos: [m(sx) + Math.cos(a) * r, topY + m(0.05 + (k === 0 ? 0.025 : 0)), Math.sin(a) * r] }));
    }
  }
  return { bread, gold };
}

// The table's utensils (25:29): dishes, spoon-bowls, jars and bowls for the drink offering,
// standing on the floor on the north side where the poles leave room.
function utensils() {
  const g = [];
  const x0 = m(S.utensilsX), z0 = m(S.utensilsZ);
  const put = (profile, dx, dz, y = 0, segs = 24) => g.push(part(lathe(profile, segs), { pos: [x0 + m(dx), m(y), z0 + m(dz)] }));
  const DISH = [[0, 0], [0.12, 0], [0.26, 0.04], [0.29, 0.065], [0.275, 0.065], [0.25, 0.045], [0.11, 0.02], [0, 0.02]];
  put(DISH, -0.62, 0.05);
  put(DISH, -0.62, 0.05, 0.05); // a second dish stacked on the first
  put(DISH, -0.62, 0.05, 0.1);
  const BOWL = [[0, 0], [0.07, 0], [0.16, 0.05], [0.18, 0.13], [0.17, 0.13], [0.15, 0.06], [0.06, 0.025], [0, 0.025]];
  put(BOWL, -0.12, -0.12);
  // Jars (qesavot): a rounded body, narrow neck, flared lip.
  const JAR = [[0, 0], [0.08, 0], [0.12, 0.07], [0.14, 0.16], [0.11, 0.25], [0.06, 0.31], [0.055, 0.37], [0.085, 0.41], [0.075, 0.41], [0.045, 0.37], [0.045, 0.31], [0.1, 0.25], [0.125, 0.16], [0.105, 0.07], [0, 0.03]];
  put(JAR, 0.28, 0.0);
  put(JAR.map(([r, y]) => [r * 0.85, y * 0.85]), 0.6, -0.02);
  // Pans (kappot): shallow ladle-bowls with a short handle.
  put(BOWL, 0.2, -0.28);
  g.push(part(new THREE.BoxGeometry(m(0.25), m(0.025), m(0.04)).translate(m(0.17), m(0.12), 0), { pos: [x0 + m(0.2), 0, z0 - m(0.28)], rot: [0, 0.4, 0] }));
  return g;
}

export function createShowbread() {
  const group = new THREE.Group();
  group.name = 'showbread';
  group.position.set(m(S.x), 0, m(S.z));

  const st = stacks();
  const goldMesh = new THREE.Mesh(merge([...goldFrame(), ...st.gold, ...utensils()]), GOLD);
  goldMesh.name = 'showbread-gold';
  group.add(goldMesh);

  const breadMesh = new THREE.Mesh(merge(st.bread), BREAD);
  breadMesh.name = 'showbread-loaves';
  group.add(breadMesh);

  const cx = m(S.x), cz = m(S.z);
  const poleLen = L + 2 * m(S.poleOverhang);
  group.userData.colliders = [
    box(cx, cz, L + 2 * m(0.01), W + 2 * m(0.01)),
    ...[-1, 1].map((sz) => box(cx, cz + sz * ringZ, poleLen, 2 * POLE_R + 0.06)), // carrying poles
  ];
  group.userData.dispose = () => {
    goldMesh.geometry.dispose();
    breadMesh.geometry.dispose();
    BREAD.dispose();
    CRUST.map.dispose();
    CRUST.data.dispose();
  };
  return group;
}
