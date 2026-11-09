# AGENTS.md — Tabernacle

This is the working guide for anyone, human or agent, changing this repo. Read it before any
task.

## Project

A walkable, nighttime 3D reconstruction of the **Tabernacle (Mishkan) of Israel in the
wilderness**, as described in the Torah (Exodus 25–27, 30, 35–40). It runs in the browser with
Three.js.

- **What's built:** the whole site. The courtyard (59 pillars, linen hangings that glow where
  firelight passes through them and stir in the wind, an open gate with embroidered drapes
  tied back), the bronze altar with its perpetual fire (turbulent GPU flames, sparks, embers
  and smoke), the laver, and the tent with its layered coverings. Inside the tent: the veil,
  menorah, table of showbread, incense altar, and the ark with its mercy seat and cherubim in
  the Holy of Holies, with a faint warm haze, incense under the ceiling and dust in the
  lamplight. The tent door is half open: its south half is drawn across, the north half tied
  back. There are also 6 torches, the pillar of fire over the Holy of Holies, sand with gentle
  relief, trodden paths, rocks and scrub, the camp of Israel around the court (thousands of
  instanced tents, Num 2–3), distant granite ridges, a starry sky, ground haze with the fires'
  glow in the air, baked contact AO, and a post chain (bloom, eye adaptation, colour grade,
  lens touches, sharpening).
- **How it's experienced:** the player walks in first person at eye height (1.6 m) and can't
  walk through objects. On a phone or other touch device (`src/mobile/`) the view is forced to
  landscape (rotated by CSS when the phone is upright), walking is a thumbstick and drag-to-look,
  and a lighter quality tier is used (`src/config/quality.js`; `docs/DECISIONS.md` "Mobile").
  Desktop must stay unchanged by mobile work.
- **Accuracy to the text comes first.** Biblical reference: `docs/SPEC.md`. The choices
  actually made, and why: `docs/DECISIONS.md`. Record any new interpretive or technical
  choice there.

## Docs & skills

| Path | What |
|---|---|
| `docs/SPEC.md` | What the text says about each object; defaults where it's silent |
| `docs/DECISIONS.md` | Current decisions by topic (interpretation, sizes, lighting, rendering, performance baseline) |
| `docs/plans/` | The active plan, if any. Finished plans are in `docs/plans/archive/` |
| `.claude/skills/write-plan` | Turn a chunk of work into a plan of steps for sub-agents |
| `.claude/skills/run-plan` | Run that plan as an orchestrator: fresh sub-agents, independent checks, commits |

## Tech stack & commands

- **Vite** (vanilla JS, ES modules) and **Three.js r187**. No UI framework.
- Import addons from `three/addons/...`.
- `npm run dev` starts the dev server. `.claude/launch.json` config `vite` uses port 5173; it
  moves to 5174 when 5173 is taken.
