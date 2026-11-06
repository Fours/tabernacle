import * as THREE from 'three';

// Surface wear for the shared metals and wood (procedural, world/object-space noise in the
// shader: no textures, no draws). Each function patches `onBeforeCompile`, chaining any earlier
// patch, and extends the program cache key. Material.clone() drops patches, so clones (e.g. the
// court pillars' materials) are patched again where they are made.
// - addBronzeWear: hammered roughness and dimpled normal, polished edges, dark crevices with a
//   little verdigris, and optional soot round a fire (the altar's upper body).
// - addSilverWear: polished high spots and edges, tarnish in hollows, on undersides and in
//   broad patches.
// - addWoodGrain: acacia grain streaks, fine checks and pores along the piece's local axis.
// - addBoardGold: the gold-overlaid boards (instanced boxes): bevelled board edges that catch
//   the light, a dark joint between boards, and a hammered sheet surface.

const NOISE_GLSL = /* glsl */ `
float mwHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mwNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mwHash(i), mwHash(i + vec3(1, 0, 0)), u.x), mix(mwHash(i + vec3(0, 1, 0)), mwHash(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(mwHash(i + vec3(0, 0, 1)), mwHash(i + vec3(1, 0, 1)), u.x), mix(mwHash(i + vec3(0, 1, 1)), mwHash(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
// Value noise with its analytic gradient (one lookup set instead of four for differences).
vec3 mwNoiseGrad(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = mwHash(i), b = mwHash(i + vec3(1, 0, 0)), c = mwHash(i + vec3(0, 1, 0)), d = mwHash(i + vec3(1, 1, 0));
  float e = mwHash(i + vec3(0, 0, 1)), g = mwHash(i + vec3(1, 0, 1)), h = mwHash(i + vec3(0, 1, 1)), k = mwHash(i + vec3(1, 1, 1));
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + h, k6 = a - b - e + g;
  float k7 = -a + b + c - d + e - g - h + k;
  return du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                   k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
                   k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
}
// Hammered sheet: gradient (noise units) of two octaves of dimples.
vec3 mwDimpleGrad(vec3 q) {
  return mwNoiseGrad(q) + 1.05 * mwNoiseGrad(q * 2.1 + 7.7);
}
// Tilt the view-space normal by a world-space dimple field (freq 1/m, strength), faded out
// where a dimple gets smaller than a few pixels.
vec3 mwHammer(vec3 n, vec3 p, float freq, float strength) {
  float fade = 1.0 - smoothstep(0.15, 0.45, length(fwidth(p)) * freq);
  if (fade <= 0.0) return n;
  vec3 nW = inverseTransformDirection(n, viewMatrix);
  vec3 g = mwDimpleGrad(p * freq);
  g -= nW * dot(g, nW);
  return normalize(n - (viewMatrix * vec4(g, 0.0)).xyz * strength * fade);
}
// Surface curvature from screen-space derivatives (view space, 1/m): > 0 convex, < 0 concave.
float mwCurvature(vec3 n) {
  vec3 vp = -vViewPosition;
  vec3 dpx = dFdx(vp), dpy = dFdy(vp);
  float kx = dot(dFdx(n), dpx) / max(dot(dpx, dpx), 1e-8);
  float ky = dot(dFdy(n), dpy) / max(dot(dpy, dpy), 1e-8);
  return kx + ky;
}
`;

const f = (v) => Number(v).toFixed(4);

/** Shared plumbing: world and local position varyings, the noise, and one fragment block. */
function patch(mat, key, body, { uniforms = {} } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    if (!shader.vertexShader.includes('varying vec3 vMwPos;')) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMwPos;\nvarying vec3 vMwLocal;\nvarying vec3 vMwAxisX;')
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
{
  vec4 mwp = vec4(transformed, 1.0);
  mat3 mwm = mat3(modelMatrix);
  #ifdef USE_INSTANCING
  mwp = instanceMatrix * mwp;
  mwm = mwm * mat3(instanceMatrix);
  #endif
  vMwPos = (modelMatrix * mwp).xyz;
  vMwLocal = transformed;
  vMwAxisX = normalize(mwm * vec3(1.0, 0.0, 0.0));
}`,
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vMwPos;\nvarying vec3 vMwLocal;\nvarying vec3 vMwAxisX;\n${NOISE_GLSL}`,
      );
    }
    const decl = Object.keys(uniforms).map((k) => `uniform ${uniforms[k].glsl} ${k};`).join('\n');
    if (decl) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${decl}`);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>\n{\n${body}\n}`,
    );
  };
  const prevKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => `${prevKey}|${key}`;
  mat.needsUpdate = true;
  return mat;
}

