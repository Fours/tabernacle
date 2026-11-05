import * as THREE from 'three';

/**
 * Small procedural night environment (PMREM) so metals have something dim to reflect and
 * diffuse surfaces get a soft sky fill: a cool blue sky dome brightening toward the horizon,
 * a faint warm glow low in the east-southeast (the courtyard's firelight seen from inside)
 * and dark sand below. Returned texture goes on `scene.environment`; dimmed via
 * `scene.environmentIntensity`.
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
  vec3 zenith = vec3(0.05, 0.08, 0.20);
  vec3 horizon = vec3(0.13, 0.15, 0.24);
  vec3 ground = vec3(0.07, 0.05, 0.035);
  vec3 col = y > 0.0 ? mix(horizon, zenith, pow(y, 0.6)) : mix(horizon * 0.6, ground, smoothstep(0.0, 0.25, -y));
  // Faint low warm glow (firelit hangings / sand around the viewer).
  float warm = pow(max(dot(d, normalize(vec3(0.6, 0.05, 0.3))), 0.0), 3.0) * smoothstep(0.5, -0.1, y);
  col += vec3(0.35, 0.14, 0.04) * warm * 0.6;
  // A few soft brighter patches so glossy metal shows broken highlights, not a flat sheen.
  float band = pow(max(dot(d, normalize(vec3(-0.4, 0.55, -0.7))), 0.0), 24.0);
  col += vec3(0.25, 0.3, 0.45) * band;
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
