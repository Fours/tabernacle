import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Post chain: scene (HDR, MSAA) → bloom → night grade (heat shimmer, split tone, vignette,
// grain) → OutputPass (tone mapping + sRGB). `?fx=0` bypasses it all: the scene then renders
// straight to the canvas with the same tone mapping, so the two can be compared.

const GradeShader = {
  name: 'NightGrade',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    // Heat shimmer: screen-space ellipse above the altar fire (uv center, radius in uv.y units).
    uShimmer: { value: new THREE.Vector4(0.5, 0.5, 0.1, 0) }, // x, y, radius, strength
    uVignette: { value: 0.38 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uAspect;
uniform vec4 uShimmer;
uniform float uVignette;
uniform float uGrain;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 uv = vUv;
  // Heat shimmer: rising, wobbling refraction inside a soft ellipse above the fire.
  if (uShimmer.w > 0.0) {
    vec2 d = (uv - uShimmer.xy) / uShimmer.z;
    d.x *= uAspect * 1.6;
    float mask = 1.0 - smoothstep(0.35, 1.0, length(d));
    if (mask > 0.0) {
      vec2 q = vec2(uv.x * uAspect, uv.y) / uShimmer.z;
      vec2 off = vec2(noise(q * 9.0 + vec2(0.0, -uTime * 2.6)), noise(q * 9.0 + vec2(5.2, -uTime * 3.1))) - 0.5;
      uv += off * uShimmer.w * mask;
    }
  }
  vec3 col = texture2D(tDiffuse, uv).rgb;
  // Night split tone (linear, pre tone mapping): cool lift in the darks, warmth kept in the lights.
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float dark = 1.0 - smoothstep(0.0, 0.08, l);
  col += vec3(0.0010, 0.0016, 0.0042) * dark;
  col = mix(col, col * vec3(0.92, 0.97, 1.12), dark * 0.6);
  // Vignette.
  vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
  col *= 1.0 - uVignette * smoothstep(0.25, 0.95, length(v));
  // Film grain, multiplicative so it scales with brightness (invisible in pure black).
  float g = hash(vUv * 1000.0 + fract(uTime * 7.13) * 100.0) - 0.5;
  col *= 1.0 + g * uGrain * 2.0;
  gl_FragColor = vec4(col, 1.0);
}
`,
};

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {{ enabled?: boolean, shimmerSource?: THREE.Vector3 }} o
 *   shimmerSource: world position at the base of the heat shimmer (above the altar fire).
 */
export function createPostFX(renderer, scene, camera, { enabled = true, shimmerSource = null } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  // Bloom at half resolution. Threshold is in linear HDR: flames, embers and the torch-head
  // cracks are well above it, firelit linen is not.
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.55, 1.4);
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const sp = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const u = grade.uniforms;

  function updateShimmer() {
    if (!shimmerSource) return;
    sp.copy(shimmerSource);
    const dist = sp.distanceTo(camera.position);
    camera.getWorldDirection(camDir);
    const facing = sp.clone().sub(camera.position).dot(camDir) > 0;
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
    enabled,
    render(time) {
      if (!fx.enabled) {
        renderer.render(scene, camera);
        return;
      }
      u.uTime.value = time % 1000;
      updateShimmer();
      composer.render();
    },
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      u.uAspect.value = w / h;
    },
  };
  u.uAspect.value = size.x / size.y;
  return fx;
}
