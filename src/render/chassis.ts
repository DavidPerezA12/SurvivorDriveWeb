import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, wheel, propMaterial, lightMaterial } from './materials';
import { palette } from './palette';
import { createCar } from './car';
import type { ChassisId } from '../content/chassis';
import { GUN_UPGRADES, type UpgradeId } from '../content/upgrades';

/**
 * The drivable chassis models (docs/DESIGN.md → chassis classes): the all-round
 * Survivor (the hero car in `car.ts`), the Wrecker Rig pickup, the Box Hauler
 * van, the Dune Buggy, and the Razor Coupe.
 *
 * Detail comes from silhouette and baked vertex-colour AO, not triangle count.
 * The kit below trades the flat box for tapered frustums (`taper`), round tube
 * and cone (`cyl`/`cone`), and wheel-arch eyebrows (`arch`). Each car is one body
 * draw call plus one self-lit lamp draw call under the unlit `lightMaterial`.
 *
 * Bolt-on upgrades (`buildUpgradeLayer`) use shared coordinate conventions plus
 * per-chassis anchors, so the gun, plating, tank and magnet sit right on each body.
 *
 * Like the hero, bodies are modelled nose-forward (+z) and flipped 180° so the
 * chase camera and the bolt-ons (also flipped) agree on travel (−z).
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
 * A box panel rotated about its own X axis, positioned, then AO-baked in that
 * order, so a sloped hood or raked screen is shaded from its final orientation.
 */
function wedge(w: number, h: number, d: number, color: number, rx: number, x: number, y: number, z: number, ao = 0.45): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z), color, ao);
}

/**
 * A frustum: a box whose top face is scaled in (and optionally slid in z), used
 * for tapered cabins, hoods and fenders. `computeVertexNormals`
 * after the vertex move keeps each face flat-shaded and lit from its true (now
 * sloped) orientation.
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

/** A round bar, pipe or drum laid along an axis. */
function cyl(radius: number, length: number, color: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, ao = 0.42, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return paint(g.translate(x, y, z), color, ao);
}

/** A tapered round form. */
function cone(rTop: number, rBot: number, length: number, color: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, ao = 0.45, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, length, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return paint(g.translate(x, y, z), color, ao);
}

/**
 * A round wheel-arch eyebrow: a half-torus spanning front-to-back over a wheel
 * (axle along X), to break the boxed-fender read.
 */
function arch(radius: number, tube: number, color: number, x: number, y: number, z: number, ao = 0.5): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(radius, tube, 6, 14, Math.PI);
  g.rotateY(Math.PI / 2); // ring plane XY → ZY, so the arc spans the wheel front-to-back
  return paint(g.translate(x, y, z), color, ao);
}

/**
 * Extrude a 2D side-profile `shape` (x = length, nose at +x; y = height) into a
 * smooth, bevel-edged body shell of `width`, oriented nose-forward (+z). Optional
 * greenhouse tuck scales width inward above `taperFromY` toward `taperTo`. One
 * continuous curved surface instead of stacked boxes, shared with the hero car
 * (src/render/car.ts → extrudeBody).
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

/**
 * A self-lit lamp panel: flat (no AO) so it stays bright under the unlit
 * `lightMaterial` even on a face turned from the sun. Optional `rx` tilt.
 */
function glow(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  return paint(g.translate(x, y, z), color, 0);
}

/** A round self-lit lamp. */
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
 * Optional `shiftY` translates all geometries vertically before merging.
 */
