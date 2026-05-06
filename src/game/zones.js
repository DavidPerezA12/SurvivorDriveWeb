/**
 * zones.js — Zone system for SurvivorDriveWeb
 *
 * Replaces the old two-biome system (desert/city) with 6 progressive zones.
 * Each zone defines: distance range, obstacle/pickup/event weights,
 * visual theme, difficulty, weather pool, and prop catalog.
 *
 * Zones in order:
 *   1. GARAGE      (0.0 – 0.5 km) — Tutorial, safe start
 *   2. BROKEN_HWY  (0.5 – 2.0 km) — Wide highway, wrecks, barricades
 *   3. GHOST_TOWN  (2.0 – 3.5 km) — Narrow streets, destroyed houses
 *   4. DESERT       (3.5 – 5.0 km) — Open road, sand, rocks, dust storms
 *   5. MILITARY     (5.0 – 6.5 km) — Hardest, barriers, mines, chase
 *   6. REFUGE       (6.5+ km)      — Final stretch / victory
 */

// ── Zone transition curve (smooth blend multiplier per zone pair) ──────
export function zoneBlendFactor(currentDistance, zoneStart, zoneEnd) {
  const blendHalf = 0.25; // km of blend on each side
  const entryStart = zoneStart - blendHalf;
  const entryEnd = zoneStart + blendHalf;
  const exitStart = zoneEnd - blendHalf;
  const exitEnd = zoneEnd + blendHalf;

  // Before zone: 0
  if (currentDistance < entryStart) return 0;
  // Entering zone: 0→1
  if (currentDistance <= entryEnd) {
    return (currentDistance - entryStart) / (entryEnd - entryStart);
  }
  // Inside zone: 1
  if (currentDistance <= exitStart) return 1;
  // Exiting zone: 1→0
  if (currentDistance <= exitEnd) {
    return 1 - (currentDistance - exitStart) / (exitEnd - exitStart);
  }
  // Past zone: 0
  return 0;
}

