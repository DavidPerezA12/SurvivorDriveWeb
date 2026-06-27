import type { Chunk, Prop, PropKind, Spawn } from './types';
import { hash2, makeRng, nextFloat, nextInt, type Rng } from './rng';
import {
  CHUNK_LENGTH,
  DECOR_TUNING,
  LANE_COUNT,
  SPAWN_TUNING,
  roadHalfWidth,
} from '../content/tuning';
import {
  actAt,
  DIFFICULTY_TUNING,
  intensityAt,
  lethalityAt,
  openChanceAt,
  pickupScaleAt,
  spawnWeightsAt,
} from '../content/acts';
import {
  FORMATIONS,
  formationWeight,
  type Formation,
  type FormationCell,
} from '../content/formations';

/**
 * Pull-based world generation.
 *
 * A chunk is materialized purely from `(seed, index)` the first time the
 * lookahead window reaches it. Nothing is pre-generated, nothing is stored
 * after it scrolls behind the car. Each chunk seeds its own RNG from
 * `hash2(seed, index)`, so generation is order-independent and deterministic:
 * the same seed always produces the same road, roadside, and hazards
 * (docs/ARCHITECTURE.md → Chunks).
 */
export function chunkAt(seed: number, index: number): Chunk {
  const rng = makeRng(hash2(seed, index));
  return {
    index,
    variant: 'flat',
    props: generateProps(rng),
    spawns: generateSpawns(seed, index, rng),
  };
}

/**
 * The always-clear lane for a chunk. A slow sine wander whose per-chunk change
 * is bounded below 1, so the safe lane is always reachable from the previous
 * chunk's at speed. This is what guarantees the safe-line invariant
 * (docs/ARCHITECTURE.md → Spawning). Hazards never fill it.
 */
export function safeLane(seed: number, index: number): number {
  const center = (LANE_COUNT - 1) / 2;
  const phase = (hash2(seed, 0x5afe) / 0x100000000) * Math.PI * 2;
  // Amplitude `center`, frequency 0.22 → max slope center·0.22 ≈ 0.44 < 0.5, so
  // consecutive rounded lanes differ by at most one.
  const f = center + center * Math.sin(0.22 * index + phase);
  return Math.max(0, Math.min(LANE_COUNT - 1, Math.round(f)));
}

/**
 * The road's challenge is authored, not scattered. Each chunk lays down one
 * hand-built formation (`src/content/formations.ts`): a small set-piece of
 * obstacles that forces a decision, with its pickups placed in relation to the
 * threat they answer. The formation is chosen by act and intensity (gentle ones
 * open the run, brutal ones end it), then resolved into spawns relative to this
 * chunk's safe lane. The safe lane itself is never filled, so a survivable line
 * always exists (docs/DESIGN.md → Pillar 1 the road is the boss, Pillar 3 greed).
 * RNG draws are in fixed cell order, so the same seed always builds the same road.
 */
function generateSpawns(seed: number, index: number, rng: Rng): Spawn[] {
  if (index < SPAWN_TUNING.graceChunks) return [];
  const safe = safeLane(seed, index);
  const distance = index * CHUNK_LENGTH;
  const act = actAt(distance);
  const intensity = intensityAt(distance);

  // Pacing: some chunks are left open road so the formations land as spaced-out
  // beats with room to recover between them, rather than one continuous wall. The
  // breathers are generous in the eased-in opening and rare deep in. The roll is
  // first so the RNG sequence past it is unaffected by it being a breather or not.
  if (nextFloat(rng) < openChanceAt(intensity)) return [];

  const formation = pickFormation(act, intensity, rng);
  if (!formation) return [];

  const w = spawnWeightsAt(distance);
  const pickupScale = pickupScaleAt(distance);
  const lethality = lethalityAt(distance);
  const spawns: Spawn[] = [];
  for (const cell of formation.cells) {
    const lane = safe + cell.off;
    // Cells that fall on the safe lane or off the road are dropped, so the safe
    // line stays clear and the formation simply thins at the road's edges.
    if (lane < 0 || lane >= LANE_COUNT || lane === safe) continue;
    const z = cell.z * CHUNK_LENGTH;
    resolveCell(spawns, cell, lane, z, safe, w.clusterMin, w.clusterMax, pickupScale, lethality, rng);
  }
  return spawns;
}

