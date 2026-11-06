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
  // Close on the flames at eye height, ~2 m out from the altar's south-east horn.
  fireclose: { pos: [m(ALTAR.x + ALTAR.length / 2) + 1.4, eye, m(ALTAR.width / 2) + 1.4], target: [m(ALTAR.x), 2.1, 0], fov: 60 },
  // Close-up of a gate-side torch from the approach: post, wrapped head, cairn, flame.
  torch: { pos: [m(59 + 5), m(5.4), m(-7 - 4)], target: [m(59), m(5.2), m(-7)], fov: 50 },
  laver: { pos: [m(10 + 6), m(3.2), m(3 + 6)], target: [m(10), m(1.2), m(3)] },
  // Close over the laver's rim from the south-east: basin, water, a spout and its tap.
  laverclose: { pos: [m(10 + 1.9), m(2.75), m(3 + 2.1)], target: [m(10 - 0.2), m(1.55), m(3 - 0.2)], fov: 50 },
  tent: {
    pos: [m(TABERNACLE.interiorMaxX + 16), eye, m(-5)],
    target: [m(TABERNACLE.interiorMaxX), m(4), 0],
  },
  // Tent from the north-west (back and north side, west drape, corner).
  tentback: { pos: [m(-46), m(7), m(-21)], target: [m(-24), m(4), m(-2)] },
  // High view over the tent roof from the south-east: tachash on top, red ram skins below.
  tentroof: { pos: [m(14), m(30), m(24)], target: [m(-14), m(8), 0] },
  // The tent's south-east corner from just outside its stakes: the three stepped layers, the
  // front flap, the diagonal corner cords, and the boards and sockets under the slant.
  tentcorner: { pos: [m(9), m(4), m(19)], target: [m(-6), m(3), m(7)], fov: 50 },
  // From the courtyard's north-east, low: the coverings stepping out along the north side
  // (tachash, ram skins, goat hair) with their rows of stakes and cords.
  coverings: { pos: [m(12), m(3.5), m(-22)], target: [m(-14), m(3), m(-9)], fov: 60 },
  // Close (~0.5 m) on a goat-hair tie on the north side: its silver ring, patch, cord loop and
  // knot under the hem. Meters: the tie is at (-8.62, 0.68, -4.72).
  hemtie: { pos: [-8.42, 0.86, -5.18], target: [-8.61, 0.7, -4.72], fov: 55 },
  // From the south-west: the west and south slants, the corner fan and the stakes.
  coveringsw: { pos: [m(-46), m(4.5), m(22)], target: [m(-22), m(3), m(5)], fov: 60 },
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
  // Close side view of the altar of incense from the south-east, its full smoke column against
  // the veil.
  smoke: { pos: [m(INCENSE_ALTAR.x + 3.6), m(3.4), m(INCENSE_ALTAR.z + 5)], target: [m(INCENSE_ALTAR.x - 0.3), m(3.1), m(INCENSE_ALTAR.z)], fov: 50 },
  // Close three-quarter view of the ark and cherubim from the south-east, a little above.
  ark: { pos: [m(ARK.x + 3.9), m(3.7), m(ARK.z + 3.3)], target: [m(ARK.x), m(2), m(ARK.z)], fov: 50 },
  // Close above the mercy seat from the east, looking down between the cherubim at the blood
  // on the lid (Lev 16:14-15).
  mercyseat: { pos: [m(ARK.x + 2.2), m(3.4), m(ARK.z + 0.15)], target: [m(ARK.x), m(1.67), m(ARK.z)], fov: 45 },
  // Just west of the veil (between its middle pillars) at eye height, looking west at the ark.
  holyofholies: { pos: [m(TABERNACLE.veil.x - 1.3), eye, 0], target: [m(ARK.x), m(1.8), 0], fov: 62 },
  // Low (0.8 m) just outside the south hangings near the altar, looking north-west across the
  // rocks and scrub at the hangings lit from within by the altar fire.
  ground: { pos: [m(43), 0.8, m(hz + 20.5)], target: [m(25), 1.0, m(hz)], fov: 60 },
  corner: { pos: [m(hx + 6), m(4), m(hz + 7)], target: [m(hx), m(2), m(hz)] },
  // Close-up of a south-wall pillar top from outside: capital, hooks, fillets, cord.
  pillar: { pos: [m(31.8), m(5.6), m(hz + 3.2)], target: [m(30), m(4.4), m(hz)] },
  // Eye level near the walk spawn (its old spot, z = 2.5 cubits), looking up ~42 degrees toward the north-west (Milky Way).
  sky: { pos: [m(hx + 15), eye, m(COURTYARD.pillarSpacing / 2)], target: [m(hx - 15), m(24), m(-14)], fov: 70 },
  // Wide view from inside the courtyard's south-east, looking up past the altar at the tent and
  // the full pillar of fire with its shaft of light fading into the sky.
  firepillar: { pos: [m(45), eye, m(20)], target: [m(-25), 22, 0], fov: 75 },
  // Far out in the desert to the south-east: the whole shaft, fading up toward the clouds.
  firepillarfar: { pos: [130, eye, 70], target: [m(-25), 75, 0], fov: 70 },
  // Close on the fire: its tapered foot above the tent roof, fading up into the shaft.
  firepillarfoot: { pos: [m(10), m(6), m(34)], target: [m(-25), 19, 0], fov: 62 },
  // The camp of Israel from ~58 m up over Judah's camp (east), looking west over the court:
  // the Levites' rows round the court, the tribal blocks and the lanes between them fading
  // into the night haze (lower than a true overview: the fog hides anything much further).
  camp: { pos: [72, 58, 24], target: [0, 0, -8], fov: 60 },
  // Eye height just outside the gate's north post, looking north-west past the north-east
  // corner of the hangings over the nearest tents (Merari's rows, Dan's camp beyond).
  campwalk: { pos: [m(hx) + 5, eye, -8], target: [5, eye + 0.3, -40], fov: 65 },
  // Eye height just outside the court's north-west corner, looking north-west down the camp's
  // diagonal lane, between the tents of Gershon/Merari and Ephraim's/Dan's camps, to the
  // distant ridges on the horizon.
  horizon: { pos: [-m(hx) - 4, eye, -m(hz) - 4], target: [-m(hx) - 80, eye + 2.4, -m(hz) - 76], fov: 60 },
  // Same spot as the first-person spawn: outside the open gate on the east-west axis,
  // looking straight west through it toward the altar and the tent.
  walk: {
    pos: [m(hx + 15) + 6, eye, 0],
    target: [m(hx), eye, 0],
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
