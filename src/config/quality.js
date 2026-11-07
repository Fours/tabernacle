import { getParams } from '../debug/params.js';
import { isMobile } from '../mobile/device.js';

/**
 * Render quality tier, read once at startup by the systems it tunes (main.js, render/postfx.js,
 * render/bloom.js, scene/fireVolume.js, scene/altarFire.js).
 *
 * `?quality=high|mobile`; the default is `mobile` in mobile mode (mobile/device.js), else `high`.
 * `high` holds the desktop values exactly, so desktop runs the same code paths as before.
 * `mobile` keeps the look and drops only resolution and sample counts (docs/DECISIONS.md
 * "Mobile (spike)" has each knob's measured cost).
 *
 * For A/B tests one knob can be overridden from the URL: `?qk=msaa:4,bloomLevels:7` (numbers;
 * `canvasAA`, `dynamicResolution`, `scatter` and `furnishings` take 0/1).
 */
const TIERS = {
  high: {
    pixelRatio: 2, // cap on devicePixelRatio
    canvasAA: true, // MSAA on the canvas's own framebuffer (only used with `?fx=0`)
    msaa: 4, // samples of the post chain's HDR scene target
    bloomStart: 2, // the bloom prefilter writes 1/bloomStart of the frame
    bloomLevels: 7, // mip levels from there down (7 from 1/2 reaches 1/128)
    fireMaxSteps: 56, // raymarch cap per pixel (scene/fireVolume.js)
    fireStepPx: 3, // LOD: march step = clamp(fireStepPx / flame height px, ...)
    shadowMapSize: 1024, // the altar fire's point-light shadow (per cube face)
    probeSize: 256, // the Holy Place's reflection probe (per cube face)
    dynamicResolution: false, // drop the pixel ratio when frames run long (main.js)
    // Phone A/B switches (`?qk=...`).
    scatter: true, // `scatter:0` hides the rocks, grass and shrubs (scene/groundScatter.js)
    furnishings: true, // false: the Holy Place stays hidden from outside, even through the door
  },
  mobile: {
    pixelRatio: 1, // phone-tested: 1.5 ran 24-26 fps, 1 runs 30-32 and still looks good
    canvasAA: false,
    msaa: 2,
    bloomStart: 4, // half-resolution prefilter: 1/4 of the frame...
    bloomLevels: 6, // ...down to 1/128 as on desktop, one pass pair fewer
    fireMaxSteps: 40,
    fireStepPx: 4.5,
    shadowMapSize: 512,
    probeSize: 128,
    dynamicResolution: false, // opt in with `?qk=dynamicResolution:1` (see DECISIONS.md)
    scatter: true,
    furnishings: false, // phone-tested: several fps from outside the tent (~320k triangles)
  },
};

const params = getParams();
const name = params.quality in TIERS ? params.quality : isMobile ? 'mobile' : 'high';

/** The active tier: `{ name, ...knobs }`. Exposed as `window.__tabernacle.quality`. */
export const QUALITY = { name, ...TIERS[name] };

for (const pair of (params.qk || '').split(',')) {
  const [k, v] = pair.split(':');
  if (!(k in TIERS.high) || v === undefined) continue;
  QUALITY[k] = typeof TIERS.high[k] === 'boolean' ? v === '1' || v === 'true' : parseFloat(v);
  QUALITY.overridden = true;
}