function assemble(body: THREE.BufferGeometry[], lights: THREE.BufferGeometry[], shiftY = 0): THREE.Group {
  const group = new THREE.Group();
  group.name = 'car';

  if (shiftY !== 0) {
    for (const g of body) g.translate(0, shiftY, 0);
    for (const g of lights) g.translate(0, shiftY, 0);
  }

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
 * Four wheels: a chunky tyre, a dished rim, a chrome hub, outer ring, spokes, and
 * lug nuts, readable from both faces. Off-road vehicles (rig and buggy) also get
 * alternating knobby tread blocks.
 */
function addWheels(
  parts: THREE.BufferGeometry[],
  radius: number,
  width: number,
  axleY: number,
  chassisId: ChassisId,
  rimColor: number = palette.wheelHub,
): void {
  const B = palette;
  const isOffRoad = chassisId === 'rig' || chassisId === 'buggy';

  for (const [x, z] of WHEELS) {
    const out = x > 0 ? 1 : -1;
    const faceX = x + out * (width / 2);

    // Chunky tyre cylinder.
    parts.push(wheel(radius, width, B.wheel).translate(x, axleY, z));

    // Alternating 3D knobby tread blocks for off-road tyres.
    if (isOffRoad) {
      const treadCount = 10;
      for (let i = 0; i < treadCount; i += 1) {
        const a = (i / treadCount) * Math.PI * 2;
        const w1 = new THREE.BoxGeometry(width * 0.45, 0.035, 0.08)
          .translate(out * (width * 0.22), radius, 0)
          .rotateX(a)
          .translate(x, axleY, z);
        const w2 = new THREE.BoxGeometry(width * 0.45, 0.035, 0.08)
          .translate(-out * (width * 0.22), radius, 0)
          .rotateX(a + Math.PI / treadCount)
          .translate(x, axleY, z);
        parts.push(paint(w1, B.wheel, 0.5));
        parts.push(paint(w2, B.wheel, 0.5));
      }
    }

    // Dark rim barrel.
    parts.push(wheel(radius * 0.64, width * 0.6, B.carGrille).translate(x, axleY, z));

    // Alloy rim face, recessed slightly inward.
    parts.push(cyl(radius * 0.58, 0.05, rimColor, 'x', faceX - out * 0.03, axleY, z, 0.5, 16));

    // Chrome outer lip ring, proud of the tyre edge and facing outboard.
    const lip = new THREE.TorusGeometry(radius * 0.59, 0.035, 6, 16)
      .rotateY(Math.PI / 2)
      .translate(faceX + out * 0.01, axleY, z);
    parts.push(paint(lip, B.carChrome, 0.5));

    // Five bright spokes sitting proud of the face.
    const spokeCount = 5;
    for (let i = 0; i < spokeCount; i += 1) {
      const a = (i / spokeCount) * Math.PI * 2;
      const sp = new THREE.BoxGeometry(0.045, radius * 0.58, 0.08);
      sp.translate(0, radius * 0.28, 0)
        .rotateX(a)
        .translate(faceX + out * 0.01, axleY, z);
      parts.push(paint(sp, B.carChrome, 0.4));
    }

    // Chrome center hub cap.
    parts.push(cyl(radius * 0.17, 0.06, B.carChrome, 'x', faceX + out * 0.02, axleY, z, 0.45, 10));

    // Five chrome lug nuts.
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const lx = faceX + out * 0.015;
      const ly = axleY + Math.cos(a) * radius * 0.13;
      const lz = z + Math.sin(a) * radius * 0.13;
      parts.push(cyl(0.022, 0.04, B.carChrome, 'x', lx, ly, lz, 0.45, 6));
    }
  }
}

