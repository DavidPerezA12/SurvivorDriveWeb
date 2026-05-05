export function applyLoadout(loadout, equipmentCatalog, upgrades = {}) {
  const selected = {
    chassis:
      equipmentCatalog.chassis.find((item) => item.id === loadout.chassis) ??
      equipmentCatalog.chassis[0],
    tires:
      equipmentCatalog.tires.find((item) => item.id === loadout.tires) ??
      equipmentCatalog.tires[0],
    rig:
      equipmentCatalog.rig.find((item) => item.id === loadout.rig) ??
      equipmentCatalog.rig[0],
  };

  const merged = {
    speed: 1,
    handling: 1,
    armor: 1,
    jump: 1,
    traction: 1,
    fireRadius: 1,
    reserve: 1,
    efficiency: 1,
    ammoCap: 1,
  };

  for (const entry of Object.values(selected)) {
    if (!entry?.stats) continue;
    for (const [key, value] of Object.entries(entry.stats)) {
      merged[key] = (merged[key] ?? 1) * value;
    }
  }

  const upgradeStats = {
    fuel_tank: { reserve: 0.08 },
    ammo_rack: { ammoCap: 0.1 },
    armor_plating: { armor: 0.07 },
  };

  for (const [upgradeId, level] of Object.entries(upgrades ?? {})) {
    if (!level) continue;
    const stats = upgradeStats[upgradeId];
    if (!stats) continue;
    for (const [key, value] of Object.entries(stats)) {
      merged[key] = (merged[key] ?? 1) * (1 + value * level);
    }
  }

  return { selected, merged };
}

export function createRunState(saveData, biome = "desert", biomeCatalog, objectiveCatalog, equipmentCatalog) {
  const { merged } = applyLoadout(saveData.loadout, equipmentCatalog, saveData.upgrades);
  const biomeMeta = biomeCatalog[biome];
  const startingDistance = biome === "city" ? biomeCatalog.desert.checkpointKm : 0;
  const ammoMax = Math.max(4, Math.round(8 * merged.ammoCap));
  const fuelMax = Math.round(100 * merged.reserve);
  return {
    biome,
    biomeLabel: biomeMeta.label,
    objective: objectiveCatalog[biome].title,
    objectiveProgress: 0,
    objectiveTarget: biomeMeta.completionKm,
    objectiveSummary: objectiveCatalog[biome].summary,
    startedInCity: biome === "city",
    baseSpeed: 12 * merged.speed,
    speed: 12 * merged.speed,
    handling: 9 * merged.handling,
    armor: merged.armor,
    jumpPower: 10.35 * merged.jump,
    fireRadius: 4.8 * merged.fireRadius,
    traction: merged.traction,
    ammoMax,
    ammo: ammoMax,
    health: 100,
    fuelMax,
    fuel: fuelMax,
    fuelEfficiency: merged.efficiency,
    coins: 0,
    scrap: 0,
    nitroTimer: 0,
    jumps: 1,
    fire: 1,
    distance: startingDistance,
    sessionDistance: 0,
    kills: 0,
    threat: 0,
    weatherLabel: "Clear",
    cycleLabel: "Day",
    weatherFuelUse: 1,
    weatherHandling: 1,
    weatherThreat: 0,
    endReason: "",
    x: 0,
    lateralVel: 0,
    steerSmoothed: 0,
    throttleSmoothed: 0,
    camSwayXSmoothed: 0,
    speedFactor: 1,
    gripFactor: 1,
    skidding: false,
    suspensionY: 0,
    suspensionVel: 0,
    pitchAngle: 0,
    y: 0,
    yVelocity: 0,
    grounded: true,
    invulnerable: 0,
    obstacleTimer: 0,
    pickupTimer: 0,
    propTimer: 0,
    overheadTimer: 0,
    lastMileMarker: 0,
    cityTransitionArmed: biome === "desert",
    cityTransitionDone: biome === "city",
  };
}

export function resolvePickup(run, type, pickupCatalog) {
  const pickup = pickupCatalog[type];
  if (!pickup) return null;

  if (type === "coin") run.coins += pickup.amount;
  if (type === "scrap") run.scrap += pickup.amount;
  if (type === "nitro") run.nitroTimer = (run.nitroTimer ?? 0) + pickup.amount;
  if (type === "jump") run.jumps += pickup.amount;
  if (type === "fire") run.fire += pickup.amount;
  if (type === "ammo") run.ammo = Math.min(run.ammoMax, run.ammo + pickup.amount);
  if (type === "repair") run.health = Math.min(100, run.health + pickup.amount);
  if (type === "fuel") run.fuel = Math.min(run.fuelMax ?? 100, run.fuel + pickup.amount);
  return pickup;
}

export function resolveCollision(run, damage) {
  const appliedDamage = Math.round(damage / run.armor);
  run.health -= appliedDamage;
  run.invulnerable = 0.8;
  return appliedDamage;
}

export function spawnEncounter(run, biome, encounterConfig) {
  const config = encounterConfig[biome];
  if (!config) return "scrap";
  const threat = Math.min(1, (run.threat ?? 0) / 100);
  const table = { ...config.obstacleBias };
  if ("raider" in table) table.raider += threat * 0.16;
  if ("tower" in table) table.tower += threat * (biome === "city" ? 0.12 : 0.05);
  if ("barrier" in table) table.barrier += threat * 0.04;
  if ("scrap" in table) table.scrap = Math.max(0.08, table.scrap - threat * 0.12);

  const totalWeight = Object.values(table).reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (totalWeight <= 0) return "scrap";

  let roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (const [kind, weight] of Object.entries(table)) {
    cumulative += Math.max(0, weight);
    if (roll <= cumulative) return kind;
  }
  return Object.keys(table).find((kind) => kind !== "none") ?? "scrap";
}

export function choosePickupType(run, biome, encounterConfig) {
  const config = encounterConfig[biome];
  const scarcityBoost = run.fuel < 40 ? ["ammo", "repair"] : [];
  const pool = config.weightedPickups.concat(scarcityBoost);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function updateRunProgression(run, biomeCatalog) {
  run.sessionDistance = Math.max(0, run.distance - (run.biome === "city" ? biomeCatalog.desert.checkpointKm : 0));
  if (!Number.isFinite(run.objectiveTarget)) {
    run.objectiveProgress = run.biome === "city" ? run.sessionDistance : run.distance;
  } else {
    run.objectiveProgress = run.biome === "city"
      ? Math.min(run.objectiveTarget, run.sessionDistance)
      : Math.min(run.objectiveTarget, run.distance);
  }

  const shouldEnterCity =
    run.biome === "desert" &&
    run.cityTransitionArmed &&
    run.distance >= biomeCatalog.desert.checkpointKm;

  if (shouldEnterCity) {
    run.cityTransitionArmed = false;
  }

  const completedRun =
    run.biome === "city" &&
    Number.isFinite(biomeCatalog.city.completionKm) &&
    run.distance >= biomeCatalog.city.completionKm;

  return { shouldEnterCity, completedRun };
}
