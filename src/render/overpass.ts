import * as THREE from 'three';
import { box, merged, paint, propMaterial, rockChunk } from './materials';
import { palette } from './palette';
import { LOOKAHEAD } from '../content/tuning';
import { ACT_SPAN } from './mood';
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
/** Distance over which spans go from mostly-standing to mostly-fallen, as the
 *  run drives deeper into the end of the world: the five act spans up to Static. */
const DECAY_SPAN = ACT_SPAN * 5;
/** Underside clearance of the deck — well above the ~1.1 m jump peak. */
const DECK_Y = 9.5;

const CONCRETE = palette.structureHaze;
const CONCRETE_DARK = palette.structureBase;
const REBAR = palette.rampRebar;

/**
 * One portal pier: twin round columns on plinth feet carrying a hammerhead cap
 * beam. Round columns + a chamfered cap read as real bridge engineering where
 * the old plain box read as a placeholder leg.
 */
function pier(parts: THREE.BufferGeometry[], x: number): void {
  for (const sz of [-1, 1]) {
    parts.push(
      paint(new THREE.CylinderGeometry(0.85, 1.0, DECK_Y - 1.2, 10), CONCRETE_DARK, 0.55).translate(
        x,
        (DECK_Y - 1.2) / 2,
        sz * 1.9,
      ),
    );
    // Plinth foot at the base of each column.
    parts.push(box(2.2, 0.7, 2.2, CONCRETE_DARK, 0.5).translate(x, 0.35, sz * 1.9));
  }
  // The hammerhead cap beam the girders rest on, with a thin bearing shelf.
  parts.push(box(3.4, 1.1, 6.2, CONCRETE_DARK, 0.5).translate(x, DECK_Y - 0.85, 0));
  parts.push(box(3.0, 0.25, 6.4, CONCRETE, 0.45).translate(x, DECK_Y - 0.22, 0));
  // Grime bleeding down one column face, a hair proud (the ≥10 mm overlay rule).
  parts.push(box(0.5, 3.4, 0.12, CONCRETE_DARK, 0.6).translate(x + 0.4, DECK_Y - 3.6, 1.9 + 0.98));
}

/** The girder deck: slab, edge cornices, and the I-beam run underneath — the
 *  underside is the face the player actually drives beneath. */
function girderDeck(parts: THREE.BufferGeometry[], x: number, len: number): void {
  parts.push(box(len, 0.7, 7, CONCRETE, 0.5).translate(x, DECK_Y + 0.45, 0)); // slab
  // Edge cornices framing the fascia line.
  parts.push(box(len, 0.5, 0.45, CONCRETE_DARK, 0.45).translate(x, DECK_Y + 0.3, 3.5));
  parts.push(box(len, 0.5, 0.45, CONCRETE_DARK, 0.45).translate(x, DECK_Y + 0.3, -3.5));
  // Four longitudinal girders under the slab.
  for (const gz of [-2.55, -0.85, 0.85, 2.55]) {
    parts.push(box(len, 0.75, 0.42, CONCRETE_DARK, 0.6).translate(x, DECK_Y - 0.28, gz));
    parts.push(box(len, 0.16, 0.7, CONCRETE_DARK, 0.55).translate(x, DECK_Y - 0.72, gz)); // bottom flange
  }
}

/** Parapet wall with posts and a rail line, both sides of a deck run. */
function parapets(parts: THREE.BufferGeometry[], x: number, len: number): void {
  for (const sz of [-1, 1]) {
    parts.push(box(len, 0.9, 0.4, CONCRETE, 0.4).translate(x, DECK_Y + 1.2, sz * 3.15));
    parts.push(box(len, 0.22, 0.52, CONCRETE_DARK, 0.35).translate(x, DECK_Y + 1.72, sz * 3.15)); // rail cap
    const posts = Math.max(2, Math.round(len / 6));
    for (let i = 0; i < posts; i += 1) {
      const px = x - len / 2 + (i + 0.5) * (len / posts);
      parts.push(box(0.35, 1.0, 0.56, CONCRETE_DARK, 0.45).translate(px, DECK_Y + 1.25, sz * 3.15));
    }
  }
}

