import type { Intent } from '../sim';

/**
 * Keyboard → typed intents, the only channel from input into the sim.
 *
 * Steering is edge-triggered and *queued*: each fresh key press enqueues one
 * lane-change, and the loop drains one per tick. So a single tap is exactly one
 * lane change even when a frame runs several catch-up ticks, and holding a key
 * (which fires `repeat`) never machine-guns across the road. Jump is a latch,
 * consumed once per press (the sim also gates it on being grounded). Fire is a
 * *held* state — true while the trigger key is down — and the sim gates the
 * cadence, so holding it auto-fires (docs/DESIGN.md → Pillar 2).
 */
export class Keyboard {
  private readonly queue: number[] = [];
  private jumpLatched = false;
  private fireHeld = false;
  private restartLatched = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Fire is a held state, so it must register even on auto-repeat events.
    if (e.key === 'f' || e.key === 'F' || e.key === 'Shift') {
      this.fireHeld = true;
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.queue.push(-1);
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.queue.push(1);
        e.preventDefault();
        break;
      case ' ':
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.jumpLatched = true;
        e.preventDefault();
        break;
      case 'r':
      case 'R':
        this.restartLatched = true;
        break;
      default:
        break;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'f' || e.key === 'F' || e.key === 'Shift') this.fireHeld = false;
  };

  /** The intent for the next tick: at most one queued lane change, one jump, held fire. */
  takeIntent(): Intent {
    const steer = this.queue.shift();
    const jump = this.jumpLatched;
    this.jumpLatched = false;
    return { steer: steer === -1 || steer === 1 ? steer : 0, jump, fire: this.fireHeld };
  }

  /** Whether a restart was requested since the last check (app-level, not a sim intent). */
  takeRestart(): boolean {
    const r = this.restartLatched;
    this.restartLatched = false;
    return r;
  }

  /** Drop any buffered input (on resume/restart) so the menu never leaks moves. */
  reset(): void {
    this.queue.length = 0;
    this.jumpLatched = false;
    this.fireHeld = false;
    this.restartLatched = false;
  }
}
