import test from "node:test";
import assert from "node:assert/strict";

import { pickupCatalog } from "../../game/content.js";
import { createPickupMesh } from "./pickups.js";

test("createPickupMesh assigns runtime pickup metadata", () => {
  const pickup = createPickupMesh("nitro", pickupCatalog, {}, 1.2);

  assert.equal(pickup.userData.type, "pickup");
  assert.equal(pickup.userData.pickupType, "nitro");
  assert.equal(pickup.userData.amount, pickupCatalog.nitro.amount);
  assert.equal(pickup.userData.label, pickupCatalog.nitro.label);
  assert.ok(pickup.children.length >= 3);
});
