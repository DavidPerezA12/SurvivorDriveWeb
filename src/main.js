import "./style.css";

import * as THREE from "three";

import { createInputState } from "./game/input.js";

import {
  biomeCatalog,
  contentManifest,
  equipmentCatalog,
  encounterConfig,
  environmentProfiles as rawEnvironmentProfiles,
  objectiveCatalog,
  pickupCatalog,
  skyPalette as rawSkyPalette,
} from "./game/content.js";

import { loadSaveData, saveSaveData, registerRunResult, unlockCity } from "./game/persistence.js";

import {
  GameRoute,
  biomeFromRoute,
  isRunRoute,
  routeForBiome,
  screenForRoute,
} from "./game/routes.js";

import {
  choosePickupType,
  createRunState as _createRunState,
  resolveCollision,
  resolvePickup as _resolvePickup,
  spawnEncounter,
  updateRunProgression as _updateRunProgression,
} from "./game/simulation.js";

import { mountApp } from "./game/ui.js";
import { setupUIController } from "./game/uiController.js";
import { setupTouchControls } from "./controls/touch.js";
import {
  configureHudUpdates,
  updateHUD,
  flashMessage,
  triggerShake,
  shakeState,
} from "./ui/hudUpdates.js";
import { configurePlayerActions, tryJump, useFire } from "./player/actions.js";

import { rebuildCarAppearance } from "./game/car.js";
import { setupThree } from "./game/sceneSetup.js";

import {
  obstacleHitsCar,
  randomLane,
  collidesWithCar,
} from "./game/collision.js";

import {
  initAudio,
  updateAudioVolume,
  beep,
  updateEngineSound,
  playSkidSound,
  stopSkidSound,
} from "./game/audio.js";

import {
  clearAllPools,
  spawnDustMote,
  spawnDustBurst,
  createBurst,
  createShockwave,
  spawnSkidMark,
  spawnAtmosphericDebris,
  removePoolEntry,
} from "./game/spawn.js";
import { loadAssets } from "./game/assets.js";
import {
  getChunkTemplate,
  resolveRandomKind,
} from "./game/chunks.js";
import {
  createEventManager,
  tryTriggerEvent,
  updateEvent,
  getEventEffects,
} from "./game/events.js";

import {
  createEnvironmentRuntime,
  hydrateEnvironmentProfiles,
  hydrateSkyPalette,
  isDesertZone,
} from "./world/environmentRuntime.js";
import { createObstacleMesh } from "./world/meshes/obstacles.js";
import { createOverheadMesh } from "./world/meshes/overheads.js";
import { createPickupMesh } from "./world/meshes/pickups.js";
import { createPropMesh } from "./world/meshes/props.js";
import { moveWorld } from "./world/movement.js";
import {
  createFootprintMarker,
  createMileMarker,
} from "./world/environment.js";
import { getZoneByDistance } from "./game/zones.js";

import { createGameLoop } from "./game/loop.js";
import { createRunRuntime } from "./game/runRuntime.js";

const app = document.querySelector("#app");

const ui = mountApp(app);

const { canvas, atmosphere, screens, hud } = ui;
export { hud };

document.body.dataset.help = "collapsed";

export const TOTAL_ROUTE_DISTANCE = 7.2;

const saveData = loadSaveData();

const state = {
  options: saveData.options,

  equipment: saveData.loadout,

  progression: saveData.progression,

  unlocks: saveData.unlocks,

  stats: saveData.stats,
};

const environmentProfiles = hydrateEnvironmentProfiles(rawEnvironmentProfiles);

const skyPalette = hydrateSkyPalette(rawSkyPalette);

export const world = {
  scene: new THREE.Scene(),

  renderer: new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }),

  camera: new THREE.PerspectiveCamera(60, 1, 0.1, 500),

  clock: new THREE.Clock(),

  groundSurface: null,

  roadSurface: null,

  roadTexture: null,

  terrainTexture: null,

  shoulderTexture: null,

  roadShoulders: [],

  obstaclePool: [],

  debrisPool: [],

  propPool: [],

  overheadPool: [],

  pickupPool: [],

  projectilePool: [],

  particles: [],

  dustBands: [],

  heatShimmer: [],

  roadsideProps: [],

  roadsideBackdrop: [],

  cityProps: [],

  cityBackdrop: [],

  dunes: [],

  boulders: [],

  farBackdrop: [],

  roadDetails: [],

  input: createInputState(),

  route: GameRoute.MENU,

  run: null,

  eventManager: createEventManager(),

  eventEffects: null,

  car: null,

  carMaterials: [],

  lastTime: performance.now(),

  pmrem: null,

  envTexture: null,

  audio: {
    ctx: null,

    gain: null,
  },

  manifest: contentManifest,

  environment: {
    cycle: 0.48,

    biome: "desert",

    weather: "clear",

    targetWeather: "clear",

    weatherStrength: 0,

    weatherTimer: 18,

    cycleLabel: "Day",

    weatherLabel: "Clear",

    bg: new THREE.Color("#120b08"),

    fog: new THREE.Color("#d9a15f"),
  },

  lights: {
    ambient: null,

    sun: null,

    sunDisc: null,
  },

  materials: {
    ground: null,

    road: null,

    shoulder: null,
  },

  assets: {
    models: {},
  },
};

