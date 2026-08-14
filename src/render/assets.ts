import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface RenderAssets {
  /** Blender-authored sedan shared by static wrecks and moving drifters. */
  readonly wreckSedan: THREE.BufferGeometry | null;
  /** Blender-authored crushed cargo van used by the wreck-van hazard. */
  readonly wreckVan: THREE.BufferGeometry | null;
  /** Blender-authored crushed pickup used by the wreck-truck hazard. */
  readonly wreckTruck: THREE.BufferGeometry | null;
  /** Blender-authored crashed coach, the long lethal wall. */
  readonly bus: THREE.BufferGeometry | null;
  /** Blender-authored toppled big rig with its jackknifed cab. */
  readonly rig: THREE.BufferGeometry | null;
}

/** A broken CDN/service worker must not hold the boot screen forever. */
const MODEL_LOAD_TIMEOUT_MS = 10_000;

export async function withTimeout<T>(
  pending: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function disposeImportedMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
    return;
  }
  material.dispose();
}

/**
 * Lift a KHR_mesh_quantization attribute to plain float32. The quantized GLBs
 * store positions as normalized ints (interleaved by GLTFLoader) with the
 * restoring scale on the glTF node; `applyMatrix4` would write the world-space
 * floats back into that int storage and clamp every value to [-1, 1], silently
 * crushing the model to a 2 m box. Reading through the normalized accessor
 * first dequantizes safely, whatever the storage.
 */
function dequantized(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  if (
    attribute instanceof THREE.BufferAttribute &&
    !attribute.normalized &&
    attribute.array instanceof Float32Array
  ) {
    return attribute;
  }
  const lifted = new THREE.Float32BufferAttribute(
    attribute.count * attribute.itemSize,
    attribute.itemSize,
  );
  for (let index = 0; index < attribute.count; index += 1) {
    lifted.setXYZ(index, attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  }
  return lifted;
}

/**
 * Extract one world-space geometry from a glTF scene. Blender's axis conversion
 * and every authored object transform are baked here once at startup; the live
 * render path receives an ordinary BufferGeometry and keeps using InstancedMesh.
 * Exported for the contract test, which pins this bake against each model's
 * real dimensions (the quantization clamp above once flattened every wreck).
 */
export function geometryFromScene(scene: THREE.Group, file: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let geometry: THREE.BufferGeometry | null = null;
  let complete = false;
  try {
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const part = object.geometry.clone() as THREE.BufferGeometry;
      try {
        for (const name of ['position', 'normal'] as const) {
          const attribute = part.getAttribute(name);
          if (attribute) part.setAttribute(name, dequantized(attribute));
        }
        part.applyMatrix4(object.matrixWorld);
        parts.push(part);
      } catch (error) {
        // A failed transform has not reached `parts`, so release it here.
        part.dispose();
        throw error;
      } finally {
        disposeImportedMaterial(object.material);
      }
    });
    if (parts.length === 0) throw new Error(`${file} contains no mesh`);

    geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    if (!geometry) throw new Error(`${file} geometries could not be merged`);
    if (!geometry.getAttribute('color')) {
      throw new Error(`${file} is missing its COLOR_0 vertex palette`);
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    complete = true;
    return geometry;
  } finally {
    // On success, retain only the baked result. On failure, release every clone
    // and a separately merged result so a broken optional asset cannot leak GPU
    // resources before its procedural fallback takes over.
    for (const part of parts) {
      if (!complete || part !== geometry) part.dispose();
    }
    if (!complete && geometry !== null && !parts.includes(geometry)) geometry.dispose();
  }
}

async function loadAuthoredModel(file: string): Promise<THREE.BufferGeometry> {
  const url = new URL(`../assets/models/${file}`, import.meta.url);
  const gltf = await withTimeout(
    new GLTFLoader().loadAsync(url.href),
    MODEL_LOAD_TIMEOUT_MS,
    `Loading ${file}`,
  );
  return geometryFromScene(gltf.scene, file);
}

async function loadOptionalModel(
  file: string,
  label: string,
): Promise<THREE.BufferGeometry | null> {
  try {
    return await loadAuthoredModel(file);
  } catch (error) {
    console.warn(`Could not load the Blender ${label}; using procedural fallback.`, error);
    return null;
  }
}

/**
 * Preload authored render assets before constructing the synchronous scene.
 * Failure is non-fatal per asset: the procedural model of each kind remains a
 * deliberate fallback so a missing model never prevents a run from starting.
 */
export async function loadRenderAssets(): Promise<RenderAssets> {
  const [wreckSedan, wreckVan, wreckTruck, bus, rig] = await Promise.all([
    loadOptionalModel('wreck-sedan.glb', 'wreck sedan'),
    loadOptionalModel('wreck-van.glb', 'wreck van'),
    loadOptionalModel('wreck-truck.glb', 'wreck truck'),
    loadOptionalModel('bus.glb', 'crashed bus'),
    loadOptionalModel('rig.glb', 'toppled rig'),
  ]);
  return { wreckSedan, wreckVan, wreckTruck, bus, rig };
}
