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
  };
}
