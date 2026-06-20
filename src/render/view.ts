import * as THREE from 'three';
import type { FrameEvent, ReadonlyState } from '../sim';
import { createStage, type Stage } from './scene';
import { buildUpgradeLayer, buildDamageLayer } from './car';
import { createChassis } from './chassis';
import type { UpgradeId } from '../content/upgrades';
import type { ChassisId } from '../content/chassis';
import { RoadField } from './road';
import { RoadWear } from './roadwear';
import { CrossStreets } from './crossStreets';
import { DecorField } from './decor';
import { Guardrail } from './guardrail';
import { Overpass } from './overpass';
import { HazardField } from './hazards';
import { MeteorField } from './meteors';
import { ZombieField } from './zombies';
import { PickupField } from './pickups';
import { MowFx } from './mowFx';
import { GunFx } from './gunFx';
import { ExplosionFx } from './explosionFx';
import { DamageSmoke } from './damageFx';
import { GroundFx } from './groundFx';
import { Horizon } from './horizon';
import { GroundScatter } from './groundscatter';
import { Dust } from './atmosphere';
import { EnvironmentDirector } from './environment';
import { Elevation } from './elevation';

/** The few dynamic scalars the renderer interpolates between sim ticks. */
export interface RenderSnapshot {
  distance: number;
  carLateralX: number;
  carLateralVel: number;
  carHeight: number;
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The render view. Reads sim snapshots and frame events and draws; it never
 * writes sim state (docs/ARCHITECTURE.md → the prime directive). Dynamic
 * transforms are interpolated between the previous and current tick by `alpha`,
 * so motion stays smooth and decoupled from the fixed 60 Hz sim.
 *
 * Allocation discipline: the per-frame path reuses everything and creates no
 * objects — GC pauses are the main cause of the frame spikes the stability
 * budget forbids (docs/ARCHITECTURE.md → Performance practices).
 */
export class GameView {
  private readonly stage: Stage;
  private readonly environment: EnvironmentDirector;
  /** The road's vertical profile; everything road-locked rides it (the car/camera stay level). */
  private readonly elevation: Elevation;
  private car: THREE.Group;
  private chassisId: ChassisId = 'survivor';
  /** The merged bolt-on mesh for the current garage loadout, parented to the car. */
  private upgradeMesh: THREE.Mesh | null = null;
  /** The merged hull-wear overlay, parented to the car; swapped on hull thresholds. */
  private damageMesh: THREE.Mesh | null = null;
  /** Current damage tier (0 pristine .. 3 critical), so we rebuild only on change. */
  private damageTier = 0;
  private readonly road: RoadField;
  private readonly roadWear: RoadWear;
  private readonly crossStreets: CrossStreets;
  private readonly groundScatter: GroundScatter;
  private readonly horizon: Horizon;
  private readonly dust: Dust;
  private readonly decor: DecorField;
  private readonly guardrail: Guardrail;
  private readonly overpass: Overpass;
  private readonly hazards: HazardField;
  private readonly meteors: MeteorField;
  private readonly zombies: ZombieField;
  private readonly pickups: PickupField;
  private readonly mowFx: MowFx;
  private readonly gunFx: GunFx;
  private readonly explosionFx: ExplosionFx;
  private readonly damageSmoke: DamageSmoke;
  private readonly groundFx: GroundFx;

  /** Landing-squash intensity, decays toward 0. Pure juice (docs/DESIGN.md). */
  private squash = 0;
  /** Last interpolated lateral position, to track where the car landed. */
  private lastCarX = 0;
  /** Last sim distance, so an event handler can place world-anchored juice. */
  private lastDistance = 0;

  constructor(seed: number) {
    this.stage = createStage();
    this.environment = new EnvironmentDirector(this.stage.scene, this.stage.key, this.stage.hemi);
    this.elevation = new Elevation(seed);
    this.horizon = new Horizon(this.stage.scene, seed);
    this.dust = new Dust(this.stage.scene);
    this.road = new RoadField(this.stage.scene);
    this.roadWear = new RoadWear(this.stage.scene, seed);
    this.crossStreets = new CrossStreets(this.stage.scene, seed);
    this.groundScatter = new GroundScatter(this.stage.scene, seed);
    this.decor = new DecorField(this.stage.scene, seed);
    this.guardrail = new Guardrail(this.stage.scene, seed);
    this.overpass = new Overpass(this.stage.scene, seed);
    this.hazards = new HazardField(this.stage.scene);
    this.meteors = new MeteorField(this.stage.scene);
    this.zombies = new ZombieField(this.stage.scene);
    this.pickups = new PickupField(this.stage.scene);
    this.mowFx = new MowFx(this.stage.scene);
    this.gunFx = new GunFx(this.stage.scene);
    this.explosionFx = new ExplosionFx(this.stage.scene);
    this.damageSmoke = new DamageSmoke(this.stage.scene);
    this.groundFx = new GroundFx(this.stage.scene);
    this.car = createChassis(this.chassisId);
    this.stage.scene.add(this.car);
  }

