import type { InputState } from '../game/types';

const ACTIVE_KEYS = new Set<string>();
let shootPulseFrames = 0;

export function createInput(): InputState {
  return {
    steer: 0,
    jump: false,
    shoot: false
  };
}

export function bindInput(target: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    ACTIVE_KEYS.add(event.code);

    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    ACTIVE_KEYS.delete(event.code);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      ACTIVE_KEYS.add('MouseLeft');
      shootPulseFrames = 3;
      return;
    }

    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (y < rect.height * 0.72) {
      ACTIVE_KEYS.add(x < rect.width / 2 ? 'PointerLeft' : 'PointerRight');
      return;
    }

    ACTIVE_KEYS.add(x < rect.width / 2 ? 'PointerJump' : 'PointerShoot');
  };

  const onPointerUp = () => {
    ACTIVE_KEYS.delete('MouseLeft');
    ACTIVE_KEYS.delete('PointerLeft');
    ACTIVE_KEYS.delete('PointerRight');
    ACTIVE_KEYS.delete('PointerJump');
    ACTIVE_KEYS.delete('PointerShoot');
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);
  target.addEventListener('pointerleave', onPointerUp);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointerup', onPointerUp);
    target.removeEventListener('pointercancel', onPointerUp);
    target.removeEventListener('pointerleave', onPointerUp);
  };
}

export function readInput(): InputState {
  const left = ACTIVE_KEYS.has('KeyA') || ACTIVE_KEYS.has('ArrowLeft') || ACTIVE_KEYS.has('PointerLeft');
  const right =
    ACTIVE_KEYS.has('KeyD') || ACTIVE_KEYS.has('ArrowRight') || ACTIVE_KEYS.has('PointerRight');
  const shootPulse = shootPulseFrames > 0;
  shootPulseFrames = Math.max(0, shootPulseFrames - 1);

  return {
    steer: screenInputToSteer(left, right),
    jump: ACTIVE_KEYS.has('Space') || ACTIVE_KEYS.has('PointerJump'),
    shoot:
      ACTIVE_KEYS.has('KeyF') ||
      ACTIVE_KEYS.has('MouseLeft') ||
      ACTIVE_KEYS.has('PointerShoot') ||
      shootPulse
  };
}

export function screenInputToSteer(left: boolean, right: boolean): number {
  return Number(left) - Number(right);
}
