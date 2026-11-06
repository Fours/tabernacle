# Plan: AAA polish pass

**Status:** active
**Goal:** The night scene reads like a finished, high-end game. The altar fire and the pillar of
fire look like real, turbulent fire with rich colour, sparks and smoke instead of soft sprites
and a blurry streak. Light behaves like light at night: it glows in the haze, objects sit on
the ground, linen glows where firelight passes through it, and the eye adapts between the dark
court and the lamplit tent. A distant ridge line closes the horizon.

**In scope:**
- Post chain: bloom, colour grade, eye adaptation, lens touches, sharpening.
- Fire: flame rendering (altar, torches), sparks and smoke, the pillar of fire.
- Atmosphere: ground haze, glow of lights in the haze, drifting dust and ash.
- Grounding: contact and baked ambient occlusion (no screen-space AO pass).
- Cloth: hangings, gate and door screens, coverings (translucency, wind, sheen).
- Ground and surface materials: sand relief, trodden paths, bronze, silver, wood, board gold.
- Horizon and sky: distant mountain ridges, sky refinement.
- Interior atmosphere and a final consistency and performance pass.

**Out of scope:** the camp's tents (geometry, materials, instance counts and LOD stay as they
are, for frame rate; global fog and grading will still touch how they look); new
shadow-casting lights; daytime and the cloud by day; people, animals and sound; changes to
biblical dimensions or layout.

