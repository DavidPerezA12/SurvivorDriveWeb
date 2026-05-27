import * as THREE from "three";

const PICKUP_CACHE = new Map();

export function createPickupMesh(type, pickupCatalog, models = {}, y = 1.2) {
  const cacheKey = `${type}:${y}`;

  if (!PICKUP_CACHE.has(cacheKey)) {
    const template = buildPickupMeshRaw(type, pickupCatalog, models, y);
    template.traverse((node) => {
      if (node.isMesh) {
        if (node.geometry) node.geometry.userData.persistentResource = true;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of materials) {
          if (mat) mat.userData.persistentResource = true;
        }
      }
    });
    PICKUP_CACHE.set(cacheKey, template);
  }

  const template = PICKUP_CACHE.get(cacheKey);
  const clone = template.clone();
  clone.userData = {
    ...template.userData,
    bobTimer: Math.random() * Math.PI * 2,
    spinSpeed: 1.5 + Math.random() * 1.0,
  };
  return clone;
}

function buildPickupMeshRaw(type, pickupCatalog, models = {}, y = 1.2) {
  const config = pickupCatalog[type] || pickupCatalog.coin;
  const group = new THREE.Group();
  const mesh = createPickupCoreMesh(type, config, models);

  group.add(mesh);

  const light = new THREE.PointLight(config.color, 4.0, 6);
  light.position.set(0, 0, 0);
  group.add(light);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 2.0),
    new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -y + 0.1;
  group.add(glow);

  group.userData = {
    type: "pickup",
    pickupType: type,
    amount: config.amount,
    label: config.label,
    bobTimer: Math.random() * Math.PI * 2,
    spinSpeed: 1.5 + Math.random() * 1.0,
  };

  return group;
}

function createPickupCoreMesh(type, config, models) {
  const standardMat = new THREE.MeshPhysicalMaterial({
    color: config.color,
    metalness: 0.8,
    roughness: 0.2,
    clearcoat: 1.0,
    envMapIntensity: 1.5,
  });

  if (type === "coin") {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.15, 12, 32), standardMat);
    mesh.rotation.y = Math.PI / 2;
    return mesh;
  }

  if ((type === "ammo" || type === "repair") && models.crate) {
    const mesh = models.crate.clone();
    tintModel(mesh, standardMat, type === "ammo" ? "#0088ff" : "#ff0088", 0.5);
    return mesh;
  }

  if ((type === "fuel" || type === "nitro") && models.barrel) {
    const mesh = models.barrel.clone();
    tintModel(mesh, standardMat, config.color, 0.8);
    return mesh;
  }

  if (type === "scrap" && models.barrel) {
    const mesh = models.barrel.clone();
    mesh.scale.multiplyScalar(0.7);
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: "#c0a060",
          metalness: 0.9,
          roughness: 0.3,
        });
      }
    });
    return mesh;
  }

  return new THREE.Mesh(createPickupGeometry(config.geometry), standardMat);
}

function createPickupGeometry(geometry) {
  if (geometry === "octahedron") return new THREE.OctahedronGeometry(0.6, 0);
  if (geometry === "box") return new THREE.BoxGeometry(0.8, 0.8, 0.8);
  if (geometry === "torus") return new THREE.TorusGeometry(0.5, 0.15, 12, 32);
  if (geometry === "dodecahedron") return new THREE.DodecahedronGeometry(0.6, 0);
  return new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12);
}

function tintModel(root, material, emissiveColor, emissiveIntensity) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.material = material.clone();
    child.material.emissive.set(emissiveColor);
    child.material.emissiveIntensity = emissiveIntensity;
  });
}
