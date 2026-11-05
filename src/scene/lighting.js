import * as THREE from 'three';

/** Night base lighting; `work` adds bright neutral fill for readability. */
export function createLighting({ work = false } = {}) {
  const group = new THREE.Group();
  group.name = 'lighting';

  // Dim cool night fill; the altar fire (scene/altarFire.js) is the main light.
  group.add(new THREE.HemisphereLight(0x5a6a99, 0x1a1510, 0.22));
  const moon = new THREE.DirectionalLight(0x9fb0ff, 0.16);
  moon.position.set(-40, 80, 30);
  group.add(moon);

  if (work) {
    group.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(30, 60, 45);
    group.add(sun);
  }
  return group;
}