// ── Zone definitions ────────────────────────────────────────────────────
export const zoneCatalog = {
  garage: {
    id: "garage",
    name: "Zona de Salida",
    label: "Garage",
    description: "Zona segura de inicio. Tutorial visual y primeros pickups.",
    distanceStart: 0,
    distanceEnd: 0.5,

    // ── Road config ──
    roadWidth: 14,
    laneCount: 4,
    lanes: [-4.2, -1.4, 1.4, 4.2],
    speedLimit: 0.75, // slower start

    // ── Difficulty ──
    difficulty: 0,
    threatCap: 10,
    threatScaleDistance: 2,
    threatScaleKills: 1,

    // ── Obstacle weights ──
    obstacles: {
      spawnIntervalMin: 1.0,
      spawnIntervalMax: 1.8,
      weights: {
        none: 0.6, // 60% chance of no obstacle (safe zone)
        barrier: 0.1,
        scrap: 0.15,
        wreck: 0.1,
        ramp: 0.05,
      },
    },

    // ── Pickup weights ──
    pickups: {
      spawnIntervalMin: 1.2,
      spawnIntervalMax: 2.2,
      weights: {
        coin: 0.3,
        fuel: 0.25,
        repair: 0.2,
        ammo: 0.15,
        scrap: 0.1,
      },
    },

    // ── Event weights ──
    events: {
      cooldownMin: 30,
      cooldownMax: 45,
      weights: {
        none: 1.0, // no events in garage
      },
    },

    // ── Visual theme ──
    visual: {
      roadColor: "#4a4a4a",
      groundColor: "#6b5b4a",
      shoulderColor: "#5a5a4a",
      fogColor: { r: 0.55, g: 0.5, b: 0.42 },
      fogDensity: 0.003,
      ambientDay: "#c4a385",
      ambientNight: "#6c88bf",
      skyDay: "#a66840",
      skyNight: "#0f1a2b",
      groundDay: "#361e12",
      groundNight: "#1a1215",
    },

    // ── Weather pool ──
    weatherPool: ["clear"],

    // ── Prop decor weights ──
    props: {
      guardrail: 0.25,
      pole: 0.2,
      sign: 0.15,
      barrel: 0.15,
      crate: 0.15,
      cone: 0.1,
    },
  },

  broken_highway: {
    id: "broken_highway",
    name: "Autopista Rota",
    label: "Broken Highway",
    description: "Carretera ancha sembrada de coches abandonados, barricadas y chatarra.",
    distanceStart: 0.5,
    distanceEnd: 2.0,

    roadWidth: 14,
    laneCount: 4,
    lanes: [-4.2, -1.4, 1.4, 4.2],
    speedLimit: 1.0,

    difficulty: 0.15,
    threatCap: 35,
    threatScaleDistance: 3.5,
    threatScaleKills: 2,

    obstacles: {
      spawnIntervalMin: 0.55,
      spawnIntervalMax: 1.1,
      weights: {
        barrier: 0.22,
        scrap: 0.2,
        wreck: 0.18,
        barricade: 0.12,
        raider: 0.08,
        debris: 0.08,
        ramp: 0.06,
        oil_spill: 0.04,
        fallen_sign: 0.02,
      },
    },

    pickups: {
      spawnIntervalMin: 1.0,
      spawnIntervalMax: 2.5,
      weights: {
        coin: 0.22,
        fuel: 0.18,
        ammo: 0.15,
        repair: 0.15,
        scrap: 0.15,
        nitro: 0.08,
        jump: 0.04,
        fire: 0.03,
      },
    },

    events: {
      cooldownMin: 25,
      cooldownMax: 40,
      weights: {
        none: 0.6,
        dust_storm: 0.15,
        cut_road: 0.15,
        chase_light: 0.1,
      },
    },

    visual: {
      roadColor: "#3e3e3e",
      groundColor: "#5a4a3a",
      shoulderColor: "#4a4a3a",
      fogColor: { r: 0.54, g: 0.47, b: 0.38 },
      fogDensity: 0.004,
      ambientDay: "#bf9e80",
      ambientNight: "#6b85bb",
      skyDay: "#9e6340",
      skyNight: "#101b2c",
      groundDay: "#352018",
      groundNight: "#1b1316",
    },

    weatherPool: ["clear", "dust", "ash"],

    props: {
      wrecked_car: 0.2,
      barrier: 0.18,
      debris_pile: 0.15,
      guardrail: 0.12,
      pole: 0.1,
      sign: 0.08,
      barrel: 0.07,
      crate: 0.05,
      cone: 0.05,
    },
  },

  ghost_town: {
    id: "ghost_town",
    name: "Pueblo Fantasma",
    label: "Ghost Town",
    description:
      "Calles estrechas entre edificios destruidos. Gasolinera abandonada y escombros laterales.",
    distanceStart: 2.0,
    distanceEnd: 3.5,

    roadWidth: 10, // narrower streets
    laneCount: 2, // fewer lanes
    lanes: [-3.0, -1.0, 1.0, 3.0],
    speedLimit: 0.9,

    difficulty: 0.35,
    threatCap: 55,
    threatScaleDistance: 4,
    threatScaleKills: 2.5,

    obstacles: {
      spawnIntervalMin: 0.45,
      spawnIntervalMax: 0.9,
      weights: {
        wreck: 0.22,
        debris: 0.18,
        barrier: 0.16,
        barricade: 0.12,
        scrap: 0.1,
        fallen_sign: 0.08,
        raider: 0.06,
        oil_spill: 0.05,
        ramp: 0.03,
      },
    },

    pickups: {
      spawnIntervalMin: 0.9,
      spawnIntervalMax: 2.2,
      weights: {
        scrap: 0.2,
        coin: 0.18,
        fuel: 0.16,
        repair: 0.14,
        ammo: 0.12,
        nitro: 0.1,
        jump: 0.05,
        fire: 0.05,
      },
    },

    events: {
      cooldownMin: 20,
      cooldownMax: 35,
      weights: {
        none: 0.45,
        cut_road: 0.2,
        gas_station: 0.15,
        dark_tunnel: 0.1,
        chase_medium: 0.1,
      },
    },

    visual: {
      roadColor: "#3a3a3a",
      groundColor: "#454d45",
      shoulderColor: "#3e423e",
      fogColor: { r: 0.4, g: 0.45, b: 0.38 },
      fogDensity: 0.005,
      ambientDay: "#8ea88a",
      ambientNight: "#455444",
      skyDay: "#6a7a60",
      skyNight: "#0e1a12",
      groundDay: "#2d3528",
      groundNight: "#121811",
    },

    weatherPool: ["clear", "ash", "smog"],

    props: {
      building_ruin: 0.18,
      fence: 0.15,
      wreckage: 0.14,
      debris_pile: 0.12,
      street_light: 0.1,
      barrel: 0.08,
      sign: 0.08,
      crate: 0.07,
      bus_stop: 0.05,
      cone: 0.03,
    },
  },

  desert: {
    id: "desert",
    name: "Desierto Abierto",
    label: "Open Desert",
    description: "Rectas largas y rápidas. Arena en la carretera, rocas y tormentas de polvo.",
    distanceStart: 3.5,
    distanceEnd: 5.0,

    roadWidth: 14,
    laneCount: 4,
    lanes: [-4.2, -1.4, 1.4, 4.2],
    speedLimit: 1.1, // faster zone

    difficulty: 0.55,
    threatCap: 75,
    threatScaleDistance: 4.5,
    threatScaleKills: 2.8,

    obstacles: {
      spawnIntervalMin: 0.38,
      spawnIntervalMax: 0.8,
      weights: {
        barrier: 0.2,
        rock: 0.18,
        scrap: 0.16,
        wreck: 0.12,
        raider: 0.12,
        debris: 0.08,
        ramp: 0.06,
        oil_spill: 0.04,
        fallen_sign: 0.04,
      },
    },

    pickups: {
      spawnIntervalMin: 0.8,
      spawnIntervalMax: 2.0,
      weights: {
        fuel: 0.22,
        coin: 0.18,
        nitro: 0.15,
        repair: 0.14,
        ammo: 0.12,
        scrap: 0.1,
        jump: 0.05,
        fire: 0.04,
      },
    },

    events: {
      cooldownMin: 18,
      cooldownMax: 32,
      weights: {
        none: 0.35,
        dust_storm: 0.25,
        chase_heavy: 0.15,
        cut_road: 0.15,
        gas_station: 0.1,
      },
    },

    visual: {
      roadColor: "#f0e8d8",
      groundColor: "#d48a4f",
      shoulderColor: "#dfaa74",
      fogColor: { r: 0.6, g: 0.48, b: 0.34 },
      fogDensity: 0.004,
      ambientDay: "#c4a385",
      ambientNight: "#6c88bf",
      skyDay: "#a66840",
      skyNight: "#0f1a2b",
      groundDay: "#361e12",
      groundNight: "#1a1215",
    },

    weatherPool: ["clear", "dust", "ash"],

    props: {
      rock: 0.18,
      dead_bush: 0.15,
      dune: 0.12,
      crater: 0.1,
      pipeline: 0.08,
      satellite_dish: 0.08,
      watchtower: 0.08,
      tent: 0.07,
      wreckage: 0.06,
      billboard: 0.05,
      castle: 0.03,
    },
  },

  military: {
    id: "military",
    name: "Zona Militar",
    label: "Military Zone",
    description:
      "El tramo final y más difícil. Barreras militares, minas, vehículos blindados y persecución.",
    distanceStart: 5.0,
    distanceEnd: 6.5,

    roadWidth: 12,
    laneCount: 3,
    lanes: [-3.6, 0, 3.6],
    speedLimit: 0.95,

    difficulty: 0.8,
    threatCap: 100,
    threatScaleDistance: 5,
    threatScaleKills: 3,

    obstacles: {
      spawnIntervalMin: 0.3,
      spawnIntervalMax: 0.65,
      weights: {
        military_barrier: 0.22,
        mine: 0.18,
        barrier: 0.14,
        raider: 0.12,
        tower: 0.1,
        wreck: 0.08,
        scrap: 0.06,
        debris: 0.05,
        oil_spill: 0.03,
        half_gate: 0.02,
      },
    },

    pickups: {
      spawnIntervalMin: 0.7,
      spawnIntervalMax: 1.8,
      weights: {
        repair: 0.2,
        ammo: 0.18,
        fuel: 0.16,
        nitro: 0.15,
        scrap: 0.12,
        coin: 0.1,
        jump: 0.05,
        fire: 0.04,
      },
    },

    events: {
      cooldownMin: 15,
      cooldownMax: 28,
      weights: {
        none: 0.25,
        military_checkpoint: 0.22,
        chase_heavy: 0.2,
        dust_storm: 0.15,
        cut_road: 0.1,
        dark_tunnel: 0.08,
      },
    },

    visual: {
      roadColor: "#2a2d2a",
      groundColor: "#252520",
      shoulderColor: "#1e2118",
      fogColor: { r: 0.35, g: 0.25, b: 0.25 },
      fogDensity: 0.007,
      ambientDay: "#a88e8e",
      ambientNight: "#3d1a1a",
      skyDay: "#5a3a3a",
      skyNight: "#1a0505",
      groundDay: "#261212",
      groundNight: "#0f0202",
    },

    weatherPool: ["clear", "ash", "smog"],

    props: {
      sandbag: 0.18,
      military_barrier: 0.16,
      crate: 0.12,
      wreckage: 0.1,
      fence: 0.1,
      barrel: 0.08,
      debris_pile: 0.08,
      watchtower: 0.07,
      pole: 0.06,
      sign: 0.05,
    },
  },

  refuge: {
    id: "refuge",
    name: "Refugio",
    label: "Refuge",
    description: "La antena de salvación. Zona final de victoria.",
    distanceStart: 6.5,
    distanceEnd: 7.2,

    roadWidth: 14,
    laneCount: 4,
    lanes: [-4.2, -1.4, 1.4, 4.2],
    speedLimit: 1.0,

    difficulty: 0.9,
    threatCap: 100,
    threatScaleDistance: 5.5,
    threatScaleKills: 3.2,

    obstacles: {
      spawnIntervalMin: 0.25,
      spawnIntervalMax: 0.6,
      weights: {
        military_barrier: 0.25,
        mine: 0.2,
        raider: 0.15,
        tower: 0.12,
        barrier: 0.1,
        debris: 0.08,
        half_gate: 0.05,
        oil_spill: 0.05,
      },
    },

    pickups: {
      spawnIntervalMin: 0.6,
      spawnIntervalMax: 1.6,
      weights: {
        repair: 0.22,
        ammo: 0.18,
        nitro: 0.18,
        fuel: 0.15,
        scrap: 0.12,
        coin: 0.08,
        fire: 0.04,
        jump: 0.03,
      },
    },

    events: {
      cooldownMin: 12,
      cooldownMax: 24,
      weights: {
        none: 0.2,
        chase_heavy: 0.3,
        military_checkpoint: 0.25,
        dust_storm: 0.15,
        dark_tunnel: 0.1,
      },
    },

    visual: {
      roadColor: "#4d4a3a",
      groundColor: "#6b5e3a",
      shoulderColor: "#5e5234",
      fogColor: { r: 0.55, g: 0.48, b: 0.35 },
      fogDensity: 0.005,
      ambientDay: "#d4b88a",
      ambientNight: "#5c4832",
      skyDay: "#a68a40",
      skyNight: "#1a1205",
      groundDay: "#362e12",
      groundNight: "#151208",
    },

    weatherPool: ["clear", "ash"],

    props: {
      sandbag: 0.2,
      military_barrier: 0.18,
      wreckage: 0.15,
      debris_pile: 0.12,
      fence: 0.1,
      crate: 0.08,
      barrel: 0.07,
      pole: 0.05,
      sign: 0.05,
    },
  },
};

