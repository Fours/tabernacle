import * as THREE from 'three';

/** Grid + axes + FPS/draw-call readout. Returns { group, update(renderer) }. */
export function createDebug() {
  const group = new THREE.Group();
  group.name = 'debug';
  const grid = new THREE.GridHelper(60, 60, 0xff4444, 0x444444);
  grid.position.y = 0.01;
  group.add(grid);
  const axes = new THREE.AxesHelper(5);
  axes.position.y = 0.02;
  group.add(axes);

  const el = document.createElement('div');
  el.className = 'debug-readout';
  document.body.appendChild(el);

  let frames = 0, last = performance.now(), fps = 0;
  return {
    group,
    update(renderer) {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        fps = (frames * 1000) / (now - last);
        frames = 0;
        last = now;
        const r = renderer.info.render;
        el.textContent = `${fps.toFixed(0)} fps | ${r.calls} draws | ${r.triangles} tris`;
      }
    },
  };
}

/**
 * `?fps=1`: a minimal readout for phones (and desktop): rolling average of the real
 * requestAnimationFrame interval (ms and fps), draw calls and the current pixel ratio. Lives in
 * `#app`, so it rotates with the scene, inside the rotated safe area (`--safe-*`).
 * Returns { update(frameMs, renderer) }; call once per frame. No allocations per frame.
 */
export function createFpsReadout(parent, tier) {
  const el = document.createElement('div');
  el.className = 'fps-readout';
  parent.appendChild(el);
  const N = 60;
  const samples = new Float32Array(N);
  let i = 0, filled = 0, sum = 0, last = 0;
  return {
    update(frameMs, renderer) {
      if (frameMs > 0) {
        sum += frameMs - samples[i];
        samples[i] = frameMs;
        i = (i + 1) % N;
        filled = Math.min(filled + 1, N);
      }
      const now = performance.now();
      if (now - last < 500 || filled === 0) return;
      last = now;
      const ms = sum / filled;
      const r = renderer.info.render;
      el.textContent = `${ms.toFixed(1)} ms · ${(1000 / ms).toFixed(0)} fps\n${r.calls} draws · ${renderer.getPixelRatio().toFixed(2)}x · ${tier}`;
    },
  };
}
