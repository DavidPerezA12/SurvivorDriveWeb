import * as THREE from 'three';
import type { ReadonlyState } from '../sim';
import { palette } from './palette';

/**
 * The meteor storm's burning sky (docs/DESIGN.md → The Big One). When the road is
 * under a sustained meteor rain, embers and sparks streak down across the sky as
 * ambiance over the lethal rocks the sim throws. One fixed-capacity `THREE.Points`
 * cloud, single draw call, parked invisible until a storm is live. The storm is read
 * straight off the sim state (several meteors falling at once), so it needs no new
 * sim channel; intensity ramps with how many are in the air. Embers fall fast and
 * drift diagonally and stream with the world, recycling to the top. Allocation-free
 * per frame; honors reduced motion by stilling the drift (the fall stays, like rain).
 */

const COUNT = 200;
const Z_BEHIND = 20;
const Z_AHEAD = 110;
const SPAN = Z_BEHIND + Z_AHEAD;
const HALF_WIDTH = 60;
const TOP_Y = 30;
const FALL_MIN = 14; // m/s — fast, these are burning rocks, not snow
const FALL_MAX = 24;
/** Falling meteors in the air at which the storm sky is at full strength. */
const STORM_FULL = 4;

export class MeteorStreaks {
  private readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly position: THREE.BufferAttribute;

  private readonly baseX = new Float32Array(COUNT);
  private readonly zPhase = new Float32Array(COUNT);
  private readonly fallSpeed = new Float32Array(COUNT);
  private readonly driftX = new Float32Array(COUNT);
  private readonly y = new Float32Array(COUNT);

  private reduced = false;

  constructor(scene: THREE.Scene) {
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i += 1) {
      this.baseX[i] = (Math.random() * 2 - 1) * HALF_WIDTH;
      this.zPhase[i] = Math.random() * SPAN;
      this.fallSpeed[i] = FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN);
      this.driftX[i] = 3 + Math.random() * 5; // a strong diagonal lean
      this.y[i] = Math.random() * TOP_Y;
    }

    const geo = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(positions, 3);
    this.position.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.position);

    this.material = new THREE.PointsMaterial({
      color: palette.meteorCore,
      size: 0.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // embers glow hot against the sky
      fog: true,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  update(state: ReadonlyState, dt: number): void {
    // Read the storm straight off the sim: how many meteors are falling right now.
    let falling = 0;
    for (const h of state.hazards) if (h.kind === 'meteor' && !h.landed) falling += 1;
    const strength = Math.min(1, falling / STORM_FULL);
    if (strength <= 0) {
      if (this.points.visible) this.points.visible = false;
      return;
    }
    this.points.visible = true;
    this.material.opacity = strength * 0.85;

    const drift = this.reduced ? 0 : 1;
    const arr = this.position.array as Float32Array;
    for (let i = 0; i < COUNT; i += 1) {
      let fy = this.y[i] - this.fallSpeed[i] * dt;
      if (fy < 0) fy += TOP_Y;
      this.y[i] = fy;

      const raw = state.distance - this.zPhase[i];
      const z = (((raw + Z_AHEAD) % SPAN) + SPAN) % SPAN - Z_AHEAD;
      // The diagonal lean ties horizontal offset to how far it has fallen.
      const x = this.baseX[i] + (TOP_Y - fy) * this.driftX[i] * 0.05 * drift;

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
