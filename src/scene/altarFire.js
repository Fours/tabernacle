import * as THREE from 'three';
import { createFire } from './fire.js';
import { createFirewood } from './firewood.js';
import { QUALITY } from '../config/quality.js';

/**
 * The perpetual fire on the bronze altar (Lev 6:13), burning up through the top grate: a bed
 * of glowing coals under the grate (the wood itself isn't shown), flames, embers, smoke and the
 * courtyard's main (shadow-casting) light.
 * @param {{x:number, y:number, bedY:number, z:number, size:number, grate:object}} hearth  World
 *   meters (altar.userData.hearth): y = grate top, bedY = ember bed under it, grate = its bars.
 */
export function createAltarFire(hearth) {
  const group = new THREE.Group();
  group.name = 'altar-fire';
  group.position.set(hearth.x, hearth.y, hearth.z);

  // Ember bed: coals only (no log stack), glowing through the grate's gaps.
  const coals = createFirewood({ size: hearth.size * 0.85, layers: 0, leaners: 0, logRadius: 0.09, coals: 260, glow: 7 });
  coals.mesh.position.y = hearth.bedY - hearth.y;
  group.add(coals.mesh);

  // Light and fill stay where they were above the old hearth (rim + 1.04 m / + 3.0 m).
  const BASE = -0.13; // flames start under the grate (bars are 0.11 m deep) and rise through it

  const fire = createFire({
    radius: hearth.size * 0.3,
    height: 1.8,
    flameSize: hearth.size * 0.6,
    flames: 14,
    sparks: 90,
    embers: 24,
    ash: 50,
    smoke: 56,
    smokeHeight: 6,
    smokeSize: 1.3,
    smokeBase: 0.75,
    // Faint, and fading in soon over the flames so a soft plume shows just above them (not the
    // opaque ball a young, small, dense puff makes).
    smokeOpacity: 0.26,
    smokeFadeIn: 0.15,
    smokeGlow: 1.4,
    // Decay 1.5 (not the physical 2) with a lower intensity: a big fire is a large source, so
    // the near rim/horns shouldn't blow out while the far courtyard stays lit.
    intensity: 105,
    decay: 1.5,
    // Well above the rim (and the horns' bases) so the walls don't shadow the courtyard, low
    // enough that the rim's shadow edge falls past the carrying poles (not a lit line on them).
    lightOffset: [0, 1.12 - BASE, 0],
    shadowRadius: 5,
    shadowMapSize: QUALITY.shadowMapSize, // 1024 (high)
    flicker: 0.22,
    castShadow: true,
    wind: [0.06, 0.02],
    // The grate's bars, in the fire's frame (its base is BASE below the grate top).
    grate: {
      y: [-BASE - hearth.grate.depth, -BASE], pitch: hearth.grate.pitch, bar: hearth.grate.bar,
      origin: hearth.grate.origin, half: hearth.grate.half,
    },
  });
  fire.group.position.y = BASE;
  group.add(fire.group);

  // The flame tops reach well above the rim, so the sand right round the altar isn't fully in
  // the walls' shadow: a weak unshadowed fill high over the fire softens that dark square.
  const FILL = 14;
  const fill = new THREE.PointLight(0xff9a48, FILL, 0, 1.5);
  fill.name = 'fire-fill';
  fill.position.set(0, 3.08, 0);
  group.add(fill);

  group.userData.fire = fire;
  group.userData.update = (dt, time) => {
    fire.update(dt, time);
    fill.intensity = FILL * (1 + 0.15 * fire.level);
    coals.update(time, fire.level);
  };
  group.userData.colliders = [];
  return group;
}
