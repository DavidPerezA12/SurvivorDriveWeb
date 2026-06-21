import type { Rng } from './rng';
import type { Loadout } from '../content/upgrades';
import type { DeathCause } from '../content/runTitles';

/**
 * Shared simulation types.
 *
 * The sim owns the world's truth; render/audio/ui receive a `ReadonlyState`
 * snapshot plus a per-tick `FrameEvent[]` queue and never write back
 * (docs/ARCHITECTURE.md → the prime directive).
 */

/** Geometry recipe for a chunk. M0 only ships flat road; the rest are M3+. */
export type ChunkVariant = 'flat' | 'crack' | 'collapsed' | 'ramp' | 'trench';

/** Purely decorative roadside dressing. Never interactive; that is M2+. */
export type PropKind = 'post' | 'rock' | 'husk' | 'barrier';

export interface Prop {
  readonly kind: PropKind;
  /** World-space X. Always off the drivable road (|x| > road half-width). */
  readonly x: number;
  /** Offset along the chunk, in meters from its near edge, 0..CHUNK_LENGTH. */
  readonly z: number;
  /** Uniform size multiplier around the prop's canonical scale. */
  readonly scale: number;
  /** Yaw in radians, so repeated instances don't all face the same way. */
  readonly rot: number;
}

/**
 * Interactive objects on the road: five damaging blockers — the abandoned-car
 * `wreck` (a hard crash), the toppled big-`rig` (tall, un-jumpable, lethal at
 * speed), the `boulder` (a low rubble mound you jump over or eat for a smaller
 * crash), the explosive `barrel` (shoot it to detonate, chaining a blast that
 * clears a crowd; ram it for a big hit), and the `drifter` (a wreck that slides
 * one lane over as it nears, carrying its target lane) — the zombie (mowable/shootable
 * fodder), and three cool collectibles: a lift pickup (refills a jump charge), a
 * health pickup (repairs the hull), and an ammo box (refills the gun). Zombie and
 * every pickup carry a deterministic `phase`: render-only variety (shamble/bob
 * offset, yaw) the sim never reads.
 */
export type SpawnKind =
  | 'wreck'
  | 'rig'
  | 'boulder'
  | 'barrel'
  | 'drifter'
  | 'meteor'
  | 'gap'
  | 'zombie'
  | 'jump'
  | 'health'
  | 'ammo';

/**
 * The blockers spawned with a plain `{lane, z}` shape (everything but the
 * `drifter`, which also carries a target lane). The `meteor` shares the shape but
 * is not literally static; it falls from the sky onto its lane (`updateMeteors`).
 */
export type StaticHazardKind = 'wreck' | 'rig' | 'boulder' | 'barrel' | 'meteor' | 'gap';

/**
 * The damaging on-road blockers, shared by `Spawn` and `Hazard`. The `wreck`,
 * `boulder`, and `barrel` are ground-class — a jump sails over them; the `rig`
 * and a landed `meteor` are too tall/violent to clear (the only out is a lane
 * change). The `barrel` is also the one blocker the gun can destroy
 * (`detonateBarrel`). The `drifter` is a wreck that slides one lane over as it
 * nears. The `meteor` falls from the sky, harmless while falling and lethal once it
 * lands. The `gap` is a hole in the road itself: not a thing to hit but a thing to
 * be over while grounded: jump it or change lane, or fall in and die
 * (docs/DESIGN.md → roster; the road is the boss).
 */
export type HazardKind = StaticHazardKind | 'drifter';

/** The three on-ground collectible kinds, shared by `Spawn` and `Pickup`. */
export type PickupKind = 'jump' | 'health' | 'ammo';

