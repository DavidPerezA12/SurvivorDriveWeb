/**
 * Quantize the authored GLBs in src/assets/models in place. Run after a Blender
 * export (`npm run models:optimize`): positions, normals and vertex colors go
 * from 32-bit floats to quantized integers (KHR_mesh_quantization), roughly a
 * third of the size, with sub-millimetre error at these model scales. Three.js
 * GLTFLoader supports the extension natively, so runtime needs no decoder.
 * Idempotent: re-running on an already quantized GLB is a no-op-sized rewrite.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune, quantize } from '@gltf-transform/functions';

const MODELS_DIR = fileURLToPath(new URL('../src/assets/models/', import.meta.url));

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);

for (const name of (await readdir(MODELS_DIR)).filter((f) => f.endsWith('.glb')).sort()) {
  const path = MODELS_DIR + name;
  const before = (await readFile(path)).byteLength;
  const document = await io.read(path);
  // The game is untextured (the look is all vertex color), so UVs are dead
  // weight if an export left them in; drop them before quantizing.
  for (const mesh of document.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) primitive.setAttribute('TEXCOORD_0', null);
  await document.transform(
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }),
    prune(),
  );
  const output = await io.writeBinary(document);
  await writeFile(path, output);
  console.log(
    `${name}: ${(before / 1024).toFixed(1)} kB -> ${(output.byteLength / 1024).toFixed(1)} kB`,
  );
}
