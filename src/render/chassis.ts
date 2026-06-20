import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, wheel, propMaterial, lightMaterial } from './materials';
import { palette } from './palette';
import { createCar } from './car';
import type { ChassisId } from '../content/chassis';

/**
 * The drivable chassis models (docs/DESIGN.md → chassis classes). Five distinct
 * low-poly silhouettes so the roster reads apart at a glance — the all-round
 * Survivor (the authored hero car in `car.ts`), the brute Wrecker Rig pickup,
 * the armoured Box Hauler van, the skeletal Dune Buggy, and the low Razor Coupe.
 * They are the survivor-apocalypse cousins of the classic driver-game roster:
 * the muscle car, the off-road pickup, the box truck, the desert buggy and the
 * street coupe.
 *
 * Craft bar (docs/DESIGN.md → Object craft): the read is bought with **rounded
 * and tapered form, not a stack of cubes**. Beyond the flat box, the kit below
 * adds tapered frustums (`taper` — narrower-topped cabins, hoods, fenders),
 * round tube and pipe (`cyl`/`cone` — roll cages, bumpers, exhausts, light
 * pods), and round wheel-arch eyebrows (`arch`), so no surface reads as a raw
 * Minecraft block. Detail still comes from silhouette + baked vertex-colour AO,
 * never raw triangle count, and each car is one body draw call plus one self-lit
 * lamp draw call so the lights actually *glow* in shadow (docs/DESIGN.md → Juice
 * as information) instead of going muddy as opaque boxes.
 *
 * Bolt-on upgrades (`buildUpgradeLayer`) share the Survivor's axle/floor heights
 * and wheel track, so the gun, plating, tank and magnet sit right on any body.
 *
 * Like the hero, the bodies are modelled nose-forward (+z) and flipped 180° so
 * the chase camera and the bolt-ons (also flipped) all agree on travel (−z).
 */

const AXLE_Y = 0.36;
const FLOOR_Y = 0.5;
const WHEELS: readonly [number, number][] = [
  [-1.0, 1.4],
  [1.0, 1.4],
  [-1.0, -1.4],
  [1.0, -1.4],
];

/** A positioned, AO-baked box panel (tops bright, undersides dark). */
function panel(w: number, h: number, d: number, color: number, x: number, y: number, z: number, ao = 0.4): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color, ao);
}

/**
 * A box panel rotated about its own X axis, positioned, then AO-baked — in that
 * order, so a sloped hood or raked screen is shaded from its *final* orientation
 * and catches the light like the form it is.
 */
function wedge(w: number, h: number, d: number, color: number, rx: number, x: number, y: number, z: number, ao = 0.45): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z), color, ao);
}

/**
 * A frustum: a box whose top face is scaled in (and optionally slid in z), so a
 * cabin, hood or fender tapers instead of reading as a cube — the single biggest
 * lever against the blocky look. `computeVertexNormals` after the vertex move
 * keeps each face flat-shaded and lit from its true (now sloped) orientation.
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

/** A round bar/pipe/drum laid along an axis — the kit's antidote to square edges. */
function cyl(radius: number, length: number, color: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, ao = 0.42, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return paint(g.translate(x, y, z), color, ao);
}

/** A tapered round form — nose cones, velocity stacks, exhaust tips. */
function cone(rTop: number, rBot: number, length: number, color: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, ao = 0.45, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, length, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return paint(g.translate(x, y, z), color, ao);
}

/**
 * A round wheel-arch eyebrow — a half-torus spanning front-to-back over a wheel
 * (axle along X). Hugging each tyre with a curve is what most decisively kills
 * the boxed-fender read on a low-poly car.
 */
function arch(radius: number, tube: number, color: number, x: number, y: number, z: number, ao = 0.5): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(radius, tube, 6, 14, Math.PI);
  g.rotateY(Math.PI / 2); // ring plane XY → ZY, so the arc spans the wheel front-to-back
  return paint(g.translate(x, y, z), color, ao);
}

/**
 * Extrude a 2D side-profile `shape` (x = length, nose at +x; y = height) into a
 * smooth, bevel-edged body shell of `width`, oriented nose-forward (+z). Optional
 * greenhouse tuck scales width inward above `taperFromY` toward `taperTo`. This is
 * the real-bodywork move — one continuous curved surface instead of stacked
 * boxes — shared with the hero car (src/render/car.ts → extrudeBody).
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
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
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

/** A self-lit lamp panel — flat (no AO) so it glows full-bright under the unlit
 *  `lightMaterial` even on a face turned from the sun. Optional `rx` tilt. */
function glow(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  return paint(g.translate(x, y, z), color, 0);
}

/** A round self-lit lamp — pod headlights, light-bar spots, round tail lamps. */
function glowCyl(radius: number, length: number, color: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return paint(g.translate(x, y, z), color, 0);
}

/**
 * Merge body parts (lit) + lamp parts (self-lit) into a named car group of two
 * meshes, each flipped to face travel (−z) like the hero car. Two draw calls per
 * chassis, no matter how detailed the silhouette.
 */
