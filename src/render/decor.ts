import * as THREE from 'three';
import { chunkAt, type Chunk, type PropKind } from '../sim';
import { box, merged, paint, propMaterial, rockChunk, wheel } from './materials';
import { palette } from './palette';
import { CHUNK_LENGTH, LOOKAHEAD } from '../content/tuning';
import { ACT_SPAN, TRANSITION } from './mood';
import { BIOME_BAND_M, BIOME_TRANSITION_M, biomeForBand, type BiomeId } from '../content/biomes';
import type { Elevation } from './elevation';

const MAX_INSTANCES = 64;

/** A vertex-colored cone, for faceted shards and spurs. */
function cone(r: number, h: number, seg: number, hex: number, ao: number): THREE.BufferGeometry {
  return paint(new THREE.ConeGeometry(r, h, seg), hex, ao);
}

/** A leaning street light: base plate, pole, arm, lamp head, and a dead wire.
 *  Anchor bolts, a banner bracket with its torn banner, and a taped flyer give
 *  the pole a lived-in city read up close. */
function postGeometry(): THREE.BufferGeometry {
  return merged([
    box(0.42, 0.1, 0.42, palette.post, 0.5).translate(0, 0.05, 0),
    // Bolted anchor flange just above the base plate, with the four bolt heads.
    box(0.3, 0.08, 0.3, palette.postCollar, 0.5).translate(0, 0.13, 0),
    box(0.05, 0.07, 0.05, palette.postCollar, 0.35).translate(0.16, 0.13, 0.16),
    box(0.05, 0.07, 0.05, palette.postCollar, 0.35).translate(-0.16, 0.13, 0.16),
    box(0.05, 0.07, 0.05, palette.postCollar, 0.35).translate(0.16, 0.13, -0.16),
    box(0.05, 0.07, 0.05, palette.postCollar, 0.35).translate(-0.16, 0.13, -0.16),
    box(0.2, 3.2, 0.2, palette.post, 0.6).translate(0, 1.6, 0),
    // A weathered junction box clamped to the pole.
    box(0.26, 0.4, 0.18, palette.postCollar, 0.45).translate(0.05, 1.1, 0.16),
    box(0.7, 0.16, 0.16, palette.post, 0.5).translate(0.3, 3.15, 0),
    // A diagonal gusset bracing the arm to the pole.
    box(0.04, 0.42, 0.12, palette.post, 0.4).rotateZ(0.78).translate(0.18, 2.95, 0),
    box(0.5, 0.22, 0.32, palette.postLamp, 0.4).translate(0.55, 3.05, 0),
    // The lamp's dead lens face on the underside.
    box(0.36, 0.04, 0.22, palette.huskGlass, 0.2).translate(0.55, 2.93, 0),
    // A snapped power line drooping off the arm.
    box(0.04, 0.7, 0.04, palette.post, 0.4).rotateX(0.4).translate(0.62, 2.78, 0.12),
    // The banner bracket pair mid-pole, its banner torn loose and hanging by one arm.
    box(0.3, 0.05, 0.05, palette.postCollar, 0.4).translate(-0.15, 2.5, 0),
    box(0.3, 0.05, 0.05, palette.postCollar, 0.4).translate(-0.15, 1.85, 0),
    paint(
      new THREE.BoxGeometry(0.04, 0.62, 0.4).rotateX(0.15).rotateZ(0.25).translate(-0.34, 2.15, 0.05),
      palette.barrierPaint,
      0.3,
    ),
    // A taped flyer at eye height — the last notice anyone posted.
    box(0.03, 0.26, 0.2, palette.coupeStripe, 0.2).translate(0.11, 1.62, 0.02),
  ]);
}

/** An irregular boulder cluster: faceted stone, not stacked boxes — the same
 *  craggy read as the on-road boulder, but desaturated decoration grey. */
function rockGeometry(): THREE.BufferGeometry {
  return merged([
    rockChunk(0.75, 0.62, 0.55, palette.rock, 0.6).rotateY(0.4).translate(0, 0.36, 0),
    rockChunk(0.5, 0.66, 0.6, palette.rockLight, 0.5).rotateY(-0.6).translate(0.52, 0.26, -0.3),
    rockChunk(0.36, 0.7, 0.65, palette.rockDark, 0.55).rotateY(1.1).translate(-0.48, 0.2, 0.25),
    rockChunk(0.3, 0.62, 0.7, palette.rock, 0.5).rotateY(0.9).translate(0.2, 0.13, 0.5),
    rockChunk(0.2, 0.6, 0.7, palette.rockDark, 0.5).rotateY(0.1).translate(-0.6, 0.09, -0.35),
  ]);
}

/**
 * A burnt-out car husk: low, gutted, scorched. Decoration tier — deliberately
 * dark and desaturated so it never gets mistaken for the warm interactive wreck
 * on the road (docs/DESIGN.md → readability: decoration never mimics an
 * interactive silhouette).
 */
function huskGeometry(): THREE.BufferGeometry {
  return merged([
    box(1.7, 0.4, 3.5, palette.husk, 0.45).translate(0, 0.45, 0),
    box(1.8, 0.32, 2.0, palette.husk, 0.5).translate(0, 0.75, 0.1),
    // Caved cabin, dead windshield, and a blown-out side window.
    box(1.5, 0.4, 1.4, palette.husk, 0.5).rotateZ(0.06).translate(0, 0.95, -0.2),
    box(1.36, 0.3, 0.14, palette.huskGlass, 0.3).translate(0, 0.92, 0.5),
    box(0.12, 0.24, 0.8, palette.huskGlass, 0.3).translate(0.74, 0.95, -0.25),
    // Sagging, burnt hood over a scorched, gutted engine bay.
    box(1.5, 0.1, 1.0, palette.husk, 0.3).rotateX(0.12).translate(0, 0.7, 1.05),
    box(1.2, 0.06, 0.6, palette.wreckScorch, 0.2).translate(0, 0.66, 1.05),
    // A door wrenched open and hanging off its hinge.
    box(0.1, 0.46, 1.1, palette.huskDoor, 0.45).rotateY(0.6).translate(0.95, 0.7, 0.1),
    // A buckled exhaust dragging out the back.
    box(0.12, 0.12, 0.9, palette.wreckScorch, 0.3).translate(-0.4, 0.18, -1.7),
    // Front and rear bumpers, the rear one shed at one end.
    box(1.78, 0.14, 0.12, palette.huskDoor, 0.4).translate(0, 0.4, 1.78),
    paint(
      new THREE.BoxGeometry(1.7, 0.12, 0.1).rotateY(0.14).translate(0.1, 0.36, -1.8),
      palette.huskDoor,
      0.4,
    ),
    // A bleached licence plate and one surviving door mirror.
    box(0.34, 0.12, 0.03, palette.barrierPaint, 0.25).translate(0.3, 0.55, -1.84),
    box(0.14, 0.1, 0.07, palette.huskDoor, 0.35).translate(-0.9, 0.98, 0.55),
    // Three tyres left on the rims, one corner sagging.
    wheel(0.33, 0.26, palette.wheel).translate(0.78, 0.2, 1.2),
    wheel(0.33, 0.26, palette.wheel).translate(-0.78, 0.2, 1.2),
    wheel(0.3, 0.24, palette.wheel).translate(-0.78, 0.17, -1.25),
  ]);
}

/**
 * A jersey barrier: wide foot tapering to a narrower top, with worn hazard paint
 * and a corner spalled to the concrete core. Detail from proportion and vertex
 * color, not triangle count (docs/DESIGN.md → Object craft).
 */
function barrierGeometry(): THREE.BufferGeometry {
  return merged([
    box(0.62, 0.34, 2.4, palette.barrier, 0.5).translate(0, 0.17, 0),
    box(0.34, 0.55, 2.4, palette.barrier, 0.4).translate(0, 0.5, 0),
    // A band of worn paint around the upper body.
    box(0.36, 0.16, 2.42, palette.barrierPaint, 0.35).translate(0, 0.58, 0),
    // One end chipped away, exposing the grey concrete core.
    box(0.3, 0.5, 0.34, palette.barrierCore, 0.4).rotateZ(-0.12).translate(0.02, 0.46, 1.18),
  ]);
}

// Act-coherent roadside objects. The sim's four prop kinds are kept only as
// placement *archetypes* (where a prop sits and how it stands): `post` is the
// upright thing at the verge, `barrier` hugs the shoulder, `husk` is the low
// dead car, `rock` is a low cluster. Each archetype is then dressed per act below,
// so the immediate roadside tells the same story the skyline does (docs/DESIGN.md
// → Run structure: the world ends in stages). Decoration tier: desaturated, never
// warm, never mimicking an interactive silhouette (docs/DESIGN.md → readability).

/** A bare dead tree: a split trunk and a knot of leafless branches (Rust). */
function deadTreeGeometry(): THREE.BufferGeometry {
  const t = palette.post;
  const b = palette.postCollar;
  return merged([
    box(0.3, 3.0, 0.3, t, 0.5).translate(0, 1.5, 0),
    box(0.18, 1.6, 0.18, t, 0.5).rotateZ(0.6).translate(-0.55, 2.6, 0),
    box(0.16, 1.3, 0.16, t, 0.5).rotateZ(-0.7).translate(0.5, 2.9, 0.1),
    box(0.12, 1.0, 0.12, b, 0.4).rotateX(0.6).translate(0.1, 3.4, -0.4),
    box(0.1, 0.8, 0.1, b, 0.4).rotateZ(0.9).translate(-0.3, 3.7, 0.2),
  ]);
}

/** A tall alien crystal shard standing at the verge, faceted and quiet (Visitors).
 *  Kept dark (no pickup-bright glow) so it never competes with a cool road token. */
