import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ReadonlyState } from '../sim';
import { box, lightMaterial, paint, propMaterial } from './materials';
import { palette } from './palette';
import { METEOR_TUNING } from '../content/tuning';
import type { Elevation } from './elevation';

const MAX_SHELLS = 20;
/** Resting height of the shell once it has burst — embedded in its crater. */
const SHELL_REST_Y = 0.3;

/** A finned artillery shell, body + nose, with a glowing hot tip (self-lit, below). */
function shellBodyGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts: THREE.BufferGeometry[] = [
    box(0.4, 0.4, 1.0, p.mechaShell, 0.3), // casing
    box(0.28, 0.28, 0.5, p.mechaShell, 0.25).translate(0, 0, 0.65), // tapered nose
    // Tail fins.
    box(0.62, 0.08, 0.3, p.mechaSteelDark, 0.2).translate(0, 0, -0.45),
    box(0.08, 0.62, 0.3, p.mechaSteelDark, 0.2).translate(0, 0, -0.45),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge shell geometry');
  return geo;
}

/** A flat disc lying on the road (faces up after the rotate), for the crater/shadow. */
function disc(radius: number, color: number): THREE.BufferGeometry {
  return paint(new THREE.CircleGeometry(radius, 14), color, 0).rotateX(-Math.PI / 2);
}

/**
 * Renders the sim's mecha shells, instanced and allocation-free. A shell shares the
 * meteor fall→land pipeline (`Hazard.kind === 'shell'`, `landed`): while it falls the
 * finned round drops nose-down in its target lane from the spawn horizon (the
 * telegraph), a growing shadow marking the doomed lane; once the sim lands it the
 * shell bursts into a lethal crater. The impact burst is the shared `exploded` fireball
 * the view already handles, so this field is pure read-only placement.
 */
export class ShellField {
  private readonly shell: THREE.InstancedMesh;
  private readonly tip: THREE.InstancedMesh;
  private readonly crater: THREE.InstancedMesh;
  private readonly shadow: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.shell = new THREE.InstancedMesh(shellBodyGeometry(), propMaterial, MAX_SHELLS);
    this.tip = new THREE.InstancedMesh(
      box(0.22, 0.22, 0.3, palette.mechaGlow, 0),
      lightMaterial,
      MAX_SHELLS,
    );
    this.crater = new THREE.InstancedMesh(disc(1.2, palette.shellCrater), propMaterial, MAX_SHELLS);
    this.shadow = new THREE.InstancedMesh(
      disc(1.05, palette.meteorShadow),
      propMaterial,
      MAX_SHELLS,
    );
    for (const mesh of [this.crater, this.shadow, this.shell, this.tip]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }
  }

  update(state: ReadonlyState, elevation: Elevation): void {
    const t = METEOR_TUNING;
    let shells = 0;
    let tips = 0;
    let craters = 0;
    let shadows = 0;
    for (const h of state.hazards) {
      if (h.kind !== 'shell') continue;
      const screenZ = state.distance - h.forward;
      const ground = elevation.yAt(h.forward, state.distance);
      if (h.landed) {
        if (craters < MAX_SHELLS) {
          this.placeFlat(this.crater, craters, h.x, ground + 0.02, screenZ, 1);
          craters += 1;
        }
        if (shells < MAX_SHELLS) {
          this.placeShell(shells, h.x, ground + SHELL_REST_Y, screenZ, 1.2);
          shells += 1;
        }
        continue;
      }
      // Falling: the shell drops nose-down as the gap closes (the telegraph), and a
      // shadow on the ground grows toward full as it nears — read the doomed lane.
      const gap = h.forward - state.distance;
      let p = (t.telegraphGap - gap) / (t.telegraphGap - t.impactGap);
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      const y = ground + SHELL_REST_Y + t.fallHeight * (1 - p);
      if (shells < MAX_SHELLS) {
        this.placeShell(shells, h.x, y, screenZ, 0);
        shells += 1;
      }
      if (tips < MAX_SHELLS) {
        this.dummy.position.set(h.x, y - 0.6, screenZ);
        this.dummy.rotation.set(-Math.PI / 2, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.tip.setMatrixAt(tips, this.dummy.matrix);
        tips += 1;
      }
      if (shadows < MAX_SHELLS) {
        this.placeFlat(this.shadow, shadows, h.x, ground + 0.03, screenZ, 0.4 + p * 0.6);
        shadows += 1;
      }
    }
    this.shell.count = shells;
    this.tip.count = tips;
    this.crater.count = craters;
    this.shadow.count = shadows;
    this.shell.instanceMatrix.needsUpdate = true;
    this.tip.instanceMatrix.needsUpdate = true;
    this.crater.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
  }

  /** Place the shell nose-down (rotated so +z body points at the road), `tilt` lean once landed. */
  private placeShell(i: number, x: number, y: number, z: number, tilt: number): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(-Math.PI / 2 + tilt, 0, 0);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    this.shell.setMatrixAt(i, this.dummy.matrix);
  }

  private placeFlat(
    mesh: THREE.InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    scale: number,
  ): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(i, this.dummy.matrix);
  }
}

