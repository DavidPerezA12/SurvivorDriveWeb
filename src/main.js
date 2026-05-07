import "./style.css";

import * as THREE from "three";

import { setupTouchControls } from "./controls/touch.js";
import { loadAssets } from "./game/assets.js";
import { updateAudioVolume } from "./game/audio.js";
import { rebuildCarAppearance } from "./game/car.js";
import {
  equipmentCatalog,
  environmentProfiles as rawEnvironmentProfiles,
  skyPalette as rawSkyPalette,
} from "./game/content.js";
import { createEventManager } from "./game/events.js";
import { createInputState } from "./game/input.js";
import { createGameLoop } from "./game/loop.js";
import { loadSaveData, saveSaveData } from "./game/persistence.js";
import {
  GameRoute,
  biomeFromRoute,
  isRunRoute,
  routeForBiome,
  screenForRoute,
} from "./game/routes.js";
import { createRunRuntime } from "./game/runRuntime.js";
import { setupThree } from "./game/sceneSetup.js";
import { mountApp } from "./game/ui.js";
import { setupUIController } from "./game/uiController.js";
import { configurePlayerActions, tryJump, useFire } from "./player/actions.js";
import { configureHudUpdates, updateHUD, flashMessage } from "./ui/hudUpdates.js";
import {
  createEnvironmentRuntime,
  hydrateEnvironmentProfiles,
  hydrateSkyPalette,
  isDesertZone,
} from "./world/environmentRuntime.js";
import { getZoneByDistance } from "./game/zones.js";

const app = document.querySelector("#app");
const ui = mountApp(app);
const { canvas, atmosphere, screens, hud } = ui;

const TOTAL_ROUTE_DISTANCE = 7.2;

document.body.dataset.help = "collapsed";

const saveData = loadSaveData();
const state = {
  options: saveData.options,
  equipment: saveData.loadout,
  progression: saveData.progression,
  upgrades: saveData.upgrades,
  unlocks: saveData.unlocks,
  stats: saveData.stats,
};

const environmentProfiles = hydrateEnvironmentProfiles(rawEnvironmentProfiles);
const skyPalette = hydrateSkyPalette(rawSkyPalette);

const world = {
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
  hud,
  totalRouteDistance: TOTAL_ROUTE_DISTANCE,
  environmentRuntime,
  saveState,
  setRoute,
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

function saveState() {
  saveSaveData(saveData);
}

function isPlaying() {
  return isRunRoute(world.route);
}

function currentBiome() {
  if (world.run) {
    return getZoneByDistance(world.run.distance).id;
  }

  return world.environment.biome ?? biomeFromRoute(world.route);
}

function isDesert(biome = currentBiome()) {
  return isDesertZone(biome);
}

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

function startRun(biome = "desert", forceReset = false) {
  runRuntime.startRun(biome, forceReset);
}

function endRunToMenu() {
  setRoute(GameRoute.MENU);
  resetRun();
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

init();
