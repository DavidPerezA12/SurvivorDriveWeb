import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ReadonlyState } from '../sim';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import type { Elevation } from './elevation';

// Headroom for every zombie that can be live within the lookahead window at
// once. Instanced, so unused slots cost nothing; only `count` draw.
const MAX_INSTANCES = 160;
const TWO_PI = Math.PI * 2;

/**
 * A hunched shambler, built as one merged geometry: an asymmetric, stooped
 * silhouette with a lowered head and one arm reaching forward (docs/DESIGN.md →
 * Object craft). The reaching arm and forward hunch make a cluster read as
 * zombies at the spawn horizon. The whole crowd is a single draw call.
 */
function zombieGeometry(): THREE.BufferGeometry {
  const flesh = palette.zombieFlesh;
  const dark = palette.zombieFleshDark;
  const rag = palette.zombieRag;
  const shirt = palette.zombieShirt;
  const bone = palette.zombieBone;

  const parts = [
    // Legs — a straight back leg and a shorter, bent front one (a broken gait).
    box(0.22, 0.72, 0.26, rag).translate(-0.16, 0.36, -0.05),
    box(0.22, 0.6, 0.26, rag).translate(0.16, 0.3, 0.12),
    box(0.52, 0.3, 0.34, rag).translate(0, 0.82, 0.02),
    // A torn rag flap hanging off the hip.
    box(0.12, 0.42, 0.1, rag).rotateZ(0.3).translate(-0.22, 0.74, 0.18),
    // Torso + shoulders, hunched forward over the legs, with an upper-back hump.
    box(0.56, 0.74, 0.36, shirt).rotateX(0.4).translate(0, 1.2, 0.16),
    box(0.46, 0.28, 0.32, shirt).rotateX(0.4).translate(0, 1.48, 0.06),
    box(0.62, 0.26, 0.36, flesh).rotateX(0.4).translate(0, 1.52, 0.34),
    // Exposed ribs through a split in the shirt.
    box(0.3, 0.32, 0.12, bone).rotateX(0.4).translate(0, 1.12, 0.42),
    // Head, lowered and jutting forward — the stoop — with a slack, dark jaw.
    box(0.3, 0.32, 0.3, flesh).translate(0, 1.58, 0.5),
    box(0.24, 0.12, 0.22, flesh).translate(0, 1.45, 0.56),
    box(0.2, 0.06, 0.14, dark).translate(0, 1.51, 0.58),
    // Reaching arm + splayed clawed hand, the signature forward grab.
    box(0.18, 0.18, 0.72, flesh).rotateX(-0.35).translate(0.34, 1.34, 0.62),
    box(0.26, 0.12, 0.22, dark).translate(0.36, 1.18, 0.98),
    // Trailing arm, hanging at the side.
    box(0.17, 0.62, 0.18, flesh).rotateX(-0.12).translate(-0.34, 1.12, -0.04),
  ];
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge zombie geometry');
  return geo;
}

/**
 * A second fodder shambler, so a crowd is not a row of one cloned silhouette. Same
 * class read and palette as the first (a stooped, reaching dead thing) but a clearly
 * different pose: a taller, stiffer stalker, head lolled to one side, one arm thrown
 * up overhead and the other crossed low. Routed per-instance against the first by
 * each zombie's deterministic `phase`, so a horde reads as a mixed mob, not clones
 * (docs/DESIGN.md → Object craft; the class still reads as fodder at the horizon).
 */
function zombieGeometryB(): THREE.BufferGeometry {
  const flesh = palette.zombieFlesh;
  const dark = palette.zombieFleshDark;
  const rag = palette.zombieRag;
  const shirt = palette.zombieShirt;
  const bone = palette.zombieBone;

  const parts = [
    // Legs — stiffer and straighter than the hunched shambler, one stepping out.
    box(0.22, 0.82, 0.26, rag).translate(-0.17, 0.41, 0.0),
    box(0.22, 0.78, 0.26, rag).rotateX(0.18).translate(0.17, 0.4, 0.1),
    box(0.5, 0.28, 0.34, rag).translate(0, 0.92, 0.04),
    // A torn trouser flap off the shin.
    box(0.1, 0.36, 0.1, rag).rotateZ(-0.25).translate(0.24, 0.5, 0.16),
    // Torso, only slightly stooped — the upright stalker stance.
    box(0.54, 0.8, 0.34, shirt).rotateX(0.16).translate(0, 1.34, 0.06),
    box(0.46, 0.26, 0.3, shirt).rotateX(0.16).translate(0, 1.7, 0.0),
    // Exposed sternum/ribs through the split shirt.
    box(0.26, 0.34, 0.12, bone).rotateX(0.16).translate(0, 1.28, 0.26),
    // Head lolled hard to one side on a slack neck — the signature tilt.
    box(0.3, 0.32, 0.3, flesh).rotateZ(0.5).translate(0.12, 1.82, 0.16),
    box(0.22, 0.1, 0.2, dark).rotateZ(0.5).translate(0.2, 1.74, 0.24),
    // One arm thrown up overhead.
    box(0.16, 0.66, 0.18, flesh).rotateZ(-0.5).translate(-0.34, 1.66, 0.02),
    box(0.2, 0.22, 0.16, dark).rotateZ(-0.5).translate(-0.6, 1.96, 0.02),
    // The other arm crossed low over the belly.
    box(0.16, 0.16, 0.5, flesh).rotateX(-0.2).rotateY(0.6).translate(0.28, 1.16, 0.28),
    box(0.22, 0.12, 0.2, dark).translate(0.04, 1.12, 0.42),
  ];
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge zombie-B geometry');
  return geo;
}

