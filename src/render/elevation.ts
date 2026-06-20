import { roadHeightAt, roadSlopeAt } from '../content/terrain';

/**
 * Render-side helper for the road's vertical profile (`src/content/terrain.ts`).
 *
 * The world is drawn car-relative: the car and chase camera stay at a fixed
 * screen height, and everything anchored to a world-*forward* position is lifted
 * by `yAt(forward, distance)` — the road's height there minus the road's height
 * under the car. So the road and everything on it climbs and dips ahead while the
 * car rides level, the classic outrun hill effect. Because the offset is shared
 * by every object at the same forward, nothing here changes the sim: collisions
 * stay flat lane-grid math (docs/ARCHITECTURE.md → no physics engine).
 *
 * The flat ground plane and the camera need no change: under the car `yAt ≈ 0`,
 * and the non-negative profile means the road only rises above the floor ahead.
 */
export class Elevation {
  constructor(private readonly seed: number) {}

  /** Road surface height under a world-forward position. */
  heightAt(forward: number): number {
    return roadHeightAt(this.seed, forward);
  }

  /** Local slope at a world-forward position, for pitching road tiles to match. */
  slopeAt(forward: number): number {
    return roadSlopeAt(this.seed, forward);
  }

  /** Car-relative Y of a point at world-forward `forward`, car at `distance`. */
  yAt(forward: number, distance: number): number {
    return roadHeightAt(this.seed, forward) - roadHeightAt(this.seed, distance);
  }
}