/**
 * Wrecker Rig, an off-road pickup: a tapered cab, a sloped hood, round wheel-arch
 * flares over big knobby tyres, a tube roll bar with a round light-pod cluster,
 * twin exhaust stacks, a winch bull-bar, a junk-laden bed, mirrors, a snorkel and
 * a whip antenna.
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
  // Cab, hood and fenders as one extruded shell: rounded hood, raked windshield,
  // and domed cab roof. The open cargo bed drops to a low deck behind it.
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
  // bolted licence-plate box. This is the face the chase camera lives behind.
  parts.push(panel(1.2, 0.46, 0.05, dark, 0, FLOOR_Y + 0.3, -2.07)); // recessed channel
  parts.push(cyl(0.05, 0.8, B.carChrome, 'x', 0, FLOOR_Y + 0.42, -2.12, 0.4, 8)); // grab handle
  parts.push(panel(0.5, 0.22, 0.05, B.carTrim, 0, FLOOR_Y + 0.16, -2.12)); // plate housing
  parts.push(panel(0.44, 0.16, 0.04, B.carReverse, 0, FLOOR_Y + 0.16, -2.14)); // plate

  // Lamps: round headlight pods on the nose; framed bedside corner tail clusters
  // (a red brake / amber turn / white reverse stack sunk into a dark housing).
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.19, 0.1, B.carTrim, 'z', s * 0.62, FLOOR_Y + 0.46, 1.9, 0.4, 12));
    lights.push(glowCyl(0.15, 0.06, B.carHeadlight, 'z', s * 0.62, FLOOR_Y + 0.46, 1.97, 12));
    parts.push(panel(0.5, 0.74, 0.06, dark, s * 0.7, FLOOR_Y + 0.42, -2.08)); // housing
    lights.push(glow(0.4, 0.3, 0.12, B.carTaillight, s * 0.7, FLOOR_Y + 0.58, -2.13)); // brake
    lights.push(glow(0.4, 0.16, 0.12, B.carIndicator, s * 0.7, FLOOR_Y + 0.34, -2.13)); // turn
    lights.push(glow(0.4, 0.12, 0.12, B.carReverse, s * 0.7, FLOOR_Y + 0.16, -2.13)); // reverse
    for (const dy of [0.43, 0.25]) parts.push(panel(0.46, 0.03, 0.14, B.carTrim, s * 0.7, FLOOR_Y + dy, -2.14)); // dividers
  }

  // Hood stripes.
  parts.push(panel(0.08, 0.015, 0.5, rust, 0.22, FLOOR_Y + 0.95, 1.35));
  parts.push(panel(0.08, 0.015, 0.5, rust, -0.22, FLOOR_Y + 0.95, 1.35));

  // Windshield wipers.
  parts.push(cyl(0.012, 0.38, B.carTrim, 'x', 0.25, FLOOR_Y + 0.98, 0.88, 0.4, 5));
  parts.push(cyl(0.012, 0.38, B.carTrim, 'x', -0.25, FLOOR_Y + 0.98, 0.88, 0.4, 5));

  // Headlight grille guards and hook.
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.015, 0.38, B.carChrome, 'x', s * 0.62, FLOOR_Y + 0.49, 1.94, 0.4, 6));
    parts.push(cyl(0.015, 0.38, B.carChrome, 'x', s * 0.62, FLOOR_Y + 0.41, 1.94, 0.4, 6));
  }
  parts.push(cyl(0.035, 0.16, B.carChrome, 'y', 0, FLOOR_Y + 0.28, 2.06, 0.4, 8)); // hook

  // Strapped wooden crate in cargo bed.
  parts.push(panel(0.66, 0.48, 0.66, 0x6e5033, -0.42, FLOOR_Y + 0.74, -1.42));
  parts.push(panel(0.7, 0.05, 0.05, 0x4f3620, -0.42, FLOOR_Y + 0.96, -1.42));
  parts.push(panel(0.7, 0.05, 0.05, 0x4f3620, -0.42, FLOOR_Y + 0.52, -1.42));
  parts.push(cyl(0.02, 0.78, B.carTrim, 'y', -0.42, FLOOR_Y + 0.74, -1.2, 0.4, 6));

  addWheels(parts, 0.46, 0.4, AXLE_Y, 'rig');
  return assemble(parts, lights, 0.46 - 0.36);
}

/**
 * Box Hauler, an up-armoured box van: a riveted cargo box with a chamfered roof,
 * round corner posts, bolted plate, a faded hazard stripe, an armoured windshield
 * slit, round roof vents, a side ladder, a tube push-bar ram, mirrors and a side
 * exhaust.
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
  // The body is a tall extruded shell with a short rounded nose, a near-vertical
  // windshield and a long rounded-edge cargo box.
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

  // Lamps: round recessed headlights; surface-mounted tail-lamp boxes bolted to
  // the cargo doors (stacked red brake / amber turn / white reverse in a dark
  // housing), under a roof-level high-mount stop lamp.
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

  // Two sloped steel plow blades on the push bar.
  parts.push(wedge(0.72, 0.38, 0.08, plate, 0.45, 0.42, FLOOR_Y + 0.18, 2.12, 0.4));
  parts.push(wedge(0.72, 0.38, 0.08, plate, 0.45, -0.42, FLOOR_Y + 0.18, 2.12, 0.4));

  // Rivets on the side panels.
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.02, 0.04, dark, 'x', s * 1.02, FLOOR_Y + 1.4, 0.5, 0.4, 4));
    parts.push(cyl(0.02, 0.04, dark, 'x', s * 1.02, FLOOR_Y + 1.4, -0.5, 0.4, 4));
  }

  // Rear utility steps, tow ball hitch and backup camera pod.
  parts.push(cyl(0.04, 1.2, B.carChrome, 'x', 0, FLOOR_Y - 0.08, -2.14, 0.4, 8));
  parts.push(ball(0.06, B.carChrome, 0, FLOOR_Y + 0.14, -2.26, 0.4));
  parts.push(panel(0.12, 0.1, 0.1, dark, 0, FLOOR_Y + 1.28, -2.05));

  addWheels(parts, 0.42, 0.38, AXLE_Y, 'hauler');
  return assemble(parts, lights, 0.42 - 0.36);
}

/**
 * Dune Buggy, a skeletal desert hopper built almost entirely from round tube: a
 * bare floor pan, a full tube roll cage, tapered bucket seats, a raw rear engine
 * with round velocity stacks and curved header pipes, visible coilover springs, a
 * round light bar and big knobby tyres.
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

  // Lamps: small round nose lights; round tail lamps recessed in exposed tube
  // stone-guard rings, with a small central reverse.
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.14, 0.1, B.carTrim, 'z', s * 0.38, FLOOR_Y + 0.32, 1.66, 0.4, 10));
    lights.push(glowCyl(0.1, 0.06, B.carHeadlight, 'z', s * 0.38, FLOOR_Y + 0.32, 1.72, 10));
    const guard = new THREE.TorusGeometry(0.13, 0.025, 6, 12).translate(s * 0.42, FLOOR_Y + 0.4, -1.74);
    parts.push(paint(guard, B.carTrim, 0.4));
    lights.push(glowCyl(0.1, 0.07, B.carTaillight, 'z', s * 0.42, FLOOR_Y + 0.4, -1.79, 10));
    lights.push(glowCyl(0.045, 0.06, B.carReverse, 'z', s * 0.2, FLOOR_Y + 0.34, -1.78, 8));
  }

  // Steering wheel and dashboard console.
  parts.push(panel(1.0, 0.14, 0.22, B.buggyTub, 0, FLOOR_Y + 0.74, 0.25));
  parts.push(cyl(0.025, 0.32, B.carChrome, 'z', -0.3, FLOOR_Y + 0.62, 0.1, 0.4, 6));
  parts.push(paint(new THREE.TorusGeometry(0.14, 0.025, 6, 12).translate(-0.3, FLOOR_Y + 0.74, -0.05), B.carTrim, 0.4));

  // Radiator and cooling fans.
  parts.push(panel(0.74, 0.46, 0.08, B.carGrille, 0, FLOOR_Y + 0.66, -1.02));
  parts.push(cyl(0.2, 0.03, B.carTrim, 'z', -0.18, FLOOR_Y + 0.66, -0.98, 0.4, 8));
  parts.push(cyl(0.2, 0.03, B.carTrim, 'z', 0.18, FLOOR_Y + 0.66, -0.98, 0.4, 8));

  // Fire extinguisher.
  parts.push(cyl(0.08, 0.28, 0xbf2c24, 'y', 0.42, FLOOR_Y + 0.24, -0.1, 0.4, 8));
  parts.push(cyl(0.03, 0.06, B.carChrome, 'y', 0.42, FLOOR_Y + 0.4, -0.1, 0.4, 6));

  // Cockpit window safety nets.
  for (const s of [-1, 1] as const) {
    parts.push(cyl(0.02, 0.66, B.carTrim, 'y', s * 0.6, FLOOR_Y + 0.8, 0.0, 0.4, 4));
    parts.push(cyl(0.015, 0.5, B.carTrim, 'z', s * 0.6, FLOOR_Y + 0.7, 0.0, 0.4, 4));
    parts.push(cyl(0.015, 0.5, B.carTrim, 'z', s * 0.6, FLOOR_Y + 0.9, 0.0, 0.4, 4));
  }

  addWheels(parts, 0.52, 0.44, AXLE_Y, 'buggy', B.buggyFrameDark);
  return assemble(parts, lights, 0.52 - 0.36);
}

/**
 * Razor Coupe, a low street car: a tapered low body, a long sloped nose, a raked
 * screen into a tapered fastback roof, round wheel-arch eyebrows over low-profile
 * wheels, twin racing stripes, a hood vent, round side mirrors, a tall ducktail
 * wing, side exhausts and round dual tailpipes under a full-width tail bar.
 */
