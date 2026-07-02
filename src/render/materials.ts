import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * One shared, flat-shaded, vertex-colored material backs almost every prop, so
 * the renderer makes minimal program/state switches (docs/ARCHITECTURE.md →
 * Materials). Detail is bought with baked vertex color, not triangles or
 * textures (docs/DESIGN.md → Object craft).
 */
export const propMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
});

/**
 * Unlit, vertex-colored material for self-lit details — headlights, taillights.
 * Because it ignores scene lighting, a light reads at full brightness even on a
 * face turned away from the sun (the car's rear), so lamps stay readable in
 * shadow (docs/DESIGN.md → Juice as information).
 *
 * `polygonOffset` biases lamp fragments a hair toward the camera so a lamp set
 * flush on (or coplanar with) the bodywork it sits on always wins the depth test
 * instead of z-fighting it. This prevents intermittent flicker on rear lamps like
 * the coupe's full-width tail bar, where the lamp's back face landed exactly on
 * the body's rear face.
 */
export const lightMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

/**
 * Unlit but fogged, vertex-colored — the distant backdrop silhouettes. Scene
 * lighting would only muddy a form that is meant to read as a flat, haze-veiled
 * cutout; fog is what sells the distance, so it stays on. The base→top gradient
 * (baked into the geometry) does the shading a light otherwise would.
 */
export const silhouetteMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  fog: true,
});

/**
 * Bake per-vertex color into a geometry with a directional ambient-
 * occlusion gradient: surfaces facing up stay bright, undersides darken. This
 * lets a flat box read as a shaded form for the cost of one extra attribute and
 * zero extra triangles.
 */
export function paint(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, ao = 0.4): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const base = new THREE.Color(color);
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i += 1) {
    // normal.y in [-1, 1] → shade in [1 - ao, 1]: bottoms darker, tops full.
    const ny = normal.getY(i);
    const shade = 1 - ao + ao * ((ny + 1) / 2);
    colors[i * 3] = base.r * shade;
    colors[i * 3 + 1] = base.g * shade;
    colors[i * 3 + 2] = base.b * shade;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function nonIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/**
 * Merge parts into one geometry, tolerating a mix of indexed (box, cylinder) and
 * non-indexed (`rockChunk` icosahedron) inputs: `mergeGeometries` refuses a mixed
 * set, so everything is expanded to non-indexed first. Disposes the inputs (and
 * any expanded copies) once merged.
 */
export function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map(nonIndexed);
  const geo = mergeGeometries(flat, false);
  for (let i = 0; i < parts.length; i += 1) {
    if (flat[i] !== parts[i]) flat[i].dispose();
    parts[i].dispose();
  }
  if (!geo) throw new Error('Failed to merge geometry');
  return geo;
}

/** A vertex-colored box. */
export function box(
  w: number,
  h: number,
  d: number,
  color: THREE.ColorRepresentation,
  ao?: number,
): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(w, h, d), color, ao);
}

/**
 * A vertex-colored cylinder, laid on its side to roll along X (a wheel). 24
 * radial segments keep the tyre round under flat shading.
 */
export function wheel(radius: number, width: number, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 24);
  geo.rotateZ(Math.PI / 2);
  return paint(geo, color, 0.5);
}

/**
 * One craggy stone: a low-detail icosahedron whose vertices are pushed in and out
 * along their own radius so it reads as faceted rock, never a smooth ball or a
 * stacked box. The push is hashed from each vertex's (quantized) position, so the
 * duplicated verts a non-indexed icosahedron shares along every edge move
 * together and the facets stay welded (no cracks). `flatten` squashes it
 * vertically into a mound; flat per-face normals make each facet a single shade
 * under `paint`, the low-poly stone read. 20 faces, so a cluster still merges
 * cheap. With a low `amount` and a hard `flatten` the same helper reads as an
 * organic mound (a dune lobe, a snow drift) instead of stone.
 */
export function rockChunk(
  radius: number,
  flatten: number,
  amount: number,
  color: THREE.ColorRepresentation,
  ao: number,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 0);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const qx = Math.round(x * 256);
    const qy = Math.round(y * 256);
    const qz = Math.round(z * 256);
    let h = (Math.imul(qx, 374761393) ^ Math.imul(qy, 668265263) ^ Math.imul(qz, 1274126177)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    const m = 1 + (r - 0.5) * amount;
    pos.setXYZ(i, x * m, y * m * flatten, z * m);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return paint(geo, color, ao);
}
