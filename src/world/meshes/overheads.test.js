import test from "node:test";
import assert from "node:assert/strict";

import { createOverheadMesh } from "./overheads.js";

test("createOverheadMesh builds deterministic urban gantry", () => {
  const overhead = createOverheadMesh("ghost_town", () => 0.5);

  assert.equal(overhead.userData.isGantry, true);
  assert.equal(overhead.position.z, 225);
  assert.ok(overhead.children.length >= 6);
});

test("createOverheadMesh builds deterministic desert arch", () => {
  const overhead = createOverheadMesh("desert", () => 0.9);

  assert.equal(overhead.userData.isGantry, undefined);
  assert.equal(overhead.position.z, 245);
  assert.ok(overhead.children.length >= 1);
});
