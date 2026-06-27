/**
 * Paint — the garage's COLOR tab, as data (docs/DESIGN.md → Upgrades render on
 * the car model). A paint job is pure cosmetics: it recolors the body shell of
 * whichever chassis is driven and never touches the loadout, so it stays out of
 * the run input and the determinism contract entirely.
 *
 * `factory` is the stock job — its `body` is `null`, meaning "leave the chassis
 * its authored color" (each car keeps its own paint). Every other swatch overrides
 * the body color with a single low-poly-friendly hex; the render layer bakes it
 * into the body vertex colors when it builds the car.
 */

export type PaintId =
  | 'factory'
  | 'rust'
  | 'gunmetal'
  | 'void'
  | 'bone'
  | 'hazard'
  | 'ember'
  | 'toxic'
  | 'riot'
  | 'lastPink';

export interface PaintDef {
  readonly id: PaintId;
  /** Display name on the swatch card. */
  readonly name: string;
  /**
   * The body color this swatch bakes onto the car, or `null` for the factory job
   * (each chassis keeps its own authored body color).
   */
  readonly body: number | null;
}

export const PAINTS: readonly PaintDef[] = [
  { id: 'factory', name: 'Factory', body: null },
  { id: 'rust', name: 'Rust Bucket', body: 0x8a4a2a },
  { id: 'gunmetal', name: 'Gunmetal', body: 0x3c4046 },
  { id: 'void', name: 'Void Black', body: 0x191a1f },
  { id: 'bone', name: 'Bone White', body: 0xc6bca2 },
  { id: 'hazard', name: 'Hazard Yellow', body: 0xc8a12c },
  { id: 'ember', name: 'Ember Orange', body: 0xc05a1f },
  { id: 'toxic', name: 'Toxic Green', body: 0x4f7a2e },
  { id: 'riot', name: 'Riot Blue', body: 0x2f5b8c },
  { id: 'lastPink', name: 'Last Pink', body: 0xb84c7a },
] as const;

const BY_ID = new Map<PaintId, PaintDef>(PAINTS.map((p) => [p.id, p]));

/** Look up a paint definition, falling back to the factory job. */
export function paintDef(id: PaintId): PaintDef {
  return BY_ID.get(id) ?? PAINTS[0];
}

/**
 * The body-color override for a paint id, or `null` for the factory job (the
 * render layer then keeps each chassis its authored color).
 */
export function paintBody(id: PaintId): number | null {
  return paintDef(id).body;
}
