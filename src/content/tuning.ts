/**
 * Tuning constants — data, not code.
 *
 * Everything here is expressed per second (or in meters), never per tick, so
 * a future change to the simulation tick rate is a one-line edit and never a
 * re-tuning pass (docs/ARCHITECTURE.md → Game loop).
 *
 * The combo window is the one exception that is honestly per-tick: it is a
 * gameplay countdown the sim owns, not a physical rate (see ECONOMY_TUNING).
 */

/**
 * Number of lanes, including the two shoulders. Lane 0 is the far left.
 *
 * Tuned to 4 (down from the original 5): a narrower road leaves less room to
 * dodge, so clean driving stays tense. This is the global difficulty lever.
 * Everything (sim and render) derives from this constant; nothing hardcodes a
 * lane count, so this is the single knob. An even count means no centre lane:
 * the car starts just right of centre and the road is symmetric about a divider.
 */
export const LANE_COUNT = 4;

/** Width of a single lane, in meters. */
export const LANE_WIDTH = 3.2;

/** Length of one road chunk, in meters (docs/ARCHITECTURE.md → Chunks). */
export const CHUNK_LENGTH = 50;

/** How far ahead of the car the world is materialized, in meters. */
export const LOOKAHEAD = 250;

/** Car kinematics. Speeds in m/s, acceleration in m/s². */
export const CAR_TUNING = {
  /** Base cruising speed the car ramps up to at the start of a run. */
  baseTopSpeed: 50,
  /**
   * The speed ramp is two stages. The first is the M1 feel ramp: a quick climb to
   * a comfortable cruise over the opening stretch, unchanged from how it was tuned
   * by hand. The second is a slow, distance-long climb that never stops, so the
   * car keeps getting faster the deeper a run goes. Speed is the one difficulty
   * lever that bites even a player glued to the safe lane (less road per second to
   * read the wandering safe line and the threats beside it), and the only one that
   * keeps escalating once the act mix has maxed out. It is capped, so the car is
   * fast but never uncontrollable.
   */
  earlyGain: 16,
  /** Distance (m) over which the early feel ramp reaches full `earlyGain`. */
  earlyRampDistance: 2200,
  /** Extra cruising speed the slow late ramp adds on top, fully gained by `lateRampDistance`. */
  lateGain: 18,
  /** Distance (m), measured from the start, by which the late ramp is fully gained. */
  lateRampDistance: 50000,
  /** Forward acceleration toward the current cruising speed. */
  accel: 20,

  /**
   * Lateral steering as a critically-damped spring toward the target lane:
   * `omega` is the natural frequency (higher = snappier). Critical damping
   * (2·omega) gives "snappy but analog" with no overshoot. This is the velocity
   * curve M0's flat rate promised.
   */
  lateralOmega: 15,

  /** Jump launch velocity (m/s) and gravity (m/s²): ~0.6 s arc, ~1.1 m peak. */
  jumpImpulse: 7,
  gravity: 22,
  /**
   * Jump is a charge resource, not a degrading hop: the arc is always the same
   * height, but each jump spends one charge and you only get more by running
   * over lift pickups. Scarcity is the cost (docs/DESIGN.md → Pillar 2). The car
   * starts with a few in hand and can bank up to a cap, so a refill found at full
   * is never wasted by much.
   */
  jumpStartCharges: 2,
  jumpMaxCharges: 5,

  /**
   * The hull: one health bar in 0..1 (docs/DESIGN.md → Pillar 2). A crash chews
   * into it; at 0 the run ends. Health pickups refill it. Damage never touches
   * the controls — the car drives clean until the hull gives out.
   */
  startHealth: 1,
  maxHealth: 1,
} as const;

/** Roadside decoration generation (docs/DESIGN.md → readability: never on-road). */
export const DECOR_TUNING = {
  /** Expected decorative props per chunk (Poisson-ish via per-slot rolls). */
  maxPerChunk: 4,
  /** How far past the road edge props may sit, in meters. */
  marginMin: 1.5,
  marginMax: 7,
} as const;

/**
 * Spawning, the parts shared by every act. The mix (which blockers, how dense,
 * how big the hordes) is per-act data in `src/content/acts.ts` so each tramo
 * throws a different challenge; this holds only the constants that do not change
 * by act. The safe lane is never touched, which is why it always pays
 * worst: scrap only lives on the lanes you must leave safety to reach
 * (docs/DESIGN.md → Pillar 3: greed is the slider).
 */
