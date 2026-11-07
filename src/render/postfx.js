import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MipBloomPass } from './bloom.js';
import { QUALITY } from '../config/quality.js';
import { createEyeAdaptation } from './exposure.js';
import { GradeShader, FinishShader, createLensDirtTexture } from './grade.js';

// Post chain: scene (HDR, MSAA) → mip-chain bloom (bloom.js) + eye adaptation (exposure.js)
// → grade (grade.js: shimmer, chromatic aberration, bloom + lens dirt, adapted exposure,
// filmic tint, split tone, vignette, grain) → OutputPass (ACES + sRGB) → finish (S-curve,
// cool black lift, CAS sharpening). `?fx=0` bypasses it all: the scene then renders straight
// to the canvas with the same tone mapping, so the two can be compared. `?ae=0` holds the
// exposure at 1; `?lens=0` turns off the aberration, lens dirt and sharpening.

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {{ enabled?: boolean, shimmerSource?: THREE.Vector3, ae?: boolean, lens?: boolean }} o
 *   shimmerSource: world position at the base of the heat shimmer (above the altar fire).
 */
export function createPostFX(renderer, scene, camera, { enabled = true, shimmerSource = null, ae = true, lens = true } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    type: THREE.HalfFloatType,
    samples: QUALITY.msaa, // 4 (high)
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  // Bloom: threshold in linear HDR with a soft knee (1.5–2.5). Flames, embers, the torch-head
  // cracks and the pillar's core are well above it; firelit linen, metal highlights and the
  // pillar's thin shaft are not.
  const bloom = new MipBloomPass(size.x * pr, size.y * pr, {
    threshold: 2.0, knee: 0.5, scatter: 0.7, start: QUALITY.bloomStart, levels: QUALITY.bloomLevels,
  });
  composer.addPass(bloom);

  const adaptation = createEyeAdaptation();
  const dirt = createLensDirtTexture();
  const grade = new ShaderPass(GradeShader);
  const u = grade.uniforms;
  u.tBloom.value = bloom.texture;
  u.tWide.value = bloom.wideTexture;
  u.tDirt.value = dirt;
  u.uAE.value = ae ? 1 : 0;
  // The grade reads the adapted exposure; update it from the HDR frame just before.
  const gradeRender = grade.render.bind(grade);
  let dt = 0;
  grade.render = (r, writeBuffer, readBuffer, ...rest) => {
    if (u.uAE.value > 0) adaptation.update(r, readBuffer.texture, dt);
    u.tExposure.value = adaptation.texture;
    gradeRender(r, writeBuffer, readBuffer, ...rest);
  };
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);
  const lensDefaults = { ca: u.uCA.value, dirt: u.uDirt.value, sharpen: finish.uniforms.uSharpen.value };
  function setLens(on) {
    u.uCA.value = on ? lensDefaults.ca : 0;
    u.uDirt.value = on ? lensDefaults.dirt : 0;
    finish.uniforms.uSharpen.value = on ? lensDefaults.sharpen : 0;
  }
  setLens(lens);

  const sp = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  function updateShimmer() {
    if (!shimmerSource) return;
    sp.copy(shimmerSource);
    const dist = sp.distanceTo(camera.position);
    camera.getWorldDirection(camDir);
    const facing = (sp.x - camera.position.x) * camDir.x + (sp.y - camera.position.y) * camDir.y + (sp.z - camera.position.z) * camDir.z > 0;
    sp.project(camera);
    // Radius ~1.6 m of world space at the source, in uv.y units.
    const fovScale = 1 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const r = (1.6 * fovScale) / Math.max(dist, 0.5) / 2;
    u.uShimmer.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5 + r * 0.55, r, 0);
    // Only near the fire (fades out with distance); strength in uv units.
    const s = facing ? 0.0028 * (1 - THREE.MathUtils.smoothstep(dist, 8, 22)) : 0;
    u.uShimmer.value.w = s;
  }

  const fx = {
    composer,
    bloom,
    grade,
    finish,
    adaptation,
    enabled,
    /** Tuning handles: bloom (threshold, knee, scatter), grade, finish, adaptation uniforms. */
    uniforms: { bloom: bloom.uniforms, grade: u, finish: finish.uniforms, adaptation: adaptation.uniforms },
    setLens,
    /** Camera inside the tent (main.js, each frame): picks the adaptation key. */
    setInside: (inside) => adaptation.setInside(inside),
    /** Debug only (CPU readback): { stops, exposure, logLum } of the eye adaptation. */
    readExposure: () => adaptation.read(renderer),
    lastTime: null,
    render(time) {
      if (!fx.enabled) {
        renderer.render(scene, camera);
        return;
      }
      // Seconds since the last frame, capped so a stalled tab doesn't jump the adaptation.
      dt = fx.lastTime === null ? 0 : THREE.MathUtils.clamp(time - fx.lastTime, 0, 0.25);
      fx.lastTime = time;
      u.uTime.value = time % 1000;
      updateShimmer();
      composer.render();
    },
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      u.uAspect.value = w / h;
      const pr2 = renderer.getPixelRatio();
      finish.uniforms.uTexel.value.set(1 / (w * pr2), 1 / (h * pr2));
    },
  };
  u.uAspect.value = size.x / size.y;
  finish.uniforms.uTexel.value.set(1 / (size.x * pr), 1 / (size.y * pr));
  return fx;
}
