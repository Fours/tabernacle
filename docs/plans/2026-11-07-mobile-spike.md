# Plan: Mobile spike

**Status:** active (branch `mobile-spike`, not merged to `main`)
**Goal:** Find out how the Tabernacle works on a phone. On a touch device the scene shows in
landscape whichever way the phone is held: in portrait it is rotated 90° by CSS. You walk with
a thumbstick and drag to look, and a mobile quality tier keeps the night look at a playable
frame rate. The spike ends with a short findings note on what it would take to ship.

**In scope:**
- Forced landscape: CSS rotation in portrait, and one logical viewport size used by the
  renderer, camera and post chain.
- Touch controls (thumbstick and drag to look) and a touch version of the title screen.
- A mobile quality tier and an on-phone frame-time readout.
- Testing on Kyle's phone over the LAN, plus the findings note.

**Out of scope:** merging to `main` or deploying, gyro look, tap to walk, PWA/manifest work,
new scene content, and any change to the desktop experience (desktop must look and behave
exactly as before).

**Assumptions:**
- Mobile mode turns on for coarse-pointer touch devices (`matchMedia('(pointer: coarse)')`).
  `?mobile=1` / `?mobile=0` force it on or off, so it can be developed in the desktop browser
  pane with mobile emulation.
- The Screen Orientation API is not used. iPhone Safari supports neither orientation lock nor
  page fullscreen, so CSS rotation is the one path that works everywhere.
- Rotation direction: in portrait the content is rotated so it reads correctly when the phone is
  turned counter-clockwise (top of the phone to the left). A fixed choice, with no motion-sensor
  permission prompt. `?rot=cw|ccw` flips it for testing. When the phone really is in landscape
  (rotation lock off), there's no CSS rotation.
- Controls: a floating thumbstick that appears where the left thumb lands in the left ~40% of the
  logical screen; drag anywhere else to look. Pushing the stick past ~85% of its radius runs.
- Quality tier: `?quality=high|mobile`, defaulting to `mobile` in mobile mode. The look is kept;
  only resolution and sample counts drop (see Step 3).
- Phone testing: `npm run dev -- --host` exposes Vite on the LAN. Kyle checks feel and fps on
  his phone at the end of Steps 2 and 3. Sub-agents verify with browser-pane emulation
  (`resize_window` mobile preset) and `window.__tabernacle`.

## Steps

