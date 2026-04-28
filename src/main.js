import "./style.css";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { createInputState, applyKeyToInput } from "./game/input.js";
import {
  biomeCatalog,
  contentManifest,
  equipmentCatalog,
  encounterConfig,
  environmentProfiles as rawEnvironmentProfiles,
  objectiveCatalog,
  pickupCatalog,
  schemaVersion,
  skyPalette as rawSkyPalette,
  speedPips,
} from "./game/content.js";
import {
  loadSaveData,
  saveSaveData,
  registerRunResult,
  unlockCity,
} from "./game/persistence.js";
import {
  GameRoute,
  biomeFromRoute,
  isRunRoute,
  routeForBiome,
  screenForRoute,
} from "./game/routes.js";
import {
  applyLoadout as _applyLoadout,
  choosePickupType,
  createRunState as _createRunState,
  resolveCollision,
  resolvePickup as _resolvePickup,
  spawnEncounter,
  updateRunProgression as _updateRunProgression,
} from "./game/simulation.js";
import { mountApp } from "./game/ui.js";
import { createCar, rebuildCarAppearance } from "./game/car.js";
import {
  obstacleHitsCar,
  firePulseTouchesObstacle,
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
  createMissileTrail,
  spawnSkidMark,
  spawnAtmosphericDebris,
  removePoolEntry,
} from "./game/spawn.js";

const app = document.querySelector("#app");
const ui = mountApp(app);
const { canvas, atmosphere, screens, hud } = ui;
document.body.dataset.help = "collapsed";
const tempColorA = new THREE.Color();
const tempColorB = new THREE.Color();
const tempColorC = new THREE.Color();

const saveData = loadSaveData();
const state = {
  options: saveData.options,
  equipment: saveData.loadout,
  progression: saveData.progression,
  unlocks: saveData.unlocks,
  stats: saveData.stats,
};

const environmentProfiles = Object.fromEntries(
  Object.entries(rawEnvironmentProfiles).map(([key, profile]) => [
    key,
    {
      ...profile,
      tint: new THREE.Color(profile.tint),
    },
  ]),
);

const skyPalette = Object.fromEntries(
  Object.entries(rawSkyPalette).map(([biome, palette]) => [
    biome,
    Object.fromEntries(
      Object.entries(palette).map(([key, color]) => [
        key,
        new THREE.Color(color),
      ]),
    ),
  ]),
);

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

  let messageTimer = 0;
  let shakeTimer = 0;
  let shakeIntensity = 0;


setupThree();
setupUI();
applyOptions();
setRoute(GameRoute.MENU);
resetRun();
animate();

function saveState() {
  saveSaveData(saveData);
}

function isPlaying() {
  return isRunRoute(world.route);
}

function currentBiome() {
  return (
    world.run?.biome ?? world.environment.biome ?? biomeFromRoute(world.route)
  );
}

function setupThree() {
  world.renderer.outputColorSpace = THREE.SRGBColorSpace;
  world.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  world.renderer.toneMappingExposure = 1.05; // Aumentado para mayor claridad general
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  world.pmrem = new THREE.PMREMGenerator(world.renderer);
  const room = new RoomEnvironment();
  world.envTexture = world.pmrem.fromScene(room, 0.0).texture;
  // REMOVED world.scene.environment to prevent all objects from looking like they are in a white studio
  room.dispose();

  world.scene.fog = new THREE.FogExp2("#9e7447", 0.005);
  world.scene.background = new THREE.Color("#120b08");

  const ambient = new THREE.HemisphereLight("#a88768", "#211108", 0.6); // Aumentado de 0.5
  world.scene.add(ambient);
  world.lights.ambient = ambient;

  // Luz de relleno más brillante
  const fill = new THREE.DirectionalLight("#606f7d", 0.35); // Aumentado de 0.2
  fill.position.set(-20, 15, -10);
  world.scene.add(fill);

  // Estrellas
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 400; i++) {
    const x = (Math.random() - 0.5) * 500;
    const y = 10 + Math.random() * 200;
    const z = -140;
    starPos.push(x, y, z);
  }
  starGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starPos, 3),
  );
  const starMat = new THREE.PointsMaterial({
    color: "#fff",
    size: 0.65,
    transparent: true,
    opacity: 0,
  });
  const stars = new THREE.Points(starGeo, starMat);
  world.scene.add(stars);
  world.lights.stars = stars;

  const sun = new THREE.DirectionalLight("#fff0d4", 1.2); // Intensidad equilibrada
  sun.position.set(16, 28, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.bias = -0.0005;
  world.scene.add(sun);
  world.lights.sun = sun;

  const terrainData = createTerrainTexture();
  terrainData.map.wrapS = THREE.RepeatWrapping;
  terrainData.map.wrapT = THREE.RepeatWrapping;
  terrainData.map.repeat.set(8, 20);
  terrainData.map.anisotropy = world.renderer.capabilities.getMaxAnisotropy();

  if (terrainData.bumpMap) {
    terrainData.bumpMap.wrapS = THREE.RepeatWrapping;
    terrainData.bumpMap.wrapT = THREE.RepeatWrapping;
    terrainData.bumpMap.repeat.set(8, 20);
  }

  if (terrainData.roughnessMap) {
    terrainData.roughnessMap.wrapS = THREE.RepeatWrapping;
    terrainData.roughnessMap.wrapT = THREE.RepeatWrapping;
    terrainData.roughnessMap.repeat.set(8, 20);
  }

  const sandMaterial = new THREE.MeshStandardMaterial({
    color: "#d48a4f",
    map: terrainData.map,
    bumpMap: terrainData.bumpMap,
    roughnessMap: terrainData.roughnessMap,
    bumpScale: 0.35,
    roughness: 0.92,
    metalness: 0.05,
  });

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(450, 600, 32, 32),
    sandMaterial,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 150;
  ground.receiveShadow = true;
  world.scene.add(ground);

  const roadData = createRoadTexture();
  roadData.map.wrapS = THREE.RepeatWrapping;
  roadData.map.wrapT = THREE.RepeatWrapping;
  roadData.map.repeat.set(1, 20);
  roadData.map.anisotropy = world.renderer.capabilities.getMaxAnisotropy();

  if (roadData.bumpMap) {
    roadData.bumpMap.wrapS = THREE.RepeatWrapping;
    roadData.bumpMap.wrapT = THREE.RepeatWrapping;
    roadData.bumpMap.repeat.set(1, 20);
  }

  if (roadData.roughnessMap) {
    roadData.roughnessMap.wrapS = THREE.RepeatWrapping;
    roadData.roughnessMap.wrapT = THREE.RepeatWrapping;
    roadData.roughnessMap.repeat.set(1, 20);
  }

  const roadMaterial = new THREE.MeshStandardMaterial({
    color: "#666666",
    map: roadData.map,
    bumpMap: roadData.bumpMap,
    roughnessMap: roadData.roughnessMap,
    bumpScale: 0.15,
    roughness: 0.85,
    metalness: 0.1,
  });

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(9.4, 600, 16, 64),
    roadMaterial,
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.03, 150);
  road.receiveShadow = true;
  world.scene.add(road);

  const shoulderData = createShoulderTexture();
  shoulderData.map.wrapS = THREE.RepeatWrapping;
  shoulderData.map.wrapT = THREE.RepeatWrapping;
  shoulderData.map.repeat.set(1, 20);
  shoulderData.map.anisotropy = world.renderer.capabilities.getMaxAnisotropy();

  if (shoulderData.bumpMap) {
    shoulderData.bumpMap.wrapS = THREE.RepeatWrapping;
    shoulderData.bumpMap.wrapT = THREE.RepeatWrapping;
    shoulderData.bumpMap.repeat.set(1, 20);
  }

  if (shoulderData.roughnessMap) {
    shoulderData.roughnessMap.wrapS = THREE.RepeatWrapping;
    shoulderData.roughnessMap.wrapT = THREE.RepeatWrapping;
    shoulderData.roughnessMap.repeat.set(1, 20);
  }

  const shoulderMaterial = new THREE.MeshStandardMaterial({
    color: "#6f553a",
    map: shoulderData.map,
    bumpMap: shoulderData.bumpMap,
    roughnessMap: shoulderData.roughnessMap,
    bumpScale: 0.25,
    roughness: 0.95,
    metalness: 0.02,
  });

  world.roadShoulders = [-5.55, 5.55].map((x) => {
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 600, 4, 64),
      shoulderMaterial,
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(x, 0.02, 150);
    shoulder.receiveShadow = true;
    world.scene.add(shoulder);
    return shoulder;
  });

  world.groundSurface = ground;
  world.roadSurface = road;
  world.roadTexture = roadData.map;
  world.roadBumpTexture = roadData.bumpMap;
  world.roadRoughnessTexture = roadData.roughnessMap;
  world.terrainTexture = terrainData.map;
  world.terrainBumpTexture = terrainData.bumpMap;
  world.terrainRoughnessTexture = terrainData.roughnessMap;
  world.shoulderTexture = shoulderData.map;
  world.shoulderBumpTexture = shoulderData.bumpMap;
  world.shoulderRoughnessTexture = shoulderData.roughnessMap;
  world.materials.ground = sandMaterial;
  world.materials.road = roadMaterial;
  world.materials.shoulder = shoulderMaterial;

  for (let i = 0; i < 100; i += 1) {
    const dune = createDune();
    recycleEnvironmentObject(dune, true, 10, 80, -35, 300);
    world.scene.add(dune);
    world.dunes.push(dune);
  }

  for (let i = 0; i < 120; i += 1) {
    const prop = createRoadsideProp(i);
    world.scene.add(prop);
    world.roadsideProps.push(prop);
  }

  for (let i = 0; i < 45; i += 1) {
    const b = createBackdropMesa(i);
    world.scene.add(b);
    world.roadsideBackdrop.push(b);
  }

  for (let i = 0; i < 55; i += 1) {
    const prop = createCityRoadsideProp(i);
    prop.visible = false;
    world.scene.add(prop);
    world.cityProps.push(prop);
  }

  for (let i = 0; i < 28; i += 1) {
    const skyline = createCityBackdrop(i);
    skyline.visible = false;
    world.scene.add(skyline);
    world.cityBackdrop.push(skyline);
  }

  for (let i = 0; i < 180; i += 1) {
    const boulder = createScatteredBoulder();
    recycleEnvironmentObject(boulder, true, 10, 85, -50, 320);
    world.scene.add(boulder);
    world.boulders.push(boulder);
  }

  for (let i = 0; i < 50; i += 1) {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 10),
      new THREE.MeshBasicMaterial({
        color: "#f2c38f",
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
      }),
    );
    band.position.set(
      (Math.random() - 0.5) * 45,
      1.5 + Math.random() * 6,
      i * 12,
    );
    band.rotation.y = (Math.random() - 0.5) * 0.8;
    world.scene.add(band);
    world.dustBands.push(band);
  }

  // Heat shimmer planes (desert mirage above road)
  world.heatShimmer = [];
  for (let i = 0; i < 10; i++) {
    const shimmerGeo = new THREE.PlaneGeometry(15 + Math.random() * 20, 6 + Math.random() * 8, 4, 2);
    const shimmerMat = new THREE.MeshBasicMaterial({
      color: "#ffddb0",
      transparent: true,
      opacity: 0.025 + Math.random() * 0.025,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shimmer = new THREE.Mesh(shimmerGeo, shimmerMat);
    shimmer.position.set(
      (Math.random() - 0.5) * 12,
      0.4 + Math.random() * 1.8,
      -10 + Math.random() * 320,
    );
    shimmer.rotation.x = -0.15 + Math.random() * 0.3;
    shimmer.userData = {
      speedFactor: 0.6 + Math.random() * 0.4,
      wobble: Math.random() * Math.PI * 2,
      baseY: shimmer.position.y,
    };
    world.scene.add(shimmer);
    world.heatShimmer.push(shimmer);
  }

  for (let i = 0; i < 20; i++) {
    const far = createFarBackdropElement(i);
    world.scene.add(far);
    world.farBackdrop.push(far);
  }

  for (let i = 0; i < 60; i++) {
    const detail = createRoadDetail();
    world.scene.add(detail);
    world.roadDetails.push(detail);
  }

  world.car = createCar(world, state, equipmentCatalog);
  world.scene.add(world.car);

  world.camera.position.set(0, 5.5, -10);
  world.camera.lookAt(0, 1.4, 8);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
  );

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.load("/models/ferrari.glb", (gltf) => {
    const object = gltf.scene;
    object.scale.set(1.1, 1.1, 1.1); // Adjust scale to fit game
    object.rotation.y = Math.PI;
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    world.assets.models["player"] = object;

    // If the car was already created as placeholder, update it.
    if (world.car && world.car.userData.hull) {
      rebuildCarAppearance(world, state, equipmentCatalog);
    }
  });

  window.addEventListener("resize", onResize);
  onResize();
}

function setupUI() {
  populateEquipmentSelectors();
  hydrateOptionsUI();
  updateLoadoutUI();

  document.addEventListener("click", (event) => {
    const uiAction = event.target.closest("[data-ui-action]");
    if (uiAction?.dataset.uiAction === "toggle-help") {
      document.body.dataset.help =
        document.body.dataset.help === "expanded" ? "collapsed" : "expanded";
      return;
    }

    const button = event.target.closest("[data-action]");
    if (!button) return;

initAudio(world);
    const action = button.dataset.action;

    if (action === "start-desert") {
      startRun("desert");
    } else if (action === "start-city") {
      startRun("city");
    } else if (action === "equipment") {
      setRoute(GameRoute.EQUIPMENT);
    } else if (action === "options") {
      setRoute(GameRoute.OPTIONS);
    } else if (action === "menu") {
      endRunToMenu();
    } else if (action === "resume") {
      resumeRun();
    } else if (action === "restart") {
      startRun(world.run?.biome ?? "desert", true);
    }
  });

  document.querySelectorAll("[data-equip]").forEach((select) => {
    select.addEventListener("change", () => {
      state.equipment[select.dataset.equip] = select.value;
      saveState();
      rebuildCarAppearance(world, state, equipmentCatalog);
      updateLoadoutUI();
      flashMessage("Equipamiento actualizado");
    });
  });

  const volumeInput = document.querySelector('[data-option="volume"]');
  volumeInput.addEventListener("input", () => {
    state.options.volume = Number(volumeInput.value);
    document.querySelector('[data-option-value="volume"]').textContent =
      `${state.options.volume}%`;
updateAudioVolume(state, world);
    saveState();
  });

  const qualityInput = document.querySelector('[data-option="quality"]');
  qualityInput.addEventListener("change", () => {
    state.options.quality = qualityInput.value;
    applyOptions();
    saveState();
  });

  const resolutionScaleInput = document.querySelector(
    '[data-option="resolutionScale"]',
  );
  resolutionScaleInput.addEventListener("change", () => {
    state.options.resolutionScale = resolutionScaleInput.value;
    applyOptions();
    saveState();
  });

  const fullscreenInput = document.querySelector('[data-option="fullscreen"]');
  fullscreenInput.addEventListener("change", async () => {
    state.options.fullscreen = fullscreenInput.checked;
    await syncFullscreen();
    saveState();
  });

  const weatherFxInput = document.querySelector('[data-option="weatherFx"]');
  weatherFxInput.addEventListener("change", () => {
    state.options.weatherFx = weatherFxInput.checked;
    saveState();
  });

  const dayNightInput = document.querySelector('[data-option="dayNight"]');
  dayNightInput.addEventListener("change", () => {
    state.options.dayNight = dayNightInput.checked;
    saveState();
  });

  document.querySelectorAll("[data-game-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isPlaying()) return;
      const action = button.dataset.gameAction;
      if (action === "jump") tryJump();
      if (action === "fire") useFire();
      if (action === "pause") pauseRun();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;

    applyKeyToInput(world.input, event, true);

    if (event.code === "Escape") {
      if (isPlaying()) pauseRun();
      else if (world.route === GameRoute.PAUSE) resumeRun();
    }

    if (!isPlaying()) return;

    if (event.code === "Space") {
      event.preventDefault();
      tryJump();
    }
    if (event.code === "KeyF") useFire();
  });

  window.addEventListener("keyup", (event) => {
    if (isPlaying() && event.code === "Space") event.preventDefault();
    applyKeyToInput(world.input, event, false);
  });

  setupTouchControls();
}

function populateEquipmentSelectors() {
  for (const [key, items] of Object.entries(equipmentCatalog)) {
    const select = document.querySelector(`[data-equip="${key}"]`);
    select.innerHTML = items
      .map((item) => `<option value="${item.id}">${item.name}</option>`)
      .join("");
    select.value = state.equipment[key];
  }
}

function hydrateOptionsUI() {
  document.querySelector('[data-option="volume"]').value = state.options.volume;
  document.querySelector('[data-option-value="volume"]').textContent =
    `${state.options.volume}%`;
  document.querySelector('[data-option="quality"]').value =
    state.options.quality;
  document.querySelector('[data-option="resolutionScale"]').value =
    state.options.resolutionScale ?? "auto";
  document.querySelector('[data-option="fullscreen"]').checked =
    state.options.fullscreen;
  document.querySelector('[data-option="weatherFx"]').checked =
    state.options.weatherFx;
  document.querySelector('[data-option="dayNight"]').checked =
    state.options.dayNight;
}

function composeStats() {
  return _applyLoadout(state.equipment, equipmentCatalog);
}

function updateLoadoutUI() {
  const { selected, merged } = composeStats();
  hud.loadout.innerHTML = `
    <article>
      <h3>${selected.chassis.name}</h3>
      <p>${selected.chassis.description}</p>
      <p class="meta">Rol: ${selected.chassis.role}</p>
    </article>
    <article>
      <h3>${selected.tires.name}</h3>
      <p>${selected.tires.description}</p>
    </article>
    <article>
      <h3>${selected.rig.name}</h3>
      <p>${selected.rig.description}</p>
    </article>
    <article class="stats-card">
      <h3>Resumen</h3>
      <p>Velocidad x${merged.speed.toFixed(2)}</p>
      <p>Manejo x${merged.handling.toFixed(2)}</p>
      <p>Blindaje x${merged.armor.toFixed(2)}</p>
      <p>Autonomia x${merged.reserve.toFixed(2)}</p>
      <p>Eficiencia x${merged.efficiency.toFixed(2)}</p>
      <p>Municion x${merged.ammoCap.toFixed(2)}</p>
    </article>
  `;
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
      resolutionRatio[state.options.resolutionScale] ??
        qualityRatio[state.options.quality],
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
  world.run = _createRunState(saveData, biome, biomeCatalog, objectiveCatalog, equipmentCatalog);
  world.environment.biome = biome;
  world.environment.targetWeather = biome === "city" ? "smog" : "clear";
  world.environment.weather = "clear";
  world.environment.weatherStrength = 0;
  world.environment.weatherTimer = 18;
  clearPools();
  syncBiomePresentation();
stopSkidSound(world);
  updateHUD();
}

function clearPools() {
  clearAllPools(world);
}

function getUrbanBlend(run = world.run) {
  if (run?.startedInCity) return 1;
  if (!run) return world.environment.biome === "city" ? 1 : 0;

  const transitionStart = biomeCatalog.desert.checkpointKm - 2.4;
  const transitionEnd = biomeCatalog.desert.checkpointKm + 4.4;
  return THREE.MathUtils.clamp(
    (run.distance - transitionStart) / (transitionEnd - transitionStart),
    0,
    1,
  );
}

function setMaterialBlend(material, blend) {
  const clamped = THREE.MathUtils.clamp(blend, 0, 1);
  if (material.userData.baseOpacity == null) {
    material.userData.baseOpacity = material.opacity ?? 1;
  }
  material.transparent = clamped < 0.999;
  material.opacity = material.userData.baseOpacity * clamped;
  material.depthWrite = clamped > 0.35;
}

function prepareFadableObject(node) {
  node.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (!material) continue;
      if (material.userData.baseOpacity == null) {
        material.userData.baseOpacity = material.opacity ?? 1;
      }
    }
  });
}

function setNodeBlend(node, blend) {
  const clamped = THREE.MathUtils.clamp(blend, 0, 1);
  node.visible = clamped > 0.015;
  node.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (material) setMaterialBlend(material, clamped);
    }
  });
}

function syncBiomePresentation() {
  const urbanBlend = getUrbanBlend();
  const desertBlend = 1 - urbanBlend;

  for (const prop of world.roadsideProps) setNodeBlend(prop, desertBlend);
  for (const prop of world.roadsideBackdrop) setNodeBlend(prop, desertBlend);
  for (const prop of world.dunes) setNodeBlend(prop, desertBlend);
  for (const prop of world.boulders) setNodeBlend(prop, desertBlend);
  for (const prop of world.cityProps) setNodeBlend(prop, urbanBlend);
  for (const prop of world.cityBackdrop) setNodeBlend(prop, urbanBlend);

  if (world.materials.ground) {
    world.materials.ground.color
      .copy(tempColorA.set("#d48a4f"))
      .lerp(tempColorB.set("#8a8a91"), urbanBlend); // Más claro que #5c5c62
  }
  if (world.materials.road) {
    world.materials.road.color
      .copy(tempColorA.set("#f6f1e8"))
      .lerp(tempColorB.set("#dce1e8"), urbanBlend); // Más claro que #c7ccd2
  }
  if (world.materials.shoulder) {
    world.materials.shoulder.color
      .copy(tempColorA.set("#dfaa74"))
      .lerp(tempColorB.set("#a1a7b0"), urbanBlend); // Más claro que #777d86
  }
}

