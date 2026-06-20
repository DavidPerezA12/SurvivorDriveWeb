import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, paint, silhouetteMaterial } from './materials';
import { palette } from './palette';
import { LOOKAHEAD } from '../content/tuning';
import { actBlendAt, ACTS } from './mood';

/**
 * The distant backdrop the road drives through — and it is a different world, and
 * a different *apocalypse*, in every act. Rust drives past mesas and dead trees;
 * Swarm reaches the city outskirts; Visitors threads downtown canyons under a sky
 * full of saucers dropping abduction beams; Colossus is all skyline with giant
 * mechs and kaiju stomping the horizon; Static is fractured wreckage. The
 * silhouettes a band draws are chosen by the current act, and across a transition
 * the object *kinds* crossfade slot by slot, so the scenery itself rebuilds into
 * the next catastrophe as you cross over (docs/DESIGN.md → Run structure; the act
 * table — Visitors' UFO strafes, Colossus' "The Big One walks").
 *
 * Pure render-side dressing: it never gates the lane, so it lives entirely here
 * and only reads `distance` (+ `dt` for the hover bob). Like the road it streams
 * against the car and recycles by wrapping distance into a grid of slots; a slot's
 * look — kind, offset, scale, yaw, lean, elevation, whether it's there — is a pure
 * function of its absolute index and the seed, so it never flickers and the
 * per-frame path allocates nothing. One `InstancedMesh` per silhouette kind keeps
 * it a few draw calls even mid-transition; idle kinds are parked invisible. The
 * set-piece glow (UFO ring, mech reactor, kaiju maw) is baked bright into vertex
 * color so the unlit silhouette material renders it as light (docs/ARCHITECTURE.md
 * → Instancing, allocation discipline; docs/DESIGN.md → self-lit read).
 */

const TWO_PI = Math.PI * 2;

type SilKind =
  | 'mesa'
  | 'snag'
  | 'pylon'
  | 'warehouse'
  | 'cityBlock'
  | 'skyscraper'
  | 'rubble'
  | 'spire'
  | 'saucer'
  | 'mecha'
  | 'kaiju'
  | 'debris'
  | 'scrub'
  | 'mountain'
  | 'lowrise'
  | 'house'
  | 'watertower'
  | 'billboard'
  | 'downedSaucer'
  | 'brokenTower'
  | 'floatChunk'
  | 'mesa2'
  | 'house2'
  | 'warehouse2'
  | 'cityBlock2'
  | 'skyscraper2'
  | 'huskWreck'
  | 'barrels'
  | 'container'
  | 'crystal';

const KINDS: readonly SilKind[] = [
  'mesa',
  'snag',
  'pylon',
  'warehouse',
  'cityBlock',
  'skyscraper',
  'rubble',
  'spire',
  'saucer',
  'mecha',
  'kaiju',
  'debris',
  'scrub',
  'mountain',
  'lowrise',
  'house',
  'watertower',
  'billboard',
  'downedSaucer',
  'brokenTower',
  'floatChunk',
  'mesa2',
  'house2',
  'warehouse2',
  'cityBlock2',
  'skyscraper2',
  'huskWreck',
  'barrels',
  'container',
  'crystal',
];

/** Per-kind instance capacity — comfortably above the slots routed to one kind
 *  (a kind like `rubble` can be drawn by the near and mid bands at once). */
const CAP = 48;
/** Hover bob radians per second, for flyers. */
const BOB_SPEED = 1.1;

/**
 * Per-kind metadata: how high it floats (flyers), and whether it may be stretched
 * non-uniformly. `stretch` is the cheap antidote to "every building is the same
 * model": one geometry, but each instance gets independent width/height/depth, so
 * a skyscraper reads as a hundred different towers. Set-pieces and anything whose
 * proportions are the read (UFO, mech, kaiju, pylon) keep `stretch: false`.
 */
interface KindMeta {
  readonly elevation: number;
  readonly bob: number;
  readonly elevJitter: number;
  readonly stretch: boolean;
}
const GROUNDED: KindMeta = { elevation: 0, bob: 0, elevJitter: 0, stretch: false };
const STRETCH: KindMeta = { elevation: 0, bob: 0, elevJitter: 0, stretch: true };
const KIND_META: Record<SilKind, KindMeta> = {
  mesa: STRETCH,
  snag: GROUNDED,
  pylon: GROUNDED,
  warehouse: STRETCH,
  cityBlock: STRETCH,
  skyscraper: STRETCH,
  rubble: STRETCH,
  spire: GROUNDED,
  saucer: { elevation: 34, bob: 2.4, elevJitter: 16, stretch: false },
  mecha: GROUNDED,
  kaiju: GROUNDED,
  debris: STRETCH,
  scrub: GROUNDED,
  mountain: STRETCH,
  lowrise: STRETCH,
  house: STRETCH,
  watertower: GROUNDED,
  billboard: GROUNDED,
  downedSaucer: GROUNDED,
  brokenTower: STRETCH,
  floatChunk: { elevation: 22, bob: 1.5, elevJitter: 12, stretch: true },
  mesa2: STRETCH,
  house2: STRETCH,
  warehouse2: STRETCH,
  cityBlock2: STRETCH,
  skyscraper2: STRETCH,
  huskWreck: GROUNDED,
  barrels: GROUNDED,
  container: STRETCH,
  crystal: GROUNDED,
};

