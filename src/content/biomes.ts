/**
 * Biomes — the geographic layer (docs/DESIGN.md → the Last Driver direction:
 * environments change so the run never reads the same). This is a second axis,
 * orthogonal to the apocalypse `acts`: acts escalate the *threat* over the whole
 * run (zombies → aliens → giants), biomes change the *place* in shorter bands (open
 * road, ice fields, dust flats, and more to come: tunnels, bridges, lava). A run
 * might cross an ice field during the Swarm act, so the two compose rather than
 * replace.
 *
 * Pure data plus pure helpers (no Three.js, no DOM, no `Date.now`): the sim reads
 * the handling modifiers, the renderer reads the look, and both derive everything
 * from `(seed, distance)` so the same seed always lays the same biomes.
 *
 * A biome carries handling modifiers (a deliberate, telegraphed exception to
 * "terrain never touches the controls", user-approved): `steerOmegaMul` slows the
 * steering response and `steerDampingMul` below 1 underdamps the lateral spring, so
 * the car slides and overshoots its lane — the snow "derrape". Damage still never
 * touches the controls; only the biome does, and it reads coming from the look and
 * the entry banner. It also carries a `look` (the colors the renderer blends over
 * the act mood by `look.amount`) and a `precip` (falling-particle density).
 */

export type BiomeId = 'highway' | 'snow' | 'desert' | 'tunnel' | 'bridge' | 'lava';

/**
 * A biome's art direction, as hex colors the renderer blends over the live act mood
 * by `amount` (0 = the act's own look, 1 = fully this biome). Colors are plain hex
 * numbers so this module stays free of Three.js; the renderer turns them into reused
 * `THREE.Color`s with no per-frame allocation.
 */
export interface BiomeLook {
  /** Blend strength over the act mood (0..1). */
  readonly amount: number;
  readonly fog: number;
  readonly sky: number;
  readonly key: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly ground: number;
  /**
   * Multipliers on the base fog near/far distance (1 = the act's default sightline).
   * A tunnel pulls the haze in tight (< 1) so threats appear late and there is less
   * room to react; open desert pushes it out. Eased in by `amount` like the colors.
   */
  readonly fogNearMul: number;
  readonly fogFarMul: number;
}

export interface Biome {
  readonly id: BiomeId;
  /** Shown on the entry banner when the run crosses into this biome. */
  readonly name: string;
  /** Steering natural-frequency multiplier (1 = normal; < 1 = a slower, looser wheel). */
  readonly steerOmegaMul: number;
  /** Lateral-spring damping multiplier (1 = critically damped; < 1 = underdamped slide). */
  readonly steerDampingMul: number;
  /** Falling-particle density (0 = clear; snow uses it for snowfall). */
  readonly precip: number;
  readonly look: BiomeLook;
  /**
   * Multiplier on the selection weight of jump/gap formations in world gen (1 = no
   * bias). A broken bridge or a lava field is mostly holes you leap, so it boosts the
   * formations that carry a gap/crackgap/ramp. Read by `src/sim/world.ts`.
   */
  readonly jumpBias: number;
  /**
   * Earliest band this biome can appear in. The weirder, harder biomes (bridge over
   * the ocean, lava chasms) hold off until the run is deep, keeping the opening acts
   * the intact teaching ground (and the early-acts-gap-free invariant true).
   */
  readonly minBand: number;
  /** Selection weight once past the opening band (and its `minBand`). */
  readonly weight: number;
}

/** A look that does nothing (amount 0) — the open road and the render default. */
export const NEUTRAL_LOOK: BiomeLook = {
  amount: 0,
  fog: 0x808080,
  sky: 0x808080,
  key: 0x808080,
  hemiSky: 0x808080,
  hemiGround: 0x808080,
  ground: 0x808080,
  fogNearMul: 1,
  fogFarMul: 1,
};

