import * as THREE from 'three';
import { seeded } from '../scene/textiles.js';

// Grade shaders for the post chain (render/postfx.js).
// - GradeShader (linear HDR, before OutputPass's ACES): heat shimmer, edge chromatic aberration,
//   bloom composite, lens dirt lit by the widest bloom, eye-adaptation exposure, filmic tint
//   (warm highlights, saturation roll-off in the brights, cool split tone in the darks),
//   vignette, grain.
// - FinishShader (display-referred, after ACES + sRGB): gentle S-curve around a low pivot,
//   lifted cool blacks, and CAS-style contrast-adaptive sharpening (5-tap cross).

export const GradeShader = {
  name: 'NightGrade',
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    tWide: { value: null },
    tDirt: { value: null },
    tExposure: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    // Heat shimmer: screen-space ellipse above the altar fire (uv center, radius in uv.y units).
    uShimmer: { value: new THREE.Vector4(0.5, 0.5, 0.1, 0) }, // x, y, radius, strength
    uBloom: { value: 1.8 }, // bloom strength (the gated input, spread over 7 mips)
    uAE: { value: 1 }, // 1 = apply the adapted exposure, 0 = multiplier 1
    uCA: { value: 0.0016 }, // chromatic aberration at the frame corners (uv)
    uDirt: { value: 1.2 }, // lens dirt gain on the wide bloom
    uDirtThreshold: { value: 0.03 },
    uWarm: { value: 0.06 }, // highlight warmth
    uDesat: { value: 0.18 }, // saturation roll-off in the brights
    uVignette: { value: 0.38 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tWide;
uniform sampler2D tDirt;
uniform sampler2D tExposure;
uniform float uTime;
uniform float uAspect;
uniform vec4 uShimmer;
uniform float uBloom;
uniform float uAE;
uniform float uCA;
uniform float uDirt;
uniform float uDirtThreshold;
uniform float uWarm;
uniform float uDesat;
uniform float uVignette;
uniform float uGrain;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec3 safe(vec3 c) { return (dot(c, vec3(1.0)) < 1e5) ? max(c, vec3(0.0)) : vec3(0.0); }
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
  // Chromatic aberration: red out, blue in, growing with the square of the distance from centre
  // and kept off the middle of the frame (none inside ~half the way to the corners).
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  vec2 ca = c * r2 * 4.0 * uCA * smoothstep(0.06, 0.5, r2);
  vec3 col;
  if (uCA > 0.0) {
    col.r = texture2D(tDiffuse, uv + ca).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - ca).b;
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }
  col = safe(col);
  col += safe(texture2D(tBloom, uv).rgb) * uBloom;
  // Lens dirt: smudges light up only under the widest bloom of very bright sources.
  if (uDirt > 0.0) {
    vec3 wide = safe(texture2D(tWide, vUv).rgb);
    float wl = dot(wide, vec3(0.2126, 0.7152, 0.0722));
    col += wide * (max(wl - uDirtThreshold, 0.0) / max(wl, 1e-4)) * texture2D(tDirt, vUv).r * uDirt;
  }
  // Eye adaptation.
  col *= mix(1.0, texture2D(tExposure, vec2(0.5)).g, uAE);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // Warm highlights, and a slight saturation roll-off in the brights (before ACES's own).
  col *= mix(vec3(1.0), vec3(1.0 + uWarm, 1.0, 1.0 - uWarm * 1.5), smoothstep(0.5, 4.0, l));
  col = mix(col, vec3(l), uDesat * smoothstep(1.5, 12.0, l));
  // Night split tone: cool lift in the darks.
  float dark = 1.0 - smoothstep(0.0, 0.08, l);
  col += vec3(0.0010, 0.0016, 0.0042) * dark;
  col = mix(col, col * vec3(0.92, 0.97, 1.12), dark * 0.6);
  // Vignette.
  vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
  col *= 1.0 - uVignette * smoothstep(0.25, 0.95, length(v));
  // Film grain, multiplicative so it scales with brightness (invisible in pure black).
  float g = hash(vUv * 1000.0 + fract(uTime * 7.13) * 100.0) - 0.5;
  col *= 1.0 + g * uGrain * 2.0;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`,
};

export const FinishShader = {
  name: 'Finish',
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uSharpen: { value: 0.35 }, // 0..1 (CAS "sharpness")
    uContrast: { value: 1.12 }, // S-curve exponent around uPivot (display values)
    uPivot: { value: 0.4 },
    uLift: { value: new THREE.Vector3(0.008, 0.011, 0.02) }, // cool black lift (display)
  },
  vertexShader: GradeShader.vertexShader,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uSharpen;
uniform float uContrast;
uniform float uPivot;
uniform vec3 uLift;
varying vec2 vUv;
vec3 tap(vec2 o) { return clamp(texture2D(tDiffuse, vUv + o * uTexel).rgb, 0.0, 1.0); }
vec3 scurve(vec3 x) {
  vec3 lo = uPivot * pow(x / uPivot, vec3(uContrast));
  vec3 hi = 1.0 - (1.0 - uPivot) * pow((1.0 - x) / (1.0 - uPivot), vec3(uContrast));
  return mix(lo, hi, step(vec3(uPivot), x));
}
void main() {
  vec3 e = tap(vec2(0.0));
  vec3 col = e;
  if (uSharpen > 0.0) {
    // AMD FidelityFX CAS (simplified to the cross): the sharpening weight shrinks where local
    // contrast is already high, so edges don't ring.
    vec3 b = tap(vec2(0, 1)), d = tap(vec2(-1, 0)), f = tap(vec2(1, 0)), h = tap(vec2(0, -1));
    vec3 mn = min(e, min(min(b, d), min(f, h)));
    vec3 mx = max(e, max(max(b, d), max(f, h)));
    vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
    vec3 w = -amp / mix(8.0, 5.0, uSharpen);
    col = clamp(((b + d + f + h) * w + e) / (1.0 + 4.0 * w), 0.0, 1.0);
  }
  col = scurve(clamp(col, 0.0, 1.0));
  col = col + uLift * (1.0 - col);
  // Triangular dither of +-1 LSB (interleaved gradient noise, static) against 8-bit banding in
  // the night sky's long, dark gradients.
  vec2 fc = gl_FragCoord.xy;
  float ign1 = fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715))));
  float ign2 = fract(52.9829189 * fract(dot(fc + vec2(17.0, 31.0), vec2(0.06711056, 0.00583715))));
  col += (ign1 + ign2 - 1.0) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`,
};

/**
 * Procedural lens dirt (greyscale, 512×256, made once): faint smudges, a few fingerprint-like
 * arcs and small specks. Only ever multiplied by the widest bloom.
 */
export function createLensDirtTexture() {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgb(18,18,18)'; // a faint even haze
  g.fillRect(0, 0, W, H);
  const rnd = seeded(7717);
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.6, `rgba(255,255,255,${a * 0.5})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  for (let i = 0; i < 70; i++) blob(rnd() * W, rnd() * H, 12 + rnd() * 50, 0.05 + rnd() * 0.12);
  for (let i = 0; i < 160; i++) blob(rnd() * W, rnd() * H, 1.5 + rnd() * 4, 0.15 + rnd() * 0.35);
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x = rnd() * W, y = rnd() * H, r0 = 8 + rnd() * 18;
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = `rgba(255,255,255,${0.04 + rnd() * 0.05})`;
      g.lineWidth = 1.5;
      const a0 = rnd() * Math.PI * 2;
      g.beginPath();
      g.arc(x, y, r0 + k * 3.5, a0, a0 + 1.5 + rnd() * 2);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
