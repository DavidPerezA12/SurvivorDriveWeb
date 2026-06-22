/**
 * Formations — the road's challenge is authored, not scattered.
 *
 * The old generator rolled each lane independently against a weight table, which
 * produced noise: lone objects with no relationship to each other and pickups that
 * landed wherever the dice fell. A road made of noise never reads as a challenge
 * and never feels hard (docs/DESIGN.md → Pillar 1: the road is the boss).
 *
 * Instead, each chunk lays down one hand-authored formation: a small set-piece of
 * obstacles that forces a decision, with its pickups placed in relation to the
 * threat they answer (ammo *before* the horde you must shoot through, a lift charge
 * *before* the gap you must jump, health *after* the gauntlet, the fat scrap cache
 * on the greedy lane you must leave safety to reach). The safe lane is always left
 * clear, so a survivable line always exists (the greed pillar); everything else is
 * deliberate.
 *
 * Pure data plus a pure weight helper. The sim (`src/sim/world.ts`) reads this,
 * picks one formation per chunk by seeded RNG, and resolves its cells into spawns
 * relative to that chunk's safe lane. Difficulty escalates by *which* formations
 * the deeper acts can draw and by the intensity-driven bias toward the harder ones.
 */

/** The semantic role a formation cell plays; the sim maps it to a concrete spawn. */
export type FormationRole =
  | 'wreck' // steerable blocker
  | 'rig' // un-jumpable wall, lane-change only
  | 'boulder' // jump-clears, small ram
  | 'barrel' // shoot to clear (and the crowd around it)
  | 'drifter' // slides one lane over as it nears
  | 'beam' // a UFO beam strip that sweeps across the flanking lanes
  | 'meteor' // falls onto its lane, then lethal
  | 'gap' // hole in the road; jump it or change lane
  | 'crackgap' // a quake gap: a telegraph crack that tears open into a lethal hole
  | 'horde' // a mowable/shootable crowd (scrap)
  | 'loot' // a fat crowd: the greedy lane's payout
  | 'ammo'
  | 'health'
  | 'lift'; // jump-charge refill

export interface FormationCell {
  /** Lane offset from the safe lane (never 0). Clamped/skipped off-road by the sim. */
  readonly off: number;
  /** Position along the chunk, 0..1 from its near edge. */
  readonly z: number;
  readonly role: FormationRole;
  /**
   * For a `beam` (and reserved for other swept threats): the lane offset from the
   * safe lane the sweep ends on. Must sit on the same side of the safe lane as
   * `off`, so the lethal strip never crosses the safe line. Ignored by other roles.
   */
  readonly toOff?: number;
  /**
   * A generous extra pickup (not the one that makes the formation fair). These are
   * thinned out deep in a run as the economy tightens; essential pickups stay.
   */
  readonly bonus?: boolean;
}

export interface Formation {
  readonly id: string;
  /** 0..1: how punishing. Biases selection — easy opens the run, hard ends it. */
  readonly hardness: number;
  /** Base selection weight per act (index 0..5). 0 means absent from that act. */
  readonly acts: readonly [number, number, number, number, number, number];
  readonly cells: readonly FormationCell[];
}

/**
 * The library. Authored so each entry reads as one idea, and so the pickups in it
 * answer the threat in it. Per-act weights gate when a formation can appear at all
 * (no meteors in the opening city, no kaiju walls in the suburbs); `hardness` then
 * tilts selection toward the gentle ones early and the brutal ones deep.
 */