function buildCoupe(): THREE.Group {
  const B = palette;
  const body = B.coupeBody;
  const dark = B.coupeDark;
  const stripe = B.coupeStripe;
  const accent = B.coupeAccent;
  const parts: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];

  // Body: one smooth extruded side-profile (a low, long-nosed fastback) with a
  // glass greenhouse extrude, a roof cap, pillars and stripes over it.
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

  // Lamps: slim swept headlights low in the nose; a full-width LED-look tail bar
  // proud of a gloss-black backing panel, under a thin chrome lip, notched into
  // segments with amber turn caps at the ends and twin central reverses.
  parts.push(panel(1.78, 0.2, 0.06, B.coupeDark, 0, FLOOR_Y + 0.34, -2.07)); // gloss-black backing
  parts.push(panel(1.82, 0.04, 0.08, B.carChrome, 0, FLOOR_Y + 0.45, -2.08)); // chrome lip over the bar
  lights.push(glow(1.5, 0.11, 0.07, B.carTaillight, 0, FLOOR_Y + 0.34, -2.11));
  for (const nx of [-0.5, -0.2, 0.2, 0.5]) parts.push(panel(0.05, 0.16, 0.1, B.coupeDark, nx, FLOOR_Y + 0.34, -2.13)); // segment notches
  for (const s of [-1, 1] as const) {
    lights.push(glow(0.26, 0.11, 0.08, B.carIndicator, s * 0.66, FLOOR_Y + 0.34, -2.12)); // amber turn cap
    lights.push(glow(0.42, 0.09, 0.08, B.carHeadlight, s * 0.52, FLOOR_Y + 0.12, 2.0, 0.1));
    lights.push(glowCyl(0.05, 0.06, B.carReverse, 'z', s * 0.16, FLOOR_Y + 0.18, -2.06, 8));
  }

  // Front intercooler visible in nose bumper.
  parts.push(panel(0.68, 0.16, 0.1, B.carChrome, 0, FLOOR_Y + 0.1, 1.94, 0.4));
  parts.push(panel(0.02, 0.14, 0.04, B.carGrille, -0.2, FLOOR_Y + 0.1, 1.96));
  parts.push(panel(0.02, 0.14, 0.04, B.carGrille, 0.0, FLOOR_Y + 0.1, 1.96));
  parts.push(panel(0.02, 0.14, 0.04, B.carGrille, 0.2, FLOOR_Y + 0.1, 1.96));

  // Windshield wipers at base of raked window.
  parts.push(cyl(0.012, 0.42, B.carTrim, 'x', 0.22, FLOOR_Y + 0.9, 0.55, 0.4, 4));
  parts.push(cyl(0.012, 0.42, B.carTrim, 'x', -0.22, FLOOR_Y + 0.9, 0.55, 0.4, 4));

  // Wing endplates on the GT ducktail wing.
  parts.push(panel(0.04, 0.16, 0.34, B.coupeDark, 0.88, FLOOR_Y + 0.54, -1.86));
  parts.push(panel(0.04, 0.16, 0.34, B.coupeDark, -0.88, FLOOR_Y + 0.54, -1.86));

  addWheels(parts, 0.4, 0.34, AXLE_Y, 'coupe', B.carChrome);
  return assemble(parts, lights, 0.4 - 0.36);
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

