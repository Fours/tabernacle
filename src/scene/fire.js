import * as THREE from 'three';

// Reusable GPU-animated fire: flames, embers and smoke (3 draw calls) plus a flickering
// warm PointLight. All particle motion is computed in the vertex shaders from a time
// uniform, so the per-frame JS cost is a few uniform writes and no allocations.
//
// Used by the altar (large, shadow-casting) and meant for the torches (small, no shadows).

export const NOISE_GLSL = /* glsl */ `
float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), u.x),
             mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fFbm(vec2 p) {
  return 0.55 * fNoise(p) + 0.3 * fNoise(p * 2.07 + 1.7) + 0.15 * fNoise(p * 4.31 + 3.1);
}
`;

// Billboard helper: offsets a view-space center by a quad corner, with the quad's "up"
// following world up as projected on screen (so flames and smoke stay upright when the camera
// looks down), falling back to screen-up when looking straight down.
const BILLBOARD_GLSL = /* glsl */ `
vec4 billboard(vec3 center, vec2 corner, float size, float stretch) {
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  vec2 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xy;
  float l = length(up);
  up = l > 0.15 ? up / l : vec2(0.0, 1.0);
  vec2 right = vec2(up.y, -up.x);
  float st = mix(1.0, stretch, clamp(l, 0.0, 1.0));
  mv.xy += right * corner.x * size + up * corner.y * size * st;
  return mv;
}
`;

// Fog for additive sprites: fade toward black (adding the fog color would brighten them).
export const FOG_ADDITIVE_GLSL = /* glsl */ `
#include <fog_pars_fragment>
float fogAmount() {
#ifdef USE_FOG
  #ifdef FOG_EXP2
  return 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
  return smoothstep(fogNear, fogFar, vFogDepth);
  #endif
#else
  return 0.0;
#endif
}
`;

const HASH_GLSL = /* glsl */ `
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
`;

const FLAME_VERT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uSize;
uniform vec2 uWind;
attribute vec4 aRand;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
#include <fog_pars_vertex>
${HASH_GLSL}
${BILLBOARD_GLSL}
void main() {
  float life = mix(0.55, 1.05, aRand.w);
  float t = uTime / life + aRand.z;
  float age = fract(t);
  float cyc = floor(t);
  // New spawn point each cycle, biased toward the center of the bed.
  float ang = (aRand.x + h11(cyc + aRand.x * 37.0)) * 6.2831853;
  float r = pow(fract(aRand.y + h11(cyc * 1.7 + aRand.y * 53.0)), 0.75) * uRadius;
  vec3 p = vec3(cos(ang) * r, 0.0, sin(ang) * r);
  // Buoyant rise (accelerating) and convergence toward the flame's axis.
  float rise = uHeight * mix(0.5, 1.0, aRand.w) * age * (0.45 + 0.55 * age);
  p.xz *= 1.0 - 0.65 * age;
  p.y = rise;
  float s = aRand.z * 23.0;
  float sway = 0.14 * uRadius * age;
  p.x += sway * (sin(uTime * 3.1 + s + rise * 4.0 / uHeight) + 0.5 * sin(uTime * 7.3 + s * 1.9));
  p.z += sway * (cos(uTime * 2.6 + s * 1.3 + rise * 3.0 / uHeight) + 0.5 * sin(uTime * 6.1 + s * 0.7));
  p.xz += uWind * rise * rise / uHeight;
  float size = uSize * mix(0.7, 1.3, aRand.y) * (1.0 - 0.6 * age) * (0.75 + 0.25 * (1.0 - r / uRadius));
  vec4 mv = billboard(p, position.xy, size, 1.6);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  vUv = uv;
  vAge = age;
  vSeed = aRand.x;
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uBrightness;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
${NOISE_GLSL}
${FOG_ADDITIVE_GLSL}
vec3 fireRamp(float t) {
  vec3 c = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.28, 0.03), smoothstep(0.0, 0.4, t));
  c = mix(c, vec3(1.0, 0.62, 0.18), smoothstep(0.4, 0.75, t));
  return mix(c, vec3(1.0, 0.9, 0.65), smoothstep(0.75, 1.0, t));
}
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  // Teardrop: wide base, tapering tip.
  c.x /= mix(1.0, 0.4, clamp(c.y * 0.5 + 0.5, 0.0, 1.0));
  float n = fFbm(vec2(vUv.x * 2.2 + vSeed * 13.0, vUv.y * 1.6 - uTime * 2.2 - vSeed * 7.0));
  float d = length(c) - (n - 0.5) * 0.8;
  float shape = 1.0 - smoothstep(0.25, 0.95, d);
  if (shape <= 0.0) discard;
  float heat = clamp((1.0 - vAge * 1.15) * (0.35 + 0.75 * shape), 0.0, 1.0);
  float fade = smoothstep(0.0, 0.1, vAge) * (1.0 - smoothstep(0.6, 1.0, vAge));
  gl_FragColor = vec4(fireRamp(heat) * uBrightness * (1.0 - fogAmount()), shape * fade * 0.55);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const EMBER_VERT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uSize;
