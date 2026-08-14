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
  | 'pole'
  | 'barrel'
  | 'toxbarrel'
  | 'spikes'
  | 'livewire'
  | 'drifter'
  | 'meteor'
  | 'stomp'
  | 'shell'
  | 'gap'
  | 'beam'
  | 'ramp'
  | 'zombie'
  | 'jump'
  | 'health'
  | 'ammo'
  | 'scrap'
  | 'coin'
  | 'shield';

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
  | 'pole'
  | 'barrel'
  | 'toxbarrel'
  | 'spikes'
  | 'livewire'
  | 'meteor'
  | 'stomp'
  | 'shell'
  | 'gap'
  | 'ramp';

/**
 * The damaging on-road blockers, shared by `Spawn` and `Hazard`, in three
 * readability classes (docs/DESIGN.md → readability):
 *
 * - Ground-class survivable: `wreck`, `boulder`, `pole`, `barrel`, `toxbarrel`,
 *   `drifter`. A jump sails over them and a hit only chews hull. The `barrel` is the
 *   one the gun can detonate (`detonateBarrel`) for a wide chain-clear; the
 *   `toxbarrel` ruptures (shot or rammed) into a lingering `GasCloud` that denies its
 *   lane; the `drifter` slides one lane over as it nears. The `pole` (a downed
 *   utility pole) is the wide one: it spans its whole lane, so there is no
 *   within-lane dodge — hop it or leave the lane.
 * - Lethal walls: `rig`, `barrier`, `bus`, and a landed `meteor`. Too tall/solid
 *   to clear (the only out is a lane change); a square hit at speed ends the run.
 * - Lethal ground traps: the `gap` (a hole), the `spikes` strip, the `livewire`
 *   (a downed cable still arcing, as wide as its lane), and the `beam`. Not things
 *   you ram but things you must not be on while grounded: jump them or change
 *   lane, or die (the road is the boss).
 * - The lone friendly object: the `ramp` (collapsed-building rubble). Driving onto
 *   it grounded launches the car over the debris beyond, no hull cost. It lives in
 *   the hazard list only to share the spawn/prune/render plumbing.
 */
export type HazardKind = StaticHazardKind | 'drifter' | 'beam';

/**
 * The on-ground collectible kinds, shared by `Spawn` and `Pickup`: a `jump` lift
 * charge, a `health` repair, an `ammo` box, a `scrap` salvage cache (one fat
 * instant grab), and a `coin` (a single small scrap nugget, laid in trails down a
 * risky lane so the money lures the car off the safe line). All spawn off the safe
 * lane, so every refill and every grab is a greed reward (docs/DESIGN.md → Pillar 3).
 */