export type Spawn =
  | {
      readonly kind: StaticHazardKind;
      /** Lane index the object blocks. Never the chunk's safe lane. */
      readonly lane: number;
      /** Offset along the chunk, in meters from its near edge, 0..CHUNK_LENGTH. */
      readonly z: number;
    }
  | {
      readonly kind: 'drifter';
      /** The lane it starts in. Never the chunk's safe lane. */
      readonly lane: number;
      readonly z: number;
      /**
       * The adjacent lane it slides into as it nears the car. Always non-safe and
       * exactly one lane from `lane`, so the slide never crosses the safe line
       * (docs/DESIGN.md → Pillar 3: the safe lane always stays open).
       */
      readonly toLane: number;
    }
  | {
      readonly kind: 'zombie';
      readonly lane: number;
      readonly z: number;
      /** Deterministic 0..1 render variety; the sim never reads it. */
      readonly phase: number;
    }
  | {
      readonly kind: PickupKind;
      readonly lane: number;
      readonly z: number;
      /** Deterministic 0..1 render variety (bob/spin offset); the sim ignores it. */
      readonly phase: number;
    };

export interface Chunk {
  /** Position in the run, 0-based. */
  readonly index: number;
  readonly variant: ChunkVariant;
  /** Deterministic roadside decoration for this chunk (docs/DESIGN.md). */
  readonly props: readonly Prop[];
  /** Interactive hazards for this chunk, leaving the safe lane clear. */
  readonly spawns: readonly Spawn[];
  // M3+: eventSlot. Kept off the type until it carries data.
}

export interface CarState {
  /** Current lane the car is settling into (continuous target is `targetLane`). */
  lane: number;
  /** Lane the player has steered toward; the car slides to reach it. */
  targetLane: number;
  /** Continuous lateral position in meters (world X). */
  lateralX: number;
  /** Lateral velocity (m/s), driven by the steering spring. */
  lateralVel: number;
  /** Forward speed in m/s. */
  speed: number;
  /** Height above the road in meters; 0 when grounded. */
  height: number;
  /** Vertical velocity (m/s) while airborne. */
  vertVel: number;
  /** True between a jump launch and its landing. */
  airborne: boolean;
  /**
   * Jump charges in hand. A jump costs one; lift pickups refill them. The jump
   * arc itself never degrades. Scarcity, not a weaker hop, is the cost of
   * jumping (docs/DESIGN.md → Pillar 2).
   */
  jumpCharges: number;
  /**
   * The hull, 0..1 (docs/DESIGN.md → Pillar 2). One bar: crashes chew into it,
   * health pickups refill it, and at 0 the run ends. Damage never touches the
   * controls. The car drives clean until the hull gives out.
   */
  health: number;
  /** Rounds left in the gun. A shot spends ammo; ammo boxes refill it. */
  ammo: number;
  /** Ticks until the gun can fire again (the held-trigger cadence gate). */
  fireCooldown: number;
}

/**
 * A hazard the sim has materialized into the live world. Position is absolute
 * world-forward (meters); the renderer maps it to screen-space against the car's
 * distance. `hit` latches so one wreck damages the car once.
 */
export interface Hazard {
  kind: HazardKind;
  lane: number;
  /** Current lateral world X. Constant for static blockers; a `drifter` eases it. */
  x: number;
  /** Absolute world-forward position in meters. */
  forward: number;
  hit: boolean;
  /**
   * Drift endpoints, set only on a `drifter`: the lane-center X it starts at and
   * the adjacent one it slides into as it nears (`updateDrifters`). Absent on
   * every static blocker. The renderer reads both to yaw the wreck into its slide.
   */
  driftFromX?: number;
  driftToX?: number;
  /**
   * Set only on a `meteor`: `false` while it falls (harmless, just a telegraph
   * shadow), flipped `true` by `updateMeteors` the moment it lands, when it
   * becomes a lethal, un-jumpable blocker. The renderer reads it to switch from
   * the descending rock to the smoking crater.
   */
  landed?: boolean;
}

/**
 * A zombie the sim has materialized into the live world: mowable/shootable
 * fodder, never a damaging blocker (docs/DESIGN.md → Pillar 2). `mowed` latches
 * so one zombie pays scrap once, whether it is rammed or shot. Position mirrors
 * `Hazard` so the renderer maps it the same way; `phase` is deterministic render
 * variety the sim itself ignores.
 */
export interface Zombie {
  readonly lane: number;
  /** Lane-center world X. */
  readonly x: number;
  /** Absolute world-forward position in meters. */
  readonly forward: number;
  readonly phase: number;
  mowed: boolean;
}

