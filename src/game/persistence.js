import { equipmentCatalog, schemaVersion, storageKey } from "./content.js";

export const defaultSaveData = {
  schemaVersion,
  options: {
    volume: 60,
    quality: "low",
    fullscreen: false,
    weatherFx: false,
    dayNight: true,
    resolutionScale: "performance",
  },
  loadout: {
    chassis: equipmentCatalog.chassis[0].id,
    tires: equipmentCatalog.tires[0].id,
    rig: equipmentCatalog.rig[0].id,
  },
  progression: {
    cityUnlocked: false,
    lastBiome: "desert",
    bestDistance: 0,
    bestCityDistance: 0,
    totalRuns: 0,
    totalKills: 0,
    totalCoins: 0,
    scrapBank: 0,
  },
  upgrades: {
    fuel_tank: 0,
    ammo_rack: 0,
    armor_plating: 0,
  },
  unlocks: {
    city: false,
  },
  stats: {
    lastRunDistance: 0,
    lastRunBiome: "desert",
    totalPlaySeconds: 0,
  },
};

export function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] ?? {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

export function hydrateSave(rawSave) {
  const base = structuredClone(defaultSaveData);
  const hydrated = deepMerge(base, rawSave ?? {});
  hydrated.schemaVersion = schemaVersion;
  hydrated.unlocks.city = Boolean(hydrated.unlocks.city || hydrated.progression.cityUnlocked);
  hydrated.progression.cityUnlocked = hydrated.unlocks.city;
  return hydrated;
}

function serializeSave(saveData) {
  return JSON.stringify({
    schemaVersion,
    options: saveData.options,
    loadout: saveData.loadout,
    progression: saveData.progression,
    upgrades: saveData.upgrades,
    unlocks: saveData.unlocks,
    stats: saveData.stats,
  });
}

export function loadSaveData() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return hydrateSave();
    return hydrateSave(JSON.parse(raw));
  } catch (e) {
    console.warn("Failed to load save data:", e.message);
    return hydrateSave();
  }
}

export function saveSaveData(saveData) {
  localStorage.setItem(storageKey, serializeSave(saveData));
}

export function registerRunResult(saveData, run) {
  saveData.progression.totalRuns += 1;
  saveData.progression.totalKills += run.kills;
  saveData.progression.totalCoins += run.coins;
  saveData.progression.scrapBank = (saveData.progression.scrapBank ?? 0) + (run.scrap ?? 0);
  saveData.progression.bestDistance = Math.max(saveData.progression.bestDistance, run.distance);
  if (run.biome === "city") {
    saveData.progression.bestCityDistance = Math.max(
      saveData.progression.bestCityDistance,
      run.distance,
    );
  }
  saveData.progression.lastBiome = run.biome;
  saveData.stats.lastRunDistance = run.distance;
  saveData.stats.lastRunBiome = run.biome;
}

export function unlockCity(saveData) {
  saveData.progression.cityUnlocked = true;
  saveData.unlocks.city = true;
}
