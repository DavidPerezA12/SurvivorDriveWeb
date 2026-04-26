import "./style.css";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { createInputState, applyKeyToInput } from "./game/input.js";
import {
  biomeCatalog,
  contentManifest,
  equipmentCatalog,
  environmentProfiles as rawEnvironmentProfiles,
  objectiveCatalog,
  schemaVersion,
  skyPalette as rawSkyPalette,
  speedPips,
} from "./game/content.js";
import { loadSaveData, saveSaveData, registerRunResult, unlockCity } from "./game/persistence.js";
import { GameRoute, biomeFromRoute, isRunRoute, routeForBiome, screenForRoute } from "./game/routes.js";
import { applyLoadout, choosePickupType, createRunState, resolveCollision, resolvePickup, spawnEncounter, updateRunProgression } from "./game/simulation.js";
import { mountApp, updateCityAccessUI } from "./game/ui.js";

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
      Object.entries(palette).map(([key, color]) => [key, new THREE.Color(color)]),
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
  pickupPool: [],
  projectilePool: [],
  particles: [],
  dustBands: [],
  roadsideProps: [],
  roadsideBackdrop: [],
  cityProps: [],
  cityBackdrop: [],
  dunes: [],
  boulders: [],
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
    models: {}
  }
};

let messageTimer = 0;
const engineAudio = { osc: null, gain: null, filter: null };
const skidAudio = { noise: null, gain: null };

setupThree();
setupUI();
applyOptions();
updateCityAccessUI(hud, state.unlocks.city);
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
  return world.run?.biome ?? world.environment.biome ?? biomeFromRoute(world.route);
}

function setupThree() {
  world.renderer.outputColorSpace = THREE.SRGBColorSpace;
  world.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  world.renderer.toneMappingExposure = 1.15; // Un poco más realista/luminoso
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  world.pmrem = new THREE.PMREMGenerator(world.renderer);
  const room = new RoomEnvironment();
  world.envTexture = world.pmrem.fromScene(room, 0.0).texture;
  // REMOVED world.scene.environment to prevent all objects from looking like they are in a white studio
  room.dispose();

  world.scene.fog = new THREE.FogExp2("#9e7447", 0.007);
  world.scene.background = new THREE.Color("#120b08");

  const ambient = new THREE.HemisphereLight("#a88768", "#211108", 0.7);
  world.scene.add(ambient);
  world.lights.ambient = ambient;

  // Luz de relleno más oscura, azulada
  const fill = new THREE.DirectionalLight("#606f7d", 0.2);
  fill.position.set(-20, 15, -10);
  world.scene.add(fill);

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(12, 64),
    new THREE.MeshBasicMaterial({ color: "#ffcf8a", transparent: true, opacity: 0.85 }),
  );
  sunDisc.position.set(0, 42, -130);
  world.scene.add(sunDisc);
  world.lights.sunDisc = sunDisc;

  const sun = new THREE.DirectionalLight("#fff0d4", 3.2); // Más intensidad
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

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(450, 600, 32, 32), sandMaterial);
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
    color: "#f6f1e8",
    map: roadData.map,
    bumpMap: roadData.bumpMap,
    roughnessMap: roadData.roughnessMap,
    bumpScale: 0.15,
    roughness: 0.85,
    metalness: 0.1,
  });

  const road = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 600, 16, 64), roadMaterial);
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
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 600, 4, 64), shoulderMaterial);
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

  for (let i = 0; i < 70; i += 1) {
    const dune = createDune();
    recycleEnvironmentObject(dune, true, 10, 80, -35, 300);
    world.scene.add(dune);
    world.dunes.push(dune);
  }

  for (let i = 0; i < 65; i += 1) {
    const prop = createRoadsideProp(i);
    world.scene.add(prop);
    world.roadsideProps.push(prop);
  }

  for (let i = 0; i < 28; i += 1) {
    const b = createBackdropMesa(i);
    world.scene.add(b);
    world.roadsideBackdrop.push(b);
  }

  for (let i = 0; i < 38; i += 1) {
    const prop = createCityRoadsideProp(i);
    prop.visible = false;
    world.scene.add(prop);
    world.cityProps.push(prop);
  }

  for (let i = 0; i < 18; i += 1) {
    const skyline = createCityBackdrop(i);
    skyline.visible = false;
    world.scene.add(skyline);
    world.cityBackdrop.push(skyline);
  }

  for (let i = 0; i < 80; i += 1) {
    const boulder = createScatteredBoulder();
    recycleEnvironmentObject(boulder, true, 10, 85, -50, 320);
    world.scene.add(boulder);
    world.boulders.push(boulder);
  }

  for (let i = 0; i < 22; i += 1) {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(25, 8),
      new THREE.MeshBasicMaterial({
        color: "#f2c38f",
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
      }),
    );
    band.position.set((Math.random() - 0.5) * 32, 2 + Math.random() * 4, i * 14);
    band.rotation.y = (Math.random() - 0.5) * 0.6;
    world.scene.add(band);
    world.dustBands.push(band);
  }

  world.car = createCar();
  world.scene.add(world.car);

  world.camera.position.set(0, 5.5, -10);
  world.camera.lookAt(0, 1.4, 8);

  const loader = new FBXLoader();
  const fbxList = [
    { name: "raider", path: "/models/raider.fbx", scale: 0.007, rotationY: Math.PI, color: "#4d3a2e", metalness: 0.5 },
    { name: "tower", path: "/models/tower.fbx", scale: 0.003, rotationY: 0, color: "#564f4b", metalness: 0.3 },
    { name: "barrier", path: "/models/barrier.fbx", scale: 0.015, rotationY: 0, color: "#543d2c", metalness: 0.1 },
    { name: "rock", path: "/models/rock.fbx", scale: 0.01, rotationY: 0, color: "#5c5047", metalness: 0.2 },
    { name: "tree", path: "/models/tree.fbx", scale: 0.012, rotationY: 0, color: "#2d3826", metalness: 0.0 },
    { name: "building", path: "/models/house.fbx", scale: 0.012, rotationY: 0, color: "#7a6e60", metalness: 0.1 },
    { name: "wreck", path: "/models/wreck.fbx", scale: 0.007, rotationY: Math.PI * 0.5, color: "#2c2a30", metalness: 0.7 },
    { name: "scrap", path: "/models/barrel.fbx", scale: 0.02, rotationY: 0, color: "#4a2d26", metalness: 0.4 },
    { name: "crate", path: "/models/crate.fbx", scale: 0.012, rotationY: 0, color: "#5d4037", metalness: 0.0 }
  ];
  
  fbxList.forEach(item => {
    loader.load(item.path, (object) => {
      object.scale.set(item.scale, item.scale, item.scale);
      object.rotation.y = item.rotationY;
      object.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          let matColor = item.color;
          const name = child.name.toLowerCase();
          if (name.includes("wheel") || name.includes("tire")) {
            matColor = "#111111";
          } else if (name.includes("glass") || name.includes("window")) {
            matColor = "#111111";
          } else if (name.includes("leaf") || name.includes("leaves")) {
            matColor = "#3d4a30";
          } else if (name.includes("trunk") || name.includes("bark")) {
            matColor = "#423224";
          }

          child.material = new THREE.MeshStandardMaterial({
            color: matColor,
            roughness: 0.85,
            metalness: item.metalness,
            flatShading: false
          });
        }
      });
      world.assets.models[item.name] = object;
    });
  });

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.load("/models/ferrari.glb", (gltf) => {
    const object = gltf.scene;
    object.scale.set(1.1, 1.1, 1.1); // Adjust scale to fit game
    object.rotation.y = Math.PI;
    object.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    world.assets.models["player"] = object;
    
    // If the car was already created as placeholder, update it.
    if (world.car && world.car.userData.hull) {
      rebuildCarAppearance();
    }
  });

  window.addEventListener("resize", onResize);
  onResize();
}

