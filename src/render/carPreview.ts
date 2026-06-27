import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildUpgradeLayer } from './car';
import { createChassis } from './chassis';
import { box, paint, propMaterial } from './materials';
import { prefersReducedMotion } from './mowFx';
import type { UpgradeId } from '../content/upgrades';
import type { ChassisId } from '../content/chassis';

/**
 * A small, self-contained 3D turntable of the hero car for the garage screen
 * (docs/DESIGN.md → Upgrades render on the car model: "the garage build is
 * visually legible at a glance"). It owns its own canvas, renderer, scene, and
 * lights — independent of the gameplay stage — and only renders while the garage
 * is open, so it costs nothing during a run.
 *
 * It shows the same authored chassis and upgrade bolt-ons the run uses
 * (`createChassis` + `buildUpgradeLayer`), so what you preview is exactly what you
 * drive. Slowly rotating, it reveals the plating, gun, tank, and stance from
 * every side; reduced motion holds it at a flattering three-quarter angle.
 */
export class CarPreview {
  /** The canvas the app mounts into the garage panel. */
  readonly element: HTMLCanvasElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly turntable: THREE.Group;
  private car: THREE.Group;
  private upgradeMesh: THREE.Mesh | null = null;
  private chassisId: ChassisId = 'survivor';
  private paintColor: number | undefined = undefined;
  private owned: ReadonlySet<UpgradeId> = new Set();
  private readonly reduced: boolean;

  private spin = -0.7; // start at a three-quarter angle so the gun + flank read
  private raf = 0;
  private running = false;
  private lastT = 0;

