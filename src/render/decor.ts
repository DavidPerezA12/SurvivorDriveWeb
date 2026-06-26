import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chunkAt, type Chunk, type PropKind } from '../sim';
import { box, paint, propMaterial, wheel } from './materials';
import { palette } from './palette';
import { CHUNK_LENGTH, LOOKAHEAD } from '../content/tuning';
import { ACT_SPAN, TRANSITION } from './mood';
import type { Elevation } from './elevation';

const MAX_INSTANCES = 64;

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge decor geometry');
  return geo;
}

/** A vertex-colored cone, for faceted shards and spurs. */
function cone(r: number, h: number, seg: number, hex: number, ao: number): THREE.BufferGeometry {
  return paint(new THREE.ConeGeometry(r, h, seg), hex, ao);
}

/** A leaning street light: base plate, pole, arm, lamp head, and a dead wire. */
function postGeometry(): THREE.BufferGeometry {
  return merged([
    box(0.42, 0.1, 0.42, palette.post, 0.5).translate(0, 0.05, 0),
    // Bolted anchor flange just above the base plate.
    box(0.3, 0.08, 0.3, palette.postCollar, 0.5).translate(0, 0.13, 0),
    box(0.2, 3.2, 0.2, palette.post, 0.6).translate(0, 1.6, 0),
    // A weathered junction box clamped to the pole.
    box(0.26, 0.4, 0.18, palette.postCollar, 0.45).translate(0.05, 1.1, 0.16),
    box(0.7, 0.16, 0.16, palette.post, 0.5).translate(0.3, 3.15, 0),
    // A diagonal gusset bracing the arm to the pole.
    box(0.04, 0.42, 0.12, palette.post, 0.4).rotateZ(0.78).translate(0.18, 2.95, 0),
    box(0.5, 0.22, 0.32, palette.postLamp, 0.4).translate(0.55, 3.05, 0),
    // A snapped power line drooping off the arm.
    box(0.04, 0.7, 0.04, palette.post, 0.4).rotateX(0.4).translate(0.62, 2.78, 0.12),
  ]);
}

/** An irregular boulder cluster. */
function rockGeometry(): THREE.BufferGeometry {
  const a = box(1.1, 0.8, 1.0, palette.rock, 0.6).translate(0, 0.4, 0);
  a.rotateY(0.4);
  const b = box(0.7, 0.55, 0.8, palette.rock, 0.55).translate(0.5, 0.28, -0.3);
  b.rotateY(-0.6);
  const c = box(0.5, 0.4, 0.5, palette.rock, 0.5).translate(-0.45, 0.2, 0.25);
  const d = box(0.42, 0.3, 0.46, palette.rock, 0.5).translate(0.18, 0.15, 0.46);
  d.rotateY(0.9);
  return merged([a, b, c, d]);
}

/**
 * A burnt-out car husk: low, gutted, scorched. Decoration tier — deliberately
 * dark and desaturated so it never gets mistaken for the warm interactive wreck
 * on the road (docs/DESIGN.md → readability: decoration never mimics an
 * interactive silhouette).
 */
function huskGeometry(): THREE.BufferGeometry {
  return merged([
    box(1.7, 0.4, 3.5, palette.husk, 0.45).translate(0, 0.45, 0),
    box(1.8, 0.32, 2.0, palette.husk, 0.5).translate(0, 0.75, 0.1),
    // Caved cabin, dead windshield, and a blown-out side window.
    box(1.5, 0.4, 1.4, palette.husk, 0.5).rotateZ(0.06).translate(0, 0.95, -0.2),
    box(1.36, 0.3, 0.14, palette.huskGlass, 0.3).translate(0, 0.92, 0.5),
    box(0.12, 0.24, 0.8, palette.huskGlass, 0.3).translate(0.74, 0.95, -0.25),
    // Sagging, burnt hood over a scorched, gutted engine bay.
    box(1.5, 0.1, 1.0, palette.husk, 0.3).rotateX(0.12).translate(0, 0.7, 1.05),
    box(1.2, 0.06, 0.6, palette.wreckScorch, 0.2).translate(0, 0.66, 1.05),
    // A door wrenched open and hanging off its hinge.
    box(0.1, 0.46, 1.1, palette.huskDoor, 0.45).rotateY(0.6).translate(0.95, 0.7, 0.1),
    // A buckled exhaust dragging out the back.
    box(0.12, 0.12, 0.9, palette.wreckScorch, 0.3).translate(-0.4, 0.18, -1.7),
    // Three tyres left on the rims, one corner sagging.
    wheel(0.33, 0.26, palette.wheel).translate(0.78, 0.2, 1.2),
    wheel(0.33, 0.26, palette.wheel).translate(-0.78, 0.2, 1.2),
    wheel(0.3, 0.24, palette.wheel).translate(-0.78, 0.17, -1.25),
  ]);
}

