import { createGraph, graphLevels } from './graph.js';
import { createWindBed } from './wind.js';
import { createFireSources } from './fires.js';
import { createMuteButton } from './muteButton.js';
import { WIND } from '../scene/cloth.js';

/**
 * Sound (docs/DECISIONS.md "Sound"). Lifecycle:
 * - `prefetch()` (main.js, once the loading screen goes): on idle, fetch the manifest and every
 *   file as an ArrayBuffer, not decoded. Nothing is fetched before.
 * - `unlock()` (the enter click/tap, camera/firstPerson.js): synchronously creates the
 *   AudioContext the first time and resumes it, so it starts inside the user gesture; then
 *   decodes each file once (awaiting the fetch if still in flight), starts the beds and fades
 *   the master in. No AudioContext exists before that gesture.
 * - `update(dt)` (main.js loop, after render): the listener follows the camera; the wind bed and
 *   the fires (audio/fires.js: loop drift, crackles scheduled ahead) retarget at ~10 Hz. Does
 *   nothing unless the context is running.
 * - `setInside(depth, pastVeil)` (main.js, per frame; cheap when unchanged): metres into the tent
 *   from the door and past the veil. Drives the graph's `outside` chain (low-pass and gain on
 *   every outside bus), easing in with depth rather than switching at the door.
 * - Mute (button, `M`, `localStorage` 'tabernacle.muted'): ramps the master to 0 and suspends.
 *   Hidden tab / pagehide: suspend; visible again: resume unless muted.
 */
const BASE = '/assets/audio/';
const MASTER = 1;
const BUS_GAIN = { fire: 1, wind: 0.5, insects: 1 }; // wind 0.7 -> 0.5 (Kyle: a little loud); Step 4 sets the final mix
const FADE_IN = 1.5, MUTE_RAMP = 0.2, UNMUTE_RAMP = 0.3; // s
const WIND_DT = 0.1; // s between wind envelope / fire updates
// The outside chain inside the tent follows how far in the listener is, so it doesn't switch
// at the door: the outside's volume falls from 100% at the door's line to 50% (-6 dB) at
// MUFFLE_DOOR m in and holds there through the Holy Place; past the veil it falls on to 25%
// (-12 dB) over MUFFLE_VEIL m. The low-pass closes with the volume, from wide open to
// MUFFLE_HZ (on a log scale), so the outside is dull as well as quiet.
const MUFFLE_DOOR = 2, MUFFLE_VEIL = 1; // m
const MUFFLE_HZ = 700, OPEN_HZ = 20000;
const INSIDE_TAU = 0.1;
// Fixed states for checks (renderOffline's `inside` option): 0 outside, 1 Holy Place, 2 Holy of
// Holies, as { depth: m in from the door, pastVeil: m past the veil }.
const INSIDE_STATES = [{ depth: 0, pastVeil: 0 }, { depth: 5, pastVeil: 0 }, { depth: 30, pastVeil: 5 }];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** The outside chain's gain and low-pass Hz for a listener `depth` m in, `pastVeil` m past the veil. */
function muffleFor({ depth, pastVeil }) {
  const door = clamp01(depth / MUFFLE_DOOR), veil = clamp01(pastVeil / MUFFLE_VEIL);
  const gain = (1 - 0.5 * door) * (1 - 0.5 * veil);
  const hz = OPEN_HZ * (MUFFLE_HZ / OPEN_HZ) ** door;
  return { gain, hz };
}

/** Set (`tau` 0: immediately) the graph's outside chain for a position `at` ({depth, pastVeil}). */
function applyInside(graph, at, now, tau) {
  const c = muffleFor(at);
  const f = graph.outside.filter.frequency, g = graph.outside.gain.gain;
  const hz = Math.min(c.hz, graph.ctx.sampleRate / 2);
  if (tau > 0) {
    f.setTargetAtTime(hz, now, tau);
    g.setTargetAtTime(c.gain, now, tau);
  } else {
    f.cancelScheduledValues(now); g.cancelScheduledValues(now);
    f.value = hz; g.value = c.gain;
  }
}
const STORE = 'tabernacle.muted';

const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200));

function readMuted() {
  try { return localStorage.getItem(STORE) === '1'; } catch { return false; }
}
function saveMuted(v) {
  try { localStorage.setItem(STORE, v ? '1' : '0'); } catch { /* private mode */ }
}

