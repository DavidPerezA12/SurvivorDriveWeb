import * as THREE from 'three';
import { palette } from './palette';

/**
 * The active shield bubble: a translucent pale-ice shell parented onto the hero
 * car while `car.shieldTicks > 0` (docs/DESIGN.md → power-ups; the blindfold
 * test: you must feel the grab instantly). Additive and depth-write-free so it
 * reads as light wrapped around the car, never a solid egg that hides it. It
 * pulses gently while healthy and blinks through its last second — the sound-off
 * "about to lose it" telegraph. Under reduced motion it neither pulses nor
 * blinks; it dims steadily instead. One mesh, render-only.
 */
export class ShieldBubble {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private reduced = false;
  private clock = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: palette.shieldGlow,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const geo = new THREE.SphereGeometry(1.9, 14, 10);
    this.mesh = new THREE.Mesh(geo, this.material);
    // Hug the car's proportions: wider than tall, stretched along its length.
    this.mesh.scale.set(1.0, 0.72, 1.5);
    this.mesh.position.set(0, 0.7, 0);
    this.mesh.visible = false;
    this.mesh.renderOrder = 2; // after the car, so the additive shell tints it
  }

  /** Parent the bubble onto the (possibly rebuilt) hero car group. */
  attach(car: THREE.Object3D): void {
    car.add(this.mesh);
  }

  detach(): void {
    this.mesh.removeFromParent();
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** Drive visibility and the pulse/expiry read from the sim's tick counter. */
  update(shieldTicks: number, dt: number): void {
    const on = shieldTicks > 0;
    this.mesh.visible = on;
    if (!on) return;
    this.clock += dt;
    const expiring = shieldTicks < 60; // the last second
    if (this.reduced) {
      this.material.opacity = expiring ? 0.09 : 0.16;
      return;
    }
    if (expiring) {
      // Blink hard through the final second so the loss never surprises.
      this.material.opacity = Math.sin(this.clock * 26) > 0 ? 0.2 : 0.05;
    } else {
      this.material.opacity = 0.15 + Math.sin(this.clock * 5) * 0.035;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