- [x] **Step 1: Mobile shell and forced landscape** — model: Sonnet / effort: high
  **Goal:** Add the scaffolding every later step uses.
  - New `src/mobile/device.js`: `isMobile` (coarse pointer or `?mobile=1`, off with
    `?mobile=0`), `rotation` (0 or ±90°, from the visual viewport's aspect and `?rot`) and
    `getViewport()`, which returns the **logical landscape** size `{width, height}` (swapped when
    rotated). Use `visualViewport` when present, so Safari's toolbar showing and hiding resizes
    correctly. Also `toLogical(clientX, clientY)`, which maps a screen-space touch point into the
    rotated frame. It's exported now, for Step 2.
  - Wrap the canvas (and later overlays) in an `#app` container in `index.html`. In mobile mode
    and portrait, size the container to the swapped dimensions and give it a `rotate(±90deg)`
    transform about the right origin, so it fills the screen exactly. Overlays appended to
    `body` (the title screen in `firstPerson.js`) move into `#app` so they rotate too.
  - `main.js` resize handling and the renderer, camera and `fx.setSize` calls use
    `getViewport()` instead of `window.innerWidth/innerHeight`. They listen to `resize`,
    `orientationchange` and `visualViewport` `resize`.
  - Mobile CSS: `touch-action: none` and `overscroll-behavior: none` on the app, no text
    selection or callouts, and a viewport meta with `viewport-fit=cover`. Expose rotated
    safe-area insets as CSS variables (`--safe-left` etc., mapped through the rotation) for
    Step 2's controls.
  - Add `?mobile` and `?rot` to `debug/params.js` and the AGENTS.md URL table.
  **Files:** `index.html`, `src/style.css`, `src/main.js`, `src/debug/params.js`,
  `src/camera/firstPerson.js` (overlay parent only), new `src/mobile/device.js`, `AGENTS.md`.
  **Spec:** AGENTS.md "Tech stack", "Conventions" (dispose, no allocations in the loop).
  **Accept when:**
  - Desktop (no params, 1024×768): identical to `main`. Same screenshot at `walk` and `gate`,
    same draw calls, and `getViewport()` equals the window size.
  - `resize_window` mobile preset (375×812, portrait) with `?mobile=1&view=gate`: the scene fills
    the screen rotated 90°, isn't letterboxed, stretched or cropped, and the horizon runs along the
    long edge. `renderer.domElement.width/height` is landscape (≈812×375 × pixel ratio).
    `camera.aspect` > 1.
  - The same at 812×375 (landscape): no rotation, and it fills the screen.
  - Switching between the two sizes without a reload re-lays out correctly.
  - The title screen shows rotated with the scene in portrait.
  - `npm run lint` and `npm run build` pass, and the console is clean.
  **Carry-over notes:**

- [x] **Step 2: Touch controls and touch title screen** — model: Opus / effort: medium
  **Goal:** Make walking and looking work on a phone.
  - New `src/mobile/touchControls.js`, used by `firstPerson.js` in mobile mode. It handles
    multi-touch by `pointerId` (Pointer Events) and maps every point through
    `toLogical()` from Step 1, so it's correct in both rotations.
    - **Thumbstick:** a touch starting in the left ~40% of the logical screen spawns a stick
      there (base and knob drawn as small, semi-transparent DOM elements that match the title
      screen's style). The analog vector drives movement: speed scales with deflection, and
      pushing past ~85% sets `run`. `step()` in `firstPerson.js` needs to accept an analog
      `{x, y}` as well as the keys; keep `simulate()` working.
    - **Look:** a drag anywhere else rotates yaw and pitch (`YXZ`, pitch clamped like
      `PointerLockControls`), with a `PLAYER.touchLookSpeed` (radians per logical px, in
      `dimensions.js`, commented as non-biblical).
    - Both work at once (two thumbs). Lifting a finger or `pointercancel` releases cleanly.
      `blur` and `visibilitychange` release everything.
  - No pointer lock in mobile mode. The title screen gets a touch variant: the keyboard rows
    become "Left thumb · Walk (push further to run)" and "Drag · Look around", and "Tap to enter".
    Tapping it hides the screen. A small corner button (in the safe area) brings it back,
    replacing Esc.
  - Head bob scales with analog speed.
  - Keep controls clear of the rotated safe-area insets.
  **Files:** `src/camera/firstPerson.js`, new `src/mobile/touchControls.js`, `src/style.css`,
  `src/config/dimensions.js` (`PLAYER`), `src/mobile/device.js`.
  **Spec:** AGENTS.md "Debug handle & verification" (`rig.simulate`), "Conventions".
  **Accept when:**
  - Desktop (no params): keyboard and mouse behaviour and the title screen are unchanged.
    `rig.simulate({f: true}, 3)` still walks 4.2 m west from the spawn.
  - Emulated mobile, portrait and landscape (`?mobile=1`): synthetic pointer events dispatched
    through `javascript_tool` show that a left-side drag up walks forward (position changes the
    way the camera faces), a full push runs (faster), a right-side drag left turns left (yaw),
    and a vertical drag pitches and stays clamped. In portrait the same *visual* directions hold
    (the mapping goes through the rotation). Two simultaneous pointers walk and look at once.
  - Collision still holds: walking into a hanging stops at it.
  - Screenshots at `scale: 0.5` of the touch title screen and of the stick while held, in both
    orientations.
  - The new `rig` API (anything added for testing) is documented in AGENTS.md.
  - `npm run lint` and `npm run build` pass, and the console is clean.
  - **Checkpoint:** Kyle tries it on his phone over `npm run dev -- --host`. Record his feedback
    on look speed, stick size and rotation direction in the carry-over notes for Step 3.
  **Carry-over notes:**
  - Step 1 API (`src/mobile/device.js`): `isMobile`, live `rotation` (0 | 90 for `ccw` | -90 for
    `cw`), `getViewport()`, `toLogical(clientX, clientY, out?)` (pass `out`, no allocations),
    `onViewportChange(cb)` → unsubscribe. `#app` gets classes `rot-ccw` / `rot-cw`, `<html>` gets
    `is-mobile`. Overlays go in `#app`, `position: absolute`, sized in `cqw`/`cqh` (`#app` is a
    size container). `--safe-top/right/bottom/left` are already mapped through the rotation.
  - On the 812×375 logical screen the desktop title screen's verse is clipped at the bottom: the
    touch title variant must fit a short landscape screen (check 812×375 and 667×375).

- [ ] **Step 3: Mobile quality tier and on-phone frame readout** — model: Opus / effort: medium
  *(Built and verified in emulation, 2d7380c: mobile renders 37–41% faster than high at 812×375. Waiting on Kyle's phone readings before ticking.)*
  **Goal:** A `?quality=mobile` tier (the default in mobile mode) that keeps the night look while
  cutting GPU cost, plus a way to read frame time on the phone itself.
  - One `QUALITY` object (in `src/mobile/device.js` or a new `src/config/quality.js`) read at
    startup by the systems it tunes. Start with the cheapest-to-lose knobs and measure each:
    - Pixel ratio cap of 1.5 (against 2 on desktop). Add a tiny dynamic resolution option if
      cheap: drop the pixel ratio a step when frame time stays over budget.
    - MSAA samples 4 → 2 (or 0 with the CAS sharpen doing the work) in `render/postfx.js`.
    - Bloom: fewer mip levels (`render/bloom.js` `LEVELS`) and half-resolution prefilter.
    - Fire raymarch `MAX_STEPS` lower and the per-pixel step count coarser (`scene/fireVolume.js`).
    - Altar shadow map size halved (`scene/fire.js`).
    - Camp: far-LOD distance pulled in, or a thinned instance count (`scene/camp.js`),
      only if it measurably helps.
    - The reflection probe at 128 instead of 256.
  - Desktop (`quality=high`) is untouched: the same code paths and values.
  - `?debug=1` on a phone is hard to read rotated. Add a minimal `?fps=1` readout (rolling
    average of real `requestAnimationFrame` frame time plus draw calls), placed in the rotated
    frame's safe area. It works on desktop too.
  - Record the tier's knobs and their measured costs in `docs/DECISIONS.md` under a new
    "Mobile (spike)" section.
  **Files:** `src/render/postfx.js`, `src/render/bloom.js`, `src/scene/fireVolume.js`,
  `src/scene/fire.js`, `src/scene/camp.js`, `src/main.js`, `src/debug/params.js`,
  `src/debug/overlay.js`, `src/mobile/device.js` (or `src/config/quality.js`),
  `docs/DECISIONS.md`, `AGENTS.md` (params).
  **Spec:** AGENTS.md "Light budget", "Debug handle & verification" (frame timing method),
  DECISIONS.md "Performance baseline".
  **Accept when:**
  - At `quality=high`, draws and screenshots at `gate`, `fire`, `holyplace` and `camp` match `main`.
  - At `quality=mobile` and an 812×375 viewport, side-by-side screenshots at `gate`, `fire`,
    `holyplace`, `holyofholies` and `camp` (`scale: 0.5`) still read as the same night scene: the
    fire's shape, the bloom halo, the interior glow and the haze are all present, with no
    banding, black squares or shader errors (`renderer.info.programs` all runnable).
  - A table of timed `fx.render(t)` runs (AGENTS.md method) for high and mobile at the same
    812×375 logical size and each preset, with the per-knob savings, goes in DECISIONS.md.
  - `?fps=1` shows a sensible readout in both orientations.
  - `npm run lint` and `npm run build` pass, and the console is clean.
  - **Checkpoint:** Kyle loads `?fps=1` on his phone at `walk`, near the altar, in the Holy
    Place, and looking over the camp, and reports the readings.
  **Carry-over notes:**
  - Phone checkpoint after Step 2 (Kyle, 2026-11-07): the `ccw` rotation default reads correctly,
    look speed and direction (drag up looks up) are right, and the stick size is right. Keep
    all of them. Reported "nope" to the last question (taken as: nothing else in the way).
    Smoothness wasn't judged yet: this step's `?fps=1` readout gives the real numbers.
  - `debug/overlay.js` still appends its readout to `body`, so it doesn't rotate. Put `?fps=1`
    inside `#app`, in the rotated safe area (`--safe-*`).

- [ ] **Step 4: Phone tuning and findings note** — model: Sonnet / effort: medium
  **Goal:** Apply Kyle's phone feedback from Steps 2 and 3 (look speed, stick size, rotation
  direction, quality knobs), then write `docs/mobile-spike-findings.md`:
  - What was built and how (rotation, input mapping, quality tier).
  - Measured frame times: desktop A/B plus Kyle's phone readings.
  - What felt right and what didn't.
  - The known gaps and what shipping would take: device coverage, rotation direction detection,
    iPad and tablet layout, low-end fallbacks, desktop regressions risk, and how it would merge
    with `main`.
  Move this plan's assumptions into `docs/DECISIONS.md` ("Mobile (spike)") and archive the plan.
  **Files:** the files tuned, `docs/mobile-spike-findings.md`, `docs/DECISIONS.md`,
  `docs/plans/`.
  **Accept when:** Kyle's feedback items are each addressed or listed as open in the findings
  note. Lint and build pass, and the console is clean. Desktop is unchanged at `walk` and `gate`.
  **Carry-over notes:**
