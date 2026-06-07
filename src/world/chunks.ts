import { DIFFICULTY, LANE_X } from '../game/config';
import type { Entity, ObstacleKind, ResourceKind } from '../game/types';
import { Random } from '../core/random';
import { canPlaceObstacle, getSlotKey, isLaneBlocker } from './spawnRules';

export type RoadChunk = {
  id: number;
  startZ: number;
  length: number;
  entities: Entity[];
};

const PICKUPS: ResourceKind[] = ['ammo', 'scrap', 'parts'];
const PRIMARY_ROWS = [3, 4, 5] as const;
const FOLLOWUP_ROWS = [5, 6] as const;

export function createChunk(index: number, startZ: number): RoadChunk {
  const random = new Random(0xa11ce + index * 977);
  const distanceBand = Math.min(5, Math.floor(index / 5));
  const entities: Entity[] = [];
  const reserved = new Set<string>();
  const rowBlockers = new Map<number, number>();
  let obstacleIndex = 0;
  let pickupIndex = 0;
  const pattern = pickPattern(index, distanceBand, random);
  const primaryRow = random.pick(PRIMARY_ROWS);

  for (const placement of createObstaclePattern(pattern, primaryRow, random)) {
    if (!canPlaceObstacle(placement.type, placement.lane, placement.row, reserved, rowBlockers)) {
      continue;
    }

    entities.push(createObstacleEntity(index, obstacleIndex, startZ, placement.lane, placement.row, placement.type));
    reserveSlot(placement.lane, placement.row, placement.type, reserved, rowBlockers);
    obstacleIndex += 1;
  }

  const pickup = createPickupPlacement(pattern, primaryRow, distanceBand, random, reserved);

  if (pickup) {
    entities.push(createPickupEntity(index, pickupIndex, startZ, pickup.lane, pickup.row, pickup.type));
    reserved.add(getSlotKey(pickup.lane, pickup.row));
    pickupIndex += 1;
  }

  if (distanceBand >= 3 && random.next() < 0.24) {
    const followup = createFollowupHazard(random, reserved, rowBlockers);

    if (followup) {
      entities.push(createObstacleEntity(index, obstacleIndex, startZ, followup.lane, followup.row, followup.type));
    }
  }

  return {
    id: index,
    startZ,
    length: DIFFICULTY.chunkLength,
    entities
  };
}

type Pattern = 'supply' | 'singleBlocker' | 'hazard' | 'jumpCheck' | 'splitBlock';
type ObstaclePlacement = { lane: number; row: number; type: ObstacleKind };
type PickupPlacement = { lane: number; row: number; type: ResourceKind };

function pickPattern(index: number, distanceBand: number, random: Random): Pattern {
  if (index < 2) {
    return random.next() < 0.55 ? 'supply' : 'singleBlocker';
  }

  const patterns: Pattern[] = ['supply', 'singleBlocker', 'hazard', 'jumpCheck'];

  if (distanceBand >= 2) {
    patterns.push('splitBlock');
  }

  return random.pick(patterns);
}

function createObstaclePattern(
  pattern: Pattern,
  row: number,
  random: Random
): ObstaclePlacement[] {
  const lane = random.int(0, LANE_X.length - 1);

  if (pattern === 'supply') {
    return [];
  }

  if (pattern === 'singleBlocker') {
    return [{ lane, row, type: random.pick(['abandonedCar', 'barricade', 'lightBarricade'] as const) }];
  }

  if (pattern === 'hazard') {
    return [{ lane, row, type: random.pick(['barrel', 'mine', 'zombie'] as const) }];
  }

  if (pattern === 'jumpCheck') {
    return [{ lane, row, type: 'crack' }];
  }

  const openLane = lane;

  return LANE_X
    .map((_, laneIndex) => laneIndex)
    .filter((laneIndex) => laneIndex !== openLane)
    .map((laneIndex, index) => ({
      lane: laneIndex,
      row,
      type:
        index === 0
          ? random.pick(['abandonedCar', 'barricade'] as const)
          : random.pick(['lightBarricade', 'zombie'] as const)
    }));
}

