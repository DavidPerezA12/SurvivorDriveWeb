import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Hazard, ReadonlyState } from '../sim';
import { box, paint, propMaterial, silhouetteMaterial, wheel } from './materials';
import { palette } from './palette';
import type { Elevation } from './elevation';

const MAX_INSTANCES = 48;

/**
 * A wrecked car blocking a lane. The warm body and orange stripe stay dominant
 * so it reads as a threat at the spawn horizon (docs/DESIGN.md → Object craft).
 * One merged geometry, instanced.
 */
function wreckGeometry(): THREE.BufferGeometry {
  const p = palette;
  // The crumpled nose and hazard stripe face the oncoming player.
  const tb = (w: number, h: number, d: number, c: number, rx: number, x: number, y: number, z: number, ao = 0.45) =>
    paint(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z), c, ao);
  const parts = [
    // Dark sill the warm body sits on, plus haunches flared over the wheels.
    box(1.72, 0.3, 3.4, p.wreckDark, 0.45).translate(0, 0.3, 0),
    box(1.84, 0.42, 3.1, p.wreckBody, 0.5).translate(0, 0.6, 0),
    box(2.0, 0.34, 1.0, p.wreckBody, 0.5).translate(0, 0.55, 1.25), // front fenders
    box(2.0, 0.36, 1.0, p.wreckBody, 0.5).translate(0, 0.56, -1.25), // rear fenders
    // Sloped hood down to a crumpled, shoved-back nose; grille + hazard stripe +
    // sagging bumper + dead headlights all facing the player.
    tb(1.7, 0.16, 1.2, p.wreckBody, 0.13, 0, 0.86, 1.0, 0.45),
    tb(1.72, 0.34, 0.6, p.wreckBody, 0.42, 0, 0.6, 1.62, 0.45),
    box(1.2, 0.24, 0.14, p.carGrille, 0.3).translate(0, 0.58, 1.9),
    box(1.92, 0.16, 0.4, p.wreckStripe, 0.2).translate(0, 0.76, 1.78),
    tb(1.9, 0.22, 0.32, p.wreckDark, 0.28, 0, 0.42, 1.97, 0.4),
    box(0.34, 0.16, 0.1, p.wreckGlass, 0.2).translate(-0.6, 0.66, 1.92),
    box(0.34, 0.16, 0.1, p.wreckScorch, 0.2).translate(0.6, 0.66, 1.92), // the cracked-out one
    // Raked windscreen → narrowed roof → fastback rear glass (the silhouette).
    tb(1.46, 0.52, 0.1, p.wreckGlass, -0.5, 0, 1.02, 0.5, 0.3),
    box(1.36, 0.16, 1.2, p.wreckCabin, 0.5).translate(0, 1.3, -0.15),
    tb(1.4, 0.46, 0.1, p.wreckGlass, 0.55, 0, 1.0, -0.78, 0.3),
    // Side glass — left intact, right smashed in (a dark scorched recess).
    box(0.1, 0.4, 1.1, p.wreckGlass, 0.3).translate(-0.72, 1.04, -0.15),
    box(0.12, 0.34, 0.5, p.wreckScorch, 0.3).translate(0.72, 1.0, 0.1),
    box(0.12, 0.3, 0.4, p.wreckCabin, 0.4).translate(0.72, 1.06, -0.45), // surviving rear pane frame
    // Boot deck + rear bumper + dead tail lamps.
    tb(1.72, 0.16, 1.0, p.wreckBody, -0.1, 0, 0.9, -1.4, 0.4),
    tb(1.86, 0.2, 0.3, p.wreckDark, 0.3, 0, 0.42, -1.82, 0.4),
    box(0.36, 0.14, 0.1, p.carTaillightDim, 0.2).translate(-0.6, 0.7, -1.78),
    box(0.36, 0.14, 0.1, p.carTaillightDim, 0.2).translate(0.6, 0.7, -1.78),
    // A door hung open on the left flank.
    paint(new THREE.BoxGeometry(0.12, 0.56, 1.1).rotateY(-0.5).translate(1.02, 0.62, 0.05), p.wreckBody, 0.45),
    // Rust eating panels + scorch + a sprung hood corner.
    box(0.16, 0.4, 0.9, p.wreckRust, 0.5).translate(-0.95, 0.6, 0.2),
    box(0.5, 0.3, 0.6, p.wreckRust, 0.5).translate(0.7, 0.78, 0.5),
    box(0.8, 0.05, 0.5, p.wreckScorch, 0.2).translate(-0.2, 0.95, 0.95),
    tb(0.9, 0.1, 0.7, p.wreckRust, -0.35, -0.25, 1.04, 0.9, 0.3),
    // Wheels: three round, the rear-right blown flat (lower, squashed).
    wheel(0.36, 0.28, p.wreckDark).translate(-0.86, 0.32, 1.3),
    wheel(0.36, 0.28, p.wreckDark).translate(0.86, 0.32, 1.3),
    wheel(0.36, 0.28, p.wreckDark).translate(-0.86, 0.32, -1.3),
    paint(new THREE.BoxGeometry(0.6, 0.26, 0.7).translate(0.86, 0.19, -1.3), p.wreckDark, 0.4),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge wreck geometry');
  // Crush the husk down to a low, jumpable wreck (~0.9 m): a sedan stalled and
  // flattened, not a full-height car. The footprint top now matches the sim's
  // `WRECK_CLEAR`, so a hop that clears it on screen clears it in the sim too
  // (src/sim/collision.ts → clearance heights).
  geo.scale(1, 0.66, 1);
  return geo;
}

/**
 * A second wrecked vehicle, used so static wrecks are not all the same sedan.
 * The van reads as a low cab plus a crushed cargo body.
 */
