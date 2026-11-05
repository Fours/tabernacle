import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PLAYER } from '../config/dimensions.js';
import { resolveCircle } from '../scene/colliders.js';

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
 */
export function createFirstPerson(camera, domElement, colliders, spawn) {
  const controls = new PointerLockControls(camera, domElement);
  const keys = { f: false, b: false, l: false, r: false, run: false };
  const pos = { x: 0, z: 0 };

  const hint = document.createElement('div');
  hint.className = 'fp-hint';
  hint.textContent = 'Click to look around · WASD / arrows to walk · Shift to run · Esc to release';
  document.body.appendChild(hint);
  // Request pointer lock ourselves so failures (e.g. embedded/iframe browsers) are handled
  // gracefully instead of logging errors; keyboard walking still works without lock.
  const doc = domElement.ownerDocument;
  if (controls._onPointerlockError) doc.removeEventListener('pointerlockerror', controls._onPointerlockError);
  const onLockError = () => {
    hint.textContent = 'Mouse look unavailable here (pointer lock blocked) · WASD / arrows still walk';
  };
  doc.addEventListener('pointerlockerror', onLockError);
  const requestLock = () => {
    try {
      const p = domElement.requestPointerLock();
      if (p && p.catch) p.catch(onLockError);
    } catch {
      onLockError();
    }
  };
  hint.addEventListener('click', requestLock);
  domElement.addEventListener('click', requestLock);
  controls.addEventListener('lock', () => hint.classList.add('hidden'));
  controls.addEventListener('unlock', () => hint.classList.remove('hidden'));

  const onKey = (down) => (e) => {
    const k = KEYMAP[e.code];
    if (k) {
      keys[k] = down;
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
    camera.position.set(pos.x, PLAYER.eyeHeight, pos.z);
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

  /** Advance by dt seconds with movement input k (forward/back/left/right/run). */
  function step(dt, k) {
    const mf = (k.f ? 1 : 0) - (k.b ? 1 : 0);
    const mr = (k.r ? 1 : 0) - (k.l ? 1 : 0);
    if (mf === 0 && mr === 0) return;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.crossVectors(fwd, UP).normalize();
    const speed = k.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
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
    camera.position.set(pos.x, PLAYER.eyeHeight, pos.z);
  }

  return {
    controls,
    reset,
    setPosition,
    getPosition: () => ({ x: pos.x, y: camera.position.y, z: pos.z }),
    /** Face a compass yaw: 0 = north (-Z), PI/2 = west (-X). */
    setYaw(yaw) {
      camera.rotation.set(0, yaw, 0, 'YXZ');
    },
    /** Debug: simulate holding keys for `seconds` at 60 Hz (no pointer lock needed). */
    simulate(input, seconds) {
      const k = { f: false, b: false, l: false, r: false, run: false, ...input };
      const steps = Math.round(seconds * 60);
      for (let i = 0; i < steps; i++) step(1 / 60, k);
      return { x: pos.x, z: pos.z };
    },
    update(dt) {
      // Keyboard walking works with or without pointer lock; lock is only needed for mouse look.
      step(Math.min(dt, 0.1), keys);
    },
    dispose() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      doc.removeEventListener('pointerlockerror', onLockError);
      domElement.removeEventListener('click', requestLock);
      controls.dispose();
      hint.remove();
    },
  };
}