function assemble(body: THREE.BufferGeometry[], lights: THREE.BufferGeometry[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'car';
  // Normalise to non-indexed so extruded shells (non-indexed) merge with the
  // box/cyl parts (indexed); mergeGeometries refuses to mix the two.
  const bodyGeo = mergeGeometries(body.map((g) => g.toNonIndexed()), false);
  for (const p of body) p.dispose();
  if (bodyGeo) {
    bodyGeo.rotateY(Math.PI);
    group.add(new THREE.Mesh(bodyGeo, propMaterial));
  }
  if (lights.length > 0) {
    const lightGeo = mergeGeometries(lights, false);
    for (const p of lights) p.dispose();
    if (lightGeo) {
      lightGeo.rotateY(Math.PI);
      group.add(new THREE.Mesh(lightGeo, lightMaterial));
    }
  }
  return group;
}

/**
 * Four wheels: a chunky tyre, a contrasting dished rim, a chrome hub and four
 * spokes — round and detailed, readable from both faces. A round arch eyebrow is
 * added by each builder over the tyre.
 */
function addWheels(parts: THREE.BufferGeometry[], radius: number, width: number, rim: number = palette.wheelHub): void {
  for (const [x, z] of WHEELS) {
    const out = x > 0 ? 1 : -1;
    parts.push(wheel(radius, width, palette.wheel).translate(x, AXLE_Y, z));
    parts.push(wheel(radius * 0.58, width + 0.04, rim).translate(x, AXLE_Y, z));
    parts.push(cyl(radius * 0.16, 0.06, palette.carChrome, 'x', x + out * (width / 2 + 0.02), AXLE_Y, z)); // hub cap
    for (const a of [0, Math.PI / 2]) {
      const g = new THREE.BoxGeometry(0.05, radius * 0.9, 0.05).rotateX(a);
      parts.push(paint(g.translate(x + out * (width / 2 + 0.01), AXLE_Y, z), rim, 0.4)); // spokes
    }
  }
}

/**
 * Wrecker Rig — a brute off-road pickup: a tapered cab, a sloped hood, round
 * wheel-arch flares over big knobby tyres, a tube roll bar with a round light
 * pod cluster, twin exhaust stacks, a winch bull-bar, a junk-laden bed, mirrors,
 * a snorkel and a whip antenna. The bruiser of the roster.
 */
function buildRig(): THREE.Group {
  const B = palette;
  const body = B.rigChassisBody;
  const dark = B.rigChassisDark;
  const bed = B.rigChassisBed;
  const rust = B.rigChassisRust;
  const parts: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];

  // Dark ladder-frame rocker + round axle tubes the lifted body sits on.
  parts.push(panel(1.66, 0.22, 3.9, B.carTrim, 0, FLOOR_Y - 0.06, 0));
  for (const z of [1.4, -1.4] as const) parts.push(cyl(0.1, 2.0, dark, 'x', 0, AXLE_Y, z, 0.5, 8));
  // The cab + hood + fenders: ONE extruded shell — a rounded hood, a raked
  // windshield, a domed cab roof — with the open cargo bed dropping to a low deck
  // behind it (its walls/floor added as panels). Real truck bodywork, not boxes.
  const shell = new THREE.Shape();
  shell.moveTo(2.05, 0.36);
  shell.lineTo(2.05, 0.72);
  shell.quadraticCurveTo(2.04, 0.86, 1.9, 0.9); // round hood nose
  shell.lineTo(1.45, 0.94); // flat hood
  shell.quadraticCurveTo(1.18, 0.98, 1.05, 1.08); // hood to windshield
  shell.lineTo(0.86, 1.52); // raked windshield
  shell.quadraticCurveTo(0.82, 1.63, 0.66, 1.65); // domed cab roof front
  shell.lineTo(-0.2, 1.63); // cab roof
  shell.quadraticCurveTo(-0.34, 1.61, -0.42, 1.42); // roof rear
  shell.lineTo(-0.52, 1.02); // rear cab wall down to the bed deck
  shell.lineTo(-2.02, 0.98); // bed-side top (open bed sits above this)
  shell.lineTo(-2.05, 0.94);
  shell.lineTo(-2.05, 0.36); // tailgate face
  shell.lineTo(-1.86, 0.32);
  shell.lineTo(-1.62, 0.32);
  shell.quadraticCurveTo(-1.42, 0.74, -1.1, 0.34); // rear arch
  shell.lineTo(1.1, 0.34); // rocker
  shell.quadraticCurveTo(1.42, 0.74, 1.7, 0.32); // front arch
  shell.lineTo(1.88, 0.32);
  shell.lineTo(2.05, 0.36);
  parts.push(extrudeBody(shell, 1.9, body, 0.36, 1.2, 0.86));
  parts.push(panel(1.46, 0.1, 1.1, dark, 0, 1.66, 0.22)); // cab roof cap
  parts.push(panel(0.5, 0.1, 0.6, dark, 0, 1.0, 0.95)); // hood scoop
  // Raked windshield + cab side glass + a door line and handle down the flank.
  parts.push(wedge(1.4, 0.5, 0.08, B.carGlass, -0.3, 0, 1.32, 0.94));
  for (const s of [-1, 1] as const) {
    parts.push(panel(0.08, 0.4, 0.92, B.carGlass, s * 0.83, 1.32, 0.12));
    parts.push(panel(0.04, 0.46, 1.1, dark, s * 0.95, FLOOR_Y + 0.5, 0.0)); // door seam
    parts.push(panel(0.12, 0.06, 0.06, B.carChrome, s * 0.97, FLOOR_Y + 0.56, 0.32)); // handle
  }
  // Snorkel up the right A-pillar, and a whip antenna.
  parts.push(cyl(0.07, 0.9, dark, 'y', 0.86, FLOOR_Y + 0.95, 0.7, 0.5, 8));
  parts.push(cone(0.12, 0.07, 0.18, dark, 'y', 0.86, FLOOR_Y + 1.46, 0.7, 0.5, 8));
  parts.push(cyl(0.02, 0.8, B.carTrim, 'y', -0.8, FLOOR_Y + 1.4, 0.5, 0.4, 5));
  // Tube roll bar arching behind the cab, with a round light-pod cluster.
  for (const s of [-1, 1] as const) parts.push(cyl(0.07, 0.66, B.carChrome, 'y', s * 0.72, FLOOR_Y + 1.34, -0.5, 0.4, 8));
  parts.push(cyl(0.07, 1.56, B.carChrome, 'x', 0, FLOOR_Y + 1.62, -0.5, 0.4, 8));
  for (const lx of [-0.5, -0.17, 0.17, 0.5]) {
    parts.push(cyl(0.11, 0.14, B.carTrim, 'z', lx, FLOOR_Y + 1.55, -0.4, 0.4, 10));
    lights.push(glowCyl(0.09, 0.06, B.carHeadlight, 'z', lx, FLOOR_Y + 1.55, -0.32, 10));
  }
  // Twin chrome exhaust stacks rising behind the cab.
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.08, 0.95, B.carChrome, 'y', s * 0.84, FLOOR_Y + 1.18, -0.46, 0.4, 10));
    parts.push(cyl(0.1, 0.1, B.carTrim, 'y', s * 0.84, FLOOR_Y + 1.66, -0.46, 0.4, 10)); // rain cap
  }
  // Open cargo bed: ribbed liner floor, side walls, tailgate, headboard.
  parts.push(panel(1.72, 0.12, 1.72, bed, 0, FLOOR_Y + 0.5, -1.42));
  parts.push(panel(1.78, 0.46, 0.14, dark, 0, FLOOR_Y + 0.66, -0.6));
  for (const s of [-1, 1] as const) parts.push(panel(0.14, 0.44, 1.74, body, s * 0.86, FLOOR_Y + 0.64, -1.42));
  parts.push(panel(1.78, 0.5, 0.14, bed, 0, FLOOR_Y + 0.66, -2.07));
  for (const rz of [-1.0, -1.4, -1.8]) parts.push(panel(1.6, 0.04, 0.06, dark, 0, FLOOR_Y + 0.57, rz)); // bed ribs
  // Bed cargo: a strapped spare on its side + two round-capped jerry cans.
  parts.push(cyl(0.34, 0.24, B.wheel, 'y', 0.42, FLOOR_Y + 0.7, -1.5, 0.4));
  parts.push(cyl(0.16, 0.26, B.wheelHub, 'y', 0.42, FLOOR_Y + 0.7, -1.5, 0.4));
  for (const cz of [-1.1, -1.7]) {
    parts.push(panel(0.32, 0.42, 0.34, rust, -0.5, FLOOR_Y + 0.72, cz));
    parts.push(cyl(0.05, 0.1, B.carChrome, 'y', -0.5, FLOOR_Y + 0.97, cz, 0.4, 8)); // spout
  }
  // Winch bull-bar: a round tube hoop, angled guards, a drum winch, recessed grille.
  parts.push(cyl(0.1, 1.9, B.carChrome, 'x', 0, FLOOR_Y + 0.16, 2.0, 0.4, 10));
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.07, 0.66, B.carChrome, 'y', s * 0.72, FLOOR_Y + 0.3, 2.02, 0.4, 8));
    parts.push(panel(0.2, 0.18, 0.1, dark, s * 0.74, FLOOR_Y + 0.36, 1.96)); // mirror arm/back
  }
  parts.push(cyl(0.16, 0.5, dark, 'x', 0, FLOOR_Y + 0.42, 1.96, 0.4, 10)); // winch drum
  parts.push(taper(0.92, 0.34, 0.12, 0.78, 0.12, B.carGrille, 0, FLOOR_Y + 0.42, 1.9, 0.5));
  for (const gx of [-0.3, -0.1, 0.1, 0.3]) parts.push(panel(0.05, 0.28, 0.06, B.carChrome, gx, FLOOR_Y + 0.42, 1.94));
  // Rear step bumper (round) + tow hitch.
  parts.push(cyl(0.1, 1.86, B.carChrome, 'x', 0, FLOOR_Y + 0.04, -2.12, 0.4, 10));
  parts.push(cyl(0.05, 0.2, B.carTrim, 'z', 0, FLOOR_Y + 0.06, -2.24, 0.4, 8));
  // Round arch flares over the knobby tyres + mud flaps.
  for (const [sx, sz] of WHEELS) {
    parts.push(arch(0.56, 0.09, dark, sx * 1.02, AXLE_Y + 0.02, sz, 0.5));
    if (sz < 0) parts.push(panel(0.34, 0.34, 0.04, B.carTrim, sx * 1.0, AXLE_Y - 0.16, sz - 0.5));
  }

  // Tailgate face detail: a pressed centre channel, a chrome grab handle, and a
  // bolted licence-plate box — the back of the truck reads as a real tailgate,
  // the face the chase camera lives behind.
  parts.push(panel(1.2, 0.46, 0.05, dark, 0, FLOOR_Y + 0.3, -2.07)); // recessed channel
  parts.push(cyl(0.05, 0.8, B.carChrome, 'x', 0, FLOOR_Y + 0.42, -2.12, 0.4, 8)); // grab handle
  parts.push(panel(0.5, 0.22, 0.05, B.carTrim, 0, FLOOR_Y + 0.16, -2.12)); // plate housing
  parts.push(panel(0.44, 0.16, 0.04, B.carReverse, 0, FLOOR_Y + 0.16, -2.14)); // plate

  // ----- Lamps. Round headlight pods on the nose; framed bedside corner tail
  // clusters — a red brake / amber turn / white reverse stack sunk into a dark
  // housing, the real truck tail-lamp, not a flat slab. -----
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.19, 0.1, B.carTrim, 'z', s * 0.62, FLOOR_Y + 0.46, 1.9, 0.4, 12));
    lights.push(glowCyl(0.15, 0.06, B.carHeadlight, 'z', s * 0.62, FLOOR_Y + 0.46, 1.97, 12));
    parts.push(panel(0.5, 0.74, 0.06, dark, s * 0.7, FLOOR_Y + 0.42, -2.08)); // housing
    lights.push(glow(0.4, 0.3, 0.12, B.carTaillight, s * 0.7, FLOOR_Y + 0.58, -2.13)); // brake
    lights.push(glow(0.4, 0.16, 0.12, B.carIndicator, s * 0.7, FLOOR_Y + 0.34, -2.13)); // turn
    lights.push(glow(0.4, 0.12, 0.12, B.carReverse, s * 0.7, FLOOR_Y + 0.16, -2.13)); // reverse
    for (const dy of [0.43, 0.25]) parts.push(panel(0.46, 0.03, 0.14, B.carTrim, s * 0.7, FLOOR_Y + dy, -2.14)); // dividers
  }

  addWheels(parts, 0.46, 0.4);
  return assemble(parts, lights);
}

