import { pickupCatalog, zoneCatalog } from "./zones.js";
import { buildWeightedPool } from "./random.js";

export const storageKey = "survivor-drive-web-state";
export const schemaVersion = 1;
export const speedPips = 12;

export const equipmentCatalog = {
  chassis: [
    {
      id: "scout",
      name: "Scout",
      description: "Ligero, agil y con buena velocidad punta.",
      stats: {
        speed: 1.08,
        handling: 1.12,
        armor: 0.95,
        reserve: 0.92,
        efficiency: 1.05,
        ammoCap: 0.95,
      },
      color: "#d8b36b",
      role: "Sprint",
    },
    {
      id: "hauler",
      name: "Hauler",
      description: "Pesado, estable y con casco reforzado.",
      stats: {
        speed: 0.94,
        handling: 0.9,
        armor: 1.2,
        reserve: 1.2,
        efficiency: 0.94,
        ammoCap: 1.08,
      },
      color: "#7d8f99",
      role: "Tank",
    },
    {
      id: "interceptor",
      name: "Interceptor",
      description: "Intermedio, pensado para runs largas.",
      stats: {
        speed: 1.0,
        handling: 1.0,
        armor: 1.05,
        reserve: 1.06,
        efficiency: 1.08,
        ammoCap: 1.16,
      },
      color: "#a86143",
      role: "Long run",
    },
  ],
  tires: [
    {
      id: "grip",
      name: "Grip",
      description: "Mas control lateral sobre arena compacta.",
      stats: { handling: 1.15, jump: 1.0, traction: 1.08, efficiency: 1.02 },
    },
    {
      id: "offroad",
      name: "Off-road",
      description: "Amortigua mejor baches y aterrizajes.",
      stats: { handling: 0.96, jump: 1.12, traction: 1.02, reserve: 1.04 },
    },
    {
      id: "scrap",
      name: "Scrap",
      description: "Viejos, pero sorprendentemente rapidos.",
      stats: { handling: 0.92, jump: 0.94, traction: 1.12, efficiency: 0.94, ammoCap: 1.04 },
    },
  ],
  rig: [
    {
      id: "ram",
      name: "Ram",
      description: "Defensa frontal agresiva para romper obstaculos ligeros.",
      stats: { fireRadius: 1.15, armor: 1.05, ammoCap: 1.08 },
    },
    {
      id: "tank",
      name: "Tank",
      description: "Blindaje adicional y menos daño por impacto.",
      stats: { fireRadius: 0.95, armor: 1.18, reserve: 1.1 },
    },
    {
      id: "booster",
      name: "Booster",
      description: "Montaje ligero para ganar algo de aceleracion base.",
      stats: { speed: 1.08, armor: 0.92, efficiency: 1.12, ammoCap: 0.92 },
    },
  ],
};

export const upgradeCatalog = {
  fuel_tank: {
    id: "fuel_tank",
    name: "Fuel Tank",
    description: "Deposito reforzado para aguantar mas tramo entre paradas.",
    maxLevel: 3,
    costs: [3, 5, 8],
    stats: { reserve: 0.08 },
  },
  ammo_rack: {
    id: "ammo_rack",
    name: "Ammo Rack",
    description: "Montaje extra de municion para sostener el fuego.",
    maxLevel: 3,
    costs: [2, 4, 7],
    stats: { ammoCap: 0.1 },
  },
  armor_plating: {
    id: "armor_plating",
    name: "Armor Plating",
    description: "Placas adicionales para aguantar impactos frontales.",
    maxLevel: 3,
    costs: [4, 6, 9],
    stats: { armor: 0.07 },
  },
};

export function getUpgradeCost(upgradeId, level, catalog = upgradeCatalog) {
  const upgrade = catalog[upgradeId];
  if (!upgrade) return null;
  return upgrade.costs?.[level] ?? null;
}