**Assumptions** (move each to `docs/DECISIONS.md` when its step lands):
- **Performance budget (user's choice: generous):** look comes first. Each step may add up to
  ~1 ms at `gate` in the GPU's fast mode (~2 ms throttled) and up to ~6 draw calls; the
  whole plan should keep `gate` under ~14 ms throttled at 2048×1536. Each step reports its
  cost, measured as `AGENTS.md` describes, and anything over budget is flagged, not hidden.
- **Ambient occlusion (user's choice):** baked and contact AO only (soft blobs under objects,
  baked corner and crease darkening, AO terms in shaders). No SSAO/GTAO pass; the earlier
  decision stands.
- **Horizon (user's choice):** low, hazy granite ridges far out (the wilderness of Sinai,
  Num 1:1), a reconstruction, one cheap draw.
- **Fire is not a light-count change:** the 8 point lights and the single shadow caster stay.
  New glow comes from emissive HDR surfaces, bloom and analytic in-scattering.
- **Fire look:** physically plausible colour (a blackbody-like ramp from deep red through orange
  to a yellow-white core, never flat white), distinct licking tongues, fast flicker at the
  base and slower roll at the top. The pillar of fire keeps its decided shape, sizes and
  position (DECISIONS, "Interpretation of the text"); only how it is rendered changes.
- **Bloom threshold:** if the new bloom changes the 2.0 threshold, every emissive the scene
  relies on (coals, torch cracks, lamp flames, incense coals, pillar core) is re-checked in
  the same step so nothing drops out of bloom or starts glowing that shouldn't.
- **`fire.js` is 792 lines.** Steps that grow it split it first (e.g. `fireFlames.js`,
  `fireSmoke.js`, `fireNoise.js`) to stay under the 1000-line lint limit.

## Steps

- [x] **Step 1: Post chain — bloom, grade, eye adaptation, lens** — model: Opus / effort: medium
  **Goal:** Upgrade `render/postfx.js` so every later step is tuned under the final look.
  (a) A wider, softer, energy-conserving bloom with a soft-knee threshold (custom mip-chain
  bloom or a re-tuned UnrealBloomPass with more levels), so fires get a broad glow and a tight
  core instead of a halo ring. (b) A filmic colour grade: keep ACES, add a gentle S-curve,
  lifted-but-cool blacks, warm highlights and slight saturation roll-off in the brights
  (procedural, no LUT file needed). (c) Eye adaptation: a smoothed exposure that rises slowly
  (~1.5 s) when the camera enters the tent and falls back outside, from a cheap luminance
  estimate (downsampled average, or the camera-inside test plus scene key) — clamp it so the
  court never looks washed out. (d) Subtle lens touches: very slight chromatic aberration at
  the frame edges, a faint lens-dirt/glare response only to very bright sources, and a light
  sharpening (CAS-style) after tone mapping to counter MSAA/bloom softness. Keep the vignette,
  grain and heat shimmer. Each effect gets a URL toggle (e.g. `?ae=0`, `?lens=0`) and a
  uniform on `__tabernacle.fx` for tuning.
  **Files:** `src/render/postfx.js` (split into `render/bloom.js` / `render/grade.js` if it
  grows), `src/main.js`, `src/debug/params.js`, `src/scene/interiorLight.js` (read-only, for
  the inside test).
  **Spec:** AGENTS.md "URL parameters", "Three.js r187 gotchas" (NaN/negative `pow()` → black
  squares under bloom); DECISIONS "Rendering" (tone mapping, post chain, bloom threshold).
  **Accept when:** `gate`, `fire`, `firepillar`, `torch`, `holyplace`, `holyofholies`, `walk`
  screenshots compared before/after show broader, smoother fire glow with no ringing or
  banding; blacks keep detail; colours aren't washed out. Walking in through the door with
  `rig.simulate` shows exposure easing up over ~1–2 s, and back down outside. All emissives
  listed in the plan's bloom assumption still bloom. No NaN black squares. Lint, build, clean
  console; cost within the plan's per-step budget.
  **Carry-over notes:** Done (a385d44, 1 round). Throttled `gate` measured 16–19 ms before
  the step on this day's GPU state, so judge budgets as deltas within one session.

- [x] **Step 2: Flame rendering — altar and torches** — model: Opus / effort: medium
  **Goal:** Replace the soft additive flame sprites in `createFire` with fire that reads as
  real flame up close. Options for the builder to choose from and justify: a procedural
  flame-tongue texture atlas baked once at load (noise-distorted tongues, 8–16 frames,
  flipbook-blended), or per-pixel domain-warped noise in the sprite shader; either way, a
  temperature-driven colour ramp (red-orange edges, yellow body, a small yellow-white core that
  doesn't clip to a flat white blob), alpha/brightness shaped so tongues separate and lick
  upward, turbulence faster at the base, and flames that hug the grate bars (the altar's fire
  burns up through the grate). Fix the altar's current blown-out white centre. Torches use the
  same code at their own scale. Coals keep glowing; tie their pulse to the flame level. Split
  `fire.js` first. Per-frame cost stays a few uniform writes.
  **Files:** `src/scene/fire.js` (split), `src/scene/altarFire.js`, `src/scene/torches.js`,
  `src/scene/firewood.js`.
  **Spec:** DECISIONS "Fire & lighting" (altar fire, torches, light values unchanged).
  **Accept when:** at `fire`, `altar`, `altartop`, `torch` the flames show distinct tongues,
  a colour gradient and no flat white blob; a few consecutive screenshots (or `fx.render(t)` at
  different `t`) show motion with no visible sprite edges, popping or repeating loop. The
  menorah's lamp flames are unchanged or improved consistently. Light intensities and shadow
  setup unchanged. Lint, build, clean console; budget.
  **Carry-over notes:** Done (a7da940, 41d0870, 1 round). fire.js is split into fireCommon/fireFlames/fireSmoke; `flames` now counts sheets. Under some flicker/exposure states the lower centre at `fire` reads pale peach — Step 3 may tone the core down a touch if smoke/sparks make it look hot-white.

- [x] **Step 3: Sparks, embers and smoke** — model: Opus / effort: medium
  **Goal:** The altar's secondary effects at AAA quality. Sparks: bright HDR streaks
  stretched along their velocity (motion-blur look), rising on the updraft, swirling, cooling
  from yellow to red and winking out; occasional bursts. Smoke: a fuller column rising from the
  altar, lit warm from below by the fire and fading into cool grey-blue above, soft-edged
  (no visible quads), drifting with the wind, dissolving into the haze several metres up, with
  some self-shadowing look (darker cores, lighter rims toward the fire). Fine ash drifting down
  around the altar. Torches get a few sparks and a thin wisp. Keep it to the current number of
  draws per fire where possible.
  **Files:** the fire modules from Step 2, `src/scene/altarFire.js`, `src/scene/torches.js`.
  **Spec:** DECISIONS "Fire & lighting", "Rendering" (additive sprites fade to black in fog;
  smoke uses the normal fog mix).
  **Accept when:** at `fire`, `altar`, `gate`, `torch` the sparks read as streaks, the smoke as
  a soft lit plume with no quad edges or hard intersections with the grate, and nothing
  flickers or sorts badly from the free camera circling the altar. Lint, build, clean console;
  budget.
  **Carry-over notes:** Done (c603534, 1 round).

- [ ] **Step 4: Pillar of fire, volumetric** — model: Opus / effort: medium
  **Goal:** Rebuild the pillar's look (shape, sizes, position, light unchanged) so it reads as
  a towering, slowly churning column of fire, not a blurred streak. A short raymarch (e.g.
  16–32 steps, jittered and blue-noise dithered) through the existing bounding volume with 3D
  noise: billowing convection cells rolling upward, a dense bright core and ragged tongues at
  the edges, the temperature ramp from Step 2, a defined but soft foot over the roof, and the
  shaft above as a gentle, slowly rippling column of yellow light. Add a sparse swirl of large
  embers/sparks spiralling around the column (instanced, part of the same module, 1 extra draw
  at most). Its glow should visibly warm the top of the tent coverings and the sky right
  around it (via the existing light plus emissive/bloom). Early-out rays that miss; keep the
  cost reasonable when the column fills the screen (`firepillarfoot`).
  **Files:** `src/scene/pillarOfFire.js`, the fire noise module from Step 2,
  `src/config/dimensions.js` (read-only).
  **Spec:** DECISIONS "Interpretation of the text" (pillar shape), "Fire & lighting" (pillar
  light), "Rendering" (pillar volume, fog mix, dither).
  **Accept when:** at `firepillar`, `firepillarfoot`, `firepillarfar`, `gate`, `tent`, `walk`
  the column shows internal rolling structure and edge tongues, no banding, no hard bounding
  geometry and no NaN squares; it animates smoothly. Frame time at `firepillarfoot` is reported
  (allowed up to ~+1.5 ms fast mode for this step, since it can fill the screen). Lint, build,
  clean console.
  **Carry-over notes:**

- [ ] **Step 5: Night atmosphere — haze and glow** — model: Opus / effort: medium
  **Goal:** Make the air visible. (a) Height fog: a thin, ground-hugging haze layer (denser in
  the first ~1.5 m, slowly drifting noise) on top of the existing `FogExp2`, applied through
  the fog chunks so every material (custom shaders included) gets it. (b) Analytic
  in-scattering: in the fog term, add the glow of the altar fire, the torches and the pillar of
  fire as seen through the haze (closest approach of the view ray to each source, no extra
  passes), so each light gets a soft halo in the air and the pillar casts a warm glow on the
  haze around the tent. (c) Drifting dust motes that catch the firelight near the altar and
  torches (one instanced draw, faded with distance). Keep the camp's look acceptable (it only
  gets the fog change). Revisit the sky's horizon blending if the fog changes.
  **Files:** a new `src/scene/atmosphere.js` (or `render/fog.js`), `src/main.js`,
  `src/scene/sky.js`, every custom `ShaderMaterial` that includes fog chunks (grep for
  `fog_fragment`), `src/scene/interiorLight.js` (haze inside the tent should be lamp-warm, not
  moon-cool).
  **Spec:** DECISIONS "Rendering" (night haze, additive sprites in fog), "Fire & lighting".
  **Accept when:** at `gate`, `ground`, `corner`, `torch`, `firepillar`, `campwalk` the lights
  glow in the air, the ground haze is visible but doesn't hide the scatter near the player,
  and nothing pops when walking (`rig.simulate`). Custom shaders (fire, smoke, pillar, sky,
  laver water, scatter) match the new fog. Lint, build, clean console; budget.
  **Carry-over notes:** (from Step 3) at `fire` the altar smoke just above the flame tips reads as a bright, opaque puffy ball; make its lower part thinner and more transparent (smoke params in altarFire.js / fireParticles.js) while touching the fog. No depth texture exists in the post chain (soft particles would need one).

- [ ] **Step 6: Grounding — contact and baked AO** — model: Opus / effort: medium
  **Goal:** Make everything sit on the ground and in its corners. (a) Soft contact-AO blobs on
  the ground under pillars, sockets, pegs, torch cairns, the altar, the laver, the utensils
  and the stakes (one instanced decal draw, or folded into the ground shader from a small list
  of shapes), and under the hangings' lower edge. (b) Baked AO in the tent: darken where the
  walls meet the floor and the ceiling, the corners, behind the veil's pillars, and under the
  furnishings (ground shader term from their footprints, wall shader term from height). (c) A
  cheap AO term on geometry that has creases: the altar's ledge and network, the ark's crown,
  the menorah's joints, the courtyard capitals (vertex AO baked at build time where the
  geometry is generated, or a height/cavity term). No SSAO pass.
  **Files:** `src/scene/ground.js`, `src/scene/courtyard.js`, `src/scene/tabernacle.js`,
  `src/scene/altar.js`, `src/scene/laver.js`, `src/scene/torches.js`,
  `src/scene/interiorLight.js`, `src/scene/materials.js`; furnishing modules as needed.
  **Spec:** DECISIONS "Rendering" (AO skipped — still no SSAO), "Interior furnishings".
  **Accept when:** at `pillar`, `altarlow`, `laver`, `torch`, `holyplace`, `table`, `ark`,
  `tentcorner` objects visibly sit on the ground (soft darkening at the contact, no floating
  look) and the tent's corners and wall bases darken; no dark halos where nothing stands and no
  double-darkening where the altar's real shadow already falls. Lint, build, clean console;
  budget.
  **Carry-over notes:**

