import * as THREE from 'three';
import { box, lightMaterial } from './materials';
import { weaponStats } from '../content/weapons';
import { ParticlePool, prefersReducedMotion } from './mowFx';

/**
 * Gun feedback (docs/DESIGN.md → Juice: muzzle flash + a bolt to the kill). Each
 * weapon tier fires its OWN distinct shot, the way The Last Driver's guns each read
 * differently, all leaving the cannon and driving deep down the lane:
 *   1 Scrap Shotgun   — a short scrappy buckshot cone
 *   2 Pump Repeater   — one punchy bright slug
 *   3 Street Sweeper  — a wide buckshot blast that rakes the lanes
 *   4 Twin Autocannon — twin heavy tracers from the paired barrels
 *   5 Apocalypse Cannon — a crackling electric arc
 * Pooled instanced meshes, allocation-free after warm-up, honoring reduced motion.
 */
const FLASH = 0xffe2b0; // hot muzzle flash for the ballistic guns
const TARGET_Y = 0.85; // where shots earth out ahead — target height, above the road
const ARC_GAP = 0.0; // the electric bolt leaves right at the muzzle brake, not floating ahead

type Style = 'pellets' | 'slug' | 'twin' | 'arc';
interface TierFx {
  readonly style: Style;
  readonly color: number;
  readonly flashBursts: number;
  /** Tracer/bolt cross-section. */
  readonly w: number;
  /** Tracer length (ballistic styles). */
  readonly len?: number;
  /** Pellets per shot and their lateral fan speed (pellets style). */
  readonly count?: number;
  readonly spreadVel?: number;
  /** Half the gap between the twin barrels (twin style). */
  readonly gap?: number;
}
const TIERS: readonly TierFx[] = [
  { style: 'pellets', color: 0xffb24a, flashBursts: 1, w: 0.07, len: 1.4, count: 7, spreadVel: 7 },
  { style: 'slug', color: 0xffd23a, flashBursts: 1, w: 0.11, len: 3.4 },
  { style: 'pellets', color: 0xff9a2e, flashBursts: 2, w: 0.08, len: 1.8, count: 12, spreadVel: 13 },
  { style: 'twin', color: 0xff7322, flashBursts: 2, w: 0.14, len: 4.0, gap: 0.5 },
  { style: 'arc', color: 0xf0f6ff, flashBursts: 2, w: 0.13 },
];

// ─── Ballistic tracers (pellets, slugs) ──────────────────────────────────────

/**
 * Straight glowing tracers: each flies down-range (forward grows) with an optional
 * lateral fan and a gentle drop toward target height, thinning over a short life.
 * Per-instance position, drift, size, life, and colour on the unlit light material
 * — one draw call, no per-frame allocation. Buckshot, slugs and twin bolts all ride
 * this pool; only how many, how fast they fan, and how big they are differs.
 */
class TracerPool {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly to = new THREE.Vector3();
  private readonly fwd: Float32Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly w: Float32Array;
  private readonly len: Float32Array;
  private readonly spd: Float32Array;
  private readonly life: Float32Array;
  private readonly age: Float32Array;
  private cursor = 0;