function createCar() {
  const group = new THREE.Group();
  
  const mainHull = new THREE.Group();
  const chassisName = state.equipment.chassis.id || "interceptor";

  // Use GLTF model if loaded
  if (world.assets.models["player"]) {
    const clone = world.assets.models["player"].clone();
    // Re-assign wheels array by finding objects named 'wheel' or creating dummy ones
    const wheels = [];
    clone.traverse(child => {
      if (child.isMesh && child.name.toLowerCase().includes("wheel")) {
        wheels.push(child);
      }
    });

    mainHull.add(clone);
    group.userData.hull = mainHull;

    // Provide dummy or extracted wheels logic so simulation doesn't crash
    if (wheels.length >= 4) {
      group.userData.wheels = wheels.map(w => {
        w.userData = { steerable: w.position.z > 0, defaultX: w.position.x, defaultY: w.position.y, defaultZ: w.position.z };
        return w;
      });
    } else {
      group.userData.wheels = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()].map((w, i) => {
        w.userData = { steerable: i < 2 };
        return w;
      });
    }
    
    // Add dummy ram logic to avoid crash
    const ram = new THREE.Group();
    mainHull.add(ram);
    group.userData.ram = ram;
    
    group.add(mainHull);
    return group;
  }

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: stateColor(),
    metalness: 0.7,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMap: world.envTexture,
    envMapIntensity: 2.0,
  });
  
  const darkMetal = new THREE.MeshStandardMaterial({color: "#111", roughness: 0.8, metalness: 0.7, envMap: world.envTexture, envMapIntensity: 1.0});
  const carbonFiber = new THREE.MeshStandardMaterial({color: "#1a1a1c", roughness: 0.5, metalness: 0.6, envMap: world.envTexture, envMapIntensity: 1.5});
  const glassMaterial = new THREE.MeshPhysicalMaterial({color: "#010101", metalness: 0.2, roughness: 0.0, transmission: 0.98, ior: 1.6, transparent: true, envMap: world.envTexture, envMapIntensity: 2.0});
  const engineGlow = new THREE.MeshStandardMaterial({color: "#ffaa00", emissive: "#ff4400", emissiveIntensity: 4.0});
  const tailLampMaterial = new THREE.MeshStandardMaterial({color: "#aa0000", emissive: "#ff0500", emissiveIntensity: 5.0});
  const drlMaterial = new THREE.MeshStandardMaterial({color: "#ffffff", emissive: "#ddffff", emissiveIntensity: 6.0});

  world.carMaterials = [bodyMaterial];

  if (chassisName === "scout") {
    // BUGGY / SCOUT (Light, open-wheel style)
    const bodyGeo = new THREE.BoxGeometry(1.6, 0.4, 3.8);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = 0.5;
    body.castShadow = true;
    mainHull.add(body);

    const cabinGeo = new THREE.BoxGeometry(1.2, 0.6, 1.4);
    const cabin = new THREE.Mesh(cabinGeo, carbonFiber);
    cabin.position.set(0, 1.0, -0.2);
    cabin.castShadow = true;
    mainHull.add(cabin);
    
    const rollCage = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8), darkMetal);
    rollCage.rotation.z = Math.PI / 2;
    rollCage.position.set(0, 1.4, -0.2);
    mainHull.add(rollCage);

    const engine = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.8), darkMetal);
    engine.position.set(0, 0.7, -1.6);
    mainHull.add(engine);

    // Glowing exhausts
    const ex1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4), engineGlow);
    ex1.rotation.x = Math.PI / 2;
    ex1.position.set(0.4, 0.7, -2.1);
    mainHull.add(ex1);
    const ex2 = ex1.clone();
    ex2.position.set(-0.4, 0.7, -2.1);
    mainHull.add(ex2);

  } else if (chassisName === "hauler") {
    // ARMORED TRUCK / HAULER (Heavy, blocky)
    const bodyGeo = new THREE.BoxGeometry(2.4, 0.8, 5.0);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = 0.8;
    body.castShadow = true;
    mainHull.add(body);

    const cabinGeo = new THREE.BoxGeometry(2.2, 0.9, 1.6);
    const cabin = new THREE.Mesh(cabinGeo, darkMetal);
    cabin.position.set(0, 1.6, 0.8);
    cabin.castShadow = true;
    mainHull.add(cabin);

    const window = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 1.7), glassMaterial);
    window.position.set(0, 1.6, 0.8);
    mainHull.add(window);

    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 2.6), darkMetal);
    bed.position.set(0, 1.4, -1.1);
    mainHull.add(bed);
    
    // Tail lights
    const tL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.1), tailLampMaterial);
    tL.position.set(0.8, 0.8, -2.55);
    mainHull.add(tL);
    const tR = tL.clone();
    tR.position.set(-0.8, 0.8, -2.55);
    mainHull.add(tR);

  } else {
    // INTERCEPTOR (The original sleek muscle/sports car)
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(2.0, 0.2);
    bodyShape.lineTo(2.0, 0.65);
    bodyShape.lineTo(0.8, 0.85); // Hood curve
    bodyShape.lineTo(-1.0, 0.95); // Trunk line
    bodyShape.lineTo(-2.2, 0.8); // Rear drop
    bodyShape.lineTo(-2.2, 0.3);
    bodyShape.lineTo(-1.8, 0.2);
    bodyShape.lineTo(2.0, 0.2);
    const extrudeSettings = { depth: 1.8, bevelEnabled: true, bevelSegments: 3, steps: 2, bevelSize: 0.1, bevelThickness: 0.1 };
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    bodyGeo.translate(0, 0, -0.9);
    bodyGeo.rotateY(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    mainHull.add(body);
    
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), glassMaterial);
    cabin.position.set(0, 1.05, -0.2);
    mainHull.add(cabin);
    
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.4), carbonFiber);
    spoiler.position.set(0, 1.2, -2.0);
    mainHull.add(spoiler);
    const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.2), carbonFiber);
    strutL.position.set(0.6, 1.0, -2.0);
    mainHull.add(strutL);
    const strutR = strutL.clone();
    strutR.position.set(-0.6, 1.0, -2.0);
    mainHull.add(strutR);
  }

  // Ram/Rig (Attached to front of any chassis)
  const ram = new THREE.Group();
  const ramBar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.4), carbonFiber);
  ramBar.position.set(0, 0.4, (chassisName === "hauler" ? 2.6 : (chassisName === "scout" ? 2.0 : 2.2)));
  ramBar.castShadow = true;
  ram.add(ramBar);
  const drlL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.45), drlMaterial);
  drlL.position.set(0.8, 0.4, (chassisName === "hauler" ? 2.6 : (chassisName === "scout" ? 2.0 : 2.2)));
  ram.add(drlL);
  const drlR = drlL.clone();
  drlR.position.set(-0.8, 0.4, (chassisName === "hauler" ? 2.6 : (chassisName === "scout" ? 2.0 : 2.2)));
  ram.add(drlR);
  mainHull.add(ram);
  group.userData.ram = ram;

  group.add(mainHull);
  group.userData.hull = mainHull;

  // Wheels (Placed generically enough for all chassis)
  const wheelZFront = chassisName === "hauler" ? 1.8 : 1.4;
  const wheelZRear = chassisName === "hauler" ? -1.8 : -1.4;
  const wheelX = chassisName === "hauler" ? 1.3 : 1.1;
  const wheelRad = chassisName === "hauler" ? 0.45 : (chassisName === "scout" ? 0.4 : 0.35);

  const wheelsSpec = [
    [wheelX, wheelRad, wheelZFront, true],
    [-wheelX, wheelRad, wheelZFront, true],
    [wheelX, wheelRad, wheelZRear, false],
    [-wheelX, wheelRad, wheelZRear, false],
  ];

  const tireMat = new THREE.MeshStandardMaterial({color: "#111", roughness: 0.9});
  const rimMat = new THREE.MeshStandardMaterial({color: "#444", metalness: 0.8, roughness: 0.2});

  group.userData.wheels = wheelsSpec.map(([x, y, z, steerable], i) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);
    
    const rollGroup = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelRad, wheelRad, 0.3, 16), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    rollGroup.add(tire);
    
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelRad * 0.6, wheelRad * 0.6, 0.32, 8), rimMat);
    rim.rotation.z = Math.PI / 2;
    rollGroup.add(rim);

    wheelGroup.add(rollGroup);
    group.add(wheelGroup);

    wheelGroup.userData = { steerable, roll: rollGroup, defaultX: x, defaultY: y, defaultZ: z };
    return wheelGroup;
  });

  return group;
}

function setupUI() {
  populateEquipmentSelectors();
  hydrateOptionsUI();
  updateLoadoutUI();

  document.addEventListener("click", (event) => {
    const uiAction = event.target.closest("[data-ui-action]");
    if (uiAction?.dataset.uiAction === "toggle-help") {
      document.body.dataset.help = document.body.dataset.help === "expanded" ? "collapsed" : "expanded";
      return;
    }

    const button = event.target.closest("[data-action]");
    if (!button) return;

    initAudio();
    const action = button.dataset.action;

    if (action === "start-desert") {
      startRun("desert");
    } else if (action === "start-city") {
      if (state.unlocks.city) startRun("city");
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
      rebuildCarAppearance();
      updateLoadoutUI();
      flashMessage("Equipamiento actualizado");
    });
  });

  const volumeInput = document.querySelector('[data-option="volume"]');
  volumeInput.addEventListener("input", () => {
    state.options.volume = Number(volumeInput.value);
    document.querySelector('[data-option-value="volume"]').textContent = `${state.options.volume}%`;
    updateAudioVolume();
    saveState();
  });

  const qualityInput = document.querySelector('[data-option="quality"]');
  qualityInput.addEventListener("change", () => {
    state.options.quality = qualityInput.value;
    applyOptions();
    saveState();
  });

  const resolutionScaleInput = document.querySelector('[data-option="resolutionScale"]');
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
  document.querySelector('[data-option-value="volume"]').textContent = `${state.options.volume}%`;
  document.querySelector('[data-option="quality"]').value = state.options.quality;
  document.querySelector('[data-option="resolutionScale"]').value = state.options.resolutionScale ?? "auto";
  document.querySelector('[data-option="fullscreen"]').checked = state.options.fullscreen;
  document.querySelector('[data-option="weatherFx"]').checked = state.options.weatherFx;
  document.querySelector('[data-option="dayNight"]').checked = state.options.dayNight;
}

function stateColor() {
  return equipmentCatalog.chassis.find((item) => item.id === state.equipment.chassis)?.color ?? "#d8b36b";
}

function rebuildCarAppearance() {
  const oldCar = world.car;
  const newCar = createCar();
  
  newCar.position.copy(oldCar.position);
  newCar.rotation.copy(oldCar.rotation);
  
  world.scene.remove(oldCar);
  world.scene.add(newCar);
  world.car = newCar;

  const rig = state.equipment.rig;
  world.car.userData.ram.scale.x = rig === "tank" ? 1.25 : rig === "booster" ? 0.9 : 1.0;
  world.car.userData.ram.scale.z = rig === "ram" ? 1.2 : 1.0;
}

function composeStats() {
  return applyLoadout(state.equipment);
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
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, resolutionRatio[state.options.resolutionScale] ?? qualityRatio[state.options.quality]));
  world.renderer.shadowMap.enabled = shadows[state.options.quality];
  if (world.envTexture) {
    world.scene.environment = state.options.quality === "low" ? null : world.envTexture;
  }
  updateAudioVolume();
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
  world.run = createRunState(saveData, biome);
  world.environment.biome = biome;
  world.environment.targetWeather = biome === "city" ? "smog" : "clear";
  world.environment.weather = "clear";
  world.environment.weatherStrength = 0;
  world.environment.weatherTimer = 18;
  clearPools();
  syncBiomePresentation();
  stopSkidSound();
  updateHUD();
}

function clearPools() {
  for (const mesh of [...world.obstaclePool, ...world.debrisPool, ...(world.propPool||[]), ...world.pickupPool, ...world.projectilePool, ...world.particles]) {
    if (mesh.userData?.marker) world.scene.remove(mesh.userData.marker);
    world.scene.remove(mesh);
  }
  world.obstaclePool = [];
  world.debrisPool = [];
  (world.propPool||[]).forEach(p => world.scene.remove(p));
  world.propPool = [];
  world.pickupPool = [];
  world.projectilePool = [];
  world.particles = [];
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
    const materials = Array.isArray(child.material) ? child.material : [child.material];
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
    const materials = Array.isArray(child.material) ? child.material : [child.material];
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
    world.materials.ground.color.copy(tempColorA.set("#d48a4f")).lerp(tempColorB.set("#5c5c62"), urbanBlend);
  }
  if (world.materials.road) {
    world.materials.road.color.copy(tempColorA.set("#f6f1e8")).lerp(tempColorB.set("#c7ccd2"), urbanBlend);
  }
  if (world.materials.shoulder) {
    world.materials.shoulder.color.copy(tempColorA.set("#dfaa74")).lerp(tempColorB.set("#777d86"), urbanBlend);
  }
}

