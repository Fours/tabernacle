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

// World-space value noise shared by the material patches below (GLSL).
export const WORLD_NOISE_GLSL = /* glsl */ `
float wvHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wvNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wvHash(i), wvHash(i + vec2(1.0, 0.0)), u.x),
             mix(wvHash(i + vec2(0.0, 1.0)), wvHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float wvFbm(vec2 p) {
  return 0.5 * wvNoise(p) + 0.3 * wvNoise(p * 2.13 + 3.7) + 0.2 * wvNoise(p * 4.57 + 9.1);
}
`;

/**
 * Break up visible texture tiling with large-scale, world-space tone variation (patchy
 * fading / dirt), and optionally dust darkening near the ground. Patches `onBeforeCompile`
 * (chains any existing patch). Cheap: a few noise lookups per fragment.
 * @param {THREE.Material} mat
 * @param {{ scale?: number, amount?: number, dust?: number, dustHeight?: number, tint?: number[] }} o
 *   scale: noise frequency (1/m); amount: ±fraction of tone change; dust: darkening at y = 0
 *   fading out by dustHeight (m); tint: rgb multiplier at the dark end of the noise.
 */
export function addMacroVariation(mat, { scale = 0.25, amount = 0.15, dust = 0, dustHeight = 0.6, tint = [1, 1, 1] } = {}) {
  const prev = mat.onBeforeCompile;
  const t = tint.map((v) => v.toFixed(3)).join(', ');
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMacroPos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
{
  vec4 mp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  mp = instanceMatrix * mp;
  #endif
  vMacroPos = (modelMatrix * mp).xyz;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vMacroPos;\n${WORLD_NOISE_GLSL}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec2 q = vec2(vMacroPos.x + vMacroPos.y * 0.37, vMacroPos.z - vMacroPos.y * 0.61) * ${scale.toFixed(4)};
  float n = wvFbm(q) * 2.0 - 1.0;
  diffuseColor.rgb *= 1.0 + n * ${amount.toFixed(4)};
  diffuseColor.rgb *= mix(vec3(1.0), vec3(${t}), clamp(-n, 0.0, 1.0));
  diffuseColor.rgb *= 1.0 - ${dust.toFixed(4)} * (1.0 - smoothstep(0.0, ${dustHeight.toFixed(4)}, vMacroPos.y));
}`,
      );
  };
  mat.customProgramCacheKey = () => `macro-${scale}-${amount}-${dust}-${dustHeight}-${t}`;
  return mat;
}

/**
 * Fake one-bounce firelight: the sand round a big fire is brightly lit and throws warm light
 * back up onto nearby surfaces that face away from the flames (e.g. the altar's outer walls).
 * Adds irradiance that fades with horizontal distance from `center` (inner..outer meters) and
 * with height, strongest on faces that look down/outward. `level` is a shared uniform
 * ({value}) for flicker. Patches `onBeforeCompile` (chains any existing patch).
 */
export function addFireBounce(mat, { center, inner = 1.2, outer = 4.5, height = 2.5, strength = 3, color = 0xff8a40, level }) {
  const prev = mat.onBeforeCompile;
  const c = new THREE.Color(color).multiplyScalar(strength);
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uBounceLevel = level;
    shader.uniforms.uBounceCenter = { value: new THREE.Vector3(center.x, center.y, center.z) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBouncePos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBouncePos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBouncePos;\nuniform float uBounceLevel;\nuniform vec3 uBounceCenter;')
      .replace(
        '#include <lights_fragment_end>',
        `{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec2 dxz = vBouncePos.xz - uBounceCenter.xz;
  float d = length(dxz);
  float fall = 1.0 - smoothstep(${inner.toFixed(3)}, ${outer.toFixed(3)}, d);
  fall *= 1.0 - smoothstep(0.0, ${height.toFixed(3)}, vBouncePos.y - uBounceCenter.y);
  // Faces looking down or away from the fire's axis catch the light off the sand.
  float facing = clamp(0.55 - 0.45 * nW.y + 0.35 * dot(nW.xz, d > 0.001 ? dxz / d : vec2(0.0)), 0.0, 1.0);
  irradiance += vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)}) * fall * facing * uBounceLevel;
}
#include <lights_fragment_end>`,
      );
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => `${key}|bounce-${inner}-${outer}-${height}-${strength}`;
  return mat;
}

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
 * Hammered bronze overlay (procedural). One tile = one overlay sheet, 2.5 × 1.5 cubits (set via
 * `repeat` for geometry whose UVs are in cubits; see mode `cubit` in bronzeParts.js): soft
 * hammer dimples, broad tone mottling, faint patina and a thin overlap seam with a few small
 * nails. Low contrast, so the sheets read as metal rather than bricks.
 */
