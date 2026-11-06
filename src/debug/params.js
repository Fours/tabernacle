/** Parse URL params controlling camera, view, lighting and debug. */
export function getParams() {
  const p = new URLSearchParams(window.location.search);
  const view = p.get('view') || null;
  let cam = p.get('cam');
  // First-person is the default. Other `?view=` presets imply the free camera; `walk` is the
  // first-person spawn point. `?cam=free` / `?cam=fp` always win.
  if (!cam) cam = view && view !== 'walk' ? 'free' : 'fp';
  // `?bob=0` disables the walking head bob.

  return {
    cam,
    view,
    bob: p.get('bob') !== '0',
    light: p.get('light') || 'night',
    debug: p.get('debug') === '1',
    // Post-processing chain (bloom, grade, shimmer); `?fx=0` renders the plain scene.
    fx: p.get('fx') !== '0',
    // `?ae=0` holds the eye-adaptation exposure at 1; `?lens=0` turns off chromatic aberration,
    // lens dirt and sharpening.
    ae: p.get('ae') !== '0',
    lens: p.get('lens') !== '0',
    // `?haze=0` turns off the ground haze and the fires' glow in the air (render/atmosphere.js).
    haze: p.get('haze') !== '0',
    // Tone mapping override for comparison: aces | agx | neutral | none.
    tm: p.get('tm') || null,
    // Exposure override (number).
    exposure: p.get('exposure') ? parseFloat(p.get('exposure')) : null,
  };
}
