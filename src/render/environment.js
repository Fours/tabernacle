import * as THREE from 'three';

/**
 * Small procedural night environment (PMREM) so metals have something dim to reflect and
 * diffuse surfaces get a soft sky fill: a cool blue sky dome above, and around the horizon
 * and below a dim warm band (the firelit linen hangings and sand that enclose the courtyard),
 * so vertical gold and bronze surfaces reflect warmth rather than blue sky. The returned
 * texture goes on `scene.environment`, dimmed via `scene.environmentIntensity`.
 */
export function createNightEnvironment(renderer) {
  const envScene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,
    fragmentShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 zenith = vec3(0.04, 0.065, 0.17);
  vec3 sky = vec3(0.09, 0.11, 0.2);
  vec3 band = vec3(0.26, 0.15, 0.07);   // firelit hangings
  vec3 ground = vec3(0.12, 0.075, 0.04); // firelit sand
  vec3 col = y > 0.12 ? mix(sky, zenith, smoothstep(0.12, 1.0, y))
           : y > 0.0 ? mix(band, sky, smoothstep(0.0, 0.12, y))
           : mix(band, ground, smoothstep(0.0, 0.3, -y));
  // Uneven warmth around the horizon (the fire on one side, torches here and there).
  float az = atan(d.z, d.x);
  col *= 1.0 + 0.35 * sin(az * 2.0 + 0.6) * (1.0 - smoothstep(0.1, 0.35, abs(y)));
  // A few soft brighter patches so glossy metal shows broken highlights, not a flat sheen.
  float spot = pow(max(dot(d, normalize(vec3(-0.4, 0.55, -0.7))), 0.0), 24.0);
  col += vec3(0.25, 0.3, 0.45) * spot;
  gl_FragColor = vec4(col, 1.0);
}
`,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 50);
  pmrem.dispose();
  mat.dispose();
  envScene.children[0].geometry.dispose();
  return rt.texture;
}
