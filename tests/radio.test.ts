import { describe, expect, it } from 'vitest';
import { RADIO_POOLS, RADIO_TRIGGERS, RadioDeck, type RadioTrigger } from '../src/content/radio';

function draw(seed: number, trigger: RadioTrigger, count: number): string[] {
  const deck = new RadioDeck(seed);
  return Array.from({ length: count }, () => deck.next(trigger).text);
}

describe('Radio bark decks', () => {
  it('keeps every reactive pool deep and internally unique', () => {
    for (const trigger of RADIO_TRIGGERS) {
      const lines = RADIO_POOLS[trigger].map((bark) => bark.text);
      expect(lines.length, trigger).toBeGreaterThanOrEqual(10);
      expect(new Set(lines).size, trigger).toBe(lines.length);
    }
  });

  it('is deterministic for the same seed and trigger sequence', () => {
    const a = new RadioDeck(0xdecafbad);
    const b = new RadioDeck(0xdecafbad);
    const sequence: RadioTrigger[] = [
      'closeCall',
      'stunt',
      'closeCall',
      'highMultiplier',
      'actTransition',
      'death',
    ];

    expect(sequence.map((trigger) => a.next(trigger).text)).toEqual(
      sequence.map((trigger) => b.next(trigger).text),
    );
  });

  it('draws a whole trigger pool without replacement', () => {
    for (const trigger of RADIO_TRIGGERS) {
      const lines = draw(71, trigger, RADIO_POOLS[trigger].length);
      expect(new Set(lines).size, trigger).toBe(lines.length);
    }
  });

  it('does not repeat at the boundary between shuffled cycles', () => {
    for (const trigger of RADIO_TRIGGERS) {
      const size = RADIO_POOLS[trigger].length;
      const lines = draw(92, trigger, size + 1);
      expect(lines[size], trigger).not.toBe(lines[size - 1]);
    }
  });

  it('keeps each trigger on an independent session deck', () => {
    const direct = new RadioDeck(1234);
    const interleaved = new RadioDeck(1234);

    const expected = [direct.next('closeCall').text, direct.next('closeCall').text];
    const actual = [interleaved.next('closeCall').text];
    interleaved.next('death');
    interleaved.next('stunt');
    actual.push(interleaved.next('closeCall').text);

    expect(actual).toEqual(expected);
  });

  it('changes the order for a different session seed', () => {
    expect(draw(1, 'death', 6)).not.toEqual(draw(2, 'death', 6));
  });
});
