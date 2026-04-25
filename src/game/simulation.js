import { biomeCatalog, encounterConfig, equipmentCatalog, objectiveCatalog, pickupCatalog } from "./content.js";

export function applyLoadout(loadout) {
  const selected = {
    chassis: equipmentCatalog.chassis.find((item) => item.id === loadout.chassis),
    tires: equipmentCatalog.tires.find((item) => item.id === loadout.tires),
    rig: equipmentCatalog.rig.find((item) => item.id === loadout.rig),
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
    for (const [key, value] of Object.entries(entry.stats)) {
      merged[key] = (merged[key] ?? 1) * value;
    }
  }

  return { selected, merged };
}

export function createRunState(saveData, biome = "desert") {
  const { merged } = applyLoadout(saveData.loadout);
  const biomeMeta = biomeCatalog[biome];
  const startingDistance = biome === "city" ? biomeCatalog.desert.checkpointKm : 0;
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
    ammoMax: Math.max(4, Math.round(8 * merged.ammoCap)),
    ammo: Math.max(4, Math.round(8 * merged.ammoCap)),
    health: 100,
    coins: 0,
    jumps: 1,
    fire: 1,
    distance: startingDistance,
    sessionDistance: 0,
    kills: 0,
    threat: 0,
    weatherLabel: "Clear",
    cycleLabel: "Day",
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
    cityTransitionArmed: biome === "desert",
    cityTransitionDone: biome === "city",
  };
}

export function resolvePickup(run, type) {
  const pickup = pickupCatalog[type];
  if (!pickup) return null;

  if (type === "coin") run.coins += pickup.amount;
  if (type === "jump") run.jumps += pickup.amount;
  if (type === "fire") run.fire += pickup.amount;
  if (type === "ammo") run.ammo = Math.min(run.ammoMax, run.ammo + pickup.amount);
  if (type === "repair") run.health = Math.min(100, run.health + pickup.amount);
  return pickup;
}

export function resolveCollision(run, damage) {
  const appliedDamage = Math.round(damage / run.armor);
  run.health -= appliedDamage;
  run.invulnerable = 0.8;
  return appliedDamage;
}

export function spawnEncounter(run, biome) {
  const config = encounterConfig[biome];
  const threat = Math.min(1, (run.threat ?? 0) / 100);
  const table = { ...config.obstacleBias };
  table.raider += threat * 0.16;
  table.tower += threat * (biome === "city" ? 0.12 : 0.05);
  table.barrier += threat * 0.04;
  table.scrap = Math.max(0.08, table.scrap - threat * 0.12);

  const roll = Math.random();
  let cumulative = 0;
  for (const [kind, weight] of Object.entries(table)) {
    cumulative += weight;
    if (roll <= cumulative) return kind;
  }
  return biome === "city" ? "wreck" : "scrap";
}

export function choosePickupType(run, biome) {
  const config = encounterConfig[biome];
  const scarcityBoost = run.fuel < 40 ? ["fuel", "ammo"] : [];
  const pool = config.weightedPickups.concat(scarcityBoost);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function updateRunProgression(run) {
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

  const completedRun =
    run.biome === "city" &&
    Number.isFinite(biomeCatalog.city.completionKm) &&
    run.distance >= biomeCatalog.city.completionKm;

  return {
    shouldEnterCity,
    completedRun,
  };
}