/** A placement band: where slots sit, independent of which kind fills them. */
interface Band {
  readonly spacing: number;
  readonly reach: number;
  readonly xMin: number;
  readonly xMax: number;
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly skip: number;
  readonly jitterZ: number;
  readonly lean: number;
  readonly salt: number;
}

const FAR: Band = {
  spacing: 56,
  reach: LOOKAHEAD,
  // A middle distance: close enough that the skyline hugs the road and the gap to
  // the horizon never reads as empty, but far enough off the sightline that tall
  // buildings *frame* the corridor instead of planting themselves on the road (a
  // near slab at the vanishing point reads as "on the road" — the tallest kinds
  // are routed to the sparser, farther ACCENT band for the same reason).
  xMin: 62,
  xMax: 128,
  scaleMin: 0.85,
  scaleMax: 1.32,
  skip: 0.13,
  jitterZ: 22,
  lean: 0,
  salt: 0,
};

const MID: Band = {
  spacing: 15,
  reach: LOOKAHEAD * 0.85,
  xMin: 17,
  xMax: 40,
  scaleMin: 0.8,
  scaleMax: 1.3,
  skip: 0.22,
  jitterZ: 10,
  lean: 0.18,
  salt: 1000,
};

// Low clutter crowding the shoulder: junk, dead scrub, fallen ruins right by the
// road, so the band between the guardrail and the skyline never reads as bare.
const NEAR: Band = {
  spacing: 10,
  reach: LOOKAHEAD * 0.62,
  xMin: 10,
  xMax: 22,
  scaleMin: 0.65,
  scaleMax: 1.15,
  skip: 0.18,
  jitterZ: 5,
  lean: 0.28,
  salt: 3000,
};

// Sparse, big landmarks: a lone pylon, a tower over the canyon, a stomping giant.
const ACCENT: Band = {
  spacing: 132,
  reach: LOOKAHEAD,
  xMin: 80,
  xMax: 142,
  scaleMin: 0.95,
  scaleMax: 1.34,
  skip: 0.4,
  jitterZ: 30,
  lean: 0.1,
  salt: 2000,
};

type Role = 'near' | 'mid' | 'far' | 'accent';

/** Which silhouette kinds each band may draw, per act (one is picked per slot). */
const ACT_SILHOUETTES: Record<Role, readonly SilKind[]>[] = [
  // I Outbreak — day one: a real, lit city you're driving out of as it goes mad.
  // Storefronts and low blocks crowd the shoulder, a full skyline of towers and
  // water tanks rises close behind (their lit windows read as "power's still on"),
  // and the first stalled cars and toppled drums litter the near band.
  {
    near: ['huskWreck', 'debris', 'barrels', 'container', 'scrub'],
    mid: ['house', 'house2', 'lowrise', 'billboard', 'container'],
    far: ['cityBlock', 'cityBlock2', 'lowrise', 'watertower', 'billboard'],
    accent: ['skyscraper', 'skyscraper2', 'cityBlock2', 'watertower', 'billboard'],
  },
  // II Rust — wasteland suburbia: dead trees, abandoned houses, a water tower,
  // mesas and distant mountains.
  {
    near: ['scrub', 'debris', 'snag', 'huskWreck', 'barrels'],
    mid: ['snag', 'rubble', 'house', 'house2', 'huskWreck'],
    far: ['mesa', 'mesa2', 'house', 'house2', 'mountain', 'watertower'],
    accent: ['pylon', 'mountain', 'watertower'],
  },
  // III Swarm — city outskirts: warehouses, silos, low blocks, highway billboards,
  // dumped containers and drums along the shoulder.
  {
    near: ['debris', 'rubble', 'huskWreck', 'barrels', 'container'],
    mid: ['snag', 'rubble', 'billboard', 'house2', 'container'],
    far: ['warehouse', 'warehouse2', 'lowrise', 'cityBlock', 'billboard', 'watertower'],
    accent: ['pylon', 'cityBlock', 'cityBlock2', 'billboard'],
  },
  // IV Visitors — downtown canyons under an invasion sky, wrecks and alien
  // crystal growing up through the road.
  {
    near: ['debris', 'rubble', 'crystal', 'container'],
    mid: ['rubble', 'snag', 'downedSaucer', 'crystal'],
    far: ['cityBlock', 'cityBlock2', 'lowrise', 'saucer', 'brokenTower'],
    accent: ['saucer', 'skyscraper', 'skyscraper2', 'downedSaucer'],
  },
  // V Colossus — skyline with giants, towers sheared by their passing.
  {
    near: ['rubble', 'debris'],
    mid: ['rubble', 'debris'],
    far: ['skyscraper', 'skyscraper2', 'cityBlock', 'cityBlock2', 'lowrise', 'brokenTower'],
    accent: ['mecha', 'kaiju', 'skyscraper', 'skyscraper2', 'brokenTower'],
  },
  // VI Static — reality coming apart: shards, broken mountains, floating debris.
  {
    near: ['debris', 'spire'],
    mid: ['rubble', 'spire'],
    far: ['spire', 'mountain', 'floatChunk'],
    accent: ['spire', 'floatChunk'],
  },
];

function plainBox(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

function plainCyl(rTop: number, rBot: number, h: number, seg: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg);
}

function plainCone(r: number, h: number, seg: number): THREE.BufferGeometry {
  return new THREE.ConeGeometry(r, h, seg);
}

function cyl(rTop: number, rBot: number, h: number, seg: number, hex: number, ao: number): THREE.BufferGeometry {
  return paint(new THREE.CylinderGeometry(rTop, rBot, h, seg), hex, ao);
}