// ── Zone lookup by distance ─────────────────────────────────────────────
const zoneEntries = Object.values(zoneCatalog).sort((a, b) => a.distanceStart - b.distanceStart);

export function getZoneByDistance(distanceKm) {
  for (const zone of zoneEntries) {
    if (distanceKm >= zone.distanceStart && distanceKm < zone.distanceEnd) {
      return zone;
    }
  }
  // Past all zones → last zone
  return zoneEntries[zoneEntries.length - 1];
}

export function getZoneById(id) {
  return zoneCatalog[id] ?? null;
}

export function getAllZones() {
  return zoneEntries;
}

// ── Checkpoint system ────────────────────────────────────────────────────
// A checkpoint is saved at each zone boundary.
export function getCheckpoints() {
  return zoneEntries.map((zone) => ({
    zoneId: zone.id,
    zoneName: zone.name,
    distance: zone.distanceStart,
    isCheckpoint: zone.distanceStart > 0, // Garage (0km) is not a checkpoint
  }));
}

export function getNextCheckpoint(distanceKm) {
  const checkpoints = getCheckpoints().filter((c) => c.isCheckpoint);
  for (const cp of checkpoints) {
    if (cp.distance > distanceKm) return cp;
  }
  return null;
}

// ── Pickup catalog (extended with new types) ─────────────────────────────
export const pickupCatalog = {
  coin: {
    label: "Coins",
    amount: 1,
    color: "#ffd166",
    geometry: "torus",
  },
  jump: {
    label: "Jump charge",
    amount: 1,
    color: "#7af5b7",
    geometry: "octahedron",
  },
  fire: {
    label: "Fire charge",
    amount: 1,
    color: "#ff8b5e",
    geometry: "octahedron",
  },
  ammo: {
    label: "Ammo crate",
    amount: 3,
    color: "#6fd0ff",
    geometry: "box",
  },
  repair: {
    label: "Repair kit",
    amount: 18,
    color: "#ff96b4",
    geometry: "box",
  },
  fuel: {
    label: "Bio-fuel",
    amount: 18,
    color: "#78d36f",
    geometry: "cylinder",
  },
  scrap: {
    label: "Scrap metal",
    amount: 1,
    color: "#c0a060",
    geometry: "dodecahedron",
  },
  nitro: {
    label: "Nitro boost",
    amount: 3,
    color: "#ff4444",
    geometry: "cylinder",
  },
};

