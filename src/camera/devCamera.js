import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COURTYARD, ALTAR, TABERNACLE, MENORAH, SHOWBREAD, INCENSE_ALTAR, ARK, m, PLAYER } from '../config/dimensions.js';

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
  // The altar fire close-up at eye level from the south-east (flames above the rim, hearth glow).
  fire: { pos: [m(ALTAR.x + 7), eye, m(6)], target: [m(ALTAR.x), m(3.2), 0], fov: 55 },
  // Close-up of a gate-side torch from the approach: post, wrapped head, cairn, flame.
  torch: { pos: [m(54 + 5), m(5.4), m(-12 + 4)], target: [m(54), m(5.2), m(-12)], fov: 50 },
  laver: { pos: [m(10 + 6), m(3.2), m(3 + 6)], target: [m(10), m(1.2), m(3)] },
  tent: {
    pos: [m(TABERNACLE.interiorMaxX + 16), eye, m(-5)],
    target: [m(TABERNACLE.interiorMaxX), m(4), 0],
  },
  // Tent from the north-west (back and north side, west drape, corner).
  tentback: { pos: [m(-46), m(7), m(-21)], target: [m(-24), m(4), m(-2)] },
  // High view over the tent roof from the south-east: tachash on top, red ram skins below.
  tentroof: { pos: [m(14), m(30), m(24)], target: [m(-14), m(8), 0] },
  // Close-up of the tent's south-east corner at the hem: boards, sockets, bars, pins, flap.
  tentcorner: { pos: [m(7), m(2.8), m(15)], target: [m(-6), m(2), m(6)], fov: 50 },
  // Inside the Holy Place: just in from the entrance looking west at eye height.
  holyplace: { pos: [m(TABERNACLE.interiorMaxX - 1.5), eye, 0], target: [m(-20), eye, 0], fov: 65 },
  // Looking up at the linen ceiling's cherubim toward the clasp line over the veil.
  ceiling: { pos: [m(-7), eye, m(1)], target: [m(-15), m(10), m(-0.5)], fov: 70 },
  // Facing the veil from the Holy Place.
  veil: { pos: [m(-9), eye, m(0.5)], target: [m(TABERNACLE.veil.x), m(4.6), 0], fov: 62 },
  // Close three-quarter view of the menorah from the north-east (room side), slightly above.
  menorah: { pos: [m(MENORAH.x + 2), m(2.9), m(MENORAH.z - 3.6)], target: [m(MENORAH.x), m(1.75), m(MENORAH.z)], fov: 50 },
  // Close three-quarter view of the table of showbread from the south-east (room side).
  table: { pos: [m(SHOWBREAD.x + 2.2), m(2.2), m(SHOWBREAD.z + 2.6)], target: [m(SHOWBREAD.x), m(0.85), m(SHOWBREAD.z)], fov: 50 },
  // Close three-quarter view of the altar of incense from the east and slightly north, above.
  incense: { pos: [m(INCENSE_ALTAR.x + 3.2), m(2.7), m(INCENSE_ALTAR.z + 1.5)], target: [m(INCENSE_ALTAR.x), m(1.8), m(INCENSE_ALTAR.z)], fov: 55 },
  // Close three-quarter view of the ark and cherubim from the south-east, a little above.
  ark: { pos: [m(ARK.x + 3.9), m(3.7), m(ARK.z + 3.3)], target: [m(ARK.x), m(2), m(ARK.z)], fov: 50 },
  // Just west of the veil (between its middle pillars) at eye height, looking west at the ark.
  holyofholies: { pos: [m(TABERNACLE.veil.x - 1.3), eye, 0], target: [m(ARK.x), m(1.8), 0], fov: 62 },
  corner: { pos: [m(hx + 6), m(4), m(hz + 7)], target: [m(hx), m(2), m(hz)] },
  // Close-up of a south-wall pillar top from outside: capital, hooks, fillets, cord.
  pillar: { pos: [m(31.8), m(5.6), m(hz + 3.2)], target: [m(30), m(4.4), m(hz)] },
  // Eye level at the walk spawn, looking up ~42 degrees toward the north-west (Milky Way).
  sky: { pos: [m(hx + 15), eye, m(COURTYARD.pillarSpacing / 2)], target: [m(hx - 15), m(24), m(-14)], fov: 70 },
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