function crystalSpurGeometry(): THREE.BufferGeometry {
  const b = palette.crystalBody;
  return merged([
    cone(0.6, 4.2, 5, b, 0.5).rotateZ(0.12).translate(0, 2.0, 0),
    cone(0.4, 2.6, 5, b, 0.45).rotateZ(-0.4).translate(0.5, 1.2, 0.2),
    cone(0.3, 1.8, 5, b, 0.45).rotateZ(0.5).translate(-0.45, 0.9, -0.15),
  ]);
}

/** A snapped girder: a concrete footing with bent rebar clawing up (Colossus/Static). */
function rebarGeometry(): THREE.BufferGeometry {
  const s = palette.railBeam;
  const d = palette.railPost;
  return merged([
    box(0.5, 0.45, 0.5, d, 0.4).translate(0, 0.22, 0),
    box(0.1, 2.8, 0.1, s, 0.4).rotateZ(0.2).translate(0, 1.6, 0),
    box(0.08, 2.2, 0.08, s, 0.4).rotateZ(-0.35).translate(0.3, 1.4, 0.1),
    box(0.08, 1.8, 0.08, s, 0.4).rotateX(0.4).translate(-0.2, 1.5, 0.2),
    box(0.07, 1.2, 0.07, s, 0.4).rotateZ(0.7).translate(0.1, 2.6, -0.1),
  ]);
}

/** A leaning timber fence section, a couple of pickets gone (Rust suburbia). */
function fenceGeometry(): THREE.BufferGeometry {
  const w = palette.husk;
  const r = palette.postCollar;
  const parts: THREE.BufferGeometry[] = [
    box(0.12, 1.1, 0.12, r, 0.4).translate(-1.0, 0.55, 0),
    box(0.12, 1.1, 0.12, r, 0.4).translate(0.0, 0.55, 0),
    box(0.12, 0.9, 0.12, r, 0.4).rotateZ(0.18).translate(1.0, 0.5, 0),
    box(2.3, 0.14, 0.06, w, 0.4).translate(0, 0.85, 0),
    box(2.3, 0.14, 0.06, w, 0.4).translate(0, 0.45, 0),
  ];
  for (const px of [-0.8, -0.4, 0.2, 0.6]) parts.push(box(0.1, 1.0, 0.05, w, 0.4).translate(px, 0.55, 0));
  return merged(parts);
}

/** A toppled concrete barrier shattered to its core, with broken chunks and a
 *  stub of rebar where it tore (late acts). */
function slabGeometry(): THREE.BufferGeometry {
  const c = palette.barrier;
  const core = palette.barrierCore;
  return merged([
    box(2.0, 0.5, 0.7, c, 0.5).rotateZ(0.4).translate(0, 0.32, 0),
    rockChunk(0.42, 0.72, 0.6, core, 0.4).rotateY(0.5).translate(1.3, 0.24, 0.2),
    rockChunk(0.32, 0.66, 0.65, c, 0.4).rotateY(0.9).translate(-1.05, 0.16, -0.3),
    rockChunk(0.22, 0.6, 0.7, core, 0.4).rotateY(0.1).translate(0.6, 0.1, 0.55),
    box(0.06, 0.5, 0.06, palette.railBeam, 0.3).rotateZ(0.8).translate(1.0, 0.6, 0.05),
  ]);
}

/** A heap of broken masonry with rebar poking out — a building shed onto the
 *  verge. Slab faces stay flat (cast concrete) but the heap is capped by craggy
 *  broken chunks so it reads as collapse, not stacked crates. */
function rubbleGeometry(): THREE.BufferGeometry {
  const a = palette.structureBase;
  const b = palette.barrier;
  return merged([
    // Two big wall fragments leaning into each other.
    box(1.2, 0.55, 0.9, a, 0.5).rotateZ(0.12).rotateY(0.3).translate(0, 0.28, 0),
    box(0.8, 0.5, 0.7, b, 0.45).rotateZ(0.34).rotateY(-0.4).translate(0.7, 0.35, 0.3),
    // Broken chunks capping the heap and spilled at the toe.
    rockChunk(0.4, 0.72, 0.65, a, 0.45).rotateY(0.6).translate(-0.45, 0.55, -0.2),
    rockChunk(0.3, 0.68, 0.7, b, 0.4).rotateY(1.0).translate(0.2, 0.6, 0.45),
    rockChunk(0.26, 0.62, 0.7, a, 0.45).rotateY(0.2).translate(0.95, 0.14, -0.35),
    rockChunk(0.2, 0.6, 0.7, b, 0.4).rotateY(1.4).translate(-0.85, 0.1, 0.5),
    // Bent rebar clawing out of the pile, and a shattered window frame.
    box(0.08, 0.9, 0.08, palette.railBeam, 0.3).rotateZ(0.6).translate(-0.3, 0.6, 0.3),
    box(0.06, 0.7, 0.06, palette.railBeam, 0.3).rotateZ(-0.45).rotateX(0.3).translate(0.5, 0.7, 0),
    box(0.5, 0.4, 0.06, palette.huskGlass, 0.35).rotateZ(0.5).rotateY(0.7).translate(0.15, 0.2, 0.75),
  ]);
}

/** A low cluster of alien crystal pushing up at the roadside (Visitors). Dark. */
function crystalClusterGeometry(): THREE.BufferGeometry {
  const b = palette.crystalBody;
  return merged([
    cone(0.7, 2.0, 5, b, 0.5).rotateZ(0.15).translate(0, 0.9, 0),
    cone(0.5, 1.4, 5, b, 0.45).rotateZ(-0.5).translate(0.6, 0.6, 0.2),
    cone(0.4, 1.1, 5, b, 0.45).rotateZ(0.6).translate(-0.5, 0.5, -0.2),
    cone(0.3, 0.8, 5, b, 0.4).rotateX(0.4).translate(0.1, 0.4, 0.5),
  ]);
}

/** Grey fracture shards jutting from the ground — reality coming apart (Static). */
function shardClusterGeometry(): THREE.BufferGeometry {
  const a = palette.spireBase;
  const b = palette.spireHaze;
  return merged([
    box(0.5, 2.2, 0.5, a, 0.4).rotateZ(0.2).rotateY(0.3).translate(0, 1.1, 0),
    box(0.4, 1.6, 0.4, b, 0.35).rotateZ(-0.5).translate(0.5, 0.8, 0.2),
    box(0.35, 1.2, 0.35, a, 0.35).rotateZ(0.7).translate(-0.4, 0.6, -0.2),
    box(0.3, 0.9, 0.3, b, 0.3).rotateX(0.5).translate(0.2, 0.5, 0.4),
  ]);
}

// Act I city street furniture: the day-one Outbreak verge. The opening act is
// where the run starts every time, so it carries the deepest object library —
// each archetype draws from several authored pieces (ACT_DECOR lists) and the
// street tells the evacuation story: dead signals, quarantine sandbags, looted
// dumpsters, abandoned cabs and cruisers, carts and luggage left where they fell.

/** A dead traffic signal: mast arm over the verge, three unlit lenses, and a
 *  pedestrian box on the pole. The lenses are murky — no live-light read. */
function trafficLightGeometry(): THREE.BufferGeometry {
  const h = palette.signalHousing;
  return merged([
    box(0.42, 0.1, 0.42, palette.post, 0.5).translate(0, 0.05, 0),
    box(0.16, 3.5, 0.16, palette.post, 0.6).translate(0, 1.75, 0),
    // The mast arm reaching over the shoulder, with a slight sag.
    paint(new THREE.BoxGeometry(1.7, 0.14, 0.14).rotateZ(-0.05).translate(0.85, 3.38, 0), palette.post, 0.5),
    // The three-lamp head hung off the arm end: backboard, housing, visor hoods,
    // dead lenses. The pale-rimmed backboard is the real-world contrast plate and
    // gives the head its instantly-readable silhouette.
    box(0.44, 1.14, 0.04, h, 0.4).translate(1.6, 2.86, -0.06),
    box(0.48, 0.06, 0.05, palette.postCollar, 0.3).translate(1.6, 3.45, -0.06), // board rim
    box(0.48, 0.06, 0.05, palette.postCollar, 0.3).translate(1.6, 2.27, -0.06),
    box(0.3, 0.98, 0.26, h, 0.45).translate(1.6, 2.86, 0),
    box(0.34, 0.08, 0.3, h, 0.4).translate(1.6, 3.2, 0.02), // top visor
    box(0.32, 0.06, 0.24, h, 0.35).translate(1.6, 2.94, 0.06), // mid visor
    box(0.32, 0.06, 0.24, h, 0.35).translate(1.6, 2.66, 0.06), // low visor
    box(0.18, 0.18, 0.05, palette.trafficDeadRed, 0.2).translate(1.6, 3.14, 0.14),
    box(0.18, 0.18, 0.05, palette.trafficDeadAmber, 0.2).translate(1.6, 2.86, 0.14),
    box(0.18, 0.18, 0.05, palette.trafficDeadGreen, 0.2).translate(1.6, 2.58, 0.14),
    // A second, smaller near-lane head hung under the arm's midpoint, swung askew.
    paint(new THREE.BoxGeometry(0.2, 0.62, 0.18).rotateY(0.4).translate(0.85, 2.98, 0), h, 0.45),
    box(0.12, 0.12, 0.04, palette.trafficDeadRed, 0.2).rotateY(0.4).translate(0.88, 3.16, 0.09),
    box(0.12, 0.12, 0.04, palette.trafficDeadGreen, 0.2).rotateY(0.4).translate(0.88, 2.82, 0.09),
    // Pedestrian signal box clamped to the pole, lens dead too.
    box(0.22, 0.3, 0.16, h, 0.45).translate(0.16, 2.1, 0.1),
    box(0.12, 0.12, 0.04, palette.trafficDeadAmber, 0.2).translate(0.16, 2.12, 0.19),
    // The signal-control cabinet at the base, door popped, conduit up the pole.
    box(0.4, 0.66, 0.3, palette.utilityBox, 0.5).translate(0.42, 0.33, 0.12),
    paint(
      new THREE.BoxGeometry(0.36, 0.6, 0.04).rotateY(0.8).translate(0.66, 0.33, 0.28),
      palette.utilityBox,
      0.4,
    ),
    box(0.05, 1.4, 0.05, palette.bridgeCable, 0.35).translate(0.13, 1.0, 0.08),
    // A snapped pull-wire drooping off the arm.
    box(0.03, 0.6, 0.03, palette.bridgeCable, 0.3).rotateX(0.35).translate(1.1, 3.0, 0.08),
  ]);
}

