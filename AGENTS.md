# AGENTS.md — Tabernacle

This file is the source of truth for anyone (human or agent) working on this repo.
Read it fully before starting any task.

## Goal

A walkable, nighttime 3D reconstruction of the **Tabernacle (Mishkan) of Israel in the
wilderness**, as described in the Torah (Exodus 25–27, 30, 35–40). It runs in the browser
using Three.js.

The finished experience:

- It is **night**. The sky is dark and starry. The main light comes from the **perpetual fire on
  the bronze altar** (Lev 6:13) and from **torches on posts** around the courtyard gate and
  wherever else they look good.
- The player walks around in **first person at human eye height** (~1.6 m). They can't walk
  through walls, pillars or objects.
- The current scope is **the outside**: the courtyard enclosure (pillars, hangings, gate),
  the bronze altar, and the exterior of the Tabernacle tent. Interiors (menorah, table,
  incense altar, ark, veil) are **out of scope** for now. The bronze laver is optional; see the
  spec below.

Accuracy to the biblical text comes first. Where the text is silent or ambiguous, follow the
defaults below and write down any new interpretive choice in the **Decisions log** at the
bottom of this file.

## Tech stack & commands

- **Vite** (vanilla JS, ES modules) and **Three.js**. No UI framework. Don't add React
  unless a task explicitly asks for it.
