/**
 * The night insect bed: the stereo loop (crickets and the like) from a random point into the
 * `insects` bus, through one gain that follows three things:
 * - a very slow drift of +/- DRIFT_DB (two sines, own periods), so the bed breathes;
 * - the listener's distance to the nearest fire (the altar and the lit torches, from their
 *   sound specs): hushed to NEAR_LEVEL within NEAR m of a flame, rising by a smoothstep to full at
 *   FAR m, so the crickets are loud out on the open sand and quieter, never gone, by the fires
 *   (Kyle: inaudible at the spawn with silent-at-4 m / full-at-18 m);
 * - the depth into the tent: full at the door's line, silent by IN_FADE m in (on top of the
 *   `outside` chain's muffle, which the bus passes through).
 *
 * Driven by `update(x, y, z, when, depth)` at ~10 Hz (engine.js), `setTargetAtTime`.
 */
const NEAR = 2, FAR = 10; // m from the nearest fire: hushed, full
const NEAR_LEVEL = 0.4; // the bed's level beside a fire
const IN_FADE = 1.5; // m into the tent: silent
const DRIFT_DB = 1.5;
const SMOOTH = 0.6; // s, setTargetAtTime constant
const FIRE_KINDS = ['altar', 'torch']; // lit fires only: not the glow-only west torches, nor the pillar

const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);

/** Fade factor 0..1 from the distance (m) to the nearest fire. */
export function fireFade(d) {
  return NEAR_LEVEL + (1 - NEAR_LEVEL) * smooth(clamp01((d - NEAR) / (FAR - NEAR)));
}
/** Fade factor 0..1 from the metres into the tent. */
export function tentFade(depth) {
  return 1 - clamp01(depth / IN_FADE);
}

/**
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} bus  graph.buses.insects
 * @param {AudioBuffer} buffer  the decoded insects loop
 * @param {{loopStart:number, loopEnd:number}} file  its manifest entry
 * @param {{kind:string, pos:{x:number,y:number,z:number}}[]} fireSpecs  every fire's sound spec
 * @param {{x:number,y:number,z:number}} at  the listener's start position
 * @param {number} depth  metres into the tent at the start
 * @returns {{update(x,y,z,when,depth), stop(), gain: number, drift: number, fire: number, tent: number, distance: number}}
 */
export function createInsectBed(ctx, bus, buffer, file, fireSpecs, at = { x: 0, y: 1.6, z: 0 }, depth = 0) {
  const fires = fireSpecs.filter((s) => FIRE_KINDS.includes(s.kind)).map((s) => s.pos);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = file.loopStart;
  src.loopEnd = file.loopEnd;
  const gain = ctx.createGain();
  src.connect(gain).connect(bus);

  const dg = [rand(23, 37), rand(51, 83), rand(0, 6.3), rand(0, 6.3)];
  const bed = {
    gain: 0, // the target at the last update (linear, bus-relative)
    drift: 1, fire: 0, tent: 1, distance: Infinity, // its factors at the last update
    update(x, y, z, when, inDepth = 0) {
      let d = Infinity;
      for (const p of fires) {
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        d = Math.min(d, dx * dx + dy * dy + dz * dz);
      }
      d = Math.sqrt(d);
      const wob = 0.6 * Math.sin(when * 6.283 / dg[0] + dg[2]) + 0.4 * Math.sin(when * 6.283 / dg[1] + dg[3]);
      bed.distance = d;
      bed.drift = 10 ** ((DRIFT_DB * wob) / 20);
      bed.fire = fireFade(d);
      bed.tent = tentFade(inDepth);
      bed.gain = bed.drift * bed.fire * bed.tent;
      gain.gain.setTargetAtTime(bed.gain, when, SMOOTH);
    },
    stop() {
      src.stop();
      src.disconnect();
      gain.disconnect();
    },
  };
  // Start at the right level, not fading up from silence.
  bed.update(at.x, at.y, at.z, ctx.currentTime, depth);
  gain.gain.cancelScheduledValues(0);
  gain.gain.value = bed.gain;
  src.start(0, file.loopStart + Math.random() * (file.loopEnd - file.loopStart));
  return bed;
}
