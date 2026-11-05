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
  sideBoards: 20, // per long side (Ex 26:18, 20)
  westBoards: 6, // plus 2 corner boards (Ex 26:22-23)
  cornerBoards: 2,
  boardGap: 0.015, // visible seam between boards (not in text)
  // Silver sockets: 2 per board (Ex 26:19). Rashi: 1 cubit high; the board's notched base
  // (tenons) sits inside them, so the board top stays at 10 cubits.
  socketHeight: 1,
  socketProud: 0.05, // how far a socket stands out from the board faces (not in text)
  // Bars (Ex 26:26-28): 5 per wall; top and bottom rows are two half-length bars, the middle
  // bar runs the full length. Shown on the outside of the boards, held by gold rings.
  barHeights: [2, 5, 8.4], // bottom, middle, top row centers (not in text)
  barRadius: 0.12, // not in text
  barOffset: 0.3, // bar center distance out from the board face (not in text)
  ringTube: 0.035, // not in text
  // East entrance (Ex 26:36-37): 5 gold-overlaid acacia pillars on bronze sockets.
  entrancePillars: 5,
  entrancePillarX: 0.4, // pillar centers stand just east of the board ends (not in text)
  entrancePillarRadius: 0.28, // not in text
  entranceCapitalHeight: 0.6, // gold capital (Ex 36:38), not in text
  entranceSocket: 0.9, // bronze socket footprint, 1 cubit high like the silver ones (not in text)
  screenTop: 9.5, // screen hung from gold hooks on the pillars' inner side (not in text)
  screenHem: 0.08,
  // Coverings (Ex 26:1-14). The inner linen covering is hidden under the goat hair from
  // outside and is not modeled (Decisions log).
  roofSag: 0.22, // coverings dip slightly between the walls (not in text)
  coverEastOverhang: 0.85, // roof coverings reach past the board ends over the pillars
  goatHair: {
    curtains: 11,
    curtainLength: 30, // N-S, across the tent
    curtainWidth: 4, // E-W
    clearance: 0.04, // sits this far above the board tops (over the linen)
    edgeRadius: 0.35, // rounding where the sheet turns down over the roof edge
    // Ex 26:13 "about 1 cubit" above the ground on the sides; it stands off the boards over
    // the bars, so the hem rides a little higher and the gold shows above the sockets.
    hemSide: 1.55,
    hemBack: 0.15, // the extra half curtain hangs down the back to near the ground (26:12)
    flap: 2, // the doubled sixth curtain folds over the front (26:9)
    standOff: 0.2, // extra offset from the boards where it hangs over the bars
    foldAmp: 0.32,
    claspAt: 24, // E-W material position (from the flap hem) of the clasp line: 6 curtains
    clasps: 50, // bronze clasps (26:11)
    pegDistance: 2, // tent pins (35:18): cords run out this far from the hem
  },
  ramSkins: { margin: 0.15, edgeRadius: 0.3, droop: 1, above: 0.06 }, // roof only
  tachash: { inset: 0.6, edgeRadius: 0.035, droop: 0, above: 0.11 }, // roof only, top-most (rolled lip)
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

// Torches (artistic license, not in the text): wooden posts with pitch-soaked wrapped heads.
// Positions in cubits; `light: false` = flames and glow only (keeps point lights <= 10).
export const TORCHES = {
  postHeight: 2.4, // meters (not in text)
  list: [
    // Flanking the gate, outside the east hangings.
    { x: 54, z: -12, light: true },
    { x: 54, z: 12, light: true },
    // Further out along the approach path.
    { x: 59, z: -7, light: true },
    { x: 59, z: 7, light: true },
    // Outside the east corners.
    { x: 54, z: -28, light: true },
    { x: 54, z: 28, light: true },
    // Inside, near the east corners (clear of the gate-altar-tent axis).
    { x: 40, z: -21, light: true },
    { x: 40, z: 21, light: true },
    // Outside the west corners: glow only.
    { x: -54, z: -28, light: false },
    { x: -54, z: 28, light: false },
  ],
};
