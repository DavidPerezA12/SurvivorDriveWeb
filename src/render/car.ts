import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lightMaterial, paint, propMaterial, wheel } from './materials';
import { palette } from './palette';
import { GUN_UPGRADES, type UpgradeId } from '../content/upgrades';

/**
 * A box panel positioned, then color-baked — crucially in that order, so the AO
 * gradient is computed from the panel's *final* orientation. Painting before the
 * transform (the old path) shaded every sloped surface as if it were still an
 * axis-aligned box, which flattened the wedges and tapers; doing it after means
 * a raked windscreen or a sloped hood actually catches the light like the form
 * it is. `ao` is how dark the undersides go (tops stay full).
 */
function part(
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  ao = 0.4,
): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color, ao);
}

/** A box panel rotated about its own centre, positioned, then color-baked. */
function tilted(
  w: number,
  h: number,
  d: number,
  color: number,
  rx: number,
  x: number,
  y: number,
  z: number,
  ao = 0.45,
): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z), color, ao);
}

/**
 * A self-lit panel for lamps — painted flat (no AO) so it shows full color under
 * the unlit `lightMaterial`. Optional `rx` tilts it to sit on a sloped face.
 */
function glow(
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  return paint(g.translate(x, y, z), color, 0);
}

/** A round bar/pipe/drum laid along an axis — rounded bumpers, exhausts, pods. */
function cyl(
  radius: number,
  length: number,
  color: number,
  axis: 'x' | 'y' | 'z',
  x: number,
  y: number,
  z: number,
  ao = 0.42,
  seg = 12,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return paint(g.translate(x, y, z), color, ao);
}

/** A tapered round form along an axis — muzzle brakes, velocity stacks, valves. */
function cone(
  rTop: number,
  rBot: number,
  length: number,
  color: number,
  axis: 'x' | 'y' | 'z',
  x: number,
  y: number,
  z: number,
  ao = 0.45,
  seg = 14,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, length, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return paint(g.translate(x, y, z), color, ao);
}

/** A faceted sphere — domed tank caps, magnet pole knobs, rounded bolt heads. */
function ball(radius: number, color: number, x: number, y: number, z: number, ao = 0.4, seg = 12): THREE.BufferGeometry {
  return paint(new THREE.SphereGeometry(radius, seg, Math.max(6, seg - 4)).translate(x, y, z), color, ao);
}

/** A round self-lit lamp — pod headlights and round reverse/indicator lamps. */
function glowCyl(
  radius: number,
  length: number,
  color: number,
  axis: 'x' | 'y' | 'z',
  x: number,
  y: number,
  z: number,
  seg = 12,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return paint(g.translate(x, y, z), color, 0);
}

/**
 * A frustum — a box whose top face is scaled in (and optionally slid in z), so a
 * cabin or hood tapers like real bodywork instead of reading as a cube.
 * `computeVertexNormals` after the move keeps each face flat-shaded and lit from
 * its true sloped orientation.
 */
function taper(
  w: number,
  h: number,
  d: number,
  topW: number,
  topD: number,
  color: number,
  x: number,
  y: number,
  z: number,
  ao = 0.4,
  slantZ = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.getAttribute('position');
  const sx = topW / w;
  const sz = topD / d;
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * sx);
      pos.setZ(i, pos.getZ(i) * sz + slantZ);
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return paint(g.translate(x, y, z), color, ao);
}

/**
 * A crowned, sloped panel — a frustum (top face scaled in, so the surface domes
 * like a real hood crown) that is *then* raked about X. Normals are recomputed
 * before the tilt so the AO bake reads the panel's true, final orientation. This
 * is what turns the hood and nose from flat wedges into bodywork that catches a
 * highlight down the centre crease.
 */
function crown(
  w: number,
  h: number,
  d: number,
  topW: number,
  topD: number,
  color: number,
  rx: number,
  x: number,
  y: number,
  z: number,
  ao = 0.45,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.getAttribute('position');
  const sx = topW / w;
  const sz = topD / d;
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * sx);
      pos.setZ(i, pos.getZ(i) * sz);
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.rotateX(rx).translate(x, y, z);
  return paint(g, color, ao);
}

