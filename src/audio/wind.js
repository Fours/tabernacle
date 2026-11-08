import { WIND } from '../scene/cloth.js';

/**
 * The wind bed: the stereo wind loop through a gain and a gentle lowpass, both following a gust
 * envelope taken from the cloth's own wind field (scene/cloth.js `clothWind`), so the wind is
 * loudest and brightest when the hangings near the listener move most.
 *
 * The shader's field is a sum of three travelling waves; the gust is its large-scale part: the
 * slow wave a1 (period ~7.9 s, it also scales the downwind bulge) and the billow a2 (~3.9 s),
 * evaluated at the listener. The fast ripple a3 is left out (it's the cloth's flutter, not a gust).
 */
const GAIN_LO = 0.35, GAIN_HI = 0.9; // bus-relative gain at the envelope's 0 and 1
const LP_LO = 650, LP_HI = 4200; // Hz, the lowpass at the envelope's 0 and 1 (exponential)
const SMOOTH = 0.35; // s, setTargetAtTime constant

/** Gust envelope 0..1 at (x, y, z) at shader time t (WIND.uWindTime), times the wind strength. */
export function gustAt(x, y, z, t = WIND.uWindTime.value) {
  const d = WIND.uWindDir.value, cx = -d.y, cz = d.x;
  const a1 = (0.32 * d.x + 0.12 * cx) * x + (0.32 * d.y + 0.12 * cz) * z - 0.8 * t;
  const a2 = (0.9 * d.x + 0.6 * cx) * x + 0.7 * y + (0.9 * d.y + 0.6 * cz) * z - 1.6 * t + 1.3;
  const s = 0.7 * Math.sin(a1) + 0.3 * Math.sin(a2); // -1..1
  return 0.5 + 0.5 * s;
}

/**
 * Start the wind loop on `bus` (graph.js). `buffer` the decoded wind, `file` its manifest entry.
 * `at` the listener's start position. Returns {update(x, y, z, when, t?), gust (last value), stop()}.
 */
export function createWindBed(ctx, bus, buffer, file, at = { x: 0, y: 1.6, z: 0 }) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = file.loopStart;
  src.loopEnd = file.loopEnd;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;
  const gain = ctx.createGain();
  src.connect(lp).connect(gain).connect(bus);

  const bed = {
    gust: 0,
    /** Retarget gain and lowpass for the listener at (x, y, z) from audio time `when`. */
    update(x, y, z, when, t) {
      const strength = WIND.uWindStrength.value;
      const e = gustAt(x, y, z, t);
      bed.gust = e * strength;
      const g = strength * (GAIN_LO + (GAIN_HI - GAIN_LO) * e);
      gain.gain.setTargetAtTime(g, when, SMOOTH);
      lp.frequency.setTargetAtTime(LP_LO * (LP_HI / LP_LO) ** e, when, SMOOTH);
    },
    stop() {
      src.stop();
      src.disconnect();
    },
  };
  // Set the start values directly so the fade-in doesn't sweep the filter.
  const e0 = gustAt(at.x, at.y, at.z);
  bed.gust = e0 * WIND.uWindStrength.value;
  gain.gain.value = WIND.uWindStrength.value * (GAIN_LO + (GAIN_HI - GAIN_LO) * e0);
  lp.frequency.value = LP_LO * (LP_HI / LP_LO) ** e0;
  // A random point in the loop, so each visit starts somewhere else.
  src.start(0, file.loopStart + Math.random() * (file.loopEnd - file.loopStart));
  return bed;
}