function startRun(biome = "desert", forceReset = false) {
  if (biome === "city" && !state.unlocks.city) biome = "desert";
  if (forceReset || !world.run || world.route === GameRoute.GAMEOVER || world.run.biome !== biome) resetRun(biome);
  setRoute(routeForBiome(biome));
  flashMessage(biome === "city" ? "Distrito urbano cargado" : "Run iniciada");
  initAudio();
  updateHUD();
  beep(180, 0.05, "triangle");
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
  updateCityAccessUI(hud, state.unlocks.city);
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
  env.weatherStrength = THREE.MathUtils.lerp(env.weatherStrength, targetStrength, dt * 0.7);
  if (env.weatherStrength < 0.08) {
    env.weather = "clear";
  } else if (env.weatherStrength > 0.92) {
    env.weather = env.targetWeather;
  }

  const profile = environmentProfiles[env.weatherStrength > 0.5 ? env.targetWeather : env.weather];
  const daylight = Math.max(0.1, Math.sin(env.cycle * Math.PI));
  const phaseLabel = resolveCycleLabel(env.cycle);

  env.bg.copy(tempColorA.copy(desertPalette.bgNight).lerp(cityPalette.bgNight, urbanBlend));
  env.bg.lerp(tempColorB.copy(desertPalette.bgDay).lerp(cityPalette.bgDay, urbanBlend), daylight);
  env.fog.copy(tempColorA.copy(desertPalette.fogNight).lerp(cityPalette.fogNight, urbanBlend));
  env.fog.lerp(tempColorB.copy(desertPalette.fogDay).lerp(cityPalette.fogDay, urbanBlend), daylight);
  env.bg.lerp(profile.tint, env.weatherStrength * 0.18);
  env.fog.lerp(profile.tint, env.weatherStrength * 0.28);

  world.scene.background.copy(env.bg);
  world.scene.fog.color.copy(env.fog);
  world.scene.fog.density = 0.006 + (1 - daylight) * 0.004 + profile.fogBoost * env.weatherStrength;

  if (world.lights.ambient) {
    world.lights.ambient.color.copy(tempColorA.copy(desertPalette.ambientNight).lerp(cityPalette.ambientNight, urbanBlend));
    world.lights.ambient.color.lerp(tempColorB.copy(desertPalette.ambientDay).lerp(cityPalette.ambientDay, urbanBlend), daylight);
    world.lights.ambient.groundColor.copy(tempColorA.copy(desertPalette.groundNight).lerp(cityPalette.groundNight, urbanBlend));
    world.lights.ambient.groundColor.lerp(tempColorB.copy(desertPalette.groundDay).lerp(cityPalette.groundDay, urbanBlend), daylight);
    world.lights.ambient.intensity = 0.4 + daylight * 1.1 - env.weatherStrength * 0.35;
  }

  if (world.lights.sun) {
    const baseIntensity = THREE.MathUtils.lerp(1.7, 1.4, urbanBlend);
    world.lights.sun.intensity = 0.2 + daylight * baseIntensity - env.weatherStrength * 0.4;
    world.lights.sun.position.set(Math.cos(env.cycle * Math.PI * 2) * 24, 8 + daylight * 30, 10);
    world.lights.sun.color.copy(
      tempColorA
        .set(daylight < 0.3 ? "#ff9b7a" : "#ffe5ba")
        .lerp(tempColorB.set(daylight < 0.3 ? "#b7b0bf" : "#d8dbe2"), urbanBlend),
    );
  }

  if (world.lights.sunDisc) {
    world.lights.sunDisc.position.set(Math.cos((env.cycle - 0.5) * Math.PI) * 70, 10 + daylight * 34, -130);
    world.lights.sunDisc.material.opacity = Math.max(0.12, 0.75 * daylight - env.weatherStrength * 0.22);
    world.lights.sunDisc.material.color.copy(
      tempColorA
        .set(daylight < 0.3 ? "#ff8f70" : "#ffcf8a")
        .lerp(tempColorB.set(daylight < 0.3 ? "#bfc4d2" : "#d9e2ef"), urbanBlend),
    );
  }

  for (const band of world.dustBands) {
    band.material.opacity = 0.035 + env.weatherStrength * 0.12 + (1 - daylight) * 0.015;
  }

  atmosphere.style.background = `
    linear-gradient(180deg, rgba(0, 0, 0, ${0.1 + env.weatherStrength * 0.15}), rgba(7, 4, 3, ${0.25 + (1 - daylight) * 0.2})),
    radial-gradient(circle at 50% 10%, rgba(180, 110, 60, ${0.04 + daylight * 0.08}), transparent 32%)
  `;

  if (world.run) {
    world.run.biomeLabel = biomeCatalog[world.run.biome].label;
    world.run.weatherLabel = profile.label;
    world.run.cycleLabel = phaseLabel;
    world.run.weatherFuelUse = profile.fuelUse;
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
    .filter((key) => getUrbanBlend() > 0.6 ? key !== "dust" : key !== "smog");
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
  let rawBrake    = world.input.brake ? 1 : 0;

  const gpad = navigator.getGamepads?.()?.[0];
  if (gpad) {
    const gx = gpad.axes?.[0] ?? 0;
    const gy = gpad.axes?.[1] ?? 0;
    const lt = gpad.buttons?.[6]?.value ?? 0;  // left trigger  = brake
    const rt = gpad.buttons?.[7]?.value ?? 0;  // right trigger = accel
    if (rawSteer === 0 && Math.abs(gx) > 0.14) rawSteer = THREE.MathUtils.clamp(-gx, -1, 1);
    if (!world.input.accel && rt > 0.08) rawThrottle = rt;
    if (!world.input.brake && lt > 0.08) rawBrake    = lt;
    if (world.input.touch.active) rawSteer = -world.input.touch.dx;
  }
  if (world.input.touch.active) {
    rawSteer    = -world.input.touch.dx;
    rawThrottle = Math.max(rawThrottle, Math.max(0, -world.input.touch.dy));
    rawBrake    = Math.max(rawBrake,    Math.max(0,  world.input.touch.dy));
  }

  // ── 2. Smooth inputs ──────────────────────────────────────────────────────
  const steerLag    = 1 - Math.exp(-dt * (run.grounded ? 12 : 7));
  const throttleLag = 1 - Math.exp(-dt * 5);
  run.steerSmoothed    = THREE.MathUtils.lerp(run.steerSmoothed,    rawSteer,    steerLag);
  run.throttleSmoothed = THREE.MathUtils.lerp(run.throttleSmoothed, rawThrottle - rawBrake, throttleLag);

  // ── 3. Speed with accel/brake ─────────────────────────────────────────────
  // speedFactor: 0.45 = coasting, 1.0 = full gas, 0.1 = braking
  const throttleInput = run.throttleSmoothed; // -1…1
  const targetFactor  = throttleInput >= 0
    ? THREE.MathUtils.lerp(0.58, 1.0, throttleInput)
    : THREE.MathUtils.lerp(0.58, 0.24, -throttleInput);
  run.speedFactor = THREE.MathUtils.lerp(run.speedFactor, targetFactor, 1 - Math.exp(-dt * 2));
  run.speed = run.baseSpeed * run.speedFactor;

  // ── 4. Traction circle / grip ─────────────────────────────────────────────
  const weatherHandling = run.weatherHandling ?? 1;
  const baseTraction    = run.traction * (0.96 + 0.04 * (1 - (run.threat / 100) * 0.35)) * weatherHandling;
  const steer = run.steerSmoothed * run.handling * weatherHandling;

  // Menos castigo por girar: el coche debe ser estable antes de empezar a derrapar.
  const lateralLoad = Math.abs(run.steerSmoothed) * (0.55 + run.speedFactor * 0.45);
  const targetGrip  = THREE.MathUtils.clamp(1.0 - lateralLoad * 0.26, 0.56, 1.0);
  run.gripFactor = THREE.MathUtils.lerp(run.gripFactor, targetGrip, 1 - Math.exp(-dt * 8));

  const wasSkidding = run.skidding;
  run.skidding = run.gripFactor < 0.58 && Math.abs(run.lateralVel) > 1.8 && run.grounded;

  if (run.skidding && !wasSkidding) playSkidSound();
  if (!run.skidding && wasSkidding) stopSkidSound();

  // lateral physics with grip applied
  const centering  = run.x * 1.35;
  const cornering  = 3.35;
  const traction   = baseTraction * run.gripFactor;
  const laneHalfWidth = 5.2;
  const lateralDamping = run.skidding ? 1.15 : 2.85;
  run.lateralVel += (steer * cornering * 4.8 * traction - centering - run.lateralVel * lateralDamping) * dt;
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
      beep(58, 0.06, "sine");
      if (run.skidding) spawnDustBurst(6);
    }
  }

  // ── 6. Suspension spring ──────────────────────────────────────────────────
  if (run.grounded) {
    const suspStiffness = 180;
    const suspDamp      = 18;
    run.suspensionVel += (-suspStiffness * run.suspensionY - suspDamp * run.suspensionVel) * dt;
    run.suspensionY   += run.suspensionVel * dt;
    run.suspensionY    = THREE.MathUtils.clamp(run.suspensionY, -0.18, 0.08);
    // pitch from accel/brake
    const targetPitch = throttleInput * -0.028 + (run.skidding ? 0.012 : 0);
    run.pitchAngle = THREE.MathUtils.lerp(run.pitchAngle, targetPitch, 1 - Math.exp(-dt * 6));
  } else {
    run.pitchAngle = THREE.MathUtils.lerp(run.pitchAngle, -run.yVelocity * 0.018, dt * 5);
  }

  // ── 7. Hazards ────────────────────────────────────────────────────────────
  run.distance += run.speed * dt * 0.1;
  run.invulnerable = Math.max(0, run.invulnerable - dt);
  run.threat = THREE.MathUtils.clamp(
    run.distance * 4.5 + (run.weatherThreat ?? 0) + run.kills * 2.5,
    0, 100,
  );

  const progression = updateRunProgression(run);
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
  const roadShake = run.grounded ? (Math.random() - 0.5) * 0.012 * run.speed * 0.045 : 0;
  world.car.position.y = 0.1 + run.y + run.suspensionY + roadShake;

  // roll (lean into corners) + drift slide - limitado para evitar vuelco visual
  const driftAngle  = run.skidding ? run.lateralVel * 0.04 : 0;
  const targetRollZ = THREE.MathUtils.clamp(
    -steer * 0.055 - run.lateralVel * 0.022 - driftAngle,
    -0.18,
    0.18
  );
  world.car.rotation.z = THREE.MathUtils.lerp(world.car.rotation.z, targetRollZ, dt * 3);

  // pitch from suspension + accel
  world.car.rotation.x = THREE.MathUtils.lerp(
    world.car.rotation.x,
    run.grounded ? run.pitchAngle + (Math.random() - 0.5) * 0.004 * run.traction : -run.yVelocity * 0.018,
    dt * 3,
  );

  // yaw drift - limitado para evitar giros excesivos
  const targetYaw = THREE.MathUtils.clamp(
    steer * 0.03 + run.lateralVel * 0.012 + (run.skidding ? run.lateralVel * 0.018 : 0),
    -0.22,
    0.22
  );
  world.car.rotation.y = THREE.MathUtils.lerp(world.car.rotation.y, targetYaw, dt * 4);

  // ── 9. Wheels ─────────────────────────────────────────────────────────────
  for (const wheel of world.car.userData.wheels) {
    if (wheel.userData.roll) {
      wheel.userData.roll.rotation.x -= dt * run.speed * 1.1;
    } else {
      wheel.rotation.x -= dt * run.speed * 1.1;
    }
    if (wheel.userData.steerable) {
      const steerAngle = run.steerSmoothed * (0.42 + run.gripFactor * 0.12);
      wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, steerAngle, dt * 6);
    }
  }

  // ── 10. Particles ─────────────────────────────────────────────────────────
  const dustRate = run.grounded ? run.speed * 0.35 + (run.skidding ? run.speed * 1.2 : 0) : 0;
  if (Math.random() < dt * dustRate) spawnDustMote();
  if (run.skidding && Math.random() < dt * 12) spawnSkidMark();

  // ── 11. Engine audio ──────────────────────────────────────────────────────
  updateEngineSound(run.speedFactor, run.skidding);

  // ── 12. Gamepad rumble on skid / impact ───────────────────────────────────
  if (gpad?.vibrationActuator && run.skidding) {
    try {
      void gpad.vibrationActuator.playEffect("dual-rumble", {
        duration: 80,
        strongMagnitude: 0.08,
        weakMagnitude: 0.22,
      });
    } catch {
      /* API opcional o no soportada */
    }
  }

  // ── 13. Camera ────────────────────────────────────────────────────────────
  // Cámara centrada en el eje X del mapa: solo un leve sway por velocidad lateral (no seguir run.x).
  const camSwayXTarget = run.lateralVel * 0.05;
  run.camSwayXSmoothed = THREE.MathUtils.lerp(run.camSwayXSmoothed, camSwayXTarget, 1 - Math.exp(-dt * 4));
  const camSwayY = roadShake * 3 + run.suspensionY * 0.25;
  const camFovTarget = run.skidding ? 61.2 : 60;
  world.camera.fov = THREE.MathUtils.lerp(world.camera.fov, camFovTarget, dt * 2);
  world.camera.updateProjectionMatrix();
  world.camera.position.x += (run.camSwayXSmoothed - world.camera.position.x) * dt * 2.5;
  world.camera.position.y += (5.5 + run.y * 0.35 + camSwayY - world.camera.position.y) * dt * 2.5;
  world.camera.position.z += (-10.5 - world.camera.position.z) * dt * 2.5;
  world.camera.lookAt(run.camSwayXSmoothed * 0.15, 1.18 + run.y * 0.18, 7.4);

  // ── 14. Spawn ─────────────────────────────────────────────────────────────
  run.obstacleTimer -= dt;
  run.pickupTimer   -= dt;
  run.propTimer = (run.propTimer || 0) - dt;
  if (run.propTimer <= 0) { spawnProp(); run.propTimer = Math.random() * 0.08; }
  if (run.obstacleTimer <= 0) {
    spawnObstacle();
    run.obstacleTimer = Math.max(0.18, 0.55 - run.threat * 0.0025) + Math.random() * 0.38;
  }
  if (run.pickupTimer <= 0) {
    spawnPickup();
    run.pickupTimer = Math.max(0.6, 1.4 - run.threat * 0.003) + Math.random() * 1.2;
  }

  updateEntities(dt);
  moveWorld(dt, 1);
  if (updateRunProgression(run).completedRun) {
    run.endReason = "Atravesaste el distrito y escapaste del cerco.";
    finishRun(true);
    return;
  }
  updateHUD();
}

