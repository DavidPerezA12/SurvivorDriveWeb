/**
 * Acts — the run's named distance bands and the per-act spawn mix that gives each
 * one its own character (docs/DESIGN.md → Run structure: "acts are tuned, not
 * procedural; each act's event mix and spawn weights are data tables"). The world
 * is not one uniform random sheet: every band throws a different challenge.
 *
 * Pure data: the sim reads this to weight each chunk's spawns by where it sits in
 * the run. The render side has its own act mood/scenery tables in
 * `src/render/mood.ts`; both walk the same six acts at the same `ACT_SPAN_M`
 * cadence, so "I died in act III" lines up between what you see and what you fight.
 */

/**
 * Meters each act spans before the next begins; the last act holds forever. Must
 * stay in lock-step with `ACT_SPAN` in `src/render/mood.ts` so gameplay and
 * scenery change place together.
 */
export const ACT_SPAN_M = 6000;

/** Human-readable act names, in order — for death cards and debugging. */
export const ACT_NAMES = ['Outbreak', 'Rust', 'Swarm', 'Visitors', 'Colossus', 'Static'] as const;

/** The per-act spawn mix. Each value is a per-non-safe-lane chance, per chunk. */
export interface SpawnWeights {
  /** Abandoned-car blocker — steer or ram. */
  readonly wreck: number;
  /** Toppled big rig — lethal wall, lane-change only. */
  readonly rig: number;
  /** Low rubble mound — jump or eat a small crash. */
  readonly boulder: number;
  /** Explosive barrel — shoot to clear a crowd. */
  readonly barrel: number;
  /** Drifting wreck — slides one lane over as it nears. */
  readonly drifter: number;
  /** Sky meteor — falls onto its lane, lethal once landed. */
  readonly meteor: number;
  /** Road gap — a hole in the surface; jump it or change lane, or fall in and die. */
  readonly gap: number;
  /** Zombie cluster — mowable/shootable fodder + scrap. */
  readonly zombieCluster: number;
  /** Lift pickup — a jump-charge refill. */
  readonly jumpPickup: number;
  /** Health pickup — repairs the hull. */
  readonly healthPickup: number;
  /** Ammo box — refills the gun. */
  readonly ammoPickup: number;
  /** Zombie cluster size bounds (inclusive). */
  readonly clusterMin: number;
  readonly clusterMax: number;
}

/**
 * Six hand-tuned profiles, one per act. Per-lane chances sum to < 1 so a lane can
 * still come up empty (and the safe lane is always skipped). The character of each
 * band is in the shape of its mix, not just its density.
 */