function startRun(biome = "desert", forceReset = false) {
  if (biome === "city" && !state.unlocks.city) biome = "desert";
  if (
    forceReset ||
    !world.run ||
    world.route === GameRoute.GAMEOVER ||
    world.run.biome !== biome
  )
    resetRun(biome);
  setRoute(routeForBiome(biome));
  flashMessage(biome === "city" ? "Distrito urbano cargado" : "Run iniciada");
  initAudio(world);
  updateHUD();
  beep(world, 180, 0.05, "triangle");
}

function endRunToMenu() {
  setRoute(GameRoute.MENU);
  resetRun();
}

function transitionRunToBiome(nextBiome) {
  const run = world.run;
  if (!run || run.biome === nextBiome) return;

  run.biome = nextBiome;
  run.biomeLabel = biomeCatalog[nextBiome].label;
  run.objective = objectiveCatalog[nextBiome].title;
  run.objectiveSummary = objectiveCatalog[nextBiome].summary;
  run.objectiveTarget = biomeCatalog[nextBiome].completionKm;
  run.objectiveProgress = 0;
  run.cityTransitionArmed = false;
  run.cityTransitionDone = true;
  run.invulnerable = Math.max(run.invulnerable, 1.1);
  run.obstacleTimer = 0.9;
  run.pickupTimer = 0.55;

  world.environment.targetWeather = nextBiome === "city" ? "smog" : "clear";
  world.environment.weatherTimer = Math.min(world.environment.weatherTimer, 8);
  setRoute(routeForBiome(nextBiome));
  updateHUD();
}

function finishRun(victory = false) {
  if (!world.run) return;
  registerRunResult(saveData, world.run);
  if (world.run.biome === "city" || victory) {
    unlockCity(saveData);
  }
  saveState();
  hud.summary.textContent = victory
    ? `${world.run.endReason} Recorriste ${world.run.distance.toFixed(1)} km, eliminaste ${world.run.kills} raiders y aseguraste ${world.run.coins} coins.`
    : `${world.run.endReason || "El casco cedio bajo la presion del wasteland."} Recorriste ${world.run.distance.toFixed(1)} km, eliminaste ${world.run.kills} raiders y juntaste ${world.run.coins} coins.`;
  setRoute(GameRoute.GAMEOVER);
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

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - world.lastTime) / 1000, 0.033);
  world.lastTime = now;
  updateEnvironment(dt);

  if (isPlaying()) {
    updateRun(dt);
  } else {
    updateCinematic(dt);
  }

  world.renderer.render(world.scene, world.camera);
}

function updateEnvironment(dt) {
  const env = world.environment;
  const biome = currentBiome();
  const urbanBlend = getUrbanBlend();
  const desertPalette = skyPalette.desert;
  const cityPalette = skyPalette.city;

  if (state.options.dayNight) {
    env.cycle = (env.cycle + dt * 0.012) % 1;
  } else {
    env.cycle = 0.5;
  }

  if (state.options.weatherFx) {
    env.weatherTimer -= dt;
    if (env.weatherTimer <= 0) {
      const nextWeather = pickNextWeather(env.targetWeather);
      env.targetWeather = nextWeather;
      env.weatherTimer = 14 + Math.random() * 10;
      flashMessage(`Clima: ${environmentProfiles[nextWeather].label}`);
    }
  } else {
    env.targetWeather = biome === "city" ? "smog" : "clear";
    env.weatherTimer = 12;
  }

  const targetStrength = env.targetWeather === "clear" ? 0 : 1;
  env.weatherStrength = THREE.MathUtils.lerp(
    env.weatherStrength,
    targetStrength,
    dt * 0.7,
  );
  if (env.weatherStrength < 0.08) {
    env.weather = "clear";
  } else if (env.weatherStrength > 0.92) {
    env.weather = env.targetWeather;
  }

  const profile =
    environmentProfiles[
      env.weatherStrength > 0.5 ? env.targetWeather : env.weather
    ];
  const daylight = Math.max(0.1, Math.sin(env.cycle * Math.PI));
  const phaseLabel = resolveCycleLabel(env.cycle);

  env.bg.copy(
    tempColorA
      .copy(desertPalette.bgNight)
      .lerp(cityPalette.bgNight, urbanBlend),
  );
  env.bg.lerp(
    tempColorB.copy(desertPalette.bgDay).lerp(cityPalette.bgDay, urbanBlend),
    daylight,
  );
  env.fog.copy(
    tempColorA
      .copy(desertPalette.fogNight)
      .lerp(cityPalette.fogNight, urbanBlend),
  );
  env.fog.lerp(
    tempColorB.copy(desertPalette.fogDay).lerp(cityPalette.fogDay, urbanBlend),
    daylight,
  );
  env.bg.lerp(profile.tint, env.weatherStrength * 0.18);
  env.fog.lerp(profile.tint, env.weatherStrength * 0.28);

  world.scene.background.copy(env.bg);
  world.scene.fog.color.copy(env.fog);
  world.scene.fog.density =
    0.005 + (1 - daylight) * 0.003 + profile.fogBoost * env.weatherStrength; // Reducido un poco

  // Actualizar astros
  const sunOpacity = THREE.MathUtils.clamp(daylight * 4 - 0.5, 0, 0.85);
  const moonOpacity = THREE.MathUtils.clamp((1 - daylight) * 3 - 0.5, 0, 0.65);
  const starOpacity = THREE.MathUtils.clamp((1 - daylight) * 2 - 1.0, 0, 0.8);

  if (world.lights.stars) world.lights.stars.material.opacity = starOpacity;

  // Posición orbital simplificada
  const orbitAngle = (env.cycle - 0.25) * Math.PI * 2;
  const orbitRadius = 130;

  // Headlights logic
  if (world.car && world.car.userData.headlights) {
    const lightsOn = daylight < 0.35 || env.weatherStrength > 0.6;
    const targetIntensity = lightsOn ? (biome === "city" ? 4 : 6) : 0;
    world.car.userData.headlights.forEach((light) => {
      light.intensity = THREE.MathUtils.lerp(
        light.intensity,
        targetIntensity,
        dt * 2.5,
      );
      light.color.lerp(
        tempColorC.set(lightsOn && biome === "city" ? "#aaddff" : "#fffdeb"),
        dt,
      );
    });
  }

  if (world.lights.ambient) {
    world.lights.ambient.color.copy(
      tempColorA
        .copy(desertPalette.ambientNight)
        .lerp(cityPalette.ambientNight, urbanBlend),
    );
    world.lights.ambient.color.lerp(
      tempColorB
        .copy(desertPalette.ambientDay)
        .lerp(cityPalette.ambientDay, urbanBlend),
      daylight,
    );
    world.lights.ambient.groundColor.copy(
      tempColorA
        .copy(desertPalette.groundNight)
        .lerp(cityPalette.groundNight, urbanBlend),
    );
    world.lights.ambient.groundColor.lerp(
      tempColorB
        .copy(desertPalette.groundDay)
        .lerp(cityPalette.groundDay, urbanBlend),
      daylight,
    );
    world.lights.ambient.intensity =
      0.45 + daylight * 0.55 - env.weatherStrength * 0.2; // Aumentado
  }

  if (world.lights.sun) {
    const baseIntensity = THREE.MathUtils.lerp(1.5, 1.35, urbanBlend); // Casi la misma que en el desierto
    world.lights.sun.intensity =
      0.2 + daylight * baseIntensity - env.weatherStrength * 0.2; // Aumentado el mínimo a 0.2
    world.lights.sun.position.set(
      Math.cos(env.cycle * Math.PI * 2) * 24,
      8 + daylight * 30,
      10,
    );
    world.lights.sun.color.copy(
      tempColorA
        .set(daylight < 0.3 ? "#ffb08a" : "#fff0d4")
        .lerp(
          tempColorB.set(daylight < 0.3 ? "#d0c9d9" : "#f0f2f7"), // Colores de ciudad más claros
          urbanBlend,
        ),
    );
  }

  for (const band of world.dustBands) {
    band.material.opacity = Math.min(
      0.035 + env.weatherStrength * 0.12 + (1 - daylight) * 0.015,
      0.08,
    );
  }

  // Heat shimmer fades at night or in non-desert biomes
  const isDesert = currentBiome() === "desert";
  const shimmerTarget = isDesert ? daylight * 0.04 : 0.005;
  for (const shim of world.heatShimmer) {
    shim.material.opacity += (shimmerTarget - shim.material.opacity) * dt * 0.5;
  }

  atmosphere.style.background = `
    linear-gradient(180deg, rgba(0, 0, 0, ${0.1 + env.weatherStrength * 0.15}), rgba(7, 4, 3, ${0.25 + (1 - daylight) * 0.2})),
    radial-gradient(circle at 50% 10%, rgba(180, 110, 60, ${0.04 + daylight * 0.08}), transparent 32%)
  `;

  if (world.run) {
    world.run.biomeLabel = biomeCatalog[world.run.biome].label;
    world.run.weatherLabel = profile.label;
    world.run.cycleLabel = phaseLabel;
    world.run.weatherFuelUse = profile.fuelUse ?? 1;
    world.run.weatherHandling = profile.handling;
    world.run.weatherThreat = profile.threatBoost * env.weatherStrength;
  }

  env.biome = biome;
  env.weatherLabel = profile.label;
  env.cycleLabel = phaseLabel;
  syncBiomePresentation();
}

function pickNextWeather(current) {
  const keys = Object.keys(environmentProfiles)
    .filter((key) => key !== current)
    .filter((key) => (getUrbanBlend() > 0.6 ? key !== "dust" : key !== "smog"));
  return keys[Math.floor(Math.random() * keys.length)];
}

function resolveCycleLabel(cycle) {
  if (cycle < 0.18 || cycle > 0.82) return "Night";
  if (cycle < 0.34) return "Dawn";
  if (cycle < 0.66) return "Day";
  return "Dusk";
}

function updateCinematic(dt) {
  const t = performance.now() * 0.00015;
  const menuPose = world.route === GameRoute.MENU;
  const targetCarX = menuPose ? 4.2 : 0;
  const targetLookX = menuPose ? 3.1 : 0;
  const cameraBaseX = menuPose ? 6.8 : 0;
  const cameraBaseY = menuPose ? 4.9 : 5.2;
  const cameraBaseZ = menuPose ? -8.8 : -10.5;

  world.camera.position.x = cameraBaseX + Math.sin(t) * (menuPose ? 0.9 : 2.5);
  world.camera.position.y = cameraBaseY + Math.sin(t * 0.7) * 0.2;
  world.camera.position.z = cameraBaseZ;
  world.camera.lookAt(targetLookX, 1.2, 8);
  world.car.position.x += (targetCarX - world.car.position.x) * dt * 4;
  world.car.rotation.z += (0 - world.car.rotation.z) * dt * 5;
  world.car.rotation.y = Math.sin(t * 2.4) * 0.04;
  moveWorld(dt, 0.35);
}

function updateRun(dt) {
  const run = world.run;

  // ── 1. Raw inputs ─────────────────────────────────────────────────────────
  // Convención jugable: input a la derecha debe mover el coche a la derecha en pantalla.
  let rawSteer = (Number(world.input.left) - Number(world.input.right)) * 0.72;
  let rawThrottle = world.input.accel ? 1 : 0;
  let rawBrake = world.input.brake ? 1 : 0;

  const gpad = navigator.getGamepads?.()?.[0] ?? null;
  if (gpad) {
    const gx = gpad.axes?.[0] ?? 0;
    const gy = gpad.axes?.[1] ?? 0;
    const lt = gpad.buttons?.[6]?.value ?? 0; // left trigger  = brake
    const rt = gpad.buttons?.[7]?.value ?? 0; // right trigger = accel
    if (rawSteer === 0 && Math.abs(gx) > 0.14)
      rawSteer = THREE.MathUtils.clamp(-gx, -1, 1);
    if (!world.input.accel && rt > 0.08) rawThrottle = rt;
    if (!world.input.brake && lt > 0.08) rawBrake = lt;
    if (world.input.touch.active) rawSteer = -world.input.touch.dx;
  }
  if (world.input.touch.active) {
    rawSteer = -world.input.touch.dx;
    rawThrottle = Math.max(rawThrottle, Math.max(0, -world.input.touch.dy));
    rawBrake = Math.max(rawBrake, Math.max(0, world.input.touch.dy));
  }

  // ── 2. Smooth inputs ──────────────────────────────────────────────────────
  const steerLag = 1 - Math.exp(-dt * (run.grounded ? 12 : 7));
  const throttleLag = 1 - Math.exp(-dt * 5);
  run.steerSmoothed = THREE.MathUtils.lerp(
    run.steerSmoothed,
    rawSteer,
    steerLag,
  );
  run.throttleSmoothed = THREE.MathUtils.lerp(
    run.throttleSmoothed,
    rawThrottle - rawBrake,
    throttleLag,
  );

  // ── 3. Speed with accel/brake ─────────────────────────────────────────────
  // speedFactor: 0.45 = coasting, 1.0 = full gas, 0.1 = braking
  const throttleInput = run.throttleSmoothed; // -1…1
  const targetFactor =
    throttleInput >= 0
      ? THREE.MathUtils.lerp(0.58, 1.0, throttleInput)
      : THREE.MathUtils.lerp(0.58, 0.24, -throttleInput);
  run.speedFactor = THREE.MathUtils.lerp(
    run.speedFactor,
    targetFactor,
    1 - Math.exp(-dt * 2),
  );
  run.speed = run.baseSpeed * run.speedFactor;

  // ── 4. Traction circle / grip ─────────────────────────────────────────────
  const weatherHandling = run.weatherHandling ?? 1;
  const baseTraction =
    run.traction *
    (0.96 + 0.04 * (1 - (run.threat / 100) * 0.35)) *
    weatherHandling;
  const steer = run.steerSmoothed * run.handling * weatherHandling;

  // Menos castigo por girar: el coche debe ser estable antes de empezar a derrapar.
  const lateralLoad =
    Math.abs(run.steerSmoothed) * (0.55 + run.speedFactor * 0.45);
  const targetGrip = THREE.MathUtils.clamp(1.0 - lateralLoad * 0.26, 0.56, 1.0);
  run.gripFactor = THREE.MathUtils.lerp(
    run.gripFactor,
    targetGrip,
    1 - Math.exp(-dt * 8),
  );

  const wasSkidding = run.skidding;
  run.skidding =
    run.gripFactor < 0.58 && Math.abs(run.lateralVel) > 1.8 && run.grounded;

  if (run.skidding && !wasSkidding) playSkidSound(world);
  if (!run.skidding && wasSkidding) stopSkidSound(world);

  // lateral physics with grip applied
  const centering = run.x * 1.35;
  const cornering = 3.35;
  const traction = baseTraction * run.gripFactor;
  const laneHalfWidth = 5.2;
  const lateralDamping = run.skidding ? 1.15 : 2.85;
  run.lateralVel +=
    (steer * cornering * 4.8 * traction -
      centering -
      run.lateralVel * lateralDamping) *
    dt;
  run.lateralVel *= Math.max(0, 1 - dt * (run.skidding ? 0.06 : 0.16));
  run.lateralVel = THREE.MathUtils.clamp(run.lateralVel, -7.5, 7.5);
  run.x += run.lateralVel * dt;
  // Sin esto, x queda clavada en el borde pero lateralVel sigue “empujando” hacia fuera: el resorte de
  // centrado acumula y luego dispara el coche hacia el centro (rebote / “pega vuelta”).
  if (run.x <= -laneHalfWidth) {
    run.x = -laneHalfWidth;
    run.lateralVel = Math.max(0, run.lateralVel);
  } else if (run.x >= laneHalfWidth) {
    run.x = laneHalfWidth;
    run.lateralVel = Math.min(0, run.lateralVel);
  }

  // ── 5. Jump / vertical ────────────────────────────────────────────────────
  if (!run.grounded) {
    run.yVelocity -= 22 * dt;
    run.y += run.yVelocity * dt;
    if (run.y <= 0) {
      run.y = 0;
      run.yVelocity = 0;
      run.grounded = true;
      // landing thump
      run.suspensionVel = -4.8;
      beep(world, 58, 0.06, "sine");
      if (run.skidding) spawnDustBurst(world,6);
    }
  }

  // ── 6. Suspension spring ──────────────────────────────────────────────────
  if (run.grounded) {
    const suspStiffness = 180;
    const suspDamp = 18;
    run.suspensionVel +=
      (-suspStiffness * run.suspensionY - suspDamp * run.suspensionVel) * dt;
    run.suspensionY += run.suspensionVel * dt;
    run.suspensionY = THREE.MathUtils.clamp(run.suspensionY, -0.18, 0.08);
    // pitch from accel/brake
    const targetPitch = throttleInput * -0.028 + (run.skidding ? 0.012 : 0);
    run.pitchAngle = THREE.MathUtils.lerp(
      run.pitchAngle,
      targetPitch,
      1 - Math.exp(-dt * 6),
    );
  } else {
    run.pitchAngle = THREE.MathUtils.lerp(
      run.pitchAngle,
      -run.yVelocity * 0.018,
      dt * 5,
    );
  }

  // ── 7. Hazards ────────────────────────────────────────────────────────────
  run.distance += run.speed * dt * 0.1;
  run.invulnerable = Math.max(0, run.invulnerable - dt);
  run.threat = THREE.MathUtils.clamp(
    run.distance * 4.5 + (run.weatherThreat ?? 0) + run.kills * 2.5,
    0,
    100,
  );

  const progression = _updateRunProgression(run, biomeCatalog);
  if (progression.shouldEnterCity) {
    unlockCity(saveData);
    saveState();
    flashMessage("Entrando en la ciudad");
    transitionRunToBiome("city");
    return;
  }

  // ── 8. Car visual ─────────────────────────────────────────────────────────
  // El coche es el que se desplaza en X; la cámara no sigue run.x (antes la escena parecía moverse).
  world.car.position.x = run.x;
  const roadShake = run.grounded
    ? (Math.random() - 0.5) * 0.012 * run.speed * 0.045
    : 0;
  world.car.position.y = 0.1 + run.y + run.suspensionY + roadShake;

  // roll (lean into corners) + drift slide - limitado para evitar vuelco visual
  const driftAngle = run.skidding ? run.lateralVel * 0.04 : 0;
  const targetRollZ = THREE.MathUtils.clamp(
    -steer * 0.055 - run.lateralVel * 0.022 - driftAngle,
    -0.18,
    0.18,
  );
  world.car.rotation.z = THREE.MathUtils.lerp(
    world.car.rotation.z,
    targetRollZ,
    dt * 3,
  );

  // pitch from suspension + accel
  world.car.rotation.x = THREE.MathUtils.lerp(
    world.car.rotation.x,
    run.grounded
      ? run.pitchAngle + (Math.random() - 0.5) * 0.004 * run.traction
      : -run.yVelocity * 0.018,
    dt * 3,
  );

  // yaw drift - limitado para evitar giros excesivos
  const targetYaw = THREE.MathUtils.clamp(
    steer * 0.03 +
      run.lateralVel * 0.012 +
      (run.skidding ? run.lateralVel * 0.018 : 0),
    -0.22,
    0.22,
  );
  world.car.rotation.y = THREE.MathUtils.lerp(
    world.car.rotation.y,
    targetYaw,
    dt * 4,
  );

  // ── 9. Wheels ─────────────────────────────────────────────────────────────
  for (const wheel of world.car.userData.wheels) {
    if (wheel.userData.roll) {
      wheel.userData.roll.rotation.x -= dt * run.speed * 1.1;
    } else {
      wheel.rotation.x -= dt * run.speed * 1.1;
    }
    if (wheel.userData.steerable) {
      const steerAngle = run.steerSmoothed * (0.42 + run.gripFactor * 0.12);
      wheel.rotation.y = THREE.MathUtils.lerp(
        wheel.rotation.y,
        steerAngle,
        dt * 6,
      );
    }
  }

  // ── 10. Particles ─────────────────────────────────────────────────────────
  const dustRate = run.grounded
    ? run.speed * 0.35 + (run.skidding ? run.speed * 1.2 : 0)
    : 0;
  if (Math.random() < dt * dustRate) spawnDustMote(world);
  if (run.skidding && Math.random() < dt * 12) spawnSkidMark(world);

  // Speed streak / jet stream
  if (run.speedFactor > 0.85 && Math.random() < dt * 15) {
    const streak = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 2 + Math.random() * 4),
      new THREE.MeshBasicMaterial({
        color: "#fff",
        transparent: true,
        opacity: 0.3,
      }),
    );
    streak.position.set(
      run.x + (Math.random() - 0.5) * 3,
      run.y + 0.5 + (Math.random() - 0.5) * 1.5,
      5 + Math.random() * 5,
    );
    world.scene.add(streak);
    world.particles.push(streak);
    streak.userData = { vz: -80, life: 0.15, fade: 5 };
  }

  // ── 11. Engine audio ──────────────────────────────────────────────────────
  updateEngineSound(world, state, run.speedFactor, run.skidding);

  // ── 11.5 Visual Lights Update (Brake lights) ──────────────────────────────
  if (world.car && world.car.userData.brakeLights) {
    const isBraking = world.input.brake || run.throttleSmoothed < -0.1;
    const targetBrakeIntensity = isBraking ? 15 : 0.5; // Faint glow when not braking
    world.car.userData.brakeLights.forEach((light) => {
      light.intensity = THREE.MathUtils.lerp(
        light.intensity,
        targetBrakeIntensity,
        dt * 10,
      );
    });
  }

  // ── 12. Air displacement (interaction with environmental debris) ──────────
  world.particles.forEach((p) => {
    if (p.userData.vx !== undefined) {
      const dx = p.position.x - run.x;
      const dz = p.position.z - 1.2;
      const distSq = dx * dx + dz * dz;
      if (distSq < 16) {
        const force = (1 - Math.sqrt(distSq) / 4) * dt * run.speed * 0.5;
        p.userData.vx += (dx / Math.sqrt(distSq)) * force;
        p.userData.vy += force * 0.5;
        p.userData.vz += force * 0.2;
      }
    }
  });

  // ── 13. Gamepad rumble on skid / impact ───────────────────────────────────
  if (gpad?.vibrationActuator && run.skidding) {
    try {
      void gpad.vibrationActuator.playEffect("dual-rumble", {
        duration: 80,
        strongMagnitude: 0.08,
        weakMagnitude: 0.22,
      });
    } catch (e) {
      console.warn("Gamepad vibration not supported:", e.message);
    }
  }

  // ── 13. Camera ────────────────────────────────────────────────────────────
  // Cámara centrada en el eje X del mapa: solo un leve sway por velocidad lateral (no seguir run.x).
  const camSwayXTarget = run.lateralVel * 0.05;
  run.camSwayXSmoothed = THREE.MathUtils.lerp(
    run.camSwayXSmoothed,
    camSwayXTarget,
    1 - Math.exp(-dt * 4),
  );
  const camSwayY = roadShake * 3 + run.suspensionY * 0.25;
  const camFovTarget = run.skidding ? 61.2 : 60;
  world.camera.fov = THREE.MathUtils.lerp(
    world.camera.fov,
    camFovTarget,
    dt * 2,
  );
  world.camera.updateProjectionMatrix();
  world.camera.position.x +=
    (run.camSwayXSmoothed - world.camera.position.x) * dt * 2.5;
  world.camera.position.y +=
    (5.5 + run.y * 0.35 + camSwayY - world.camera.position.y) * dt * 2.5;
  world.camera.position.z += (-10.5 - world.camera.position.z) * dt * 2.5;

  // Screen shake
  if (shakeTimer > 0) {
    shakeTimer -= dt;
    const shakeAmount = shakeIntensity * (shakeTimer / 0.25);
    world.camera.position.x -= (Math.random() - 0.5) * shakeAmount * 0.4;
    world.camera.position.y -= (Math.random() - 0.5) * shakeAmount * 0.3;
    if (shakeTimer <= 0) shakeIntensity = 0;
  }

  world.camera.lookAt(run.camSwayXSmoothed * 0.15, 1.18 + run.y * 0.18, 7.4);

  // ── 14. Spawn ─────────────────────────────────────────────────────────────
  run.obstacleTimer -= dt;
  run.pickupTimer -= dt;
  run.propTimer = (run.propTimer || 0) - dt;
  if (run.propTimer <= 0) {
    spawnProp();
    run.propTimer = Math.random() * 0.06;
  }
  if (run.obstacleTimer <= 0) {
    spawnObstacle();
    run.obstacleTimer =
      Math.max(0.18, 0.55 - run.threat * 0.0025) + Math.random() * 0.38;
  }
  
  run.overheadTimer = (run.overheadTimer || 0) - dt;
  if (run.overheadTimer <= 0) {
    spawnOverhead();
    run.overheadTimer = 4 + Math.random() * 6;
  }

  if (run.pickupTimer <= 0) {
    spawnPickup();
    run.pickupTimer =
      Math.max(0.6, 1.4 - run.threat * 0.003) + Math.random() * 1.2;
  }

  if (Math.random() < dt * 8.5) {
    spawnAtmosphericDebris(world, currentBiome());
  }

  updateEntities(dt);
  moveWorld(dt, 1);
  if (_updateRunProgression(run, biomeCatalog).completedRun) {
    run.endReason = "Atravesaste el distrito y escapaste del cerco.";
    finishRun(true);
    return;
  }
  updateHUD();
}

