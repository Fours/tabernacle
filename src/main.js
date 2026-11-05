import * as THREE from 'three';
import { getParams } from './debug/params.js';
import { createGround } from './scene/ground.js';
import { createCourtyard } from './scene/courtyard.js';
import { createAltar } from './scene/altar.js';
import { createTabernacle } from './scene/tabernacle.js';
import { createLaver } from './scene/laver.js';
import { createTorches } from './scene/torches.js';
import { createAltarFire } from './scene/altarFire.js';
import { createLighting } from './scene/lighting.js';
import { createSky } from './scene/sky.js';
import { createDevCamera, PRESETS } from './camera/devCamera.js';
import { createFirstPerson } from './camera/firstPerson.js';
import { createDebug } from './debug/overlay.js';
import { createPostFX } from './render/postfx.js';
import { createNightEnvironment } from './render/environment.js';

const params = getParams();
const canvas = document.querySelector('#scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// One shadow-casting light: the altar fire (PCFSoftShadowMap was removed in three r18x).
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Filmic tone mapping so the fire's HDR highlights roll off instead of clipping.
const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, none: THREE.NoToneMapping };
renderer.toneMapping = TONE[params.tm] ?? THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure ?? 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Several passes per frame: count draw calls for the whole frame (reset in the loop).
renderer.info.autoReset = false;

const FOG_COLOR = 0x0b0f1c;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
// Thin cool night haze: depth on the far hangings and the desert fading into the dark.
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.012);
scene.environment = createNightEnvironment(renderer);
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

// Scene elements
const altar = createAltar();
const altarFire = createAltarFire(altar.userData.hearth);
const torches = createTorches();
const elements = [createGround(), createCourtyard(), altar, altarFire, createTabernacle(), createLaver(), torches];
const colliders = [];
// Animated elements expose `userData.update(dt, time)`; called once per frame.
const updaters = [];
for (const g of elements) {
  scene.add(g);
  colliders.push(...(g.userData.colliders || []));
  if (g.userData.update) updaters.push(g.userData.update);
}
const sky = createSky({ fogColor: FOG_COLOR });
scene.add(sky);
scene.add(createLighting({ work: params.light === 'work' }));
// The altar's firelight bounce (materials.js addFireBounce) flickers with the fire.
updaters.push(() => {
  altar.userData.bounce.value = 1 + 0.25 * altarFire.userData.fire.level;
});

// Camera mode
let rig;
if (params.cam === 'fp') {
  rig = createFirstPerson(camera, canvas, colliders, PRESETS.walk, { bob: params.bob });
} else {
  rig = createDevCamera(camera, canvas, params.view || 'iso');
}

const debug = params.debug ? createDebug() : null;
if (debug) scene.add(debug.group);

// Heat shimmer rises from just above the altar's flames.
const shimmerSource = new THREE.Vector3(altar.userData.hearth.x, altar.userData.hearth.y + 1.3, altar.userData.hearth.z);
const fx = createPostFX(renderer, scene, camera, { enabled: params.fx, shimmerSource });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  fx.setSize(window.innerWidth, window.innerHeight);
});

// Small debug handle for automated verification.
window.__tabernacle = {
  THREE, scene, camera, renderer, colliders, params, rig, fx, composer: fx.composer,
  fires: [altarFire.userData.fire, ...torches.userData.fires],
};

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  const t = timer.getElapsed();
  rig.update(dt);
  sky.userData.update(camera, t);
  for (const update of updaters) update(dt, t);
  renderer.info.reset();
  fx.render(t);
  if (debug) debug.update(renderer);
});