- [ ] **Step 7: Cloth — translucency, wind and sheen** — model: Opus / effort: medium
  **Goal:** Make the textiles look like cloth. (a) Translucency: linen hangings, the gate and
  door screens, the drawn door half and the veil let firelight through — when a light is
  behind the cloth, its back side glows warmly with the weave showing (a wrap/transmission term
  in the existing material patch, using the light's direction and the cloth's thickness; the
  goat hair and skins transmit little or none). (b) Wind: a slow, subtle billow in the vertex
  shader on the courtyard hangings (most at mid-span, none at the hooks and pegs), the hanging
  drawn door half and the drape hems; coverings' hems ripple faintly; the shadow depth
  material gets the same displacement. (c) Sheen: a soft fibre sheen at grazing angles on
  linen and wool, and a slight sag between pillars if the hangings are currently flat.
  **Files:** `src/scene/courtyard.js`, `src/scene/drape.js`, `src/scene/tabernacle.js`,
  `src/scene/tentCoverings.js`, `src/scene/veil.js`, `src/scene/materials.js`,
  `src/scene/textiles.js`.
  **Spec:** DECISIONS "Courtyard", "Tabernacle tent" (hanging and door arrangement unchanged).
  **Accept when:** at `ground` (outside the south hangings, altar behind) the linen glows
  where the fire is behind it; at `gate`, `torch`, `tent`, `coverings` the cloth moves gently
  in successive frames with no tearing at seams or hooks; shadows follow the motion; the
  embroidery still reads. Lint, build, clean console; budget.
  **Carry-over notes:**