function moveWorld(dt, speedFactor) {
  const flow = world.run ? world.run.speed : 18;
  const amount = flow * dt * speedFactor;

  if (world.roadTexture) {
    world.roadTexture.offset.y -= amount / 24;
    if (world.roadBumpTexture) world.roadBumpTexture.offset.y -= amount / 24;
    if (world.roadRoughnessTexture) world.roadRoughnessTexture.offset.y -= amount / 24;
  }
  if (world.terrainTexture) {
    world.terrainTexture.offset.y -= amount / 120;
    if (world.terrainBumpTexture) world.terrainBumpTexture.offset.y -= amount / 120;
    if (world.terrainRoughnessTexture) world.terrainRoughnessTexture.offset.y -= amount / 120;
  }
  if (world.shoulderTexture) {
    world.shoulderTexture.offset.y -= amount / 24;
    if (world.shoulderBumpTexture) world.shoulderBumpTexture.offset.y -= amount / 24;
    if (world.shoulderRoughnessTexture) world.shoulderRoughnessTexture.offset.y -= amount / 24;
  }

  for (const band of world.dustBands) {
    band.position.z -= amount * 0.8;
    if (band.position.z < -20) band.position.z += 280;
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
}

function recycleEnvironmentObject(obj, initial, minX, maxX, minZ, maxZ) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const x = side * (minX + Math.random() * (maxX - minX));
  const z = minZ + Math.random() * (maxZ - minZ);
  
  if (obj.userData && obj.userData.isDune) {
    obj.position.set(x, obj.userData.baseY, z);
    obj.rotation.y = Math.random() * Math.PI * 2;
    obj.scale.set(1 + Math.random() * 1.5, 0.6 + Math.random() * 0.8, 1 + Math.random() * 1.5);
  } else {
    obj.position.set(x, 0, z);
    obj.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
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
  for (let w = 0; w < 15; w += 1) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    ctx.strokeStyle = `rgba(60, 40, 20, ${0.1 + Math.random() * 0.15})`;
    ctx.lineWidth = 2 + Math.random() * 3;
    bCtx.strokeStyle = `rgba(30, 30, 30, ${0.5 + Math.random() * 0.3})`;
    bCtx.lineWidth = 3 + Math.random() * 4;
    
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
  for (let i = 0; i < 3000; i += 1) {
    const isRock = Math.random() > 0.8;
    ctx.fillStyle = isRock ? `rgba(60, 50, 40, ${Math.random() * 0.4})` : `rgba(255, 230, 200, ${Math.random() * 0.15})`;
    const x = Math.random() * sizeX;
    const y = Math.random() * sizeY;
    const w = 2 + Math.random() * 6;
    const h = 3 + Math.random() * 12;
    ctx.fillRect(x, y, w, h);
    
    bCtx.fillStyle = isRock ? `rgba(180, 180, 180, 0.9)` : `rgba(120, 120, 120, 0.5)`;
    bCtx.fillRect(x, y, w, h);

    if (isRock) {
      rCtx.fillStyle = "rgba(100, 100, 100, 0.8)";
      rCtx.fillRect(x, y, w, h);
    }
  }

  // Faint tyre tracks leaving the road
  ctx.fillStyle = "rgba(20, 15, 10, 0.15)";
  bCtx.fillStyle = "rgba(40, 40, 40, 0.2)";
  rCtx.fillStyle = "rgba(80, 80, 80, 0.3)";
  for (let i = 0; i < 4; i++) {
    const trackX = 40 + Math.random() * 100;
    ctx.fillRect(trackX, 0, 12, sizeY);
    bCtx.fillRect(trackX, 0, 12, sizeY);
    rCtx.fillRect(trackX, 0, 12, sizeY);
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
    ctx.fillStyle = isDark ? `rgba(15, 10, 10, ${Math.random() * 0.2})` : `rgba(200, 200, 200, ${Math.random() * 0.08})`;
    const x = Math.random() * sizeX;
    const y = Math.random() * sizeY;
    const w = 2 + Math.random() * 12;
    const h = 4 + Math.random() * 20;
    ctx.fillRect(x, y, w, h);
    
    bCtx.fillStyle = isDark ? `rgba(60, 60, 60, 0.7)` : `rgba(160, 160, 160, 0.5)`;
    bCtx.fillRect(x, y, w, h);

    if (isDark) {
      rCtx.fillStyle = `rgba(140, 140, 140, 0.5)`;
      rCtx.fillRect(x, y, w, h);
    }
  }

  // Center line (worn out)
  ctx.strokeStyle = "rgba(200, 180, 150, 0.85)";
  ctx.lineWidth = 24;
  ctx.setLineDash([120, 100]);
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(sizeX / 2, -50);
  ctx.lineTo(sizeX / 2, sizeY + 50);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Center line bump and roughness
  bCtx.strokeStyle = "rgba(180, 180, 180, 0.8)";
  bCtx.lineWidth = 24;
  bCtx.setLineDash([120, 100]);
  bCtx.beginPath();
  bCtx.moveTo(sizeX / 2, -50);
  bCtx.lineTo(sizeX / 2, sizeY + 50);
  bCtx.stroke();
  bCtx.setLineDash([]);

  rCtx.strokeStyle = "rgba(100, 100, 100, 0.9)"; // Paint is smoother
  rCtx.lineWidth = 24;
  rCtx.setLineDash([120, 100]);
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
    ctx.fillRect(startX, Math.random() * sizeY, width, 100 + Math.random() * 400);
    rCtx.fillRect(startX, Math.random() * sizeY, width, 100 + Math.random() * 400);
  }

  // Oil stains (dark, very smooth/shiny)
  for (let o = 0; o < 15; o++) {
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

  // Realistic cracks
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = "#0a0807";
  bCtx.globalAlpha = 0.9;
  bCtx.strokeStyle = "#202020";
  rCtx.globalAlpha = 0.9;
  rCtx.strokeStyle = "#ffffff"; // Cracks are rough
  
  for (let c = 0; c < 35; c += 1) {
    let x = Math.random() * sizeX;
    let y = -50 + Math.random() * sizeY;
    const lw = 1 + Math.random() * 2.5;
    ctx.lineWidth = lw;
    bCtx.lineWidth = lw;
    rCtx.lineWidth = lw;
    
    ctx.beginPath();
    bCtx.beginPath();
    rCtx.beginPath();
    ctx.moveTo(x, y);
    bCtx.moveTo(x, y);
    rCtx.moveTo(x, y);
    
    for (let s = 0; s < 18; s += 1) {
      x += (Math.random() - 0.5) * 40 + 5;
      y += (Math.random() - 0.5) * 25;
      ctx.lineTo(x, y);
      bCtx.lineTo(x, y);
      rCtx.lineTo(x, y);
      
      // Branching
      if (Math.random() > 0.75) {
        let bx = x;
        let by = y;
        ctx.moveTo(bx, by);
        bCtx.moveTo(bx, by);
        rCtx.moveTo(bx, by);
        for(let bs = 0; bs < 6; bs++) {
          bx += (Math.random() - 0.5) * 20;
          by += (Math.random() - 0.5) * 20;
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


function spawnProp() {
  
  const isLeft = Math.random() > 0.5;
  const randType = Math.random();
  let kind = "rock";
  if (randType > 0.95) kind = "castle";
  else if (randType > 0.85) kind = "billboard";
  else if (randType > 0.55) kind = "building";
  else if (randType > 0.3) kind = "tree";

  const prop = createPropMesh(kind);
  const zDist = 120 + Math.random() * 80;
  const xDist = (kind === "castle" ? 25 + Math.random() * 20 : 15 + Math.random() * 45) * (isLeft ? -1 : 1);
  prop.position.set(xDist, 0, zDist);
  
  if (kind === "castle") {
    // Already scaled inside createPropMesh or here
  } else if (kind === "building") {
    prop.scale.set(1 + Math.random()*2, 1 + Math.random()*3, 1 + Math.random()*2);
  } else if (kind === "tree") {
    prop.scale.set(0.8 + Math.random(), 0.8 + Math.random()*1.5, 0.8 + Math.random());
  } else {
    prop.scale.set(1 + Math.random()*2, 1 + Math.random()*2, 1 + Math.random()*2);
  }
  
  prop.rotation.y = Math.random() * Math.PI * 2;
  world.scene.add(prop);
  world.propPool.push(prop);
}

function createPropMesh(kind) {
  const group = new THREE.Group();
  
  if (world.assets.models[kind]) {
    const clone = world.assets.models[kind].clone();
    group.add(clone);
    return group;
  }
  
  if (kind === "building") {
    const baseColor = new THREE.Color().setHSL(Math.random(), 0.05, 0.15 + Math.random() * 0.15);
    const wallMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.95 });
    
    const width = 3 + Math.random() * 3;
    const depth = 3 + Math.random() * 3;
    const height = 4 + Math.random() * 8;
    
    // Main block
    const main = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
    main.position.y = height / 2;
    main.castShadow = true;
    main.receiveShadow = true;
    group.add(main);

    // Ruined/secondary section
    if (Math.random() > 0.4) {
      const secHeight = height * (0.4 + Math.random() * 0.5);
      const secondary = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, secHeight, depth + 1.2), wallMat);
      secondary.position.y = secHeight / 2;
      secondary.position.x = (Math.random() - 0.5);
      secondary.castShadow = true;
      secondary.receiveShadow = true;
      group.add(secondary);
    }
    
    // Roof detail (antenna or vent)
    if (Math.random() > 0.5) {
      const roofMat = new THREE.MeshStandardMaterial({color: "#333", roughness: 0.8});
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2), roofMat);
      antenna.position.set(0, height + 1, 0);
      group.add(antenna);
    } else {
      const ventMat = new THREE.MeshStandardMaterial({color: "#444", roughness: 0.8});
      const vent = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ventMat);
      vent.position.set(0, height + 0.5, 0);
      group.add(vent);
    }

  } else if (kind === "tree") {
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#2a201a", roughness: 1.0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: "#3d4230", roughness: 0.9 });
    
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.5, 5), trunkMat);
    trunk.position.y = 1.25;
    trunk.rotation.x = (Math.random() - 0.5) * 0.3;
    trunk.rotation.z = (Math.random() - 0.5) * 0.3;
    trunk.castShadow = true;
    group.add(trunk);
    
    const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 + Math.random() * 0.6), leafMat);
    canopy.position.set(trunk.position.x, 2.8, trunk.position.z);
    canopy.rotation.set(Math.random(), Math.random(), Math.random());
    canopy.scale.y = 0.6 + Math.random() * 0.4;
    canopy.castShadow = true;
    group.add(canopy);

    for(let i=0; i<2; i++) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.15, 1.5, 4), trunkMat);
        branch.position.set((Math.random()-0.5)*1.5, 1.5 + Math.random(), (Math.random()-0.5)*1.5);
        branch.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        branch.castShadow = true;
        group.add(branch);
    }
  
  } else if (kind === "billboard") {
    const matPole = new THREE.MeshStandardMaterial({color: "#333", roughness: 0.9});
    const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 15), matPole);
    pole1.position.set(-2, 7.5, 0);
    pole1.castShadow = true;
    group.add(pole1);
    
    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 15), matPole);
    pole2.position.set(2, 7.5, 0);
    pole2.castShadow = true;
    group.add(pole2);
    
    const boardMat = new THREE.MeshStandardMaterial({color: new THREE.Color().setHSL(Math.random(), 0.5, 0.3), roughness: 0.8});
    const board = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.5), boardMat);
    board.position.set(0, 12.5, 0);
    board.castShadow = true;
    group.add(board);

  } else if (kind === "castle") {
    const castleMat = new THREE.MeshStandardMaterial({ color: "#666", roughness: 0.9, metalness: 0.1 });
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
        b.position.set(t.position.x + Math.cos(ang) * 2, 10.4, t.position.z + Math.sin(ang) * 2);
        group.add(b);
      }
    }
    
    // Walls
    const wallGeo = new THREE.BoxGeometry(10, 7, 1);
    const w1 = new THREE.Mesh(wallGeo, castleMat); w1.position.set(0, 3.5, 6); group.add(w1);
    const w2 = new THREE.Mesh(wallGeo, castleMat); w2.position.set(0, 3.5, -6); group.add(w2);
    const w3 = new THREE.Mesh(wallGeo, castleMat); w3.position.set(6, 3.5, 0); w3.rotation.y = Math.PI/2; group.add(w3);
    const w4 = new THREE.Mesh(wallGeo, castleMat); w4.position.set(-6, 3.5, 0); w4.rotation.y = Math.PI/2; group.add(w4);
    
    group.scale.set(1.5, 1.5, 1.5);
    
  } else if (kind === "rock") {
    const mat = new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.9, flatShading: true });
    for(let i=0; i<3; i++) {
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random()), mat);
      mesh.position.set((Math.random()-0.5)*1.5, 0.5 + Math.random()*0.5, (Math.random()-0.5)*1.5);
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  
  return group;
}