/**
 * A proper alloy road wheel: a deep tyre with a sidewall shoulder, a dished alloy
 * face carrying five spokes inside a chrome lip, a centre cap and five lug nuts —
 * the detail that most makes a low-poly car read as a *real car* from the side,
 * where the plain black disc used to give it away. Built outboard-facing for the
 * wheel at (x, z); the inboard side stays a simple tyre (never seen).
 */
function wheelAssembly(x: number, z: number, axleY: number, radius: number, width = 0.32): THREE.BufferGeometry[] {
  const P = palette;
  const out = x > 0 ? 1 : -1;
  const faceX = x + out * (width / 2);
  const parts: THREE.BufferGeometry[] = [
    wheel(radius, width, P.wheel).translate(x, axleY, z), // tyre
    wheel(radius * 0.62, width * 0.5, P.carGrille).translate(x, axleY, z), // dark rim barrel
    cyl(radius * 0.6, 0.05, P.wheelHub, 'x', faceX - out * 0.02, axleY, z, 0.5, 22), // alloy face
  ];
  // Chrome outer lip ring around the alloy face.
  const lip = new THREE.TorusGeometry(radius * 0.58, 0.035, 6, 22).rotateY(Math.PI / 2).translate(faceX, axleY, z);
  parts.push(paint(lip, P.carChrome, 0.5));
  // Five spokes radiating from the hub, each pushed out to mid-radius then spun
  // about the axle.
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const sp = new THREE.BoxGeometry(0.055, radius * 0.62, 0.1);
    sp.translate(0, radius * 0.3, 0);
    sp.rotateX(a);
    sp.translate(faceX, axleY, z);
    parts.push(paint(sp, P.wheelHub, 0.4));
  }
  // Chrome centre cap + five lug nuts ringed around it.
  parts.push(cyl(radius * 0.17, 0.07, P.carChrome, 'x', faceX + out * 0.02, axleY, z, 0.45, 14));
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    parts.push(
      cyl(0.026, 0.05, P.carChrome, 'x', faceX + out * 0.01, axleY + Math.cos(a) * radius * 0.12, z + Math.sin(a) * radius * 0.12, 0.45, 6),
    );
  }
  return parts;
}

/**
 * Extrude a 2D side-profile `shape` (x = car length, nose at +x; y = height) into
 * a smooth, bevel-edged body shell of the given `width`, oriented nose-forward
 * (+z). Optionally tuck the greenhouse by scaling the width inward above
 * `taperFromY` toward `taperTo` (1 = no tuck), so the roof narrows over one
 * continuous curved surface — the thing a stack of boxes can never do, and the
 * whole point of the real-bodywork rebuild. Bevelled edges round every seam so
 * the silhouette reads as pressed steel, not faceted blocks.
 */
function extrudeBody(
  shape: THREE.Shape,
  width: number,
  color: number,
  ao = 0.4,
  taperFromY = 99,
  taperTo = 1,
): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
    steps: 1,
  });
  geo.translate(0, 0, -width / 2); // centre the extruded width on z = 0
  geo.rotateY(-Math.PI / 2); // profile length (x) → travel-forward (+z); width → x
  if (taperFromY < 90) {
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y > taperFromY) {
        const t = Math.min(1, (y - taperFromY) / 0.6);
        pos.setX(i, pos.getX(i) * (1 - (1 - taperTo) * t));
      }
    }
    pos.needsUpdate = true;
  }
  geo.computeVertexNormals();
  return paint(geo, color, ao);
}

/**
 * The hero asset, built as a *single merged geometry* so the whole car is one
 * draw call no matter how much detail it carries (docs/ARCHITECTURE.md → Detail
 * without polygons). Shape is bought with **slopes, tapers, and proportion** —
 * a wedge nose, a raked windscreen, a greenhouse narrower than the body, a
 * fastback rear, fender haunches over the wheels — so it reads as a vehicle, not
 * a stack of cubes, while staying flat-shaded low-poly.
 *
 * Authoring convention: the car is modelled nose-forward (+z) and then flipped
 * 180° to face the direction of travel (−z), baked into the geometry so the
 * chase camera sees its tail and red lights, and the body-roll (`rotation.z` on
 * the group) is unaffected. M2 damage states and upgrade parts hang off here
 * (docs/DESIGN.md → Object craft).
 */
