import test from "node:test";
import assert from "node:assert/strict";

import { buildWeightedPool, weightedKey } from "./random.js";

test("weightedKey returns the fallback when every weight is non-positive", () => {
  assert.equal(weightedKey({ a: 0, b: -1 }, "fallback"), "fallback");
});

test("weightedKey ignores non-positive weights", () => {
  assert.equal(weightedKey({ none: 0, fuel: 3 }, "none"), "fuel");
});

test("buildWeightedPool expands positive weights and skips zero weights", () => {
  const pool = buildWeightedPool({ none: 0, fuel: 2, repair: 1 }, 6);

  assert.equal(pool.includes("none"), false);
  assert.equal(pool.filter((item) => item === "fuel").length, 4);
  assert.equal(pool.filter((item) => item === "repair").length, 2);
});
