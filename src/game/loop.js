export function createGameLoop({
  world,
  updateEnvironment,
  isPlaying,
  updateRun,
  updateCinematic,
}) {
  let frameId = null;
  let running = false;

  function tick() {
    if (!running) return;

    frameId = requestAnimationFrame(tick);

    const now = performance.now();
    const dt = Math.min((now - world.lastTime) / 1000, 0.033);
    world.lastTime = now;

    updateEnvironment(dt);

    if (isPlaying()) {
      updateRun(dt);
    } else {
      updateCinematic(dt);
    }

    world.renderer.render(world.scene, world.camera);
  }

  return {
    start() {
      if (running) return;
      running = true;
      world.lastTime = performance.now();
      tick();
    },

    stop() {
      running = false;
      if (frameId != null) cancelAnimationFrame(frameId);
      frameId = null;
    },
  };
}