export function createCar(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'car';

  const wheelRadius = 0.36;
  const axleY = wheelRadius;
  const floorY = axleY + 0.14;
  const B = palette;
  const body: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];

  // ----- The body shell: ONE smooth, bevel-edged extruded side-profile — a
  // long-hood / short-deck muscle silhouette with real wheel arches cut into the
  // outline — instead of a stack of boxes. The greenhouse is a second extrude in
  // glass, tucked narrower, with a painted roof cap and slim pillars over it so it
  // reads as glass + pillars, not a bare bubble. (Profile y is in world units, so
  // it lines up with the floorY-based detail parts below.) -----
  const lower = new THREE.Shape();
  lower.moveTo(2.0, 0.34);
  lower.lineTo(2.0, 0.62);
  lower.quadraticCurveTo(1.99, 0.82, 1.8, 0.88); // round the nose top
  lower.lineTo(1.5, 0.9);
  lower.quadraticCurveTo(1.0, 0.97, 0.72, 1.03); // hood rising to the cowl
  lower.lineTo(-1.46, 0.99); // beltline running back
  lower.lineTo(-1.78, 0.92); // short rear deck
  lower.quadraticCurveTo(-2.0, 0.86, -2.0, 0.7); // round the tail top
  lower.lineTo(-2.0, 0.34);
  lower.lineTo(-1.82, 0.3);
  lower.lineTo(-1.64, 0.3);
  lower.quadraticCurveTo(-1.42, 0.74, -1.12, 0.32); // rear wheel arch
  lower.lineTo(1.12, 0.32); // rocker
  lower.quadraticCurveTo(1.42, 0.74, 1.7, 0.3); // front wheel arch
  lower.lineTo(1.84, 0.3);
  lower.lineTo(2.0, 0.34);
  body.push(extrudeBody(lower, 1.78, B.carBody, 0.34));
  // Dark rocker sill tucked under the doors.
  body.push(part(1.72, 0.12, 2.5, B.carTrim, 0, floorY - 0.08, -0.1));

  const cabin = new THREE.Shape();
  cabin.moveTo(0.72, 1.0); // windshield base at the cowl
  cabin.quadraticCurveTo(0.5, 1.34, 0.16, 1.49); // raked windshield up
  cabin.quadraticCurveTo(-0.04, 1.54, -0.46, 1.5); // domed roof front
  cabin.lineTo(-0.96, 1.46); // roof
  cabin.quadraticCurveTo(-1.22, 1.42, -1.36, 1.2); // roof into the backlight
  cabin.lineTo(-1.52, 1.0); // fastback backlight to the deck
  cabin.lineTo(0.72, 1.0); // beltline back to start
  body.push(extrudeBody(cabin, 1.48, B.carGlass, 0.3, 1.16, 0.82));

  // Painted roof cap over the glasshouse + slim body-colour pillars (A, B, C).
  body.push(crown(1.18, 0.1, 1.46, 1.0, 1.28, B.carBody, -0.02, 0, 1.5, -0.42));
  for (const s of [-1, 1] as const) {
    body.push(tilted(0.07, 0.62, 0.09, B.carBody, -0.66, s * 0.61, 1.26, 0.46)); // A-pillar
    body.push(part(0.06, 0.5, 0.09, B.carBody, s * 0.64, 1.22, -0.42)); // B-pillar
    body.push(tilted(0.07, 0.58, 0.09, B.carBody, 0.62, s * 0.6, 1.22, -1.18)); // C-pillar
  }
  // Recessed dark tail panel the lights sit proud of, over a body-color valance
  // so the tail reads as the car, not a black void.
  body.push(part(1.7, 0.4, 0.14, B.carGrille, 0, floorY + 0.4, -1.84));
  body.push(part(1.78, 0.18, 0.24, B.carBodyDark, 0, floorY + 0.15, -1.88));
  // Rounded rear bumper bar in body-dark (not black, so the tail reads as the
  // car) with a vertical-fin diffuser recessed below it — aggressive, and it
  // turns the dark underside into deliberate detail instead of a void.
  body.push(cyl(0.13, 1.86, B.carBodyDark, 'x', 0, floorY + 0.04, -1.99, 0.42, 12));
  body.push(part(1.42, 0.24, 0.14, B.carGrille, 0, floorY - 0.07, -2.0));
  for (const fx of [-0.42, -0.14, 0.14, 0.42]) {
    body.push(part(0.08, 0.2, 0.18, B.carTrim, fx, floorY - 0.07, -2.04));
  }
  // Twin round chrome exhaust tips poking out below.
  for (const s of [-1, 1] as const) {
    body.push(cyl(0.1, 0.34, B.carChrome, 'z', s * 0.52, floorY - 0.04, -2.12, 0.42, 12));
    body.push(cyl(0.07, 0.1, B.carGrille, 'z', s * 0.52, floorY - 0.04, -2.04, 0.42, 12)); // dark bore
  }

  // Cowcatcher front bumper — a round tube bumper with vertical guard bars and
  // chrome over-riders, the brand signature, now drawn as pipe instead of a slab.
  body.push(cyl(0.15, 1.95, B.carTrim, 'x', 0, floorY + 0.06, 2.0, 0.42, 12));
  for (const s of [-1, 1] as const) {
    body.push(cyl(0.09, 0.52, B.carTrim, 'y', s * 0.66, floorY + 0.26, 2.02, 0.42, 10));
    body.push(cyl(0.06, 0.16, B.carChrome, 'z', s * 0.34, floorY + 0.06, 2.1, 0.42, 10));
  }
  // Recessed grille with vertical slats, set into the nose wedge, + hood scoop.
  body.push(tilted(0.74, 0.22, 0.12, B.carGrille, 0.55, 0, floorY + 0.26, 1.93));
  for (const gx of [-0.24, -0.08, 0.08, 0.24]) {
    body.push(tilted(0.05, 0.18, 0.08, B.carChrome, 0.55, gx, floorY + 0.27, 1.98));
  }
  body.push(tilted(0.52, 0.14, 0.66, B.carBodyDark, 0.13, 0, floorY + 0.56, 1.05));

  // Side mirrors on round stalks at the A-pillar base.
  for (const s of [-1, 1] as const) {
    body.push(cyl(0.03, 0.2, B.carTrim, 'x', s * 0.86, floorY + 0.72, 0.36, 0.4, 6));
    body.push(part(0.1, 0.2, 0.14, B.carChrome, s * 0.97, floorY + 0.74, 0.34));
  }
  // Low roof rack on the tapered roof, round tube rails on round cross-bars — a
  // survivor carries gear up top.
  for (const s of [-1, 1] as const) {
    body.push(cyl(0.04, 1.2, B.carChrome, 'z', s * 0.46, 1.58, -0.4, 0.4, 8));
  }
  for (const rz of [-0.85, -0.4, 0.05]) {
    body.push(cyl(0.035, 1.0, B.carChrome, 'x', 0, 1.6, rz, 0.4, 8));
  }

  // Wheels: black tyre, contrasting rim that reads from both faces, chrome hub.
  const wx = 1.0;
  for (const [sx, sz] of [
    [-wx, 1.42],
    [wx, 1.42],
    [-wx, -1.42],
    [wx, -1.42],
  ] as const) {
    body.push(...wheelAssembly(sx, sz, axleY, wheelRadius));
    // Round wheel-arch eyebrow hugging each tyre — a curve over the slab-sided
    // haunches so the fenders read as drawn metal, not a box (the same rounded
    // language the alternate chassis use).
    const eyebrow = new THREE.TorusGeometry(0.5, 0.07, 6, 14, Math.PI)
      .rotateY(Math.PI / 2)
      .translate(sx, axleY + 0.02, sz);
    body.push(paint(eyebrow, B.carBodyDark, 0.5));
  }

  // ----- Real-car flank detail: panel gaps, handles, beltline trim, fuel cap and
  // plates — the small stuff that makes it read as bodywork, not a shell. -----
  for (const s of [-1, 1] as const) {
    const fx = s * 0.93;
    // Two door shut-lines splitting fender / door / quarter, plus a sill seam.
    for (const dz of [0.62, -0.46]) body.push(cyl(0.012, 0.62, B.carGrille, 'y', fx, floorY + 0.42, dz, 0.4, 5));
    body.push(cyl(0.012, 1.9, B.carGrille, 'z', fx, floorY + 0.22, 0.05, 0.4, 5));
    // Recessed door handle.
    body.push(part(0.16, 0.05, 0.05, B.carChrome, fx, floorY + 0.6, 0.08));
    // Chrome beltline strip along the base of the side glass.
    body.push(part(0.03, 0.04, 1.5, B.carChrome, fx, floorY + 0.62, -0.3));
    // Round fuel filler cap on the rear quarter.
    body.push(cyl(0.08, 0.04, B.carChrome, 'x', fx, floorY + 0.52, -1.18, 0.4, 12));
  }
  // Front + rear licence plates (no marque — just a survivor's scrawled plate).
  body.push(part(0.46, 0.2, 0.04, B.carReverse, 0, floorY + 0.18, 2.13));
  body.push(part(0.46, 0.2, 0.04, B.carReverse, 0, floorY + 0.2, -2.04));

  // ----- Self-lit lamps (unlit material, so they glow even in shadow) -----
  // The rear is the car's signature read — the elevated chase camera looks
  // straight onto it all run — so the tail is modelled as a pair of *real*
  // recessed lamp clusters, not flat red decals. Each side is a three-segment
  // cluster (amber turn outboard · a wide red brake · an inboard white reverse)
  // sunk behind a proud chrome surround with slim dark dividers between the
  // lenses; a dim centre reflector strip bridges the two low on the tail.
  const tailY = floorY + 0.47;
  lights.push(glow(0.5, 0.07, 0.14, B.carTaillightDim, 0, tailY - 0.12, -1.86));
  for (const s of [-1, 1] as const) {
    lights.push(glow(0.16, 0.2, 0.22, B.carIndicator, s * 0.82, tailY, -1.88)); // amber turn
    lights.push(glow(0.34, 0.22, 0.24, B.carTaillight, s * 0.52, tailY, -1.89)); // red brake
    lights.push(glow(0.13, 0.16, 0.18, B.carReverse, s * 0.28, tailY, -1.88)); // white reverse
    // Chrome cluster surround, proud of the lenses so each lamp reads sunk into a
    // chromed housing, with slim dark dividers splitting the three segments.
    body.push(part(0.86, 0.045, 0.09, B.carChrome, s * 0.55, tailY + 0.13, -1.9));
    body.push(part(0.86, 0.045, 0.09, B.carChrome, s * 0.55, tailY - 0.13, -1.9));
    body.push(part(0.045, 0.3, 0.09, B.carChrome, s * 0.96, tailY, -1.9));
    body.push(part(0.045, 0.3, 0.09, B.carChrome, s * 0.16, tailY, -1.9));
    body.push(part(0.03, 0.28, 0.07, B.carTrim, s * 0.68, tailY, -1.9));
    body.push(part(0.03, 0.28, 0.07, B.carTrim, s * 0.385, tailY, -1.9));
  }
  // Round headlights up front — a chrome housing ring with a glowing round lens
  // sunk into it, reading as a real lamp instead of a flat panel.
  for (const s of [-1, 1] as const) {
    body.push(cyl(0.21, 0.1, B.carChrome, 'z', s * 0.58, floorY + 0.36, 1.92, 0.42, 14));
    lights.push(glowCyl(0.16, 0.06, B.carHeadlight, 'z', s * 0.58, floorY + 0.36, 1.98, 14));
  }

  // The extruded body shells are non-indexed while the box/cyl parts are indexed;
  // mergeGeometries refuses to mix the two, so normalise everything to non-indexed
  // first (the temporary copies are CPU-only and get GC'd, never uploaded).
  const bodyGeo = mergeGeometries(body.map((g) => g.toNonIndexed()), false);
  const lightGeo = mergeGeometries(lights, false);
  for (const p of body) p.dispose();
  for (const p of lights) p.dispose();
  if (!bodyGeo || !lightGeo) throw new Error('Failed to merge car geometry');
  // Flip nose-forward → travel-forward (−z), baked into both layers so the bank
  // (rotation.z on the group) is unaffected.
  bodyGeo.rotateY(Math.PI);
  lightGeo.rotateY(Math.PI);

  group.add(new THREE.Mesh(bodyGeo, propMaterial));
  group.add(new THREE.Mesh(lightGeo, lightMaterial));
  return group;
}

