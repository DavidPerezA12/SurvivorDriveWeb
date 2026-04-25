export const InputAction = {
  STEER_LEFT: "steer_left",
  STEER_RIGHT: "steer_right",
  ACCELERATE: "accelerate",
  BRAKE: "brake",
  JUMP: "jump",
  FIRE: "fire",
  PAUSE: "pause",
  CONFIRM: "confirm",
  BACK: "back",
};

export const KEY_TO_ACTION = {
  ArrowLeft: InputAction.STEER_LEFT,
  ArrowRight: InputAction.STEER_RIGHT,
  ArrowUp: InputAction.ACCELERATE,
  ArrowDown: InputAction.BRAKE,
  a: InputAction.STEER_LEFT,
  d: InputAction.STEER_RIGHT,
  w: InputAction.ACCELERATE,
  s: InputAction.BRAKE,
  f: InputAction.FIRE,
  " ": InputAction.JUMP,
  Spacebar: InputAction.JUMP,
  Escape: InputAction.PAUSE,
  Enter: InputAction.CONFIRM,
  Backspace: InputAction.BACK,
};

export const CODE_TO_ACTION = {
  ArrowLeft: InputAction.STEER_LEFT,
  KeyA: InputAction.STEER_LEFT,
  ArrowRight: InputAction.STEER_RIGHT,
  KeyD: InputAction.STEER_RIGHT,
  ArrowUp: InputAction.ACCELERATE,
  KeyW: InputAction.ACCELERATE,
  ArrowDown: InputAction.BRAKE,
  KeyS: InputAction.BRAKE,
  Space: InputAction.JUMP,
  KeyF: InputAction.FIRE,
  Escape: InputAction.PAUSE,
  Enter: InputAction.CONFIRM,
  NumpadEnter: InputAction.CONFIRM,
  Backspace: InputAction.BACK,
};

export function createInputState() {
  return {
    left: false,
    right: false,
    accel: false,
    brake: false,
    touch: {
      active: false,
      dx: 0,
      dy: 0,
    },
  };
}

function normalizeKey(key) {
  if (typeof key !== "string" || key.length === 0) return null;
  return key.length === 1 ? key.toLowerCase() : key;
}

export function resolveKeyboardAction(keyOrEvent) {
  if (typeof keyOrEvent === "string") {
    return CODE_TO_ACTION[keyOrEvent] ?? null;
  }

  const normalizedKey = normalizeKey(keyOrEvent?.key);
  if (normalizedKey && KEY_TO_ACTION[normalizedKey]) {
    return KEY_TO_ACTION[normalizedKey];
  }

  if (typeof keyOrEvent?.code === "string") {
    return CODE_TO_ACTION[keyOrEvent.code] ?? null;
  }

  return null;
}

export function applyKeyToInput(input, keyOrEvent, pressed) {
  const action = resolveKeyboardAction(keyOrEvent);
  if (!action) return null;

  if (action === InputAction.STEER_LEFT) input.left = pressed;
  if (action === InputAction.STEER_RIGHT) input.right = pressed;
  if (action === InputAction.ACCELERATE) input.accel = pressed;
  if (action === InputAction.BRAKE) input.brake = pressed;
  return action;
}