/** A streetlight snapped mid-pole: the live stub, and the upper half dropped
 *  across the verge with its lamp head, torn wires bridging the break. */
function snappedPoleGeometry(): THREE.BufferGeometry {
  const t = palette.post;
  return merged([
    box(0.42, 0.1, 0.42, t, 0.5).translate(0, 0.05, 0),
    box(0.2, 1.2, 0.2, t, 0.6).translate(0, 0.6, 0),
    // The jagged tear at the top of the stub.
    box(0.16, 0.24, 0.16, palette.postCollar, 0.4).rotateZ(0.4).translate(0.03, 1.28, 0),
    // The fallen upper half lying across the dirt, lamp head at its end.
    paint(
      new THREE.BoxGeometry(0.18, 2.4, 0.18).rotateZ(1.42).translate(1.5, 0.16, 0.25),
      t,
      0.5,
    ),
    box(0.5, 0.2, 0.3, palette.postLamp, 0.4).rotateZ(0.2).translate(2.7, 0.2, 0.28),
    // The lamp's lens burst on impact: glass pooled under the head.
    box(0.4, 0.02, 0.34, palette.glassShatter, 0.15).rotateY(0.3).translate(2.85, 0.02, 0.55),
    box(0.14, 0.03, 0.1, palette.coupeStripe, 0.1).rotateY(0.8).translate(3.05, 0.03, 0.4),
    // Torn wires arcing out of the break, and the shorn bolt heads at the tear.
    box(0.03, 0.5, 0.03, palette.bridgeCable, 0.3).rotateZ(0.9).translate(0.35, 1.15, 0.05),
    box(0.03, 0.36, 0.03, palette.bridgeCable, 0.3).rotateZ(-0.6).translate(-0.15, 1.2, -0.05),
    box(0.06, 0.06, 0.06, palette.postCollar, 0.3).translate(0.1, 1.32, 0.08),
    box(0.05, 0.05, 0.05, palette.postCollar, 0.3).translate(-0.06, 1.36, -0.06),
  ]);
}

/** A kerbside dumpster, lid ajar, garbage bags slumped beside it — the pickup
 *  that never came. */
function dumpsterGeometry(): THREE.BufferGeometry {
  const b = palette.dumpsterBody;
  const l = palette.dumpsterLid;
  return merged([
    box(1.6, 0.95, 0.95, b, 0.5).translate(0, 0.62, 0),
    // Side ribs and the lifting pockets at the base.
    box(0.06, 0.8, 0.99, l, 0.4).translate(-0.45, 0.62, 0),
    box(0.06, 0.8, 0.99, l, 0.4).translate(0.45, 0.62, 0),
    box(0.3, 0.18, 0.99, l, 0.45).translate(-0.6, 0.24, 0),
    box(0.3, 0.18, 0.99, l, 0.45).translate(0.6, 0.24, 0),
    // Split lid: one half shut, one propped open by the overflow.
    box(0.76, 0.08, 0.98, l, 0.35).translate(-0.4, 1.13, 0),
    paint(new THREE.BoxGeometry(0.76, 0.08, 0.98).rotateX(-0.55).translate(0.4, 1.3, -0.25), l, 0.35),
    // The overflow poking out and the bags slumped at the kerb.
    rockChunk(0.24, 0.7, 0.5, palette.trashBag, 0.4).translate(0.4, 1.12, 0.1),
    rockChunk(0.3, 0.6, 0.45, palette.trashBag, 0.45).translate(-1.05, 0.18, 0.35),
    rockChunk(0.24, 0.62, 0.5, palette.trashBag, 0.45).rotateY(0.8).translate(-0.9, 0.14, -0.3),
    box(0.34, 0.24, 0.28, palette.husk, 0.45).rotateY(0.5).translate(1.05, 0.12, 0.3), // a dumped crate
    // Lid hinge lugs along the back edge, castor wheels, a taped collection
    // notice, and the grease stain bled out under the body.
    box(0.12, 0.1, 0.1, l, 0.35).translate(-0.4, 1.1, -0.46),
    box(0.12, 0.1, 0.1, l, 0.35).translate(0.4, 1.1, -0.46),
    wheel(0.09, 0.07, palette.wheel).translate(-0.6, 0.09, 0.4),
    wheel(0.09, 0.07, palette.wheel).translate(0.6, 0.09, 0.4),
    box(0.02, 0.24, 0.2, palette.coupeStripe, 0.2).translate(-0.81, 0.7, 0.2),
    box(1.2, 0.015, 0.7, palette.groundScorch, 0).translate(0.1, 0.01, 0.55),
  ]);
}

/** A bus-stop shelter, leaning, its glass crazed: two posts, a sagging roof, the
 *  ad panel, and the bench nobody waits on. */
function busStopGeometry(): THREE.BufferGeometry {
  const f = palette.post;
  const g = palette.huskGlass;
  return merged([
    // Posts and the roof, all leaning a couple of degrees.
    paint(new THREE.BoxGeometry(0.1, 2.3, 0.1).rotateZ(0.05).translate(-0.35, 1.15, 0.95), f, 0.5),
    paint(new THREE.BoxGeometry(0.1, 2.3, 0.1).rotateZ(0.05).translate(-0.35, 1.15, -0.95), f, 0.5),
    paint(new THREE.BoxGeometry(1.1, 0.08, 2.3).rotateZ(0.06).translate(-0.28, 2.3, 0), f, 0.45),
    // The back glass run: one crazed pane, one gone (the empty frame).
    paint(new THREE.BoxGeometry(0.05, 1.5, 0.95).rotateZ(0.05).translate(-0.42, 1.05, 0.5), g, 0.3),
    paint(new THREE.BoxGeometry(0.05, 0.1, 0.95).rotateZ(0.05).translate(-0.45, 1.75, -0.5), f, 0.4),
    // The ad panel at one end, its poster faded to a pale sheet.
    paint(new THREE.BoxGeometry(0.08, 1.4, 0.7).rotateZ(0.05).translate(-0.4, 1.1, -1.0), f, 0.45),
    paint(new THREE.BoxGeometry(0.03, 1.2, 0.55).rotateZ(0.05).translate(-0.34, 1.1, -1.0), palette.barrierPaint, 0.3),
    // The bench: seat plank and two legs, a suitcase still waiting on it.
    box(0.45, 0.06, 1.5, palette.postCollar, 0.4).translate(-0.12, 0.5, 0),
    box(0.08, 0.5, 0.08, f, 0.45).translate(-0.12, 0.25, 0.6),
    box(0.08, 0.5, 0.08, f, 0.45).translate(-0.12, 0.25, -0.6),
    box(0.34, 0.42, 0.16, palette.suitcaseTan, 0.4).rotateY(0.15).translate(-0.12, 0.74, 0.35),
    box(0.12, 0.05, 0.04, palette.wreckDark, 0.3).rotateY(0.15).translate(-0.12, 0.97, 0.35),
    // The route flag off the roof edge and the timetable strip on a post.
    paint(new THREE.BoxGeometry(0.04, 0.3, 0.5).rotateZ(0.06).translate(-0.3, 2.5, 0.95), palette.signPlate, 0.3),
    box(0.03, 0.5, 0.18, palette.coupeStripe, 0.25).translate(-0.3, 1.5, 0.96),
    // A public bin knocked against the far post, lid hanging.
    paint(new THREE.CylinderGeometry(0.18, 0.16, 0.5, 9).rotateZ(0.15).translate(0.25, 0.26, 1.1), palette.dumpsterBody, 0.45),
    paint(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 9).rotateZ(0.9).translate(0.5, 0.1, 1.2), palette.dumpsterLid, 0.35),
    // Shattered glass pooled where the missing pane fell.
    box(0.7, 0.03, 0.6, palette.glassShatter, 0.2).rotateY(0.3).translate(-0.2, 0.02, -0.55),
  ]);
}

/** A quarantine sandbag line: two staggered courses of dusty burlap, one bag
 *  slumped off the wall — the checkpoint that did not hold. */
function sandbagsGeometry(): THREE.BufferGeometry {
  const bag = (
    x: number,
    y: number,
    z: number,
    yaw: number,
    shade: boolean,
  ): THREE.BufferGeometry =>
    rockChunk(0.26, 0.5, 0.35, shade ? palette.sandbagShade : palette.sandbagBody, 0.45)
      .rotateY(yaw)
      .translate(x, y, z);
  return merged([
    // Base course of four, tight.
    bag(-0.85, 0.12, 0, 0.2, false),
    bag(-0.28, 0.12, 0.06, 1.2, true),
    bag(0.28, 0.12, -0.04, 0.7, false),
    bag(0.85, 0.12, 0.03, 1.6, true),
    // Second course of three, offset over the joints.
    bag(-0.55, 0.34, 0.02, 0.9, true),
    bag(0.0, 0.34, -0.02, 0.3, false),
    bag(0.55, 0.34, 0.04, 1.3, false),
    // One bag slumped off the front, burst and spilling.
    bag(1.3, 0.1, 0.5, 0.5, true),
    rockChunk(0.3, 0.2, 0.3, palette.sandDune, 0.3).translate(1.5, 0.03, 0.7),
    // A dropped warning sign leaning on the wall — pale plate, dim red band.
    paint(new THREE.BoxGeometry(0.5, 0.6, 0.05).rotateX(-0.4).translate(-0.9, 0.45, 0.3), palette.signPlate, 0.3),
    box(0.5, 0.14, 0.06, palette.signStop, 0.25).rotateX(-0.4).translate(-0.9, 0.62, 0.36),
  ]);
}

