import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, paint, silhouetteMaterial } from './materials';
import { palette } from './palette';
import { LOOKAHEAD } from '../content/tuning';
import { actBlendAt, ACTS } from './mood';
import { BIOME_BAND_M, BIOME_TRANSITION_M, biomeForBand, type BiomeId } from '../content/biomes';
import type { Elevation } from './elevation';

/**
 * The distant backdrop the road drives through, a different world (and a different
 * apocalypse) in every act. Rust drives past mesas and dead trees; Swarm reaches
 * the city outskirts; Visitors threads downtown canyons under a sky full of
 * saucers dropping abduction beams; Colossus is all skyline with giant mechs and
 * kaiju stomping the horizon; Static is fractured wreckage. The silhouettes a band
 * draws are chosen by the current act, and across a transition the object kinds
 * crossfade slot by slot, so the scenery rebuilds into the next catastrophe as you
 * cross over (docs/DESIGN.md → Run structure).
 *
 * Pure render-side dressing: it never gates the lane, so it lives entirely here and
 * only reads `distance` (plus `dt` for the hover bob). Like the road it streams
 * against the car and recycles by wrapping distance into a grid of slots; a slot's
 * look (kind, offset, scale, yaw, lean, elevation, whether it's there) is a pure
 * function of its absolute index and the seed, so it never flickers and the
 * per-frame path allocates nothing. One `InstancedMesh` per silhouette kind keeps
 * it a few draw calls even mid-transition; idle kinds are parked invisible. The
 * set-piece glow (UFO ring, mech reactor, kaiju maw) is baked bright into vertex
 * color so the unlit silhouette material renders it as light.
 */

const TWO_PI = Math.PI * 2;
/** Shared iteration order; keeping it at module scope avoids a tiny array per frame. */
const SIDES = [-1, 1] as const;

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
  | 'crystal'
  | 'storefront'
  | 'rowhouses'
  | 'gasstation'
  | 'parkinggarage'
  | 'cranetower'
  | 'barn'
  | 'windmill'
  | 'motel'
  | 'alienspire'
  | 'tripod'
  | 'footprint'
  | 'toppledtower'
  | 'glitchslab'
  | 'voidrift'
  | 'pinestand'
  | 'tunnelrib'
  | 'bridgetower'
  | 'shipwreck'
  | 'volcano';

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
  'storefront',
  'rowhouses',
  'gasstation',
  'parkinggarage',
  'cranetower',
  'barn',
  'windmill',
  'motel',
  'alienspire',
  'tripod',
  'footprint',
  'toppledtower',
  'glitchslab',
  'voidrift',
  'pinestand',
  'tunnelrib',
  'bridgetower',
  'shipwreck',
  'volcano',
];

/** Per-kind instance capacity — comfortably above the slots routed to one kind
 *  (a kind like `rubble` can be drawn by the near and mid bands at once). */
const CAP = 72;
/** Hover bob radians per second, for flyers. */
const BOB_SPEED = 1.1;

/**
 * Per-kind metadata: how high it floats, and whether it may be stretched
 * non-uniformly. Stretchable kinds share one geometry but vary width, height, and
 * depth per instance. Set-pieces and silhouette-critical props keep fixed
 * proportions.
 */
interface KindMeta {
  readonly elevation: number;
  readonly bob: number;
  readonly elevJitter: number;
  readonly stretch: boolean;
  /**
   * Face the road instead of taking a random yaw. A tunnel wall segment or a
   * bridge tower reads only when its authored front (+x) points at the corridor;
   * a random spin turns it into noise.
   */
  readonly faceRoad?: boolean;
}
const GROUNDED: KindMeta = { elevation: 0, bob: 0, elevJitter: 0, stretch: false };
const STRETCH: KindMeta = { elevation: 0, bob: 0, elevJitter: 0, stretch: true };
const FACING: KindMeta = { elevation: 0, bob: 0, elevJitter: 0, stretch: false, faceRoad: true };
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
  storefront: STRETCH,
  rowhouses: STRETCH,
  gasstation: GROUNDED, // the canopy/totem proportions are the read
  parkinggarage: STRETCH,
  cranetower: GROUNDED, // the crane's jib balance would shear badly
  barn: STRETCH,
  windmill: GROUNDED, // the rotor must stay round
  motel: STRETCH,
  alienspire: GROUNDED, // an organic grown shard; stretching reads as a box
  tripod: GROUNDED, // the walker's leg balance would shear
  footprint: GROUNDED, // an oval stamp; stretching warps the foot shape
  toppledtower: GROUNDED, // the felled proportions are the read
  glitchslab: GROUNDED, // the sliced bands must keep their offsets
  voidrift: GROUNDED, // a tall thin tear; stretching ruins the slit
  pinestand: GROUNDED, // conifer tiers must stay round
  tunnelrib: FACING, // a wall segment; a random spin turns it into noise
  bridgetower: FACING, // the portal must bracket the corridor
  shipwreck: STRETCH, // hull proportions vary fine; every wreck lists its own way
  volcano: GROUNDED, // the cone and its crater rim
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
  spacing: 44,
  reach: LOOKAHEAD,
  // A middle distance: close enough that the skyline hugs the road and the gap to
  // the horizon never reads as empty, but far enough off the sightline that tall
  // buildings frame the corridor instead of planting themselves on the road (a
  // near slab at the vanishing point reads as "on the road" — the tallest kinds
  // are routed to the sparser, farther ACCENT band for the same reason).
  xMin: 75,
  xMax: 140,
  scaleMin: 0.85,
  scaleMax: 1.32,
  // Dense skyline: it's far enough off the sightline (xMin 75) that packing it in
  // fills the horizon without any building landing on the road.
  skip: 0.1,
  jitterZ: 22,
  lean: 0,
  salt: 0,
};

const MID: Band = {
  spacing: 14,
  reach: LOOKAHEAD * 0.85,
  xMin: 34, // far enough off the road to never clip the corridor
  xMax: 55,
  scaleMin: 0.8,
  scaleMax: 1.3,
  skip: 0.2, // denser mid-ground so the band to the skyline isn't bare
  jitterZ: 10,
  lean: 0.18,
  salt: 1000,
};

// Low clutter crowding the shoulder: junk, dead scrub, fallen ruins right by the
// road, so the band between the guardrail and the skyline never reads as bare.
const NEAR: Band = {
  spacing: 10,
  reach: LOOKAHEAD * 0.62,
  xMin: 13.0, // just clear of the guardrails
  xMax: 24,
  scaleMin: 0.65,
  scaleMax: 1.15,
  skip: 0.13, // crowd the shoulder so the roadside never reads bare
  jitterZ: 5,
  lean: 0.28,
  salt: 3000,
};

// Sparse, big landmarks: a lone pylon, a tower over the canyon, a stomping giant.
const ACCENT: Band = {
  spacing: 150,
  reach: LOOKAHEAD,
  xMin: 95, // far landmarks, well off the corridor
  xMax: 155,
  scaleMin: 0.95,
  scaleMax: 1.34,
  skip: 0.4, // a few more standout towers/landmarks on the skyline
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
    near: ['huskWreck', 'debris', 'barrels', 'container', 'scrub', 'gasstation'],
    mid: ['house', 'house2', 'lowrise', 'billboard', 'container', 'storefront', 'rowhouses', 'gasstation'],
    far: ['cityBlock', 'cityBlock2', 'lowrise', 'watertower', 'billboard', 'parkinggarage', 'storefront'],
    accent: ['skyscraper', 'skyscraper2', 'cityBlock2', 'watertower', 'cranetower', 'billboard'],
  },
  // II Rust — wasteland suburbia: dead trees, abandoned houses, a water tower,
  // mesas and distant mountains.
  {
    near: ['scrub', 'debris', 'snag', 'huskWreck', 'barrels'],
    mid: ['snag', 'rubble', 'house', 'house2', 'huskWreck', 'barn', 'motel'],
    far: ['mesa', 'mesa2', 'house', 'house2', 'mountain', 'watertower', 'barn', 'windmill', 'motel'],
    accent: ['pylon', 'mountain', 'watertower', 'windmill'],
  },
  // III Swarm — city outskirts: warehouses, silos, low blocks, highway billboards,
  // dumped containers and drums along the shoulder.
  {
    near: ['debris', 'rubble', 'huskWreck', 'barrels', 'container'],
    mid: ['snag', 'rubble', 'billboard', 'house2', 'container', 'storefront', 'gasstation'],
    far: ['warehouse', 'warehouse2', 'lowrise', 'cityBlock', 'billboard', 'watertower', 'parkinggarage'],
    accent: ['pylon', 'cityBlock', 'cityBlock2', 'billboard'],
  },
  // IV Visitors — downtown canyons under an invasion sky, wrecks and alien
  // crystal growing up through the road, harvested by the tripods overhead.
  {
    near: ['debris', 'rubble', 'crystal', 'container', 'alienspire'],
    mid: ['rubble', 'snag', 'downedSaucer', 'crystal', 'alienspire'],
    far: ['cityBlock', 'cityBlock2', 'lowrise', 'saucer', 'brokenTower', 'alienspire'],
    accent: ['saucer', 'skyscraper', 'skyscraper2', 'downedSaucer', 'tripod'],
  },
  // V Colossus — skyline with giants, towers sheared and streets stamped flat by
  // their passing: fresh footprints and felled towers litter the near ground.
  {
    near: ['rubble', 'debris', 'footprint', 'huskWreck'],
    mid: ['rubble', 'debris', 'toppledtower', 'brokenTower', 'footprint'],
    far: ['skyscraper', 'skyscraper2', 'cityBlock', 'cityBlock2', 'brokenTower', 'toppledtower'],
    accent: ['mecha', 'kaiju', 'skyscraper', 'skyscraper2', 'brokenTower'],
  },
  // VI Static — reality coming apart: sliced glitch slabs, tears in the air,
  // broken mountains and floating debris.
  {
    near: ['debris', 'spire', 'glitchslab'],
    mid: ['rubble', 'spire', 'glitchslab'],
    far: ['spire', 'mountain', 'floatChunk', 'glitchslab'],
    accent: ['spire', 'floatChunk', 'voidrift'],
  },
];