export const SPAWN_TUNING = {
  /** Chunks at the start of a run with nothing spawned, so the drive eases in. */
  graceChunks: 2,
  /** Spacing along the lane (m) between zombies in a cluster (act sets the count). */
  clusterSpacing: 2.6,
} as const;

/**
 * The scrap economy and mow streak (docs/DESIGN.md → Pillar 2). Each kill pays
 * scrap and feeds a streak that pays more, so a clean run down an infested lane is
 * the early greed play.
 */
export const ECONOMY_TUNING = {
  /** Scrap for the first kill in a streak. */
  mowScrapBase: 3,
  /** Extra scrap per additional kill in the streak, until the cap. */
  mowScrapStep: 1,
  /** Streak length past which mow scrap stops climbing. */
  comboScrapCap: 12,
  /** Ticks a streak survives without a fresh kill before it lapses (~1.4 s). */
  comboWindowTicks: 84,
} as const;

/** How mowing feels in the hands: a surge, never a slowdown (docs/DESIGN.md → Juice). */
export const MOW_TUNING = {
  /** Forward speed kick (m/s) each mow grants; fodder rewards momentum. */
  speedBoost: 1.6,
  /** Most a streak may push speed above cruising (m/s), so it never runs away. */
  overspeedCap: 9,
} as const;

/**
 * Crash damage and momentum loss (docs/DESIGN.md → Pillar 2). A collision chews
 * the single hull bar and punches the car's speed, never its handling. A square
 * head-on hit costs the most of both; a glancing clip costs less. Armor
 * (the loadout's `damageMul`) scales only the hull loss, never the frenazo.
 */
export const CRASH_TUNING = {
  /** Speed (m/s) at which a crash deals its full hull/momentum cost. */
  fullDamageSpeed: 58,
  /** Hull fraction (0..1) lost by a full-speed square hit / glancing clip. */
  frontalHealthLoss: 0.34,
  glancingHealthLoss: 0.14,
  /** Speed retained after a crash: a square hit bites momentum, a clip less so. */
  frontalSpeedKeep: 0.45,
  glancingSpeedKeep: 0.78,

  /**
   * The toppled rig is a different class of crash. Its hull cost is scaled up so
   * a square hit at top speed empties the bar outright — hit one head-on at
   * full tilt and the run is over, full hull or not. Severity still scales with
   * speed, so a slow nudge only dents you. It stops the car near-dead.
   */
  rigDamageMul: 3,
  rigSpeedKeep: 0.18,

  /**
   * The boulder is the gentlest blocker: a low rubble mound you are meant to
   * jump. Ramming one still costs hull and momentum, but less than a wreck: its
   * hull cost is scaled down and it keeps more speed, so the lesson is "I should
   * have jumped," not "the run is over" (docs/DESIGN.md → roster).
   */
  boulderDamageMul: 0.55,
  boulderSpeedKeep: 0.62,

  /**
   * Ramming an explosive barrel is the worst non-rig crash: the drum goes off in
   * your face. Its hull cost is scaled up (above a wreck, below the lethal rig)
   * and it stops the car hard. The smart play is to shoot it from a distance;
   * eating one is the punishment for not (docs/DESIGN.md → roster).
   */
  barrelDamageMul: 1.7,
  barrelSpeedKeep: 0.4,

  /**
   * A landed meteor is a direct hit from the sky: the deadliest blocker, scaled
   * like the rig so a square hit at speed empties the hull outright, and it stops
   * the car near-dead. The telegraph (the falling shadow) is what keeps it fair.
   */
  meteorDamageMul: 3,
  meteorSpeedKeep: 0.18,

  /**
   * The UFO beam is a heavy strike, scaled like a meteor so a square hit at speed
   * empties the hull, but unlike the meteor it is ground-class: a jump clears it,
   * and the safe lane is never swept. The sweep telegraph is what keeps it fair.
   */
  beamDamageMul: 2.7,
  beamSpeedKeep: 0.3,
} as const;

/**
 * The explosive barrel's blast (docs/DESIGN.md → roster: the gun's area tool). A
 * detonation (shot, rammed, or chained) clears live zombies within a box around
 * the barrel and chains to any other barrel nearby, so a barrel parked by a horde
 * pays off the whole crowd. Distances in meters; lateral spans ~one lane each
 * side so the blast reaches the lanes beside the barrel, not just its own.
 */
