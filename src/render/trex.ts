import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ReadonlyState } from '../sim';
import { box, lightMaterial, paint, propMaterial } from './materials';
import { palette } from './palette';
import { METEOR_TUNING } from '../content/tuning';
import type { Elevation } from './elevation';

const MAX_FEET = 16;
/** Resting height of the foot once it has slammed down — pressed into its print. */
const FOOT_REST_Y = 0.15;

/** A clawed three-toed T-Rex foot, authored to the interactive-object craft bar. */
function footGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts: THREE.BufferGeometry[] = [
    // The descending leg column, rising out of frame toward the body overhead —
    // what falls on the lane is a LEG, not a floating boot.
    box(1.05, 4.5, 1.15, p.trexSkinDark, 0.4).translate(0, 3.2, -0.5),
    // The ankle haunch flexing forward over the sole.
    paint(new THREE.BoxGeometry(1.25, 1.5, 1.4).rotateX(0.15).translate(0, 1.3, -0.3), p.trexSkin, 0.4),
    // Scale plates ridging the shin front, proud of the hide.
    box(0.32, 0.5, 0.2, p.trexSkin, 0.3).translate(0, 2.3, 0.14),
    box(0.28, 0.45, 0.2, p.trexSkin, 0.3).translate(0.06, 3.1, 0.14),
    box(0.26, 0.4, 0.2, p.trexSkin, 0.3).translate(-0.07, 3.9, 0.14),
    // The broad sole and the dew claw hooked off the heel.
    box(1.5, 0.5, 2.0, p.trexSkin, 0.4).translate(0, 0.26, 0.2),
    paint(new THREE.BoxGeometry(0.24, 0.32, 0.44).rotateX(-0.5).translate(0, 0.34, -0.92), p.trexClaw, 0.25),
  ];
  // Three splayed toes: knuckle bulge, toe, and a big claw angled into the ground.
  for (const tx of [-0.55, 0, 0.55]) {
    parts.push(box(0.44, 0.5, 0.42, p.trexSkin, 0.32).translate(tx, 0.32, 0.58));
    parts.push(box(0.4, 0.4, 1.0, p.trexSkinDark, 0.35).translate(tx, 0.2, 0.92));
    parts.push(box(0.26, 0.26, 0.52, p.trexClaw, 0.2).rotateX(0.45).translate(tx, 0.1, 1.5));
  }
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge T-Rex foot geometry');
  return geo;
}

/** A flat disc lying on the road (faces up after the rotate), for the footprint. */
function disc(radius: number, color: number): THREE.BufferGeometry {
  return paint(new THREE.CircleGeometry(radius, 14), color, 0).rotateX(-Math.PI / 2);
}

/** The pressed footprint: the main pad plus three toe prints, so the crater the
 *  foot leaves matches the foot that made it. */
function printGeometry(): THREE.BufferGeometry {
  const parts = [
    disc(1.3, palette.footprint),
    disc(0.42, palette.footprint).translate(-0.62, 0.001, 1.35),
    disc(0.46, palette.footprint).translate(0, 0.001, 1.5),
    disc(0.42, palette.footprint).translate(0.62, 0.001, 1.35),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge footprint geometry');
  return geo;
}

/**
 * Renders the sim's T-Rex stomps, instanced and allocation-free. A stomp shares the
 * meteor's fall→land pipeline (`Hazard.kind === 'stomp'`, `landed`): while it falls
 * the clawed foot descends in its target lane from the spawn horizon (the telegraph,
 * ~2.5 s), a growing shadow under it marking the lane; once the sim lands it the foot
 * presses into a lethal footprint crater. The impact burst is the shared `exploded`
 * fireball the view already handles, so this field is pure read-only placement.
 */
export class StompField {
  private readonly foot: THREE.InstancedMesh;
  private readonly print: THREE.InstancedMesh;
  private readonly shadow: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.foot = new THREE.InstancedMesh(footGeometry(), propMaterial, MAX_FEET);
    this.print = new THREE.InstancedMesh(printGeometry(), propMaterial, MAX_FEET);
    this.shadow = new THREE.InstancedMesh(disc(1.15, palette.meteorShadow), propMaterial, MAX_FEET);
    for (const mesh of [this.print, this.shadow, this.foot]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }
  }

  update(state: ReadonlyState, elevation: Elevation, renderDistance = state.distance): void {
    const t = METEOR_TUNING;
    let feet = 0;
    let prints = 0;
    let shadows = 0;
    for (const h of state.hazards) {
      if (h.kind !== 'stomp') continue;
      const screenZ = renderDistance - h.forward;
      const ground = elevation.yAt(h.forward, renderDistance);
      if (h.landed) {
        if (prints < MAX_FEET) {
          this.place(this.print, prints, h.x, ground + 0.02, screenZ, 1, 0);
          prints += 1;
        }
        // A shielded car survives a stomp (`applyCrash` is absorbed) and drives on;
        // the pressed footprint stays as road scarring, but the 4.5 m leg column
        // must stop drawing or the surviving car (and the chase camera behind it)
        // ploughs straight through it, engulfing the view. On a fatal stomp `dead`
        // is set the same tick, so the death freeze-frame keeps the leg on screen.
        if (feet < MAX_FEET && !(h.hit && !state.dead)) {
          this.place(this.foot, feet, h.x, ground + FOOT_REST_Y, screenZ, 1, 0);
          feet += 1;
        }
        continue;
      }
      // Falling: the foot descends in its lane as the gap closes (the telegraph), and
      // a shadow on the ground grows toward full as it nears — read the doomed lane.
      const gap = h.forward - renderDistance;
      let p = (t.telegraphGap - gap) / (t.telegraphGap - t.impactGap);
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      const y = ground + FOOT_REST_Y + t.fallHeight * (1 - p);
      if (feet < MAX_FEET) {
        this.place(this.foot, feet, h.x, y, screenZ, 1, 0);
        feet += 1;
      }
      if (shadows < MAX_FEET) {
        this.place(this.shadow, shadows, h.x, ground + 0.03, screenZ, 0.4 + p * 0.6, 0);
        shadows += 1;
      }
    }
    this.foot.count = feet;
    this.print.count = prints;
    this.shadow.count = shadows;
    this.foot.instanceMatrix.needsUpdate = true;
    this.print.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
  }

  private place(
    mesh: THREE.InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    scale: number,
    spin: number,
  ): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, spin, 0);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(i, this.dummy.matrix);
  }
}

