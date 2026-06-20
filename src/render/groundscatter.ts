import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, paint, propMaterial } from './materials';
import { palette } from './palette';
import { LOOKAHEAD, roadHalfWidth } from '../content/tuning';
import { ACT_SPAN } from './mood';

/**
 * Flat detail scattered on the dirt either side of the road. In the wasteland
 * acts it's sand drifts, cracked earth and scorch; inside the opening **city**
 * (Outbreak, the first band) it swaps to *paved* clutter — concrete sidewalk
 * slabs, manhole covers and broken-masonry rubble — so the city floor never reads
 * as the same desert dirt as the wasteland (docs/DESIGN.md → Run structure: Act I
 * is a real city). The ground plane is static (the road scrolls over it), so on
 * its own the floor reads as a dead sheet; these decals stream past with distance
 * and give it real motion and texture (docs/DESIGN.md → Art direction).
 *
 * Pure flat decals lying on the ground, only ever *off* the road, so they never
 * touch gameplay — render-only, reading `distance`. They recycle by slot exactly
 * like the road wear (z = `distance − worldZ`), each slot a pure function of its
 * index and the seed, so nothing flickers and the per-frame path allocates
 * nothing. One `InstancedMesh` per kind on the lit, fogged road material, so the
 * act lights re-mood them and the far ones dissolve into the haze
 * (docs/ARCHITECTURE.md → Instancing, allocation discipline).
 */

type ScatterKind = 'drift' | 'crack' | 'scorch' | 'slab' | 'manhole' | 'chunks';
const KINDS: readonly ScatterKind[] = ['drift', 'crack', 'scorch', 'slab', 'manhole', 'chunks'];

const SPACING = 9;
const REACH = LOOKAHEAD * 0.62;
/** Off-road band: from just past the shoulder out into the dirt. */
const INNER = roadHalfWidth() + 2;
const OUTER = roadHalfWidth() + 50;
/** A hair above the ground plane (which sits at y = -0.08), below the road. */
const Y = -0.05;
const CAP = 28;
/** Slots whose forward sits before this ride the city's paved-clutter look. */
const CITY_END = ACT_SPAN;

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge ground-scatter geometry');
  return geo;
}

function disc(r: number, hex: number, y: number): THREE.BufferGeometry {
  return paint(new THREE.CylinderGeometry(r, r, 0.04, 9), hex, 0).translate(0, y, 0);
}

/** A soft, lighter sand drift — two overlapping low blobs. */
function driftGeometry(): THREE.BufferGeometry {
  const a = disc(2.2, palette.groundSand, Y);
  const b = disc(1.4, palette.groundSand, Y + 0.005).translate(1.7, 0, 0.8);
  return merged([a, b]);
}

/** A branching network of dry cracks in the earth. */
function crackGeometry(): THREE.BufferGeometry {
  const c = palette.groundScorch;
  return merged([
    box(0.14, 0.04, 3.0, c, 0).translate(0, Y, 0),
    box(0.12, 0.04, 2.0, c, 0).rotateY(0.7).translate(0.3, Y, 0.6),
    box(0.1, 0.04, 1.6, c, 0).rotateY(-0.8).translate(-0.4, Y, -0.5),
    box(0.1, 0.04, 1.2, c, 0).rotateY(1.3).translate(0.2, Y, -1.0),
  ]);
}

/** A burn scar with a couple of charred chunks sitting in it. */
function scorchGeometry(): THREE.BufferGeometry {
  return merged([
    disc(1.8, palette.groundScorch, Y),
    box(0.45, 0.2, 0.45, palette.wreckDark, 0.4).rotateY(0.4).translate(0.6, 0.05, 0.3),
    box(0.32, 0.16, 0.32, palette.wreckDark, 0.4).rotateY(0.9).translate(-0.55, 0.03, -0.4),
  ]);
}

/** A concrete sidewalk slab with a darker expansion-joint cross — city paving. */
function slabGeometry(): THREE.BufferGeometry {
  const c = palette.curb;
  const s = palette.asphaltSeam;
  return merged([
    box(2.4, 0.04, 2.4, c, 0).translate(0, Y, 0),
    box(2.4, 0.05, 0.1, s, 0).translate(0, Y + 0.004, 0), // joint
    box(0.1, 0.05, 2.4, s, 0).translate(0, Y + 0.004, 0), // joint
  ]);
}

/** A manhole cover set in the asphalt — a dark disc inside a lighter rim. */
function manholeGeometry(): THREE.BufferGeometry {
  return merged([
    disc(0.62, palette.structureHaze, Y),
    disc(0.5, palette.asphaltSeam, Y + 0.004),
  ]);
}

/** A heap of broken concrete masonry — the city already coming apart. */
function chunksGeometry(): THREE.BufferGeometry {
  const c = palette.curb;
  const d = palette.structureBase;
  return merged([
    disc(1.2, palette.asphaltSeam, Y),
    box(0.5, 0.22, 0.5, c, 0.4).rotateY(0.4).translate(0.5, 0.06, 0.2),
    box(0.36, 0.3, 0.36, d, 0.4).rotateY(0.9).translate(-0.5, 0.08, -0.3),
    box(0.4, 0.18, 0.6, c, 0.4).rotateY(-0.5).translate(0.1, 0.05, 0.5),
  ]);
}

const GEOMETRY: Record<ScatterKind, () => THREE.BufferGeometry> = {
  drift: driftGeometry,
  crack: crackGeometry,
  scorch: scorchGeometry,
  slab: slabGeometry,
  manhole: manholeGeometry,
  chunks: chunksGeometry,
};

export class GroundScatter {
  private readonly meshes: Record<ScatterKind, THREE.InstancedMesh>;
  private readonly counts: Record<ScatterKind, number>;
  private readonly dummy = new THREE.Object3D();
  private readonly seed: number;

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed | 0;
    this.meshes = {} as Record<ScatterKind, THREE.InstancedMesh>;
    this.counts = {} as Record<ScatterKind, number>;
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

  update(distance: number): void {
    for (const kind of KINDS) this.counts[kind] = 0;

    const first = Math.floor((distance - SPACING) / SPACING);
    const last = Math.ceil((distance + REACH) / SPACING);

    for (let slot = first; slot <= last; slot += 1) {
      for (const side of [-1, 1] as const) {
        const key = slot * 2 + (side < 0 ? 0 : 1);
        if (this.rand(key, 1) < 0.5) continue;

        const r = this.rand(key, 2);
        const city = slot * SPACING < CITY_END;
        const kind: ScatterKind = city
          ? r < 0.42
            ? 'slab'
            : r < 0.72
              ? 'chunks'
              : 'manhole'
          : r < 0.45
            ? 'drift'
            : r < 0.75
              ? 'crack'
              : 'scorch';
        const n = this.counts[kind];
        if (n >= CAP) continue;

        const worldZ = slot * SPACING + (this.rand(key, 3) - 0.5) * SPACING;
        const x = side * (INNER + this.rand(key, 4) * (OUTER - INNER));
        const scale = 0.7 + this.rand(key, 5) * 1.1;
        const yaw = this.rand(key, 6) * Math.PI;

        this.dummy.position.set(x, 0, distance - worldZ);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        this.meshes[kind].setMatrixAt(n, this.dummy.matrix);
        this.counts[kind] = n + 1;
      }
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