function spawnObstacle() {
  const kind = spawnEncounter(world.run, currentBiome());

  const obstacle = createObstacleMesh(kind);
  obstacle.castShadow = true;
  obstacle.receiveShadow = true;
  
  if (kind === "tower") {
    // Coherence: place towers on the side of the road, not in the middle.
    const isLeft = Math.random() > 0.5;
    const xDist = (4 + Math.random() * 2) * (isLeft ? -1 : 1);
    obstacle.position.set(xDist, obstacle.userData.height, 38 + Math.random() * 18);
  } else {
    obstacle.position.set(randomLane(), obstacle.userData.height, 38 + Math.random() * 18);
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
    obstacle.rotation.set(0, Math.random() * Math.PI * 2, 0);
    return;
  }
  if (kind === "wreck") {
    obstacle.rotation.set((Math.random() - 0.5) * 0.16, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.12);
    return;
  }
  // chatarra: basura rodando sobre el asfalto (solo yaw + leve basculación)
  obstacle.rotation.set(
    (Math.random() - 0.5) * 0.35,
    Math.random() * Math.PI * 2,
    (Math.random() - 0.5) * 0.25,
  );
}

function spawnPickup() {
  const type = choosePickupType(world.run, currentBiome());
  spawnPickupAt(type, randomLane(), 34 + Math.random() * 18, 1.2 + Math.random() * 0.7);
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
    mesh.traverse(c => {
      if(c.isMesh) {
        c.material = c.material.clone();
        c.material.color.set(config.color);
        c.material.emissive.set(config.color);
        c.material.emissiveIntensity = 0.4;
      }
    });
  } else {
    mesh = new THREE.Mesh(
      config.geometry,
      new THREE.MeshStandardMaterial({
        color: config.color,
        emissive: config.color,
        emissiveIntensity: 0.8,
        roughness: 0.25,
        metalness: 0.4,
      }),
    );
  }
  mesh.position.set(x, y, z);
  mesh.userData = {
    type,
    amount: config.amount,
    label: config.label,
    bob: Math.random() * Math.PI * 2,
  };
  world.scene.add(mesh);
  world.pickupPool.push(mesh);
}

function removeObstacle(obstacle) {
  if (obstacle.userData.marker) {
    world.scene.remove(obstacle.userData.marker);
  }
  world.scene.remove(obstacle);
}