/**
 * A jersey barrier: wide foot tapering to a narrower top, with worn hazard paint
 * and a corner spalled to the concrete core. Detail from proportion and vertex
 * color, not triangle count (docs/DESIGN.md → Object craft).
 */
function barrierGeometry(): THREE.BufferGeometry {
  return merged([
    box(0.62, 0.34, 2.4, palette.barrier, 0.5).translate(0, 0.17, 0),
    box(0.34, 0.55, 2.4, palette.barrier, 0.4).translate(0, 0.5, 0),
    // A band of worn paint around the upper body.
    box(0.36, 0.16, 2.42, palette.barrierPaint, 0.35).translate(0, 0.58, 0),
    // One end chipped away, exposing the grey concrete core.
    box(0.3, 0.5, 0.34, palette.barrierCore, 0.4).rotateZ(-0.12).translate(0.02, 0.46, 1.18),
  ]);
}

// Act-coherent roadside objects. The sim's four prop kinds are kept only as
// placement *archetypes* (where a prop sits and how it stands): `post` is the
// upright thing at the verge, `barrier` hugs the shoulder, `husk` is the low
// dead car, `rock` is a low cluster. Each archetype is then dressed per act below,
// so the immediate roadside tells the same story the skyline does (docs/DESIGN.md
// → Run structure: the world ends in stages). Decoration tier: desaturated, never
// warm, never mimicking an interactive silhouette (docs/DESIGN.md → readability).

/** A bare dead tree: a split trunk and a knot of leafless branches (Rust). */
function deadTreeGeometry(): THREE.BufferGeometry {
  const t = palette.post;
  const b = palette.postCollar;
  return merged([
    box(0.3, 3.0, 0.3, t, 0.5).translate(0, 1.5, 0),
    box(0.18, 1.6, 0.18, t, 0.5).rotateZ(0.6).translate(-0.55, 2.6, 0),
    box(0.16, 1.3, 0.16, t, 0.5).rotateZ(-0.7).translate(0.5, 2.9, 0.1),
    box(0.12, 1.0, 0.12, b, 0.4).rotateX(0.6).translate(0.1, 3.4, -0.4),
    box(0.1, 0.8, 0.1, b, 0.4).rotateZ(0.9).translate(-0.3, 3.7, 0.2),
  ]);
}

/** A tall alien crystal shard standing at the verge, faceted and quiet (Visitors).
 *  Kept dark (no pickup-bright glow) so it never competes with a cool road token. */
function crystalSpurGeometry(): THREE.BufferGeometry {
  const b = palette.crystalBody;
  return merged([
    cone(0.6, 4.2, 5, b, 0.5).rotateZ(0.12).translate(0, 2.0, 0),
    cone(0.4, 2.6, 5, b, 0.45).rotateZ(-0.4).translate(0.5, 1.2, 0.2),
    cone(0.3, 1.8, 5, b, 0.45).rotateZ(0.5).translate(-0.45, 0.9, -0.15),
  ]);
}

/** A snapped girder: a concrete footing with bent rebar clawing up (Colossus/Static). */
function rebarGeometry(): THREE.BufferGeometry {
  const s = palette.railBeam;
  const d = palette.railPost;
  return merged([
    box(0.5, 0.45, 0.5, d, 0.4).translate(0, 0.22, 0),
    box(0.1, 2.8, 0.1, s, 0.4).rotateZ(0.2).translate(0, 1.6, 0),
    box(0.08, 2.2, 0.08, s, 0.4).rotateZ(-0.35).translate(0.3, 1.4, 0.1),
    box(0.08, 1.8, 0.08, s, 0.4).rotateX(0.4).translate(-0.2, 1.5, 0.2),
    box(0.07, 1.2, 0.07, s, 0.4).rotateZ(0.7).translate(0.1, 2.6, -0.1),
  ]);
}

/** A leaning timber fence section, a couple of pickets gone (Rust suburbia). */
function fenceGeometry(): THREE.BufferGeometry {
  const w = palette.husk;
  const r = palette.postCollar;
  const parts: THREE.BufferGeometry[] = [
    box(0.12, 1.1, 0.12, r, 0.4).translate(-1.0, 0.55, 0),
    box(0.12, 1.1, 0.12, r, 0.4).translate(0.0, 0.55, 0),
    box(0.12, 0.9, 0.12, r, 0.4).rotateZ(0.18).translate(1.0, 0.5, 0),
    box(2.3, 0.14, 0.06, w, 0.4).translate(0, 0.85, 0),
    box(2.3, 0.14, 0.06, w, 0.4).translate(0, 0.45, 0),
  ];
  for (const px of [-0.8, -0.4, 0.2, 0.6]) parts.push(box(0.1, 1.0, 0.05, w, 0.4).translate(px, 0.55, 0));
  return merged(parts);
}