const environmentRuntime = createEnvironmentRuntime({
  world,
  state,
  atmosphere,
  environmentProfiles,
  skyPalette,
  flashMessage,
});

const runRuntime = createRunRuntime({
  world,
  state,
  saveData,
  biomeCatalog,
  objectiveCatalog,
  equipmentCatalog,
  encounterConfig,
  pickupCatalog,
  environmentRuntime,
  isDesert,
  updateHUD,
  flashMessage,
  beep,
  triggerShake,
  createBurst,
  createShockwave,
  spawnDustMote,
  spawnDustBurst,
  spawnSkidMark,
  spawnAtmosphericDebris,
  setupTouchControls,
  moveWorld,
  collidesWithCar,
  obstacleHitsCar,
  randomLane,
  createObstacleMesh,
  createPickupMesh,
  createPropMesh,
  createOverheadMesh,
  createFootprintMarker,
  createMileMarker,
  getChunkTemplate,
  resolveRandomKind,
  createEventManager,
  tryTriggerEvent,
  updateEvent,
  getEventEffects,
  resolveCollision,
  choosePickupType,
  resolvePickup: _resolvePickup,
  updateRunProgression: _updateRunProgression,
  spawnEncounter,
  initAudio,
  updateEngineSound,
  playSkidSound,
  stopSkidSound,
  updateAudioVolume,
  rebuildCarAppearance,
  setRoute: (route) => setRoute(route),
  screenForRoute,
  routeForBiome,
  biomeFromRoute,
});

configureHudUpdates({
  world,
  hud,
  totalRouteDistance: TOTAL_ROUTE_DISTANCE,
  isPlaying,
});

configurePlayerActions({
  world,
  destroyObstacle: runRuntime.destroyObstacle,
});

async function init() {
  setupThree(world, state, equipmentCatalog, currentBiome, isDesert, onResize);
  await loadAssets(world);

  rebuildCarAppearance(world, state, equipmentCatalog);

  setupUI();

  applyOptions();

  setRoute(GameRoute.MENU);

  resetRun();

  loop.start();
}

init();

function saveState() {
  saveSaveData(saveData);
}

export function isPlaying() {
  return isRunRoute(world.route);
}

export function currentBiome() {
  if (world.run) {
    const zone = getZoneByDistance(world.run.distance);
    return zone.id;
  }
  return (
    world.environment.biome ?? biomeFromRoute(world.route)
  );
}

function isDesert(biome = currentBiome()) {
  return isDesertZone(biome);
}

function setupUI() {
  setupUIController({
    state,
    world,
    hud,
    equipmentCatalog,
    saveState,
    applyOptions,
    syncFullscreen,
    isPlaying,
    setRoute,
    startRun,
    endRunToMenu,
    resumeRun,
    pauseRun,
    tryJump,
    useFire,
    flashMessage,
    setupTouchControls,
  });
}

function applyOptions() {
  const qualityRatio = { low: 1, medium: 1.4, high: 2 };

  const resolutionRatio = {
    auto: qualityRatio[state.options.quality],

    performance: 1,

    balanced: 1.35,

    quality: 2,
  };

  const shadows = { low: false, medium: true, high: true };

  world.renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio,

      resolutionRatio[state.options.resolutionScale] ?? qualityRatio[state.options.quality],
    ),
  );

  world.renderer.shadowMap.enabled = shadows[state.options.quality];

  updateAudioVolume(state, world);
}

async function syncFullscreen() {
  if (state.options.fullscreen && !document.fullscreenElement) {
    await document.documentElement.requestFullscreen().catch(() => {});
  }

  if (!state.options.fullscreen && document.fullscreenElement) {
    await document.exitFullscreen().catch(() => {});
  }
}