/** The looming T-Rex body silhouette — the head/neck/torso/tail/legs/tiny arms. */
function trexBodyGeometry(): THREE.BufferGeometry {
  const p = palette;
  const bone = palette.zombieBone;
  const parts: THREE.BufferGeometry[] = [
    // Torso and the paler belly.
    box(2.4, 2.6, 4.0, p.trexSkinDark, 0.3).translate(0, 4.6, 0),
    box(2.0, 1.1, 3.4, p.trexBelly, 0.3).translate(0, 3.7, 0.1),
    // Old battle scars proud of the hide on both flanks.
    box(0.16, 0.9, 1.4, p.trexSkin, 0.25).translate(1.24, 4.9, -0.6),
    box(0.16, 0.7, 1.0, p.trexSkin, 0.25).translate(-1.24, 4.5, 0.8),
    // S-neck up to the head, the pale throat slung under it.
    box(1.3, 1.6, 1.4, p.trexSkinDark, 0.3).rotateX(-0.5).translate(0, 6.0, 2.0),
    box(0.9, 0.9, 1.0, p.trexBelly, 0.25).rotateX(-0.5).translate(0, 5.45, 2.25),
    // Skull: cranium, heavy brow ridges over the eyes, the nostril bump.
    box(1.5, 1.4, 2.4, p.trexSkin, 0.3).translate(0, 6.7, 3.4),
    box(0.5, 0.28, 0.7, p.trexSkinDark, 0.2).translate(0.56, 7.46, 3.95),
    box(0.5, 0.28, 0.7, p.trexSkinDark, 0.2).translate(-0.56, 7.46, 3.95),
    box(0.5, 0.24, 0.5, p.trexSkinDark, 0.2).translate(0, 7.35, 4.5),
    // Jaw and the red maw between the toothed lips.
    box(1.35, 0.5, 2.0, p.trexSkinDark, 0.25).translate(0, 6.1, 3.6),
    box(1.0, 0.5, 1.6, p.trexMaw, 0.2).translate(0, 6.4, 3.7),
    // Long counterbalancing tail, tapering back to a whip tip.
    box(1.6, 1.7, 2.4, p.trexSkinDark, 0.3).translate(0, 4.4, -3.0),
    box(1.1, 1.2, 2.4, p.trexSkinDark, 0.3).rotateX(0.12).translate(0, 4.0, -5.0),
    box(0.6, 0.7, 2.2, p.trexSkinDark, 0.3).rotateX(0.22).translate(0, 3.6, -6.8),
    box(0.32, 0.4, 1.6, p.trexSkinDark, 0.28).rotateX(0.3).translate(0, 3.2, -8.3),
    // Legs in real segments: heavy haunch, shin, and a clawed three-toed foot.
    box(1.25, 2.0, 1.9, p.trexSkin, 0.3).translate(0.85, 3.1, 0.2),
    box(1.25, 2.0, 1.9, p.trexSkin, 0.3).translate(-0.85, 3.1, 0.2),
    box(0.75, 1.7, 0.95, p.trexSkin, 0.28).rotateX(0.12).translate(0.85, 1.4, 0.35),
    box(0.75, 1.7, 0.95, p.trexSkin, 0.28).rotateX(0.12).translate(-0.85, 1.4, 0.35),
    box(1.05, 0.5, 1.7, p.trexSkinDark, 0.3).translate(0.85, 0.25, 0.75),
    box(1.05, 0.5, 1.7, p.trexSkinDark, 0.3).translate(-0.85, 0.25, 0.75),
    // The tiny arms, tipped with claws.
    box(0.3, 1.1, 0.3, p.trexSkinDark, 0.2).rotateX(0.6).translate(0.7, 4.4, 1.9),
    box(0.3, 1.1, 0.3, p.trexSkinDark, 0.2).rotateX(0.6).translate(-0.7, 4.4, 1.9),
    box(0.12, 0.3, 0.12, p.trexClaw, 0.2).rotateX(0.6).translate(0.7, 3.95, 2.25),
    box(0.12, 0.3, 0.12, p.trexClaw, 0.2).rotateX(0.6).translate(-0.7, 3.95, 2.25),
  ];
  // Teeth hanging below the lip line on both sides (proud of the jaw flank, so
  // they read in the beast's side-on profile) and a front row over the snout tip.
  for (let i = 0; i < 4; i += 1) {
    const z = 2.9 + i * 0.42;
    parts.push(box(0.1, 0.26, 0.1, bone, 0.15).translate(0.72, 5.92, z));
    parts.push(box(0.1, 0.26, 0.1, bone, 0.15).translate(-0.72, 5.92, z));
  }
  parts.push(box(0.1, 0.26, 0.1, bone, 0.15).translate(-0.3, 6.28, 4.66));
  parts.push(box(0.1, 0.26, 0.1, bone, 0.15).translate(0, 6.26, 4.68));
  parts.push(box(0.1, 0.26, 0.1, bone, 0.15).translate(0.3, 6.28, 4.66));
  // A ridge of dorsal plates running the spine down the tail.
  for (const [pz, py, s] of [
    [1.2, 6.0, 0.5],
    [0.1, 6.05, 0.6],
    [-1.1, 5.95, 0.55],
    [-2.6, 5.4, 0.45],
    [-4.4, 4.7, 0.38],
    [-6.2, 4.05, 0.3],
  ] as const) {
    parts.push(box(0.18, s, s * 0.9, p.trexSkin, 0.22).rotateX(0.2).translate(0, py, pz));
  }
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge T-Rex body geometry');
  return geo;
}

