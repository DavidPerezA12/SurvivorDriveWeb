import * as THREE from "three";

import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import {
  createTerrainTexture,
  createShoulderTexture,
  createRoadTexture,
} from "../renderer/textures.js";

import {
  createDune,
  createScatteredBoulder,
  recycleEnvironmentObject,
} from "../world/environment.js";

import { createRoadsideProp, createCityRoadsideProp } from "../world/meshes/roadside.js";

import {
  createBackdropMesa,
  createCityBackdrop,
  createFarBackdropElement,
} from "../world/meshes/backdrops.js";

import { createRoadDetail } from "../world/meshes/roadDetails.js";

import { createCar } from "./car.js";

import { recycleRoadsideProp, recycleCityRoadsideProp } from "../world/movement.js";

const SCENE_BUDGETS = {
  low: {
    pixelRatio: 1,
    shadowMapSize: 512,
    stars: 90,
    dunes: 20,
    roadsideProps: 34,
    roadsideBackdrop: 10,
    cityProps: 18,
    cityBackdrop: 8,
    boulders: 36,
    dustBands: 12,
    heatShimmer: 3,
    farBackdrop: 8,
    roadDetails: 24,
    groundSegments: [12, 12],
    roadSegments: [4, 24],
    shoulderSegments: [2, 24],
  },
  medium: {
    pixelRatio: 1.25,
    shadowMapSize: 1024,
    stars: 140,
    dunes: 34,
    roadsideProps: 52,
    roadsideBackdrop: 14,
    cityProps: 26,
    cityBackdrop: 10,
    boulders: 58,
    dustBands: 18,
    heatShimmer: 4,
    farBackdrop: 10,
    roadDetails: 32,
    groundSegments: [18, 18],
    roadSegments: [8, 36],
    shoulderSegments: [3, 36],
  },
  high: {
    pixelRatio: 1.6,
    shadowMapSize: 1536,
    stars: 220,
    dunes: 52,
    roadsideProps: 76,
    roadsideBackdrop: 20,
    cityProps: 38,
    cityBackdrop: 14,
    boulders: 88,
    dustBands: 24,
    heatShimmer: 6,
    farBackdrop: 14,
    roadDetails: 42,
    groundSegments: [28, 28],
    roadSegments: [12, 52],
    shoulderSegments: [4, 52],
  },
};

function getSceneBudget(state) {
  return SCENE_BUDGETS[state.options.quality] ?? SCENE_BUDGETS.medium;
}

function configureRepeatingTextureSet(textureSet, repeatX, repeatY, anisotropy) {
  const textures = [textureSet.map, textureSet.bumpMap, textureSet.roughnessMap].filter(Boolean);

  for (const texture of textures) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  }

  textureSet.map.anisotropy = anisotropy;
}