function cone(r: number, h: number, seg: number, hex: number, ao: number): THREE.BufferGeometry {
  return paint(new THREE.ConeGeometry(r, h, seg), hex, ao);
}

/** Merge parts that already carry vertex colors (from `box`/`paint`). */
function assemble(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge set-piece geometry');
  return geo;
}

/** Bake a vertical base→top gradient — aerial perspective for a flat silhouette. */
function gradient(
  parts: THREE.BufferGeometry[],
  baseHex: number,
  hazeHex: number,
  topY: number,
): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('Failed to merge silhouette geometry');
  const pos = geo.getAttribute('position');
  const base = new THREE.Color(baseHex);
  const haze = new THREE.Color(hazeHex);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.min(Math.max(pos.getY(i) / topY, 0), 1);
    c.copy(base).lerp(haze, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Lit window slits down the front (+z) face of a building mass. On the unlit
 * silhouette material the dim-warm panes glow against the dark structure, so a
 * tower reads as a *building with floors* instead of a flat slab — the cheap,
 * distance-legible kind of detail the style runs on (docs/DESIGN.md → detail from
 * vertex color and proportion, never triangle count). Baked flat (`ao` 0) and
 * kept to a few slits per mass to stay inside the silhouette tri budget.
 */
function winSlits(w: number, h: number, x: number, y: number, z: number, count: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const sw = Math.min(0.7, (w * 0.66) / (count * 1.7));
  for (let i = 0; i < count; i += 1) {
    const fx = x + (count === 1 ? 0 : (i / (count - 1) - 0.5) * w * 0.62);
    out.push(box(sw, h * 0.6, 0.3, palette.structureWin, 0).translate(fx, y, z));
  }
  return out;
}

/** Gradient-shade the body for aerial perspective, then merge lit window strips
 *  that keep their own glow (they bypass the body's height gradient). */
function litBuilding(
  body: THREE.BufferGeometry[],
  windows: THREE.BufferGeometry[],
  baseHex: number,
  hazeHex: number,
  topY: number,
): THREE.BufferGeometry {
  return assemble([gradient(body, baseHex, hazeHex, topY), ...windows]);
}

// --- Wasteland & structures (flat silhouettes, gradient-shaded) -------------

function mesaGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(24, 15, 13).translate(0, 7.5, 0),
      plainBox(15, 11, 9).translate(3, 18, -1),
      plainBox(8, 7, 6).translate(-1, 25.5, 0),
      plainBox(13, 9, 8).translate(16, 4.5, 2),
    ],
    palette.ridgeBase,
    palette.ridgeHaze,
    30,
  );
}

function snagGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(0.55, 7, 0.55).translate(0, 3.5, 0),
      plainBox(0.4, 3.2, 0.4).rotateZ(0.5).translate(-0.9, 6, 0),
      plainBox(0.34, 2.6, 0.34).rotateZ(-0.6).translate(0.9, 6.4, 0.2),
      plainBox(0.3, 2, 0.3).rotateX(0.5).translate(0.2, 7.2, -0.7),
    ],
    palette.snagBase,
    palette.snagHaze,
    9,
  );
}

function pylonGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(0.5, 13, 0.5).rotateZ(0.12).translate(-1.3, 6.5, 0),
      plainBox(0.5, 13, 0.5).rotateZ(-0.12).translate(1.3, 6.5, 0),
      plainBox(1.7, 3.5, 0.5).translate(0, 13.5, 0),
      plainBox(8, 0.4, 0.4).translate(0, 9.5, 0),
      plainBox(5.4, 0.4, 0.4).translate(0, 12, 0),
      plainBox(2.8, 0.3, 0.3).rotateZ(0.6).translate(0, 6, 0),
      plainBox(2.8, 0.3, 0.3).rotateZ(-0.6).translate(0, 3, 0),
    ],
    palette.snagBase,
    palette.snagHaze,
    15,
  );
}

function warehouseGeometry(): THREE.BufferGeometry {
  return litBuilding(
    [
      plainBox(20, 9, 14).translate(0, 4.5, 0),
      plainBox(20, 1.6, 3).translate(0, 9.6, 0),
      plainBox(1.3, 5, 1.3).translate(7, 11, -3),
      plainBox(10, 6, 10).translate(16, 3, 2),
    ],
    // A low clerestory row of small lit panes along the shed front.
    [...winSlits(20, 5, 0, 5, 7.05, 6), ...winSlits(10, 6, 16, 3.5, 7.05, 2)],
    palette.structureBase,
    palette.structureHaze,
    14,
  );
}

function cityBlockGeometry(): THREE.BufferGeometry {
  return litBuilding(
    [
      plainBox(9, 26, 9).translate(0, 13, 0),
      plainBox(7, 34, 7).translate(10, 17, -2),
      plainBox(6, 20, 8).translate(-9, 10, 2),
      plainBox(5, 30, 5).translate(3, 15, 8),
    ],
    [
      ...winSlits(9, 26, 0, 13, 4.55, 3),
      ...winSlits(7, 34, 10, 17, 1.55, 2),
      ...winSlits(5, 30, 3, 15, 10.55, 2),
    ],
    palette.structureBase,
    palette.structureHaze,
    36,
  );
}

