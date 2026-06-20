import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chunkAt, type Chunk, type PropKind } from '../sim';
import { box, propMaterial, wheel } from './materials';
import { palette } from './palette';
import { CHUNK_LENGTH, LOOKAHEAD } from '../content/tuning';

const MAX_INSTANCES = 64;

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge decor geometry');
  return geo;
}

/** A leaning street light: base plate, pole, arm, lamp head, and a dead wire. */
function postGeometry(): THREE.BufferGeometry {
  return merged([
    box(0.42, 0.1, 0.42, palette.post, 0.5).translate(0, 0.05, 0),
    // Bolted anchor flange just above the base plate.
    box(0.3, 0.08, 0.3, palette.postCollar, 0.5).translate(0, 0.13, 0),
    box(0.2, 3.2, 0.2, palette.post, 0.6).translate(0, 1.6, 0),
    // A weathered junction box clamped to the pole — read of a real fixture.
    box(0.26, 0.4, 0.18, palette.postCollar, 0.45).translate(0.05, 1.1, 0.16),
    box(0.7, 0.16, 0.16, palette.post, 0.5).translate(0.3, 3.15, 0),
    // A diagonal gusset bracing the arm to the pole.
    box(0.04, 0.42, 0.12, palette.post, 0.4).rotateZ(0.78).translate(0.18, 2.95, 0),
    box(0.5, 0.22, 0.32, palette.postLamp, 0.4).translate(0.55, 3.05, 0),
    // A snapped power line drooping off the arm.
    box(0.04, 0.7, 0.04, palette.post, 0.4).rotateX(0.4).translate(0.62, 2.78, 0.12),
  ]);
}

/** An irregular boulder cluster — never a clean cube. */
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

const GEOMETRY: Record<PropKind, () => THREE.BufferGeometry> = {
  post: postGeometry,
  rock: rockGeometry,
  husk: huskGeometry,
  barrier: barrierGeometry,
};

const KINDS: PropKind[] = ['post', 'rock', 'husk', 'barrier'];

/**
 * Roadside decoration, instanced. The sim owns *where* and *how* the props sit
 * (it generates position, scale, and yaw deterministically from the seed); this
 * field is the read-only view that draws them — one `InstancedMesh` per class,
 * so the whole roadside is four draw calls regardless of count
 * (docs/ARCHITECTURE.md → Instancing). Chunks are cached on first sight and
 * evicted on exit, mirroring the sim's streaming so nothing allocates per frame.
 */
export class DecorField {
  private readonly seed: number;
  private readonly meshes: Record<PropKind, THREE.InstancedMesh>;
  private readonly cache = new Map<number, Chunk>();
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed;
    this.meshes = {} as Record<PropKind, THREE.InstancedMesh>;
    for (const kind of KINDS) {
      const mesh = new THREE.InstancedMesh(GEOMETRY[kind](), propMaterial, MAX_INSTANCES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // we place them ourselves within the window
      mesh.count = 0;
      this.meshes[kind] = mesh;
      scene.add(mesh);
    }
  }

  update(distance: number): void {
    const first = Math.floor((distance - CHUNK_LENGTH) / CHUNK_LENGTH);
    const last = Math.ceil((distance + LOOKAHEAD) / CHUNK_LENGTH);

    const counts: Record<PropKind, number> = { post: 0, rock: 0, husk: 0, barrier: 0 };

    for (let index = first; index <= last; index += 1) {
      const chunk = this.chunk(index);
      const base = index * CHUNK_LENGTH;
      for (const prop of chunk.props) {
        const count = counts[prop.kind];
        if (count >= MAX_INSTANCES) continue;
        this.dummy.position.set(prop.x, 0, distance - (base + prop.z));
        this.dummy.rotation.set(0, prop.rot, 0);
        this.dummy.scale.setScalar(prop.scale);
        this.dummy.updateMatrix();
        this.meshes[prop.kind].setMatrixAt(count, this.dummy.matrix);
        counts[prop.kind] = count + 1;
      }
    }

    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      mesh.count = counts[kind];
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
