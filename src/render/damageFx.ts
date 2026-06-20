import * as THREE from 'three';
import { box } from './materials';
import { palette } from './palette';
import { ParticlePool, prefersReducedMotion } from './mowFx';

/**
 * Engine smoke that pours from the hull as it fails — the "you're dying" read,
 * legible with sound off (docs/DESIGN.md → Juice as information). The emission
 * rate climbs as the hull empties, so a critical car visibly trails smoke. One
 * pooled instanced mesh, allocation-free, honoring reduced motion. Puffs are
 * anchored to the car's world-forward, so they billow off the nose and recede
 * down the road exactly like every other world-anchored effect.
 */
export class DamageSmoke {
  private readonly smoke: ParticlePool;
  private emit = 0;

  constructor(scene: THREE.Scene) {
    this.smoke = new ParticlePool(
      scene,
      box(0.44, 0.44, 0.44, palette.blastSmoke, 0.14),
      { count: 40, perBurst: 1, life: 0.95, gravity: -1.4, vyMin: 1.2, vyMax: 2.6, spread: 1.8, spin: 3, scale: 1.35 },
      prefersReducedMotion(),
    );
  }

  /**
   * `intensity` is 0..1 (0 = healthy, 1 = near-dead). At full intensity puffs come
   * thick and fast; below it they thin out; at zero the trail stops. `distance` is
   * the car's world-forward and `carX` its lateral position.
   */
  update(distance: number, dt: number, carX: number, intensity: number): void {
    if (intensity > 0) {
      this.emit -= dt;
      const interval = Math.max(0.045, 0.18 - intensity * 0.12);
      // Catch up if several intervals elapsed, without unbounded spawning.
      let guard = 0;
      while (this.emit <= 0 && guard < 4) {
        this.smoke.spawn(carX + (Math.random() - 0.5) * 0.5, distance + 1.5);
        this.emit += interval;
        guard += 1;
      }
    }
    this.smoke.update(distance, dt);
  }
}
