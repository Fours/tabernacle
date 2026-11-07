import { getParams } from '../debug/params.js';

/**
 * Mobile shell: device detection, forced landscape and the logical viewport.
 *
 * Mobile mode is on for coarse-pointer devices (`?mobile=1` / `?mobile=0` force it). In mobile
 * mode the app is always laid out as a landscape "logical" screen. When the phone is held in
 * portrait the `#app` container (index.html) is sized to the swapped dimensions and rotated 90
 * degrees by CSS so it fills the screen exactly. iPhone Safari has no orientation lock and no
 * page fullscreen, so CSS rotation is the one approach that works everywhere.
 *
 * Rotation direction (`?rot=cw|ccw`, default `ccw`): `ccw` reads correctly with the phone turned
 * counter-clockwise (its top to the left), so the content's top edge is at the screen's RIGHT
 * edge and the CSS rotation is +90. `cw` is the mirror (phone turned clockwise, content top at
 * the screen's left edge, CSS rotation -90). Landscape or desktop: no rotation.
 *
 * Everything that sizes or reads pointer positions goes through here: use `getViewport()` for
 * the renderer/camera/post size and `toLogical()` for pointer coordinates.
 */
const params = getParams();
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** True on coarse-pointer devices, or with `?mobile=1` (and never with `?mobile=0`). */
export const isMobile = params.mobile ?? coarse;

/** CSS rotation (degrees) applied to `#app`: 0, 90 (`ccw`) or -90 (`cw`). Live binding. */
export let rotation = 0;

const app = document.getElementById('app');
const vv = window.visualViewport;
const rotSign = params.rot === 'cw' ? -90 : 90;

// Physical screen size (portrait: w < h) and the logical landscape size.
let screenW = 0;
let screenH = 0;
let viewport = { width: 0, height: 0 };
let key = '';
const listeners = new Set();

function layout() {
  // Desktop uses the window size. Mobile uses the visual viewport, so Safari's toolbar showing
  // and hiding resizes correctly (desktop pinch-zoom would otherwise shrink it).
  const useVV = isMobile && vv;
  screenW = Math.round(useVV ? vv.width : window.innerWidth);
  screenH = Math.round(useVV ? vv.height : window.innerHeight);
  rotation = isMobile && screenW < screenH ? rotSign : 0;
  const swap = rotation !== 0;
  viewport = { width: swap ? screenH : screenW, height: swap ? screenW : screenH };

  if (isMobile && app) {
    const s = app.style;
    s.position = 'fixed';
    s.left = '0';
    s.top = '0';
    s.right = 'auto';
    s.bottom = 'auto';
    s.width = `${viewport.width}px`;
    s.height = `${viewport.height}px`;
    s.transformOrigin = '0 0';
    // Point (x, y) of the app lands at (W - y, x) for +90 and (y, H - x) for -90.
    s.transform = rotation === 90 ? `translate(${screenW}px, 0) rotate(90deg)`
      : rotation === -90 ? `translate(0, ${screenH}px) rotate(-90deg)` : 'none';
    app.classList.toggle('rot-ccw', rotation === 90);
    app.classList.toggle('rot-cw', rotation === -90);
  }
}

function update() {
  layout();
  const k = `${screenW}x${screenH}x${rotation}`;
  if (k === key) return;
  key = k;
  for (const cb of listeners) cb(viewport);
}

if (isMobile) document.documentElement.classList.add('is-mobile');
layout();
key = `${screenW}x${screenH}x${rotation}`;

window.addEventListener('resize', update);
// The new size is sometimes not reported yet when orientationchange fires: check again shortly.
window.addEventListener('orientationchange', () => {
  update();
  setTimeout(update, 200);
});
if (vv) vv.addEventListener('resize', update);

/** The logical landscape size `{width, height}` in CSS px (swapped when rotated). */
export function getViewport() {
  return viewport;
}

/** Subscribe to layout changes (resize, orientation, visual viewport). Returns an unsubscribe. */
export function onViewportChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Map a screen-space point (a pointer event's clientX/clientY) into the logical, rotated frame
 * (origin at the logical top-left, +x right, +y down). Pass `out` to avoid an allocation.
 */
export function toLogical(clientX, clientY, out = { x: 0, y: 0 }) {
  if (rotation === 90) {
    out.x = clientY;
    out.y = screenW - clientX;
  } else if (rotation === -90) {
    out.x = screenH - clientY;
    out.y = clientX;
  } else {
    out.x = clientX;
    out.y = clientY;
  }
  return out;
}
