# Plan: Open gates, richer embroidery, altar grate and pillar of fire

**Status:** active
**Goal:** The Holy Place has reflective gold walls, a clearer glint on the ark and fuller incense
smoke. The sky has no oversized stars or moon. The courtyard gate and the tent door carry rich
floral/garden embroidery and both stand open, their screens drawn back so the player walks
straight in. The bronze altar's fire burns up through a bronze grate, with horns molded as one
piece with the top. A pillar of fire rises above the Holy of Holies, with a long shaft of
yellowish light fading into the night.

**In scope:**
- Interior finish (reflections, ark glint, incense smoke).
- Star and moon size.
- New floral/garden embroidery on the gate screen and the tent door screen.
- Opened gate (middle pillar removed) and opened tent door (5 entrance pillars removed).
- Altar top grate and molded horns.
- Pillar of fire with a light shaft, lighting the scene.

**Out of scope:** the cloud by day; changes to the veil or ceiling weave; new interior objects;
sound; daytime.

**Assumptions** (move each to `docs/DECISIONS.md` when its step lands):
- **Departures from the text, at the user's direction:** Ex 27:16 gives the gate 4 pillars
  (this build has a post at z = 0) and Ex 26:37 gives the tent door 5 pillars. Removing them
  is artistic license so the player can walk in. Record both under "Interpretation of the text".
- **Reflections:** a static reflection probe (cube camera) captured once at load from the
  middle of the Holy Place, with the interior shown, and applied only to gold inside the tent
  through `interiorLight.js`. No per-frame cost. Re-capture only if needed after a change.