/** The husk dressed as a dead city cab: a real checker band along the sills, the
 *  cracked roof sign with its dead lens — decoration-dim throughout. */
function taxiHuskGeometry(): THREE.BufferGeometry {
  const t = palette.taxiSign;
  const parts: THREE.BufferGeometry[] = [
    huskGeometry(),
    // Roof sign, cracked, hanging slightly askew, its lamp face long dead.
    paint(new THREE.BoxGeometry(0.5, 0.16, 0.22).rotateZ(0.08).translate(0, 1.25, -0.2), t, 0.35),
    box(0.36, 0.1, 0.03, palette.huskGlass, 0.2).rotateZ(0.08).translate(0, 1.25, -0.06),
    // The base livery rail each side that the checkers sit on.
    box(0.04, 0.14, 2.7, palette.huskDoor, 0.35).translate(-0.9, 0.6, -0.1),
    box(0.04, 0.14, 2.7, palette.huskDoor, 0.35).translate(0.9, 0.6, -0.1),
  ];
  // The checker band: alternating pale squares over the rail, both flanks.
  for (let i = 0; i < 5; i += 1) {
    const pz = -1.15 + i * 0.55;
    parts.push(box(0.045, 0.13, 0.26, t, 0.3).translate(-0.9, 0.6, pz));
    parts.push(box(0.045, 0.13, 0.26, t, 0.3).translate(0.9, 0.6, pz));
  }
  return merged(parts);
}

/** The husk dressed as an abandoned patrol cruiser: dead light bar, door shield,
 *  push bar — the response that never made it out. */
function policeHuskGeometry(): THREE.BufferGeometry {
  const h = palette.signalHousing;
  return merged([
    huskGeometry(),
    // The dead light bar across the roof: housing and two unlit lens halves.
    box(0.95, 0.12, 0.3, h, 0.4).translate(0, 1.24, -0.2),
    box(0.4, 0.13, 0.26, palette.trafficDeadRed, 0.25).translate(-0.26, 1.25, -0.2),
    box(0.4, 0.13, 0.26, palette.policeBlueDead, 0.25).translate(0.26, 1.25, -0.2),
    // Door shield decal and a unit stripe down the flank.
    box(0.04, 0.3, 0.3, palette.barrierPaint, 0.3).translate(0.92, 0.78, 0.35),
    box(0.04, 0.08, 1.8, palette.barrierPaint, 0.35).translate(-0.9, 0.72, -0.3),
    // Push bar on the nose.
    box(1.0, 0.3, 0.1, h, 0.4).translate(0, 0.5, 1.82),
    box(0.08, 0.3, 0.2, h, 0.4).translate(-0.35, 0.5, 1.7),
    box(0.08, 0.3, 0.2, h, 0.4).translate(0.35, 0.5, 1.7),
    // The A-pillar spotlight, knocked downward, and the unit number on the trunk.
    paint(
      new THREE.CylinderGeometry(0.07, 0.09, 0.14, 8).rotateX(1.9).translate(-0.88, 1.05, 0.62),
      h,
      0.35,
    ),
    box(0.03, 0.05, 0.03, h, 0.3).translate(-0.9, 0.98, 0.58),
    box(0.28, 0.03, 0.2, palette.barrierPaint, 0.25).translate(0.25, 0.92, -1.3),
    // The dead radio whip off the rear quarter.
    paint(
      new THREE.BoxGeometry(0.025, 0.6, 0.025).rotateZ(-0.25).rotateX(0.15).translate(-0.7, 1.2, -1.5),
      h,
      0.3,
    ),
  ]);
}

/** A kerbside trash pile: knotted bags, a tipped bin rolled into the dirt, and
 *  loose litter — collection stopped on day one. */
function trashPileGeometry(): THREE.BufferGeometry {
  const bagc = palette.trashBag;
  return merged([
    rockChunk(0.36, 0.62, 0.45, bagc, 0.45).translate(0, 0.2, 0),
    rockChunk(0.3, 0.6, 0.5, bagc, 0.5).rotateY(0.8).translate(0.55, 0.16, 0.25),
    rockChunk(0.26, 0.58, 0.5, bagc, 0.45).rotateY(1.4).translate(-0.5, 0.14, -0.2),
    rockChunk(0.22, 0.6, 0.5, bagc, 0.5).rotateY(0.3).translate(0.15, 0.44, 0.1),
    // The tipped bin lying on its side, lid off.
    paint(
      new THREE.CylinderGeometry(0.26, 0.3, 0.75, 9).rotateZ(1.5).translate(-0.85, 0.28, 0.45),
      palette.dumpsterBody,
      0.45,
    ),
    paint(
      new THREE.CylinderGeometry(0.3, 0.3, 0.05, 9).rotateX(0.2).translate(-1.35, 0.05, 0.6),
      palette.dumpsterLid,
      0.35,
    ),
    // A dumped mattress slumped against the pile, its stain reading as wear.
    paint(
      new THREE.BoxGeometry(0.9, 0.16, 1.3).rotateX(-0.5).rotateY(0.5).translate(0.5, 0.45, -0.55),
      palette.mattress,
      0.35,
    ),
    paint(
      new THREE.BoxGeometry(0.3, 0.02, 0.4).rotateX(-0.5).rotateY(0.5).translate(0.52, 0.55, -0.5),
      palette.barrierPaint,
      0.25,
    ),
    // A dead CRT set out with the trash, screen face dark.
    box(0.4, 0.34, 0.36, palette.husk, 0.45).rotateY(-0.4).translate(-0.15, 0.17, 0.7),
    box(0.3, 0.24, 0.03, palette.tvDark, 0.15).rotateY(-0.4).translate(-0.02, 0.18, 0.86),
    // Loose litter blown against the pile.
    box(0.3, 0.02, 0.4, palette.barrierPaint, 0.2).rotateY(0.5).translate(0.8, 0.02, -0.3),
    box(0.24, 0.02, 0.3, palette.coupeStripe, 0.2).rotateY(-0.7).translate(-0.6, 0.02, 0.9),
  ]);
}

/** A knot of abandoned shopping carts — one upright, one tipped — with a dropped
 *  crate. Skeletal steel silhouettes, panic-buying's leftovers. */
function cartClusterGeometry(): THREE.BufferGeometry {
  const s = palette.railBeam;
  const cart = (yaw: number, tip: number, x: number, z: number): THREE.BufferGeometry[] => {
    const parts: THREE.BufferGeometry[] = [
      box(0.5, 0.04, 0.8, s, 0.4).translate(0, 0.55, 0), // basket floor
      box(0.52, 0.34, 0.04, s, 0.4).translate(0, 0.74, 0.4), // basket walls
      box(0.52, 0.34, 0.04, s, 0.4).translate(0, 0.74, -0.4),
      box(0.04, 0.34, 0.8, s, 0.4).translate(0.26, 0.74, 0),
      box(0.04, 0.34, 0.8, s, 0.4).translate(-0.26, 0.74, 0),
      box(0.56, 0.04, 0.05, s, 0.35).translate(0, 0.98, -0.46), // handle
      box(0.05, 0.55, 0.05, s, 0.45).translate(0.2, 0.28, 0.32), // legs
      box(0.05, 0.55, 0.05, s, 0.45).translate(-0.2, 0.28, 0.32),
      box(0.05, 0.55, 0.05, s, 0.45).translate(0.2, 0.28, -0.32),
      box(0.05, 0.55, 0.05, s, 0.45).translate(-0.2, 0.28, -0.32),
      wheel(0.07, 0.05, palette.wheel).translate(0.2, 0.07, 0.32),
      wheel(0.07, 0.05, palette.wheel).translate(-0.2, 0.07, 0.32),
      wheel(0.07, 0.05, palette.wheel).translate(0.2, 0.07, -0.32),
      wheel(0.07, 0.05, palette.wheel).translate(-0.2, 0.07, -0.32),
    ];
    // A tipped cart rotates about its origin, so lift it back onto the ground
    // (the lower basket wall lands ~0.17 below y=0 at the 1.45 rad tip).
    return parts.map((p) => p.rotateZ(tip).rotateY(yaw).translate(x, tip !== 0 ? 0.2 : 0, z));
  };
  return merged([
    ...cart(0.4, 0, -0.3, 0),
    // The second cart tipped onto its side.
    ...cart(-0.9, 1.45, 0.75, 0.45),
    // A dropped crate and a spilled can.
    box(0.32, 0.24, 0.26, palette.husk, 0.45).rotateY(0.7).translate(-0.9, 0.12, 0.55),
    paint(
      new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8).rotateZ(1.5).translate(0.2, 0.07, 0.75),
      palette.barrierPaint,
      0.3,
    ),
  ]);
}

/** A kerbside fire hydrant, oxidized and dry: barrel body, bonnet, capped side
 *  outlets on their chains, and the stain where it once leaked. */
