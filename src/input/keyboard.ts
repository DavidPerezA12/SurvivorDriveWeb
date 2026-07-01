import type { Intent } from '../sim';

/**
 * Keyboard → typed intents, the only channel from input into the sim.
 *
 * Steering is a held axis: the steer keys are tracked down/up and reported as
 * -1 (left) / +1 (right) / 0 (centered) for as long as they are held, so the car
 * drives continuously across the road. Pressing both at once cancels to 0. Jump is
 * a latch, consumed once per press (the sim also gates it on being grounded). Fire
 * is a held state, true while the trigger key is down, and the sim gates the
 * cadence, so holding it auto-fires (docs/DESIGN.md → Pillar 2).
 */
export class Keyboard {
  private leftHeld = false;
  private rightHeld = false;
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
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.leftHeld = true;
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.rightHeld = true;
        e.preventDefault();
        break;
      case ' ':
      case 'ArrowUp':
      case 'w':
      case 'W':
        // Jump latches once per press; ignore the OS auto-repeat while held.
        if (!e.repeat) this.jumpLatched = true;
        e.preventDefault();
        break;
      case 'r':
      case 'R':
        if (!e.repeat) this.restartLatched = true;
        break;
      default:
        break;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'f':
      case 'F':
      case 'Shift':
        this.fireHeld = false;
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.leftHeld = false;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.rightHeld = false;
        break;
      default:
        break;
    }
  };

  /** The intent for the next tick: the held steer axis, one jump, held fire. */
  takeIntent(): Intent {
    const steer = (this.rightHeld ? 1 : 0) - (this.leftHeld ? 1 : 0);
    const jump = this.jumpLatched;
    this.jumpLatched = false;
    return { steer: steer as -1 | 0 | 1, jump, fire: this.fireHeld };
  }

  /** Whether a restart was requested since the last check (app-level, not a sim intent). */
  takeRestart(): boolean {
    const r = this.restartLatched;
    this.restartLatched = false;
    return r;
  }

  /** Drop any held/buffered input (on resume/restart) so the menu never leaks moves. */
  reset(): void {
    this.leftHeld = false;
    this.rightHeld = false;
    this.jumpLatched = false;
    this.fireHeld = false;
    this.restartLatched = false;
  }
}