function wreckVanGeometry(): THREE.BufferGeometry {
  const p = palette;
  const tb = (w: number, h: number, d: number, c: number, rx: number, x: number, y: number, z: number, ao = 0.45) =>
    paint(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z), c, ao);
  const parts = [
    box(1.72, 0.3, 3.5, p.wreckDark, 0.45).translate(0, 0.3, 0), // sill
    // Tall cargo box (set back) — the van's signature mass.
    box(1.84, 1.0, 2.5, p.wreckBody, 0.5).translate(0, 0.98, -0.45),
    box(1.7, 0.14, 2.5, p.wreckCabin, 0.5).translate(0, 1.5, -0.45), // lighter roof
    // Lower cab + sloped hood + raked windscreen up front (faces the player).
    box(1.78, 0.56, 1.0, p.wreckBody, 0.5).translate(0, 0.64, 1.35),
    tb(1.6, 0.6, 0.12, p.wreckGlass, -0.5, 0, 1.04, 0.95, 0.3),
    box(1.9, 0.16, 0.4, p.wreckStripe, 0.2).translate(0, 0.62, 1.74), // stripe
    box(1.92, 0.22, 0.3, p.wreckDark, 0.4).translate(0, 0.42, 1.9), // bumper
    box(0.32, 0.16, 0.1, p.wreckGlass, 0.2).translate(-0.6, 0.66, 1.88), // headlights (dead)
    box(0.32, 0.16, 0.1, p.wreckScorch, 0.2).translate(0.6, 0.66, 1.88),
    // Split rear doors + a dented panel.
    box(1.74, 0.92, 0.14, p.wreckDark, 0.4).translate(0, 0.96, -1.72),
    box(0.1, 0.78, 0.16, p.wreckRust, 0.4).translate(0, 0.96, -1.79),
    // Rust eating the flanks.
    box(0.16, 0.7, 1.1, p.wreckRust, 0.5).translate(0.94, 0.95, -0.4),
    box(0.5, 0.5, 0.16, p.wreckRust, 0.5).translate(-0.6, 1.0, 0.86),
    // Wheels — rear-left blown flat.
    wheel(0.36, 0.28, p.wreckDark).translate(-0.85, 0.32, 1.25),
    wheel(0.36, 0.28, p.wreckDark).translate(0.85, 0.32, 1.25),
    paint(new THREE.BoxGeometry(0.6, 0.26, 0.7).translate(-0.85, 0.19, -1.25), p.wreckDark, 0.4),
    wheel(0.36, 0.28, p.wreckDark).translate(0.85, 0.32, -1.25),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge van geometry');
  // Crush the van to the same low, jumpable wreck height (~0.9 m) so its footprint
  // top matches the sim's `WRECK_CLEAR` and a hop reads true (the tall cargo body is
  // now a caved-in roof, not a wall you fly through).
  geo.scale(1, 0.58, 1);
  return geo;
}

/**
 * A third wrecked vehicle so a stretch of traffic is not all sedans and vans: a
 * crashed pickup truck — a forward cab and a low open flatbed behind. Crushed to the
 * same low jumpable height as the others. One merged geometry, instanced.
 */
function wreckTruckGeometry(): THREE.BufferGeometry {
  const p = palette;
  const tb = (w: number, h: number, d: number, c: number, rx: number, x: number, y: number, z: number, ao = 0.45) =>
    paint(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z), c, ao);
  const parts = [
    box(1.74, 0.3, 3.7, p.wreckDark, 0.45).translate(0, 0.3, 0), // chassis sill
    // Forward cab: body, raked windscreen, flat roof, the player-facing mass.
    box(1.7, 0.62, 1.3, p.wreckBody, 0.5).translate(0, 0.64, 0.95),
    tb(1.5, 0.52, 0.12, p.wreckGlass, -0.5, 0, 1.06, 1.42, 0.3),
    box(1.5, 0.16, 1.1, p.wreckCabin, 0.5).translate(0, 1.18, 0.86), // roof (crushed later)
    box(0.1, 0.4, 1.0, p.wreckGlass, 0.3).translate(-0.73, 1.0, 0.86), // side glass
    box(0.12, 0.34, 0.5, p.wreckScorch, 0.3).translate(0.73, 0.98, 0.9), // smashed-in side
    // Sloped hood + grille + bumper + dead headlights up front.
    tb(1.7, 0.18, 0.96, p.wreckBody, 0.12, 0, 0.78, 1.92, 0.45),
    box(1.2, 0.24, 0.14, p.carGrille, 0.3).translate(0, 0.6, 2.34),
    tb(1.86, 0.2, 0.3, p.wreckDark, 0.28, 0, 0.46, 2.46, 0.4),
    box(0.3, 0.14, 0.1, p.wreckGlass, 0.2).translate(-0.6, 0.62, 2.42),
    box(0.3, 0.14, 0.1, p.wreckScorch, 0.2).translate(0.6, 0.62, 2.42),
    // The open flatbed behind the cab: floor, side walls, bulkhead, a dropped tailgate.
    box(1.74, 0.16, 2.0, p.wreckDark, 0.45).translate(0, 0.5, -1.2),
    box(0.14, 0.36, 2.0, p.wreckBody, 0.5).translate(-0.8, 0.66, -1.2),
    box(0.14, 0.36, 2.0, p.wreckBody, 0.5).translate(0.8, 0.66, -1.2),
    box(1.6, 0.36, 0.14, p.wreckBody, 0.5).translate(0, 0.66, -0.25), // bulkhead behind cab
    tb(1.6, 0.34, 0.12, p.wreckRust, -0.6, 0, 0.5, -2.18, 0.5), // tailgate hung open
    // Rust eating the flanks + a scorch across the hood.
    box(0.16, 0.4, 0.9, p.wreckRust, 0.5).translate(-0.9, 0.6, 0.5),
    box(0.5, 0.05, 0.5, p.wreckScorch, 0.2).translate(0.3, 0.88, 1.0),
    // Wheels — rear-right blown flat.
    wheel(0.36, 0.28, p.wreckDark).translate(-0.85, 0.32, 1.4),
    wheel(0.36, 0.28, p.wreckDark).translate(0.85, 0.32, 1.4),
    wheel(0.36, 0.28, p.wreckDark).translate(-0.85, 0.32, -1.45),
    paint(new THREE.BoxGeometry(0.6, 0.26, 0.7).translate(0.85, 0.19, -1.45), p.wreckDark, 0.4),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge truck geometry');
  // Crush to the same low, jumpable wreck height as the sedan/van.
  geo.scale(1, 0.68, 1);
  return geo;
}