export const BARREL_TUNING = {
  /** How far along the lane the kill reaches from the barrel. */
  blastForward: 7,
  /** How far to each side the kill reaches (≈ one lane each way). */
  blastLateral: LANE_WIDTH * 1.5,
  /** Forward reach that sets off a neighbouring barrel. */
  chainForward: 9,
  /** Lateral reach that sets off a neighbouring barrel. */
  chainLateral: LANE_WIDTH * 1.5,
} as const;

/**
 * The drifting wreck's slide (docs/DESIGN.md → roster). It starts in its lane and
 * eases one lane over as the gap (forward − distance) closes from `startGap` to
 * `endGap`, then sits still for the final approach. Because the change begins
 * ~2 s out and the wreck is visible from the spawn horizon the whole time, the
 * slide is the telegraph. It never pops into your lane at the last moment.
 * Settling before `endGap` means a square hit
 * is always on a lane it has plainly committed to.
 */
export const DRIFT_TUNING = {
  /** Gap (m) at which the slide begins. */
  startGap: 100,
  /** Gap (m) by which the slide has finished and the wreck sits still. */
  endGap: 45,
} as const;

/**
 * The sky meteor's fall (docs/DESIGN.md → roster; every killer telegraphs ≥ 2 s).
 * As the gap (forward − distance) closes from `telegraphGap`, the rock descends in
 * its target lane. The descent itself is the telegraph, a glowing meteor you see
 * coming from the sky, not a marker painted on the road. At `impactGap` it lands
 * and turns lethal. `telegraphGap` is well over two seconds of road at cruising
 * speed (~50–66 m/s), so the threatened lane reads long before impact, and the
 * rock lands just ahead of the bumper, never on the player's head from nowhere.
 */
export const METEOR_TUNING = {
  /** Gap (m) at which the shadow appears and the rock starts to fall. */
  telegraphGap: 150,
  /** Gap (m) at which the rock lands and becomes a lethal blocker. */
  impactGap: 6,
  /** Height (m) the rock falls from when the telegraph begins. */
  fallHeight: 60,
} as const;

/**
 * The quake-split event (docs/DESIGN.md → Pillar 1: the road is the boss). A run of
 * gaps that tear open in a wave across the non-safe lanes. Each starts as a harmless
 * telegraph crack, visible from the spawn horizon, and only opens into a lethal hole
 * once the car is within `openGap` meters. That is ~1.5 s of road at cruising speed,
 * enough to jump it or be on a lane that holds, while the crack itself reads from
 * far off. The safe lane never cracks, so fleeing to it is always an out.
 */
export const QUAKE_TUNING = {
  /** Gap (m) at which a telegraph crack tears open into a lethal hole. */
  openGap: 90,
} as const;

/**
 * The UFO beam sweep (docs/DESIGN.md → Pillar 1: the road is the boss). A lethal
 * strip that eases laterally from its start lane across to its target lane as the
 * gap closes from `startGap` to `endGap`, then holds there for the final approach.
 * The sweep is visible from the spawn horizon, well over two seconds of road, and
 * settles on a committed lane before the crossing, so the strike is never a
 * surprise. The strip stays among non-safe lanes; the safe lane is the refuge.
 */
export const BEAM_TUNING = {
  /** Gap (m) at which the sweep begins. */
  startGap: 150,
  /** Gap (m) by which the sweep has finished and the strip holds its target lane. */
  endGap: 30,
} as const;

/**
 * The mounted gun's level-independent constants (docs/DESIGN.md → Pillar 2). The
 * per-tier stats (range, cadence, kills-per-shot, lane spread, ammo) live in
 * `content/weapons.ts` (the weapon level indexes that table). Modeled as a
 * per-shot hitscan against the nearest live zombies ahead. No projectile bodies,
 * so the tick path stays allocation-free.
 */
export const WEAPON_TUNING = {
  /** Ammo spent per shot (every tier). */
  ammoPerShot: 1,
  /** Half-width (m) of the base one-lane column; spread tiers widen it per lane. */
  laneHalfWidth: LANE_WIDTH * 0.5,
} as const;

/** What the on-road repair/ammo pickups restore (docs/DESIGN.md → roster). */
export const PICKUP_TUNING = {
  /** Hull fraction (0..1) a health pickup restores. */
  healthRestore: 0.25,
  /** Ammo a single box refills. */
  ammoRestore: 30,
} as const;

/** Lateral world-space X of a lane center. Lane 0 is leftmost, centered on 0. */
export function laneCenterX(lane: number): number {
  return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
}

/** Half the drivable width, from the center to the outer edge of a shoulder. */
export function roadHalfWidth(): number {
  return (LANE_COUNT / 2) * LANE_WIDTH;
}