function ball(radius: number, color: number, x: number, y: number, z: number, ao = 0.4, seg = 12): THREE.BufferGeometry {
  return paint(new THREE.SphereGeometry(radius, seg, Math.max(6, seg - 4)).translate(x, y, z), color, ao);
}

/** Build the custom bolt-on upgrade parts for any non-survivor chassis. */
export function buildChassisUpgradeParts(owned: ReadonlySet<UpgradeId>, id: ChassisId): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const B = palette;

  let wheelRadius = 0.36;
  let wheelWidth = 0.32;
  const wheels: readonly [number, number][] = WHEELS;
  const axleY = AXLE_Y;

  const tankCenter = new THREE.Vector3(0, FLOOR_Y + 0.84, -1.12);
  let tankAxis: 'x' | 'y' | 'z' = 'z';
  const magnetCenter = new THREE.Vector3(0, FLOOR_Y + 0.34, 2.12);
  const gunCenter = new THREE.Vector3(0, FLOOR_Y + 0.98, 0.0);

  if (id === 'rig') {
    wheelRadius = 0.46;
    wheelWidth = 0.4;
    tankCenter.set(0, FLOOR_Y + 0.68, -1.12);
    tankAxis = 'x';
    magnetCenter.set(0, FLOOR_Y + 0.34, 2.12);
    gunCenter.set(0, FLOOR_Y + 1.66, -0.5);
  } else if (id === 'hauler') {
    wheelRadius = 0.42;
    wheelWidth = 0.38;
    tankCenter.set(0, 1.98, -1.6);
    tankAxis = 'z';
    magnetCenter.set(0, FLOOR_Y + 0.34, 2.16);
    gunCenter.set(0, 1.98, -0.6);
  } else if (id === 'buggy') {
    wheelRadius = 0.52;
    wheelWidth = 0.44;
    tankCenter.set(0, FLOOR_Y + 0.74, -0.74);
    tankAxis = 'y';
    magnetCenter.set(0, FLOOR_Y + 0.36, 1.95);
    gunCenter.set(0, FLOOR_Y + 1.34, -0.3);
  } else if (id === 'coupe') {
    wheelRadius = 0.4;
    wheelWidth = 0.34;
    tankCenter.set(0, FLOOR_Y + 0.62, -1.34);
    tankAxis = 'z';
    magnetCenter.set(0, FLOOR_Y + 0.16, 2.12);
    gunCenter.set(0, 1.3, -0.32);
  }

  for (const upId of owned) {
    switch (upId) {
      case 'reinforcedPlating': {
        if (id === 'rig') {
          parts.push(wedge(0.4, 0.08, 0.9, B.rigChassisRust, 0.1, 0.62, FLOOR_Y + 0.92, 1.45));
          parts.push(wedge(0.4, 0.08, 0.9, B.rigChassisRust, 0.1, -0.62, FLOOR_Y + 0.92, 1.45));
          parts.push(cyl(0.04, 0.62, B.carChrome, 'y', 0.46, FLOOR_Y + 1.22, 0.95));
          parts.push(cyl(0.04, 0.62, B.carChrome, 'y', -0.46, FLOOR_Y + 1.22, 0.95));
          parts.push(cyl(0.04, 1.0, B.carChrome, 'x', 0, FLOOR_Y + 1.22, 0.95));
          parts.push(panel(0.08, 0.52, 1.6, B.rigChassisRust, 0.96, FLOOR_Y + 0.64, -1.42));
          parts.push(panel(0.08, 0.52, 1.6, B.rigChassisRust, -0.96, FLOOR_Y + 0.64, -1.42));
        } else if (id === 'hauler') {
          parts.push(wedge(1.4, 0.06, 0.62, B.haulerPlate, 0.22, 0, FLOOR_Y + 1.22, 0.88));
          parts.push(panel(0.08, 0.94, 0.84, B.haulerPlate, 1.02, FLOOR_Y + 0.86, 0.9));
          parts.push(panel(0.08, 0.94, 0.84, B.haulerPlate, -1.02, FLOOR_Y + 0.86, 0.9));
        } else if (id === 'buggy') {
          parts.push(panel(0.06, 0.46, 1.2, B.buggyTub, 0.62, FLOOR_Y + 0.34, 0.4));
          parts.push(panel(0.06, 0.46, 1.2, B.buggyTub, -0.62, FLOOR_Y + 0.34, 0.4));
          parts.push(taper(0.8, 0.1, 0.6, 0.5, 0.5, B.buggyFrame, 0, FLOOR_Y + 0.36, 1.34));
        } else if (id === 'coupe') {
          parts.push(panel(0.16, 0.06, 2.5, B.coupeDark, 0.88, FLOOR_Y - 0.08, -0.1));
          parts.push(panel(0.16, 0.06, 2.5, B.coupeDark, -0.88, FLOOR_Y - 0.08, -0.1));
          parts.push(taper(0.8, 0.04, 0.8, 0.6, 0.7, B.coupeDark, 0, FLOOR_Y + 0.46, 0.95));
        }
        break;
      }
      case 'stickyTires': {
        for (const [sx, sz] of wheels) {
          parts.push(wheel(wheelRadius + 0.06, wheelWidth + 0.08, B.wheel).translate(sx, axleY, sz));
        }
        break;
      }
      case 'hydraulicJump': {
        for (const [sx, sz] of wheels) {
          const x = sx * (id === 'buggy' ? 0.66 : 0.76);
          const r = id === 'buggy' ? 0.12 : 0.11;
          const len = id === 'buggy' ? 0.38 : 0.32;
          parts.push(cyl(0.05, len + 0.08, B.carChrome, 'y', x, FLOOR_Y + 0.08, sz));
          parts.push(cyl(r, len, B.wreckStripe, 'y', x, FLOOR_Y + 0.02, sz));
          parts.push(ball(0.07, B.carChrome, x, FLOOR_Y + 0.28, sz));
        }
        break;
      }
      case 'liftTank': {
        if (tankAxis === 'x') {
          parts.push(cyl(0.28, 1.2, B.liftToken, 'x', tankCenter.x, tankCenter.y, tankCenter.z, 0.42, 16));
          parts.push(ball(0.28, B.liftTokenDark, tankCenter.x + 0.6, tankCenter.y, tankCenter.z, 0.4, 14));
          parts.push(ball(0.28, B.liftTokenDark, tankCenter.x - 0.6, tankCenter.y, tankCenter.z, 0.4, 14));
          parts.push(cyl(0.31, 0.08, B.carTrim, 'x', tankCenter.x + 0.3, tankCenter.y, tankCenter.z, 0.4, 16));
          parts.push(cyl(0.31, 0.08, B.carTrim, 'x', tankCenter.x - 0.3, tankCenter.y, tankCenter.z, 0.4, 16));
        } else if (tankAxis === 'y') {
          parts.push(cyl(0.24, 0.88, B.liftToken, 'y', tankCenter.x, tankCenter.y, tankCenter.z, 0.42, 16));
          parts.push(ball(0.24, B.liftTokenDark, tankCenter.x, tankCenter.y + 0.44, tankCenter.z, 0.4, 14));
          parts.push(ball(0.24, B.liftTokenDark, tankCenter.x, tankCenter.y - 0.44, tankCenter.z, 0.4, 14));
          parts.push(cyl(0.27, 0.08, B.carTrim, 'y', tankCenter.x, tankCenter.y + 0.12, tankCenter.z, 0.4, 16));
        } else {
          parts.push(cyl(0.24, 0.95, B.liftToken, 'z', tankCenter.x, tankCenter.y, tankCenter.z, 0.42, 16));
          parts.push(ball(0.24, B.liftTokenDark, tankCenter.x, tankCenter.y, tankCenter.z + 0.48, 0.4, 14));
          parts.push(ball(0.24, B.liftTokenDark, tankCenter.x, tankCenter.y, tankCenter.z - 0.48, 0.4, 14));
          parts.push(cyl(0.27, 0.08, B.carTrim, 'z', tankCenter.x, tankCenter.y, tankCenter.z + 0.24, 0.4, 16));
        }
        break;
      }
      case 'scrapMagnet': {
        const R = 0.27;
        const mx = magnetCenter.x;
        const my = magnetCenter.y;
        const mz = magnetCenter.z;
        parts.push(cyl(0.07, 0.42, B.carChrome, 'z', mx, my, mz - 0.2, 0.4, 10));
        const horseshoe = new THREE.TorusGeometry(R, 0.09, 8, 18, Math.PI).translate(mx, my + 0.08, mz);
        parts.push(paint(horseshoe, B.scrapPing, 0.4));
        parts.push(cyl(0.09, 0.26, B.scrapPing, 'y', mx - R, my - 0.06, mz, 0.4, 10));
        parts.push(cyl(0.09, 0.26, B.scrapPing, 'y', mx + R, my - 0.06, mz, 0.4, 10));
        parts.push(ball(0.09, B.carReverse, mx - R, my - 0.19, mz, 0.4, 10));
        parts.push(ball(0.09, B.carReverse, mx + R, my - 0.19, mz, 0.4, 10));
        break;
      }
    }
  }

  let gunLevel = 1;
  for (const upId of GUN_UPGRADES) if (owned.has(upId)) gunLevel += 1;
  if (gunLevel > 1) {
    const gx = gunCenter.x;
    const gy = gunCenter.y;
    const gz = gunCenter.z;

    // Chassis-specific gun mount brackets / turret hatches.
    if (id === 'rig') {
      parts.push(panel(0.64, 0.04, 0.4, B.carTrim, gx, gy - 0.04, gz));
    } else if (id === 'hauler') {
      parts.push(cyl(0.46, 0.04, B.haulerDark, 'y', gx, gy - 0.04, gz, 0.4, 16));
    } else if (id === 'buggy') {
      parts.push(panel(0.5, 0.04, 0.4, B.buggyFrameDark, gx, gy - 0.04, gz));
    } else if (id === 'coupe') {
      parts.push(panel(0.04, 0.04, 0.8, B.coupeDark, gx - 0.3, gy - 0.04, gz));
      parts.push(panel(0.04, 0.04, 0.8, B.coupeDark, gx + 0.3, gy - 0.04, gz));
      parts.push(panel(0.64, 0.04, 0.34, B.carGrille, gx, gy - 0.02, gz));
    }

    // Base turret mechanism.
    parts.push(cyl(0.22, 0.08, B.carChrome, 'y', gx, gy, gz, 0.4, 16));
    parts.push(cyl(0.16, 0.14, B.carTrim, 'y', gx, gy + 0.08, gz, 0.4, 12));
    parts.push(taper(0.46, 0.3, 0.62, 0.34, 0.5, B.carTrim, gx, gy + 0.18, gz - 0.12, 0.4));

    // Round drum magazine and ammo feed chute.
    parts.push(cyl(0.19, 0.5, B.ammoBox, 'x', gx, gy + 0.36, gz - 0.22, 0.4, 16));
    parts.push(cyl(0.2, 0.08, B.ammoBand, 'x', gx, gy + 0.36, gz - 0.22, 0.4, 16));
    parts.push(ball(0.08, B.carChrome, gx, gy + 0.36, gz + 0.06, 0.4, 8));
    parts.push(panel(0.1, 0.12, 0.14, B.ammoBand, gx, gy + 0.24, gz - 0.18)); // ammo feed chute

    // Charging handle on the side of the receiver.
    parts.push(cyl(0.02, 0.12, B.carChrome, 'x', gx + 0.22, gy + 0.22, gz - 0.06, 0.4, 6));
    parts.push(ball(0.03, B.carTrim, gx + 0.28, gy + 0.22, gz - 0.06, 0.4, 6));

    // Weapon barrels based on level.
    const len = 0.7 + gunLevel * 0.13;
    const girth = 0.07 + gunLevel * 0.014;
    const offsets = gunLevel >= 4 ? ([-0.11, 0.11] as const) : ([0] as const);
    for (const ox of offsets) {
      parts.push(cyl(girth + 0.04, 0.22, B.carTrim, 'z', gx + ox, gy + 0.18, gz + 0.18, 0.4, 12));
      parts.push(cyl(girth, len, B.carChrome, 'z', gx + ox, gy + 0.18, gz + 0.2 + len * 0.5, 0.4, 12));
      parts.push(cone(girth + 0.06, girth + 0.02, 0.18, B.ammoBand, 'z', gx + ox, gy + 0.18, gz + 0.22 + len, 0.4, 12));
    }
  }

  return parts;
}