/**
 * A toppled big rig blocking a lane, the lethal un-jumpable blocker. Amber
 * chevrons face the player so it reads as "wall: dodge, don't jump"
 * (docs/DESIGN.md → readability). One merged geometry, instanced.
 */
function rigGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts = [
    // Tall box trailer along the lane, on a dark underframe.
    box(2.05, 0.42, 5.4, p.rigDark, 0.4).translate(0, 0.36, -0.6),
    box(2.0, 2.4, 5.0, p.rigBody, 0.5).translate(0, 1.55, -0.6),
    // Rear doors facing the car, framed, with three amber hazard chevrons.
    box(2.0, 2.3, 0.18, p.rigDark, 0.45).translate(0, 1.55, 1.95),
    box(0.5, 2.0, 0.22, p.rigHazard, 0.2).translate(-0.6, 1.55, 2.0),
    box(0.5, 2.0, 0.22, p.rigDark, 0.2).translate(0.0, 1.55, 2.0),
    box(0.5, 2.0, 0.22, p.rigHazard, 0.2).translate(0.6, 1.55, 2.0),
    // Rust eating the trailer flank.
    box(0.8, 0.7, 1.0, p.wreckRust, 0.5).translate(-0.95, 1.7, -0.2),
    box(0.6, 0.5, 0.8, p.wreckRust, 0.5).translate(0.97, 1.3, -1.4),
    // Jackknifed cab off the front, angled, with a dead windshield.
    box(2.0, 2.0, 2.2, p.rigCab, 0.5).rotateY(0.5).translate(0.8, 1.05, -3.5),
    box(1.8, 0.8, 0.14, p.wreckGlass, 0.3).rotateY(0.5).translate(0.55, 1.5, -2.6),
    // Wheels — trailer pair each side, plus a cab wheel.
    wheel(0.42, 0.3, p.rigDark).translate(-0.98, 0.32, 0.9),
    wheel(0.42, 0.3, p.rigDark).translate(-0.98, 0.32, -1.9),
    wheel(0.42, 0.3, p.rigDark).translate(0.98, 0.32, 0.9),
    wheel(0.44, 0.32, p.rigDark).rotateY(0.5).translate(1.45, 0.34, -3.9),
    // Spilled cargo strewn in front of the wreck.
    box(1.0, 0.6, 1.0, p.wreckRust, 0.5).rotateY(0.4).translate(-1.2, 0.3, 2.7),
    box(0.7, 0.5, 0.7, p.rigDark, 0.5).rotateY(0.8).translate(0.4, 0.25, 3.0),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge rig geometry');
  return geo;
}

/**
 * A concrete barrier walling off a lane: a lethal blocker like the rig, but a
 * different silhouette so the wall language reads as variety, not repetition. A
 * solid slab tall enough to obviously not be jumpable, with white hazard bands and
 * red chevrons facing the player so a glance reads "you cannot pass this"
 * (docs/DESIGN.md → readability: lethal looks lethal). One merged geometry, instanced.
 */
function barrierGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts = [
    // Wide solid concrete wall, tall enough to read as impassable from far off.
    box(2.4, 1.9, 0.85, p.barrierConcrete, 0.5).translate(0, 1.05, 0),
    // Sloped Jersey foot, wider at the base (the cast-concrete profile).
    box(2.6, 0.5, 1.15, p.barrierConcreteDark, 0.55).translate(0, 0.25, 0),
    // White hazard bands wrapping the face toward the player.
    box(2.44, 0.32, 0.06, p.barrierStripe, 0.2).translate(0, 1.55, 0.44),
    box(2.44, 0.32, 0.06, p.barrierStripe, 0.2).translate(0, 0.78, 0.44),
    // Red danger chevrons between the bands — the lethal read.
    box(0.52, 0.32, 0.08, p.barrierDanger, 0.2).translate(-0.72, 1.16, 0.45),
    box(0.52, 0.32, 0.08, p.barrierDanger, 0.2).translate(0, 1.16, 0.45),
    box(0.52, 0.32, 0.08, p.barrierDanger, 0.2).translate(0.72, 1.16, 0.45),
    // Grime streaks down the face + a spalled top corner for craft.
    box(0.26, 1.3, 0.06, p.barrierGrime, 0.5).translate(-0.95, 1.0, 0.45),
    box(0.2, 1.1, 0.06, p.barrierGrime, 0.5).translate(0.8, 1.0, 0.45),
    paint(new THREE.BoxGeometry(0.45, 0.4, 0.5).rotateY(0.4).translate(1.2, 1.85, 0.1), p.barrierConcreteDark, 0.55),
    // A chunk of broken rubble spilled at the foot, breaking the clean slab.
    box(0.5, 0.34, 0.5, p.barrierConcreteDark, 0.5).rotateY(0.6).translate(-1.25, 0.18, 0.7),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge barrier geometry');
  return geo;
}