/**
 * Inside a geographic band the *place* owns the horizon too (mirrors the decor
 * and ground-scatter overrides, same slot-by-slot boundary flip): the ice field
 * runs past pine stands under white peaks, the dust flats past mesas and dead
 * windpumps, the tunnel closes into broken gallery walls, the bridge crosses
 * water dotted with listing wrecks under snapped suspension towers, and the lava
 * plain smokes below a volcano. The open highway (and any biome without an
 * entry) keeps the act skyline — an empty role list means that band draws
 * nothing there (the tunnel's far horizon is blackness, not buildings).
 */
const BIOME_SILHOUETTES: Partial<Record<BiomeId, Record<Role, readonly SilKind[]>>> = {
  snow: {
    near: ['scrub', 'debris', 'huskWreck', 'scrub'],
    mid: ['pinestand', 'pinestand', 'snag', 'house'],
    far: ['mountain', 'pinestand', 'mountain', 'mesa2'],
    accent: ['mountain', 'pylon', 'pinestand'],
  },
  desert: {
    near: ['scrub', 'debris', 'barrels', 'huskWreck'],
    mid: ['snag', 'house2', 'windmill', 'scrub'],
    far: ['mesa', 'mesa2', 'mountain', 'windmill'],
    accent: ['mesa', 'pylon', 'windmill'],
  },
  tunnel: {
    near: ['tunnelrib'],
    mid: ['tunnelrib', 'rubble'],
    far: [],
    accent: [],
  },
  bridge: {
    near: ['container', 'debris'],
    mid: ['shipwreck', 'container', 'debris'],
    far: ['shipwreck', 'bridgetower', 'shipwreck'],
    accent: ['bridgetower', 'shipwreck'],
  },
  lava: {
    near: ['rubble', 'debris'],
    mid: ['rubble', 'debris', 'rubble'],
    far: ['mountain', 'volcano', 'mountain'],
    accent: ['volcano', 'mountain'],
  },
};

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
 * tower reads as a building with floors. Kept to a few slits per mass to stay
 * inside the silhouette triangle budget.
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

// Wasteland & structures (flat silhouettes, gradient-shaded)

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
  const body = [
    plainBox(9, 36, 9).translate(0, 18, 0),
    plainBox(8, 28, 8).translate(9, 14, -1),
    plainBox(7, 22, 9).translate(-8.5, 11, 1),
    // Rooftop water tank.
    plainCyl(1.4, 1.4, 2, 8).translate(9, 29.8, -1),
    plainCone(1.6, 0.7, 8).translate(9, 31.1, -1),
    plainBox(1.8, 0.8, 1.8).translate(9, 28.4, -1),
    // Rooftop billboard frame.
    plainBox(0.25, 3, 0.25).translate(-2.5, 37.5, 0),
    plainBox(0.25, 3, 0.25).translate(2.5, 37.5, 0),
    plainBox(7.5, 3.8, 0.3).translate(0, 40.5, 0),
    // Shop Awning at Block A base
    plainBox(7.5, 0.25, 1.5).rotateX(0.3).translate(0, 3, 4.8),
    // Parapets
    plainBox(9.2, 0.9, 0.2).translate(0, 36.45, 4.6),
    plainBox(9.2, 0.9, 0.2).translate(0, 36.45, -4.6),
    plainBox(7.2, 0.8, 0.2).translate(-8.5, 22.4, 5.6),
    // Fire escape.
    plainBox(1.2, 0.1, 2.5).translate(-4.6, 8, 2.2),
    plainBox(1.2, 0.1, 2.5).translate(-4.6, 17, -2.2),
    plainBox(1.2, 0.1, 2.5).translate(-4.6, 26, 2.2),
    plainBox(0.15, 0.1, 3.2).rotateX(0.7).translate(-4.6, 12.5, 0),
    plainBox(0.15, 0.1, 3.2).rotateX(-0.7).translate(-4.6, 21.5, 0),
    plainBox(0.1, 28, 0.1).translate(-5.2, 14, 3.4),
    plainBox(0.1, 28, 0.1).translate(-5.2, 14, -3.4),
  ];

  const lights = [
    // Billboard face with warning stripes.
    paint(new THREE.BoxGeometry(7.2, 3.4, 0.05), palette.neonAmber, 0).translate(0, 40.5, 0.2),
    box(1.2, 3.4, 0.08, 0x000000, 0).rotateZ(0.5).translate(-2, 40.5, 0.22),
    box(1.2, 3.4, 0.08, 0x000000, 0).rotateZ(0.5).translate(2, 40.5, 0.22),
    ...winSlits(9, 36, 0, 18, 4.55, 3),
    ...winSlits(7, 22, -8.5, 11, 4.55, 2),
  ];

  return litBuilding(
    body,
    lights,
    palette.structureBase,
    palette.structureHaze,
    43,
  );
}