/** A toppled concrete barrier shattered to its core, with a broken chunk (late acts). */
function slabGeometry(): THREE.BufferGeometry {
  const c = palette.barrier;
  const core = palette.barrierCore;
  return merged([
    box(2.0, 0.5, 0.7, c, 0.5).rotateZ(0.4).translate(0, 0.32, 0),
    box(0.7, 0.5, 0.7, core, 0.4).rotateY(0.5).translate(1.3, 0.25, 0.2),
    box(0.5, 0.35, 0.5, c, 0.4).rotateY(0.9).translate(-1.0, 0.18, -0.3),
  ]);
}

/** A heap of broken masonry with rebar poking out — a building shed onto the verge. */
function rubbleGeometry(): THREE.BufferGeometry {
  const a = palette.structureBase;
  const b = palette.barrier;
  return merged([
    box(1.2, 0.6, 1.0, a, 0.5).rotateY(0.3).translate(0, 0.3, 0),
    box(0.8, 0.5, 0.7, b, 0.45).rotateZ(0.3).rotateY(-0.4).translate(0.7, 0.35, 0.3),
    box(0.6, 0.7, 0.5, a, 0.4).rotateX(0.2).translate(-0.5, 0.4, -0.2),
    box(0.4, 0.3, 0.4, b, 0.4).rotateY(0.8).translate(0.2, 0.5, 0.5),
    box(0.1, 0.9, 0.1, palette.railBeam, 0.3).rotateZ(0.6).translate(-0.3, 0.6, 0.3),
  ]);
}

/** A low cluster of alien crystal pushing up at the roadside (Visitors). Dark. */
function crystalClusterGeometry(): THREE.BufferGeometry {
  const b = palette.crystalBody;
  return merged([
    cone(0.7, 2.0, 5, b, 0.5).rotateZ(0.15).translate(0, 0.9, 0),
    cone(0.5, 1.4, 5, b, 0.45).rotateZ(-0.5).translate(0.6, 0.6, 0.2),
    cone(0.4, 1.1, 5, b, 0.45).rotateZ(0.6).translate(-0.5, 0.5, -0.2),
    cone(0.3, 0.8, 5, b, 0.4).rotateX(0.4).translate(0.1, 0.4, 0.5),
  ]);
}

/** Grey fracture shards jutting from the ground — reality coming apart (Static). */
function shardClusterGeometry(): THREE.BufferGeometry {
  const a = palette.spireBase;
  const b = palette.spireHaze;
  return merged([
    box(0.5, 2.2, 0.5, a, 0.4).rotateZ(0.2).rotateY(0.3).translate(0, 1.1, 0),
    box(0.4, 1.6, 0.4, b, 0.35).rotateZ(-0.5).translate(0.5, 0.8, 0.2),
    box(0.35, 1.2, 0.35, a, 0.35).rotateZ(0.7).translate(-0.4, 0.6, -0.2),
    box(0.3, 0.9, 0.3, b, 0.3).rotateX(0.5).translate(0.2, 0.5, 0.4),
  ]);
}

/** The render-side object set: the four sim archetypes reuse the originals, the
 *  rest are the act-specific dressings chosen by `ACT_DECOR`. */
type DecorKind =
  | 'streetlight'
  | 'barrier'
  | 'husk'
  | 'rock'
  | 'deadtree'
  | 'crystalspur'
  | 'rebar'
  | 'fence'
  | 'slab'
  | 'rubble'
  | 'crystalcluster'
  | 'shardcluster';

const GEOMETRY: Record<DecorKind, () => THREE.BufferGeometry> = {
  streetlight: postGeometry,
  barrier: barrierGeometry,
  husk: huskGeometry,
  rock: rockGeometry,
  deadtree: deadTreeGeometry,
  crystalspur: crystalSpurGeometry,
  rebar: rebarGeometry,
  fence: fenceGeometry,
  slab: slabGeometry,
  rubble: rubbleGeometry,
  crystalcluster: crystalClusterGeometry,
  shardcluster: shardClusterGeometry,
};

const KINDS = Object.keys(GEOMETRY) as DecorKind[];

/**
 * Which object each placement archetype becomes, per act (index 0..5). The sim's
 * `post`/`barrier`/`husk`/`rock` keep their placement role (upright / shoulder /
 * dead car / cluster) but are re-skinned to the act: a city street light becomes a
 * dead suburban tree, an alien crystal spur, then a clawing girder; a jersey
 * barrier becomes a leaning fence then a shattered slab; the rock cluster becomes
 * city rubble, then alien crystal, then grey reality-shards.
 */
