import * as THREE from "three";

export function prepareFadableObject(node) {
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

export function applyRoadsideShadows(node) {
  node.traverse((ch) => {
    if (ch.isMesh) {
      ch.castShadow = true;
      ch.receiveShadow = true;
    }
  });
  prepareFadableObject(node);
}