function bronzePlateTexture() {
  const W = 320, H = 192;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#dedad4';
  g.fillRect(0, 0, W, H);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const wrapDraw = (x, y, r, f) => {
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
      if (x + dx + r < 0 || x + dx - r > W || y + dy + r < 0 || y + dy - r > H) continue;
      f(x + dx, y + dy);
    }
  };
  // Broad mottling (uneven polish / oxidation).
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 50;
    const a = 0.04 + rnd() * 0.07;
    const col = rnd() < 0.55 ? `rgba(70,55,40,${a})` : `rgba(255,250,240,${a})`;
    wrapDraw(x, y, r, (px, py) => {
      const grd = g.createRadialGradient(px, py, 0, px, py, r);
      grd.addColorStop(0, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(px - r, py - r, 2 * r, 2 * r);
    });
  }
  // Hammer dimples: light rim on top, dark on the bottom.
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 4;
    g.fillStyle = `rgba(255,248,235,${0.05 + rnd() * 0.06})`;
    g.beginPath(); g.ellipse(x, y - 0.6, r, r * 0.8, 0, 0, 7); g.fill();
    g.fillStyle = `rgba(60,45,30,${0.05 + rnd() * 0.06})`;
    g.beginPath(); g.ellipse(x, y + 0.6, r * 0.8, r * 0.6, 0, 0, 7); g.fill();
  }
  // Faint green-brown patina in a few streaks.
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.fillStyle = `rgba(80,95,70,${0.04 + rnd() * 0.05})`;
    g.fillRect(x, y, 2 + rnd() * 5, 10 + rnd() * 40);
  }
  // Overlap seams: thin, low contrast, along the sheet's left and bottom edges (wrapping).
  g.fillStyle = 'rgba(50,35,20,0.35)';
  g.fillRect(0, 0, 2, H);
  g.fillRect(0, H - 2, W, 2);
  g.fillStyle = 'rgba(255,240,215,0.18)';
  g.fillRect(2, 0, 1, H);
  g.fillRect(0, H - 3, W, 1);
  // Small nails along the vertical seam.
  for (let y = 12; y < H; y += 36) {
    g.fillStyle = 'rgba(50,35,20,0.4)';
    g.beginPath(); g.arc(6.6, y + 0.6, 2.2, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,240,210,0.45)';
    g.beginPath(); g.arc(6, y, 1.7, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 2.5, 1 / 1.5);
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

// Metals: mostly metallic now that scene.environment (render/environment.js) gives them a dim
// night sky to reflect; a little diffuse is kept for worn/oxidized surfaces so they still
// catch the firelight broadly instead of only as highlights.
export const BRONZE = new THREE.MeshStandardMaterial({
  name: 'bronze',
  color: COLORS.bronze,
  roughness: 0.42,
  metalness: 0.8,
});

export const SILVER = new THREE.MeshStandardMaterial({
  name: 'silver',
  color: COLORS.silver,
  roughness: 0.42,
  metalness: 0.85,
});

export const GOLD = new THREE.MeshStandardMaterial({
  name: 'gold',
  color: COLORS.gold,
  roughness: 0.3,
  metalness: 0.85,
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
const plateTex = bronzePlateTexture();
export const BRONZE_PLATED = new THREE.MeshStandardMaterial({
  name: 'bronze-plated',
  color: COLORS.bronze,
  map: plateTex,
  bumpMap: plateTex,
  bumpScale: 0.6,
  roughness: 0.48,
  metalness: 0.6,
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
 * (u across its width, v up its height). Beaten gold sheet: broad soft mottling of the burnish,
 * fine hammer dimples, and a thin seam at the board edges. No long vertical strokes: under the
 * menorah those read as wood grain.
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
  // Broad, round mottling (uneven burnish), low contrast.
  for (let i = 0; i < 60; i++) {
    const x = rnd() * w, y = rnd() * h, r = 15 + rnd() * 40;
    const a = 0.03 + rnd() * 0.05;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rnd() < 0.5 ? `rgba(255,252,240,${a})` : `rgba(90,70,40,${a})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // Hammer dimples: light rim above, dark below, small and round.
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 2.2;
    g.fillStyle = `rgba(255,250,235,${0.04 + rnd() * 0.05})`;
    g.beginPath(); g.ellipse(x, y - 0.5, r, r * 0.85, 0, 0, 7); g.fill();
    g.fillStyle = `rgba(80,60,30,${0.04 + rnd() * 0.05})`;
    g.beginPath(); g.ellipse(x, y + 0.5, r * 0.8, r * 0.65, 0, 0, 7); g.fill();
  }
  // Board edges: a thin dark joint with a faint bright bevel just inside.
  g.fillStyle = 'rgba(45,30,10,0.6)';
  g.fillRect(0, 0, 2, h);
  g.fillRect(w - 2, 0, 2, h);
  g.fillStyle = 'rgba(255,245,215,0.25)';
  g.fillRect(2, 0, 1, h);
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
  roughness: 0.32,
  metalness: 0.85,
});
