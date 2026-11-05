import * as THREE from 'three';
import { getParams } from './debug/params.js';
import { createGround } from './scene/ground.js';
import { createCourtyard } from './scene/courtyard.js';
import { createAltar } from './scene/altar.js';
import { createTabernacle } from './scene/tabernacle.js';
import { createLaver } from './scene/laver.js';
import { createLighting } from './scene/lighting.js';
import { createDevCamera, PRESETS } from './camera/devCamera.js';
import { createFirstPerson } from './camera/firstPerson.js';
import { createDebug } from './debug/overlay.js';

const params = getParams();
const canvas = document.querySelector('#scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

// Scene elements
const elements = [createGround(), createCourtyard(), createAltar(), createTabernacle(), createLaver()];
const colliders = [];
for (const g of elements) {
  scene.add(g);
  colliders.push(...(g.userData.colliders || []));
}
scene.add(createLighting({ work: params.light === 'work' }));

// Camera mode
let rig;
if (params.cam === 'fp') {
  rig = createFirstPerson(camera, canvas, colliders, PRESETS.walk);
} else {
  rig = createDevCamera(camera, canvas, params.view || 'iso');
}

const debug = params.debug ? createDebug() : null;
if (debug) scene.add(debug.group);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Small debug handle for automated verification.
window.__tabernacle = { THREE, scene, camera, renderer, colliders, params, rig };

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  rig.update(dt);
  renderer.render(scene, camera);
  if (debug) debug.update(renderer);
});