export const ACT_SPAWNS: readonly SpawnWeights[] = [
  // I · Outbreak — day one in the city, things just starting to go wrong. The
  // calmest act of all: a few stalled cars to thread, the first stray infected,
  // generous pickups, almost open road. No rigs, drifters, meteors or gaps yet —
  // it teaches the controls before the world properly ends.
  {
    wreck: 0.13,
    rig: 0.0,
    boulder: 0.03,
    barrel: 0.04,
    drifter: 0.0,
    meteor: 0.0,
    gap: 0.0,
    zombieCluster: 0.1,
    jumpPickup: 0.1,
    healthPickup: 0.08,
    ammoPickup: 0.1,
    clusterMin: 1,
    clusterMax: 2,
  },
  // II · Rust — abandoned suburbia. Gentle and teaching: wrecks to steer, boulders
  // to learn the jump, lone zombies, generous pickups, lots of open road. No rigs
  // to speak of, no drifters, no sky.
  {
    wreck: 0.16,
    rig: 0.02,
    boulder: 0.12,
    barrel: 0.03,
    drifter: 0.0,
    meteor: 0.0,
    gap: 0.0,
    zombieCluster: 0.14,
    jumpPickup: 0.12,
    healthPickup: 0.08,
    ammoPickup: 0.08,
    clusterMin: 1,
    clusterMax: 2,
  },
  // III · Swarm — the dead flood the lanes. Big hordes, barrels to clear them, ammo
  // to feed the gun. Blockers thin out so the threat is the crowd, not the walls.
  {
    wreck: 0.12,
    rig: 0.03,
    boulder: 0.04,
    barrel: 0.08,
    drifter: 0.02,
    meteor: 0.0,
    gap: 0.0,
    zombieCluster: 0.38,
    jumpPickup: 0.05,
    healthPickup: 0.06,
    ammoPickup: 0.12,
    clusterMin: 2,
    clusterMax: 5,
  },
  // IV · Visitors — the sky turns hostile. Meteors are the signature threat;
  // drifting wrecks and barrels keep the lanes shifting under you.
  {
    wreck: 0.12,
    rig: 0.04,
    boulder: 0.05,
    barrel: 0.06,
    drifter: 0.06,
    meteor: 0.07,
    gap: 0.03,
    zombieCluster: 0.22,
    jumpPickup: 0.05,
    healthPickup: 0.06,
    ammoPickup: 0.09,
    clusterMin: 1,
    clusterMax: 4,
  },
  // V · Colossus — giants stomp through. The wall act: rigs and wrecks everywhere,
  // boulders and drifters on top, pickups scarce. Reading the open line is the game.
  {
    wreck: 0.15,
    rig: 0.12,
    boulder: 0.1,
    barrel: 0.05,
    drifter: 0.06,
    meteor: 0.03,
    gap: 0.05,
    zombieCluster: 0.16,
    jumpPickup: 0.05,
    healthPickup: 0.05,
    ammoPickup: 0.07,
    clusterMin: 1,
    clusterMax: 3,
  },
  // VI · Static — reality fraying. Everything at once, maxed: every blocker, the
  // biggest hordes, meteors raining. Just enough pickups to keep a great run alive.
  {
    wreck: 0.14,
    rig: 0.09,
    boulder: 0.09,
    barrel: 0.07,
    drifter: 0.07,
    meteor: 0.07,
    gap: 0.06,
    zombieCluster: 0.16,
    jumpPickup: 0.05,
    healthPickup: 0.06,
    ammoPickup: 0.08,
    clusterMin: 2,
    clusterMax: 6,
  },
];

/** Which act (0-based, clamped to the last) a given distance falls in. */
export function actAt(distance: number): number {
  const i = Math.floor(Math.max(0, distance) / ACT_SPAN_M);
  return Math.min(i, ACT_SPAWNS.length - 1);
}

/** The spawn mix for the act a given distance sits in. */
export function spawnWeightsAt(distance: number): SpawnWeights {
  return ACT_SPAWNS[actAt(distance)];
}

/**
 * The act tables give each band its *character* (the shape of its mix). Difficulty
 * escalation rides on top of them so the absolute pressure climbs continuously
 * across a run instead of sitting flat inside each act and plateauing forever once
 * the last act repeats. Pure functions of distance so the road stays deterministic
 * per seed; `world.ts` reads them when it picks and resolves each chunk's formation
 * (`src/content/formations.ts`).
 */
