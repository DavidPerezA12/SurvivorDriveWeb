import test from "node:test";
import assert from "node:assert/strict";

import { applyKeyToInput, createInputState, resolveKeyboardAction, InputAction } from "./input.js";

test("resolveKeyboardAction prioritizes event.key for letter controls", () => {
  assert.equal(resolveKeyboardAction({ key: "d", code: "KeyA" }), InputAction.STEER_RIGHT);
  assert.equal(resolveKeyboardAction({ key: "a", code: "KeyD" }), InputAction.STEER_LEFT);
});

test("resolveKeyboardAction falls back to event.code when key is unavailable", () => {
  assert.equal(resolveKeyboardAction({ code: "KeyD" }), InputAction.STEER_RIGHT);
  assert.equal(resolveKeyboardAction({ code: "Space" }), InputAction.JUMP);
});

test("applyKeyToInput updates lateral state from key-based input", () => {
  const input = createInputState();

  applyKeyToInput(input, { key: "d", code: "KeyA" }, true);
  assert.equal(input.right, true);
  assert.equal(input.left, false);

  applyKeyToInput(input, { key: "d", code: "KeyA" }, false);
  assert.equal(input.right, false);
});
