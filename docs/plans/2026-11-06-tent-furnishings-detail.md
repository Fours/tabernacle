# Plan: Ornament, wear and hem rings for the tent and its furnishings

**Status:** active
**Goal:** The table of showbread and the altar of incense carry gold floral relief in the same
style as the ark's ornament, and their gold looks handled and used: tarnish, dirt and grime
where hands, bread, coals and resin have been, the way the bronze altar looks "lived-in". The
mercy seat has a dark red stain of sprinkled blood in its centre, with small drops spattered
around it. Every place a cord ties a covering to its stake has a silver ring set in the hem,
with the cord passing through it.

**In scope:**
- Floral relief on the table of showbread (`scene/showbread.js`) and the altar of incense
  (`scene/incenseAltar.js`), sharing helpers with `scene/arkOrnament.js`.
- Worn gold (tarnish, grime, smudges, soot/resin) on both, on their own material copies.
- A blood stain and spatter on the mercy seat (`scene/ark.js`).
- Silver rings at all 67 cord tie points of the goat hair, ram skin and tachash coverings
  (`scene/tentCoverings.js`).

**Out of scope:** the menorah, ark body ornament and cherubim (unchanged apart from the mercy
seat stain); the table's utensils and loaves; the bronze altar; the courtyard's pegs and cords;
the linen ceiling's loops (Ex 26:4); new lights.

**Assumptions** (move each to `docs/DECISIONS.md` when its step lands):
- **Ornament is reconstruction, at the user's direction.** The text gives the table a crown and
  a frame with a crown (Ex 25:24–25) and the incense altar a crown (Ex 30:3); nothing about
  floral relief. Use the ark ornament's vocabulary (plant motifs only, no figures: palmettes,
  rosettes, almond leaves, bead-and-reel, running scroll) so the three gold furnishings read as
  one workshop's work, but give each its own layout. Keep the overall sizes, ring and pole
  positions, and the table's crown heights unchanged.
- **Shared ornament helpers:** the leaf, stem, bead rod, bead ring, lobed plate, running
  scroll, sweep and face-matrix helpers move out of `arkOrnament.js` into a new
  `scene/ornament.js`, used by all three. The ark must look identical afterwards.
