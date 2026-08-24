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
  private readonly target: Window;
  private destroyed = false;
  private leftHeld = false;
  private rightHeld = false;
  private jumpLatched = false;
  private fireHeld = false;

  constructor(target: Window = window) {
    this.target = target;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    // Browsers are allowed to drop the matching keyup when focus moves to
    // another window. Clear every held/latching state so returning to the game
    // can never leave steering or fire stuck on.
    this.target.addEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isInteractiveTarget(e.target)) return;
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

  private readonly onBlur = (): void => this.reset();

  /** The intent for the next tick: the held steer axis, one jump, held fire. */
  takeIntent(): Intent {
    const steer = (this.rightHeld ? 1 : 0) - (this.leftHeld ? 1 : 0);
    const jump = this.jumpLatched;
    this.jumpLatched = false;
    return { steer: steer as -1 | 0 | 1, jump, fire: this.fireHeld };
  }

  /** Drop any held/buffered input (on resume/restart) so the menu never leaks moves. */
  reset(): void {
    this.leftHeld = false;
    this.rightHeld = false;
    this.jumpLatched = false;
    this.fireHeld = false;
  }

  /** Release global listeners when the app instance is torn down. Idempotent. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.reset();
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}

/** Let focused form controls keep their native keyboard behavior. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const candidate = target as {
    closest?: (selector: string) => Element | null;
    isContentEditable?: boolean;
  };
  if (candidate.isContentEditable === true) return true;
  return (
    typeof candidate.closest === 'function' &&
    candidate.closest('input, select, textarea, button') !== null
  );
}