/**
 * Box Hauler — an up-armoured box van: a riveted cargo box with a chamfered roof,
 * round corner posts, bolted plate, a faded hazard stripe, an armoured windshield
 * slit, round roof vents, a side ladder, a tube push-bar ram, mirrors and a side
 * exhaust. The rolling bunker of the roster.
 */
function buildHauler(): THREE.Group {
  const B = palette;
  const body = B.haulerBody;
  const dark = B.haulerDark;
  const plate = B.haulerPlate;
  const stripe = B.haulerStripe;
  const parts: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];

  parts.push(panel(1.86, 0.16, 2.6, B.carTrim, 0, FLOOR_Y - 0.1, -0.1)); // rocker sill
  // The body: ONE tall extruded shell — a short rounded nose, a near-vertical
  // windshield and a long rounded-edge cargo box — instead of a raw cube.
  const shell = new THREE.Shape();
  shell.moveTo(2.05, 0.34);
  shell.lineTo(2.05, 0.62);
  shell.quadraticCurveTo(2.04, 0.74, 1.92, 0.78); // round nose
  shell.lineTo(1.55, 0.8); // short hood
  shell.quadraticCurveTo(1.25, 0.84, 1.12, 1.04); // hood up to windshield
  shell.lineTo(0.95, 1.74); // near-vertical windshield
  shell.quadraticCurveTo(0.9, 1.9, 0.72, 1.93); // round roof front
  shell.lineTo(-1.92, 1.91); // long roof
  shell.quadraticCurveTo(-2.05, 1.86, -2.05, 1.64); // round roof rear
  shell.lineTo(-2.05, 0.34); // rear doors
  shell.lineTo(-1.86, 0.3);
  shell.lineTo(-1.62, 0.3);
  shell.quadraticCurveTo(-1.42, 0.68, -1.12, 0.32); // rear arch
  shell.lineTo(1.12, 0.32); // rocker
  shell.quadraticCurveTo(1.42, 0.68, 1.7, 0.3); // front arch
  shell.lineTo(1.86, 0.3);
  shell.lineTo(2.05, 0.34);
  parts.push(extrudeBody(shell, 2.0, body, 0.36, 1.55, 0.94));
  parts.push(panel(1.92, 0.1, 2.7, dark, 0, 1.94, -0.6)); // roof rim cap
  for (const s of [-1, 1] as const) {
    for (const z of [0.96, -1.96] as const) parts.push(cyl(0.09, 1.32, plate, 'y', s * 0.98, FLOOR_Y + 0.7, z, 0.45, 8));
    parts.push(panel(0.05, 0.2, 2.9, stripe, s * 1.02, FLOOR_Y + 0.62, -0.5));
  }
  // Bolted armour plates proud of the flanks, with round rivet studs.
  for (const s of [-1, 1] as const) {
    for (const pz of [0.4, -0.5, -1.4]) {
      parts.push(panel(0.06, 0.84, 0.72, plate, s * 1.02, FLOOR_Y + 0.86, pz));
      for (const ry of [0.5, 1.18]) {
        for (const rz of [-0.28, 0.28]) parts.push(cyl(0.045, 0.05, dark, 'x', s * 1.06, FLOOR_Y + ry, pz + rz, 0.4, 6));
      }
    }
  }
  // Round roof vents + a roof beacon.
  for (const vz of [0.0, -1.0] as const) parts.push(cyl(0.26, 0.16, dark, 'y', 0, 1.96, vz, 0.4, 10));
  lights.push(glowCyl(0.16, 0.12, B.carIndicator, 'y', 0, 2.0, 0.4, 10));
  // Armoured near-vertical windshield under a sloped brow plate; narrow side slits.
  parts.push(panel(1.5, 0.66, 0.1, B.carGlass, 0, FLOOR_Y + 0.92, 1.0));
  parts.push(wedge(1.66, 0.14, 0.42, plate, 0.22, 0, FLOOR_Y + 1.28, 0.9));
  for (const s of [-1, 1] as const) {
    parts.push(panel(0.08, 0.28, 0.66, B.carGlass, s * 0.99, FLOOR_Y + 0.98, 0.42));
    parts.push(cyl(0.05, 0.22, dark, 'x', s * 1.04, FLOOR_Y + 1.0, 0.96, 0.4, 6)); // mirror arm
    parts.push(panel(0.12, 0.18, 0.1, plate, s * 1.12, FLOOR_Y + 1.0, 0.96)); // mirror head
  }
  // Rear cargo doors with a centre seam, hinges and twin handles.
  parts.push(panel(1.94, 1.14, 0.1, dark, 0, FLOOR_Y + 0.72, -2.02));
  parts.push(panel(0.1, 1.14, 0.14, plate, 0, FLOOR_Y + 0.72, -2.0));
  for (const s of [-1, 1] as const) {
    parts.push(panel(0.12, 0.4, 0.14, B.carChrome, s * 0.26, FLOOR_Y + 0.6, -2.05));
    for (const hy of [1.04, 0.44, -0.16]) parts.push(cyl(0.05, 0.12, plate, 'z', s * 0.84, FLOOR_Y + hy, -2.04, 0.4, 6));
  }
  // Round side ladder rungs on the rear flank.
  for (const ly of [0.4, 0.74, 1.08, 1.34]) parts.push(cyl(0.04, 0.5, B.carChrome, 'x', 1.02, FLOOR_Y + ly, -1.85, 0.4, 6));
  // Side exhaust pipe running under the left flank.
  parts.push(cyl(0.08, 1.6, B.carTrim, 'z', -0.92, FLOOR_Y - 0.18, -0.4, 0.4, 8));
  parts.push(cone(0.11, 0.08, 0.16, B.carChrome, 'z', -0.92, FLOOR_Y - 0.18, -1.28, 0.4, 8));
  // Front push-bar ram: a round tube frame with vertical bars.
  parts.push(cyl(0.1, 1.94, B.carChrome, 'x', 0, FLOOR_Y + 0.34, 2.08, 0.4, 10));
  parts.push(cyl(0.1, 1.94, B.carChrome, 'x', 0, FLOOR_Y + 0.06, 2.08, 0.4, 10));
  for (const bx of [-0.62, -0.2, 0.2, 0.62]) parts.push(cyl(0.06, 0.42, B.carChrome, 'y', bx, FLOOR_Y + 0.2, 2.08, 0.4, 8));
  // Rear bumper.
  parts.push(cyl(0.1, 1.9, B.carChrome, 'x', 0, FLOOR_Y + 0.04, -2.12, 0.4, 10));
  // Round arch flares over the tyres + mud flaps.
  for (const [sx, sz] of WHEELS) {
    parts.push(arch(0.52, 0.09, dark, sx * 1.02, AXLE_Y + 0.02, sz, 0.5));
    if (sz < 0) parts.push(panel(0.32, 0.32, 0.04, B.carTrim, sx * 1.0, AXLE_Y - 0.14, sz - 0.46));
  }

  // ----- Lamps. Round recessed headlights; surface-mounted tail-lamp boxes bolted
  // to the cargo doors — a stacked red brake / amber turn / white reverse cluster
  // in a dark housing (the trucking look) under a roof-level high-mount stop lamp. -----
  lights.push(glow(0.7, 0.06, 0.1, B.carTaillight, 0, FLOOR_Y + 1.16, -2.06)); // high-mount stop lamp
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.2, 0.1, B.carTrim, 'z', s * 0.66, FLOOR_Y + 0.26, 2.03, 0.4, 12));
    lights.push(glowCyl(0.15, 0.06, B.carHeadlight, 'z', s * 0.66, FLOOR_Y + 0.26, 2.09, 12));
    parts.push(panel(0.34, 0.72, 0.1, dark, s * 0.74, FLOOR_Y + 0.48, -2.06)); // lamp box
    lights.push(glow(0.26, 0.32, 0.12, B.carTaillight, s * 0.74, FLOOR_Y + 0.62, -2.12)); // brake
    lights.push(glow(0.26, 0.14, 0.12, B.carIndicator, s * 0.74, FLOOR_Y + 0.4, -2.12)); // turn
    lights.push(glow(0.26, 0.12, 0.12, B.carReverse, s * 0.74, FLOOR_Y + 0.24, -2.12)); // reverse
    for (const dy of [0.47, 0.31]) parts.push(panel(0.3, 0.03, 0.14, B.carTrim, s * 0.74, FLOOR_Y + dy, -2.13)); // dividers
  }

  addWheels(parts, 0.42, 0.38);
  return assemble(parts, lights);
}

