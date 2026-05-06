import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const modelsToLoad = {
  player: { path: "models/ferrari.glb", type: "gltf" },
  raider: { path: "models/raider.fbx", type: "fbx" },
  barrel: { path: "models/barrel.fbx", type: "fbx" },
  barrier: { path: "models/barrier.fbx", type: "fbx" },
  crate: { path: "models/crate.fbx", type: "fbx" },
  building: { path: "models/house.fbx", type: "fbx" },
  rock: { path: "models/rock.fbx", type: "fbx" },
  tower: { path: "models/tower.fbx", type: "fbx" },
  tree: { path: "models/tree.fbx", type: "fbx" },
  wreck: { path: "models/wreck.fbx", type: "fbx" },
};

const assetAlias = {
  watchtower: "tower",
  wreckage: "wreck",
  military_barrier: "barrier",
  barricade: "barrier",
  house: "building",
  building_ruin: "building",
  debris_pile: "rock",
  scrap: "barrel",
};

export async function loadAssets(world) {
  const manager = new THREE.LoadingManager();
  const gltfLoader = new GLTFLoader(manager);
  const fbxLoader = new FBXLoader(manager);

  const promises = Object.entries(modelsToLoad).map(([name, info]) => {
    return new Promise((resolve) => {
      const loader = info.type === "gltf" ? gltfLoader : fbxLoader;
      loader.load(
        info.path,
        (result) => {
          let model = info.type === "gltf" ? result.scene : result;
          normalizeModel(model, name);
          world.assets.models[name] = model;
          resolve();
        },
        undefined,
        (error) => {
          console.error(`Error loading model ${name}:`, error);
          resolve();
        },
      );
    });
  });

  await Promise.all(promises);

  Object.entries(assetAlias).forEach(([alias, target]) => {
    if (world.assets.models[target]) {
      world.assets.models[alias] = world.assets.models[target];
    }
  });
}

function normalizeModel(model, name) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => improveMaterial(m, name));
        } else {
          child.material = improveMaterial(child.material, name);
        }
      }
    }
  });

  switch (name) {
    case "player":
      model.scale.set(1.1, 1.1, 1.1);
      model.rotation.y = Math.PI;
      break;
    case "raider":
      model.scale.set(0.015, 0.015, 0.015);
      break;
    case "building":
      model.scale.set(0.06, 0.06, 0.06);
      break;
    case "tree":
      model.scale.set(0.02, 0.02, 0.02);
      break;
    case "tower":
      model.scale.set(0.03, 0.03, 0.03);
      break;
    case "barrel":
    case "crate":
    case "barrier":
      model.scale.set(0.018, 0.018, 0.018);
      break;
    case "rock":
      model.scale.set(0.025, 0.025, 0.025);
      break;
    case "wreck":
      model.scale.set(0.015, 0.015, 0.015);
      break;
  }
}

function improveMaterial(mat, modelName) {
  const isPlayer = modelName === "player";

  const params = {
    color: mat.color,
    map: mat.map,
    normalMap: mat.normalMap,
    roughness: isPlayer ? 0.3 : 0.6,
    metalness: isPlayer ? 0.8 : 0.4,
    envMapIntensity: 1.2,
  };

  let newMat;
  if (isPlayer) {
    newMat = new THREE.MeshPhysicalMaterial({
      ...params,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
  } else {
    newMat = new THREE.MeshStandardMaterial(params);
  }

  const matName = mat.name.toLowerCase();
  if (matName.includes("glass") || matName.includes("window")) {
    newMat.transparent = true;
    newMat.opacity = 0.4;
    newMat.roughness = 0.05;
    newMat.metalness = 0.95;
    if (newMat.isMeshPhysicalMaterial) {
      newMat.transmission = 0.9;
      newMat.thickness = 0.5;
    }
  }

  if (matName.includes("tire") || matName.includes("rubber")) {
    newMat.roughness = 0.95;
    newMat.metalness = 0.0;
    newMat.color.set("#1a1a1a");
  }

  if (matName.includes("emissive") || matName.includes("light")) {
    newMat.emissive = mat.color.clone();
    newMat.emissiveIntensity = 2.0;
  }

  return newMat;
}
