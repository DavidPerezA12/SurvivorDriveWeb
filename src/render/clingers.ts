import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import { JUMPER_TUNING } from '../content/tuning';

/**
 * A jumper clinging to the hood: a zombie sprawled flat, both clawed hands gripping
 * forward over the cowl, legs trailing back, head wrenched up toward the cabin (the
 * thing on your windshield). Reuses the jumper palette (warm = threat) so a passenger
 * reads as the same enemy that leapt. Built reaching toward +z; placement rotates it
 * to claw at the windshield. One merged geometry per clinger.
 */
function clingerGeometry(): THREE.BufferGeometry {
  const flesh = palette.jumperFlesh;
  const dark = palette.jumperFleshDark;
  const rag = palette.jumperRag;
  const accent = palette.jumperAccent;

  const parts = [
    // Flat torso, pressed along the hood, hot sinew down the spine.
    box(0.5, 0.22, 0.8, flesh).translate(0, 0.0, 0.0),
    box(0.26, 0.12, 0.6, accent).translate(0, 0.12, -0.04),
    // Head wrenched up and forward toward the cabin.
    box(0.28, 0.26, 0.26, flesh).rotateX(-0.5).translate(0, 0.16, 0.5),
    box(0.22, 0.1, 0.18, dark).translate(0, 0.08, 0.64),
    // Two arms thrown forward, clawed hands gripping the cowl.
    box(0.16, 0.14, 0.66, flesh).translate(0.32, 0.02, 0.42),
    box(0.22, 0.1, 0.2, dark).translate(0.34, 0.0, 0.78),
    box(0.16, 0.14, 0.66, flesh).translate(-0.32, 0.02, 0.42),
    box(0.22, 0.1, 0.2, dark).translate(-0.34, 0.0, 0.78),
    // Legs trailing back off the hood, knees splayed.
    box(0.16, 0.16, 0.6, rag).rotateY(0.3).translate(0.26, -0.02, -0.5),
    box(0.16, 0.16, 0.6, rag).rotateY(-0.3).translate(-0.26, -0.02, -0.5),
  ];
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge clinger geometry');
  return geo;
}

// Fixed local anchor points on the hero car's hood/cowl, in car-local space (nose at
// +z). One per cling slot; the first jumper grabs the centre, the next two flank it.
// First-pass placement; wants the browser feel pass.
const ANCHORS: readonly { x: number; y: number; z: number }[] = [
  { x: 0.0, y: 1.06, z: 0.62 },
  { x: -0.5, y: 1.0, z: 0.34 },
  { x: 0.5, y: 1.0, z: 0.34 },
];

/**
 * The jumpers riding the hood. One mesh per cling slot, all parented to the hero car
 * group so they inherit its position, bank, pitch, and squash for free (they ride the
 * car). `update` shows `state.car.clinging` of them and thrashes each (a grip-wrench
 * wobble), so a latched passenger is unmistakable with sound off (docs/DESIGN.md →
 * juice as information). Honors reduced motion. Allocation-free per frame.
 */
export class ClingerField {
  private readonly root = new THREE.Group();
  private readonly slots: THREE.Mesh[] = [];
  private reduced = false;
  private clock = 0;

  constructor() {
    const geo = clingerGeometry();
    const max = Math.min(JUMPER_TUNING.maxClinging, ANCHORS.length);
    for (let i = 0; i < max; i += 1) {
      const mesh = new THREE.Mesh(geo, propMaterial);
      const a = ANCHORS[i];
      mesh.position.set(a.x, a.y, a.z);
      // Claw toward the windshield (the geometry reaches +z; the hood faces +z, so a
      // slot near the nose pitches its grip back over the cowl) with a little splay.
      mesh.rotation.y = (i === 1 ? -1 : i === 2 ? 1 : 0) * 0.4;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.root.add(mesh);
      this.slots.push(mesh);
    }
  }

  /** Parent the clingers onto the hero car group (re-call after a chassis/paint swap). */
  attach(carGroup: THREE.Object3D): void {
    carGroup.add(this.root);
  }

  /** Keep the shared clinger meshes out of a car subtree that is about to be disposed. */
  detach(): void {
    this.root.removeFromParent();
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  update(clinging: number, dt: number): void {
    this.clock += dt;
    for (let i = 0; i < this.slots.length; i += 1) {
      const mesh = this.slots[i];
      const on = i < clinging;
      mesh.visible = on;
      if (!on) continue;
      const a = ANCHORS[i];
      if (this.reduced) {
        mesh.position.set(a.x, a.y, a.z);
        continue;
      }
      // A frantic grip-wrench: a fast bob and roll, offset per slot so two passengers
      // do not thrash in lockstep.
      const t = this.clock * 9 + i * 2.1;
      mesh.position.set(a.x, a.y + Math.sin(t) * 0.05, a.z + Math.cos(t * 0.7) * 0.03);
      mesh.rotation.z = Math.sin(t * 1.3) * 0.18;
    }
  }
}
