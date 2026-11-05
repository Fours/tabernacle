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
  // Artistic license (DECISIONS.md): the middle gate post (z = 0) is left out and the two middle
  // gate panels are drawn apart, gathered and tied back to the posts at z = +/-5 cubits.
  gateOpenHalf: 5, // half-width of the open middle of the gate
  gateTieHeight: 2.6, // tie-back height above ground (not in text)
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
  // East entrance (Ex 26:36-37). Departure from the text at the user's direction: the 5
  // pillars are left out so the door stands open. A gold-overlaid acacia beam spans the top of
  // the opening between the side walls' front boards; the embroidered screen hangs from it,
  // split in the middle, each half gathered and tied back to the boards (not in text).
  doorBeam: {
    x: -0.25, // beam centre line, just inside the board ends (x = 0); the cloth hangs on it
    depth: 0.5, // E-W
    height: 0.5, // its underside is the screen's hook line
  },
  screenTop: 9.5, // hook line under the beam (not in text)
  screenHem: 0.08,
  doorTieHeight: 4, // tie-back height above the ground (not in text)
  // Inner linen covering (Ex 26:1-6): 10 curtains of 28x4 cubits running N-S across the roof,
  // joined into two sets of 5 by 50 gold clasps. Only the ceiling seen from inside is modeled;
  // its sides hang down the outside of the boards under the goat hair (Decisions log).
  linen: {
    curtains: 10,
    curtainLength: 28, // N-S, across the tent
    curtainWidth: 4, // E-W
    claspAt: 20, // clasp line: 5 curtains in from the front (x = -20), above the veil (26:33)
    clasps: 50,
    above: 0.01, // sheet sits this far above the board tops, under the goat hair (not in text)
  },
  // Veil (Ex 26:31-33; 36:35-36): hangs under the clasps on gold hooks from 4 gold-overlaid
  // acacia pillars on silver sockets, the pillars on the Holy of Holies (west) side.
  veil: {
    x: -20, // cloth plane (under the linen clasp line)
    pillars: 4, // evenly spaced: one in the middle of each quarter of the 10-cubit width
    pillarRadius: 0.25, // not in text
    pillarOffset: 0.45, // pillar centers west of the cloth; sockets stay behind it (not in text)
    socket: 0.8, // silver socket footprint, 1 cubit high like the boards' (not in text)
    hem: 0.06, // hem above the ground (not in text)
    topGap: 0.06, // cloth top this far under the ceiling (not in text)
  },
  // Coverings (Ex 26:7-14).
  roofSag: 0.22, // coverings dip slightly between the walls (not in text)
  coverEastOverhang: 0.85, // roof coverings reach past the board ends over the pillars
  goatHair: {
    curtains: 11,
    curtainLength: 30, // N-S, across the tent
    curtainWidth: 4, // E-W
    clearance: 0.04, // sits this far above the board tops (over the linen)
    edgeRadius: 0.35, // rounding where the sheet turns down over the roof edge
    flap: 2, // the doubled sixth curtain folds over the front (26:9)
    claspAt: 24, // E-W material position (from the flap hem) of the clasp line: 6 curtains
    clasps: 50, // bronze clasps (26:11)
    // The rest is not in the text. The coverings are pulled out at a slant to rows of bronze
    // stakes (35:18) instead of hanging straight down: hem `reach` cubits out from the board
    // faces at `hem` above the ground. 12 cubits of roof + 2 x ~9.5 of slant ~ the 30-cubit
    // curtains; the side hem stays near "a cubit" above the ground (26:13).
    side: { reach: 4.5, hem: 1.5 }, // north and south
    back: { reach: 2.6, hem: 0.8 }, // west: steeper, the extra half curtain (26:12)
    stakes: { side: 9.5, back: 6 }, // stake rows, cubits out from the board faces
    stakePhase: 0, // N/S stakes at the curtain joins, every curtainWidth from the front
    scallop: 0.6, // hem rises this far (along the cloth) midway between stakes
    belly: 0.18, // the slant sags inward between the roof edge and the hem
    cornerFold: 0.2, // soft folds where the back corners fan round
    frontExtend: 0.65, // side slants reach past the front edge, over the flaps' corners
  },
  // Ram skins dyed red and tachash (26:14): the text gives no sizes. Each lies over the goat
  // hair at `gap` (normal offset), reaches a fraction `reach` of its slant, and has its own stakes.
  ramSkins: { gap: 0.12, reach: 0.64, scallop: 0.45, stakes: { side: 7.75, back: 4.8 }, stakePhase: -1.33, frontDroop: 0.7 },
  tachash: { gap: 0.24, reach: 0.32, scallop: 0.35, stakes: { side: 6.5, back: 3.8 }, stakePhase: 1.33, frontDroop: 0.12 },
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
  hearthDrop: 0.9, // earth fill (ember bed) this far below the rim, under the grate (tradition: filled with earth)
  hornHeight: 1, // horns rise 1 cubit (rabbinic tradition)
  hornBaseRadius: 0.3, // not in text (stout, so the horns read as horns, not spikes)
  hornTipRadius: 0.09, // not in text (blunt, rounded tip)
  hornFoot: 0.22, // lower fraction of the horn that rounds from a square foot (flush with the corner) into the horn (not in text)
  hornOutward: 0.22, // how far the horn tip leans outward along the corner diagonal (not in text)
  // Top grate: a heavy cast bronze grate over the fire inside the rim (not in text; the
  // Ex 27:4 network is the exterior one below the ledge).
  grateDrop: 0.18, // grate top this far below the rim
  grateBar: 0.2, // bar width
  grateDepth: 0.24, // bar depth
  gratePitch: 0.62, // bar spacing (center to center)
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
  waterLevel: 1.8, // water surface height (not in text)
  flutes: 16, // flutes on the stem (not in text)
  handles: 2, // cast ring handles under the rim (not in text)
  lotus: 18, // lotus + bud pairs in the basin's frieze (not in text)
};