/**
 * Dune Buggy — a skeletal desert hopper, built almost entirely from round tube:
 * a bare floor pan, a full tube roll cage, tapered bucket seats, a raw rear
 * engine with round velocity stacks and curved header pipes, visible coilover
 * springs, a round light bar and big knobby tyres. The featherweight flyer.
 */
function buildBuggy(): THREE.Group {
  const B = palette;
  const frame = B.buggyFrame;
  const dframe = B.buggyFrameDark;
  const tub = B.buggyTub;
  const engine = B.buggyEngine;
  const parts: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];

  // Bare floor pan + round frame rails — no body panels to hide behind.
  parts.push(panel(1.3, 0.16, 3.1, tub, 0, FLOOR_Y - 0.04, 0));
  for (const s of [-1, 1] as const) parts.push(cyl(0.07, 3.0, dframe, 'z', s * 0.5, FLOOR_Y + 0.06, 0, 0.4, 8));
  for (const z of [1.4, -1.4] as const) parts.push(cyl(0.08, 1.4, dframe, 'x', 0, AXLE_Y, z, 0.5, 8)); // axle tubes
  // Round nose cone tapering to a tip + a skid plate.
  parts.push(taper(1.14, 0.3, 0.9, 0.5, 0.5, tub, 0, FLOOR_Y + 0.24, 1.3, 0.4, -0.1));
  parts.push(cone(0.16, 0.32, 0.5, frame, 'z', 0, FLOOR_Y + 0.28, 1.85, 0.45, 10));
  parts.push(wedge(0.9, 0.05, 0.7, dframe, 0.3, 0, FLOOR_Y - 0.08, 1.2));
  // Tapered bucket seats with raked backs.
  for (const s of [-1, 1] as const) {
    parts.push(panel(0.44, 0.16, 0.5, tub, s * 0.32, FLOOR_Y + 0.18, 0.05));
    parts.push(wedge(0.42, 0.5, 0.14, tub, -0.2, s * 0.32, FLOOR_Y + 0.42, -0.2));
  }
  // Full round tube roll cage: four uprights, roof hoop, raked A-hoop, rear braces.
  for (const [ux, uz, uh] of [
    [-0.6, 0.36, 0.92],
    [0.6, 0.36, 0.92],
    [-0.6, -0.74, 0.84],
    [0.6, -0.74, 0.84],
  ] as const) {
    parts.push(cyl(0.07, uh, frame, 'y', ux, FLOOR_Y + 0.34 + uh / 2, uz, 0.4, 8));
  }
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.07, 1.18, frame, 'z', s * 0.6, FLOOR_Y + 1.24, -0.2, 0.35, 8)); // roof rails
    parts.push(cyl(0.06, 0.7, dframe, 'z', s * 0.6, FLOOR_Y + 0.8, -1.05, 0.4, 8)); // rear down-braces
    // Raked front A-pillar tubes running from the windscreen hoop up to the roof.
    parts.push(paint(new THREE.CylinderGeometry(0.07, 0.07, 0.92, 8).rotateX(0.6).translate(s * 0.6, FLOOR_Y + 0.92, 0.5), frame, 0.4));
  }
  parts.push(cyl(0.07, 1.32, frame, 'x', 0, FLOOR_Y + 1.3, -0.78, 0.35, 8)); // roof cross hoop
  parts.push(cyl(0.07, 1.32, frame, 'x', 0, FLOOR_Y + 1.05, 0.62, 0.35, 8)); // windscreen hoop top
  // Round light bar across the front of the cage.
  parts.push(cyl(0.06, 1.2, B.carTrim, 'x', 0, FLOOR_Y + 1.32, 0.2, 0.4, 8));
  for (const lx of [-0.42, -0.14, 0.14, 0.42]) {
    parts.push(cyl(0.1, 0.12, B.carTrim, 'z', lx, FLOOR_Y + 1.32, 0.26, 0.4, 10));
    lights.push(glowCyl(0.08, 0.06, B.carHeadlight, 'z', lx, FLOOR_Y + 1.32, 0.33, 10));
  }
  // Raw rear engine: a block, four round velocity stacks, curved header pipes.
  parts.push(taper(0.94, 0.5, 0.74, 0.78, 0.6, engine, 0, FLOOR_Y + 0.42, -1.38));
  for (const tx of [-0.27, -0.09, 0.09, 0.27]) {
    parts.push(cyl(0.06, 0.2, B.carChrome, 'y', tx, FLOOR_Y + 0.76, -1.38, 0.4, 8));
    parts.push(cone(0.09, 0.06, 0.06, B.carChrome, 'y', tx, FLOOR_Y + 0.88, -1.38, 0.4, 8)); // trumpet mouth
  }
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.06, 0.5, B.carChrome, 'z', s * 0.42, FLOOR_Y + 0.3, -1.75, 0.4, 8));
    parts.push(cone(0.09, 0.06, 0.12, B.carChrome, 'z', s * 0.42, FLOOR_Y + 0.3, -2.02, 0.4, 8)); // tip
  }
  // Visible coilover spring + shock at each corner.
  for (const [sx, sz] of WHEELS) {
    parts.push(cyl(0.09, 0.34, B.carChrome, 'y', sx * 0.66, FLOOR_Y + 0.08, sz, 0.4, 8));
    parts.push(cyl(0.04, 0.4, B.carTrim, 'y', sx * 0.66, FLOOR_Y + 0.12, sz, 0.4, 6));
    parts.push(arch(0.58, 0.06, dframe, sx * 1.0, AXLE_Y + 0.02, sz, 0.5));
  }

  // ----- Lamps. Small round nose lights; round tail lamps recessed in exposed
  // tube stone-guard rings, with a small central reverse — the off-road read. -----
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.14, 0.1, B.carTrim, 'z', s * 0.38, FLOOR_Y + 0.32, 1.66, 0.4, 10));
    lights.push(glowCyl(0.1, 0.06, B.carHeadlight, 'z', s * 0.38, FLOOR_Y + 0.32, 1.72, 10));
    const guard = new THREE.TorusGeometry(0.13, 0.025, 6, 12).translate(s * 0.42, FLOOR_Y + 0.4, -1.74);
    parts.push(paint(guard, B.carTrim, 0.4));
    lights.push(glowCyl(0.1, 0.07, B.carTaillight, 'z', s * 0.42, FLOOR_Y + 0.4, -1.79, 10));
    lights.push(glowCyl(0.045, 0.06, B.carReverse, 'z', s * 0.2, FLOOR_Y + 0.34, -1.78, 8));
  }

  addWheels(parts, 0.52, 0.44, B.buggyFrameDark);
  return assemble(parts, lights);
}