export const FORMATIONS: readonly Formation[] = [
  // Breather: near-open road. Keeps the run from being wall-to-wall and lets a
  // streak breathe. A lone wreck to flick around, an optional lift to bank.
  {
    id: 'open',
    hardness: 0.05,
    acts: [2, 2, 2, 2, 1, 1],
    cells: [
      { off: 2, z: 0.5, role: 'wreck' },
      { off: -1, z: 0.3, role: 'lift', bonus: true },
    ],
  },
  // Stray cars: a couple of blockers off the safe lane to flick around, with a
  // little ammo to bank. The gentlest traffic beat.
  {
    id: 'lone-wreck',
    hardness: 0.14,
    acts: [5, 4, 2, 2, 1, 1],
    cells: [
      { off: 1, z: 0.35, role: 'wreck' },
      { off: 2, z: 0.62, role: 'wreck' },
      { off: -1, z: 0.78, role: 'wreck' },
      { off: -1, z: 0.2, role: 'ammo', bonus: true },
    ],
  },
  // Corridor horde: a crowd parked on one lane with ammo set just before it, so the
  // greedy play (mow/shoot the lane for scrap) is fair if you came in loaded.
  {
    id: 'corridor-horde',
    hardness: 0.32,
    acts: [5, 4, 6, 4, 2, 3],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.42, role: 'horde' },
      { off: -1, z: 0.7, role: 'wreck', bonus: false },
    ],
  },
  // Rubble hop: a low mound on a flanking lane to jump (or eat a small crash),
  // with a lift charge set just before it. Teaches the jump in the suburbs.
  {
    id: 'rubble-hop',
    hardness: 0.28,
    acts: [2, 4, 3, 2, 3, 2],
    cells: [
      { off: -1, z: 0.12, role: 'lift' },
      { off: 1, z: 0.45, role: 'boulder' },
      { off: 2, z: 0.7, role: 'wreck', bonus: false },
    ],
  },
  // Traffic jam: the city's stalled cars clumped across the lanes in a readable
  // weave. Pure dodging, no gun needed; the day-one streets made literal.
  {
    id: 'jam',
    hardness: 0.45,
    acts: [6, 6, 3, 1, 1, 0],
    cells: [
      { off: -1, z: 0.06, role: 'ammo', bonus: true },
      { off: 1, z: 0.16, role: 'wreck' },
      { off: 2, z: 0.26, role: 'wreck' },
      { off: -1, z: 0.4, role: 'wreck' },
      { off: 2, z: 0.52, role: 'wreck' },
      { off: 1, z: 0.66, role: 'wreck' },
      { off: -1, z: 0.82, role: 'wreck' },
    ],
  },
  // Slalom: blockers staggered left then right of the safe lane — weave through.
  {
    id: 'slalom',
    hardness: 0.42,
    acts: [1, 3, 3, 3, 3, 2],
    cells: [
      { off: 1, z: 0.22, role: 'wreck' },
      { off: -1, z: 0.62, role: 'wreck' },
      { off: 2, z: 0.85, role: 'ammo', bonus: true },
    ],
  },
  // Barrel + crowd: shoot the drum to clear the lane (big scrap), ammo set ahead so
  // you can. Eat it instead and the blast hurts.
  {
    id: 'barrel-horde',
    hardness: 0.5,
    acts: [0, 2, 5, 3, 2, 3],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.5, role: 'barrel' },
      { off: 1, z: 0.5, role: 'horde' },
    ],
  },
  // Flood: the Swarm signature. Crowds on both flanking lanes, ammo for either, so
  // you pick a lane to plow and shoot for big scrap and leave the other be.
  {
    id: 'flood',
    hardness: 0.46,
    acts: [0, 1, 5, 3, 1, 2],
    cells: [
      { off: 1, z: 0.05, role: 'ammo' },
      { off: -1, z: 0.05, role: 'ammo' },
      { off: 1, z: 0.42, role: 'horde' },
      { off: -1, z: 0.55, role: 'horde' },
    ],
  },
  // Gauntlet: walls clamp both sides of the safe lane, forcing a clean line through;
  // health waits past the pinch as the reward for holding it.
  {
    id: 'gauntlet',
    hardness: 0.58,
    acts: [0, 1, 3, 3, 4, 4],
    cells: [
      { off: 1, z: 0.4, role: 'rig' },
      { off: -1, z: 0.42, role: 'wreck' },
      { off: 1, z: 0.9, role: 'health' },
    ],
  },
  // Greed cache: a fat scrap loot crowd plus health on the far lane, guarded by a
  // barrel on the lane between it and safety. The richest play, the riskiest line.
  {
    id: 'greed-cache',
    hardness: 0.52,
    acts: [1, 2, 3, 3, 3, 3],
    cells: [
      { off: 1, z: 0.45, role: 'barrel' },
      { off: 2, z: 0.4, role: 'loot' },
      { off: 2, z: 0.82, role: 'health', bonus: true },
    ],
  },
  // Jump greed: a lift charge, then a gap to clear, then the scrap beyond it. Pure
  // skilled greed; the safe lane never asks for the jump.
  {
    id: 'jump-greed',
    hardness: 0.6,
    acts: [0, 0, 0, 4, 3, 3],
    cells: [
      { off: 1, z: 0.06, role: 'lift' },
      { off: 1, z: 0.4, role: 'gap' },
      { off: 1, z: 0.82, role: 'loot' },
    ],
  },
  // Drifter pincer: two sliding wrecks easing in from both sides, so the gap you
  // pick now is not the gap you get. Reads only if you watch them move.
  {
    id: 'drifter-pinch',
    hardness: 0.55,
    acts: [0, 0, 2, 3, 3, 3],
    cells: [
      { off: 1, z: 0.4, role: 'drifter' },
      { off: -1, z: 0.62, role: 'drifter' },
      { off: 2, z: 0.1, role: 'ammo', bonus: true },
    ],
  },
  // Meteor volley: rocks come down on the flanking lanes on a stagger; thread the
  // safe lane on the beat. Health past it for the nerve.
  {
    id: 'meteor-volley',
    hardness: 0.7,
    acts: [0, 0, 0, 4, 3, 4],
    cells: [
      { off: 1, z: 0.3, role: 'meteor' },
      { off: -1, z: 0.6, role: 'meteor' },
      { off: 1, z: 0.92, role: 'health', bonus: true },
    ],
  },
  // Bombardment: the sky opens up. Three rocks come down across the lanes on a
  // stagger; thread the safe lane on the beat, a lift charge to bail if you must.
  {
    id: 'bombardment',
    hardness: 0.8,
    acts: [0, 0, 0, 3, 3, 4],
    cells: [
      { off: -1, z: 0.06, role: 'lift', bonus: true },
      { off: 1, z: 0.22, role: 'meteor' },
      { off: -1, z: 0.46, role: 'meteor' },
      { off: 2, z: 0.72, role: 'meteor' },
    ],
  },
  // Quake split: the road shears. Cracks across the flanking lanes tear open into
  // holes in a wave as you reach them; jump each or hold the lane that survives,
  // and the safe lane never cracks. A lift charge up front so the jumps are fair.
  {
    id: 'quake-split',
    hardness: 0.72,
    acts: [0, 0, 0, 3, 4, 4],
    cells: [
      { off: -1, z: 0.06, role: 'lift' },
      { off: 1, z: 0.35, role: 'crackgap' },
      { off: -1, z: 0.52, role: 'crackgap' },
      { off: 2, z: 0.7, role: 'crackgap' },
    ],
  },
  // Beam sweep: a UFO drags a lethal beam across the flanking lanes toward the
  // safe line. Watch it sweep, then flee to safety or jump it. The Visitors' own
  // signature; the safe lane is never in its arc.
  {
    id: 'beam-sweep',
    hardness: 0.74,
    acts: [0, 0, 0, 4, 3, 2],
    cells: [
      { off: -1, z: 0.08, role: 'lift', bonus: true },
      { off: 2, z: 0.5, role: 'beam', toOff: 1 },
    ],
  },
  // The wall: rigs across every flanking lane. Only the safe line passes. Reading
  // it is the whole game for a beat.
  {
    id: 'wall',
    hardness: 0.85,
    acts: [0, 0, 1, 2, 5, 4],
    cells: [
      { off: 1, z: 0.5, role: 'rig' },
      { off: -1, z: 0.5, role: 'rig' },
      { off: 2, z: 0.5, role: 'rig' },
    ],
  },
  // Static chaos: everything wrong at once — a falling rock, a wall, a hole — with
  // a scrap of ammo to soften the run. Late-act only.
  {
    id: 'static-chaos',
    hardness: 0.92,
    acts: [0, 0, 0, 0, 2, 5],
    cells: [
      { off: 1, z: 0.25, role: 'meteor' },
      { off: -1, z: 0.48, role: 'rig' },
      { off: 2, z: 0.72, role: 'gap' },
      { off: -1, z: 0.05, role: 'ammo', bonus: true },
    ],
  },
];

/**
 * Selection weight for a formation in a given act at a given intensity. The act
 * base weight gates availability; intensity then tilts the field — deep in (high
 * intensity) the harder formations are favored, in the eased-in opening (intensity
 * below 1) the gentle ones are. Returns 0 for formations absent from the act.
 */
export function formationWeight(f: Formation, act: number, intensity: number, bias: number): number {
  const base = f.acts[act] ?? 0;
  if (base <= 0) return 0;
  // (2*hardness - 1) is +1 for the nastiest, -1 for the calmest. Scaled by how far
  // intensity sits from its neutral 1.0 and by the global bias.
  const tilt = 1 + (intensity - 1) * bias * (2 * f.hardness - 1);
  return base * Math.max(0.04, tilt);
}
