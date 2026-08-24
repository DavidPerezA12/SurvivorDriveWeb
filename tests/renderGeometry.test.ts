import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecorField } from '../src/render/decor';
import { GroundScatter } from '../src/render/groundscatter';
import { HazardField } from '../src/render/hazards';
import { Horizon } from '../src/render/horizon';
import { Elevation } from '../src/render/elevation';
import { createSim } from '../src/sim';
import { DRIFT_TUNING, laneCenterX } from '../src/content/tuning';

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

  it('places hazards against the interpolated render distance', () => {
    const scene = new THREE.Scene();
    const field = new HazardField(scene);
    const state = createSim(1);
    state.distance = 100;
    state.hazards.push({
      kind: 'wreck',
      lane: 1,
      x: laneCenterX(1),
      forward: 120,
      hit: false,
    });

    field.update(state, new Elevation(1), 105);

    const active = scene.children.filter(
      (child): child is THREE.InstancedMesh =>
        child instanceof THREE.InstancedMesh && child.count === 1,
    );
    expect(active).toHaveLength(1);
    const matrix = new THREE.Matrix4();
    active[0].getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).z).toBeCloseTo(-15);
  });

  it('derives a drifter lateral pose from the interpolated distance', () => {
    const scene = new THREE.Scene();
    const field = new HazardField(scene);
    const state = createSim(1);
    state.distance = 100;
    const forward = 100 + (DRIFT_TUNING.startGap + DRIFT_TUNING.endGap) / 2;
    state.hazards.push({
      kind: 'drifter',
      lane: 1,
      x: 1,
      forward,
      hit: false,
      driftFromX: -1,
      driftToX: 1,
    });

    field.update(state, new Elevation(1), 95);

    const active = scene.children.find(
      (child): child is THREE.InstancedMesh =>
        child instanceof THREE.InstancedMesh && child.count === 1,
    );
    expect(active).toBeDefined();
    const matrix = new THREE.Matrix4();
    active?.getMatrixAt(0, matrix);
    const t =
      (DRIFT_TUNING.startGap - (forward - 95)) / (DRIFT_TUNING.startGap - DRIFT_TUNING.endGap);
    const smooth = t * t * (3 - 2 * t);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(-1 + 2 * smooth);
  });
});