function skyscraperGeometry(): THREE.BufferGeometry {
  const body = [
    plainBox(12, 35, 12).translate(0, 17.5, 0),
    // Structural columns on the front facade.
    plainBox(0.4, 35, 0.4).translate(-4, 17.5, 6.1),
    plainBox(0.4, 35, 0.4).translate(0, 17.5, 6.1),
    plainBox(0.4, 35, 0.4).translate(4, 17.5, 6.1),
    plainBox(9, 25, 9).translate(0, 47.5, 0),
    plainBox(6.5, 16, 6.5).translate(0, 68, 0),
    plainBox(5, 45, 5).translate(8.5, 22.5, 2),
    // Roof fixtures.
    plainBox(2.2, 1.8, 2.2).translate(-3.5, 35.9, -3.5),
    plainCyl(0.8, 0.8, 0.4, 8).translate(-3.5, 36.9, -3.5),
    plainCyl(1.6, 1.6, 2.4, 8).translate(3, 61.2, 3),
    plainCone(1.8, 0.8, 8).translate(3, 62.8, 3),
    plainBox(2, 1.2, 2).translate(3, 60.6, 3),
    plainCyl(3, 3, 0.15, 10).translate(-2.5, 60.07, -2.5), // Helipad slab
    plainBox(1.8, 1.2, 1.8).translate(-1.5, 76.6, 1.5),
    plainBox(0.3, 16, 0.3).translate(1.5, 84, -1.5),
  ];

  const lights = [
    // Warning light on the antenna tip.
    box(0.45, 0.45, 0.45, palette.trafficRed, 0).translate(1.5, 92.2, -1.5),
    // Helipad mark.
    paint(new THREE.CylinderGeometry(2.4, 2.4, 0.05, 10), 0xdd2a14, 0).translate(-2.5, 60.15, -2.5),
    box(0.2, 0.05, 1.0, 0xffffff, 0).translate(-2.9, 60.18, -2.5),
    box(0.2, 0.05, 1.0, 0xffffff, 0).translate(-2.1, 60.18, -2.5),
    box(0.6, 0.05, 0.2, 0xffffff, 0).translate(-2.5, 60.18, -2.5),
    // Neon sign on the accent block.
    box(0.25, 30, 0.25, palette.neonCyan, 0).translate(8.5, 25, 4.6),
    ...winSlits(12, 35, 0, 17.5, 6.05, 3),
    ...winSlits(9, 25, 0, 47.5, 4.55, 2),
    ...winSlits(5, 45, 8.5, 22.5, 4.55, 1),
  ];

  return litBuilding(
    body,
    lights,
    palette.structureBase,
    palette.structureHaze,
    92,
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

/** A broad multi-peak mountain range for the deep horizon. */
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

/** A cluster of wider, lower buildings. */
function lowriseGeometry(): THREE.BufferGeometry {
  return litBuilding(
    [
      plainBox(14, 16, 12).translate(0, 8, 0),
      plainBox(11, 12, 10).translate(6.5, 6, -2),
      plainBox(10, 21, 9).translate(-6.0, 10.5, 2),
      plainBox(8, 14, 8).translate(2.5, 7, 4),
      // Parapet lip, rooftop AC plant, and a whip antenna on the tall block.
      plainBox(14.4, 0.7, 0.3).translate(0, 16.3, 6.05),
      plainBox(1.8, 1.3, 1.8).translate(-2, 16.9, -2),
      plainBox(1.4, 1.1, 1.4).translate(3.5, 16.7, 2),
      plainCyl(0.3, 0.3, 1.8, 6).translate(1, 16.9, -4),
      plainBox(0.2, 6, 0.2).translate(-6, 24, 2),
    ],
    [
      ...winSlits(14, 16, 0, 8, 6.05, 4),
      ...winSlits(10, 21, -6.0, 10.5, 6.55, 3), // Match compacted offset
      ...winSlits(8, 14, 2.5, 7, 8.05, 2), // Match compacted offset
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

/** A suburban ranch house with a pitched roof, a chimney, a porch, and dark
 *  window recesses — nobody home. */
function houseGeometry(): THREE.BufferGeometry {
  const shell = gradient(
    [
      plainBox(8, 4, 6).translate(0, 2, 0),
      plainBox(8.4, 0.3, 6.4).translate(0, 4, 0), // eaves
      plainBox(4.6, 0.4, 6.6).rotateZ(0.5).translate(-2, 5, 0), // roof slopes
      plainBox(4.6, 0.4, 6.6).rotateZ(-0.5).translate(2, 5, 0),
      plainBox(0.9, 2, 0.9).translate(2.6, 5.4, -1.6), // chimney
      // The porch: a shallow roof on two posts over the door.
      plainBox(3, 0.25, 1.6).rotateX(0.25).translate(-1.5, 3.3, 3.7),
      plainBox(0.25, 2.8, 0.25).translate(-2.6, 1.4, 4.3),
      plainBox(0.25, 2.8, 0.25).translate(-0.4, 1.4, 4.3),
    ],
    palette.structureBase,
    palette.structureHaze,
    6,
  );
  return assemble([
    shell,
    // Dark door and window recesses — proud of the face so they read at range.
    box(1.6, 2.4, 0.35, palette.huskGlass, 0.2).translate(-1.5, 1.2, 3.0),
    box(1.8, 1.3, 0.35, palette.huskGlass, 0.2).translate(2.2, 2.2, 3.0),
    box(1.2, 1.1, 0.35, palette.huskGlass, 0.2).translate(-3.2, 2.3, -3.0),
  ]);
}

/** A water tower on splayed legs with a conical cap. */
function watertowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    plainCyl(3.2, 3.4, 4.6, 12).translate(0, 12.8, 0), // tank
    plainCone(3.6, 2, 12).translate(0, 16, 0), // conical roof
    plainBox(0.4, 3, 0.4).translate(0, 17.5, 0), // finial
    plainCyl(2.6, 3.0, 1.2, 12).translate(0, 10.2, 0), // tapered base of tank
    // Riveted hoops banding the tank.
    plainCyl(3.42, 3.42, 0.2, 12).translate(0, 11.6, 0),
    plainCyl(3.28, 3.28, 0.2, 12).translate(0, 13.9, 0),
  ];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    parts.push(plainBox(0.5, 11, 0.5).rotateZ(sx * 0.07).rotateX(sz * 0.07).translate(sx * 2.2, 5.5, sz * 2.2));
  }
  parts.push(plainBox(5.5, 0.3, 0.3).translate(0, 6, -2.2)); // cross braces
  parts.push(plainBox(5.5, 0.3, 0.3).translate(0, 6, 2.2));
  // The access ladder up a leg to the tank walk.
  parts.push(plainBox(0.12, 9.5, 0.12).translate(3.35, 6.2, 0.3));
  parts.push(plainBox(0.12, 9.5, 0.12).translate(3.35, 6.2, -0.3));
  for (const py of [3, 5, 7, 9] as const) parts.push(plainBox(0.1, 0.1, 0.7).translate(3.35, py, 0));
  return gradient(parts, palette.ridgeBase, palette.ridgeHaze, 18);
}

/** A highway billboard: legs, braced frame, catwalk and lamp hoods — its poster
 *  half torn away, one sheet peeled and hanging. */
function billboardGeometry(): THREE.BufferGeometry {
  const frame = gradient(
    [
      plainBox(0.5, 8, 0.5).translate(-3.5, 4, 0),
      plainBox(0.5, 8, 0.5).translate(3.5, 4, 0),
      plainBox(0.4, 3, 0.4).rotateZ(0.6).translate(-1.6, 6, 0), // braces
      plainBox(0.4, 3, 0.4).rotateZ(-0.6).translate(1.6, 6, 0),
      plainBox(10, 4, 0.4).translate(0, 8.6, 0), // panel
      plainBox(10.6, 0.4, 0.5).translate(0, 10.7, 0), // top trim
      plainBox(10.6, 0.4, 0.5).translate(0, 6.5, 0), // bottom trim
      plainBox(9.5, 0.15, 0.9).translate(0, 6.3, 0.5), // maintenance catwalk
      plainBox(0.15, 1.6, 0.15).translate(-4.6, 7.1, 0.5), // catwalk rail posts
      plainBox(0.15, 1.6, 0.15).translate(4.6, 7.1, 0.5),
      plainBox(9.4, 0.12, 0.12).translate(0, 7.8, 0.5),
      // Lamp hoods craned over the top edge, long dead.
      plainBox(0.7, 0.3, 0.9).rotateX(0.5).translate(-2.5, 11.1, 0.35),
      plainBox(0.7, 0.3, 0.9).rotateX(0.5).translate(2.5, 11.1, 0.35),
    ],
    palette.structureBase,
    palette.structureHaze,
    11,
  );
  return assemble([
    frame,
    // What is left of the poster: a pale sheet over half the panel, one corner
    // peeled loose and hanging over the catwalk.
    box(4.6, 3.2, 0.12, palette.barrierPaint, 0.15).translate(-2.4, 8.6, 0.25),
    paint(
      new THREE.BoxGeometry(2.2, 2.6, 0.08).rotateX(0.4).rotateZ(0.15).translate(1.6, 7.4, 0.55),
      palette.barrierPaint,
      0.3,
    ),
  ]);
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

/** A sheared skyscraper: a snapped stump, a tilted cap, a toppled top, and a neighbor. */
function brokenTowerGeometry(): THREE.BufferGeometry {
  const body = [
    // Intact neighbor (left)
    plainBox(9, 48, 9).translate(-13, 24, 3),
    // Sheared stump (center)
    plainBox(10, 30, 10).translate(0, 15, 0),
    // Exposed floor slabs inside sheared stump
    plainBox(9.6, 0.4, 9.6).translate(0, 10, 0),
    plainBox(9.6, 0.4, 9.6).translate(0, 18, 0),
    plainBox(9.6, 0.4, 9.6).translate(0, 26, 0),
    // Twisted steel rebars extending from concrete
    plainBox(0.12, 4, 0.12).rotateZ(0.3).rotateX(0.1).translate(-3, 31.5, 2),
    plainBox(0.12, 3.2, 0.12).rotateZ(-0.2).rotateX(-0.3).translate(2, 31, -2),
    plainBox(0.12, 5, 0.12).rotateZ(0.15).rotateX(0.4).translate(0, 32, 1),
    // Tilted broken cap
    plainBox(8, 6, 8).rotateZ(0.28).translate(1.4, 33.8, 0.4),
    // Toppled top leaning away
    plainBox(7.2, 22, 7.2).rotateZ(1.1).translate(11, 6.2, 0.5),
    // Rubble piles around the base
    plainBox(5, 2.2, 5).rotateY(0.4).translate(4, 1.1, 4),
    plainBox(4, 1.8, 4).rotateY(-0.3).translate(10, 0.9, -3),
  ];

  const lights = [
    // Glowing fires/embers (orange/red glow) at the shear point
    box(0.8, 0.6, 0.8, palette.meteorCore, 0).translate(-1.5, 29.8, 3.5),
    box(0.6, 0.5, 0.6, palette.meteorCore, 0).translate(2.5, 29.8, -2.5),
    box(0.9, 0.5, 0.5, palette.kaijuGlow, 0).translate(0, 30.1, 1.2),
    // Sparks/glowing embers floating
    box(0.25, 0.25, 0.25, palette.meteorCore, 0).translate(-1.2, 31.5, 3.2),
    box(0.2, 0.2, 0.2, palette.kaijuGlow, 0).translate(2.2, 32.1, -2.2),
    ...winSlits(10, 20, 0, 10, 5.05, 2),
    ...winSlits(9, 48, -13, 24, 7.55, 3),
  ];

  return litBuilding(
    body,
    lights,
    palette.structureBase,
    palette.structureHaze,
    48,
  );
}

// Variants: a second silhouette per common kind, so an act never repeats one
// model down the whole horizon (combined with non-uniform scale + tint).

/** Jagged pointed buttes. */
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

/** A two-storey flat-roof house with an attached garage. */
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

/** A row of grain silos with conical caps. */
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

/** A tighter cluster of taller, more uniform towers. */
function cityBlock2Geometry(): THREE.BufferGeometry {
  const body = [
    plainBox(7, 50, 7).translate(2, 25, 3),
    plainBox(8, 36, 8).translate(-5, 18, -3),
    plainBox(6, 30, 6).translate(6.5, 15, -2),
    plainBox(5, 24, 5).translate(-4, 12, 4.5),
    // Skybridge connecting Block A and B
    plainBox(7.2, 1.8, 1.6).translate(-1.5, 32, 0),
    plainBox(0.2, 2.4, 0.2).rotateZ(0.6).translate(-3.5, 30.5, 0),
    // Radio transmission lattice mast on Block A
    plainBox(0.25, 12, 0.25).translate(2, 56, 3),
    plainBox(1.8, 0.15, 0.15).translate(2, 53, 3),
    plainBox(1.2, 0.15, 0.15).translate(2, 57, 3),
    plainBox(1.8, 0.15, 0.15).rotateZ(0.8).translate(2, 54, 3),
    plainBox(1.8, 0.15, 0.15).rotateZ(-0.8).translate(2, 54, 3),
  ];

  const lights = [
    // Warning beacon on the mast.
    box(0.4, 0.4, 0.4, palette.trafficRed, 0).translate(2, 62.1, 3),
    // Neon logo stripe.
    box(0.2, 22, 0.2, palette.neonPink, 0).translate(-5, 23, 1.15),
    ...winSlits(7, 50, 2, 25, 6.55, 2),
    ...winSlits(8, 36, -5, 18, 1.05, 2),
    ...winSlits(5, 24, -4, 12, 7.05, 1),
  ];

  return litBuilding(
    body,
    lights,
    palette.structureBase,
    palette.structureHaze,
    56,
  );
}

/** A stepped, setback art-deco tower with a spire. */
function skyscraper2Geometry(): THREE.BufferGeometry {
  const body = [
    plainBox(10, 30, 10).translate(0, 15, 0),
    plainBox(8, 24, 8).translate(0, 42, 0),
    plainBox(6, 18, 6).translate(0, 63, 0),
    plainBox(0.6, 10, 0.6).translate(0, 77, 0),
    plainBox(5, 52, 5).translate(-13, 26, -1),
    // Skybridge connecting them
    plainBox(8, 2.4, 2.2).translate(-6.5, 46, -1),
    plainBox(0.3, 3, 0.3).rotateZ(0.5).translate(-10, 44, -1),
    plainBox(0.3, 3, 0.3).rotateZ(-0.5).translate(-3, 44, -1),
    // Rooftop water tank on secondary tower
    plainCyl(1.2, 1.2, 1.8, 8).translate(-13, 53.9, -1),
    plainCone(1.4, 0.6, 8).translate(-13, 55.1, -1),
    plainBox(1.5, 1, 1.5).translate(-13, 52.5, -1),
  ];

  const lights = [
    // Red warning beacons.
    box(0.4, 0.4, 0.4, palette.trafficRed, 0).translate(0, 82.2, 0),
    box(0.4, 0.4, 0.4, palette.trafficRed, 0).translate(-13, 56, -1),
    // Neon diamond logo.
    box(1.8, 1.8, 0.2, palette.neonPink, 0).rotateZ(0.785).translate(0, 69, 3.15),
    ...winSlits(10, 30, 0, 15, 5.05, 3),
    ...winSlits(8, 24, 0, 42, 4.05, 2),
    ...winSlits(5, 52, -13, 26, 1.55, 1),
  ];

  return litBuilding(
    body,
    lights,
    palette.structureBase,
    palette.structureHaze,
    82,
  );
}

/** A chunk of city torn loose and hanging in the air. */
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

/** Low scattered wreckage: broken slabs, a stub, and a chunk of junk. */
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

/** A dead bush, a knot of bare twigs low to the ground. */
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

// Act set-pieces (shaded forms with a baked self-lit glow)

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

/** A towering bipedal war machine, mid-stride: segmented legs on toed pads, hip
 *  pistons, bolted chest plates, exhaust stacks, a cannon arm — reactor, visor,
 *  vents, and muzzle aglow. The Colossus accent's armored half. */
function mechaGeometry(): THREE.BufferGeometry {
  const b = palette.mechaBody;
  const g = palette.mechaGlow;
  const parts: THREE.BufferGeometry[] = [];
  // Legs mid-stride: thigh, knee cap, shin, and a toed foot pad each.
  // Left leg forward.
  parts.push(box(3.0, 6.5, 3.2, b, 0.5).rotateX(0.28).translate(-2.4, 11.4, 1.0)); // thigh
  parts.push(box(2.4, 1.6, 2.6, b, 0.4).rotateX(0.2).translate(-2.4, 8.2, 1.9)); // knee cap
  parts.push(box(2.5, 6.5, 2.7, b, 0.55).rotateX(-0.06).translate(-2.4, 4.6, 2.5)); // shin
  parts.push(box(3.4, 1.5, 4.6, b, 0.5).translate(-2.4, 0.75, 3.2)); // foot
  parts.push(box(1.0, 1.1, 1.3, b, 0.4).translate(-3.4, 0.55, 5.3)); // toes
  parts.push(box(1.0, 1.1, 1.3, b, 0.4).translate(-1.4, 0.55, 5.3));
  // Right leg planted back.
  parts.push(box(3.0, 6.5, 3.2, b, 0.5).rotateX(-0.22).translate(2.4, 11.6, -0.9));
  parts.push(box(2.4, 1.6, 2.6, b, 0.4).translate(2.4, 8.3, -1.7));
  parts.push(box(2.5, 6.8, 2.7, b, 0.55).rotateX(0.1).translate(2.4, 4.6, -2.2));
  parts.push(box(3.4, 1.5, 4.6, b, 0.5).translate(2.4, 0.75, -2.6));
  parts.push(box(1.0, 1.1, 1.3, b, 0.4).translate(1.4, 0.55, -0.5));
  parts.push(box(1.0, 1.1, 1.3, b, 0.4).translate(3.4, 0.55, -0.5));
  // Hips: block, side guards, and the stride pistons into each thigh.
  parts.push(box(7.6, 4.2, 4.6, b, 0.55).translate(0, 15.8, 0)); // hip block
  parts.push(box(1.6, 2.8, 5.0, b, 0.45).translate(-4.4, 15.6, 0)); // hip guards
  parts.push(box(1.6, 2.8, 5.0, b, 0.45).translate(4.4, 15.6, 0));
  parts.push(box(0.7, 4.5, 0.7, b, 0.35).rotateX(0.5).translate(-2.4, 13.4, 2.2)); // pistons
  parts.push(box(0.7, 4.5, 0.7, b, 0.35).rotateX(-0.45).translate(2.4, 13.6, -2.0));
  // Torso: waist joint, chest mass, bolted flank plates, collar.
  parts.push(box(5.4, 2.0, 4.0, b, 0.45).translate(0, 18.4, 0)); // waist
  parts.push(box(9, 7.5, 6, b, 0.6).translate(0, 23, 0)); // chest
  parts.push(box(1.2, 5.5, 4.8, b, 0.5).translate(-5.0, 23, 0)); // flank plates, proud
  parts.push(box(1.2, 5.5, 4.8, b, 0.5).translate(5.0, 23, 0));
  parts.push(box(7.4, 1.2, 5.2, b, 0.5).translate(0, 27.2, 0)); // collar shelf
  // The reactor: a glowing core recessed under a split chest plate.
  parts.push(box(2.8, 2.8, 0.7, g, 0).translate(0, 22.6, 3.05));
  parts.push(box(3.6, 1.0, 0.5, b, 0.45).translate(0, 24.6, 3.2)); // brow plate over it
  // Radiator vents: two dim glow slits low on the chest.
  parts.push(box(1.6, 0.5, 0.5, g, 0.35).translate(-2.8, 20.2, 3.05));
  parts.push(box(1.6, 0.5, 0.5, g, 0.35).translate(2.8, 20.2, 3.05));
  // Back: twin exhaust stacks with dim ember tips.
  parts.push(box(1.3, 4.5, 1.3, b, 0.5).translate(-2.2, 27.5, -2.6));
  parts.push(box(1.3, 4.5, 1.3, b, 0.5).translate(2.2, 27.5, -2.6));
  parts.push(box(0.9, 0.5, 0.9, g, 0.4).translate(-2.2, 29.9, -2.6));
  parts.push(box(0.9, 0.5, 0.9, g, 0.4).translate(2.2, 29.9, -2.6));
  // Shoulders: pauldrons riding over the arm roots.
  parts.push(box(3.6, 2.6, 3.8, b, 0.5).translate(-6.2, 26.2, 0));
  parts.push(box(3.6, 2.6, 3.8, b, 0.5).translate(6.2, 26.2, 0));
  // Left arm: upper, forearm, fist.
  parts.push(box(2.2, 5.5, 2.2, b, 0.45).rotateZ(0.15).translate(-6.8, 22.2, 0));
  parts.push(box(1.9, 5.0, 1.9, b, 0.4).rotateZ(0.3).rotateX(0.3).translate(-7.6, 17.6, 0.9));
  parts.push(box(2.3, 2.0, 2.3, b, 0.5).translate(-8.3, 14.8, 1.6));
  // Right arm carries the cannon: upper arm, then the piece with a ribbed muzzle.
  parts.push(box(2.2, 4.5, 2.2, b, 0.45).rotateZ(-0.3).translate(7.0, 23.0, 0.6));
  parts.push(box(1.8, 1.8, 7.5, b, 0.45).translate(7.8, 20.6, 3.4)); // cannon body
  parts.push(box(2.2, 2.2, 1.2, b, 0.4).translate(7.8, 20.6, 6.6)); // muzzle ring
  parts.push(box(1.1, 1.1, 0.5, g, 0.25).translate(7.8, 20.6, 7.3)); // muzzle glow
  parts.push(box(1.0, 2.4, 3.0, b, 0.4).translate(7.8, 22.6, 1.4)); // ammo feed hump
  // Head: armored cowl, glowing visor slit, sensor mast with a beacon.
  parts.push(box(3.2, 2.6, 3.2, b, 0.55).translate(0, 29.4, 0.4));
  parts.push(box(3.6, 0.9, 3.4, b, 0.5).translate(0, 30.8, 0.2)); // cowl brim
  parts.push(box(2.2, 0.6, 0.5, g, 0).translate(0, 29.5, 2.1)); // visor
  parts.push(box(0.35, 2.6, 0.35, b, 0.4).translate(1.2, 32.2, -0.6)); // mast
  parts.push(box(0.5, 0.5, 0.5, g, 0.2).translate(1.2, 33.6, -0.6)); // beacon
  return assemble(parts);
}

/** A colossal beast, leaning forward mid-prowl: haunched clawed legs, banded
 *  belly, scarred flanks, a fanged head under a heavy brow — maw and a full
 *  dorsal fin row aglow down to the tail. The Colossus accent's living half. */
function kaijuGeometry(): THREE.BufferGeometry {
  const b = palette.kaijuBody;
  const g = palette.kaijuGlow;
  const bone = palette.zombieBone;
  const parts: THREE.BufferGeometry[] = [];
  // Hind legs: haunch, shin, three-clawed feet.
  for (const s of [-1, 1] as const) {
    parts.push(box(3.4, 5.5, 4.6, b, 0.5).rotateX(0.15).translate(s * 2.6, 6.5, -1.2)); // haunch
    parts.push(box(2.4, 4.5, 2.8, b, 0.55).rotateX(-0.2).translate(s * 2.6, 2.8, 0.2)); // shin
    parts.push(box(3.2, 1.6, 4.4, b, 0.5).translate(s * 2.6, 0.8, 1.0)); // foot
    parts.push(box(0.8, 1.0, 1.4, bone, 0.35).translate(s * 2.6 - 1.0, 0.5, 3.2)); // claws
    parts.push(box(0.8, 1.0, 1.4, bone, 0.35).translate(s * 2.6, 0.5, 3.4));
    parts.push(box(0.8, 1.0, 1.4, bone, 0.35).translate(s * 2.6 + 1.0, 0.5, 3.2));
  }
  // Body: deep belly, chest, shoulder hump; pale belly bands, proud scars.
  parts.push(box(6.5, 7.5, 9.5, b, 0.55).rotateX(0.22).translate(0, 11, -1)); // belly barrel
  parts.push(box(5.6, 1.1, 7.5, b, 0.35).rotateX(0.22).translate(0, 7.6, 0.2)); // belly band, paler
  parts.push(box(5.2, 1.0, 6.0, b, 0.3).rotateX(0.22).translate(0, 6.9, 0.8));
  parts.push(box(5.0, 6.0, 5.0, b, 0.5).rotateX(0.4).translate(0, 16.5, 3)); // chest
  parts.push(box(4.6, 3.2, 4.2, b, 0.55).rotateX(0.3).translate(0, 14.2, -3.4)); // shoulder hump
  parts.push(box(0.5, 2.6, 0.7, b, 0.3).rotateZ(0.3).translate(-3.4, 12.5, 1.5)); // flank scars, paler + proud
  parts.push(box(0.5, 2.2, 0.7, b, 0.3).rotateZ(-0.25).translate(3.4, 11.5, -2.0));
  // Forearms: two segments each, cocked, ending in claws.
  for (const s of [-1, 1] as const) {
    parts.push(box(1.3, 3.6, 1.3, b, 0.45).rotateX(0.55).translate(s * 3.2, 15.5, 4.6));
    parts.push(box(1.1, 2.8, 1.1, b, 0.4).rotateX(1.1).translate(s * 3.3, 13.2, 6.0));
    parts.push(box(0.5, 0.5, 1.0, bone, 0.3).translate(s * 3.3, 12.2, 7.0)); // claw
  }
  // Neck in two segments, throat paler.
  parts.push(box(3.4, 4.2, 3.8, b, 0.5).rotateX(0.35).translate(0, 20, 5.2));
  parts.push(box(2.9, 3.4, 3.2, b, 0.45).rotateX(0.3).translate(0, 22.6, 7.2));
  parts.push(box(2.2, 2.6, 0.9, b, 0.3).rotateX(0.35).translate(0, 20.8, 7.3)); // throat
  // Head: skull, heavy brow, snout, jaw ajar with the maw glowing between.
  parts.push(box(3.2, 2.6, 4.4, b, 0.55).translate(0, 25.2, 9.6)); // skull
  parts.push(box(3.5, 1.0, 2.0, b, 0.5).translate(0, 26.6, 10.6)); // brow ridge
  parts.push(box(2.4, 1.4, 2.6, b, 0.5).translate(0, 24.6, 12.4)); // snout
  parts.push(box(2.2, 1.0, 3.6, b, 0.5).rotateX(0.3).translate(0, 22.6, 11.6)); // jaw, dropped open
  parts.push(box(1.9, 0.9, 2.8, g, 0).rotateX(0.15).translate(0, 23.7, 11.8)); // the maw glow between
  // Teeth hanging below the lip line, placed outside the jaw flanks.
  for (const [tx, tz] of [[-1.2, 12.9], [1.2, 12.9], [-1.15, 11.7], [1.15, 11.7]] as const) {
    parts.push(box(0.35, 0.8, 0.35, bone, 0.25).translate(tx, 23.4, tz));
  }
  parts.push(box(0.4, 0.4, 0.4, g, 0.3).translate(-1.5, 25.4, 11.4)); // eye embers
  parts.push(box(0.4, 0.4, 0.4, g, 0.3).translate(1.5, 25.4, 11.4));
  // Tail: four tapering segments swinging low, a bone spike at the tip.
  parts.push(box(3, 3, 6, b, 0.5).rotateX(-0.2).translate(0, 8, -7));
  parts.push(box(2.2, 2.2, 5, b, 0.45).rotateX(-0.32).rotateY(0.15).translate(-0.8, 6, -11.5));
  parts.push(box(1.5, 1.5, 4, b, 0.4).rotateX(-0.42).rotateY(0.3).translate(-2.0, 4.6, -15));
  parts.push(box(0.9, 0.9, 3, b, 0.4).rotateX(-0.5).rotateY(0.45).translate(-3.3, 3.6, -17.6));
  parts.push(box(0.4, 0.4, 1.4, bone, 0.3).rotateY(0.5).translate(-4.2, 3.4, -19.2));
  // The dorsal fin row, glowing, running the spine down onto the tail.
  parts.push(box(0.5, 2.2, 1.0, g, 0).rotateX(0.35).translate(0, 19.8, 2.4));
  parts.push(box(0.6, 2.8, 1.2, g, 0).rotateX(0.3).translate(0, 17.6, -1));
  parts.push(box(0.7, 3.2, 1.3, g, 0).rotateX(0.25).translate(0, 15.6, -4));
  parts.push(box(0.6, 2.6, 1.1, g, 0).rotateX(0.2).translate(0, 12.8, -6.8));
  parts.push(box(0.5, 2.0, 0.9, g, 0).rotateX(-0.25).translate(0, 9.6, -9.6));
  parts.push(box(0.35, 1.4, 0.7, g, 0).rotateX(-0.35).translate(-0.9, 7.4, -12.6));
  parts.push(box(0.25, 1.0, 0.5, g, 0).rotateX(-0.45).translate(-2.1, 5.8, -15.6));
  return assemble(parts);
}

/**
 * Act IV Visitors — an alien spire grown up through the road: a tapering organic
 * shard (not the human `spire`'s toppled boxes) with side growths, a glowing seam
 * running up its front, and a rooted base bulging the ground. Reads as "the
 * invasion took root here", a cousin of the crystal but a full skyline landmark.
 */
function alienSpireGeometry(): THREE.BufferGeometry {
  const b = palette.crystalBody;
  const g = palette.ufoGlow;
  return assemble([
    cone(2.2, 16, 6, b, 0.5).rotateZ(0.06).translate(0, 8, 0), // main shaft
    cone(1.3, 9, 6, b, 0.5).rotateZ(-0.35).translate(2.2, 5, 0.4), // side growths
    cone(0.9, 6, 6, b, 0.5).rotateZ(0.5).translate(-1.8, 3.4, -0.3),
    cyl(2.6, 3.2, 1.1, 6, b, 0.55).translate(0, 0.55, 0), // rooted base bulging the ground
    box(0.32, 12, 0.32, g, 0).rotateZ(0.06).translate(0, 7, 1.35), // glowing seam up the front
    box(0.26, 6, 0.26, g, 0).rotateZ(-0.35).translate(2.1, 5, 1.0),
    box(0.9, 0.9, 0.6, g, 0).translate(0, 14.5, 1.1), // a glowing node near the tip
  ]);
}

/**
 * Act IV Visitors — a striding tripod harvester: three legs splayed from a hub down
 * to the ground, a cowled head pod riding high with a single glowing eye and an
 * underbelly glow ring, and a harvesting tentacle trailing from one flank. The
 * headline accent giant of the invasion (a cousin of the saucer, but walking).
 */
function tripodGeometry(): THREE.BufferGeometry {
  const b = palette.ufoBody;
  const g = palette.ufoGlow;
  const parts: THREE.BufferGeometry[] = [];
  // Three legs (two thigh/shin segments each) splaying from the hub to the ground.
  const feet: readonly [number, number][] = [
    [-7, -2],
    [7, -2],
    [0, 8],
  ];
  for (const [fx, fz] of feet) {
    parts.push(box(1.3, 13, 1.3, b, 0.5).rotateZ(-fx * 0.045).rotateX(-fz * 0.045).translate(fx * 0.5, 10, fz * 0.5));
    parts.push(box(1.0, 8, 1.0, b, 0.45).rotateZ(-fx * 0.08).rotateX(-fz * 0.08).translate(fx * 0.85, 3.5, fz * 0.85));
    parts.push(box(1.9, 0.9, 1.9, b, 0.5).translate(fx, 0.45, fz)); // foot pad
  }
  parts.push(box(4.6, 3.2, 5.6, b, 0.55).translate(0, 17.2, 0.4)); // head pod
  parts.push(cone(3.2, 2.4, 10, b, 0.5).rotateX(Math.PI).translate(0, 15.2, 0.4)); // cowl underside
  parts.push(cyl(2.4, 2.4, 0.35, 12, g, 0).rotateX(Math.PI / 2).translate(0, 15.5, 0.4)); // underbelly glow ring
  parts.push(box(2.0, 1.5, 0.6, g, 0).translate(0, 17.3, 3.4)); // glowing eye
  parts.push(box(0.5, 6, 0.5, b, 0.4).rotateZ(0.3).translate(2.6, 12.8, 2.2)); // harvesting tentacle
  parts.push(box(0.4, 3, 0.4, b, 0.4).rotateZ(0.85).translate(3.7, 9.8, 2.6));
  return assemble(parts);
}

/**
 * Act V Colossus — a footprint the giant stamped into the street: an oval rim of
 * shoved-up rubble with three toe gouges at the front and a car crushed flat in the
 * sole. Ground-level evidence of the accent-band giants, so the near band reads as
 * "one of them walked right here" instead of generic rubble.
 */
function footprintGeometry(): THREE.BufferGeometry {
  const rim: THREE.BufferGeometry[] = [];
  const N = 12;
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const bx = Math.cos(a) * 5;
    const bz = Math.sin(a) * 7;
    rim.push(
      plainBox(1.8, 1.5 + (i % 3) * 0.4, 1.6)
        .rotateY(a)
        .rotateZ((i % 2 ? 1 : -1) * 0.3)
        .translate(bx, 0.7, bz),
    );
  }
  for (const tx of [-3, 0, 3] as const) {
    rim.push(plainBox(1.4, 1.2, 2.6).translate(tx, 0.55, 8.3)); // toe gouges at the front
  }
  const mass = gradient(rim, palette.ridgeBase, palette.ridgeHaze, 3);
  const car = gradient(
    [
      plainBox(1.6, 0.5, 3.1).rotateY(0.2).translate(1.4, 0.25, -1),
      plainBox(1.3, 0.8, 1.4).translate(1.4, 0.55, -1.6), // crushed cabin
    ],
    palette.structureBase,
    palette.structureHaze,
    1.2,
  );
  return assemble([mass, car]);
}

/**
 * Act V Colossus — a skyscraper felled on its side: a short snapped stump and the
 * long tower body lying across the ground (its window rows now running along the
 * up-face), rubble spilled at the break. Distinct from `brokenTower`'s standing
 * stump — this one is fully down, a horizontal mass the giants left behind.
 */
function toppledTowerGeometry(): THREE.BufferGeometry {
  const mass = gradient(
    [
      plainBox(6, 7, 6).translate(0, 3.5, 0), // snapped stump
      plainBox(6.6, 0.8, 6.6).translate(0, 7, 0), // sheared cap
      plainBox(5.5, 5.5, 24).rotateX(0.02).translate(1, 3, 16), // the felled shaft lying +z
      plainBox(5.9, 5.9, 3).translate(1, 3, 27), // crown at the far end
    ],
    palette.structureBase,
    palette.structureHaze,
    8,
  );
  const parts: THREE.BufferGeometry[] = [mass];
  for (let i = 0; i < 6; i += 1) {
    parts.push(box(3.6, 0.3, 0.5, palette.structureWin, 0).translate(1, 5.78, 8 + i * 3.4)); // window rows on the up-face
  }
  parts.push(
    gradient(
      [
        plainBox(2, 1.4, 2).rotateY(0.4).translate(-1, 0.7, 5),
        plainBox(1.4, 1, 1.4).rotateY(-0.3).translate(2.6, 0.5, 6.2),
      ],
      palette.ridgeBase,
      palette.ridgeHaze,
      1.5,
    ), // debris spilled at the break
  );
  return assemble(parts);
}

/**
 * Act VI Static — a slab of the world caught mid-shatter: horizontal bands sheared
 * apart and shoved out of line with clean voids between them, a cold glitch seam
 * glowing on one displaced edge. The Static act's signature "this is not holding
 * together" landmark; matches the ground-decor glitchhusk/glitchpillar language.
 */
function glitchSlabGeometry(): THREE.BufferGeometry {
  const offs = [0, 1.6, -1.1, 2.2, -0.6, 1.2];
  const bands: THREE.BufferGeometry[] = [];
  let y = 0.6;
  for (let i = 0; i < offs.length; i += 1) {
    const bh = 1.2 + (i % 2) * 0.5;
    bands.push(plainBox(5, bh, 4).translate(offs[i], y + bh / 2, 0));
    y += bh + 0.7; // a clean gap between bands
  }
  const mass = gradient(bands, palette.spireBase, palette.spireHaze, y);
  const seam = box(0.3, y - 1.4, 0.35, palette.voidGlow, 0).translate(2.6, y / 2, 2.1);
  return assemble([mass, seam]);
}

/**
 * Act VI Static — a tear in reality standing on the horizon: a near-black rift core
 * rimmed down both edges by a cold glitch glow, with slabs of the world peeling off
 * and hanging frozen in the gap. The accent landmark for "the sky itself is coming
 * apart" — cold and wrong, never a warm threat read.
 */
function voidRiftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(gradient([plainBox(2.2, 26, 1).rotateZ(0.05).translate(0, 13, -0.5)], 0x090a10, 0x14161f, 26)); // rift core
  parts.push(box(0.35, 25, 0.5, palette.voidGlow, 0).rotateZ(0.05).translate(-1.4, 13, 0.2)); // cold glow rims
  parts.push(box(0.35, 25, 0.5, palette.voidGlow, 0).rotateZ(0.05).translate(1.6, 13, 0.2));
  parts.push(
    gradient(
      [
        plainBox(3, 2, 2).rotateZ(0.4).translate(-3.5, 18, 0),
        plainBox(2.2, 1.6, 1.6).rotateZ(-0.5).translate(3.6, 11, 0.5),
        plainBox(1.6, 3, 1.4).rotateZ(0.7).translate(-3, 7, -0.3),
      ],
      palette.spireBase,
      palette.spireHaze,
      20,
    ), // slabs peeling off, hanging in the tear
  );
  return assemble(parts);
}

// Biome horizon set (2026-07-07): the geographic band re-skins the backdrop the
// same way it re-skins the verge, so the place owns the whole frame.

/** A stand of snow-loaded conifers: three trunks of stacked bough tiers, the
 *  top tiers capped pale where the snow sits (Ice Fields). */
function pineStandGeometry(): THREE.BufferGeometry {
  const t = palette.pineTrunk;
  const b = palette.pineBough;
  const s = palette.snowBody;
  const parts: THREE.BufferGeometry[] = [];
  const pine = (x: number, z: number, h: number): void => {
    parts.push(cyl(0.18, 0.3, h * 0.35, 5, t, 0.5).translate(x, h * 0.16, z));
    const tiers = 4;
    for (let i = 0; i < tiers; i += 1) {
      const f = i / (tiers - 1);
      const r = 1.9 - f * 1.25;
      const y = h * (0.3 + f * 0.55);
      parts.push(cone(r, h * 0.3, 7, b, 0.5 - f * 0.1).translate(x, y, z));
      // Snow load riding the upper tiers.
      if (f > 0.3) parts.push(cone(r * 0.72, h * 0.12, 7, s, 0.25).translate(x, y + h * 0.09, z));
    }
    parts.push(cone(0.35, h * 0.16, 6, s, 0.2).translate(x, h * 0.92, z)); // the capped tip
  };
  pine(0, 0, 9);
  pine(2.6, 1.4, 6.5);
  pine(-2.2, -1.0, 7.5);
  return assemble(parts);
}

/** A broken tunnel gallery wall: a long concrete run with an arched rib, a dead
 *  lamp bracket, spalled panels and a rubble slump at its foot (The Tunnel).
 *  Authored with its face on +x so `faceRoad` points it at the corridor; the
 *  slot gaps read as collapsed sections of the gallery. */
function tunnelRibGeometry(): THREE.BufferGeometry {
  const wall = gradient(
    [
      plainBox(1.2, 8, 13).translate(0, 4, 0), // the gallery wall run
      plainBox(1.6, 9, 1.6).translate(0, 4.5, -4), // the rib pillar, proud
      plainBox(1.6, 9, 1.6).translate(0, 4.5, 4.5),
      plainBox(2.0, 1.2, 13.4).translate(0, 8.4, 0), // the arched springing line
      // Spalled panel faces standing proud of the wall.
      plainBox(0.3, 3.2, 3.4).translate(0.62, 3.4, -1.2),
      plainBox(0.3, 2.4, 2.6).translate(0.62, 5.6, 2.2),
    ],
    palette.structureBase,
    palette.structureHaze,
    9,
  );
  return assemble([
    wall,
    // A dead sodium lamp bracket craned off the rib, and the rubble slump.
    box(0.9, 0.25, 0.35, palette.tunnelLampDead, 0.35).translate(1.3, 7.2, -4),
    box(0.3, 0.5, 0.3, palette.tunnelLampDead, 0.45).translate(1.7, 6.9, -4),
    paint(new THREE.BoxGeometry(1.6, 1.4, 3.2).rotateZ(0.4).translate(1.1, 0.5, 1.6), palette.barrierCore, 0.55),
  ]);
}

/** A suspension-bridge tower out on the water, its span gone: two legs under a
 *  portal cap, cross-braced, the snapped main cables drooping off both sides
 *  (Broken Bridge). Faces the corridor so the portal reads as a gate. */
function bridgeTowerGeometry(): THREE.BufferGeometry {
  const s = palette.bridgeSteel;
  const d = palette.bridgeSteelDark;
  return assemble([
    // Legs spanning z (the drive direction), braced twice.
    box(2.2, 38, 2.6, d, 0.5).translate(0, 19, -6),
    box(2.2, 38, 2.6, d, 0.5).translate(0, 19, 6),
    box(1.4, 2.2, 12.5, s, 0.45).translate(0, 14, 0), // lower brace
    box(1.4, 2.2, 12.5, s, 0.45).translate(0, 27, 0), // upper brace
    box(2.8, 3.2, 16, d, 0.55).translate(0, 39.5, 0), // the portal cap
    // The snapped main cables drooping off the saddles.
    box(0.5, 0.5, 9, s, 0.35).rotateX(0.55).translate(0, 36.5, 10),
    box(0.5, 0.5, 7, s, 0.35).rotateX(-0.6).translate(0, 37, -9.5),
    // A hanging deck shred still swinging from one cable stub.
    box(0.25, 4.5, 0.25, s, 0.3).translate(0, 31, 12.6),
    box(2.6, 0.6, 3.2, d, 0.45).translate(0, 28.5, 12.6),
  ]);
}

/** A listing cargo ship, beached in the shallows: raked hull, island
 *  superstructure with a tilted funnel, spilled deck containers (Broken
 *  Bridge). Every wreck lists its own way via the stretch scale. */
function shipwreckGeometry(): THREE.BufferGeometry {
  const hull = gradient(
    [
      plainBox(6, 5, 26).rotateZ(0.14).translate(0, 2.2, 0), // the hull, heeled over
      plainBox(5.4, 2.4, 5).rotateZ(0.14).rotateY(0.25).translate(0.4, 3.4, 14), // raked bow block
      plainBox(6.4, 0.8, 20).rotateZ(0.14).translate(0, 5.2, -2), // deck lip
      plainBox(4.4, 6, 4.6).rotateZ(0.14).translate(0.8, 8, -8), // island superstructure
      plainBox(4.8, 1.0, 5.0).rotateZ(0.14).translate(0.9, 11.2, -8), // bridge deck
      plainBox(1.6, 3.4, 1.6).rotateZ(0.34).translate(1.6, 12.5, -10), // funnel, tilted
    ],
    palette.bridgeSteelDark,
    palette.bridgeSteel,
    13,
  );
  return assemble([
    hull,
    // Containers spilled across the heeled deck, one overboard.
    box(1.4, 1.3, 3.4, palette.containerBase, 0.4).rotateZ(0.3).translate(1.6, 6.2, 3),
    box(1.4, 1.3, 3.4, palette.containerHaze, 0.45).rotateZ(0.2).rotateY(0.4).translate(-0.4, 6.0, 6.5),
    box(1.4, 1.3, 3.4, palette.containerBase, 0.5).rotateZ(1.2).translate(-4.2, 0.8, 8),
    // The dark bridge glazing strip.
    box(3.8, 0.9, 0.4, palette.huskGlass, 0.2).rotateZ(0.14).translate(1.5, 10.4, -5.8),
  ]);
}

/** A shield volcano on the horizon, the lava plain's source: broad stacked cone,
 *  a parasitic vent, the crater rim lit dim-hot with a streak bleeding down the
 *  flank (Lava Fields). */
function volcanoGeometry(): THREE.BufferGeometry {
  const rock = gradient(
    [
      plainCone(30, 26, 9).translate(0, 13, 0), // the main shield
      plainCone(18, 20, 8).translate(4, 22, -2), // the upper cone, offset
      plainCone(7, 9, 7).translate(-14, 4.5, 8), // a parasitic vent on the skirt
    ],
    palette.basaltDark,
    palette.basaltCool,
    32,
  );
  return assemble([
    rock,
    // The crater rim, dim hot, and the flank streak bleeding from a notch.
    paint(new THREE.CylinderGeometry(5.2, 6.4, 1.6, 9, 1, true), palette.emberVein, 0.2).translate(4, 31.5, -2),
    box(1.6, 12, 1.2, palette.emberVein, 0.35).rotateZ(0.42).translate(11, 22, -1),
    box(1.1, 8, 1.0, palette.emberVein, 0.4).rotateZ(0.55).translate(16, 13, 0.5),
    // The vent's own small hot mouth.
    paint(new THREE.CylinderGeometry(1.4, 1.9, 0.8, 7, 1, true), palette.emberVein, 0.35).translate(-14, 8.7, 8),
  ]);
}

// Act-coherent roadside clutter (the near band, per act)

/** A burnt-out car shell rusting on the shoulder. */
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

/** A cluster of rusted oil drums, one toppled. */
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

/** Shipping containers, one stacked askew on another: corner posts break the
 *  clean box read, one door dropped flat in the dirt. */
function containerGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(2.6, 2.6, 6.0).translate(0, 1.3, 0),
      plainBox(2.5, 2.5, 5.8).rotateY(0.18).translate(0.6, 3.9, 0.8), // stacked, shifted
      // Proud corner posts on the lower box.
      plainBox(0.3, 2.7, 0.3).translate(1.25, 1.35, 2.9),
      plainBox(0.3, 2.7, 0.3).translate(-1.25, 1.35, 2.9),
      plainBox(0.3, 2.7, 0.3).translate(1.25, 1.35, -2.9),
      // A door torn off, lying flat against the base.
      plainBox(1.2, 0.12, 2.4).rotateY(0.5).translate(2.2, 0.06, 1.8),
      // Lock bars proud of the end face.
      plainBox(0.12, 2.4, 0.12).translate(0.5, 1.3, 3.05),
      plainBox(0.12, 2.4, 0.12).translate(-0.5, 1.3, 3.05),
    ],
    palette.containerBase,
    palette.containerHaze,
    6.4,
  );
}

