import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseNextWeather,
  isDesertZone,
  isUrbanZone,
  resolveCycleLabel,
  resolveZoneTransition,
} from "./environmentRuntime.js";

test("zone helpers classify progressive zones", () => {
  assert.equal(isDesertZone("garage"), true);
  assert.equal(isDesertZone("broken_highway"), true);
  assert.equal(isDesertZone("ghost_town"), false);
  assert.equal(isUrbanZone("ghost_town"), true);
  assert.equal(isUrbanZone("military"), true);
  assert.equal(isUrbanZone("desert"), false);
});

test("resolveCycleLabel maps cycle ranges", () => {
  assert.equal(resolveCycleLabel(0.05), "Night");
  assert.equal(resolveCycleLabel(0.25), "Dawn");
  assert.equal(resolveCycleLabel(0.5), "Day");
  assert.equal(resolveCycleLabel(0.7), "Dusk");
});

test("chooseNextWeather avoids biome-incompatible weather", () => {
  const profiles = {
    clear: {},
    dust: {},
    smog: {},
    rain: {},
  };

  assert.equal(chooseNextWeather("clear", profiles, "ghost_town", () => 0), "smog");
  assert.equal(chooseNextWeather("clear", profiles, "desert", () => 0), "dust");
});

test("resolveZoneTransition exposes current and next zone blend data", () => {
  const transition = resolveZoneTransition(0.49);

  assert.equal(transition.zone.id, "garage");
  assert.equal(transition.nextZone.id, "broken_highway");
  assert.ok(transition.blend > 0);
  assert.ok(transition.blend < 1);
});