/**
 * Worn cast/hammered bronze. soot: { center: Vector3 (world), radius: [inner, outer] m,
 * height: [from, full] m (world y) } blackens the metal round a fire, streaky and strongest at
 * the top. hammer: dimple frequency (1/m, 0 = none), strength: normal tilt.
 */
export function addBronzeWear(mat, { hammer = 28, strength = 0.035, soot = null, verdigris = 0.25 } = {}) {
  const uniforms = {};
  if (soot) uniforms.uMwSoot = { value: new THREE.Vector3(soot.center.x, soot.center.y, soot.center.z), glsl: 'vec3' };
  const body = `
  vec3 p = vMwPos;
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  float k = mwCurvature(normal);
  float convex = clamp(k * 0.03, 0.0, 1.0), concave = clamp(-k * 0.03, 0.0, 1.0);
  ${hammer > 0 ? `normal = mwHammer(normal, p, ${f(hammer)}, ${f(strength)});` : ''}
  // Hammered roughness: the high spots of each blow burnished, the hollows duller.
  float hn = mwNoise(p * ${f(Math.max(hammer, 10) * 0.7)}) * 0.6 + mwNoise(p * 2.3 + 4.1) * 0.4;
  roughnessFactor += (hn - 0.5) * 0.22;
  // Broad oxidation patches, verdigris in hollows and low down.
  float ox = smoothstep(0.45, 0.8, mwNoise(p * 1.7 + 2.3) * 0.7 + mwNoise(p * 5.1) * 0.3);
  float green = clamp((concave * 0.8 + ox * 0.5) * (0.5 + mwNoise(p * 9.0 + 1.3)) - 0.2, 0.0, 1.0) * ${f(verdigris)};
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72, 0.62, 0.5), ox * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.24, 0.18), green);
  roughnessFactor += ox * 0.12 + green * 0.3;
  metalnessFactor -= green * 0.4;
  // Edge wear: handled corners and rims rubbed bright and smooth.
  float edge = convex * smoothstep(0.35, 0.65, mwNoise(p * 14.0 + 3.0));
  diffuseColor.rgb *= 1.0 + edge * 0.45;
  roughnessFactor -= edge * 0.18;
  ${soot ? `
  // Soot from the fire: strongest at the top of the walls and on the horns, in streaks.
  {
    float r = length(p.xz - uMwSoot.xz);
    float sr = 1.0 - smoothstep(${f(soot.radius[0])}, ${f(soot.radius[1])}, r);
    float sh = smoothstep(${f(soot.height[0])}, ${f(soot.height[1])}, p.y);
    float streak = mwNoise(vec3(p.x * 9.0, p.y * 1.2, p.z * 9.0)) * 0.6 + mwNoise(p * 3.0 + 8.0) * 0.4;
    float s = clamp(sr * sh * (0.45 + 0.9 * streak) - edge * 0.3, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.03, 0.028), s * 0.72);
    roughnessFactor = mix(roughnessFactor, 0.9, s * 0.8);
    metalnessFactor = mix(metalnessFactor, 0.25, s * 0.7);
  }` : ''}
  roughnessFactor = clamp(roughnessFactor, 0.12, 1.0);
  metalnessFactor = clamp(metalnessFactor, 0.0, 1.0);
  diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.0));
  `;
  const key = `bronzewear-${hammer}-${strength}-${verdigris}-${soot ? `${soot.radius}-${soot.height}` : 0}`;
  return patch(mat, key, body, { uniforms });
}

/** Silver: polished on high spots and edges, tarnished (warm grey to near black) in hollows. */
export function addSilverWear(mat, { tarnish = 0.6 } = {}) {
  const body = `
  vec3 p = vMwPos;
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  float k = mwCurvature(normal);
  float convex = clamp(k * 0.04, 0.0, 1.0), concave = clamp(-k * 0.04, 0.0, 1.0);
  float patches = smoothstep(0.4, 0.85, mwNoise(p * 2.2 + 5.0) * 0.6 + mwNoise(p * 7.0) * 0.4);
  float down = smoothstep(0.0, 0.8, -nW.y);
  float t = clamp((concave * 0.9 + down * 0.45 + patches * 0.55) * (0.6 + 0.8 * mwNoise(p * 18.0 + 2.0)), 0.0, 1.0) * ${f(tarnish)};
  float polish = clamp(convex * 0.8 + smoothstep(0.5, 1.0, nW.y) * 0.3, 0.0, 1.0) * (1.0 - t);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.27, 0.23), t);
  diffuseColor.rgb *= 1.0 + polish * 0.12;
  roughnessFactor = clamp(roughnessFactor + t * 0.3 - polish * 0.2 + (mwNoise(p * 40.0) - 0.5) * 0.08, 0.1, 1.0);
  `;
  return patch(mat, `silverwear-${tarnish}`, body);
}

