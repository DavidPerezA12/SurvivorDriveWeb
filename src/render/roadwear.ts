import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, paint, propMaterial } from './materials';
import { palette } from './palette';
import { LOOKAHEAD, roadHalfWidth } from '../content/tuning';
import type { Elevation } from './elevation';

/**
 * Worn asphalt: cracks, repair patches, potholes, and skid marks scattered flat
 * across the road, so no two 50 m stretches read identically. The road tiles are
 * one shared geometry repeated forever — this is what breaks that repetition
 * without a per-tile geometry explosion (docs/DESIGN.md → Object craft: detail
 * from vertex color and proportion).
 *
 * Pure flat decals lying on the surface — the car drives over them exactly as
 * before, so this is render-only and never touches the sim. They stream and
 * recycle against `distance` like the road itself (a decal's z is `distance −
 * worldZ`, identical to a road tile), and each slot's look is a pure function of
 * its index and the seed, so nothing flickers and the per-frame path allocates
 * nothing. One `InstancedMesh` per wear kind; the lit road material carries the
 * act re-mood and fog (docs/ARCHITECTURE.md → Instancing, allocation).
 */

type WearKind = 'crack' | 'patch' | 'pothole' | 'skid';
const KINDS: readonly WearKind[] = ['crack', 'patch', 'pothole', 'skid'];

/** Slot spacing along the road (m) and how far ahead wear is placed. */
const SPACING = 6;
const REACH = LOOKAHEAD * 0.55;
/** Lateral reach: anywhere on the asphalt, just inside the edge lines. */
const HALF = roadHalfWidth() - 0.8;
/** Flat on the surface, a hair above the asphalt to beat z-fighting. */
const Y = 0.035;
const CAP = 40;

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge road-wear geometry');
  return geo;
}

/** A branching crack — a main fissure with a few offshoots. */
function crackGeometry(): THREE.BufferGeometry {
  return merged([
    box(0.12, 0.03, 2.6, palette.roadCrack, 0).translate(0, Y, 0),
    box(0.1, 0.03, 1.4, palette.roadCrack, 0).rotateY(0.5).translate(0.4, Y, 0.8),
    box(0.08, 0.03, 1.0, palette.roadCrack, 0).rotateY(-0.6).translate(-0.3, Y, -0.7),
    box(0.08, 0.03, 0.7, palette.roadCrack, 0).rotateY(0.9).translate(0.2, Y, -0.3),
  ]);
}

/** A rectangular repair patch — a fresher fill inside a darker cut edge. */
function patchGeometry(): THREE.BufferGeometry {
  return merged([
    box(2.2, 0.03, 2.6, palette.roadPatchEdge, 0).translate(0, Y, 0),
    box(1.9, 0.035, 2.3, palette.roadPatch, 0).translate(0, Y + 0.004, 0),
  ]);
}

/** A pothole — a dark, irregular blown-out blob. */
function potholeGeometry(): THREE.BufferGeometry {
  const a = paint(new THREE.CylinderGeometry(0.75, 0.75, 0.04, 9), palette.roadPothole, 0).translate(0, Y, 0);
  const b = paint(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 8), palette.roadPothole, 0)
    .translate(0.6, Y, 0.35);
  return merged([a, b]);
}

/** A pair of skid marks streaking down the lane. */
function skidGeometry(): THREE.BufferGeometry {
  return merged([
    box(0.18, 0.03, 5.2, palette.roadCrack, 0).translate(-0.5, Y, 0),
    box(0.18, 0.03, 5.2, palette.roadCrack, 0).translate(0.5, Y, 0),
  ]);
}

const GEOMETRY: Record<WearKind, () => THREE.BufferGeometry> = {
  crack: crackGeometry,
  patch: patchGeometry,
  pothole: potholeGeometry,
  skid: skidGeometry,
};

export class RoadWear {
  private readonly meshes: Record<WearKind, THREE.InstancedMesh>;
  private readonly counts: Record<WearKind, number>;
  private readonly dummy = new THREE.Object3D();
  private readonly seed: number;

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed | 0;
    this.meshes = {} as Record<WearKind, THREE.InstancedMesh>;
    this.counts = {} as Record<WearKind, number>;
    for (const kind of KINDS) {
      const mesh = new THREE.InstancedMesh(GEOMETRY[kind](), propMaterial, CAP);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      this.meshes[kind] = mesh;
      this.counts[kind] = 0;
      scene.add(mesh);
    }
  }

  private rand(s: number, salt: number): number {
    let h = (Math.imul(s, 374761393) ^ Math.imul(salt, 668265263) ^ this.seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  update(distance: number, elevation: Elevation): void {
    for (const kind of KINDS) this.counts[kind] = 0;

    const first = Math.floor((distance - SPACING) / SPACING);
    const last = Math.ceil((distance + REACH) / SPACING);

    for (let slot = first; slot <= last; slot += 1) {
      // Most slots stay clean, so wear reads as occasional, not a littered mess.
      if (this.rand(slot, 1) < 0.66) continue;

      const r = this.rand(slot, 2);
      // Patches are the loudest mark, so make them the rarest — mostly cracks,
      // skids, and small potholes, the odd repair square.
      const kind: WearKind = r < 0.46 ? 'crack' : r < 0.58 ? 'patch' : r < 0.82 ? 'pothole' : 'skid';
      const n = this.counts[kind];
      if (n >= CAP) continue;

      const worldZ = slot * SPACING + (this.rand(slot, 3) - 0.5) * SPACING;
      const x = (this.rand(slot, 4) * 2 - 1) * HALF;
      // Keep wear modest in size; a patch the size of a car reads as a slab.
      const scale = (kind === 'patch' ? 0.55 : 0.7) + this.rand(slot, 5) * 0.5;
      // Skids run with the lane; everything else gets a free yaw.
      const yaw = kind === 'skid' ? (this.rand(slot, 6) - 0.5) * 0.2 : this.rand(slot, 6) * Math.PI;

      this.dummy.position.set(x, elevation.yAt(worldZ, distance) + 0.01, distance - worldZ);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.meshes[kind].setMatrixAt(n, this.dummy.matrix);
      this.counts[kind] = n + 1;
    }

    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      const n = this.counts[kind];
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const kind of KINDS) this.meshes[kind].geometry.dispose();
  }
}