/**
 * Weighted pick of one formation for this chunk's act and intensity. Intensity
 * tilts the field toward the harder formations deep in and the gentle ones in the
 * eased-in opening (`formationWeight`). Returns null only if the act has no
 * formations at all (it never does).
 */
function pickFormation(act: number, intensity: number, rng: Rng): Formation | null {
  const bias = DIFFICULTY_TUNING.hardnessBias;
  let total = 0;
  for (const f of FORMATIONS) total += formationWeight(f, act, intensity, bias);
  if (total <= 0) return null;
  let r = nextFloat(rng) * total;
  for (const f of FORMATIONS) {
    const weight = formationWeight(f, act, intensity, bias);
    if (weight <= 0) continue;
    r -= weight;
    if (r < 0) return f;
  }
  return FORMATIONS[FORMATIONS.length - 1];
}

/** Resolve one formation cell into its concrete spawn(s) on `lane` at `z`. */
function resolveCell(
  spawns: Spawn[],
  cell: FormationCell,
  lane: number,
  z: number,
  safe: number,
  clusterMin: number,
  clusterMax: number,
  pickupScale: number,
  lethality: number,
  rng: Rng,
): void {
  switch (cell.role) {
    case 'wreck': {
      // Deep-run lethality can promote a steerable wreck to an un-jumpable rig, so
      // a familiar formation's blockers turn nastier the further in you get.
      const toRig = nextFloat(rng) < (lethality - 1) * DIFFICULTY_TUNING.lethalWreckUpgrade;
      spawns.push({ kind: toRig ? 'rig' : 'wreck', lane, z });
      break;
    }
    case 'rig':
    case 'barrier':
    case 'bus':
    case 'barricade':
    case 'boulder':
    case 'barrel':
    case 'spikes':
    case 'meteor':
    case 'gap':
    case 'ramp':
      spawns.push({ kind: cell.role, lane, z });
      break;
    case 'crackgap':
      // A quake gap: a `gap` that starts as a harmless crack and tears open later.
      spawns.push({ kind: 'gap', lane, z, opening: true });
      break;
    case 'drifter': {
      // Slides one lane over as it nears; never crosses onto the safe line. If
      // neither side is a valid non-safe lane, fall back to a static wreck.
      const toLane = driftTarget(rng, lane, safe);
      if (toLane >= 0) spawns.push({ kind: 'drifter', lane, z, toLane });
      else spawns.push({ kind: 'wreck', lane, z });
      break;
    }
    case 'beam': {
      // Sweeps from this lane across to `cell.toOff` only when that target stays on
      // the same side of the safe lane. Invalid targets become a static beam strike,
      // so a malformed formation cannot silently sweep through the refuge line.
      const toOff = cell.toOff ?? cell.off;
      const want = safe + toOff;
      const sameSide = Math.sign(toOff) === Math.sign(cell.off);
      const toLane = sameSide && want >= 0 && want < LANE_COUNT && want !== safe ? want : lane;
      spawns.push({ kind: 'beam', lane, z, toLane });
      break;
    }
    case 'horde':
      addZombieCluster(spawns, lane, rng, z, nextInt(rng, clusterMin, clusterMax + 1));
      break;
    case 'brute':
      // A single heavy zombie: a damaging obstacle, not free fodder. Ram it for a
      // hull hit, or shoot/dodge it (the crash math lives in the sim).
      spawns.push({ kind: 'zombie', lane, z, phase: nextFloat(rng), brute: true });
      break;
    case 'loot':
      // The greedy lane's payout: a full crowd (still inside the act's bounds).
      addZombieCluster(spawns, lane, rng, z, clusterMax);
      break;
    case 'scrap': {
      // A salvage cache: the greedy lane's payout with no fight, just a grab. A bonus
      // cache thins out deep in as the economy tightens (like the other pickups); an
      // essential one always lands when on-road. The draw order mirrors the pickup
      // case so the RNG stream stays identical regardless of the branch taken.
      if (cell.bonus && nextFloat(rng) > pickupScale) break;
      spawns.push({ kind: 'scrap', lane, z, phase: nextFloat(rng) });
      break;
    }
    case 'ammo':
    case 'health':
    case 'lift': {
      // Bonus pickups (the generous extras, not the one that makes the formation
      // fair) thin out as the economy tightens deep in.
      if (cell.bonus && nextFloat(rng) > pickupScale) break;
      const kind = cell.role === 'lift' ? 'jump' : cell.role;
      spawns.push({ kind, lane, z, phase: nextFloat(rng) });
      break;
    }
  }
}

