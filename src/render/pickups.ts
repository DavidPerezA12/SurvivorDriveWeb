import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ReadonlyState } from '../sim';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import { ParticlePool, prefersReducedMotion } from './mowFx';
import type { Elevation } from './elevation';

// Headroom for every pickup of one kind live within the lookahead window at once.
// Instanced, so unused slots cost nothing; only `count` draw.
const MAX_INSTANCES = 24;
const TWO_PI = Math.PI * 2;

/**
 * A lift pickup — a jump-charge refill (docs/DESIGN.md → Object craft). A pair of
 * stacked upward chevrons over a base pad: the silhouette reads "up / jump", and
 * the cool electric blue marks it as a pickup distinct from the cyan scrap ping.
 */
function liftGeometry(): THREE.BufferGeometry {
  const tok = palette.liftToken;
  const dark = palette.liftTokenDark;
  const baseCol = palette.liftBase;

  // One upward chevron "^" centered on (0, y): two leaning arms meeting at top.
  const chevron = (y: number, span: number, thick: number, color: number): THREE.BufferGeometry[] => [
    box(thick, span, thick, color, 0.5).rotateZ(0.7).translate(-span * 0.28, y, 0),
    box(thick, span, thick, color, 0.5).rotateZ(-0.7).translate(span * 0.28, y, 0),
  ];

  const parts = [
    box(0.78, 0.08, 0.78, baseCol, 0.6).translate(0, 0.05, 0),
    box(0.5, 0.06, 0.5, dark, 0.6).translate(0, 0.11, 0),
    ...chevron(0.62, 0.52, 0.13, dark),
    ...chevron(0.92, 0.52, 0.14, tok),
  ];
  return merge(parts, 'lift');
}

/**
 * A health pickup — repairs the hull (docs/DESIGN.md → roster). A bold green "+"
 * cross floating over a base pad: the universal repair read, cool by the
 * readability rule and a different hue from lift-blue and scrap-cyan.
 */
function healthGeometry(): THREE.BufferGeometry {
  const tok = palette.healthToken;
  const dark = palette.healthTokenDark;
  const baseCol = palette.healthBase;
  const parts = [
    box(0.78, 0.08, 0.78, baseCol, 0.6).translate(0, 0.05, 0),
    box(0.5, 0.06, 0.5, dark, 0.6).translate(0, 0.11, 0),
    // The cross: a horizontal and a vertical bar, slightly proud of each other.
    box(0.62, 0.2, 0.2, tok, 0.45).translate(0, 0.74, 0),
    box(0.2, 0.62, 0.2, tok, 0.45).translate(0, 0.74, 0),
  ];
  return merge(parts, 'health');
}

/**
 * An ammo box — refills the gun (docs/DESIGN.md → roster). A stout crate banded
 * with the gun's warm amber and topped with two stubby rounds, so it reads as the
 * weapon's economy at a glance.
 */
function ammoGeometry(): THREE.BufferGeometry {
  const parts = [
    box(0.78, 0.08, 0.78, palette.ammoBase, 0.6).translate(0, 0.05, 0),
    box(0.62, 0.46, 0.5, palette.ammoBox, 0.5).translate(0, 0.36, 0),
    // A warm band across the lid — the ammo signature.
    box(0.66, 0.12, 0.54, palette.ammoBand, 0.35).translate(0, 0.5, 0),
    // Two stubby rounds standing on the crate.
    box(0.12, 0.26, 0.12, palette.ammoTip, 0.4).translate(-0.14, 0.72, 0),
    box(0.12, 0.26, 0.12, palette.ammoTip, 0.4).translate(0.14, 0.72, 0),
  ];
  return merge(parts, 'ammo');
}

function merge(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error(`Failed to merge ${name} pickup geometry`);
  return geo;
}

/**
 * One instanced field for a single pickup kind. Each kind is its own draw call so
 * each keeps its authored silhouette; idle slots cost nothing. Filled fresh each
 * frame from the sim's live pickups — no per-frame allocation.
 */
class KindLayer {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private count = 0;

  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry) {
    this.mesh = new THREE.InstancedMesh(geo, propMaterial, MAX_INSTANCES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  begin(): void {
    this.count = 0;
  }

  place(x: number, z: number, clock: number, phase: number, baseY: number): void {
    if (this.count >= MAX_INSTANCES) return;
    const bob = Math.sin(clock * 2 + phase * TWO_PI) * 0.12;
    this.dummy.position.set(x, baseY + 0.55 + bob, z);
    this.dummy.rotation.set(0, clock * 1.4 + phase * TWO_PI, 0);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.count, this.dummy.matrix);
    this.count += 1;
  }

  commit(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Renders the sim's live, un-taken pickups — lift, health, and ammo — each as its
 * own instanced field, plus the cool collect burst. The sim owns where they are;
 * this maps each pickup's absolute world-forward to screen z and adds a gentle
 * hover-bob and slow spin (offset per instance by the pickup's deterministic
 * phase). No allocation per frame.
 */
export class PickupField {
  private readonly lift: KindLayer;
  private readonly health: KindLayer;
  private readonly ammo: KindLayer;
  private readonly sparks: ParticlePool;
  private clock = 0;

  constructor(scene: THREE.Scene) {
    this.lift = new KindLayer(scene, liftGeometry());
    this.health = new KindLayer(scene, healthGeometry());
    this.ammo = new KindLayer(scene, ammoGeometry());

    // A cool upward puff when anything is gathered — the "you got it" read,
    // legible with sound off.
    this.sparks = new ParticlePool(
      scene,
      box(0.16, 0.16, 0.16, palette.liftToken, 0.25),
      { count: 48, perBurst: 6, life: 0.5, gravity: 10, vyMin: 4, vyMax: 7, spread: 3, spin: 10, scale: 1 },
      prefersReducedMotion(),
    );
  }

  update(state: ReadonlyState, dt: number, elevation: Elevation): void {
    this.clock += dt;
    this.lift.begin();
    this.health.begin();
    this.ammo.begin();
    for (const p of state.pickups) {
      if (p.taken) continue;
      const z = state.distance - p.forward;
      const layer = p.kind === 'jump' ? this.lift : p.kind === 'health' ? this.health : this.ammo;
      layer.place(p.x, z, this.clock, p.phase, elevation.yAt(p.forward, state.distance));
    }
    this.lift.commit();
    this.health.commit();
    this.ammo.commit();
    this.sparks.update(state.distance, dt);
  }

  /** Fire the cool collect burst for a pickup gathered at lateral `x`, world `forward`. */
  collect(x: number, forward: number): void {
    this.sparks.spawn(x, forward);
  }
}
