import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PLAYER } from '../config/dimensions.js';
import { resolveCircle } from '../scene/colliders.js';
import { groundHeight } from '../scene/terrain.js';
import { isMobile } from '../mobile/device.js';
import { createTouchControls } from '../mobile/touchControls.js';

const KEYMAP = {
  KeyW: 'f', ArrowUp: 'f',
  KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l',
  KeyD: 'r', ArrowRight: 'r',
  ShiftLeft: 'run', ShiftRight: 'run',
};

/**
 * Pointer-lock first-person walker with XZ circle-vs-collider collision.
 * spawn: { pos: [x,y,z], target: [x,y,z] } in meters.
 * In mobile mode (mobile/device.js) there is no pointer lock: touch controls (a thumbstick and
 * drag to look, mobile/touchControls.js) drive it, and a corner button replaces Esc.
 * onEnter(): called synchronously inside every enter click/tap (the audio unlock needs the
 * user gesture). onIntro(shown): the title screen was shown or hidden. sound: list `M` (mute) in
 * the desktop controls.
 */
export function createFirstPerson(camera, domElement, colliders, spawn, { bob = true, onEnter = null, onIntro = null, sound = false } = {}) {
  const controls = new PointerLockControls(camera, domElement);
  controls.pointerSpeed = PLAYER.lookSpeed;
  let bobPhase = 0;
  let bobAmt = 0; // 0..1, eased in/out so starting and stopping is smooth
  const keys = { f: false, b: false, l: false, r: false, run: false };
  // Per-frame input for step(): the keys plus the touch stick's analog {x, y}.
  const input = { f: false, b: false, l: false, r: false, run: false, x: 0, y: 0 };
  const app = document.getElementById('app') ?? document.body;
  const touch = isMobile ? createTouchControls(camera, domElement, app) : null;
  const pos = { x: 0, z: 0 };

  // Title and controls overlay: shown at the start and whenever the pointer is released (Esc).
  // Clicking it (or the canvas) locks the pointer and fades it out.
  const intro = document.createElement('div');
  intro.className = 'fp-intro';
  intro.innerHTML = `
    <div class="fp-intro__inner">
      <h1 class="fp-title">
        <span class="fp-title__the">The</span>
        <span class="fp-title__main"><span class="fp-title__cap">T</span>abernacle</span>
      </h1>
      <div class="fp-rule" aria-hidden="true"><span></span></div>
      <dl class="fp-controls">${isMobile ? `
        <dt><kbd class="wide">Left thumb</kbd></dt><dd>Walk <i>(push further to run)</i></dd>
        <dt><kbd class="wide">Drag</kbd></dt><dd>Look around</dd>` : `
        <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><i>or</i><kbd>&uarr;</kbd><kbd>&larr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd></dt><dd>Walk</dd>
        <dt><kbd class="wide">Mouse</kbd></dt><dd>Look around</dd>
        <dt><kbd class="wide">Shift</kbd></dt><dd>Run</dd>
        <dt><kbd class="wide">Esc</kbd></dt><dd>Release the mouse</dd>${sound ? `
        <dt><kbd>M</kbd></dt><dd>Sound on/off</dd>` : ''}`}
      </dl>
      <div class="fp-rule" aria-hidden="true"><span></span></div>
      <p class="fp-start">${isMobile ? 'Tap' : 'Click'} to enter</p>
      <figure class="fp-verse">
        <blockquote>&ldquo;Enter his gates with thanksgiving, and his courts with praise!&rdquo;</blockquote>
        <figcaption>Psalm 100:4</figcaption>
      </figure>
    </div>`;
  // Inside #app, so the title screen rotates with the scene on phones in portrait.
  app.appendChild(intro);
  if (isMobile) intro.classList.add('fp-intro--touch');
  const startLine = intro.querySelector('.fp-start');
  // While the overlay is up the player can't move: held keys are released and new presses ignored.
  let introShown = true;
  const showIntro = () => {
    introShown = true;
    intro.classList.remove('hidden');
    for (const k in keys) keys[k] = false;
    if (touch) touch.setEnabled(false);
    if (menuBtn) menuBtn.classList.add('hidden');
    if (onIntro) onIntro(true);
  };
  const hideIntro = () => {
    introShown = false;
    intro.classList.add('hidden');
    if (touch) touch.setEnabled(true);
    if (menuBtn) menuBtn.classList.remove('hidden');
    if (onIntro) onIntro(false);
  };

  // Mobile: a small corner button (in the safe area) brings the title screen back, as Esc does.
  let menuBtn = null;
  if (isMobile) {
    menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'fp-menu hidden';
    menuBtn.setAttribute('aria-label', 'Show the title screen');
    menuBtn.innerHTML = '<span></span><span></span><span></span>';
    menuBtn.addEventListener('click', showIntro);
    app.appendChild(menuBtn);
    touch.setEnabled(false);
  }

  // Request pointer lock ourselves so failures are handled gracefully instead of logging
  // errors. Two kinds: right after Esc the browser refuses a new lock for about a second (try
  // again), and embedded browsers never allow it (then walk with the keys, no mouse look).
  const doc = domElement.ownerDocument;
  if (controls._onPointerlockError) doc.removeEventListener('pointerlockerror', controls._onPointerlockError);
  let everLocked = false;
  let lockUnavailable = false;
  const onLockError = () => {
    if (everLocked) {
      startLine.textContent = 'Click again to enter';
    } else {
      lockUnavailable = true;
      startLine.textContent = 'Mouse look is unavailable here. Click to walk with the keys';
    }
  };
  doc.addEventListener('pointerlockerror', onLockError);
  const requestLock = () => {
    if (onEnter) onEnter();
    if (lockUnavailable) {
      hideIntro();
      return;
    }
    try {
      const p = domElement.requestPointerLock();
      if (p && p.catch) p.catch(onLockError);
    } catch {
      onLockError();
    }
  };
  // Mobile: no pointer lock; tapping the title screen just hides it.
  if (isMobile) {
    intro.addEventListener('click', () => {
      if (onEnter) onEnter();
      hideIntro();
    });
  } else {
    intro.addEventListener('click', requestLock);
    domElement.addEventListener('click', requestLock);
  }
  controls.addEventListener('lock', () => {
    everLocked = true;
    startLine.textContent = 'Click to enter';
    hideIntro();
  });
  controls.addEventListener('unlock', showIntro);
  // Without pointer lock, Esc still brings the overlay back. Esc on the overlay does nothing:
  // only a click (or tap) dismisses it.
  const onEsc = (e) => {
    if (e.code === 'Escape' && !controls.isLocked) showIntro();
  };
  window.addEventListener('keydown', onEsc);

  const onKey = (down) => (e) => {
    const k = KEYMAP[e.code];
    if (k) {
      if (!(down && introShown)) keys[k] = down;
      e.preventDefault();
    }
  };
  const onDown = onKey(true), onUp = onKey(false);
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  const onBlur = () => Object.keys(keys).forEach((k) => (keys[k] = false));
  window.addEventListener('blur', onBlur);

  const setPosition = (x, z) => {
    pos.x = x;
    pos.z = z;
    resolveCircle(pos, PLAYER.radius, colliders);
    camera.position.set(pos.x, groundHeight(pos.x, pos.z) + PLAYER.eyeHeight, pos.z);
  };
  const reset = () => {
    camera.position.set(...spawn.pos);
    camera.lookAt(...spawn.target);
    setPosition(spawn.pos[0], spawn.pos[2]);
  };
  reset();

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  /**
   * Advance by dt seconds with movement input k: keys {f, b, l, r, run} and/or an analog
   * {x, y} (x right, y forward; magnitude = fraction of walking speed, 1 at most). Keys win when
   * any is held. `run` uses the run speed in the input's direction. Returns the speed (m/s).
   */
  function step(dt, k) {
    let mf = (k.f ? 1 : 0) - (k.b ? 1 : 0);
    let mr = (k.r ? 1 : 0) - (k.l ? 1 : 0);
    let scale = 1;
    if (mf === 0 && mr === 0) {
      mf = k.y || 0;
      mr = k.x || 0;
      scale = Math.min(1, Math.hypot(mf, mr));
      if (scale === 0) return 0;
    }
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.crossVectors(fwd, UP).normalize();
    const speed = k.run ? PLAYER.runSpeed : PLAYER.walkSpeed * scale;
    let dx = fwd.x * mf + right.x * mr;
    let dz = fwd.z * mf + right.z * mr;
    const len = Math.hypot(dx, dz);
    dx = (dx / len) * speed * dt;
    dz = (dz / len) * speed * dt;
    // Sub-step so fast movement can't tunnel through thin hangings.
    const maxStep = PLAYER.radius * 0.5;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / maxStep));
    for (let i = 0; i < n; i++) {
      pos.x += dx / n;
      pos.z += dz / n;
      resolveCircle(pos, PLAYER.radius, colliders);
    }
    camera.position.set(pos.x, groundHeight(pos.x, pos.z) + PLAYER.eyeHeight, pos.z);
    return speed;
  }

  return {
    controls,
    /** Mobile: the touch controls ({move, releaseAll, setEnabled}); null on desktop. */
    touch,
    reset,
    setPosition,
    getPosition: () => ({ x: pos.x, y: camera.position.y, z: pos.z }),
    /** Face a compass yaw: 0 = north (-Z), PI/2 = west (-X). */
    setYaw(yaw) {
      camera.rotation.set(0, yaw, 0, 'YXZ');
    },
    /** Debug: simulate holding keys (or an analog {x, y}) for `seconds` at 60 Hz. */
    simulate(held, seconds) {
      const k = { f: false, b: false, l: false, r: false, run: false, x: 0, y: 0, ...held };
      const steps = Math.round(seconds * 60);
      for (let i = 0; i < steps; i++) step(1 / 60, k);
      return { x: pos.x, z: pos.z };
    },
    update(dt) {
      // Keyboard walking works with or without pointer lock; lock is only needed for mouse look.
      dt = Math.min(dt, 0.1);
      input.f = keys.f;
      input.b = keys.b;
      input.l = keys.l;
      input.r = keys.r;
      input.run = keys.run || (touch !== null && touch.move.run);
      input.x = touch ? touch.move.x : 0;
      input.y = touch ? touch.move.y : 0;
      const speed = step(dt, input);
      if (!bob) return;
      // Head bob: two vertical cycles per stride pair, eased by walking state. Purely visual
      // (camera y only); collision uses the XZ position. Eye height is over the relief (terrain.js).
      // The bob's depth follows the speed, so a gentle push on the stick bobs gently.
      bobAmt += (Math.min(1, speed / PLAYER.walkSpeed) - bobAmt) * Math.min(1, dt * 8);
      bobPhase += speed * dt * PLAYER.bobStride * Math.PI * 2;
      const amp = PLAYER.bobAmplitude * (speed > PLAYER.walkSpeed ? 1.5 : 1);
      camera.position.y = groundHeight(pos.x, pos.z) + PLAYER.eyeHeight + Math.sin(bobPhase) * amp * bobAmt;
    },
    dispose() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      doc.removeEventListener('pointerlockerror', onLockError);
      window.removeEventListener('keydown', onEsc);
      domElement.removeEventListener('click', requestLock);
      controls.dispose();
      intro.remove();
      if (touch) touch.dispose();
      if (menuBtn) menuBtn.remove();
    },
  };
}
