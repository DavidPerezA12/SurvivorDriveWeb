import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLoadout,
  createRunState,
  resolvePickup,
  resolveCollision,
  spawnEncounter,
  choosePickupType,
  updateRunProgression,
} from "./simulation.js";
import {
  biomeCatalog,
  equipmentCatalog,
  encounterConfig,
  objectiveCatalog,
  pickupCatalog,
  upgradeCatalog,
} from "./content.js";
import { hydrateSave, deepMerge, saveSaveData } from "./persistence.js";
import { defaultSaveData } from "./persistence.js";

test("applyLoadout returns correct multipliers for default equip", () => {
  const loadout = {
    chassis: "scout",
    tires: "grip",
    rig: "ram",
  };
  const { selected, merged } = applyLoadout(loadout, equipmentCatalog);
  assert.equal(selected.chassis.id, "scout");
  assert.equal(selected.tires.id, "grip");
  assert.equal(selected.rig.id, "ram");
  assert.ok(merged.speed > 1, "scout+grip speed should be > 1");
  assert.ok(merged.handling > 1, "grip handling bonus");
});

test("applyLoadout multiply stacks correctly", () => {
  const loadout = {
    chassis: "hauler",
    tires: "grip",
    rig: "tank",
  };
  const { merged } = applyLoadout(loadout, equipmentCatalog);
  const expectedArmor = 1.2 * 1.0 * 1.18;
  assert.ok(
    Math.abs(merged.armor - expectedArmor) < 0.001,
    `armor should be ${expectedArmor}, got ${merged.armor}`,
  );
});

test("applyLoadout uses upgrade catalog stats", () => {
  const loadout = {
    chassis: "scout",
    tires: "grip",
    rig: "ram",
  };
  const { merged } = applyLoadout(loadout, equipmentCatalog, { fuel_tank: 2 }, upgradeCatalog);
  assert.ok(Math.abs(merged.reserve - 0.92 * 1.16) < 0.001);
});

function makeSaveData() {
  return structuredClone(defaultSaveData);
}

test("createRunState initializes all fields", () => {
  const saveData = makeSaveData();
  const run = createRunState(saveData, "desert", biomeCatalog, objectiveCatalog, equipmentCatalog);
  assert.equal(run.biome, "desert");
  assert.equal(run.health, 100);
  assert.equal(run.jumps, 1);
  assert.equal(run.fire, 1);
  assert.equal(run.grounded, true);
  assert.equal(typeof run.baseSpeed, "number");
  assert.ok(run.baseSpeed > 0);
  assert.ok(run.ammo >= 4);
  assert.ok(Number.isFinite(run.fuel), "fuel should be a number");
});

test("createRunState city starts at desert checkpoint distance", () => {
  const saveData = makeSaveData();
  const run = createRunState(saveData, "city", biomeCatalog, objectiveCatalog, equipmentCatalog);
  assert.equal(run.distance, biomeCatalog.desert.checkpointKm);
  assert.equal(run.startedInCity, true);
});

test("resolveCollision reduces health by damage/armor", () => {
  const run = { health: 100, armor: 2, invulnerable: 0 };
  const applied = resolveCollision(run, 20);
  assert.equal(applied, 10);
  assert.equal(run.health, 90);
  assert.ok(run.invulnerable > 0, "invulnerable should be set after collision");
});

test("resolvePickup adds correct amounts", () => {
  const run = { coins: 0, jumps: 0, fire: 0, ammo: 5, ammoMax: 12, health: 80 };
  resolvePickup(run, "coin", pickupCatalog);
  assert.equal(run.coins, 1);

  resolvePickup(run, "ammo", pickupCatalog);
  assert.equal(run.ammo, 8);

  resolvePickup(run, "ammo", pickupCatalog);
  assert.equal(run.ammo, 11);

  resolvePickup(run, "repair", pickupCatalog);
  assert.equal(run.health, 98);

  resolvePickup(run, "repair", pickupCatalog);
  assert.equal(run.health, 100);
});

test("resolvePickup stacks nitro duration", () => {
  const run = { nitroTimer: 1 };
  resolvePickup(run, "nitro", pickupCatalog);
  assert.equal(run.nitroTimer, 4);
});

test("spawnEncounter always returns a valid kind", () => {
  const run = { threat: 20 };
  const validKinds = Object.keys(encounterConfig.desert.obstacleBias);
  for (let i = 0; i < 50; i++) {
    const kind = spawnEncounter(run, "desert", encounterConfig);
    assert.ok(validKinds.includes(kind), `unexpected kind: ${kind}`);
  }
});

test("spawnEncounter preserves safe-zone empty rolls", () => {
  const originalRandom = Math.random;
  Math.random = () => 0.1;
  try {
    const run = { threat: 0 };
    assert.equal(spawnEncounter(run, "garage", encounterConfig), "none");
  } finally {
    Math.random = originalRandom;
  }
});

test("updateRunProgression detects city transition", () => {
  const saveData = makeSaveData();
  const run = createRunState(saveData, "desert", biomeCatalog, objectiveCatalog, equipmentCatalog);
  run.cityTransitionArmed = true;
  run.distance = biomeCatalog.desert.checkpointKm + 1;
  const result = updateRunProgression(run, biomeCatalog);
  assert.equal(result.shouldEnterCity, true);
});

test("updateRunProgression disarms transition after detection", () => {
  const saveData = makeSaveData();
  const run = createRunState(saveData, "desert", biomeCatalog, objectiveCatalog, equipmentCatalog);
  run.cityTransitionArmed = true;
  run.distance = biomeCatalog.desert.checkpointKm + 1;
  updateRunProgression(run, biomeCatalog);
  assert.equal(run.cityTransitionArmed, false, "should disarm after detection");
});

test("deepMerge merges nested objects", () => {
  const result = deepMerge({ a: 1, b: { c: 2 } }, { b: { d: 3 } });
  assert.deepEqual(result, { a: 1, b: { c: 2, d: 3 } });
});

test("hydrateSave merges defaults with partial data", () => {
  const partial = { options: { volume: 30 } };
  const hydrated = hydrateSave(partial);
  assert.equal(hydrated.options.volume, 30);
  assert.equal(hydrated.options.quality, "low");
  assert.equal(hydrated.unlocks.city, false);
});

test("saveSaveData persists permanent upgrades", () => {
  const originalLocalStorage = globalThis.localStorage;
  let storedValue = "";
  globalThis.localStorage = {
    setItem(_key, value) {
      storedValue = value;
    },
  };

  try {
    const saveData = makeSaveData();
    saveData.upgrades.fuel_tank = 2;
    saveSaveData(saveData);
    assert.equal(JSON.parse(storedValue).upgrades.fuel_tank, 2);
  } finally {
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
  }
});

test("choosePickupType respects fuel scarcity", () => {
  const run = { fuel: 20 };
  const types = new Set();
  for (let i = 0; i < 50; i++) {
    types.add(choosePickupType(run, "desert", encounterConfig));
  }
  assert.ok(types.has("ammo") || types.has("repair"), "scarcity boost should add ammo/repair");
});

test("choosePickupType works at normal fuel", () => {
  const run = { fuel: 80 };
  for (let i = 0; i < 30; i++) {
    const type = choosePickupType(run, "desert", encounterConfig);
    assert.ok(encounterConfig.desert.weightedPickups.includes(type));
  }
});