function transformToDebris(obstacle) {
  // Remove from obstacle pool but keep in scene
  world.obstaclePool = world.obstaclePool.filter(o => o !== obstacle);
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
  createBurst(impactPoint, obstacle.userData.isEnemy ? "#ff6d5e" : "#ff8b5e", obstacle.userData.isEnemy ? 18 : 12);
  createShockwave(impactPoint, obstacle.userData.isEnemy ? "#ff6d5e" : "#ff8b5e", 0.55, 2.4, 0.24);

  if (rewardPlayer && obstacle.userData.isEnemy && world.run) {
    world.run.kills += 1;
    world.run.coins += obstacle.userData.rewardCoins ?? 0;
    world.run.ammo = Math.min(world.run.ammoMax, world.run.ammo + (obstacle.userData.rewardAmmo ?? 0));
    if (Math.random() < 0.45) {
      spawnPickupAt(Math.random() > 0.5 ? "ammo" : "repair", obstacle.position.x, obstacle.position.z, 1.1);
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
  createBurst(projectile.position, "#ffb36a", 3);
}

function randomLane() {
  return [-2.8, 0, 2.8][Math.floor(Math.random() * 3)];
}

function updateEntities(dt) {
  const run = world.run;
  const speed = run.speed * dt;

  world.obstaclePool = world.obstaclePool.filter((obstacle) => {
    obstacle.position.z -= speed * (obstacle.userData.isEnemy ? 0.82 : 1);
    if (obstacle.userData.isEnemy) {
      obstacle.rotation.y += dt * 1.15;
      obstacle.rotation.z += Math.sin(performance.now() * 0.002 + obstacle.position.z * 0.08) * dt * 0.12;
    } else if (obstacle.userData.obstacleSpin === "scrap") {
      obstacle.rotation.y += dt * 0.55;
      obstacle.rotation.x += dt * 0.06;
    } else if (obstacle.userData.obstacleSpin === "barrier") {
      obstacle.rotation.y += dt * 0.02;
    }

    if (obstacle.userData.isEnemy) {
      obstacle.userData.shotCooldown -= dt;
      if (Math.random() < dt * 0.45) {
        obstacle.userData.laneTarget = randomLane();
      }
      obstacle.position.x += (obstacle.userData.laneTarget - obstacle.position.x) * dt * 2.1;

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

    if (obstacleHitsCar(obstacle)) {
      if (run.invulnerable <= 0) {
        const appliedDamage = resolveCollision(run, obstacle.userData.damage);
        flashMessage(`Impacto: -${appliedDamage} hull`);
        createBurst(obstacle.position, "#ff7b54", 10);
        beep(80, 0.09, "sawtooth");
      }
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
    pickup.position.y += Math.sin(performance.now() * 0.004 + pickup.userData.bob) * 0.0035;

    if (pickup.position.z < -12) {
      world.scene.remove(pickup);
      return false;
    }

    if (collidesWithCar(pickup.position.x, pickup.position.z, 0.95)) {
      const resolvedPickup = resolvePickup(run, pickup.userData.type);
      flashMessage(`Recogido: ${resolvedPickup?.label ?? pickup.userData.label}`);
      createBurst(pickup.position, pickup.material.color.getHexString(), 8);
      beep(320, 0.05, "triangle");
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

    if (collidesWithCar(projectile.position.x, projectile.position.z, 0.45, projectile.position.y, 0.9)) {
      if (run.invulnerable <= 0) {
        run.health -= projectile.userData.damage;
        run.invulnerable = 0.45;
        flashMessage(`Disparo recibido: -${projectile.userData.damage} hull`);
        beep(94, 0.05, "square");
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
    beep(55, 0.18, "square");
  }
}

function collidesWithCar(x, z, radius, y = 1.1, verticalRadius = 1.8) {
  const run = world.run;
  if (!run) return false;
  const dx = Math.abs(x - run.x);
  const dz = Math.abs(z - 1.2);
  const dy = Math.abs(y - (run.y + 1));
  return dx < 1.25 + radius && dz < 2.2 + radius && dy < verticalRadius;
}

/** Distancia al cuadrado del punto (px,pz) al borde exterior del AABB centrado en (cx,cz) con medias hx,hz. */
function pointToObstacleFootprintDistSq(px, pz, cx, cz, halfX, halfZ) {
  const dx = Math.max(0, Math.abs(px - cx) - halfX);
  const dz = Math.max(0, Math.abs(pz - cz) - halfZ);
  return dx * dx + dz * dz;
}

/** Pulso incendiario: punto de origen frente al coche vs huella del obstáculo (rect o círculo). */
function firePulseTouchesObstacle(obstacle, run, fireReach, originZ = 1.5) {
  const px = run.x;
  const pz = originZ;
  const ox = obstacle.position.x;
  const oz = obstacle.position.z;
  if (obstacle.userData.collisionFootprint === "circle") {
    const r =
      obstacle.userData.collisionRadius ??
      Math.max(obstacle.userData.collisionHalfX ?? 1, obstacle.userData.collisionHalfZ ?? 1);
    return Math.hypot(ox - px, oz - pz) <= fireReach + r;
  }
  const hx = obstacle.userData.collisionHalfX ?? obstacle.userData.radius ?? 1;
  const hz = obstacle.userData.collisionHalfZ ?? obstacle.userData.radius ?? 1;
  return pointToObstacleFootprintDistSq(px, pz, ox, oz, hx, hz) <= fireReach * fireReach;
}

/** Coche como AABB en XZ centrado en (run.x, carZ). */
function circleIntersectsCarAabb(cx, cz, radius, run, carZ = 1.2, carHalfX = 0.85, carHalfZ = 2.2) {
  const nx = Math.max(run.x - carHalfX, Math.min(cx, run.x + carHalfX));
  const nz = Math.max(carZ - carHalfZ, Math.min(cz, carZ + carHalfZ));
  const dx = cx - nx;
  const dz = cz - nz;
  return dx * dx + dz * dz <= radius * radius;
}

/**
 * Colisión obstáculo–coche en 3D: límites Y son offsets respecto a obstacle.position.y
 * (ancla del grupo/malla en el suelo o centro coherente con la geometría).
 */
function obstacleHitsCar(obstacle) {
  const run = world.run;
  if (!run) return false;
  const x = obstacle.position.x;
  const z = obstacle.position.z;
  const halfX = obstacle.userData.collisionHalfX ?? obstacle.userData.radius ?? 1;
  const halfZ = obstacle.userData.collisionHalfZ ?? obstacle.userData.radius ?? 1;
  const carZ = 1.2;
  const dx = Math.abs(x - run.x);
  const dz = Math.abs(z - carZ);
  let xzOverlap;
  if (obstacle.userData.collisionFootprint === "circle") {
    const rObs = obstacle.userData.collisionRadius ?? Math.max(halfX, halfZ);
    xzOverlap = circleIntersectsCarAabb(x, z, rObs, run, carZ);
  } else {
    if (dx >= 0.85 + halfX || dz >= 2.2 + halfZ) return false;
    xzOverlap = true;
  }
  if (!xzOverlap) return false;

  const carBase = 0.1 + run.y;
  const carLow = carBase + 0.02;
  const carHigh = carBase + 1.56;
  const by = obstacle.position.y;
  let yMin = by + (obstacle.userData.collisionYMin ?? -1.2);
  let yMax = by + (obstacle.userData.collisionYMax ?? 1.2);
  if (obstacle.userData.collisionBottom != null && obstacle.userData.collisionYMin == null) {
    yMin = obstacle.userData.collisionBottom;
    yMax = obstacle.userData.collisionTop ?? by + 1.15;
  }

  const clearAbove = 0.34;
  if (carLow >= yMax - clearAbove) return false;
  if (carHigh <= yMin + 0.05) return false;
  return true;
}

function tryJump() {
  const run = world.run;
  if (!run.grounded || run.jumps <= 0) return;
  run.jumps -= 1;
  run.grounded = false;
  run.yVelocity = run.jumpPower;
  createBurst(world.car.position, "#7af5b7", 6);
  flashMessage("Salto activado");
  beep(240, 0.05, "triangle");
}

function useFire() {
  const run = world.run;
  if (run.fire <= 0) {
    flashMessage("Sin cargas de fuego");
    return;
  }
  if (run.ammo < 2) {
    flashMessage("Municion insuficiente");
    beep(104, 0.04, "square");
    return;
  }
  run.fire -= 1;
  run.ammo = Math.max(0, run.ammo - 2);
  const radius = run.fireRadius;
  const remaining = [];
  const launchPoint = new THREE.Vector3(run.x, 1.1, 2.2);
  let destroyed = 0;

  createShockwave(launchPoint, "#ffb36a", 0.4, 2.8, 0.28);

  const fireReach = radius * 2.2;
  for (const obstacle of world.obstaclePool) {
    if (firePulseTouchesObstacle(obstacle, run, fireReach, 1.5)) {
      const impactPoint = obstacle.position.clone();
      createMissileTrail(launchPoint, impactPoint, "#ffb36a");
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
      createBurst(projectile.position, "#ffd59a", 4);
      world.scene.remove(projectile);
      return false;
    }
    return true;
  });

  if (destroyed === 0) {
    const missPoint = new THREE.Vector3(run.x, 1.1, 2.2 + radius * 4.4);
    createMissileTrail(launchPoint, missPoint, "#ffb36a");
    createShockwave(missPoint, "#ffb36a", 0.45, 1.7, 0.2);
  }

  createBurst(launchPoint, "#ffb36a", 18);
  flashMessage(destroyed > 0 ? `Pulso incendiario: ${destroyed} objetivos` : "Pulso incendiario");
  beep(150, 0.08, "sawtooth");
}

function spawnDustMote() {
  if (!world.run) return;
  const run = world.run;
  const c = 0.72 + Math.random() * 0.2;
  const col = new THREE.Color().setRGB(c * 0.9, c * 0.75, c * 0.5);
  const p = new THREE.Mesh(
    new THREE.SphereGeometry(0.04 + Math.random() * 0.05, 5, 5),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45 }),
  );
  p.position.set(
    run.x + (Math.random() - 0.5) * 0.55,
    0.1 + Math.random() * 0.08,
    -0.2 - Math.random() * 0.45,
  );
  p.userData = {
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 1.4,
      0.2 + Math.random() * 0.55,
      -0.2 - Math.random() * 0.45,
    ),
    fade: 1.7,
  };
  world.scene.add(p);
  world.particles.push(p);
}

function createBurst(position, color, count) {
  const burstColor = color.startsWith("#") ? color : `#${color}`;
  for (let i = 0; i < count; i += 1) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshBasicMaterial({
        color: burstColor,
        transparent: true,
        opacity: 0.95,
      }),
    );
    particle.position.copy(position);
    particle.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      Math.random() * 3,
      (Math.random() - 0.5) * 6,
    );
    particle.userData.fade = 1.25;
    world.scene.add(particle);
    world.particles.push(particle);
  }
}

function createShockwave(position, color, start, end, lifetime) {
  const wave = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  wave.rotation.x = -Math.PI / 2;
  wave.position.set(position.x, Math.max(0.08, position.y * 0.2), position.z);
  wave.scale.set(start, start, 1);
  wave.userData = {
    kind: "shockwave",
    age: 0,
    lifetime,
    start,
    end,
  };
  world.scene.add(wave);
  world.particles.push(wave);
}

function createMissileTrail(from, to, color) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const distance = direction.length();
  if (distance < 0.2) return;
  direction.normalize();

  const steps = THREE.MathUtils.clamp(Math.floor(distance * 2.4), 8, 18);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 + Math.random() * 0.05, 6, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8 - t * 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    particle.position.copy(from).lerp(to, t);
    particle.position.x += (Math.random() - 0.5) * 0.12;
    particle.position.y += (Math.random() - 0.5) * 0.12;
    particle.position.z += (Math.random() - 0.5) * 0.12;

    particle.userData = {
      velocity: direction.clone().multiplyScalar(2.8 + Math.random() * 3.6),
      drag: 4.6,
      fade: 3.8,
    };

    world.scene.add(particle);
    world.particles.push(particle);
  }
}

