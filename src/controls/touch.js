import { isRunRoute } from "../game/routes.js";

export function setupTouchControls(world) {
  const hasTouch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  if (!hasTouch) return;

  const joystickEl = document.createElement("div");
  joystickEl.id = "touch-joystick";
  joystickEl.innerHTML = `<div id="touch-knob"></div>`;
  document.querySelector(".shell").appendChild(joystickEl);

  const knob = document.getElementById("touch-knob");
  const RADIUS = 52;
  let touchId = null;
  let originX = 0;
  let originY = 0;

  function onStart(e) {
    if (!isRunRoute(world.route)) return;

    const touch = e.changedTouches[0];
    if (touch.clientX > window.innerWidth * 0.55) return;

    e.preventDefault();
    touchId = touch.identifier;
    originX = touch.clientX;
    originY = touch.clientY;
    joystickEl.style.left = `${originX - 64}px`;
    joystickEl.style.top = `${originY - 64}px`;
    joystickEl.classList.add("active");
    world.input.touch.active = true;
  }

  function onMove(e) {
    if (touchId === null) return;

    e.preventDefault();
    const touch = [...e.changedTouches].find((t) => t.identifier === touchId);
    if (!touch) return;

    const dx = touch.clientX - originX;
    const dy = touch.clientY - originY;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(distance, RADIUS);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;

    knob.style.transform = `translate(${kx}px, ${ky}px)`;
    world.input.touch.dx = kx / RADIUS;
    world.input.touch.dy = ky / RADIUS;
  }

  function onEnd(e) {
    const touch = [...e.changedTouches].find((t) => t.identifier === touchId);
    if (!touch) return;

    touchId = null;
    knob.style.transform = "translate(0,0)";
    joystickEl.classList.remove("active");
    world.input.touch.active = false;
    world.input.touch.dx = 0;
    world.input.touch.dy = 0;
  }

  document.addEventListener("touchstart", onStart, { passive: false });
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);
  document.addEventListener("touchcancel", onEnd);
}
