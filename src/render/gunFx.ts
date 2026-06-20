import * as THREE from 'three';
import { box, propMaterial } from './materials';
import { ParticlePool, prefersReducedMotion } from './mowFx';

/**
 * Gun feedback (docs/DESIGN.md → Juice: "Muzzle flash + tracer to the kill"). Each
 * shot spits a bright flash at the muzzle plus a tracer streaking down-range, so
 * the gun reads clearly with sound off. Both grow with the weapon tier (extra
 * flash bursts, paired tracers for the twin-barrel tiers). Two pooled instanced
 * meshes, allocation-free, honoring reduced motion.
 */
const MUZZLE = 0xffe8b0; // hot near-white flash, pops through the act haze
const TRACER = 0xfff0c8; // a brighter, longer streak down the lane

/**
 * A pool of thin tracer streaks. Each flies straight down-range (forward grows,
 * so it recedes ahead of the car) and fades over a short life. Struct-of-arrays
 * state, recycled round-robin — one draw call, no per-frame allocation.
 */
class TracerPool {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly fwd: Float32Array;
  private readonly x: Float32Array;
  private readonly age: Float32Array;
  private readonly speed: number;
  private cursor = 0;

  constructor(scene: THREE.Scene, color: number, private readonly count: number, private readonly life: number, reduced: boolean) {
    this.speed = reduced ? 55 : 95;
    this.mesh = new THREE.InstancedMesh(box(0.07, 0.07, 2.4, color, 0.05), propMaterial, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.fwd = new Float32Array(count);
    this.x = new Float32Array(count);
    this.age = new Float32Array(count).fill(life);
    this.parkAll();
    scene.add(this.mesh);
  }

  private parkAll(): void {
    this.dummy.position.set(0, -100, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.count; i += 1) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x: number, forward: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.x[i] = x;
    this.fwd[i] = forward;
    this.age[i] = 0;
  }

  update(distance: number, dt: number): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.age[i] >= this.life) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life) {
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      this.fwd[i] += this.speed * dt;
      const fade = 1 - this.age[i] / this.life;
      this.dummy.position.set(this.x[i], 0.72, distance - this.fwd[i]);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(fade, fade, 0.6 + fade * 0.8); // thins and shortens as it fades
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class GunFx {
  private readonly flash: ParticlePool;
  private readonly tracers: TracerPool;

  constructor(scene: THREE.Scene) {
    const reduced = prefersReducedMotion();
    this.flash = new ParticlePool(
      scene,
      box(0.34, 0.34, 0.34, MUZZLE, 0.12),
      { count: 48, perBurst: 7, life: 0.22, gravity: 2, vyMin: 0.4, vyMax: 1.6, spread: 6, spin: 18, scale: 1.5 },
      reduced,
    );
    this.tracers = new TracerPool(scene, TRACER, 24, 0.12, reduced);
  }

  /**
   * Fire feedback at lateral `x`, world `forward` (the muzzle). Higher tiers spit
   * a bigger flash, and the twin-barrel tiers (4+) throw paired tracers — so the
   * gun visibly escalates with its level (docs/DESIGN.md → upgrades render).
   */
  fire(x: number, forward: number, level = 1): void {
    const bursts = level >= 5 ? 3 : level >= 3 ? 2 : 1;
    for (let i = 0; i < bursts; i += 1) this.flash.spawn(x, forward);
    if (level >= 4) {
      this.tracers.spawn(x - 0.18, forward);
      this.tracers.spawn(x + 0.18, forward);
    } else {
      this.tracers.spawn(x, forward);
    }
  }

  update(distance: number, dt: number): void {
    this.flash.update(distance, dt);
    this.tracers.update(distance, dt);
  }
}
