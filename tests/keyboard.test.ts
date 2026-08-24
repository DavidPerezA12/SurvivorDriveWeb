import { describe, expect, it } from 'vitest';
import { Keyboard } from '../src/input/keyboard';

type Listener = (event: Event) => void;

class FakeWindow {
  private readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  key(type: 'keydown' | 'keyup', key: string, target: EventTarget | null = null): boolean {
    let prevented = false;
    const event = {
      key,
      repeat: false,
      target,
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return prevented;
  }

  blur(): void {
    const event = {} as Event;
    for (const listener of this.listeners.get('blur') ?? []) listener(event);
  }
}

function keyboardWithTarget(): { keyboard: Keyboard; target: FakeWindow } {
  const target = new FakeWindow();
  return { keyboard: new Keyboard(target as unknown as Window), target };
}

describe('keyboard input', () => {
  it('clears held keys and latches when the window loses focus', () => {
    const { keyboard, target } = keyboardWithTarget();
    target.key('keydown', 'd');
    target.key('keydown', 'w');
    target.key('keydown', 'f');

    target.blur();

    expect(keyboard.takeIntent()).toEqual({ steer: 0, jump: false, fire: false });
  });

  it('leaves native keys alone when an interactive control owns the event', () => {
    const { keyboard, target } = keyboardWithTarget();
    const control = {
      closest: () => control,
      isContentEditable: false,
    } as unknown as EventTarget;

    expect(target.key('keydown', 'ArrowRight', control)).toBe(false);
    expect(target.key('keydown', ' ', control)).toBe(false);
    expect(target.key('keydown', 'f', control)).toBe(false);
    expect(target.key('keydown', 'f', { isContentEditable: true } as unknown as EventTarget)).toBe(
      false,
    );
    expect(keyboard.takeIntent()).toEqual({ steer: 0, jump: false, fire: false });
  });

  it('still releases a held gameplay key if focus moved before keyup', () => {
    const { keyboard, target } = keyboardWithTarget();
    const control = { closest: () => control } as unknown as EventTarget;
    target.key('keydown', 'd');
    target.key('keyup', 'd', control);
    expect(keyboard.takeIntent().steer).toBe(0);
  });

  it('still handles and prevents gameplay keys outside interactive controls', () => {
    const { keyboard, target } = keyboardWithTarget();

    expect(target.key('keydown', 'ArrowLeft')).toBe(true);
    expect(target.key('keydown', 'f')).toBe(true);
    expect(keyboard.takeIntent()).toEqual({ steer: -1, jump: false, fire: true });

    target.key('keyup', 'ArrowLeft');
    target.key('keyup', 'f');
    expect(keyboard.takeIntent()).toEqual({ steer: 0, jump: false, fire: false });
  });

  it('destroy clears state and unregisters every global listener idempotently', () => {
    const { keyboard, target } = keyboardWithTarget();
    target.key('keydown', 'd');
    target.key('keydown', 'f');

    keyboard.destroy();
    keyboard.destroy();

    expect(keyboard.takeIntent()).toEqual({ steer: 0, jump: false, fire: false });
    expect(target.key('keydown', 'ArrowLeft')).toBe(false);
    expect(target.key('keydown', 'f')).toBe(false);
    target.blur();
    expect(keyboard.takeIntent()).toEqual({ steer: 0, jump: false, fire: false });
  });
});
