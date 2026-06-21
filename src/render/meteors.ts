import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ReadonlyState } from '../sim';
import { box, lightMaterial, paint, propMaterial } from './materials';
import { palette } from './palette';
import { METEOR_TUNING } from '../content/tuning';
import type { Elevation } from './elevation';

const MAX_INSTANCES = 24;
/** Resting height of the rock once it has landed — sits in its crater on the road. */
const REST_Y = 0.5;

/**
 * A charred asteroid — chunky rock facets in two cooled tones with a heat-glowing
 * leading underside, authored to the interactive-object craft bar (docs/DESIGN.md
 * → Object craft). The hot face is a separate self-lit mesh (below), so the rock
 * reads as falling fire even through the act haze.
 */
function meteorRockGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts = [
    box(1.25, 1.05, 1.15, p.meteorRock, 0.5).rotateY(0.5).rotateZ(0.18),
    box(0.95, 0.85, 0.95, p.meteorChar, 0.55).rotateY(1.0).translate(0.36, 0.12, -0.2),
    box(0.7, 0.6, 0.72, p.meteorRock, 0.45).rotateY(0.3).translate(-0.42, -0.08, 0.32),
    box(0.55, 0.4, 0.5, p.meteorChar, 0.5).rotateY(0.8).translate(0.1, 0.5, 0.3),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge meteor geometry');
  return geo;
}

/** A flat disc lying on the road (faces up after the rotate), for shadow/crater. */
function disc(radius: number, color: number): THREE.BufferGeometry {
  return paint(new THREE.CircleGeometry(radius, 18), color, 0).rotateX(-Math.PI / 2);
}

/**
 * Renders the sim's meteors, instanced and allocation-free. The telegraph is the
 * falling rock itself: a glowing meteor descends in its target lane from
 * the spawn horizon (~2.5 s of warning), so the threat reads from the sky, not
 * from a painted marker on the road. Once the sim lands it (`Hazard.landed`) it
 * swaps to a scorched crater with the rock half-buried in it. The impact burst is
 * the shared `exploded` fireball, emitted by the sim and handled in the view — so
 * this field is pure read-only placement.
 */
export class MeteorField {
  private readonly rock: THREE.InstancedMesh;
  private readonly core: THREE.InstancedMesh;
  private readonly crater: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.rock = new THREE.InstancedMesh(meteorRockGeometry(), propMaterial, MAX_INSTANCES);
    this.core = new THREE.InstancedMesh(box(0.7, 0.5, 0.7, palette.meteorCore, 0), lightMaterial, MAX_INSTANCES);
    this.crater = new THREE.InstancedMesh(disc(1.35, palette.meteorCrater), propMaterial, MAX_INSTANCES);
    for (const mesh of [this.rock, this.core, this.crater]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }
  }

  update(state: ReadonlyState, elevation: Elevation): void {
    const t = METEOR_TUNING;
    let rocks = 0;
    let cores = 0;
    let craters = 0;
    for (const h of state.hazards) {
      if (h.kind !== 'meteor') continue;
      const screenZ = state.distance - h.forward;
      // The crater and the impact point ride the road profile.
      const ground = elevation.yAt(h.forward, state.distance);
      if (h.landed) {
        if (craters < MAX_INSTANCES) {
          this.place(this.crater, craters, h.x, ground + 0.02, screenZ, 0);
          craters += 1;
        }
        if (rocks < MAX_INSTANCES) {
          this.place(this.rock, rocks, h.x, ground + REST_Y, screenZ, h.forward * 0.3);
          rocks += 1;
        }
        continue;
      }
      // Falling: the rock descends in its lane as the gap closes — the telegraph.
      const gap = h.forward - state.distance;
      let p = (t.telegraphGap - gap) / (t.telegraphGap - t.impactGap);
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      const y = ground + REST_Y + t.fallHeight * (1 - p);
      const spin = h.forward * 0.3 + state.distance * 0.4;
      if (rocks < MAX_INSTANCES) {
        this.place(this.rock, rocks, h.x, y, screenZ, spin);
        rocks += 1;
      }
      if (cores < MAX_INSTANCES) {
        this.place(this.core, cores, h.x, y, screenZ, spin);
        cores += 1;
      }
    }
    this.rock.count = rocks;
    this.core.count = cores;
    this.crater.count = craters;
    for (const mesh of [this.rock, this.core, this.crater]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, spin: number): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(spin * 0.7, spin, spin * 0.4);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(i, this.dummy.matrix);
  }
}