const ACT_DECOR: Record<PropKind, readonly DecorKind[]> = {
  //          I              II         III            IV               V          VI
  post: ['streetlight', 'deadtree', 'streetlight', 'crystalspur', 'rebar', 'rebar'],
  barrier: ['barrier', 'fence', 'barrier', 'slab', 'slab', 'slab'],
  husk: ['husk', 'husk', 'husk', 'husk', 'husk', 'husk'],
  rock: ['rubble', 'rock', 'rubble', 'crystalcluster', 'rubble', 'shardcluster'],
};

/**
 * Roadside decoration, instanced. The sim owns where and how the props sit
 * (it generates position, scale, and yaw deterministically from the seed); this
 * field is the read-only view that draws them — one `InstancedMesh` per class,
 * so the whole roadside is four draw calls regardless of count
 * (docs/ARCHITECTURE.md → Instancing). Chunks are cached on first sight and
 * evicted on exit, mirroring the sim's streaming so nothing allocates per frame.
 */
export class DecorField {
  private readonly seed: number;
  private readonly meshes: Record<DecorKind, THREE.InstancedMesh>;
  private readonly counts: Record<DecorKind, number>;
  private readonly cache = new Map<number, Chunk>();
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed;
    this.meshes = {} as Record<DecorKind, THREE.InstancedMesh>;
    this.counts = {} as Record<DecorKind, number>;
    for (const kind of KINDS) {
      const mesh = new THREE.InstancedMesh(GEOMETRY[kind](), propMaterial, MAX_INSTANCES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // we place them ourselves within the window
      mesh.count = 0;
      this.meshes[kind] = mesh;
      this.counts[kind] = 0;
      scene.add(mesh);
    }
  }

  /** A stable pseudo-random in [0, 1) for a prop, salted, so the boundary
   *  crossfade flip is deterministic per seed and never flickers. */
  private rand(s: number, salt: number): number {
    let h = (Math.imul(s, 374761393) ^ Math.imul(salt, 668265263) ^ this.seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  update(distance: number, elevation: Elevation): void {
    const first = Math.floor((distance - CHUNK_LENGTH) / CHUNK_LENGTH);
    const last = Math.ceil((distance + LOOKAHEAD) / CHUNK_LENGTH);
    const lastAct = ACT_DECOR.post.length - 1;
    const tw = TRANSITION / ACT_SPAN;

    for (const kind of KINDS) this.counts[kind] = 0;

    for (let index = first; index <= last; index += 1) {
      const chunk = this.chunk(index);
      const base = index * CHUNK_LENGTH;
      for (let pi = 0; pi < chunk.props.length; pi += 1) {
        const prop = chunk.props[pi];
        const forward = base + prop.z;
        // Re-skin the placement archetype (the sim's prop kind) to the act this
        // prop sits in, so the roadside object belongs to its stretch of road. Near
        // an act boundary a prop flips early to the next act's dressing, the same
        // slot-by-slot crossfade the skyline and ground use, so the verge rebuilds
        // gradually rather than swapping all at once.
        const f = Math.max(0, forward) / ACT_SPAN;
        const ai = Math.min(Math.floor(f), lastAct);
        const frac = f - Math.floor(f);
        const t = frac <= 1 - tw ? 0 : (frac - (1 - tw)) / tw;
        const key = index * 64 + pi;
        const act = ai < lastAct && t > 0 && this.rand(key, 7) < t ? ai + 1 : ai;
        const kind = ACT_DECOR[prop.kind][act];

        const count = this.counts[kind];
        if (count >= MAX_INSTANCES) continue;
        // Sit on the road's vertical profile at this forward, not at a flat y=0
        // the terrain rises through as the hills scroll past.
        this.dummy.position.set(prop.x, elevation.yAt(forward, distance), distance - forward);
        this.dummy.rotation.set(0, prop.rot, 0);
        this.dummy.scale.setScalar(prop.scale);
        this.dummy.updateMatrix();
        this.meshes[kind].setMatrixAt(count, this.dummy.matrix);
        this.counts[kind] = count + 1;
      }
    }

    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      mesh.count = this.counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
    }

    for (const index of this.cache.keys()) {
      if (index < first - 1 || index > last + 1) this.cache.delete(index);
    }
  }

  private chunk(index: number): Chunk {
    let chunk = this.cache.get(index);
    if (chunk === undefined) {
      chunk = chunkAt(this.seed, index);
      this.cache.set(index, chunk);
    }
    return chunk;
  }
}