export function setupThree(
  world,
  state,
  equipmentCatalog,
  getCurrentBiome,
  isDesertBiome,
  onResize,
) {
  const budget = getSceneBudget(state);

  world.renderer.outputColorSpace = THREE.SRGBColorSpace;
  world.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  world.renderer.toneMappingExposure = 1.05;
  world.renderer.shadowMap.enabled = state.options.quality === "high";
  world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, budget.pixelRatio));
  world.pmrem = new THREE.PMREMGenerator(world.renderer);

  const room = new RoomEnvironment();
  world.envTexture = world.pmrem.fromScene(room, 0.0).texture;
  room.dispose();

  world.scene.fog = new THREE.FogExp2("#9e7447", 0.005);
  world.scene.background = new THREE.Color("#120b08");

  const ambient = new THREE.HemisphereLight("#a88768", "#211108", 0.6);
  const fill = new THREE.DirectionalLight("#606f7d", 0.35);
  fill.position.set(-20, 15, -10);
  world.scene.add(ambient, fill);
  world.lights.ambient = ambient;

  const starGeo = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < budget.stars; i += 1) {
    starPositions.push((Math.random() - 0.5) * 500, 10 + Math.random() * 200, -140);
  }

  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));

  const starMat = new THREE.PointsMaterial({
    color: "#fff",
    size: 0.65,
    transparent: true,
    opacity: 0,
  });

  const stars = new THREE.Points(starGeo, starMat);
  world.scene.add(stars);
  world.lights.stars = stars;

  const sun = new THREE.DirectionalLight("#fff0d4", 1.2);
  sun.position.set(16, 28, 10);
  sun.castShadow = state.options.quality === "high";
  Object.assign(sun.shadow.camera, {
    near: 0.5,
    far: 150,
    left: -50,
    right: 50,
    top: 50,
    bottom: -50,
  });
  sun.shadow.mapSize.set(budget.shadowMapSize, budget.shadowMapSize);
  sun.shadow.bias = -0.0005;
  world.lights.sun = sun;
  world.scene.add(sun);

  const anisotropy = world.renderer.capabilities.getMaxAnisotropy();
  const terrainData = createTerrainTexture();
  configureRepeatingTextureSet(terrainData, 8, 20, anisotropy);

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
    new THREE.PlaneGeometry(450, 600, ...budget.groundSegments),
    sandMaterial,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 150;
  ground.receiveShadow = true;

  const roadData = createRoadTexture();
  configureRepeatingTextureSet(roadData, 1, 20, anisotropy);

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
    new THREE.PlaneGeometry(14, 600, ...budget.roadSegments),
    roadMaterial,
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.03, 150);
  road.receiveShadow = true;
  world.scene.add(ground, road);

  const shoulderData = createShoulderTexture();
  configureRepeatingTextureSet(shoulderData, 1, 20, anisotropy);

  const shoulderMaterial = new THREE.MeshStandardMaterial({
    color: "#6f553a",
    map: shoulderData.map,
    bumpMap: shoulderData.bumpMap,
    roughnessMap: shoulderData.roughnessMap,
    bumpScale: 0.25,
    roughness: 0.95,
    metalness: 0.02,
  });

  world.roadShoulders = [-8.2, 8.2].map((x) => {
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 600, ...budget.shoulderSegments),
      shoulderMaterial,
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(x, 0.02, 150);
    shoulder.receiveShadow = true;
    world.scene.add(shoulder);
    return shoulder;
  });

  Object.assign(world, {
    groundSurface: ground,
    roadSurface: road,
    roadTexture: roadData.map,
    roadBumpTexture: roadData.bumpMap,
    roadRoughnessTexture: roadData.roughnessMap,
    terrainTexture: terrainData.map,
    terrainBumpTexture: terrainData.bumpMap,
    terrainRoughnessTexture: terrainData.roughnessMap,
    shoulderTexture: shoulderData.map,
    shoulderBumpTexture: shoulderData.bumpMap,
    shoulderRoughnessTexture: shoulderData.roughnessMap,
  });

  Object.assign(world.materials, {
    ground: sandMaterial,
    road: roadMaterial,
    shoulder: shoulderMaterial,
  });

  for (let i = 0; i < budget.dunes; i += 1) {
    const dune = createDune({
      bumpMap: world.terrainBumpTexture,
      roughnessMap: world.terrainRoughnessTexture,
    });

    recycleEnvironmentObject(dune, true, 12, 100, -35, 300);

    world.scene.add(dune);

    world.dunes.push(dune);
  }

  for (let i = 0; i < budget.roadsideProps; i += 1) {
    const prop = createRoadsideProp(i, world.terrainBumpTexture);
    recycleRoadsideProp(prop, true);

    world.scene.add(prop);

    world.roadsideProps.push(prop);
  }

  for (let i = 0; i < budget.roadsideBackdrop; i += 1) {
    const b = createBackdropMesa(i, world.terrainBumpTexture);

    world.scene.add(b);

    world.roadsideBackdrop.push(b);
  }

  for (let i = 0; i < budget.cityProps; i += 1) {
    const prop = createCityRoadsideProp(i);

    recycleCityRoadsideProp(prop, true);

    prop.visible = false;

    world.scene.add(prop);

    world.cityProps.push(prop);
  }

  for (let i = 0; i < budget.cityBackdrop; i += 1) {
    const skyline = createCityBackdrop(i);

    skyline.visible = false;

    world.scene.add(skyline);

    world.cityBackdrop.push(skyline);
  }

  for (let i = 0; i < budget.boulders; i += 1) {
    const boulder = createScatteredBoulder({
      bumpMap: world.terrainBumpTexture,
      roughnessMap: world.terrainRoughnessTexture,
    });

    recycleEnvironmentObject(boulder, true, 12, 100, -50, 320);

    world.scene.add(boulder);

    world.boulders.push(boulder);
  }

  for (let i = 0; i < budget.dustBands; i += 1) {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 10),
      new THREE.MeshBasicMaterial({
        color: "#f2c38f",
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
      }),
    );

    band.position.set((Math.random() - 0.5) * 55, 1.5 + Math.random() * 6, i * 12);

    band.rotation.y = (Math.random() - 0.5) * 0.8;
    band.userData.offset = Math.random() * Math.PI * 2;

    world.scene.add(band);

    world.dustBands.push(band);
  }

  world.heatShimmer = [];

  for (let i = 0; i < budget.heatShimmer; i++) {
    const shimmerGeo = new THREE.PlaneGeometry(
      15 + Math.random() * 20,
      6 + Math.random() * 8,
      4,
      2,
    );

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

  for (let i = 0; i < budget.farBackdrop; i++) {
    const far = createFarBackdropElement(i, isDesertBiome(getCurrentBiome()) ? "desert" : "city");

    world.scene.add(far);

    world.farBackdrop.push(far);
  }

  for (let i = 0; i < budget.roadDetails; i++) {
    const detail = createRoadDetail();

    world.scene.add(detail);

    world.roadDetails.push(detail);
  }

  world.car = createCar(world, state, equipmentCatalog);

  world.scene.add(world.car);

  world.camera.position.set(0, 6.2, -11.5);

  world.camera.lookAt(0, 1.4, 8);

  window.addEventListener("resize", onResize);

  onResize();
}