function skyscraperGeometry(): THREE.BufferGeometry {
  return litBuilding(
    [
      plainBox(10, 60, 10).translate(0, 30, 0),
      plainBox(7, 12, 7).translate(0, 66, 0),
      plainBox(0.8, 14, 0.8).translate(0, 79, 0),
      plainBox(8, 40, 8).translate(13, 20, 3),
    ],
    [...winSlits(10, 60, 0, 30, 5.05, 4), ...winSlits(8, 40, 13, 20, 7.05, 3)],
    palette.structureBase,
    palette.structureHaze,
    86,
  );
}

function rubbleGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(8, 3, 6).rotateZ(0.3).translate(0, 1.5, 0),
      plainBox(5, 2.5, 5).rotateZ(-0.4).translate(4, 1.2, -2),
      plainBox(4, 4, 3).rotateX(0.3).translate(-3, 2, 1),
      plainBox(0.6, 7, 4).rotateZ(0.9).translate(2, 2, 3),
    ],
    palette.structureBase,
    palette.structureHaze,
    7,
  );
}

/** A broad multi-peak mountain range for the deep horizon — bigger than a mesa. */
function mountainGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(40, 30, 18).translate(0, 15, 0),
      plainBox(26, 44, 14).translate(9, 22, -2),
      plainBox(18, 54, 12).translate(-13, 27, 1),
      plainBox(15, 36, 10).translate(22, 18, 3),
      plainBox(22, 26, 11).translate(-28, 13, -1),
    ],
    palette.ridgeBase,
    palette.ridgeHaze,
    54,
  );
}

/** A cluster of wider, lower buildings — fills a skyline between the tall towers. */
function lowriseGeometry(): THREE.BufferGeometry {
  return litBuilding(
    [
      plainBox(14, 16, 12).translate(0, 8, 0),
      plainBox(11, 12, 10).translate(11, 6, -2),
      plainBox(10, 21, 9).translate(-10, 10.5, 2),
      plainBox(8, 14, 8).translate(4, 7, 9),
    ],
    [
      ...winSlits(14, 16, 0, 8, 6.05, 4),
      ...winSlits(10, 21, -10, 10.5, 6.55, 3),
      ...winSlits(8, 14, 4, 7, 13.05, 2),
    ],
    palette.structureBase,
    palette.structureHaze,
    22,
  );
}

function spireGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(3, 30, 3).rotateZ(0.08).translate(0, 15, 0),
      plainBox(2, 20, 2).rotateZ(-0.25).translate(4, 12, 0),
      plainBox(1.5, 14, 1.5).rotateZ(0.4).translate(-3, 9, 1),
      plainBox(1.2, 6, 1.2).rotateZ(0.6).translate(1, 28, 0),
    ],
    palette.spireBase,
    palette.spireHaze,
    34,
  );
}

/** A suburban ranch house with a pitched roof and a chimney — Rust's homes. */
function houseGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(8, 4, 6).translate(0, 2, 0),
      plainBox(8.4, 0.3, 6.4).translate(0, 4, 0), // eaves
      plainBox(4.6, 0.4, 6.6).rotateZ(0.5).translate(-2, 5, 0), // roof slopes
      plainBox(4.6, 0.4, 6.6).rotateZ(-0.5).translate(2, 5, 0),
      plainBox(0.9, 2, 0.9).translate(2.6, 5.4, -1.6), // chimney
      plainBox(2, 2.4, 0.3).translate(0, 1.2, 3.05), // door
    ],
    palette.structureBase,
    palette.structureHaze,
    6,
  );
}

/** A water tower on splayed legs with a conical cap — a classic skyline mark. */
function watertowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    plainCyl(3.2, 3.4, 4.6, 12).translate(0, 12.8, 0), // tank
    plainCone(3.6, 2, 12).translate(0, 16, 0), // conical roof
    plainBox(0.4, 3, 0.4).translate(0, 17.5, 0), // finial
    plainCyl(2.6, 3.0, 1.2, 12).translate(0, 10.2, 0), // tapered base of tank
  ];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    parts.push(plainBox(0.5, 11, 0.5).rotateZ(sx * 0.07).rotateX(sz * 0.07).translate(sx * 2.2, 5.5, sz * 2.2));
  }
  parts.push(plainBox(5.5, 0.3, 0.3).translate(0, 6, -2.2)); // cross braces
  parts.push(plainBox(5.5, 0.3, 0.3).translate(0, 6, 2.2));
  return gradient(parts, palette.ridgeBase, palette.ridgeHaze, 18);
}

/** A highway billboard: two legs, a braced frame, a big blank panel. */
function billboardGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(0.5, 8, 0.5).translate(-3.5, 4, 0),
      plainBox(0.5, 8, 0.5).translate(3.5, 4, 0),
      plainBox(0.4, 3, 0.4).rotateZ(0.6).translate(-1.6, 6, 0), // braces
      plainBox(0.4, 3, 0.4).rotateZ(-0.6).translate(1.6, 6, 0),
      plainBox(10, 4, 0.4).translate(0, 8.6, 0), // panel
      plainBox(10.6, 0.4, 0.5).translate(0, 10.7, 0), // top trim
      plainBox(10.6, 0.4, 0.5).translate(0, 6.5, 0), // bottom trim
    ],
    palette.structureBase,
    palette.structureHaze,
    11,
  );
}