function hydrantGeometry(): THREE.BufferGeometry {
  const b = palette.hydrantBody;
  const c = palette.hydrantCap;
  return merged([
    // Base flange, barrel, and the domed bonnet with its stem nut.
    paint(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 9), c, 0.5).translate(0, 0.05, 0),
    paint(new THREE.CylinderGeometry(0.17, 0.19, 0.6, 9), b, 0.45).translate(0, 0.4, 0),
    paint(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 9), c, 0.4).translate(0, 0.55, 0),
    paint(new THREE.CylinderGeometry(0.05, 0.16, 0.16, 9), b, 0.35).translate(0, 0.78, 0),
    box(0.09, 0.07, 0.09, c, 0.3).translate(0, 0.88, 0),
    // The two side outlets with their caps, one cap dangling on its chain.
    paint(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8).rotateZ(1.57), c, 0.4).translate(0.2, 0.45, 0),
    paint(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8).rotateZ(1.57), c, 0.4).translate(-0.18, 0.45, 0),
    box(0.03, 0.16, 0.03, c, 0.3).translate(0.27, 0.32, 0.02),
    paint(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8), c, 0.35).translate(0.28, 0.2, 0.03),
    // The dry rust stain streaked down and pooled at the foot.
    box(0.08, 0.3, 0.02, palette.wreckRust, 0.3).translate(0.14, 0.3, 0.17),
    box(0.5, 0.015, 0.4, palette.groundScorch, 0).translate(0.15, 0.01, 0.25),
  ]);
}

/** A street utility cabinet, door popped and wiring looted: louvred face,
 *  conduit risers, and a warning sticker. */
function utilityBoxGeometry(): THREE.BufferGeometry {
  const b = palette.utilityBox;
  return merged([
    box(0.74, 1.15, 0.44, b, 0.5).translate(0, 0.6, 0),
    box(0.78, 0.06, 0.48, palette.postCollar, 0.4).translate(0, 1.2, 0), // rain cap
    box(0.8, 0.12, 0.5, palette.barrierCore, 0.5).translate(0, 0.06, 0), // concrete plinth
    // Louvre vents across the upper face.
    box(0.5, 0.03, 0.04, palette.postCollar, 0.3).translate(0, 1.02, 0.23),
    box(0.5, 0.03, 0.04, palette.postCollar, 0.3).translate(0, 0.92, 0.23),
    box(0.5, 0.03, 0.04, palette.postCollar, 0.3).translate(0, 0.82, 0.23),
    // The door swung open on the looted interior — a dark recess and torn wires.
    paint(new THREE.BoxGeometry(0.36, 0.9, 0.04).rotateY(1.1).translate(0.48, 0.58, 0.34), b, 0.4),
    box(0.32, 0.86, 0.04, palette.tvDark, 0.2).translate(0.18, 0.58, 0.21),
    box(0.03, 0.3, 0.03, palette.bridgeCable, 0.25).rotateZ(0.5).translate(0.15, 0.5, 0.25),
    box(0.03, 0.24, 0.03, palette.bridgeCable, 0.25).rotateZ(-0.7).translate(0.25, 0.42, 0.25),
    // Conduit risers up the back, and the faded warning sticker on the flank.
    paint(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), palette.postCollar, 0.35).translate(-0.2, 0.55, -0.24),
    paint(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), palette.postCollar, 0.35).translate(0.1, 0.45, -0.24),
    box(0.02, 0.18, 0.14, palette.signStop, 0.25).translate(-0.38, 0.85, 0),
  ]);
}

/** A sidewalk scaffolding bay, half-stripped: posts on base plates, ledgers, a
 *  plank deck with one board slid loose, and a diagonal brace. */
function scaffoldGeometry(): THREE.BufferGeometry {
  const s = palette.railBeam;
  const d = palette.railPost;
  const parts: THREE.BufferGeometry[] = [];
  // Four standards on their base plates.
  for (const [px, pz] of [
    [-0.55, 0.45],
    [0.55, 0.45],
    [-0.55, -0.45],
    [0.55, -0.45],
  ] as const) {
    parts.push(box(0.07, 2.7, 0.07, s, 0.5).translate(px, 1.35, pz));
    parts.push(box(0.2, 0.05, 0.2, d, 0.4).translate(px, 0.02, pz));
  }
  // Ledgers at knee and deck height, both faces.
  for (const py of [0.85, 2.0] as const) {
    parts.push(box(1.2, 0.06, 0.06, d, 0.45).translate(0, py, 0.45));
    parts.push(box(1.2, 0.06, 0.06, d, 0.45).translate(0, py, -0.45));
    parts.push(box(0.06, 0.06, 0.96, d, 0.45).translate(-0.55, py, 0));
    parts.push(box(0.06, 0.06, 0.96, d, 0.45).translate(0.55, py, 0));
  }
  // The plank deck — one board still square, one slid loose over the edge.
  parts.push(box(0.42, 0.05, 1.0, palette.postCollar, 0.35).translate(-0.25, 2.06, 0));
  parts.push(
    paint(
      new THREE.BoxGeometry(0.42, 0.05, 1.1).rotateY(0.25).rotateZ(-0.06).translate(0.3, 2.07, 0.15),
      palette.postCollar,
      0.35,
    ),
  );
  // A diagonal brace and a dropped board leaning on the frame.
  parts.push(
    paint(new THREE.BoxGeometry(0.05, 1.7, 0.05).rotateZ(0.6).translate(0, 1.4, 0.46), s, 0.4),
  );
  parts.push(
    paint(new THREE.BoxGeometry(0.36, 0.05, 1.6).rotateX(1.1).rotateY(0.3).translate(0.75, 0.65, 0.2), palette.postCollar, 0.35),
  );
  // Wind-torn sheeting still knotted to one standard.
  parts.push(
    paint(new THREE.BoxGeometry(0.03, 0.9, 0.5).rotateX(0.2).rotateZ(0.15).translate(-0.6, 1.5, 0.55), palette.barrierPaint, 0.3),
  );
  return merged(parts);
}

/** Toppled traffic cones where a cordon stood: one upright, one on its side, one
 *  crushed flat, and the cordon tape they held snapped in the dirt. */
function coneClusterGeometry(): THREE.BufferGeometry {
  const shell = palette.coneShell;
  const band = palette.coneBand;
  return merged([
    // Upright cone on its base slab, faded band.
    box(0.3, 0.04, 0.3, shell, 0.4).translate(0, 0.02, 0),
    paint(new THREE.ConeGeometry(0.16, 0.44, 8), shell, 0.35).translate(0, 0.26, 0),
    paint(new THREE.CylinderGeometry(0.115, 0.135, 0.09, 8), band, 0.25).translate(0, 0.24, 0),
    // One kicked over, lying on its flank.
    paint(new THREE.ConeGeometry(0.16, 0.44, 8).rotateX(1.45).translate(0.6, 0.17, 0.35), shell, 0.35),
    paint(new THREE.CylinderGeometry(0.115, 0.135, 0.09, 8).rotateX(1.45).translate(0.62, 0.17, 0.37), band, 0.25),
    box(0.3, 0.04, 0.3, shell, 0.4).rotateX(1.45).rotateY(0.4).translate(0.38, 0.16, 0.3),
    // One crushed flat by a tyre.
    paint(new THREE.ConeGeometry(0.19, 0.09, 8), shell, 0.3).translate(-0.55, 0.045, -0.3),
    box(0.32, 0.03, 0.32, shell, 0.35).rotateY(0.5).translate(-0.55, 0.015, -0.3),
    // The snapped cordon tape trailing between them.
    box(0.5, 0.015, 0.05, band, 0.2).rotateY(0.4).translate(0.25, 0.02, -0.05),
    box(0.4, 0.015, 0.05, band, 0.2).rotateY(-0.6).translate(-0.25, 0.02, 0.25),
  ]);
}

// Biome roadside dressing. Like the act dressings above, these re-skin the four
// placement archetypes — but per geographic band (snow, desert, tunnel, bridge,
// lava), so an ice field is lined with snow-loaded pines and plow banks while the
// same act's open road keeps its own verge. All decoration tier: desaturated or
// dim, never token-bright, never a threat silhouette (docs/DESIGN.md → readability).

/** A dead conifer under snow load: dark trunk, drooping bough tiers, snow caps. */
function snowPineGeometry(): THREE.BufferGeometry {
  const t = palette.pineTrunk;
  const b = palette.pineBough;
  const s = palette.snowLit;
  return merged([
    box(0.24, 3.4, 0.24, t, 0.55).translate(0, 1.7, 0),
    // Three bough tiers, wider low and narrower up, each sagging under a snow cap.
    cone(1.1, 1.2, 6, b, 0.5).translate(0, 1.3, 0),
    cone(1.14, 0.28, 6, s, 0.3).translate(0, 1.78, 0),
    cone(0.85, 1.0, 6, b, 0.5).translate(0, 2.1, 0),
    cone(0.88, 0.24, 6, s, 0.3).translate(0, 2.5, 0),
    cone(0.58, 0.9, 6, b, 0.5).translate(0, 2.85, 0),
    cone(0.6, 0.22, 6, s, 0.3).translate(0, 3.2, 0),
    // A snapped top hanging off, and snow banked at the foot.
    box(0.14, 0.8, 0.14, t, 0.5).rotateZ(1.1).translate(0.45, 3.5, 0),
    paint(new THREE.CylinderGeometry(0.7, 0.9, 0.3, 7), palette.snowBody, 0.35).translate(
      0,
      0.15,
      0,
    ),
  ]);
}

/** A plow-piled snow bank hugging the shoulder: wind-carved drift lobes with a
 *  lit crust ridge — organic mounds, not stacked cylinders. */
