import * as THREE from 'three';
import { buildUpgradeLayer } from './car';
import { createChassis } from './chassis';
import { box, lightMaterial, merged, paint, propMaterial } from './materials';
import { prefersReducedMotion } from './mowFx';
import type { UpgradeId } from '../content/upgrades';
import type { ChassisId } from '../content/chassis';

/** Top surface of the turntable disc — proud of the floor's worklight pool. */
const DISC_TOP = 0.05;

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
  private reduced: boolean;

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

    this.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    this.camera.position.set(4.6, 2.25, 6.1);
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

    // The turntable spins; the car (built nose-forward, baked to face −z) rides
    // it, lifted onto the disc surface.
    this.turntable = new THREE.Group();
    this.turntable.add(this.buildDisc());
    this.car = createChassis(this.chassisId);
    this.car.position.y = DISC_TOP;
    this.turntable.add(this.car);
    this.turntable.rotation.y = this.spin;
    this.scene.add(this.turntable);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  /**
   * A low-poly workshop set around the turntable — worn concrete under a caged
   * worklamp, a dented roller shutter, a workbench with a pegboard tool wall, a
   * rolling tool chest, tire stack, drums, jerry cans, and floor wear (oil
   * stains, tire scuffs, a dusty hazard strip framing the work pool). Static
   * (only the turntable disc spins), built once, merged to three draw calls. It
   * grounds the car so the build reads as parked in a real shop, not floating
   * in the void (docs/DESIGN.md → Object craft: no grey-box stand-ins).
   */
  private buildRoom(): void {
    const parts: THREE.BufferGeometry[] = [];

    // Shell — worn concrete slab, walls with a darker base course, a high beam.
    parts.push(
      box(26, 0.2, 22, 0x33383f, 0.25).translate(0, -0.1, -4),
      box(9, 0.04, 8, 0x424852, 0.18).translate(0, 0.01, 0.4),
      box(22, 8, 0.4, 0x3c424b, 0.5).translate(0, 3.4, -7),
      box(22, 1.0, 0.5, 0x2a2f36, 0.5).translate(0, 0.5, -6.95),
      box(22, 0.3, 0.6, 0x515a66, 0.4).translate(0, 5.4, -6.8),
      box(0.4, 8, 22, 0x2c313a, 0.55).translate(-10, 3.4, -4),
      box(0.4, 8, 22, 0x2c313a, 0.55).translate(10, 3.4, -4),
    );

    // Roller shutter, left of centre — ribbed slats between posts under the
    // housing drum, one slat sitting proud (someone reversed into it long ago).
    const shX = -3.6;
    parts.push(
      box(0.28, 3.9, 0.24, 0x2a2f36, 0.5).translate(shX - 2.2, 1.95, -6.78),
      box(0.28, 3.9, 0.24, 0x2a2f36, 0.5).translate(shX + 2.2, 1.95, -6.78),
      box(4.9, 0.55, 0.45, 0x333942, 0.5).translate(shX, 4.05, -6.72),
    );
    for (let i = 0; i < 9; i += 1) {
      const dent = i === 2 ? 0.09 : 0;
      const tone = i % 2 === 0 ? 0x4a525d : 0x434b55;
      parts.push(box(4.15, 0.4, 0.14, tone, 0.45).translate(shX, 0.24 + 0.42 * i, -6.84 + dent));
    }

    // Workbench under the pegboard: slab top, boxy legs, a lower shelf, a vice,
    // and bench clutter (a toolbox with its handle, parts bins).
    parts.push(
      box(3.4, 0.18, 1.15, 0x5a4632, 0.4).translate(4.6, 0.95, -6.2),
      box(0.18, 0.95, 1.0, 0x3a3f47, 0.5).translate(3.15, 0.48, -6.2),
      box(0.18, 0.95, 1.0, 0x3a3f47, 0.5).translate(6.05, 0.48, -6.2),
      box(3.1, 0.1, 0.9, 0x494f58, 0.5).translate(4.6, 0.35, -6.2),
      box(0.42, 0.3, 0.3, 0x3f454e, 0.4).translate(3.6, 1.19, -6.0),
      box(0.1, 0.42, 0.1, 0x343a42, 0.4).translate(3.6, 1.3, -5.85),
      box(0.85, 0.4, 0.45, 0x6e3a30, 0.45).translate(5.3, 1.24, -6.25),
      box(0.5, 0.06, 0.14, 0x2c3138, 0.4).translate(5.3, 1.47, -6.25),
      box(0.5, 0.22, 0.35, 0x46503c, 0.5).translate(4.35, 1.15, -6.35),
      box(0.4, 0.18, 0.3, 0x3d4652, 0.5).translate(6.0, 1.13, -5.95),
    );

    // Pegboard tool wall: wrench, hammer, and a coiled air hose on hooks.
    parts.push(
      box(3.2, 1.7, 0.08, 0x454d59, 0.45).translate(4.6, 2.6, -6.9),
      box(0.09, 0.62, 0.06, 0x687180, 0.35).translate(3.7, 2.55, -6.84),
      box(0.2, 0.14, 0.06, 0x687180, 0.35).translate(3.7, 2.92, -6.84),
      box(0.08, 0.5, 0.07, 0x5a4632, 0.35).translate(4.25, 2.5, -6.84),
      box(0.3, 0.14, 0.12, 0x3f454e, 0.35).translate(4.25, 2.82, -6.84),
      paint(new THREE.TorusGeometry(0.34, 0.075, 6, 14).translate(5.5, 2.55, -6.8), 0x39424d, 0.35),
    );

    // A rolling tool chest — drawer fronts, handles, casters — dusty oxide red.
    parts.push(box(1.25, 1.35, 0.8, 0x6e3a30, 0.45).translate(-7.4, 0.86, -6.1));
    for (let i = 0; i < 3; i += 1) {
      parts.push(box(1.05, 0.26, 0.06, 0x7c453a, 0.4).translate(-7.4, 0.62 + i * 0.36, -5.66));
      parts.push(box(0.55, 0.06, 0.05, 0x2c3138, 0.4).translate(-7.4, 0.68 + i * 0.36, -5.61));
    }
    parts.push(
      box(0.14, 0.16, 0.14, 0x22262c, 0.5).translate(-7.9, 0.1, -5.85),
      box(0.14, 0.16, 0.14, 0x22262c, 0.5).translate(-6.9, 0.1, -5.85),
    );

    // Bald tires — a stack of three and one leaning against it.
    const tire = (x: number, y: number, z: number): void => {
      parts.push(paint(new THREE.CylinderGeometry(0.56, 0.56, 0.36, 14).translate(x, y, z), 0x22252b, 0.45));
      parts.push(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.38, 10).translate(x, y, z), 0x33383f, 0.3));
    };
    tire(-8.2, 0.18, -3.2);
    tire(-8.2, 0.54, -3.2);
    tire(-8.25, 0.9, -3.15);
    const leanT = (g: THREE.BufferGeometry): THREE.BufferGeometry =>
      g.rotateX(Math.PI / 2).rotateZ(-0.3).translate(-7.35, 0.6, -3.5);
    parts.push(paint(leanT(new THREE.CylinderGeometry(0.56, 0.56, 0.34, 14)), 0x24272d, 0.45));
    parts.push(paint(leanT(new THREE.CylinderGeometry(0.3, 0.3, 0.36, 10)), 0x363b43, 0.3));

    // Apocalypse-garage junk: rusty oil drums, jerry cans, a gas bottle, crates.
    const barrel = (x: number, z: number): void => {
      parts.push(paint(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 10).translate(x, 0.6, z), 0x6a3324, 0.5));
      for (const y of [0.34, 0.86]) {
        parts.push(paint(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 10).translate(x, y, z), 0x36190f, 0.5));
      }
    };
    barrel(-5.3, -6.0);
    barrel(7.7, -5.7);
    parts.push(
      box(0.55, 0.75, 0.3, 0x46503c, 0.45).translate(-6.3, 0.38, -5.9),
      box(0.16, 0.14, 0.16, 0x333a2c, 0.4).translate(-6.42, 0.82, -5.9),
      box(0.55, 0.75, 0.3, 0x424b38, 0.45).translate(-6.15, 0.38, -5.45),
      box(0.16, 0.14, 0.16, 0x333a2c, 0.4).translate(-6.05, 0.82, -5.45),
      paint(new THREE.CylinderGeometry(0.34, 0.34, 1.6, 10).translate(8.6, 0.8, -5.9), 0x7c4526, 0.5),
      paint(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 8).translate(8.6, 1.7, -5.9), 0x39424d, 0.4),
      box(1.4, 1.3, 1.4, 0x5a4632, 0.5).translate(7.3, 0.65, -4.6),
      box(1.0, 0.9, 1.0, 0x4d3b29, 0.5).translate(6.5, 1.75, -4.7),
    );

    // Floor wear: oil stains, twin tire scuffs running in from the shutter, and
    // a worn hazard strip framing the work pool (dusty yellow, decoration-dim).
    const stain = (r: number, x: number, z: number, tone: number, y = 0.02): void => {
      parts.push(paint(new THREE.CircleGeometry(r, 9).rotateX(-Math.PI / 2).translate(x, y, z), tone, 0));
    };
    stain(0.75, -6.7, -4.9, 0x21242a);
    stain(0.4, -6.05, -4.3, 0x24272d);
    stain(0.55, 7.4, -4.9, 0x22252b);
    stain(0.5, 3.4, 2.1, 0x272a31, 0.035); // on the worklight pool, so above it
    parts.push(
      box(0.2, 0.02, 3.6, 0x272b31, 0.1).translate(shX - 0.8, 0.022, -4.9),
      box(0.2, 0.02, 3.6, 0x272b31, 0.1).translate(shX + 0.8, 0.022, -4.9),
    );
    for (let i = 0; i < 10; i += 1) {
      const tone = i % 2 === 0 ? 0x8a7434 : 0x23262b;
      parts.push(box(0.9, 0.024, 0.3, tone, 0.1).translate(-4.05 + i * 0.9, 0.022, 4.35));
      parts.push(box(0.9, 0.024, 0.3, tone, 0.1).translate(-4.05 + i * 0.9, 0.022, -3.55));
    }

    // The caged worklamp the pool comes from: cord, shade cone, and a lit bulb
    // (unlit material so it glows even against the dark wall).
    parts.push(
      box(0.05, 1.7, 0.05, 0x22262c, 0.3).translate(0, 5.15, 1.5),
      paint(new THREE.CylinderGeometry(0.14, 0.52, 0.42, 10).translate(0, 4.3, 1.5), 0x3c443c, 0.5),
    );
    this.scene.add(new THREE.Mesh(merged(parts), propMaterial));
    const bulb = paint(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 4.08, 1.5), 0xffdca6, 0);
    this.scene.add(new THREE.Mesh(bulb, lightMaterial));
  }

  /**
   * The steel turntable disc the car parks on — a shallow platform with a darker
   * rim and a ring of studs, riding `this.turntable` so the spin reads even on a
   * car with no bolt-ons. Its surface sits at `DISC_TOP`, proud of the floor's
   * baked worklight pool, and the car is lifted onto it. One draw call.
   */
  private buildDisc(): THREE.Mesh {
    const parts: THREE.BufferGeometry[] = [
      paint(new THREE.CylinderGeometry(2.8, 2.88, 0.1, 28).translate(0, DISC_TOP - 0.05, 0), 0x454c56, 0.3),
      paint(new THREE.CylinderGeometry(2.96, 3.0, 0.06, 28).translate(0, DISC_TOP - 0.08, 0), 0x2b3037, 0.3),
    ];
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(
        box(0.09, 0.03, 0.09, 0x30353c, 0.2).translate(Math.cos(a) * 2.55, DISC_TOP + 0.005, Math.sin(a) * 2.55),
      );
    }
    return new THREE.Mesh(merged(parts), propMaterial);
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
    this.car.position.y = DISC_TOP;
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