// Act II suburbia silhouettes: the Rust act's dead farmland edge. No lit windows
// out here — the power went with the people.

/** A gambrel barn with one roof panel caved in, its silo alongside, the big
 *  doors ajar. */
function barnGeometry(): THREE.BufferGeometry {
  return gradient(
    [
      plainBox(10, 6, 8).translate(0, 3, 0),
      // Gambrel roof: steep lower panels, shallow upper — one upper panel caved.
      plainBox(3.4, 0.4, 8.4).rotateZ(0.95).translate(-4.2, 7.2, 0),
      plainBox(3.4, 0.4, 8.4).rotateZ(-0.95).translate(4.2, 7.2, 0),
      plainBox(3.4, 0.4, 8.4).rotateZ(0.35).translate(-1.6, 8.7, 0),
      plainBox(3.4, 0.4, 8.0).rotateZ(-0.12).translate(1.5, 7.9, 0), // dropped panel
      // The grain silo alongside.
      plainCyl(1.6, 1.6, 9, 10).translate(7.5, 4.5, -1),
      plainCone(1.8, 1.4, 10).translate(7.5, 9.7, -1),
      // Big doors ajar and the hay-loft opening above them.
      plainBox(2.4, 3.6, 0.3).rotateY(0.3).translate(-1, 1.8, 4.2),
      plainBox(1.6, 1.4, 0.3).translate(0, 5.4, 4.05),
    ],
    palette.ridgeBase,
    palette.ridgeHaze,
    10,
  );
}

