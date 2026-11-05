# AGENTS.md — Tabernacle

This is the working guide for anyone, human or agent, changing this repo. Read it before any
task.

## Project

A walkable, nighttime 3D reconstruction of the **Tabernacle (Mishkan) of Israel in the
wilderness**, as described in the Torah (Exodus 25–27, 30, 35–40). It runs in the browser with
Three.js.

- **What's built:** the exterior is complete. That includes the courtyard (60 pillars, linen
  hangings, embroidered gate), the bronze altar with its perpetual fire, the laver, and the
  tent with its layered coverings. There are also 10 torches, post-processing and a starry sky.
- **How it's experienced:** the player walks in first person at eye height (1.6 m) and can't
  walk through objects.
- **Not built yet:** the interiors (veil, ark, menorah, table, incense altar).
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
- `npm run build` must pass before every commit. Delete `dist/` afterwards.
- `npm run preview` serves the production build.
- Prefer procedural geometry, materials and textures. Any external asset must be CC0, live in
  `public/assets/`, and be listed in `CREDITS.md`.
- Add npm dependencies only when clearly worth it.

### Three.js r187 gotchas

- `PCFSoftShadowMap` is removed. Use `PCFShadowMap` with `shadow.radius`.
- `THREE.Clock` is deprecated. Use `THREE.Timer`, as `main.js` already does.
- Custom `ShaderMaterial`s need the fog chunks (`fog_pars_*`, `fog_fragment`) and the
  tonemapping/colorspace chunks to match the scene.
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
  config/dimensions.js  every measurement (cubits) + PLAYER, TORCHES
  scene/
    ground.js           procedural sand
    courtyard.js        pillars, fillets, hooks, hangings, gate, pegs/cords (instanced)
    altar.js            hollow bronze altar, horns, ledge, grating, rings, poles, utensils
    altarFire.js        places firewood + fire on altar.userData.hearth
    firewood.js         log stack + coals with glowing cracks
    fire.js             reusable GPU fire: createFire(opts) → {group, light, update, level, uniforms, dispose}
    torches.js          torch posts, wrapped heads, small fires and lights
    tabernacle.js       boards, sockets, bars, entrance pillars + screen
    tentCoverings.js    goat hair drape, ram skins, tachash, clasps
    laver.js            bronze basin on a stand
    lighting.js         night fill (hemisphere + moon); ?light=work adds bright fill
    sky.js              star dome, Milky Way, moon
    materials.js        shared COLORS, BRONZE/SILVER/GOLD/... materials, addMacroVariation, addFireBounce
    textiles.js         procedural linen, embroidered screen, goat hair, skin textures
    bronzeParts.js      geometry merge helpers
    colliders.js        2D box and circle colliders, resolveCircle
  camera/
    devCamera.js        free orbit camera + PRESETS
    firstPerson.js      pointer-lock walking, collision, head bob, simulate()
  render/
    postfx.js           composer: MSAA render, bloom, night grade + heat shimmer, output
    environment.js      generated night environment map
  debug/params.js       URL parameters
  debug/overlay.js      grid, axes, fps/draw-call readout
```

### Conventions

- Each scene module returns a `THREE.Group`. It exposes `userData.colliders` (2D shapes on the
  ground plane, from `colliders.js`) and, if animated, `userData.update(dt, time)`. `main.js`
  wires both up automatically.
- **Reuse** the shared materials in `materials.js` and the textures in `textiles.js`. Use
  `addMacroVariation` on large tiled surfaces.
- Use **InstancedMesh** or merged geometry for repeated parts. The current scene draws 78–102
  times per frame.
- **Light budget:** 10 point lights, and only one shadow caster, the altar fire. Don't add
  shadow-casting lights; new glows should use emissive materials, and bloom picks up values
  above 2.0.
- Dispose of anything you replace. Don't create new objects inside the render loop.

## URL parameters & presets

| Param | Effect |
|---|---|
| *(none)* | First person at the `walk` spawn (the default experience) |
| `?view=<preset>` | Free camera at a preset (`walk` stays first person) |
| `?cam=fp` / `?cam=free` | Force a camera mode (always wins) |
| `?light=work` | Bright neutral fill so geometry is readable. Always also check real night lighting |
| `?debug=1` | Grid, axes, fps/draw-call readout |
| `?fx=0` | Turn off post-processing |
| `?tm=aces\|agx\|neutral\|none`, `?exposure=<n>` | Tone mapping overrides |
| `?bob=0` | Turn off head bob |

The presets are in `PRESETS` in `devCamera.js` and are fixed, so screenshots can be compared:

- **Overview:** `top` (near-orthographic plan), `iso`
- **Courtyard:** `gate`, `corner`, `pillar`
- **Altar and laver:** `altar`, `altartop`, `altarlow`, `fire`, `laver`
- **Tent:** `tent`, `tentback`, `tentroof`, `tentcorner`
- **Torches and sky:** `torch`, `sky`
- **First person:** `walk`

Add presets when a task needs a new view.

## Debug handle & verification

Every visual change is checked with screenshots in the built-in browser
(`mcp__Claude_Browser__*`) at `scale: 0.5`.

`window.__tabernacle` exposes `THREE, scene, camera, renderer, colliders, params, rig, fx,
composer, fires`.

- **Walking:** `rig.simulate({f, b, l, r, run}, seconds)` walks the player at 60 Hz and
  returns `{x, z}`. Other rig calls: `rig.reset()`, `rig.getPosition()`, `rig.setPosition()`
  and `rig.setYaw()`. Example: `rig.simulate({f: true}, 3)` walks 4.2 m west from the spawn.
- **Performance:** the browser pane is usually hidden, which slows `requestAnimationFrame` to
  about 1 fps, so the fps readout is meaningless. Measure frame time by timing N
  `composer.render()` calls, followed by `renderer.getContext().finish()`, and report draw
  calls. `renderer.info.autoReset` is false; the loop resets it each frame.
- **Shaders:** check `renderer.info.programs` for programs whose `diagnostics.runnable` is
  false.
- **Stale frames:** a screenshot of the hidden pane can show a frame from before hot reload.
  Reload the page, or call `fx.render(t)` to force a fresh frame.
- **Stale console errors:** errors from mid-edit hot reloads can stay in the console. Reload
  before trusting `read_console_messages`.
- **Pointer lock:** the pane refuses pointer lock, so mouse look can't be tested there. WASD
  works without it.

## Commits

- Commit at logical stopping points, after `npm run build` passes and the console is clean.
- Short imperative subject line, then a body saying what changed and why. End with the
  attribution line the session gives you.
- Never push, rewrite history or amend unless the user asks.
