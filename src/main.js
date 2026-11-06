import * as THREE from 'three';
import { getParams } from './debug/params.js';
import { createGround, isTrodden } from './scene/ground.js';
import { createGroundScatter } from './scene/groundScatter.js';
import { createCamp } from './scene/camp.js';
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
import { overlaps } from './scene/colliders.js';
import { applyInteriorMask, INTERIOR } from './scene/interiorLight.js';
import { AO, bakeGroundAO } from './scene/ao.js';
import { TABERNACLE as T, m } from './config/dimensions.js';
import { createSky } from './scene/sky.js';
import { createDevCamera, PRESETS } from './camera/devCamera.js';
import { createFirstPerson } from './camera/firstPerson.js';
import { createDebug } from './debug/overlay.js';
import { createPostFX } from './render/postfx.js';
import { createNightEnvironment } from './render/environment.js';
import { installAtmosphereChunks, applyAtmosphere, createAtmosphere, ATMO } from './render/atmosphere.js';
import { createDustMotes } from './scene/dustMotes.js';
import { WIND, updateWind } from './scene/cloth.js';

const params = getParams();
// Ground haze and the fires' glow in the air live in the fog chunks (render/atmosphere.js);
// they must be in place before any material compiles. `?haze=0` keeps plain FogExp2.
if (params.haze) installAtmosphereChunks();
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
const groundScatter = createGroundScatter(); // rocks and scrub
const camp = createCamp(); // the camp of Israel around the court (Num 2-3)
groundScatter.userData.removeWhere(camp.userData.covers); // no rocks or scrub under the tents
groundScatter.userData.removeWhere(isTrodden); // the court's trodden paths are worn bare
const elements = [createGround(), groundScatter, camp, createCourtyard(), altar, altarFire, tabernacle, createLaver(), torches, ...furnishings, pillarOfFire];
const colliders = [];
// No rocks or scrub inside anything solid, under the tent, or on the altar's utensils.
const keepOut = elements.flatMap((g) => [...(g === camp ? [] : g.userData.colliders || []), ...(g.userData.groundKeepOut || [])]);
groundScatter.userData.removeWhere((x, z, r) => keepOut.some((c) => overlaps(c, x, z, r + 0.05)));
// Animated elements expose `userData.update(dt, time)`; called once per frame.
const updaters = [];
for (const g of elements) {
  scene.add(g);
  colliders.push(...(g.userData.colliders || []));
  if (g.userData.update) updaters.push(g.userData.update);
}
// Contact AO on the sand: every element's footprints baked into one texture (scene/ao.js).
const groundAO = bakeGroundAO(elements.flatMap((g) => g.userData.aoShapes || []));
AO.uAoOn.value = params.ao ? 1 : 0;
// Wind on the cloth (scene/cloth.js): one shared time, direction and strength.
WIND.uWindStrength.value = params.wind ? 1 : 0;
updaters.push(updateWind);
const sky = createSky({ fogColor: FOG_COLOR, atmosphere: params.haze });
sky.userData.timeOverride = params.skyt;
scene.add(sky);
scene.add(createLighting({ work: params.light === 'work' }));
// Keep exterior lights, sky fill and the night environment out of the tent, and the menorah's
// light in (scene/interiorLight.js). Patches every lit material, so call after assembly.
applyInteriorMask(scene);

// Night atmosphere: glow sources for the haze and the dust motes (world positions fixed at
// load; brightness follows each light's flicker every frame).
scene.updateMatrixWorld(true);
const worldOf = (o, dy = 0) => o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0));
const altarLight = altarFire.userData.fire.light;
const torchFires = torches.userData.fires;
const torchColor = torchFires.find((t) => t.light).light.color;
const pillarLight = pillarOfFire.userData.light;
const atmosphere = createAtmosphere([
  // The altar fire and its fill (one large source in the flames).
  { pos: worldOf(altarLight), radius: 0.6, reach: 8, color: altarLight.color, gain: 0.5, intensity: () => altarLight.intensity },
  // Lit torches use their light; the two glow-only ones a matching nominal 28 cd.
  ...torchFires.map((t) => t.light
    ? { pos: worldOf(t.light), radius: 0.15, reach: 3, color: t.light.color, gain: 0.5, intensity: () => t.light.intensity }
    : { pos: worldOf(t.group, 0.35), radius: 0.15, reach: 3, color: torchColor, gain: 0.5, intensity: () => 28 * (1 + 0.3 * t.level) }),
  // The pillar of fire: a big, bright body high over the tent.
  { pos: worldOf(pillarLight), radius: 3.0, reach: 25, color: pillarLight.color, gain: 0.8, intensity: () => pillarLight.intensity },
], {
  // Inside the tent: the seven lamps as one source at their centroid, the room haze and the
  // incense under the ceiling lit by the warm room ambient (menorah.js sets it, flickering).
  source: { pos: menorah.userData.lampCentre, radius: 0.3, reach: 3.5, color: menorah.userData.light.color, gain: 1, intensity: () => menorah.userData.light.intensity },
  ambient: INTERIOR.uIlAmbient.value,
  haze: 0.6,
  ceiling: 2.5,
});
ATMO.uAtmoHazeColor.value.set(FOG_COLOR).multiplyScalar(3.5); // moonlit mist, a little lighter than the fog
ATMO.uAtmoFogD.value = scene.fog.density;
ATMO.uAtmoOn.value = params.haze ? 1 : 0;
updaters.push((dt, t) => atmosphere.update(t));
// Dust in the firelight around the altar, the lit torches and the menorah (one instanced draw).
const hearth = altar.userData.hearth;
const lamps = menorah.userData.lampCentre;
const dust = createDustMotes([
  { x: lamps.x, z: lamps.z - 0.4, y0: 0.5, y1: 3.2, r: 1.8, count: 220 },
  { x: hearth.x, z: hearth.z, y0: 0.2, y1: 4.5, r: 5.5, count: 700 },
  ...torchFires.filter((t) => t.light).map((t) => {
    const p = worldOf(t.group);
    return { x: p.x, z: p.z, y0: p.y - 1.4, y1: p.y + 1.0, r: 2.2, count: 120 };
  }),
], { inGain: 3 });
scene.add(dust);
updaters.push(dust.userData.update);
applyAtmosphere(scene);
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
const fx = createPostFX(renderer, scene, camera, { enabled: params.fx, shimmerSource, ae: params.ae, lens: params.lens });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  fx.setSize(window.innerWidth, window.innerHeight);
});

// Small debug handle for automated verification.
window.__tabernacle = {
  THREE, scene, camera, renderer, colliders, params, rig, fx, composer: fx.composer, menorah, interior: INTERIOR,
  updateInteriorVisibility, probe, sky, pillarOfFire, groundScatter, camp, atmosphere, dust, ao: AO, groundAO, wind: WIND,
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
  fx.setInside(interiorShown === 2);
  fx.render(t);
  if (debug) debug.update(renderer);
});