  /**
   * Swap the driven chassis model (docs/DESIGN.md → chassis classes). Called at
   * run start when the garage's selection changed — never per frame. The old body
   * (with its bolt-ons and wear) is disposed and replaced; the caller re-dresses
   * upgrades with `setLoadout` right after, and a fresh run starts pristine.
   */
  setChassis(id: ChassisId): void {
    if (id === this.chassisId && this.car) return;
    this.chassisId = id;
    this.stage.scene.remove(this.car);
    this.car.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.upgradeMesh = null;
    this.damageMesh = null;
    this.damageTier = 0;
    this.car = createChassis(id);
    this.stage.scene.add(this.car);
  }

  /**
   * Dress the hero car for the owned garage upgrades (docs/DESIGN.md → Upgrades
   * render on the car model). Called on startup and whenever a new run begins
   * with a changed loadout — never per frame. The old bolt-on mesh is disposed
   * and replaced, so swapping upgrades leaks no GPU memory and adds at most one
   * draw call to the hero.
   */
  setLoadout(owned: ReadonlySet<UpgradeId>): void {
    if (this.upgradeMesh) {
      this.car.remove(this.upgradeMesh);
      this.upgradeMesh.geometry.dispose();
      this.upgradeMesh = null;
    }
    const mesh = buildUpgradeLayer(owned);
    if (mesh) {
      this.upgradeMesh = mesh;
      this.car.add(mesh);
    }
  }

  /**
   * Swap the hull-wear overlay when the hull crosses a severity threshold
   * (docs/DESIGN.md → Pillar 2: damage shown on the car's visible wear). Tiers are
   * coarse on purpose — pristine, scarred, battered, critical — so the rebuild
   * fires a handful of times per run, never per frame, and the steady state
   * allocates nothing. A new run resets the hull to full, which clears the overlay
   * here on the next frame.
   */
  private updateDamage(health: number): void {
    const tier = health >= 0.66 ? 0 : health >= 0.33 ? 1 : health >= 0.12 ? 2 : 3;
    if (tier === this.damageTier) return;
    this.damageTier = tier;
    if (this.damageMesh) {
      this.car.remove(this.damageMesh);
      this.damageMesh.geometry.dispose();
      this.damageMesh = null;
    }
    const mesh = buildDamageLayer(tier);
    if (mesh) {
      this.damageMesh = mesh;
      this.car.add(mesh);
    }
  }

  /**
   * Apply resolved player settings (the app does the resolving so the renderer
   * stays decoupled from `app/`). Called on startup and whenever a setting
   * changes — never per frame, so it costs nothing in the steady state.
   */
  applySettings(reducedMotion: boolean, shake: number, pixelCap: number): void {
    this.stage.camera.setMotion(reducedMotion, shake);
    this.dust.setReducedMotion(reducedMotion);
    this.stage.setPixelCap(pixelCap);
  }

