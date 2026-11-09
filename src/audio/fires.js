/**
 * Positional fires: one PannerNode per fire (the altar, the 6 torches, the pillar of fire) at the
 * flame's world position (static), into the `fire` bus. Each plays its loop from a random point
 * with slow gain (±2 dB) and playbackRate (±3%) drift, nudged by the fire's flicker `level`, and
 * single crackles from the pops sprite scheduled at random (exponential gaps) on the audio clock
 * through the same panner.
 *
 * Driven by `tick(x, y, z, now)` at ~10 Hz (engine.js): it retargets the loops and schedules the
 * pops falling in the next LOOKAHEAD seconds. Pops are skipped for sources the listener can't
 * hear (distance gain under AUDIBLE) and capped at MAX_ONE_SHOTS live at once; each ended pop
 * disconnects itself, so nodes don't pile up.
 */
const LOOKAHEAD = 0.2; // s of pops scheduled per tick
const MAX_ONE_SHOTS = 6;
const AUDIBLE = 10 ** (-50 / 20); // distance x base gain below this: no pops
const SMOOTH = 0.3; // s, setTargetAtTime constant of the drift
const LEVEL_NUDGE = 0.12; // loop gain x (1 + LEVEL_NUDGE * smoothed level)
const LEVEL_SMOOTH = 0.35; // per-tick smoothing of the sampled level
const POP_PITCH = 0.08, POP_DB = 3; // jitter: ±8 % rate, ±3 dB

/**
 * Per kind: loop key, loop gain, pop gain and rate (/s), the loop's slow drift in ±dB (`swell`,
 * default 2), and the inverse distance model
 * (gain = ref / (ref + rolloff * (max(d, ref) - ref))).
 */
