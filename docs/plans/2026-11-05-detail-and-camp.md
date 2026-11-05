# Plan: Detail pass and the camp of Israel

**Status:** active
**Goal:** The laver, menorah, ark, showbread and incense smoke look richer and more real; the
gold furnishings carry a subtle patina of use. The tent's four coverings are rebuilt as stepped,
staked layers: the goat hair hides the linen as in the text, and the ram skins and tachash step
in above it, each layer staked and roped to the ground. Rocks and low Middle-Eastern scrub dot the ground,
and the camp of Israel — thousands of cheap, unlit tents in the four tribal camps of Numbers 2 —
stretches away into the dark.

**In scope:**
- Laver detail and finish.
- Coverings overhaul (four layers, three visible outside, each staked; wider N–S footprint).
- Gold grime/patina on all gold items, ark included.
- Menorah ornament (leaves, calyxes, flowers) and overall finish.
- Ark: ornate lid and body (cherubim keep their size).
- Showbread realism.
- Incense smoke realism.
- Rocks and ground vegetation.
- The camp: 3 tent variants, thousands of instances, no lights.

**Out of scope:** people or animals in the camp; campfires or any new lights; daytime; changes
to the courtyard hangings, altar, veil or ceiling weave; sound.

**Assumptions** (move each to `docs/DECISIONS.md` when its step lands):
- **Four coverings (user's choice, following Ex 26):** linen, goat hair, ram skins, tachash,
  from bottom to top. The goat hair is longer than the linen and hides it completely outside
  (the linen shows only as the ceiling inside). Above the goat hair each layer reaches less far
  than the one below, so the goat hair's edge shows beneath the ram skins and the ram skins'
  edge beneath the tachash: three visible stepped layers outside.
- **Covering shape:** instead of hanging straight down the walls, the coverings on the N and S
  sides are pulled out at a slant (tent-like) to bronze stakes, extending further N–S than the
  walls; the west side gets the same treatment, shorter. The east (door) side keeps the
  open-door arrangement. Lower layers are staked further out. Each visible layer has its own row of bronze
  stakes (the hidden linen has none) and cords (Ex 35:18, 38:20 "pins of the tabernacle"). The furthest stakes stay
  well inside the courtyard hangings (≥ ~3 cubits clear of the pillar line at z = ±25).
- **Gold grime:** a shader patch on the shared gold materials (`GOLD`, `GOLD_OVERLAY` and any
  gold used inside the tent): low-frequency world-space tarnish, darker and rougher in recesses
  and on lower surfaces, faint smudges; peak shine and reflections stay. No new textures per
  object, no extra draws.
- **Menorah ornament:** Ex 25:33–34 gives cups, knobs (kaftor) and flowers (perach). Leaves
  are added at the user's direction: small almond leaves under each knop and calyx, petals on
  each flower, finer beading. Layout, height and lamp positions (DECISIONS) stay.
- **Ark (at the user's direction):** the cherubim stay as they are (10 handbreadths, Sukkah
  5b). The lid gets an ornate
  border (leaf/palmette and rosette frieze inside the crown); the body gets framed panels with
  leaf scrollwork and rosettes, in the spirit of film-prop arks, but ancient Near Eastern in
  motif, no figures besides the cherubim. Dimensions, rings and poles stay. The ornament is
  reconstruction (the text gives only the crown, Ex 25:11).
- **Showbread:** loaves stay flat and stacked as decided; they get irregular shapes, a
  procedural crust texture with bump, lighter flour dusting, scorch/burn patches and edge
  char. No new draw calls beyond the current loaves mesh.
- **Incense smoke:** a thin laminar thread rising from the coals that curls, twists and breaks
  into wispy ribbons higher up, then fades — closer to real incense than the current puffs.
  Stays one draw, no light.
- **Rocks and vegetation:** "the wilderness of Sinai" read as steppe, not dunes: clumps of
  small flint/limestone rocks (a few cm up to ~25 cm) and low scrub — dry grass tufts, single
  blades, small round shrubs (e.g. white broom/retem, wormwood-like grey-green bushes). Placed
  in random clumps by seeded noise across the whole ground. Nothing inside the courtyard except
  a few small stones near the hangings (the court is trodden). No colliders. Instanced; LOD by
  distance so the far field stays cheap.
- **Camp layout (user's choices):** Numbers 2 — Judah's camp east, Reuben's south, Ephraim's
  west, Dan's north, each a large block of tents with open lanes between camps; the Levites
  (Num 3:23–38) in an inner ring: Moses/Aaron/priests east, Gershon west, Kohath south, Merari
  north. The nearest tents start ~10 m outside the courtyard hangings, and the camp fills the
  ground out to its edge (~300 m), fading into the fog. The east approach to the gate stays
  open as a lane.
- **Tents:** 3 variants — a small low ridge tent, a medium black goat-hair "beit sha'ar"-style
  tent with poles and a pitched front flap, and a large multi-pole family tent — in dark
  goat-hair and faded undyed cloth tones, random size (±25%) and rotation. All in a few
  InstancedMeshes (≤ ~6 draws total), one shared tileable texture atlas, no shadows cast except
  maybe from near tents (prefer none), no lights. Only tents within ~40 m of the courtyard get
  colliders (or use a cheap spatial lookup) so `resolveCircle` stays fast.
- **Budgets:** draw calls within the DECISIONS baseline +10 in total by the end of the plan
  (rocks/vegetation ≤ 4, tents ≤ 6). Frame time no more than ~0.5 ms above the same-session
  `gate` measurement per step, except Step 9 (up to ~1.5 ms at `camp`). Load time increase
  under ~500 ms in total.

New presets (add in the step that first needs them): `laverclose`, `coverings` (from the NE
corner of the courtyard, low, seeing the stepped layers and stakes along the north side),
`coveringsw` (from the SW), `ground` (low view across rocks and scrub outside the hangings),
`camp` (high oblique over the camp from the east), `campwalk` (eye height just outside the
gate looking out over the tents), `smoke` (close side view of the incense altar's smoke).

## Steps

- [x] **Step 1: Laver** — model: Opus / effort: medium
  **Goal:** A more detailed, realistic laver. Polished-mirror bronze (Ex 38:8, made from
  bronze mirrors) with hammered/cast variation, patina in recesses and water stains near the
  spouts. Richer lathe profile: molded foot with steps and bead, fluted or ribbed stem with a
  knop, a basin with a thick rolled rim and a decorative band (e.g. a lotus or ring frieze).
  Spouts with small lids or taps, cast handles/rings. Water with a subtle ripple (normal
  animation, cheap) and a few drips; a darker damp patch on the sand under the spouts.
  **Files:** `src/scene/laver.js`, `src/config/dimensions.js` (`LAVER`), `src/scene/materials.js`,
  `src/scene/bronzeParts.js`, `src/camera/devCamera.js` (add `laverclose`).
  **Spec:** SPEC "Laver"; DECISIONS "Bronze altar & laver" (rim about 0.9 m, position).
  **Accept when:** `laver`, `laverclose`, `altar` (laver in frame) at night and `?light=work`
  show clearly more detail and a convincing bronze; rim height unchanged; collider unchanged;
  ≤ 3 draws for the laver; build passes, console clean, frame time/draws within budget.
  **Carry-over notes:**

- [x] **Step 2: Four staked coverings** — model: Opus / effort: medium
  **Goal:** Rebuild the coverings so the layers step outward on the N, S and W sides: the
  goat hair (hiding the linen beneath it entirely) slants from the roof edge down to its own
  row of bronze stakes with cords, then the ram skins and tachash above it reach less far, each
  staked, each lower layer's edge showing below the one above. Each layer keeps its texture
  (goat hair, red ram skin, dark tachash leather) and gets soft sag between stake points and folds at the corners. The inside
  ceiling stays as it is (the linen sheet seen from inside must still match). Replace the 18
  current pins with the new per-layer stakes. Update colliders so the player can't walk
  through the slanted coverings or stakes.
  **Files:** `src/scene/tentCoverings.js`, `src/scene/tabernacle.js` (pins/cords), 
  `src/scene/textiles.js`, `src/config/dimensions.js` (`TABERNACLE`), `src/camera/devCamera.js`
  (add `coverings`, `coveringsw`), `src/scene/interiorLight.js` only if the mask breaks.
  **Spec:** SPEC "Tabernacle" coverings; DECISIONS "Tabernacle tent" (goat hair, ram skins,
  tachash, linen ceiling, pins); plan assumptions "Four coverings" and "Covering shape".
  **Accept when:** at `tent`, `tentback`, `tentcorner`, `coverings`, `coveringsw` and `iso`,
  three distinct layers (goat hair, ram skins, tachash) are visible stepping out, each with
  its stakes and taut cords; no linen visible outside; no z-fighting or gaps between layers; `ceiling`, `holyplace`, `holyofholies` unchanged inside
  (no light leaks); door area at `gate` still reads open; stakes clear of the courtyard
  hangings; walking along the north side (`rig.simulate`) is blocked by the coverings; draws
  ≤ baseline +3; build passes, console clean.
  **Carry-over notes:**

- [x] **Step 3: Gold patina** — model: Opus / effort: medium
  **Goal:** Subtle dirt and tarnish on every gold surface (ark, cherubim, mercy seat, menorah,
  table and vessels, incense altar, veil hooks/pillars, boards, rings, bars, clasps): still
  shiny, but with variation in color and roughness, darker grime in recesses and toward the
  bottom, faint handling smudges. Implemented once as a material patch shared by the gold
  materials (onBeforeCompile, world-space noise from `WORLD_NOISE_GLSL`), compatible with the
  interior mask and reflection probe.
  **Files:** `src/scene/materials.js`, `src/scene/interiorLight.js` (check chaining of
  `onBeforeCompile`), whichever modules make their own gold material (grep `GOLD`).
  **Spec:** DECISIONS "Rendering" (materials, reflection probe), "Interior furnishings".
  **Accept when:** `ark`, `holyofholies`, `menorah`, `table`, `incense`, `holyplace`,
  `tentcorner` show gold that is clearly still gold and reflective, with visible but subtle
  wear (side-by-side before/after screenshots); no shader programs with `runnable: false`; no
  extra draws; frame time within budget; build passes, console clean.
  **Carry-over notes:**

- [x] **Step 4: Menorah ornament** — model: Opus / effort: medium
  **Goal:** Richer menorah: almond leaves curling under each knop and calyx, petalled flowers,
  sharper almond-shaped cups with ribbing, beading and fillets at joints, a more sculpted
  tripod base with leaf feet, smoother arm curves. Keep the Menachot 28b layout and lamp
  positions. Still one merged mesh.
  **Files:** `src/scene/menorah.js`, `src/config/dimensions.js` (`MENORAH`), `src/scene/materials.js`.
  **Spec:** SPEC "Menorah"; DECISIONS "Interior furnishings" (menorah); assumption "Menorah ornament".
  **Accept when:** `menorah` and `holyplace` (night) show leaves and flowers clearly; height,
  arm radii and flame positions unchanged (check flame world positions before/after);
  triangles ≤ ~150k for the menorah; still 1 draw for its gold; build passes, console clean.
  **Carry-over notes:**

- [x] **Step 5: Ark** — model: Opus / effort: medium
  **Goal:** Leave the cherubim unchanged. Add an ornate border on the lid inside the crown
  (palmette/leaf frieze, rosettes at corners), and on the body framed panels with leaf
  scrollwork, rosettes, beaded edges and corner fittings, plus decorated feet and ring plates —
  a richer, "film ark" read in ancient Near Eastern motifs. Keep dimensions, rings, poles and
  the single merged gold mesh; keep build time reasonable.
  **Files:** `src/scene/ark.js`, `src/config/dimensions.js` (`ARK`), `src/scene/materials.js`.
  **Spec:** SPEC "Ark"; DECISIONS "Interior furnishings" (ark, cherubim); assumption "Ark".
  **Accept when:** `ark` and `holyofholies` (night) show the cherubim unchanged and a clearly
  ornate lid and body; outer dimensions unchanged; ≤ ~200k triangles, still 1 draw for the gold;
  load-time meshing ≤ ~200 ms; build passes, console clean.
  **Carry-over notes:**

- [ ] **Step 6: Showbread** — model: Sonnet / effort: high
  **Goal:** Loaves that look like real baked bread: irregular outlines and slightly domed,
  uneven tops; a procedural crust texture (color map + bump/roughness) with browning gradients,
  darker scorched patches and charred edges, small blisters/cracks, light flour dust; each loaf
  varied (texture offset or per-instance color).
  **Files:** `src/scene/showbread.js`, `src/scene/textiles.js` or a new texture function in
  `showbread.js`, `src/scene/materials.js`.
  **Spec:** DECISIONS "Interior furnishings" (table of showbread).
  **Accept when:** `table` and `holyplace` show convincing bread under the menorah's light;
  stack layout and frankincense cups unchanged; no extra draws; build passes, console clean.
  **Carry-over notes:**

- [ ] **Step 7: Incense smoke** — model: Opus / effort: medium
  **Goal:** Replace or rework `createIncenseSmoke` so the smoke rises as a thin, nearly laminar
  thread from the coals, then twists into curling, folding wisps (curl-noise advected ribbons
  or strands) that widen and fade with height; gentle drift; translucent grey-blue lit warm at
  the base. One draw, no light, fog-correct, no NaNs (bloom).
  **Files:** `src/scene/fire.js` (`createIncenseSmoke`), `src/scene/incenseAltar.js`,
  `src/camera/devCamera.js` (add `smoke`).
  **Spec:** DECISIONS "Interior furnishings" (altar of incense); AGENTS "Three.js r187 gotchas".
  **Accept when:** `smoke`, `incense`, `veil` show wispy, twisting smoke (two screenshots a
  few seconds apart show motion); no black squares with bloom; ≤ 1 draw; frame time within
  budget at `smoke`; build passes, console clean.
  **Carry-over notes:**

- [ ] **Step 8: Rocks and vegetation** — model: Opus / effort: medium
  **Goal:** A new `scene/groundScatter.js`: a few procedural rock shapes (displaced
  icosahedra, flint and limestone tones) placed in random clumps, and low vegetation — grass
  tufts and blades (alpha-tested or thin-blade geometry), small round shrubs — fitting a
  Sinai steppe. Seeded noise decides density; near-courtyard placement keeps paths and the
  gate approach clear. Instanced with distance LOD (dense near the player/courtyard, sparse
  far). Optional subtle wind sway for grass in the vertex shader.
  **Files:** new `src/scene/groundScatter.js`, `src/main.js` (wire up), `src/scene/ground.js`
  (only if the sand needs matching), `src/scene/materials.js`, `src/camera/devCamera.js`
  (add `ground`).
  **Spec:** SPEC "World"; assumption "Rocks and vegetation"; AGENTS conventions (instancing,
  interior mask covers new materials automatically).
  **Accept when:** `ground`, `gate`, `corner`, `walk`, `iso` show natural clumps of rocks and
  scrub, none clipping through pillars, pegs, altar, laver or the new coverings stakes; none
  inside the tent; ≤ 4 new draws; frame time within budget; build passes, console clean.
  **Carry-over notes:**

- [ ] **Step 9: Camp of Israel** — model: Opus / effort: medium
  **Goal:** A new `scene/camp.js`: 3 low-poly tent variants (see assumptions) built
  procedurally with a shared cloth texture, instanced into thousands of tents laid out per
  Numbers 2/3 (Levite inner ring, four tribal camps, lanes between, open east approach),
  starting ~10 m outside the courtyard hangings and filling out to the ground's edge. Random
  rotation, size and tint per instance; small stakes/ropes only on the variants where cheap.
  No lights; unlit-by-fire far tents should still read as silhouettes against the sky and fog.
  Colliders only for nearby tents (or a cheap spatial grid in `colliders.js`). Check the
  ground scatter from Step 8 doesn't sit inside tents.
  **Files:** new `src/scene/camp.js`, `src/main.js`, `src/scene/colliders.js` (if a grid is
  needed), `src/scene/textiles.js`, `src/camera/devCamera.js` (add `camp`, `campwalk`).
  **Spec:** assumptions "Camp layout" and "Tents"; AGENTS light budget (no new lights).
  **Accept when:** `camp`, `campwalk`, `iso`, `sky`, `walk` show a large camp fading into the
  dark, tribal blocks readable at `camp`, nearest tents ~10 m from the hangings, no tent on
  the east lane; walking into a near tent is blocked; ≤ 6 new draws; frame time ≤ +1.5 ms at
  `camp` vs `gate` same session; load time increase ≤ ~300 ms; build passes, console clean.
  Update the performance baseline in DECISIONS.md at the end.
  **Carry-over notes:**