/** A farm windpump: pinched lattice tower, multi-blade rotor and tail vane, one
 *  blade snapped off at the base. */
function windmillGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Four legs pinching toward the head, with two girt rings.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    parts.push(
      plainBox(0.24, 12, 0.24)
        .rotateZ(-sx * 0.075)
        .rotateX(sz * 0.075)
        .translate(sx * 0.95, 6, sz * 0.95),
    );
  }
  parts.push(plainBox(2.4, 0.2, 0.2).translate(0, 4, 1.15));
  parts.push(plainBox(2.4, 0.2, 0.2).translate(0, 4, -1.15));
  parts.push(plainBox(0.2, 0.2, 2.4).translate(-1.15, 8, 0));
  parts.push(plainBox(0.2, 0.2, 2.4).translate(1.15, 8, 0));
  // The head: hub and the blade ring (one blade missing), plus the tail vane.
  parts.push(plainBox(0.6, 0.6, 0.7).translate(0, 12.4, 0.3));
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 8) * TWO_PI;
    const blade = plainBox(0.42, 2.2, 0.08).translate(0, 1.35, 0);
    blade.rotateZ(a);
    blade.translate(0, 12.4, 0.62);
    parts.push(blade);
  }
  parts.push(plainBox(2.4, 0.9, 0.12).rotateY(0.25).translate(1.5, 12.4, -0.5)); // tail vane
  // The snapped-off blade dead in the dirt below.
  parts.push(plainBox(0.42, 2.0, 0.08).rotateX(1.5).rotateY(0.5).translate(1.0, 0.08, 1.4));
  return gradient(parts, palette.snagBase, palette.snagHaze, 14);
}