// The hero car is built nose-forward (+z); the merged geometry is flipped 180°
// to face travel (−z). Bolt-on parts share that convention and the same axle/
// floor heights, so they sit flush on the body before the same flip.
const WHEEL_RADIUS = 0.36;
const AXLE_Y = WHEEL_RADIUS;
const FLOOR_Y = AXLE_Y + 0.14;
const WHEELS: readonly [number, number][] = [
  [-1.0, 1.42],
  [1.0, 1.42],
  [-1.0, -1.42],
  [1.0, -1.42],
];

/**
 * Bolt-on geometry for one owned upgrade, authored to the same craft bar as the
 * car (docs/DESIGN.md → Upgrades render on the car model; Object craft). Each
 * reads as a deliberate part with a distinctive silhouette and a signature
 * colour that matches its in-world cue — so the garage build is legible at a
 * glance, even with the HUD off.
 */
function upgradeParts(id: UpgradeId): THREE.BufferGeometry[] {
  const P = palette;
  switch (id) {
    case 'reinforcedPlating': {
      // Bolted steel: a bevelled hood plate with round bolt heads, side skirts,
      // and a round-tube nose brush-guard — the car visibly armoured up.
      const parts = [
        taper(1.24, 0.1, 1.15, 1.06, 1.0, P.wheelHub, 0, FLOOR_Y + 0.58, 0.85, 0.45),
        cyl(0.09, 1.74, P.wheelHub, 'x', 0, FLOOR_Y + 0.5, 2.06, 0.42, 12), // upper guard tube
        cyl(0.09, 1.74, P.wheelHub, 'x', 0, FLOOR_Y + 0.18, 2.08, 0.42, 12), // lower guard tube
      ];
      for (const bz of [0.45, 0.85, 1.25]) {
        for (const s of [-1, 1] as const) parts.push(ball(0.05, P.carTrim, s * 0.5, FLOOR_Y + 0.63, bz, 0.4, 8)); // bolts
      }
      for (const s of [-1, 1] as const) {
        parts.push(taper(0.15, 0.36, 2.7, 0.1, 2.4, P.wheelHub, s * 1.0, FLOOR_Y + 0.18, -0.1, 0.45)); // bevelled skirt
        parts.push(cyl(0.06, 0.46, P.wheelHub, 'y', s * 0.62, FLOOR_Y + 0.5, 2.06, 0.42, 8)); // guard upright
      }
      return parts;
    }
    case 'stickyTires':
      // Fat, knobbly tyres proud of the stock rims — a planted, grippy stance.
      return WHEELS.map(([sx, sz]) => wheel(0.47, 0.44, P.wheel).translate(sx, AXLE_Y, sz));
    case 'hydraulicJump': {
      // A round chrome coilover shock wrapped in a coloured coil spring at each
      // corner — the car sits ready to launch. (Visual cue only; arc is in sim.)
      const parts: THREE.BufferGeometry[] = [];
      for (const [sx, sz] of WHEELS) {
        const x = sx * 0.82;
        parts.push(cyl(0.045, 0.34, P.carChrome, 'y', x, FLOOR_Y + 0.06, sz, 0.4, 8)); // shock rod
        parts.push(cyl(0.11, 0.26, P.wreckStripe, 'y', x, FLOOR_Y - 0.0, sz, 0.4, 10)); // coil spring
        parts.push(ball(0.06, P.carChrome, x, FLOOR_Y + 0.24, sz, 0.4, 8)); // top mount
      }
      return parts;
    }
    case 'liftTank': {
      // A strapped electric-blue gas *cylinder* with domed caps on the rear deck —
      // round pressure-vessel, the jump fuel, colour-matched to the lift pickups.
      return [
        cyl(0.27, 1.0, P.liftToken, 'z', 0, FLOOR_Y + 0.84, -1.12, 0.42, 16),
        ball(0.27, P.liftTokenDark, 0, FLOOR_Y + 0.84, -0.62, 0.4, 14), // front dome cap
        ball(0.27, P.liftTokenDark, 0, FLOOR_Y + 0.84, -1.62, 0.4, 14), // rear dome cap
        cyl(0.05, 0.7, P.carChrome, 'z', 0, FLOOR_Y + 1.1, -1.12, 0.4, 8), // top feed pipe
        cyl(0.06, 0.1, P.carChrome, 'y', 0, FLOOR_Y + 1.04, -0.66, 0.4, 8), // valve
        cyl(0.31, 0.08, P.carTrim, 'z', 0, FLOOR_Y + 0.84, -0.86, 0.4, 16), // mount strap ring
        cyl(0.31, 0.08, P.carTrim, 'z', 0, FLOOR_Y + 0.84, -1.4, 0.4, 16),
      ];
    }
    case 'scrapMagnet': {
      // A cyan horseshoe magnet on a round nose boom — the loot reach made literal.
      const R = 0.27;
      const horseshoe = new THREE.TorusGeometry(R, 0.1, 8, 18, Math.PI).translate(0, FLOOR_Y + 0.42, 2.34);
      return [
        cyl(0.07, 0.5, P.carChrome, 'z', 0, FLOOR_Y + 0.34, 2.12, 0.4, 10), // boom
        paint(horseshoe, P.scrapPing, 0.4), // the U arch
        cyl(0.1, 0.28, P.scrapPing, 'y', -R, FLOOR_Y + 0.28, 2.34, 0.4, 10), // left pole
        cyl(0.1, 0.28, P.scrapPing, 'y', R, FLOOR_Y + 0.28, 2.34, 0.4, 10), // right pole
        ball(0.1, P.carReverse, -R, FLOOR_Y + 0.15, 2.34, 0.4, 10), // pole caps
        ball(0.1, P.carReverse, R, FLOOR_Y + 0.15, 2.34, 0.4, 10),
      ];
    }
    case 'gunMkII':
    case 'gunMkIII':
    case 'gunMkIV':
    case 'gunMkV':
      // The gun is composed once in `buildUpgradeLayer`, sized by the highest
      // tier owned, so stacking tiers grows one gun rather than bolting on four.
      return [];
    default:
      // Higher tiers of a family (e.g. Reinforced Plating II/III) add no new
      // bolt-on — the tier-I part already represents the family on the car.
      return [];
  }
}

