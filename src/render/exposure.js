import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Eye adaptation, all on the GPU (no CPU readback in the frame):
// 1. The HDR frame → a 64×32 log2-luminance target (4 bilinear taps per texel).
// 2. One 1×1 pass averages that (a 32×16 loop of bilinear taps, each the mean of 2×2 texels,
//    centre-weighted), turns it into a target exposure in stops, and eases the previous
//    frame's value toward it (two 1×1 float targets ping-pong). Output: r = adapted log2
//    exposure, g = the multiplier the grade applies before tone mapping, b = measured log2 lum.
// The target is partial adaptation, (key − log2 L) · strength, plus a bias in stops, clamped.
// The bias and clamp come from the camera-inside-the-tent test (postfx.js `setInside`): the
// lamplit Holy Place measures about as bright as the firelit court, so luminance alone would
// barely move; the inside key makes the eye open up after stepping in from the night, and
// close again outside. Clamps keep the court from washing out and the Holy of Holies dark.

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const lumFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uCell; // one lum texel in source uv
varying vec2 vUv;
float l(vec2 o) {
  vec3 c = texture2D(tSrc, vUv + o * uCell).rgb;
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return (y < 1e5) ? y : 0.0; // NaN/Inf guard
}
void main() {
  float y = 0.25 * (l(vec2(-0.25, -0.25)) + l(vec2(0.25, -0.25)) + l(vec2(-0.25, 0.25)) + l(vec2(0.25, 0.25)));
  gl_FragColor = vec4(log2(max(y, 1e-5)), 0.0, 0.0, 1.0);
}
`;

const adaptFrag = /* glsl */ `
uniform sampler2D tLum;
uniform sampler2D tPrev;
uniform float uBlendUp;   // per-frame blend when the exposure rises
uniform float uBlendDown; // per-frame blend when the exposure falls
uniform float uReset;
uniform float uKey;       // log2 scene luminance at which the multiplier is 1 (before bias)
uniform float uStrength;  // fraction of a luminance change that is adapted away
uniform float uBias;      // stops added to the target (the inside-the-tent key)
uniform vec2 uRange;      // min, max log2 multiplier
void main() {
  float sum = 0.0, wsum = 0.0;
  for (int y = 0; y < 16; y++) {
    for (int x = 0; x < 32; x++) {
      vec2 uv = vec2((float(x) + 0.5) / 32.0, (float(y) + 0.5) / 16.0);
      vec2 d = (uv - 0.5) * vec2(1.0, 0.75);
      float w = 1.0 - 0.6 * smoothstep(0.1, 0.55, length(d)); // centre-weighted
      sum += texture2D(tLum, uv).r * w;
      wsum += w;
    }
  }
  float lum = sum / wsum;
  float target = clamp((uKey - lum) * uStrength + uBias, uRange.x, uRange.y);
  float prev = texture2D(tPrev, vec2(0.5)).r;
  float a = target;
  if (uReset < 0.5) a = mix(prev, target, target > prev ? uBlendUp : uBlendDown);
  gl_FragColor = vec4(a, exp2(a), lum, 1.0);
}
`;

export function createEyeAdaptation({ key = -4.4, strength = 0.3, tauUp = 1.5, tauDown = 1.0 } = {}) {
  const lumRT = new THREE.WebGLRenderTarget(64, 32, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const rtOpts = { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const adapt = [new THREE.WebGLRenderTarget(1, 1, rtOpts), new THREE.WebGLRenderTarget(1, 1, rtOpts)];
  let cur = 0;
  let reset = true;

  const lumMat = new THREE.ShaderMaterial({
    name: 'AdaptLuminance',
    uniforms: { tSrc: { value: null }, uCell: { value: new THREE.Vector2(1 / 64, 1 / 32) } },
    vertexShader: vert,
    fragmentShader: lumFrag,
    depthTest: false,
    depthWrite: false,
  });
  const uniforms = {
    tLum: { value: lumRT.texture },
    tPrev: { value: null },
    uBlendUp: { value: 0 },
    uBlendDown: { value: 0 },
    uReset: { value: 1 },
    uKey: { value: key },
    uStrength: { value: strength },
    uBias: { value: 0 },
    uRange: { value: new THREE.Vector2(-0.25, 0.2) },
  };
  const adaptMat = new THREE.ShaderMaterial({
    name: 'AdaptExposure',
    uniforms,
    vertexShader: vert,
    fragmentShader: adaptFrag,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(lumMat);
  const readBuf = new Float32Array(4);

  const ae = {
    uniforms,
    /** Time constants (s) for the exposure rising and falling. */
    tauUp,
    tauDown,
    /** Bias (stops) and clamp (log2 min, max) outside and inside the tent. */
    outside: { bias: 0, min: -0.25, max: 0.2 },
    inside: { bias: 0.35, min: -0.2, max: 0.3 },
    setInside(inside) {
      const k = inside ? ae.inside : ae.outside;
      uniforms.uBias.value = k.bias;
      uniforms.uRange.value.set(k.min, k.max);
    },
    /** 1×1 texture: g = current exposure multiplier. */
    get texture() {
      return adapt[cur].texture;
    },
    /** Jump straight to the target next frame (e.g. after a teleport). */
    reset() {
      reset = true;
    },
    update(renderer, srcTexture, dt) {
      const prevTarget = renderer.getRenderTarget();
      lumMat.uniforms.tSrc.value = srcTexture;
      quad.material = lumMat;
      renderer.setRenderTarget(lumRT);
      quad.render(renderer);

      const next = 1 - cur;
      uniforms.tPrev.value = adapt[cur].texture;
      uniforms.uReset.value = reset ? 1 : 0;
      uniforms.uBlendUp.value = 1 - Math.exp(-dt / ae.tauUp);
      uniforms.uBlendDown.value = 1 - Math.exp(-dt / ae.tauDown);
      quad.material = adaptMat;
      renderer.setRenderTarget(adapt[next]);
      quad.render(renderer);
      cur = next;
      reset = false;
      renderer.setRenderTarget(prevTarget);
    },
    /** Debug only (CPU readback): { stops, exposure, logLum }. */
    read(renderer) {
      renderer.readRenderTargetPixels(adapt[cur], 0, 0, 1, 1, readBuf);
      return { stops: readBuf[0], exposure: readBuf[1], logLum: readBuf[2] };
    },
    dispose() {
      lumRT.dispose();
      adapt.forEach((t) => t.dispose());
      lumMat.dispose();
      adaptMat.dispose();
      quad.dispose();
    },
  };
  return ae;
}
