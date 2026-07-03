import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecorField } from '../src/render/decor';
import { GroundScatter } from '../src/render/groundscatter';
import { HazardField } from '../src/render/hazards';
import { Horizon } from '../src/render/horizon';

/**
 * Geometry-construction smoke test. The instanced fields build all their merged
 * geometries in their constructors, and `mergeGeometries` throws at construction
 * time when parts disagree (e.g. mixing indexed boxes with non-indexed
 * icosahedron rock chunks — a real crash this test exists to pin). Three.js
 * geometry math is pure CPU, so this runs headless; no WebGL is touched until a
 * render call, which never happens here.
 */
describe('render geometry builders', () => {
  it('construct every instanced field without merge errors', () => {
    const scene = new THREE.Scene();
    expect(() => new DecorField(scene, 123)).not.toThrow();
    expect(() => new GroundScatter(scene, 123)).not.toThrow();
    expect(() => new HazardField(scene)).not.toThrow();
    expect(() => new Horizon(scene, 123)).not.toThrow();
  });
});