/** The looming bipedal mecha: torso, visor, two legs, two arm cannons. */
function mechaBodyGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts: THREE.BufferGeometry[] = [
    // Torso block and a chest vent.
    box(3.0, 2.8, 2.0, p.mechaSteelDark, 0.25).translate(0, 5.4, 0),
    box(2.0, 1.2, 0.4, p.mechaSteel, 0.2).translate(0, 5.6, 1.05),
    // Head with a wide visor slit (the glow is a separate self-lit mesh in the class).
    box(1.4, 1.0, 1.2, p.mechaSteel, 0.2).translate(0, 7.2, 0.1),
    // Hip and two heavy legs (thigh + shin) with footpads.
    box(2.4, 1.0, 1.8, p.mechaSteelDark, 0.2).translate(0, 3.9, 0),
    box(1.0, 2.0, 1.1, p.mechaSteel, 0.2).translate(0.9, 2.7, 0),
    box(1.0, 2.0, 1.1, p.mechaSteel, 0.2).translate(-0.9, 2.7, 0),
    box(1.1, 1.8, 1.2, p.mechaSteelDark, 0.2).translate(0.9, 1.0, 0.1),
    box(1.1, 1.8, 1.2, p.mechaSteelDark, 0.2).translate(-0.9, 1.0, 0.1),
    box(1.3, 0.5, 1.7, p.mechaSteel, 0.2).translate(0.9, 0.25, 0.25),
    box(1.3, 0.5, 1.7, p.mechaSteel, 0.2).translate(-0.9, 0.25, 0.25),
    // Shoulder-mounted arm cannons, angled forward.
    box(0.9, 0.9, 2.6, p.mechaSteelDark, 0.2).translate(1.9, 5.7, 0.7),
    box(0.9, 0.9, 2.6, p.mechaSteelDark, 0.2).translate(-1.9, 5.7, 0.7),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge mecha geometry');
  return geo;
}

/** The hot self-lit bits: the visor slit and the two cannon muzzles. */
function mechaGlowGeometry(): THREE.BufferGeometry {
  const c = palette.mechaGlow;
  const parts = [
    box(1.1, 0.28, 0.2, c, 0).translate(0, 7.2, 0.75), // visor
    box(0.5, 0.5, 0.3, c, 0).translate(1.9, 5.7, 2.05), // left muzzle
    box(0.5, 0.5, 0.3, c, 0).translate(-1.9, 5.7, 2.05), // right muzzle
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge mecha glow geometry');
  return geo;
}

/**
 * The mecha spectacle: a giant bipedal war machine that looms in off to one side and
 * paces the car while it is barraging (docs/DESIGN.md → spectacle lives in the
 * background, the road stays legible). It only appears when the sim has live `shell`
 * hazards (the barrage), rears up out of the fog on the side the next volley is coming
 * from, and rocks in a heavy stride. Pure read-only; render-only motion honors reduced
 * motion by stilling.
 */
export class MechaSilhouette {
  private readonly group = new THREE.Group();
  private stride = 0;
  private reduced = false;
  private shown = false;

  constructor(scene: THREE.Scene) {
    const body = new THREE.Mesh(mechaBodyGeometry(), propMaterial);
    const glow = new THREE.Mesh(mechaGlowGeometry(), lightMaterial);
    this.group.add(body, glow);
    this.group.visible = false;
    this.group.frustumCulled = false;
    scene.add(this.group);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  update(state: ReadonlyState, dt: number, elevation: Elevation): void {
    let active = false;
    let side = 1;
    let nearestForward = state.distance + 40;
    let nearestGap = Infinity;
    for (const h of state.hazards) {
      if (h.kind !== 'shell') continue;
      active = true;
      const gap = Math.abs(h.forward - state.distance);
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
    this.stride += this.reduced ? 0 : dt * 4.5;

    const z = state.distance - (nearestForward + 8);
    const ground = elevation.yAt(nearestForward + 8, state.distance);
    const bob = this.reduced ? 0 : Math.abs(Math.sin(this.stride)) * 0.7;
    this.group.position.set(side * 17, ground - 0.5 + bob, z);
    // Face across the road toward the car, with a slow mechanical sway.
    this.group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.group.rotation.z = this.reduced ? 0 : Math.sin(this.stride * 0.5) * 0.03;
  }
}
