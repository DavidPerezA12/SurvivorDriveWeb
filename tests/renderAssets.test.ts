import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { geometryFromScene, withTimeout } from '../src/render/assets';

/**
 * Contract for every Blender-authored GLB: a single instancing-ready mesh (one
 * draw call per kind), a full COLOR_0 vertex palette (the unlit look), a bounded
 * vertex count, and a visual envelope that agrees with the sim.
 *
 * Wrecks: the height cap tracks `WRECK_CLEAR` (0.9 m in `src/sim/collision.ts`):
 * a jump clears the hitbox at that height, so a mesh top rising past it would
 * read as the car flying through solid metal. The Blender scripts clamp the
 * silhouette to 0.9 at export; the cap here is the CI backstop, with
 * quantization headroom.
 *
 * Lethal walls (bus, rig): the opposite contract — `minHeight` keeps them
 * massive (lethal must read lethal at the spawn horizon; docs/DESIGN.md →
 * readability). `rearFace` pins the player-facing extremity (game +Z), because
 * the procedural glow overlays in `hazards.ts` (`busGlowGeometry`,
 * `rigGlowGeometry`) anchor their hot bars to that plane.
 */
const AUTHORED_MODELS = [
  {
    file: 'wreck-sedan.glb',
    maxWidth: 2.6,
    maxHeight: 0.95,
    minLength: 4.2,
    maxLength: 4.5,
    maxVertices: 2_000,
  },
  {
    file: 'wreck-van.glb',
    maxWidth: 2.4,
    maxHeight: 0.95,
    minLength: 4.5,
    maxLength: 4.75,
    maxVertices: 2_000,
  },
  {
    // Longer footprint than the sedan and van: a forward cab plus an open flatbed.
    file: 'wreck-truck.glb',
    maxWidth: 2.4,
    maxHeight: 0.95,
    minLength: 4.8,
    maxLength: 5.2,
    maxVertices: 2_000,
  },
  {
    // The crashed coach: the longest wall. Its rear chevron face carries the
    // busGlow bars at game z ~ 4.0.
    file: 'bus.glb',
    maxWidth: 2.4,
    minHeight: 2.3,
    maxHeight: 2.6,
    minLength: 8.7,
    maxLength: 9.3,
    maxVertices: 2_400,
    rearFace: [4.0, 4.35],
  },
  {
    // The toppled rig: trailer wall plus jackknifed cab and spilled cargo. The
    // rigGlow door bars sit at game z ~ 2.0, inside the cargo apron, so only
    // the overall envelope is pinned here.
    file: 'rig.glb',
    maxWidth: 4.3,
    minHeight: 3.5,
    maxHeight: 3.9,
    minLength: 8.2,
    maxLength: 8.9,
    maxVertices: 2_400,
  },
] as const;

function addVertexColors(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Float32Array(position.count * 3).fill(1), 3),
  );
  return geometry;
}

describe('authored render assets', () => {
  it('times out a model request that never settles', async () => {
    await expect(withTimeout(new Promise<never>(() => undefined), 1, 'stuck.glb')).rejects.toThrow(
      'stuck.glb timed out',
    );
  });

  it.each(AUTHORED_MODELS)(
    'keeps $file instancing-ready and inside its visual envelope',
    async (model) => {
      const raw = await readFile(new URL(`../src/assets/models/${model.file}`, import.meta.url));
      const data = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      const gltf = await new GLTFLoader().parseAsync(data, '');
      const bounds = new THREE.Box3();
      let meshes = 0;
      let vertices = 0;

      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        meshes += 1;
        const position = object.geometry.getAttribute('position');
        const color = object.geometry.getAttribute('color');
        expect(color?.count).toBe(position.count);
        vertices += position.count;
        object.geometry.computeBoundingBox();
        bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
      });

      const size = bounds.getSize(new THREE.Vector3());
      expect(meshes).toBe(1);
      expect(vertices).toBeLessThan(model.maxVertices);
      expect(size.x).toBeLessThan(model.maxWidth);
      expect(size.y).toBeLessThan(model.maxHeight);
      if ('minHeight' in model) expect(size.y).toBeGreaterThan(model.minHeight);
      expect(size.z).toBeGreaterThan(model.minLength);
      expect(size.z).toBeLessThan(model.maxLength);
      if ('rearFace' in model) {
        expect(bounds.max.z).toBeGreaterThan(model.rearFace[0]);
        expect(bounds.max.z).toBeLessThan(model.rearFace[1]);
      }
    },
  );

  // The runtime bake (`geometryFromScene`) must preserve the same envelope.
  // This is the path the game actually renders: it applies the glTF node
  // matrices to the vertex data, and once clamped every quantized model to a
  // 2 m box because the positions were still normalized ints. Baking here and
  // re-measuring pins the dequantization.
  it.each(AUTHORED_MODELS)('bakes $file to its real world-space size', async (model) => {
    const raw = await readFile(new URL(`../src/assets/models/${model.file}`, import.meta.url));
    const data = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const gltf = await new GLTFLoader().parseAsync(data, '');
    const baked = geometryFromScene(gltf.scene, model.file);

    const size = baked.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(model.maxWidth);
    expect(size.y).toBeLessThan(model.maxHeight);
    expect(size.z).toBeGreaterThan(model.minLength);
    expect(size.z).toBeLessThan(model.maxLength);
    const position = baked.getAttribute('position');
    expect(position.normalized).toBe(false);
    baked.dispose();
  });

  it('disposes the cloned geometry and imported material when COLOR_0 is missing', () => {
    const source = new THREE.BoxGeometry(1, 1, 1);
    const cloned = source.clone();
    const material = new THREE.MeshBasicMaterial();
    vi.spyOn(source, 'clone').mockReturnValue(cloned);
    const disposeGeometry = vi.spyOn(cloned, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(source, material));

    expect(() => geometryFromScene(scene, 'missing-color.glb')).toThrow(
      'missing-color.glb is missing its COLOR_0 vertex palette',
    );
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();

    source.dispose();
  });

  it('disposes every cloned part when imported geometries cannot be merged', () => {
    const sourceA = new THREE.BufferGeometry();
    const sourceB = new THREE.BufferGeometry();
    const partA = addVertexColors(new THREE.BoxGeometry(1, 1, 1));
    const partB = addVertexColors(new THREE.BoxGeometry(1, 1, 1));
    // `mergeGeometries` rejects mismatched attribute sets.
    partB.deleteAttribute('normal');
    vi.spyOn(sourceA, 'clone').mockReturnValue(partA);
    vi.spyOn(sourceB, 'clone').mockReturnValue(partB);
    const disposeA = vi.spyOn(partA, 'dispose');
    const disposeB = vi.spyOn(partB, 'dispose');
    const materialA = new THREE.MeshBasicMaterial();
    const materialB = new THREE.MeshBasicMaterial();
    const disposeMaterialA = vi.spyOn(materialA, 'dispose');
    const disposeMaterialB = vi.spyOn(materialB, 'dispose');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(sourceA, materialA), new THREE.Mesh(sourceB, materialB));

    try {
      expect(() => geometryFromScene(scene, 'unmergeable.glb')).toThrow(
        'unmergeable.glb geometries could not be merged',
      );
      expect(disposeA).toHaveBeenCalledOnce();
      expect(disposeB).toHaveBeenCalledOnce();
      expect(disposeMaterialA).toHaveBeenCalledOnce();
      expect(disposeMaterialB).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
      sourceA.dispose();
      sourceB.dispose();
    }
  });
});
