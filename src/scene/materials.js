import * as THREE from 'three';

// Shared colors and materials for reuse across scene modules.
// Step 7 (shaders & materials) is expected to refine these in one place.

export const COLORS = {
  bronze: 0xa8692e,
  silver: 0xd4d8de,
  gold: 0xc9a23a,
  acacia: 0x8a5a30,
  linen: 0xeee8d8,
  rope: 0xa08a64,
  // Textile dyes (Ex 26:31; 27:16)
  blue: 0x223f8c, // tekhelet
  purple: 0x6a1f5c, // argaman (red-purple)
  scarlet: 0xb01a2a, // tola'at shani
};

/** Vertical wood-grain texture for acacia (procedural). */
function acaciaGrainTexture() {
  const w = 64, h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#8a5a30';
  g.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w;
    const dark = rnd() < 0.6;
    g.strokeStyle = dark ? `rgba(60,34,14,${0.15 + rnd() * 0.3})` : `rgba(180,130,80,${0.1 + rnd() * 0.2})`;
    g.lineWidth = 0.5 + rnd() * 1.5;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.03 + i) * 1.5, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const BRONZE = new THREE.MeshStandardMaterial({
  name: 'bronze',
  color: COLORS.bronze,
  roughness: 0.45,
  metalness: 0.55,
});

export const SILVER = new THREE.MeshStandardMaterial({
  name: 'silver',
  color: COLORS.silver,
  roughness: 0.3,
  metalness: 0.5,
});

export const GOLD = new THREE.MeshStandardMaterial({
  name: 'gold',
  color: COLORS.gold,
  roughness: 0.35,
  metalness: 0.6,
});

export const ACACIA = new THREE.MeshStandardMaterial({
  name: 'acacia',
  color: 0xffffff,
  map: acaciaGrainTexture(),
  roughness: 0.75,
});

export const ROPE = new THREE.MeshStandardMaterial({
  name: 'rope',
  color: COLORS.rope,
  roughness: 1,
});
