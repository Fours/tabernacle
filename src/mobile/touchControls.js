import * as THREE from 'three';
import { PLAYER } from '../config/dimensions.js';
import { getViewport, toLogical } from './device.js';

/**
 * Touch controls for mobile mode (used by camera/firstPerson.js): a floating thumbstick to walk
 * and a drag anywhere else to look. Pointer Events, tracked by pointerId, so both thumbs work at
 * once. Every point goes through `toLogical()`, so directions hold in the rotated portrait frame.
 *
 * - A touch starting in the left `PLAYER.stickZone` of the logical screen spawns the stick there
 *   (kept clear of the `--safe-*` insets). `move` = {x, y, run}: x right, y forward, magnitude
 *   0..1 of walking speed; `run` past `PLAYER.stickRunAt` of the radius.
 * - Any other touch drags the view: yaw and pitch ('YXZ'), pitch clamped like
 *   PointerLockControls, `PLAYER.touchLookSpeed` radians per logical px.
 *
 * `target` receives pointerdown (the canvas); moves and ups are read on window. `container`
 * (#app) holds the stick elements. Returns {move, releaseAll, setEnabled, dispose}.
 */
const PITCH_LIMIT = Math.PI / 2 - 0.01;

export function createTouchControls(camera, target, container) {
  const R = PLAYER.stickRadius;
  const move = { x: 0, y: 0, run: false };
  let enabled = true;

  // Stick: base ring + knob, drawn while held. pointer-events: none (style.css).
  const stick = document.createElement('div');
  stick.className = 'touch-stick';
  stick.style.width = stick.style.height = `${R * 2}px`;
  stick.innerHTML = '<div class="touch-stick__run"></div><div class="touch-stick__knob"></div>';
  const knob = stick.querySelector('.touch-stick__knob');
  stick.querySelector('.touch-stick__run').style.inset = `${R * (1 - PLAYER.stickRunAt)}px`;
  // Probe sized by the rotated safe-area insets, read when a stick spawns (offsets are layout
  // values in the logical frame, unaffected by the rotation transform).
  const safe = document.createElement('div');
  safe.className = 'touch-safe';
  container.append(stick, safe);

  const pt = { x: 0, y: 0 };
  let stickId = -1;
  let cx = 0, cy = 0; // stick centre (logical px)
  let lookId = -1;
  let lx = 0, ly = 0; // last look point
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function setStick(dx, dy) {
    let d = Math.hypot(dx, dy);
    if (d > R) {
      dx *= R / d;
      dy *= R / d;
      d = R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = d / R;
    const run = m >= PLAYER.stickRunAt;
    if (run !== move.run) stick.classList.toggle('running', run);
    move.run = run;
    if (m <= PLAYER.stickDeadZone) {
      move.x = move.y = 0;
      return;
    }
    // Speed fraction: 0 at the dead zone, 1 (full walk) by stickWalkFull; direction from the knob.
    const s = Math.min(1, (m - PLAYER.stickDeadZone) / (PLAYER.stickWalkFull - PLAYER.stickDeadZone));
    move.x = (dx / d) * s;
    move.y = (-dy / d) * s; // logical up = forward
  }

  function releaseStick() {
    stickId = -1;
    move.x = move.y = 0;
    move.run = false;
    stick.classList.remove('active', 'running');
    knob.style.transform = '';
  }

  function look(dx, dy) {
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= dx * PLAYER.touchLookSpeed;
    euler.x -= dy * PLAYER.touchLookSpeed;
    euler.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, euler.x));
    camera.quaternion.setFromEuler(euler);
  }

  const onDown = (e) => {
    if (!enabled) return;
    toLogical(e.clientX, e.clientY, pt);
    const inZone = pt.x < getViewport().width * PLAYER.stickZone;
    if (inZone && stickId === -1) {
      stickId = e.pointerId;
      // Keep the whole base inside the safe area.
      const m = 8;
      const x0 = safe.offsetLeft + R + m, x1 = safe.offsetLeft + safe.offsetWidth - R - m;
      const y0 = safe.offsetTop + R + m, y1 = safe.offsetTop + safe.offsetHeight - R - m;
      cx = Math.max(x0, Math.min(x1, pt.x));
      cy = Math.max(y0, Math.min(y1, pt.y));
      stick.style.transform = `translate(${cx - R}px, ${cy - R}px)`;
      stick.classList.add('active');
      setStick(pt.x - cx, pt.y - cy);
    } else if (lookId === -1) {
      lookId = e.pointerId;
      lx = pt.x;
      ly = pt.y;
    } else {
      return;
    }
    e.preventDefault();
  };

  const onMove = (e) => {
    if (e.pointerId === stickId) {
      toLogical(e.clientX, e.clientY, pt);
      setStick(pt.x - cx, pt.y - cy);
    } else if (e.pointerId === lookId) {
      toLogical(e.clientX, e.clientY, pt);
      look(pt.x - lx, pt.y - ly);
      lx = pt.x;
      ly = pt.y;
    }
  };

  const onUp = (e) => {
    if (e.pointerId === stickId) releaseStick();
    else if (e.pointerId === lookId) lookId = -1;
  };

  function releaseAll() {
    releaseStick();
    lookId = -1;
  }
  const onVisibility = () => {
    if (document.hidden) releaseAll();
  };

  target.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    /** Live analog input: {x, y, run} (x right, y forward, magnitude = fraction of walk speed). */
    move,
    releaseAll,
    /** Disabled while the title screen is up: releases everything and ignores new touches. */
    setEnabled(on) {
      enabled = on;
      if (!on) releaseAll();
    },
    dispose() {
      target.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      stick.remove();
      safe.remove();
    },
  };
}
