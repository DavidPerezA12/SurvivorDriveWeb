import { describe, expect, it } from 'vitest';
import type { Spawn } from '../src/sim';
import { chunkAt, safeLane } from '../src/sim';
import {
  CAR_HALF_WIDTH,
  CAR_TUNING,
  CHUNK_LENGTH,
  LANE_WIDTH,
  MOW_TUNING,
  laneCenterX,
  roadHalfWidth,
} from '../src/content/tuning';

interface PathState {
  x: number;
  vel: number;
}

interface Blocker {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

const WINDOW_CHUNKS = 3;
const FIXED_DT = 1 / 60;
const STEPS_PER_DECISION = 4;
const BEAM_WIDTH = 40;
const STEER: readonly (-1 | 0 | 1)[] = [-1, 0, 1];
const MAX_FORWARD_SPEED =
  CAR_TUNING.baseTopSpeed + CAR_TUNING.earlyGain + CAR_TUNING.lateGain + MOW_TUNING.overspeedCap;
const ROAD_EDGE = roadHalfWidth() - CAR_HALF_WIDTH;

function moveTowards(value: number, target: number, maxDelta: number): number {
  const diff = target - value;
  if (Math.abs(diff) <= maxDelta) return target;
  return value + Math.sign(diff) * maxDelta;
}

/**
 * Conservative static footprint. Jumpable and moving threats are deliberately
 * over-approximated here, so this proves steering clearance, not full playability.
 * Dynamic timing, jump charges and jumper pressure belong to their sim tests.
 */
function blockerAt(spawn: Spawn, base: number): Blocker | null {
  if (
    spawn.kind === 'jump' ||
    spawn.kind === 'health' ||
    spawn.kind === 'ammo' ||
    spawn.kind === 'scrap' ||
    spawn.kind === 'coin' ||
    spawn.kind === 'shield' ||
    spawn.kind === 'ramp' ||
    (spawn.kind === 'zombie' && !spawn.brute)
  ) {
    return null;
  }

  const center = laneCenterX(spawn.lane);
  let xMin: number;
  let xMax: number;
  if (spawn.kind === 'drifter' || spawn.kind === 'beam') {
    xMin = Math.min(spawn.fromX, spawn.toX) - 1.2 - CAR_HALF_WIDTH;
    xMax = Math.max(spawn.fromX, spawn.toX) + 1.2 + CAR_HALF_WIDTH;
  } else {
    const x = center + ('dx' in spawn ? (spawn.dx ?? 0) : 0);
    const halfWidth =
      spawn.kind === 'pole' ||
      spawn.kind === 'livewire' ||
      spawn.kind === 'gap' ||
      spawn.kind === 'spikes'
        ? LANE_WIDTH / 2
        : spawn.kind === 'rig'
          ? 1.45
          : spawn.kind === 'bus'
            ? 1.25
            : spawn.kind === 'barrier'
              ? 1.2
              : spawn.kind === 'zombie'
                ? 0.65
                : 1.05;
    xMin = x - halfWidth - CAR_HALF_WIDTH;
    xMax = x + halfWidth + CAR_HALF_WIDTH;
  }

  const halfLength =
    spawn.kind === 'rig'
      ? 4.5
      : spawn.kind === 'bus'
        ? 4
        : spawn.kind === 'gap'
          ? 3.2
          : spawn.kind === 'pole' || spawn.kind === 'livewire'
            ? 2.4
            : 1.8;
  const z = base + spawn.z;
  // The car extends behind its distance marker, so keep extra room after the prop.
  return { xMin, xMax, zMin: z - halfLength, zMax: z + halfLength + 2.2 };
}

function blockersFor(seed: number, startChunk: number): Blocker[] {
  const blockers: Blocker[] = [];
  for (let index = startChunk; index < startChunk + WINDOW_CHUNKS; index += 1) {
    const base = index * CHUNK_LENGTH;
    for (const spawn of chunkAt(seed, index).spawns) {
      const blocker = blockerAt(spawn, base);
      if (blocker) blockers.push(blocker);
    }
  }
  return blockers;
}

function overlaps(blockers: readonly Blocker[], x: number, z: number): boolean {
  for (const blocker of blockers) {
    if (z >= blocker.zMin && z <= blocker.zMax && x > blocker.xMin && x < blocker.xMax) return true;
  }
  return false;
}

/** Search a three-chunk window using the stock car's real acceleration and speed caps. */
function hasSteeringPath(seed: number, startChunk: number): boolean {
  const startDistance = startChunk * CHUNK_LENGTH;
  const endDistance = (startChunk + WINDOW_CHUNKS) * CHUNK_LENGTH;
  const blockers = blockersFor(seed, startChunk);
  let distance = startDistance;
  let candidates: PathState[] = [{ x: laneCenterX(safeLane(seed, startChunk)), vel: 0 }];

  while (candidates.length > 0 && distance < endDistance) {
    const next = new Map<string, { state: PathState; score: number }>();
    const nextDistance = Math.min(
      endDistance,
      distance + MAX_FORWARD_SPEED * FIXED_DT * STEPS_PER_DECISION,
    );

    for (const candidate of candidates) {
      for (const steer of STEER) {
        let x = candidate.x;
        let vel = candidate.vel;
        let z = distance;
        let blocked = false;

        for (let tick = 0; tick < STEPS_PER_DECISION && z < endDistance; tick += 1) {
          const targetVel = steer * CAR_TUNING.lateralMaxSpeed;
          // Snow is the weakest steering bite. Using it everywhere makes this a
          // conservative route test for every biome in the authored journey.
          const accel =
            steer === 0 ? CAR_TUNING.lateralBrake * 0.6 : CAR_TUNING.lateralAccel * 0.82;
          vel = moveTowards(vel, targetVel, accel * FIXED_DT);
          x += vel * FIXED_DT;
          if (x < -ROAD_EDGE) {
            x = -ROAD_EDGE;
            vel = 0;
          } else if (x > ROAD_EDGE) {
            x = ROAD_EDGE;
            vel = 0;
          }
          z = Math.min(endDistance, z + MAX_FORWARD_SPEED * FIXED_DT);
          if (overlaps(blockers, x, z)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        const guideChunk = Math.floor((nextDistance + CHUNK_LENGTH * 0.5) / CHUNK_LENGTH);
        const guideX = laneCenterX(safeLane(seed, guideChunk));
        const score = Math.abs(x - guideX) + Math.abs(vel) * 0.025;
        const key = `${Math.round(x * 10)}:${Math.round(vel * 4)}`;
        const previous = next.get(key);
        if (!previous || score < previous.score) next.set(key, { state: { x, vel }, score });
      }
    }

    candidates = [...next.values()]
      .sort((a, b) => a.score - b.score)
      .slice(0, BEAM_WIDTH)
      .map((entry) => entry.state);
    distance = nextDistance;
  }

  return candidates.length > 0 && distance >= endDistance;
}

describe('conservative static steering path', () => {
  it('finds a steering-only route through every act and deep biome band', () => {
    const failures: string[] = [];
    // 8 seeds × 399 overlapping windows = 3,192 windows through 20.15 km. This
    // reaches all six authored acts plus the late bridge/lava biome bands.
    for (let seed = 1; seed <= 8; seed += 1) {
      for (let startChunk = 2; startChunk <= 400; startChunk += 1) {
        if (!hasSteeringPath(seed, startChunk)) failures.push(`seed ${seed}, chunk ${startChunk}`);
        if (failures.length >= 12) break;
      }
      if (failures.length >= 12) break;
    }
    expect(failures).toEqual([]);
  }, 15_000);
});