export const BIOMES: readonly Biome[] = [
  // Open road: the neutral default. Normal grip, no whiteout. The run always opens
  // here so the controls are learned on clean tarmac before the world gets weird.
  {
    id: 'highway',
    name: 'OPEN ROAD',
    steerOmegaMul: 1,
    steerDampingMul: 1,
    precip: 0,
    look: NEUTRAL_LOOK,
    jumpBias: 1,
    minBand: 1,
    weight: 3,
  },
  // Ice fields: the car slides. A slower, underdamped wheel means lane changes drift
  // and overshoot, so you commit earlier and feather the line. Cold whiteout look and
  // falling snow. Capped below 1 so the act's tone still bleeds through.
  {
    id: 'snow',
    name: 'ICE FIELDS',
    steerOmegaMul: 0.82,
    steerDampingMul: 0.6,
    precip: 1,
    look: {
      amount: 0.86,
      fog: 0xc9d4e2,
      sky: 0xb9c6d8,
      key: 0xeef3fb,
      hemiSky: 0xcdd9ea,
      hemiGround: 0xaab6c4,
      ground: 0xdde6ef,
      // The whiteout shortens the sightline a little.
      fogNearMul: 0.9,
      fogFarMul: 0.78,
    },
    jumpBias: 1,
    minBand: 1,
    weight: 2,
  },
  // Dust flats: an arid, sun-baked stretch. No handling change (the grip is fine),
  // just a warm hazy look — tan haze on the horizon, bright key light, sand floor.
  // The variety beat between the weirder biomes.
  {
    id: 'desert',
    name: 'DUST FLATS',
    steerOmegaMul: 1,
    steerDampingMul: 1,
    precip: 0,
    look: {
      amount: 0.7,
      fog: 0xc6a468,
      sky: 0xd4b070,
      key: 0xffe6ac,
      hemiSky: 0xe6c488,
      hemiGround: 0x97703c,
      ground: 0xc0a060,
      // Open arid air: you can see a touch further than usual.
      fogNearMul: 1.05,
      fogFarMul: 1.08,
    },
    jumpBias: 1,
    minBand: 1,
    weight: 2,
  },
  // Tunnel: an enclosed dark stretch. No grip change, but the haze pulls in tight and
  // the world goes dim, so threats appear late and you have far less room to read the
  // line — the claustrophobia is the difficulty. The safe lane is still the out, so a
  // careful driver survives blind; greed in the dark is what bites.
  {
    id: 'tunnel',
    name: 'THE TUNNEL',
    steerOmegaMul: 1,
    steerDampingMul: 1,
    precip: 0,
    look: {
      amount: 0.92,
      fog: 0x0c0d10,
      sky: 0x070708,
      key: 0x6b7480,
      hemiSky: 0x3a4250,
      hemiGround: 0x141519,
      ground: 0x17181c,
      // Haze pulled in hard: the sightline collapses, the tunnel mouth ahead is black.
      fogNearMul: 0.5,
      fogFarMul: 0.46,
    },
    jumpBias: 1,
    minBand: 1,
    weight: 2,
  },
  // Broken bridge over the ocean: the deck is out in long stretches, so the run is
  // mostly holes you leap (world gen boosts gap/ramp formations via `jumpBias`). Cool
  // open sea look — blue water below, bright hazy sky. Holds off until the run is deep.
  {
    id: 'bridge',
    name: 'BROKEN BRIDGE',
    steerOmegaMul: 1,
    steerDampingMul: 1,
    precip: 0,
    look: {
      amount: 0.7,
      fog: 0x6f93b4,
      sky: 0x88aece,
      key: 0xdcefff,
      hemiSky: 0xbdd8ee,
      hemiGround: 0x274a64,
      ground: 0x25506e, // the sea below the gaps
      fogNearMul: 1.0,
      fogFarMul: 1.0,
    },
    jumpBias: 4,
    minBand: 5,
    weight: 2,
  },
  // Lava field: the road crosses a molten plain, cracked open in chasms you jump (same
  // jump bias as the bridge). Dark and smoky with a hot red wash. Deep-run only.
  {
    id: 'lava',
    name: 'LAVA FIELDS',
    steerOmegaMul: 1,
    steerDampingMul: 1,
    precip: 0,
    look: {
      amount: 0.85,
      fog: 0x3a1410,
      sky: 0x2a0e0a,
      key: 0xff7a3a,
      hemiSky: 0x8a3418,
      hemiGround: 0x2a0c06,
      ground: 0x37120a, // cooled black crust veined by the glow
      fogNearMul: 0.85,
      fogFarMul: 0.8,
    },
    jumpBias: 4,
    minBand: 6,
    weight: 2,
  },
];

const HIGHWAY = BIOMES[0];

/** Meters one biome band spans before the next is rolled. */
export const BIOME_BAND_M = 2500;
/** Meters at a band's start over which the previous biome blends into the new one. */
const BIOME_TRANSITION_M = 400;