function moveWorld(dt, speedFactor) {
  const flow = world.run ? world.run.speed : 18;
  const amount = flow * dt * speedFactor;

  if (world.propPool) {
    for (let i = world.propPool.length - 1; i >= 0; i--) {
      const prop = world.propPool[i];
      prop.position.z -= amount * (prop.userData.speedFactor ?? 1);
      if (prop.position.z < -42) {
        world.scene.remove(prop);
        world.propPool.splice(i, 1);
      }
    }
  }

  if (world.overheadPool) {
    for (let i = world.overheadPool.length - 1; i >= 0; i--) {
      const oh = world.overheadPool[i];
      oh.position.z -= amount * (oh.userData.speedFactor ?? 1);
      if (oh.position.z < -42) {
        world.scene.remove(oh);
        world.overheadPool.splice(i, 1);
      }
    }
  }

  if (world.roadTexture) {
    world.roadTexture.offset.y -= amount / 30;
    if (world.roadBumpTexture) world.roadBumpTexture.offset.y -= amount / 30;
    if (world.roadRoughnessTexture)
      world.roadRoughnessTexture.offset.y -= amount / 30;
  }
  if (world.terrainTexture) {
    world.terrainTexture.offset.y -= amount / 30;
    if (world.terrainBumpTexture)
      world.terrainBumpTexture.offset.y -= amount / 30;
    if (world.terrainRoughnessTexture)
      world.terrainRoughnessTexture.offset.y -= amount / 30;
  }
  if (world.shoulderTexture) {
    world.shoulderTexture.offset.y -= amount / 30;
    if (world.shoulderBumpTexture)
      world.shoulderBumpTexture.offset.y -= amount / 30;
    if (world.shoulderRoughnessTexture)
      world.shoulderRoughnessTexture.offset.y -= amount / 30;
  }

  for (const band of world.dustBands) {
    band.position.z -= amount * 0.8;
    band.position.x += Math.sin(performance.now() * 0.0003 + band.userData.offset) * 0.02;
    if (band.position.z < -20) band.position.z += 320;
  }

  for (const shim of world.heatShimmer) {
    shim.position.z -= amount * (shim.userData.speedFactor ?? 1);
    // Gentle wobble for heat distortion
    shim.userData.wobble += dt;
    shim.position.y = shim.userData.baseY + Math.sin(shim.userData.wobble * 0.5) * 0.3 + Math.cos(shim.userData.wobble * 0.7) * 0.2;
    shim.position.x += Math.sin(shim.userData.wobble * 0.3) * dt * 1.5;
    if (shim.position.z < -20) {
      shim.position.z += 320;
      shim.position.y = shim.userData.baseY;
      shim.userData.speedFactor = 0.6 + Math.random() * 0.4;
    }
  }

  for (const prop of world.roadsideProps) {
    prop.position.z -= amount * (prop.userData.speedFactor ?? 1);
    if (prop.position.z < -42) {
      recycleRoadsideProp(prop);
    }
  }

  for (const backdrop of world.roadsideBackdrop) {
    backdrop.position.z -= amount * backdrop.userData.speedFactor;
    if (backdrop.position.z < -58) {
      recycleBackdrop(backdrop);
    }
  }

  for (const prop of world.cityProps) {
    prop.position.z -= amount * (prop.userData.speedFactor ?? 1);
    if (prop.position.z < -42) {
      recycleCityRoadsideProp(prop);
    }
    // Atmospheric flicker for urban lights
    if (Math.random() < 0.015) {
      prop.traverse((c) => {
        if (c.material && c.material.emissive) {
          c.material.emissiveIntensity = Math.random() > 0.2 ? 0.45 : 0.05;
        }
      });
    }
  }

  for (const backdrop of world.cityBackdrop) {
    backdrop.position.z -= amount * backdrop.userData.speedFactor;
    if (backdrop.position.z < -68) {
      recycleCityBackdrop(backdrop);
    }
  }

  for (const dune of world.dunes) {
    dune.position.z -= amount;
    if (dune.position.z < -40) {
      recycleEnvironmentObject(dune, false, 10, 80, 240, 300);
    }
  }

  for (const boulder of world.boulders) {
    boulder.position.z -= amount;
    if (boulder.position.z < -40) {
      recycleEnvironmentObject(boulder, false, 10, 85, 240, 320);
    }
  }

  for (const far of world.farBackdrop) {
    far.position.z -= amount * far.userData.speedFactor;
    if (far.position.z < -100) {
      recycleFarBackdrop(far);
    }
  }

  for (const detail of world.roadDetails) {
    detail.position.z -= amount;
    if (detail.position.z < -20) {
      recycleRoadDetail(detail);
    }
  }
}

function recycleEnvironmentObject(obj, initial, minX, maxX, minZ, maxZ) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const x = side * (minX + Math.random() * (maxX - minX));
  const z = minZ + Math.random() * (maxZ - minZ);

  if (obj.userData && obj.userData.isDune) {
    obj.position.set(x, obj.userData.baseY, z);
    obj.rotation.y = Math.random() * Math.PI * 2;
    obj.scale.set(
      1 + Math.random() * 1.5,
      0.6 + Math.random() * 0.8,
      1 + Math.random() * 1.5,
    );
  } else {
    obj.position.set(x, 0, z);
    obj.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );
  }
}

function createFarBackdropElement(i) {
  const root = new THREE.Group();
  const biome = currentBiome();

  if (biome === "desert") {
    // Vary between warm browns and reddish rock
    const hue = 0.05 + Math.random() * 0.04;
    const sat = 0.15 + Math.random() * 0.25;
    const light = 0.2 + Math.random() * 0.2;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, sat, light),
      roughness: 1.0,
    });
    // 2-4 mesas per backdrop group for more density
    const mesaCount = 2 + Math.floor(Math.random() * 3);
    for (let m = 0; m < mesaCount; m++) {
      const h = 50 + Math.random() * 70;
      const w = 60 + Math.random() * 180;
      const sides = 5 + Math.floor(Math.random() * 5);
      const geo = new THREE.CylinderGeometry(w * 0.55, w, h, sides, 4);
      const pos = geo.attributes.position;
      // Subtle horizontal strata via vertex perturbation
      for (let j = 0; j < pos.count; j++) {
        const y = pos.getY(j);
        const x = pos.getX(j);
        const z = pos.getZ(j);
        const len = Math.sqrt(x * x + z * z) || 1;
        const strata = Math.sin(y * 0.8) * 2.5 + Math.sin(y * 2.2) * 1.2 + Math.cos(y * 3.5) * 0.6;
        pos.setX(j, x + (x / len) * strata);
        pos.setZ(j, z + (z / len) * strata);
      }
      geo.computeVertexNormals();
      const mesa = new THREE.Mesh(geo, mat);
      mesa.position.set(
        (Math.random() - 0.5) * 40,
        h * 0.5 - 8,
        (Math.random() - 0.5) * 30,
      );
      mesa.rotation.y = Math.random() * Math.PI;
      mesa.scale.y = 0.12 + Math.random() * 0.22;
      root.add(mesa);
    }
  } else {
    const mat = new THREE.MeshStandardMaterial({
      color: "#16181d",
      roughness: 0.95,
    });
    const windowLit = new THREE.MeshStandardMaterial({
      color: "#ffeebb",
      emissive: "#ffcc66",
      emissiveIntensity: 0.6,
    });
    for (let j = 0; j < 6; j++) {
      const h = 80 + Math.random() * 150;
      const w = 20 + Math.random() * 30;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      b.position.set(
        (j - 3) * 35 + (Math.random() - 0.5) * 15,
        h * 0.5 - 20,
        (Math.random() - 0.5) * 30,
      );
      root.add(b);
      // A few lit windows on far buildings
      if (j % 3 === 0) {
        const windowBand = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, 0.4, w * 1.01), windowLit);
        windowBand.position.copy(b.position);
        windowBand.position.y += (Math.random() - 0.3) * h * 0.4;
        root.add(windowBand);
      }
    }
  }

  root.userData.speedFactor = 0.008 + Math.random() * 0.005;
  recycleFarBackdrop(root, true);
  return root;
}

function recycleFarBackdrop(root, initial = false) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const z = initial ? Math.random() * 800 : 800 + Math.random() * 200;
  root.position.set(side * (250 + Math.random() * 150), -10, z);
}

function createRoadDetail() {
  const type = Math.random();
  let mesh;
  if (type > 0.96) {
    // Animal carcass / roadkill (small bump on road)
    const carcGroup = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: "#3d3028", roughness: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.25 + Math.random() * 0.2, 0.06, 0.4 + Math.random() * 0.4), furMat);
    body.position.y = 0.06;
    body.rotation.y = Math.random() * Math.PI;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.3, 4), furMat);
    tail.position.set(0, 0.08, 0.3);
    tail.rotation.x = -0.5;
    carcGroup.add(body, tail);
    mesh = carcGroup;
    mesh.userData.is3D = true;
  } else if (type > 0.94) {
    // Pothole depression (3D indentation on road)
    const potGroup = new THREE.Group();
    const darkFill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3 + Math.random() * 0.5, 0.2 + Math.random() * 0.4, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: "#0a0807", roughness: 1, bumpScale: 0.5 }),
    );
    darkFill.rotation.x = Math.PI;
    darkFill.position.y = -0.02;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.3 + Math.random() * 0.5, 0.06, 4, 16),
      new THREE.MeshStandardMaterial({ color: "#2a2420", roughness: 0.95 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    potGroup.add(darkFill, rim);
    mesh = potGroup;
    mesh.userData.is3D = true;
  } else if (type > 0.88) {
    // Highway Reflector (Stud)
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.08, 0.2),
      new THREE.MeshStandardMaterial({ color: "#777", metalness: 0.8 }),
    );
    const reflector = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.05, 0.05),
      new THREE.MeshStandardMaterial({
        color: "#fff",
        emissive: "#fff",
        emissiveIntensity: 0.8,
      }),
    );
    reflector.position.set(0, 0.04, 0.08);
    group.add(body, reflector);
    mesh = group;
    mesh.userData.isReflector = true;
  } else if (type > 0.78) {
    // Manhole cover (round metal plate in road)
    const coverGroup = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45 + Math.random() * 0.35, 0.45 + Math.random() * 0.35, 0.04, 20),
      new THREE.MeshStandardMaterial({ color: "#4a4d52", metalness: 0.7, roughness: 0.5 }),
    );
    disc.position.y = 0.02;
    const innerDetail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.045, 12),
      new THREE.MeshStandardMaterial({ color: "#333", metalness: 0.8, roughness: 0.3 }),
    );
    innerDetail.position.y = 0.04;
    const bar1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.35 + Math.random() * 0.3, 0.015, 0.05),
      new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.6 }),
    );
    bar1.position.y = 0.06;
    const bar2 = bar1.clone();
    bar2.rotation.y = Math.PI / 2;
    coverGroup.add(disc, innerDetail, bar1, bar2);
    mesh = coverGroup;
    mesh.userData.is3D = true;
  } else if (type > 0.8) {
    // Rusted Metal Plate
    const mat = new THREE.MeshStandardMaterial({ color: "#3a2a22", metalness: 0.8, roughness: 0.9 });
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2 + Math.random(), 0.04, 1.2 + Math.random()), mat);
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.userData.is3D = true;
  } else if (type > 0.7) {
    // Tire Shred / Debris
    const mat = new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.9 });
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8 + Math.random(), 0.1, 0.2 + Math.random() * 0.3), mat);
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.userData.is3D = true;
  } else {
    const mat = new THREE.MeshStandardMaterial({
      color: "#111",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      roughness: 1.0,
    });
    if (type > 0.45) {
      // Crack
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4 + Math.random() * 0.6, 2 + Math.random() * 3),
        mat,
      );
    } else if (type > 0.2) {
      // Oil stain
      mesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.5 + Math.random() * 0.5, 8),
        mat,
      );
    } else {
      // Sand patch
      mat.color.set("#b08d6a");
      mat.opacity = 0.4;
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5 + Math.random(), 1 + Math.random()),
        mat,
      );
    }
    mesh.rotation.x = -Math.PI / 2;
  }
  mesh.position.y = mesh.userData.is3D ? 0.08 : 0.05;
  mesh.userData.speedFactor = 1.0;
  recycleRoadDetail(mesh, true);
  return mesh;
}

