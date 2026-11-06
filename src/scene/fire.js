import * as THREE from 'three';
import { rng, noise1 } from './fireCommon.js';
import { createFlames } from './fireFlames.js';
import { createFireParticles } from './fireParticles.js';

// Reusable GPU-animated fire: flame sheets plus sparks, embers, ash and smoke (2 draw calls)
// and a flickering warm PointLight. All particle motion is computed in the shaders from a time
// uniform, so the per-frame JS cost is a few uniform writes and no allocations.
//
// Used by the altar (large, shadow-casting) and the torches (small, no shadows). The pieces live
// in fireCommon.js (shared GLSL + helpers), fireFlames.js, fireParticles.js and fireSmoke.js
// (the incense smoke); this module is the public entry and re-exports what other modules use.

export { NOISE_GLSL, FOG_ADDITIVE_GLSL } from './fireCommon.js';
export { createLampFlames } from './fireFlames.js';
export { createIncenseSmoke } from './fireSmoke.js';

/**
 * Create a fire. The group's origin is the base of the fire (the surface it burns on).
 *
 * @param {object} o
 * @param {number} [o.radius=0.5]      Radius of the burning bed (m).
 * @param {number} [o.height=1.2]      Typical flame height (m).
 * @param {number} [o.flameSize]       Width of a flame sheet (m); default 1.4 × radius.
 * @param {number} [o.flames=6]        Flame sheet count (fireFlames.js).
 * @param {number} [o.core=1]          Brightness of the yellow-white core relative to the body.
 * @param {number} [o.sparks=60]       Fast spark streaks; about a third fly in bursts.
 * @param {number} [o.bursts]          Burst groups the bursting sparks share; default sparks / 12.
 * @param {number} [o.embers=10]       Slow, long-lived drifting embers.
 * @param {number} [o.ash=0]           Pale ash flecks drifting down around the fire.
 * @param {number} [o.sparkSize]       Spark streak width (m); default max(6 mm, 0.02 × radius).
 * @param {number} [o.smoke=16]        Smoke puff count; 0 disables.
 * @param {number} [o.smokeHeight]     How high smoke rises (m); default 3.5 × height.
 * @param {number} [o.smokeOpacity=0.3]
 * @param {number} [o.smokeFadeIn=0.3] Puff age (fraction of its life) by which it reaches full density.
 * @param {number} [o.smokeSize=1.2]   Puff size at birth relative to the radius (grows 4×).
 * @param {number} [o.smokeBase=0.8]   Where puffs start, as a fraction of the flame height.
 * @param {number} [o.smokeGlow=1.2]   How strongly the fire lights the smoke from below.
 * @param {number[]} [o.smokeAmbient]  Unlit smoke colour (linear RGB).
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
    flameSize = radius * 1.4,
    flames = 6,
    core = 1,
    sparks = 60,
    bursts = Math.max(1, Math.round(sparks / 12)),
    embers = 10,
    ash = 0,
    sparkSize,
    smoke = 16,
    smokeHeight = height * 3.5,
    smokeOpacity = 0.3,
    smokeFadeIn,
    smokeSize,
    smokeBase,
    smokeGlow,
    smokeAmbient,
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

  const flameParts = createFlames(flames, u, rnd, { bounds, core });
  group.add(flameParts.object);
  disposables.push(...flameParts.disposables);
  if (sparks + embers + ash + smoke > 0) {
    const p = createFireParticles(u, rnd, {
      radius, height, sparks, bursts, embers, ash, smoke, sparkSize, smokeHeight, smokeOpacity,
      smokeFadeIn, smokeSize, smokeBase, smokeGlow, smokeAmbient, lightY: lightOffset[1],
    });
    group.add(p.object);
    disposables.push(...p.disposables);
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
      // No depth bias: the light grazes the ground, so even -0.002 (x far = 12 cm) let it leak
      // past the base of the court's hangings as a lit band with a hard edge ~1 m out.
      // normalBias alone keeps the surfaces free of acne.
      light.shadow.bias = 0;
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