/**
 * Battle-damage parts for a severity `tier` (1..3), cumulative — a higher tier
 * keeps the lower tiers' scars and adds worse ones. Authored to the same craft
 * bar as the car so a battered hull reads as deliberately wrecked, not glitched
 * (docs/DESIGN.md → Object craft: damage states modeled with the same care as the
 * pristine model). Reuses the wreck palette (scorch/rust/bare metal) so the hero
 * visibly *becomes* the wrecks it has been dodging. Positions are in the car's
 * nose-forward (+z) space; the whole layer is flipped to travel-forward like the
 * body. Damage never touches handling — this is feedback, not a stat.
 */
function damageParts(tier: number): THREE.BufferGeometry[] {
  const P = palette;
  const parts: THREE.BufferGeometry[] = [];
  if (tier >= 1) {
    // First blood: a scorch smear seared across the hood, a crumpled-in dent in
    // the right front fender, and a crack splintering the windscreen.
    parts.push(tilted(0.82, 0.05, 1.0, P.wreckScorch, 0.13, -0.18, FLOOR_Y + 0.45, 1.12, 0.2));
    parts.push(part(0.3, 0.24, 0.52, P.wreckScorch, 0.86, FLOOR_Y + 0.2, 1.18));
    parts.push(tilted(0.74, 0.02, 0.16, P.carTrim, -0.62, 0.12, FLOOR_Y + 0.78, 0.23, 0.1));
  }
  if (tier >= 2) {
    // Heavier: a door sprung open on the left flank, a rear bumper corner torn
    // off down to bare frame, and scorch creeping up onto the roof.
    parts.push(
      paint(
        new THREE.BoxGeometry(0.1, 0.5, 0.92).rotateY(0.42).translate(-1.02, FLOOR_Y + 0.42, 0.04),
        P.carBodyDark,
        0.5,
      ),
    );
    parts.push(part(0.5, 0.2, 0.22, P.wheelHub, 0.6, FLOOR_Y + 0.06, -1.98));
    parts.push(part(0.92, 0.04, 0.92, P.wreckScorch, 0.08, FLOOR_Y + 1.12, -0.34));
  }
  if (tier >= 3) {
    // Critical: the hood sprung up off its latch over a scorched engine bay, and
    // a side window blown out — the car one crash from a wreck of its own.
    parts.push(tilted(1.32, 0.1, 0.82, P.wreckRust, -0.3, 0, FLOOR_Y + 0.64, 1.04));
    parts.push(part(1.02, 0.06, 0.52, P.wreckScorch, 0, FLOOR_Y + 0.52, 1.02));
    parts.push(part(0.06, 0.34, 0.9, P.wreckScorch, 0.66, FLOOR_Y + 0.82, -0.34));
  }
  return parts;
}

