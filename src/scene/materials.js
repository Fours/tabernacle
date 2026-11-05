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

/**
 * Bronze overlay plates (procedural): 1-cubit tile with seam lines, corner rivets and light
 * patina streaks. Meant for geometry whose UVs are in cubits (see `cubitUV` in altar.js).
 */
function bronzePlateTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = rnd() < 0.5 ? `rgba(90,70,50,${0.05 + rnd() * 0.1})` : `rgba(255,255,255,${0.05 + rnd() * 0.1})`;
    g.fillRect(x, y, 1 + rnd() * 3, 6 + rnd() * 22);
  }
  // Seams along the tile edges (wrapping, so draw on both sides).
  g.fillStyle = 'rgba(40,24,10,0.75)';
  g.fillRect(0, 0, 3, S);
  g.fillRect(0, 0, S, 3);
  g.fillStyle = 'rgba(255,230,190,0.25)';
  g.fillRect(3, 0, 1, S);
  g.fillRect(0, 3, S, 1);
  // Rivets.
  for (const [rx, ry] of [[12, 12], [S - 12, 12], [12, S - 12], [S - 12, S - 12], [S / 2, 12], [S / 2, S - 12]]) {
    g.fillStyle = 'rgba(40,24,10,0.6)';
    g.beginPath(); g.arc(rx + 1, ry + 1, 4, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,235,200,0.9)';
    g.beginPath(); g.arc(rx, ry, 3.2, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Speckled dark earth / ash (procedural), for the altar's earth-filled hearth. */
function earthTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#6a5a48';
  g.fillRect(0, 0, S, S);
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const v = 40 + rnd() * 110;
    g.fillStyle = `rgba(${v},${v * 0.85},${v * 0.7},${0.3 + rnd() * 0.5})`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3);
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

/** Bronze overlay with plate seams and rivets. Geometry needs cubit-scaled UVs. */
export const BRONZE_PLATED = new THREE.MeshStandardMaterial({
  name: 'bronze-plated',
  color: COLORS.bronze,
  map: bronzePlateTexture(),
  roughness: 0.45,
  metalness: 0.55,
});

export const EARTH = new THREE.MeshStandardMaterial({
  name: 'earth',
  color: 0xffffff,
  map: earthTexture(),
  roughness: 1,
});

/** Still water in the laver (dark, glossy). */
export const WATER = new THREE.MeshStandardMaterial({
  name: 'water',
  color: 0x14222c,
  roughness: 0.08,
  metalness: 0.2,
});

/**
 * Gold overlay on a board face (procedural): the texture spans one whole board face
 * (u across its width, v up its height) with darker seams at the board edges, faint
 * hammer marks and vertical burnish streaks. Used with BoxGeometry's per-face UVs.
 */
function goldOverlayTexture() {
  const w = 128, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#e4e0d8';
  g.fillRect(0, 0, w, h);
  let seed = 41;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Vertical burnish streaks.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w;
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.12})` : `rgba(90,70,40,${0.04 + rnd() * 0.08})`;
    g.fillRect(x, 0, 1 + rnd() * 4, h);
  }
  // Hammer marks.
  for (let i = 0; i < 500; i++) {
    const x = rnd() * w, y = rnd() * h, r = 1.5 + rnd() * 3;
    g.fillStyle = rnd() < 0.5 ? `rgba(255,250,235,${0.08 + rnd() * 0.1})` : `rgba(80,60,30,${0.06 + rnd() * 0.08})`;
    g.beginPath();
    g.ellipse(x, y, r, r * 1.6, 0, 0, 7);
    g.fill();
  }
  // Board edges: dark seam with a bright bevel just inside.
  g.fillStyle = 'rgba(45,30,10,0.85)';
  g.fillRect(0, 0, 3, h);
  g.fillRect(w - 3, 0, 3, h);
  g.fillStyle = 'rgba(255,245,215,0.5)';
  g.fillRect(3, 0, 2, h);
  g.fillStyle = 'rgba(70,50,20,0.35)';
  g.fillRect(w - 6, 0, 3, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Gold-overlaid board (Tabernacle walls); one texture per board face. */
export const GOLD_OVERLAY = new THREE.MeshStandardMaterial({
  name: 'gold-overlay',
  color: COLORS.gold,
  map: goldOverlayTexture(),
  roughness: 0.35,
  metalness: 0.6,
});