// Menorah (Ex 25:31-40; 37:17-24). The text gives no height; rabbinic tradition (Menachot 28b)
// gives 18 handbreadths = 3 cubits and the vertical layout below (in handbreadths, from the
// floor). Placement on the south side of the Holy Place (26:35; 40:24); branches spread E-W.
export const MENORAH = {
  x: -8, // cubits (about 2/5 of the way in from the entrance; not in text)
  z: 2.5, // south of center
  hb: 1 / 6, // handbreadth in cubits
  height: 18, // hb, top of the lamps' seats
  base: 3, // hb: tripod base with its flower
  lowerCup: 5, // hb: the shaft's lowest cup with knob and flower (Menachot 28b)
  branchKnobs: [8.5, 10.5, 12.5], // hb: a knob under each pair of branches (25:35)
  armRadii: [6, 4, 2], // hb: semicircular arms (centered on the shaft), outer to inner
  armCenter: 14.5, // hb: height of the arms' arc centers; arms rise vertically above it
  topCups: 15, // hb: three cups, knob and flower at the top of the shaft and every branch
  shaftRadius: 0.24, // hb (not in text)
  armRadius: 0.2, // hb (not in text)
  colliderRadius: 0.5, // cubits: three circles along the branch span (not in text)
};

// Table of showbread (Ex 25:23-30; 37:10-16; Lev 24:5-9). Only the 2 x 1 x 1.5 cubit size, the
// handbreadth-wide frame, crowns, four rings and poles are in the text; the rest is
// reconstruction. North side of the Holy Place, opposite the menorah (26:35; 40:22).
export const SHOWBREAD = {
  x: -8, // cubits (about 2/5 of the way in from the entrance; not in text)
  z: -2.5, // north of center
  length: 2, // E-W
  width: 1, // N-S
  height: 1.5, // top of the slab (the crown rises above it)
  hb: 1 / 6, // handbreadth in cubits: the frame (rim) is 1 handbreadth wide
  topThickness: 0.08, // gold-overlaid slab (not in text)
  frameThickness: 0.04, // frame wall thickness (not in text)
  frameInset: 0.035, // frame's outer face sits this far inside the slab's edge (not in text)
  legSize: 0.12, // square legs (not in text)
  crownWidth: 0.05, // zer: gold molding around the top's edge (not in text)
  crownHeight: 0.07, // rises above the slab (not in text)
  frameCrownSize: 0.03, // the frame's own crown, a bead along its lower edge (not in text)
  ringRadius: 0.07, // gold rings at the legs, level with the frame (not in text)
  ringTube: 0.018, // not in text
  poleRadius: 0.042, // acacia poles overlaid with gold (not in text)
  poleOverhang: 0.55, // poles reach this far past the table's ends (not in text)
  // Loaves: 12 in two stacks of six (Lev 24:6), a gold cup of frankincense on each (24:7).
  loaf: { length: 0.78, width: 0.6, thickness: 0.075 }, // flat loaves (not in text)
  utensilsX: 0.3, // floor utensils' center, from the table's center (cubits, not in text)
  utensilsZ: -1.35, // toward the north wall (not in text)
};

