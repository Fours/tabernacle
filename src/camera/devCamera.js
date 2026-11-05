import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COURTYARD, ALTAR, TABERNACLE, m, PLAYER } from '../config/dimensions.js';

const eye = PLAYER.eyeHeight;
const hx = COURTYARD.length / 2; // cubits
const hz = COURTYARD.width / 2;

/** Deterministic preset views. Positions/targets in meters. */
export const PRESETS = {
  // Very high + narrow FOV so the top view is near-orthographic (proportions readable).
  top: { pos: [0, m(600), 0.001], target: [0, 0, 0], fov: 10 },
  iso: { pos: [m(60), m(45), m(68)], target: [0, 0, 0] },
  gate: { pos: [m(hx + 20), eye, 0], target: [m(hx), eye, 0] },
  altar: { pos: [m(ALTAR.x + 9), m(7), m(8)], target: [m(ALTAR.x), m(1.5), 0] },
  // Straight-ish down into the altar: hearth, wall thickness, horns, ledge, net, rings, poles.
  altartop: { pos: [m(ALTAR.x + 1.5), m(14), m(5.5)], target: [m(ALTAR.x), m(2.5), 0], fov: 50 },
  // Low side view along the ledge/net band from the south-east, plus utensils.
  altarlow: { pos: [m(ALTAR.x + 7), m(2.4), m(9)], target: [m(ALTAR.x), m(1.8), m(1)] },
  laver: { pos: [m(10 + 6), m(3.2), m(3 + 6)], target: [m(10), m(1.2), m(3)] },
  tent: {
    pos: [m(TABERNACLE.interiorMaxX + 16), eye, m(-5)],
    target: [m(TABERNACLE.interiorMaxX), m(4), 0],
  },
  corner: { pos: [m(hx + 6), m(4), m(hz + 7)], target: [m(hx), m(2), m(hz)] },
  // Close-up of a south-wall pillar top from outside: capital, hooks, fillets, cord.
  pillar: { pos: [m(31.8), m(5.6), m(hz + 3.2)], target: [m(30), m(4.4), m(hz)] },
  // Same spot as the first-person spawn: outside the gate, facing west, lined up with the
  // gap between the middle gate pillar (z = 0) and the next one (z = +5 cubits).
  walk: {
    pos: [m(hx + 15), eye, m(COURTYARD.pillarSpacing / 2)],
    target: [m(hx), eye, m(COURTYARD.pillarSpacing / 2)],
  },
};

export function createDevCamera(camera, domElement, viewName = 'iso') {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  const apply = (name) => {
    const p = PRESETS[name] || PRESETS.iso;
    camera.fov = p.fov || 60;
    camera.updateProjectionMatrix();
    camera.position.set(...p.pos);
    controls.target.set(...p.target);
    controls.update();
  };
  apply(viewName);
  return {
    controls,
    apply,
    update() {
      controls.update();
    },
    dispose() {
      controls.dispose();
    },
  };
}
