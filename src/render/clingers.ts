import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import { JUMPER_TUNING } from '../content/tuning';

/**
 * A jumper riding the car: a zombie sprawled flat, both clawed hands gripping
 * forward, legs trailing back, head wrenched up toward the cabin — the thing
 * crawling up your back window. Reuses the jumper palette (warm = threat) so a
 * passenger reads as the same enemy that leapt. Built reaching toward +z;
 * placement yaws it round to claw up the rear screen. One merged geometry per
 * clinger.
 */
function clingerGeometry(): THREE.BufferGeometry {
  const flesh = palette.jumperFlesh;
  const dark = palette.jumperFleshDark;
  const rag = palette.jumperRag;
  const accent = palette.jumperAccent;

  const parts = [
    // Ragged hips and the flat torso pressed along the hood, the chest wedged up
    // toward the cowl so the whole body reads as climbing, not lying.
    box(0.44, 0.2, 0.4, rag).translate(0, -0.02, -0.3),
    box(0.5, 0.22, 0.56, flesh).translate(0, 0.0, 0.06),
    box(0.46, 0.2, 0.3, flesh).rotateX(-0.25).translate(0, 0.08, 0.32),
    // Shoulder blades jutting through the hide.
    box(0.14, 0.08, 0.18, dark).translate(-0.17, 0.15, 0.26),
    box(0.14, 0.08, 0.18, dark).translate(0.17, 0.15, 0.26),
    // Three hot sinew cords down the taut spine — the jumper's leap telegraph,
    // still burning while it rides.
    box(0.1, 0.1, 0.68, accent).translate(0, 0.12, -0.06),
    box(0.06, 0.08, 0.48, accent).translate(-0.13, 0.1, -0.12),
    box(0.06, 0.08, 0.48, accent).translate(0.13, 0.1, -0.12),
    // Head wrenched up toward the glass: skull, matted scalp, jaw slung open,
    // ragged ears.
    box(0.28, 0.26, 0.26, flesh).rotateX(-0.5).translate(0, 0.16, 0.5),
    box(0.26, 0.08, 0.2, dark).rotateX(-0.5).translate(0, 0.3, 0.42),
    box(0.22, 0.1, 0.18, dark).translate(0, 0.06, 0.64),
    box(0.05, 0.1, 0.05, flesh).rotateX(-0.5).translate(-0.16, 0.28, 0.4),
    box(0.05, 0.1, 0.05, flesh).rotateX(-0.5).translate(0.16, 0.28, 0.4),
    // Arms thrown forward in two bent segments, clawed hands splayed over the
    // cowl, fingers spread for grip.
    box(0.15, 0.14, 0.4, flesh).rotateY(0.18).translate(0.3, 0.03, 0.28),
    box(0.13, 0.12, 0.32, flesh).rotateY(-0.1).translate(0.36, 0.0, 0.6),
    box(0.2, 0.09, 0.14, dark).translate(0.37, -0.01, 0.78),
    box(0.04, 0.05, 0.15, dark).rotateY(0.35).translate(0.29, -0.02, 0.88),
    box(0.04, 0.05, 0.17, dark).translate(0.37, -0.02, 0.9),
    box(0.04, 0.05, 0.15, dark).rotateY(-0.35).translate(0.45, -0.02, 0.88),
    box(0.15, 0.14, 0.4, flesh).rotateY(-0.18).translate(-0.3, 0.03, 0.28),
    box(0.13, 0.12, 0.32, flesh).rotateY(0.1).translate(-0.36, 0.0, 0.6),
    box(0.2, 0.09, 0.14, dark).translate(-0.37, -0.01, 0.78),
    box(0.04, 0.05, 0.15, dark).rotateY(-0.35).translate(-0.29, -0.02, 0.88),
    box(0.04, 0.05, 0.17, dark).translate(-0.37, -0.02, 0.9),
    box(0.04, 0.05, 0.15, dark).rotateY(0.35).translate(-0.45, -0.02, 0.88),
    // Legs trailing back in thigh + shin segments, knees splayed, clawed toes
    // dug into the hood for purchase.
    box(0.17, 0.17, 0.42, rag).rotateY(0.32).translate(0.26, -0.02, -0.5),
    box(0.13, 0.13, 0.34, flesh).rotateY(0.12).translate(0.33, -0.05, -0.76),
    box(0.1, 0.08, 0.12, dark).translate(0.35, -0.07, -0.92),
    box(0.17, 0.17, 0.42, rag).rotateY(-0.32).translate(-0.26, -0.02, -0.5),
    box(0.13, 0.13, 0.34, flesh).rotateY(-0.12).translate(-0.33, -0.05, -0.76),
    box(0.1, 0.08, 0.12, dark).translate(-0.35, -0.07, -0.92),
    // A torn rag flap snapping off the hip in the wind.
    box(0.2, 0.04, 0.28, rag).rotateY(0.45).translate(-0.2, 0.06, -0.44),
  ];
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge clinger geometry');
  return geo;
}

// Fixed local anchor points on the hero car's rear deck, in car-local space. The
// hero car noses toward -z (the chase camera at +z looks down the road at -z), so
// the boot and rear screen are the +z end — the one place a latched passenger is
// actually visible from the chase camera (the roof occludes the whole hood; a
// hood passenger would be invisible, and juice must read as information). The
// old anchors assumed nose-at-+z and accidentally buried the clingers inside the
// greenhouse. One per cling slot; the first grabs the centre of the boot, the
// next two flank it.
const ANCHORS: readonly { x: number; y: number; z: number }[] = [
  { x: 0.0, y: 1.16, z: 1.24 },
  { x: -0.42, y: 1.12, z: 1.32 },
  { x: 0.42, y: 1.12, z: 1.32 },
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
      // The geometry reaches +z; yaw it round so the head and claws reach the
      // cabin (-z) with a little splay per flank slot, then pitch the body onto
      // the rear screen's slope (~0.65 rad): claws land at the roof edge, the
      // torso lies up the glass, and the feet brace on the rear bumper.
      mesh.rotation.y = Math.PI + (i === 1 ? 1 : i === 2 ? -1 : 0) * 0.35;
      mesh.rotation.x = 0.65;
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
