# Mobile spike: findings

Branch `mobile-spike` (not merged). Details and every decision are in `docs/DECISIONS.md`
"Mobile (spike)"; the plan is `docs/plans/2026-11-07-mobile-spike.md`.

## Summary

The scene runs on a phone with the night look intact: 30-34 fps on Kyle's phone at pixel ratio 1
with MSAA 2, in every place tried (start, altar, Holy Place, camp). Landscape-by-CSS-rotation,
the thumbstick and drag-to-look all felt right. It is playable but not smooth (30 fps), and it
loads slowly on the phone. The spike says mobile is feasible; shipping needs a load-time fix and
a wider device check first, not new rendering work.

## What was built

- **Forced landscape** (`src/mobile/device.js`): mobile mode is on for `(pointer: coarse)`. In
  portrait `#app` is sized to the swapped dimensions and rotated 90 degrees by CSS; a real
  landscape viewport is never rotated. Renderer, camera and post chain size from the "logical"
  landscape `getViewport()` (from `visualViewport`, so Safari's toolbar is handled). No Screen
  Orientation API, since iPhone Safari lacks orientation lock and page fullscreen.
- **Input mapping:** pointer input goes through `toLogical()`, so directions are correct in both
  rotations. Overlays live inside `#app` and size in `cqw`/`cqh`; `--safe-*` insets are mapped
  through the rotation.
- **Touch controls** (`src/mobile/touchControls.js`, `src/camera/firstPerson.js`): a floating
  stick spawns where a touch lands in the left 40%; any other touch looks (0.004 rad per logical
  px, pitch clamped). Tracked by `pointerId`, so both thumbs work at once. Walking is analog;
  past 85% deflection it runs. A touch title screen ("Tap to enter") and a corner menu button
  replace pointer lock and Esc.
- **Quality tier** (`src/config/quality.js`): `mobile` is the default in mobile mode. Pixel
  ratio 1, MSAA 2, half-resolution bloom prefilter with one level fewer, coarser fire raymarch,
  512 shadow map, 128 reflection probe. `high` holds the desktop values exactly.
- **Readouts:** `?fps=1` shows rolling rAF frame time, fps, draw calls, pixel ratio and tier in
  the rotated safe area (works on desktop too). `?qk=knob:value` overrides single knobs for A/B
  tests. Opt-in dynamic resolution (`?qk=dynamicResolution:1`).
- **URL params:** `?mobile=0|1`, `?rot=cw|ccw`, `?quality=high|mobile`, `?qk=...`, `?fps=1`.

## Measurements

**Mac, browser pane, 812x375 logical, `?mobile=1`** (tier at pixel ratio 1.5; ms per
`fx.render`):

| Preset | high | mobile | mobile, msaa 0 |
|---|---|---|---|
| `gate` | 6.63 | 4.19 (-37%) | 3.32 |
| `fire` | 6.09 | 3.73 (-39%) | 3.11 |
| `holyplace` | 5.26 | 3.26 (-38%) | 2.77 |
| `holyofholies` | 4.77 | 2.83 (-41%) | 2.45 |
| `camp` | 5.70 | 3.38 (-41%) | 2.86 |

Per knob on the Mac (`gate` / `fire`, ms saved): pixel ratio 1.5 -1.80 / -1.58; MSAA 2 -1.35 /
-1.14; bloom -0.26 / -0.14; fire steps -0.09 / 0; shadow 512 -0.12 / 0. On the Mac only
resolution and MSAA matter.

**Kyle's phone** (dev server, `?fps=1`, model unknown):

| Tier | Start | Altar | Holy Place | Camp |
|---|---|---|---|---|
| mobile, pixel ratio 1.5 | 24 | 26 | 25 | 34 |
| mobile, pixel ratio 1 | 30 | 32 | 31 | 34 |

- MSAA 0 on top of pixel ratio 1 gained only a few fps and looked much worse, so MSAA stays 2.
- The camp stayed at 34 either way, so something other than pixel count caps it there.
- The phone is roughly 8-10x slower than the Mac for the same frame (30-40 ms against ~4 ms),
  probably fill-rate bound.

## What felt right

Confirmed on the phone: the `ccw` rotation direction, look speed and direction (drag up looks
up), and the stick size. Pixel ratio 1 "still looks pretty good".

## Known gaps and open questions

- **Slow loading on the phone.** Not yet measured on the phone. The dev server sends ~72
  unminified modules (6.4 MB) against one 1.1 MB file (325 KB gzipped) in production. The phone
  also compiles 65 shader programs, generates ~50 textures in code, bakes the ground AO and
  captures the probe before the first frame. To measure: per-phase startup timings on the `?fps=1`
  readout and a LAN server for the production build. Likely fixes: compile in the background
  while the loader is up, and fewer shader variants on mobile.
- **Walk-to-run step** (a jump at 85% deflection, no ramp) has not been judged on the phone.
- **Pillar of fire raymarch** (`MAX_STEPS` 96 in `pillarOfFire.js`) is not in the tier yet.
- **Camp cap at 34 fps** is unexplained.
- **One phone only**, model unknown. No other device, GPU class or browser tried.
- **iPad / tablet layout** not designed or tested (a tablet is coarse-pointer, so it enters
  mobile mode).
- **Rotation direction is a fixed guess** (`ccw`) with no sensor; a user who turns the phone the
  other way (clockwise) sees the scene upside down. `?rot=cw` exists only as a URL flag.
- **Dynamic resolution is off** because iOS Low Power Mode caps rAF at 30 fps, which would read
  as over budget.
- **Safe-area mapping** was checked in emulation only, not on a notched device.

## What shipping would take

Sizes are rough estimates, not measured.


1. Measure and fix load time on the phone (production build over LAN, per-phase timings;
   background shader compile). Medium: about a day or two.
2. Test a device matrix (a couple of iPhones, a mid-range Android, an older phone); decide a
   low-end fallback. Small to medium, mostly waiting on devices.
3. Decide the 30 fps story: accept it, or add the pillar-of-fire knob and look into the camp cap.
   Small.
4. Rotation direction: add a switch (menu button) or a sensor-based guess. Small.
5. Tablet layout and a check on a notched device. Small.
6. Judge the run step on the phone and tune. Trivial.
7. Desktop regression check (draw calls and screenshots at `walk` and `gate` against `main`),
   then merge `mobile-spike` into `main` and deploy. Small.