/**
 * A crashed bus blocking a lane: the longest lethal wall. A long dead coach along
 * the lane, tall and solid, with dead glass, rust, and red hazard chevrons on the
 * rear facing the player, so it reads as an un-jumpable wall, not a survivable
 * bump (docs/DESIGN.md → readability). One merged geometry, instanced.
 */
function busGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts = [
    // The long body along the lane, on a dark underframe.
    box(2.05, 0.42, 8.8, p.busDark, 0.45).translate(0, 0.36, -0.4),
    box(2.0, 1.6, 8.7, p.busBody, 0.5).translate(0, 1.2, -0.4),
    // Lighter roof cap.
    box(1.9, 0.14, 8.5, p.busRust, 0.5).translate(0, 2.0, -0.4),
    // Black rub rail + dead window strip along each flank.
    box(0.06, 0.18, 8.4, p.busRail, 0.4).translate(-1.0, 1.05, -0.4),
    box(0.06, 0.18, 8.4, p.busRail, 0.4).translate(1.0, 1.05, -0.4),
    box(0.05, 0.5, 7.6, p.busGlass, 0.3).translate(-1.0, 1.45, -0.4),
    box(0.05, 0.5, 7.6, p.busGlass, 0.3).translate(1.0, 1.45, -0.4),
    // Rear facing the player: dark panel, dead lights, red hazard chevrons.
    box(2.0, 1.5, 0.16, p.busDark, 0.45).translate(0, 1.2, 3.98),
    box(0.5, 1.1, 0.2, p.busDanger, 0.2).translate(-0.6, 1.2, 4.04),
    box(0.5, 1.1, 0.2, p.busBody, 0.2).translate(0, 1.2, 4.04),
    box(0.5, 1.1, 0.2, p.busDanger, 0.2).translate(0.6, 1.2, 4.04),
    box(0.36, 0.16, 0.1, p.carTaillightDim, 0.2).translate(-0.7, 0.6, 4.06),
    box(0.36, 0.16, 0.1, p.carTaillightDim, 0.2).translate(0.7, 0.6, 4.06),
    // Rust eating the flanks + a caved-in panel.
    box(0.5, 0.7, 1.2, p.busRust, 0.5).translate(-1.0, 1.2, 1.0),
    box(0.5, 0.5, 0.9, p.busRust, 0.5).translate(1.0, 0.9, -2.2),
    box(0.6, 0.5, 0.5, p.busDark, 0.5).rotateY(0.3).translate(0.7, 1.5, -3.6),
    // Wheels — two each side, one blown flat.
    wheel(0.5, 0.34, p.busDark).translate(-0.92, 0.42, 2.6),
    wheel(0.5, 0.34, p.busDark).translate(0.92, 0.42, 2.6),
    wheel(0.5, 0.34, p.busDark).translate(-0.92, 0.42, -3.0),
    paint(new THREE.BoxGeometry(0.86, 0.34, 0.78).translate(0.92, 0.26, -3.0), p.busDark, 0.4),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge bus geometry');
  return geo;
}

/**
 * A light road barricade, the soft blocker (docs/DESIGN.md → roster: shoot, ram, or
 * steer). A striped trestle plank on splayed A-frame legs: caution yellow over a
 * dark frame so it reads as roadworks, warm but plainly slighter than a lethal wall,
 * so a glance says "I can just go through this." Low enough to clear with a hop too.
 * One merged geometry, instanced.
 */
function barricadeGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts = [
    // The striped plank across the lane.
    box(2.2, 0.32, 0.12, p.barricadeStripe, 0.3).translate(0, 0.58, 0),
    // Dark hazard stripes angled across the plank.
    box(0.2, 0.34, 0.14, p.barricadeStripeDark, 0.2).rotateZ(0.5).translate(-0.72, 0.58, 0.01),
    box(0.2, 0.34, 0.14, p.barricadeStripeDark, 0.2).rotateZ(0.5).translate(0, 0.58, 0.01),
    box(0.2, 0.34, 0.14, p.barricadeStripeDark, 0.2).rotateZ(0.5).translate(0.72, 0.58, 0.01),
    // A thin lower rail tying the legs together.
    box(2.0, 0.08, 0.08, p.barricadeFrame, 0.4).translate(0, 0.32, 0),
    // Splayed A-frame legs at each end.
    paint(new THREE.BoxGeometry(0.1, 0.74, 0.1).rotateX(0.32).translate(-0.96, 0.36, 0.16), p.barricadeLeg, 0.4),
    paint(new THREE.BoxGeometry(0.1, 0.74, 0.1).rotateX(-0.32).translate(-0.96, 0.36, -0.16), p.barricadeLeg, 0.4),
    paint(new THREE.BoxGeometry(0.1, 0.74, 0.1).rotateX(0.32).translate(0.96, 0.36, 0.16), p.barricadeLeg, 0.4),
    paint(new THREE.BoxGeometry(0.1, 0.74, 0.1).rotateX(-0.32).translate(0.96, 0.36, -0.16), p.barricadeLeg, 0.4),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge barricade geometry');
  return geo;
}

/**
 * A boulder blocking a lane, low enough to read as jumpable. Warm tones separate
 * it from off-road scenery while keeping it in the threat palette. One merged
 * geometry, instanced.
 */
function boulderGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts = [
    // Main mass: a big angular block, tilted off-axis so no face is square-on.
    box(1.7, 0.92, 1.55, p.boulderBody, 0.5).rotateY(0.4).rotateZ(0.12).translate(0, 0.4, 0),
    // A second lobe giving the mound its two-peak, broken silhouette.
    box(1.15, 0.74, 1.2, p.boulderLight, 0.45).rotateY(-0.5).rotateZ(-0.12).translate(0.55, 0.33, 0.3),
    // Shadowed crevice block wedged into the back.
    box(0.95, 0.62, 0.9, p.boulderDark, 0.55).rotateY(0.9).translate(-0.5, 0.3, -0.45),
    // Top cap chunk — the high point you read first at the horizon.
    box(0.82, 0.52, 0.72, p.boulderLight, 0.4).rotateY(0.3).rotateZ(0.22).translate(0.08, 0.74, -0.08),
    // Spilled rubble around the base, breaking the box outline into rock.
    box(0.5, 0.32, 0.5, p.boulderDark, 0.5).rotateY(0.6).translate(-0.92, 0.16, 0.7),
    box(0.42, 0.26, 0.44, p.boulderBody, 0.45).rotateY(1.1).translate(0.96, 0.13, -0.68),
    box(0.34, 0.22, 0.36, p.boulderDark, 0.4).rotateY(0.2).translate(0.22, 0.11, 0.96),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge boulder geometry');
  return geo;
}

/**
 * An explosive barrel blocking a lane. The red body, yellow band, and round
 * silhouette keep it distinct from wrecks, boulders, and decorative drums. One
 * merged geometry, instanced.
 */