- **Worn gold:** each furnishing gets its own `GOLD.clone()` with `addGoldPatina` re-applied
  (clone() doesn't copy the patch; see `ark.js` around line 311) and extra wear: darker grime
  in crevices and recesses of the relief, smudged and dulled spots where hands lift the poles
  and handle the vessels, dust on horizontal tops. Table: crumbs and faint flour/bread dust
  on the top round the stacks. Incense altar: soot and resin darkening on the top round the
  firepan and on the inner faces of the crown and horns, fading down the sides. Keep it
  subtle enough that it still reads as gold under the menorah's light. Wear is a shader patch
  (like `metalWear.js`), not new geometry or textures that cost draws.
- **Mercy seat stain:** read as the blood of the Day of Atonement, sprinkled by the high
  priest (Lev 16:14–15). The text has it sprinkled "upon the mercy seat eastward, and before
  the mercy seat seven times"; placing it in the centre of the lid is at the user's direction.
  Dark, dried red-brown (not bright paint red), slightly glossier than the gold where thick,
  a main splotch ~20–25 cm across in the middle of the lid between the cherubim's knees, with
  irregular edges, and 15–30 smaller drops and a few elongated flecks round it (more toward
  the east, the side it was sprinkled from). Done as a mask in the ark's own gold material
  (procedural or a small canvas texture projected from above, limited to up-facing surfaces
  at the seat's height), so it adds no draw call and stays off the cherubim and frieze.
- **Hem rings:** the text doesn't describe how the cords attach to the coverings
  (Ex 35:18; 38:20); the silver ring is reconstruction at the user's direction. At each of the
  67 tie points: a silver ring (~4–5 cm outer diameter, ~6 mm wire) set into the hem through
  a small reinforcing patch of doubled cloth (or a leather tab on the skins) sewn to the hem,
  lying in the cloth's plane. The cord loops through the ring (a short loop and a wrapped
  knot) and then runs on to the stake as now. Rings merge into one silver mesh (`SILVER` with
  `addSilverWear`, +1 draw at most); patches merge into the existing covering or rope meshes
  where possible. The cord's end point moves to the ring so nothing floats.
- **Budgets:** draw calls within the baseline in `docs/DECISIONS.md` (78–122), +1 for the hem
  rings only; frame time no more than ~0.3 ms above the same session's measurement before the
  step at the step's presets. Each furnishing's added relief stays under ~150k triangles and
  ~30 ms of build time.

## Steps

- [x] **Step 1: Floral relief on the table of showbread** — model: Opus / effort: medium
  **Goal:** Move the reusable geometry helpers from `arkOrnament.js` into a new
  `scene/ornament.js` (ark unchanged). Then build a `showbreadOrnament.js` (or a section of
  `showbread.js` if it stays well under 1000 lines) with gold relief merged into the table's
  gold mesh: the frame (the handbreadth band between the legs) gets a running scroll of
  almond leaves and rosettes with beaded edges; the top's crown gets a profiled molding with
  bead-and-reel and leaf tips like the ark's crown, scaled to the table; the legs get leaf-
  wrapped collars at the frame and near the foot, flutes or a vine on each face, and leaf-
  wrapped feet; scalloped rosette plates behind the rings. Keep one gold mesh, keep the
  loaves, cups, utensils, rings and poles where they are.
  **Files:** `src/scene/arkOrnament.js`, new `src/scene/ornament.js`, `src/scene/showbread.js`,
  maybe new `src/scene/showbreadOrnament.js`, `src/config/dimensions.js` (SHOWBREAD),
  `docs/DECISIONS.md`.
  **Spec:** AGENTS.md conventions (merged geometry, 1000-line limit), SPEC.md table of
  showbread, DECISIONS.md "Interior furnishings" (table, ark ornament).
  **Accept when:** `?view=table` and `?view=holyplace` (night lighting, and once with
  `?light=work`) show readable floral relief on the frame, crown and legs at a glance and in
  close-up, matching the ark's style; `?view=ark` looks the same as before the refactor
  (compare screenshots); the table's gold is still one draw; added triangles and build time
  within budget (log them); lint, build, clean console; frame time at `table` and
  `holyplace` within budget.
  **Carry-over notes:**

- [x] **Step 2: Worn, handled gold on the table** — model: Opus / effort: medium
  **Goal:** Give the table its own gold material with a stronger patina and a wear patch:
  grime collecting in the new relief's recesses and the frame's inner corners (from AO-like
  cues: crevice/curvature, or local-space masks from the table's dimensions), dulled and
  smudged gold where hands carry the poles and grip the top's edges, a fine dust and crumb/
  flour haze on the top round the two stacks, slight darkening toward the feet. Make the
  helper reusable for Step 4 (e.g. `addGoldWear(mat, opts)` in `metalWear.js`). Keep it
  covered by the interior mask and the gold room's reflection probe (re-capture if needed).
  **Files:** `src/scene/showbread.js`, `src/scene/metalWear.js`, `src/scene/materials.js`
  (read: `addGoldPatina`, `GOLD`), `src/scene/ark.js` (the clone pattern),
  `src/scene/interiorLight.js` (read), `docs/DECISIONS.md`.
  **Spec:** AGENTS.md "Interior mask", "Three.js r187 gotchas"; DECISIONS.md "Interior
  furnishings" and the bronze altar's wear under "Bronze altar & laver".
  **Accept when:** at `?view=table` the gold reads as old and handled: visible grime in the
  relief and corners, dull spots on the handling areas, dust on the top, but still clearly
  gold; side-by-side screenshots before and after; the other gold (ark, menorah, incense
  altar, boards) is unchanged; no non-runnable programs; lint, build, clean console; no new
  draws; frame time at `table` within budget.
  **Carry-over notes:** Step 1 put the relief in `src/scene/showbreadOrnament.js` (84.6k tris,
  one gold mesh with the table). At night it reads only subtly; grime collecting in the relief's
  recesses (darker gold between leaves, stems and beads) should help it read. The long sides'
  frame band sits at pole height, so the poles hide much of it at eye height. Free camera: set
  `rig.controls.target` and `camera.position`, then `controls.update()`.

- [x] **Step 3: Floral relief on the altar of incense** — model: Opus / effort: medium
  **Goal:** Using `scene/ornament.js`, add gold relief to the incense altar, merged into its
  gold mesh: framed recessed panels on all four sides (a central rosette or palmette with
  almond-leaf vines, related to but distinct from the ark and table), a profiled crown with
  bead-and-reel and leaf tips, leaf-wrapped bases on the horns, a molded plinth with a leaf
  band, and scalloped rosette plates behind the rings. Keep the size, horns, rings, poles,
  firepan, coals and smoke where they are.
  **Files:** `src/scene/incenseAltar.js`, `src/scene/ornament.js`, maybe new
  `src/scene/incenseOrnament.js`, `src/config/dimensions.js` (INCENSE_ALTAR),
  `docs/DECISIONS.md`.
  **Spec:** SPEC.md altar of incense; DECISIONS.md "Interior furnishings" (altar of incense,
  ark ornament).
  **Accept when:** `?view=incense`, `?view=smoke` and `?view=veil` (night, and once with
  `?light=work`) show readable relief in the shared style; the smoke still rises from the
  firepan unobstructed; still one gold draw; triangles and build time within budget; lint,
  build, clean console; frame time at `incense` within budget.
  **Carry-over notes:**

- [x] **Step 4: Worn, sooted gold on the altar of incense** — model: Sonnet / effort: high
  **Goal:** Apply the Step 2 wear helper to the incense altar's own gold copy, tuned for an
  altar burned on twice a day (Ex 30:7–8): soot and resin darkening on the top round the
  firepan and up the inner faces of the crown and horns, fading in streaks down the sides;
  grime in the panel recesses; dulled spots where the poles are carried; a little ash dust on
  the top.
  **Files:** `src/scene/incenseAltar.js`, `src/scene/metalWear.js`, `docs/DECISIONS.md`.
  **Spec:** as Step 2.
  **Accept when:** at `?view=incense` and `?view=smoke` the altar reads as used (soot near the
  coals, grime in the relief) but still gold; before/after screenshots; other gold
  unchanged; no non-runnable programs; lint, build, clean console; no new draws; frame time
  at `incense` within budget.
  **Carry-over notes:** `addGoldWear(mat, opts)` (metalWear.js) takes local-space masks in
  meters: `boxes` (ground = grime on the relief's background, contact = inner corners), `crevice`,
  `handling` capsules, `dust` on up-facing surfaces, `low`, and `soot {center, radius, height,
  strength, color}` (compiled but not yet tuned visually). Step 3 exports `incenseGroundBoxes(d)` from
  incenseOrnament.js → `{ body, crownBand, plinthBand }` ({min, max}, altar-local m) for the
  `boxes` option; `d` is `ORN` in incenseAltar.js (not exported; call from inside). Panel frames
  stand 5 mm proud, so a 3 mm ground band darkens only the field.
  Original note: Follow `tableGold()` in showbread.js
  (GOLD.clone + addGoldPatina re-applied, disposed in userData.dispose). Lower metalness where
  matter (soot, ash, dust) should read as matter, or the interior mask recolours it to gold.

- [x] **Step 5: Blood on the mercy seat** — model: Opus / effort: medium
  **Goal:** Add the stain described in the assumptions to the ark's own gold material: a
  dark, dried red-brown splotch in the centre of the mercy seat between the cherubim, with
  irregular edges and slight thickness gloss, plus 15–30 small drops and elongated flecks
  round it, more on the east side. A mask limited to up-facing surfaces at the seat's height
  inside the seat's footprint, so it doesn't touch the cherubim, the frieze or the crown.
  Add a preset `mercyseat` (close, above the lid from the east, looking down between the
  cherubim) to `devCamera.js` and AGENTS.md.
  **Files:** `src/scene/ark.js`, `src/scene/arkOrnament.js` (read: frieze layout),
  `src/camera/devCamera.js`, `AGENTS.md`, `docs/DECISIONS.md` (record under "Interpretation
  of the text" and "Interior furnishings").
  **Spec:** Lev 16:14–15; DECISIONS.md "Interior furnishings" (ark, ark ornament).
  **Accept when:** `?view=mercyseat`, `?view=ark` and `?view=holyofholies` show the stain as
  dark dried blood (not bright paint), centred on the lid, with scattered drops; no stain on
  the cherubim or ornament; no new draws; no non-runnable programs; lint, build, clean
  console; frame time at `holyofholies` within budget.
  **Carry-over notes:**

- [ ] **Step 6: Silver rings at the coverings' tie points** — model: Opus / effort: medium
  **Goal:** At each of the 67 cord tie points on the goat hair, ram skin and tachash hems
  (including the diagonal front-end cords), add a reinforcing patch on the hem, a silver ring
  set through it in the cloth's plane, and the cord looped through the ring with a small knot
  before running to its stake. Move each cord's start to the ring. Rings merge into one
  silver mesh; patches and loops into existing meshes. Add a preset `hemtie` (eye height,
  ~1.5 m from a goat-hair tie point on the north side, with a second layer's tie in view)
  to `devCamera.js` and AGENTS.md.
  **Files:** `src/scene/tentCoverings.js`, `src/scene/tabernacle.js` (meshes it builds from
  `bronzeParts`/`ropeParts`), `src/scene/materials.js` (read: `SILVER`),
  `src/scene/metalWear.js` (read: `addSilverWear`), `src/camera/devCamera.js`, `AGENTS.md`,
  `docs/DECISIONS.md`.
  **Spec:** Ex 35:18; 38:20; DECISIONS.md "Tabernacle tent" (slanted coverings, stakes and
  cords).
  **Accept when:** `?view=hemtie` shows each ring sitting in the hem with the cord through
  it and no gaps or floating parts; `?view=coverings` and `?view=coveringsw` show the rings
  as small silver glints along all three hems; wind on the hems doesn't separate ring and
  cloth visibly (check two `uWindTime` values); draws +1 at most at `tent`, `coverings`,
  `gate`; lint, build, clean console; frame time at `tent` within budget.
  **Carry-over notes:**
