import * as THREE from 'three';
import { box } from './materials';
import { palette } from './palette';
import { ParticlePool, prefersReducedMotion } from './mowFx';
import type { Elevation } from './elevation';

/**
 * Explosive-barrel feedback (docs/DESIGN.md → Juice: every effect reads as
 * information, legible with sound off). A detonation throws a near-white core
 * flash, a warm fireball that lifts and spreads, and dark smoke that rises after
 * it — the "danger cleared" read for the lanes the blast just swept. Three pooled
 * instanced meshes, allocation-free, honoring reduced motion. Each burst is
 * anchored to the barrel's absolute world-forward, so it scrolls with the road
 * exactly like the kill effects.
 */
export class ExplosionFx {
  private readonly core: ParticlePool;
  private readonly fire: ParticlePool;
  private readonly smoke: ParticlePool;

  constructor(scene: THREE.Scene) {
    const reduced = prefersReducedMotion();
    // The instant flash — big, bright, gone fast.
    this.core = new ParticlePool(
      scene,
      box(0.9, 0.9, 0.9, palette.blastCore, 0.04),
      { count: 24, perBurst: 3, life: 0.16, gravity: 0, vyMin: 0.5, vyMax: 1.5, spread: 3, spin: 6, scale: 2.4 },
      reduced,
    );
    // The fireball — lifts and billows out (negative gravity = it rises).
    this.fire = new ParticlePool(
      scene,
      box(0.55, 0.55, 0.55, palette.blastFire, 0.1),
      { count: 72, perBurst: 10, life: 0.42, gravity: -4, vyMin: 2, vyMax: 5, spread: 8, spin: 11, scale: 1.7 },
      reduced,
    );
    // Smoke — darker, slower, lingers as the fire dies.
    this.smoke = new ParticlePool(
      scene,
      box(0.65, 0.65, 0.65, palette.blastSmoke, 0.16),
      { count: 48, perBurst: 6, life: 0.75, gravity: -2, vyMin: 1.4, vyMax: 3.4, spread: 6, spin: 5, scale: 1.9 },
      reduced,
    );
  }

  /** Fire a detonation at lateral `x`, world `forward` (the barrel's position). */
  burst(x: number, forward: number): void {
    this.core.spawn(x, forward);
    this.fire.spawn(x, forward);
    this.smoke.spawn(x, forward);
  }

  update(distance: number, dt: number, elevation: Elevation): void {
    // Bursts can fire far ahead (a shot barrel, a meteor) where the road has
    // climbed, so lift the fireball onto the profile.
    this.core.update(distance, dt, elevation);
    this.fire.update(distance, dt, elevation);
    this.smoke.update(distance, dt, elevation);
  }
}
