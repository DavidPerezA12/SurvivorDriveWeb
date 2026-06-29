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
  | 'drifter' // slides one lane over as it nears
  | 'beam' // a UFO beam strip that sweeps across the flanking lanes
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
 *
 * Three-lane idiom (one safe lane wandering through three, so exactly two threat
 * lanes flank it). Cells are offsets from the safe lane and the sim drops any that
 * fall on the safe line or off the road. Two patterns recur:
 *
 * - **Seal both threat lanes** (a wall, a flood): place the object at all four
 *   offsets `1, 2, -1, -2`. Whatever the safe lane is, exactly the two threat
 *   lanes survive the drop, so both get filled and only the safe lane is open.
 * - **Block exactly one threat lane** (a weave, a single blocker, a gated loot
 *   lane): pair `{1, -2}` ("right side") or `{-1, 2}` ("left side"). Each pair
 *   lands on exactly one threat lane regardless of where the safe lane sits, and
 *   the two pairs always resolve to the *opposite* threat lanes, so alternating
 *   them down a chunk makes a real left/right weave. The other lane stays open.
 *
 * Two roles only slide when the threat lanes are adjacent (the safe lane sits at an
 * edge), which is the only time a `drifter` or a `beam` has a neighbour lane to
 * cross into without touching the safe line. With the safe lane centred they
 * gracefully degrade (the drifter to a static wreck; the beam beat to just its
 * pickup), so those formations carry both polarities and lean on their other cells.
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
      { off: -2, z: 0.5, role: 'wreck' },
      { off: -1, z: 0.28, role: 'lift', bonus: true },
      { off: 2, z: 0.28, role: 'lift', bonus: true },
    ],
  },
  // Stray cars: a gentle weave of single wrecks alternating side to side, with a
  // little ammo to bank. The calmest traffic beat.
  {
    id: 'lone-wreck',
    hardness: 0.16,
    acts: [5, 4, 2, 2, 1, 1],
    cells: [
      { off: 1, z: 0.3, role: 'wreck' },
      { off: -2, z: 0.3, role: 'wreck' },
      { off: -1, z: 0.55, role: 'wreck' },
      { off: 2, z: 0.55, role: 'wreck' },
      { off: 1, z: 0.8, role: 'wreck' },
      { off: -2, z: 0.8, role: 'wreck' },
      { off: -1, z: 0.12, role: 'ammo', bonus: true },
      { off: 2, z: 0.12, role: 'ammo', bonus: true },
    ],
  },
  // Roadworks: two rows of flimsy barricades seal both flanking lanes. The read is
  // that you can barge straight through them (a tiny tap) or pop them with the gun,
  // unlike the wreck you must steer around. A scrap cache out on a threat lane
  // rewards holding a line through instead of bailing to safety.
  {
    id: 'roadworks',
    hardness: 0.24,
    acts: [3, 4, 3, 2, 1, 1],
    cells: [
      { off: 1, z: 0.3, role: 'barricade' },
      { off: 2, z: 0.3, role: 'barricade' },
      { off: -1, z: 0.3, role: 'barricade' },
      { off: -2, z: 0.3, role: 'barricade' },
      { off: 1, z: 0.62, role: 'barricade' },
      { off: 2, z: 0.62, role: 'barricade' },
      { off: -1, z: 0.62, role: 'barricade' },
      { off: -2, z: 0.62, role: 'barricade' },
      { off: 1, z: 0.85, role: 'scrap', bonus: true },
      { off: -2, z: 0.85, role: 'scrap', bonus: true },
    ],
  },
  // Corridor horde: a crowd parked on one threat lane with ammo set just before it,
  // so the greedy play (mow/shoot the lane for scrap) is fair if you came in loaded.
  // A wreck waits on the other lane, so bailing out of the crowd is not free.
  {
    id: 'corridor-horde',
    hardness: 0.34,
    acts: [5, 4, 6, 4, 2, 3],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: -2, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.45, role: 'horde' },
      { off: -2, z: 0.45, role: 'horde' },
      { off: -1, z: 0.72, role: 'wreck' },
      { off: 2, z: 0.72, role: 'wreck' },
    ],
  },
  // Rubble hop: a low mound on a flanking lane to jump (or eat a small crash), with
  // a lift charge set just before it on the same lane, and a wreck on the other.
  // Teaches the jump in the suburbs.
  {
    id: 'rubble-hop',
    hardness: 0.3,
    acts: [2, 4, 3, 2, 3, 2],
    cells: [
      { off: -1, z: 0.12, role: 'lift' },
      { off: 2, z: 0.12, role: 'lift' },
      { off: -1, z: 0.45, role: 'boulder' },
      { off: 2, z: 0.45, role: 'boulder' },
      { off: 1, z: 0.7, role: 'wreck' },
      { off: -2, z: 0.7, role: 'wreck' },
    ],
  },
  // Traffic jam: the city's stalled cars. Two walls of wrecks bracket a left/right
  // weave between them — read the open line and hold it. Pure dodging, no gun.
  {
    id: 'jam',
    hardness: 0.48,
    acts: [6, 6, 3, 1, 1, 0],
    cells: [
      { off: -1, z: 0.06, role: 'ammo', bonus: true },
      { off: 2, z: 0.06, role: 'ammo', bonus: true },
      { off: 1, z: 0.18, role: 'wreck' },
      { off: 2, z: 0.18, role: 'wreck' },
      { off: -1, z: 0.18, role: 'wreck' },
      { off: -2, z: 0.18, role: 'wreck' },
      { off: 1, z: 0.42, role: 'wreck' },
      { off: -2, z: 0.42, role: 'wreck' },
      { off: -1, z: 0.62, role: 'wreck' },
      { off: 2, z: 0.62, role: 'wreck' },
      { off: 1, z: 0.84, role: 'wreck' },
      { off: 2, z: 0.84, role: 'wreck' },
      { off: -1, z: 0.84, role: 'wreck' },
      { off: -2, z: 0.84, role: 'wreck' },
    ],
  },
  // Slalom: single wrecks staggered left then right of the safe lane — weave through.
  {
    id: 'slalom',
    hardness: 0.42,
    acts: [1, 3, 3, 3, 3, 2],
    cells: [
      { off: 1, z: 0.2, role: 'wreck' },
      { off: -2, z: 0.2, role: 'wreck' },
      { off: -1, z: 0.45, role: 'wreck' },
      { off: 2, z: 0.45, role: 'wreck' },
      { off: 1, z: 0.7, role: 'wreck' },
      { off: -2, z: 0.7, role: 'wreck' },
      { off: -1, z: 0.9, role: 'ammo', bonus: true },
      { off: 2, z: 0.9, role: 'ammo', bonus: true },
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
      { off: 1, z: 0.15, role: 'wreck' },
      { off: -2, z: 0.15, role: 'wreck' },
      { off: -1, z: 0.38, role: 'boulder' },
      { off: 2, z: 0.38, role: 'boulder' },
      { off: 1, z: 0.6, role: 'wreck' },
      { off: -2, z: 0.6, role: 'wreck' },
      { off: -1, z: 0.82, role: 'boulder' },
      { off: 2, z: 0.82, role: 'boulder' },
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
      { off: -2, z: 0.05, role: 'ammo' },
      { off: 1, z: 0.3, role: 'barrel' },
      { off: 1, z: 0.42, role: 'barrel' },
      { off: 1, z: 0.54, role: 'barrel' },
      { off: -2, z: 0.3, role: 'barrel' },
      { off: -2, z: 0.42, role: 'barrel' },
      { off: -2, z: 0.54, role: 'barrel' },
      { off: 1, z: 0.66, role: 'horde' },
      { off: -2, z: 0.66, role: 'horde' },
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
      { off: 1, z: 0.2, role: 'barrier' },
      { off: -2, z: 0.2, role: 'barrier' },
      { off: -1, z: 0.5, role: 'rig' },
      { off: 2, z: 0.5, role: 'rig' },
      { off: 1, z: 0.78, role: 'bus' },
      { off: -2, z: 0.78, role: 'bus' },
      { off: -1, z: 0.95, role: 'health', bonus: true },
      { off: 2, z: 0.95, role: 'health', bonus: true },
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
      { off: -2, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.5, role: 'barrel' },
      { off: -2, z: 0.5, role: 'barrel' },
      { off: 1, z: 0.5, role: 'horde' },
      { off: -2, z: 0.5, role: 'horde' },
    ],
  },
  // Toxic spill: a green drum on one flanking lane, a wreck weave on the other, and a
  // coin trail on the toxic lane as bait (docs/DESIGN.md → toxic drum). Shoot or ram
  // the drum and it ruptures into a gas cloud that denies its lane, so chasing the
  // money down it means jumping the cloud or eating the chip; play it safe and take
  // the wreck lane and skip the cash. The trap is the lingering poison, not a blast.
  {
    id: 'toxic-spill',
    hardness: 0.5,
    acts: [0, 1, 3, 3, 3, 2],
    cells: [
      { off: -1, z: 0.05, role: 'ammo', bonus: true },
      { off: 2, z: 0.05, role: 'ammo', bonus: true },
      { off: 1, z: 0.4, role: 'toxbarrel' },
      { off: -2, z: 0.4, role: 'toxbarrel' },
      { off: -1, z: 0.46, role: 'wreck' },
      { off: 2, z: 0.46, role: 'wreck' },
      { off: 1, z: 0.78, role: 'coin' },
      { off: -2, z: 0.78, role: 'coin' },
    ],
  },
  // Flood: the Swarm signature. Crowds fill *both* flanking lanes, ammo for either,
  // so you pick a lane to plow and shoot for big scrap or thread the safe line
  // between them. The only clear lane is the safe one.
  {
    id: 'flood',
    hardness: 0.5,
    acts: [0, 1, 5, 3, 1, 2],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: -1, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.45, role: 'horde' },
      { off: 2, z: 0.45, role: 'horde' },
      { off: -1, z: 0.5, role: 'horde' },
      { off: -2, z: 0.5, role: 'horde' },
    ],
  },
  // Gauntlet: a wall clamps both flanking lanes, forcing a clean line down the safe
  // lane; a wreck just past keeps you honest, and health waits at the end as the
  // reward for holding it.
  {
    id: 'gauntlet',
    hardness: 0.58,
    acts: [0, 1, 3, 3, 4, 4],
    cells: [
      { off: 1, z: 0.4, role: 'rig' },
      { off: 2, z: 0.4, role: 'rig' },
      { off: -1, z: 0.4, role: 'rig' },
      { off: -2, z: 0.4, role: 'rig' },
      { off: 1, z: 0.7, role: 'wreck' },
      { off: -2, z: 0.7, role: 'wreck' },
      { off: -1, z: 0.9, role: 'health' },
      { off: 2, z: 0.9, role: 'health' },
    ],
  },
  // Greed cache: a fat loot crowd on a flanking lane, guarded by a barrel on the
  // lane between it and safety, with health past it. The richest play, the riskiest
  // line: shoot the drum, plow the crowd, then bank.
  {
    id: 'greed-cache',
    hardness: 0.52,
    acts: [1, 2, 3, 3, 3, 3],
    cells: [
      { off: 1, z: 0.4, role: 'barrel' },
      { off: -2, z: 0.4, role: 'barrel' },
      { off: 1, z: 0.55, role: 'loot' },
      { off: -2, z: 0.55, role: 'loot' },
      { off: 1, z: 0.85, role: 'health', bonus: true },
      { off: -2, z: 0.85, role: 'health', bonus: true },
    ],
  },
  // Salvage cache: a fat scrap payout on a greedy lane, gated by a flimsy barricade
  // you shoot or barge through to reach it, with a wreck on the other lane to make
  // the line awkward. The richest no-fight grab, but you leave the safe line and
  // commit to the threat lane to bank it (docs/DESIGN.md → Pillar 3: greed slider).
  {
    id: 'salvage',
    hardness: 0.4,
    acts: [2, 3, 3, 3, 2, 2],
    cells: [
      { off: -1, z: 0.3, role: 'wreck' },
      { off: 2, z: 0.3, role: 'wreck' },
      { off: 1, z: 0.45, role: 'barricade' },
      { off: -2, z: 0.45, role: 'barricade' },
      { off: 1, z: 0.62, role: 'scrap' },
      { off: -2, z: 0.62, role: 'scrap' },
      { off: 1, z: 0.86, role: 'scrap', bonus: true },
      { off: -2, z: 0.86, role: 'scrap', bonus: true },
    ],
  },
  // Coin run: a money trail laid down a flanking lane, then a second trail down the
  // other flanking lane behind a wreck — chase the cash and you are committed to a
  // weave off the safe line, mid wreck and all (docs/DESIGN.md → Pillar 3: the risky
  // lane pays). The gentlest greed beat: no fight, just the lure and a dodge. Each
  // `coin` cell lays a whole trail; the pair only resolves onto one threat lane, so a
  // trail never doubles up. A little ammo up front for whatever the lane runs into.
  {
    id: 'coin-run',
    hardness: 0.3,
    acts: [2, 3, 3, 2, 2, 2],
    cells: [
      { off: -1, z: 0.04, role: 'ammo', bonus: true },
      { off: 2, z: 0.04, role: 'ammo', bonus: true },
      { off: 1, z: 0.14, role: 'coin' },
      { off: -2, z: 0.14, role: 'coin' },
      { off: 1, z: 0.46, role: 'wreck' },
      { off: -2, z: 0.46, role: 'wreck' },
      { off: -1, z: 0.56, role: 'coin' },
      { off: 2, z: 0.56, role: 'coin' },
    ],
  },
  // Crush: a loot crowd on a flanking lane immediately followed by a wall sealing
  // both flanks. Dive off the safe line, mow the crowd for fat scrap, then snap back
  // to safety before the wall — the signature greed-tension beat (the safe lane is
  // always the out, but you spent time off it).
  {
    id: 'crush',
    hardness: 0.66,
    acts: [0, 1, 3, 4, 4, 3],
    cells: [
      { off: 1, z: 0.08, role: 'ammo' },
      { off: -2, z: 0.08, role: 'ammo' },
      { off: 1, z: 0.2, role: 'loot' },
      { off: -2, z: 0.2, role: 'loot' },
      { off: 1, z: 0.75, role: 'bus' },
      { off: 2, z: 0.75, role: 'bus' },
      { off: -1, z: 0.75, role: 'bus' },
      { off: -2, z: 0.75, role: 'bus' },
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
      { off: -2, z: 0.06, role: 'lift' },
      { off: 1, z: 0.4, role: 'gap' },
      { off: -2, z: 0.4, role: 'gap' },
      { off: 1, z: 0.7, role: 'coin' },
      { off: -2, z: 0.7, role: 'coin' },
    ],
  },
  // Drifter pincer: sliding wrecks ease toward the open line, so the gap you pick
  // now is not the gap you get. They only slide when the threat lanes are adjacent
  // (the safe lane at an edge); centred, they sit as static wrecks. Reads only if
  // you watch them move.
  {
    id: 'drifter-pinch',
    hardness: 0.55,
    acts: [0, 0, 2, 3, 3, 3],
    cells: [
      { off: 1, z: 0.4, role: 'drifter' },
      { off: -2, z: 0.4, role: 'drifter' },
      { off: -1, z: 0.62, role: 'drifter' },
      { off: 2, z: 0.62, role: 'drifter' },
      { off: -1, z: 0.1, role: 'ammo', bonus: true },
      { off: 2, z: 0.1, role: 'ammo', bonus: true },
    ],
  },
  // Meteor volley: rocks come down on the flanking lanes on a stagger; thread the
  // safe lane (or the open threat lane) on the beat. Health past it for the nerve.
  {
    id: 'meteor-volley',
    hardness: 0.7,
    acts: [0, 0, 0, 4, 3, 4],
    cells: [
      { off: 1, z: 0.3, role: 'meteor' },
      { off: -2, z: 0.3, role: 'meteor' },
      { off: -1, z: 0.6, role: 'meteor' },
      { off: 2, z: 0.6, role: 'meteor' },
      { off: 1, z: 0.92, role: 'health', bonus: true },
      { off: -2, z: 0.92, role: 'health', bonus: true },
    ],
  },
  // Bombardment: the sky opens up. Rocks come down across the lanes on a stagger and
  // the last salvo seals both flanks at once; thread the safe lane on the beat, a
  // lift charge to bail if you must.
  {
    id: 'bombardment',
    hardness: 0.8,
    acts: [0, 0, 0, 3, 3, 4],
    cells: [
      { off: -1, z: 0.06, role: 'lift', bonus: true },
      { off: 2, z: 0.06, role: 'lift', bonus: true },
      { off: 1, z: 0.25, role: 'meteor' },
      { off: -2, z: 0.25, role: 'meteor' },
      { off: -1, z: 0.5, role: 'meteor' },
      { off: 2, z: 0.5, role: 'meteor' },
      { off: 1, z: 0.74, role: 'meteor' },
      { off: 2, z: 0.74, role: 'meteor' },
      { off: -1, z: 0.74, role: 'meteor' },
      { off: -2, z: 0.74, role: 'meteor' },
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
      { off: 1, z: 0.06, role: 'lift' },
      { off: -2, z: 0.06, role: 'lift' },
      { off: 1, z: 0.35, role: 'crackgap' },
      { off: -2, z: 0.35, role: 'crackgap' },
      { off: -1, z: 0.52, role: 'crackgap' },
      { off: 2, z: 0.52, role: 'crackgap' },
      { off: 1, z: 0.7, role: 'crackgap' },
      { off: -2, z: 0.7, role: 'crackgap' },
    ],
  },
  // Beam sweep: a UFO drags a lethal beam across a flanking lane toward the safe
  // line. Watch it sweep, then flee to safety or jump it. It only sweeps when the
  // threat lanes are adjacent (the safe lane at an edge); centred, the beat is just
  // the lift. The safe lane is never in its arc. Both polarities so whichever edge
  // the safe lane sits on carries the sweep.
  {
    id: 'beam-sweep',
    hardness: 0.74,
    acts: [0, 0, 0, 4, 3, 2],
    cells: [
      { off: -1, z: 0.08, role: 'lift', bonus: true },
      { off: 1, z: 0.08, role: 'lift', bonus: true },
      { off: 2, z: 0.5, role: 'beam', toOff: 1 },
      { off: -2, z: 0.5, role: 'beam', toOff: -1 },
    ],
  },
  // Collapse ramp: a tower has come down across the road. It walls off one flank
  // (the toppled structure, lethal) while its rubble on the other piles into a
  // launch ramp. Mow the dead caught in the wreckage for scrap, then ride the ramp
  // to vault the debris pile beyond it. The new line goes over the collapse; the
  // safe lane runs clear past it (docs/DESIGN.md → Pillar 1: events open a line
  // while closing others). Rust onward, where the first scripted collapse lands.
  {
    id: 'collapse-ramp',
    hardness: 0.46,
    acts: [0, 2, 3, 3, 2, 2],
    cells: [
      { off: 1, z: 0.06, role: 'ammo' },
      { off: -2, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.28, role: 'horde' },
      { off: -2, z: 0.28, role: 'horde' },
      { off: -1, z: 0.5, role: 'rig' },
      { off: 2, z: 0.5, role: 'rig' },
      { off: 1, z: 0.58, role: 'ramp' },
      { off: -2, z: 0.58, role: 'ramp' },
      { off: 1, z: 0.85, role: 'boulder' },
      { off: -2, z: 0.85, role: 'boulder' },
    ],
  },
  // Horde surge: the dead flood the road. A dense crowd packs both flanking lanes,
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
      // The teeth: a brute fronting each flooded lane, so a blind plow bites.
      { off: 1, z: 0.34, role: 'brute' },
      { off: 2, z: 0.34, role: 'brute' },
      { off: -1, z: 0.34, role: 'brute' },
      { off: -2, z: 0.34, role: 'brute' },
      // The wave: a full crowd on both flanking lanes; only the safe lane stays clear.
      { off: 1, z: 0.52, role: 'loot' },
      { off: 2, z: 0.52, role: 'loot' },
      { off: -1, z: 0.52, role: 'loot' },
      { off: -2, z: 0.52, role: 'loot' },
      // A barrel buried in one flooded lane: shoot it to blow a hole in the wave.
      { off: 1, z: 0.66, role: 'barrel' },
      { off: -2, z: 0.66, role: 'barrel' },
    ],
  },
  // Bus block: a crashed bus walls off a flanking lane (lethal, no jumping it), a
  // wreck to flick around on the other, ammo to bank. Both flanks are blocked, so
  // hold the safe line. Teaches "that long one is a wall, go around it" early.
  {
    id: 'bus-block',
    hardness: 0.4,
    acts: [3, 5, 4, 2, 1, 1],
    cells: [
      { off: 1, z: 0.5, role: 'bus' },
      { off: -2, z: 0.5, role: 'bus' },
      { off: -1, z: 0.45, role: 'wreck' },
      { off: 2, z: 0.45, role: 'wreck' },
      { off: -1, z: 0.1, role: 'ammo', bonus: true },
      { off: 2, z: 0.1, role: 'ammo', bonus: true },
    ],
  },
  // Brute line: heavy zombies anchored on the flanking lanes with ammo up front.
  // Shoot them down for fat scrap, dodge them, or eat a crash bulldozing through.
  {
    id: 'brute-line',
    hardness: 0.55,
    acts: [0, 2, 4, 3, 3, 3],
    cells: [
      { off: -1, z: 0.06, role: 'ammo' },
      { off: 2, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.45, role: 'brute' },
      { off: -2, z: 0.45, role: 'brute' },
      { off: -1, z: 0.62, role: 'brute' },
      { off: 2, z: 0.62, role: 'brute' },
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
      { off: -2, z: 0.06, role: 'ammo' },
      { off: 1, z: 0.4, role: 'horde' },
      { off: -2, z: 0.4, role: 'horde' },
      { off: 1, z: 0.62, role: 'brute' },
      { off: -2, z: 0.62, role: 'brute' },
    ],
  },
  // Leapers: a weave of jumpers down alternating flanking lanes (docs/DESIGN.md →
  // the one threat that reaches the safe line). Each springs onto the hood from its
  // lane or the lane beside it and rides along draining hull, so sitting in the safe
  // lane is not enough — shoot them as they come (ammo up front) or you will be
  // carrying passengers. A latch is shaken off by crashing, but here the play is the
  // gun. The single-lane pairs alternate sides so the leapers come left, right, left.
  {
    id: 'leapers',
    hardness: 0.62,
    acts: [0, 0, 3, 4, 4, 3],
    cells: [
      { off: -1, z: 0.05, role: 'ammo' },
      { off: 2, z: 0.05, role: 'ammo' },
      { off: 1, z: 0.34, role: 'jumper' },
      { off: -2, z: 0.34, role: 'jumper' },
      { off: -1, z: 0.55, role: 'jumper' },
      { off: 2, z: 0.55, role: 'jumper' },
      { off: 1, z: 0.78, role: 'jumper' },
      { off: -2, z: 0.78, role: 'jumper' },
    ],
  },
  // Spike greed: a spike strip on a flanking lane, a lift charge before it and the
  // loot beyond — jumping it is the greedy line. The safe lane never has spikes.
  {
    id: 'spike-greed',
    hardness: 0.6,
    acts: [0, 1, 2, 3, 3, 3],
    cells: [
      { off: 1, z: 0.06, role: 'lift' },
      { off: -2, z: 0.06, role: 'lift' },
      { off: 1, z: 0.4, role: 'spikes' },
      { off: -2, z: 0.4, role: 'spikes' },
      { off: 1, z: 0.82, role: 'loot' },
      { off: -2, z: 0.82, role: 'loot' },
    ],
  },
  // Roadblock: the road is sealed but for the safe line. A concrete barrier and a
  // crashed bus across both flanking lanes — only the safe lane passes. Reading
  // which lane is open is the whole beat. A wall of solid mass, no jumping any of it.
  {
    id: 'roadblock',
    hardness: 0.82,
    acts: [0, 1, 3, 4, 5, 4],
    cells: [
      { off: 1, z: 0.5, role: 'barrier' },
      { off: 2, z: 0.5, role: 'barrier' },
      { off: -1, z: 0.5, role: 'bus' },
      { off: -2, z: 0.5, role: 'bus' },
    ],
  },
  // The wall: rigs across both flanking lanes. Only the safe line passes. Reading
  // it is the whole game for a beat.
  {
    id: 'wall',
    hardness: 0.85,
    acts: [0, 0, 1, 2, 5, 4],
    cells: [
      { off: 1, z: 0.5, role: 'rig' },
      { off: 2, z: 0.5, role: 'rig' },
      { off: -1, z: 0.5, role: 'rig' },
      { off: -2, z: 0.5, role: 'rig' },
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
      { off: -1, z: 0.04, role: 'lift', bonus: true },
      { off: 2, z: 0.04, role: 'lift', bonus: true },
      { off: 1, z: 0.28, role: 'stomp' },
      { off: -2, z: 0.28, role: 'stomp' },
      { off: -1, z: 0.5, role: 'stomp' },
      { off: 2, z: 0.5, role: 'stomp' },
      { off: 1, z: 0.72, role: 'stomp' },
      { off: -2, z: 0.72, role: 'stomp' },
      { off: -1, z: 0.95, role: 'health', bonus: true },
      { off: 2, z: 0.95, role: 'health', bonus: true },
    ],
  },
  // Mecha barrage: the boss beat (docs/DESIGN.md → spectacle in the background). A
  // walking war machine looms alongside and rakes the road with artillery: each volley
  // shells *both* flanking lanes at once (the `1,2,-1,-2` seal idiom), so the only gap
  // every beat is the safe lane — a drumming "get back to cover" rhythm, distinct from
  // the T-Rex's single-lane weave. Shells are telegraphed falling and lethal on impact,
  // un-jumpable (dodge = be on the safe lane). Ammo + health bracket the volleys.
  {
    id: 'mecha-barrage',
    hardness: 0.86,
    acts: [0, 0, 0, 2, 4, 4],
    cells: [
      { off: -1, z: 0.05, role: 'ammo', bonus: true },
      { off: 2, z: 0.05, role: 'ammo', bonus: true },
      { off: 1, z: 0.32, role: 'shell' },
      { off: 2, z: 0.32, role: 'shell' },
      { off: -1, z: 0.32, role: 'shell' },
      { off: -2, z: 0.32, role: 'shell' },
      { off: 1, z: 0.6, role: 'shell' },
      { off: 2, z: 0.6, role: 'shell' },
      { off: -1, z: 0.6, role: 'shell' },
      { off: -2, z: 0.6, role: 'shell' },
      { off: -1, z: 0.95, role: 'health', bonus: true },
      { off: 2, z: 0.95, role: 'health', bonus: true },
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
      { off: -1, z: 0.04, role: 'lift', bonus: true },
      { off: 2, z: 0.04, role: 'lift', bonus: true },
      { off: 1, z: 0.18, role: 'meteor' },
      { off: -2, z: 0.18, role: 'meteor' },
      { off: -1, z: 0.34, role: 'meteor' },
      { off: 2, z: 0.34, role: 'meteor' },
      { off: 1, z: 0.5, role: 'meteor' },
      { off: -2, z: 0.5, role: 'meteor' },
      { off: -1, z: 0.66, role: 'meteor' },
      { off: 2, z: 0.66, role: 'meteor' },
      { off: 1, z: 0.82, role: 'meteor' },
      { off: -2, z: 0.82, role: 'meteor' },
      { off: -1, z: 0.96, role: 'health', bonus: true },
      { off: 2, z: 0.96, role: 'health', bonus: true },
    ],
  },
  // Static chaos: everything wrong at once — a falling rock, a wall, a hole — on a
  // left/right/left stagger, with a scrap of ammo to soften the run. Late-act only.
  {
    id: 'static-chaos',
    hardness: 0.92,
    acts: [0, 0, 0, 0, 2, 5],
    cells: [
      { off: 1, z: 0.25, role: 'meteor' },
      { off: -2, z: 0.25, role: 'meteor' },
      { off: -1, z: 0.48, role: 'rig' },
      { off: 2, z: 0.48, role: 'rig' },
      { off: 1, z: 0.72, role: 'gap' },
      { off: -2, z: 0.72, role: 'gap' },
      { off: -1, z: 0.05, role: 'ammo', bonus: true },
      { off: 2, z: 0.05, role: 'ammo', bonus: true },
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
