import { describe, expect, it } from 'vitest';
import { readyControlHints } from '../src/ui/hud';

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
