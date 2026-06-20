import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import { LOOKAHEAD, roadHalfWidth } from '../content/tuning';
import { ACT_SPAN, TRANSITION } from './mood';
import type { Elevation } from './elevation';

/**
 * Perpendicular side streets crossing the highway — the thing that makes the
 * opening **Outbreak** act read as a *city grid* you're driving out of, not an
 * open desert road (docs/DESIGN.md → Run structure: Act I is a real city). Paved
 * strips meet the highway from both shoulders at intervals, with their own lane
 * dashes, a stop line where they join, and raised curbs.
 *
 * Pure render dressing keyed to `distance`: it never touches gameplay, streams by
 * slot (`z = distance − worldZ`) like the road wear, and rides the shared road
 * elevation so a cross street sits level with the asphalt over a hill. The strips
 * stop short of the highway lanes (a gap where the road already is), so they read
 * as junctions and never z-fight the road surface. They exist **only inside the
 * city band** — a slot past the act boundary is simply never placed, so the grid
 * thins out and is gone by the time the wasteland (Rust) begins, no pop, no fade
 * hack. One `InstancedMesh`, allocation-free per frame (docs/ARCHITECTURE.md →
 * Instancing, allocation discipline).
 */

/** Average meters between cross streets; thinned per-slot so they're irregular. */
const SPACING = 100;
/** How far out along the shoulder a side street reaches. */
const REACH = 56;
/** Half the street's depth (its extent along the direction of travel). */
const HALF_W = 5;
/** The city band the streets live in; they thin out across the transition to Rust. */
const CITY_END = ACT_SPAN;
const FADE_START = ACT_SPAN - TRANSITION;
/** Enough instances for the few slots inside the lookahead window at once. */
const CAP = 8;

/** One cross-street tile centered on the highway, with a gap over the road lanes. */
function buildGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const inner = roadHalfWidth() + 0.5; // just outside the curb
  const width = REACH - inner;
  const cx = inner + width / 2;

  for (const sx of [-1, 1]) {
    // The paved strip.
    parts.push(box(width, 0.05, HALF_W * 2, palette.asphalt, 0.2).translate(sx * cx, 0.0, 0));
    // Curbs along its two long edges (running outward in x).
    for (const sz of [-1, 1]) {
      parts.push(
        box(width, 0.2, 0.4, palette.curb, 0.5).translate(sx * cx, 0.08, sz * HALF_W),
      );
    }
    // A dashed centre line running out along the street.
    const dash = 1.6;
    const period = dash + 1.4;
    for (let x = inner + 1.2; x < REACH - 0.5; x += period) {
      parts.push(box(dash, 0.04, 0.16, palette.laneLine, 0).translate(sx * x, 0.04, 0));
    }
    // A solid stop line where the street meets the highway.
    parts.push(box(0.3, 0.04, HALF_W * 1.5, palette.laneLine, 0).translate(sx * (inner + 0.4), 0.04, 0));
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('Failed to merge cross-street geometry');
  return merged;
}

export class CrossStreets {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly seed: number;

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed | 0;
    this.mesh = new THREE.InstancedMesh(buildGeometry(), propMaterial, CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private rand(s: number, salt: number): number {
    let h = (Math.imul(s, 374761393) ^ Math.imul(salt, 668265263) ^ this.seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  update(distance: number, elevation: Elevation): void {
    let n = 0;

    // Nothing to do once the city is well behind us.
    if (distance < CITY_END + LOOKAHEAD) {
      const first = Math.floor((distance - SPACING) / SPACING);
      const last = Math.ceil((distance + LOOKAHEAD) / SPACING);

      for (let slot = first; slot <= last && n < CAP; slot += 1) {
        const worldZ = slot * SPACING;
        if (worldZ < 0 || worldZ >= CITY_END) continue;
        // Thin the grid out across the transition into Rust, so it tapers rather
        // than ending on a wall.
        const keep = worldZ <= FADE_START ? 1 : 1 - (worldZ - FADE_START) / (CITY_END - FADE_START);
        // Occasional, not every block — a normal-feeling junction now and then.
        if (this.rand(slot, 1) > 0.4 * keep) continue;

        const jitterZ = (this.rand(slot, 2) - 0.5) * SPACING * 0.4;
        const forward = worldZ + jitterZ;
        const y = elevation.yAt(forward, distance);
        this.dummy.position.set(0, y, distance - forward);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(n, this.dummy.matrix);
        n += 1;
      }
    }

    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
