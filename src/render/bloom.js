import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Mip-chain bloom (the Call of Duty: Advanced Warfare / Unreal / Unity HDRP scheme), replacing
// UnrealBloomPass. Why custom: UnrealBloomPass blurs 5 mips with separable Gaussians and sums
// them with fixed weights, which gives a visible ring around small hot sources and lets single
// bright pixels flicker. Here:
// 1. Prefilter: full-res HDR → half res with the 13-tap downsample, its 5 groups weighted by a
//    Karis average (1 / (1 + luma)) so one hot pixel can't dominate (no fireflies), then a
//    soft-knee gate (smoothstep from threshold − knee to threshold + knee).
// 2. Downsample: 13-tap filter, one mip at a time, LEVELS deep (1/2 … 1/128 of the frame).
// 3. Upsample: 3×3 tent filter of the coarser level, lerped with the finer level by `scatter`
//    (energy conserving: the blur spreads the gated input's energy without adding to it).
// The pass doesn't touch the composer's buffers (needsSwap false); the grade pass adds
// `texture` (the half-res result) and reads `wideTexture` (a coarse level) for lens dirt.

const LEVELS = 7;

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// 13-tap downsample (Jimenez 2014). `KARIS` weights each 2×2 group by 1 / (1 + luma).
const downFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel; // source texel size
uniform vec4 uThreshold; // threshold, knee
uniform float uClampMax;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 safe(vec3 c) {
  // NaN/Inf guard: a comparison with NaN is false, so these pixels become black.
  return (dot(c, vec3(1.0)) < 1e5) ? max(c, vec3(0.0)) : vec3(0.0);
}
void main() {
  vec3 a = safe(s(vec2(-2, 2))), b = safe(s(vec2(0, 2))), c = safe(s(vec2(2, 2)));
  vec3 d = safe(s(vec2(-2, 0))), e = safe(s(vec2(0, 0))), f = safe(s(vec2(2, 0)));
  vec3 g = safe(s(vec2(-2, -2))), h = safe(s(vec2(0, -2))), i = safe(s(vec2(2, -2)));
  vec3 j = safe(s(vec2(-1, 1))), k = safe(s(vec2(1, 1)));
  vec3 l = safe(s(vec2(-1, -1))), m = safe(s(vec2(1, -1)));
#ifdef KARIS
  vec3 g0 = (j + k + l + m) * 0.25;
  vec3 g1 = (a + b + d + e) * 0.25;
  vec3 g2 = (b + c + e + f) * 0.25;
  vec3 g3 = (d + e + g + h) * 0.25;
  vec3 g4 = (e + f + h + i) * 0.25;
  float w0 = 0.5 / (1.0 + luma(g0));
  float w1 = 0.125 / (1.0 + luma(g1));
  float w2 = 0.125 / (1.0 + luma(g2));
  float w3 = 0.125 / (1.0 + luma(g3));
  float w4 = 0.125 / (1.0 + luma(g4));
  vec3 col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  col = min(col, vec3(uClampMax));
  // Soft-knee threshold on the brightest channel: a smooth gate from threshold − knee to
  // threshold + knee that passes the whole colour (like UnrealBloomPass's high-pass, so the
  // scene's emissives, tuned against it, keep their glow) without its hard edge.
  float br = max(col.r, max(col.g, col.b));
  col *= smoothstep(uThreshold.x - uThreshold.y, uThreshold.x + uThreshold.y, br);
#else
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
#endif
  gl_FragColor = vec4(col, 1.0);
}
`;

// 3×3 tent upsample of the coarser level, lerped with the finer level.
const upFrag = /* glsl */ `
uniform sampler2D tCoarse;
uniform sampler2D tFine;
uniform vec2 uTexel; // coarse texel size
uniform float uScatter;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tCoarse, vUv + o * uTexel).rgb; }
void main() {
  vec3 up = s(vec2(0)) * 4.0
    + (s(vec2(-1, 0)) + s(vec2(1, 0)) + s(vec2(0, -1)) + s(vec2(0, 1))) * 2.0
    + s(vec2(-1, -1)) + s(vec2(1, -1)) + s(vec2(-1, 1)) + s(vec2(1, 1));
  up *= 1.0 / 16.0;
  gl_FragColor = vec4(mix(texture2D(tFine, vUv).rgb, up, uScatter), 1.0);
}
`;

export class MipBloomPass extends Pass {
  /**
   * @param {number} width  full-resolution buffer width (px)
   * @param {number} height full-resolution buffer height (px)
   * @param {{ threshold?: number, knee?: number, scatter?: number }} o
   */
  constructor(width, height, { threshold = 2.0, knee = 0.5, scatter = 0.7 } = {}) {
    super();
    this.needsSwap = false;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.down = Array.from({ length: LEVELS }, () => new THREE.WebGLRenderTarget(1, 1, opts));
    this.up = Array.from({ length: LEVELS - 1 }, () => new THREE.WebGLRenderTarget(1, 1, opts));

    this.uniforms = {
      threshold: { value: threshold },
      knee: { value: knee },
      scatter: { value: scatter },
    };
    this.prefilter = new THREE.ShaderMaterial({
      name: 'BloomPrefilter',
      defines: { KARIS: '' },
      uniforms: {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: new THREE.Vector4() },
        uClampMax: { value: 64 },
      },
      vertexShader: vert,
      fragmentShader: downFrag,
      depthTest: false,
      depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      name: 'BloomDown',
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: vert,
      fragmentShader: downFrag,
      depthTest: false,
      depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      name: 'BloomUp',
      uniforms: {
        tCoarse: { value: null },
        tFine: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uScatter: this.uniforms.scatter,
      },
      vertexShader: vert,
      fragmentShader: upFrag,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.prefilter);
    this.setSize(width, height);
  }

  /** Half-res bloom result (add to the scene). */
  get texture() {
    return this.up[0].texture;
  }

  /** A coarse, very wide level (1/16 res), for the lens dirt. */
  get wideTexture() {
    return this.up[3].texture;
  }

  setSize(width, height) {
    let w = width, h = height;
    for (let i = 0; i < LEVELS; i++) {
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
      this.down[i].setSize(w, h);
      if (i < LEVELS - 1) this.up[i].setSize(w, h);
    }
  }

  render(renderer, writeBuffer, readBuffer) {
    const t = this.uniforms.threshold.value;
    const k = Math.max(this.uniforms.knee.value, 1e-3);
    this.prefilter.uniforms.uThreshold.value.set(t, k, 0, 0);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;

    // Prefilter (full res → 1/2).
    const src = readBuffer.texture;
    this.prefilter.uniforms.tSrc.value = src;
    this.prefilter.uniforms.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    this.quad.material = this.prefilter;
    renderer.setRenderTarget(this.down[0]);
    this.quad.render(renderer);

    // Downsample chain.
    this.quad.material = this.downMat;
    for (let i = 1; i < LEVELS; i++) {
      const s = this.down[i - 1];
      this.downMat.uniforms.tSrc.value = s.texture;
      this.downMat.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
      renderer.setRenderTarget(this.down[i]);
      this.quad.render(renderer);
    }

    // Upsample chain: up[i] = mix(down[i], tent(up[i+1] or down[last]), scatter).
    this.quad.material = this.upMat;
    for (let i = LEVELS - 2; i >= 0; i--) {
      const coarse = i === LEVELS - 2 ? this.down[LEVELS - 1] : this.up[i + 1];
      this.upMat.uniforms.tCoarse.value = coarse.texture;
      this.upMat.uniforms.tFine.value = this.down[i].texture;
      this.upMat.uniforms.uTexel.value.set(1 / coarse.width, 1 / coarse.height);
      renderer.setRenderTarget(this.up[i]);
      this.quad.render(renderer);
    }
    renderer.autoClear = autoClear;
  }

  dispose() {
    for (const rt of [...this.down, ...this.up]) rt.dispose();
    this.prefilter.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.quad.dispose();
  }
}
