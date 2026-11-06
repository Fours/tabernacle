import * as THREE from 'three';
import { WORLD_NOISE_GLSL } from './materials.js';
import { AO, AO_PARS_GLSL, aoApplyGlsl, bindAOUniforms } from './ao.js';

const TILE = 2; // meters covered by one sand texture tile

/** Fine desert sand with grit and small pebbles (procedural, tileable). */
function sandTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#c2a87c';
  g.fillRect(0, 0, S, S);
  let seed = 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Soft blotches (wrapping) so the tile itself isn't uniform.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
    const col = rnd() < 0.5 ? `rgba(120,95,60,${0.05 + rnd() * 0.06})` : `rgba(235,220,190,${0.05 + rnd() * 0.06})`;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grd.addColorStop(0, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
  }
  // Grains.
  for (let i = 0; i < 22000; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(95,75,50,${0.12 + rnd() * 0.25})` : `rgba(250,238,210,${0.1 + rnd() * 0.25})`;
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  // Grit and small pebbles (grey/brown flint), with a lit top and a dark underside.
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.8 + Math.pow(rnd(), 3) * 4.5;
    const k = 70 + rnd() * 80;
    g.fillStyle = 'rgba(40,30,20,0.35)';
    g.beginPath(); g.ellipse(x + 0.6, y + 0.8, r, r * 0.75, 0, 0, 7); g.fill();
    g.fillStyle = `rgb(${k},${k * 0.9},${k * 0.78})`;
    g.beginPath(); g.ellipse(x, y, r, r * 0.75, rnd() * 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,245,225,0.25)';
    g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.4, r * 0.3, 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Sand material: the texture is sampled at two scales/rotations blended by world noise
 * (no visible tiling), with broad tone patches and gravelly darker areas, and wind ripples
 * that perturb the normal (faded out with distance before they alias).
 */
function sandMaterial() {
  const tex = sandTexture();
  const size = 600;
  tex.repeat.set(size / TILE, size / TILE);
  const mat = new THREE.MeshStandardMaterial({
    name: 'sand',
    color: 0xffffff,
    map: tex,
    bumpMap: tex,
    bumpScale: 1.2,
    roughness: 1,
  });
  mat.onBeforeCompile = (shader) => {
    bindAOUniforms(shader);
    shader.uniforms.uAoGround = AO.uAoGround;
    shader.uniforms.uAoGroundTex = AO.uAoGroundTex;
    shader.uniforms.uAoGroundRect = AO.uAoGroundRect;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSandPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSandPos;\n${WORLD_NOISE_GLSL}\n${AO_PARS_GLSL}
uniform float uAoGround;
uniform sampler2D uAoGroundTex;
uniform vec4 uAoGroundRect;`)
      .replace(
        '#include <map_fragment>',
        `{
  vec2 wp = vSandPos.xz;
  vec4 sA = texture2D(map, vMapUv);
  // Second lookup: different scale and a rotation, blended in by low-frequency noise.
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  vec4 sB = texture2D(map, rot * wp / ${(TILE * 1.37).toFixed(3)} + 0.31);
  float blend = smoothstep(0.3, 0.7, wvFbm(wp * 0.21 + 7.0));
  vec4 s = mix(sA, sB, blend);
  diffuseColor *= s;
  // Broad tone patches (8-40 m) and gravelly darker, greyer areas.
  float macro = wvFbm(wp * 0.035);
  diffuseColor.rgb *= mix(0.8, 1.12, macro);
  float gravel = smoothstep(0.55, 0.8, wvFbm(wp * 0.11 + 3.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.76, 0.76), gravel * 0.7);
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // Wind ripples (~13 cm wavelength) in patches, along a slowly wandering direction.
  vec2 wp = vSandPos.xz;
  float warp = wvFbm(wp * 0.15) * 6.0;
  vec2 dir = normalize(vec2(1.0, 0.35));
  float phase = dot(wp, dir) * 48.0 + warp * 6.0 + 2.0 * sin(dot(wp, vec2(-0.35, 1.0)) * 1.3);
  float fw = fwidth(phase);
  float fade = (1.0 - smoothstep(0.25, 0.9, fw)) * smoothstep(0.35, 0.65, wvFbm(wp * 0.08 + 11.0));
  // Asymmetric ripple profile: gentle windward slope, steeper lee side.
  float sl = cos(phase) + 0.35 * cos(2.0 * phase + 0.7);
  vec3 grad = vec3(dir.x, 0.0, dir.y) * sl * 0.14 * fade;
  normal = normalize(normal - (viewMatrix * vec4(grad, 0.0)).xyz);
}`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
{
  // Baked contact AO (scene/ao.js): soft darkening round everything standing on the sand.
  vec2 aoUv = (vSandPos.xz - uAoGroundRect.xy) * uAoGroundRect.zw;
  float aoIn = step(0.0, aoUv.x) * step(aoUv.x, 1.0) * step(0.0, aoUv.y) * step(aoUv.y, 1.0);
  float aoVisG = 1.0 - aoIn * uAoGround * uAoOn * (1.0 - texture2D(uAoGroundTex, clamp(aoUv, 0.0, 1.0)).r);
  ${aoApplyGlsl('aoVisG')}
}`,
      );
  };
  mat.customProgramCacheKey = () => 'sand-v2';
  return mat;
}

export function createGround() {
  const group = new THREE.Group();
  group.name = 'ground';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), sandMaterial());
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.colliders = [];
  return group;
}