function updateHUD() {
  const run = world.run;
  hud.coins.textContent = run.coins;
  hud.ammo.textContent = run.ammo;
  hud.jumps.textContent = run.jumps;
  hud.fire.textContent = run.fire;
  hud.jumpStock.textContent = run.jumps;
  hud.fireStock.textContent = run.fire;
  hud.health.textContent = Math.max(0, Math.ceil(run.health));
  hud.threat.textContent = `${Math.round(run.threat)}%`;
  hud.weather.textContent = run.weatherLabel;
  hud.cycle.textContent = run.cycleLabel;
  hud.distance.textContent = run.distance.toFixed(1);
  hud.biome.textContent = biomeCatalog[run.biome].label;
  hud.objective.textContent = run.objective;
  hud.objectiveProgress.textContent = formatObjectiveProgress(run);
  document.querySelector('[data-game-action="jump"]').disabled = !run.grounded || run.jumps <= 0 || !isPlaying();
  document.querySelector('[data-game-action="fire"]').disabled = run.fire <= 0 || run.ammo < 2 || !isPlaying();
  document.querySelector('[data-game-action="pause"]').disabled = !isPlaying();

  const pips = hud.speedBar.querySelectorAll(".speed-pip");
  const sf = run.speedFactor ?? 1;
  const braking = (run.throttleSmoothed ?? 0) < -0.08;
  const activePips = Math.round(sf * speedPips);
  pips.forEach((pip, i) => {
    pip.classList.toggle("active", !braking && i < activePips);
    pip.classList.toggle("brake", braking && i < Math.round((1 - sf) * speedPips));
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

function initAudio() {
  if (world.audio.ctx) return;
  try {
    const ctx = new AudioContext();
    world.audio.ctx = ctx;
    world.audio.gain = ctx.createGain();
    world.audio.gain.gain.value = state.options.volume / 100;
    world.audio.gain.connect(ctx.destination);
    // Chrome/Safari arrancan en "suspended" hasta un gesto; sin resume(), beep()/motor lanzan y rompen el frame.
    void ctx.resume();
  } catch {
    world.audio.ctx = null;
    world.audio.gain = null;
  }
}

function updateAudioVolume() {
  if (world.audio.gain) {
    world.audio.gain.gain.value = state.options.volume / 100;
  }
}

function beep(frequency, duration, type) {
  if (!world.audio.ctx || !world.audio.gain) return;
  const ctx = world.audio.ctx;
  if (ctx.state !== "running") {
    void ctx.resume();
    return;
  }
  let osc;
  try {
    osc = ctx.createOscillator();
  } catch {
    return;
  }
  const gain = world.audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(world.audio.gain);
  try {
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    /* contexto aún no listo */
  }
}

// ── Engine sound ───────────────────────────────────────────────────────────
function updateEngineSound(speedFactor, skidding) {
  const ctx = world.audio.ctx;
  if (!ctx || !world.audio.gain) return;
  if (ctx.state !== "running") {
    void ctx.resume();
    return;
  }

  if (!engineAudio.osc) {
    try {
      engineAudio.filter = ctx.createBiquadFilter();
      engineAudio.filter.type = "bandpass";
      engineAudio.filter.frequency.value = 180;
      engineAudio.filter.Q.value = 1.4;

      engineAudio.gain = ctx.createGain();
      engineAudio.gain.gain.value = 0.0001;

      engineAudio.osc = ctx.createOscillator();
      engineAudio.osc.type = "sawtooth";
      engineAudio.osc.frequency.value = 80;
      engineAudio.osc.connect(engineAudio.filter);
      engineAudio.filter.connect(engineAudio.gain);
      engineAudio.gain.connect(world.audio.gain);
      engineAudio.osc.start();
    } catch {
      engineAudio.osc = null;
      engineAudio.gain = null;
      engineAudio.filter = null;
      return;
    }
  }

  const t = ctx.currentTime;
  const targetFreq = 55 + speedFactor * 145 + (skidding ? 30 : 0);
  const targetVol  = 0.028 + speedFactor * 0.022;
  try {
    engineAudio.osc.frequency.linearRampToValueAtTime(targetFreq, t + 0.08);
    engineAudio.gain.gain.linearRampToValueAtTime(targetVol * (state.options.volume / 100), t + 0.08);
    engineAudio.filter.frequency.linearRampToValueAtTime(80 + speedFactor * 220, t + 0.08);
  } catch {
    /* nodo de audio invalido */
  }
}

// ── Skid / tyre-squeal sound ───────────────────────────────────────────────
function playSkidSound() {
  const ctx = world.audio.ctx;
  if (!ctx || !world.audio.gain || skidAudio.noise) return;
  if (ctx.state !== "running") {
    void ctx.resume();
    return;
  }
  const bufSize = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  skidAudio.noise = ctx.createBufferSource();
  skidAudio.noise.buffer = buf;
  skidAudio.noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1100;
  filter.Q.value = 0.8;

  skidAudio.gain = ctx.createGain();
  skidAudio.gain.gain.value = 0.0001;
  skidAudio.noise.connect(filter);
  filter.connect(skidAudio.gain);
  skidAudio.gain.connect(world.audio.gain);
  try {
    skidAudio.noise.start();
  } catch {
    skidAudio.noise = null;
    skidAudio.gain = null;
    return;
  }

  const t = ctx.currentTime;
  skidAudio.gain.gain.linearRampToValueAtTime(0.045 * (state.options.volume / 100), t + 0.08);
}

function stopSkidSound() {
  if (!skidAudio.noise) return;
  const ctx = world.audio.ctx;
  try {
    if (ctx && skidAudio.gain) {
      skidAudio.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    }
    skidAudio.noise.stop(ctx ? ctx.currentTime + 0.15 : 0);
  } catch { /* already stopped */ }
  skidAudio.noise = null;
  skidAudio.gain  = null;
}

// ── Skid marks ────────────────────────────────────────────────────────────
function spawnSkidMark() {
  if (!world.run) return;
  const run = world.run;
  for (const dx of [-1.15, 1.15]) {
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.55),
      new THREE.MeshBasicMaterial({ color: "#0a0808", transparent: true, opacity: 0.36, depthWrite: false }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(run.x + dx, 0.018, 0.4);
    mark.userData = { velocity: new THREE.Vector3(0, 0, 0), fade: 0.28 };
    world.scene.add(mark);
    world.particles.push(mark);
  }
}

// ── Dust burst (landing) ──────────────────────────────────────────────────
function spawnDustBurst(count) {
  if (!world.run) return;
  for (let i = 0; i < count; i++) spawnDustMote();
}

// ── Touch joystick ────────────────────────────────────────────────────────
function setupTouchControls() {
  // only inject on touch-capable screens
  const joystickEl = document.createElement("div");
  joystickEl.id = "touch-joystick";
  joystickEl.innerHTML = `<div id="touch-knob"></div>`;
  document.querySelector(".shell").appendChild(joystickEl);

  const knob = document.getElementById("touch-knob");
  const RADIUS = 52;
  let touchId = null;
  let originX = 0, originY = 0;

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
    joystickEl.style.top  = `${originY - 64}px`;
    joystickEl.classList.add("active");
    world.input.touch.active = true;
  }

  function onMove(e) {
    if (touchId === null) return;
    e.preventDefault();
    const touch = [...e.changedTouches].find(t => t.identifier === touchId);
    if (!touch) return;
    const dx = touch.clientX - originX;
    const dy = touch.clientY - originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, RADIUS);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
    world.input.touch.dx = (kx / RADIUS);
    world.input.touch.dy = (ky / RADIUS);
  }

  function onEnd(e) {
    const touch = [...e.changedTouches].find(t => t.identifier === touchId);
    if (!touch) return;
    touchId = null;
    knob.style.transform = "translate(0,0)";
    joystickEl.classList.remove("active");
    world.input.touch.active = false;
    world.input.touch.dx = 0;
    world.input.touch.dy = 0;
  }

  document.addEventListener("touchstart",  onStart, { passive: false });
  document.addEventListener("touchmove",   onMove,  { passive: false });
  document.addEventListener("touchend",    onEnd);
  document.addEventListener("touchcancel", onEnd);
}

function createObstacleMesh(kind) {
  const rustMat = new THREE.MeshStandardMaterial({ color: "#4d3a2e", roughness: 0.95, metalness: 0.4 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.8, metalness: 0.6 });
  const tireMat = new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.9 });
  
  if (kind === "raider") {
    const group = new THREE.Group();
    if (world.assets.models["raider"]) {
      const clone = world.assets.models["raider"].clone();
      group.add(clone);
    } else {
      // Chasis
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.6, 3.4), rustMat);
      body.position.set(0, 0.5, 0);
      
      // Cabina
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.2), darkMetal);
      cabin.position.set(0, 1.15, -0.2);
      
      // Rammer frontal
      const rammer = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.5), darkMetal);
      rammer.position.set(0, 0.4, 1.8);
      
      // Arma
      const gunBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), darkMetal);
      gunBase.position.set(0, 1.6, -0.2);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.4), new THREE.MeshStandardMaterial({ color: "#ffb36a", emissive: "#ff8c47", emissiveIntensity: 0.8 }));
      gun.position.set(0, 1.7, 0.4);
      
      // Ruedas
      const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      const w1 = new THREE.Mesh(wheelGeo, tireMat); w1.position.set(1.0, 0.4, 1.2);
      const w2 = new THREE.Mesh(wheelGeo, tireMat); w2.position.set(-1.0, 0.4, 1.2);
      const w3 = new THREE.Mesh(wheelGeo, tireMat); w3.position.set(1.0, 0.4, -1.2);
      const w4 = new THREE.Mesh(wheelGeo, tireMat); w4.position.set(-1.0, 0.4, -1.2);

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
      height: 0.06,
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

      const spikeGeo = new THREE.ConeGeometry(0.1, 0.6, 4);
      for(let i=0; i<8; i++){
        const spike = new THREE.Mesh(spikeGeo, darkMetal);
        spike.position.set(Math.cos(i*Math.PI/4)*1.5, 4.7, Math.sin(i*Math.PI/4)*1.5);
        group.add(spike);
      }

      group.add(base, top);
      group.traverse(c => { if(c.isMesh) c.castShadow = c.receiveShadow = true; });
    }

    const half = 1.9;
    group.userData = {
      type: "obstacle",
      obstacleSpin: "none",
      damage: 35, // Castles hurt more
      collisionHalfX: 1.8,
      collisionHalfZ: 1.8,
      collisionFootprint: "circle",
      collisionRadius: 1.85,
      height: half,
      collisionYMin: -half,
      collisionYMax: half,
    };
    return group;
  }

  if (kind === "barrier") {
    const group = new THREE.Group();
    if (world.assets.models["barrier"]) {
      const clone = world.assets.models["barrier"].clone();
      group.add(clone);
    } else {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 1.1, 1.1),
        new THREE.MeshStandardMaterial({ color: "#7b4c2d", roughness: 0.95 }),
      );
      // Añadimos púas a la barrera para darle aspecto más rudo
      const spikeGeo = new THREE.ConeGeometry(0.15, 0.8, 4);
      for(let i=0; i<5; i++){
        const spike = new THREE.Mesh(spikeGeo, darkMetal);
        spike.position.set(-1.0 + i*0.5, 0.8, 0);
        group.add(spike);
      }
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(2.7, 0.18, 0.08),
        new THREE.MeshStandardMaterial({ color: "#ffbc6b", emissive: "#ff9f40", emissiveIntensity: 0.8 }),
      );
      strip.position.set(0, 0.1, 0.58);
      base.castShadow = true;
      strip.castShadow = true;
      group.add(base, strip);
    }
    const half = 0.55;
    group.userData = {
      type: "obstacle",
      obstacleSpin: "barrier",
      damage: 18,
      collisionHalfX: 1.6,
      collisionHalfZ: 0.8,
      height: half,
      collisionYMin: -half,
      collisionYMax: half,
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
        new THREE.MeshStandardMaterial({ color: "#4a4546", roughness: 0.92, metalness: 0.5 }),
      );
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.55, 1.3),
        new THREE.MeshStandardMaterial({ color: "#222127", roughness: 0.85 }),
      );
      cabin.position.set(-0.15, 0.6, -0.15);

      // Rueda suelta
      const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.25, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.position.set(1.4, 0, 1.2);
      wheel.rotation.set(0.2, 0.5, 0.1);

      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.08, 0.28),
        new THREE.MeshStandardMaterial({ color: "#ff8d6d", emissive: "#ff5d38", emissiveIntensity: 1.6 }),
      );
      glow.position.set(0, 0.18, 1.42);
      body.rotation.set(0.1, 0.1, -0.1);
      group.add(body, cabin, wheel, glow);
      group.traverse(c => { if(c.isMesh) c.castShadow = c.receiveShadow = true; });
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "wreck",
      damage: 20,
      collisionHalfX: 1.3,
      collisionHalfZ: 1.8,
      height: 0.48,
      collisionYMin: -0.45,
      collisionYMax: 1.2,
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
    // Añadimos una viga incrustada
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 0.2), darkMetal);
    beam.rotation.set(0.4, 0.2, 0.8);
    groupScrap.add(core, beam);
    groupScrap.traverse(c => { if(c.isMesh) c.castShadow = c.receiveShadow = true; });
  }

  groupScrap.userData = {
    type: "obstacle",
    obstacleSpin: "scrap",
    damage: 16,
    collisionHalfX: 1.12,
    collisionHalfZ: 1.12,
    height: scrapR + 0.04,
    collisionYMin: -scrapR,
    collisionYMax: scrapR,
  };
  return groupScrap;
}

/** Contorno en el suelo alineado con la huella de colisión (no un donut genérico). */
function createFootprintMarker(obstacle, kind) {
  const ud = obstacle.userData;
  const color =
    kind === "tower" ? "#ff6b47" : kind === "barrier" ? "#ffb84d" : kind === "raider" ? "#ff4d72" : "#ff8c61";
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
    const r = ud.collisionRadius ?? Math.max(ud.collisionHalfX ?? 1, ud.collisionHalfZ ?? 1);
    const segs = 28;
    const pts = [];
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
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
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rect), mat));
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
  const geo = new THREE.SphereGeometry(1.8, 48, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > -0.2) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Fractal displacement
      const disp = Math.sin(x * 2) * Math.cos(z * 2) * 0.15 + Math.sin(x * 5) * 0.05;
      pos.setX(i, x + (Math.random() - 0.5) * 0.1 + disp * 0.5);
      pos.setZ(i, z + (Math.random() - 0.5) * 0.1 + disp * 0.5);
      pos.setY(i, y + (Math.random() - 0.5) * 0.1 + disp);
    }
  }
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.06 + Math.random() * 0.03, 0.45 + Math.random() * 0.15, 0.35 + Math.random() * 0.15),
      roughness: 0.95,
      bumpMap: world.terrainBumpTexture,
      roughnessMap: world.terrainRoughnessTexture,
      bumpScale: 0.12,
    }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData = { isDune: true, baseY: -0.25 };
  return mesh;
}