function setRoute(route) {
  world.route = route;

  const screen = screenForRoute(route);

  for (const [key, node] of screens.entries()) {
    node.classList.toggle("active", key === screen);
  }

  if (isRunRoute(route) && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  document.body.dataset.route = route;
}

function resetRun(biome = "desert") {
  runRuntime.resetRun(biome);
}

function clearPools() {
  clearAllPools(world);
}

function syncBiomePresentation() {
  environmentRuntime.syncBiomePresentation();
}

function startRun(biome = "desert", forceReset = false) {
  runRuntime.startRun(biome, forceReset);
}

function endRunToMenu() {
  setRoute(GameRoute.MENU);

  resetRun();
}

function transitionRunToBiome(nextBiome) {
  runRuntime.transitionRunToBiome(nextBiome);
}

function finishRun(victory = false) {
  runRuntime.finishRun(victory);
}

function pauseRun() {
  if (!isPlaying()) return;

  setRoute(GameRoute.PAUSE);
}

function resumeRun() {
  if (!world.run) return;

  setRoute(routeForBiome(world.run.biome));

  updateHUD();
}

function onResize() {
  const width = window.innerWidth;

  const height = window.innerHeight;

  world.camera.aspect = width / height;

  world.camera.updateProjectionMatrix();

  world.renderer.setSize(width, height, false);
}

const loop = createGameLoop({
  world,
  updateEnvironment: (dt) => environmentRuntime.updateEnvironment(dt),
  isPlaying,
  updateRun: (dt) => runRuntime.updateRun(dt),
  updateCinematic: (dt) => runRuntime.updateCinematic(dt),
});

function randomRange(min = 0, max = min) {
  return min + Math.random() * Math.max(0, max - min);
}

function chooseWeightedKey(weights = {}, fallback = null) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);

  if (total <= 0) return fallback;

  let roll = Math.random() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }

  return entries[0]?.[0] ?? fallback;
}

function normalizePropKind(kind) {
  const aliases = {
    barrel: "pipeline",
    cactus: "dead_bush",
    cone: "concrete_barrier",
    crate: "tent",
    debris_pile: "rock",
    dune: "rock",
    pole: "power_pole",
    sandbag: "concrete_barrier",
    sign: "billboard",
    wrecked_car: "wreckage",
  };

  return aliases[kind] ?? kind ?? "rock";
}

function spawnPropAt(kind, x, z, y = 0) {
  const prop = createPropMesh(normalizePropKind(kind), world.assets.models);
  prop.position.set(x, y, z);
  return prop;
}

function spawnProp(zone = getZoneByDistance(world.run?.distance ?? 0)) {
  const run = world.run;

  // Mile markers every 0.1 distance units

  const currentInterval = Math.floor(run.distance * 10);

  if (run.lastMileMarker !== currentInterval) {
    run.lastMileMarker = currentInterval;

    const marker = createMileMarker(currentInterval / 10);

    marker.position.set(-6.5, 0, 150);

    world.scene.add(marker);

    world.propPool.push(marker);
  }

  const kind = normalizePropKind(chooseWeightedKey(zone.props, "rock"));

  const side = Math.random() > 0.5 ? 1 : -1;

  const zDist = 120 + Math.random() * 80;

  const xDist = (kind === "castle" ? 28 + Math.random() * 24 : 18 + Math.random() * 55) * side;

  const prop = spawnPropAt(kind, xDist, zDist);

  if (kind === "castle") {
    // Already scaled inside createPropMesh or here
  } else if (kind === "building") {
    prop.scale.set(
      1 + Math.random() * 2,

      1 + Math.random() * 3,

      1 + Math.random() * 2,
    );
  } else if (kind === "tree") {
    prop.scale.set(
      0.8 + Math.random(),

      0.8 + Math.random() * 1.5,

      0.8 + Math.random(),
    );
  } else {
    prop.scale.set(
      1 + Math.random() * 2,

      1 + Math.random() * 2,

      1 + Math.random() * 2,
    );
  }

  prop.rotation.y = Math.random() * Math.PI * 2;

  world.scene.add(prop);

  world.propPool.push(prop);
}

function spawnOverhead() {
  const group = createOverheadMesh(currentBiome());

  world.scene.add(group);

  world.overheadPool ??= [];

  world.overheadPool.push(group);
}

function resolveChunkLaneX(slot, zone) {
  const jitter = slot.xJitter ? randomRange(-slot.xJitter, slot.xJitter) : 0;
  const roadHalfWidth = Math.max(2.5, (zone.roadWidth ?? 14) * 0.5 - 0.85);
  return THREE.MathUtils.clamp((slot.x ?? randomLane(zone.lanes)) + jitter, -roadHalfWidth, roadHalfWidth);
}