- `npm run lint` (ESLint, `eslint.config.js`) and `npm run build` must pass before every commit.
  Delete `dist/` afterwards. Lint rules: no file over 1000 lines of code (blank lines and comments
  don't count); split a module before it gets there.
- `npm run preview` serves the production build.
- Testing on a phone (same Wi-Fi): `.claude/launch.json` config `vite-lan` serves the dev server on
  the LAN at port 5180; `vite-lan-prod` (`npm run preview:lan`) builds and serves the production
  build at port 5181. Add `?fps=1` for a frame readout. Delete `dist/` when done.
- Prefer procedural geometry, materials and textures. Any external asset must be CC0, live in
  `public/assets/`, and be listed in `CREDITS.md`.
- Add npm dependencies only when clearly worth it.

### Three.js r187 gotchas

- `PCFSoftShadowMap` is removed. Use `PCFShadowMap` with `shadow.radius`.
- `THREE.Clock` is deprecated. Use `THREE.Timer`, as `main.js` already does.
- Custom `ShaderMaterial`s need the fog chunks (`fog_pars_*`, `fog_fragment`) and the
  tonemapping/colorspace chunks to match the scene. The fog chunks are replaced by
  `render/atmosphere.js` (haze and glows); `fog_vertex` needs a `vec4 mvPosition`, additive
  sprites use `fogAmount()` from `FOG_ADDITIVE_GLSL`, and materials get the haze uniforms from
  `applyAtmosphere` in `main.js` (anything added after it reads plain FogExp2).
- A NaN or negative `pow()` in a shader spreads into black squares once bloom is on. Clamp
  values first.

## Units & orientation

- **1 unit = 1 meter.** Every biblical measurement lives in `src/config/dimensions.js` **in
  cubits** and is converted with `m()` (`CUBIT = 0.45`). Never hard-code meters for biblical
  sizes. Non-biblical values (`PLAYER`, `TORCHES` post height) can be in meters, but say so.
- Y-up. **East = +X, North = −Z.** The gate and the tent entrance face east. The origin is the
  center of the courtyard.

## Code map

```
src/
  main.js               renderer, scene assembly, per-frame loop, window.__tabernacle
  config/dimensions.js  every measurement (cubits, incl. ASH_HEAP) + PLAYER, TORCHES, CAMP (layout, m)
  config/quality.js     QUALITY tier (high | mobile), read at startup: pixel ratio cap, MSAA, bloom start/levels, fire steps, shadow and probe sizes, dynamic resolution, audioHrtf
  scene/
    ground.js           procedural sand on the relief: cool night tone, darker plain away from the court, grain sparkle, trodden paths + footprints, isTrodden, the blood round the altar (bloodTexture)
    terrain.js          groundHeight(x, z) + GLSL twin: gentle dunes (sand mesh baked in ground.js) from ~10 m outside the court, lanes kept near-level
    dustMotes.js        dust drifting in the firelight round the altar, lit torches and menorah (1 instanced draw, lit by the atmosphere's glow sources)
    groundScatter.js    rocks, grass tufts, shrubs (4 kinds in 24 spatial tiles, culled by box each frame; mobile drops far ones; seeded clumps, keep-outs, removeWhere)
    camp.js             camp of Israel (Num 2-3): ~4,500 tents, 3 variants x near/far LOD = 6 instanced draws, grid collider
    courtyard.js        pillars, fillets, hooks, hangings, open gate, pegs/cords (instanced)
    drape.js            addGatheredDrape: pleated, tied-back screen halves (gate and tent door)
    cloth.js            addCloth: firelight through cloth, fibre sheen, wind (WIND, aWind attrs, addWindShadow)
    altar.js            hollow bronze altar, top grate, ember bed, horns, ledge, network, rings, poles, utensils
    altarFire.js        places the coal bed + fire on altar.userData.hearth
    ashHeap.js          the place of the ashes east of the altar (Lev 1:16): one lumpy mound, canvas ash texture
    firewood.js         log stack + coals with glowing cracks (the altar uses coals only)
    fire.js             reusable GPU fire: createFire(opts) → {group, light, update, level, uniforms, dispose}; re-exports the pieces below
    fireCommon.js       shared GLSL (NOISE_GLSL, BILLBOARD_GLSL, FOG_ADDITIVE_GLSL, FIRE_RAMP_GLSL, FLAME_GLSL: the flame language of fireVolume.js and the pillar, HASH_GLSL) + helpers (rng, randAttribute, fogUniforms, noise1, createNoiseTexture: tiling 64³ 3D noise)
    fireVolume.js       createFlames: a fire's flame body, raymarched in a tight cylinder (buoyant advected 3D noise, temperature ramp, optional grate)
    fireFlames.js       createLampFlames (oil-lamp flames)
    fireParticles.js    a fire's smoke puffs, sparks, embers and ash in one instanced draw (createFireParticles)
    fireSmoke.js        createIncenseSmoke: the incense altar's thin ribbon thread
    torches.js          torch posts, wrapped heads, small fires and lights
    pillarOfFire.js     pillar of fire over the Holy of Holies: a mass of altar-like flames (FLAME_GLSL) + light shaft (one volumetric draw), embers, its light
    tabernacle.js       boards, sockets, bars, door beam + screen (south half drawn across, north tied back)
    tentCoverings.js    goat hair drape, ram skins, tachash, clasps, stakes, cords, silver hem rings
    laver.js            bronze basin on a stand
    lighting.js         night fill (hemisphere + moon); ?light=work adds bright fill
    interiorLight.js    per-fragment inside/outside light mask, warm room ambient (INTERIOR)
    ao.js               AO without a screen pass: baked ground contact AO (userData.aoShapes), crease AO (addBoxAO); global contact/room terms live in interiorLight.js
    menorah.js          menorah (merged gold), 7 lamp flames, the Holy Place's light
    showbread.js        table of showbread: table, poles, vessels, two stacks of 6 loaves
    showbreadOrnament.js the table's relief (crowns, frame scroll, ring plates, leg collars, vines, feet), merged into its gold mesh
    incenseAltar.js     gold altar of incense: horns, crown, rings, poles, coals, smoke wisp
    incenseOrnament.js  the incense altar's relief (crown, plinth, panels with an almond tree, frieze, ring plates, horn calyces), merged into its gold mesh; incenseGroundBoxes
    veil.js             the woven cherubim veil, its gold hooks and 4 silver-socketed pillars
    ark.js              ark, mercy seat, two hammered cherubim, poles
    arkOrnament.js      the ark's relief ornament (crown, panels, scrollwork, frieze), merged into its gold mesh
    ornament.js         shared relief helpers (leafGeo, stemGeo, beadRod, Relief: rosette/palmette/bud, runningScroll, sweepRect, faceMatrix)
    sky.js              sky dome (drawn after the opaques, depth-tested): stars, Milky Way, airglow, meteors, shaft-lit high haze (no moon)
    horizon.js          distant granite ridges: GLSL composited by the sky shader (3 layers, no draw of their own)
    materials.js        shared COLORS, BRONZE/SILVER/GOLD/... materials, addMacroVariation, addFireBounce
    metalWear.js        addBronzeWear (hammer, edges, verdigris, soot), addAltarBlood, addSilverWear, addWoodGrain, addBoardGold,
                        addGoldWear (relief-ground/corner grime, handling smudges, dust/crumbs, soot; local masks)
    textiles.js         shared canvas helpers (seeded, paintWeave, hex, grey); linen, goat hair, skin, tent cloth textures
    embroidery.js       embroidered gate and door screen textures (colour + bump)
    cherubimWeave.js    woven cherubim and garden motifs for the ceiling and veil
    bronzeParts.js      geometry merge helpers
    colliders.js        2D box, circle, oriented-box and spatial-grid colliders, resolveCircle
  camera/
    devCamera.js        free orbit camera + PRESETS
    firstPerson.js      pointer-lock walking, collision, head bob, simulate()
  render/
    postfx.js           composer: MSAA render → bloom → grade → OutputPass (ACES) → finish; `fx` API
    bloom.js            MipBloomPass: Karis 13-tap prefilter, soft-knee gate, 7-level down/up mip chain
    exposure.js         eye adaptation on the GPU: 64×32 log-lum → 1×1 ping-pong adapted exposure
    grade.js            GradeShader (shimmer, CA, bloom + lens dirt, exposure, tint, vignette, grain),
                        FinishShader (S-curve, cool black lift, CAS sharpen), lens-dirt texture
    environment.js      generated night environment map
    atmosphere.js       replaces three's fog chunks: FogExp2 + ground haze + analytic glow of the fires in the air; inside the tent its own air (room haze, menorah glow, incense under the ceiling) (ATMO uniforms, applyAtmosphere)
  audio/
    engine.js           sound lifecycle: prefetch on idle after the loader, AudioContext created in the enter gesture (unlock), listener follows the camera (update; wind, insects and fires tick at 10 Hz; a visitor muted at enter decodes only on the first unmute), setInside(depth, pastVeil) (metres into the tent: the outside muffle eases from 100% at the door to 50% 2 m in, 25% past the veil), mute (button, M, localStorage; the title screen's return fades it out like M, M is ignored there), suspend when hidden, renderOffline check
    graph.js            createGraph(any BaseAudioContext): buses fire/wind/insects -> outside (lowpass + gain, the tent muffle) -> master; analysers, graphLevels
    fires.js            positional fires (FIRE_KINDS): a PannerNode per fire (altar, 6 torches, pillar) with its loop (random offset, gain/rate drift, flicker nudge) and random crackles from the pops sprite scheduled 0.2 s ahead (inaudible sources skipped, <= 6 live)
    wind.js             wind bed: the stereo loop, gain + lowpass on a gust envelope from the cloth's WIND field (gustAt)
    insects.js          night insect bed: the stereo loop (random offset, +/-1.5 dB drift) hushed to 40% within 2 m of the altar fire (full from 10 m; torches don't hush it) and to silence 1.5 m into the tent
    muteButton.js       the speaker button (inside #app; bottom-right on desktop, beside the menu button on mobile)
  mobile/device.js      mobile mode, forced landscape: isMobile, rotation, getViewport() (logical landscape size), toLogical(x, y) (screen point -> rotated frame), onViewportChange(cb); sizes/rotates #app
  mobile/touchControls.js mobile: floating thumbstick (left 40%) + drag to look, by pointerId, through toLogical()
  debug/params.js       URL parameters
  debug/overlay.js      grid, axes, fps/draw-call readout; createFpsReadout (`?fps=1`, inside #app)
```

### Conventions

- Each scene module returns a `THREE.Group`. It exposes `userData.colliders` (2D shapes on the
  ground plane, from `colliders.js`), `userData.aoShapes` (its footprints for the baked ground
  contact AO, from `ao.js`) and, if animated, `userData.update(dt, time)`. `main.js` wires them
  up automatically.
- **Reuse** the shared materials in `materials.js` and the textures in `textiles.js`, `embroidery.js` and `cherubimWeave.js`. Use
  `addMacroVariation` on large tiled surfaces.
- Use **InstancedMesh** or merged geometry for repeated parts. The current scene draws 81–143
  times per frame (`camp` 143, `iso` 143, `gate` 139, `horizon` 81; interior views 99–117; the
  camp's 6 are in every view; the ground scatter's tiles in view add 0–20 over its old 4). Baseline and frame times: `docs/DECISIONS.md` "Performance baseline".
- **Light budget:** 8 point lights (altar fire + fill, 4 torches, the menorah, the pillar of fire), and only one
  shadow caster, the altar fire. Don't add shadow-casting lights; new glows should use emissive
  materials (bloom picks up values above 2.0) and, for light in the air, the atmosphere's glow
  sources (8 outside slots, all used, plus the menorah inside; `render/atmosphere.js`).
- **Fog:** every fogged material gets the atmosphere through the replaced fog chunks. Custom
  `ShaderMaterial`s include the fog chunks (additive ones use `FOG_ADDITIVE_GLSL`) and must be
  in the scene when `main.js` calls `applyAtmosphere`. Above 80 m the fog thins with height
  (only `top`).
- **Interior mask:** `interiorLight.js` patches every `MeshStandardMaterial` so exterior lights,
  sky fill and the env map stay out of the tent and the menorah stays in. New lit materials are
  covered automatically if they're in the scene when `main.js` calls `applyInteriorMask`.
- **Ground height:** the court and ~10 m round it are level (y = 0); beyond, the sand has gentle
  relief. Anything standing on the ground out there takes its y from `groundHeight(x, z)`
  (`terrain.js`); the first-person eye is 1.6 m above it.
- Dispose of anything you replace. Don't create new objects inside the render loop.
- **Sound:** every new sound is a file in `public/assets/audio/manifest.json` (loops with
  `loopStart`/`loopEnd`, one-shots as `slices`) and plays through one of the buses in
  `audio/graph.js` (fire, wind, insects), never straight to the destination. Decode each file
  once (`audio.buffers`) and share it; nothing audio is fetched before the loader goes, and no
  `AudioContext` is made outside a user gesture.

## URL parameters & presets

| Param | Effect |
|---|---|
| *(none)* | First person at the `walk` spawn (the default experience) |
| `?view=<preset>` | Free camera at a preset (`walk` stays first person) |
| `?cam=fp` / `?cam=free` | Force a camera mode (always wins) |
| `?light=work` | Bright neutral fill so geometry is readable. Always also check real night lighting |
| `?debug=1` | Grid, axes, fps/draw-call readout |
| `?fx=0` | Turn off post-processing |
| `?ae=0` | Hold the eye-adaptation exposure at 1 |
| `?lens=0` | Turn off chromatic aberration, lens dirt and sharpening |
| `?tm=aces\|agx\|neutral\|none`, `?exposure=<n>` | Tone mapping overrides |
| `?bob=0` | Turn off head bob |
| `?wind=0` | Still the cloth (wind strength 0; `scene/cloth.js`) |
| `?ao=0` | Turn off contact, room and crease ambient occlusion (`window.__tabernacle.ao` holds the strength uniforms) |
| `?skyt=<s>` | Pin the sky's clock (twinkle, meteors, haze drift); e.g. `?view=sky&skyt=340.03` shows a meteor |
| `?mobile=1` / `?mobile=0` | Force mobile mode on or off (default: on for coarse-pointer touch devices). Mobile mode forces landscape: in portrait `#app` is rotated 90° by CSS (`mobile/device.js`). Test in the browser pane with `resize_window` 375×812 |
| `?rot=cw\|ccw` | Which way the phone is turned in portrait (default `ccw`: top of the phone to the left, so the content's top edge is the screen's right edge) |
| `?quality=high\|mobile` | Render quality tier (`config/quality.js`; default `mobile` in mobile mode, else `high`). `high` is the desktop exactly |
| `?qk=knob:value,...` | Override single quality knobs for A/B tests, e.g. `?qk=msaa:0,pixelRatio:1` (booleans 0/1; `dynamicResolution:1` turns on dynamic resolution). Switches: `scatter:0` hides the rocks and scrub; `rockFar`, `pebbleFar`, `grassFar`, `shrubFar` (m, 0 = off) set the scatter's distance culling; `rockDetail`, `pebbleDetail` set the stones' icosphere subdivisions; `audioHrtf:0` uses equalpower panning |
| `?fps=1` | Small readout (rolling rAF frame time, fps, draw calls, pixel ratio, tier) in `#app`'s rotated safe area; works on desktop too |
| `?audio=0` | No sound at all: no audio fetch, no `AudioContext`, no speaker button (`src/audio/`) |
| `?haze=0` | Plain FogExp2: no ground haze, no glow of the fires in the air and no interior haze (`render/atmosphere.js`) |

The presets are in `PRESETS` in `devCamera.js` and are fixed, so screenshots can be compared:

- **Overview:** `top` (near-orthographic plan from 270 m; the pillar of fire's head covers the
  Holy of Holies), `iso`
- **Courtyard:** `gate`, `corner`, `pillar`, `ground` (low, outside the south hangings, across rocks and scrub), `rocks` (close on a rock outside the south hangings)
- **Altar and laver:** `altar`, `altartop`, `altarlow`, `altarnorth` (eye height NE of the altar, down on its north side: the blood on the sand and the lower walls), `ashes` (the ash heap east of the altar from the south-east), `fire`, `fireclose` (eye height ~2 m out
  from the altar's south-east horn, on the flames), `laver`, `laverclose`
- **Tent:** `tent`, `tentback`, `tentroof`, `tentcorner`, `coverings` (low from the court's NE:
  the stepped coverings and stakes along the north side), `coveringsw` (the same from the SW),
  `hemtie` (close, ~0.5 m from a goat-hair cord tie on the north side: silver ring, patch,
  loop and knot)
- **Interior:** `holyplace`, `ceiling`, `veil`, `menorah`, `table`, `incense`, `smoke` (the
  incense altar's smoke from the side), `ark`, `mercyseat` (close above the lid from the east: the blood
  between the cherubim), `holyofholies`
- **Torches and sky:** `torch`, `sky`, `firepillar` (the pillar of fire and its shaft from the courtyard),
  `firepillarfoot` (its tapered foot), `firepillarfar` (the whole shaft from the desert)
- **Camp:** `camp` (high oblique from the east: Levites' rows, tribal blocks, lanes), `campwalk`
  (eye height outside the gate, looking north-west over the nearest tents)
- **Horizon:** `horizon` (eye height just outside the court's NW corner, looking down the
  camp's diagonal lane to the distant ridges)
- **First person:** `walk`

Add presets when a task needs a new view.

## Debug handle & verification

Every visual change is checked with screenshots in the built-in browser
(`mcp__Claude_Browser__*`) at `scale: 0.5`.

`window.__tabernacle` exposes `THREE, scene, camera, renderer, colliders, params, rig, fx,
composer, menorah, interior, updateInteriorVisibility, probe, sky, pillarOfFire, groundScatter, camp,
fires, atmosphere, dust, ao, groundAO, wind, quality, setPixelRatio, updateDynamicResolution, audio, inside`. `inside` is true when the camera is inside the tent (what `fx.setInside` gets).
`audio` (null with `?audio=0`) is the sound engine: `ctx` (null until the enter click/tap), `graph`,
`buses`, `buffers`, `manifest`, `wind`, `fires` (`sources` [{name, kind, pos, panner, distance}],
`oneShots` live crackles, `peakOneShots`, `distances()`), `inside` (0/1/2), `muted`, `mute(bool)`,
`unlock()`, `panningModel`,
`levels()` (RMS dBFS per bus and master from the analysers, read on demand; −120 = silence) and
`renderOffline(seconds, step, {inside})` (renders the graph, wind and fires at the camera in an
`OfflineAudioContext`, ticking at 10 Hz like the live loop; returns `{t, gust, wind, fire, master,
oneShots}` samples, with power-averaged `.fire`/`.wind`/`.master`, `.peakOneShots` and
`.distances` on the array; works without a gesture). Bus analysers are before the outside muffle,
so read the tent's muffle on `master`. In the pane a real click
(`computer` left_click) on the title starts the context; with the free camera (`?view=`) a press
on the canvas does. `quality` is the active `QUALITY` tier; `setPixelRatio(pr)` resizes the renderer and post chain; `updateDynamicResolution(frameMs)` steps the dynamic resolution by hand. `wind` holds the cloth wind uniforms (`uWindTime`, `uWindDir`, `uWindStrength`; set `uWindTime` then `fx.render(t)` to compare wind frames). `ao` holds the AO strength uniforms (`AO` in `scene/ao.js`), `groundAO` the baked ground texture and its bake time. `atmosphere.uniforms`
are the haze/glow tuning uniforms (`ATMO`; the `uAtmoIn*` ones are the tent's air),
`atmosphere.sources[i].gain` each glow's strength and `atmosphere.interior` the menorah source
and the room/incense haze colour factors. `dust.userData.uniforms` tunes the motes. `probe`
is the gold room's reflection probe (`probe.capture()` re-captures), `sky`, `pillarOfFire`,
`groundScatter` and `camp` their groups. `interior` is the interior
light uniforms (`INTERIOR`); `updateInteriorVisibility()` shows or hides the interior meshes by
camera position (main.js calls it at startup, on `rig.apply`/`reset`/`setPosition`, and each frame).

- **Walking:** `rig.simulate({f, b, l, r, run}, seconds)` walks the player at 60 Hz and
  returns `{x, z}`. Other rig calls: `rig.reset()`, `rig.getPosition()`, `rig.setPosition()`
  and `rig.setYaw()`. Example: `rig.simulate({f: true}, 3)` walks 4.2 m west from the spawn.
- **Touch (mobile mode):** `rig.touch` is the touch controls (`null` on desktop): `move`
  `{x, y, run}` is the live stick input, `releaseAll()`, `setEnabled()`. `rig.simulate` also takes an
  analog vector, e.g. `rig.simulate({y: 1}, 3)` (x right, y forward, magnitude = fraction of
  walk speed; add `run: true` to run). To drive it, hide the title (`.fp-intro` `.click()`),
  dispatch `PointerEvent`s (`pointerdown` on the canvas, `pointermove`/`pointerup` on `window`,
  each with a `pointerId`; client coordinates are physical, so invert `toLogical` when rotated),
  then step `rig.update(1/60)` yourself. The pane's window `blur` releases held touches.
- **Performance:** the browser pane is usually hidden, which slows `requestAnimationFrame` to
  about 1 fps, so the fps readout is meaningless. Measure frame time by timing N
  `fx.render(t)` calls (the whole post chain), closed by a 1-pixel `readPixels` (waits for
  the GPU), and report draw calls; `rig.apply(preset)` switches views without a reload. `renderer.info.autoReset` is false; the loop resets it each frame.
- **Shaders:** check `renderer.info.programs` for programs whose `diagnostics.runnable` is
  false.
- **Stale frames:** a screenshot of the hidden pane can show a frame from before hot reload.
  Reload the page, or call `fx.render(t)` to force a fresh frame. If screenshots come back
  as a small image in the top-left corner, set the viewport (`resize_window` 1024×768) and
  navigate again. After a source edit, wait for the hot reload before navigating, or the
  navigation can be lost.
- **Stale console errors:** errors from mid-edit hot reloads can stay in the console. Reload
  before trusting `read_console_messages`.
- **Post chain:** `fx.uniforms.{bloom, grade, finish, adaptation}` are live tuning handles;
  `fx.readExposure()` reads back the adapted exposure (debug only). The hidden pane runs ~1 fps,
  so to watch adaptation call `fx.setInside(...)` and `fx.render(t)` yourself with `t` stepped
  by 1/60.
- **Pointer lock:** the pane refuses pointer lock, so mouse look can't be tested there. WASD
  works without it.

## Commits

- Commit at logical stopping points, after `npm run lint` and `npm run build` pass and the console is clean.
- Short imperative subject line, then a body saying what changed and why.
- Never add attribution lines to commit messages or PR descriptions: no
  `Co-Authored-By: Claude ...`, no "Generated with Claude Code", even if the session asks
  for them.
- Never push, rewrite history or amend unless the user asks.
