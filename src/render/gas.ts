import * as THREE from 'three';
import type { ReadonlyState } from '../sim';
import { palette } from './palette';
import type { Elevation } from './elevation';

// Up to this many clouds live at once, each drawn as a few translucent puffs. One
// instanced draw call; idle slots cost nothing.
const MAX_CLOUDS = 8;
// Per cloud: a ring of murky rim puffs, two brighter roiling core puffs above,
// and one wide flattened skirt hugging the road (heavier than air — the gas
// pools on the lane it denies rather than floating as soap bubbles).
const RIM_PUFFS = 4;
const CORE_PUFFS = 2;
const PUFFS_PER_CLOUD = RIM_PUFFS + CORE_PUFFS + 1;
const MAX_PUFFS = MAX_CLOUDS * PUFFS_PER_CLOUD;
const TWO_PI = Math.PI * 2;

/**
 * Renders the sim's live toxic gas clouds (`state.gas`) as low, translucent acid-green
 * haze sitting on the lane each ruptured toxbarrel poisoned (docs/DESIGN.md → roster).
 * Each cloud is a clutch of soft puffs that shrink as the cloud thins toward its
 * expiry, so a player reads "this lane is poison, and for how much longer" at a glance,
 * even with sound off. The sim owns the clouds; this only draws them. One transparent
 * instanced mesh, no per-frame allocation. Honors reduced motion (stills the drift).
 */
export class GasField {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private reduced = false;
  private clock = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.6, 6, 5);
    // White base color: the per-puff tint lives in the (static) instance colors.
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PUFFS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // Draw after the opaque world so the haze blends over what is behind it.
    this.mesh.renderOrder = 3;
    // Two-tone bake, set once: murky rim + skirt, acid-bright roiling core — the
    // same body-vs-glow split every crafted object gets, done with instance color
    // so the whole cloud stays one draw call.
    const rim = new THREE.Color(palette.gasCloud).multiplyScalar(0.62);
    const core = new THREE.Color(palette.gasCloud).multiplyScalar(1.15);
    const skirt = new THREE.Color(palette.gasCloud).multiplyScalar(0.78);
    for (let i = 0; i < MAX_PUFFS; i += 1) {
      const p = i % PUFFS_PER_CLOUD;
      this.mesh.setColorAt(i, p < RIM_PUFFS ? rim : p < RIM_PUFFS + CORE_PUFFS ? core : skirt);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  update(state: ReadonlyState, dt: number, elevation: Elevation): void {
    this.clock += dt;
    let n = 0;
    for (const g of state.gas) {
      const frac = g.life / g.maxLife; // 1 fresh → 0 gone
      const baseY = elevation.yAt(g.forward, state.distance);
      const z0 = state.distance - g.forward;
      for (let p = 0; p < PUFFS_PER_CLOUD && n < MAX_PUFFS; p += 1) {
        const wob = this.reduced ? 0 : Math.sin(this.clock * 1.3 + p * 1.7 + g.forward) * 0.18;
        // Full-bodied while fresh, shrinking to nothing as it dissipates.
        const body = 0.7 + 0.7 * frac;
        if (p < RIM_PUFFS) {
          // The murky rim ring, low around the cloud's waist.
          const a = (p / RIM_PUFFS) * TWO_PI;
          this.dummy.position.set(
            g.x + Math.cos(a) * 0.9,
            baseY + 0.42 + Math.sin(a * 1.3) * 0.2 + wob,
            z0 + Math.sin(a) * 1.5,
          );
          this.dummy.scale.setScalar(body * (0.85 + 0.15 * Math.sin(a * 2.1)));
        } else if (p < RIM_PUFFS + CORE_PUFFS) {
          // The brighter core boiling up through the middle.
          const s = p === RIM_PUFFS ? 1 : -1;
          this.dummy.position.set(
            g.x + s * 0.25,
            baseY + 0.78 + s * 0.1 + wob * 1.4,
            z0 + s * 0.45,
          );
          this.dummy.scale.setScalar(body * 0.62);
        } else {
          // The heavy skirt pooling on the asphalt, wide and flat.
          this.dummy.position.set(g.x, baseY + 0.16, z0);
          this.dummy.scale.set(body * 1.5, body * 0.35, body * 1.9);
        }
        this.dummy.rotation.set(0, this.clock * 0.3 + p, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(n, this.dummy.matrix);
        n += 1;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