export const DIFFICULTY_TUNING = {
  /** Formation-hardness bias at distance 0: the opening eases in below neutral. */
  intensityStart: 0.8,
  /** Distance (m) by which intensity has climbed back to neutral (1.0). */
  intensityWarmup: 9000,
  /** The most intensity ever reaches, deep into the endless tail. */
  intensityMax: 1.55,
  /** Distance (m) by which intensity reaches `intensityMax`. */
  intensityRampDistance: 60000,
  /**
   * Pacing: a chunk leaves itself open road (a breather beat) with this chance at
   * the eased-in opening, falling to `openChanceDeep` in the tail. Breathers space
   * the formations out so each reads as a deliberate beat with room to recover
   * between, instead of a wall of obstacles every 50 m. The opening breathes and
   * teaches; the deep tail is near wall-to-wall. Interpolated over the same
   * intensity range as everything else.
   */
  openChanceStart: 0.14,
  openChanceDeep: 0.03,
  /**
   * How hard intensity tilts formation selection toward the punishing formations
   * (and away from the gentle ones) as it moves off neutral. Higher = the opening
   * stays calmer and the deep tail nastier (`formationWeight`).
   */
  hardnessBias: 1.4,
  /**
   * Chance a plain wreck in a formation is upgraded to an un-jumpable rig, scaled
   * by how far lethality sits above 1. Lets the deadly-line escalation reach the
   * formations that only carry wrecks, so the deep tail's blockers turn nastier
   * even when the same formation repeats.
   */
  lethalWreckUpgrade: 0.32,
  /** Pickup frequency multiplier early in a run (teaching is generous). */
  pickupScaleStart: 1,
  /** Pickup frequency multiplier deep in a run (the hull/ammo economy tightens). */
  pickupScaleMin: 0.6,
  /** Distance (m) over which pickup frequency falls from start to min. */
  pickupScaleDistance: 36000,
  /**
   * Formation choice plateaus once the deep acts are drawing their hardest set.
   * The mix keeps escalating past that through this factor: it scales the chance a
   * formation's plain wrecks upgrade to un-jumpable rigs (`lethalWreckUpgrade`),
   * so the same late formation's blockers turn deadlier the deeper a run goes.
   */
  lethalityStart: 1,
  /** The most the deadly-line hazards are over-weighted, deep in. */
  lethalityMax: 2.3,
  /** Distance (m) by which lethality reaches its max. */
  lethalityRampDistance: 72000,
} as const;

/** Linear ramp from `a` to `b` as `d` goes 0..`span`, clamped at both ends. */
function ramp(d: number, span: number, a: number, b: number): number {
  const t = Math.max(0, Math.min(d / span, 1));
  return a + (b - a) * t;
}

/**
 * Threat-density multiplier at a distance: eases in below 1 for the opening, climbs
 * back to the table value, then keeps rising slowly toward `intensityMax` so a long
 * run is a genuine gauntlet rather than a fixed plateau.
 */
export function intensityAt(distance: number): number {
  const d = Math.max(0, distance);
  const t = DIFFICULTY_TUNING;
  if (d < t.intensityWarmup) return ramp(d, t.intensityWarmup, t.intensityStart, 1);
  return ramp(d - t.intensityWarmup, t.intensityRampDistance - t.intensityWarmup, 1, t.intensityMax);
}

/** Pickup-frequency multiplier at a distance: generous early, scarce deep in. */
export function pickupScaleAt(distance: number): number {
  const t = DIFFICULTY_TUNING;
  return ramp(Math.max(0, distance), t.pickupScaleDistance, t.pickupScaleStart, t.pickupScaleMin);
}

/**
 * Over-weight factor for the deadly-line hazards (rig, meteor, gap) at a distance:
 * climbs with the run so the endless tail keeps getting deadlier in composition
 * even once raw density has hit the clamp.
 */
export function lethalityAt(distance: number): number {
  const t = DIFFICULTY_TUNING;
  return ramp(Math.max(0, distance), t.lethalityRampDistance, t.lethalityStart, t.lethalityMax);
}

/**
 * Chance a chunk is left as open road (a breather beat) at the given intensity:
 * generous in the eased-in opening, near zero deep in. Drives the pacing between
 * formations so each reads as a deliberate beat (`world.ts`).
 */
export function openChanceAt(intensity: number): number {
  const t = DIFFICULTY_TUNING;
  const span = t.intensityMax - t.intensityStart;
  const f = span <= 0 ? 1 : Math.max(0, Math.min((intensity - t.intensityStart) / span, 1));
  return t.openChanceStart + (t.openChanceDeep - t.openChanceStart) * f;
}
