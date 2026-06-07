export class GameLoop {
  private frameId = 0;
  private lastTime = 0;

  constructor(private readonly update: (deltaS: number) => void) {}

  start(): void {
    const tick = (time: number) => {
      const deltaS = this.lastTime > 0 ? Math.min(0.05, (time - this.lastTime) / 1000) : 0;
      this.lastTime = time;
      this.update(deltaS);
      this.frameId = window.requestAnimationFrame(tick);
    };

    this.frameId = window.requestAnimationFrame(tick);
  }

  stop(): void {
    window.cancelAnimationFrame(this.frameId);
  }
}
