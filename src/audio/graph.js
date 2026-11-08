/**
 * The mixing graph, built on any BaseAudioContext (the live AudioContext, or an
 * OfflineAudioContext for checks):
 *
 *   bus fire ─┐
 *   bus wind ─┼─> outside (lowpass -> gain) -> master -> destination
 *   bus insects┘
 *
 * `outside` is the muffle chain for the tent interior (Step 3 drives it; transparent here: the
 * lowpass is wide open, the gain 1). Every bus and the master have an AnalyserNode tapped off
 * the side, read only on demand (`rmsDb`).
 */
export const BUS_NAMES = ['fire', 'wind', 'insects'];

const OPEN_HZ = 20000; // the outside lowpass, wide open (Step 3 lowers it inside the tent)

export function createGraph(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0; // faded in by the engine
  master.connect(ctx.destination);

  const outsideFilter = ctx.createBiquadFilter();
  outsideFilter.type = 'lowpass';
  outsideFilter.frequency.value = Math.min(OPEN_HZ, ctx.sampleRate / 2);
  outsideFilter.Q.value = 0.5;
  const outsideGain = ctx.createGain();
  outsideFilter.connect(outsideGain).connect(master);

  const tap = (node) => {
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    node.connect(a);
    return a;
  };

  const buses = {};
  const analysers = { master: tap(master) };
  for (const name of BUS_NAMES) {
    const g = ctx.createGain();
    g.connect(outsideFilter);
    buses[name] = g;
    analysers[name] = tap(g);
  }
  return { ctx, master, buses, outside: { filter: outsideFilter, gain: outsideGain }, analysers };
}

const scratch = new Float32Array(2048);

/** RMS of an analyser's current window in dBFS (floored at -120 for silence). */
export function rmsDb(analyser) {
  analyser.getFloatTimeDomainData(scratch);
  let s = 0;
  for (let i = 0; i < scratch.length; i++) s += scratch[i] * scratch[i];
  return Math.max(-120, 10 * Math.log10(s / scratch.length + 1e-30)); // -120: silence
}

/** RMS in dBFS of every analyser in the graph: {master, fire, wind, insects}. */
export function graphLevels(graph) {
  const out = {};
  for (const k in graph.analysers) out[k] = Math.round(rmsDb(graph.analysers[k]) * 10) / 10;
  return out;
}
