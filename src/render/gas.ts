import * as THREE from 'three';
import type { ReadonlyState } from '../sim';
import { palette } from './palette';
import type { Elevation } from './elevation';

// Up to this many clouds live at once, each drawn as a few translucent puffs. One
// instanced draw call; idle slots cost nothing.
const MAX_CLOUDS = 8;
const PUFFS_PER_CLOUD = 5;
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
    const mat = new THREE.MeshBasicMaterial({
      color: palette.gasCloud,
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
        const a = (p / PUFFS_PER_CLOUD) * TWO_PI;
        const wob = this.reduced ? 0 : Math.sin(this.clock * 1.3 + p * 1.7 + g.forward) * 0.18;
        this.dummy.position.set(
          g.x + Math.cos(a) * 0.85,
          baseY + 0.5 + Math.sin(a * 1.3) * 0.25 + wob,
          z0 + Math.sin(a) * 1.4,
        );
        // Full-bodied while fresh, shrinking to nothing as it dissipates.
        this.dummy.scale.setScalar(0.7 + 0.7 * frac);
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