/**
 * A collectible the sim has materialized into the live world: a lift pickup
 * (refills a jump charge), a health pickup (repairs the hull), or an ammo box
 * (refills the gun). All spawn only off the safe lane, so every kind of refill is
 * a greed reward (docs/DESIGN.md → Pillar 3). Position mirrors `Hazard`; `phase`
 * is deterministic render variety the sim ignores. `taken` latches so one pickup
 * pays once.
 */
export interface Pickup {
  readonly kind: PickupKind;
  readonly lane: number;
  /** Lane-center world X. */
  readonly x: number;
  /** Absolute world-forward position in meters. */
  readonly forward: number;
  readonly phase: number;
  taken: boolean;
}

export interface SimState {
  /** The run seed; world generation is a pure function of it. */
  seed: number;
  /**
   * The garage loadout this run was started with: the numeric modifiers derived
   * from owned upgrades. Pure run input alongside the seed; the sim reads it,
   * never mutates it, so `(seed, loadout, intents)` reproduces the run exactly.
   */
  loadout: Loadout;
  /** Tick count since the run began. The clock the sim trusts. */
  tick: number;
  /** Total distance driven, in meters. The world streams against this. */
  distance: number;
  car: CarState;
  /** Live hazards near the car, materialized on first sight, pruned behind. */
  hazards: Hazard[];
  /** Live zombies near the car: fodder, materialized and pruned like hazards. */
  zombies: Zombie[];
  /** Live pickups near the car: jump/health/ammo refills, materialized and pruned like hazards. */
  pickups: Pickup[];
  /** Next chunk index whose spawns have not yet been materialized. */
  nextSpawnChunk: number;
  /** Scrap collected this run; the currency mowing pays out. */
  scrap: number;
  /** Total zombies killed this run (a run stat for the death card). */
  zombiesMowed: number;
  /** Current kill streak. Climbs per kill, lapses on the timer or a hull hit. */
  combo: number;
  /** Ticks the current streak survives without a fresh kill; 0 = no streak. */
  comboTicks: number;
  /** True once the hull is destroyed; the run is over. */
  dead: boolean;
  /**
   * What dealt the killing blow, set the tick the hull empties (the blocker kind
   * that crashed it). `null` until death. The death card feeds it to `runTitle`
   * for an attributable, absurd headline (docs/DESIGN.md → death reads as a
   * player's decision).
   */
  deathCause: DeathCause | null;
  /** The one RNG stream (world gen, scheduling). */
  rng: Rng;
  /** Events produced during the current tick. Reused; never reallocated. */
  events: FrameEvent[];
}

/** A read-only view handed to the impure layers. */
export type ReadonlyState = Readonly<SimState>;

/**
 * Normalized player input for one tick. The only channel from input → sim.
 * `steer` is -1 / +1 on the tick a lane-change is requested (0 otherwise) and
 * `jump` is true on the tick a jump is requested. Both are edge-triggered. `fire`
 * is a held state: true while the trigger is down, with the sim gating the
 * cadence, so holding it auto-fires (docs/DESIGN.md → Pillar 2). The input layer
 * does the edge detection; the sim stays pure.
 */
export interface Intent {
  steer: -1 | 0 | 1;
  jump: boolean;
  fire: boolean;
}

export const NO_INTENT: Intent = { steer: 0, jump: false, fire: false };

/**
 * One-tick notifications the render/audio/ui layers consume to fire juice and
 * sound without polling or back-references.
 */
export type FrameEvent =
  | { type: 'laneChanged'; lane: number }
  | { type: 'jumped' }
  | { type: 'landed'; impact: number }
  | { type: 'crashed'; impact: number; lane: number }
  | { type: 'hullDamaged'; amount: number; destroyed: boolean }
  | { type: 'exploded'; x: number; forward: number }
  | { type: 'shotFired'; x: number; level: number }
  | { type: 'zombieMowed'; lane: number; combo: number; x: number }
  | { type: 'pickupCollected'; kind: PickupKind; lane: number; x: number }
  | { type: 'died' };