function snowBankGeometry(): THREE.BufferGeometry {
  const body = palette.snowBody;
  const lit = palette.snowLit;
  return merged([
    rockChunk(1.1, 0.44, 0.28, body, 0.4).translate(0, 0.34, 0),
    rockChunk(0.9, 0.42, 0.3, body, 0.4).rotateY(0.7).translate(1.35, 0.28, 0.2),
    rockChunk(0.75, 0.4, 0.3, body, 0.4).rotateY(1.3).translate(-1.25, 0.24, -0.15),
    // The wind-lit crust riding the drift ridge.
    rockChunk(0.7, 0.32, 0.24, lit, 0.22).translate(0.05, 0.6, 0),
    rockChunk(0.5, 0.3, 0.26, lit, 0.22).rotateY(0.5).translate(1.3, 0.48, 0.2),
    // Grit and a broken stake the plow threw up with the snow.
    rockChunk(0.2, 0.6, 0.7, palette.rock, 0.5).rotateY(0.4).translate(0.5, 0.08, 0.75),
    rockChunk(0.16, 0.6, 0.7, palette.rockDark, 0.5).rotateY(0.9).translate(-0.7, 0.06, 0.55),
    box(0.08, 0.5, 0.08, palette.pineTrunk, 0.4).rotateZ(0.4).translate(-0.4, 0.4, 0.5),
  ]);
}

/** The dead-car husk buried under a snow drift: roof and hood loaded white. */
function frozenHuskGeometry(): THREE.BufferGeometry {
  const s = palette.snowBody;
  const lit = palette.snowLit;
  return merged([
    huskGeometry(),
    // Snow loaded on the roof and hood, and a drift banked against the flank.
    box(1.4, 0.18, 1.3, lit, 0.25).translate(0, 1.2, -0.2),
    box(1.4, 0.14, 0.9, s, 0.3).rotateX(0.12).translate(0, 0.82, 1.05),
    rockChunk(0.95, 0.4, 0.26, s, 0.32).translate(-1.1, 0.22, 0.3),
    // Icicled sill line: a thin pale run along the body.
    box(1.75, 0.06, 0.08, lit, 0.2).translate(0, 0.62, 1.1),
  ]);
}

/** The rock cluster glazed in ice: craggy cold stone under blue-grey glaze, snow
 *  packed into the top crevices. */
function iceBoulderGeometry(): THREE.BufferGeometry {
  const g = palette.iceGlaze;
  const s = palette.snowLit;
  return merged([
    rockChunk(0.72, 0.66, 0.55, g, 0.55).rotateY(0.4).translate(0, 0.38, 0),
    rockChunk(0.48, 0.7, 0.6, palette.rock, 0.5).rotateY(-0.6).translate(0.5, 0.28, -0.3),
    rockChunk(0.34, 0.66, 0.65, g, 0.5).rotateY(0.9).translate(-0.48, 0.18, 0.25),
    rockChunk(0.24, 0.6, 0.7, palette.rockDark, 0.5).rotateY(1.3).translate(0.15, 0.1, 0.55),
    // Snow packed onto the top facets, following the stone's craggy line.
    rockChunk(0.5, 0.3, 0.5, s, 0.2).rotateY(0.5).translate(0, 0.78, 0),
    rockChunk(0.3, 0.3, 0.55, s, 0.2).rotateY(-0.4).translate(0.5, 0.56, -0.3),
    // A drip of icicles off the shaded overhang.
    paint(new THREE.ConeGeometry(0.06, 0.3, 4), g, 0.2).rotateX(Math.PI).translate(-0.55, 0.3, 0.4),
    paint(new THREE.ConeGeometry(0.05, 0.22, 4), g, 0.2).rotateX(Math.PI).translate(-0.4, 0.32, 0.5),
  ]);
}

/** A saguaro cactus: ribbed trunk and two candelabra arms (Dust Flats). */
function cactusGeometry(): THREE.BufferGeometry {
  const b = palette.cactusBody;
  const r = palette.cactusRib;
  const limb = (rr: number, h: number): THREE.BufferGeometry =>
    paint(new THREE.CylinderGeometry(rr, rr * 1.08, h, 7), b, 0.45);
  return merged([
    limb(0.28, 3.0).translate(0, 1.5, 0),
    // Shadowed rib grooves up the trunk (vertex color, not triangles).
    box(0.08, 2.6, 0.08, r, 0.4).translate(0.24, 1.4, 0),
    box(0.08, 2.4, 0.08, r, 0.4).translate(-0.2, 1.3, 0.14),
    // Left arm: out, then up. Right arm lower and shorter.
    limb(0.18, 0.7).rotateZ(1.25).translate(-0.55, 1.7, 0),
    limb(0.18, 1.0).translate(-0.85, 2.35, 0),
    limb(0.16, 0.6).rotateZ(-1.25).translate(0.48, 1.25, 0.1),
    limb(0.16, 0.8).translate(0.72, 1.8, 0.1),
    // A weathered scar where a limb dropped.
    box(0.2, 0.3, 0.1, r, 0.35).translate(0.1, 0.7, 0.24),
  ]);
}

/** A banked sand dune hugging the shoulder: wind-formed lobes, the crest lit and
 *  the slip face in shadow (Dust Flats). Organic mounds, not stacked cylinders. */
function duneGeometry(): THREE.BufferGeometry {
  const sand = palette.sandDune;
  const shade = palette.sandShade;
  return merged([
    rockChunk(1.3, 0.42, 0.24, sand, 0.45).translate(0, 0.4, 0),
    rockChunk(1.05, 0.4, 0.26, sand, 0.45).rotateY(0.6).translate(1.55, 0.3, 0.25),
    rockChunk(0.8, 0.38, 0.28, shade, 0.5).rotateY(1.1).translate(-1.35, 0.24, -0.2),
    // The slip face in shadow tucked under the lit crest.
    rockChunk(0.75, 0.34, 0.26, shade, 0.5).rotateY(0.3).translate(0.45, 0.5, -0.55),
    // A half-buried fence post and a tuft of dead scrub on the windward toe.
    box(0.1, 0.6, 0.1, palette.pineTrunk, 0.4).rotateZ(0.5).translate(-0.6, 0.3, 0.8),
    box(0.08, 0.4, 0.08, palette.pineTrunk, 0.4).rotateZ(-0.4).translate(-0.45, 0.28, 0.9),
    box(0.06, 0.3, 0.06, palette.cactusRib, 0.4).rotateZ(0.2).translate(-0.75, 0.25, 0.65),
  ]);
}

/** The husk half-swallowed by sand: drifted to the sills, hood dusted (Dust Flats). */
function buriedHuskGeometry(): THREE.BufferGeometry {
  const sand = palette.sandDune;
  return merged([
    huskGeometry(),
    // The drift swallowing the nose and banked along the flank.
    rockChunk(1.35, 0.4, 0.24, sand, 0.4).translate(0.2, 0.28, 1.5),
    rockChunk(0.95, 0.36, 0.26, sand, 0.4).rotateY(0.8).translate(1.1, 0.22, -0.5),
    // Sand dusted across the roof.
    box(1.2, 0.1, 1.1, sand, 0.3).rotateZ(0.06).translate(0, 1.18, -0.2),
  ]);
}

/** Sun-bleached desert stone: the rock cluster gone pale and split (Dust Flats). */
function sunRockGeometry(): THREE.BufferGeometry {
  const a = palette.sunRock;
  const b = palette.sunRockShade;
  return merged([
    rockChunk(0.78, 0.7, 0.55, a, 0.55).rotateY(0.4).translate(0, 0.42, 0),
    rockChunk(0.5, 0.72, 0.6, b, 0.5).rotateY(-0.6).translate(0.55, 0.3, -0.3),
    rockChunk(0.34, 0.66, 0.65, a, 0.5).rotateY(1.0).translate(-0.5, 0.2, 0.25),
    rockChunk(0.22, 0.6, 0.7, b, 0.45).rotateY(0.3).translate(0.15, 0.1, 0.6),
    // A split slab leaning off the main mass, sand pooled at the foot.
    box(0.6, 0.7, 0.18, b, 0.45).rotateZ(0.5).rotateY(0.2).translate(0.95, 0.35, 0.35),
    rockChunk(0.55, 0.28, 0.25, palette.sandDune, 0.3).translate(-0.4, 0.08, 0.6),
  ]);
}

/** A dead tunnel lamp stanchion: concrete foot, steel mast, dark sodium head. */
function tunnelLampGeometry(): THREE.BufferGeometry {
  const steel = palette.bridgeSteelDark;
  return merged([
    box(0.5, 0.5, 0.5, palette.barrierCore, 0.5).translate(0, 0.25, 0),
    box(0.16, 3.0, 0.16, steel, 0.55).translate(0, 1.9, 0),
    // Twin dead lamp heads hung over the road side, no glow — the dark is the biome.
    box(0.6, 0.12, 0.12, steel, 0.5).translate(0.28, 3.35, 0),
    box(0.42, 0.16, 0.3, palette.tunnelLampDead, 0.35).translate(0.55, 3.24, 0),
    // A cable conduit sagging off the mast and a rusted junction box.
    box(0.05, 1.6, 0.05, palette.bridgeCable, 0.4).rotateX(0.25).translate(0.08, 2.2, 0.2),
    box(0.24, 0.36, 0.16, palette.postCollar, 0.45).translate(-0.04, 1.1, 0.14),
  ]);
}

/** A snapped bridge stay: a steel stub with the cable drooping to the deck. */
function bridgeCableGeometry(): THREE.BufferGeometry {
  const steel = palette.bridgeSteel;
  const dark = palette.bridgeSteelDark;
  const cable = palette.bridgeCable;
  return merged([
    // The anchor stub, a riveted box post torn off short.
    box(0.5, 1.6, 0.5, steel, 0.5).translate(0, 0.8, 0),
    box(0.56, 0.2, 0.56, dark, 0.45).translate(0, 1.5, 0),
    box(0.6, 0.3, 0.6, dark, 0.5).translate(0, 0.15, 0),
    // The snapped stay cable arcing down to the deck in three sagging runs.
    paint(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 5), cable, 0.35)
      .rotateZ(1.0)
      .translate(0.75, 1.35, 0),
    paint(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5), cable, 0.35)
      .rotateZ(1.35)
      .translate(1.9, 0.75, 0),
    paint(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), cable, 0.35)
      .rotateZ(1.5)
      .translate(3.0, 0.35, 0),
    // The frayed splay where it tore.
    box(0.14, 0.3, 0.14, cable, 0.3).rotateZ(0.6).translate(0.1, 1.7, 0.1),
  ]);
}