uniform float uViewportH;
uniform vec2 uWind;
attribute vec4 aRand;
varying float vAge;
varying float vTwinkle;
#include <fog_pars_vertex>
${HASH_GLSL}
void main() {
  float life = mix(1.4, 3.4, aRand.w);
  float t = uTime / life + aRand.z;
  float age = fract(t);
  float cyc = floor(t);
  float hc = h11(cyc + aRand.x * 31.0);
  float ang = (aRand.x + hc) * 6.2831853;
  float r = sqrt(fract(aRand.y + hc * 7.13)) * uRadius * 0.8;
  float speed = mix(0.55, 1.45, fract(aRand.w * 7.7 + hc));
  float rise = uHeight * 2.4 * speed * age * (1.0 - 0.3 * age);
  vec3 p = vec3(cos(ang) * r, uHeight * 0.12 + rise, sin(ang) * r);
  float s = aRand.x * 40.0;
  float turb = 0.35 * uRadius * age;
  p.x += turb * (sin(uTime * 1.7 + s) + 0.5 * sin(uTime * 4.1 + s * 1.3));
  p.z += turb * (cos(uTime * 1.3 + s * 0.7) + 0.5 * sin(uTime * 3.7 + s * 2.1));
  p.xz += uWind * rise;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  float size = uSize * mix(0.6, 1.4, aRand.y);
  gl_PointSize = clamp(size * projectionMatrix[1][1] * 0.5 * uViewportH / -mv.z, 1.5, 9.0);
  vAge = age;
  vTwinkle = 0.5 + 0.5 * sin(uTime * (7.0 + aRand.y * 11.0) + s);
}
`;

const EMBER_FRAG = /* glsl */ `
uniform float uBrightness;
varying float vAge;
varying float vTwinkle;
${FOG_ADDITIVE_GLSL}
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float fade = smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge));
  vec3 col = mix(vec3(1.0, 0.72, 0.3), vec3(0.85, 0.16, 0.02), smoothstep(0.0, 0.8, vAge));
  gl_FragColor = vec4(col * uBrightness * 1.6 * (1.0 - fogAmount()), (1.0 - d) * fade * (0.45 + 0.55 * vTwinkle));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SMOKE_VERT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uSmokeHeight;