/** A roadside motel: the room strip under its walkway canopy, the office block,
 *  and the tall highway sign — its face blank, its neon long dead. */
function motelGeometry(): THREE.BufferGeometry {
  const shell = gradient(
    [
      plainBox(18, 4.5, 7).translate(0, 2.25, 0), // room strip
      plainBox(18.4, 0.5, 7.6).translate(0, 4.75, 0), // flat roof lip
      plainBox(18, 0.3, 1.8).translate(0, 3.4, 4.2), // walkway canopy
      plainBox(0.22, 3.4, 0.22).translate(-7.5, 1.7, 4.9),
      plainBox(0.22, 3.4, 0.22).translate(-3.75, 1.7, 4.9),
      plainBox(0.22, 3.4, 0.22).translate(0, 1.7, 4.9),
      plainBox(0.22, 3.4, 0.22).translate(3.75, 1.7, 4.9),
      plainBox(0.22, 3.4, 0.22).translate(7.5, 1.7, 4.9),
      plainBox(5, 6, 6).translate(11, 3, -0.5), // office block
      // The highway sign: pole, main panel, the smaller VACANCY tab.
      plainBox(0.5, 9, 0.5).translate(-11.5, 4.5, 2),
      plainBox(4.2, 3.2, 0.5).translate(-11.5, 10, 2),
      plainBox(2.6, 1.0, 0.55).translate(-11.5, 7.8, 2),
    ],
    palette.structureBase,
    palette.structureHaze,
    12,
  );
  return assemble([
    shell,
    // The sign faces, bleached blank — no neon left to light them.
    box(3.6, 2.6, 0.1, palette.barrierPaint, 0.2).translate(-11.5, 10, 2.28),
    box(2.2, 0.7, 0.1, palette.barrierPaint, 0.25).translate(-11.5, 7.8, 2.31),
    // Dark room doors down the strip.
    box(1.0, 2.2, 0.2, palette.huskGlass, 0.2).translate(-5.5, 1.1, 3.55),
    box(1.0, 2.2, 0.2, palette.huskGlass, 0.2).translate(-1.5, 1.1, 3.55),
    box(1.0, 2.2, 0.2, palette.huskGlass, 0.2).translate(2.5, 1.1, 3.55),
    box(1.0, 2.2, 0.2, palette.huskGlass, 0.2).translate(6.5, 1.1, 3.55),
  ]);
}