function resolveChunkPropX(slot) {
  const jitter = slot.xJitter ? randomRange(-slot.xJitter, slot.xJitter) : 0;
  if (slot.x != null) return slot.x + jitter;
  return (slot.side === "left" ? -1 : 1) * randomRange(8, 16) + jitter;
}

function spawnChunkTemplate(templateKey, zone = getZoneByDistance(world.run?.distance ?? 0), zBase = 48) {
  const template = getChunkTemplate(templateKey);
  if (!template) return;

  for (const slot of template.obstacleSlots ?? []) {
    const kind = resolveRandomKind(slot.kind, zone, zone.obstacles.weights);
    if (!kind || kind === "none") continue;
    spawnObstacleAt(kind, resolveChunkLaneX(slot, zone), zBase + (slot.z ?? 0));
  }

  for (const slot of template.pickupSlots ?? []) {
    const kind = resolveRandomKind(slot.kind, zone, zone.pickups.weights);
    if (!kind || kind === "none") continue;
    spawnPickupAt(kind, resolveChunkLaneX(slot, zone), zBase + (slot.z ?? 0), 1.2);
  }

  for (const slot of template.propSlots ?? []) {
    const kind = normalizePropKind(resolveRandomKind(slot.kind, zone, zone.props));
    const prop = spawnPropAt(kind, resolveChunkPropX(slot), zBase + (slot.z ?? 0));
    prop.rotation.y = Math.random() * Math.PI * 2;
    world.scene.add(prop);
    world.propPool.push(prop);
  }
}

function spawnBarrierWall(zone, z = 64) {
  const lanes = zone.lanes?.length ? zone.lanes : [-4.2, -1.4, 1.4, 4.2];
  const gapIndex = Math.floor(Math.random() * lanes.length);
  const barrierKind = zone.id === "military" || zone.id === "refuge" ? "military_barrier" : "barrier";

  lanes.forEach((laneX, index) => {
    if (index === gapIndex) return;
    spawnObstacleAt(barrierKind, laneX, z + Math.random() * 5);
  });
}

function handleTriggeredEvent(triggeredEvent, zone) {
  const { eventId, event } = triggeredEvent;
  const effects = event.effects ?? {};

  flashMessage(event.hudMessage ?? event.name);
  beep(world, 120, 0.08, "triangle");

  if (eventId === "gas_station") {
    spawnChunkTemplate("gas_station", zone, 52);
  } else if (eventId === "dark_tunnel") {
    spawnChunkTemplate("tunnel", zone, 54);
  } else if (eventId === "military_checkpoint") {
    spawnChunkTemplate("military_checkpoint_chunk", zone, 50);
  } else if (eventId === "cut_road") {
    spawnChunkTemplate("barricade_row", zone, 50);
  } else if (eventId.startsWith("chase")) {
    spawnChunkTemplate("ambush_alley", zone, 50);
  }

  if (effects.spawnBarrierWall) {
    spawnBarrierWall(zone, 58);
  }

  for (let i = 0; i < (effects.spawnChaser ?? 0); i += 1) {
    const chaser = spawnObstacleAt("raider", randomLane(zone.lanes), -15 - i * 8);
    if (chaser) {
      chaser.userData.isChaser = true;
      chaser.userData.damage = effects.chaserDamage ?? chaser.userData.damage;
      chaser.userData.shotCooldown = effects.chaserShootInterval ?? chaser.userData.shotCooldown;
    }
  }

  for (let i = 0; i < (effects.spawnFuelPickups ?? 0); i += 1) {
    spawnPickupAt("fuel", randomLane(zone.lanes), 42 + i * 8, 1.2);
  }

  for (let i = 0; i < (effects.spawnRepairPickups ?? 0); i += 1) {
    spawnPickupAt("repair", randomLane(zone.lanes), 46 + i * 10, 1.2);
  }

  for (let i = 0; i < (effects.spawnBarriers ?? 0); i += 1) {
    spawnObstacleAt("military_barrier", randomLane(zone.lanes), 44 + i * 7);
  }

  for (let i = 0; i < (effects.spawnTowers ?? 0); i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    spawnObstacleAt("tower", side * randomRange(5, 6.5), 54 + i * 14);
  }

  for (let i = 0; i < (effects.spawnMines ?? 0); i += 1) {
    spawnObstacleAt("mine", randomLane(zone.lanes), 46 + i * 6);
  }
}

