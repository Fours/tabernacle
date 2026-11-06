// Distant granite ridges closing the horizon (the wilderness of Sinai, Num 1:1; a
// reconstruction). No geometry and no draw call of their own: `HORIZON_GLSL` is composited by
// the sky dome's fragment shader (scene/sky.js), so the ridges follow the camera like the sky,
// are covered by everything in front of them (the dome is depth-tested behind the scene),
// never meet the ground or the camp and have no ring edge.
//
// Three depth layers, each a silhouette at a fixed distance D with a height profile around the
// compass: H(azimuth) in metres. A pixel is on a layer when the tangent of its elevation is below
// (H − camera height) / D, so the ridges sink correctly when the camera rises (the `camp`
// preset). The profile is ridged noise on a circle (a seamless loop around the horizon): a
// smooth, low-frequency mask makes a few higher massifs with saddles and low foothills between,
// and piecewise-linear ridged octaves give angular, broken granite crests rather than smooth
// hills. Layers are drawn far to near; the farther ones are paler (aerial perspective) and every
// layer dissolves into the horizon colour toward its foot, so the haze closes the gap to the
// fogged desert. Faces get a faint cool moon-fill term from the profile's slope, crests a thin
// cool rim, and the nearest layer a trace of the pillar of fire's warm light. The sky's
// atmoSky() haze and glows are applied on top, as for the rest of the sky.

const f = (v) => v.toFixed(5);

/** Layers, far to near. d: distance (m); h0/h1: height range (m); tone: × horizon colour;
 *  haze: metres above the foot over which the layer dissolves into the horizon colour;
 *  freq: profile features around the horizon; seed: noise offset. */
export const RIDGES = {
  layers: [
    { d: 11000, h0: 260, h1: 880, tone: 0.64, haze: 260, freq: 36, seed: 3.1 },
    { d: 6500, h0: 110, h1: 400, tone: 0.42, haze: 110, freq: 48, seed: 17.7 },
    { d: 3600, h0: 35, h1: 170, tone: 0.27, haze: 45, freq: 64, seed: 41.3 },
  ],
  moon: [-40, 80, 30], // the night fill's direction (scene/lighting.js)
};

const moonLen = Math.hypot(...RIDGES.moon);
const MOON = RIDGES.moon.map((v) => f(v / moonLen)).join(', ');

const NEAR_D = RIDGES.layers[RIDGES.layers.length - 1].d;

const layerCalls = RIDGES.layers
  .map((L, i) => `  col = ridgeLayer(col, d, dh, tanE, pxT, horizon, camY, ${f(L.d)}, ${f(L.h0)}, ${f(L.h1)}, ${f(L.tone)}, ${f(L.haze)}, ${f(L.freq / 6.2831853)}, ${f(L.seed)}, ${i === RIDGES.layers.length - 1 ? '1.0' : '0.0'});`)
  .join('\n');

