import * as THREE from 'three';

/**
 * Falling snow for the ice-field biome (docs/DESIGN.md → biomes). One fixed-capacity
 * `THREE.Points` cloud, drawn in a single call, parked invisible until the run is in
 * a snowy band. Flakes fall and sway and stream past with the world (z = distance −
 * worldZ, like the dust and the road tiles), recycling to the top so the fall is
 * endless. Opacity tracks the biome's `precip`, so the snow eases in across a band
 * transition rather than popping on. Allocation-free per frame; honors reduced motion
 * by stilling the horizontal sway (the fall is honest world motion, like the road).
 */

const COUNT = 320;
/** Forward extent: a little behind to well ahead (m), matching the dust window. */
const Z_BEHIND = 16;
const Z_AHEAD = 90;
const SPAN = Z_BEHIND + Z_AHEAD;
/** Lateral and vertical reach around the car (m). */
const HALF_WIDTH = 42;
const TOP_Y = 16;
const FALL_MIN = 5; // m/s
const FALL_MAX = 9;

export class SnowFall {
  private readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly position: THREE.BufferAttribute;

  // Per-flake static parameters (set once); the per-frame loop only reads.
  private readonly baseX = new Float32Array(COUNT);
  private readonly zPhase = new Float32Array(COUNT);
  private readonly fallSpeed = new Float32Array(COUNT);
  private readonly swayAmp = new Float32Array(COUNT);
  private readonly swayFreq = new Float32Array(COUNT);
  private readonly phase = new Float32Array(COUNT);
  /** Continuous falling height, wrapped 0..TOP_Y; advanced by `fallSpeed` each frame. */
  private readonly y = new Float32Array(COUNT);

  private reduced = false;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i += 1) {
      this.baseX[i] = (Math.random() * 2 - 1) * HALF_WIDTH;
      this.zPhase[i] = Math.random() * SPAN;
      this.fallSpeed[i] = FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN);
      this.swayAmp[i] = 0.3 + Math.random() * 0.9;
      this.swayFreq[i] = 0.6 + Math.random() * 1.0;
      this.phase[i] = Math.random() * Math.PI * 2;
      this.y[i] = Math.random() * TOP_Y;
    }

    const geo = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(positions, 3);
    this.position.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.position);

    this.material = new THREE.PointsMaterial({
      color: 0xf2f6fb,
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true, // far flakes dissolve into the whiteout haze
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false; // repositioned every frame
    this.points.visible = false;
    scene.add(this.points);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** `precip` is the biome's snowfall density (0 = none). Hidden entirely at 0. */
  update(distance: number, dt: number, precip: number): void {
    const amt = Math.min(1, Math.max(0, precip));
    if (amt <= 0) {
      if (this.points.visible) this.points.visible = false;
      return;
    }
    this.points.visible = true;
    this.material.opacity = amt * 0.8;
    this.t += dt;

    const sway = this.reduced ? 0 : 1;
    const arr = this.position.array as Float32Array;
    for (let i = 0; i < COUNT; i += 1) {
      // Fall: drop and wrap back to the top, so the snow never runs out.
      let fy = this.y[i] - this.fallSpeed[i] * dt;
      if (fy < 0) fy += TOP_Y;
      this.y[i] = fy;

      // Stream with the world, wrapped into [-Z_AHEAD, +Z_BEHIND] like the dust.
      const raw = distance - this.zPhase[i];
      const z = ((((raw + Z_AHEAD) % SPAN) + SPAN) % SPAN) - Z_AHEAD;
      const x =
        this.baseX[i] +
        Math.sin(this.t * this.swayFreq[i] + this.phase[i]) * this.swayAmp[i] * sway;

      arr[i * 3] = x;
      arr[i * 3 + 1] = fy;
      arr[i * 3 + 2] = z;
    }
    this.position.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
