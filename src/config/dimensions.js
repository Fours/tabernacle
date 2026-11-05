// ALL biblical measurements live here, in cubits. Convert with m() / CUBIT.
// See AGENTS.md "Units, orientation & dimensions".
// Axes: East = +X, West = -X, North = -Z, South = +Z. Origin = courtyard center.

export const CUBIT = 0.45; // meters (common cubit)

/** Convert cubits to meters (world units). */
export const m = (cubits) => cubits * CUBIT;

// Courtyard (Ex 27:9-19; 38:9-20)
export const COURTYARD = {
  length: 100, // E-W
  width: 50, // N-S
  hangingHeight: 5,
  pillarSpacing: 5,
  pillarCount: 60,
  pillarDiameter: 0.5, // not in text (AGENTS.md default)
  // Not in text. Wood shaft top (from ground, incl. socket); hooks sit on the capital just
  // below this so the 5-cubit hanging clears the ground. Capital adds capitalHeight above.
  pillarHeight: 5.25,
  capitalHeight: 0.3, // silver-overlaid capital above the shaft (not in text)
  capitalSleeve: 0.25, // silver overlay reaching down the shaft (not in text)
  socketWidth: 0.8, // bronze socket, square (not in text)
  socketHeight: 0.5, // (not in text)
  filletDiameter: 0.08, // silver fillet rods joining the capitals (not in text)
  hangingClearance: 0.07, // hem above ground at the pillars (not in text)
  hangingSag: 0.1, // top-edge sag mid-span between hooks (not in text)
  pegDistance: 3, // bronze pegs: horizontal distance outward from pillar line (not in text)
  gateWidth: 20, // centered on east side
  gatePillars: 4,
  sideHangingWidth: 15, // each side of the gate, east side
  sideHangingPillars: 3,
};

// Tabernacle tent (Ex 26; 36:8-38)
export const TABERNACLE = {
  interiorLength: 30, // E-W
  interiorWidth: 10, // N-S
  interiorHeight: 10,
  holyPlaceLength: 20,
  holyOfHoliesLength: 10,
  boardHeight: 10,
  boardWidth: 1.5,
  boardThickness: 1, // rabbinic tradition (not in text)
  // Placement: interior spans x = interiorMinX .. interiorMaxX, centered z = 0
  interiorMinX: -30,
  interiorMaxX: 0,
  centerZ: 0,
  roofThickness: 0.25, // blockout slab (not in text)
  entranceScreenThickness: 0.1, // blockout (not in text)
};

// Bronze altar (Ex 27:1-8; 38:1-7). Only length/width/height are in the text; the rest is
// reconstruction (see AGENTS.md Decisions log).
export const ALTAR = {
  length: 5,
  width: 5,
  height: 3,
  x: 25,
  z: 0,
  wallThickness: 0.35, // acacia boards + bronze overlay (not in text)
  hearthDrop: 0.45, // earth/stone fill surface sits this far below the rim (tradition: filled with earth)
  hornHeight: 1, // horns rise 1 cubit (rabbinic tradition)
  hornBaseRadius: 0.2, // not in text
  hornTipRadius: 0.03, // not in text
  hornOutward: 0.22, // how far the horn tip leans outward along the corner diagonal (not in text)
  // Ledge (karkov) and bronze net (Ex 27:5): the net hangs beneath the ledge and reaches halfway
  // up the altar (1.5 cubits).
  ledgeTop: 2.25, // height of the ledge's top face (not in text; rabbinic: below the rim)
  ledgeProjection: 0.6, // how far the ledge sticks out from the wall (not in text)
  ledgeThickness: 0.12, // not in text
  gratingBottom: 1.5, // halfway up the altar (Ex 27:5)
  gratingBarSize: 0.04, // lattice bar thickness (not in text)
  gratingSpacing: 0.3, // lattice pitch (not in text)
  ringRadius: 0.25, // bronze ring centerline radius, at the grating's 4 corners (not in text)
  ringTube: 0.05, // not in text
  poleRadius: 0.09, // acacia poles overlaid with bronze (not in text)
  poleOverhang: 1.5, // how far each pole extends beyond the outer ring centers (not in text)
};

// Utensils (Ex 27:3; 38:3), placed on the ground near the altar's south side. Sizes not in text.
export const ALTAR_UTENSILS = {
  offsetZ: 4.6, // cubits south of the altar's center
};

// Laver (Ex 30:17-21; 38:8): bronze basin on a bronze base. Text gives no dimensions, so this is
// a human-scale reconstruction (rim at ~0.9 m, convenient for washing hands and feet).
export const LAVER = {
  x: 10,
  z: 3,
  radius: 1, // basin outer radius at the rim
  height: 2, // overall height (rim)
  footRadius: 0.85,
  stemRadius: 0.28,
  spouts: 4, // small bronze spouts around the basin (not in text)
};

// Non-biblical: human / player values, in meters.
export const PLAYER = {
  eyeHeight: 1.6,
  radius: 0.3,
  walkSpeed: 1.4,
  runSpeed: 3.5,
};
