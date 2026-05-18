import * as THREE from "three";

export function createProceduralModel(name) {
  switch (name) {
    case "crate":
      return createCrateModel();
    default:
      return new THREE.Group();
  }
}

function createCrateModel() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({
    color: "#7a5535",
    roughness: 0.9,
    metalness: 0.05,
  });
  const darkWood = new THREE.MeshStandardMaterial({
    color: "#3f2a1c",
    roughness: 0.95,
  });

  const box = createShadowMesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), wood);
  box.position.y = 0.35;
  group.add(box);

  for (const z of [-0.47, 0.47]) {
    const slat = createShadowMesh(new THREE.BoxGeometry(1.02, 0.12, 0.08), darkWood);
    slat.position.set(0, 0.48, z);
    group.add(slat);
  }

  for (const x of [-0.47, 0.47]) {
    const slat = createShadowMesh(new THREE.BoxGeometry(0.08, 0.12, 1.02), darkWood);
    slat.position.set(x, 0.18, 0);
    group.add(slat);
  }

  return group;
}

function createShadowMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