uniform vec2 uWind;
attribute vec4 aRand;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
#include <fog_pars_vertex>
${HASH_GLSL}
${BILLBOARD_GLSL}
void main() {
  float life = mix(5.0, 8.0, aRand.w);
  float t = uTime / life + aRand.z;
  float age = fract(t);
  float cyc = floor(t);
  float hc = h11(cyc + aRand.x * 17.0);
  float ang = (aRand.x + hc) * 6.2831853;
  float r = sqrt(fract(aRand.y + hc * 3.7)) * uRadius * 0.5;
  float rise = uSmokeHeight * age * (1.0 - 0.25 * age);
  vec3 p = vec3(cos(ang) * r, uHeight * 0.55 + rise, sin(ang) * r);
  float s = aRand.x * 31.0;
  p.x += 0.3 * uRadius * age * sin(uTime * 0.4 + s);
  p.z += 0.3 * uRadius * age * cos(uTime * 0.33 + s * 1.7);
  p.xz += uWind * rise * 1.5;
  float size = uRadius * mix(0.8, 1.2, aRand.y) * (0.7 + 2.6 * age);
  vec4 mv = billboard(p, position.xy, size, 1.0);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  vUv = uv;
  vAge = age;
  vSeed = aRand.x;
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uBrightness;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float n = fFbm(vUv * 2.5 + vec2(vSeed * 11.0, vSeed * 5.0 - uTime * 0.15));
  float d = length(c) - (n - 0.5) * 0.9;
  float shape = 1.0 - smoothstep(0.2, 1.0, d);
  if (shape <= 0.0) discard;
  float fade = smoothstep(0.0, 0.15, vAge) * (1.0 - smoothstep(0.4, 1.0, vAge));
  // Lit warm by the fire just above the flames, cooling to a dark grey.
  vec3 col = mix(vec3(0.32, 0.12, 0.04) * uBrightness, vec3(0.035, 0.032, 0.03), smoothstep(0.0, 0.35, vAge));
  gl_FragColor = vec4(col, shape * fade * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Per-material copy of three's fog uniforms (filled in by the renderer when scene.fog is set). */
const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/** Deterministic pseudo-random generator. */
function rng(seed) {
  let s = (seed * 16807) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function randAttribute(count, rnd) {
  const a = new Float32Array(count * 4);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return a;
}

/** Instanced camera-facing quads (one draw call). */
function quadParticles(count, rnd, bounds) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(randAttribute(count, rnd), 4));
  geo.instanceCount = count;
  geo.boundingSphere = bounds.clone();
  geo.boundingBox = null;
  return geo;
}

// Smooth 1D value noise in [-1, 1] for the light flicker.
const hash1 = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash1(i) + (hash1(i + 1) - hash1(i)) * u) * 2 - 1;
}

/**
 * Create a fire. The group's origin is the base of the fire (the surface it burns on).
 *
 * @param {object} o
 * @param {number} [o.radius=0.5]      Radius of the burning bed (m).
 * @param {number} [o.height=1.2]      Typical flame height (m).
 * @param {number} [o.flameSize]       Flame sprite size (m); default ~1.1 × radius.
 * @param {number} [o.flames=60]       Flame particle count.
 * @param {number} [o.embers=80]       Ember (spark) count; 0 disables.
 * @param {number} [o.smoke=16]        Smoke puff count; 0 disables.
 * @param {number} [o.smokeHeight]     How high smoke rises (m); default 3.5 × height.
 * @param {number} [o.smokeOpacity=0.3]
 * @param {number} [o.brightness=1]    Flame/ember sprite brightness.
 * @param {number} [o.intensity=60]    PointLight intensity (candela); 0 = no light.
 * @param {number} [o.lightColor=0xff8a3a]
 * @param {number[]} [o.lightOffset]   Light position relative to the base (m); default [0, 0.75 × height, 0].
 * @param {number} [o.distance=0]      PointLight cutoff distance (0 = physical inverse-square only).
 * @param {number} [o.decay=2]
 * @param {number} [o.flicker=0.2]     Relative amplitude of the intensity flicker.
 * @param {number} [o.jitter]          Light position jitter (m); default 0.08 × radius.
 * @param {boolean} [o.castShadow=false]
 * @param {number} [o.shadowMapSize=1024]
 * @param {number} [o.shadowRadius=3]  PCF filter radius (soft penumbra).
 * @param {number} [o.shadowIntensity=1] How dark the shadows are (0..1).
 * @param {number[]} [o.wind=[0,0]]    Horizontal drift (x, z) per meter of rise.
 * @param {number} [o.seed=1]
 * @returns {{ group: THREE.Group, light: THREE.PointLight|null, update(dt:number, time:number):void,
 *   level: number, uniforms: object, dispose():void }}
 *   `level` is the current flicker value in [-1, 1] (for syncing glowing coals etc.).
 */
