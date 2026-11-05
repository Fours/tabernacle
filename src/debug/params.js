/** Parse URL params controlling camera, view, lighting and debug. */
export function getParams() {
  const p = new URLSearchParams(window.location.search);
  const view = p.get('view') || null;
  let cam = p.get('cam');
  // `walk` is the first-person spawn point: it implies fp unless cam=free is explicit.
  if (!cam) cam = view === 'walk' ? 'fp' : 'free';
  return {
    cam,
    view,
    light: p.get('light') || 'night',
    debug: p.get('debug') === '1',
    // Post-processing chain (bloom, grade, shimmer); `?fx=0` renders the plain scene.
    fx: p.get('fx') !== '0',
    // Tone mapping override for comparison: aces | agx | neutral | none.
    tm: p.get('tm') || null,
    // Exposure override (number).
    exposure: p.get('exposure') ? parseFloat(p.get('exposure')) : null,
  };
}