- [ ] **Step 8: Ground and surface materials** — model: Opus / effort: medium
  **Goal:** Richer ground and materials. (a) Sand: gentle low-frequency relief in the ground
  mesh away from the court (small dunes and swales; the court and the paths stay level, and
  colliders/eye height stay right — check `rig` still walks at 1.6 m), a cooler, less orange
  night tone away from the fire, finer grain sparkle in firelight, and trodden, darker,
  compacted paths in the court (gate → altar → laver → tent door) with faint footprints near
  the altar and laver. (b) Materials: bronze (altar, laver, pegs, stakes) with hammered
  roughness variation, edge wear and soot near the fire; silver capitals, hooks and fillets
  with polish and tarnish; acacia wood (torches, poles' ends where visible) with grain; the
  gold board overlay inside the tent with visible board seams, hammered sheen and less of the
  current flat-brown look. Reuse `addMacroVariation` / `addGoldPatina` patterns; procedural
  only.
  **Files:** `src/scene/ground.js`, `src/scene/groundScatter.js` (scatter must follow the new
  relief), `src/scene/materials.js`, `src/scene/textiles.js`, `src/scene/tabernacle.js`,
  `src/scene/colliders.js` / `src/camera/firstPerson.js` (ground height if relief is added
  where the player walks).
  **Spec:** DECISIONS "World" (scatter), "Rendering" (materials, gold patina), "Tabernacle
  tent" (gold boards).
  **Accept when:** at `ground`, `gate`, `campwalk`, `corner` the sand has relief and tonal
  variation without tiling; the court shows trodden paths; scatter and camp tents sit on the
  ground (no floating or buried tents — the camp's tents must not be changed, only their
  height lookup if needed); at `altar`, `laverclose`, `pillar`, `holyplace` the metals and the
  board gold look richer. `rig.simulate` walks keep eye height 1.6 m over the new ground. Lint,
  build, clean console; budget.
  **Carry-over notes:**

- [ ] **Step 9: Horizon ridges and sky** — model: Opus / effort: medium
  **Goal:** Close the horizon and refine the sky. (a) Distant granite ridges (the wilderness
  of Sinai): a ring of low, layered silhouettes several km out (one draw, procedural height
  profile, 2–3 depth layers by colour), dark and hazy with a faint cool rim from the
  sky/moon-fill direction, following the camera like the sky dome so they never get close.
  (b) Sky: subtle airglow gradient near the horizon, the Milky Way's dust lanes and colour
  refined, the pillar's shaft softly lighting a thin high haze where it fades out (as if
  reaching the clouds), and an occasional faint meteor. Keep the star sizes decided in
  DECISIONS.
  **Files:** `src/scene/sky.js`, a new `src/scene/horizon.js`, `src/main.js`,
  `src/camera/devCamera.js` (add a `horizon` preset: eye height looking out over the camp to
  the ridges).
  **Spec:** DECISIONS "Rendering" (sky dome, horizon uses the fog colour), "Interpretation of
  the text" (pillar shaft fades as if reaching the clouds).
  **Accept when:** at `horizon`, `ground`, `campwalk`, `firepillarfar`, `sky`, `camp` the
  ridges read as distant mountains, never intersect the camp or show their ring edge, and the
  sky has no banding. Lint, build, clean console; budget.
  **Carry-over notes:**