/** A wrenched-open stretch of bridge railing: bent posts, a torn top chord. */
function bridgeRailGeometry(): THREE.BufferGeometry {
  const steel = palette.bridgeSteel;
  const dark = palette.bridgeSteelDark;
  const parts: THREE.BufferGeometry[] = [
    // The top chord, snapped mid-span and bent outward.
    box(1.4, 0.14, 0.12, steel, 0.45).translate(-0.75, 1.0, 0),
    box(1.1, 0.14, 0.12, steel, 0.45).rotateY(0.5).translate(0.75, 0.95, 0.25),
    // A lower rail still holding on one side.
    box(1.5, 0.1, 0.08, dark, 0.45).translate(-0.7, 0.55, 0),
  ];
  // Posts: two standing, one bent hard over the water.
  parts.push(box(0.12, 1.0, 0.12, dark, 0.5).translate(-1.3, 0.5, 0));
  parts.push(box(0.12, 1.0, 0.12, dark, 0.5).translate(-0.2, 0.5, 0));
  parts.push(box(0.12, 1.05, 0.12, dark, 0.5).rotateZ(-0.7).translate(0.9, 0.4, 0.1));
  return merged(parts);
}

/** A stand of cooled basalt columns, hex-fractured, one toppled (Lava Fields). */
function basaltGeometry(): THREE.BufferGeometry {
  const dark = palette.basaltDark;
  const cool = palette.basaltCool;
  const col = (r: number, h: number, c: number): THREE.BufferGeometry =>
    paint(new THREE.CylinderGeometry(r, r, h, 6), c, 0.55);
  return merged([
    col(0.42, 2.8, dark).translate(0, 1.4, 0),
    col(0.36, 2.1, cool).translate(0.65, 1.05, 0.15),
    col(0.32, 1.5, dark).translate(-0.6, 0.75, -0.1),
    col(0.28, 1.0, cool).translate(0.15, 0.5, 0.6),
    // One column snapped and leaning against the stand.
    col(0.3, 1.6, cool).rotateZ(0.9).translate(-1.1, 0.7, 0.4),
    // A dim molten seam at the foot, where the crust is still splitting.
    box(0.9, 0.08, 0.14, palette.emberVein, 0.1).rotateY(0.4).translate(0.3, 0.05, 0.7),
  ]);
}

/** Cooled crust rock veined by molten seams (Lava Fields shoulder/cluster). */
function emberRockGeometry(): THREE.BufferGeometry {
  const dark = palette.basaltDark;
  const cool = palette.basaltCool;
  const vein = palette.emberVein;
  return merged([
    rockChunk(0.75, 0.62, 0.6, dark, 0.6).rotateY(0.4).translate(0, 0.35, 0),
    rockChunk(0.5, 0.66, 0.65, cool, 0.55).rotateY(-0.5).translate(0.6, 0.28, -0.3),
    rockChunk(0.36, 0.62, 0.7, dark, 0.55).rotateY(0.8).translate(-0.55, 0.18, 0.3),
    rockChunk(0.24, 0.6, 0.7, cool, 0.5).rotateY(1.2).translate(0.2, 0.1, 0.55),
    // The molten seams glowing in the cracks between the plates.
    box(0.9, 0.08, 0.1, vein, 0.1).rotateY(0.35).translate(0.25, 0.4, 0.15),
    box(0.5, 0.07, 0.09, vein, 0.1).rotateY(-0.8).translate(-0.3, 0.28, -0.2),
    box(0.4, 0.06, 0.08, vein, 0.1).rotateY(1.2).translate(0.5, 0.15, 0.5),
  ]);
}

/** The husk burnt to char on the lava plain: crusted black, ember seams still hot
 *  (Lava Fields). The glow is dim and low — never a pickup read. */
function charredHuskGeometry(): THREE.BufferGeometry {
  const char = palette.wreckScorch;
  const vein = palette.emberVein;
  return merged([
    huskGeometry(),
    // Char crusted over the roof and the sagging hood.
    box(1.45, 0.14, 1.35, char, 0.25).translate(0, 1.18, -0.2),
    box(1.42, 0.1, 0.9, char, 0.25).rotateX(0.12).translate(0, 0.78, 1.05),
    // Ember seams still glowing along the sill and up a burnt panel.
    box(1.6, 0.06, 0.08, vein, 0.1).translate(0, 0.34, 1.1),
    box(0.07, 0.5, 0.07, vein, 0.1).rotateZ(0.2).translate(0.88, 0.6, -0.3),
  ]);
}

/** A shipping container spilled off a dead convoy, skewed across the verge
 *  (Broken Bridge). Cold marine steel with corrugation ribs and a door ajar. */
function containerGeometry(): THREE.BufferGeometry {
  const b = palette.containerBase;
  const h = palette.containerHaze;
  const parts: THREE.BufferGeometry[] = [
    box(1.5, 1.45, 3.4, b, 0.5).translate(0, 0.72, 0),
    // The top chord and corner posts picked out lighter, the frame read.
    box(1.54, 0.14, 3.44, h, 0.4).translate(0, 1.42, 0),
    box(0.16, 1.45, 0.16, h, 0.4).translate(0.72, 0.72, 1.66),
    box(0.16, 1.45, 0.16, h, 0.4).translate(-0.72, 0.72, 1.66),
    // One end door swung open on its hinge, the inside a dark void.
    box(1.3, 1.2, 0.1, palette.bridgeSteelDark, 0.3).translate(0, 0.72, -1.72),
    box(0.72, 1.3, 0.1, h, 0.45).rotateY(0.7).translate(0.85, 0.75, -1.85),
    // Rust streaking down from a top corner seam.
    box(0.3, 0.9, 0.06, palette.rigChassisRust, 0.45).translate(0.45, 0.9, 1.72),
  ];
  // Corrugation ribs along the flank (vertex color + proportion, not triangles).
  for (const pz of [-1.1, -0.55, 0, 0.55, 1.1])
    parts.push(box(0.06, 1.1, 0.2, h, 0.35).translate(0.76, 0.7, pz));
  return merged(parts);
}

/** A fallen ventilation duct: fat steel pipes torn off the tunnel ceiling, one
 *  cracked section spilled beside the run (The Tunnel). */
function pipeStackGeometry(): THREE.BufferGeometry {
  const s = palette.bridgeSteel;
  const d = palette.bridgeSteelDark;
  const pipe = (r: number, len: number, c: number): THREE.BufferGeometry =>
    paint(new THREE.CylinderGeometry(r, r, len, 8), c, 0.5).rotateZ(Math.PI / 2);
  return merged([
    // Two long runs side by side, one riding on top.
    pipe(0.34, 2.8, d).translate(0, 0.34, 0.3),
    pipe(0.3, 2.4, s).translate(0.2, 0.3, -0.35),
    pipe(0.28, 1.9, s).translate(-0.2, 0.86, 0),
    // Flange collars where the sections bolted together.
    paint(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 8), s, 0.4)
      .rotateZ(Math.PI / 2)
      .translate(0.7, 0.34, 0.3),
    paint(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 8), d, 0.4)
      .rotateZ(Math.PI / 2)
      .translate(-0.5, 0.86, 0),
    // A cracked-off elbow section dropped askew, and the torn ceiling bracket.
    pipe(0.26, 0.9, d).rotateY(0.8).translate(1.3, 0.26, -0.9),
    box(0.5, 0.1, 0.4, palette.tunnelLampDead, 0.4).translate(-1.1, 0.05, 0.7),
  ]);
}

/** The render-side object set: the four sim archetypes reuse the originals, the
 *  rest are the act-specific dressings chosen by `ACT_DECOR`. */
type DecorKind =
  | 'streetlight'
  | 'barrier'
  | 'husk'
  | 'rock'
  | 'deadtree'
  | 'crystalspur'
  | 'rebar'
  | 'fence'
  | 'slab'
  | 'rubble'
  | 'crystalcluster'
  | 'shardcluster'
  | 'snowpine'
  | 'snowbank'
  | 'frozenhusk'
  | 'iceboulder'
  | 'cactus'
  | 'dune'
  | 'buriedhusk'
  | 'sunrock'
  | 'tunnellamp'
  | 'bridgecable'
  | 'bridgerail'
  | 'basalt'
  | 'emberrock'
  | 'charredhusk'
  | 'seacontainer'
  | 'pipestack'
  | 'trafficlight'
  | 'snappedpole'
  | 'dumpster'
  | 'busstop'
  | 'sandbags'
  | 'taxihusk'
  | 'policehusk'
  | 'trashpile'
  | 'cartcluster'
  | 'hydrant'
  | 'utilitybox'
  | 'scaffold'
  | 'conecluster';