/**
 * Build the merged damage overlay for a severity `tier`, parented onto the car by
 * the view and swapped only when the hull crosses a threshold (never per frame),
 * so a worsening hull is one extra draw call that costs nothing in the steady
 * state. Returns `null` for a pristine hull (tier 0).
 */
export function buildDamageLayer(tier: number): THREE.Mesh | null {
  if (tier <= 0) return null;
  const parts = damageParts(tier);
  if (parts.length === 0) return null;
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge damage layer geometry');
  geo.rotateY(Math.PI); // match the car's nose-forward → travel-forward flip
  return new THREE.Mesh(geo, propMaterial);
}

/**
 * The roof-mounted gun, sized by weapon level: the barrel lengthens and thickens
 * with the tier and splits into twin barrels at the top end, so an upgraded gun
 * visibly reads as a bigger weapon (docs/DESIGN.md → Upgrades render on the car;
 * Pillar 2). Warm amber muzzle — the gun's signature colour, matching the HUD and
 * the ammo box.
 */
function gunParts(level: number): THREE.BufferGeometry[] {
  const P = palette;
  const y = FLOOR_Y + 1.16;
  const parts: THREE.BufferGeometry[] = [
    cyl(0.22, 0.1, P.carChrome, 'y', 0, FLOOR_Y + 0.98, 0.0, 0.4, 16), // turret ring it swivels on
    cyl(0.16, 0.16, P.carTrim, 'y', 0, FLOOR_Y + 1.06, 0.0, 0.4, 12), // pintle post
    taper(0.46, 0.3, 0.62, 0.34, 0.5, P.carTrim, 0, FLOOR_Y + 1.16, -0.12, 0.4), // receiver housing
    cyl(0.19, 0.5, P.ammoBox, 'x', 0, FLOOR_Y + 1.34, -0.22, 0.4, 16), // round drum magazine
    cyl(0.2, 0.08, P.ammoBand, 'x', 0, FLOOR_Y + 1.34, -0.22, 0.4, 16), // drum band
    ball(0.08, P.carChrome, 0, FLOOR_Y + 1.34, 0.06, 0.4, 8), // drum hub cap
  ];
  const len = 0.7 + level * 0.13;
  const girth = 0.07 + level * 0.014;
  const offsets = level >= 4 ? ([-0.11, 0.11] as const) : ([0] as const);
  for (const ox of offsets) {
    parts.push(cyl(girth + 0.04, 0.22, P.carTrim, 'z', ox, y, 0.18, 0.4, 12)); // barrel shroud / jacket
    parts.push(cyl(girth, len, P.carChrome, 'z', ox, y, 0.2 + len * 0.5, 0.4, 12)); // barrel
    parts.push(cone(girth + 0.06, girth + 0.02, 0.18, P.ammoBand, 'z', ox, y, 0.22 + len, 0.4, 12)); // muzzle brake
  }
  return parts;
}

/**
 * Build one merged mesh carrying every owned upgrade's bolt-on parts, or `null`
 * when nothing is installed. Merging keeps the whole garage build to a single
 * extra draw call no matter how many upgrades are worn (docs/ARCHITECTURE.md →
 * draw-call budget). The view disposes and replaces it whenever the loadout
 * changes between runs.
 */
export function buildUpgradeLayer(owned: ReadonlySet<UpgradeId>): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const id of owned) parts.push(...upgradeParts(id));
  // The gun bolt-on is composed once, sized by the highest gun tier owned, so a
  // multi-tier loadout shows one gun that has visibly grown.
  let gunLevel = 1;
  for (const id of GUN_UPGRADES) if (owned.has(id)) gunLevel += 1;
  if (gunLevel > 1) parts.push(...gunParts(gunLevel));
  if (parts.length === 0) return null;

  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge upgrade layer geometry');
  geo.rotateY(Math.PI); // match the car's nose-forward → travel-forward flip
  return new THREE.Mesh(geo, propMaterial);
}