export type PickupKind = 'jump' | 'health' | 'ammo' | 'scrap' | 'coin' | 'shield';

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
      /**
       * Optional lateral offset (meters) from the lane center, kept within the lane so
       * the body never reaches the safe line. Used by the mecha barrage to stagger its
       * shells across the wide threat lane into a pattern rather than one stacked
       * column. Unset means the object sits on the lane center.
       */
      readonly dx?: number;
    }
  | {
      readonly kind: 'drifter';
      /** The lane it sweeps within. Never the chunk's safe lane. */
      readonly lane: number;
      readonly z: number;
      /**
       * The world-X endpoints of the lateral sweep, both inside `lane`: it starts at
       * `fromX` (the far edge) and eases to `toX` (the safe-lane side of its own lane)
       * as it nears. Both are bounded so the wreck's body never reaches the safe line,
       * so it threatens a greedy line within the lane without closing the refuge
       * (docs/DESIGN.md → Pillar 3: the safe lane always stays open).
       */
      readonly fromX: number;
      readonly toX: number;
    }
  | {
      readonly kind: 'beam';
      /** The non-safe lane the sweep stays within. */
      readonly lane: number;
      readonly z: number;
      /**
       * The world-X endpoints of the beam's sweep, both inside `lane`: it eases from
       * `fromX` across to `toX` as it nears. Both are bounded so the lethal strip never
       * reaches the safe lane, so fleeing to safety is always the out (docs/DESIGN.md →
       * the safe line always exists).
       */
      readonly fromX: number;
      readonly toX: number;
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
      /**
       * A jumper: a leaper that latches onto the hood and drains hull regardless of
       * lane (docs/DESIGN.md → the one threat that reaches the safe line). Shoot it
       * before it leaps, or shake it off by ramming/scraping; you cannot mow it for
       * scrap. Mutually exclusive with `brute`.
       */
      readonly jumper?: boolean;
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
  /** Lane index the car is currently nearest, derived from `lateralX` for HUD/audio cues. */
  lane: number;
  /** Continuous lateral position in meters (world X); the free wheel moves this directly. */
  lateralX: number;
  /** Lateral velocity (m/s), eased toward the held steer axis's target speed. */
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
  /**
   * Jumper zombies currently latched onto the hood. Each one drains hull every tick
   * (`updateClingers`), regardless of lane, so a latch is felt even on the safe line.
   * A fired shot peels one off; a crash (ram or scrape) shakes them all loose. At 0
   * the car drives clean. Never touches the controls (docs/DESIGN.md → Pillar 2).
   */
  clinging: number;
  /**
   * Ticks of shield left (0 = no shield). While up, hull costs are absorbed —
   * crashes, wall hits, gas, and clinger drain chew the bubble's time instead of
   * the bar — but momentum costs (the frenazo) still land in full, and the
   * lethal ground traps (gap, spikes, live wire) still kill: a bubble does not
   * fill a hole. The shield pickup grants it (docs/DESIGN.md → power-ups: risky
   * lanes only, short, earned). Never touches the controls.
   */
  shieldTicks: number;
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
   * Set on a `stomp`/`shell` the moment its telegraph begins: the T-Rex foot has
   * locked onto the car's lateral position (and the mecha shell onto where the
   * car is heading), clamped inside its own lane so the safe line is never
   * struck. Locked exactly once — the shadow then holds, and the telegraph
   * window is the time to get out from under it (`updateMeteors`).
   */
  aimed?: boolean;
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
   * True on a jumper: a leaper that latches onto the hood instead of being mowed.
   * `mowed` latches the moment it leaps (so it pays/leaps once and prunes like any
   * other), but it banks no scrap; the cost lands as a hull drain while it clings
   * (`updateClingers`). Shootable like a normal zombie before it reaches you.
   */
  readonly jumper?: boolean;
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

/**
 * A lingering cloud of toxic gas left when a `toxbarrel` ruptures (shot or rammed).
 * It does not move and is not a thing you crash into; it is an area-denial hazard
 * that drains the hull while the car is grounded inside it, so the toxic drum's
 * payoff is "you made that lane poison for a couple of seconds" (docs/DESIGN.md →
 * roster). A jump clears it (you are above the cloud). It expires after `life` ticks.
 */
export interface GasCloud {
  /** The lane the cloud sits over (the ruptured drum's lane). */
  readonly lane: number;
  /** Lane-center world X. */
  readonly x: number;
  /** Absolute world-forward position in meters (fixed where the drum ruptured). */
  readonly forward: number;
  /** Ticks of life remaining; the cloud is removed at 0. */
  life: number;
  /** Total life it was born with, so the renderer can fade it as it thins. */
  readonly maxLife: number;
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
  /** Live toxic gas clouds left by ruptured toxbarrels; ticked down and pruned each tick. */
  gas: GasCloud[];
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
  /** Events produced during the current tick. Reused; never reallocated. */
  events: FrameEvent[];
}

/** Recursively freeze the type surface handed across the sim/render border. */
type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

/** A deeply read-only view handed to the impure layers. */
export type ReadonlyState = DeepReadonly<SimState>;

/**
 * Normalized player input for one tick. The only channel from input → sim.
 * `steer` is a held axis: -1 (left) / +1 (right) while a steer key is down, 0 when
 * centered, so the car drives continuously across the road rather than snapping
 * lane to lane. `jump` is edge-triggered, true on the tick a jump is requested.
 * `fire` is a held state: true while the trigger is down, with the sim gating the
 * cadence, so holding it auto-fires (docs/DESIGN.md → Pillar 2). The input layer
 * does the edge detection for jump; the sim stays pure.
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
  | { type: 'jumperLatched'; x: number }
  | { type: 'jumperShed'; count: number }
  | { type: 'gasReleased'; x: number; forward: number }
  | { type: 'shieldExpired' }
  | { type: 'died' };