// Act I city silhouettes: the day-one skyline. Lit signage and windows read as
// "the power is still on" — the city is dying, not dead yet.

/** A commercial storefront strip: parapet block, stepped sign band still lit,
 *  awnings over the glazing line, rooftop AC — the shopping street they fled. */
function storefrontGeometry(): THREE.BufferGeometry {
  const body = [
    plainBox(16, 7, 8).translate(0, 3.5, 0),
    plainBox(16.4, 0.8, 8.4).translate(0, 7.2, 0), // parapet cap
    plainBox(5, 2.5, 8.2).translate(-5, 8.4, 0), // stepped sign block over the anchor unit
    // Awnings over the glazing line, one per unit.
    plainBox(4.6, 0.25, 1.6).rotateX(0.35).translate(-5, 3.1, 4.4),
    plainBox(4.6, 0.25, 1.6).rotateX(0.35).translate(0.2, 3.1, 4.4),
    plainBox(4.6, 0.25, 1.6).rotateX(0.35).translate(5.2, 3.1, 4.4),
    // Rooftop AC units and a vent stack.
    plainBox(1.6, 1.2, 1.6).translate(3, 8.2, -1),
    plainBox(1.2, 1.0, 1.2).translate(6, 8.1, 1.5),
    plainCyl(0.35, 0.35, 2.2, 6).translate(-1.5, 8.7, -2),
    // One unit already boarded blind.
    plainBox(3.6, 2.2, 0.3).translate(5.2, 1.6, 4.05),
  ];
  const lights = [
    // The anchor unit's sign band, still burning.
    box(4.2, 1.2, 0.25, palette.structureWin, 0).translate(-5, 8.6, 4.15),
    ...winSlits(16, 4, 0, 2.0, 4.05, 5),
  ];
  return litBuilding(body, lights, palette.structureBase, palette.structureHaze, 10);
}

/** A terrace of gabled rowhouses: three party-wall units, chimneys, stoops, one
 *  window still lit — somebody stayed. */
function rowhousesGeometry(): THREE.BufferGeometry {
  const body: THREE.BufferGeometry[] = [];
  for (const px of [-5, 0, 5] as const) {
    body.push(plainBox(5, 7, 7).translate(px, 3.5, 0));
    body.push(plainBox(2.9, 0.35, 7.4).rotateZ(0.55).translate(px - 1.25, 7.6, 0));
    body.push(plainBox(2.9, 0.35, 7.4).rotateZ(-0.55).translate(px + 1.25, 7.6, 0));
    body.push(plainBox(0.7, 1.8, 0.7).translate(px + 1.6, 8.3, -1.8)); // chimney
    body.push(plainBox(1.2, 2, 0.3).translate(px - 1, 1, 3.55)); // door
    body.push(plainBox(2, 0.5, 1.2).translate(px - 1, 0.25, 4.2)); // stoop
  }
  const lights = [box(0.6, 1.0, 0.3, palette.structureWin, 0).translate(0.9, 4.6, 3.5)];
  return litBuilding(body, lights, palette.structureBase, palette.structureHaze, 9);
}