/** Build the custom battle-damage parts for any non-survivor chassis. */
export function buildChassisDamageParts(tier: number, id: ChassisId): THREE.BufferGeometry[] {
  const B = palette;
  const parts: THREE.BufferGeometry[] = [];

  if (id === 'rig') {
    if (tier >= 1) {
      parts.push(wedge(0.4, 0.05, 0.6, B.wreckScorch, 0.1, 0.5, FLOOR_Y + 0.88, 1.45, 0.2));
      parts.push(panel(0.2, 0.1, 0.2, B.wreckScorch, -0.74, FLOOR_Y + 0.36, 1.96));
    }
    if (tier >= 2) {
      parts.push(panel(0.8, 0.3, 0.08, B.wreckRust, 0, FLOOR_Y + 0.3, -2.08));
      parts.push(panel(0.08, 0.3, 1.2, B.wreckScorch, -0.86, FLOOR_Y + 0.64, -1.42));
    }
    if (tier >= 3) {
      parts.push(panel(0.08, 0.3, 0.7, B.wreckGlass, 0.83, 1.32, 0.12));
      parts.push(wedge(1.8, 0.08, 1.2, B.wreckRust, -0.2, 0, FLOOR_Y + 1.0, 1.2, 0.3));
    }
  } else if (id === 'hauler') {
    if (tier >= 1) {
      parts.push(cyl(0.12, 0.5, B.wreckScorch, 'y', 0.62, FLOOR_Y + 0.2, 2.1, 0.3));
      parts.push(panel(0.4, 0.2, 0.1, B.wreckScorch, 0, FLOOR_Y + 0.26, 2.05));
    }
    if (tier >= 2) {
      parts.push(panel(0.06, 0.4, 0.08, B.wreckRust, 0.95, FLOOR_Y + 0.5, 0.0));
      parts.push(cyl(0.045, 0.48, B.wreckScorch, 'x', 1.02, FLOOR_Y + 0.74, -1.82));
    }
    if (tier >= 3) {
      parts.push(panel(1.2, 0.5, 0.08, B.wreckGlass, 0, FLOOR_Y + 0.92, 1.02));
      parts.push(paint(new THREE.BoxGeometry(0.08, 0.84, 0.72).rotateY(0.3).translate(-1.02, FLOOR_Y + 0.86, 0.4), B.wreckRust, 0.4));
    }
  } else if (id === 'buggy') {
    if (tier >= 1) {
      parts.push(wedge(0.8, 0.06, 0.6, B.wreckScorch, 0.35, 0, FLOOR_Y - 0.08, 1.25, 0.2));
      parts.push(panel(0.4, 0.3, 0.4, B.wreckScorch, 0, FLOOR_Y + 0.42, -1.38));
    }
    if (tier >= 2) {
      parts.push(taper(0.8, 0.26, 0.7, 0.4, 0.4, B.wreckRust, 0, FLOOR_Y + 0.24, 1.3, 0.4));
      parts.push(cyl(0.08, 1.18, B.wreckScorch, 'z', 0.62, FLOOR_Y + 1.22, -0.2));
    }
    if (tier >= 3) {
      parts.push(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8).rotateX(0.9).translate(-0.6, FLOOR_Y + 0.6, -1.05), B.wreckRust, 0.4));
      parts.push(paint(new THREE.BoxGeometry(0.44, 0.16, 0.5).rotateY(0.25).translate(0.32, FLOOR_Y + 0.24, 0.05), B.wreckRust, 0.4));
    }
  } else if (id === 'coupe') {
    if (tier >= 1) {
      parts.push(panel(1.5, 0.05, 0.3, B.wreckScorch, 0, FLOOR_Y - 0.08, 2.06));
      parts.push(panel(0.4, 0.04, 0.4, B.wreckScorch, 0, FLOOR_Y + 0.4, 0.95));
    }
    if (tier >= 2) {
      parts.push(cyl(0.02, 1.8, B.wreckRust, 'z', -0.92, FLOOR_Y + 0.18, 0.0));
      parts.push(panel(0.08, 0.28, 0.1, B.wreckScorch, 0.62, FLOOR_Y + 0.32, -1.84));
    }
    if (tier >= 3) {
      parts.push(paint(new THREE.BoxGeometry(1.5, 0.38, 0.1).rotateX(0.5).translate(0, 1.05, -0.96), B.wreckGlass, 0.3));
      parts.push(wedge(1.6, 0.06, 1.0, B.wreckRust, -0.22, 0, FLOOR_Y + 0.65, 0.9, 0.4));
      parts.push(cone(0.1, 0.04, 0.2, B.wreckScorch, 'z', -0.5, FLOOR_Y - 0.06, -2.1));
    }
  }

  return parts;
}