- Import addons from `three/addons/...` (e.g. `three/addons/controls/OrbitControls.js`).
- `npm run dev`: dev server (default http://localhost:5173; the port may shift if it's taken).
- `npm run build`: production build. **Must succeed before every commit.**
- `npm run preview`: serve the production build.
- Prefer procedural geometry, materials and textures. If an external asset (texture, model,
  HDRI) is ever used, it must be CC0/public-domain, live under `public/assets/`, and be listed
  in `CREDITS.md` with its source URL and license.
- Add npm dependencies only when clearly worth it, and mention them in the commit message.

## Units, orientation & dimensions

- **1 world unit = 1 meter.** All biblical measurements are written in **cubits** in
  `src/config/dimensions.js` and converted using a single constant:
  `CUBIT = 0.45` (meters, the common cubit). Never hard-code meter values for biblical
  dimensions. Always derive them from that file.
- Three.js is Y-up. **East = +X, West = −X, North = −Z, South = +Z.** The courtyard gate and
  the Tabernacle entrance face **east**.
- The world origin is the **center of the courtyard** at ground level.

### Courtyard (Ex 27:9–19; 38:9–20)

- Enclosure: **100 cubits** (east–west) × **50 cubits** (north–south).
- Hangings: fine twined linen (white), **5 cubits high**.
- **60 pillars** total at **5-cubit spacing** around the 300-cubit perimeter: 20 on each long
  side, 10 on each short side, with each corner pillar counted once. Pillars stand on **bronze
  sockets (bases)** and have **silver hooks, silver fillets (bands/rods connecting pillars)
  and silver-overlaid capitals**. Hangings are held with **bronze pegs and cords**.
  The pillars' size isn't given. Use about 0.5 cubit diameter and 5 cubits tall unless a
  better-sourced figure is recorded in the Decisions log.
- East side: a **20-cubit gate screen** in the center (blue, purple, scarlet and fine twined
  linen, embroidered, 5 cubits high, on 4 pillars). On each side of it is a **15-cubit hanging**
  on 3 pillars.

### Tabernacle tent (Ex 26; 36:8–38)

- Interior: **30 cubits long (E–W) × 10 wide × 10 high**. Holy Place is 20 cubits (east part),
  Holy of Holies is 10 cubits (west part).
- Walls: acacia **boards 10 cubits tall × 1.5 wide**, overlaid with gold. 20 boards on the
  south, 20 on the north, 6 on the west plus 2 corner boards. Each board stands on **2 silver
  sockets**. **5 bars per side**, with the middle bar running the full length. Board thickness
  isn't in the text: use **1 cubit** (rabbinic tradition) and log it if you change it.
- East entrance: a **screen** of blue, purple, scarlet and linen, embroidered, hung on
  **5 acacia pillars overlaid with gold, on bronze sockets**.
- Coverings, from the inside out:
  1. Linen curtains with cherubim woven in: 10 curtains of 28×4 cubits, joined into a 28×40 sheet
     (loops and **gold clasps**).
  2. Goat-hair curtains (dark, nearly black): 11 curtains of 30×4, giving 30×44, with **bronze
     clasps**. They hang to about 1 cubit above the ground on the sides (Ex 26:13), and the
     extra half curtain hangs over the back (west).
  3. Ram skins dyed red. Dimensions aren't given.
  4. Outer covering of *tachash* skins. The animal and color are uncertain: use a dark, muted,
     leathery tone.
- Roof shape: **flat roof** (traditional rabbinic reading). The coverings drape over the top and
  down the sides, so most of each gold board is hidden from outside, with the bottom showing.

### Placement in the courtyard (traditional layout)

Split the courtyard into two 50×50-cubit squares:

- **Tabernacle** in the western square. Its interior spans x = −30 … 0 cubits, so its back
  wall is **20 cubits from the west hanging**. The Holy of Holies (x = −30 … −20) is centered
  in the western square. It's centered north–south (z = 0).
- **Bronze altar** centered in the eastern square (x = +25, z = 0), between the gate and the
  tent entrance.
- **Laver** (optional): between the tent and the altar, slightly south (about x = +10,
  z = +3), *bronze*, on a bronze base. The text gives no dimensions.

### Bronze altar (Ex 27:1–8; 38:1–7)

- **5×5 cubits, 3 cubits high**, hollow, made of acacia boards overlaid with **bronze**.
- **Horns** on the four corners, of one piece with the altar.
- A **ledge** (*karkov*) around it, and a **bronze network grating** under the ledge reaching
  halfway up the altar. There are **4 bronze rings** at the grating's corners, and **two acacia
  poles overlaid with bronze** run through the rings for carrying.
- Utensils (optional detail): pots for ashes, shovels, basins, forks, firepans.
- Fire: a perpetual wood fire on top, with smoke and embers.

### Other world defaults

- Ground: desert sand and gravel in the wilderness. Mountains or dunes in the distance are fine.
- Night: a near-black blue sky, very dim cool moonlight or starlight fill, and **warm firelight
  as the main light**.
- The torches are **artistic license** (they aren't in the text). Keep them in period style:
  wooden posts with oil- or pitch-soaked wrapped heads or simple bronze bowls. No metal
  lanterns or anything modern.

## Code structure

Keep modules small and focused. Each scene element builds its own `THREE.Group` and returns it.

```
src/
  main.js                 # bootstrap: renderer, scene, loop, wires modules together
  config/dimensions.js    # ALL biblical measurements in cubits + CUBIT constant
  scene/
    ground.js
    courtyard.js          # pillars, hangings, gate, pegs/cords
    altar.js
    tabernacle.js
    laver.js              # optional
    lighting.js           # moon/ambient fill, light budget
    fire.js               # altar fire (particles/shader), reusable for torches
    torches.js
    sky.js                # night sky, stars
  camera/
    devCamera.js          # free orbit/fly camera + preset views
    firstPerson.js        # pointer-lock WASD walk, eye height, collisions
  render/postfx.js        # EffectComposer chain
  debug/                  # optional helpers (axes, grid, stats)
```

Rules:

- Use **InstancedMesh** (or merged geometry) for repeated parts: pillars, sockets, pegs, boards
  and rings. Keep draw calls reasonable.
- Lights are expensive. Use **few shadow-casting lights** (at most 1–3). Torches can use
  non-shadow point lights, or fake light with emissive materials and light baking if needed.
  Target **60 fps on a modern laptop**.
- Dispose of geometries and materials you replace. Don't leak per-frame allocations in the
  render loop.

## Camera modes & visual verification

Agents can't judge a 3D scene without seeing it, so **every visual task is verified with
screenshots**.

- URL parameters control the camera:
  - `?cam=fp`: first-person walk mode. This is the **default** in the finished product.
  - `?cam=free`: free orbit/fly dev camera.
  - `?view=<preset>`: jump to a named preset view (this implies the free camera unless
    `cam=fp`). Presets must include at least: `top` (straight down over the whole courtyard),
    `iso` (high 3/4 view from the southeast), `gate` (outside the east gate at eye height),
    `altar` (close-up of the altar), `tent` (the Tabernacle front from the courtyard at eye
    height), `corner` (outside the SE courtyard corner, close to the pillar details), and
    `walk` (first-person spawn point outside the gate).
  - `?debug=1`: show the grid, axes and an FPS/draw-call readout.
- Each preset should be **deterministic**, so screenshots can be compared across iterations.
  Add new presets whenever a task needs them.
- Verifying a task: start the dev server, load the relevant presets, take screenshots, check
  them against the spec, check the browser console for errors, and fix any problems before
  calling the task done.
- During development, a **brighter "work light" mode** (`?light=work`) can temporarily add
  neutral fill so geometry is readable at night. Always check the final result with the real
  night lighting too.

## Workflow: orchestrator + sub-agents

Work is done in **numbered steps** (see the Plan). An **orchestrator** agent drives the plan.
It doesn't implement steps itself. For each step it starts a **fresh sub-agent** (a clean
context window) with a focused brief.

### Orchestrator loop

1. Read this file and `git log --oneline`. Find the first unfinished step in the Plan.
2. Start one sub-agent for that step. The brief contains: the step's goal and acceptance
   criteria (copied from the Plan), the relevant spec sections above, the files likely to be
   touched, and an instruction to follow the "Sub-agent rules" below.
3. When the sub-agent reports back, **check it independently**: run `npm run build`, open the
   presets named in the acceptance criteria, look at the screenshots and read the diff.
4. If the criteria aren't met, start another sub-agent (fresh context) with a brief that
   names the specific remaining gaps. Repeat until the criteria are met. Stop and ask the
   human if a step fails to converge after ~3 rounds.
5. Make sure the work is committed. Tick the step's checkbox in the Plan, add any decisions to
   the Decisions log, and commit that update. Then go to the next step.
6. Run steps **one at a time, in order**. Later steps build on earlier ones.

### Sub-agent rules

- Read `AGENTS.md` first. Stay inside your step's scope. Note anything out of scope in your
  report instead of fixing it.
- Iterate: implement → screenshot → compare with the spec and acceptance criteria → refine.
- Keep dimensions in `src/config/dimensions.js`, in cubits.
- **Commit at logical stopping points** (a step can take several commits). Before each commit,
  `npm run build` must pass and the browser console must show no errors.
- Commit messages: a short imperative subject line (e.g. `Add courtyard pillars with bronze
  sockets`), then a body explaining what and why. Never push, rewrite history or amend
  someone else's commit unless the human asks.
- Finish with a short report: what was done, what screenshots were checked, any deviations
  or open questions, and any decisions to log.

### Model & effort per step

The orchestrator starts each sub-agent with these settings. Fix rounds for a step use the
same settings as the step itself.

| Role / step                | Model      | Effort |
|----------------------------|------------|--------|
| Orchestrator               | Opus 5.5   | medium |
| 2 Courtyard walls          | Opus 5.5   | high   |
| 3 Bronze altar             | Sonnet 5.5 | high   |
| 4 Tabernacle tent          | Opus 5.5   | high   |
| 5 Altar fire               | Opus 5.5   | high   |
| 6 Torches                  | Sonnet 5.5 | medium |
| 7 Shaders & postfx         | Opus 5.5   | high   |
| 8 Starry sky (+ FP polish) | Sonnet 5.5 | medium |

Opus goes where visual judgment and shader or geometry difficulty dominate. Sonnet goes to
the smaller, clearly specified steps. Don't use max effort for builders: the screenshot loop
catches mistakes better than extra reasoning does. If a Sonnet step fails to converge after
2 rounds, retry it with Opus.

### Keeping token use down

- Take screenshots at **half scale** (`scale: 0.5`), and only of the presets named in the
  step's acceptance criteria (plus at most 1–2 extra close-ups).
- Briefs list the files to read and touch. Don't read the whole codebase.
- Start a fresh sub-agent for each fix round, so earlier screenshots don't pile up in one
  context.
- Use the debug handle (`window.__tabernacle`) and `read_console_messages` to check behavior
  instead of taking extra screenshots.

## Plan

Each step can loop until its acceptance criteria are met. Tick the box when the orchestrator
has checked and committed it.

- [x] **Step 1: Layout blockout with simple geometry.**
  Create `dimensions.js`, the module structure above, the ground, and both camera modes
  (free/dev camera with all presets, and a basic first-person walk with collision against the
  courtyard walls and the large objects). Block out everything with plain boxes and cylinders:
  60 pillars, hangings as flat panels, the gate opening, the altar (5×5×3), the Tabernacle
  (30×10×10 interior plus board thickness) and a laver placeholder. Use flat colors.
  *Accept when:* the `top` screenshot shows the correct proportions and placement
  (100×50 courtyard, gate centered in the east, tent in the western half 20 cubits from the west
  wall, altar centered in the eastern half). The `walk` mode lets you walk in through the gate
  at eye height, and walls block movement. Hangings are clearly taller than eye level.

- [x] **Step 2: Courtyard walls in detail.**
  Pillars with bronze sockets, silver capitals, silver fillets between pillars, and hooks.
  Linen hangings with cloth-like shading and slight sag or folds. The embroidered gate screen
  in blue, purple and scarlet. Bronze pegs and cords staking the pillars outward.
  *Accept when:* the `corner` and `gate` close-ups read clearly as linen on silver-capped
  pillars with bronze bases, and the frame rate holds.

- [x] **Step 3: Bronze altar in detail.**
  Bronze-overlaid hollow altar with horns, ledge, grating halfway up, 4 rings and 2 poles.
  Optional utensils nearby. Optional laver detail.
  *Accept when:* the `altar` view matches every item in the altar spec.

- [x] **Step 4: Tabernacle tent in detail.**
  Gold-overlaid boards on silver sockets, the bars, the entrance screen on 5 gold-overlaid
  pillars with bronze sockets, and the layered coverings (goat hair visible as the main outer
  curtain under the ram skin and tachash top covering, draping as specified). The flat roof.
  *Accept when:* the `tent` and `iso` views show a convincing layered covering with the
  gold boards visible below the hem, and the embroidered entrance screen.

- [x] **Step 5: Altar fire.**
  An animated wood fire on top of the altar (flames, embers and smoke) with a flickering warm
  light that is the main light source in the courtyard. Build it as a reusable `fire.js` that
  torches can use too.
  *Accept when:* the scene at real night lighting is lit mainly by the altar fire, the flicker
  looks natural, and the frame rate holds.

- [x] **Step 6: Torches.**
  Period-appropriate torches on posts. Put them on both sides of the courtyard gate first, then
  wherever else they improve the composition and keep the ground walkable (e.g. outside the
  corners or along the approach to the gate). Reuse `fire.js`. Respect the light budget.
  *Accept when:* the `gate` and `walk` views are readable and atmospheric at night without
  the work light.

- [ ] **Step 7: Shaders & post-processing.**
  Tone mapping and color grading for night, bloom on the flames, subtle fog or haze, ambient
  occlusion if affordable, and improved materials (bronze, silver, gold, linen, sand). Optional
  heat shimmer above the altar.
  *Accept when:* every preset looks clearly better than before (compare screenshots before
  and after), with no big frame-rate drop.

- [ ] **Step 8: Starry sky.**
  A dark night sky with a believable star field (varied brightness, a faint Milky Way band, and
  optional subtle twinkle) and maybe a dim moon. It shouldn't overpower the firelight.
  *Accept when:* looking up in `walk` mode shows a convincing desert night sky.

After Step 8, make `?cam=fp` the default and polish the first-person controls (head bob is
optional, plus mouse sensitivity and an on-screen hint for the controls).

## Decisions log

Record interpretive or technical choices here (date, decision, reason).

- 2026-11-04: Cubit = 0.45 m. A common scholarly value.
- 2026-11-04: Flat-roofed Tabernacle with coverings draped over the boards (rabbinic
  tradition), rather than a ridged tent.
- 2026-11-04: Placement follows the two-squares layout: Holy of Holies centered in the western
  50×50 square, altar centered in the eastern square.
- 2026-11-04: Board thickness = 1 cubit (rabbinic tradition; not stated in the text).
- 2026-11-04: Torches are artistic license, added for lighting and atmosphere.
- 2026-11-04: Pillars placed uniformly every 5 cubits around the perimeter (60 total); the
  "4 gate + 3 + 3" count is reconciled by crediting each pillar with one 5-cubit span, so the
  20-cubit gate has posts at z = −10, −5, 0, +5, +10 cubits (one in the middle).
- 2026-11-04: Gate screen and hangings people pass through are non-colliding; gate pillars
  collide. The Tabernacle entrance screen collides while interiors are out of scope.
- 2026-11-04: `top` preset uses a very high camera with a narrow FOV (near-orthographic) so
  proportions can be measured from screenshots.
- 2026-11-04: `?view=walk` implies first-person mode (overrides the "view implies free camera"
  rule for this one preset).
- 2026-11-04: Player radius 0.3 m, walk 1.4 m/s, run 3.5 m/s. WASD works without pointer lock
  (the in-app browser pane refuses pointer lock); mouse look needs the lock.
- 2026-11-04: `walk` spawn is at z = +2.5 cubits, in the gap south of the middle gate pillar.
- 2026-11-05: Courtyard pillar shaft is 5.25 cubits (socket included) plus a 0.3-cubit silver
  capital, so the 5-cubit hanging hung from hooks clears the ground. Sockets 0.8×0.8×0.5 cubits.
- 2026-11-05: Hangings and gate screen hang from silver hooks on the inner side of the pillar
  line. Fillets are silver rods joining adjacent capitals. One bronze peg + cord per pillar,
  staked outward 3 cubits (diagonal at corners). Pegs and cords don't collide.
- 2026-11-05: Gate screen embroidery is geometric only (bands, lozenges, eight-pointed stars).
- 2026-11-05: Shared materials/colors live in `src/scene/materials.js`; textile textures
  (linen, embroidered screen) in `src/scene/textiles.js`. Reuse them.
- 2026-11-05: Altar is hollow, walls 0.35 cubit thick, filled with earth to 0.45 cubit below
  the rim as a hearth (rabbinic). `altar.userData.hearth = {x, y, z, size}` (world meters).
- 2026-11-05: Altar horns 1 cubit tall (rabbinic), curved/tapered. Ledge top at 2.25 cubits,
  projecting 0.6; bronze network hangs from the ledge edge down to 1.5 cubits (halfway).
  Poles run E–W on the north and south sides, 1.5 cubits past the rings.
- 2026-11-05: Utensils lie south of the altar (no colliders). Laver is a reconstructed
  human-scale bronze basin on a foot and stem, rim ≈ 0.9 m.
- 2026-11-05: Step 7 notes: altar bronze seam texture reads a bit brick-like; horns read as
  thin spikes from some angles — soften/thicken when refining materials.
- 2026-11-05: Boards sit in 1-cubit silver sockets (tenons, Rashi on 26:17); walls stay
  10 cubits tall. West wall = 6 boards + 2 corner boards covering the side walls' ends.
- 2026-11-05: All 5 bars per wall shown outside the boards on gold rings (top/bottom rows are
  two half-length bars; middle bar full length).
- 2026-11-05: Entrance pillars stand at x = +0.4 cubits, z = −5…+5; screen hangs from gold
  hooks on their inner side.
- 2026-11-05: Goat-hair side hem at 1.55 cubits (not 1) so the gold boards show above the
  sockets; back hem 0.15 cubit; doubled sixth curtain shown as a 2-cubit front flap; clasp line
  of 50 bronze clasps at x ≈ −21 cubits. Inner linen covering not modelled (invisible outside).
- 2026-11-05: Ram skins (red) and tachash cover the roof only; ram skins droop ~1 cubit over the
  edges, tachash inset 0.6 cubit. 18 bronze tent pins with cords (Ex 35:18), non-colliding.
- 2026-11-05: Step 7 notes: tachash roof reads like grey cobblestones; goat-hair weave and skins
  tile too regularly up close.
- 2026-11-05: Altar fire = 3-layer log-cabin stack of charred logs on a coal bed (the
  *ma'arakhah*) with leaning logs. Acacia texture; the Mishnah's wood types (Tamid 2) not modelled.
- 2026-11-05: Altar fire PointLight (0xff8a3a, 240 cd, decay 2, 1.15 m above hearth) is the only
  shadow caster (1024 cube map, PCFShadowMap — r187 removed PCFSoft). Night fill reduced to
  hemisphere 0.22 / moon 0.16.
- 2026-11-05: `fire.js` fires are GPU-animated, 3 draws each (flames, embers, smoke); smooth
  value-noise flicker. Animated elements expose `group.userData.update(dt, time)`, called by
  main.js each frame.
- 2026-11-05: Step 7 notes: add tone mapping/exposure (surfaces near the fire clip; retune the
  240 cd after); add fog support to the fire ShaderMaterials; fix the thin bright light leak
  along the altar's base edge and soften the hard dark self-shadow square around the altar.
- 2026-11-05: Torches (artistic license): 2.4 m wooden post in a stone cairn with a pitch-soaked
  cloth-wrapped head. 10 torches (positions in `TORCHES`): gate pair, approach pair, east
  outside corners, inside near the east corners (8 with non-shadow point lights, ~28 cd), plus
  the 2 west outside corners (glow only). 9 point lights total; torch fires have no smoke.
- 2026-11-05: Step 7 notes: torch heads' flat orange emissive reads as a pot — make it a dark
  charred wrap with glowing embers/cracks; the approach torch near the walk spawn blows out
  without tone mapping. FPS can't be measured while the browser pane is hidden (throttled);
  use draw calls + frame time from `renderer.info` / a timed render loop instead.