function spawnObstacle(zone = getZoneByDistance(world.run?.distance ?? 0)) {
  const kind = spawnEncounter(world.run, zone.id, encounterConfig);
  if (!kind || kind === "none") return null;

  const x =
    kind === "tower"
      ? (4 + Math.random() * 2) * (Math.random() > 0.5 ? -1 : 1)
      : randomLane(zone.lanes);

  return spawnObstacleAt(kind, x, 38 + Math.random() * 18);
}

function spawnObstacleAt(kind, x, z) {
  if (!kind || kind === "none") return null;
  const obstacle = createObstacleMesh(kind, world.assets.models);

  obstacle.castShadow = true;

  obstacle.receiveShadow = true;

  obstacle.position.set(x, obstacle.userData.height, z);

  if (obstacle.userData.isEnemy) {
    obstacle.userData.laneTarget = obstacle.position.x;
  }

  applyObstacleOrientation3D(obstacle, kind);

  obstacle.userData.marker = createFootprintMarker(obstacle, kind);

  world.scene.add(obstacle);

  world.scene.add(obstacle.userData.marker);

  world.obstaclePool.push(obstacle);

  return obstacle;
}

/** Rotaciones coherentes con el suelo: nada de “cubo caótico” en XYZ. */

function applyObstacleOrientation3D(obstacle, kind) {
  if (kind === "tower") {
    obstacle.rotation.set(0, Math.random() * Math.PI * 2, 0);

    return;
  }

  if (kind === "barrier") {
    obstacle.rotation.set(0, (Math.random() - 0.5) * 0.08, 0);

    return;
  }

  if (kind === "raider") {
    obstacle.rotation.set(0, Math.PI, 0); // Faces consistently instead of spinning randomly

    return;
  }

  if (kind === "mutant") {
    obstacle.rotation.set(0, Math.PI + (Math.random() - 0.5) * 0.4, 0);

    return;
  }

  if (kind === "ramp") {
    // Align ramp so player can jump over it properly

    obstacle.rotation.set(0, Math.PI, 0);

    return;
  }

  if (kind === "wreck") {
    obstacle.rotation.set(
      (Math.random() - 0.5) * 0.08,

      Math.random() * Math.PI * 2,

      (Math.random() - 0.5) * 0.08,
    );

    return;
  }

  if (kind === "scrap") {
    // chatarra: basura rodando sobre el asfalto (solo yaw + leve basculación)

    obstacle.rotation.set(
      (Math.random() - 0.5) * 0.35,

      Math.random() * Math.PI * 2,

      (Math.random() - 0.5) * 0.25,
    );

    return;
  }

  // Default fallback (flat on the ground, random yaw)

  obstacle.rotation.set(0, Math.random() * Math.PI * 2, 0);
}

function spawnPickup(zone = getZoneByDistance(world.run?.distance ?? 0)) {
  const type = choosePickupType(world.run, zone.id, encounterConfig);

  spawnPickupAt(
    type,

    randomLane(zone.lanes),

    34 + Math.random() * 18,

    1.2 + Math.random() * 0.7,
  );
}

function spawnPickupAt(type, x, z, y = 1.2) {
  const group = createPickupMesh(type, pickupCatalog, world.assets.models, y);
  group.position.set(x, y, z);

  world.scene.add(group);
  world.pickupPool.push(group);
  return group;
}

function removeObstacle(obstacle) {
  removePoolEntry(world, "obstaclePool", obstacle);
}

function transformToDebris(obstacle) {
  // Remove from obstacle pool but keep in scene

  world.obstaclePool = world.obstaclePool.filter((o) => o !== obstacle);

  if (obstacle.userData.marker) {
    world.scene.remove(obstacle.userData.marker);

    obstacle.userData.marker = null;
  }

  // Add physics properties

  obstacle.userData.vx = (Math.random() - 0.5) * 15;

  obstacle.userData.vy = 8 + Math.random() * 12;

  obstacle.userData.vz = 15 + Math.random() * 20;

  obstacle.userData.rvx = (Math.random() - 0.5) * 8;

  obstacle.userData.rvy = (Math.random() - 0.5) * 8;

  obstacle.userData.rvz = (Math.random() - 0.5) * 8;

  obstacle.userData.life = 2.0;

  world.debrisPool.push(obstacle);
}

