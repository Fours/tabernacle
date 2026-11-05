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
