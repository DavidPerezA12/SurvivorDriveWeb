import { describe, expect, it } from 'vitest';
import { radioCanSpeakAt, radioDurationTicks, readyControlHints } from '../src/ui/hud';

describe('ready-card control hints', () => {
  it('names the on-screen controls for coarse pointers', () => {
    const hints = readyControlHints(true);

    expect(hints.map((hint) => hint.control)).toEqual([
      'STEER LEFT / RIGHT',
      'JUMP',
      'FIRE GUN',
      'PAUSE',
    ]);
    expect(hints.flatMap((hint) => [hint.control, hint.action]).join(' ')).not.toMatch(
      /A \/ D|SPACE|ESC/,
    );
  });

  it('keeps keyboard hints for fine pointers', () => {
    expect(readyControlHints(false).map((hint) => hint.control)).toEqual([
      'A / D',
      'SPACE',
      'F',
      'ESC',
    ]);
  });
});

describe('Radio subtitle priority', () => {
  it('drops equal or lower-priority chatter while a line is active', () => {
    expect(radioCanSpeakAt(99, 100, 1, 1)).toBe(false);
    expect(radioCanSpeakAt(99, 100, 2, 1)).toBe(false);
    expect(radioCanSpeakAt(99, 100, 3, 2)).toBe(false);
  });

  it('lets act and death lines preempt lower-priority chatter', () => {
    expect(radioCanSpeakAt(99, 100, 0, 1)).toBe(true);
    expect(radioCanSpeakAt(99, 100, 1, 2)).toBe(true);
    expect(radioCanSpeakAt(99, 100, 1, 3)).toBe(true);
    expect(radioCanSpeakAt(99, 100, 2, 3)).toBe(true);
  });

  it('expires from simulation ticks rather than animation completion', () => {
    expect(radioCanSpeakAt(100, 100, 3, 1)).toBe(true);
    expect(radioDurationTicks(1)).toBe(180);
    expect(radioDurationTicks(2)).toBe(216);
    expect(radioDurationTicks(3)).toBe(216);
  });
});