- **Ark glint:** clearer gold highlights on the ark and cherubim without lighting the Holy of
  Holies walls (for example a glint term only on the ark's material, or the probe). No new light.
- **Moon:** the "way too big star" is most likely the moon. Make it smaller so it no longer
  reads as an oversized star; keep the moon light's direction. Also cap the largest star layer.
- **Gate embroidery and tent door embroidery** (Ex 26:36; 27:16, "the work of an embroiderer"
  in blue, purple, scarlet and fine linen): rich floral/garden motifs — vines, leaves, palm and
  almond trees, pomegranates, lilies/rosettes — in the same four colours, period-appropriate
  (ancient Near Eastern), no figures. This replaces the "geometric only" decision. The two
  screens get related but distinct designs.
- **Gate opening:** the 2 middle panels (z = −5 … +5 cubits) are drawn apart and gathered,
  tied back to the posts at z = ±5. The silver fillet spans the 10-cubit opening between their
  capitals. The outer gate panels (±5 … ±10) stay hanging. The `walk` spawn moves to z = 0.
- **Tent door:** a gold-overlaid acacia beam spans the top of the opening (between the corner
  boards). The screen is split in the middle, gathered and tied back to the corner boards on
  each side. The beam is the only new support.
- **Altar grate:** a bronze grate at the top of the altar, where the visible firewood is now.
  The fire rises through it; the wood/coals below are not rendered (a glow under the grate
  is fine). The existing exterior bronze network under the ledge (Ex 27:4–5) stays.
- **Horns** become part of the altar top's mesh, blended into the rim with molded transitions
  (not separate pieces sitting on top). Keep them out of shadow casting if they still throw
  wedge shadows.
- **Pillar of fire** (Num 9:15–16): centered above the Holy of Holies (x = −25, z = 0 cubits),
  its base just above the roof. Fire column about 10 m tall, then a longer shaft of yellowish
  light (~40–60 m) fading upward into the sky. It adds one warm non-shadow point light (12 in
  total), classed as outside by the interior mask. Animated, emissive, additive; bloom picks it
  up.
- **Budgets:** frame time no more than ~0.5 ms above `gate` measured in the same session,
  except Step 7 (up to ~1 ms); draw calls within the baseline in DECISIONS.md (72–103) plus 5.

## Steps

- [x] **Step 1: Interior finish** — model: Opus / effort: medium
  **Goal:**
  - Reflective gold walls: a static cube-camera reflection probe captured at load from the
    middle of the Holy Place (interior shown, after the scene is assembled), fed into the gold
    treatment in `interiorLight.js` so the walls and furnishings show soft reflections of the
    lamps, veil and ceiling. Keep roughness so it reads as burnished gold, not a mirror.
  - Clearer gold glint on the ark and cherubim in `holyofholies` without lighting the west wall.
  - Fuller incense smoke: a wider, softer, slowly spreading plume instead of a narrow column,
    still faint and no new light.
  **Files:** `src/scene/interiorLight.js`, `src/main.js`, `src/scene/ark.js`,
  `src/scene/fire.js` (`createIncenseSmoke`), `src/scene/incenseAltar.js`.
  **Spec:** DECISIONS.md "Fire & lighting" (interior mask, indoor metals), "Interior furnishings".
  **Accept when:** `holyplace`, `menorah`, `table` show visible reflections in the gold;
  `holyofholies` shows a clear but dim gold glint on the ark/cherubim with the walls still
  dark; `incense` shows a fuller plume; exterior views unchanged. Build passes, console clean,
  no unrunnable shaders, budgets met (report probe capture time at load).
  **Carry-over notes:**

- [ ] **Step 2: Smaller stars and moon** — model: Sonnet / effort: medium
  **Goal:** Reduce the size of the largest stars (the `rBase`/gain of the biggest star layers
  in `sky.js`) and shrink the moon disc so nothing in the sky reads as an oversized star. Keep
  the overall star density, twinkle and Milky Way.
  **Files:** `src/scene/sky.js`.
  **Spec:** DECISIONS.md "Rendering" (sky dome entry).
  **Accept when:** `sky`, `gate`, `tent` show no star or moon disproportionately large; the
  sky still reads as a rich star field. Build passes, console clean, budgets met.
  **Carry-over notes:**

- [ ] **Step 3: Floral/garden embroidery on gate and tent door** — model: Opus / effort: medium
  **Goal:** New procedural embroidery for both the courtyard gate screen and the tent entrance
  screen: ornate garden motifs (vines, leaves, palm and almond trees, pomegranates, lilies,
  rosettes, borders) in blue, purple, scarlet and white linen, reading as needlework
  (stitch texture) and ancient Near Eastern in style; no figures. Distinct but related designs
  for the two screens. Steps 4 and 6 will gather these screens into folds, so motifs should
  survive being bunched (no single central medallion that becomes meaningless when split).
  **Files:** `src/scene/textiles.js` (`createEmbroideredScreenTexture` and the tent screen
  texture), `src/scene/courtyard.js` and `src/scene/tabernacle.js` (material setup only).
  **Spec:** SPEC.md "Courtyard", "Tabernacle tent"; DECISIONS.md "Courtyard" (gate embroidery
  entry — to be replaced), "Rendering".
  **Accept when:** `gate` and `tent` at night (and with `?light=work`) show rich floral
  embroidery that reads at walking distance and in close-up; the textures don't shimmer or
  alias. Build passes, console clean, budgets met.
  **Carry-over notes:**

- [ ] **Step 4: Open the courtyard gate** — model: Opus / effort: medium
  **Goal:** Remove the middle gate post at z = 0 (with its socket, capital, hook, peg and cord).
  Draw the two middle panels (z = −5 … +5 cubits) apart: each is gathered into realistic
  hanging folds and tied back to the post at z = ±5, so the 10-cubit opening is clear. The
  silver fillet spans the opening. Outer gate panels stay as they are. Update colliders (open
  gap; gathered cloth may collide), and move the `walk` spawn to z = 0 so the player starts
  looking straight into the courtyard. Keep the Step 3 embroidery mapped sensibly on the
  gathered cloth.
  **Files:** `src/scene/courtyard.js`, `src/config/dimensions.js`, `src/camera/devCamera.js`
  (`walk`, `gate` presets), `src/camera/firstPerson.js` (spawn only if it lives there),
  `src/scene/textiles.js` (read only).
  **Spec:** SPEC.md "Courtyard"; DECISIONS.md "Courtyard", "Camera & controls" (spawn).
  **Accept when:** `gate` shows an open gate with the altar visible through it and convincing
  tied-back drapes; `walk` (first person) spawns at z = 0 and `rig.simulate({f:true}, 6)` walks
  straight through the gate without hitting anything; `corner` and `iso` look right. Build
  passes, console clean, budgets met.
  **Carry-over notes:**

- [ ] **Step 5: Altar grate and molded horns** — model: Opus / effort: medium
  **Goal:** Replace the visible firewood on top of the altar with a bronze grate (heavy bronze
  bars in a lattice) at the top of the altar. The fire (`altarFire.js`) burns up through the
  grate; the wood beneath isn't rendered (a hot glow showing through the gaps is fine). Rebuild
  the horns so they read as one molded piece with the top of the altar: horns rise out of the
  rim corners with smooth, cast-looking transitions, one merged mesh with the top. Keep the
  exterior network, ledge, rings and poles. Keep `altar.userData.hearth` meaningful for the fire.
  **Files:** `src/scene/altar.js`, `src/scene/altarFire.js`, `src/scene/firewood.js`,
  `src/scene/bronzeParts.js`, `src/scene/materials.js`, `src/config/dimensions.js`.
  **Spec:** SPEC.md "Bronze altar"; DECISIONS.md "Bronze altar & laver", "Fire & lighting"
  (altar fire, shadow caster).
  **Accept when:** `altar`, `altartop`, `fire` show the grate with flames rising through it, no
  firewood visible, and horns clearly molded into the top; the shadow-casting light still looks
  right (no new leaks or wedge shadows). Build passes, console clean, budgets met.
  **Carry-over notes:**

- [ ] **Step 6: Open the tent door** — model: Opus / effort: medium
  **Goal:** Remove the 5 entrance pillars (and their sockets, capitals and hooks). Add a
  gold-overlaid acacia beam across the top of the opening between the corner boards. Hang the
  Step 3 screen from it, split in the middle, gathered into realistic folds and tied back to the
  corner boards on each side, so the full opening is clear. Update colliders (pillar boxes
  removed; gathered cloth may collide) and the interior mask if the entrance spill region
  needs adjusting (a faint warm altar-light spill through the open door is acceptable).
  Check `updateInteriorVisibility` still behaves at the threshold.
  **Files:** `src/scene/tabernacle.js`, `src/scene/tentCoverings.js` (front edge only),
  `src/scene/interiorLight.js`, `src/config/dimensions.js`, `src/main.js`,
  `src/camera/devCamera.js`.
  **Spec:** SPEC.md "Tabernacle tent"; DECISIONS.md "Tabernacle tent", "Fire & lighting"
  (interior mask), "Camera & controls" (entrance colliders).
  **Accept when:** `tent` shows an open door with tied-back drapes and the lit Holy Place
  visible inside; `holyplace` looks right; `rig.simulate` from `walk` walks through the gate and
  straight into the Holy Place on z = 0 up to the incense altar. Build passes, console clean,
  budgets met.
  **Carry-over notes:**

- [ ] **Step 7: Pillar of fire** — model: Opus / effort: medium
  **Goal:** New `src/scene/pillarOfFire.js`: a column of fire about 10 m tall centered above the
  Holy of Holies (x = −25, z = 0 cubits), its base just above the roof, then a longer shaft of
  yellowish light (~40–60 m) that fades upward into the night sky. Animated, emissive, additive,
  turbulent but majestic (not a campfire); reuse `fire.js` shader pieces where they fit. One
  warm non-shadow point light (12 total; update AGENTS.md's light budget) that lights the roof
  and courtyard softly; check the interior mask classes it as outside. Consider fog: the shaft
  should still be visible from the courtyard. Add a `firepillar` preset (wide view from the
  courtyard showing the tent and the full column).
  **Files:** new `src/scene/pillarOfFire.js`; `src/scene/fire.js`, `src/scene/interiorLight.js`,
  `src/render/postfx.js` (read; bloom), `src/main.js`, `src/config/dimensions.js`,
  `src/camera/devCamera.js`, `AGENTS.md`.
  **Spec:** Num 9:15–16 (cloud by day, fire by night over the Tabernacle); DECISIONS.md
  "Fire & lighting", "Rendering".
  **Accept when:** `firepillar`, `gate`, `tent` and `sky` show the pillar and its light shaft
  fading into the stars, the roof softly lit, no banding or black squares from bloom;
  `holyplace` is unchanged. Build passes, console clean, no unrunnable shaders, frame time
  within ~1 ms of the pre-step `gate`, draws within budget. Update the performance baseline.
  **Carry-over notes:**
