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
 * Renders the sim's live, un-mowed zombies as one instanced crowd. The sim owns
 * where they are; this maps each zombie's absolute world-forward to screen z and
 * adds a simple idle shamble (a gentle rock and bob, offset per instance by the
 * zombie's deterministic phase) so a standing cluster looks alive, not frozen.
 * No allocation per frame.
 */
export class ZombieField {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private clock = 0;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(zombieGeometry(), propMaterial, MAX_INSTANCES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  update(state: ReadonlyState, dt: number, elevation: Elevation): void {
    this.clock += dt;
    let count = 0;
    for (const z of state.zombies) {
      if (z.mowed || count >= MAX_INSTANCES) continue;
      const sway = Math.sin(this.clock * 5 + z.phase * TWO_PI);
      const groundY = elevation.yAt(z.forward, state.distance);
      this.dummy.position.set(z.x, groundY + Math.abs(sway) * 0.04, state.distance - z.forward);
      // Static facing variety from phase, plus a small live rock from the sway.
      this.dummy.rotation.set(0, (z.phase - 0.5) * 1.6, sway * 0.08);
      this.dummy.scale.setScalar(0.92 + z.phase * 0.18);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count, this.dummy.matrix);
      count += 1;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
