import * as THREE from 'three';
import { ALTAR, ASH_HEAP as AH, m } from '../config/dimensions.js';
import { circle } from './colliders.js';
import { aoCircle } from './ao.js';

/**
 * The place of the ashes east of the bronze altar (Lev 1:16; 6:10-11): a low, slumped heap of
 * cold ash raked off the altar, with charcoal and a few half-burnt ends in it. One mesh: a
 * polar grid displaced into a lumpy mound (sunk a little at its rim so it meets the sand), a
 * top-down canvas texture for the ash's grain, charcoal flecks and pale fine ash, used as
 * colour and bump. Collides; clears the scatter; contact AO on the sand.
 */

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Top-down ash texture over the heap's footprint (u east, v south). */
function ashTexture(seed = 5) {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const rnd = rng(seed);
  g.fillStyle = 'rgb(132,129,124)';
  g.fillRect(0, 0, N, N);
  // Soft drifts: paler fine ash and darker, sootier hollows.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * N, y = rnd() * N, r = 20 + rnd() * 70;
    const k = rnd() < 0.6 ? 160 + rnd() * 40 : 85 + rnd() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${k},${k * 0.98},${k * 0.96},0.4)`);
    grad.addColorStop(1, `rgba(${k},${k * 0.98},${k * 0.96},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // Grain.
  for (let i = 0; i < 36000; i++) {
    const k = 90 + rnd() * 110;
    g.fillStyle = `rgba(${k},${k * 0.97},${k * 0.92},0.5)`;
    g.fillRect(rnd() * N, rnd() * N, 1, 1);
  }
  // Charcoal: lumps and chips, near black with a faint sheen edge.
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * N, y = rnd() * N, r = 0.5 + Math.pow(rnd(), 4) * 3;
    g.fillStyle = `rgb(${18 + rnd() * 18},${16 + rnd() * 14},${14 + rnd() * 12})`;
    g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); g.fill();
  }
  // A few half-burnt wood ends and white calcined flecks.
  for (let i = 0; i < 18; i++) {
    const x = rnd() * N, y = rnd() * N, len = 8 + rnd() * 16, a = rnd() * 3.14;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgb(28,22,18)'; g.fillRect(-len / 2, -1.6, len, 3.2);
    g.fillStyle = 'rgb(70,50,36)'; g.fillRect(-len / 2, -0.6, len * 0.5, 1.2);
    g.restore();
  }
  // White calcined flecks (bone and fully burnt wood), plenty of them, so the heap reads
  // as ash against the sand (Kyle).
  for (let i = 0; i < 3200; i++) {
    const k = 225 + rnd() * 30, r = 0.6 + Math.pow(rnd(), 2.5) * 1.8;
    g.fillStyle = `rgba(${k},${k},${k * 0.98},${0.75 + rnd() * 0.25})`;
    g.beginPath(); g.ellipse(rnd() * N, rnd() * N, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function heapGeometry(rx, rz, h, seed = 9) {
  const rnd = rng(seed);
  const RINGS = 16, SEG = 48;
  // Lumps: a handful of random bumps (shovel-loads) and a smaller ripple.
  const lumps = Array.from({ length: 11 }, () => ({ a: rnd() * Math.PI * 2, r: Math.sqrt(rnd()) * 0.8, w: 0.2 + rnd() * 0.22, k: 0.06 + rnd() * 0.1 }));
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS; // 0 centre .. 1 rim
    for (let j = 0; j < (i === 0 ? 1 : SEG); j++) {
      const a = (j / SEG) * Math.PI * 2;
      // Ragged outline.
      const wob = 1 + 0.1 * Math.sin(a * 3 + 1.3) + 0.06 * Math.sin(a * 7 + 0.4);
      const x = Math.cos(a) * t * wob, z = Math.sin(a) * t * wob;
      // Slumped profile: rounded crown, long gentle skirt.
      let y = Math.pow(Math.max(0, 1 - t * t), 2.4);
      for (const L of lumps) {
        const dx = x - Math.cos(L.a) * L.r, dz = z - Math.sin(L.a) * L.r;
        y += L.k * Math.exp(-(dx * dx + dz * dz) / (L.w * L.w)) * (1 - t);
      }
      y = y * h - 0.02 * t; // the rim sinks just under the sand
      pos.push(x * rx, y, z * rz);
      uv.push(0.5 + x * 0.5, 0.5 - z * 0.5);
    }
  }
  // Fan for the centre, quads for the rings.
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
  for (let i = 1; i < RINGS; i++) {
    const a0 = 1 + (i - 1) * SEG, a1 = 1 + i * SEG;
    for (let j = 0; j < SEG; j++) {
      const j1 = (j + 1) % SEG;
      idx.push(a0 + j, a0 + j1, a1 + j1, a0 + j, a1 + j1, a1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createAshHeap() {
  const group = new THREE.Group();
  group.name = 'ashHeap';
  const x = m(ALTAR.x + AH.offsetX), z = m(ALTAR.z + AH.offsetZ);
  const rx = m(AH.radiusX), rz = m(AH.radiusZ), h = m(AH.height);
  const tex = ashTexture();
  const mat = new THREE.MeshStandardMaterial({ name: 'ash', map: tex, bumpMap: tex, bumpScale: 0.6, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(heapGeometry(rx, rz, h), mat);
  mesh.name = 'ash-heap';
  mesh.position.set(x, 0, z);
  mesh.rotation.y = 0.25;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.colliders = [circle(x, z, Math.max(rx, rz) * 0.85)];
  group.userData.aoShapes = [aoCircle(x, z, (rx + rz) / 2 * 0.95, 0.18, 0.35)];
  return group;
}