// Altar of incense (Ex 30:1-10; 37:25-28): 1 x 1 x 2 cubits, horns of one piece with it, a crown
// around the top, two rings under the crown on each of two opposite sides, two poles. Placed
// before the veil (30:6; 40:26). Horn size, crown and plinth are reconstruction.
export const INCENSE_ALTAR = {
  x: -18.5, // cubits: centered just east of the veil (x = -20), 1 cubit clear of it (not in text)
  z: 0,
  size: 1, // square footprint
  height: 2,
  hornHeight: 0.45, // not in text (rabbinic tradition has them smaller than the bronze altar's)
  hornBaseRadius: 0.075, // not in text
  hornTipRadius: 0.025, // not in text
  hornOutward: 0.05, // not in text
  crownWidth: 0.07, // the crown (zer) projects this far outward from the sides (not in text)
  crownHeight: 0.1, // not in text
  crownLip: 0.035, // raised lip of the crown above the top (not in text)
  plinth: 0.04, // footing that projects from the sides (not in text)
  plinthHeight: 0.08, // not in text
  ringRadius: 0.07, // two rings per N and S side, under the crown (not in text)
  ringTube: 0.018, // not in text
  ringSpacing: 0.3, // rings at +/- this far from the side's center (not in text)
  ringDrop: 0.2, // ring center below the top (not in text)
  poleRadius: 0.042, // not in text
  poleOverhang: 0.55, // not in text
  panRadius: 0.27, // gold firepan holding the coals (not in text)
};

// Ark and mercy seat (Ex 25:10-22; 37:1-9). The 2.5 x 1.5 x 1.5 cubit chest, the crown, the
// four rings on its feet, the poles that stay in the rings and the 2.5 x 1.5 cubit mercy seat
// with two cherubim of one piece with it are in the text; the rest is reconstruction. Centered
// in the Holy of Holies (26:34), long axis N-S, poles E-W with their ends toward the veil
// (1 Kgs 8:8).
export const ARK = {
  x: -25,
  z: 0,
  length: 2.5, // N-S
  width: 1.5, // E-W
  height: 1.5, // top rim of the chest, feet included (not specified in the text)
  hb: 1 / 6, // handbreadth in cubits
  mercySeat: 1, // hb: thickness of the kapporet (rabbinic tradition, Sukkah 5a)
  footHeight: 0.14, // short square feet at the corners (not in text)
  footSize: 0.24, // not in text
  crownWidth: 0.07, // the crown (zer) projects this far from the sides (not in text)
  crownBelow: 0.12, // the crown reaches this far below the rim (not in text)
  crownLip: 0.04, // and stands this far above the mercy seat (not in text)
  ringRadius: 0.1, // gold rings on the feet (not in text)
  ringTube: 0.024, // not in text
  ringHeight: 0.26, // ring centers above the floor (not in text)
  ringInset: 0.2, // ring centers in from the E and W faces (not in text)
  poleRadius: 0.065, // acacia overlaid with gold (not in text)
  poleEast: 3.4, // pole ends, east and west of the ark's center: ends stay clear of the veil
  poleWest: 3.4, //   pillars at x = -20.45 (not in text)
  cherubHeight: 10, // hb: cherubim to the wing tips above the mercy seat (Sukkah 5b)
  cherubKnees: 2.9, // hb in from each end of the mercy seat to the figures' knees (not in text)
};

// Non-biblical: human / player values, in meters.
export const PLAYER = {
  eyeHeight: 1.6,
  radius: 0.3,
  walkSpeed: 1.4,
  runSpeed: 3.5,
  // Mouse look: PointerLockControls pointerSpeed (1 = three.js default, a bit fast).
  lookSpeed: 0.7,
  // Subtle head bob while walking: vertical amplitude (m) and steps per metre.
  bobAmplitude: 0.025,
  bobStride: 0.8,
};

// Torches (artistic license, not in the text): wooden posts with pitch-soaked wrapped heads.
// Positions in cubits; `light: false` = flames and glow only (keeps point lights <= 10).
export const TORCHES = {
  postHeight: 2.4, // meters (not in text)
  list: [
    // Flanking the approach path outside the gate, nearest the spawn.
    { x: 59, z: -7, light: true },
    { x: 59, z: 7, light: true },
    // Inside, near the east corners (clear of the gate-altar-tent axis).
    { x: 40, z: -21, light: true },
    { x: 40, z: 21, light: true },
    // Outside the west corners: glow only.
    { x: -54, z: -28, light: false },
    { x: -54, z: 28, light: false },
  ],
};

// Pillar of fire over the tent by night (Num 9:15-16). The text gives no size: everything here
// except its position is artistic license, in METERS. Centered over the Holy of Holies.
export const PILLAR_OF_FIRE = {
  x: -25, // cubits (middle of the Holy of Holies)
  z: 0, // cubits
  baseY: 8.5, // m, ~4 m above the roof coverings' top (~4.45-4.6 m): the fire hangs in the sky
  columnHeight: 24, // m, the fire itself, fading and slowly narrowing into the shaft
  columnRadius: 1.25, // m, Gaussian radius of the fire's density (tapers to a point at its foot)
  shaftHeight: 150, // m, the yellowish light above the fire, fading gradually into the sky
  shaftRadius: 0.55, // m at its foot, widening upward
  shaftSpread: 0.006, // radius gained per meter of height
  light: { color: 0xffb35a, intensity: 90, decay: 1.6, y: 5 }, // cd; y: m above baseY (~13.5 m, in the fire's body); no shadow
};
