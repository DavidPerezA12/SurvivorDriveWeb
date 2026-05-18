import * as THREE from "three";

import { createProceduralModel } from "./proceduralAssets.js";

const modelManifest = {
  player: { path: "models/ferrari.glb", type: "gltf" },
  raider: { path: "models/raider.fbx", type: "fbx" },
  barrel: { path: "models/barrel.fbx", type: "fbx" },
  barrier: { path: "models/barrier.fbx", type: "fbx" },
  crate: { type: "procedural" },
  building: { path: "models/house.fbx", type: "fbx" },
  rock: { path: "models/rock.fbx", type: "fbx" },
  tower: { path: "models/tower.fbx", type: "fbx" },
  tree: { path: "models/tree.fbx", type: "fbx" },
  wreck: { path: "models/wreck.fbx", type: "fbx" },
};

const modelTransforms = {
  player: { scale: 1.1, rotationY: Math.PI },
  raider: { scale: 0.015 },
  building: { scale: 0.06 },
  tree: { scale: 0.02 },
  tower: { scale: 0.03 },
  barrel: { scale: 0.018 },
  crate: { scale: 0.018 },
  barrier: { scale: 0.018 },
  rock: { scale: 0.025 },
  wreck: { scale: 0.015 },
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
  const loaders = await createLoaders();
  const restoreConsoleWarn = silenceExpectedFbxWarnings();

  try {
    await loadModels(world.assets.models, loaders);
  } finally {
    restoreConsoleWarn();
    loaders.dispose();
  }

  assignAliases(world.assets.models);
}

async function createLoaders() {
  const [{ GLTFLoader }, { DRACOLoader }, { FBXLoader }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/loaders/DRACOLoader.js"),
    import("three/addons/loaders/FBXLoader.js"),
  ]);

  const manager = new THREE.LoadingManager();
  const gltfLoader = new GLTFLoader(manager);
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath("/draco/gltf/");
  gltfLoader.setDRACOLoader(dracoLoader);

  const fbxLoader = new FBXLoader(manager);

  return {
    fbxLoader,
    gltfLoader,
    dispose: () => dracoLoader.dispose(),
  };
}

async function loadModels(models, loaders) {
  await Promise.all(
    Object.entries(modelManifest).map(async ([name, info]) => {
      const model = await loadModel(name, info, loaders);
      if (model) models[name] = model;
    }),
  );
}

function loadModel(name, info, loaders) {
  if (info.type === "procedural") {
    return Promise.resolve(createProceduralModel(name));
  }

  const loader = info.type === "gltf" ? loaders.gltfLoader : loaders.fbxLoader;

  return new Promise((resolve) => {
    loader.load(
      info.path,
      (result) => {
        const model = info.type === "gltf" ? result.scene : result;
        normalizeModel(model, name);
        resolve(model);
      },
      undefined,
      (error) => {
        console.error(`Error loading model ${name}:`, error);
        resolve(null);
      },
    );
  });
}

function assignAliases(models) {
  Object.entries(assetAlias).forEach(([alias, target]) => {
    if (models[target]) {
      models[alias] = models[target];
    }
  });
}

function silenceExpectedFbxWarnings() {
  const originalWarn = console.warn;

  console.warn = (...args) => {
    if (isExpectedFbxWarning(args)) return;
    originalWarn(...args);
  };

  return () => {
    console.warn = originalWarn;
  };
}

function isExpectedFbxWarning(args) {
  const message = args.map((arg) => String(arg)).join(" ");
  return (
    message.includes("THREE.FBXLoader") &&
    (message.includes("map is not supported in three.js") ||
      message.includes("unknown material type"))
  );
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

  applyModelTransform(model, name);
}

function applyModelTransform(model, name) {
  const transform = modelTransforms[name];
  if (!transform) return;

  if (transform.scale) {
    model.scale.setScalar(transform.scale);
  }

  if (transform.rotationY !== undefined) {
    model.rotation.y = transform.rotationY;
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
