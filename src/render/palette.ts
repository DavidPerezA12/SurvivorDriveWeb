/**
 * Render-side palette. Colors are a view concern; the sim never sees them.
 *
 * M0 ships the "Rust" act look: a sick orange haze over abandoned asphalt. The
 * road owns the high-contrast values; the world sits in the act's sky tone so
 * fog can pull the spawn horizon into the act color (docs/DESIGN.md →
 * Art & audio direction).
 */
export const palette = {
  // Sky gradient + fog share the horizon tone so distant geometry dissolves into
  // the sky seamlessly (docs/DESIGN.md → Art direction: fog hides the horizon).
  skyZenith: 0x0e0a09,
  skyHorizon: 0x53301a,
  fog: 0x46291a,

  // Wasteland floor the road sits on — desaturated dust, never the void.
  groundFar: 0x2e2014,
  groundNear: 0x39281a,
  // City floor for the opening Outbreak act — cool, dim concrete/asphalt instead
  // of warm desert dust, so the city never reads as the same wasteland dirt. The
  // ground crossfades between these and the wasteland tones across the act border.
  groundCityFar: 0x202227,
  groundCityNear: 0x2b2d33,
  // Flat off-road ground detail that scrolls past — sand drifts (lighter) and
  // cracked/scorched earth (darker), so the dirt beside the road reads as moving
  // terrain, not a static sheet. Re-moods with the act lights like the ground.
  groundSand: 0x47371f,
  groundScorch: 0x140f09,

  // The dying sun, low on the road ahead — mood, not light. Baked into the sky
  // dome, so it costs no draw call (the last-driver-toward-the-sunset read).
  sunCore: 0xf2c486,
  sunGlow: 0xb8602c,

  // Distant backdrop beyond the roadside, veiled by haze. It reads as place and
  // scale, never as an obstacle: dark, desaturated, fogged toward the horizon,
  // with a baked base→top gradient standing in for aerial perspective
  // (docs/DESIGN.md → Art direction: fog hides the horizon; readability:
  // decoration never mimics an interactive silhouette).
  ridgeBase: 0x241a13,
  ridgeHaze: 0x4a2e1c,
  snagBase: 0x191109,
  snagHaze: 0x32241a,
  // Built structures on the horizon — warehouses, downtown canyons, skyline
  // slabs. A cold concrete tone so a city reads distinct from the warm wasteland.
  structureBase: 0x1b1a1c,
  structureHaze: 0x393640,
  // Lit window panes baked into city buildings: a dim warm glow that, on the
  // unlit silhouette material, makes a tower read as a building with floors
  // (docs/DESIGN.md → detail from vertex color, not triangles).
  structureWin: 0x705028,
  // Static-act wreckage: fractured shards in a dead, desaturated grey.
  spireBase: 0x18181c,
  spireHaze: 0x36363e,

  // Act-coherent roadside clutter — junk that tells each tramo's story up close.
  barrelBody: 0x6e4a2c, // rusted oil drums (Rust/Swarm)
  containerBase: 0x2a3338, // shipping containers (Swarm/Visitors)
  containerHaze: 0x46545a,
  crystalBody: 0x1e2a26, // alien shard body (Visitors); its glow reuses ufoGlow

  // Act set-pieces on the horizon — the apocalypse's headline acts, render-only
  // backdrop giants. Bodies dark and cool; the signature glow is baked bright so
  // the unlit silhouette material renders it as actual light (docs/DESIGN.md →
  // Juice as information: a self-lit read survives any fog tint).
  ufoBody: 0x2a2f36,
  ufoGlow: 0x74ffb0, // eerie green underglow and rim lights
  ufoBeam: 0x2f9d63, // the abduction shaft, dim so fog reads it as a haze column
  mechaBody: 0x23262c,
  mechaGlow: 0xff7a42, // reactor core and visor (Colossus runs red-hot)
  kaijuBody: 0x1f1b1a,
  kaijuGlow: 0xff5a2c, // glowing maw and dorsal spines

  asphalt: 0x26282c,
  asphaltSeam: 0x1d1f22,
  laneLine: 0xc7b26a,
  edgeLine: 0xb8542f,
  curb: 0x4a4640,

  // Road wear — flat decals scattered on the asphalt so no two stretches read the
  // same. Dark and flat: clearly worn surface, never a thing to dodge
  // (docs/DESIGN.md → readability: decoration never mimics an interactive shape).
  roadCrack: 0x141417,
  roadPatch: 0x2a2c31, // a fresher repair square — only a hair off the asphalt
  roadPatchEdge: 0x202227,
  roadPothole: 0x101012,

  carBody: 0xbe4632, // deep automotive red — richer and less toy-orange
  carBodyDark: 0x7f2d1e,
  carCabin: 0x2f333b,
  // Dark tinted glass — the key light glints off the top edge for a reflective
  // read, instead of a flat neon band.
  carGlass: 0x37535f,
  carTrim: 0x14151a,
  carHeadlight: 0xffe8a8,
  carTaillight: 0xdd2a14, // tail lamp red — saturated but not neon
  carTaillightDim: 0x6f1a0e, // recessed housing linking the two lamp clusters
  carIndicator: 0xd07f26, // amber corner indicators
  carReverse: 0xd9d2bc, // small inboard white reverse lamps
  carChrome: 0x9092a0, // mirrors, rims, roof rack — cool metal glints
  carGrille: 0x16171b, // recessed front grille, darker than the trim
  wheel: 0x131316,
  wheelHub: 0x46474d,

  // Alternate drivable chassis (garage CAR tab). Each carries a signature body
  // tone and its own trim so the five read apart on the turntable and on the road
  // (models in src/render/chassis.ts). Lamps reuse the shared
  // carHeadlight/carTaillight self-lit colours (docs/DESIGN.md → readability rules).

  // Wrecker Rig, an off-road pickup. Warm, sun-baked tan with rust accents and a
  // near-black bed liner.
  rigChassisBody: 0x96703e,
  rigChassisDark: 0x5a3f22, // cab roof, lower cladding
  rigChassisBed: 0x281d12, // ribbed steel bed liner / tailgate
  rigChassisRust: 0x7a4a28, // jerry cans, spare-tyre mount, scabbed panels

  // Box Hauler, an up-armoured box van. Cold gunmetal steel with bolted plate and
  // a faded hazard stripe.
  haulerBody: 0x59636f,
  haulerDark: 0x2f363f, // rear doors, roof rim, window surrounds
  haulerPlate: 0x717c88, // proud bolted armour plate catching the key light
  haulerStripe: 0xb39a3c, // a faded warning stripe banding the box

  // Dune Buggy, a skeletal desert hopper. Hot safety-yellow tube frame over a
  // bare dark tub and a raw exposed engine.
  buggyFrame: 0xd6a824,
  buggyFrameDark: 0x8a6a14, // shadowed underside of the cage tubes
  buggyTub: 0x2a2620, // bare floor pan, seats
  buggyEngine: 0x55402a, // exposed rear engine block

  // Razor Coupe, a low street coupe. Near-black with a bone racing stripe and a
  // thin warm accent.
  coupeBody: 0x2b2e3a, // near-black, but enough value for the form to read head-on
  coupeDark: 0x181a22, // roof, pillars, wing, diffuser
  coupeStripe: 0xcfc8b8, // twin bone racing stripes
  coupeAccent: 0xb23a2a, // a thin warm pinstripe along the flank

  // Decoration: desaturated, so it never competes with interactive silhouettes
  // (docs/DESIGN.md → readability rules).
  post: 0x49443d,
  postLamp: 0x6b5a3a,
  postCollar: 0x5a5048, // weathered junction collar banding the pole
  rock: 0x3b3a3c,
  husk: 0x33302e,
  huskGlass: 0x22282a,
  huskDoor: 0x2b2825, // a door hanging off its hinge, a shade off the body
  barrier: 0x55504a,
  barrierPaint: 0x837c6f, // worn, peeling hazard paint — neutral, never warm
  barrierCore: 0x3f3b35, // exposed concrete where a corner has spalled away

  // Roadside crash barrier: a galvanized W-beam guardrail on rusted posts,
  // collapsed in stretches. Cool, weathered steel — structure, not threat
  // (docs/DESIGN.md → readability: decoration never mimics an interactive
  // silhouette; threats are warm).
  railBeam: 0x6b635a,
  railCrease: 0x867d70, // the proud horizontal crease catching the key light
  railPost: 0x47433c,

  // Interactive hazards live ON the road and read warm — threats are warm,
  // pickups cool (docs/DESIGN.md → readability rules).
  wreckBody: 0x9c5236, // warmed/brightened so the car reads as a solid mass in dark acts
  wreckDark: 0x3a2c22, // underframe/bumpers
  wreckCabin: 0x7c5d45, // the roof/greenhouse — a distinct lighter tone so the cabin never vanishes into the dark (which made the wreck read as a hollow "open box")
  wreckStripe: 0xd07a24,
  wreckRust: 0x6f4527, // rust patches breaking up the body
  wreckScorch: 0x1b1714, // burnt scorch around the engine bay
  wreckGlass: 0x394446, // dead, shattered glass — desaturated, never cool-bright

  // Toppled big rig — the lethal blocker. Heavy, tall, and warm with bold amber
  // hazard chevrons so it screams "you can't jump this, dodge it" at the spawn
  // horizon (docs/DESIGN.md → readability: threats warm; telegraph the danger).
  rigBody: 0x9a3f24,
  rigCab: 0x8a5a36,
  rigDark: 0x241b16,
  rigHazard: 0xf0b22e, // bright amber chevrons — the danger read

  // Boulder — the low rubble mound you jump. Warm sandstone, deliberately a shade
  // of the wasteland (so it reads as fallen rock, not metal) yet warmer and
  // lighter than the desaturated decoration `rock`, so it never gets mistaken for
  // off-road scenery (docs/DESIGN.md → readability: obstacles read warm,
  // decoration never mimics an interactive silhouette).
  boulderBody: 0x7a5236,
  boulderDark: 0x46301d, // shadowed crevices between the chunks
  boulderLight: 0x9a6f48, // sunlit faces catching the act key light

  // Explosive barrel — a fuel drum that detonates when shot (or rammed). Hot
  // warm red with a hazard-yellow band and a worn lid, so it screams "blow me up"
  // at the spawn horizon and reads as the gun's area tool, distinct from the
  // browner wreck/boulder and from the desaturated decorative `barrelBody` oil
  // drum (docs/DESIGN.md → readability: threats warm; decoration never mimics an
  // interactive silhouette).
  drumBody: 0xc23a1e,
  drumBand: 0xf0c020, // hazard-yellow warning band
  drumDark: 0x2a1a13, // rims and shadow
  drumLid: 0x3a281c, // worn lid
  // The blast: a near-white core, a warm fireball, and dark smoke — a single
  // legible "danger cleared" read even with sound off (docs/DESIGN.md → Juice).
  blastCore: 0xffe6a6,
  blastFire: 0xff8a32,
  blastSmoke: 0x241d18,

  // Sky meteor — a charred rock with a heat-glowing leading face, the warning
  // shadow it casts on its target lane, and the scorched crater it leaves. The
  // shadow is warm-red so it reads as "danger here" from far (telegraph), and the
  // hot face is baked bright so it glows through the act haze (docs/DESIGN.md →
  // every killer telegraphs; Juice as information).
  meteorRock: 0x2c2420, // charred body
  meteorChar: 0x191512, // shadowed, cooled facets
  meteorCore: 0xff9a3c, // glowing hot leading face (self-lit)
  meteorShadow: 0xd83a1e, // the warning shadow on the target lane
  meteorCrater: 0x140f0c, // scorched ground after impact

  // Zombies — mowable fodder. A sickly, desaturated flesh tone that is neither
  // the warm of a real threat nor the cool of a pickup; the hunched, reaching
  // silhouette carries the recognition (docs/DESIGN.md → readability rules).
  zombieFlesh: 0x8a9a6e,
  zombieFleshDark: 0x59614a,
  zombieRag: 0x40463c,
  zombieShirt: 0x6d5a4a,
  zombieBone: 0xb7b09a, // pale exposed bits — desaturated, never warm

  // Scrap reads cool — the cyan ping is the reward for a clean mow, legible even
  // with sound off (docs/DESIGN.md → Juice as information).
  scrapPing: 0x8fe6cf,

  // Lift pickup — a jump-charge refill. Cool by the readability rule (pickups
  // cool, threats warm), but a distinct electric blue so it never reads as scrap.
  // The upward chevron silhouette says "up / jump" on its own.
  liftToken: 0x4fb6ff,
  liftTokenDark: 0x2b6fae,
  liftBase: 0x214a63,

  // Health pickup — repairs the hull. Cool green by the readability rule (pickups
  // cool), a bold "+" cross silhouette that reads "repair" at the spawn horizon,
  // kept distinct from scrap-cyan and lift-blue.
  healthToken: 0x6fe0a0,
  healthTokenDark: 0x2f8f5f,
  healthBase: 0x21493a,

  // Ammo box — refills the gun. A stout crate with a warm amber band (the gun's
  // signature colour from the HUD) on a muted brass body, so it reads as the gun's
  // economy without competing with a warm threat silhouette.
  ammoBox: 0x5a4a30,
  ammoBase: 0x3a3020,
  ammoBand: 0xe0a93a,
  ammoTip: 0xcaa24a,

  // Neon colors for city signs and street lighting.
  neonPink: 0xff3399,
  neonCyan: 0x00f0ff,
  neonAmber: 0xff8c00,
  streetLightGlow: 0xffd880,
  trafficRed: 0xff0800,
  trafficGreen: 0x00ff66,
  trafficYellow: 0xffcc00,
} as const;
