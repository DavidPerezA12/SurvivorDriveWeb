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
  | 'wreck' // steerable blocker (survivable)
  | 'rig' // un-jumpable wall, lane-change only (lethal)
  | 'barrier' // concrete wall, lane-change only (lethal)
  | 'bus' // long crashed bus, a wall along the lane (lethal)
  | 'barricade' // flimsy road trestle: shoot it, ram it cheap, or steer (soft)
  | 'boulder' // jump-clears, small ram (survivable)
  | 'barrel' // shoot to clear (and the crowd around it)
  | 'toxbarrel' // shoot/ram to rupture; leaves a lingering toxic cloud denying its lane
  | 'spikes' // a spike strip on the road; jump it or change lane (lethal trap)
  | 'drifter' // sweeps laterally within its own lane as it nears
  | 'beam' // a UFO beam strip that sweeps within the threat lane
  | 'meteor' // falls onto its lane, then lethal
  | 'stomp' // a T-Rex foot-slam: falls onto its lane like a meteor, then lethal
  | 'shell' // a mecha artillery shell: falls onto its lane like a meteor, then lethal
  | 'gap' // hole in the road; jump it or change lane
  | 'crackgap' // a quake gap: a telegraph crack that tears open into a lethal hole
  | 'ramp' // collapsed-building rubble piled into a ramp; drive it to vault the debris
  | 'horde' // a mowable/shootable crowd (scrap)
  | 'loot' // a fat crowd: the greedy lane's payout
  | 'brute' // a heavy zombie: ram it for a hull hit, or shoot/dodge it
  | 'jumper' // a leaper that latches onto the hood and drains hull; shoot or crash it off
  | 'ammo'
  | 'health'
  | 'lift' // jump-charge refill
  | 'scrap' // a salvage cache: instant scrap, a pure greed grab with no fight
  | 'coin'; // a money trail: a line of small scrap nuggets luring a line down a risky lane

