import { hash2, makeRng, nextInt } from '../sim/rng';

/** Flavor-only moments that can invite the surviving radio host to speak. */
export const RADIO_TRIGGERS = [
  'closeCall',
  'highMultiplier',
  'actTransition',
  'stunt',
  'death',
] as const;

export type RadioTrigger = (typeof RADIO_TRIGGERS)[number];

export interface RadioBark {
  readonly text: string;
}

/**
 * Deep, non-instructional pools. The Radio comments on what already happened;
 * it never supplies a route, warning, or rule the visual telegraphs did not.
 */
export const RADIO_POOLS = {
  closeCall: [
    { text: 'That was not evasive driving. That was a disagreement with geometry.' },
    { text: 'Traffic report: the margin was imaginary.' },
    { text: 'The mirror says you missed it. The mirror is shaking.' },
    { text: 'Close enough to exchange insurance details with the apocalypse.' },
    { text: 'Your paint has now met the concept of danger.' },
    { text: 'A cleaner line would have been less memorable.' },
    { text: 'You left exactly one molecule of daylight.' },
    { text: 'Somewhere, a driving instructor just resigned.' },
    { text: 'That obstacle felt the breeze of poor judgment.' },
    { text: 'Near miss confirmed. Dignity status unavailable.' },
  ],
  highMultiplier: [
    { text: 'The numbers are climbing. Please do not teach them ambition.' },
    { text: 'This is now less a commute and more an accounting emergency.' },
    { text: 'The scorekeeper has removed their safety goggles.' },
    { text: 'Momentum, greed, and arithmetic have formed a committee.' },
    { text: 'The multiplier is becoming emotionally significant.' },
    { text: 'Keep that rhythm. The road hates confidence.' },
    { text: 'Your scrap total has started making long-term plans.' },
    { text: 'The dashboard is using numbers normally reserved for weather.' },
    { text: 'Excellent work. The economy is frightened of you.' },
    { text: 'We are running out of responsible ways to count this.' },
  ],
  actTransition: [
    { text: 'New district, same emergency, worse municipal planning.' },
    { text: 'You have crossed into another flavor of bad idea.' },
    { text: 'The horizon has changed management.' },
    { text: 'Welcome to the next chapter. The editor was a meteor.' },
    { text: 'Different skyline, identical lack of adult supervision.' },
    { text: 'The road ahead has submitted revised terms and conditions.' },
    { text: 'Another border crossed without paperwork or common sense.' },
    { text: 'Local conditions remain apocalyptic with scattered nonsense.' },
    { text: 'The scenery changed. The liability did not.' },
    { text: 'New territory confirmed. No welcoming committee survived.' },
  ],
  stunt: [
    { text: 'Airborne traffic is asked to remain technically a car.' },
    { text: 'That ramp was inspected by nobody and trusted by you.' },
    { text: 'For one beautiful second, roads were optional.' },
    { text: 'Flight control reports a vehicle where the vehicle should not be.' },
    { text: 'The suspension has filed a strongly worded complaint.' },
    { text: 'You have briefly escaped the jurisdiction of asphalt.' },
    { text: 'That landing will be remembered by several bolts.' },
    { text: 'Aerodynamics remains surprised but cooperative.' },
    { text: 'The car flew. Science has requested a correction.' },
    { text: 'Please return all four wheels to approximately the same country.' },
  ],
  death: [
    { text: 'And that concludes today’s traffic report.' },
    { text: 'The road has issued its final invoice.' },
    { text: 'Signal lost. Bad decisions remain crystal clear.' },
    { text: 'The last driver is temporarily between cars.' },
    { text: 'That sound was the universe closing a tab.' },
    { text: 'The vehicle has completed its transition into scenery.' },
    { text: 'Emergency services are currently a shopping cart with a siren.' },
    { text: 'The road wins this round and demands no trophy.' },
    { text: 'Your route has ended at the intersection of speed and consequence.' },
    { text: 'We will now observe a brief moment of mechanical silence.' },
    { text: 'The good news is the wreck is no longer depreciating.' },
    { text: 'Broadcast note: gravity remains undefeated.' },
  ],
} as const satisfies Record<RadioTrigger, readonly RadioBark[]>;

interface TriggerDeck {
  remaining: RadioBark[];
  cycle: number;
  last: RadioBark | null;
}

/**
 * One deterministic session deck per trigger. Each pool is consumed without
 * replacement before it reshuffles, and cycle boundaries cannot repeat the
 * bark that just played.
 */
export class RadioDeck {
  private readonly decks: Record<RadioTrigger, TriggerDeck> = {
    closeCall: freshDeck(),
    highMultiplier: freshDeck(),
    actTransition: freshDeck(),
    stunt: freshDeck(),
    death: freshDeck(),
  };

  constructor(private readonly seed: number) {}

  next(trigger: RadioTrigger): RadioBark {
    const deck = this.decks[trigger];
    if (deck.remaining.length === 0) this.refill(trigger, deck);
    const bark = deck.remaining.pop();
    if (!bark) throw new Error(`Radio pool ${trigger} is empty`);
    deck.last = bark;
    return bark;
  }

  private refill(trigger: RadioTrigger, deck: TriggerDeck): void {
    const pool = RADIO_POOLS[trigger];
    const triggerIndex = RADIO_TRIGGERS.indexOf(trigger) + 1;
    const rng = makeRng(hash2(this.seed, hash2(triggerIndex, deck.cycle + 1)));
    const shuffled: RadioBark[] = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = nextInt(rng, 0, i + 1);
      const value = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = value;
    }

    // `pop()` speaks the final element first. Keep the first bark of a new cycle
    // distinct from the previous cycle's final bark.
    const nextIndex = shuffled.length - 1;
    if (deck.last && shuffled[nextIndex] === deck.last && shuffled.length > 1) {
      const swap = shuffled[nextIndex];
      shuffled[nextIndex] = shuffled[nextIndex - 1];
      shuffled[nextIndex - 1] = swap;
    }
    deck.remaining = shuffled;
    deck.cycle += 1;
  }
}

function freshDeck(): TriggerDeck {
  return { remaining: [], cycle: 0, last: null };
}