export function createAudioEngine({ camera, app, mobile = false, hrtf = true, fires: fireSpecs = [] }) {
  let ctx = null, graph = null, wind = null, fires = null;
  const inside = { depth: 0, pastVeil: 0 }; // last position given to setInside
  const panningModel = hrtf ? 'HRTF' : 'equalpower';
  let manifest = null;
  let loading = null; // Promise<{manifest, raw: {key: ArrayBuffer}}>
  const buffers = {}; // decoded AudioBuffers, shared by every source
  let started = null; // Promise of the beds being built
  let entered = false;
  let muted = readMuted();
  let windAcc = WIND_DT;
  let suspendTimer = 0;

  const button = createMuteButton(app, () => engine.mute(!muted), { mobile });
  button.set(muted);

  function load() {
    if (loading) return loading;
    loading = (async () => {
      const res = await fetch(`${BASE}manifest.json`);
      manifest = await res.json();
      const raw = {};
      await Promise.all(Object.entries(manifest.files).map(async ([key, f]) => {
        raw[key] = await (await fetch(f.url)).arrayBuffer();
      }));
      return { manifest, raw };
    })();
    loading.catch((e) => console.warn('audio: load failed', e));
    return loading;
  }

  async function decodeAll(c, raw) {
    const out = {};
    // decodeAudioData detaches its input, so decode a copy (the raw bytes are kept for
    // renderOffline until the live context has decoded).
    await Promise.all(Object.entries(raw).map(async ([k, ab]) => { out[k] = await c.decodeAudioData(ab.slice(0)); }));
    return out;
  }

  async function start() {
    const { raw } = await load();
    Object.assign(buffers, await decodeAll(ctx, raw));
    for (const k in BUS_GAIN) graph.buses[k].gain.value = BUS_GAIN[k];
    wind = createWindBed(ctx, graph.buses.wind, buffers.wind, manifest.files.wind, camera.position);
    fires = createFireSources(ctx, graph.buses.fire, buffers, manifest.files, fireSpecs, { panningModel });
    applyInside(graph, inside, ctx.currentTime, 0);
    if (muted) {
      ctx.suspend().catch(() => {});
    } else {
      const g = graph.master.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(MASTER, now + FADE_IN);
    }
  }

  function wantRunning() {
    return entered && !muted && !document.hidden;
  }
  function syncState() {
    if (!ctx) return;
    if (wantRunning()) {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    } else if (ctx.state === 'running' && (document.hidden || muted)) {
      ctx.suspend().catch(() => {});
    }
  }

  const onVisibility = () => {
    clearTimeout(suspendTimer);
    syncState();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onPageHide = () => { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onVisibility);
  const onKey = (e) => {
    if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    engine.mute(!muted);
  };
  if (!mobile) window.addEventListener('keydown', onKey);

  const L = { listener: null, params: false };

  const engine = {
    get ctx() { return ctx; },
    get buses() { return graph ? graph.buses : null; },
    get graph() { return graph; },
    buffers,
    get manifest() { return manifest; },
    get muted() { return muted; },
    get wind() { return wind; },
    /** audio/fires.js: {sources: [{name, pos, panner, distance, ...}], oneShots, distances()}. */
    get fires() { return fires; },
    get inside() { return inside; },
    /** Panning model for positional sources (QUALITY.audioHrtf). */
    panningModel,

    /** Fetch (not decode) every file on idle, after the loading screen has gone. */
    prefetch() {
      setTimeout(() => idle(() => load()), 1000); // after the loader's 1 s fade
    },

    /** Call synchronously inside the enter click/tap (and every later click that re-enters). */
    unlock() {
      entered = true;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        // iOS: play through the silent switch, like media playback.
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* ignore */ }
        ctx = new AC({ latencyHint: 'playback' });
        graph = createGraph(ctx);
        L.listener = ctx.listener;
        L.params = !!ctx.listener.positionX;
        started = start();
        started.catch((e) => console.warn('audio: start failed', e));
      }
      syncState();
    },

    /** The title screen is up (true) or gone (false): the button hides with it. */
    setIntroShown(v) {
      button.show(!v);
    },

    /**
     * How far into the tent the listener is (main.js, per frame): `depth` m in from the door's
     * line (0 outside), `pastVeil` m past the veil (0 east of it). Moves the outside chain when
     * either changes by more than 2 cm.
     */
    setInside(depth, pastVeil = 0) {
      if (Math.abs(depth - inside.depth) < 0.02 && Math.abs(pastVeil - inside.pastVeil) < 0.02) return;
      inside.depth = depth; inside.pastVeil = pastVeil;
      if (graph) applyInside(graph, inside, ctx.currentTime, INSIDE_TAU);
    },

    mute(v) {
      muted = !!v;
      saveMuted(muted);
      button.set(muted);
      clearTimeout(suspendTimer);
      if (!ctx) return;
      const g = graph.master.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      if (muted) {
        g.linearRampToValueAtTime(0, now + MUTE_RAMP);
        suspendTimer = setTimeout(syncState, (MUTE_RAMP + 0.05) * 1000);
      } else {
        syncState();
        g.linearRampToValueAtTime(MASTER, now + UNMUTE_RAMP);
      }
    },

    /** Per frame, after render (camera.matrixWorld is current). No allocation. */
    update(dt) {
      if (!ctx || ctx.state !== 'running') return;
      const e = camera.matrixWorld.elements;
      const l = L.listener;
      if (L.params) {
        l.positionX.value = e[12]; l.positionY.value = e[13]; l.positionZ.value = e[14];
        l.forwardX.value = -e[8]; l.forwardY.value = -e[9]; l.forwardZ.value = -e[10];
        l.upX.value = e[4]; l.upY.value = e[5]; l.upZ.value = e[6];
      } else {
        l.setPosition(e[12], e[13], e[14]);
        l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
      }
      windAcc += dt;
      if (wind && windAcc >= WIND_DT) {
        windAcc = 0;
        const now = ctx.currentTime;
        wind.update(e[12], e[13], e[14], now);
        if (fires) fires.tick(e[12], e[13], e[14], now);
      }
    },

    /** RMS dBFS per bus and the master, read from the analysers now. */
    levels() {
      return graph ? graphLevels(graph) : null;
    },

    /**
     * Check without the live context: render `seconds` of the graph offline (master at full),
     * the listener at the camera (position and orientation), the inside state as now (or
     * `opts.inside`), the wind and fires ticking every 0.1 s as live. Returns samples every `step` s:
     * {t, gust, wind, fire, master (dBFS), oneShots}, and `.fire` / `.wind` / `.master` on the
     * array: the power-averaged RMS over every sample, `.peakOneShots`, `.popsScheduled`,
     * `.distances` (each fire's distance and heard dB).
     */
    async renderOffline(seconds = 6, step = 0.5, { inside: insideState = inside } = {}) {
      if (typeof insideState === 'number') insideState = INSIDE_STATES[insideState] ?? INSIDE_STATES[0];
      const { raw } = await load();
      const sr = manifest.sampleRate;
      const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
      const bufs = buffers.wind ? buffers : await decodeAll(off, raw);
      const g = createGraph(off);
      g.master.gain.value = MASTER;
      for (const k in BUS_GAIN) g.buses[k].gain.value = BUS_GAIN[k];
      applyInside(g, insideState, 0, 0);
      camera.updateMatrixWorld();
      const e = camera.matrixWorld.elements, l = off.listener;
      if (l.positionX) {
        l.positionX.value = e[12]; l.positionY.value = e[13]; l.positionZ.value = e[14];
        l.forwardX.value = -e[8]; l.forwardY.value = -e[9]; l.forwardZ.value = -e[10];
        l.upX.value = e[4]; l.upY.value = e[5]; l.upZ.value = e[6];
      } else {
        l.setPosition(e[12], e[13], e[14]);
        l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
      }
      const p = camera.position, t0 = WIND.uWindTime.value;
      const bed = createWindBed(off, g.buses.wind, bufs.wind, manifest.files.wind, p);
      const fs = createFireSources(off, g.buses.fire, bufs, manifest.files, fireSpecs, { panningModel });
      fs.tick(p.x, p.y, p.z, 0);
      const samples = [];
      const pw = { fire: 0, wind: 0, master: 0 };
      const every = Math.max(1, Math.round(step / WIND_DT));
      for (let i = 1; i * WIND_DT < seconds - 1e-6; i++) {
        const t = Math.round(i * WIND_DT * 1000) / 1000;
        off.suspend(t).then(() => {
          if (i % every === 0) {
            const lv = graphLevels(g);
            samples.push({ t, gust: Math.round(bed.gust * 1000) / 1000, wind: lv.wind, fire: lv.fire, master: lv.master, oneShots: fs.oneShots });
            for (const k in pw) pw[k] += 10 ** (lv[k] / 10);
          }
          bed.update(p.x, p.y, p.z, t, t0 + t);
          fs.tick(p.x, p.y, p.z, t);
          off.resume();
        });
      }
      await off.startRendering();
      const db = (v) => Math.round(10 * Math.log10(v / Math.max(1, samples.length) + 1e-12) * 10) / 10;
      for (const k in pw) samples[k] = db(pw[k]);
      samples.peakOneShots = fs.peakOneShots;
      samples.popsScheduled = fs.popsScheduled;
      samples.distances = fs.distances();
      return samples;
    },

    dispose() {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onVisibility);
      window.removeEventListener('keydown', onKey);
      button.dispose();
      if (ctx) ctx.close();
    },
  };
  return engine;
}
