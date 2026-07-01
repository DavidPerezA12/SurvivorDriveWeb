import * as THREE from 'three';
import { LOOKAHEAD } from '../content/tuning';

const BASE_FOV = 50;

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Chase camera: a damped spring that trails the car, lifts on a jump, and
 * widens its FOV with speed. The shake and FOV-punch channels are wired now
 * (with a trauma-decay model, clamped) so M2/M3 juice has somewhere to land;
 * M1 only uses a whisper of trauma on a hard landing.
 *
 * Every motion effect honors reduced motion (docs/DESIGN.md → Juice): with it
 * on, shake and FOV punch are zeroed and only the steady follow remains. The
 * resolved preference and the shake scale are driven by player settings via
 * `setMotion` (the app resolves the OS `prefers-reduced-motion` default).
 */
export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  private trauma = 0;
  private fovPunch = 0;
  private smoothedX = 0;
  private reduced = false;
  /** Player shake dial, 0..1; multiplies trauma-driven shake only. */
  private shakeScale = 1;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      BASE_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      LOOKAHEAD * 1.2,
    );
  }

  /** Add screenshake energy, 0..1. Squared on use, so small values stay subtle. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Briefly widen the FOV (e.g. on a jump launch). Decays on its own. */
  punchFov(degrees: number): void {
    this.fovPunch += degrees;
  }

  /** Apply motion settings: reduced-motion gate and the 0..1 shake scale. */
  setMotion(reduced: boolean, shake: number): void {
    this.reduced = reduced;
    this.shakeScale = Math.min(1, Math.max(0, shake));
  }

  /**
   * The run-opening cinematic (The Last Driver style). Two beats:
   *
   * - `dolly` 0→1 runs through the hold: a low shot planted in front of the car
   *   looking back at the hood, easing *backward* away from it so the car reads as
   *   already rolling toward camera (the road is streamed behind the car for this,
   *   see `RoadField.update`).
   * - `settle` 0→1 runs through the sweep: the camera orbits up and around the car's
   *   right side to the normal chase pose and hands off to `update` seamlessly. The
   *   side bulge keeps the arc clear of the car instead of cutting through it.
   *
   * At `settle` 1 the pose equals the chase pose exactly (smoothed-X seeded), so the
   * first gameplay frame does not jump. FOV neutral, no shake: it is a cinematic.
   */
  frameIntro(carX: number, dolly: number, settle: number): void {
    this.smoothedX = carX * 0.5;
    const s = settle * settle * (3 - 2 * settle);

    // Hero beat: in front of the hood (negative z), low, dollying back through the hold.
    const heroY = 1.35;
    const heroZ = lerp(-5, -8.5, dolly);
    // Orbit the right flank to the chase pose; the bulge peaks mid-arc, zero at both
    // ends so the sweep starts on the hood and lands exactly on the chase pose.
    const bulge = Math.sin(Math.PI * s) * 5;
    this.camera.position.set(
      lerp(carX, this.smoothedX, s) + bulge,
      lerp(heroY, 3.8, s),
      lerp(heroZ, 8, s),
    );
    this.camera.lookAt(
      lerp(carX, this.smoothedX * 0.7, s),
      lerp(1.05, 0.8, s),
      lerp(3, -14, s),
    );

    this.camera.fov = damp(this.camera.fov, BASE_FOV, 10, 1 / 60);
    this.camera.updateProjectionMatrix();
  }

  update(carX: number, carHeight: number, speed: number, dt: number): void {
    this.smoothedX = damp(this.smoothedX, carX * 0.5, 6, dt);

    let px = this.smoothedX;
    let py = 3.8 + carHeight * 0.28;
    const pz = 8;

    if (!this.reduced && this.trauma > 0) {
      const shake = this.trauma * this.trauma * this.shakeScale;
      px += (Math.random() * 2 - 1) * shake * 0.5;
      py += (Math.random() * 2 - 1) * shake * 0.35;
      this.trauma = Math.max(0, this.trauma - dt * 1.5);
    }

    this.camera.position.set(px, py, pz);
    this.camera.lookAt(this.smoothedX * 0.7, 0.8 + carHeight * 0.3, -14);

    // FOV: widen subtly with speed, plus any transient punch. Both off under
    // reduced motion. (Speed normalized against a generous top-end.)
    const speedTerm = this.reduced ? 0 : (speed / 66) * 4;
    const punch = this.reduced ? 0 : this.fovPunch;
    this.camera.fov = damp(this.camera.fov, BASE_FOV + speedTerm + punch, 10, dt);
    this.camera.updateProjectionMatrix();
    this.fovPunch *= Math.exp(-8 * dt);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