/** A crashed saucer, half-buried and tilted, its ring still flickering. */
function downedSaucerGeometry(): THREE.BufferGeometry {
  const b = palette.ufoBody;
  const g = palette.ufoGlow;
  const tilt = 0.42;
  return assemble([
    cone(5.6, 1.3, 18, b, 0.5).rotateZ(tilt).translate(0, 1.3, 0),
    cone(5.6, 1.6, 18, b, 0.4).rotateX(Math.PI).rotateZ(tilt).translate(0, 0.6, 0),
    cyl(1.6, 2.6, 1.7, 14, b, 0.55).rotateZ(tilt).translate(0.8, 2.6, 0), // dome, knocked askew
    cyl(3.1, 3.1, 0.3, 18, g, 0).rotateZ(tilt).translate(0, 0.8, 0), // glow ring
    box(2.2, 0.7, 2.2, b, 0.5).rotateY(0.5).rotateZ(0.3).translate(6.5, 0.4, 1.5), // sheared-off panel
    box(0.5, 0.5, 3, g, 0).rotateZ(0.2).translate(-4.5, 0.6, -1), // a leaking glow streak
  ]);
}

/** A sheared skyscraper: a snapped stump, a tilted cap, a toppled top, a neighbor. */
function brokenTowerGeometry(): THREE.BufferGeometry {
  return litBuilding(
    [
      plainBox(10, 38, 10).translate(0, 19, 0), // sheared stump
      plainBox(8, 3, 8).rotateZ(0.16).translate(1.2, 39, 0), // tilted broken cap
      plainBox(7, 20, 7).rotateZ(0.95).translate(9.5, 7.5, 0), // toppled top leaning away
      plainBox(9, 44, 9).translate(-13, 22, 3), // intact neighbor
    ],
    // The sheared stump keeps a few lit floors low; the intact neighbour glows full.
    [...winSlits(10, 26, 0, 13, 5.05, 3), ...winSlits(9, 44, -13, 22, 7.55, 3)],
    palette.structureBase,
    palette.structureHaze,
    44,
  );
}

// --- Variants: a second silhouette per common kind, so an act never repeats one
//     model down the whole horizon (combined with non-uniform scale + tint). ----

/** Jagged pointed buttes instead of the flat-topped mesa. */
function mesa2Geometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(14, 10, 11).translate(0, 5, 0),
      plainCone(7, 22, 7).translate(0, 13, 0),
      plainCone(5, 15, 6).translate(9, 8, -2),
      plainCone(4, 11, 6).translate(-9, 6, 1),
    ],
    palette.ridgeBase,
    palette.ridgeHaze,
    28,
  );
}

/** A two-storey flat-roof house with an attached garage — a different home. */
function house2Geometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(7, 6, 6).translate(0, 3, 0),
      plainBox(7.2, 0.4, 6.2).translate(0, 6, 0), // flat roof
      plainBox(5, 3, 5).translate(6, 1.5, 1), // garage
      plainBox(5.2, 0.3, 5.2).translate(6, 3.1, 1),
      plainBox(1.4, 2, 0.3).translate(-1.5, 1, 3.05), // door
    ],
    palette.structureBase,
    palette.structureHaze,
    6.5,
  );
}

/** A row of grain silos with conical caps — industrial outskirts, not a box shed. */
function warehouse2Geometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainCyl(2.4, 2.4, 14, 12).translate(-4, 7, 0),
      plainCyl(2.4, 2.4, 14, 12).translate(0, 7, 0),
      plainCyl(2.4, 2.4, 14, 12).translate(4, 7, 0),
      plainCone(2.7, 1.7, 12).translate(-4, 14.6, 0),
      plainCone(2.7, 1.7, 12).translate(0, 14.6, 0),
      plainCone(2.7, 1.7, 12).translate(4, 14.6, 0),
      plainBox(10, 6, 7).translate(2, 3, 6), // attached shed
    ],
    palette.structureBase,
    palette.structureHaze,
    16,
  );
}

/** A tighter cluster of taller, more uniform towers — a different downtown wall. */
function cityBlock2Geometry(): THREE.BufferGeometry {
  return litBuilding(
    [
      plainBox(7, 40, 7).translate(-6, 20, 0),
      plainBox(8, 30, 8).translate(4, 15, -3),
      plainBox(6, 48, 6).translate(2, 24, 6),
      plainBox(7, 22, 7).translate(-7, 11, 7),
      plainBox(5, 34, 5).translate(8, 17, 4),
    ],
    [
      ...winSlits(7, 40, -6, 20, 3.55, 2),
      ...winSlits(6, 48, 2, 24, 9.05, 2),
      ...winSlits(7, 22, -7, 11, 10.55, 2),
      ...winSlits(5, 34, 8, 17, 6.55, 2),
    ],
    palette.structureBase,
    palette.structureHaze,
    48,
  );
}

/** A stepped, setback art-deco tower with a spire — not the slab+antenna. */
function skyscraper2Geometry(): THREE.BufferGeometry {
  return litBuilding(
    [
      plainBox(12, 30, 12).translate(0, 15, 0),
      plainBox(9, 22, 9).translate(0, 38, 0),
      plainBox(6, 16, 6).translate(0, 54, 0),
      plainBox(3.5, 10, 3.5).translate(0, 66, 0),
      plainBox(0.7, 8, 0.7).translate(0, 74, 0),
    ],
    [
      ...winSlits(12, 30, 0, 15, 6.05, 4),
      ...winSlits(9, 22, 0, 38, 4.55, 3),
      ...winSlits(6, 16, 0, 54, 3.05, 2),
    ],
    palette.structureBase,
    palette.structureHaze,
    78,
  );
}

