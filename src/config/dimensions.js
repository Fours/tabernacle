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
  pillarHeight: 5, // not in text (AGENTS.md default)
  gateWidth: 20, // centered on east side
  gatePillars: 4,
  sideHangingWidth: 15, // each side of the gate, east side
  sideHangingPillars: 3,
  hangingThickness: 0.1, // blockout panel thickness (not in text)
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

// Bronze altar (Ex 27:1-8; 38:1-7)
export const ALTAR = {
  length: 5,
  width: 5,
  height: 3,
  x: 25,
  z: 0,
  hornSize: 0.5, // not in text (blockout)
};

// Laver (optional; no dimensions in text — placeholder values)
export const LAVER = {
  x: 10,
  z: 3,
  radius: 1,
  height: 2,
};

// Non-biblical: human / player values, in meters.
export const PLAYER = {
  eyeHeight: 1.6,
  radius: 0.3,
  walkSpeed: 1.4,
  runSpeed: 3.5,
};
