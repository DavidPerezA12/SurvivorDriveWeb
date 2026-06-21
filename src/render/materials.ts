import * as THREE from 'three';

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
