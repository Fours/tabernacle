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
    // `?ao=0` turns off the contact, room and crease ambient occlusion (scene/ao.js).
    ao: p.get('ao') !== '0',
    // `?wind=0` stills the cloth (scene/cloth.js).
    wind: p.get('wind') !== '0',
    // `?skyt=<s>` pins the sky's clock (twinkle, meteors, haze drift), e.g. to show a meteor.
    skyt: p.get('skyt') ? parseFloat(p.get('skyt')) : null,
    // Tone mapping override for comparison: aces | agx | neutral | none.
    tm: p.get('tm') || null,
    // Exposure override (number).
    exposure: p.get('exposure') ? parseFloat(p.get('exposure')) : null,
    // `?mobile=1` / `?mobile=0` force mobile mode on or off (null: auto, coarse pointer).
    mobile: p.get('mobile') === '1' ? true : p.get('mobile') === '0' ? false : null,
    // `?rot=cw|ccw`: which way the phone is turned in portrait (mobile/device.js). Default ccw.
    rot: p.get('rot') === 'cw' ? 'cw' : 'ccw',
    // `?quality=high|mobile` (config/quality.js; default mobile in mobile mode, else high) and
    // `?qk=knob:value,...` to override single knobs for A/B tests.
    quality: p.get('quality') || null,
    qk: p.get('qk') || null,
    // `?fps=1`: a small frame-time readout inside #app, in the rotated safe area.
    fps: p.get('fps') === '1',
    // `?pillar=1..10`: the pillar of fire's complexity (scene/pillarOfFire.js). 10 = full
    // (default); 5 takes half the raymarch samples and half the embers.
    pillar: p.get('pillar') ? Math.min(10, Math.max(1, Math.round(parseFloat(p.get('pillar')) || 10))) : 10,
  };
}
