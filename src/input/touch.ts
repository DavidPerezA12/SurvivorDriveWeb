import type { Intent } from '../sim';

export interface TouchControlsCallbacks {
  onPause(): void;
}

type TouchAction = 'left' | 'right' | 'jump' | 'fire' | 'pause';

/**
 * Touch controls are an input adapter only: they feed the same edge-triggered
 * steering / jump latches and held fire state as the keyboard. Gameplay stays
 * entirely in the pure sim.
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly queue: number[] = [];
  private readonly firePointers = new Set<number>();
  private jumpLatched = false;
  private restartLatched = false;

  constructor(private readonly cb: TouchControlsCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'sdw-touch-controls';
    this.root.dataset.active = 'false';
    this.root.setAttribute('aria-hidden', 'true');

    const pause = this.button('pause', 'II', 'Pause');
    const dpad = document.createElement('div');
    dpad.className = 'sdw-touch-dpad';
    dpad.append(this.button('left', '<', 'Change lane left'), this.button('right', '>', 'Change lane right'));

    const actions = document.createElement('div');
    actions.className = 'sdw-touch-actions';
    actions.append(this.button('jump', '^', 'Jump'), this.button('fire', 'F', 'Fire gun'));

    this.root.append(pause, dpad, actions);
    document.body.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.dataset.active = visible ? 'true' : 'false';
    this.root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible) this.reset();
  }

  takeIntent(): Intent {
    const steer = this.queue.shift();
    const jump = this.jumpLatched;
    this.jumpLatched = false;
    return { steer: steer === -1 || steer === 1 ? steer : 0, jump, fire: this.firePointers.size > 0 };
  }

  takeRestart(): boolean {
    const restart = this.restartLatched;
    this.restartLatched = false;
    return restart;
  }

  reset(): void {
    this.queue.length = 0;
    this.firePointers.clear();
    this.jumpLatched = false;
    this.restartLatched = false;
    for (const button of this.buttons) button.classList.remove('is-held');
  }

  private button(action: TouchAction, glyph: string, label: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sdw-touch-button sdw-touch-${action}`;
    b.textContent = glyph;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('pointerdown', (e) => this.press(e, action, b));
    b.addEventListener('pointerup', (e) => this.release(e, action, b));
    b.addEventListener('pointercancel', (e) => this.release(e, action, b));
    b.addEventListener('lostpointercapture', (e) => this.release(e, action, b));
    this.buttons.push(b);
    return b;
  }

  private press(e: PointerEvent, action: TouchAction, button: HTMLButtonElement): void {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    button.classList.add('is-held');

    switch (action) {
      case 'left':
        this.queue.push(-1);
        break;
      case 'right':
        this.queue.push(1);
        break;
      case 'jump':
        this.jumpLatched = true;
        break;
      case 'fire':
        this.firePointers.add(e.pointerId);
        break;
      case 'pause':
        this.cb.onPause();
        break;
    }
  }

  private release(e: PointerEvent, action: TouchAction, button: HTMLButtonElement): void {
    if (button.hasPointerCapture(e.pointerId)) button.releasePointerCapture(e.pointerId);
    if (action === 'fire') this.firePointers.delete(e.pointerId);
    button.classList.remove('is-held');
  }
}
