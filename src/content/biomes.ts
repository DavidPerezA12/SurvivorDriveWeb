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
 * the handling modifiers, the renderer reads the look. The band order is an
 * authored journey (`BIOME_JOURNEY` + `BIOME_ROTATION`), identical on every run;
 * the seed decides what is laid on the road inside each stretch, not the order of
 * the places.
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
 * What the ground off the road *is* in this band: solid earth, open sea, or a
 * molten plain. The renderer swaps the static wasteland floor for an animated
 * liquid surface when this is not 'none'; the sim never reads it (the car cannot
 * leave the road, so the liquid is a look, not a collider).
 */
export type BiomeLiquid = 'none' | 'sea' | 'lava';

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
  /** The animated surface flanking the road ('none' = solid ground). */
  readonly liquid: BiomeLiquid;
  readonly look: BiomeLook;
  /**
   * Multiplier on the selection weight of jump/gap formations in world gen (1 = no
   * bias). A broken bridge or a lava field is mostly holes you leap, so it boosts the
   * formations that carry a gap/crackgap/ramp. Read by `src/sim/world.ts`.
   */
  readonly jumpBias: number;
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
    liquid: 'none',
    look: NEUTRAL_LOOK,
    jumpBias: 1,
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
    liquid: 'none',
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
    liquid: 'none',
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
    liquid: 'none',
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
    liquid: 'sea',
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
  },
  // Lava field: the road crosses a molten plain, cracked open in chasms you jump (same
  // jump bias as the bridge). Dark and smoky with a hot red wash. Deep-run only.
  {
    id: 'lava',
    name: 'LAVA FIELDS',
    steerOmegaMul: 1,
    steerDampingMul: 1,
    precip: 0,
    liquid: 'lava',
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
  },
];

const HIGHWAY = BIOMES[0];

/** Meters one biome band spans before the next is rolled. Compressed with the
 *  act pacing (2500 → 1800): a new place roughly every half minute at cruise. */
export const BIOME_BAND_M = 1800;
/** Meters at a band's start over which the previous biome blends into the new one.
 *  Exported so the render-side dressing (decor, ground scatter) rebuilds the verge
 *  slot by slot over the same stretch the look and handling blend across. */
export const BIOME_TRANSITION_M = 400;

const BIOME_BY_ID: Record<BiomeId, Biome> = Object.fromEntries(
  BIOMES.map((b) => [b.id, b]),
) as Record<BiomeId, Biome>;

/**
 * The authored journey (user decision 2026-07-06: the scenario order is designed,
 * not rolled — the Last Driver model, where the player learns the trip and
 * progresses against it). One entry per band (1800 m ≈ half an act), paired with
 * the act schedule so each place lands under its apocalypse: the tunnel arrives
 * with the Swarm (the horde in the dark), the broken bridge under the invasion,
 * the lava fields under the giants. Open-road breathers separate every stretch,
 * and the jump-heavy biomes (bridge, lava) stay deep so the opening acts remain
 * the intact teaching ground (the early-acts-gap-free invariant).
 */
export const BIOME_JOURNEY: readonly BiomeId[] = [
  'highway', // band 0 (0.0-1.8 km, act I) — the run always opens on clean tarmac
  'desert', // band 1 (1.8-3.6 km, acts I-II) — the first place change, grip intact
  'highway', // band 2 (3.6-5.4 km, act II)
  'snow', // band 3 (5.4-7.2 km, acts II-III) — the first handling twist
  'tunnel', // band 4 (7.2-9.0 km, act III) — the Swarm in the dark
  'highway', // band 5 (9.0-10.8 km, act III)
  'bridge', // band 6 (10.8-12.6 km, act IV) — leaping the deck under the invasion
  'highway', // band 7 (12.6-14.4 km, act IV)
  'lava', // band 8 (14.4-16.2 km, act V) — the molten plain under the giants
  'highway', // band 9 (16.2-18.0 km, acts V-VI)
];

/**
 * Past the journey the run is endgame: a fixed rotation of the harder stretches
 * with open-road breathers, repeating every six bands (~10.8 km). Same for every
 * run, so deep pace is designed too.
 */
export const BIOME_ROTATION: readonly BiomeId[] = [
  'snow',
  'tunnel',
  'highway',
  'bridge',
  'lava',
  'highway',
];

/**
 * The biome that owns band `band`. The order is the authored journey above, then
 * the endgame rotation — identical on every run. The seed parameter is unused by
 * design (kept for API stability, and so a seeded variant can come back as a mode
 * without touching the callers); the seed still decides everything laid on the
 * road *inside* each stretch.
 */
export function biomeForBand(_seed: number, band: number): Biome {
  if (band <= 0) return HIGHWAY;
  const id =
    band < BIOME_JOURNEY.length
      ? BIOME_JOURNEY[band]
      : BIOME_ROTATION[(band - BIOME_JOURNEY.length) % BIOME_ROTATION.length];
  return BIOME_BY_ID[id];
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
  /**
   * How much of each liquid surface is active (0..1 each, summing to at most 1).
   * Inside a band these are simply 1 for the band's own liquid; across a
   * transition they crossfade, so the sea can drain away as the lava wells up.
   */
  sea: number;
  lava: number;
  look: BiomeLookState;
}

/** Allocate one reusable biome output buffer outside the tick/render paths. */
export function createBiomeState(): BiomeState {
  return {
    name: HIGHWAY.name,
    steerOmegaMul: HIGHWAY.steerOmegaMul,
    steerDampingMul: HIGHWAY.steerDampingMul,
    precip: HIGHWAY.precip,
    sea: 0,
    lava: 0,
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
    out.sea = (prev.liquid === 'sea' ? 1 - t : 0) + (cur.liquid === 'sea' ? t : 0);
    out.lava = (prev.liquid === 'lava' ? 1 - t : 0) + (cur.liquid === 'lava' ? t : 0);
    blendLookInto(out.look, prev.look, cur.look, t);
    return out;
  }
  out.steerOmegaMul = cur.steerOmegaMul;
  out.steerDampingMul = cur.steerDampingMul;
  out.precip = cur.precip;
  out.sea = cur.liquid === 'sea' ? 1 : 0;
  out.lava = cur.liquid === 'lava' ? 1 : 0;
  copyLookInto(out.look, cur.look);
  return out;
}