/**
 * Razor Coupe — a low street-sweeper: a tapered low body, a long sloped nose, a
 * raked screen into a tapered fastback roof, round wheel-arch eyebrows over
 * low-profile wheels, twin racing stripes, a hood vent, round side mirrors, a
 * tall ducktail wing, side exhausts and round dual tailpipes under a full-width
 * tail bar. The knife-edge of the roster.
 */
function buildCoupe(): THREE.Group {
  const B = palette;
  const body = B.coupeBody;
  const dark = B.coupeDark;
  const stripe = B.coupeStripe;
  const accent = B.coupeAccent;
  const parts: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];

  // ----- Body: one smooth extruded side-profile — a low, long-nosed fastback —
  // with a glass greenhouse extrude, a roof cap, pillars and stripes over it. -----
  const lower = new THREE.Shape();
  lower.moveTo(2.05, 0.3);
  lower.lineTo(2.05, 0.5);
  lower.quadraticCurveTo(2.04, 0.62, 1.86, 0.66); // round nose
  lower.lineTo(1.35, 0.74); // long low hood
  lower.quadraticCurveTo(0.85, 0.8, 0.6, 0.86); // hood to cowl
  lower.lineTo(-1.12, 0.84); // low beltline
  lower.lineTo(-1.62, 0.8); // rear haunch / deck
  lower.quadraticCurveTo(-2.05, 0.76, -2.05, 0.56); // round tail
  lower.lineTo(-2.05, 0.3);
  lower.lineTo(-1.86, 0.28);
  lower.lineTo(-1.56, 0.28);
  lower.quadraticCurveTo(-1.4, 0.68, -1.1, 0.3); // rear arch
  lower.lineTo(1.1, 0.3); // rocker
  lower.quadraticCurveTo(1.4, 0.68, 1.68, 0.28); // front arch
  lower.lineTo(1.86, 0.28);
  lower.lineTo(2.05, 0.3);
  parts.push(extrudeBody(lower, 1.82, body, 0.34));
  parts.push(panel(1.74, 0.1, 2.4, B.carTrim, 0, FLOOR_Y - 0.12, -0.1)); // rocker sill
  parts.push(panel(1.9, 0.06, 0.42, dark, 0, FLOOR_Y - 0.08, 2.04)); // front splitter
  parts.push(panel(0.5, 0.05, 0.5, dark, 0, FLOOR_Y + 0.4, 0.95)); // hood vent

  const cabin = new THREE.Shape();
  cabin.moveTo(0.58, 0.86);
  cabin.quadraticCurveTo(0.3, 1.12, -0.02, 1.24); // raked screen
  cabin.quadraticCurveTo(-0.22, 1.27, -0.52, 1.23); // low roof
  cabin.quadraticCurveTo(-0.86, 1.18, -1.04, 0.96); // fastback
  cabin.lineTo(-1.14, 0.86); // deck
  cabin.lineTo(0.58, 0.86);
  parts.push(extrudeBody(cabin, 1.5, B.carGlass, 0.3, 1.04, 0.82));

  // Roof cap, slim A/C pillars and twin stripes over the glasshouse.
  parts.push(taper(1.12, 0.08, 1.0, 0.92, 0.86, body, 0, 1.26, -0.32));
  for (const sx of [-0.17, 0.17]) parts.push(panel(0.1, 0.04, 0.86, stripe, sx, 1.31, -0.3));
  for (const s of [-1, 1] as const) {
    parts.push(wedge(0.07, 0.52, 0.08, body, -0.6, s * 0.58, 1.05, 0.32)); // A-pillar
    parts.push(wedge(0.07, 0.46, 0.08, body, 0.55, s * 0.55, 1.02, -0.96)); // C-pillar
    parts.push(cyl(0.012, 2.4, accent, 'z', s * 0.92, FLOOR_Y + 0.18, 0.0, 0.4, 5)); // side accent line
  }
  // Round side mirrors on slim stalks.
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.04, 0.16, dark, 'x', s * 0.86, FLOOR_Y + 0.4, 0.55, 0.4, 6));
    parts.push(panel(0.13, 0.11, 0.08, dark, s * 0.96, FLOOR_Y + 0.42, 0.55));
  }
  // Tall ducktail wing on twin uprights.
  for (const s of [-1, 1] as const) parts.push(panel(0.08, 0.28, 0.14, dark, s * 0.62, FLOOR_Y + 0.36, -1.84));
  parts.push(wedge(1.74, 0.06, 0.4, dark, -0.12, 0, FLOOR_Y + 0.5, -1.86));
  // Round side exhaust pipes exiting ahead of the rear wheels.
  for (const s of [-1, 1] as const) parts.push(cyl(0.07, 0.74, B.carChrome, 'z', s * 0.92, FLOOR_Y + 0.02, -0.5, 0.4, 8));
  // Rear fascia + a vented diffuser; round dual tailpipes poke out below.
  parts.push(panel(1.84, 0.34, 0.2, body, 0, FLOOR_Y + 0.2, -1.98));
  parts.push(panel(1.3, 0.2, 0.12, B.carGrille, 0, FLOOR_Y + 0.02, -2.04));
  for (const fx of [-0.4, -0.13, 0.13, 0.4]) parts.push(panel(0.06, 0.18, 0.16, B.carChrome, fx, FLOOR_Y + 0.02, -2.07));
  for (const s of [-1, 1] as const) parts.push(cone(0.1, 0.09, 0.2, B.carChrome, 'z', s * 0.5, FLOOR_Y - 0.06, -2.12, 0.4, 10));
  // Round arch eyebrows over the low-profile wheels.
  for (const [sx, sz] of WHEELS) parts.push(arch(0.46, 0.07, dark, sx * 1.0, AXLE_Y + 0.02, sz, 0.5));

  // ----- Lamps. Slim swept headlights low in the nose; a full-width LED-look tail
  // bar proud of a gloss-black backing panel, under a thin chrome lip, notched
  // into segments with amber turn caps at the ends and twin central reverses —
  // the modern light-bar read instead of one flat neon slab. -----
  parts.push(panel(1.78, 0.2, 0.06, B.coupeDark, 0, FLOOR_Y + 0.34, -2.07)); // gloss-black backing
  parts.push(panel(1.82, 0.04, 0.08, B.carChrome, 0, FLOOR_Y + 0.45, -2.08)); // chrome lip over the bar
  lights.push(glow(1.5, 0.11, 0.07, B.carTaillight, 0, FLOOR_Y + 0.34, -2.11));
  for (const nx of [-0.5, -0.2, 0.2, 0.5]) parts.push(panel(0.05, 0.16, 0.1, B.coupeDark, nx, FLOOR_Y + 0.34, -2.13)); // segment notches
  for (const s of [-1, 1] as const) {
    lights.push(glow(0.26, 0.11, 0.08, B.carIndicator, s * 0.66, FLOOR_Y + 0.34, -2.12)); // amber turn cap
    lights.push(glow(0.42, 0.09, 0.08, B.carHeadlight, s * 0.52, FLOOR_Y + 0.12, 2.0, 0.1));
    lights.push(glowCyl(0.05, 0.06, B.carReverse, 'z', s * 0.16, FLOOR_Y + 0.18, -2.06, 8));
  }

  addWheels(parts, 0.4, 0.34, B.carChrome);
  return assemble(parts, lights);
}

/** Build the model for a chassis. Survivor reuses the authored hero car. */
export function createChassis(id: ChassisId): THREE.Group {
  switch (id) {
    case 'rig':
      return buildRig();
    case 'hauler':
      return buildHauler();
    case 'buggy':
      return buildBuggy();
    case 'coupe':
      return buildCoupe();
    case 'survivor':
    default:
      return createCar();
  }
}