/** A chunk of city torn loose and hanging in the air — Static's broken physics. */
function floatChunkGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(8, 3, 7).translate(0, 0, 0), // the slab
      plainBox(5, 4, 5).rotateZ(0.2).translate(1, -3, 0), // hanging underside
      plainBox(2, 5, 2).rotateX(0.3).translate(-2.5, -4, 1), // dangling chunk
      plainBox(0.4, 4, 0.4).translate(2.5, -5, -1), // dangling rebar
      plainBox(3, 5, 3).translate(-1, 4, 1), // a broken structure riding on top
      plainBox(2, 3, 2).rotateZ(0.3).translate(2, 3, -1),
    ],
    palette.spireBase,
    palette.spireHaze,
    7,
  );
}

/** Low scattered wreckage — broken slabs, a stub, a chunk of junk. Shoulder filler. */
function debrisGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(2.2, 0.5, 1.6).rotateY(0.3).translate(0, 0.25, 0),
      plainBox(1.4, 0.8, 1.0).rotateZ(0.4).translate(1.0, 0.4, 0.4),
      plainBox(1.0, 0.4, 1.2).rotateY(-0.5).translate(-0.8, 0.2, -0.3),
      plainBox(0.4, 1.4, 0.4).rotateZ(0.7).translate(0.3, 0.55, 0.7),
    ],
    palette.structureBase,
    palette.structureHaze,
    2,
  );
}

/** A dead bush — a knot of bare twigs low to the ground. Shoulder filler. */
function scrubGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(0.18, 1.1, 0.18).translate(0, 0.55, 0),
      plainBox(0.14, 0.9, 0.14).rotateZ(0.7).translate(0.3, 0.8, 0),
      plainBox(0.14, 0.8, 0.14).rotateZ(-0.6).translate(-0.25, 0.7, 0.1),
      plainBox(0.12, 0.7, 0.12).rotateX(0.6).translate(0.05, 0.9, 0.25),
      plainBox(0.12, 0.6, 0.12).rotateX(-0.5).translate(-0.1, 0.6, -0.2),
    ],
    palette.snagBase,
    palette.snagHaze,
    1.6,
  );
}

// --- Act set-pieces (shaded forms with a baked self-lit glow) ---------------

/** A flying saucer: a beveled lens, a dome, a glowing rim, and an abduction beam. */
function saucerGeometry(): THREE.BufferGeometry {
  const b = palette.ufoBody;
  const g = palette.ufoGlow;
  return assemble([
    cone(5.6, 1.3, 18, b, 0.5).translate(0, 0.45, 0), // upper bevel
    cone(5.6, 1.7, 18, b, 0.4).rotateX(Math.PI).translate(0, -0.25, 0), // lower bevel
    cyl(1.6, 2.7, 1.9, 14, b, 0.55).translate(0, 1.45, 0), // dome
    cyl(3.3, 3.3, 0.32, 20, g, 0).translate(0, -0.95, 0), // underglow ring
    box(0.55, 0.45, 0.55, g, 0).translate(5.0, -0.1, 0), // rim lights
    box(0.55, 0.45, 0.55, g, 0).translate(-5.0, -0.1, 0),
    box(0.55, 0.45, 0.55, g, 0).translate(0, -0.1, 5.0),
    box(0.55, 0.45, 0.55, g, 0).translate(0, -0.1, -5.0),
    cyl(0.6, 3.2, 30, 16, palette.ufoBeam, 0).translate(0, -15.6, 0), // abduction beam
  ]);
}

/** A towering bipedal war machine, mid-stride, reactor and visor aglow. */
function mechaGeometry(): THREE.BufferGeometry {
  const b = palette.mechaBody;
  const g = palette.mechaGlow;
  return assemble([
    box(3.2, 12, 3.4, b, 0.5).rotateX(0.16).translate(-2.4, 6, 1.3), // left leg forward
    box(3.2, 13, 3.4, b, 0.5).rotateX(-0.12).translate(2.4, 6.6, -1.1), // right leg back
    box(3.8, 3, 4.4, b, 0.5).translate(-2.6, 1.3, 3.4), // feet
    box(3.8, 3, 4.4, b, 0.5).translate(2.6, 1.3, -2.8),
    box(8, 6, 5, b, 0.55).translate(0, 15, 0), // hips
    box(9, 9, 6, b, 0.6).translate(0, 21, 0), // chest
    box(2.6, 2.6, 0.6, g, 0).translate(0, 21, 3.1), // reactor glow
    box(3, 3.6, 3, b, 0.5).translate(-6, 24, 0), // shoulders
    box(3, 3.6, 3, b, 0.5).translate(6, 24, 0),
    box(2.4, 10, 2.4, b, 0.45).rotateZ(0.2).translate(-7, 18, 0), // arms
    box(2.4, 11, 2.4, b, 0.45).rotateZ(-0.5).translate(7.6, 20, 2),
    box(3.4, 3, 3.2, b, 0.55).translate(0, 27.6, 0), // head
    box(2.2, 0.7, 0.5, g, 0).translate(0, 28, 1.7), // visor
    box(1.4, 1.4, 5.5, b, 0.4).translate(6, 26.5, 2), // shoulder cannon
  ]);
}