function createPickupPlacement(
  pattern: Pattern,
  primaryRow: number,
  distanceBand: number,
  random: Random,
  reserved: ReadonlySet<string>
): PickupPlacement | null {
  const shouldPlacePickup = pattern === 'supply' || random.next() < Math.max(0.2, 0.62 - distanceBand * 0.07);

  if (!shouldPlacePickup) {
    return null;
  }

  const preferredRows = pattern === 'supply' ? [2, 4] : [Math.min(6, primaryRow + 1), Math.max(2, primaryRow - 1)];

  for (const row of preferredRows) {
    const lane = random.int(0, LANE_X.length - 1);

    if (!reserved.has(getSlotKey(lane, row)) && countReservedInRow(reserved, row) < 2) {
      return { lane, row, type: random.pick(PICKUPS) };
    }
  }

  return null;
}

function createFollowupHazard(
  random: Random,
  reserved: Set<string>,
  rowBlockers: Map<number, number>
): ObstaclePlacement | null {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const lane = random.int(0, LANE_X.length - 1);
    const row = random.pick(FOLLOWUP_ROWS);
    const type = random.pick(['barrel', 'mine', 'zombie'] as const);

    if (countReservedInRow(reserved, row) > 0) {
      continue;
    }

    if (!canPlaceObstacle(type, lane, row, reserved, rowBlockers)) {
      continue;
    }

    reserveSlot(lane, row, type, reserved, rowBlockers);
    return { lane, row, type };
  }

  return null;
}

function reserveSlot(
  lane: number,
  row: number,
  type: ObstacleKind,
  reserved: Set<string>,
  rowBlockers: Map<number, number>
): void {
  reserved.add(getSlotKey(lane, row));

  if (isLaneBlocker(type)) {
    rowBlockers.set(row, (rowBlockers.get(row) ?? 0) + 1);
  }
}

function countReservedInRow(reserved: ReadonlySet<string>, row: number): number {
  let count = 0;

  for (const key of reserved) {
    if (key.endsWith(`:${row}`)) {
      count += 1;
    }
  }

  return count;
}

function createObstacleEntity(
  chunkIndex: number,
  obstacleIndex: number,
  startZ: number,
  lane: number,
  row: number,
  type: ObstacleKind
): Entity {
  return {
    id: `chunk-${chunkIndex}-obstacle-${obstacleIndex}`,
    kind: 'obstacle',
    type,
    position: {
      x: LANE_X[lane],
      y: type === 'crack' ? 0.02 : 0.4,
      z: startZ + row * (DIFFICULTY.chunkLength / 6)
    },
    radius: type === 'crack' ? 1.35 : type === 'barrel' || type === 'mine' ? 0.65 : 1.05,
    width: type === 'crack' ? 3 : type === 'barricade' ? 2.8 : 1.7,
    depth: type === 'crack' ? 1.2 : 1.8
  };
}

function createPickupEntity(
  chunkIndex: number,
  pickupIndex: number,
  startZ: number,
  lane: number,
  row: number,
  type: ResourceKind
): Entity {
  return {
    id: `chunk-${chunkIndex}-pickup-${pickupIndex}`,
    kind: 'pickup',
    type,
    position: {
      x: LANE_X[lane],
      y: 0.75,
      z: startZ + row * (DIFFICULTY.chunkLength / 6)
    },
    radius: 0.75
  };
}


export function ensureChunks(chunks: RoadChunk[], farthestZ: number): RoadChunk[] {
  const nextChunks = [...chunks];
  let last = nextChunks.at(-1);

  while (!last || last.startZ + last.length < farthestZ) {
    const id = last ? last.id + 1 : 0;
    const startZ = last ? last.startZ + last.length : DIFFICULTY.startingClearM;
    last = createChunk(id, startZ);
    nextChunks.push(last);
  }

  return nextChunks.filter((chunk) => chunk.startZ + chunk.length > -DIFFICULTY.chunkLength);
}
