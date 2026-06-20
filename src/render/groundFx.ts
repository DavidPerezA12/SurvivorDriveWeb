import * as THREE from 'three';

/**
 * Ground feedback the car casts onto the road: a soft contact shadow and a
 * landing dust ring. Both are "juice as information" (docs/DESIGN.md → Juice) —
 * the shadow shrinks and fades as the car rises, giving the jump a readable
 * height reference, and the dust marks the touchdown even with sound off.
 *
 * Two reused meshes, unlit and depth-write-off so they never z-fight the road;
 * the dust costs a draw call only while it is fading.
 */
export class GroundFx {
  private readonly shadow: THREE.Mesh;
  private readonly dust: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly dustMat: THREE.MeshBasicMaterial;

  private dustAge = 0;
  private dustLife = 0;
  private dustPeak = 0;

  constructor(scene: THREE.Scene) {
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    scene.add(this.shadow);

    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0xcdbb95,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.dust = new THREE.Mesh(new THREE.RingGeometry(0.35, 1, 24), this.dustMat);
    this.dust.rotation.x = -Math.PI / 2;
    this.dust.position.y = 0.03;
    this.dust.visible = false;
    scene.add(this.dust);
  }

  /** Kick off a landing dust ring; `intensity` 0..1 scales size and opacity. */
  burst(intensity: number, x: number): void {
    this.dustAge = 0;
    this.dustLife = 0.45;
    this.dustPeak = intensity;
    this.dust.position.x = x;
    this.dust.visible = true;
  }

  update(carX: number, carHeight: number, dt: number): void {
    // Contact shadow: directly under the car, smaller and fainter as it lifts.
    const lift = Math.min(carHeight * 0.18, 0.7);
    this.shadow.position.x = carX;
    this.shadow.scale.setScalar(1 - lift);
    this.shadowMat.opacity = 0.5 * (1 - lift);

    if (!this.dust.visible) return;
    this.dustAge += dt;
    const t = this.dustAge / this.dustLife;
    if (t >= 1) {
      this.dust.visible = false;
      this.dustMat.opacity = 0;
      return;
    }
    this.dust.scale.setScalar(0.6 + t * 2.4);
    this.dustMat.opacity = this.dustPeak * 0.7 * (1 - t);
  }
}