  /** Apply a per-tick frame event to the view (juice and camera feedback). */
  handleEvent(event: FrameEvent): void {
    switch (event.type) {
      case 'jumped':
        this.stage.camera.punchFov(5);
        break;
      case 'landed': {
        // Bigger landings squash harder, kick up more dust, and shake a touch
        // more (all clamped).
        const intensity = Math.min(event.impact / 7, 1);
        this.squash = Math.max(this.squash, intensity * 0.38);
        this.stage.camera.addTrauma(intensity * 0.25);
        this.groundFx.burst(intensity, this.lastCarX);
        break;
      }
      case 'crashed': {
        // A crash hits hard: heavy shake and a deep squash, scaled by impact.
        const intensity = Math.min(event.impact / 40, 1);
        this.squash = Math.max(this.squash, 0.3 + intensity * 0.25);
        this.stage.camera.addTrauma(0.4 + intensity * 0.4);
        break;
      }
      case 'hullDamaged':
        // A quick punch scaled by how much hull the hit took — the bigger the
        // bite, the harder the shake (clamped). The 'crashed' event already
        // shook for the impact; this reads the *damage* (docs/DESIGN.md → Juice).
        this.stage.camera.addTrauma(0.1 + Math.min(event.amount * 1.5, 0.3));
        break;
      case 'shotFired':
        // A bright muzzle spit at the nose, bigger at higher gun tiers — no
        // shake, the gun is smooth (docs/DESIGN.md → Juice: reads with sound off).
        this.gunFx.fire(event.x, this.lastDistance + 3, event.level);
        break;
      case 'zombieMowed':
        // No shake — mowing is smooth, free fun. The body and scrap shards fly;
        // the speed surge widens the FOV on its own (docs/DESIGN.md → Juice).
        this.mowFx.burst(event.x, this.lastDistance);
        break;
      case 'exploded': {
        // A fireball at the barrel (which can be well ahead when shot at range),
        // plus a thump of shake that falls off with distance — a near blast jolts
        // the camera, a far one barely (docs/DESIGN.md → Juice: shake clamped).
        this.explosionFx.burst(event.x, event.forward);
        const near = Math.max(0, 1 - Math.max(0, event.forward - this.lastDistance) / 60);
        this.stage.camera.addTrauma(0.2 + near * 0.4);
        break;
      }
      case 'pickupCollected':
        // A cool upward puff — smooth, no shake; gathering loot is friendly.
        this.pickups.collect(event.x, this.lastDistance);
        break;
      case 'laneChanged':
      case 'died':
        break;
    }
  }

  render(prev: RenderSnapshot, curr: ReadonlyState, alpha: number, dt: number): void {
    const carX = lerp(prev.carLateralX, curr.car.lateralX, alpha);
    const carVel = lerp(prev.carLateralVel, curr.car.lateralVel, alpha);
    const distance = lerp(prev.distance, curr.distance, alpha);
    const carHeight = lerp(prev.carHeight, curr.car.height, alpha);
    this.lastCarX = carX;

    this.car.position.x = carX;
    this.car.position.y = carHeight;

    // Bank into the lane change: the body leans by its lateral velocity, so a
    // tap reads as a committed, weighty move rather than a slide (clamped).
    this.car.rotation.z = Math.max(-0.22, Math.min(0.22, -carVel * 0.035));
    // Pitch with the road: nose up on a climb, down on a drop, so cresting a hill
    // reads in the hands (clamped). Zero on the flat stretches between hills.
    this.car.rotation.x = Math.max(-0.13, Math.min(0.13, this.elevation.slopeAt(distance)));

    // Suspension squash on landing: flatten vertically, splay horizontally.
    this.squash *= Math.exp(-12 * dt);
    this.car.scale.set(1 + this.squash * 0.6, 1 - this.squash, 1 + this.squash * 0.6);

    this.environment.update(distance, this.elevation);
    this.horizon.update(distance, dt);
    this.dust.update(distance, dt);
    this.road.update(distance, this.elevation);
    this.roadWear.update(distance, this.elevation);
    this.crossStreets.update(distance, this.elevation);
    this.groundScatter.update(distance);
    this.decor.update(distance);
    this.guardrail.update(distance, this.elevation);
    this.overpass.update(distance, this.elevation);
    this.hazards.update(curr, this.elevation);
    this.meteors.update(curr, this.elevation);
    this.zombies.update(curr, dt, this.elevation);
    this.pickups.update(curr, dt, this.elevation);
    // Hull wear: swap the dent/scorch overlay on threshold crossings, and trail
    // engine smoke that thickens as the hull empties (from ~40% down).
    this.updateDamage(curr.car.health);
    const smoke = curr.car.health < 0.4 ? (0.4 - curr.car.health) / 0.4 : 0;
    this.damageSmoke.update(curr.distance, dt, carX, smoke);

    this.mowFx.update(curr.distance, dt);
    this.gunFx.update(curr.distance, dt);
    this.explosionFx.update(curr.distance, dt, this.elevation);
    this.groundFx.update(carX, carHeight, dt);
    this.stage.camera.update(carX, carHeight, curr.car.speed, dt);

    this.lastDistance = curr.distance;
    this.stage.renderer.render(this.stage.scene, this.stage.camera.camera);
  }

  /** Live render stats for the debug overlay. */
  stats(): RenderStats {
    const info = this.stage.renderer.info.render;
    return { drawCalls: info.calls, triangles: info.triangles };
  }
}