export const biomeCatalog = {
  desert: {
    id: "desert",
    name: zoneCatalog.desert.name,
    label: "Desert run",
    hint: "Empuja a fondo por el wasteland hasta que el asfalto se convierta en zona militar.",
    checkpointKm: zoneCatalog.desert.distanceEnd,
    completionKm: null,
    color: "#ffb673",
  },
  city: {
    id: "city",
    name: zoneCatalog.ghost_town.name + " / " + zoneCatalog.military.name,
    label: "City breach",
    hint: "Atraviesa el distrito y sal de la bolsa de fuego.",
    checkpointKm: null,
    completionKm: null,
    color: "#9ad1ff",
  },
};

export const objectiveCatalog = {
  desert: {
    title: "Push through the wasteland",
    summary: "La ruta es continua: aguanta y abre camino hacia la ciudad.",
  },
  city: {
    title: "Endure the ruined district",
    summary: "La ruta urbana queda abierta: aguanta todo lo que puedas.",
  },
};

export const environmentProfiles = {
  clear: {
    id: "clear",
    label: "Clear",
    tint: "#54371b",
    fogBoost: 0,
    handling: 1,
    threatBoost: 0,
    fuelUse: 1,
  },
  dust: {
    id: "dust",
    label: "Dust Storm",
    tint: "#5c331b",
    fogBoost: 0.002,
    handling: 0.94,
    threatBoost: 14,
    fuelUse: 1.16,
  },
  ash: {
    id: "ash",
    label: "Ash Front",
    tint: "#3b2925",
    fogBoost: 0.0015,
    handling: 0.97,
    threatBoost: 8,
    fuelUse: 1.12,
  },
  smog: {
    id: "smog",
    label: "Smog Bank",
    tint: "#4a5159",
    fogBoost: 0.0015,
    handling: 0.95,
    threatBoost: 12,
    fuelUse: 1.1,
  },
};

function rgbToHex(r, g, b) {
  const hr = Math.min(255, Math.max(0, Math.round(r)))
    .toString(16)
    .padStart(2, "0");
  const hg = Math.min(255, Math.max(0, Math.round(g)))
    .toString(16)
    .padStart(2, "0");
  const hb = Math.min(255, Math.max(0, Math.round(b)))
    .toString(16)
    .padStart(2, "0");
  return "#" + hr + hg + hb;
}

function zoneVisualToSkyPalette(zoneId) {
  const zone = zoneCatalog[zoneId];
  if (!zone) return null;
  const v = zone.visual;
  return {
    bgNight: v.skyNight,
    bgDay: v.skyDay,
    fogNight: rgbToHex(
      v.fogColor.r * 255 * 0.55,
      v.fogColor.g * 255 * 0.55,
      v.fogColor.b * 255 * 0.55,
    ),
    fogDay: rgbToHex(v.fogColor.r * 255, v.fogColor.g * 255, v.fogColor.b * 255),
    ambientNight: v.ambientNight,
    ambientDay: v.ambientDay,
    groundNight: v.groundNight,
    groundDay: v.groundDay,
  };
}

export const skyPalette = Object.fromEntries(
  Object.keys(zoneCatalog).map((id) => [id, zoneVisualToSkyPalette(id)]),
);

export { pickupCatalog };

function sumWeights(zones, selectWeights, { exclude } = {}) {
  const totals = {};

  for (const zone of zones) {
    for (const [kind, weight] of Object.entries(selectWeights(zone))) {
      if (kind === exclude) continue;
      totals[kind] = (totals[kind] ?? 0) + weight;
    }
  }

  return totals;
}

function averageWeights(weights, divisor) {
  return Object.fromEntries(
    Object.entries(weights).map(([kind, weight]) => [kind, divisor > 0 ? weight / divisor : 0]),
  );
}

function buildEncounterBiome(zoneIds) {
  const zones = zoneIds.map((id) => zoneCatalog[id]).filter(Boolean);
  const obstacleWeights = sumWeights(zones, (zone) => zone.obstacles.weights);
  const pickupWeights = sumWeights(zones, (zone) => zone.pickups.weights, { exclude: "none" });

  const obstacleBias = averageWeights(obstacleWeights, zones.length);
  const weightedPickups = buildWeightedPool(pickupWeights);

  return { obstacleBias, weightedPickups };
}

export const encounterConfig = Object.fromEntries(
  Object.keys(zoneCatalog).map((id) => [id, buildEncounterBiome([id])]),
);