/** A clean span: girder deck, posted parapets, portal piers, and the street
 *  furniture that sells "a road used to run over this" — dead lamp masts and a
 *  drain pipe weeping down a pier. */
function intactGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  girderDeck(parts, 0, 50);
  parapets(parts, 0, 50);
  for (const px of [-20, -11, 11, 20]) pier(parts, px);
  // Cross diaphragms tying the girders together over each pier line.
  for (const px of [-20, -11, 11, 20]) {
    parts.push(box(0.4, 0.7, 5.6, CONCRETE_DARK, 0.6).translate(px, DECK_Y - 0.3, 0));
  }
  // Dead highway lamp masts leaning off the parapet line.
  for (const [mx, lean] of [
    [-14, 0.08],
    [6, -0.05],
    [17, 0.16],
  ] as const) {
    parts.push(
      paint(
        new THREE.CylinderGeometry(0.09, 0.13, 3.4, 6).rotateZ(lean).translate(mx, DECK_Y + 3.3, -3.15),
        CONCRETE_DARK,
        0.4,
      ),
    );
    parts.push(
      paint(
        new THREE.BoxGeometry(0.14, 0.14, 1.5).rotateX(-0.15).translate(mx, DECK_Y + 4.9, -2.4),
        CONCRETE_DARK,
        0.35,
      ),
    );
    parts.push(box(0.3, 0.14, 0.5, CONCRETE_DARK, 0.3).translate(mx, DECK_Y + 4.8, -1.75)); // dead head
  }
  // A drain pipe down the inner face of one pier, with a rust bleed at its foot.
  parts.push(
    paint(new THREE.CylinderGeometry(0.09, 0.09, DECK_Y - 1.4, 6), CONCRETE_DARK, 0.35).translate(
      12.3,
      (DECK_Y - 1.4) / 2 + 0.4,
      2.9,
    ),
  );
  parts.push(box(0.5, 0.06, 0.7, REBAR, 0.5).translate(12.3, 0.06, 3.1));
  // Weather staining down the fascia over the road, slightly proud of the cornice.
  for (const [wx, ww] of [
    [-7, 0.9],
    [2.5, 0.6],
    [15.5, 1.1],
  ] as const) {
    parts.push(box(ww, 0.46, 0.12, CONCRETE_DARK, 0.6).translate(wx, DECK_Y + 0.28, 3.72));
  }
  return merged(parts);
}

/**
 * A collapsed span: the road-side deck is gone (the dramatic gap, sky showing
 * through), and the wreckage droops toward the shoulder, never into the drivable
 * corridor — everything over |x| < 9 stays high above any jump. The piers sit off
 * the road, one toppled, with rubble heaped beneath the break. Same girder + pier
 * language as the intact span, torn: sheared girder stubs past the fracture,
 * hanging rebar, and craggy rubble instead of clean boxes.
 */
function collapsedGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // The far-side stub still resting on its pier (right shoulder), parapet intact.
  girderDeck(parts, 19, 13);
  parapets(parts, 19, 13);
  pier(parts, 20);
  // Sheared girder stubs jutting past the stub's broken face, rebar hooked under.
  for (const gz of [-2.55, -0.85, 0.85, 2.55]) {
    parts.push(box(1.6, 0.75, 0.42, CONCRETE_DARK, 0.6).rotateZ(-0.08).translate(11.9, DECK_Y - 0.38, gz));
  }
  parts.push(
    paint(new THREE.BoxGeometry(0.12, 2.2, 0.12).rotateZ(0.4).translate(11.6, DECK_Y - 1.8, 1.4), REBAR, 0.4),
  );
  parts.push(
    paint(new THREE.BoxGeometry(0.1, 1.6, 0.1).rotateZ(-0.5).translate(12.1, DECK_Y - 1.5, -1.8), REBAR, 0.4),
  );
  // The near span drooping down over the left shoulder, still high at the road
  // edge so nothing dips into the driving corridor. Girders ride the tilt.
  const droop = (g: THREE.BufferGeometry): THREE.BufferGeometry =>
    g.rotateZ(0.3).translate(-15, DECK_Y - 2, 0);
  parts.push(droop(box(24, 0.7, 7, CONCRETE, 0.5).translate(0, 0.45, 0)));
  for (const gz of [-2.55, -0.85, 0.85, 2.55]) {
    parts.push(droop(box(24, 0.75, 0.42, CONCRETE_DARK, 0.6).translate(0, -0.28, gz)));
  }
  // Its parapet run, snapped short with a leaning post.
  parts.push(droop(box(21, 0.9, 0.4, CONCRETE, 0.4).translate(-1, 1.2, 3.15)));
  parts.push(droop(box(21, 0.9, 0.4, CONCRETE, 0.4).translate(-1, 1.2, -3.15)));
  parts.push(droop(paint(new THREE.BoxGeometry(0.35, 1.3, 0.56).rotateX(0.5).translate(9.6, 1.1, 3.15), CONCRETE_DARK, 0.45)));
  // The fractured edge near the road, sheared and slightly dropped.
  parts.push(box(6, 1.4, 7, CONCRETE, 0.5).rotateZ(0.12).translate(-6, DECK_Y - 1.2, 0));
  // A slab hanging off the broken edge, out over the shoulder, rebar streaming.
  parts.push(box(7, 1.2, 6, CONCRETE, 0.45).rotateZ(1.05).translate(-10.5, 5, 0.5));
  parts.push(paint(new THREE.BoxGeometry(0.14, 3, 0.14).rotateZ(0.3).translate(-8, DECK_Y - 3, 1.2), REBAR, 0.4));
  parts.push(paint(new THREE.BoxGeometry(0.12, 2.4, 0.12).rotateZ(-0.35).translate(-9.2, DECK_Y - 3.4, -0.8), REBAR, 0.4));
  parts.push(paint(new THREE.BoxGeometry(0.1, 1.8, 0.1).rotateZ(0.55).translate(-6.8, DECK_Y - 2.4, -1.6), REBAR, 0.4));
  // Left pier standing (portal), its toppled neighbour lying across the shoulder
  // as two round column drums, snapped at the joint.
  pier(parts, -20);
  parts.push(
    paint(new THREE.CylinderGeometry(0.9, 0.95, 5.2, 10), CONCRETE_DARK, 0.5)
      .rotateZ(1.35)
      .translate(-13, 1.6, -0.6),
  );
  parts.push(
    paint(new THREE.CylinderGeometry(0.85, 0.9, 3.0, 10), CONCRETE_DARK, 0.5)
      .rotateZ(1.15)
      .rotateY(0.3)
      .translate(-9.8, 3.6, 0.9),
  );
  parts.push(paint(new THREE.BoxGeometry(0.12, 1.4, 0.12).rotateZ(1.5).translate(-11.2, 2.6, -0.5), REBAR, 0.4));
  // Craggy rubble heaped on the shoulders under the break — broken concrete,
  // never clean crates.
  parts.push(rockChunk(2.6, 0.55, 0.6, CONCRETE_DARK, 0.55).rotateY(0.4).translate(-14, 1.1, 0.5));
  parts.push(rockChunk(1.9, 0.6, 0.7, CONCRETE, 0.5).rotateY(1.1).translate(-11.5, 0.9, 2.2));
  parts.push(rockChunk(1.5, 0.65, 0.7, CONCRETE_DARK, 0.5).rotateY(0.8).translate(-16.8, 0.7, -1.8));
  parts.push(rockChunk(1.7, 0.6, 0.65, CONCRETE_DARK, 0.5).rotateY(0.2).translate(13, 0.8, 1.5));
  parts.push(rockChunk(1.2, 0.6, 0.7, CONCRETE, 0.45).rotateY(1.4).translate(15.2, 0.6, -1.2));
  return merged(parts);
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
      // Spans fall as the world ends: ~25% collapsed near the opening city, ~80%
      // deep in. Keyed to the site's absolute forward, so a given overpass always
      // looks the same and never flips as the car nears it.
      const decay = Math.min(Math.max((site * SPACING) / DECAY_SPAN, 0), 1);
      mesh.geometry = this.rand(site, 2) < 0.25 + 0.55 * decay ? this.collapsed : this.intact;
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
