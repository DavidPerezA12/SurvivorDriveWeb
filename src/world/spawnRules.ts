import { LANE_X } from '../game/config';
import type { ObstacleKind } from '../game/types';

export function isLaneBlocker(type: ObstacleKind): boolean {
  return type === 'abandonedCar' || type === 'barricade' || type === 'crack';
}

export function canPlaceObstacle(
  type: ObstacleKind,
  lane: number,
  row: number,
  reserved: ReadonlySet<string>,
  rowBlockers: ReadonlyMap<number, number>
): boolean {
  if (reserved.has(getSlotKey(lane, row))) {
    return false;
  }

  return !isLaneBlocker(type) || (rowBlockers.get(row) ?? 0) < LANE_X.length - 1;
}

export function getSlotKey(lane: number, row: number): string {
  return `${lane}:${row}`;
}

export function getDecisionRow(localZ: number, chunkLength: number): number {
  return Math.round(localZ / (chunkLength / 6));
}