/**
 * A brute: a heavy, swollen zombie that is a damaging obstacle, not free fodder
 * (docs/DESIGN.md → roster). Built far bulkier than a shambler — a broad barrel
 * torso, thick legs, two heavy reaching arms — and warmed/darkened by its own
 * palette, so it reads as "a real threat" even planted in a normal crowd. One
 * merged geometry, instanced as its own draw call.
 */
function bruteGeometry(): THREE.BufferGeometry {
  const flesh = palette.bruteFlesh;
  const dark = palette.bruteFleshDark;
  const rag = palette.bruteRag;
  const scar = palette.bruteScar;

  const parts = [
    // Thick, planted legs.
    box(0.36, 0.78, 0.42, rag).translate(-0.26, 0.4, 0),
    box(0.36, 0.74, 0.42, rag).translate(0.26, 0.38, 0.06),
    // A broad, barrel torso hunched forward — the signature heavy mass.
    box(1.0, 0.6, 0.6, dark).translate(0, 0.95, 0.04),
    box(1.12, 0.86, 0.7, flesh).rotateX(0.22).translate(0, 1.45, 0.12),
    // A swollen upper back hump.
    box(0.8, 0.4, 0.5, flesh).rotateX(0.3).translate(0, 1.86, -0.1),
    // Raw warm wounds split across the chest and shoulder.
    box(0.5, 0.34, 0.14, scar).rotateX(0.22).translate(-0.1, 1.4, 0.5),
    box(0.3, 0.2, 0.12, scar).translate(0.5, 1.7, 0.2),
    // A small, sunk head between heavy shoulders.
    box(0.36, 0.36, 0.36, flesh).translate(0, 1.92, 0.34),
    box(0.26, 0.1, 0.2, dark).translate(0, 1.82, 0.46),
    // Two heavy reaching arms + broad clubbed hands.
    box(0.28, 0.28, 0.84, flesh).rotateX(-0.4).translate(0.5, 1.46, 0.6),
    box(0.34, 0.22, 0.3, dark).translate(0.54, 1.24, 1.0),
    box(0.28, 0.28, 0.78, flesh).rotateX(-0.3).translate(-0.5, 1.44, 0.5),
    box(0.34, 0.22, 0.3, dark).translate(-0.54, 1.26, 0.86),
  ];
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge brute geometry');
  return geo;
}

/**
 * Renders the sim's live, un-mowed zombies as instanced crowds: one mesh for the
 * fodder shamblers and one for the heavy brutes (a separate draw call so each
 * keeps its own geometry and palette). The sim owns where they are; this maps each
 * zombie's absolute world-forward to screen z and adds a simple idle shamble (a
 * gentle rock and bob, offset per instance by the zombie's deterministic phase) so
 * a standing cluster looks alive, not frozen. No allocation per frame.
 */
export class ZombieField {
  private readonly mesh: THREE.InstancedMesh;
  private readonly meshB: THREE.InstancedMesh;
  private readonly bruteMesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private clock = 0;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(zombieGeometry(), propMaterial, MAX_INSTANCES);
    this.meshB = new THREE.InstancedMesh(zombieGeometryB(), propMaterial, MAX_INSTANCES);
    this.bruteMesh = new THREE.InstancedMesh(bruteGeometry(), propMaterial, MAX_INSTANCES);
    for (const m of [this.mesh, this.meshB, this.bruteMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
  }

  update(state: ReadonlyState, dt: number, elevation: Elevation): void {
    this.clock += dt;
    let count = 0;
    let countB = 0;
    let brutes = 0;
    for (const z of state.zombies) {
      if (z.mowed) continue;
      const brute = z.brute === true;
      // Split the fodder between the two shambler silhouettes by deterministic
      // phase, so a packed crowd is a mixed mob instead of one cloned pose.
      const variantB = !brute && z.phase >= 0.5;
      const slot = brute ? brutes : variantB ? countB : count;
      if (slot >= MAX_INSTANCES) continue;
      // Brutes shamble slower and rock harder, reading as heavy even while idle.
      const rate = brute ? 3 : 5;
      const sway = Math.sin(this.clock * rate + z.phase * TWO_PI);
      const groundY = elevation.yAt(z.forward, state.distance);
      this.dummy.position.set(z.x, groundY + Math.abs(sway) * 0.04, state.distance - z.forward);
      // Static facing variety from phase, plus a small live rock from the sway.
      this.dummy.rotation.set(0, (z.phase - 0.5) * 1.6, sway * (brute ? 0.05 : 0.08));
      // Brutes are bigger and vary less; shamblers keep their wider size jitter.
      this.dummy.scale.setScalar(brute ? 1.12 + z.phase * 0.12 : 0.92 + z.phase * 0.18);
      this.dummy.updateMatrix();
      if (brute) {
        this.bruteMesh.setMatrixAt(brutes, this.dummy.matrix);
        brutes += 1;
      } else if (variantB) {
        this.meshB.setMatrixAt(countB, this.dummy.matrix);
        countB += 1;
      } else {
        this.mesh.setMatrixAt(count, this.dummy.matrix);
        count += 1;
      }
    }
    this.mesh.count = count;
    this.meshB.count = countB;
    this.bruteMesh.count = brutes;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.meshB.instanceMatrix.needsUpdate = true;
    this.bruteMesh.instanceMatrix.needsUpdate = true;
  }
}
