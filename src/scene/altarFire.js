import * as THREE from 'three';
import { createFire } from './fire.js';
import { createFirewood } from './firewood.js';

/**
 * The perpetual fire on the bronze altar (Lev 6:13): a stacked wood fire on the earth hearth
 * with flames, embers, smoke and the courtyard's main (shadow-casting) light.
 * @param {{x:number, y:number, z:number, size:number}} hearth  World meters (altar.userData.hearth).
 */
export function createAltarFire(hearth) {
  const group = new THREE.Group();
  group.name = 'altar-fire';
  group.position.set(hearth.x, hearth.y, hearth.z);

  const wood = createFirewood({ size: hearth.size * 0.6, layers: 3, logRadius: 0.065 });
  group.add(wood.mesh);

  const fire = createFire({
    radius: hearth.size * 0.3,
    height: 1.8,
    flameSize: hearth.size * 0.42,
    flames: 110,
    embers: 140,
    smoke: 22,
    smokeHeight: 5,
    // Decay 1.6 (not the physical 2) with a lower intensity: a big fire is a large source, so
    // the near rim/horns shouldn't blow out while the far courtyard stays lit.
    intensity: 95,
    decay: 1.6,
    // Well above the rim (and the horns' bases) so the walls don't shadow the courtyard; high
    // enough that the walls' shadow square on the sand stays small.
    lightOffset: [0, 1.45, 0],
    shadowRadius: 7,
    flicker: 0.22,
    castShadow: true,
    wind: [0.06, 0.02],
  });
  fire.group.position.y = 0.04;
  group.add(fire.group);

  group.userData.fire = fire;
  group.userData.update = (dt, time) => {
    fire.update(dt, time);
    wood.update(time, fire.level);
  };
  group.userData.colliders = [];
  return group;
}