/** GLSL: `vec3 horizonRidges(vec3 col, vec3 d, vec3 horizon, float camY)` (d normalised). */
export const HORIZON_GLSL = /* glsl */ `
float rgHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
// Value noise; lin = 1 interpolates linearly (angular crags), 0 smoothly (broad massifs).
float rgNoise(vec2 p, float lin) {
  vec2 i = floor(p), u = fract(p);
  u = mix(u * u * (3.0 - 2.0 * u), u, lin);
  return mix(mix(rgHash(i), rgHash(i + vec2(1.0, 0.0)), u.x),
             mix(rgHash(i + vec2(0.0, 1.0)), rgHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Height profile 0..~1.2 around the horizon; c is the azimuth on a circle (a seamless loop).
float rgProfile(vec2 c, float seed) {
  float massif = rgNoise(c * 0.45 + seed, 0.0);
  massif = massif * massif * (1.6 - 0.6 * massif);
  float r = 0.0, a = 0.5, w = 1.0;
  vec2 p = c * 1.7 + seed * 1.7;
  for (int k = 0; k < 6; k++) {
    float n = 1.0 - abs(2.0 * rgNoise(p, 1.0) - 1.0);
    n *= n;
    r += a * n * w;
    w = clamp(n * 1.6, 0.25, 1.0); // crests carry the fine detail, valleys stay calmer
    p = p * 2.13 + vec2(7.3, 1.9);
    a *= 0.5;
  }
  return 0.08 + 0.5 * massif + 0.85 * r * (0.3 + massif);
}
vec3 ridgeLayer(vec3 col, vec3 d, vec2 dh, float tanE, float pxT, vec3 horizon, float camY,
                float D, float h0, float h1, float tone, float hazeM, float R, float seed, float near) {
  if (tanE * D + camY > h0 + 1.7 * (h1 - h0)) return col; // above this layer's highest crest
  vec2 c = dh * R;
  float H = h0 + (h1 - h0) * rgProfile(c, seed);
  float tanTop = (H - camY) / D;
  float cov = clamp((tanTop - tanE) / pxT + 0.5, 0.0, 1.0);
  // Lateral slope of the profile (m per m along the horizon) from screen-space derivatives of
  // the height and the azimuth (no second profile evaluation).
  vec2 dhx = dFdx(dh), dhy = dFdy(dh);
  float ax = dh.x * dhx.y - dh.y * dhx.x, ay = dh.x * dhy.y - dh.y * dhy.x;
  float dH = abs(ax) > abs(ay) ? dFdx(H) : dFdy(H);
  float dA = abs(ax) > abs(ay) ? ax : ay;
  float sLat = dH / (D * (abs(dA) > 1e-7 ? dA : 1e-7));
  if (cov <= 0.0) return col;
  // Face normal: a flank of ~40 degrees facing the viewer, tilted by the lateral slope.
  vec2 tng = vec2(-dh.y, dh.x);
  vec3 t3 = vec3(tng.x, 0.0, tng.y);
  vec3 n = normalize(vec3(-dh.x, 0.0, -dh.y) * 0.65 + vec3(0.0, 0.75, 0.0) - t3 * clamp(sLat, -2.0, 2.0) * 0.6);
  const vec3 MOON = vec3(${MOON});
  float lit = max(dot(n, MOON), 0.0);
  float hm = tanE * D + camY; // metres above the layer's foot level
  // Granite texture: vertical gullies and broken blocks, faint.
  float tex = 0.8 + 0.4 * rgNoise(vec2((c.x + c.y * 1.3) * 26.0, hm * 0.035), 1.0);
  vec3 rock = horizon * tone * tex;
  rock += horizon * vec3(0.55, 0.62, 0.85) * 0.28 * lit;
  // Thin cool rim on the crest (wider where the ridge is backlit by the moon-fill direction).
  float below = (tanTop - tanE) / pxT;
  float back = 0.5 + 0.5 * dot(dh, normalize(MOON.xz));
  rock += horizon * vec3(0.6, 0.72, 1.0) * 0.35 * exp(-below / (1.2 + 1.5 * back)) * (0.4 + 0.6 * back);
  // The pillar of fire's light, a trace on the nearest faces (they all face the camp).
  rock += near * vec3(0.0006, 0.00032, 0.0001) * smoothstep(0.0, H, hm) * lit;
  // Haze: dissolves into the horizon colour toward the foot.
  rock = mix(horizon, rock, 1.0 - exp(-max(hm, 0.0) / hazeM));
  return mix(col, rock, cov);
}
vec3 horizonRidges(vec3 col, vec3 d, vec3 horizon, float camY) {
  float lh = max(length(d.xz), 1e-4);
  float tanE = d.y / lh;
  // Below the nearest layer's foot only the haze is left: the horizon colour.
  if (tanE * ${f(NEAR_D)} + camY < 0.0) return horizon;
  vec2 dh = d.xz / lh;
  float pxT = max(fwidth(tanE), 1e-5);
${layerCalls}
  return col;
}
`;