const GEOMETRY: Record<DecorKind, () => THREE.BufferGeometry> = {
  streetlight: postGeometry,
  barrier: barrierGeometry,
  husk: huskGeometry,
  rock: rockGeometry,
  deadtree: deadTreeGeometry,
  crystalspur: crystalSpurGeometry,
  rebar: rebarGeometry,
  fence: fenceGeometry,
  slab: slabGeometry,
  rubble: rubbleGeometry,
  crystalcluster: crystalClusterGeometry,
  shardcluster: shardClusterGeometry,
  snowpine: snowPineGeometry,
  snowbank: snowBankGeometry,
  frozenhusk: frozenHuskGeometry,
  iceboulder: iceBoulderGeometry,
  cactus: cactusGeometry,
  dune: duneGeometry,
  buriedhusk: buriedHuskGeometry,
  sunrock: sunRockGeometry,
  tunnellamp: tunnelLampGeometry,
  bridgecable: bridgeCableGeometry,
  bridgerail: bridgeRailGeometry,
  basalt: basaltGeometry,
  emberrock: emberRockGeometry,
  charredhusk: charredHuskGeometry,
  seacontainer: containerGeometry,
  pipestack: pipeStackGeometry,
  trafficlight: trafficLightGeometry,
  snappedpole: snappedPoleGeometry,
  dumpster: dumpsterGeometry,
  busstop: busStopGeometry,
  sandbags: sandbagsGeometry,
  taxihusk: taxiHuskGeometry,
  policehusk: policeHuskGeometry,
  trashpile: trashPileGeometry,
  cartcluster: cartClusterGeometry,
  hydrant: hydrantGeometry,
  utilitybox: utilityBoxGeometry,
  scaffold: scaffoldGeometry,
  conecluster: coneClusterGeometry,
};

const KINDS = Object.keys(GEOMETRY) as DecorKind[];

/**
 * Which objects each placement archetype can become, per act (index 0..5). The
 * sim's `post`/`barrier`/`husk`/`rock` keep their placement role (upright /
 * shoulder / dead car / cluster) but are re-skinned to the act. Each entry is a
 * weighted list (repeat a kind to weight it up) and every prop picks its variant
 * deterministically, so a city block mixes street lights with dead signals and
 * snapped poles instead of cloning one model. Act I carries the deepest library —
 * it opens every run, and its street tells the evacuation story (quarantine
 * sandbags, looted dumpsters, abandoned cabs and cruisers, carts and trash).
 */
const ACT_DECOR: Record<PropKind, readonly (readonly DecorKind[])[]> = {
  post: [
    // I — the working street grid, one piece in six a fallen pole or scaffold bay.
    ['streetlight', 'streetlight', 'trafficlight', 'streetlight', 'trafficlight', 'snappedpole', 'scaffold'],
    ['deadtree'], // II
    ['streetlight', 'snappedpole', 'scaffold'], // III — the overrun outskirts, half the grid down
    ['crystalspur'], // IV
    ['rebar'], // V
    ['rebar'], // VI
  ],
  barrier: [
    // I — kerbside furniture: barriers, dumpsters, shelters, hydrants, cabinets,
    // and the quarantine sandbags.
    ['barrier', 'dumpster', 'barrier', 'busstop', 'sandbags', 'dumpster', 'hydrant', 'utilitybox'],
    ['fence'], // II
    ['barrier', 'sandbags', 'utilitybox'], // III — the quarantine line, already failed
    ['slab'], // IV
    ['slab'], // V
    ['slab'], // VI
  ],
  husk: [
    ['husk', 'taxihusk', 'husk', 'policehusk', 'taxihusk'], // I
    ['husk'], // II
    ['husk', 'policehusk'], // III
    ['husk'], // IV
    ['husk'], // V
    ['husk'], // VI
  ],
  rock: [
    ['rubble', 'trashpile', 'cartcluster', 'rubble', 'trashpile', 'conecluster'], // I
    ['rock'], // II
    ['rubble', 'trashpile', 'conecluster'], // III
    ['crystalcluster'], // IV
    ['rubble'], // V
    ['shardcluster'], // VI
  ],
};

/**
 * The biome override: when a prop's forward sits inside a geographic band (snow,
 * desert, tunnel, bridge, lava — `src/content/biomes.ts`), its archetype dresses
 * for the *place* instead of the act, so an ice field is lined with loaded pines
 * and plow banks whatever the apocalypse overhead. The open highway (and any biome
 * without an entry) falls through to the act dressing above. Deterministic per
 * `(seed, forward)`, mirroring the sim's banding; render-only.
 */
const BIOME_DECOR: Partial<Record<BiomeId, Record<PropKind, DecorKind>>> = {
  snow: { post: 'snowpine', barrier: 'snowbank', husk: 'frozenhusk', rock: 'iceboulder' },
  desert: { post: 'cactus', barrier: 'dune', husk: 'buriedhusk', rock: 'sunrock' },
  tunnel: { post: 'tunnellamp', barrier: 'barrier', husk: 'husk', rock: 'pipestack' },
  bridge: { post: 'bridgecable', barrier: 'bridgerail', husk: 'seacontainer', rock: 'slab' },
  lava: { post: 'basalt', barrier: 'emberrock', husk: 'charredhusk', rock: 'emberrock' },
};

/**
 * Roadside decoration, instanced. The sim owns where and how the props sit
 * (it generates position, scale, and yaw deterministically from the seed); this
 * field is the read-only view that draws them — one `InstancedMesh` per class,
 * so the whole roadside is four draw calls regardless of count
 * (docs/ARCHITECTURE.md → Instancing). Chunks are cached on first sight and
 * evicted on exit, mirroring the sim's streaming so nothing allocates per frame.
 */
export class DecorField {
  private readonly seed: number;
  private readonly meshes: Record<DecorKind, THREE.InstancedMesh>;
  private readonly counts: Record<DecorKind, number>;
  private readonly cache = new Map<number, Chunk>();
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed;
    this.meshes = {} as Record<DecorKind, THREE.InstancedMesh>;
    this.counts = {} as Record<DecorKind, number>;
    for (const kind of KINDS) {
      const mesh = new THREE.InstancedMesh(GEOMETRY[kind](), propMaterial, MAX_INSTANCES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // we place them ourselves within the window
      mesh.count = 0;
      this.meshes[kind] = mesh;
      this.counts[kind] = 0;
      scene.add(mesh);
    }
  }

  /** A stable pseudo-random in [0, 1) for a prop, salted, so the boundary
   *  crossfade flip is deterministic per seed and never flickers. */
  private rand(s: number, salt: number): number {
    let h = (Math.imul(s, 374761393) ^ Math.imul(salt, 668265263) ^ this.seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  update(distance: number, elevation: Elevation): void {
    const first = Math.floor((distance - CHUNK_LENGTH) / CHUNK_LENGTH);
    const last = Math.ceil((distance + LOOKAHEAD) / CHUNK_LENGTH);
    const lastAct = ACT_DECOR.post.length - 1;
    const tw = TRANSITION / ACT_SPAN;

    for (const kind of KINDS) this.counts[kind] = 0;

    for (let index = first; index <= last; index += 1) {
      const chunk = this.chunk(index);
      const base = index * CHUNK_LENGTH;
      for (let pi = 0; pi < chunk.props.length; pi += 1) {
        const prop = chunk.props[pi];
        const forward = base + prop.z;
        // Re-skin the placement archetype (the sim's prop kind) to the act this
        // prop sits in, so the roadside object belongs to its stretch of road. Near
        // an act boundary a prop flips early to the next act's dressing, the same
        // slot-by-slot crossfade the skyline and ground use, so the verge rebuilds
        // gradually rather than swapping all at once.
        const f = Math.max(0, forward) / ACT_SPAN;
        const ai = Math.min(Math.floor(f), lastAct);
        const frac = f - Math.floor(f);
        const t = frac <= 1 - tw ? 0 : (frac - (1 - tw)) / tw;
        const key = index * 64 + pi;
        const act = ai < lastAct && t > 0 && this.rand(key, 7) < t ? ai + 1 : ai;
        // The geographic band then overrides the act: inside a biome the verge
        // dresses for the place (pines, dunes, basalt). Crossing into a band, slots
        // flip one by one over the same stretch the look blends across, so the
        // roadside rebuilds with the sky instead of swapping on a hard line.
        const band = Math.floor(Math.max(0, forward) / BIOME_BAND_M);
        const local = Math.max(0, forward) - band * BIOME_BAND_M;
        const inBlend = band > 0 && local < BIOME_TRANSITION_M;
        const useBand =
          inBlend && this.rand(key, 8) >= local / BIOME_TRANSITION_M ? band - 1 : band;
        const biome = BIOME_DECOR[biomeForBand(this.seed, useBand).id];
        // Inside a biome the place owns the archetype; otherwise the act's
        // weighted variant list does, one deterministic pick per prop.
        const options = ACT_DECOR[prop.kind][act];
        const kind = biome
          ? biome[prop.kind]
          : options[Math.min(options.length - 1, Math.floor(this.rand(key, 9) * options.length))];

        const count = this.counts[kind];
        if (count >= MAX_INSTANCES) continue;
        // Sit on the road's vertical profile at this forward, not at a flat y=0
        // the terrain rises through as the hills scroll past.
        this.dummy.position.set(prop.x, elevation.yAt(forward, distance), distance - forward);
        this.dummy.rotation.set(0, prop.rot, 0);
        this.dummy.scale.setScalar(prop.scale);
        this.dummy.updateMatrix();
        this.meshes[kind].setMatrixAt(count, this.dummy.matrix);
        this.counts[kind] = count + 1;
      }
    }

    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      mesh.count = this.counts[kind];
      // With the biome dressings the kind set is wide but only a few are live on
      // any stretch; hide the empty ones so they never cost a draw call.
      mesh.visible = this.counts[kind] > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }

    for (const index of this.cache.keys()) {
      if (index < first - 1 || index > last + 1) this.cache.delete(index);
    }
  }

  private chunk(index: number): Chunk {
    let chunk = this.cache.get(index);
    if (chunk === undefined) {
      chunk = chunkAt(this.seed, index);
      this.cache.set(index, chunk);
    }
    return chunk;
  }
}