/**
 * The T-Rex spectacle: a giant body that looms in off to one side and paces the car
 * while it is rampaging (docs/DESIGN.md → spectacle lives in the background, the road
 * stays legible). It only appears when the sim has live `stomp` hazards (the rampage),
 * rears up out of the fog on the side the next stomp is coming from, and bobs in a
 * heavy gait. Pure read-only: it reads the live hazards, never writes back. Render-only
 * motion (the bob) honors reduced motion by stilling.
 */
export class TrexSilhouette {
  private readonly group = new THREE.Group();
  private gait = 0;
  private reduced = false;
  private shown = false;

  constructor(scene: THREE.Scene) {
    const body = new THREE.Mesh(trexBodyGeometry(), propMaterial);
    const eyes = new THREE.Mesh(
      mergeGeometries(
        [
          box(0.26, 0.26, 0.26, palette.trexEye, 0).translate(0.5, 6.9, 4.2),
          box(0.26, 0.26, 0.26, palette.trexEye, 0).translate(-0.5, 6.9, 4.2),
        ],
        false,
      ) ?? new THREE.BufferGeometry(),
      lightMaterial,
    );
    this.group.add(body, eyes);
    this.group.visible = false;
    this.group.frustumCulled = false;
    scene.add(this.group);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  update(
    state: ReadonlyState,
    dt: number,
    elevation: Elevation,
    renderDistance = state.distance,
  ): void {
    // Active while the rampage has live stomps; pick the side and the forward point
    // from the nearest one so the beast looms where the next slam lands.
    let active = false;
    let side = -1;
    let nearestForward = renderDistance + 40;
    let nearestGap = Infinity;
    for (const h of state.hazards) {
      if (h.kind !== 'stomp') continue;
      active = true;
      const gap = Math.abs(h.forward - renderDistance);
      if (gap < nearestGap) {
        nearestGap = gap;
        side = h.x >= 0 ? 1 : -1;
        nearestForward = h.forward;
      }
    }

    if (!active) {
      if (this.shown) {
        this.group.visible = false;
        this.shown = false;
      }
      return;
    }

    this.shown = true;
    this.group.visible = true;
    this.gait += this.reduced ? 0 : dt * 6;

    // Off the shoulder on the slam side, a touch ahead of the car, riding the ground.
    const z = renderDistance - (nearestForward + 6);
    const ground = elevation.yAt(nearestForward + 6, renderDistance);
    const bob = this.reduced ? 0 : Math.sin(this.gait) * 0.6;
    // Close enough to the shoulder that the beast and its foot-slams read as one
    // hunter, not a backdrop plus some craters.
    this.group.position.set(side * 11.5, ground - 0.5 + bob, z);
    // Face across the road, leaning toward the car; a slight sway in the gait.
    this.group.rotation.y = side > 0 ? -Math.PI / 2 - 0.3 : Math.PI / 2 + 0.3;
    this.group.rotation.z = this.reduced ? 0 : Math.sin(this.gait * 0.5) * 0.04;
  }
}