export function destroyObstacle(obstacle, rewardPlayer = false) {
  const impactPoint = obstacle.position.clone();

  createBurst(
    world,

    impactPoint,

    obstacle.userData.isEnemy ? "#ff6d5e" : "#ff8b5e",

    obstacle.userData.isEnemy ? 18 : 12,
  );

  createShockwave(
    world,

    impactPoint,

    obstacle.userData.isEnemy ? "#ff6d5e" : "#ff8b5e",

    0.55,

    2.4,

    0.24,
  );

  if (rewardPlayer && obstacle.userData.isEnemy && world.run) {
    world.run.kills += 1;

    world.run.coins += obstacle.userData.rewardCoins ?? 0;

    world.run.ammo = Math.min(
      world.run.ammoMax,

      world.run.ammo + (obstacle.userData.rewardAmmo ?? 0),
    );

    if (Math.random() < 0.45) {
      spawnPickupAt(
        Math.random() > 0.5 ? "ammo" : "repair",

        obstacle.position.x,

        obstacle.position.z,

        1.1,
      );
    }
  }

  transformToDebris(obstacle);
}

function spawnEnemyProjectile(obstacle) {
  const projectile = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 10),

    new THREE.MeshBasicMaterial({
      color: "#ffb36a",

      transparent: true,

      opacity: 0.95,
    }),
  );

  const gunY = obstacle.position.y + (obstacle.userData.projectileY ?? 1.05);

  projectile.position.set(obstacle.position.x, gunY, obstacle.position.z - 0.8);

  projectile.userData = {
    speed: 24 + Math.random() * 8,

    drift: (Math.random() - 0.5) * 1.4,

    damage: 7 + Math.round(Math.random() * 3),
  };

  world.scene.add(projectile);

  world.projectilePool.push(projectile);

  createBurst(world, projectile.position, "#ffb36a", 3);
}