/** A colossal beast, leaning forward, dorsal spines and an open maw aglow. */
function kaijuGeometry(): THREE.BufferGeometry {
  const b = palette.kaijuBody;
  const g = palette.kaijuGlow;
  return assemble([
    box(3, 8, 3.4, b, 0.5).translate(-2.2, 4, -1), // hind legs
    box(3, 8, 3.4, b, 0.5).translate(2.2, 4, -1),
    box(3.6, 2, 5, b, 0.5).translate(-2.2, 1, 0.7), // feet
    box(3.6, 2, 5, b, 0.5).translate(2.2, 1, 0.7),
    box(6.5, 7, 9, b, 0.55).rotateX(0.25).translate(0, 11, -1), // body
    box(4.5, 6, 4.5, b, 0.5).rotateX(0.4).translate(0, 16, 3), // chest
    box(3.2, 4, 3.6, b, 0.5).rotateX(0.3).translate(0, 20, 5.5), // neck
    box(3, 3, 5, b, 0.55).translate(0, 22.5, 8.5), // head
    box(2.2, 0.9, 2.6, g, 0).translate(0, 21.7, 10.2), // glowing maw
    box(1.2, 4, 1.2, b, 0.4).rotateX(0.6).translate(-3, 15, 5), // little arms
    box(1.2, 4, 1.2, b, 0.4).rotateX(0.6).translate(3, 15, 5),
    box(3, 3, 6, b, 0.5).rotateX(-0.2).translate(0, 8, -7), // tail
    box(2, 2, 5, b, 0.45).rotateX(-0.35).translate(0, 6, -11.5),
    box(1.2, 1.2, 4, b, 0.4).rotateX(-0.5).translate(0, 4.5, -15),
    box(0.5, 2, 0.8, g, 0).rotateX(0.25).translate(0, 15.4, -1), // dorsal spines
    box(0.6, 2.6, 1, g, 0).rotateX(0.25).translate(0, 14, -4),
    box(0.5, 2, 0.8, g, 0).rotateX(0.25).translate(0, 12.5, -7),
  ]);
}

// --- Act-coherent roadside clutter (the near band's storytelling junk) -------

/** A burnt-out car shell rusting on the shoulder — Rust/Swarm wreckage. */
function huskWreckGeometry(): THREE.BufferGeometry {
  const p = palette;
  return assemble([
    box(1.7, 0.4, 3.4, p.wreckDark, 0.45).translate(0, 0.3, 0),
    box(1.8, 0.36, 2.0, p.wreckBody, 0.5).translate(0, 0.62, 0.1),
    box(1.5, 0.42, 1.3, p.wreckDark, 0.5).rotateZ(0.05).translate(0, 0.95, -0.3), // caved cabin
    box(1.36, 0.3, 0.12, p.wreckGlass, 0.3).translate(0, 0.92, 0.55), // dead windshield
    box(1.2, 0.1, 0.9, p.wreckScorch, 0.2).translate(0, 0.7, 1.0), // scorched hood
    box(0.5, 0.3, 0.7, p.wreckRust, 0.5).translate(0.85, 0.6, -0.2), // rust patch
    box(0.34, 0.3, 0.34, p.wreckDark, 0.4).translate(-0.8, 0.18, 1.1), // a stub wheel
    box(0.34, 0.3, 0.34, p.wreckDark, 0.4).translate(0.8, 0.18, -1.1),
  ]);
}

/** A cluster of rusted oil drums, one toppled — Rust/Swarm. */
function barrelsGeometry(): THREE.BufferGeometry {
  const b = palette.barrelBody;
  const d = palette.wreckDark;
  return assemble([
    cyl(0.45, 0.45, 1.4, 10, b, 0.5).translate(0, 0.7, 0),
    cyl(0.47, 0.47, 0.12, 10, d, 0.3).translate(0, 1.05, 0),
    cyl(0.45, 0.45, 1.4, 10, b, 0.5).translate(1.0, 0.7, 0.4),
    cyl(0.47, 0.47, 0.12, 10, d, 0.3).translate(1.0, 1.05, 0.4),
    cyl(0.45, 0.45, 1.4, 10, b, 0.5).rotateZ(1.5).translate(-0.85, 0.45, 0.6), // toppled
  ]);
}

/** Shipping containers, one stacked askew on another — Swarm/Visitors. */
function containerGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(2.6, 2.6, 6.0).translate(0, 1.3, 0),
      plainBox(2.5, 2.5, 5.8).rotateY(0.18).translate(0.6, 3.9, 0.8), // stacked, shifted
    ],
    palette.containerBase,
    palette.containerHaze,
    6.4,
  );
}

/** A cluster of alien crystal shards with a glowing core — Visitors. */
function crystalGeometry(): THREE.BufferGeometry {
  const b = palette.crystalBody;
  const g = palette.ufoGlow;
  return assemble([
    cone(1.2, 4.6, 5, b, 0.5).rotateZ(0.15).translate(0, 2.2, 0),
    cone(0.8, 3.0, 5, b, 0.5).rotateZ(-0.4).translate(1.0, 1.5, 0.3),
    cone(0.6, 2.2, 5, b, 0.5).rotateZ(0.5).translate(-0.9, 1.1, -0.2),
    cone(0.45, 3.8, 5, g, 0).translate(0, 2.1, 0), // glowing core
  ]);
}