export interface FormationCell {
  /** Lane offset from the safe lane (never 0). Clamped/skipped off-road by the sim. */
  readonly off: number;
  /** Position along the chunk, 0..1 from its near edge. */
  readonly z: number;
  readonly role: FormationRole;
  /**
   * Lateral position within the cell's lane, a fraction in -1..1 (0 = lane center,
   * ±1 = the lane edge with the body just inside). Used by the solid road objects and
   * falling hazards to weave or stagger across the wide threat lane into a pattern;
   * ignored by the zombie, coin, and pickup roles (they sit on the lane center).
   */
  readonly xf?: number;
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
 *
 * Two-lane idiom (one safe lane and one threat lane, both wide; the car roams the
 * full road freely). Cells are offsets from the safe lane and the sim drops any that
 * fall on the safe line or off the road, so on this road only `off: 1` (when the safe
 * lane is the left one) or `off: -1` (when it is the right one) ever survives. The
 * authoring pattern is therefore one rule:
 *
 * - **Mirror every cell.** Emit each object at both `off: 1` and `off: -1` (same `z`,
 *   same `xf`). Whichever side the safe lane sits on, exactly one of the pair lands on
 *   the threat lane and the other drops, so the object always reaches the threat lane
 *   and the safe lane always stays open. A pair only ever resolves to one spawn.
 *
 * Lateral shape lives in `xf` (a fraction in -1..1 across the wide threat lane), not in
 * the lane offset: a weave is the same object marched down the lane with `xf` swinging
 * side to side; a wall is `xf: 0` (one centred blocker already seals the lane, since
 * the car cannot squeeze past it within the lane). The moving roles (`drifter`, `beam`)
 * sweep within the threat lane on their own (`laneSweep`), bounded so the strip never
 * reaches the safe line, so they just need the mirrored pair to pick the threat side.
 */
export const FORMATIONS: readonly Formation[] = [
  // Breather: near-open road. Keeps the run from being wall-to-wall and lets a
  // streak breathe. A lone wreck to flick around, an optional lift to bank.
  {
    id: 'open',
    hardness: 0.06,
    acts: [2, 2, 2, 2, 1, 1],
    cells: [
      { off: 1, z: 0.5, role: 'wreck' },
      { off: -1, z: 0.5, role: 'wreck' },
      { off: 1, z: 0.28, role: 'lift', bonus: true },
      { off: -1, z: 0.28, role: 'lift', bonus: true },
    ],
  },
  // Stray cars: a gentle weave of single wrecks alternating side to side, with a
  // little ammo to bank. The calmest traffic beat.
  {
    id: 'lone-wreck',
    hardness: 0.16,
    acts: [5, 4, 2, 2, 1, 1],
    cells: [
      { off: 1, z: 0.3, role: 'wreck', xf: -0.8 },
      { off: -1, z: 0.3, role: 'wreck', xf: -0.8 },
      { off: 1, z: 0.55, role: 'wreck', xf: 0.8 },
      { off: -1, z: 0.55, role: 'wreck', xf: 0.8 },
      { off: 1, z: 0.8, role: 'wreck', xf: -0.8 },
      { off: -1, z: 0.8, role: 'wreck', xf: -0.8 },
      { off: 1, z: 0.12, role: 'ammo', bonus: true },
      { off: -1, z: 0.12, role: 'ammo', bonus: true },
    ],
  },
  // Roadworks: two rows of flimsy barricades seal the threat lane. The read is
  // that you can barge straight through them (a tiny tap) or pop them with the gun,
  // unlike the wreck you must steer around. A scrap cache out on a threat lane
  // rewards holding a line through instead of bailing to safety.
  {
    id: 'roadworks',
    hardness: 0.24,
    acts: [3, 4, 3, 2, 1, 1],
    cells: [
      { off: 1, z: 0.3, role: 'barricade', xf: -0.7 },
      { off: -1, z: 0.3, role: 'barricade', xf: -0.7 },
      { off: 1, z: 0.3, role: 'barricade', xf: 0.7 },
      { off: -1, z: 0.3, role: 'barricade', xf: 0.7 },
      { off: 1, z: 0.62, role: 'barricade', xf: -0.7 },
      { off: -1, z: 0.62, role: 'barricade', xf: -0.7 },
      { off: 1, z: 0.62, role: 'barricade', xf: 0.7 },
      { off: -1, z: 0.62, role: 'barricade', xf: 0.7 },
      { off: 1, z: 0.85, role: 'scrap', bonus: true },
      { off: -1, z: 0.85, role: 'scrap', bonus: true },
    ],
  },
  // Corridor horde: a crowd parked on one threat lane with ammo set just before it,
  // so the greedy play (mow/shoot the lane for scrap) is fair if you came in loaded.
  // A wreck waits just past the crowd, so plowing the lane through is not free.
  {
    id: 'corridor-horde',
    hardness: 0.34,
    acts: [5, 4, 6, 4, 2, 3],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: -1, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.45, role: 'horde' },
      { off: -1, z: 0.45, role: 'horde' },
      { off: 1, z: 0.72, role: 'wreck' },
      { off: -1, z: 0.72, role: 'wreck' },
    ],
  },
  // Rubble hop: a low mound on a threat lane to jump (or eat a small crash), with
  // a lift charge set just before it and a wreck just past it, all on the threat
  // lane. Teaches the jump in the suburbs.
  {
    id: 'rubble-hop',
    hardness: 0.3,
    acts: [2, 4, 3, 2, 3, 2],
    cells: [
      { off: 1, z: 0.12, role: 'lift' },
      { off: -1, z: 0.12, role: 'lift' },
      { off: 1, z: 0.45, role: 'boulder' },
      { off: -1, z: 0.45, role: 'boulder' },
      { off: 1, z: 0.7, role: 'wreck' },
      { off: -1, z: 0.7, role: 'wreck' },
    ],
  },
  // Traffic jam: the city's stalled cars. Two walls of wrecks bracket a left/right
  // weave between them — read the open line and hold it. Pure dodging, no gun.
  {
    id: 'jam',
    hardness: 0.48,
    acts: [6, 6, 3, 1, 1, 0],
    cells: [
      { off: 1, z: 0.06, role: 'ammo', bonus: true },
      { off: -1, z: 0.06, role: 'ammo', bonus: true },
      { off: 1, z: 0.18, role: 'wreck', xf: -0.85 },
      { off: -1, z: 0.18, role: 'wreck', xf: -0.85 },
      { off: 1, z: 0.34, role: 'wreck', xf: 0.85 },
      { off: -1, z: 0.34, role: 'wreck', xf: 0.85 },
      { off: 1, z: 0.5, role: 'wreck', xf: -0.85 },
      { off: -1, z: 0.5, role: 'wreck', xf: -0.85 },
      { off: 1, z: 0.66, role: 'wreck', xf: 0.85 },
      { off: -1, z: 0.66, role: 'wreck', xf: 0.85 },
      { off: 1, z: 0.84, role: 'wreck', xf: -0.85 },
      { off: -1, z: 0.84, role: 'wreck', xf: -0.85 },
    ],
  },
  // Slalom: single wrecks staggered left then right of the safe lane — weave through.
  {
    id: 'slalom',
    hardness: 0.42,
    acts: [1, 3, 3, 3, 3, 2],
    cells: [
      { off: 1, z: 0.2, role: 'wreck', xf: -0.85 },
      { off: -1, z: 0.2, role: 'wreck', xf: -0.85 },
      { off: 1, z: 0.45, role: 'wreck', xf: 0.85 },
      { off: -1, z: 0.45, role: 'wreck', xf: 0.85 },
      { off: 1, z: 0.7, role: 'wreck', xf: -0.85 },
      { off: -1, z: 0.7, role: 'wreck', xf: -0.85 },
      { off: 1, z: 0.9, role: 'ammo', bonus: true },
      { off: -1, z: 0.9, role: 'ammo', bonus: true },
    ],
  },
  // Swerve: a tight four-beat weave of wrecks and jumpable boulders, alternating
  // side to side. Faster and more demanding than the slalom; the jump and the steer
  // both load. No gun needed.
  {
    id: 'swerve',
    hardness: 0.4,
    acts: [2, 4, 4, 2, 2, 1],
    cells: [
      { off: 1, z: 0.15, role: 'wreck', xf: -0.85 },
      { off: -1, z: 0.15, role: 'wreck', xf: -0.85 },
      { off: 1, z: 0.38, role: 'boulder', xf: 0.85 },
      { off: -1, z: 0.38, role: 'boulder', xf: 0.85 },
      { off: 1, z: 0.6, role: 'wreck', xf: -0.85 },
      { off: -1, z: 0.6, role: 'wreck', xf: -0.85 },
      { off: 1, z: 0.82, role: 'boulder', xf: 0.85 },
      { off: -1, z: 0.82, role: 'boulder', xf: 0.85 },
    ],
  },
  // Barrel gallery: a row of drums down one greedy lane with a crowd packed behind
  // the last one. Shoot the near drum and the blast chains down the whole row
  // (`detonateBarrel` chains within `BARREL_TUNING.chainForward`), the final blast
  // blowing a hole in the wave for a big payout (docs/DESIGN.md → roster: the gun's
  // area tool, barrels chain). Eat one instead and the chain still goes off in your
  // face. The row is mirrored on both sides so whichever flank is on-road carries
  // it; ammo up front so popping it is a fair play. The richest gun beat.
  {
    id: 'barrel-gallery',
    hardness: 0.54,
    acts: [0, 1, 4, 3, 2, 3],
    cells: [
      { off: 1, z: 0.05, role: 'ammo' },
      { off: -1, z: 0.05, role: 'ammo' },
      { off: 1, z: 0.3, role: 'barrel', xf: -0.4 },
      { off: -1, z: 0.3, role: 'barrel', xf: -0.4 },
      { off: 1, z: 0.42, role: 'barrel', xf: -0.4 },
      { off: -1, z: 0.42, role: 'barrel', xf: -0.4 },
      { off: 1, z: 0.54, role: 'barrel', xf: -0.4 },
      { off: -1, z: 0.54, role: 'barrel', xf: -0.4 },
      { off: 1, z: 0.66, role: 'horde' },
      { off: -1, z: 0.66, role: 'horde' },
    ],
  },
  // Hard slalom: the late-act answer to the early slalom. Lethal walls staggered
  // left, right, then far instead of survivable wrecks — the safe line and the open
  // threat lane still thread it, but clip one and the run ends, so reading the weave
  // at speed is the whole beat. Health waits past the pinch. No jumping any of it.
  {
    id: 'hard-slalom',
    hardness: 0.72,
    acts: [0, 0, 1, 3, 4, 4],
    cells: [
      { off: 1, z: 0.2, role: 'barrier', xf: -0.7 },
      { off: -1, z: 0.2, role: 'barrier', xf: -0.7 },
      { off: 1, z: 0.5, role: 'rig', xf: 0.7 },
      { off: -1, z: 0.5, role: 'rig', xf: 0.7 },
      { off: 1, z: 0.78, role: 'bus', xf: -0.7 },
      { off: -1, z: 0.78, role: 'bus', xf: -0.7 },
      { off: 1, z: 0.95, role: 'health', bonus: true },
      { off: -1, z: 0.95, role: 'health', bonus: true },
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
      { off: -1, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.5, role: 'barrel' },
      { off: -1, z: 0.5, role: 'barrel' },
      { off: 1, z: 0.5, role: 'horde' },
      { off: -1, z: 0.5, role: 'horde' },
    ],
  },
  // Toxic spill: a green drum on the threat lane with a coin trail running down it
  // past the drum as bait (docs/DESIGN.md → toxic drum). Shoot or ram the drum and it
  // ruptures into a gas cloud that denies the lane, so chasing the money down it means
  // jumping the cloud or eating the chip; play it safe on the open lane and skip the
  // cash. The trap is the lingering poison, not a blast.
  {
    id: 'toxic-spill',
    hardness: 0.5,
    acts: [0, 1, 3, 3, 3, 2],
    cells: [
      { off: 1, z: 0.05, role: 'ammo', bonus: true },
      { off: -1, z: 0.05, role: 'ammo', bonus: true },
      { off: 1, z: 0.4, role: 'toxbarrel' },
      { off: -1, z: 0.4, role: 'toxbarrel' },
      { off: 1, z: 0.78, role: 'coin' },
      { off: -1, z: 0.78, role: 'coin' },
    ],
  },
  // Flood: the Swarm signature. Crowds fill *both* the threat lane, ammo for either,
  // so you pick a lane to plow and shoot for big scrap or thread the safe line
  // between them. The only clear lane is the safe one.
  {
    id: 'flood',
    hardness: 0.5,
    acts: [0, 1, 5, 3, 1, 2],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: -1, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.5, role: 'horde' },
      { off: -1, z: 0.5, role: 'horde' },
    ],
  },
  // Gauntlet: a wall clamps the threat lane, forcing a clean line down the safe
  // lane; a wreck just past keeps you honest, and health waits at the end as the
  // reward for holding it.
  {
    id: 'gauntlet',
    hardness: 0.58,
    acts: [0, 1, 3, 3, 4, 4],
    cells: [
      { off: 1, z: 0.4, role: 'rig' },
      { off: -1, z: 0.4, role: 'rig' },
      { off: 1, z: 0.7, role: 'wreck' },
      { off: -1, z: 0.7, role: 'wreck' },
      { off: 1, z: 0.9, role: 'health' },
      { off: -1, z: 0.9, role: 'health' },
    ],
  },
  // Greed cache: a fat loot crowd on the threat lane, fronted by a barrel you shoot to
  // open it, with health past it. The richest play, the riskiest line: pop the drum,
  // plow the crowd, then bank back to the safe line.
  {
    id: 'greed-cache',
    hardness: 0.52,
    acts: [1, 2, 3, 3, 3, 3],
    cells: [
      { off: 1, z: 0.4, role: 'barrel' },
      { off: -1, z: 0.4, role: 'barrel' },
      { off: 1, z: 0.55, role: 'loot' },
      { off: -1, z: 0.55, role: 'loot' },
      { off: 1, z: 0.85, role: 'health', bonus: true },
      { off: -1, z: 0.85, role: 'health', bonus: true },
    ],
  },
  // Salvage cache: a fat scrap payout on the threat lane, gated by a flimsy barricade
  // you shoot or barge through to reach it, with a wreck set just before to make the
  // line awkward to hold. The richest no-fight grab, but you leave the safe line and commit
  // to the threat lane to bank it (docs/DESIGN.md → Pillar 3: greed slider).
  {
    id: 'salvage',
    hardness: 0.4,
    acts: [2, 3, 3, 3, 2, 2],
    cells: [
      { off: 1, z: 0.3, role: 'wreck', xf: 0.7 },
      { off: -1, z: 0.3, role: 'wreck', xf: 0.7 },
      { off: 1, z: 0.45, role: 'barricade' },
      { off: -1, z: 0.45, role: 'barricade' },
      { off: 1, z: 0.62, role: 'scrap' },
      { off: -1, z: 0.62, role: 'scrap' },
      { off: 1, z: 0.86, role: 'scrap', bonus: true },
      { off: -1, z: 0.86, role: 'scrap', bonus: true },
    ],
  },
  // Coin run: a money trail laid down the threat lane with a wreck planted further
  // along it, so chasing the cash commits you off the safe line and into a dodge mid
  // trail (docs/DESIGN.md → Pillar 3: the risky lane pays). The gentlest greed beat: no
  // fight, just the lure and a dodge. The `coin` cell lays a whole trail; the mirrored
  // pair resolves onto the one threat lane. A little ammo up front for the run.
  {
    id: 'coin-run',
    hardness: 0.3,
    acts: [2, 3, 3, 2, 2, 2],
    cells: [
      { off: 1, z: 0.04, role: 'ammo', bonus: true },
      { off: -1, z: 0.04, role: 'ammo', bonus: true },
      { off: 1, z: 0.18, role: 'coin' },
      { off: -1, z: 0.18, role: 'coin' },
      { off: 1, z: 0.6, role: 'wreck', xf: 0.7 },
      { off: -1, z: 0.6, role: 'wreck', xf: 0.7 },
    ],
  },
  // Crush: a loot crowd on the threat lane immediately followed by a bus walling it
  // off. Dive off the safe line, mow the crowd for fat scrap, then snap back
  // to safety before the wall — the signature greed-tension beat (the safe lane is
  // always the out, but you spent time off it).
  {
    id: 'crush',
    hardness: 0.66,
    acts: [0, 1, 3, 4, 4, 3],
    cells: [
      { off: 1, z: 0.08, role: 'ammo' },
      { off: -1, z: 0.08, role: 'ammo' },
      { off: 1, z: 0.2, role: 'loot' },
      { off: -1, z: 0.2, role: 'loot' },
      { off: 1, z: 0.75, role: 'bus' },
      { off: -1, z: 0.75, role: 'bus' },
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
      { off: -1, z: 0.06, role: 'lift' },
      { off: 1, z: 0.4, role: 'gap' },
      { off: -1, z: 0.4, role: 'gap' },
      { off: 1, z: 0.7, role: 'coin' },
      { off: -1, z: 0.7, role: 'coin' },
    ],
  },
  // Drifter pincer: sliding wrecks ease across the threat lane toward the safe-lane
  // side as they near, so the gap you pick now is not the gap you get, but the slide
  // is bounded and never reaches the safe line. Reads only if you watch them move.
  {
    id: 'drifter-pinch',
    hardness: 0.55,
    acts: [0, 0, 2, 3, 3, 3],
    cells: [
      { off: 1, z: 0.4, role: 'drifter' },
      { off: -1, z: 0.4, role: 'drifter' },
      { off: 1, z: 0.62, role: 'drifter' },
      { off: -1, z: 0.62, role: 'drifter' },
      { off: 1, z: 0.1, role: 'ammo', bonus: true },
      { off: -1, z: 0.1, role: 'ammo', bonus: true },
    ],
  },
  // Meteor volley: rocks come down on the threat lane on a stagger; thread the
  // safe lane (or the open threat lane) on the beat. Health past it for the nerve.
  {
    id: 'meteor-volley',
    hardness: 0.7,
    acts: [0, 0, 0, 4, 3, 4],
    cells: [
      { off: 1, z: 0.3, role: 'meteor', xf: -0.7 },
      { off: -1, z: 0.3, role: 'meteor', xf: -0.7 },
      { off: 1, z: 0.6, role: 'meteor', xf: 0.7 },
      { off: -1, z: 0.6, role: 'meteor', xf: 0.7 },
      { off: 1, z: 0.92, role: 'health', bonus: true },
      { off: -1, z: 0.92, role: 'health', bonus: true },
    ],
  },
  // Bombardment: the sky opens up. Rocks come down across the threat lane on a stagger
  // and the last salvo seals the whole lane at once; thread the safe lane on the beat,
  // a lift charge to bail if you must.
  {
    id: 'bombardment',
    hardness: 0.8,
    acts: [0, 0, 0, 3, 3, 4],
    cells: [
      { off: 1, z: 0.06, role: 'lift', bonus: true },
      { off: -1, z: 0.06, role: 'lift', bonus: true },
      { off: 1, z: 0.25, role: 'meteor', xf: -0.7 },
      { off: -1, z: 0.25, role: 'meteor', xf: -0.7 },
      { off: 1, z: 0.5, role: 'meteor', xf: 0.7 },
      { off: -1, z: 0.5, role: 'meteor', xf: 0.7 },
      { off: 1, z: 0.74, role: 'meteor', xf: -0.5 },
      { off: -1, z: 0.74, role: 'meteor', xf: -0.5 },
      { off: 1, z: 0.74, role: 'meteor', xf: 0.5 },
      { off: -1, z: 0.74, role: 'meteor', xf: 0.5 },
    ],
  },
  // Quake split: the road shears. Cracks across the threat lane tear open into
  // holes in a wave as you reach them; jump each or hold the lane that survives,
  // and the safe lane never cracks. A lift charge up front so the jumps are fair.
  {
    id: 'quake-split',
    hardness: 0.72,
    acts: [0, 0, 0, 3, 4, 4],
    cells: [
      { off: 1, z: 0.06, role: 'lift' },
      { off: -1, z: 0.06, role: 'lift' },
      { off: 1, z: 0.35, role: 'crackgap' },
      { off: -1, z: 0.35, role: 'crackgap' },
      { off: 1, z: 0.52, role: 'crackgap' },
      { off: -1, z: 0.52, role: 'crackgap' },
      { off: 1, z: 0.7, role: 'crackgap' },
      { off: -1, z: 0.7, role: 'crackgap' },
    ],
  },
  // Beam sweep: a UFO drags a lethal beam across the threat lane. Watch it sweep
  // within the lane, then flee to the safe line or jump it. The strip is bounded so it
  // never reaches the safe lane. Both polarities so whichever side the safe lane sits
  // on carries the sweep onto the other (the threat) lane.
  {
    id: 'beam-sweep',
    hardness: 0.74,
    acts: [0, 0, 0, 4, 3, 2],
    cells: [
      { off: -1, z: 0.08, role: 'lift', bonus: true },
      { off: 1, z: 0.08, role: 'lift', bonus: true },
      { off: 1, z: 0.5, role: 'beam' },
      { off: -1, z: 0.5, role: 'beam' },
    ],
  },
  // Collapse ramp: a tower has come down across the threat lane. Its rubble piles into
  // a launch ramp with a boulder of debris just past it. Mow the dead caught in the
  // wreckage for scrap, then ride the ramp to vault the debris beyond it. The new line
  // goes over the collapse; the safe lane runs clear past it (docs/DESIGN.md → Pillar 1:
  // events open a line while closing others). Rust onward, where the first scripted
  // collapse lands.
  {
    id: 'collapse-ramp',
    hardness: 0.46,
    acts: [0, 2, 3, 3, 2, 2],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: -1, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.28, role: 'horde' },
      { off: -1, z: 0.28, role: 'horde' },
      { off: 1, z: 0.55, role: 'ramp' },
      { off: -1, z: 0.55, role: 'ramp' },
      { off: 1, z: 0.7, role: 'boulder' },
      { off: -1, z: 0.7, role: 'boulder' },
    ],
  },
  // Horde surge: the dead flood the road. A dense crowd packs the threat lane,
  // so the only clean line is the safe lane (thread the gap), and mowing through is
  // a huge scrap payout gated by the brutes anchoring the wave (ram one and you eat
  // the crash) and the ammo it costs to carve a lane. A barrel sits in the wave to
  // pop for a swath (docs/DESIGN.md → roster: Horde surge, a mass threat; plow or
  // thread the gap). Swarm signature, where the dead first flood the lanes.
  {
    id: 'horde-surge',
    hardness: 0.62,
    acts: [0, 0, 4, 3, 3, 4],
    cells: [
      { off: 1, z: 0.04, role: 'ammo' },
      { off: -1, z: 0.04, role: 'ammo' },
      // The teeth: a brute fronting the flooded lane, so a blind plow bites.
      { off: 1, z: 0.34, role: 'brute' },
      { off: -1, z: 0.34, role: 'brute' },
      // The wave: a full crowd fills the threat lane; only the safe lane stays clear.
      { off: 1, z: 0.52, role: 'loot' },
      { off: -1, z: 0.52, role: 'loot' },
      // A barrel buried in the wave: shoot it to blow a hole in the crowd.
      { off: 1, z: 0.66, role: 'barrel' },
      { off: -1, z: 0.66, role: 'barrel' },
    ],
  },
  // Bus block: a crashed bus walls off the threat lane (lethal, no jumping it), with a
  // wreck to flick around set just before it and ammo to bank. The safe line is the
  // out. Teaches "that long one is a wall, go around it" early.
  {
    id: 'bus-block',
    hardness: 0.4,
    acts: [3, 5, 4, 2, 1, 1],
    cells: [
      { off: 1, z: 0.5, role: 'bus' },
      { off: -1, z: 0.5, role: 'bus' },
      { off: 1, z: 0.3, role: 'wreck', xf: 0.7 },
      { off: -1, z: 0.3, role: 'wreck', xf: 0.7 },
      { off: 1, z: 0.1, role: 'ammo', bonus: true },
      { off: -1, z: 0.1, role: 'ammo', bonus: true },
    ],
  },
  // Brute line: heavy zombies anchored on the threat lane with ammo up front.
  // Shoot them down for fat scrap, dodge them, or eat a crash bulldozing through.
  {
    id: 'brute-line',
    hardness: 0.55,
    acts: [0, 2, 4, 3, 3, 3],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: -1, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.45, role: 'brute' },
      { off: -1, z: 0.45, role: 'brute' },
      { off: 1, z: 0.62, role: 'brute' },
      { off: -1, z: 0.62, role: 'brute' },
    ],
  },
  // Brute in the crowd: a horde to plow with a brute planted behind it. Mow the
  // fodder, but the brute bites if you ram it, so shoot it as you come. Ammo set
  // before.
  {
    id: 'brute-horde',
    hardness: 0.5,
    acts: [0, 2, 5, 4, 3, 3],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: -1, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.4, role: 'horde' },
      { off: -1, z: 0.4, role: 'horde' },
      { off: 1, z: 0.62, role: 'brute' },
      { off: -1, z: 0.62, role: 'brute' },
    ],
  },
  // Leapers: a line of jumpers down the threat lane (docs/DESIGN.md → the one threat
  // that reaches the safe line). Each springs onto the hood from the threat lane and
  // rides along draining hull, so sitting in the safe lane is not enough — shoot them
  // as they come (ammo up front) or you will be carrying passengers. A latch is shaken
  // off by crashing, but here the play is the gun.
  {
    id: 'leapers',
    hardness: 0.62,
    acts: [0, 0, 3, 4, 4, 3],
    cells: [
      { off: 1, z: 0.05, role: 'ammo' },
      { off: -1, z: 0.05, role: 'ammo' },
      { off: 1, z: 0.34, role: 'jumper' },
      { off: -1, z: 0.34, role: 'jumper' },
      { off: 1, z: 0.55, role: 'jumper' },
      { off: -1, z: 0.55, role: 'jumper' },
      { off: 1, z: 0.78, role: 'jumper' },
      { off: -1, z: 0.78, role: 'jumper' },
    ],
  },
  // Spike greed: a spike strip on a threat lane, a lift charge before it and the
  // loot beyond — jumping it is the greedy line. The safe lane never has spikes.
  {
    id: 'spike-greed',
    hardness: 0.6,
    acts: [0, 1, 2, 3, 3, 3],
    cells: [
      { off: 1, z: 0.06, role: 'lift' },
      { off: -1, z: 0.06, role: 'lift' },
      { off: 1, z: 0.4, role: 'spikes' },
      { off: -1, z: 0.4, role: 'spikes' },
      { off: 1, z: 0.82, role: 'loot' },
      { off: -1, z: 0.82, role: 'loot' },
    ],
  },
  // Roadblock: the road is sealed but for the safe line. A concrete barrier and a
  // crashed bus across the threat lane — only the safe lane passes. Reading
  // which lane is open is the whole beat. A wall of solid mass, no jumping any of it.
  {
    id: 'roadblock',
    hardness: 0.82,
    acts: [0, 1, 3, 4, 5, 4],
    cells: [
      { off: 1, z: 0.5, role: 'barrier', xf: -0.7 },
      { off: -1, z: 0.5, role: 'barrier', xf: -0.7 },
      { off: 1, z: 0.5, role: 'bus', xf: 0.7 },
      { off: -1, z: 0.5, role: 'bus', xf: 0.7 },
    ],
  },
  // The wall: rigs across the threat lane. Only the safe line passes. Reading
  // it is the whole game for a beat.
  {
    id: 'wall',
    hardness: 0.85,
    acts: [0, 0, 1, 2, 5, 4],
    cells: [
      { off: 1, z: 0.5, role: 'rig', xf: -0.7 },
      { off: -1, z: 0.5, role: 'rig', xf: -0.7 },
      { off: 1, z: 0.5, role: 'rig', xf: 0.7 },
      { off: -1, z: 0.5, role: 'rig', xf: 0.7 },
    ],
  },
  // T-Rex rampage: the boss beat (docs/DESIGN.md → spectacle in the background, the
  // road stays legible). A tyrannosaur looms alongside and slams its foot down the
  // lanes in a staggered wave — each stomp is a telegraphed shadow that craters a
  // lethal, un-jumpable footprint, dodged with a lane change. The safe lane is never
  // stomped, and a lift + health bracket the wave so threading it is a fair, frantic
  // beat. Deep acts only, where the cloned lizards get loose.
  {
    id: 'trex-rampage',
    hardness: 0.84,
    acts: [0, 0, 0, 2, 4, 4],
    cells: [
      { off: 1, z: 0.04, role: 'lift', bonus: true },
      { off: -1, z: 0.04, role: 'lift', bonus: true },
      { off: 1, z: 0.28, role: 'stomp', xf: -0.7 },
      { off: -1, z: 0.28, role: 'stomp', xf: -0.7 },
      { off: 1, z: 0.5, role: 'stomp', xf: 0.7 },
      { off: -1, z: 0.5, role: 'stomp', xf: 0.7 },
      { off: 1, z: 0.72, role: 'stomp', xf: -0.7 },
      { off: -1, z: 0.72, role: 'stomp', xf: -0.7 },
      { off: 1, z: 0.95, role: 'health', bonus: true },
      { off: -1, z: 0.95, role: 'health', bonus: true },
    ],
  },
  // Mecha barrage: the boss beat (docs/DESIGN.md → spectacle in the background). A
  // walking war machine looms alongside and rakes the threat lane with artillery: the
  // shells zigzag back and forth across the wide lane (the `xf` stagger), a walking
  // pattern you can try to thread for greed or just bail from onto the safe line, which
  // the barrage never touches. Shells are telegraphed falling and lethal on impact,
  // un-jumpable. Both polarities are emitted; only the non-safe side lands. Ammo +
  // health bracket the volleys.
  {
    id: 'mecha-barrage',
    hardness: 0.86,
    acts: [0, 0, 0, 2, 4, 4],
    cells: [
      { off: -1, z: 0.04, role: 'ammo', bonus: true },
      { off: 1, z: 0.04, role: 'ammo', bonus: true },
      { off: 1, z: 0.28, role: 'shell', xf: -0.85 },
      { off: -1, z: 0.28, role: 'shell', xf: -0.85 },
      { off: 1, z: 0.4, role: 'shell', xf: -0.2 },
      { off: -1, z: 0.4, role: 'shell', xf: -0.2 },
      { off: 1, z: 0.52, role: 'shell', xf: 0.45 },
      { off: -1, z: 0.52, role: 'shell', xf: 0.45 },
      { off: 1, z: 0.64, role: 'shell', xf: -0.5 },
      { off: -1, z: 0.64, role: 'shell', xf: -0.5 },
      { off: 1, z: 0.76, role: 'shell', xf: 0.3 },
      { off: -1, z: 0.76, role: 'shell', xf: 0.3 },
      { off: 1, z: 0.88, role: 'shell', xf: 0.85 },
      { off: -1, z: 0.88, role: 'shell', xf: 0.85 },
      { off: -1, z: 0.97, role: 'health', bonus: true },
      { off: 1, z: 0.97, role: 'health', bonus: true },
    ],
  },
  // The Big One: the meteor storm, Phase 3's climax (docs/DESIGN.md → M4 The Big One;
  // meteors raining). A sustained rain of falling rocks alternating left/right down the
  // whole chunk — one lane cratered per beat, relentless but threadable on the safe
  // lane. A lift up front and health at the tail bracket the gauntlet. The renderer
  // throws a burning sky of embers while the storm is live. Deep finale only.
  {
    id: 'meteor-storm',
    hardness: 0.9,
    acts: [0, 0, 0, 0, 3, 4],
    cells: [
      { off: 1, z: 0.04, role: 'lift', bonus: true },
      { off: -1, z: 0.04, role: 'lift', bonus: true },
      { off: 1, z: 0.18, role: 'meteor', xf: -0.8 },
      { off: -1, z: 0.18, role: 'meteor', xf: -0.8 },
      { off: 1, z: 0.34, role: 'meteor', xf: 0.8 },
      { off: -1, z: 0.34, role: 'meteor', xf: 0.8 },
      { off: 1, z: 0.5, role: 'meteor', xf: -0.8 },
      { off: -1, z: 0.5, role: 'meteor', xf: -0.8 },
      { off: 1, z: 0.66, role: 'meteor', xf: 0.8 },
      { off: -1, z: 0.66, role: 'meteor', xf: 0.8 },
      { off: 1, z: 0.82, role: 'meteor', xf: -0.8 },
      { off: -1, z: 0.82, role: 'meteor', xf: -0.8 },
      { off: 1, z: 0.96, role: 'health', bonus: true },
      { off: -1, z: 0.96, role: 'health', bonus: true },
    ],
  },
  // Static chaos: everything wrong at once — a falling rock, a wall, a hole — on a
  // left/right/left stagger, with a scrap of ammo to soften the run. Late-act only.
  {
    id: 'static-chaos',
    hardness: 0.92,
    acts: [0, 0, 0, 0, 2, 5],
    cells: [
      { off: 1, z: 0.25, role: 'meteor', xf: -0.6 },
      { off: -1, z: 0.25, role: 'meteor', xf: -0.6 },
      { off: 1, z: 0.48, role: 'rig' },
      { off: -1, z: 0.48, role: 'rig' },
      { off: 1, z: 0.72, role: 'gap' },
      { off: -1, z: 0.72, role: 'gap' },
      { off: 1, z: 0.05, role: 'ammo', bonus: true },
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
