import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import { LOOKAHEAD, roadHalfWidth } from '../content/tuning';
import type { Elevation } from './elevation';

/**
 * The crash barrier running the shoulders: a galvanized W-beam guardrail on
 * rusted posts, the way every highway is lined — except this one has been left to
 * rot, so whole stretches have collapsed, buckled, or gone missing. It is the
 * detail that turns "a road" into "a road that used to be maintained"
 * (docs/DESIGN.md → Art direction; Object craft).
 *
 * Pure render-side dressing: it never gates the lane (the sim's hazards do that),
 * so it lives entirely here. Each post-and-beam segment is one instance of a
 * shared merged geometry, streamed against the car's distance like the road and
 * recycled by wrapping the distance into a fixed grid of slots. A slot's state —
 * present or collapsed, upright or buckled — is a pure function of its absolute
 * index and the seed, so it never flickers and the per-frame path allocates
 * nothing (docs/ARCHITECTURE.md → Instancing, allocation discipline).
 */

/** Distance between posts along the road, in meters. */
const SEGMENT = 5;
/** How far ahead the rail is built; beyond this the haze hides its absence. */
const REACH = LOOKAHEAD * 0.78;
/** Posts just outside the curb on each shoulder. */
const OFFSET = roadHalfWidth() + 1.1;
const RAIL_TOP = 0.82;
const MAX = 96;

/** One post plus the W-beam panel that runs from it to the next post. */
function segmentGeometry(): THREE.BufferGeometry {
  const parts = [
    // Rusted I-post at the segment's near edge.
    box(0.16, 1.0, 0.16, palette.railPost, 0.6).translate(0, 0.5, 0),
    // The W-beam panel spanning to the next post, lifted to rail height.
    box(0.09, 0.32, SEGMENT, palette.railBeam, 0.45).translate(0, RAIL_TOP, SEGMENT / 2),
    // The signature horizontal crease, proud of the beam and catching the light.
    box(0.13, 0.09, SEGMENT, palette.railCrease, 0.3).translate(0, RAIL_TOP, SEGMENT / 2),
  ];
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge guardrail geometry');
  return geo;
}

export class Guardrail {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly seed: number;

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed | 0;
    this.mesh = new THREE.InstancedMesh(segmentGeometry(), propMaterial, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // instances span far beyond geometry bounds
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** Stable pseudo-random in [0, 1) for a slot, salted and seeded. */
  private rand(s: number, salt: number): number {
    let h = (Math.imul(s, 374761393) ^ Math.imul(salt, 668265263) ^ this.seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  update(distance: number, elevation: Elevation): void {
    const first = Math.floor((distance - SEGMENT) / SEGMENT);
    const last = Math.ceil((distance + REACH) / SEGMENT);
    let n = 0;

    for (let slot = first; slot <= last && n < MAX; slot += 1) {
      for (const side of [-1, 1] as const) {
        if (n >= MAX) break;
        const key = slot * 2 + (side < 0 ? 0 : 1);

        // ~16% of segments have collapsed entirely — a gap in the line.
        if (this.rand(key, 1) < 0.16) continue;

        // A buckled minority leans and sags; the rest stand true.
        const bent = this.rand(key, 2) < 0.22;
        const roll = bent ? (this.rand(key, 3) - 0.5) * 0.7 : 0;
        const drop = bent ? this.rand(key, 4) * 0.25 : 0;
        const yaw = bent ? (this.rand(key, 5) - 0.5) * 0.3 : 0;

        this.dummy.position.set(
          side * OFFSET,
          elevation.yAt(slot * SEGMENT, distance) - drop,
          distance - slot * SEGMENT,
        );
        this.dummy.rotation.set(0, yaw, roll * side);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(n, this.dummy.matrix);
        n += 1;
      }
    }

    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
