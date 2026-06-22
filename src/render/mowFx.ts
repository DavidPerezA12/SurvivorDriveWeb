import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import type { Elevation } from './elevation';

const TWO_PI = Math.PI * 2;

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export interface PoolConfig {
  /** Pool capacity. */
  count: number;
  /** Particles emitted per `spawn`. */
  perBurst: number;
  /** Lifetime in seconds. */
  life: number;
  /** Downward acceleration (m/s²). */
  gravity: number;
  /** Upward launch speed range (m/s). */
  vyMin: number;
  vyMax: number;
  /** Lateral / forward velocity spread (m/s). */
  spread: number;
  /** Max spin (rad/s). */
  spin: number;
  /** Mesh scale at full strength. */
  scale: number;
}

/**
 * A fixed-capacity particle pool driven by one `InstancedMesh` — one draw call,
 * zero per-frame allocation. Particles live in struct-of-arrays state and are
 * recycled round-robin; inactive slots are parked at scale 0. Each particle
 * stores its absolute world-forward, so it scrolls with the road exactly like a
 * zombie does (the mowed body flies up and recedes past the camera).
 */
export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private readonly cfg: PoolConfig;
  private readonly reduced: boolean;
  private readonly dummy = new THREE.Object3D();

  private readonly fwd: Float32Array;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vf: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly age: Float32Array;
  private cursor = 0;

  constructor(scene: THREE.Scene, geometry: THREE.BufferGeometry, cfg: PoolConfig, reduced: boolean) {
    this.cfg = cfg;
    this.reduced = reduced;
    this.mesh = new THREE.InstancedMesh(geometry, propMaterial, cfg.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.fwd = new Float32Array(cfg.count);
    this.px = new Float32Array(cfg.count);
    this.py = new Float32Array(cfg.count);
    this.vx = new Float32Array(cfg.count);
    this.vy = new Float32Array(cfg.count);
    this.vf = new Float32Array(cfg.count);
    this.rot = new Float32Array(cfg.count);
    this.spin = new Float32Array(cfg.count);
    this.age = new Float32Array(cfg.count).fill(cfg.life); // all start expired
    this.parkAll();
    scene.add(this.mesh);
  }

  private parkAll(): void {
    this.dummy.scale.setScalar(0);
    this.dummy.position.set(0, -100, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.cfg.count; i += 1) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x: number, forward: number, baseY = 0.4): void {
    const c = this.cfg;
    const motion = this.reduced ? 0.35 : 1;
    for (let n = 0; n < c.perBurst; n += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % c.count;
      this.fwd[i] = forward + (Math.random() - 0.5) * 0.6;
      this.px[i] = x + (Math.random() - 0.5) * c.spread * 0.3;
      this.py[i] = baseY;
      this.vx[i] = (Math.random() - 0.5) * c.spread * motion;
      this.vy[i] = (c.vyMin + Math.random() * (c.vyMax - c.vyMin)) * motion;
      this.vf[i] = (Math.random() - 0.3) * c.spread * 0.6 * motion;
      this.rot[i] = Math.random() * TWO_PI;
      this.spin[i] = (Math.random() - 0.5) * 2 * c.spin * motion;
      this.age[i] = 0;
    }
  }

  // `elevation` lifts each particle onto the road profile by its world-forward —
  // only effects that fire far ahead (the explosion burst) need it; near-car
  // effects (mow, gun, smoke) pass nothing, since the profile there is ~0.
  update(distance: number, dt: number, elevation?: Elevation): void {
    const c = this.cfg;
    for (let i = 0; i < c.count; i += 1) {
      if (this.age[i] >= c.life) continue;
      this.age[i] += dt;
      if (this.age[i] >= c.life) {
        this.dummy.scale.setScalar(0);
        this.dummy.position.set(0, -100, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      this.vy[i] -= c.gravity * dt;
      this.py[i] = Math.max(0, this.py[i] + this.vy[i] * dt);
      this.px[i] += this.vx[i] * dt;
      this.fwd[i] += this.vf[i] * dt;
      this.rot[i] += this.spin[i] * dt;

      // Pop to full fast, shrink away over the last third (opaque-material fade).
      const fade = 1 - this.age[i] / c.life;
      const scale = c.scale * Math.min(1, fade * 3);
      const groundY = elevation ? elevation.yAt(this.fwd[i], distance) : 0;
      this.dummy.position.set(this.px[i], this.py[i] + groundY, distance - this.fwd[i]);
      this.dummy.rotation.set(this.rot[i], this.rot[i] * 0.7, this.rot[i] * 0.4);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A compact tumbling body for the ragdoll launch. */
function ragdollGeometry(): THREE.BufferGeometry {
  const parts = [
    box(0.42, 0.5, 0.32, palette.zombieShirt),
    box(0.28, 0.3, 0.28, palette.zombieFlesh).translate(0, 0.4, 0.06),
    box(0.16, 0.5, 0.16, palette.zombieFlesh).translate(0.32, 0.05, 0),
  ];
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge ragdoll geometry');
  return geo;
}

/**
 * Mow feedback (docs/DESIGN.md → Juice: "Ragdoll launch, scrap ping"). Each mow
 * launches a tumbling body and a burst of cool scrap shards — the "what hit
 * them" and the "you got paid", both legible with sound off. Two pooled
 * instanced meshes; everything honors reduced motion.
 */
export class MowFx {
  private readonly ragdolls: ParticlePool;
  private readonly shards: ParticlePool;

  constructor(scene: THREE.Scene) {
    const reduced = prefersReducedMotion();
    this.ragdolls = new ParticlePool(
      scene,
      ragdollGeometry(),
      { count: 24, perBurst: 1, life: 0.7, gravity: 18, vyMin: 4, vyMax: 6.5, spread: 3, spin: 9, scale: 1 },
      reduced,
    );
    this.shards = new ParticlePool(
      scene,
      box(0.17, 0.17, 0.17, palette.scrapPing, 0.25),
      { count: 64, perBurst: 5, life: 0.5, gravity: 14, vyMin: 5, vyMax: 8, spread: 5, spin: 12, scale: 1 },
      reduced,
    );
  }

  /** Fire the ragdoll + scrap burst for a mow at lateral `x`, world `forward`. */
  burst(x: number, forward: number): void {
    this.ragdolls.spawn(x, forward);
    this.shards.spawn(x, forward);
  }

  update(distance: number, dt: number): void {
    this.ragdolls.update(distance, dt);
    this.shards.update(distance, dt);
  }
}