function barrelGeometry(): THREE.BufferGeometry {
  const p = palette;
  const drum = (r: number, h: number, color: number, ao: number): THREE.BufferGeometry =>
    paint(new THREE.CylinderGeometry(r, r, h, 12), color, ao);
  const parts = [
    // The body, slightly waisted by a darker mid section under the band.
    drum(0.5, 1.12, p.drumBody, 0.45).translate(0, 0.58, 0),
    // Raised rims top and bottom — the drum's signature ribs.
    drum(0.53, 0.12, p.drumDark, 0.4).translate(0, 1.04, 0),
    drum(0.53, 0.12, p.drumDark, 0.4).translate(0, 0.12, 0),
    // Two bright hazard bands so the warm-warning read survives the act haze.
    drum(0.54, 0.16, p.drumBand, 0.2).translate(0, 0.78, 0),
    drum(0.54, 0.16, p.drumBand, 0.2).translate(0, 0.4, 0),
    // Worn lid with a small filler bung off-centre.
    drum(0.46, 0.06, p.drumLid, 0.3).translate(0, 1.16, 0),
    box(0.16, 0.1, 0.16, p.drumDark, 0.3).translate(0.2, 1.2, 0.1),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge barrel geometry');
  return geo;
}

/**
 * A spike strip across a lane: a lethal ground trap (jump it or change lane). A
 * dark base rail with red do-not-cross paint and a row of bright steel teeth, so
 * it reads as "shred zone" rather than a survivable bump, distinct from the black
 * pit of a gap (docs/DESIGN.md → readability: lethal trap). One merged geometry.
 */
function spikesGeometry(): THREE.BufferGeometry {
  const p = palette;
  const tooth = (x: number): THREE.BufferGeometry =>
    paint(new THREE.ConeGeometry(0.16, 0.5, 6).translate(x, 0.34, 0), p.spikesTeeth, 0.55);
  const parts: THREE.BufferGeometry[] = [
    // The dark base rail bolted across the lane.
    box(2.6, 0.16, 0.7, p.spikesBar, 0.4).translate(0, 0.08, 0),
    // Red do-not-cross paint on the near and far edges of the base.
    box(2.6, 0.06, 0.14, p.spikesDanger, 0.1).translate(0, 0.17, 0.26),
    box(2.6, 0.06, 0.14, p.spikesDanger, 0.1).translate(0, 0.17, -0.26),
  ];
  // A row of steel teeth across the strip.
  for (let i = 0; i < 9; i += 1) parts.push(tooth(-1.12 + i * 0.28));
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge spikes geometry');
  return geo;
}

/**
 * A hole in the road, sized to the collision footprint and framed by broken
 * asphalt so it reads as "missing road, hop it" at the spawn horizon.
 */
// The gap uses the unlit silhouette material so act lighting does not wash the
// pit into a pale slab. Colours are baked dark and shown as-is.
const GAP_VOID = 0x050507; // near-black hole
const GAP_WALL = 0x0c0d10; // pit walls, a touch lighter than the floor
const GAP_LIP = 0x202227; // torn asphalt rim, near the road's own dark tone
function gapGeometry(): THREE.BufferGeometry {
  const parts = [
    // The deep void floor, well below the road so you see down into it.
    box(2.7, 0.1, 6.7, GAP_VOID, 0).translate(0, -1.2, 0),
    // Four pit walls dropping from the rim to the floor (read as depth, not a slab).
    box(2.7, 1.3, 0.18, GAP_WALL, 0).translate(0, -0.55, 3.3),
    box(2.7, 1.3, 0.18, GAP_WALL, 0).translate(0, -0.55, -3.3),
    box(0.18, 1.3, 6.7, GAP_WALL, 0).translate(-1.35, -0.55, 0),
    box(0.18, 1.3, 6.7, GAP_WALL, 0).translate(1.35, -0.55, 0),
    // Broken asphalt lip around the rim: near and far edges, then the two sides.
    box(2.98, 0.16, 0.6, GAP_LIP, 0).translate(0, 0.02, 3.4),
    box(2.98, 0.16, 0.6, GAP_LIP, 0).translate(0, 0.02, -3.4),
    box(0.55, 0.16, 7.0, GAP_LIP, 0).translate(-1.55, 0.02, 0),
    box(0.55, 0.16, 7.0, GAP_LIP, 0).translate(1.55, 0.02, 0),
    // A couple of jagged chunks of torn-up asphalt breaking the clean rectangle.
    box(0.7, 0.18, 0.7, GAP_LIP, 0).rotateY(0.4).translate(-1.0, 0.05, 2.2),
    box(0.6, 0.16, 0.6, GAP_LIP, 0).rotateY(0.9).translate(1.05, 0.05, -2.0),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge gap geometry');
  return geo;
}

// The quake-crack telegraph: a glowing jagged fissure lying on the road, shown
// while a quake gap is still closed (`open === false`). Baked bright and drawn on
// the unlit silhouette material so it reads as a hot seam of light against the dark
// asphalt, warning the lane is about to tear open. Replaced by the gap pit once it
// opens (`updateQuakes`).
const CRACK_GLOW = 0xff5a1e;
function quakeCrackGeometry(): THREE.BufferGeometry {
  const parts = [
    box(0.32, 0.06, 3.0, CRACK_GLOW, 0).translate(0, 0.05, 1.7),
    box(0.27, 0.06, 2.4, CRACK_GLOW, 0).rotateY(0.2).translate(0.14, 0.05, -0.7),
    box(0.22, 0.06, 1.9, CRACK_GLOW, 0).rotateY(-0.24).translate(-0.16, 0.05, -2.7),
    // A couple of branch fractures so the seam reads as torn, not a painted stripe.
    box(0.16, 0.06, 1.0, CRACK_GLOW, 0).rotateY(1.0).translate(0.5, 0.05, 0.8),
    box(0.14, 0.06, 0.9, CRACK_GLOW, 0).rotateY(-1.1).translate(-0.5, 0.05, -1.8),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge quake-crack geometry');
  return geo;
}

// The UFO strafe beam: a hot column with a glowing strip burned onto the lane it is
// about to strike. Warm/red on purpose so it reads as a threat at a glance (the
// readability rule: threats warm, pickups cool), even though the saucers glow green.
// Drawn at the beam's swept X each frame, so the strip slides across the lanes as a
// telegraph. Unlit silhouette material shows the baked glow as light.
const BEAM_DANGER = 0xff3320;
const BEAM_HOT = 0xff7a40;
function beamGeometry(): THREE.BufferGeometry {
  const parts = [
    // The lethal strip burned onto the road: the lane marker you must be off.
    box(2.3, 0.06, 5.2, BEAM_DANGER, 0).translate(0, 0.05, 0),
    // A hotter core line down its middle.
    box(0.7, 0.08, 5.2, BEAM_HOT, 0).translate(0, 0.07, 0),
    // The descending shaft, slim so it never curtains off the road ahead.
    box(0.7, 22, 0.95, BEAM_DANGER, 0).translate(0, 11, 0),
    box(0.28, 22, 0.4, BEAM_HOT, 0).translate(0, 11, 0),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge beam geometry');
  return geo;
}

/**
 * A collapse ramp: rubble from a fallen building heaped into a launch ramp across a
 * lane. It reads as a route, not a threat — cool dusty concrete and torn roadbed,
 * never warm, with a yellow chevron on the near lip pointing up the slope so a
 * glance says "drive up me" (docs/DESIGN.md → readability: the cue carries the verb,
 * debris never mimics a warm threat). The face climbs from the player side up
 * toward the back, so the car visibly rides up and over the debris. One merged
 * geometry, instanced.
 */
function rampGeometry(): THREE.BufferGeometry {
  const p = palette;
  // A slab tilted up toward the far (-z) end: the climbing face the car rides up.
  const ramped = (w: number, h: number, d: number, c: number, a: number, x: number, y: number, z: number, ao = 0.5) =>
    paint(new THREE.BoxGeometry(w, h, d).rotateX(a).translate(x, y, z), c, ao);
  const parts = [
    // The rubble base the ramp is heaped on: a low dark mass filling under the slope.
    box(2.5, 0.7, 3.2, p.rampConcreteDark, 0.55).translate(0, 0.35, -0.6),
    // The climbing face, broken into three offset slabs so it reads as debris, not a
    // clean wedge. Each tilts up toward the back; later slabs sit higher.
    ramped(2.4, 0.34, 2.2, p.rampConcrete, 0.27, 0, 0.5, 1.0),
    ramped(2.3, 0.32, 1.8, p.rampConcrete, 0.3, 0.08, 0.92, -0.7),
    ramped(2.1, 0.3, 1.5, p.rampConcreteDark, 0.33, -0.1, 1.22, -1.9),
    // Torn roadbed and bent rebar poking out of the pile (craft + the wreckage read).
    paint(new THREE.BoxGeometry(0.1, 0.5, 0.1).rotateZ(0.4).translate(-0.7, 1.2, -1.6), p.rampRebar, 0.4),
    paint(new THREE.BoxGeometry(0.1, 0.42, 0.1).rotateZ(-0.5).translate(0.55, 1.12, -1.1), p.rampRebar, 0.4),
    paint(new THREE.BoxGeometry(0.1, 0.45, 0.1).rotateX(0.6).translate(0.9, 0.95, -0.2), p.rampRebar, 0.4),
    // Spilled chunks at the foot, breaking the slab outline into rubble.
    paint(new THREE.BoxGeometry(0.55, 0.4, 0.55).rotateY(0.5).translate(-1.0, 0.2, 2.0), p.rampConcreteDark, 0.5),
    paint(new THREE.BoxGeometry(0.46, 0.32, 0.46).rotateY(1.0).translate(0.95, 0.16, 2.1), p.rampConcrete, 0.5),
    paint(new THREE.BoxGeometry(0.4, 0.28, 0.4).rotateY(0.3).translate(0.25, 0.14, 2.4), p.rampConcreteDark, 0.45),
    // The yellow "up" chevron on the near lip — two angled bars meeting up-ramp, the
    // verb cue the player reads at the spawn horizon.
    paint(new THREE.BoxGeometry(0.78, 0.07, 0.2).rotateY(0.6).translate(-0.32, 0.42, 1.55), p.rampChevron, 0.15),
    paint(new THREE.BoxGeometry(0.78, 0.07, 0.2).rotateY(-0.6).translate(0.32, 0.42, 1.55), p.rampChevron, 0.15),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge ramp geometry');
  return geo;
}

/**
 * Renders the sim's live hazards, instanced. The sim owns where they are; this
 * is a read-only view that maps each hazard's absolute world-forward to screen
 * z against the car's distance. One `InstancedMesh` per rendered hazard class,
 * routed by kind. No allocation per frame.
 */
export class HazardField {
  private readonly wreckMesh: THREE.InstancedMesh;
  private readonly wreckVanMesh: THREE.InstancedMesh;
  private readonly wreckTruckMesh: THREE.InstancedMesh;
  private readonly rigMesh: THREE.InstancedMesh;
  private readonly barrierMesh: THREE.InstancedMesh;
  private readonly busMesh: THREE.InstancedMesh;
  private readonly barricadeMesh: THREE.InstancedMesh;
  private readonly boulderMesh: THREE.InstancedMesh;
  private readonly barrelMesh: THREE.InstancedMesh;
  private readonly spikesMesh: THREE.InstancedMesh;
  private readonly gapMesh: THREE.InstancedMesh;
  private readonly crackMesh: THREE.InstancedMesh;
  private readonly beamMesh: THREE.InstancedMesh;
  private readonly rampMesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  /** Reused per-instance tint, so a row of the same blocker never reads identical. */
  private readonly tint = new THREE.Color();

  /** Stable pseudo-random in [0,1), keyed on world-forward and salt. */
  private hv(key: number, salt: number): number {
    let h = (Math.imul((Math.floor(key * 16) | 0) + 1, 374761393) ^ Math.imul(salt, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  constructor(scene: THREE.Scene) {
    this.wreckMesh = new THREE.InstancedMesh(wreckGeometry(), propMaterial, MAX_INSTANCES);
    this.wreckVanMesh = new THREE.InstancedMesh(wreckVanGeometry(), propMaterial, MAX_INSTANCES);
    this.wreckTruckMesh = new THREE.InstancedMesh(wreckTruckGeometry(), propMaterial, MAX_INSTANCES);
    this.rigMesh = new THREE.InstancedMesh(rigGeometry(), propMaterial, MAX_INSTANCES);
    this.barrierMesh = new THREE.InstancedMesh(barrierGeometry(), propMaterial, MAX_INSTANCES);
    this.busMesh = new THREE.InstancedMesh(busGeometry(), propMaterial, MAX_INSTANCES);
    this.barricadeMesh = new THREE.InstancedMesh(barricadeGeometry(), propMaterial, MAX_INSTANCES);
    this.boulderMesh = new THREE.InstancedMesh(boulderGeometry(), propMaterial, MAX_INSTANCES);
    this.barrelMesh = new THREE.InstancedMesh(barrelGeometry(), propMaterial, MAX_INSTANCES);
    this.spikesMesh = new THREE.InstancedMesh(spikesGeometry(), propMaterial, MAX_INSTANCES);
    // Unlit material so the void stays black under any act light (a lit dark
    // surface gets washed pale and reads as a slab, not a hole).
    this.gapMesh = new THREE.InstancedMesh(gapGeometry(), silhouetteMaterial, MAX_INSTANCES);
    // The pre-open crack telegraph; unlit so its baked glow reads as hot light.
    this.crackMesh = new THREE.InstancedMesh(quakeCrackGeometry(), silhouetteMaterial, MAX_INSTANCES);
    // Unlit so the beam's baked glow reads as hot light against any act lighting.
    this.beamMesh = new THREE.InstancedMesh(beamGeometry(), silhouetteMaterial, MAX_INSTANCES);
    // The collapse ramp: lit like the solid props (it is dusty rubble, not a glow).
    this.rampMesh = new THREE.InstancedMesh(rampGeometry(), propMaterial, MAX_INSTANCES);
    for (const mesh of [
      this.wreckMesh,
      this.wreckVanMesh,
      this.wreckTruckMesh,
      this.rigMesh,
      this.barrierMesh,
      this.busMesh,
      this.barricadeMesh,
      this.boulderMesh,
      this.barrelMesh,
      this.spikesMesh,
      this.gapMesh,
      this.crackMesh,
      this.beamMesh,
      this.rampMesh,
    ]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }
  }

  update(state: ReadonlyState, elevation: Elevation): void {
    let wrecks = 0;
    let vans = 0;
    let trucks = 0;
    let rigs = 0;
    let barriers = 0;
    let buses = 0;
    let barricades = 0;
    let boulders = 0;
    let barrels = 0;
    let spikes = 0;
    let gaps = 0;
    let cracks = 0;
    let beams = 0;
    let ramps = 0;
    for (const h of state.hazards) {
      // A detonated barrel, a shot-apart car, or a popped barricade is gone.
      if (
        (h.kind === 'barrel' || h.kind === 'wreck' || h.kind === 'drifter' || h.kind === 'barricade') &&
        h.hit
      )
        continue;
      // Meteors are drawn by MeteorField (falling rock → crater); skip here so
      // they aren't also drawn as a wrecked car by the default branch below.
      if (h.kind === 'meteor') continue;
      let mesh: THREE.InstancedMesh;
      let count: number;
      if (h.kind === 'rig') {
        mesh = this.rigMesh;
        count = rigs;
      } else if (h.kind === 'barrier') {
        mesh = this.barrierMesh;
        count = barriers;
      } else if (h.kind === 'bus') {
        mesh = this.busMesh;
        count = buses;
      } else if (h.kind === 'barricade') {
        mesh = this.barricadeMesh;
        count = barricades;
      } else if (h.kind === 'boulder') {
        mesh = this.boulderMesh;
        count = boulders;
      } else if (h.kind === 'barrel') {
        mesh = this.barrelMesh;
        count = barrels;
      } else if (h.kind === 'spikes') {
        mesh = this.spikesMesh;
        count = spikes;
      } else if (h.kind === 'gap' && h.open === false) {
        // Still a telegraph crack: draw the glowing fissure, not the pit.
        mesh = this.crackMesh;
        count = cracks;
      } else if (h.kind === 'gap') {
        mesh = this.gapMesh;
        count = gaps;
      } else if (h.kind === 'beam') {
        mesh = this.beamMesh;
        count = beams;
      } else if (h.kind === 'ramp') {
        mesh = this.rampMesh;
        count = ramps;
      } else if (h.kind === 'wreck' && this.hv(h.forward, 6) < 0.34) {
        // Static wrecks split three ways (van / pickup / sedan) so a row of traffic
        // isn't all one model.
        mesh = this.wreckVanMesh;
        count = vans;
      } else if (h.kind === 'wreck' && this.hv(h.forward, 6) < 0.67) {
        mesh = this.wreckTruckMesh;
        count = trucks;
      } else {
        // The sedan: the last third of wrecks, and every drifter (it yaws into slides).
        mesh = this.wreckMesh;
        count = wrecks;
      }
      if (count >= MAX_INSTANCES) continue;
      // Per-instance variety keeps a stretch of the same blocker from reading as
      // clones. Drifters keep their slide yaw; rigs stay square because they are
      // walls. Tint is applied to all but the gap, whose dark pit must stay dark.
      const drifter = h.kind === 'drifter';
      const shaped = h.kind === 'wreck' || drifter || h.kind === 'boulder' || h.kind === 'barrel';
      const yaw = drifter ? this.driftYaw(h) : shaped ? (this.hv(h.forward, 1) - 0.5) * 0.7 : 0;
      this.dummy.position.set(h.x, elevation.yAt(h.forward, state.distance), state.distance - h.forward);
      this.dummy.rotation.set(0, yaw, 0);
      if (shaped) {
        this.dummy.scale.set(
          0.9 + this.hv(h.forward, 2) * 0.2,
          0.9 + this.hv(h.forward, 5) * 0.18,
          0.9 + this.hv(h.forward, 3) * 0.2,
        );
      } else {
        this.dummy.scale.setScalar(1);
      }
      this.dummy.updateMatrix();
      mesh.setMatrixAt(count, this.dummy.matrix);
      // The gap pit and the beam keep their baked colours (a dark hole, a hot glow);
      // everything else gets a per-instance shade so a row never reads as clones.
      if (h.kind !== 'gap' && h.kind !== 'beam') {
        const shade = 0.8 + this.hv(h.forward, 4) * 0.38;
        this.tint.setRGB(shade, shade, shade);
        mesh.setColorAt(count, this.tint);
      }
      if (h.kind === 'rig') rigs += 1;
      else if (h.kind === 'barrier') barriers += 1;
      else if (h.kind === 'bus') buses += 1;
      else if (h.kind === 'barricade') barricades += 1;
      else if (h.kind === 'boulder') boulders += 1;
      else if (h.kind === 'barrel') barrels += 1;
      else if (h.kind === 'spikes') spikes += 1;
      else if (h.kind === 'gap' && h.open === false) cracks += 1;
      else if (h.kind === 'gap') gaps += 1;
      else if (h.kind === 'beam') beams += 1;
      else if (h.kind === 'ramp') ramps += 1;
      else if (h.kind === 'wreck' && this.hv(h.forward, 6) < 0.34) vans += 1;
      else if (h.kind === 'wreck' && this.hv(h.forward, 6) < 0.67) trucks += 1;
      else wrecks += 1;
    }
    this.wreckMesh.count = wrecks;
    this.wreckVanMesh.count = vans;
    this.wreckTruckMesh.count = trucks;
    this.rigMesh.count = rigs;
    this.barrierMesh.count = barriers;
    this.busMesh.count = buses;
    this.barricadeMesh.count = barricades;
    this.boulderMesh.count = boulders;
    this.barrelMesh.count = barrels;
    this.spikesMesh.count = spikes;
    this.gapMesh.count = gaps;
    this.crackMesh.count = cracks;
    this.beamMesh.count = beams;
    this.rampMesh.count = ramps;
    for (const mesh of [
      this.wreckMesh,
      this.wreckVanMesh,
      this.wreckTruckMesh,
      this.rigMesh,
      this.barrierMesh,
      this.busMesh,
      this.barricadeMesh,
      this.boulderMesh,
      this.barrelMesh,
      this.spikesMesh,
      this.gapMesh,
      this.crackMesh,
      this.beamMesh,
      this.rampMesh,
    ]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Yaw for a drifting wreck: angled into its slide while it moves, straightening
   * as it settles in the target lane — so the motion reads as "sliding into that
   * lane," the telegraph that keeps it fair (docs/DESIGN.md → Juice as
   * information). Zero for every static blocker.
   */
  private driftYaw(h: Hazard): number {
    if (h.kind !== 'drifter' || h.driftFromX === undefined || h.driftToX === undefined) return 0;
    const span = h.driftToX - h.driftFromX;
    if (Math.abs(span) < 1e-4) return 0;
    const progress = Math.min(1, Math.max(0, (h.x - h.driftFromX) / span));
    return -Math.sign(span) * (1 - progress) * 0.35;
  }
}