- [ ] **Step 10: Interior atmosphere and final pass** — model: Opus / effort: medium
  **Goal:** Finish the inside and tie the whole plan together. (a) Interior: a warm haze in
  the Holy Place that glows around the menorah (analytic, from Step 5's approach), incense
  haze gathering faintly under the ceiling, dust motes in the lamplight, and the Holy of
  Holies kept dark and reverent with the ark's glint. (b) Consistency pass across every preset
  in `AGENTS.md`: fix anything earlier steps left (carry-over notes), check fog/haze, bloom
  and exposure agree inside and out, and that the camp looks unchanged apart from fog and
  grade. (c) Measure and record the new performance baseline and draw calls in
  `docs/DECISIONS.md`, update `AGENTS.md` (code map, light/draw budgets, URL params, presets)
  and archive the plan.
  **Files:** `src/scene/interiorLight.js`, `src/scene/menorah.js`, `src/scene/incenseAltar.js`,
  the atmosphere module from Step 5, `docs/DECISIONS.md`, `AGENTS.md`.
  **Spec:** DECISIONS "Fire & lighting" (interior mask, menorah, Holy of Holies at 8%),
  "Performance baseline".
  **Accept when:** at `holyplace`, `menorah`, `incense`, `veil`, `holyofholies`, `ark` the room
  has a soft warm atmosphere without washing out the woven ceiling and veil; every preset
  renders without errors; DECISIONS has the new baseline (`gate` under ~14 ms throttled at
  2048×1536 or the overrun explained); AGENTS.md is current. Lint, build, clean console.
  **Carry-over notes:**
