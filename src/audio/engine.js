import { createGraph, graphLevels } from './graph.js';
import { createWindBed } from './wind.js';
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
 * - `update(dt)` (main.js loop, after render): the listener follows the camera; the wind bed
 *   retargets at ~10 Hz. Does nothing unless the context is running.
 * - Mute (button, `M`, `localStorage` 'tabernacle.muted'): ramps the master to 0 and suspends.
 *   Hidden tab / pagehide: suspend; visible again: resume unless muted.
 */
const BASE = '/assets/audio/';
const MASTER = 1;
const BUS_GAIN = { fire: 1, wind: 0.7, insects: 1 }; // Step 4 sets the final mix
const FADE_IN = 1.5, MUTE_RAMP = 0.2, UNMUTE_RAMP = 0.3; // s
const WIND_DT = 0.1; // s between wind envelope updates
const STORE = 'tabernacle.muted';

const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200));

function readMuted() {
  try { return localStorage.getItem(STORE) === '1'; } catch { return false; }
}
function saveMuted(v) {
  try { localStorage.setItem(STORE, v ? '1' : '0'); } catch { /* private mode */ }
}

export function createAudioEngine({ camera, app, mobile = false, hrtf = true }) {
  let ctx = null, graph = null, wind = null;
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
    /** Panning model for positional sources (QUALITY.audioHrtf). */
    panningModel: hrtf ? 'HRTF' : 'equalpower',

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
        wind.update(e[12], e[13], e[14], ctx.currentTime);
      }
    },

    /** RMS dBFS per bus and the master, read from the analysers now. */
    levels() {
      return graph ? graphLevels(graph) : null;
    },

    /**
     * Check without the live context: render `seconds` of the graph offline (master at full),
     * the listener at the camera, the wind clock running from now. Returns samples every `step`
     * s: {t, gust, wind, master} (dBFS).
     */
    async renderOffline(seconds = 6, step = 0.5) {
      const { raw } = await load();
      const sr = manifest.sampleRate;
      const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
      const bufs = buffers.wind ? buffers : await decodeAll(off, { wind: raw.wind });
      const g = createGraph(off);
      g.master.gain.value = MASTER;
      for (const k in BUS_GAIN) g.buses[k].gain.value = BUS_GAIN[k];
      const p = camera.position, t0 = WIND.uWindTime.value;
      const bed = createWindBed(off, g.buses.wind, bufs.wind, manifest.files.wind, p);
      const samples = [];
      for (let t = step; t < seconds; t += step) {
        off.suspend(t).then(() => {
          const lv = graphLevels(g);
          samples.push({ t, gust: Math.round(bed.gust * 1000) / 1000, wind: lv.wind, master: lv.master });
          bed.update(p.x, p.y, p.z, t, t0 + t);
          off.resume();
        });
      }
      await off.startRendering();
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