const GEOMETRY: Record<SilKind, () => THREE.BufferGeometry> = {
  mesa: mesaGeometry,
  snag: snagGeometry,
  pylon: pylonGeometry,
  warehouse: warehouseGeometry,
  cityBlock: cityBlockGeometry,
  skyscraper: skyscraperGeometry,
  rubble: rubbleGeometry,
  spire: spireGeometry,
  saucer: saucerGeometry,
  mecha: mechaGeometry,
  kaiju: kaijuGeometry,
  debris: debrisGeometry,
  scrub: scrubGeometry,
  mountain: mountainGeometry,
  lowrise: lowriseGeometry,
  house: houseGeometry,
  watertower: watertowerGeometry,
  billboard: billboardGeometry,
  downedSaucer: downedSaucerGeometry,
  brokenTower: brokenTowerGeometry,
  floatChunk: floatChunkGeometry,
  mesa2: mesa2Geometry,
  house2: house2Geometry,
  warehouse2: warehouse2Geometry,
  cityBlock2: cityBlock2Geometry,
  skyscraper2: skyscraper2Geometry,
  huskWreck: huskWreckGeometry,
  barrels: barrelsGeometry,
  container: containerGeometry,
  crystal: crystalGeometry,
};

export class Horizon {
  private readonly meshes: Record<SilKind, THREE.InstancedMesh>;
  private readonly counts: Record<SilKind, number>;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly seed: number;
  private time = 0;

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed | 0;
    this.meshes = {} as Record<SilKind, THREE.InstancedMesh>;
    this.counts = {} as Record<SilKind, number>;
    for (const kind of KINDS) {
      const mesh = new THREE.InstancedMesh(GEOMETRY[kind](), silhouetteMaterial, CAP);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // instances span far beyond geometry bounds
      mesh.count = 0;
      mesh.visible = false;
      this.meshes[kind] = mesh;
      this.counts[kind] = 0;
      scene.add(mesh);
    }
  }

  /** A stable pseudo-random in [0, 1) for slot `s`, salted by `salt` and the seed. */
  private rand(s: number, salt: number): number {
    let h = (Math.imul(s, 374761393) ^ Math.imul(salt, 668265263) ^ this.seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  update(distance: number, dt: number): void {
    this.time += dt;
    for (const kind of KINDS) this.counts[kind] = 0;

    const blend = actBlendAt(distance);
    const last = ACTS.length - 1;
    const ai = blend.index;
    const bi = Math.min(ai + 1, last);
    const t = blend.t;

    this.fill(NEAR, 'near', distance, ai, bi, t);
    this.fill(MID, 'mid', distance, ai, bi, t);
    this.fill(FAR, 'far', distance, ai, bi, t);
    this.fill(ACCENT, 'accent', distance, ai, bi, t);

    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      const n = this.counts[kind];
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private fill(band: Band, role: Role, distance: number, ai: number, bi: number, t: number): void {
    const first = Math.floor((distance - band.spacing) / band.spacing);
    const last = Math.ceil((distance + band.reach) / band.spacing);

    for (let slot = first; slot <= last; slot += 1) {
      for (const side of [-1, 1] as const) {
        const key = band.salt + slot * 4 + (side < 0 ? 0 : 2);
        if (this.rand(key, 1) < band.skip) continue;

        // Across a transition, each slot flips to the next act's catastrophe at
        // its own threshold — the world rebuilds gradually, never all at once.
        const act = t > 0 && this.rand(key, 7) < t ? bi : ai;
        const choices = ACT_SILHOUETTES[act][role];
        const kind = choices[Math.min(choices.length - 1, Math.floor(this.rand(key, 8) * choices.length))];
        const n = this.counts[kind];
        if (n >= CAP) continue;

        const meta = KIND_META[kind];
        let y = meta.elevation;
        if (meta.elevJitter > 0) y += this.rand(key, 9) * meta.elevJitter;
        if (meta.bob > 0) y += Math.sin(this.time * BOB_SPEED + this.rand(key, 10) * TWO_PI) * meta.bob;

        const worldZ = slot * band.spacing + (this.rand(key, 2) - 0.5) * band.jitterZ;
        const x = side * (band.xMin + this.rand(key, 3) * (band.xMax - band.xMin));
        const base = band.scaleMin + this.rand(key, 4) * (band.scaleMax - band.scaleMin);
        const yaw = this.rand(key, 5) * TWO_PI;
        const roll = band.lean === 0 ? 0 : (this.rand(key, 6) - 0.5) * 2 * band.lean;

        this.dummy.position.set(x, y, distance - worldZ);
        this.dummy.rotation.set(0, yaw, roll * side);
        // Stretchable kinds get independent width/height/depth, so one model reads
        // as many different buildings; set-pieces keep their authored proportions.
        if (meta.stretch) {
          this.dummy.scale.set(
            base * (0.78 + this.rand(key, 12) * 0.55),
            base * (0.82 + this.rand(key, 13) * 0.6),
            base * (0.78 + this.rand(key, 14) * 0.55),
          );
        } else {
          this.dummy.scale.setScalar(base);
        }
        this.dummy.updateMatrix();

        const mesh = this.meshes[kind];
        mesh.setMatrixAt(n, this.dummy.matrix);
        // A per-instance brightness tint breaks the "every building is one flat
        // shade" read; it multiplies the baked vertex color, so it stays on-act.
        const shade = 0.78 + this.rand(key, 11) * 0.4;
        this.tint.setRGB(shade, shade, shade);
        mesh.setColorAt(n, this.tint);
        this.counts[kind] = n + 1;
      }
    }
  }

  dispose(): void {
    for (const kind of KINDS) this.meshes[kind].geometry.dispose();
  }
}