export const FIRE_KINDS = {
  altar: { loop: 'altarFire', gain: 1, pop: 0.7, popRate: 3, ref: 3, rolloff: 1, max: 10000 },
  torch: { loop: 'torchFire', gain: 0.7, pop: 0.45, popRate: 0.45, ref: 1, rolloff: 1.2, max: 10000 },
  torchGlow: { loop: 'torchFire', gain: 0.35, pop: 0.3, popRate: 0.12, ref: 1, rolloff: 1.2, max: 10000 },
  // The pillar: 0.1 -> 0.2 and a deeper swell (Kyle: barely audible, wants it present and definite).
  pillar: { loop: 'pillarRoar', gain: 0.2, swell: 4, pop: 0, popRate: 0, ref: 20, rolloff: 0.5, max: 10000 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const expGap = (rate) => -Math.log(1 - Math.random()) / rate;

function inverseGain(k, d) {
  return k.ref / (k.ref + k.rolloff * (Math.max(Math.min(d, k.max), k.ref) - k.ref));
}

/**
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} bus  graph.buses.fire
 * @param {object} buffers  decoded AudioBuffers by manifest key
 * @param {object} files  manifest.files
 * @param {{name:string, kind:string, pos:{x,y,z}, fire?:{level:number}}[]} specs
 * @param {{panningModel?: string}} opts
 */
export function createFireSources(ctx, bus, buffers, files, specs, { panningModel = 'HRTF' } = {}) {
  const slices = files.pops.slices;
  const popBuf = buffers.pops;
  let live = 0, peak = 0, scheduled = 0;

  const sources = specs.map((s) => {
    const k = FIRE_KINDS[s.kind];
    const file = files[k.loop];
    const panner = ctx.createPanner();
    panner.panningModel = panningModel;
    panner.distanceModel = 'inverse';
    panner.refDistance = k.ref;
    panner.rolloffFactor = k.rolloff;
    panner.maxDistance = k.max;
    if (panner.positionX) {
      panner.positionX.value = s.pos.x; panner.positionY.value = s.pos.y; panner.positionZ.value = s.pos.z;
    } else {
      panner.setPosition(s.pos.x, s.pos.y, s.pos.z);
    }
    panner.connect(bus);

    const gain = ctx.createGain();
    gain.gain.value = k.gain;
    gain.connect(panner);
    const src = ctx.createBufferSource();
    src.buffer = buffers[k.loop];
    src.loop = true;
    src.loopStart = file.loopStart;
    src.loopEnd = file.loopEnd;
    src.connect(gain);
    src.start(0, file.loopStart + Math.random() * (file.loopEnd - file.loopStart));

    return {
      name: s.name, kind: s.kind, pos: s.pos, panner, gain, src, fire: s.fire || null, k,
      // Drift: two slow sines each for gain and rate, own periods and phases.
      dg: [rand(6, 11), rand(13, 23), rand(0, 6.3), rand(0, 6.3)],
      dr: [rand(7, 12), rand(15, 27), rand(0, 6.3), rand(0, 6.3)],
      level: 0,
      distance: Infinity,
      heard: k.gain, // distance gain x base gain, at the last tick
      nextPop: k.popRate ? ctx.currentTime + expGap(k.popRate) : Infinity,
    };
  });

  function playPop(s, when) {
    const slice = slices[(Math.random() * slices.length) | 0];
    const src = ctx.createBufferSource();
    src.buffer = popBuf;
    src.playbackRate.value = 1 + rand(-POP_PITCH, POP_PITCH);
    const g = ctx.createGain();
    g.gain.value = s.k.pop * 10 ** (rand(-POP_DB, POP_DB) / 20);
    src.connect(g).connect(s.panner);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      live--;
    };
    src.start(when, slice.start, slice.end - slice.start);
    live++;
    scheduled++;
    if (live > peak) peak = live;
  }

  const fires = {
    sources,
    get oneShots() { return live; }, // pops scheduled or playing now
    get peakOneShots() { return peak; },
    get popsScheduled() { return scheduled; },

    /** Listener at (x, y, z); `now` = ctx.currentTime. Call at ~10 Hz. */
    tick(x, y, z, now) {
      for (const s of sources) {
        const dx = s.pos.x - x, dy = s.pos.y - y, dz = s.pos.z - z;
        s.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        s.heard = s.k.gain * inverseGain(s.k, s.distance);

        // Loop drift (±swell dB, ±3 %) and the flicker nudge.
        const a = s.dg, r = s.dr;
        const gd = 0.6 * Math.sin(now * 6.283 / a[0] + a[2]) + 0.4 * Math.sin(now * 6.283 / a[1] + a[3]);
        const rd = 0.6 * Math.sin(now * 6.283 / r[0] + r[2]) + 0.4 * Math.sin(now * 6.283 / r[1] + r[3]);
        if (s.fire) s.level += (s.fire.level - s.level) * LEVEL_SMOOTH;
        const g = s.k.gain * 10 ** (((s.k.swell ?? 2) * gd) / 20) * (1 + LEVEL_NUDGE * s.level);
        s.gain.gain.setTargetAtTime(g, now, SMOOTH);
        s.src.playbackRate.setTargetAtTime(1 + 0.03 * rd, now, SMOOTH);

        // Crackles in (now, now + LOOKAHEAD].
        if (!s.k.popRate) continue;
        if (s.nextPop < now) s.nextPop = now + expGap(s.k.popRate); // fell behind (suspended, slow tick)
        const end = now + LOOKAHEAD;
        while (s.nextPop <= end) {
          if (s.heard >= AUDIBLE && live < MAX_ONE_SHOTS) playPop(s, Math.max(s.nextPop, now + 0.005));
          s.nextPop += expGap(s.k.popRate);
        }
      }
    },

    /** [{name, distance (m), heard (dB)}] at the last tick. */
    distances() {
      return sources.map((s) => ({
        name: s.name,
        distance: Math.round(s.distance * 10) / 10,
        heardDb: Math.round(20 * Math.log10(s.heard + 1e-12) * 10) / 10,
      }));
    },

    stop() {
      for (const s of sources) {
        s.src.stop();
        s.src.disconnect();
        s.gain.disconnect();
        s.panner.disconnect();
      }
    },
  };
  return fires;
}
