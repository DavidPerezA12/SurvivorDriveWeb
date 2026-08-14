import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import { LOOKAHEAD, roadHalfWidth } from '../content/tuning';
import { ACT_SPAN } from './mood';
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
/** Shared iteration order; keeping it at module scope avoids a tiny array per frame. */
const SIDES = [-1, 1] as const;
/** Distance over which the rail decays from "just neglected" to "mostly ruined":
 *  the five act spans up to Static, so the shoulder rots as the world ends. */
const DECAY_SPAN = ACT_SPAN * 5;

/** One post plus the W-beam panel that runs from it to the next post. The real
 *  W profile is two creases, and the beam hangs off the post on a blockout
 *  spacer with a splice-bolt pair at the joint — the up-close silhouette of
 *  every highway shoulder. Kept lean (instanced ×96). */
function segmentGeometry(): THREE.BufferGeometry {
  const parts = [
    // Rusted I-post at the segment's near edge, on a buried baseplate.
    box(0.16, 1.0, 0.16, palette.railPost, 0.6).translate(0, 0.5, 0),
    box(0.26, 0.07, 0.26, palette.railPost, 0.5).translate(0, 0.035, 0),
    // The blockout spacer hanging the beam off the post face.
    box(0.14, 0.3, 0.2, palette.railPost, 0.5).translate(0, RAIL_TOP, 0.1),
    // The W-beam panel spanning to the next post, lifted to rail height.
    box(0.09, 0.34, SEGMENT, palette.railBeam, 0.45).translate(0, RAIL_TOP, SEGMENT / 2),
    // The signature W: twin horizontal creases, proud of the beam, catching light.
    box(0.13, 0.08, SEGMENT, palette.railCrease, 0.3).translate(0, RAIL_TOP + 0.08, SEGMENT / 2),
    box(0.13, 0.08, SEGMENT, palette.railCrease, 0.3).translate(0, RAIL_TOP - 0.08, SEGMENT / 2),
    // Splice-bolt pair proud of the beam face at the post line.
    box(0.16, 0.05, 0.05, palette.railPost, 0.25).translate(0, RAIL_TOP + 0.08, 0.14),
    box(0.16, 0.05, 0.05, palette.railPost, 0.25).translate(0, RAIL_TOP - 0.08, 0.14),
    // A worn reflector button on the beam at the post — the dotted line the
    // headlights used to pick out down the shoulder.
    box(0.15, 0.07, 0.07, palette.barrierPaint, 0.15).translate(0, RAIL_TOP, 0.3),
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
      for (const side of SIDES) {
        if (n >= MAX) break;
        const key = slot * 2 + (side < 0 ? 0 : 1);

        // The shoulder rots as the run drives deeper into the apocalypse: a
        // mostly-intact rail in the opening city, a mostly-collapsed one in the
        // deep acts. Keyed to the slot's absolute forward (not the car distance),
        // so a segment's state is fixed and never flickers as you approach it.
        const decay = Math.min(Math.max((slot * SEGMENT) / DECAY_SPAN, 0), 1);

        // Collapsed-entirely segments (a gap in the line) climb ~10% → ~50%.
        if (this.rand(key, 1) < 0.1 + 0.4 * decay) continue;

        // The buckled minority (leaning, sagging) grows and leans harder deep in.
        const bent = this.rand(key, 2) < 0.16 + 0.3 * decay;
        const lean = 0.7 + 0.5 * decay;
        const roll = bent ? (this.rand(key, 3) - 0.5) * lean : 0;
        const drop = bent ? this.rand(key, 4) * (0.25 + 0.25 * decay) : 0;
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
