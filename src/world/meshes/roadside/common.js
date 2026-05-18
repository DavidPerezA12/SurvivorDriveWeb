export function collectVisualMaterials(node) {
  const materials = [];

  node.traverse((child) => {
    if (!child.isMesh) return;
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of childMaterials) {
      if (!material) continue;
      materials.push(material);
    }
  });

  return materials;
}

export function prepareFadableObject(node) {
  const materials = collectVisualMaterials(node);
  const emissiveMaterials = [];

  for (const material of materials) {
    if (material.userData.baseOpacity == null) {
      material.userData.baseOpacity = material.opacity ?? 1;
    }

    if (material.emissive) {
      emissiveMaterials.push(material);
    }
  }

  node.userData.fadeMaterials = materials;
  node.userData.emissiveMaterials = emissiveMaterials;
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