/**
 * Pick the lane a drifter slides into: an adjacent lane that is on the road and
 * is not the safe lane, so the slide is always exactly one lane and never crosses
 * (or settles on) the safe line. Tries an RNG-chosen side first, then the other;
 * returns -1 when neither side is valid (an edge lane whose only neighbour is the
 * safe lane), letting the caller fall back to a static wreck.
 */
function driftTarget(rng: Rng, origin: number, safe: number): number {
  const first = nextFloat(rng) < 0.5 ? -1 : 1;
  for (const dir of [first, -first]) {
    const t = origin + dir;
    if (t >= 0 && t < LANE_COUNT && t !== safe) return t;
  }
  return -1;
}

/**
 * A line of `size` zombies in one lane starting near `baseZ`, spaced so plowing
 * the lane racks a combo. Clamped to fit inside the chunk, then each zombie gets a
 * deterministic phase for render variety.
 */
function addZombieCluster(spawns: Spawn[], lane: number, rng: Rng, baseZ: number, size: number): void {
  const span = (size - 1) * SPAWN_TUNING.clusterSpacing;
  const z0 = Math.max(0, Math.min(baseZ, CHUNK_LENGTH - span));
  for (let i = 0; i < size; i += 1) {
    spawns.push({
      kind: 'zombie',
      lane,
      z: z0 + i * SPAWN_TUNING.clusterSpacing,
      phase: nextFloat(rng),
    });
  }
}

function pickKind(rng: Rng): PropKind {
  const r = nextFloat(rng);
  if (r < 0.38) return 'post';
  if (r < 0.66) return 'rock';
  if (r < 0.84) return 'barrier';
  return 'husk';
}

function generateProps(rng: Rng): Prop[] {
  const edge = roadHalfWidth();
  const props: Prop[] = [];

  for (let i = 0; i < DECOR_TUNING.maxPerChunk; i += 1) {
    // Each slot independently rolls whether it dresses the roadside, so density
    // varies chunk to chunk without ever cluttering the road itself.
    if (nextFloat(rng) > 0.6) continue;

    const side = nextFloat(rng) < 0.5 ? -1 : 1;
    const kind = pickKind(rng);
    // Barriers hug the shoulder; everything else can sit further out.
    const margin =
      kind === 'barrier'
        ? DECOR_TUNING.marginMin + nextFloat(rng) * 1.5
        : DECOR_TUNING.marginMin + nextFloat(rng) * (DECOR_TUNING.marginMax - DECOR_TUNING.marginMin);
    const scale = 0.85 + nextFloat(rng) * 0.4;
    // Posts stand upright; the rest get a little yaw variety.
    const rot = kind === 'post' ? 0 : (nextFloat(rng) - 0.5) * Math.PI;

    props.push({
      kind,
      x: side * (edge + margin),
      z: nextFloat(rng) * CHUNK_LENGTH,
      scale,
      rot,
    });
  }

  return props;
}