  constructor(width = 720, height = 380) {
    this.reduced = prefersReducedMotion();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0); // transparent — the garage room shows through
    this.element = this.renderer.domElement;
    this.element.style.cssText = 'width:100%;height:100%;display:block';

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 100);
    this.camera.position.set(4.2, 2.1, 5.6);
    this.camera.lookAt(0, 0.65, -0.4);

    // Flat-shaded Lambert bodies need a light; a warm key plus a cool fill keeps
    // the low-poly forms legible without flattening them. A warm worklight pools
    // on the car so it reads as parked under a garage lamp.
    const hemi = new THREE.HemisphereLight(0xb4c0d0, 0x161a22, 1.0);
    const key = new THREE.DirectionalLight(0xf4f2ec, 1.45);
    key.position.set(4, 6, 4);
    const rim = new THREE.DirectionalLight(0x9fb8d0, 0.6);
    rim.position.set(-5, 3, -3);
    const lamp = new THREE.PointLight(0xffe0b0, 0.85, 16, 1.6);
    lamp.position.set(0, 4.2, 1.5);
    this.scene.add(hemi, key, rim, lamp);

    this.buildRoom();

    // The turntable spins; the car (built nose-forward, baked to face −z) rides it.
    this.turntable = new THREE.Group();
    this.car = createChassis(this.chassisId);
    this.turntable.add(this.car);
    this.turntable.rotation.y = this.spin;
    this.scene.add(this.turntable);
  }

  /**
   * A low-poly garage room behind the car — worn concrete floor, back and side
   * walls under a warm worklight, with rusty barrels and crates stacked against
   * the wall. Static (it does not ride the turntable), built once, two draw
   * calls. It grounds the car so the build reads as parked in a real shop, not
   * floating in the void (docs/DESIGN.md → Object craft).
   */
  private buildRoom(): void {
    const structure = [
      // Worn concrete slab, with a lighter worklight pool baked under the car.
      box(26, 0.2, 22, 0x33383f, 0.25).translate(0, -0.1, -4),
      box(9, 0.04, 8, 0x424852, 0.18).translate(0, 0.01, 0.4),
      // Back wall + a darker base course, a beam accent up high for depth.
      box(22, 8, 0.4, 0x3c424b, 0.5).translate(0, 3.4, -7),
      box(22, 1.0, 0.5, 0x2a2f36, 0.5).translate(0, 0.5, -6.95),
      box(22, 0.3, 0.6, 0x515a66, 0.4).translate(0, 5.4, -6.8),
      // Side walls receding toward the camera.
      box(0.4, 8, 22, 0x2c313a, 0.55).translate(-10, 3.4, -4),
      box(0.4, 8, 22, 0x2c313a, 0.55).translate(10, 3.4, -4),
    ];
    const room = mergeGeometries(structure, false);
    for (const p of structure) p.dispose();
    if (room) this.scene.add(new THREE.Mesh(room, propMaterial));

    // Apocalypse-garage junk: rusty oil drums and a crate stack by the wall.
    const props: THREE.BufferGeometry[] = [];
    const barrel = (x: number, z: number): void => {
      props.push(paint(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 10).translate(x, 0.6, z), 0x6a3324, 0.5));
      for (const y of [0.34, 0.86]) {
        props.push(paint(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 10).translate(x, y, z), 0x36190f, 0.5));
      }
    };
    barrel(-7.6, -5.6);
    barrel(-6.4, -5.9);
    barrel(7.7, -5.7);
    props.push(box(1.4, 1.3, 1.4, 0x5a4632, 0.5).translate(7.3, 0.65, -4.6));
    props.push(box(1.0, 0.9, 1.0, 0x4d3b29, 0.5).translate(6.5, 1.75, -4.7));
    const junk = mergeGeometries(props, false);
    for (const p of props) p.dispose();
    if (junk) this.scene.add(new THREE.Mesh(junk, propMaterial));
  }

  /** Match the renderer + camera to the slot the canvas fills (called on open). */
  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.running) this.renderOnce();
  }

  /** Re-dress the previewed car for the owned upgrades (called on open and buy). */
  setLoadout(owned: ReadonlySet<UpgradeId>): void {
    this.owned = owned;
    this.dressCar();
  }

  /** Swap the previewed chassis, keeping the current bolt-on upgrades dressed on it. */
  setChassis(id: ChassisId): void {
    if (id === this.chassisId) return;
    this.chassisId = id;
    this.rebuildCar();
  }

  /** Repaint the previewed body for the COLOR tab (`undefined` = factory). */
  setPaint(bodyColor: number | undefined): void {
    if (bodyColor === this.paintColor) return;
    this.paintColor = bodyColor;
    this.rebuildCar();
  }

  /** Rebuild the previewed body for the current chassis + paint, re-dressing upgrades. */
  private rebuildCar(): void {
    this.turntable.remove(this.car);
    disposeGroup(this.car);
    this.upgradeMesh = null; // disposed with the old car
    this.car = createChassis(this.chassisId, this.paintColor);
    this.turntable.add(this.car);
    this.dressCar();
  }

  /** Rebuild the bolt-on upgrade layer on the current car from the owned set. */
  private dressCar(): void {
    if (this.upgradeMesh) {
      this.car.remove(this.upgradeMesh);
      this.upgradeMesh.geometry.dispose();
      this.upgradeMesh = null;
    }
    const mesh = buildUpgradeLayer(this.owned, this.chassisId);
    if (mesh) {
      this.upgradeMesh = mesh;
      this.car.add(mesh);
    }
    if (!this.running) this.renderOnce(); // refresh even while parked
  }

  /** Begin the turntable loop. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Stop the loop — the garage is closed, so it must cost nothing. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min((now - this.lastT) / 1000, 0.1);
    this.lastT = now;
    if (!this.reduced) {
      this.spin += dt * 0.45;
      this.turntable.rotation.y = this.spin;
    }
    this.renderer.render(this.scene, this.camera);
    if (this.running) this.raf = requestAnimationFrame(this.frame);
  };

  private renderOnce(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

/** Dispose every mesh geometry under a group before discarding it (no GPU leak). */
function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose();
  });
}
