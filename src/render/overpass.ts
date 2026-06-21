import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import { LOOKAHEAD } from '../content/tuning';
import type { Elevation } from './elevation';

/**
 * Highway overpasses crossing the road, the structures the drive passes under.
 * Some still span clean; many have collapsed, their decks drooping and snapped,
 * a pier toppled, rubble heaped on the shoulder. They give the road a third
 * dimension and sell "this highway used to go somewhere", and the broken ones are
 * the visual of "the road ahead is wrecked" without touching the drivable surface
 * (docs/DESIGN.md → Art direction; the road-reshaping that the car drives
 * over is the M3 "road is the boss" work, deliberately not pulled forward here).
 *
 * Deck and piers clear the car (and any jump) with room to spare, and the piers
 * sit off the road, so an overpass is pure backdrop — render-side only, reading
 * `distance`. They are sparse, so a tiny pool of meshes streamed against distance
 * covers the window; each slot picks intact-or-collapsed from its seeded hash, so
 * a given overpass always looks the same and nothing allocates per frame
 * (docs/ARCHITECTURE.md → allocation discipline). They use the lit road material,
 * so the act lights re-mood them like everything else.
 */

/** Meters between candidate overpass sites. */
const SPACING = 330;
/** Pool size — at most a couple are ever in the lookahead window at once. */
const POOL = 3;
/** Underside clearance of the deck — well above the ~1.1 m jump peak. */
const DECK_Y = 9.5;

const CONCRETE = palette.structureHaze;
const CONCRETE_DARK = palette.structureBase;

/** A clean span: deck, parapets, four piers with caps. */
function intactGeometry(): THREE.BufferGeometry {
  const parts = [
    box(50, 1.6, 7, CONCRETE, 0.5).translate(0, DECK_Y, 0), // deck slab
    box(50, 1.1, 0.6, CONCRETE, 0.4).translate(0, DECK_Y + 1.1, 3.1), // parapets
    box(50, 1.1, 0.6, CONCRETE, 0.4).translate(0, DECK_Y + 1.1, -3.1),
  ];
  for (const sx of [-1, 1]) {
    for (const px of [11, 20]) {
      parts.push(box(2.4, DECK_Y, 2.4, CONCRETE_DARK, 0.55).translate(sx * px, DECK_Y / 2, 0));
      parts.push(box(3.6, 1, 4, CONCRETE_DARK, 0.5).translate(sx * px, DECK_Y - 0.4, 0)); // pier cap
    }
  }
  return assemble(parts);
}

/**
 * A collapsed span: the road-side deck is gone (the dramatic gap, sky showing
 * through), and the wreckage droops toward the shoulder, never into the drivable
 * corridor — everything over |x| < 9 stays high above any jump. The piers sit off
 * the road, one toppled, with rubble heaped beneath the break.
 */
function collapsedGeometry(): THREE.BufferGeometry {
  return assemble([
    // The far-side stub still resting on its pier (right shoulder).
    box(13, 1.6, 7, CONCRETE, 0.5).translate(19, DECK_Y, 0),
    box(3.6, 1, 4, CONCRETE_DARK, 0.5).translate(19, DECK_Y - 0.4, 0),
    box(2.4, DECK_Y, 2.4, CONCRETE_DARK, 0.55).translate(20, DECK_Y / 2, 0),
    // The near span drooping down over the left shoulder, still high at the road
    // edge so nothing dips into the driving corridor.
    box(24, 1.5, 7, CONCRETE, 0.5).rotateZ(0.3).translate(-15, DECK_Y - 2, 0),
    // The fractured edge near the road, sheared and slightly dropped.
    box(6, 1.4, 7, CONCRETE, 0.5).rotateZ(0.12).translate(-6, DECK_Y - 1.2, 0),
    // A slab hanging off the broken edge, out over the shoulder.
    box(7, 1.2, 6, CONCRETE, 0.45).rotateZ(1.05).translate(-10.5, 5, 0.5),
    // Hanging rebar off the fracture (over the shoulder).
    box(0.14, 3, 0.14, CONCRETE_DARK, 0.4).rotateZ(0.3).translate(-8, DECK_Y - 3, 1.2),
    // Left pier standing; its neighbor toppled across the shoulder.
    box(2.4, DECK_Y, 2.4, CONCRETE_DARK, 0.55).translate(-20, DECK_Y / 2, 0),
    box(2.4, 8, 2.4, CONCRETE_DARK, 0.5).rotateZ(0.5).translate(-12, 3.2, 0),
    // Rubble heaped on the shoulders under the break.
    box(7, 2.6, 6, CONCRETE_DARK, 0.5).rotateZ(0.25).translate(-14, 1.3, 0),
    box(4.5, 2, 4.5, CONCRETE_DARK, 0.45).rotateY(0.5).translate(13, 1, 1.5),
  ]);
}

function assemble(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge overpass geometry');
  return geo;
}

export class Overpass {
  private readonly intact: THREE.BufferGeometry;
  private readonly collapsed: THREE.BufferGeometry;
  private readonly pool: THREE.Mesh[] = [];
  private readonly seed: number;

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed | 0;
    this.intact = intactGeometry();
    this.collapsed = collapsedGeometry();
    for (let i = 0; i < POOL; i += 1) {
      const mesh = new THREE.Mesh(this.intact, propMaterial);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.pool.push(mesh);
      scene.add(mesh);
    }
  }

  /** Stable pseudo-random in [0, 1) for a site, salted and seeded. */
  private rand(s: number, salt: number): number {
    let h = (Math.imul(s, 374761393) ^ Math.imul(salt, 668265263) ^ this.seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  update(distance: number, elevation: Elevation): void {
    const first = Math.floor(distance / SPACING);
    const last = Math.ceil((distance + LOOKAHEAD) / SPACING);
    let slot = 0;

    for (let site = first; site <= last && slot < POOL; site += 1) {
      // Not every candidate site has an overpass — leaves clean stretches.
      if (this.rand(site, 1) < 0.32) continue;
      const mesh = this.pool[slot];
      mesh.geometry = this.rand(site, 2) < 0.5 ? this.collapsed : this.intact;
      mesh.position.z = distance - site * SPACING;
      // Ride the road profile so the piers stay planted on a hill, not floating.
      mesh.position.y = elevation.yAt(site * SPACING, distance);
      mesh.visible = true;
      slot += 1;
    }
    for (; slot < POOL; slot += 1) this.pool[slot].visible = false;
  }

  dispose(): void {
    this.intact.dispose();
    this.collapsed.dispose();
  }
}