function recycleRoadDetail(mesh, initial = false) {
  const z = initial ? Math.random() * 150 : 150 + Math.random() * 50;
  if (mesh.userData.isReflector) {
    mesh.position.set(0, 0.045, z);
    mesh.rotation.set(0, 0, 0);
  } else if (mesh.userData.is3D) {
    mesh.position.set((Math.random() - 0.5) * 8.5, 0.08, z);
    mesh.rotation.set(0, Math.random() * Math.PI, 0);
  } else {
    mesh.position.set((Math.random() - 0.5) * 8.5, 0.045, z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
  }
}



function createTerrainTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext("2d");

  // Base colors
  ctx.fillStyle = "#c2834b";
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = "#e6e6e6"; // Mostly rough
  rCtx.fillRect(0, 0, size, size);

  // Fractal noise for terrain dirt/sand
  for (let layer = 0; layer < 4; layer++) {
    const scale = Math.pow(2, layer);
    const count = 15000 * scale;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = (2 + Math.random() * 5) / scale;
      const h = (2 + Math.random() * 5) / scale;

      const val = Math.random();
      const a = 0.05 + val * 0.1;

      ctx.fillStyle = `rgba(${120 + val * 100}, ${70 + val * 80}, ${30 + val * 60}, ${a})`;
      ctx.fillRect(x, y, w, h);

      const bv = Math.floor(80 + val * 100);
      bCtx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, ${0.3 + a})`;
      bCtx.fillRect(x, y, w, h);

      // Random pebbles/rocks make spots less rough (shinier) or more rough
      if (val > 0.9) {
        rCtx.fillStyle = `rgba(150, 150, 150, 0.8)`;
        rCtx.fillRect(x, y, w, h);
      }
    }
  }

  // Dune waves (wind ripples)
  for (let w = 0; w < 18; w += 1) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const alpha = 0.1 + Math.random() * 0.15;
    ctx.strokeStyle = `rgba(60, 40, 20, ${alpha})`;
    ctx.lineWidth = 2 + Math.random() * 4;
    bCtx.strokeStyle = `rgba(30, 30, 30, ${0.5 + Math.random() * 0.3})`;
    bCtx.lineWidth = 3 + Math.random() * 5;

    ctx.beginPath();
    bCtx.beginPath();
    for (let s = 0; s < 30; s += 1) {
      const ang = s * 0.2 + w;
      const r = 10 + s * 4;
      const px = sx + Math.cos(ang) * r;
      const py = sy + Math.sin(ang * 0.5) * r * 0.5;
      if (s === 0) {
        ctx.moveTo(px, py);
        bCtx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
        bCtx.lineTo(px, py);
      }
    }
    ctx.stroke();
    bCtx.stroke();
  }

  // Cracked earth / dried mud polygons (desolate ground)
  ctx.strokeStyle = "rgba(30, 20, 10, 0.55)";
  ctx.lineWidth = 1.5;
  bCtx.strokeStyle = "rgba(15, 15, 15, 0.7)";
  bCtx.lineWidth = 2;
  rCtx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  rCtx.lineWidth = 1;
  for (let c = 0; c < 25; c++) {
    const cx = 50 + Math.random() * (size - 100);
    const cy = 50 + Math.random() * (size - 100);
    const segments = 5 + Math.floor(Math.random() * 6);
    ctx.beginPath();
    bCtx.beginPath();
    rCtx.beginPath();
    for (let s = 0; s <= segments; s++) {
      const ang = (s / segments) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 15 + Math.random() * 50;
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist;
      if (s === 0) {
        ctx.moveTo(px, py);
        bCtx.moveTo(px, py);
        rCtx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
        bCtx.lineTo(px, py);
        rCtx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.stroke();
    bCtx.stroke();
    rCtx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  return { map, bumpMap, roughnessMap };
}

function createShoulderTexture() {
  const sizeX = 256;
  const sizeY = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = sizeX;
  canvas.height = sizeY;
  const ctx = canvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = sizeX;
  bumpCanvas.height = sizeY;
  const bCtx = bumpCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = sizeX;
  roughCanvas.height = sizeY;
  const rCtx = roughCanvas.getContext("2d");

  // Transition from road edge to dirt
  const edge = ctx.createLinearGradient(0, 0, sizeX, 0);
  edge.addColorStop(0, "#8a6344");
  edge.addColorStop(0.3, "#bd926f");
  edge.addColorStop(0.7, "#d1a784");
  edge.addColorStop(1, "#9e6f4a");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, sizeX, sizeY);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, sizeX, sizeY);

  rCtx.fillStyle = "#e0e0e0";
  rCtx.fillRect(0, 0, sizeX, sizeY);

  // Gravel, dirt, small rocks
  for (let i = 0; i < 3500; i += 1) {
    const isRock = Math.random() > 0.78;
    ctx.fillStyle = isRock
      ? `rgba(60, 50, 40, ${Math.random() * 0.45})`
      : `rgba(255, 230, 200, ${Math.random() * 0.15})`;
    const x = Math.random() * sizeX;
    const y = Math.random() * sizeY;
    const w = 2 + Math.random() * 8;
    const h = 3 + Math.random() * 14;
    ctx.fillRect(x, y, w, h);

    bCtx.fillStyle = isRock
      ? `rgba(180, 180, 180, 0.85)`
      : `rgba(120, 120, 120, 0.5)`;
    bCtx.fillRect(x, y, w, h);

    if (isRock) {
      rCtx.fillStyle = "rgba(100, 100, 100, 0.8)";
      rCtx.fillRect(x, y, w, h);
    }
  }

  // Trash / debris on shoulder (rusty cans, shards)
  for (let t = 0; t < 25; t++) {
    const tx = 20 + Math.random() * (sizeX - 40);
    const ty = Math.random() * sizeY;
    const trashColor = Math.random() > 0.5 ? "rgba(180, 60, 30, 0.55)" : "rgba(140, 140, 130, 0.5)";
    ctx.fillStyle = trashColor;
    ctx.fillRect(tx, ty, 5 + Math.random() * 10, 4 + Math.random() * 14);
    bCtx.fillStyle = "rgba(140, 140, 140, 0.9)";
    bCtx.fillRect(tx, ty, 6 + Math.random() * 10, 5 + Math.random() * 14);
  }

  // Broken glass/reflector fragments (sparkly white bits)
  for (let g = 0; g < 50; g++) {
    const gx = 30 + Math.random() * (sizeX - 60);
    const gy = Math.random() * sizeY;
    ctx.fillStyle = "rgba(255, 255, 240, 0.3)";
    ctx.fillRect(gx, gy, 1 + Math.random() * 3, 1 + Math.random() * 3);
    rCtx.fillStyle = "rgba(40, 40, 40, 0.9)";
    rCtx.fillRect(gx, gy, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }

  // Faint tyre tracks leaving the road
  ctx.fillStyle = "rgba(20, 15, 10, 0.15)";
  bCtx.fillStyle = "rgba(40, 40, 40, 0.2)";
  rCtx.fillStyle = "rgba(80, 80, 80, 0.3)";
  for (let i = 0; i < 5; i++) {
    const trackX = 40 + Math.random() * 100;
    ctx.fillRect(trackX, 0, 14, sizeY);
    bCtx.fillRect(trackX, 0, 14, sizeY);
    rCtx.fillRect(trackX, 0, 14, sizeY);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  return { map, bumpMap, roughnessMap };
}

function createRoadTexture() {
  const sizeX = 1024;
  const sizeY = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = sizeX;
  canvas.height = sizeY;
  const ctx = canvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = sizeX;
  bumpCanvas.height = sizeY;
  const bCtx = bumpCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = sizeX;
  roughCanvas.height = sizeY;
  const rCtx = roughCanvas.getContext("2d");

  // Base asphalt
  ctx.fillStyle = "#2c2522";
  ctx.fillRect(0, 0, sizeX, sizeY);
  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, sizeX, sizeY);
  rCtx.fillStyle = "#b0b0b0"; // Standard asphalt roughness
  rCtx.fillRect(0, 0, sizeX, sizeY);

  // Worn out edges
  const edgeGradient = ctx.createLinearGradient(0, 0, sizeX, 0);
  edgeGradient.addColorStop(0, "#4a3e35");
  edgeGradient.addColorStop(0.12, "#2c2522");
  edgeGradient.addColorStop(0.88, "#2c2522");
  edgeGradient.addColorStop(1, "#4a3e35");
  ctx.fillStyle = edgeGradient;
  ctx.fillRect(0, 0, sizeX, sizeY);

  // Asphalt macro-texture and noise
  for (let i = 0; i < 8000; i += 1) {
    const isDark = Math.random() > 0.5;
    ctx.fillStyle = isDark
      ? `rgba(15, 10, 10, ${Math.random() * 0.2})`
      : `rgba(200, 200, 200, ${Math.random() * 0.08})`;
    const x = Math.random() * sizeX;
    const y = Math.random() * sizeY;
    const w = 2 + Math.random() * 12;
    const h = 4 + Math.random() * 20;
    ctx.fillRect(x, y, w, h);

    bCtx.fillStyle = isDark
      ? `rgba(60, 60, 60, 0.7)`
      : `rgba(160, 160, 160, 0.5)`;
    bCtx.fillRect(x, y, w, h);

    if (isDark) {
      rCtx.fillStyle = `rgba(140, 140, 140, 0.5)`;
      rCtx.fillRect(x, y, w, h);
    }
  }

  // Center line (worn out)
  ctx.strokeStyle = "rgba(200, 180, 150, 0.85)";
  ctx.lineWidth = 20;
  ctx.setLineDash([100, 120]);
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(sizeX / 2, -50);
  ctx.lineTo(sizeX / 2, sizeY + 50);
  ctx.stroke();
  
  // Side lines (continuous but worn)
  ctx.setLineDash([]);
  ctx.lineWidth = 15;
  ctx.strokeStyle = "rgba(180, 170, 140, 0.6)";
  // Left line
  ctx.beginPath();
  ctx.moveTo(sizeX * 0.1, -50);
  ctx.lineTo(sizeX * 0.1, sizeY + 50);
  ctx.stroke();
  // Right line
  ctx.beginPath();
  ctx.moveTo(sizeX * 0.9, -50);
  ctx.lineTo(sizeX * 0.9, sizeY + 50);
  ctx.stroke();

  // Road cracks (darker, irregular lines)
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  for (let c = 0; c < 15; c++) {
    let cx = Math.random() * sizeX;
    let cy = Math.random() * sizeY;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let seg = 0; seg < 5; seg++) {
      cx += (Math.random() - 0.5) * 40;
      cy += Math.random() * 60;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Center line bump and roughness
  bCtx.strokeStyle = "rgba(180, 180, 180, 0.8)";
  bCtx.lineWidth = 20;
  bCtx.setLineDash([100, 120]);
  bCtx.beginPath();
  bCtx.moveTo(sizeX / 2, -50);
  bCtx.lineTo(sizeX / 2, sizeY + 50);
  bCtx.stroke();
  bCtx.setLineDash([]);

  // Side lines bump
  bCtx.lineWidth = 15;
  bCtx.beginPath();
  bCtx.moveTo(sizeX * 0.1, -50);
  bCtx.lineTo(sizeX * 0.1, sizeY + 50);
  bCtx.moveTo(sizeX * 0.9, -50);
  bCtx.lineTo(sizeX * 0.9, sizeY + 50);
  bCtx.stroke();

  rCtx.strokeStyle = "rgba(100, 100, 100, 0.9)"; // Paint is smoother
  rCtx.lineWidth = 20;
  rCtx.setLineDash([100, 120]);
  rCtx.beginPath();
  rCtx.moveTo(sizeX / 2, -50);
  rCtx.lineTo(sizeX / 2, sizeY + 50);
  rCtx.stroke();
  rCtx.setLineDash([]);

  // Side lines
  ctx.strokeStyle = "rgba(255, 223, 181, 0.55)";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.lineTo(40, sizeY);
  ctx.moveTo(sizeX - 40, 0);
  ctx.lineTo(sizeX - 40, sizeY);
  ctx.stroke();

  // Skid marks (dark, low bump, smooth roughness)
  ctx.fillStyle = "rgba(10, 8, 8, 0.6)";
  rCtx.fillStyle = "rgba(60, 60, 60, 0.8)"; // Rubbery/smooth
  for (let k = 0; k < 6; k++) {
    const startX = 150 + Math.random() * (sizeX - 300);
    const width = 16 + Math.random() * 8;
    ctx.fillRect(
      startX,
      Math.random() * sizeY,
      width,
      100 + Math.random() * 400,
    );
    rCtx.fillRect(
      startX,
      Math.random() * sizeY,
      width,
      100 + Math.random() * 400,
    );
  }

  // Patch repairs (lighter/different asphalt rectangles where road was fixed)
  for (let p = 0; p < 8; p++) {
    const px = 80 + Math.random() * (sizeX - 160);
    const py = Math.random() * sizeY;
    const pw = 30 + Math.random() * 70;
    const ph = 20 + Math.random() * 100;
    const patchColor = Math.random() > 0.5 ? "#3a302d" : "#38302c";
    ctx.fillStyle = patchColor;
    ctx.fillRect(px, py, pw, ph);
    // Dark border around patch
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    // Bump and roughness patches
    bCtx.fillStyle = Math.random() > 0.5 ? "#a0a0a0" : "#909090";
    bCtx.fillRect(px, py, pw, ph);
    rCtx.fillStyle = Math.random() > 0.5 ? "#c0c0c0" : "#a8a8a8";
    rCtx.fillRect(px, py, pw, ph);
  }

  // Potholes (irregular dark depressions with rough edges)
  for (let ph = 0; ph < 20; ph++) {
    const px = Math.random() * sizeX;
    const py = Math.random() * sizeY;
    const pr = 6 + Math.random() * 18;
    // Dark center with rough gradient
    const potGrad = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr);
    potGrad.addColorStop(0, "rgba(2, 2, 2, 0.95)");
    potGrad.addColorStop(0.5, "rgba(5, 3, 3, 0.7)");
    potGrad.addColorStop(1, "rgba(20, 15, 15, 0.25)");
    ctx.fillStyle = potGrad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    // Deeper bump (pothole = dark = low bump = low value)
    bCtx.fillStyle = "rgba(25, 25, 25, 1)";
    bCtx.beginPath();
    bCtx.arc(px, py, pr * 0.8, 0, Math.PI * 2);
    bCtx.fill();
    // Jagged rim on roughness
    rCtx.fillStyle = "rgba(255, 255, 255, 0.7)";
    rCtx.beginPath();
    rCtx.arc(px, py, pr, 0, Math.PI * 2);
    rCtx.fill();
  }

  // Oil stains (dark, very smooth/shiny)
  for (let o = 0; o < 18; o++) {
    const ox = Math.random() * sizeX;
    const oy = Math.random() * sizeY;
    const or = 20 + Math.random() * 40;

    const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, or);
    grad.addColorStop(0, "rgba(5, 5, 5, 0.85)");
    grad.addColorStop(1, "rgba(5, 5, 5, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, or, 0, Math.PI * 2);
    ctx.fill();

    const rGrad = rCtx.createRadialGradient(ox, oy, 0, ox, oy, or);
    rGrad.addColorStop(0, "rgba(20, 20, 20, 0.9)"); // Very shiny
    rGrad.addColorStop(1, "rgba(176, 176, 176, 0)");
    rCtx.fillStyle = rGrad;
    rCtx.beginPath();
    rCtx.arc(ox, oy, or, 0, Math.PI * 2);
    rCtx.fill();
  }

  // Realistic cracks — more numerous and varied
  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = "#0a0807";
  bCtx.globalAlpha = 0.9;
  bCtx.strokeStyle = "#202020";
  rCtx.globalAlpha = 0.9;
  rCtx.strokeStyle = "#ffffff";

  for (let c = 0; c < 48; c += 1) {
    let x = 60 + Math.random() * (sizeX - 120);
    let y = -50 + Math.random() * sizeY;
    const lw = 1 + Math.random() * 3.5;
    ctx.lineWidth = lw;
    bCtx.lineWidth = lw;
    rCtx.lineWidth = lw;

    // Some cracks are thin (hairline), some are wide (stress fractures)
    const isWideCrack = c < 10;
    if (isWideCrack) {
      ctx.lineWidth = lw + 1.5;
      bCtx.lineWidth = lw + 1.5;
    }

    ctx.beginPath();
    bCtx.beginPath();
    rCtx.beginPath();
    ctx.moveTo(x, y);
    bCtx.moveTo(x, y);
    rCtx.moveTo(x, y);

    const segments = 12 + Math.floor(Math.random() * 14);
    for (let s = 0; s < segments; s += 1) {
      x += (Math.random() - 0.5) * 32 + 4;
      y += (Math.random() - 0.5) * 22;
      ctx.lineTo(x, y);
      bCtx.lineTo(x, y);
      rCtx.lineTo(x, y);

      // Branching — some wide cracks have more branches
      const branchChance = isWideCrack ? 0.6 : 0.45;
      if (Math.random() > (1 - branchChance)) {
        let bx = x;
        let by = y;
        ctx.moveTo(bx, by);
        bCtx.moveTo(bx, by);
        rCtx.moveTo(bx, by);
        const bSegments = 4 + Math.floor(Math.random() * 8);
        for (let bs = 0; bs < bSegments; bs++) {
          bx += (Math.random() - 0.5) * 18;
          by += (Math.random() - 0.5) * 18;
          ctx.lineTo(bx, by);
          bCtx.lineTo(bx, by);
          rCtx.lineTo(bx, by);
        }
        ctx.moveTo(x, y);
        bCtx.moveTo(x, y);
        rCtx.moveTo(x, y);
      }
    }
    ctx.stroke();
    bCtx.stroke();
    rCtx.stroke();
  }
  ctx.globalAlpha = 1;
  bCtx.globalAlpha = 1;
  rCtx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  return { map, bumpMap, roughnessMap };
}

function createMileMarker(km) {
  const group = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 1.8, 0.15),
    new THREE.MeshStandardMaterial({ color: "#ddd" }),
  );
  post.position.y = 0.9;

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.05),
    new THREE.MeshStandardMaterial({ color: "#1d5c3d" }),
  );
  sign.position.set(0, 1.4, 0.1);

  group.add(post, sign);
  group.userData.km = km;
  group.userData.speedFactor = 1.0;
  return group;
}

function spawnProp() {
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

  const isLeft = Math.random() > 0.5;
  const randType = Math.random();
  let kind = "rock";
  if (randType > 0.94) kind = "castle";
  else if (randType > 0.88) kind = "wreckage";
  else if (randType > 0.82) kind = "billboard";
  else if (randType > 0.55) kind = "building";
  else if (randType > 0.38) kind = "tree";
  else if (randType > 0.28) kind = "crater";

  const prop = createPropMesh(kind);
  const zDist = 120 + Math.random() * 80;
  const xDist =
    (kind === "castle" ? 25 + Math.random() * 20 : 15 + Math.random() * 45) *
    (isLeft ? -1 : 1);
  prop.position.set(xDist, 0, zDist);

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
  const biome = currentBiome();
  const group = new THREE.Group();
  const kind = Math.random();

  if (biome === "city") {
    if (kind > 0.7) {
      // Pedestrian bridge / Overpass with more detail
      const mat = new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.95 });
      const railMat = new THREE.MeshStandardMaterial({ color: "#3a3e44", metalness: 0.6, roughness: 0.5 });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(24, 2, 5), mat);
      bridge.position.y = 8;
      // Side rails
      const railL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 5.2), railMat);
      railL.position.set(-12, 9.5, 0);
      const railR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 5.2), railMat);
      railR.position.set(12, 9.5, 0);
      // Top rail
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(24.3, 0.15, 0.15), railMat);
      topRail.position.set(0, 10.1, 2.4);
      const topRail2 = topRail.clone();
      topRail2.position.z = -2.4;
      const pillarL = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 2.2), mat);
      pillarL.position.set(-11, 4.5, 0);
      const pillarR = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 2.2), mat);
      pillarR.position.set(11, 4.5, 0);
      group.add(bridge, pillarL, pillarR, railL, railR, topRail, topRail2);
      
      if (Math.random() > 0.5) {
        const cableMat = new THREE.MeshStandardMaterial({ color: "#222" });
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 6), cableMat);
        cable.position.set(0, 5, 0);
        cable.rotation.z = Math.PI / 12;
        group.add(cable);
      }
    } else if (kind > 0.35) {
      // Highway Gantry with better sign details
      const metalMat = new THREE.MeshStandardMaterial({ color: "#444", metalness: 0.7 });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(22, 0.6, 0.6), metalMat);
      beam.position.y = 9.5;
      const poleL = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 11, 8), metalMat);
      poleL.position.set(-10.5, 5.5, 0);
      const poleR = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 11, 8), metalMat);
      poleR.position.set(10.5, 5.5, 0);
      // Cross braces
      const braceA = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 5), metalMat);
      braceA.position.set(-5, 7, 0.3);
      braceA.rotation.y = Math.PI / 4;
      const braceB = braceA.clone();
      braceB.position.set(5, 7, -0.3);
      braceB.rotation.y = -Math.PI / 4;
      
      const signMat = new THREE.MeshStandardMaterial({ color: "#26593a", roughness: 0.8 });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(9, 3.5, 0.2), signMat);
      sign.position.set(-2, 10.8, 0);
      const sign2 = new THREE.Mesh(new THREE.BoxGeometry(7, 2.8, 0.2), signMat);
      sign2.position.set(4, 10.8, 0);
      
      group.add(beam, poleL, poleR, braceA, braceB, sign, sign2);
      group.userData.isGantry = true;
    } else {
      // Ruined billboard bridge
      const rustMat = new THREE.MeshStandardMaterial({ color: "#5a4a3e", roughness: 0.95, metalness: 0.3 });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(18, 0.8, 0.8), rustMat);
      beam.position.y = 7.5;
      const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 8, 8), rustMat);
      postL.position.set(-8.5, 4, 0);
      const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 8, 8), rustMat);
      postR.position.set(8.5, 4, 0);
      // Hanging billboard face
      const board = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 0.15), rustMat);
      board.position.set(0, 5.5, 0.4);
      board.rotation.z = (Math.random() - 0.5) * 0.1;
      group.add(beam, postL, postR, board);
    }
  } else {
    // Desert Overheads
    if (kind > 0.75) {
      // Natural Rock Arch — wider, more dramatic
      const rockMat = new THREE.MeshStandardMaterial({ color: "#7a5c48", roughness: 1.0 });
      const arch = new THREE.Mesh(new THREE.TorusGeometry(13, 3.5, 8, 20, Math.PI), rockMat);
      arch.position.y = -3;
      // Rock debris at base
      for (let d = 0; d < 4; d++) {
        const debris = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + Math.random(), 1), rockMat);
        debris.position.set(
          (Math.random() - 0.5) * 16,
          -1.5,
          (Math.random() - 0.5) * 3,
        );
        debris.scale.set(1, 0.4 + Math.random() * 0.3, 1);
        group.add(debris);
      }
      group.add(arch);
    } else if (kind > 0.5) {
      // Ruined Highway Overpass — more detail
      const mat = new THREE.MeshStandardMaterial({ color: "#777", roughness: 0.95 });
      const rebarMat = new THREE.MeshStandardMaterial({ color: "#333", metalness: 0.8 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(28, 1.8, 7), mat);
      deck.position.y = 10;
      deck.rotation.z = (Math.random() - 0.5) * 0.12;
      const pillarL = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 12), mat);
      pillarL.position.set(-11, 4.5, 0);
      pillarL.rotation.z = (Math.random() - 0.5) * 0.08;
      const pillarR = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 11), mat);
      pillarR.position.set(12, 4, 0);
      // Exposed rebar
      for (let r = 0; r < 5; r++) {
        const rebar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3 + Math.random() * 3, 0.08), rebarMat);
        rebar.position.set((Math.random() - 0.5) * 10, 8 + Math.random() * 2, (Math.random() - 0.5) * 2);
        rebar.rotation.set(Math.random() * 0.3, 0, Math.random() * 0.3);
        group.add(rebar);
      }
      group.add(deck, pillarL, pillarR);
    } else if (kind > 0.2) {
      // Rusted metal arch / Checkpoint
      const rustMat = new THREE.MeshStandardMaterial({ color: "#543a2c", roughness: 0.9, metalness: 0.5 });
      const beam1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 13, 1.0), rustMat);
      beam1.position.set(-9, 6.5, 0);
      beam1.rotation.z = -0.2;
      const beam2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 13, 1.0), rustMat);
      beam2.position.set(9, 6.5, 0);
      beam2.rotation.z = 0.2;
      const cross = new THREE.Mesh(new THREE.BoxGeometry(19, 1.0, 1.0), rustMat);
      cross.position.set(0, 12.5, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), rustMat);
      top.position.set(0, 13.2, 0);
      group.add(beam1, beam2, cross, top);
    } else {
      // Collapsed billboard frame
      const rustMat = new THREE.MeshStandardMaterial({ color: "#5d4b3a", roughness: 0.95, metalness: 0.2 });
      const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 6, 6), rustMat);
      postL.position.set(-5, 3, 0);
      postL.rotation.z = -0.35;
      const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 7, 6), rustMat);
      postR.position.set(5, 3.5, 0);
      postR.rotation.z = 0.4;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 0.6), rustMat);
      beam.position.set(-1, 5.5, 0.3);
      beam.rotation.z = -0.5;
      beam.rotation.x = 0.3;
      const brokenBoard = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.1), rustMat);
      brokenBoard.position.set(2, 4, 0.4);
      brokenBoard.rotation.set(0.4, 0.2, -0.6);
      group.add(postL, postR, beam, brokenBoard);
    }
  }

  group.position.set(0, 0, 200 + Math.random() * 50);
  world.scene.add(group);
  if (!world.overheadPool) world.overheadPool = [];
  world.overheadPool.push(group);
}

function createPropMesh(kind) {
  const group = new THREE.Group();

  if (world.assets.models[kind]) {
    const clone = world.assets.models[kind].clone();
    group.add(clone);
    return group;
  }

  if (kind === "building") {
    const baseColor = new THREE.Color().setHSL(
      0.07 + Math.random() * 0.06,
      0.04 + Math.random() * 0.08,
      0.12 + Math.random() * 0.18,
    );
    const wallMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.95,
    });
    const windowMat = new THREE.MeshStandardMaterial({
      color: "#88aacc",
      emissive: "#335577",
      emissiveIntensity: 0.2 + Math.random() * 0.3,
      roughness: 0.3,
      metalness: 0.2,
    });

    const width = 3 + Math.random() * 5;
    const depth = 3 + Math.random() * 4;
    const height = 5 + Math.random() * 10;

    // Main block
    const main = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      wallMat,
    );
    main.position.y = height / 2;
    main.castShadow = true;
    main.receiveShadow = true;
    group.add(main);

    // Windows on front face (small squares in a grid)
    const floors = Math.floor(height / 2.5);
    const windowsPerFloor = Math.floor(width / 1.5);
    for (let f = 1; f <= floors; f++) {
      for (let w = 0; w < windowsPerFloor; w++) {
        if (Math.random() > 0.7) continue;
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.6, 0.05),
          windowMat,
        );
        win.position.set(
          -width / 2 + 0.8 + w * (width / (windowsPerFloor + 1)),
          f * 2.5 - 0.5,
          depth / 2 + 0.02,
        );
        group.add(win);
      }
    }

    // Ruined/secondary section
    if (Math.random() > 0.4) {
      const secHeight = height * (0.3 + Math.random() * 0.5);
      const secondary = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.7, secHeight, depth + 1.4),
        wallMat,
      );
      secondary.position.y = secHeight / 2;
      secondary.position.x = (Math.random() - 0.5) * width * 0.3;
      secondary.castShadow = true;
      secondary.receiveShadow = true;
      group.add(secondary);
    }

    // Roof detail
    const roofY = height / 2;
    if (Math.random() > 0.6) {
      // Antenna tower
      const roofMat = new THREE.MeshStandardMaterial({ color: "#333", roughness: 0.8, metalness: 0.5 });
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6), roofMat);
      ant.position.set((Math.random()-0.5) * width * 0.5, roofY + 1.5, (Math.random()-0.5) * depth * 0.5);
      group.add(ant);
    } else if (Math.random() > 0.5) {
      // Vent/AC unit
      const ventMat = new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.7, metalness: 0.5 });
      const vent = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), ventMat);
      vent.position.set((Math.random()-0.5) * width * 0.4, roofY + 0.4, (Math.random()-0.5) * depth * 0.4);
      vent.rotation.y = Math.random();
      group.add(vent);
    } else {
      // Water tank
      const tankMat = new THREE.MeshStandardMaterial({ color: "#444", roughness: 0.8, metalness: 0.4 });
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 8), tankMat);
      tank.position.set((Math.random()-0.5) * width * 0.3, roofY + 0.9, (Math.random()-0.5) * depth * 0.3);
      group.add(tank);
    }

    // Wall sign on some buildings
    if (Math.random() > 0.65) {
      const signMat = new THREE.MeshStandardMaterial({ color: "#552222", roughness: 0.9 });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 1.2, 0.06), signMat);
      sign.position.set(0, height * 0.65, depth / 2 + 0.03);
      group.add(sign);
    }
  } else if (kind === "tree") {
    const trunkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.07, 0.1, 0.12 + Math.random() * 0.08),
      roughness: 1.0,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.15 + Math.random() * 0.06, 0.2 + Math.random() * 0.15, 0.18 + Math.random() * 0.1),
      roughness: 0.9,
    });

    // More organic trunk with slight bend
    const trunkH = 2 + Math.random() * 2;
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.45, trunkH, 7);
    const trunkPos = trunkGeo.attributes.position;
    for (let j = 0; j < trunkPos.count; j++) {
      const yNorm = (trunkPos.getY(j) + trunkH / 2) / trunkH;
      const jitter = (Math.random() - 0.5) * 0.06 + Math.sin(yNorm * 4) * 0.03;
      trunkPos.setX(j, trunkPos.getX(j) + jitter);
      trunkPos.setZ(j, trunkPos.getZ(j) + jitter);
    }
    trunkGeo.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.rotation.x = (Math.random() - 0.5) * 0.25;
    trunk.rotation.z = (Math.random() - 0.5) * 0.25;
    trunk.castShadow = true;
    group.add(trunk);

    // Multiple foliage clusters for a more natural canopy
    const clusterCount = 3 + Math.floor(Math.random() * 4);
    for (let c = 0; c < clusterCount; c++) {
      const clusterR = 0.7 + Math.random() * 1.2;
      const cluster = new THREE.Mesh(
        new THREE.DodecahedronGeometry(clusterR, 1),
        leafMat,
      );
      cluster.position.set(
        (Math.random() - 0.5) * 2.0,
        trunkH - 0.3 + Math.random() * 1.5,
        (Math.random() - 0.5) * 2.0,
      );
      cluster.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      cluster.scale.set(1, 0.4 + Math.random() * 0.6, 1);
      cluster.castShadow = true;
      group.add(cluster);
    }

    // Branches
    const trunkTop = trunkH;
    for (let b = 0; b < 3; b++) {
      const branchLen = 0.8 + Math.random() * 1.5;
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.12, branchLen, 5),
        trunkMat,
      );
      branch.position.set(0, trunkTop * 0.6 + Math.random() * trunkTop * 0.4, 0);
      branch.rotation.set(
        (Math.random() - 0.5) * 1.2,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 1.2,
      );
      branch.castShadow = true;
      group.add(branch);
    }

    // Surface roots
    for (let r = 0; r < 3; r++) {
      const rootAng = Math.random() * Math.PI * 2;
      const rootLen = 0.3 + Math.random() * 0.5;
      const root = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.08, rootLen, 4),
        trunkMat,
      );
      root.position.set(Math.cos(rootAng) * 0.2, 0.15, Math.sin(rootAng) * 0.2);
      root.rotation.z = Math.PI / 2;
      root.rotation.y = rootAng + (Math.random() - 0.5) * 0.5;
      group.add(root);
    }
  } else if (kind === "billboard") {
    const matPole = new THREE.MeshStandardMaterial({
      color: "#333",
      roughness: 0.9,
    });
    const pole1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 15),
      matPole,
    );
    pole1.position.set(-2, 7.5, 0);
    pole1.castShadow = true;
    group.add(pole1);

    const pole2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 15),
      matPole,
    );
    pole2.position.set(2, 7.5, 0);
    pole2.castShadow = true;
    group.add(pole2);

    const boardMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.5, 0.3),
      roughness: 0.8,
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.5), boardMat);
    board.position.set(0, 12.5, 0);
    board.castShadow = true;
    group.add(board);
  } else if (kind === "castle") {
    const castleMat = new THREE.MeshStandardMaterial({
      color: "#666",
      roughness: 0.9,
      metalness: 0.1,
    });
    const towerGeo = new THREE.CylinderGeometry(2, 2.2, 10, 8);

    // Four corner towers
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(towerGeo, castleMat);
      t.position.set(i < 2 ? 6 : -6, 5, i % 2 === 0 ? 6 : -6);
      t.castShadow = t.receiveShadow = true;
      group.add(t);

      // Battlements
      const battGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      for (let j = 0; j < 8; j++) {
        const b = new THREE.Mesh(battGeo, castleMat);
        const ang = (j / 8) * Math.PI * 2;
        b.position.set(
          t.position.x + Math.cos(ang) * 2,
          10.4,
          t.position.z + Math.sin(ang) * 2,
        );
        group.add(b);
      }
    }

    // Walls
    const wallGeo = new THREE.BoxGeometry(10, 7, 1);
    const w1 = new THREE.Mesh(wallGeo, castleMat);
    w1.position.set(0, 3.5, 6);
    group.add(w1);
    const w2 = new THREE.Mesh(wallGeo, castleMat);
    w2.position.set(0, 3.5, -6);
    group.add(w2);
    const w3 = new THREE.Mesh(wallGeo, castleMat);
    w3.position.set(6, 3.5, 0);
    w3.rotation.y = Math.PI / 2;
    group.add(w3);
    const w4 = new THREE.Mesh(wallGeo, castleMat);
    w4.position.set(-6, 3.5, 0);
    w4.rotation.y = Math.PI / 2;
    group.add(w4);

    group.scale.set(1.5, 1.5, 1.5);
  } else if (kind === "rock") {
    const mat = new THREE.MeshStandardMaterial({
      color: "#555",
      roughness: 0.9,
      flatShading: true,
    });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1 + Math.random()),
        mat,
      );
      mesh.position.set(
        (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 0.5,
        (Math.random() - 0.5) * 1.5,
      );
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  } else if (kind === "street_light") {
    const matPole = new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.8, metalness: 0.5 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8), matPole);
    pole.position.y = 4;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3), matPole);
    arm.position.set(1.4, 7.8, 0);
    arm.rotation.z = Math.PI / 2;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: "#eef", emissive: "#fffdeb", emissiveIntensity: 2 }));
    lamp.position.set(2.8, 7.7, 0);
    const light = new THREE.PointLight("#fffdeb", 1.5, 25);
    light.position.set(2.8, 7.5, 0);
    group.add(pole, arm, lamp, light);
  } else if (kind === "power_pole") {
    const wood = new THREE.MeshStandardMaterial({ color: "#3a2818", roughness: 0.9 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 9), wood);
    pole.position.y = 4.5;
    pole.castShadow = true;
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.2), wood);
    crossbar.position.y = 8;
    group.add(pole, crossbar);
    
    // Insulators on crossbar ends
    const insulatorMat = new THREE.MeshStandardMaterial({ color: "#6b5e53", roughness: 0.6 });
    for (const cx of [-1.4, 1.4]) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8), insulatorMat);
      ins.position.set(cx, 8.25, 0);
      group.add(ins);
    }
    
    // Broken/dangling wires from crossbar
    const wireMat = new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.5, metalness: 0.3 });
    for (let wi = 0; wi < 4; wi++) {
      const side = wi < 2 ? -1 : 1;
      const startX = side * 1.6;
      const startY = 8.1;
      const startZ = (wi % 2 === 0 ? 1 : -1) * 4;
      // Wire segments zigzagging downward
      let wx = startX;
      let wy = startY;
      let wz = startZ;
      for (let seg = 0; seg < 6; seg++) {
        const segLen = 1.5 + Math.random() * 3;
        const segX = wx + side * (0.3 + Math.random() * 1.2);
        const segY = wy - 0.3 - Math.random() * 0.8;
        const segZ = wz + (Math.random() - 0.5) * 2.5;
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, segLen, 4), wireMat);
        const midX = (wx + segX) / 2;
        const midY = (wy + segY) / 2;
        const midZ = (wz + segZ) / 2;
        wire.position.set(midX, midY, midZ);
        wire.lookAt(new THREE.Vector3(segX, segY, segZ));
        wire.rotateX(Math.PI / 2);
        group.add(wire);
        wx = segX;
        wy = segY;
        wz = segZ;
      }
    }
  } else if (kind === "fence") {
    const rust = new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.9, metalness: 0.6 });
    const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5), rust);
    pole1.position.set(-2, 0.75, 0);
    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5), rust);
    pole2.position.set(2, 0.75, 0);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), new THREE.MeshStandardMaterial({ color: "#666", transparent: true, opacity: 0.5, wireframe: true }));
    mesh.position.y = 0.75;
    group.add(pole1, pole2, mesh);
  } else if (kind === "dead_bush") {
    const mat = new THREE.MeshStandardMaterial({ color: "#4a3b2c", roughness: 1.0, wireframe: true });
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.8, 4, 4), mat);
    bush.position.y = 0.6;
    bush.scale.set(1, 0.6, 1);
    group.add(bush);
  } else if (kind === "ruin") {
    const mat = new THREE.MeshStandardMaterial({ color: "#8a7a6a", roughness: 0.95 });
    const w = 4 + Math.random() * 4;
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(w, 2 + Math.random() * 3, 0.5), mat);
    wall1.position.y = 1.5;
    wall1.rotation.y = (Math.random() - 0.5) * 0.5;
    group.add(wall1);
    if (Math.random() > 0.5) {
      const wall2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 1 + Math.random() * 2, 0.5), mat);
      wall2.position.set(w * 0.4, 1, w * 0.4);
      wall2.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      group.add(wall2);
    }
  } else if (kind === "wreckage") {
    // Scattered car/truck wreckage with debris
    const wreckMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.07 + Math.random() * 0.03, 0.1, 0.18 + Math.random() * 0.1),
      roughness: 0.95,
      metalness: 0.3,
    });
    const burnMat = new THREE.MeshStandardMaterial({ color: "#1a1008", roughness: 1 });
    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2 + Math.random(), 0.4 + Math.random() * 0.3, 3.5 + Math.random() * 2), wreckMat);
    body.position.set(0, 0.3, 0);
    body.rotation.y = Math.random() * Math.PI;
    body.rotation.z = (Math.random() - 0.5) * 0.8;
    body.castShadow = true;
    group.add(body);
    // Engine block
    const engine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.0), wreckMat);
    engine.position.set(0.5, 0.4, 1.8);
    engine.rotation.z = (Math.random() - 0.5) * 0.3;
    group.add(engine);
    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: "#0d0b0a", roughness: 1 });
    for (let w = 0; w < 3; w++) {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.4 + Math.random() * 0.15, 0.08, 6, 12).applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)),
        wheelMat,
      );
      wheel.position.set((Math.random() - 0.5) * 2, 0.2, (Math.random() - 0.5) * 3);
      wheel.rotation.set(Math.random(), Math.random(), 0);
      group.add(wheel);
    }
    // Scorch marks
    if (Math.random() > 0.4) {
      const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.2 + Math.random(), 8), burnMat);
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.set(0, 0.01, 0);
      group.add(scorch);
    }
  } else if (kind === "crater") {
    // Ground crater/ditch
    const dirtMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.08, 0.3, 0.25 + Math.random() * 0.15),
      roughness: 1,
      flatShading: true,
    });
    const craterR = 2 + Math.random() * 4;
    const craterGeo = new THREE.CylinderGeometry(craterR * 0.9, craterR, 1.2, 16, 1, true);
    const pos = craterGeo.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      const val = Math.random();
      pos.setXYZ(
        j,
        pos.getX(j) * (0.7 + val * 0.3),
        pos.getY(j) * (0.3 + val * 0.7),
        pos.getZ(j) * (0.7 + val * 0.3),
      );
    }
    craterGeo.computeVertexNormals();
    const crater = new THREE.Mesh(craterGeo, dirtMat);
    crater.position.y = -0.5;
    crater.rotation.x = Math.PI;
    crater.receiveShadow = true;
    group.add(crater);
    // Rim debris
    for (let d = 0; d < 8; d++) {
      const debris = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15 + Math.random() * 0.35, 1), dirtMat);
      const ang = Math.random() * Math.PI * 2;
      debris.position.set(Math.cos(ang) * craterR * 0.8, 0.05 + Math.random() * 0.15, Math.sin(ang) * craterR * 0.8);
      debris.scale.y = 0.3 + Math.random() * 0.3;
      group.add(debris);
    }
  }

  return group;
}

function spawnObstacle() {
  const kind = spawnEncounter(world.run, currentBiome(), encounterConfig);

  const obstacle = createObstacleMesh(kind);
  obstacle.castShadow = true;
  obstacle.receiveShadow = true;

  if (kind === "tower") {
    // Coherence: place towers on the side of the road, not in the middle.
    const isLeft = Math.random() > 0.5;
    const xDist = (4 + Math.random() * 2) * (isLeft ? -1 : 1);
    obstacle.position.set(
      xDist,
      obstacle.userData.height,
      38 + Math.random() * 18,
    );
  } else {
    obstacle.position.set(
      randomLane(),
      obstacle.userData.height,
      38 + Math.random() * 18,
    );
  }

  if (obstacle.userData.isEnemy) {
    obstacle.userData.laneTarget = obstacle.position.x;
  }
  applyObstacleOrientation3D(obstacle, kind);
  obstacle.userData.marker = createFootprintMarker(obstacle, kind);
  world.scene.add(obstacle);
  world.scene.add(obstacle.userData.marker);
  world.obstaclePool.push(obstacle);
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

function spawnPickup() {
  const type = choosePickupType(world.run, currentBiome(), encounterConfig);
  spawnPickupAt(
    type,
    randomLane(),
    34 + Math.random() * 18,
    1.2 + Math.random() * 0.7,
  );
}

function spawnPickupAt(type, x, z, y = 1.2) {
  const configs = {
    coin: {
      color: "#ffd166",
      geometry: new THREE.TorusGeometry(0.45, 0.18, 12, 24),
      amount: 1,
      label: "Coins",
    },
    jump: {
      color: "#7af5b7",
      geometry: new THREE.OctahedronGeometry(0.52, 0),
      amount: 1,
      label: "Jump charge",
    },
    fire: {
      color: "#ff8b5e",
      geometry: new THREE.OctahedronGeometry(0.52, 0),
      amount: 1,
      label: "Fire charge",
    },
    ammo: {
      color: "#6fd0ff",
      geometry: new THREE.BoxGeometry(0.8, 0.55, 0.55),
      amount: 3,
      label: "Ammo crate",
    },
    repair: {
      color: "#ff96b4",
      geometry: new THREE.BoxGeometry(0.72, 0.72, 0.72),
      amount: 18,
      label: "Repair kit",
    },
  };

  const config = configs[type];
  let mesh;
  if ((type === "ammo" || type === "repair") && world.assets.models["crate"]) {
    mesh = world.assets.models["crate"].clone();
    // Color it appropriately
    mesh.traverse((c) => {
      if (c.isMesh) {
        c.material = c.material.clone();
        c.material.color.set(config.color);
        c.material.emissive.set(config.color);
        c.material.emissiveIntensity = 0.4;
      }
    });
  } else {
    // Better fallback procedural meshes for pickups
    const group = new THREE.Group();
    const coreMat = new THREE.MeshStandardMaterial({
      color: config.color,
      emissive: config.color,
      emissiveIntensity: 0.8,
      roughness: 0.25,
      metalness: 0.4,
    });

    if (type === "ammo" || type === "repair") {
      const box = new THREE.Mesh(config.geometry, coreMat);
      // Metal bands
      const bandMat = new THREE.MeshStandardMaterial({
        color: "#222",
        metalness: 0.8,
      });
      const band1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.57, 0.1),
        bandMat,
      );
      const band2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.57, 0.57),
        bandMat,
      );
      group.add(box, band1, band2);
    } else {
      const shape = new THREE.Mesh(config.geometry, coreMat);
      const glow = new THREE.PointLight(config.color, 2, 4);
      group.add(shape, glow);
      // Coin gets an orbiting glow ring
      if (type === "coin") {
        const ringMat = new THREE.MeshBasicMaterial({
          color: "#fffbe6",
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.04, 8, 16), ringMat);
        ring.userData.isPickupRing = true;
        group.add(ring);
      }
    }

    mesh = group;
  }
  mesh.position.set(x, y, z);
  mesh.userData = {
    type,
    amount: config.amount,
    label: config.label,
    color: config.color,
    bob: Math.random() * Math.PI * 2,
  };
  world.scene.add(mesh);
  world.pickupPool.push(mesh);
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

function destroyObstacle(obstacle, rewardPlayer = false) {
  const impactPoint = obstacle.position.clone();
  createBurst(world,
    impactPoint,
    obstacle.userData.isEnemy ? "#ff6d5e" : "#ff8b5e",
    obstacle.userData.isEnemy ? 18 : 12,
  );
  createShockwave(world,
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
  createBurst(world,projectile.position, "#ffb36a", 3);
}

function updateEntities(dt) {
  const run = world.run;
  const speed = run.speed * dt;

  world.obstaclePool = world.obstaclePool.filter((obstacle) => {
    obstacle.position.z -= speed * (obstacle.userData.isEnemy ? 0.82 : 1);
    if (obstacle.userData.isEnemy) {
      // Enemies should not spin like tops. They should face forward and steer slightly to their lane target.
      const laneDiff = obstacle.userData.laneTarget - obstacle.position.x;
      obstacle.rotation.y = laneDiff * 0.15;
      // Small tilt when turning
      obstacle.rotation.z = -laneDiff * 0.05;
    } else if (obstacle.userData.obstacleSpin === "scrap") {
      obstacle.rotation.y += dt * 0.55;
      obstacle.rotation.x += dt * 0.06;
    } else if (obstacle.userData.obstacleSpin === "barrier") {
      // Barrier shouldn't spin constantly either unless it's moving weirdly. Let's keep it static.
    }

    if (obstacle.userData.isEnemy) {
      obstacle.userData.shotCooldown -= dt;
      if (Math.random() < dt * 0.45) {
        obstacle.userData.laneTarget = randomLane();
      }
      obstacle.position.x +=
        (obstacle.userData.laneTarget - obstacle.position.x) * dt * 2.1;

      const sameLane = Math.abs(obstacle.position.x - run.x) < 1.2;
      const inRange = obstacle.position.z > 10 && obstacle.position.z < 27;
      if (sameLane && inRange && obstacle.userData.shotCooldown <= 0) {
        spawnEnemyProjectile(obstacle);
        obstacle.userData.shotCooldown = 1.25 + Math.random() * 1.4;
      }
    }

    if (obstacle.userData.marker) {
      const m = obstacle.userData.marker;
      m.position.x = obstacle.position.x;
      m.position.z = obstacle.position.z;
      m.rotation.y = obstacle.rotation.y;
    }

    if (obstacle.position.z < -12) {
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
        // Don't destroy the ramp - let it remain
        return true;
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

        const pushDir = hit.signedDx !== 0 ? Math.sign(hit.signedDx) : (run.lateralVel > 0 ? -1 : 1);
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
        beep(world, 28, 0.22, "square");

        // Walls stay; they won the fight.
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
      const pushDirX = hit.signedDx !== 0 ? Math.sign(hit.signedDx) : (run.lateralVel > 0 ? -1 : 1);
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
      if (run.x <= -laneHw) { run.x = -laneHw; run.lateralVel = Math.max(0, run.lateralVel); }
      else if (run.x >= laneHw) { run.x = laneHw; run.lateralVel = Math.min(0, run.lateralVel); }

      // Significant speed penalty: the car must not just plow through
      run.speedFactor *= 0.62 - (obstacle.userData.damage ?? 10) * 0.003;
      if (run.speedFactor < 0.24) run.speedFactor = 0.24;

      transformToDebris(obstacle);
      return false;
    }

    return true;
  });

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
    pickup.rotation.y += dt * 2.2;
    pickup.position.y +=
      Math.sin(performance.now() * 0.004 + pickup.userData.bob) * 0.0035;

    // Animate coin glow ring orbiting opposite direction
    if (pickup.userData.type === "coin") {
      pickup.children.forEach((c) => {
        if (c.userData && c.userData.isPickupRing) {
          c.rotation.z += dt * 1.5;
        }
      });
    }

    if (pickup.position.z < -12) {
      world.scene.remove(pickup);
      return false;
    }

    if (collidesWithCar(pickup.position.x, pickup.position.z, 0.95)(run)) {
      const resolvedPickup = _resolvePickup(run, pickup.userData.type, pickupCatalog);
      flashMessage(
        `Recogido: ${resolvedPickup?.label ?? pickup.userData.label}`,
      );
      createBurst(world,pickup.position, pickup.userData.color.replace("#", ""), 8);
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

function tryJump() {
  const run = world.run;
  if (!run.grounded || run.jumps <= 0) return;
  run.jumps -= 1;
  run.grounded = false;
  run.yVelocity = run.jumpPower;
  createBurst(world,world.car.position, "#7af5b7", 6);
  flashMessage("Salto activado");
  beep(world, 240, 0.05, "triangle");
}

function useFire() {
  const run = world.run;
  if (run.fire <= 0) {
    flashMessage("Sin cargas de fuego");
    return;
  }
  if (run.ammo < 2) {
    flashMessage("Municion insuficiente");
    beep(world, 104, 0.04, "square");
    return;
  }
  run.fire -= 1;
  run.ammo = Math.max(0, run.ammo - 2);
  const radius = run.fireRadius;
  const remaining = [];
  const launchPoint = new THREE.Vector3(run.x, 1.1, 2.2);
  let destroyed = 0;

  createShockwave(world,launchPoint, "#ffb36a", 0.4, 2.8, 0.28);

  const fireReach = radius * 2.2;
  for (const obstacle of world.obstaclePool) {
    if (firePulseTouchesObstacle(obstacle, run, fireReach, 1.5)) {
      const impactPoint = obstacle.position.clone();
      createMissileTrail(world,launchPoint, impactPoint, "#ffb36a");
      destroyObstacle(obstacle, true);
      destroyed += 1;
    } else {
      remaining.push(obstacle);
    }
  }
  world.obstaclePool = remaining;

  world.projectilePool = world.projectilePool.filter((projectile) => {
    const dx = projectile.position.x - run.x;
    const dz = projectile.position.z - 1.5;
    if (Math.hypot(dx, dz) <= radius * 2.6) {
      createBurst(world,projectile.position, "#ffd59a", 4);
      world.scene.remove(projectile);
      return false;
    }
    return true;
  });

  if (destroyed === 0) {
    const missPoint = new THREE.Vector3(run.x, 1.1, 2.2 + radius * 4.4);
    createMissileTrail(world,launchPoint, missPoint, "#ffb36a");
    createShockwave(world,missPoint, "#ffb36a", 0.45, 1.7, 0.2);
  }

  createBurst(world,launchPoint, "#ffb36a", 18);
  flashMessage(
    destroyed > 0
      ? `Pulso incendiario: ${destroyed} objetivos`
      : "Pulso incendiario",
  );
  beep(world, 150, 0.08, "sawtooth");
}

function updateHUD() {
  const run = world.run;
  if (hud.coins) hud.coins.textContent = run.coins;
  if (hud.ammo) hud.ammo.textContent = run.ammo;
  hud.jumps.textContent = run.jumps;
  hud.fire.textContent = run.fire;
  hud.jumpStock.textContent = run.jumps;
  hud.fireStock.textContent = run.fire;
  hud.health.textContent = Math.max(0, Math.ceil(run.health));
  if (hud.threat) hud.threat.textContent = `${Math.round(run.threat)}%`;
  if (hud.weather) hud.weather.textContent = run.weatherLabel;
  if (hud.cycle) hud.cycle.textContent = run.cycleLabel;
  hud.distance.textContent = run.distance.toFixed(1);
  hud.biome.textContent = biomeCatalog[run.biome].label;
  hud.objective.textContent = run.objective;
  hud.objectiveProgress.textContent = formatObjectiveProgress(run);
  if (hud.jumpButton) {
    hud.jumpButton.disabled = !run.grounded || run.jumps <= 0 || !isPlaying();
  }
  if (hud.fireButton) {
    hud.fireButton.disabled = run.fire <= 0 || run.ammo < 2 || !isPlaying();
  }
  if (hud.pauseButton) hud.pauseButton.disabled = !isPlaying();

  const pips = hud.speedBar.querySelectorAll(".speed-pip");
  const sf = run.speedFactor ?? 1;
  const braking = (run.throttleSmoothed ?? 0) < -0.08;
  const activePips = Math.round(sf * speedPips);
  pips.forEach((pip, i) => {
    pip.classList.toggle("active", !braking && i < activePips);
    pip.classList.toggle(
      "brake",
      braking && i < Math.round((1 - sf) * speedPips),
    );
  });
}

function formatObjectiveProgress(run) {
  if (!Number.isFinite(run.objectiveTarget)) {
    return `${run.objectiveProgress.toFixed(1)} km`;
  }
  return `${Math.min(run.objectiveProgress, run.objectiveTarget).toFixed(1)} / ${run.objectiveTarget.toFixed(1)} km`;
}

function flashMessage(text) {
  hud.message.textContent = text;
  hud.message.classList.add("visible");
  clearTimeout(messageTimer);
  messageTimer = window.setTimeout(() => {
    hud.message.classList.remove("visible");
  }, 1400);
}

function triggerShake(intensity = 1) {
  shakeTimer = 0.25;
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

// ── Touch joystick ────────────────────────────────────────────────────────
function setupTouchControls() {
  // only inject on touch-capable screens
  const hasTouch =
    navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  if (!hasTouch) return;
  const joystickEl = document.createElement("div");
  joystickEl.id = "touch-joystick";
  joystickEl.innerHTML = `<div id="touch-knob"></div>`;
  document.querySelector(".shell").appendChild(joystickEl);

  const knob = document.getElementById("touch-knob");
  const RADIUS = 52;
  let touchId = null;
  let originX = 0,
    originY = 0;

  function onStart(e) {
    if (!isPlaying()) return;
    const touch = e.changedTouches[0];
    // only accept touches in the left half of the screen
    if (touch.clientX > window.innerWidth * 0.55) return;
    e.preventDefault();
    touchId = touch.identifier;
    originX = touch.clientX;
    originY = touch.clientY;
    joystickEl.style.left = `${originX - 64}px`;
    joystickEl.style.top = `${originY - 64}px`;
    joystickEl.classList.add("active");
    world.input.touch.active = true;
  }

  function onMove(e) {
    if (touchId === null) return;
    e.preventDefault();
    const touch = [...e.changedTouches].find((t) => t.identifier === touchId);
    if (!touch) return;
    const dx = touch.clientX - originX;
    const dy = touch.clientY - originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, RADIUS);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
    world.input.touch.dx = kx / RADIUS;
    world.input.touch.dy = ky / RADIUS;
  }

  function onEnd(e) {
    const touch = [...e.changedTouches].find((t) => t.identifier === touchId);
    if (!touch) return;
    touchId = null;
    knob.style.transform = "translate(0,0)";
    joystickEl.classList.remove("active");
    world.input.touch.active = false;
    world.input.touch.dx = 0;
    world.input.touch.dy = 0;
  }

  document.addEventListener("touchstart", onStart, { passive: false });
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);
  document.addEventListener("touchcancel", onEnd);
}

function createObstacleMesh(kind) {
  const rustMat = new THREE.MeshStandardMaterial({
    color: "#4d3a2e",
    roughness: 0.95,
    metalness: 0.4,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: "#222",
    roughness: 0.8,
    metalness: 0.6,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: "#111",
    roughness: 0.9,
  });

  if (kind === "raider") {
    const group = new THREE.Group();
    if (world.assets.models["raider"]) {
      const clone = world.assets.models["raider"].clone();
      group.add(clone);
    } else {
      // Chasis
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.85, 0.6, 3.4),
        rustMat,
      );
      body.position.set(0, 0.5, 0);

      // Cabina
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.7, 1.2),
        darkMetal,
      );
      cabin.position.set(0, 1.15, -0.2);

      // Rammer frontal
      const rammer = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.3, 0.5),
        darkMetal,
      );
      rammer.position.set(0, 0.4, 1.8);

      // Arma
      const gunBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8),
        darkMetal,
      );
      gunBase.position.set(0, 1.6, -0.2);
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 1.4),
        new THREE.MeshStandardMaterial({
          color: "#ffb36a",
          emissive: "#ff8c47",
          emissiveIntensity: 0.8,
        }),
      );
      gun.position.set(0, 1.7, 0.4);

      // Ruedas
      const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      const w1 = new THREE.Mesh(wheelGeo, tireMat);
      w1.position.set(1.0, 0.4, 1.2);
      const w2 = new THREE.Mesh(wheelGeo, tireMat);
      w2.position.set(-1.0, 0.4, 1.2);
      const w3 = new THREE.Mesh(wheelGeo, tireMat);
      w3.position.set(1.0, 0.4, -1.2);
      const w4 = new THREE.Mesh(wheelGeo, tireMat);
      w4.position.set(-1.0, 0.4, -1.2);

      // Side armor plates (welded scrap metal)
      const scrapMetal = new THREE.MeshStandardMaterial({ color: "#3d3028", roughness: 0.9, metalness: 0.6 });
      for (const sx of [-0.95, 0.95]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 2.8), scrapMetal);
        plate.position.set(sx, 0.6, 0);
        group.add(plate);
        // Rivets
        for (let rv = 0; rv < 4; rv++) {
          const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), darkMetal);
          rivet.position.set(sx * 1.04, 0.3 + rv * 0.2, -1 + rv * 0.7);
          group.add(rivet);
        }
      }

      // Spikes on rammer
      const spikeGeo = new THREE.ConeGeometry(0.05, 0.35, 4);
      for (let sp = 0; sp < 5; sp++) {
        const spike = new THREE.Mesh(spikeGeo, darkMetal);
        spike.position.set(-0.8 + sp * 0.4, 0.5, 2.1);
        spike.rotation.x = -0.3;
        group.add(spike);
      }

      // Skull/hood ornament
      const skullBase = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), new THREE.MeshStandardMaterial({ color: "#e8d5c0", roughness: 0.8 }));
      skullBase.position.set(0, 0.95, 1.5);
      skullBase.scale.set(1, 0.7, 0.8);
      const skullJaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.15), new THREE.MeshStandardMaterial({ color: "#d4c0a8" }));
      skullJaw.position.set(0, 0.85, 1.6);
      const skullEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), new THREE.MeshStandardMaterial({ color: "#0a0000", roughness: 0.1 }));
      skullEyeL.position.set(-0.06, 0.98, 1.63);
      const skullEyeR = skullEyeL.clone();
      skullEyeR.position.set(0.06, 0.98, 1.63);
      group.add(skullBase, skullJaw, skullEyeL, skullEyeR);

      // Exposed exhaust pipes on sides
      for (const ex of [-0.7, 0.7]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.0, 8), rustMat);
        pipe.position.set(ex, 0.35, -1.2);
        pipe.rotation.x = Math.PI / 2;
        group.add(pipe);
      }

      group.add(body, cabin, rammer, gunBase, gun, w1, w2, w3, w4);

      group.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }

    const hullTop = 1.8;
    group.userData = {
      type: "enemy",
      isEnemy: true,
      damage: 22,
      collisionHalfX: 1.02,
      collisionHalfZ: 1.78,
      height: 0,
      collisionYMin: 0,
      collisionYMax: hullTop,
      projectileY: 1.7,
      shotCooldown: 0.9 + Math.random() * 0.8,
      laneTarget: 0,
      rewardCoins: 2,
      rewardAmmo: 1,
    };
    return group;
  }

  if (kind === "tower") {
    const group = new THREE.Group();
    if (world.assets.models["tower"]) {
      const clone = world.assets.models["tower"].clone();
      group.add(clone);
    } else {
      const baseGeo = new THREE.CylinderGeometry(1.4, 1.6, 3.8, 8);
      const base = new THREE.Mesh(baseGeo, rustMat);
      base.position.set(0, 1.9, 0);

      const topGeo = new THREE.CylinderGeometry(1.6, 1.4, 0.8, 8);
      const top = new THREE.Mesh(topGeo, darkMetal);
      top.position.set(0, 4.2, 0);

      // Spikes around top (taller and more menacing)
      const spikeGeo = new THREE.ConeGeometry(0.12, 0.8, 4);
      for (let i = 0; i < 10; i++) {
        const spike = new THREE.Mesh(spikeGeo, darkMetal);
        spike.position.set(
          Math.cos((i / 10) * Math.PI * 2) * 1.55,
          4.6,
          Math.sin((i / 10) * Math.PI * 2) * 1.55,
        );
        spike.rotation.z = (Math.random() - 0.5) * 0.3;
        group.add(spike);
      }

      // Skulls impaled on random spikes
      const skullMat = new THREE.MeshStandardMaterial({ color: "#e8d5c0", roughness: 0.7 });
      for (let sk = 0; sk < 3; sk++) {
        const skullHeight = 4.0 + Math.random() * 1.5;
        const skullAng = Math.random() * Math.PI * 2;
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), skullMat);
        skull.position.set(
          Math.cos(skullAng) * 1.55,
          skullHeight,
          Math.sin(skullAng) * 1.55,
        );
        skull.scale.set(1, 0.65, 0.8);
        group.add(skull);
      }

      // Glowing warning beacon on top
      const beaconMat = new THREE.MeshStandardMaterial({
        color: "#ff3300",
        emissive: "#ff1100",
        emissiveIntensity: 2.5,
      });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), beaconMat);
      beacon.position.set(0, 5.2, 0);
      group.add(beacon);

      // Damage / exposed rebar at base
      for (let dmg = 0; dmg < 4; dmg++) {
        const rebar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5 + Math.random(), 0.06), darkMetal);
        rebar.position.set(
          (Math.random() - 0.5) * 1.4,
          0.5 + Math.random() * 1.5,
          (Math.random() - 0.5) * 1.4,
        );
        rebar.rotation.set(Math.random() * 0.5, Math.random() * 0.5, Math.random() * 0.5);
        group.add(rebar);
      }

      group.add(base, top);
      group.traverse((c) => {
        if (c.isMesh) c.castShadow = c.receiveShadow = true;
      });
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "none",
      damage: 35,
      collisionHalfX: 1.8,
      collisionHalfZ: 1.8,
      collisionFootprint: "circle",
      collisionRadius: 1.85,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 3.8,
      isWall: true,
    };
    return group;
  }

  if (kind === "barrier") {
    const group = new THREE.Group();
    if (world.assets.models["barrier"]) {
      const clone = world.assets.models["barrier"].clone();
      group.add(clone);
    } else {
      const barrierMat = new THREE.MeshStandardMaterial({ color: "#7b4c2d", roughness: 0.95 });
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 1.15, 1.2),
        barrierMat,
      );
      base.position.y = 0.58;
      base.castShadow = true;

      // Reinforced concrete base with bolts
      const boltGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8);
      const boltMat = new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.8, roughness: 0.3 });
      for (const bx of [-1.2, -0.6, 0, 0.6, 1.2]) {
        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.position.set(bx, 1.18, 0.6);
        group.add(bolt);
      }

      // Spikes on top (longer, rusted)
      const spikeGeo = new THREE.ConeGeometry(0.12, 0.9, 4);
      for (let i = 0; i < 7; i++) {
        const spike = new THREE.Mesh(spikeGeo, darkMetal);
        spike.position.set(-1.3 + i * 0.43, 0.95 + 0.58, 0);
        spike.rotation.z = (Math.random() - 0.5) * 0.15;
        group.add(spike);
      }

      // Glowing warning strip
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(2.9, 0.2, 0.08),
        new THREE.MeshStandardMaterial({
          color: "#ffbc6b",
          emissive: "#ff9f40",
          emissiveIntensity: 1.0,
        }),
      );
      strip.position.set(0, 0.15 + 0.55, 0.62);
      strip.castShadow = true;
      group.add(strip);

      // Diagonal hazard stripes (alternating reflective pattern)
      for (let h = 0; h < 3; h++) {
        const hazard = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.5, 0.04),
          new THREE.MeshStandardMaterial({
            color: h % 2 === 0 ? "#f5e642" : "#2a2020",
            emissive: h % 2 === 0 ? "#aa8800" : "#000000",
            emissiveIntensity: h % 2 === 0 ? 0.6 : 0,
          }),
        );
        hazard.position.set(-1.0 + h * 1.0, 0.6, 0.62);
        hazard.rotation.z = 0.3;
        group.add(hazard);
      }

      // Corrosion / rust streaks on sides
      const stainMat = new THREE.MeshStandardMaterial({
        color: "#3a2015",
        roughness: 1.0,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      for (let s = 0; s < 5; s++) {
        const stain = new THREE.Mesh(
          new THREE.BoxGeometry(0.15 + Math.random() * 0.3, 0.3 + Math.random() * 0.5, 0.04),
          stainMat,
        );
        stain.position.set(
          -1.3 + Math.random() * 2.6,
          0.2 + Math.random() * 0.7,
          0.62,
        );
        group.add(stain);
      }

      group.add(base);
    }
    group.userData = {
      type: "obstacle",
      obstacleSpin: "barrier",
      damage: 18,
      collisionHalfX: 1.6,
      collisionHalfZ: 0.8,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 1.1,
      isWall: true,
    };
    return group;
  }

  if (kind === "wreck") {
    const group = new THREE.Group();
    if (world.assets.models["wreck"]) {
      const clone = world.assets.models["wreck"].clone();
      group.add(clone);
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 0.7, 3.2),
        new THREE.MeshStandardMaterial({
          color: "#4a4546",
          roughness: 0.92,
          metalness: 0.5,
        }),
      );
      body.position.y = 0.35;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.55, 1.3),
        new THREE.MeshStandardMaterial({ color: "#222127", roughness: 0.85 }),
      );
      cabin.position.set(-0.15, 0.6 + 0.35, -0.15);

      // Wheels (multiple loose)
      const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.22, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      for (const [wx, wy, wz, wr] of [
        [1.4, 0.2, 1.2, 0.3],
        [-1.2, 0.15, 1.0, 0.8],
        [0.8, 0.1, -1.5, 1.2],
        [-1.3, 0.22, -0.8, 0.5],
      ]) {
        const w = new THREE.Mesh(wheelGeo, tireMat);
        w.position.set(wx, wy, wz);
        w.rotation.set(0.2 + wr, wr * 0.7, 0.1);
        group.add(w);
      }

      // Engine glow (fire/smoldering)
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.08, 0.28),
        new THREE.MeshStandardMaterial({
          color: "#ff8d6d",
          emissive: "#ff5d38",
          emissiveIntensity: 2.0,
        }),
      );
      glow.position.set(0, 0.18 + 0.35, 1.42);

      // Broken glass shards
      const glassMat = new THREE.MeshStandardMaterial({
        color: "#ccddee",
        roughness: 0.1,
        transparent: true,
        opacity: 0.4,
      });
      for (let g = 0; g < 6; g++) {
        const shard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08 + Math.random() * 0.15, 0.02), glassMat);
        shard.position.set((Math.random() - 0.5) * 1.5, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 2);
        shard.rotation.set(Math.random(), Math.random(), Math.random());
        group.add(shard);
      }

      // Scorch marks on ground
      const scorch = new THREE.Mesh(
        new THREE.CircleGeometry(1.2 + Math.random() * 0.8, 8),
        new THREE.MeshStandardMaterial({ color: "#1a1008", roughness: 1, transparent: true, opacity: 0.7 }),
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.y = 0.01;

      body.rotation.set(0.1, 0.1, -0.1);
      group.add(body, cabin, glow, scorch);
      group.traverse((c) => {
        if (c.isMesh) c.castShadow = c.receiveShadow = true;
      });
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "wreck",
      damage: 20,
      collisionHalfX: 1.3,
      collisionHalfZ: 1.8,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 1.65,
    };
    return group;
  }
  // Mutant (enemigo terrestre agresivo)
  if (kind === "mutant") {
    const group = new THREE.Group();
    const fleshMat = new THREE.MeshStandardMaterial({
      color: "#5a3d3a",
      roughness: 0.85,
    });
    const boneMat = new THREE.MeshStandardMaterial({
      color: "#d4c8b8",
      roughness: 0.7,
    });
    const eyeMat = new THREE.MeshBasicMaterial({
      color: "#ff4400",
    });

    // Cuerpo principal
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.8, 1.0),
      fleshMat,
    );
    torso.position.y = 1.1;
    torso.scale.set(1, 1.15, 0.8);
    group.add(torso);

    // Cabeza deforme
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 6, 5),
      fleshMat,
    );
    head.position.y = 2.25;
    head.scale.set(1, 0.75, 0.8);
    group.add(head);

    // Ojos brillantes
    for (const ex of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), eyeMat);
      eye.position.set(ex, 2.3, 0.4);
      group.add(eye);
    }

    // Brazos extendidos con garras
    const armGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.4, 6);
    for (const ax of [-0.7, 0.7]) {
      const arm = new THREE.Mesh(armGeo, fleshMat);
      arm.position.set(ax, 1.3, 0);
      arm.rotation.z = ax > 0 ? -0.6 : 0.6;
      arm.rotation.x = -0.2;
      group.add(arm);

      // Garras (spikes)
      for (let c = 0; c < 3; c++) {
        const claw = new THREE.Mesh(
          new THREE.ConeGeometry(0.06, 0.35, 4),
          boneMat,
        );
        claw.position.set(ax + (ax > 0 ? 0.5 : -0.5), 0.4 + c * 0.2, 0.1);
        claw.rotation.set((c - 1) * 0.3, 0, ax > 0 ? -0.5 : 0.5);
        group.add(claw);
      }
    }

    // Piernas cortas y robustas
    const legGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.7, 6);
    for (const lx of [-0.3, 0.3]) {
      const leg = new THREE.Mesh(legGeo, fleshMat);
      leg.position.set(lx, 0.35, 0);
      group.add(leg);
    }

    group.traverse((c) => {
      if (c.isMesh) c.castShadow = c.receiveShadow = true;
    });

    group.userData = {
      type: "enemy",
      isEnemy: true,
      damage: 30,
      collisionHalfX: 0.85,
      collisionHalfZ: 0.8,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 2.6,
      projectileY: 1.5,
      shotCooldown: 1.5 + Math.random() * 1.2,
      laneTarget: 0,
      rewardCoins: 3,
      rewardAmmo: 2,
    };
    return group;
  }

  // Ramp (saltable, no hace daño)
  if (kind === "ramp") {
    const group = new THREE.Group();
    const rampMat = new THREE.MeshStandardMaterial({
      color: "#8a7050",
      roughness: 0.95,
    });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: "#f5e642",
      emissive: "#aa8800",
      emissiveIntensity: 0.5,
    });

    // Plano inclinado principal
    const rampGeo = new THREE.BoxGeometry(3.5, 0.2, 5.0);
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.rotation.x = -0.5;
    ramp.position.set(0, 0.9, -0.8);
    group.add(ramp);

    // Base/soporte
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.8, 1.5),
      new THREE.MeshStandardMaterial({ color: "#5c4a3a", roughness: 0.9, metalness: 0.3 }),
    );
    base.position.set(0, 0.4, 1.4);
    group.add(base);

    // Bandas reflectantes
    for (const bx of [-1.2, 1.2]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.08, 1.6),
        hazardMat,
      );
      strip.position.set(bx, 1.1, 0.4);
      strip.rotation.x = -0.5;
      group.add(strip);
    }

    // Flechas indicadoras
    for (let a = 0; a < 3; a++) {
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.4, 4),
        hazardMat,
      );
      arrow.position.set(0, 1.05, -1.0 + a * 1.0);
      arrow.rotation.x = -Math.PI / 2;
      group.add(arrow);
    }

    group.traverse((c) => {
      if (c.isMesh) c.castShadow = c.receiveShadow = true;
    });

    group.userData = {
      type: "ramp",
      damage: 0,
      collisionHalfX: 1.8,
      collisionHalfZ: 2.0,
      collisionFootprint: "box",
      height: 0,
      collisionYMin: 0,
      collisionYMax: 0.55,
      isRamp: true,
    };
    return group;
  }

  // Scrap (basura metálica)
  const groupScrap = new THREE.Group();
  const scrapR = 1.15;
  if (world.assets.models["scrap"]) {
    const clone = world.assets.models["scrap"].clone();
    groupScrap.add(clone);
  } else {
    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(scrapR, 0),
      new THREE.MeshStandardMaterial({ color: "#56342c", roughness: 1 }),
    );
    core.position.y = scrapR;
    // Añadimos una viga incrustada
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 2.5, 0.2),
      darkMetal,
    );
    beam.position.y = scrapR;
    beam.rotation.set(0.4, 0.2, 0.8);
    groupScrap.add(core, beam);
    groupScrap.traverse((c) => {
      if (c.isMesh) c.castShadow = c.receiveShadow = true;
    });
  }

  groupScrap.userData = {
    type: "obstacle",
    obstacleSpin: "scrap",
    damage: 16,
    collisionHalfX: 1.12,
    collisionHalfZ: 1.12,
    height: 0,
    collisionYMin: 0,
    collisionYMax: scrapR * 2,
  };
  return groupScrap;
}

/** Contorno en el suelo alineado con la huella de colisión (no un donut genérico). */
function createFootprintMarker(obstacle, kind) {
  const ud = obstacle.userData;
  const color =
    kind === "tower"
      ? "#ff6b47"
      : kind === "barrier"
        ? "#ffb84d"
        : kind === "raider"
          ? "#ff4d72"
          : "#ff8c61";
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const y = 0.06;
  const group = new THREE.Group();
  group.position.set(obstacle.position.x, 0, obstacle.position.z);

  if (ud.collisionFootprint === "circle") {
    const r =
      ud.collisionRadius ??
      Math.max(ud.collisionHalfX ?? 1, ud.collisionHalfZ ?? 1);
    const segs = 28;
    const pts = [];
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    group.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat),
    );
  } else {
    const hx = ud.collisionHalfX ?? ud.radius ?? 1;
    const hz = ud.collisionHalfZ ?? ud.radius ?? 1;
    const rect = [
      new THREE.Vector3(-hx, y, -hz),
      new THREE.Vector3(hx, y, -hz),
      new THREE.Vector3(hx, y, hz),
      new THREE.Vector3(-hx, y, hz),
      new THREE.Vector3(-hx, y, -hz),
    ];
    group.add(
      new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rect), mat),
    );
  }
  return group;
}

function applyRoadsideShadows(node) {
  node.traverse((ch) => {
    if (ch.isMesh) {
      ch.castShadow = true;
      ch.receiveShadow = true;
    }
  });
  prepareFadableObject(node);
}

function createDune() {
  const baseR = 0.8 + Math.random() * 3.5;
  const heightScale = 0.25 + Math.random() * 0.5;
  const geo = new THREE.SphereGeometry(baseR, 48, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > -0.2) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Fractal displacement — more varied patterns
      const disp =
        Math.sin(x * 1.8) * Math.cos(z * 2.1) * 0.25 +
        Math.sin(x * 4.5 + z * 0.7) * 0.08 +
        Math.sin(x * 0.6 + z * 5.5) * 0.06;
      const jitter = (Math.random() - 0.5) * 0.12;
      pos.setX(i, x + jitter + disp * 0.6);
      pos.setZ(i, z + jitter + disp * 0.6);
      pos.setY(i, y + (Math.random() - 0.5) * 0.08 + disp);
    }
  }
  // Flatten bottom so dunes sit better on ground
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -0.3) pos.setY(i, -0.3);
  }
  geo.computeVertexNormals();

  // Some dunes are more elongated (wind-shaped)
  const xzScale = new THREE.Vector3(
    1 + (Math.random() - 0.5) * 0.8,
    heightScale,
    1 + (Math.random() - 0.5) * 0.8,
  );

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(
        0.06 + Math.random() * 0.04,
        0.4 + Math.random() * 0.2,
        0.3 + Math.random() * 0.2,
      ),
      roughness: 0.95,
      bumpMap: world.terrainBumpTexture,
      roughnessMap: world.terrainRoughnessTexture,
      bumpScale: 0.12,
    }),
  );
  mesh.scale.set(xzScale.x, xzScale.y, xzScale.z);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  // Wind ripples on top of dune (small crest detail)
  if (Math.random() > 0.5) {
    const crestR = baseR * 0.3;
    const crest = new THREE.Mesh(
      new THREE.SphereGeometry(crestR, 12, 6),
      mesh.material,
    );
    crest.position.set(0, baseR * heightScale * 0.9, crestR * 0.4);
    crest.scale.set(0.7, 0.15, 0.7);
    mesh.userData.crest = crest;
    mesh.add(crest);
  }

  mesh.userData = { ...(mesh.userData || {}), isDune: true, baseY: -0.25, baseR, heightScale };
  return mesh;
}

function createScatteredBoulder() {
  const root = new THREE.Group();
  const mRock = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.07 + Math.random() * 0.05, 0.15 + Math.random() * 0.1, 0.3 + Math.random() * 0.15),
    roughness: 0.9,
    metalness: 0.05,
    bumpMap: world.terrainBumpTexture,
    roughnessMap: world.terrainRoughnessTexture,
    bumpScale: 0.25,
  });
  
  const mBush = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.13 + Math.random() * 0.04, 0.2, 0.3 + Math.random() * 0.1),
    roughness: 1,
    metalness: 0,
  });

  // Some boulders are small clusters, some are larger formations
  const isLarge = Math.random() > 0.7;
  const n = isLarge ? (2 + Math.floor(Math.random() * 3)) : (1 + Math.floor(Math.random() * 5));
  for (let b = 0; b < n; b += 1) {
    const r = isLarge ? (1.2 + Math.random() * 2.2) : (0.3 + Math.random() * 1.0);
    const geo = new THREE.IcosahedronGeometry(r, isLarge ? 4 : 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const val = Math.random();
      pos.setXYZ(
        i,
        pos.getX(i) * (1 + val * 0.2),
        pos.getY(i) * (1 + val * 0.25),
        pos.getZ(i) * (1 + val * 0.2),
      );
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mRock);
    mesh.position.set(
      (Math.random() - 0.5) * (isLarge ? 1.5 : 2.5),
      0,
      (Math.random() - 0.5) * (isLarge ? 1.5 : 2.5),
    );
    mesh.rotation.set(Math.random(), Math.random(), Math.random());
    mesh.scale.y = 0.5 + Math.random() * 0.6;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);

    if (Math.random() > 0.45) {
      const bushGrp = new THREE.Group();
      const stalkCount = 2 + Math.floor(Math.random() * 5);
      for (let s = 0; s < stalkCount; s++) {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.3 + Math.random() * 0.7, 3), mBush);
        stalk.position.y = 0.15;
        stalk.rotation.set((Math.random() - 0.5) * 1.5, Math.random() * Math.PI, (Math.random() - 0.5) * 1.5);
        bushGrp.add(stalk);
      }
      bushGrp.position.copy(mesh.position);
      bushGrp.position.x += (Math.random() > 0.5 ? 1 : -1) * (r * 0.7 + Math.random() * 0.5);
      bushGrp.position.z += (Math.random() > 0.5 ? 1 : -1) * (r * 0.7 + Math.random() * 0.5);
      root.add(bushGrp);
    }
  }
  applyRoadsideShadows(root);
  return root;
}

function createBackdropMesa(i) {
  const root = new THREE.Group();
  const dark = 0.1 + (i % 6) * 0.03;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.05, 0.25, dark),
    roughness: 0.95,
    metalness: 0.05,
    bumpMap: world.terrainBumpTexture,
    bumpScale: 0.4,
  });

  const columns = 4 + (i % 5);
  for (let c = 0; c < columns; c += 1) {
    const h = 8 + Math.random() * 25;
    const r = 3 + Math.random() * 6;
    const geo = new THREE.CylinderGeometry(r * 0.6, r, h, 10, 8);
    const pos = geo.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      const y = pos.getY(j);
      const currentX = pos.getX(j);
      const currentZ = pos.getZ(j);
      const len = Math.sqrt(currentX * currentX + currentZ * currentZ) || 1;
      
      // Create stratified horizontal ridges
      const strata = Math.sin(y * 1.5) * 0.6 + Math.sin(y * 3.0) * 0.3;
      const rPerturb = (Math.random() - 0.5) * 0.8;
      
      pos.setX(j, currentX + (currentX / len) * strata + rPerturb);
      pos.setZ(j, currentZ + (currentZ / len) * strata + rPerturb);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (Math.random() - 0.5) * 12,
      h * 0.5 - 1,
      (Math.random() - 0.5) * 12,
    );
    mesh.rotation.y = Math.random();
    mesh.rotation.z = (Math.random() - 0.5) * 0.1;
    root.add(mesh);
  }

  root.userData.speedFactor = 0.04 + Math.random() * 0.03;
  root.position.set(
    (Math.random() > 0.5 ? 1 : -1) * (55 + Math.random() * 25),
    0,
    -100 + Math.random() * 400,
  );
  applyRoadsideShadows(root);
  return root;
}

function recycleBackdrop(m) {
  const side = Math.random() > 0.5 ? 1 : -1;
  m.position.set(
    side * (44 + Math.random() * 36),
    0,
    160 + Math.random() * 130,
  );
  m.rotation.y =
    side * (0.08 + Math.random() * 0.1) * (0.3 + Math.random() * 0.5);
}

function createCityBackdrop(i) {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.6, 0.08, 0.18 + (i % 5) * 0.03),
    roughness: 0.92,
    metalness: 0.08,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: "#e8f5ff",
    emissive: "#aaddff",
    emissiveIntensity: 0.8,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: "#3d4148",
    metalness: 0.6,
    roughness: 0.4,
  });

  const isIndustrial = i % 4 === 0;

  if (isIndustrial) {
    // Industrial Silos or Cooling Towers
    const towers = 2 + (i % 2);
    for (let index = 0; index < towers; index++) {
      const h = 15 + Math.random() * 15;
      const r = 5 + Math.random() * 5;
      const coolingTower = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.7, r, h, 12),
        mat,
      );
      coolingTower.position.set(
        (Math.random() - 0.5) * 30,
        h * 0.5 - 1,
        (Math.random() - 0.5) * 15,
      );
      root.add(coolingTower);
      // Steam/smoke indicator (just a darker top)
      const top = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.7, 0.2, 8, 12).applyMatrix4(
          new THREE.Matrix4().makeRotationX(Math.PI / 2),
        ),
        steelMat,
      );
      top.position.y = h - 1;
      coolingTower.add(top);
    }
  } else {
    const towers = 3 + (i % 4);
    for (let index = 0; index < towers; index += 1) {
      const h = 14 + Math.random() * 34;
      const w = 4 + Math.random() * 7;
      const d = w * (0.8 + Math.random() * 0.7);
      const isRuined = Math.random() > 0.5;

      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

      tower.position.set(
        (Math.random() - 0.5) * 24,
        h * 0.5 - 1,
        (Math.random() - 0.5) * 10,
      );
      tower.rotation.y = (Math.random() - 0.5) * 0.12;

      // Simulate floors and windows with glowing bands
      const floors = Math.floor(h / 2.5);
      for (let f = 1; f < floors; f++) {
        if (isRuined && f > floors * 0.7 && Math.random() > 0.5) continue; // Ruined top
        if (Math.random() > 0.4) continue; // Randomly skip floors
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(w * 1.01, 0.25, d * 1.01),
          windowMat,
        );
        band.position.y = f * 2.5 - h * 0.5;
        tower.add(band);
      }

      // Add exposed girders if ruined
      if (isRuined && Math.random() > 0.3) {
        for (let g = 0; g < 3; g++) {
          const girder = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 4 + Math.random() * 4, 0.1),
            steelMat,
          );
          girder.position.set(
            (Math.random() - 0.5) * w,
            h * 0.4 + Math.random() * (h * 0.1),
            (Math.random() - 0.5) * d,
          );
          girder.rotation.set(
            Math.random() * 0.5,
            Math.random() * 0.5,
            Math.random() * 0.5,
          );
          tower.add(girder);
        }
      }

      root.add(tower);

      // Rooftop details: AC units, water tanks, vents
      if (Math.random() > 0.4) {
        const roofY = h * 0.5;
        if (Math.random() > 0.5) {
          // AC unit
          const ac = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 1.2, d * 0.3), steelMat);
          ac.position.set((Math.random()-0.5) * w * 0.5, roofY + 0.6, (Math.random()-0.5) * d * 0.5);
          ac.rotation.y = Math.random();
          tower.add(ac);
          if (Math.random() > 0.4) {
            const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), steelMat);
            fan.position.set(0, 0.7, 0);
            ac.add(fan);
          }
        } else {
          // Water tank / vent stack
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.15, w * 0.15, 2.5, 8), steelMat);
          tank.position.set((Math.random()-0.5) * w * 0.4, roofY + 1.3, (Math.random()-0.5) * d * 0.4);
          tower.add(tank);
        }
      }
    }
  }

  root.userData.speedFactor = 0.05 + Math.random() * 0.03;
  recycleCityBackdrop(root);
  applyRoadsideShadows(root);
  return root;
}

function recycleCityBackdrop(root) {
  const side = Math.random() > 0.5 ? 1 : -1;
  root.position.set(
    side * (48 + Math.random() * 26),
    0,
    160 + Math.random() * 140,
  );
  root.rotation.y = (Math.random() - 0.5) * 0.08;
}

function createCityRoadsideProp(index) {
  const kind = index % 9;
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: "#5a6069",
    roughness: 0.75,
    metalness: 0.35,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: "#6f757d",
    roughness: 0.95,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: "#c6efff",
    emissive: "#8ad4ff",
    emissiveIntensity: 0.45,
  });
  const rust = new THREE.MeshStandardMaterial({
    color: "#654f4c",
    roughness: 0.95,
  });

  if (kind === 0) {
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 1.1, 0.8),
      concrete,
    );
    const light = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.08), glow);
    light.position.set(0, 0.05, 0.42);
    root.add(barrier, light);
  } else if (kind === 1) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 5.8, 8),
      steel,
    );
    pole.position.y = 2.9;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.1), rust);
    sign.position.set(0, 4.1, 0.18);
    root.add(pole, sign);

    // Hanging cables (simple approximation with lines or thin boxes)
    const cableMat = new THREE.MeshStandardMaterial({
      color: "#111",
      roughness: 1,
    });
    for (let i = 0; i < 2; i++) {
      const cable = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 15),
        cableMat,
      );
      cable.position.set(0.1, 4.5 + i * 0.4, 7.5);
      cable.rotation.x = 0.05;
      root.add(cable);
    }
  } else if (kind === 2) {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 3.1), rust);
    shell.position.set(0, 0.45, 0);
    shell.rotation.set(0.08, Math.random(), -0.12);
    root.add(shell);
  } else if (kind === 3) {
    const hydrant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.28, 0.9, 10),
      rust,
    );
    hydrant.position.y = 0.45;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.12), steel);
    arm.position.set(0.22, 0.55, 0);
    root.add(hydrant, arm);
  } else if (kind === 4) {
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.32, 0.85, 12),
      glow,
    );
    cone.position.y = 0.42;
    root.add(cone);
  } else if (kind === 5) {
    const wallA = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.6, 0.4),
      concrete,
    );
    const wallB = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.1, 0.4),
      concrete,
    );
    wallA.position.set(0, 0.8, 0);
    wallB.position.set(0.95, 0.55, 0.2);
    wallB.rotation.y = (Math.random() - 0.5) * 0.3;
    root.add(wallA, wallB);
  } else if (kind === 6) {
    // Long Curb / Sidewalk Segment
    const curb = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 12), concrete);
    curb.position.y = 0.2;
    if (Math.random() > 0.5) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), steel);
      pole.position.set(0.4, 2.5, 0);
      pole.rotation.x = (Math.random()-0.5) * 0.5;
      root.add(pole);
    }
    root.add(curb);
    root.userData.isCurb = true;
  } else if (kind === 7) {
    // Broken lamppost
    const basePost = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.5, 8), steel);
    basePost.position.y = 1.75;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.15), steel);
    arm.position.set(1.1, 3.3, 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 4), glow);
    lamp.position.set(2.0, 3.2, 0);
    // Flickering effect via emissive random
    lamp.userData.isLamp = true;
    root.add(basePost, arm, lamp);
    root.userData.isLampPost = true;
  } else {
    // Trash pile / debris cluster (kind 8)
    const trashMat = new THREE.MeshStandardMaterial({ color: "#3d3834", roughness: 1 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), trashMat);
    b1.position.set(0, 0.15, 0);
    b1.rotation.y = Math.random();
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.6), trashMat);
    b2.position.set(0.4, 0.25, -0.1);
    b2.rotation.set(0.2, Math.random(), 0.3);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), trashMat);
    bag.position.set(-0.3, 0.3, 0.2);
    bag.scale.y = 0.6;
    const cardboard = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.4), new THREE.MeshStandardMaterial({ color: "#8a7e6d" }));
    cardboard.position.set(0.2, 0.4, -0.3);
    cardboard.rotation.set(0.3, 0.5, 0.1);
    root.add(b1, b2, bag, cardboard);
    root.userData.isTrash = true;
  }

  applyRoadsideShadows(root);
  root.userData.speedFactor = 0.9 + Math.random() * 0.12;
  recycleCityRoadsideProp(root, true);
  return root;
}

function recycleCityRoadsideProp(prop, initial = false) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const dist = prop.userData.isCurb ? 6.5 : (10 + Math.random() * 18);
  prop.position.set(
    side * dist,
    0,
    (initial ? Math.random() * 220 : 220) + Math.random() * 90,
  );
  prop.rotation.y = prop.userData.isCurb ? 0 : (side === 1 ? -0.04 : 0.04);
}

function createRoadsideProp(index) {
  const kind = index % 21;
  const root = new THREE.Group();

  const mRust = (l) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.06, 0.2, l),
      roughness: 0.95,
      bumpMap: world.terrainBumpTexture,
      bumpScale: 0.1,
    });
  const mW = new THREE.MeshStandardMaterial({
    color: "#3a2d26",
    roughness: 0.9,
    bumpMap: world.terrainBumpTexture,
    bumpScale: 0.2,
  });
  const mConc = new THREE.MeshStandardMaterial({
    color: "#6a6560",
    roughness: 0.95,
    bumpMap: world.terrainBumpTexture,
    bumpScale: 0.3,
  });
  const mSteel = new THREE.MeshStandardMaterial({
    color: "#3d4148",
    metalness: 0.5,
    roughness: 0.6,
  });
  const mEm = (c, i) =>
    new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: i,
    });
  const mDirt = new THREE.MeshStandardMaterial({
    color: "#4d3628",
    roughness: 1,
  });
  const mDead = new THREE.MeshStandardMaterial({
    color: "#4a3d32",
    roughness: 1,
  });

  if (kind === 0) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 0.4, 8),
      mConc,
    );
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.15, 6, 8),
      mSteel,
    );
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.14), mSteel);
    const bH = 2.2;
    base.position.y = 0.2;
    pole.position.y = bH + 2.5;
    arm.position.set(0, bH + 5.15, 0.15);
    arm.rotation.z = (Math.random() - 0.5) * 0.1;
    const lL = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.15, 0.2),
      mEm("#ffc080", 0.95),
    );
    const lR = lL.clone();
    lL.position.set(-0.8, bH + 4.9, 0.28);
    lR.position.set(0.8, bH + 4.9, 0.28);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mSteel);
    cap.position.set(0, bH + 5.2, 0.25);
    root.add(base, pole, arm, lL, lR, cap);
  } else if (kind === 1) {
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), mW);
    const pR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.9, 0.25), mW);
    pL.position.set(-0.8, 1.6, 0);
    pR.position.set(0.8, 1.45, 0);
    pL.rotation.z = (Math.random() - 0.5) * 0.1;
    pR.rotation.z = (Math.random() - 0.5) * 0.1;
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.2, 0.1),
      mRust(0.35),
    );
    face.position.set(0, 2.3, 0);
    face.rotation.z = (Math.random() - 0.5) * 0.2;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.25, 1.9),
      mEm("#1a1a1a", 0),
    );
    bar.position.set(0, 2.3, 0.1);
    root.add(pL, pR, face, bar);
  } else if (kind === 2) {
    // Vehículo oxidado más realista
    const ch = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 3.2),
      mRust(0.22),
    );
    ch.position.set(0, 0.4, 0);
    ch.rotation.set(0.1, Math.random(), 0.15);
    const c2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.5, 1.2),
      mRust(0.18),
    );
    c2.position.set(-0.1, 0.9, -0.2);
    c2.rotation.z = -0.1;

    const wMat = new THREE.MeshStandardMaterial({
      color: "#100d0d",
      roughness: 1,
    });
    for (const [wx, wz] of [
      [0.85, 1.2],
      [-0.85, 0.5],
      [0.85, -0.8],
      [-0.85, -1.3],
    ]) {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).applyMatrix4(
          new THREE.Matrix4().makeRotationZ(Math.PI / 2),
        ),
        wMat,
      );
      w.position.set(wx, 0.3, wz);
      w.rotation.set(Math.random(), Math.random(), Math.random());
      root.add(w);
    }
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.25, 1.0),
      mRust(0.25),
    );
    hood.position.set(0, 0.5, 1.5);
    hood.rotation.x = -0.15;
    root.add(ch, c2, hood);
  } else if (kind === 3) {
    for (let s = 0; s < 5; s += 1) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.15), mSteel);
      st.position.set(-1.2 + s * 0.6, 0.4, 0.15);
      st.rotation.x = (Math.random() - 0.5) * 0.2;
      root.add(st);
    }
    for (const y of [0.45, 0.95]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 0.15, 0.08),
        mEm("#9aa0a8", 0.1),
      );
      rail.position.set(0, y, 0.1);
      rail.rotation.z = (Math.random() - 0.5) * 0.05;
      root.add(rail);
    }
  } else if (kind === 4) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.5, 0.7), mConc);
    a.position.set(-0.6, 1.75, 0);
    const b = a.clone();
    b.position.set(0.6, 1.75, 0);
    a.rotation.y = Math.random() * 0.2;
    b.rotation.y = Math.random() * 0.2;
    const g = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.45, 0.1),
      mRust(0.35),
    );
    g.position.set(0, 2.8, 0.3);
    g.rotation.z = (Math.random() - 0.5) * 0.2;
    const low = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 1.8), mSteel);
    low.position.set(0, 0.2, 0.4);
    root.add(a, b, g, low);
  } else if (kind === 5) {
    const cMat = mRust(0.32);
    const st = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 8);
    const main = new THREE.Mesh(st, cMat);
    main.position.set(0, 0.6, 0);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), cMat);
    top.position.set(0, 1.2, 0.15);
    const arm1 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), cMat);
    arm1.position.set(0, 0.5, 0.22);
    arm1.scale.set(0.4, 0.6, 0.3);
    const arm2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), cMat);
    arm2.position.set(0.15, 0.7, -0.1);
    arm2.scale.set(0.4, 0.5, 0.25);
    root.add(main, top, arm1, arm2);
  } else if (kind === 6) {
    for (let b = 0; b < 4; b += 1) {
      const bld = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.5 + b * 0.1, 1),
        b % 2 === 0 ? mDirt : mDead,
      );
      bld.position.set((b - 1.5) * 0.5, 0.2 + b * 0.25, b * 0.1);
      bld.rotation.set(Math.random(), Math.random(), Math.random());
      bld.scale.set(1, 0.6 + Math.random() * 0.4, 1.2);
      root.add(bld);
    }
  } else if (kind === 7) {
    const wM = new THREE.MeshStandardMaterial({
      color: "#141210",
      roughness: 1,
    });
    for (let t = 0; t < 4; t += 1) {
      const tor = new THREE.Mesh(
        new THREE.TorusGeometry(
          0.25 + Math.random() * 0.05,
          0.05,
          8,
          20,
        ).applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)),
        wM,
      );
      tor.position.set(
        (Math.random() - 0.5) * 0.2,
        0.1 + t * 0.15,
        (Math.random() - 0.5) * 0.2,
      );
      tor.rotation.set(Math.random() * 0.4, Math.random() * 0.4, 0);
      root.add(tor);
    }
  } else if (kind === 8) {
    const oMat = mRust(0.28);
    for (const dx of [0, 0.6, -0.6]) {
      if (Math.random() > 0.8) continue;
      const dr = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.6, 12),
        oMat,
      );
      dr.position.set(dx, 0.3, (Math.random() - 0.5) * 0.2);
      dr.rotation.set(Math.random() * 0.2, 0, Math.random() * 0.2);
      root.add(dr);
    }
    const cr = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.25),
      mEm("#4a2e18", 0),
    );
    cr.position.set(0.25, 0.05, 0.15);
    root.add(cr);
  } else if (kind === 9) {
    const postA = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 1.5, 8),
      mConc,
    );
    postA.position.set(-0.3, 0.75, 0.3);
    const postB = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 1.5, 8),
      mConc,
    );
    postB.position.set(-0.3, 0.75, -0.6);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.1), mSteel);
    w.position.set(-0.3, 1.3, -0.15);
    w.rotation.x = Math.random() * 0.2;
    const postA2 = postA.clone();
    const postB2 = postB.clone();
    postA2.position.set(0.3, 0.75, 0.3);
    postB2.position.set(0.3, 0.75, -0.6);
    const w2 = w.clone();
    w2.position.set(0.3, 1.3, -0.15);
    const cat = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 1.0), mSteel);
    cat.position.set(0, 0.1, -0.15);
    root.add(postA, postB, w, postA2, postB2, w2, cat);
  } else if (kind === 10) {
    const p0 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), mW);
    p0.position.set(-0.4, 0.8, 0.05);
    p0.rotation.z = (Math.random() - 0.5) * 0.2;
    const p1 = p0.clone();
    p1.position.set(0.4, 0.8, 0.05);
    p1.rotation.z = (Math.random() - 0.5) * 0.2;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.45, 0.06),
      mEm("#1e1612", 0.12),
    );
    board.position.set(0, 1.0, 0.1);
    board.rotation.z = (Math.random() - 0.5) * 0.3;
    const br = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.25, 0.08),
      mRust(0.35),
    );
    br.position.set(0, 0.2, 0.15);
    br.rotation.set(0, 0, -0.4);
    root.add(p0, p1, board, br);
  } else if (kind === 11) {
    // Estructura de tubería
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 2.5, 12),
      mRust(0.4),
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 0.4, 0);
    const joint = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 12),
      mRust(0.3),
    );
    joint.position.set(1.2, 0.4, 0);
    const pipe2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1.5, 12),
      mRust(0.4),
    );
    pipe2.position.set(1.2, 1.15, 0);
    root.add(pipe, joint, pipe2);
  } else if (kind === 12) {
    // Restos de muro de hormigón
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 0.4), mConc);
    wall1.position.set(0, 0.6, 0);
    wall1.rotation.y = (Math.random() - 0.5) * 0.2;
    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.4), mConc);
    wall2.position.set(1.8, 0.4, 0.2);
    wall2.rotation.y = (Math.random() - 0.5) * 0.6;
    root.add(wall1, wall2);
  } else if (kind === 13) {
    // Árbol muerto más complejo
    const tr = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.2, 1.2, 6),
      mDead,
    );
    tr.position.set(0, 0.6, 0.05);
    tr.rotation.x = (Math.random() - 0.5) * 0.2;
    tr.rotation.z = (Math.random() - 0.5) * 0.2;
    for (let r = 0; r < 4; r++) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.08, 0.8, 5),
        mDead,
      );
      arm.position.set(
        (Math.random() - 0.5) * 0.3,
        0.6 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.3,
      );
      arm.rotation.set(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 2,
        (Math.random() - 0.5) * 1.5,
      );
      root.add(arm);
    }
    root.add(tr);
  } else if (kind === 14) {
    // Cactus
    const mGreen = new THREE.MeshStandardMaterial({
      color: "#5b7348",
      roughness: 0.9,
      bumpMap: world.terrainBumpTexture,
      bumpScale: 0.3,
    });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.0, 7), mGreen);
    trunk.position.y = 1.0;
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), mGreen);
    arm1.position.set(0.3, 1.2, 0);
    arm1.rotation.z = -0.4;
    const arm1Up = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6), mGreen);
    arm1Up.position.set(0.45, 1.6, 0);
    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 6), mGreen);
    arm2.position.set(-0.25, 0.8, 0);
    arm2.rotation.z = 0.5;
    const arm2Up = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), mGreen);
    arm2Up.position.set(-0.4, 1.1, 0);
    root.add(trunk, arm1, arm1Up, arm2, arm2Up);
  } else if (kind === 15) {
    // Highway Gantry (Pórtico)
    const gWidth = 35;
    const gHeight = 8;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.6, gHeight, 0.6), mSteel);
    legL.position.set(-gWidth / 2, gHeight / 2, 0);
    const legR = legL.clone();
    legR.position.set(gWidth / 2, gHeight / 2, 0);
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(gWidth + 1, 0.8, 0.8),
      mSteel,
    );
    beam.position.set(0, gHeight - 0.4, 0);
    // Large rusted sign on the gantry
    const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.2), mRust(0.3));
    sign.position.set(-gWidth * 0.2, gHeight - 1, 0.5);
    const sign2 = new THREE.Mesh(
      new THREE.BoxGeometry(6, 2.5, 0.2),
      mRust(0.25),
    );
    sign2.position.set(gWidth * 0.15, gHeight - 1, 0.5);
    root.add(legL, legR, beam, sign, sign2);
    root.userData.isGantry = true;
  } else if (kind === 16) {
    // Communication Tower
    const tH = 18;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.2, 2, 4),
      mConc,
    );
    base.position.y = 1;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.6, tH, 4),
      mSteel,
    );
    tower.position.y = tH / 2 + 1.5;
    // Dishes
    const dishMat = new THREE.MeshStandardMaterial({
      color: "#777",
      roughness: 0.6,
    });
    for (let d = 0; d < 3; d++) {
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 8, 8, 0, Math.PI),
        dishMat,
      );
      dish.position.set(0, tH - 2 - d * 3, 0.4);
      dish.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      dish.rotation.y = Math.random() * Math.PI;
      root.add(dish);
    }
    // Red blinking light
    const redLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.15),
      mEm("#ff0000", 2),
    );
    redLight.position.y = tH + 1.6;
    root.add(base, tower, redLight);
  } else if (kind === 17) {
    // Industrial Silo
    const sH = 6;
    const silo = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, sH, 12),
      mRust(0.2),
    );
    silo.position.y = sH / 2;
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(2.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      mRust(0.15),
    );
    top.position.y = sH;
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.4, sH, 0.1), mSteel);
    ladder.position.set(0, sH / 2, 2.05);
    root.add(silo, top, ladder);
  } else if (kind === 18) {
    // Warning road sign (triangular)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3.5, 8), mSteel);
    pole.position.y = 1.75;
    pole.rotation.x = (Math.random() - 0.5) * 0.1;
    const triShape = new THREE.Shape();
    const triSize = 1.2;
    triShape.moveTo(0, triSize);
    triShape.lineTo(-triSize * 0.87, -triSize * 0.5);
    triShape.lineTo(triSize * 0.87, -triSize * 0.5);
    triShape.closePath();
    const triGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    const board = new THREE.Mesh(triGeo, mEm("#c45a20", 0.35));
    board.position.set(0, 3.0, 0.05);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), mSteel);
    post.position.set(0, 2.1, 0.1);
    post.rotation.x = (Math.random() - 0.5) * 0.15;
    root.add(pole, board, post);
  } else if (kind === 19) {
    // Wrecked semi-trailer (remolque grande aplastado)
    const trMat = mRust(0.2);
    const trailerBody = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.6, 9), trMat);
    trailerBody.position.set(0, 1.3, 0);
    trailerBody.rotation.z = (Math.random() - 0.5) * 0.25;
    trailerBody.rotation.x = (Math.random() - 0.5) * 0.08;
    // Corrugated side details
    for (let s = 0; s < 8; s++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.1), mRust(0.25));
      rib.position.set(0, 0.3 + s * 0.3, 4.5);
      trailerBody.add(rib);
    }
    // Smashed cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.5), mRust(0.18));
    cabin.position.set(0, 0.9, -5.5);
    cabin.rotation.x = 0.2;
    cabin.rotation.z = (Math.random() - 0.5) * 0.3;
    const windowHole = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.15), mEm("#0a0806", 0));
    windowHole.position.set(0, 1.2, -4.2);
    // Wheels
    const wMat = new THREE.MeshStandardMaterial({ color: "#0d0b0a", roughness: 1 });
    for (const [wx, wz] of [[1.9, -5.5], [-1.9, -5.5], [1.9, -3.8], [-1.9, -3.8]]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.25, 12).applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), wMat);
      wh.position.set(wx, 0.25, wz);
      root.add(wh);
    }
    root.add(trailerBody, cabin, windowHole);
  } else if (kind === 20) {
    // Junk pile (misc debris cluster)
    const junkMats = [mRust(0.3), mRust(0.2), mSteel, mDirt, mConc];
    const basePile = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 + Math.random() * 0.8, 1), mDirt);
    basePile.position.y = 0.4;
    basePile.scale.y = 0.4;
    root.add(basePile);
    for (let j = 0; j < 12; j++) {
      const mat = junkMats[Math.floor(Math.random() * junkMats.length)];
      const junkGeo = Math.random() > 0.5
        ? new THREE.BoxGeometry(0.2 + Math.random() * 0.8, 0.08 + Math.random() * 0.3, 0.3 + Math.random() * 1.2)
        : new THREE.CylinderGeometry(0.08 + Math.random() * 0.2, 0.08 + Math.random() * 0.2, 0.3 + Math.random() * 1.5, 6);
      const junk = new THREE.Mesh(junkGeo, mat);
      junk.position.set(
        (Math.random() - 0.5) * 2.0,
        0.2 + Math.random() * 1.2,
        (Math.random() - 0.5) * 2.0,
      );
      junk.rotation.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.8);
      root.add(junk);
    }
  }

  applyRoadsideShadows(root);
  root.userData.speedFactor = 0.85 + Math.random() * 0.15;
  recycleRoadsideProp(root, true);
  return root;
}

function recycleRoadsideProp(prop, initial = false) {
  if (prop.userData.isGantry) {
    prop.position.set(
      0,
      0,
      (initial ? Math.random() * 240 : 200) + Math.random() * 120,
    );
    prop.rotation.set(0, 0, 0);
    return;
  }
  const side = Math.random() > 0.5 ? 1 : -1;
  const dist = 10.5 + Math.random() * 28;
  prop.position.set(
    side * dist,
    0,
    (initial ? Math.random() * 240 : 200) + Math.random() * 120,
  );
  prop.rotation.y =
    (side === 1 ? -1 : 1) * (0.1 + Math.random() * 0.4) +
    (Math.random() - 0.5) * 0.2;
  prop.rotation.x = (Math.random() - 0.5) * 0.08;
  prop.rotation.z = (Math.random() - 0.5) * 0.08;
}
