import type { Intent } from '../sim';
import { Keyboard } from './keyboard';
import { TouchControls, type TouchControlsCallbacks } from './touch';

/**
 * Fan-in for all player input devices. Each source owns its own edge detection;
 * the app consumes one normalized Intent per tick.
 */
export class PlayerInput {
  private readonly keyboard: Keyboard;
  private readonly touch: TouchControls;

  constructor(cb: TouchControlsCallbacks) {
    this.keyboard = new Keyboard();
    this.touch = new TouchControls(cb);
  }

  setTouchVisible(visible: boolean): void {
    this.touch.setVisible(visible);
  }

  takeIntent(): Intent {
    const keyboard = this.keyboard.takeIntent();
    const touch = this.touch.takeIntent();
    return {
      steer: keyboard.steer !== 0 ? keyboard.steer : touch.steer,
      jump: keyboard.jump || touch.jump,
      fire: keyboard.fire || touch.fire,
    };
  }

  takeRestart(): boolean {
    return this.keyboard.takeRestart() || this.touch.takeRestart();
  }

  reset(): void {
    this.keyboard.reset();
    this.touch.reset();
  }
}
