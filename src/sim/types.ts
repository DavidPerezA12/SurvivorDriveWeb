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
 * Interactive objects on the road, split into two readable classes by silhouette
 * (docs/DESIGN.md → readability: lethal reads as a massive wall, survivable reads
 * as low bumpable junk):
 *
 * Survivable blockers (low, warm, jumpable, a hit you live to regret): the
 * abandoned-car `wreck`, the `boulder` rubble mound, the explosive `barrel`
 * (shoot to detonate, ram for a big hit), and the `drifter` (a wreck that slides
 * one lane over as it nears).
 *
 * Lethal walls (tall solid mass, un-jumpable, a square hit ends the run): the
 * toppled big-`rig`, the concrete `barrier`, the crashed `bus` (a long wall),
 * plus the late-event `meteor`. They read as "you cannot pass this, dodge it."
 *
 * Lethal ground traps (on the road surface, jumpable or dodgeable, fatal if you
 * are on them grounded): the `gap` (a hole), the `spikes` strip, and the UFO
 * `beam`.
 *
 * The `ramp` is the lone non-damaging on-road object: collapsed-building rubble
 * piled into a launch ramp. Driving onto it grounded vaults the car over the
 * debris beyond (a free launch, no hull cost). It shares the static `{lane, z}`
 * shape, so it rides the same spawn/hazard plumbing as the blockers.
 *
 * Plus the `zombie` (mowable/shootable fodder; a `brute` variant is a heavy one
 * that costs hull if you ram it instead of shooting it), and three cool
 * collectibles: a lift pickup (refills a jump charge), a health pickup (repairs
 * the hull), and an ammo box (refills the gun). Zombie and every pickup carry a
 * deterministic `phase`: render-only variety (shamble/bob offset, yaw) the sim
 * never reads.
 */
export type SpawnKind =
  | 'wreck'
  | 'rig'
  | 'barrier'
  | 'bus'
  | 'barricade'
  | 'boulder'
  | 'barrel'
  | 'spikes'
  | 'drifter'
  | 'meteor'
  | 'gap'
  | 'beam'
  | 'ramp'
  | 'zombie'
  | 'jump'
  | 'health'
  | 'ammo'
  | 'scrap';

/**
 * The objects spawned with a plain `{lane, z}` shape (everything but the
 * `drifter`, which also carries a target lane). The `meteor` shares the shape but
 * is not literally static; it falls from the sky onto its lane (`updateMeteors`).
 * The `ramp` shares the shape too but is the lone non-damaging member: it launches
 * the car over the debris rather than crashing it (`resolveCollisions`).
 */
export type StaticHazardKind =
  | 'wreck'
  | 'rig'
  | 'barrier'
  | 'bus'
  | 'barricade'
  | 'boulder'
  | 'barrel'
  | 'spikes'
  | 'meteor'
  | 'gap'
  | 'ramp';

/**
 * The damaging on-road blockers, shared by `Spawn` and `Hazard`, in three
 * readability classes (docs/DESIGN.md → readability):
 *
 * - Ground-class survivable: `wreck`, `boulder`, `barrel`, `drifter`. A jump
 *   sails over them and a hit only chews hull. The `barrel` is the one the gun
 *   can detonate (`detonateBarrel`); the `drifter` slides one lane over as it nears.
 * - Lethal walls: `rig`, `barrier`, `bus`, and a landed `meteor`. Too tall/solid
 *   to clear (the only out is a lane change); a square hit at speed ends the run.
 * - Lethal ground traps: the `gap` (a hole), the `spikes` strip, and the `beam`.
 *   Not things you ram but things you must not be on while grounded: jump them or
 *   change lane, or die (the road is the boss).
 * - The lone friendly object: the `ramp` (collapsed-building rubble). Driving onto
 *   it grounded launches the car over the debris beyond, no hull cost. It lives in
 *   the hazard list only to share the spawn/prune/render plumbing.
 */
export type HazardKind = StaticHazardKind | 'drifter' | 'beam';

/**
 * The on-ground collectible kinds, shared by `Spawn` and `Pickup`: a `jump` lift
 * charge, a `health` repair, an `ammo` box, and a `scrap` salvage cache (instant
 * scrap, a pure greed grab with no fight). All spawn off the safe lane.
 */
export type PickupKind = 'jump' | 'health' | 'ammo' | 'scrap';