/** A filling station: kiosk, canopy on columns over two pump islands, and the
 *  price totem — fascia and totem still lit for nobody. */
function gasStationGeometry(): THREE.BufferGeometry {
  const body = [
    plainBox(5, 3.2, 4).translate(-3.5, 1.6, -3), // kiosk at the back
    plainBox(5.3, 0.5, 4.3).translate(-3.5, 3.35, -3),
    plainBox(10.5, 0.7, 6.5).translate(0, 5.2, 0), // canopy
    plainBox(0.55, 5, 0.55).translate(-2.6, 2.5, 0), // columns
    plainBox(0.55, 5, 0.55).translate(2.6, 2.5, 0),
    plainBox(0.9, 1.5, 0.6).translate(-1.2, 0.75, 0.8), // pumps
    plainBox(0.9, 1.5, 0.6).translate(1.6, 0.75, 0.8),
    plainBox(1.6, 0.3, 1.0).translate(-1.2, 0.15, 0.8), // island kerbs
    plainBox(1.6, 0.3, 1.0).translate(1.6, 0.15, 0.8),
    plainBox(0.5, 6.5, 0.5).translate(6.2, 3.25, 1), // price totem
    plainBox(2.4, 2.6, 0.5).translate(6.2, 7.4, 1),
  ];
  const lights = [
    box(9.8, 0.35, 0.25, palette.structureWin, 0).translate(0, 5.15, 3.3), // canopy fascia
    box(1.9, 0.8, 0.2, palette.structureWin, 0).translate(6.2, 7.9, 1.28), // totem brand
    box(2.6, 1.1, 0.25, palette.structureWin, 0).translate(-3.5, 2.2, -0.85), // kiosk glazing
  ];
  return litBuilding(body, lights, palette.structureBase, palette.structureHaze, 8.5);
}

/** A multi-storey parking garage: open deck slabs on columns (the banded
 *  silhouette), a stair core past the roof, cars abandoned on the top deck. */
function parkingGarageGeometry(): THREE.BufferGeometry {
  const body: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 5; f += 1) body.push(plainBox(16, 0.9, 10).translate(0, 1 + f * 3, 0));
  for (const px of [-7.4, -2.5, 2.5, 7.4] as const)
    body.push(plainBox(0.7, 13, 0.7).translate(px, 6.5, 4.4));
  for (const px of [-7.4, 2.5] as const) body.push(plainBox(0.7, 13, 0.7).translate(px, 6.5, -4.4));
  body.push(plainBox(4, 16.4, 5).translate(8.5, 8.2, -2)); // stair core past the roof
  body.push(plainBox(16.2, 0.5, 0.3).translate(0, 13.7, 5.05)); // roof parapet
  // Cars abandoned on the top deck, mid-queue for a ramp that jammed.
  body.push(plainBox(1.7, 0.8, 3.2).translate(-3, 13.85, 1));
  body.push(plainBox(1.7, 0.8, 3.2).rotateY(0.4).translate(2, 13.85, -2));
  const lights = [
    // One deck's sodium strip still on.
    box(6, 0.5, 0.2, palette.structureWin, 0).translate(-2, 7.6, 5.05),
  ];
  return litBuilding(body, lights, palette.structureBase, palette.structureHaze, 17);
}

/** A tower crane over a half-built frame: open floor slabs on corner columns,
 *  the mast, jib and counterweight, the hook still hanging where the shift
 *  ended. Red beacon lit. */
function craneTowerGeometry(): THREE.BufferGeometry {
  const body: THREE.BufferGeometry[] = [];
  // The half-built frame: corner columns and open slabs, the top one askew.
  for (const px of [-4, 4] as const)
    for (const pz of [-4, 4] as const) body.push(plainBox(0.8, 26, 0.8).translate(px, 13, pz));
  for (let f = 0; f < 5; f += 1) body.push(plainBox(9.6, 0.6, 9.6).translate(0, 3 + f * 5.5, 0));
  body.push(plainBox(9.6, 0.6, 9.6).rotateZ(0.07).translate(0.3, 27.5, 0));
  // The crane: mast, cab, jib + counter-jib, counterweight, apex ties, hook line.
  body.push(plainBox(1.4, 44, 1.4).translate(9, 22, 0));
  body.push(plainBox(2.2, 2, 2.2).translate(9, 45, 0)); // cab
  body.push(plainBox(20, 0.9, 0.9).translate(19, 46.4, 0)); // jib
  body.push(plainBox(7, 1.1, 1.1).translate(5, 46.4, 0)); // counter-jib
  body.push(plainBox(2.2, 2.4, 1.8).translate(2.2, 45.2, 0)); // counterweight
  body.push(plainBox(0.5, 3, 0.5).translate(9, 48.5, 0)); // apex
  body.push(plainBox(11, 0.25, 0.25).rotateZ(-0.32).translate(14.5, 48.2, 0)); // ties
  body.push(plainBox(7, 0.25, 0.25).rotateZ(0.55).translate(5.6, 48.4, 0));
  body.push(plainBox(0.12, 10, 0.12).translate(24, 41, 0)); // hook cable
  body.push(plainBox(0.9, 1.1, 0.9).translate(24, 35.6, 0)); // hook block
  const lights = [
    box(0.5, 0.5, 0.5, palette.trafficRed, 0).translate(9, 50.2, 0), // beacon
    ...winSlits(9.6, 4, 0, 5.8, 4.85, 2), // a work lamp burning on one open floor
  ];
  return litBuilding(body, lights, palette.structureBase, palette.structureHaze, 50);
}

/** A cluster of alien crystal shards with a glowing core. */
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
  storefront: storefrontGeometry,
  rowhouses: rowhousesGeometry,
  gasstation: gasStationGeometry,
  parkinggarage: parkingGarageGeometry,
  cranetower: craneTowerGeometry,
  barn: barnGeometry,
  windmill: windmillGeometry,
  motel: motelGeometry,
  alienspire: alienSpireGeometry,
  tripod: tripodGeometry,
  footprint: footprintGeometry,
  toppledtower: toppledTowerGeometry,
  glitchslab: glitchSlabGeometry,
  voidrift: voidRiftGeometry,
  pinestand: pineStandGeometry,
  tunnelrib: tunnelRibGeometry,
  bridgetower: bridgeTowerGeometry,
  shipwreck: shipwreckGeometry,
  volcano: volcanoGeometry,
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

  update(distance: number, dt: number, elevation: Elevation): void {
    this.time += dt;
    for (const kind of KINDS) this.counts[kind] = 0;

    const blend = actBlendAt(distance);
    const last = ACTS.length - 1;
    const ai = blend.index;
    const bi = Math.min(ai + 1, last);
    const t = blend.t;

    this.fill(NEAR, 'near', distance, ai, bi, t, elevation);
    this.fill(MID, 'mid', distance, ai, bi, t, elevation);
    this.fill(FAR, 'far', distance, ai, bi, t, elevation);
    this.fill(ACCENT, 'accent', distance, ai, bi, t, elevation);

    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      const n = this.counts[kind];
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private fill(
    band: Band,
    role: Role,
    distance: number,
    ai: number,
    bi: number,
    t: number,
    elevation: Elevation,
  ): void {
    const first = Math.floor((distance - band.spacing) / band.spacing);
    const last = Math.ceil((distance + band.reach) / band.spacing);

    for (let slot = first; slot <= last; slot += 1) {
      for (const side of SIDES) {
        const key = band.salt + slot * 4 + (side < 0 ? 0 : 2);
        if (this.rand(key, 1) < band.skip) continue;

        const worldZ = slot * band.spacing + (this.rand(key, 2) - 0.5) * band.jitterZ;

        // Across a transition, each slot flips to the next act's catastrophe at
        // its own threshold — the world rebuilds gradually, never all at once.
        const act = t > 0 && this.rand(key, 7) < t ? bi : ai;
        // The geographic band then overrides the act (mirroring the decor and
        // ground-scatter overrides, same slot-by-slot boundary flip): inside a
        // biome the place owns the backdrop too. An empty role list draws
        // nothing — the tunnel's far horizon is blackness, not buildings.
        const bandIdx = Math.floor(Math.max(0, worldZ) / BIOME_BAND_M);
        const local = Math.max(0, worldZ) - bandIdx * BIOME_BAND_M;
        const inBlend = bandIdx > 0 && local < BIOME_TRANSITION_M;
        const useBand =
          inBlend && this.rand(key, 15) >= local / BIOME_TRANSITION_M ? bandIdx - 1 : bandIdx;
        const biomeSil = BIOME_SILHOUETTES[biomeForBand(this.seed, useBand).id];
        const choices = biomeSil ? biomeSil[role] : ACT_SILHOUETTES[act][role];
        if (choices.length === 0) continue;
        const kind = choices[Math.min(choices.length - 1, Math.floor(this.rand(key, 8) * choices.length))];
        const n = this.counts[kind];
        if (n >= CAP) continue;

        const meta = KIND_META[kind];
        // Ride the road's vertical profile so a silhouette is planted on the
        // undulating ground at its forward, not floating at a fixed height that
        // the terrain rises out of and sinks under as the hills scroll past.
        let y = meta.elevation + elevation.yAt(worldZ, distance);
        if (meta.elevJitter > 0) y += this.rand(key, 9) * meta.elevJitter;
        if (meta.bob > 0) y += Math.sin(this.time * BOB_SPEED + this.rand(key, 10) * TWO_PI) * meta.bob;

        const x = side * (band.xMin + this.rand(key, 3) * (band.xMax - band.xMin));
        const base = band.scaleMin + this.rand(key, 4) * (band.scaleMax - band.scaleMin);
        // A facing kind points its authored front (+x) at the corridor; anything
        // else takes a random yaw for variety.
        const yaw = meta.faceRoad ? (side < 0 ? 0 : Math.PI) : this.rand(key, 5) * TWO_PI;
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