/** Deterministic 0..1 hash of a band index for a seed (a small integer mixer). */
function bandHash(seed: number, band: number): number {
  let h = (Math.trunc(seed) ^ 0x9e3779b9) + Math.imul(band, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/**
 * The biome that owns band `band` for `seed`. Band 0 is always the open road, and a
 * biome only enters the draw once the run has reached its `minBand` (the weirder
 * biomes hold off so the opening acts stay the intact teaching ground).
 */
export function biomeForBand(seed: number, band: number): Biome {
  if (band <= 0) return HIGHWAY;
  let total = 0;
  for (const b of BIOMES) if (band >= b.minBand) total += b.weight;
  if (total <= 0) return HIGHWAY;
  let r = bandHash(seed, band) * total;
  for (const b of BIOMES) {
    if (band < b.minBand) continue;
    r -= b.weight;
    if (r < 0) return b;
  }
  return HIGHWAY;
}

/** The discrete biome at a distance (no transition blend) — for the entry banner. */
export function biomeAt(seed: number, distance: number): Biome {
  return biomeForBand(seed, Math.floor(Math.max(0, distance) / BIOME_BAND_M));
}

/** Mutable look buffer reused by the hot-path biome sampler. */
export type BiomeLookState = { -readonly [K in keyof BiomeLook]: BiomeLook[K] };

/**
 * The effective biome modifiers at a distance, blended across band transitions.
 * This is an output buffer: create it once with `createBiomeState`, then pass it to
 * `biomeStateAt` on every tick/frame so sampling allocates nothing.
 */
export interface BiomeState {
  name: string;
  steerOmegaMul: number;
  steerDampingMul: number;
  precip: number;
  look: BiomeLookState;
}

/** Allocate one reusable biome output buffer outside the tick/render paths. */
export function createBiomeState(): BiomeState {
  return {
    name: HIGHWAY.name,
    steerOmegaMul: HIGHWAY.steerOmegaMul,
    steerDampingMul: HIGHWAY.steerDampingMul,
    precip: HIGHWAY.precip,
    look: { ...NEUTRAL_LOOK },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lerp between two packed RGB hex colors and repack (pure integer channels). */
function hexLerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function blendLookInto(out: BiomeLookState, a: BiomeLook, b: BiomeLook, t: number): void {
  out.amount = lerp(a.amount, b.amount, t);
  out.fog = hexLerp(a.fog, b.fog, t);
  out.sky = hexLerp(a.sky, b.sky, t);
  out.key = hexLerp(a.key, b.key, t);
  out.hemiSky = hexLerp(a.hemiSky, b.hemiSky, t);
  out.hemiGround = hexLerp(a.hemiGround, b.hemiGround, t);
  out.ground = hexLerp(a.ground, b.ground, t);
  out.fogNearMul = lerp(a.fogNearMul, b.fogNearMul, t);
  out.fogFarMul = lerp(a.fogFarMul, b.fogFarMul, t);
}

function copyLookInto(out: BiomeLookState, look: BiomeLook): void {
  out.amount = look.amount;
  out.fog = look.fog;
  out.sky = look.sky;
  out.key = look.key;
  out.hemiSky = look.hemiSky;
  out.hemiGround = look.hemiGround;
  out.ground = look.ground;
  out.fogNearMul = look.fogNearMul;
  out.fogFarMul = look.fogFarMul;
}

/**
 * The effective biome state at a distance. Inside the opening stretch of a band the
 * previous biome blends into the new one (so handling, the look, and the snowfall
 * ease in over `BIOME_TRANSITION_M` rather than snapping); the rest of the band is
 * the biome flat. The name is always the band's own biome, so the entry banner fires
 * on the boundary.
 */
export function biomeStateAt(seed: number, distance: number, out: BiomeState): BiomeState {
  const d = Math.max(0, distance);
  const band = Math.floor(d / BIOME_BAND_M);
  const cur = biomeForBand(seed, band);
  const local = d - band * BIOME_BAND_M;
  out.name = cur.name;
  if (band > 0 && local < BIOME_TRANSITION_M) {
    const prev = biomeForBand(seed, band - 1);
    const t = local / BIOME_TRANSITION_M;
    out.steerOmegaMul = lerp(prev.steerOmegaMul, cur.steerOmegaMul, t);
    out.steerDampingMul = lerp(prev.steerDampingMul, cur.steerDampingMul, t);
    out.precip = lerp(prev.precip, cur.precip, t);
    blendLookInto(out.look, prev.look, cur.look, t);
    return out;
  }
  out.steerOmegaMul = cur.steerOmegaMul;
  out.steerDampingMul = cur.steerDampingMul;
  out.precip = cur.precip;
  copyLookInto(out.look, cur.look);
  return out;
}