function createScatteredBoulder() {
  const root = new THREE.Group();
  const mRock = new THREE.MeshStandardMaterial({
    color: "#6b503e",
    roughness: 0.9,
    metalness: 0.05,
    bumpMap: world.terrainBumpTexture,
    roughnessMap: world.terrainRoughnessTexture,
    bumpScale: 0.25
  });

  const n = 1 + Math.floor(Math.random() * 3);
  for (let b = 0; b < n; b += 1) {
    const r = 0.5 + Math.random() * 1.5;
    const geo = new THREE.IcosahedronGeometry(r, 3);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const val = Math.random();
      pos.setXYZ(
        i,
        pos.getX(i) * (1 + val * 0.15),
        pos.getY(i) * (1 + val * 0.2),
        pos.getZ(i) * (1 + val * 0.15)
      );
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mRock);
    mesh.position.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
    mesh.rotation.set(Math.random(), Math.random(), Math.random());
    mesh.scale.y = 0.6 + Math.random() * 0.5;
    root.add(mesh);
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
    bumpScale: 0.4
  });

  const columns = 4 + (i % 5);
  for (let c = 0; c < columns; c += 1) {
    const h = 8 + Math.random() * 25;
    const r = 3 + Math.random() * 6;
    const geo = new THREE.CylinderGeometry(r * 0.6, r, h, 9, 4);
    const pos = geo.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      pos.setX(j, pos.getX(j) + (Math.random() - 0.5) * 1.8);
      pos.setZ(j, pos.getZ(j) + (Math.random() - 0.5) * 1.8);
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
  m.rotation.y = (side * (0.08 + Math.random() * 0.1)) * (0.3 + Math.random() * 0.5);
}

function createCityBackdrop(i) {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.6, 0.08, 0.18 + (i % 5) * 0.03),
    roughness: 0.92,
    metalness: 0.08,
  });

  const towers = 3 + (i % 4);
  for (let index = 0; index < towers; index += 1) {
    const h = 14 + Math.random() * 34;
    const w = 4 + Math.random() * 7;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.8 + Math.random() * 0.7)), mat);
    tower.position.set((Math.random() - 0.5) * 24, h * 0.5 - 1, (Math.random() - 0.5) * 10);
    tower.rotation.y = (Math.random() - 0.5) * 0.12;
    root.add(tower);
  }

  root.userData.speedFactor = 0.05 + Math.random() * 0.03;
  recycleCityBackdrop(root);
  applyRoadsideShadows(root);
  return root;
}

function recycleCityBackdrop(root) {
  const side = Math.random() > 0.5 ? 1 : -1;
  root.position.set(side * (48 + Math.random() * 26), 0, 160 + Math.random() * 140);
  root.rotation.y = (Math.random() - 0.5) * 0.08;
}

function createCityRoadsideProp(index) {
  const kind = index % 6;
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: "#5a6069", roughness: 0.75, metalness: 0.35 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#6f757d", roughness: 0.95 });
  const glow = new THREE.MeshStandardMaterial({ color: "#c6efff", emissive: "#8ad4ff", emissiveIntensity: 0.45 });
  const rust = new THREE.MeshStandardMaterial({ color: "#654f4c", roughness: 0.95 });

  if (kind === 0) {
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.1, 0.8), concrete);
    const light = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.08), glow);
    light.position.set(0, 0.05, 0.42);
    root.add(barrier, light);
  } else if (kind === 1) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5.8, 8), steel);
    pole.position.y = 2.9;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.1), rust);
    sign.position.set(0, 4.1, 0.18);
    root.add(pole, sign);
  } else if (kind === 2) {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 3.1), rust);
    shell.position.set(0, 0.45, 0);
    shell.rotation.set(0.08, Math.random(), -0.12);
    root.add(shell);
  } else if (kind === 3) {
    const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.9, 10), rust);
    hydrant.position.y = 0.45;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.12), steel);
    arm.position.set(0.22, 0.55, 0);
    root.add(hydrant, arm);
  } else if (kind === 4) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.32, 0.85, 12), glow);
    cone.position.y = 0.42;
    root.add(cone);
  } else {
    const wallA = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.6, 0.4), concrete);
    const wallB = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.4), concrete);
    wallA.position.set(0, 0.8, 0);
    wallB.position.set(0.95, 0.55, 0.2);
    wallB.rotation.y = (Math.random() - 0.5) * 0.3;
    root.add(wallA, wallB);
  }

  applyRoadsideShadows(root);
  root.userData.speedFactor = 0.9 + Math.random() * 0.12;
  recycleCityRoadsideProp(root, true);
  return root;
}

function recycleCityRoadsideProp(prop, initial = false) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const dist = 10 + Math.random() * 18;
  prop.position.set(side * dist, 0, (initial ? Math.random() * 220 : 220) + Math.random() * 90);
  prop.rotation.y = side === 1 ? -0.04 : 0.04;
}

function createRoadsideProp(index) {
  const kind = index % 14;
  const root = new THREE.Group();

  const mRust = (l) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.06, 0.2, l), roughness: 0.95, bumpMap: world.terrainBumpTexture, bumpScale: 0.1 });
  const mW = new THREE.MeshStandardMaterial({ color: "#3a2d26", roughness: 0.9, bumpMap: world.terrainBumpTexture, bumpScale: 0.2 });
  const mConc = new THREE.MeshStandardMaterial({ color: "#6a6560", roughness: 0.95, bumpMap: world.terrainBumpTexture, bumpScale: 0.3 });
  const mSteel = new THREE.MeshStandardMaterial({ color: "#3d4148", metalness: 0.5, roughness: 0.6 });
  const mEm = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
  const mDirt = new THREE.MeshStandardMaterial({ color: "#4d3628", roughness: 1 });
  const mDead = new THREE.MeshStandardMaterial({ color: "#4a3d32", roughness: 1 });

  if (kind === 0) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.4, 8), mConc);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 6, 8), mSteel);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.14), mSteel);
    const bH = 2.2;
    base.position.y = 0.2;
    pole.position.y = bH + 2.5;
    arm.position.set(0, bH + 5.15, 0.15);
    arm.rotation.z = (Math.random() - 0.5) * 0.1;
    const lL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.2), mEm("#ffc080", 0.95));
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
    const face = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.1), mRust(0.35));
    face.position.set(0, 2.3, 0);
    face.rotation.z = (Math.random() - 0.5) * 0.2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 1.9), mEm("#1a1a1a", 0));
    bar.position.set(0, 2.3, 0.1);
    root.add(pL, pR, face, bar);
  } else if (kind === 2) {
    // Vehículo oxidado más realista
    const ch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 3.2), mRust(0.22));
    ch.position.set(0, 0.4, 0);
    ch.rotation.set(0.1, Math.random(), 0.15);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.2), mRust(0.18));
    c2.position.set(-0.1, 0.9, -0.2);
    c2.rotation.z = -0.1;
    
    const wMat = new THREE.MeshStandardMaterial({ color: "#100d0d", roughness: 1 });
    for (const [wx, wz] of [[0.85, 1.2], [-0.85, 0.5], [0.85, -0.8], [-0.85, -1.3]]) {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2)),
        wMat,
      );
      w.position.set(wx, 0.3, wz);
      w.rotation.set(Math.random(), Math.random(), Math.random());
      root.add(w);
    }
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 1.0), mRust(0.25));
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
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.15, 0.08), mEm("#9aa0a8", 0.1));
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
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.1), mRust(0.35));
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
    const wM = new THREE.MeshStandardMaterial({ color: "#141210", roughness: 1 });
    for (let t = 0; t < 4; t += 1) {
      const tor = new THREE.Mesh(
        new THREE.TorusGeometry(0.25 + Math.random() * 0.05, 0.05, 8, 20).applyMatrix4(
          new THREE.Matrix4().makeRotationX(Math.PI / 2),
        ),
        wM,
      );
      tor.position.set((Math.random() - 0.5) * 0.2, 0.1 + t * 0.15, (Math.random() - 0.5) * 0.2);
      tor.rotation.set(Math.random() * 0.4, Math.random() * 0.4, 0);
      root.add(tor);
    }
  } else if (kind === 8) {
    const oMat = mRust(0.28);
    for (const dx of [0, 0.6, -0.6]) {
      if (Math.random() > 0.8) continue;
      const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 12), oMat);
      dr.position.set(dx, 0.3, (Math.random() - 0.5) * 0.2);
      dr.rotation.set(Math.random() * 0.2, 0, Math.random() * 0.2);
      root.add(dr);
    }
    const cr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.25), mEm("#4a2e18", 0));
    cr.position.set(0.25, 0.05, 0.15);
    root.add(cr);
  } else if (kind === 9) {
    const postA = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 1.5, 8), mConc);
    postA.position.set(-0.3, 0.75, 0.3);
    const postB = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 1.5, 8), mConc);
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
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.06), mEm("#1e1612", 0.12));
    board.position.set(0, 1.0, 0.1);
    board.rotation.z = (Math.random() - 0.5) * 0.3;
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), mRust(0.35));
    br.position.set(0, 0.2, 0.15);
    br.rotation.set(0, 0, -0.4);
    root.add(p0, p1, board, br);
  } else if (kind === 11) {
    // Estructura de tubería
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.5, 12), mRust(0.4));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 0.4, 0);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), mRust(0.3));
    joint.position.set(1.2, 0.4, 0);
    const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 12), mRust(0.4));
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
  } else {
    // Árbol muerto más complejo
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.2, 6), mDead);
    tr.position.set(0, 0.6, 0.05);
    tr.rotation.x = (Math.random() - 0.5) * 0.2;
    tr.rotation.z = (Math.random() - 0.5) * 0.2;
    for (let r = 0; r < 4; r++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.8, 5), mDead);
      arm.position.set((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3);
      arm.rotation.set((Math.random() - 0.5) * 1.5, Math.random() * 2, (Math.random() - 0.5) * 1.5);
      root.add(arm);
    }
    root.add(tr);
  }

  applyRoadsideShadows(root);
  root.userData.speedFactor = 0.85 + Math.random() * 0.15;
  recycleRoadsideProp(root, true);
  return root;
}

function recycleRoadsideProp(prop, initial = false) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const dist = 10.5 + Math.random() * 28;
  prop.position.set(
    side * dist,
    0,
    (initial ? Math.random() * 240 : 200) + Math.random() * 120,
  );
  prop.rotation.y = (side === 1 ? -1 : 1) * (0.1 + Math.random() * 0.4) + (Math.random() - 0.5) * 0.2;
  prop.rotation.x = (Math.random() - 0.5) * 0.08;
  prop.rotation.z = (Math.random() - 0.5) * 0.08;
}
