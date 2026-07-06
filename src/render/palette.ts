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
  // Static act (VI) — reality tearing. A cold, wrong glitch light rimming the void
  // rifts and glitch slabs: violet-white so it reads as "broken", never warm (a
  // threat) and never the cool cyan of a road pickup.
  voidGlow: 0xa89cff,

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
  rockDark: 0x2d2c2f, // shadowed crevices between the stones
  rockLight: 0x4b4a4e, // lit top facets
  husk: 0x33302e,
  huskGlass: 0x22282a,
  huskDoor: 0x2b2825, // a door hanging off its hinge, a shade off the body
  barrier: 0x55504a,
  barrierPaint: 0x837c6f, // worn, peeling hazard paint — neutral, never warm
  barrierCore: 0x3f3b35, // exposed concrete where a corner has spalled away

  // Act I city street furniture — the day-one Outbreak verge. All decoration
  // tier: desaturated, dim, never token-bright, never a threat silhouette
  // (docs/DESIGN.md → readability). The dead signal lenses are deliberately murky
  // so they never read as live lights or warm threats.
  signalHousing: 0x23262b, // dead traffic-signal housings and light bars
  trafficDeadRed: 0x4a211c, // unlit lenses — dim, never the hot threat red
  trafficDeadAmber: 0x4d3d1c,
  trafficDeadGreen: 0x21392b,
  policeBlueDead: 0x262e48, // the dead blue half of a cruiser light bar
  dumpsterBody: 0x3c4a44, // municipal steel, muted green-grey
  dumpsterLid: 0x2c3833,
  trashBag: 0x24262b, // knotted garbage bags
  sandbagBody: 0x6a5c44, // dusty burlap of a quarantine emplacement
  sandbagShade: 0x4c4230,
  taxiSign: 0x8a7a4e, // faded livery band + roof sign of a dead cab
  signStop: 0x5c2822, // a fallen stop sign — dim, weathered, not threat-red
  signPlate: 0x878c90, // grey route-sign plate
  glassShatter: 0x6b7c84, // pooled shattered storefront glass
  suitcaseTan: 0x5c4a38, // burst evacuation luggage
  suitcaseBlue: 0x3c4454,
  coneShell: 0x7c4e3a, // toppled traffic cones — dusty terracotta, never threat-orange
  coneBand: 0x9a948a, // the faded reflective band
  hydrantBody: 0x6b5148, // oxidized kerbside hydrant, decoration-dim
  hydrantCap: 0x4c3a34,
  utilityBox: 0x49524b, // street utility / signal-control cabinet
  mattress: 0x8a8274, // a dumped, stained mattress
  tvDark: 0x1b1f24, // dead CRT face

  // Act II suburbia dressing — the Rust act's abandoned yards. Decoration-dim.
  tentCanvas: 0x6e6a58, // a collapsed tent, canvas bleached stiff
  camperBody: 0x8a857a, // a dead caravan shell, once white
  camperStripe: 0x5c6a72, // its faded livery stripe

  // Biome roadside dressing — each geographic band re-skins the verge (snow,
  // desert, tunnel, bridge, lava). All decoration tier: desaturated masses, never
  // token-bright, never mimicking an interactive silhouette (docs/DESIGN.md →
  // readability). Snow is pale but dim (a drift, not a glowing pickup).
  snowBody: 0xb6c2cd, // settled snow mass, shadowed
  snowLit: 0xd8e1e9, // the wind-lit crust catching the key light
  iceGlaze: 0x8ba4b4, // blue-grey glaze on frozen rock
  pineTrunk: 0x37302b, // cold dead conifer trunk
  pineBough: 0x2f3a33, // frost-dead needles under the snow load
  cactusBody: 0x4c5f3a, // dusty saguaro green (muted, never pickup-green)
  cactusRib: 0x39482c, // shadowed rib grooves
  sandDune: 0x8a7146, // banked desert sand, brighter than the wasteland dirt
  sandShade: 0x604d2e, // the dune's shadowed lee side
  sunRock: 0x7d7264, // sun-bleached desert stone
  sunRockShade: 0x57503f,
  tunnelLampDead: 0x4a4f42, // a dead sodium lamp head (no glow — the tunnel is dark)
  bridgeSteel: 0x515d68, // cold marine truss steel
  bridgeSteelDark: 0x333c45,
  bridgeCable: 0x272e35, // snapped suspension cable drooping to the deck
  seaFoam: 0x9fb9c6, // whitecap streaks on the water below the broken deck
  seaDeep: 0x1c4059, // the animated sea's swell troughs (liquid surface)
  seaSwell: 0x3a6f92, // the lit body of a rolling swell
  basaltDark: 0x211f24, // cooled volcanic columns
  basaltCool: 0x393641, // the lighter fractured faces
  emberVein: 0xd8551e, // molten seams veining the cooled crust (dim hot, not neon)
  lavaPool: 0xff7a2e, // an open molten pool off the road (self-lit read)
  lavaPoolDeep: 0xb03c12,
  lavaCooling: 0x5a1c10, // molten rock skinning over between the glow and the crust

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

  // Downed utility pole — the lane-spanning survivable blocker. Warm split
  // timber (threats warm) with a dark transformer drum and trailing dead wires,
  // clearly wood and clearly LOW, so the read is "hop it", never "wall".
  poleWood: 0x8a6238,
  poleWoodDark: 0x54391f, // shadowed underside, the splintered butt
  poleHardware: 0x2e2c31, // crossarm brackets, the transformer drum

  // Live wire — the downed cable still arcing, a lethal ground trap. The cable
  // itself is near-black rubber; the danger read is the baked spark glow (hot
  // warm-white, self-lit on the silhouette material) and the scorch it chews
  // into the asphalt around it.
  wireCable: 0x0d0e10,
  wireSpark: 0xffd27a, // arcing spark bursts — hot, warm, unmistakably live
  wireSparkCore: 0xfff3cd, // the white heart of each arc
  wireScorch: 0x121013, // burnt asphalt under the arc points

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
  // The toxic drum — ruptures into a lingering gas cloud, not a fireball. A murky
  // green body with an acid yellow-green hazard band, so it reads as a different
  // drum from the red explosive one at the spawn horizon (the band colour is the
  // gas colour, telegraphing what bursts out). Toxic green is a recognized hazard
  // read, kept sicklier than the clean cool health-pickup green so they never confuse.
  drumToxBody: 0x4a6b2e,
  drumToxBand: 0xaad23a, // acid yellow-green — the toxic warning / gas colour
  drumToxDark: 0x1c2412, // rims and shadow
  // The gas cloud itself: a translucent acid haze that denies the lane it sits on.
  gasCloud: 0x9ed23a,
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

  // T-Rex boss (docs/DESIGN.md → spectacle in the background, the road legible). The
  // foot-slam is the on-road threat: a clawed foot that falls (telegraph) and presses
  // a lethal footprint into the road. The body looms alongside as the spectacle.
  trexSkin: 0x5f6e3c, // mottled reptile green-brown
  trexSkinDark: 0x3c4626, // shadowed scales / the looming silhouette
  trexBelly: 0x8f9560, // paler underside
  trexClaw: 0x141008, // near-black claws and talons
  trexMaw: 0x7a1410, // the red maw and the warm threat read
  trexEye: 0xffb030, // a hot predator eye (self-lit), reads from the haze
  footprint: 0x130d08, // the pressed, lethal footprint crater

  // Mecha boss (docs/DESIGN.md → spectacle in the background). A walking war machine
  // that rakes the road with artillery: cold gunmetal plate, a hot reactor visor and
  // glowing shell tips (reuses `mechaGlow`). The shell craters its impact lane.
  mechaSteel: 0x4a525c, // gunmetal plate
  mechaSteelDark: 0x282d34, // shadowed steel / the looming silhouette
  mechaShell: 0x5a4733, // the artillery shell casing
  shellCrater: 0x140d0a, // scorched ground after a shell impact

  // The lethal-wall danger light: a hot, self-lit red baked onto every one-hit
  // killer (rig, barrier, bus) via the unlit silhouette material, so the "touch
  // this and die" read survives any act haze or biome whiteout — painted
  // chevrons wash out, a light does not.
  dangerGlow: 0xff2f1d,

  // Lethal walls share a language: a heavy, solid mass plus a RED danger marking
  // (red = death, distinct from the amber "caution" of barrels and rig chevrons),
  // so a glance reads "you cannot pass this, dodge it" — the silhouette carries it,
  // the colour confirms it (docs/DESIGN.md → readability: lethal looks lethal).

  // Concrete barrier — a Jersey median wall dragged across the lane. Solid
  // weathered concrete with white hazard bands and red chevrons, tall enough to
  // read as an impassable wall.
  barrierConcrete: 0x938b7e,
  barrierConcreteDark: 0x4e4a43, // shadowed base, scuffed corners
  barrierStripe: 0xd9d2c4, // painted white hazard bands
  barrierGrime: 0x5c5043, // road grime / rust streaks down the face
  barrierDanger: 0xe6361b, // red danger chevrons — the lethal read

  // Crashed bus — the longest wall: a long dead coach across the lane. A faded,
  // dark ochre body (clearly a dead bus, never toy-bright), dead glass, rust, and
  // red hazard chevrons on the rear so it reads lethal, not survivable.
  busBody: 0xb0852c,
  busDark: 0x281f16, // underframe, bumpers, window frames
  busGlass: 0x33403f, // dead shattered glass
  busRust: 0x6f4a24, // rust eating the panels
  busRail: 0x141008, // the black rub rail along the flank
  busDanger: 0xe6361b, // red hazard chevrons on the rear

  // Spike strip — a lethal bed of steel teeth on the road. A dark base rail with
  // red do-not-cross paint and bright steel teeth, so it reads as "shred zone, jump
  // it" rather than a survivable bump (docs/DESIGN.md → readability: lethal trap).
  spikesBar: 0x2a2622, // the dark base rail bolted to the asphalt
  spikesTeeth: 0xb9bcc4, // steel spike teeth catching the key light
  spikesDanger: 0xe6361b, // red warning paint on the base

  // Collapse ramp — rubble from a fallen building piled into a launch ramp. Read as
  // a route, not a threat: cool, dusty concrete and broken roadway, never warm. A
  // single yellow chevron on the lip points up the ramp so a glance reads "drive up
  // me" rather than "wall" (docs/DESIGN.md → readability: decoration never warm, the
  // cue carries the verb).
  rampConcrete: 0x8c887e, // the broken slabs of the ramp face
  rampConcreteDark: 0x4b463f, // shadowed undersides and the rubble base
  rampRebar: 0x6a5140, // bent reinforcing bar and torn roadbed poking through
  rampChevron: 0xe6c044, // the painted "up" chevron on the ramp lip

  // Zombies — mowable fodder. A sickly, desaturated flesh tone that is neither
  // the warm of a real threat nor the cool of a pickup; the hunched, reaching
  // silhouette carries the recognition (docs/DESIGN.md → readability rules).
  zombieFlesh: 0x8a9a6e,
  zombieFleshDark: 0x59614a,
  zombieRag: 0x40463c,
  zombieShirt: 0x6d5a4a,
  zombieBone: 0xb7b09a, // pale exposed bits — desaturated, never warm

  // Brute zombie — a heavy, swollen body that is a real threat, not free fodder.
  // Warmer and darker than the sickly fodder flesh (warm = threat) with raw red
  // wounds, so it reads apart from a normal shambler in a crowd at a glance.
  bruteFlesh: 0x95764a,
  bruteFleshDark: 0x5c4830,
  bruteRag: 0x3a342a,
  bruteScar: 0xa33a26, // raw warm wounds / scar tissue

  // Jumper zombie — a lean, coiled leaper that springs onto the hood. Warm like the
  // brute (warm = threat) but paler and more sinewy, with a hot hazard-orange accent
  // on the taut back/sinews so the "this one leaps" telegraph reads apart from the
  // shambler and the bulky brute at the spawn horizon.
  jumperFlesh: 0xa07a52,
  jumperFleshDark: 0x614328,
  jumperRag: 0x33291f,
  jumperAccent: 0xd2622a, // hot coiled sinew — the leap telegraph

  // Scrap reads cool — the cyan ping is the reward for a clean mow, legible even
  // with sound off (docs/DESIGN.md → Juice as information).
  scrapPing: 0x8fe6cf,

  // Mow gore — a dark, retro-exaggerated splat that sprays as the car plows fodder
  // (the inspiration's blood splatter). Deep oxblood red, never the bright lethal
  // red of a wall, so it reads as "you hit them" spectacle, not a danger cue.
  bloodSplat: 0x6e120c,

  // Scrap pickup — a loose salvage cache you scoop for instant scrap (greed with no
  // fight). Cool cyan to match the scrap-ping reward read, with a tarnished metal
  // base so it reads as a heap of parts, not a glowing token.
  scrapToken: 0x8fe6cf,
  scrapTokenDark: 0x3f8f80,
  scrapBase: 0x2a3a38,

  // Coin — one nugget of a money trail (small scrap, laid in a line down a risky
  // lane). The same cool cyan-mint as the scrap reward read so a trail reads as
  // "money on the road," but a bright struck-disc face so a spinning coin glints
  // apart from the dull salvage heap. Cool, never the warm of a threat.
  coinToken: 0xa6f0d6,
  coinTokenDark: 0x4fae96,

  // Light barricade — a flimsy road trestle (soft blocker: shoot, ram cheap, or
  // steer). Caution yellow over a dark frame, the universal "barricade" read, warm
  // but plainly slighter than a lethal wall so it never reads as one you must dodge.
  barricadeStripe: 0xe0b020,
  barricadeStripeDark: 0x6e5410,
  barricadeFrame: 0x2a2018,
  barricadeLeg: 0x3a2c1e,

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

  // Shield pickup — a short damage-absorbing bubble (docs/DESIGN.md → power-ups).
  // Cool by the readability rule, but pale electric ice-white so it reads apart
  // from scrap-cyan, lift-blue, and health-green at the spawn horizon. The same
  // tone drives the translucent bubble around the shielded car.
  shieldToken: 0xbfe8ff,
  shieldTokenDark: 0x5c9cd6,
  shieldBase: 0x25455e,
  shieldGlow: 0x9fd4ff, // the active bubble's shell

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