function updateEntities(dt) {
  const run = world.run;

  const speed = run.speed * dt;

  let anyChaserBehind = false;

  world.obstaclePool = world.obstaclePool.filter((obstacle) => {
    const isChaser = obstacle.userData.isChaser === true;
    const isEnemy = obstacle.userData.isEnemy === true;

    if (isChaser && obstacle.position.z < 0) anyChaserBehind = true;

    // Chasers approach from behind, enemies approach from front
    let moveMult = isEnemy ? 0.85 : 1.0;
    if (isChaser) {
       // If far behind, approach faster
       if (obstacle.position.z < -5) moveMult = -0.2; // approach
       else if (obstacle.position.z < 1) moveMult = 0.5; // slow down approach
       else moveMult = 1.02; // maintain slightly ahead or just drift back
    }

    obstacle.position.z -= speed * moveMult;

    if (isEnemy || isChaser) {
      // Enemies should not spin like tops. They should face forward and steer slightly to their lane target.
      const laneDiff = obstacle.userData.laneTarget - obstacle.position.x;
      obstacle.rotation.y = laneDiff * 0.15;
      obstacle.rotation.z = -laneDiff * 0.05;

      obstacle.userData.shotCooldown -= dt;

      // AI: try to line up with player
      if (Math.random() < dt * 0.8) {
        // 70% chance to target player lane, 30% random lane
        const zone = getZoneByDistance(run.distance);
        obstacle.userData.laneTarget = Math.random() > 0.3 ? run.x : randomLane(zone.lanes);
      }

      obstacle.position.x += (obstacle.userData.laneTarget - obstacle.position.x) * dt * 2.5;

      const sameLane = Math.abs(obstacle.position.x - run.x) < 1.4;
      const inRange = obstacle.position.z > -5 && obstacle.position.z < 30;

      if (sameLane && inRange && obstacle.userData.shotCooldown <= 0) {
        spawnEnemyProjectile(obstacle);
        obstacle.userData.shotCooldown = 1.1 + Math.random() * 1.5;
      }
    } else if (obstacle.userData.obstacleSpin === "scrap") {
      obstacle.rotation.y += dt * 0.55;

      obstacle.rotation.x += dt * 0.06;
    } else if (obstacle.userData.obstacleSpin === "barrier") {
      // Barrier shouldn't spin constantly either unless it's moving weirdly. Let's keep it static.
    }

    if (obstacle.userData.marker) {
      const m = obstacle.userData.marker;

      m.position.x = obstacle.position.x;

      m.position.z = obstacle.position.z;

      m.rotation.y = obstacle.rotation.y;
    }

    if ((!isChaser && obstacle.position.z < -12) || (isChaser && obstacle.position.z < -60)) {
      removeObstacle(obstacle);

      return false;
    }

    const hit = obstacleHitsCar(obstacle, run);

    if (hit) {
      // ── Ramp: auto-jump, no damage ──────────────────────────────────
      if (obstacle.userData.isRamp) {
        if (run.grounded) {
          run.grounded = false;
          run.yVelocity = run.jumpPower * 1.15;
          run.speedFactor = Math.min(1, run.speedFactor + 0.12);
          createBurst(world, world.car.position, "#7af5b7", 4);
          flashMessage("Ramp!");
          beep(world, 320, 0.06, "triangle");
        }
        return true;
      }

      // ── Hazards (non-blocking) ──────────────────────────────────────
      if (obstacle.userData.isOilSpill) {
        run.speedFactor = Math.max(0.2, run.speedFactor - dt * 2.5);
        run.lateralVel *= 0.95; // Slippery
        if (Math.random() > 0.92) spawnSkidMark(world, world.car.position, 0.8);
        return true;
      }

      if (obstacle.userData.isPothole) {
        if (run.grounded) {
           run.speedFactor *= 0.98;
           triggerShake(0.15);
           if (Math.random() > 0.8) beep(world, 60, 0.04, "sine");
        }
        return true;
      }

      // ── Explosives ──────────────────────────────────────────────────
      if (obstacle.userData.obstacleSpin === "mine") {
        const dmg = resolveCollision(run, obstacle.userData.damage || 40);
        flashMessage(`MINE! -${dmg} hull`);
        triggerShake(2.0);
        createBurst(world, obstacle.position, "#ffaa00", 25);
        createShockwave(world, obstacle.position, "#ff4400", 0.8, 5, 0.3);
        beep(world, 50, 0.25, "sawtooth");
        destroyObstacle(obstacle, false);
        return false; // Removed from pool
      }

      if (hit.isScrape) {
        // ── Glancing / side-swipe collision ──────────────────────────
        if (run.invulnerable <= 0) {
          const scrapeDamage = Math.max(1, Math.round((obstacle.userData.damage || 10) * 0.2));
          const appliedDamage = resolveCollision(run, scrapeDamage);
          flashMessage(`Roce lateral: -${appliedDamage} hull`);
          triggerShake(0.4);
          run.invulnerable = 0.3;
          createBurst(world, obstacle.position, "#ffcc00", 3);
          beep(world, 200, 0.05, "sine");
        }
        const pushDir = hit.signedDx !== 0 ? Math.sign(hit.signedDx) : run.lateralVel > 0 ? -1 : 1;
        run.lateralVel = -pushDir * (4 + run.speed * 0.1);
        run.speedFactor *= 0.95;
        return true;
      }

      // ── Full frontal / body collision ─────────────────────────────
      const isWall = obstacle.userData.isWall === true;
      if (isWall) {
        // ── CRASH: wall / structure — instant death, no mercy ───────
        run.health = 0;
        run.endReason = "El coche impacto contra una estructura y quedo destrozado.";
        run.speedFactor = 0.001;
        run.lateralVel = 0;
        triggerShake(3.0);
        createBurst(world, obstacle.position, "#ffaa00", 22);
        createShockwave(world, obstacle.position, "#ff6600", 0.6, 4.5, 0.3);
        beep(world, 40, 0.28, "sawtooth");
        return true;
      }

      if (run.invulnerable <= 0) {
        const appliedDamage = resolveCollision(run, obstacle.userData.damage);

        flashMessage(`Impacto frontal: -${appliedDamage} hull`);

        triggerShake(1.2);

        createBurst(world, obstacle.position, "#ff7b54", 10);

        beep(world, 80, 0.09, "sawtooth");
      }

      // Position correction: push car out of X overlap so it can't ghost through

      const pushDirX = hit.signedDx !== 0 ? Math.sign(hit.signedDx) : run.lateralVel > 0 ? -1 : 1;

      run.x -= pushDirX * hit.xOverlap;

      // Push obstacle back in Z to sell the impact

      obstacle.position.z += hit.zOverlap * 1.2;

      // Lateral knockback away from impact point

      const knockStrength = 5 + run.speed * 0.12;

      if (Math.abs(run.lateralVel) < knockStrength) {
        run.lateralVel = -pushDirX * knockStrength;
      } else {
        run.lateralVel -= pushDirX * knockStrength * 0.6;
      }

      // Clamp car to lane bounds after separation push

      const laneHw = 5.2;

      if (run.x <= -laneHw) {
        run.x = -laneHw;
        run.lateralVel = Math.max(0, run.lateralVel);
      } else if (run.x >= laneHw) {
        run.x = laneHw;
        run.lateralVel = Math.min(0, run.lateralVel);
      }

      // Significant speed penalty: the car must not just plow through

      run.speedFactor *= 0.62 - (obstacle.userData.damage ?? 10) * 0.003;

      if (run.speedFactor < 0.24) run.speedFactor = 0.24;

      transformToDebris(obstacle);

      return false;
    }

    return true;
  });

  if (hud.raiderWarning) {
    hud.raiderWarning.style.display = anyChaserBehind ? "flex" : "none";
  }

  // Physics Debris

  world.debrisPool = world.debrisPool.filter((debris) => {
    debris.position.x += debris.userData.vx * dt;

    debris.position.y += debris.userData.vy * dt;

    debris.position.z += debris.userData.vz * dt - speed;

    debris.userData.vy -= 30 * dt; // Gravity

    debris.rotation.x += debris.userData.rvx * dt;

    debris.rotation.y += debris.userData.rvy * dt;

    debris.rotation.z += debris.userData.rvz * dt;

    debris.userData.life -= dt;

    if (debris.position.y < -5 || debris.userData.life <= 0) {
      world.scene.remove(debris);

      return false;
    }

    return true;
  });

  world.pickupPool = world.pickupPool.filter((pickup) => {
    pickup.position.z -= speed;

    const ud = pickup.userData;
    ud.bobTimer += dt * 3.5;
    pickup.position.y += Math.sin(ud.bobTimer) * 0.005;

    // Smooth spin
    pickup.rotation.y += dt * (ud.spinSpeed || 2.2);

    if (pickup.position.z < -12) {
      world.scene.remove(pickup);
      return false;
    }

    if (collidesWithCar(pickup.position.x, pickup.position.z, 0.95)(run)) {
      const pType = ud.pickupType || ud.type;
      const resolvedPickup = _resolvePickup(run, pType, pickupCatalog);

      flashMessage(`${resolvedPickup?.label ?? ud.label}`);

      const config = pickupCatalog[pType] || { color: "#ffffff" };
      createBurst(world, pickup.position, config.color, 12);

      beep(world, 320, 0.05, "triangle");

      world.scene.remove(pickup);
      return false;
    }

    return true;
  });

  world.particles = world.particles.filter((particle) => {
    const data = particle.userData ?? {};

    if (data.kind === "shockwave") {
      data.age += dt;

      const progress = data.age / data.lifetime;

      if (progress >= 1) {
        world.scene.remove(particle);

        return false;
      }

      const radius = THREE.MathUtils.lerp(data.start, data.end, progress);

      particle.scale.set(radius, radius, 1);

      particle.position.y += dt * 0.3;

      particle.material.opacity = (1 - progress) * 0.65;

      return true;
    }

    if (data.velocity) {
      particle.position.addScaledVector(data.velocity, dt);

      if (data.drag) {
        data.velocity.multiplyScalar(Math.max(0, 1 - data.drag * dt));
      }

      if (data.gravity) {
        data.velocity.y -= 18 * dt;
      }

      if (data.grow) {
        const scale = 1 + dt * data.grow;

        particle.scale.multiplyScalar(scale);
      }
    }

    if (particle.userData.vx !== undefined) {
      particle.position.x += particle.userData.vx * dt;

      particle.position.y += particle.userData.vy * dt;

      particle.position.z += particle.userData.vz * dt;

      if (particle.userData.rv) {
        particle.rotation.x += particle.userData.rv.x * dt;

        particle.rotation.y += particle.userData.rv.y * dt;

        particle.rotation.z += particle.userData.rv.z * dt;
      }

      particle.userData.life -= dt;

      if (particle.userData.life <= 0 || particle.position.z < -20) {
        world.scene.remove(particle);

        return false;
      }

      return true;
    }

    particle.material.opacity -= dt * (data.fade ?? 1.25);

    if (particle.material.opacity <= 0) {
      world.scene.remove(particle);

      return false;
    }

    return true;
  });

  world.projectilePool = world.projectilePool.filter((projectile) => {
    projectile.position.z -= dt * projectile.userData.speed;

    projectile.position.x += projectile.userData.drift * dt;

    projectile.material.opacity -= dt * 0.12;

    if (
      collidesWithCar(
        projectile.position.x,

        projectile.position.z,

        0.45,

        projectile.position.y,

        0.9,
      )(run)
    ) {
      if (run.invulnerable <= 0) {
        run.health -= projectile.userData.damage;

        run.invulnerable = 0.45;

        flashMessage(`Disparo recibido: -${projectile.userData.damage} hull`);

        triggerShake(0.7);

        beep(world, 94, 0.05, "square");
      }

      world.scene.remove(projectile);

      return false;
    }

    if (projectile.position.z < -10 || projectile.material.opacity <= 0.1) {
      world.scene.remove(projectile);

      return false;
    }

    return true;
  });

  if (run.health <= 0) {
    finishRun(false);

    beep(world, 55, 0.18, "square");
  }
}