// ── Obstacle catalog (extended with new types) ───────────────────────────
export const obstacleCatalog = {
  // ── Existing types (from content.js) ──
  barrier: { label: "Barrier", category: "wall", damage: 18, isWall: true },
  tower: { label: "Tower", category: "enemy", damage: 35, isWall: true, isEnemy: true },
  raider: { label: "Raider", category: "enemy", damage: 22, isEnemy: true },
  wreck: { label: "Wreck", category: "debris", damage: 20 },
  scrap: { label: "Scrap", category: "debris", damage: 16 },
  mutant: { label: "Mutant", category: "enemy", damage: 25, isEnemy: true },
  ramp: { label: "Ramp", category: "feature", damage: 0, isRamp: true },

  // ── New types ──
  barricade: { label: "Barricade", category: "wall", damage: 22, isWall: true },
  debris: { label: "Debris", category: "debris", damage: 12 },
  oil_spill: { label: "Oil Spill", category: "hazard", damage: 5, noDestroy: true },
  fallen_sign: { label: "Fallen Sign", category: "debris", damage: 10 },
  mine: { label: "Land Mine", category: "hazard", damage: 40 },
  military_barrier: { label: "Mil. Barrier", category: "wall", damage: 30, isWall: true },
  half_gate: { label: "Half Gate", category: "wall", damage: 25, isWall: true },
  rock: { label: "Rock", category: "natural", damage: 15, isWall: true },
  pothole: { label: "Pothole", category: "hazard", damage: 8, noDestroy: true },
};