  constructor(scene: THREE.Scene, private readonly count: number) {
    this.mesh = new THREE.InstancedMesh(box(1, 1, 1, 0xffffff, 0), lightMaterial, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.fwd = new Float32Array(count);
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.w = new Float32Array(count);
    this.len = new Float32Array(count);
    this.spd = new Float32Array(count);
    this.life = new Float32Array(count).fill(1);
    this.age = new Float32Array(count).fill(1);
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

  spawn(x: number, forward: number, y: number, vx: number, vy: number, w: number, len: number, spd: number, life: number, color: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.x[i] = x;
    this.fwd[i] = forward;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.w[i] = w;
    this.len[i] = len;
    this.spd[i] = spd;
    this.life[i] = life;
    this.age[i] = 0;
    this.mesh.setColorAt(i, this.tint.setHex(color));
  }

  update(distance: number, dt: number): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      this.fwd[i] += this.spd[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      const fade = 1 - this.age[i] / this.life[i];
      const w = this.w[i] * (0.45 + fade * 0.55);
      // Point the streak along its travel (forward, with its fan/drop), then stretch.
      this.to.set(this.x[i] + this.vx[i], this.y[i] + this.vy[i], distance - this.fwd[i] - this.spd[i]);
      this.dummy.position.set(this.x[i], this.y[i], distance - this.fwd[i]);
      this.dummy.lookAt(this.to);
      this.dummy.scale.set(w, w, this.len[i] * (0.6 + fade * 0.6));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ─── Electric arc (apocalypse cannon) ────────────────────────────────────────

const SEG_PER_BRANCH = 14;
const ARC_LIFE = 0.12;
const ARC_SLOTS = 4;
const SEG_CAP = ARC_SLOTS * SEG_PER_BRANCH;

interface Arc {
  age: number;
  ox: number;
  oy: number;
  of: number;
  tx: number;
  ty: number;
  tf: number;
  width: number;
  color: number;
}

/**
 * The apocalypse cannon's electric bolt: a jagged lightning arc rebuilt every frame
 * so it crackles, from the muzzle straight down the lane. Segment boxes instanced on
 * the unlit light material — one draw call.
 *
 * Origin and target are kept in car-local forward (metres ahead of the car, which
 * the render world parks at z = 0), so the bolt stays pinned to the muzzle for its
 * brief life instead of sliding back over the hull as the car drives through it.
 */
class ArcFx {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly mid = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly arcs: Arc[];
  private readonly jitter: number;
  private cursor = 0;
  private live = 0;

  constructor(scene: THREE.Scene, reduced: boolean) {
    this.jitter = reduced ? 0.35 : 1;
    this.mesh = new THREE.InstancedMesh(box(1, 1, 1, 0xffffff, 0), lightMaterial, SEG_CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.arcs = Array.from({ length: ARC_SLOTS }, () => ({
      age: ARC_LIFE,
      ox: 0,
      oy: 0,
      of: 0,
      tx: 0,
      ty: 0,
      tf: 0,
      width: 0.1,
      color: 0xffffff,
    }));
    scene.add(this.mesh);
  }

  spawn(x: number, forward: number, y: number, reach: number, width: number, color: number): void {
    const a = this.arcs[this.cursor];
    this.cursor = (this.cursor + 1) % ARC_SLOTS;
    a.age = 0;
    a.ox = x;
    a.oy = y;
    a.of = forward;
    a.tx = x;
    a.ty = TARGET_Y;
    a.tf = forward + reach;
    a.width = width;
    a.color = color;
  }

  update(dt: number): void {
    let seg = 0;
    for (const a of this.arcs) {
      if (a.age >= ARC_LIFE) continue;
      a.age += dt;
      if (a.age >= ARC_LIFE) continue;
      const fade = 1 - a.age / ARC_LIFE;
      const w = a.width * (0.45 + fade * 0.55);
      const amp = (0.55 + fade * 0.7) * this.jitter;
      this.tint.setHex(a.color);
      const x0 = a.ox;
      const y0 = a.oy;
      const z0 = -a.of; // car-local: the car sits at z = 0, bolt forms ahead
      const x1 = a.tx;
      const y1 = a.ty;
      const z1 = -a.tf;
      let px = x0;
      let py = y0;
      let pz = z0;
      for (let k = 1; k <= SEG_PER_BRANCH && seg < SEG_CAP; k += 1) {
        const t = k / SEG_PER_BRANCH;
        const env = Math.sin(Math.PI * t);
        const qx = x0 + (x1 - x0) * t + (Math.random() - 0.5) * amp * env;
        const qy = y0 + (y1 - y0) * t + (Math.random() - 0.5) * amp * env;
        const qz = z0 + (z1 - z0) * t + (Math.random() - 0.5) * amp * 0.6 * env;
        this.mid.set((px + qx) / 2, (py + qy) / 2, (pz + qz) / 2);
        this.to.set(qx, qy, qz);
        this.dummy.position.copy(this.mid);
        this.dummy.lookAt(this.to);
        this.dummy.scale.set(w, w, Math.hypot(qx - px, qy - py, qz - pz));
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(seg, this.dummy.matrix);
        this.mesh.setColorAt(seg, this.tint);
        seg += 1;
        px = qx;
        py = qy;
        pz = qz;
      }
    }
    for (let i = seg; i < this.live; i += 1) {
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.live = seg;
    this.mesh.count = seg;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class GunFx {
  private readonly flash: ParticlePool;
  private readonly tracers: TracerPool;
  private readonly arcs: ArcFx;

  constructor(scene: THREE.Scene) {
    const reduced = prefersReducedMotion();
    this.flash = new ParticlePool(
      scene,
      box(0.16, 0.16, 0.16, FLASH, 0.1),
      { count: 48, perBurst: 3, life: 0.08, gravity: 1, vyMin: 0.2, vyMax: 0.8, spread: 2.4, spin: 10, scale: 1 },
      reduced,
    );
    this.tracers = new TracerPool(scene, 96);
    this.arcs = new ArcFx(scene, reduced);
  }

  /**
   * Fire feedback for weapon `level` from the muzzle (`x`, car-local `muzzle`
   * forward offset, height `y`, with the car at world `distance`): the tier's own
   * shot, reaching deep down the lane (scaled to the weapon's range) — buckshot,
   * slug, twin tracers, or the electric arc.
   *
   * The ballistic tracers fly away in world space (they outrun the car), so they
   * take a world forward. The electric arc instead stays locked to the muzzle for
   * its brief life: it is spawned in car-local space so the car can't overtake it
   * and leave the bolt hanging back over the hull.
   */
  fire(x: number, muzzle: number, y: number, level = 1, distance = 0): void {
    const fx = TIERS[Math.max(0, Math.min(level, TIERS.length) - 1)];
    const range = weaponStats(level).range;
    const forward = distance + muzzle; // world forward of the barrel tip

    for (let i = 0; i < fx.flashBursts; i += 1) this.flash.spawn(x, forward, y);

    const drop = (reach: number, spd: number): number => {
      // Vertical velocity that brings a shot from the muzzle down to target height
      // by the time it has flown its reach (so it earths out on the lane, not above).
      const life = reach / spd;
      return (TARGET_Y - y) / life;
    };

    if (fx.style === 'arc') {
      // Car-local forward: the bolt forms ahead of the hull and stays there.
      this.arcs.spawn(x, muzzle + ARC_GAP, y, range * 0.6, fx.w, fx.color);
      return;
    }

    if (fx.style === 'pellets') {
      const reach = range * 0.55;
      const spd = 150;
      const life = reach / spd;
      const vy = drop(reach, spd);
      for (let i = 0; i < (fx.count ?? 6); i += 1) {
        const vx = (Math.random() - 0.5) * (fx.spreadVel ?? 8);
        const jx = x + (Math.random() - 0.5) * 0.4;
        const w = fx.w * (0.7 + Math.random() * 0.6);
        const len = (fx.len ?? 1.5) * (0.7 + Math.random() * 0.6);
        this.tracers.spawn(jx, forward, y, vx, vy, w, len, spd, life, fx.color);
      }
      return;
    }

    // slug | twin — straight bright tracers, twin from the paired barrels.
    const reach = range * 0.78;
    const spd = 175;
    const life = reach / spd;
    const vy = drop(reach, spd);
    const len = fx.len ?? 3.2;
    if (fx.style === 'twin') {
      const gap = fx.gap ?? 0.45;
      this.tracers.spawn(x - gap, forward, y, 0, vy, fx.w, len, spd, life, fx.color);
      this.tracers.spawn(x + gap, forward, y, 0, vy, fx.w, len, spd, life, fx.color);
    } else {
      this.tracers.spawn(x, forward, y, 0, vy, fx.w, len, spd, life, fx.color);
    }
  }

  update(distance: number, dt: number): void {
    this.flash.update(distance, dt);
    this.tracers.update(distance, dt);
    this.arcs.update(dt);
  }
}