/**
 * Acacia grain along the piece's local `axis` ('y' for posts and shafts): long streaks that
 * wander, darker late-wood lines, fine checks, and oiled/weathered roughness variation.
 */
export function addWoodGrain(mat, { axis = 'y', scale = 1 } = {}) {
  const sw = axis === 'x' ? 'vMwLocal.yxz' : axis === 'z' ? 'vMwLocal.xzy' : 'vMwLocal.xyz';
  const body = `
  vec3 q = ${sw} * ${f(scale)}; // q.y runs along the grain
  float wob = mwNoise(vec3(q.x * 6.0, q.y * 0.6, q.z * 6.0));
  float s1 = mwNoise(vec3(q.x * 70.0 + wob * 2.0, q.y * 1.5, q.z * 70.0));
  float s2 = mwNoise(vec3(q.x * 190.0, q.y * 3.0, q.z * 190.0) + 5.0);
  float late = smoothstep(0.55, 0.85, s1);
  float check = smoothstep(0.03, 0.0, abs(mwNoise(vec3(q.x * 40.0, q.y * 0.9, q.z * 40.0) + 11.0) - 0.5)) * smoothstep(0.55, 0.7, wob);
  float fade = 1.0 - smoothstep(0.3, 0.8, length(fwidth(q)) * 120.0);
  diffuseColor.rgb *= mix(1.0, 0.62, late * fade) * (0.92 + 0.16 * s2 * fade) * (1.0 - 0.45 * check * fade);
  diffuseColor.rgb *= 0.9 + 0.2 * wob; // broad tone
  roughnessFactor = clamp(roughnessFactor + (late * 0.12 - 0.08 + (s2 - 0.5) * 0.15) * fade + check * 0.2, 0.35, 1.0);
  `;
  return patch(mat, `woodgrain-${axis}-${scale}`, body);
}

/**
 * Gold overlay on the instanced boards: `halfWidth` (m) of a board in its local x. Bevelled
 * long edges that turn toward the light, a dark joint, a few horizontal sheet overlaps with
 * nail heads, and a hammered sheet surface.
 */
export function addBoardGold(mat, { halfWidth, hammer = 22, strength = 0.05, sheets = 1.35 }) {
  const body = `
  vec3 q = vMwLocal;
  float ex = ${f(halfWidth)} - abs(q.x); // distance to the board's long edge (m)
  // Bevel: within ~1.5 cm of the edge the surface rolls toward the board's side.
  float bev = 1.0 - smoothstep(0.0, 0.016, ex);
  vec3 side = vMwAxisX * sign(q.x);
  normal = normalize(normal + (viewMatrix * vec4(side, 0.0)).xyz * bev * 0.6);
  // The joint itself: dark where the overlay folds round into the gap.
  diffuseColor.rgb *= mix(1.0, 0.25, 1.0 - smoothstep(0.0, 0.004, ex));
  // Sheet overlaps every ~${sheets} m up the board, with nail heads along them.
  float sy = q.y / ${f(sheets)};
  float sf = fract(sy);
  float lap = smoothstep(0.985, 1.0, sf) + (1.0 - smoothstep(0.0, 0.004, sf));
  diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(0.995, 1.0, sf);
  normal = normalize(normal + (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz * lap * 0.4);
  vec2 nail = vec2(mod(q.x + 0.06, 0.12) - 0.06, (sf > 0.5 ? sf - 1.0 : sf) * ${f(sheets)} + 0.012);
  float nh = 1.0 - smoothstep(0.004, 0.007, length(nail));
  diffuseColor.rgb *= 1.0 + nh * 0.25;
  normal = normalize(normal + (viewMatrix * vec4(vMwAxisX * nail.x + vec3(0.0, nail.y, 0.0), 0.0)).xyz * nh * 60.0);
  // Burnished: a little brighter than the furniture gold's reference, so the interior mask's
  // re-colouring (interiorLight.js, by luminance) reads as gold rather than brown.
  diffuseColor.rgb = min(diffuseColor.rgb * 1.2, vec3(1.0));
  // Hammered sheet.
  normal = mwHammer(normal, vMwPos, ${f(hammer)}, ${f(strength)});
  roughnessFactor = clamp(roughnessFactor + (mwNoise(vMwPos * ${f(hammer * 0.6)}) - 0.5) * 0.12, 0.05, 1.0);
  `;
  return patch(mat, `boardgold-${halfWidth}-${hammer}-${strength}-${sheets}`, body);
}