export function createFire(o = {}) {
  const {
    radius = 0.5,
    height = 1.2,
    flameSize = radius * 1.1,
    flames = 60,
    embers = 80,
    smoke = 16,
    smokeHeight = height * 3.5,
    smokeOpacity = 0.3,
    brightness = 1,
    intensity = 60,
    lightColor = 0xff8a3a,
    lightOffset = [0, height * 0.75, 0],
    distance = 0,
    decay = 2,
    flicker = 0.2,
    jitter = radius * 0.08,
    castShadow = false,
    shadowMapSize = 1024,
    shadowRadius = 3,
    shadowIntensity = 1,
    wind = [0, 0],
    seed = 1,
  } = o;

  const group = new THREE.Group();
  group.name = 'fire';
  const rnd = rng(seed * 7919 + 13);
  const tOffset = rnd() * 100; // de-synchronize fires

  // Shared uniforms (one object per fire; materials reference the same uniform objects).
  const u = {
    uTime: { value: 0 },
    uRadius: { value: radius },
    uHeight: { value: height },
    uSize: { value: flameSize },
    uWind: { value: new THREE.Vector2(wind[0], wind[1]) },
    uBrightness: { value: brightness },
  };
  const disposables = [];
  const bounds = new THREE.Sphere(new THREE.Vector3(0, height, 0), Math.max(height * 1.5, radius * 2));

  // ---- Flames -------------------------------------------------------------------------
  const flameGeo = quadParticles(flames, rnd, bounds);
  const flameMat = new THREE.ShaderMaterial({
    name: 'fire-flames',
    uniforms: { ...u, ...fogUniforms() },
    fog: true,
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flameMesh = new THREE.Mesh(flameGeo, flameMat);
  flameMesh.name = 'fire-flames';
  flameMesh.renderOrder = 2;
  group.add(flameMesh);
  disposables.push(flameGeo, flameMat);

  // ---- Embers -------------------------------------------------------------------------
  if (embers > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(embers * 3), 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(randAttribute(embers, rnd), 4));
    const eb = bounds.clone();
    eb.center.y = height * 1.5;
    eb.radius = height * 2.5;
    geo.boundingSphere = eb;
    const mat = new THREE.ShaderMaterial({
      name: 'fire-embers',
      uniforms: { ...u, ...fogUniforms(), uSize: { value: Math.max(0.012, radius * 0.05) }, uViewportH: { value: 1000 } },
      fog: true,
      vertexShader: EMBER_VERT,
      fragmentShader: EMBER_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'fire-embers';
    pts.renderOrder = 3;
    const size = new THREE.Vector2();
    pts.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(size);
      mat.uniforms.uViewportH.value = size.y;
    };
    group.add(pts);
    disposables.push(geo, mat);
  }

  // ---- Smoke --------------------------------------------------------------------------
  if (smoke > 0) {
    const sb = bounds.clone();
    sb.center.y = height * 0.55 + smokeHeight * 0.5;
    sb.radius = smokeHeight * 0.6 + radius * 3;
    const geo = quadParticles(smoke, rnd, sb);
    const mat = new THREE.ShaderMaterial({
      name: 'fire-smoke',
      uniforms: { ...u, ...fogUniforms(), uSmokeHeight: { value: smokeHeight }, uOpacity: { value: smokeOpacity } },
      fog: true,
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'fire-smoke';
    mesh.renderOrder = 1;
    group.add(mesh);
    disposables.push(geo, mat);
  }

  // ---- Light --------------------------------------------------------------------------
  let light = null;
  if (intensity > 0) {
    light = new THREE.PointLight(lightColor, intensity, distance, decay);
    light.name = 'fire-light';
    light.position.set(...lightOffset);
    if (castShadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      light.shadow.camera.near = 0.2;
      light.shadow.camera.far = 60;
      light.shadow.bias = -0.002;
      light.shadow.normalBias = 0.03;
      light.shadow.radius = shadowRadius;
      light.shadow.intensity = shadowIntensity;
    }
    group.add(light);
  }

  const fire = {
    group,
    light,
    uniforms: u,
    level: 0,
    update(dt, time) {
      const t = (time + tOffset) % 3600;
      u.uTime.value = t;
      // Smooth layered value noise: a slow "breath" plus faster licks. No per-frame jumps.
      const f = 0.5 * noise1(t * 4.1) + 0.3 * noise1(t * 9.7 + 17.3) + 0.2 * noise1(t * 0.9 + 41.1);
      fire.level = f;
      u.uBrightness.value = brightness * (1 + 0.6 * flicker * f);
      if (light) {
        light.intensity = intensity * (1 + flicker * f);
        light.position.set(
          lightOffset[0] + jitter * noise1(t * 3.3 + 101.0),
          lightOffset[1] + jitter * 0.6 * noise1(t * 3.7 + 203.0),
          lightOffset[2] + jitter * noise1(t * 3.1 + 307.0),
        );
      }
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      if (light) light.dispose();
    },
  };
  fire.update(0, 0);
  return fire;
}

// ---- Lamp flames ----------------------------------------------------------------------
// Small, steady oil-lamp flames (menorah): one instanced camera-facing quad per wick with a
// teardrop shape that flickers and sways in the shader, inside a larger quad that also carries a
// soft warm halo (the glow round a small flame, which bloom alone shows only as a point at a
// distance). One draw call for all of them.
const LAMP_HALO = [7.0, 3.5]; // quad size relative to the flame (width, height)

const LAMP_VERT = /* glsl */ `
uniform float uTime;
uniform float uWidth;
uniform float uHeight;
attribute vec4 aWick; // xyz: wick position (local), w: seed
varying vec2 vUv;
varying float vSway;
varying float vHeat;
#include <fog_pars_vertex>
${BILLBOARD_GLSL}
void main() {
  float s = aWick.w * 17.0;
  float t = uTime;
  // Gusts are rare and soft; most of the time the flame just breathes.
  float flick = 0.08 * sin(t * 11.0 + s) + 0.05 * sin(t * 23.7 + s * 2.3) + 0.04 * sin(t * 3.1 + s * 0.7);
  float h = uHeight * (1.0 + flick);
  vec3 c = aWick.xyz + vec3(0.0, h * 0.5 - uHeight * 0.08, 0.0);
  vec4 mv = billboard(c, position.xy * vec2(${LAMP_HALO[0].toFixed(2)}, ${LAMP_HALO[1].toFixed(2)}), uWidth, h / uWidth);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  vUv = uv;
  vSway = 0.12 * sin(t * 2.3 + s) + 0.06 * sin(t * 7.9 + s * 1.7);
  vHeat = 1.0 + 1.5 * flick;
}
`;

const LAMP_FRAG = /* glsl */ `
uniform float uBrightness;
uniform float uHalo;
varying vec2 vUv;
varying float vSway;
varying float vHeat;
${FOG_ADDITIVE_GLSL}
void main() {
  vec2 c = (vUv * 2.0 - 1.0) * vec2(${LAMP_HALO[0].toFixed(2)}, ${LAMP_HALO[1].toFixed(2)});
  // Halo: a soft warm glow centred a little above the flame's root, fading to zero at the quad
  // edge.
  vec2 hq = vec2(c.x / ${LAMP_HALO[0].toFixed(2)}, (c.y + 0.2) / ${LAMP_HALO[1].toFixed(2)});
  float halo = uHalo * vHeat * max(exp(-9.0 * dot(hq, hq)) - 0.0002, 0.0);
  vec3 haloCol = vec3(1.0, 0.5, 0.16) * halo;
  float v = clamp(c.y * 0.5 + 0.5, 0.0, 1.0);
  c.x -= vSway * v * v * 1.6;
  // Teardrop: round base low in the quad, tapering to a point at the top.
  float halfW = 0.62 * (1.0 - 0.82 * smoothstep(0.2, 1.0, v));
  float yy = c.y + 0.45;
  float d = length(vec2(c.x / max(halfW, 0.02), yy / (yy > 0.0 ? 1.45 : 0.55)));
  float body = abs(c.y) > 1.0 ? 0.0 : 1.0 - smoothstep(0.55, 1.0, d);
  if (body + halo <= 0.001) discard;
  float core = 1.0 - smoothstep(0.0, 0.6, d);
  vec3 outer = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.55, 0.16), v);
  vec3 col = mix(outer, vec3(1.0, 0.86, 0.6), core);
  // Faint blue at the root of the flame.
  col = mix(col, vec3(0.25, 0.35, 1.0), (1.0 - smoothstep(0.0, 0.22, v)) * (1.0 - core) * 0.6);
  float glow = body * (1.2 + 4.5 * core * core) * vHeat;
  gl_FragColor = vec4((col * glow * body + haloCol) * uBrightness * (1.0 - fogAmount()), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Small lamp flames, one per wick, in a single instanced draw.
 * @param {number[][]} wicks  Wick positions [x, y, z] (local, meters).
 * @param {{ width?: number, height?: number, brightness?: number, halo?: number, seed?: number }} o
 *   halo: strength of the soft glow round each flame.
 * @returns {{ mesh: THREE.Mesh, uniforms: object, update(time:number):void, dispose():void }}
 */
export function createLampFlames(wicks, { width = 0.028, height = 0.06, brightness = 1, halo = 0.6, seed = 3 } = {}) {
  const rnd = rng(seed * 104729 + 7);
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const a = new Float32Array(wicks.length * 4);
  wicks.forEach((w, i) => a.set([w[0], w[1], w[2], rnd()], i * 4));
  geo.setAttribute('aWick', new THREE.InstancedBufferAttribute(a, 4));
  geo.instanceCount = wicks.length;
  geo.boundingSphere = new THREE.Box3().setFromArray(wicks.flat()).getBoundingSphere(new THREE.Sphere());
  geo.boundingSphere.radius += height * 2;
  const uniforms = {
    uTime: { value: 0 },
    uWidth: { value: width },
    uHeight: { value: height },
    uBrightness: { value: brightness },
    uHalo: { value: halo },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'lamp-flames',
    uniforms: { ...uniforms, ...fogUniforms() },
    fog: true,
    vertexShader: LAMP_VERT,
    fragmentShader: LAMP_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lamp-flames';
  mesh.renderOrder = 2;
  const tOffset = rnd() * 100;
  return {
    mesh,
    uniforms,
    update(time) {
      uniforms.uTime.value = (time + tOffset) % 3600;
    },
    dispose() {
      base.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}

// ---- Incense smoke --------------------------------------------------------------------
// A slow, faint plume rising from the incense altar's coals: one instanced draw of soft
// camera-facing puffs. Near the coals they follow one lazily swaying path (a thin ribbon); as
// they rise each drifts outward in its own direction and swells, so the plume widens and
// thins into a soft haze. Alpha-blended (not additive); no light.

const WISP_VERT = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform float uSize;
uniform float uSpread;
uniform float uGrow;
uniform float uCycle;
attribute vec4 aRand;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
#include <fog_pars_vertex>
${BILLBOARD_GLSL}
void main() {
  float t = uTime / uCycle + aRand.z;
  float age = fract(t);
  float rise = uHeight * age * (1.0 - 0.15 * age);
  // Shared sway: the whole column bends the same way at a given height, growing with height.
  float k = age * age;
  vec3 p = vec3(
    0.07 * uHeight * k * sin(age * 5.5 - uTime * 0.55) + 0.02 * uHeight * k * sin(age * 13.0 - uTime * 0.9 + aRand.x * 6.0),
    rise,
    0.06 * uHeight * k * sin(age * 4.3 - uTime * 0.42 + 1.7) + 0.02 * uHeight * k * cos(age * 11.0 - uTime * 0.8 + aRand.y * 6.0));
  // Spreading: each puff drifts out in its own (slowly turning) direction as it rises.
  float ang = aRand.w * 6.2832 + 0.15 * uTime * (aRand.x - 0.5);
  float spread = uSpread * pow(age, 1.4) * mix(0.25, 1.0, fract(aRand.x * 7.31));
  p.xz += spread * vec2(cos(ang), sin(ang));
  float size = uSize * mix(0.7, 1.1, aRand.y) * (0.6 + uGrow * age * age + 1.2 * age);
  vec4 mv = billboard(p, position.xy, size, 1.0);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  vUv = uv;
  vAge = age;
  vSeed = aRand.x;
}
`;

const WISP_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uGlow;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float n = fFbm(vUv * 3.0 + vec2(vSeed * 9.0, vSeed * 4.0 - uTime * 0.1));
  // Older (higher, wider) puffs are rounder and softer-edged, so they blend into a haze.
  float d = length(c) - (n - 0.5) * mix(0.8, 0.4, vAge);
  float shape = 1.0 - smoothstep(mix(0.0, -0.6, vAge), 1.0, d);
  if (shape <= 0.0) discard;
  float fade = smoothstep(0.0, 0.1, vAge) * (1.0 - smoothstep(0.4, 1.0, vAge)) * mix(1.0, 0.5, vAge);
  // Warmed by the coals at its root, then cool grey-blue.
  vec3 col = mix(uGlow, uColor, smoothstep(0.0, 0.3, vAge));
  gl_FragColor = vec4(col, shape * shape * fade * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/**
 * Incense smoke plume, one instanced draw. The mesh's origin is the smoke's source.
 * @param {{ count?: number, height?: number, size?: number, opacity?: number, color?: number,
 *   glow?: number, seed?: number, spread?: number, grow?: number, cycle?: number }} o
 *   height/size/spread in meters (spread: how far puffs drift out by the top); grow: extra
 *   size growth with age; cycle: seconds for a puff to rise.
 * @returns {{ mesh: THREE.Mesh, update(time:number):void, dispose():void }}
 */
export function createIncenseSmoke({ count = 14, height = 1.4, size = 0.03, opacity = 0.2, color = 0x8a8f9a, glow = 0xd08a50, seed = 5, spread = 0, grow = 2, cycle = 11 } = {}) {
  const rnd = rng(seed * 7919 + 29);
  const geo = quadParticles(count, rnd, new THREE.Sphere(new THREE.Vector3(0, height * 0.5, 0), height * 0.7 + spread));
  const mat = new THREE.ShaderMaterial({
    name: 'incense-smoke',
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: height },
      uSize: { value: size },
      uSpread: { value: spread },
      uGrow: { value: grow },
      uCycle: { value: cycle },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
      uGlow: { value: new THREE.Color(glow) },
      ...fogUniforms(),
    },
    fog: true,
    vertexShader: WISP_VERT,
    fragmentShader: WISP_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'incense-smoke';
  mesh.renderOrder = 1;
  const tOffset = rnd() * 100;
  return {
    mesh,
    update(time) {
      mat.uniforms.uTime.value = (time + tOffset) % 3600;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
