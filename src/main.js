import * as THREE from 'three';
import { getParams } from './debug/params.js';
import { createGround } from './scene/ground.js';
import { createGroundScatter } from './scene/groundScatter.js';
import { createCourtyard } from './scene/courtyard.js';
import { createAltar } from './scene/altar.js';
import { createTabernacle } from './scene/tabernacle.js';
import { createLaver } from './scene/laver.js';
import { createTorches } from './scene/torches.js';
import { createAltarFire } from './scene/altarFire.js';
import { createLighting } from './scene/lighting.js';
import { createMenorah } from './scene/menorah.js';
import { createShowbread } from './scene/showbread.js';
import { createIncenseAltar } from './scene/incenseAltar.js';
import { createArk } from './scene/ark.js';
import { createPillarOfFire } from './scene/pillarOfFire.js';
import { applyInteriorMask, INTERIOR } from './scene/interiorLight.js';
import { TABERNACLE as T, m } from './config/dimensions.js';
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
const menorah = createMenorah();
const tabernacle = createTabernacle();
const furnishings = [menorah, createShowbread(), createIncenseAltar(), createArk()];
const pillarOfFire = createPillarOfFire(); // Num 9:15-16, over the Holy of Holies
const groundScatter = createGroundScatter(); // rocks and scrub (Step 9 clears it under tents)
const elements = [createGround(), groundScatter, createCourtyard(), altar, altarFire, tabernacle, createLaver(), torches, ...furnishings, pillarOfFire];
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
// Keep exterior lights, sky fill and the night environment out of the tent, and the menorah's
// light in (scene/interiorLight.js). Patches every lit material, so call after assembly.
applyInteriorMask(scene);
if (params.light === 'work') INTERIOR.uIlHoh.value = 1; // light the Holy of Holies for inspection
// The altar's firelight bounce (materials.js addFireBounce) flickers with the fire.
updaters.push(() => {
  altar.userData.bounce.value = 1 + 0.25 * altarFire.userData.fire.level;
});

// The furnishings and the veil can only be seen from inside the tent or through its open door
// (the walls and roof are opaque), so their meshes are hidden while the camera is behind or
// beside the tent. East of the tent front the Holy Place can be seen through the door, so its
// furnishings and the veil are shown; the ark, behind the veil, only inside. Only meshes are
// toggled: the menorah's light stays on (toggling a light recompiles every shader).
const meshesOf = (g) => g.children.filter((o) => !o.isLight);
const holyPlaceMeshes = [...tabernacle.userData.interior, ...furnishings.slice(0, 3).flatMap(meshesOf)];
const holiestMeshes = meshesOf(furnishings[3]);
const interiorMeshes = [...holyPlaceMeshes, ...holiestMeshes];
const INSIDE = {
  x0: m(T.interiorMinX) - 0.3, x1: m(T.interiorMaxX) + 0.6, // a little past the door's cloth line
  z: m(T.interiorWidth / 2) + 0.3,
  y: m(T.interiorHeight) + 0.3,
};
const FRONT_X = m(T.interiorMaxX); // east of this the door looks into the Holy Place
let interiorShown = null;
function updateInteriorVisibility() {
  const p = camera.position;
  const inside = p.x > INSIDE.x0 && p.x < INSIDE.x1 && Math.abs(p.z) < INSIDE.z && p.y < INSIDE.y;
  const state = inside ? 2 : p.x > FRONT_X ? 1 : 0;
  if (state === interiorShown) return;
  interiorShown = state;
  for (const o of holyPlaceMeshes) o.visible = state > 0;
  for (const o of holiestMeshes) o.visible = state === 2;
}

// Static reflection probe for the gold inside the tent (interiorLight.js): one HDR cube
// capture from the middle of the Holy Place, with the interior shown, done on the first frame
// (after the menorah has set the room light) and never again. While capturing, the probe is
// off and unbound, so nothing samples the target being drawn into.
const PROBE_POS = new THREE.Vector3(m((T.veil.x + T.interiorMaxX) / 2), m(4), 0);
const probe = {
  target: new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  }),
  captureMs: null,
  capture() {
    const t0 = performance.now();
    INTERIOR.uIlProbeOn.value = 0;
    INTERIOR.uIlProbe.value = null;
    const cam = new THREE.CubeCamera(0.05, 40, probe.target);
    cam.position.copy(PROBE_POS);
    cam.updateMatrixWorld(true);
    for (const o of interiorMeshes) o.visible = true;
    cam.update(renderer, scene);
    interiorShown = null;
    updateInteriorVisibility();
    INTERIOR.uIlProbePos.value.copy(PROBE_POS);
    INTERIOR.uIlProbe.value = probe.target.texture;
    INTERIOR.uIlProbeOn.value = 1;
    renderer.getContext().finish();
    probe.captureMs = performance.now() - t0;
    return probe.captureMs;
  },
  dispose() {
    INTERIOR.uIlProbeOn.value = 0;
    INTERIOR.uIlProbe.value = null;
    probe.target.dispose();
  },
};

// Camera mode
let rig;
if (params.cam === 'fp') {
  rig = createFirstPerson(camera, canvas, colliders, PRESETS.walk, { bob: params.bob });
} else {
  rig = createDevCamera(camera, canvas, params.view || 'iso');
}

// Presets applied later (`rig.apply`) or a respawn must not draw the wrong set for a frame.
for (const k of ['apply', 'reset', 'setPosition']) {
  if (typeof rig[k] !== 'function') continue;
  const fn = rig[k].bind(rig);
  rig[k] = (...a) => { const r = fn(...a); updateInteriorVisibility(); return r; };
}
updateInteriorVisibility();

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
  THREE, scene, camera, renderer, colliders, params, rig, fx, composer: fx.composer, menorah, interior: INTERIOR,
  updateInteriorVisibility, probe, pillarOfFire, groundScatter,
  fires: [altarFire.userData.fire, ...torches.userData.fires],
};

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  const t = timer.getElapsed();
  rig.update(dt);
  updateInteriorVisibility();
  sky.userData.update(camera, t);
  for (const update of updaters) update(dt, t);
  if (probe.captureMs === null) probe.capture();
  renderer.info.reset();
  fx.render(t);
  if (debug) debug.update(renderer);
});
