import type { Chunk, Prop, PropKind, Spawn } from './types';
import { hash2, makeRng, nextFloat, nextInt, type Rng } from './rng';
import {
  CHUNK_LENGTH,
  DECOR_TUNING,
  LANE_COUNT,
  SPAWN_TUNING,
  roadHalfWidth,
} from '../content/tuning';
import { spawnWeightsAt } from '../content/acts';

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
 * Each non-safe lane independently rolls one spawn from the act's mix, so the
 * road's challenge changes by tramo: Rust teaches, the Swarm floods you, the
 * Visitors rain meteors, the Colossus walls you in, Static maxes everything
 * (`ACT_SPAWNS` in `src/content/acts.ts`). The safe lane is skipped entirely, so
 * it carries neither a threat nor any scrap. The greed pillar made literal
 * (docs/DESIGN.md → Pillar 3). Order of RNG draws is fixed, so the same seed
 * always produces the same road.
 */
function generateSpawns(seed: number, index: number, rng: Rng): Spawn[] {
  if (index < SPAWN_TUNING.graceChunks) return [];
  const safe = safeLane(seed, index);
  // The act this chunk sits in sets the whole spawn mix for its lanes.
  const w = spawnWeightsAt(index * CHUNK_LENGTH);
  const spawns: Spawn[] = [];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    if (lane === safe) continue;
    const roll = nextFloat(rng);
    const rigEdge = w.wreck + w.rig;
    const boulderEdge = rigEdge + w.boulder;
    const barrelEdge = boulderEdge + w.barrel;
    const drifterEdge = barrelEdge + w.drifter;
    const meteorEdge = drifterEdge + w.meteor;
    const gapEdge = meteorEdge + w.gap;
    const zombieEdge = gapEdge + w.zombieCluster;
    const jumpEdge = zombieEdge + w.jumpPickup;
    const healthEdge = jumpEdge + w.healthPickup;
    const ammoEdge = healthEdge + w.ammoPickup;
    if (roll < w.wreck) {
      spawns.push({ kind: 'wreck', lane, z: nextFloat(rng) * CHUNK_LENGTH });
    } else if (roll < rigEdge) {
      spawns.push({ kind: 'rig', lane, z: nextFloat(rng) * CHUNK_LENGTH });
    } else if (roll < boulderEdge) {
      spawns.push({ kind: 'boulder', lane, z: nextFloat(rng) * CHUNK_LENGTH });
    } else if (roll < barrelEdge) {
      spawns.push({ kind: 'barrel', lane, z: nextFloat(rng) * CHUNK_LENGTH });
    } else if (roll < drifterEdge) {
      // A wreck that slides one lane over. Pick the adjacent target lane first
      // (keeping the RNG order fixed), then its z. If no adjacent lane is valid
      // (the other side is the safe lane or off the road), fall back to a plain
      // wreck so the chance is never silently lost.
      const toLane = driftTarget(rng, lane, safe);
      const z = nextFloat(rng) * CHUNK_LENGTH;
      if (toLane >= 0) spawns.push({ kind: 'drifter', lane, z, toLane });
      else spawns.push({ kind: 'wreck', lane, z });
    } else if (roll < meteorEdge) {
      spawns.push({ kind: 'meteor', lane, z: nextFloat(rng) * CHUNK_LENGTH });
    } else if (roll < gapEdge) {
      spawns.push({ kind: 'gap', lane, z: nextFloat(rng) * CHUNK_LENGTH });
    } else if (roll < zombieEdge) {
      addZombieCluster(spawns, lane, rng, w.clusterMin, w.clusterMax);
    } else if (roll < jumpEdge) {
      spawns.push({ kind: 'jump', lane, z: nextFloat(rng) * CHUNK_LENGTH, phase: nextFloat(rng) });
    } else if (roll < healthEdge) {
      spawns.push({ kind: 'health', lane, z: nextFloat(rng) * CHUNK_LENGTH, phase: nextFloat(rng) });
    } else if (roll < ammoEdge) {
      spawns.push({ kind: 'ammo', lane, z: nextFloat(rng) * CHUNK_LENGTH, phase: nextFloat(rng) });
    }
    // else: this lane stays open this chunk.
  }
  return spawns;
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
 * A short line of zombies in one lane, spaced so plowing the lane racks a combo.
 * The cluster is placed so it fits within the chunk, then each zombie gets a
 * deterministic phase for render variety.
 */
function addZombieCluster(
  spawns: Spawn[],
  lane: number,
  rng: Rng,
  clusterMin: number,
  clusterMax: number,
): void {
  const size = nextInt(rng, clusterMin, clusterMax + 1);
  const span = (size - 1) * SPAWN_TUNING.clusterSpacing;
  const baseZ = nextFloat(rng) * (CHUNK_LENGTH - span);
  for (let i = 0; i < size; i += 1) {
    spawns.push({
      kind: 'zombie',
      lane,
      z: baseZ + i * SPAWN_TUNING.clusterSpacing,
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