export type Spawn =
  | {
      readonly kind: StaticHazardKind;
      /** Lane index the object blocks. Never the chunk's safe lane. */
      readonly lane: number;
      /** Offset along the chunk, in meters from its near edge, 0..CHUNK_LENGTH. */
      readonly z: number;
      /**
       * Set only on a quake-event `gap`: it starts as a harmless telegraph crack and
       * only tears open (lethal) once the car is within range (`updateQuakes`). A
       * plain static gap leaves this unset and is lethal from the start.
       */
      readonly opening?: boolean;
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
      readonly kind: 'beam';
      /** The non-safe lane the sweep starts over. */
      readonly lane: number;
      readonly z: number;
      /**
       * The non-safe lane the beam sweeps across to as it nears. The sweep stays
       * among non-safe lanes and never crosses the safe lane, so fleeing to safety
       * is always the out (docs/DESIGN.md → the safe line always exists).
       */
      readonly toLane: number;
    }
  | {
      readonly kind: 'zombie';
      readonly lane: number;
      readonly z: number;
      /** Deterministic 0..1 render variety; the sim never reads it. */
      readonly phase: number;
      /**
       * A brute: a heavy zombie that is a damaging obstacle, not free fodder.
       * Ramming one costs hull and momentum (and breaks the streak); the gun takes
       * several hits to drop it. The renderer draws it as a bigger, bulkier
       * silhouette so it reads apart from a normal shambler (docs/DESIGN.md → roster).
       */
      readonly brute?: boolean;
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
  /**
   * Set only on a quake-event `gap`: `false` while it is just a telegraph crack
   * (harmless, collisions skip it), flipped `true` by `updateQuakes` the moment it
   * tears open into a lethal hole. Undefined on a plain static gap, which is lethal
   * from the start. The renderer reads it to draw a glowing fissure before the pit.
   */
  open?: boolean;
  /**
   * Sweep endpoints, set only on a `beam`: the lane-center X it starts over and the
   * one it sweeps across to as it nears (`updateBeams` eases `x` between them). Both
   * are non-safe lanes, so the lethal strip never crosses the safe line. The
   * renderer reads `x` for the beam column and the ground glow that telegraphs it.
   */
  beamFromX?: number;
  beamToX?: number;
  /**
   * Shootable integrity, set only on a `wreck`/`drifter` (a car): the gun chips it
   * down and blows it apart at 0 (`resolveShots`). The bigger the cannon, the fewer
   * shots it takes. Undefined on hazards the gun cannot destroy (rig, boulder,
   * meteor, gap), which must still be dodged.
   */
  hp?: number;
}

/**
 * A zombie the sim has materialized into the live world: mowable/shootable
 * fodder. `mowed` latches so one zombie pays scrap once, whether it is rammed or
 * shot. Position mirrors `Hazard` so the renderer maps it the same way; `phase` is
 * deterministic render variety the sim itself ignores.
 *
 * A `brute` is the exception to "fodder never damages": a heavy zombie that is a
 * real obstacle. Ramming one costs hull and momentum like a crash (and breaks the
 * streak), and the gun needs several hits to drop it (`hp`). The smart play is to
 * shoot it from range or dodge it, not bulldoze it (docs/DESIGN.md → roster).
 */
export interface Zombie {
  readonly lane: number;
  /** Lane-center world X. */
  readonly x: number;
  /** Absolute world-forward position in meters. */
  readonly forward: number;
  readonly phase: number;
  mowed: boolean;
  /** True on a brute: a damaging heavy zombie, not free fodder. */
  readonly brute?: boolean;
  /**
   * Shootable integrity, set only on a brute: each shot's `killsPerShot` chips it
   * and it drops at 0 (`resolveShots`). Undefined on a normal zombie, which dies
   * in one hit.
   */
  hp?: number;
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
  | { type: 'ramped'; x: number; forward: number }
  | { type: 'landed'; impact: number }
  | { type: 'crashed'; impact: number; lane: number }
  | { type: 'hullDamaged'; amount: number; destroyed: boolean }
  | { type: 'exploded'; x: number; forward: number }
  | { type: 'shotFired'; x: number; level: number }
  | { type: 'zombieMowed'; lane: number; combo: number; x: number }
  | { type: 'pickupCollected'; kind: PickupKind; lane: number; x: number }
  | { type: 'died' };
