export function markPersistentResource(resource) {
  if (resource?.userData) {
    resource.userData.persistentResource = true;
  }
  return resource;
}

export function markPersistentObjectResources(root) {
  root?.traverse?.((node) => {
    if (!node.isMesh) return;

    markPersistentResource(node.geometry);

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      markPersistentResource(material);
    }
  });

  return root;
}

export function disposeObjectResources(root) {
  const disposedGeometries = new WeakSet();
  const disposedMaterials = new WeakSet();

  root?.traverse?.((node) => {
    if (!node.isMesh && !node.isLine && !node.isPoints) return;

    disposeGeometry(node.geometry, disposedGeometries);
    disposeMaterialList(node.material, disposedMaterials);
  });
}

function disposeGeometry(geometry, disposedGeometries) {
  if (
    !geometry ||
    geometry.userData?.cached ||
    geometry.userData?.persistentResource ||
    disposedGeometries.has(geometry)
  ) {
    return;
  }

  geometry.dispose?.();
  disposedGeometries.add(geometry);
}

function disposeMaterialList(materialList, disposedMaterials) {
  const materials = Array.isArray(materialList) ? materialList : [materialList];

  for (const material of materials) {
    if (!material || material.userData?.persistentResource || disposedMaterials.has(material)) {
      continue;
    }

    disposeMaterialTextures(material);
    material.dispose?.();
    disposedMaterials.add(material);
  }
}

function disposeMaterialTextures(material) {
  for (const value of Object.values(material)) {
    if (value?.isTexture && !value.userData?.persistentResource) {
      value.dispose?.();
    }
  }
}
