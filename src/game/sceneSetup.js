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

import {
  createRoadsideProp,
  createCityRoadsideProp,
} from "../world/meshes/roadside.js";

import {
  createBackdropMesa,
  createCityBackdrop,
  createFarBackdropElement,
} from "../world/meshes/backdrops.js";

import { createRoadDetail } from "../world/meshes/roadDetails.js";

import { createCar } from "./car.js";

import {
  recycleRoadsideProp,
  recycleCityRoadsideProp,
} from "../world/movement.js";

export function setupThree(world, state, equipmentCatalog, getCurrentBiome, isDesertBiome, onResize) {
  world.renderer.outputColorSpace = THREE.SRGBColorSpace;

  world.renderer.toneMapping = THREE.ACESFilmicToneMapping;

  world.renderer.toneMappingExposure = 1.05;

  world.renderer.shadowMap.enabled = true;

  world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  world.pmrem = new THREE.PMREMGenerator(world.renderer);

  const room = new RoomEnvironment();

  world.envTexture = world.pmrem.fromScene(room, 0.0).texture;

  room.dispose();

  world.scene.fog = new THREE.FogExp2("#9e7447", 0.005);

  world.scene.background = new THREE.Color("#120b08");

  const ambient = new THREE.HemisphereLight("#a88768", "#211108", 0.6);

  world.scene.add(ambient);

  world.lights.ambient = ambient;

  const fill = new THREE.DirectionalLight("#606f7d", 0.35);

  fill.position.set(-20, 15, -10);

  world.scene.add(fill);

  const starGeo = new THREE.BufferGeometry();

  const starPos = [];

  for (let i = 0; i < 400; i++) {
    const x = (Math.random() - 0.5) * 500;

    const y = 10 + Math.random() * 200;

    const z = -140;

    starPos.push(x, y, z);
  }

  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));

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
    color: "#666666",
    map: roadData.map,
    bumpMap: roadData.bumpMap,
    roughnessMap: roadData.roughnessMap,
    bumpScale: 0.15,
    roughness: 0.85,
    metalness: 0.1,
  });

  const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 600, 16, 64), roadMaterial);

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

  world.roadShoulders = [-8.2, 8.2].map((x) => {
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 600, 4, 64),
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

  for (let i = 0; i < 160; i += 1) {
    const dune = createDune({
      bumpMap: world.terrainBumpTexture,
      roughnessMap: world.terrainRoughnessTexture,
    });

    recycleEnvironmentObject(dune, true, 12, 100, -35, 300);

    world.scene.add(dune);

    world.dunes.push(dune);
  }

  for (let i = 0; i < 220; i += 1) {
    const prop = createRoadsideProp(i, world.terrainBumpTexture);
    recycleRoadsideProp(prop, true);

    world.scene.add(prop);

    world.roadsideProps.push(prop);
  }

  for (let i = 0; i < 70; i += 1) {
    const b = createBackdropMesa(i, world.terrainBumpTexture);

    world.scene.add(b);

    world.roadsideBackdrop.push(b);
  }

  for (let i = 0; i < 90; i += 1) {
    const prop = createCityRoadsideProp(i);

    recycleCityRoadsideProp(prop, true);

    prop.visible = false;

    world.scene.add(prop);

    world.cityProps.push(prop);
  }

  for (let i = 0; i < 45; i += 1) {
    const skyline = createCityBackdrop(i);

    skyline.visible = false;

    world.scene.add(skyline);

    world.cityBackdrop.push(skyline);
  }

  for (let i = 0; i < 280; i += 1) {
    const boulder = createScatteredBoulder({
      bumpMap: world.terrainBumpTexture,
      roughnessMap: world.terrainRoughnessTexture,
    });

    recycleEnvironmentObject(boulder, true, 12, 100, -50, 320);

    world.scene.add(boulder);

    world.boulders.push(boulder);
  }

  for (let i = 0; i < 80; i += 1) {
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
      (Math.random() - 0.5) * 55,
      1.5 + Math.random() * 6,
      i * 12,
    );

    band.rotation.y = (Math.random() - 0.5) * 0.8;

    world.scene.add(band);

    world.dustBands.push(band);
  }

  world.heatShimmer = [];

  for (let i = 0; i < 16; i++) {
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

  for (let i = 0; i < 35; i++) {
    const far = createFarBackdropElement(i, isDesertBiome(getCurrentBiome()) ? "desert" : "city");

    world.scene.add(far);

    world.farBackdrop.push(far);
  }

  for (let i = 0; i < 100; i++) {
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
