import type { FrameEvent, ReadonlyState } from '../sim';
import { CAR_TUNING, ECONOMY_TUNING } from '../content/tuning';
import { biomeAt } from '../content/biomes';
import { ACT_NAMES, actAt } from '../content/acts';
import { RadioDeck, type RadioTrigger } from '../content/radio';

/**
 * Arcade kill-streak callouts (the inspiration's "DOUBLE KILL" / "MEGA KILL"). Each
 * tier fires once when the streak first crosses its threshold, so the banners
 * punctuate a run instead of spamming every kill. Warm escalates with the heat of
 * the streak (white → amber → red → hot), matching the combo readout.
 */
const COMBO_TIERS: readonly {
  readonly min: number;
  readonly label: string;
  readonly color: string;
}[] = [
  { min: 2, label: 'DOUBLE KILL', color: '#e8d9c4' },
  { min: 3, label: 'TRIPLE KILL', color: '#f0d28a' },
  { min: 5, label: 'MULTI KILL', color: '#e0a93a' },
  { min: 8, label: 'MEGA KILL', color: '#e87a2a' },
  { min: 12, label: 'ULTRA KILL', color: '#e8503a' },
  { min: 18, label: 'GODLIKE', color: '#ff3a2a' },
  { min: 26, label: 'APOCALYPSE', color: '#ff2a6a' },
];

/** Highest tier index (1-based) the streak qualifies for; 0 means no banner yet. */
function comboTier(combo: number): number {
  let tier = 0;
  for (let i = 0; i < COMBO_TIERS.length; i += 1) if (combo >= COMBO_TIERS[i].min) tier = i + 1;
  return tier;
}

/** Cool electric blue of the lift pickup — jump fuel reads cool, like its token. */
const JUMP_COLOR = '#4fb6ff';
/** Warm amber of the ammo readout — the gun's signature, distinct from cool loot. */
const AMMO_COLOR = '#e0a93a';

export interface ReadyControlHint {
  readonly control: string;
  readonly action: string;
  readonly color: string;
}

/** On coarse pointers, name the visible touch buttons instead of keyboard keys. */
export function readyControlHints(coarsePointer: boolean): readonly ReadyControlHint[] {
  if (coarsePointer) {
    return [
      { control: 'STEER LEFT / RIGHT', action: 'steer', color: AMMO_COLOR },
      { control: 'JUMP', action: 'jump', color: JUMP_COLOR },
      { control: 'FIRE GUN', action: 'fire', color: AMMO_COLOR },
      { control: 'PAUSE', action: 'menu', color: '#cdbb95' },
    ];
  }
  return [
    { control: 'A / D', action: 'steer', color: AMMO_COLOR },
    { control: 'SPACE', action: 'jump', color: JUMP_COLOR },
    { control: 'F', action: 'fire', color: AMMO_COLOR },
    { control: 'ESC', action: 'pause', color: '#cdbb95' },
  ];
}

export type RadioPriority = 0 | 1 | 2 | 3;

const RADIO_MINOR_TICKS = 180;
const RADIO_PRIORITY_TICKS = 216;

export function radioDurationTicks(priority: RadioPriority): number {
  return priority >= 2 ? RADIO_PRIORITY_TICKS : RADIO_MINOR_TICKS;
}

/** Minor flavor waits; act and death lines may preempt lower-priority speech. */
export function radioCanSpeakAt(
  tick: number,
  busyUntilTick: number,
  active: RadioPriority,
  incoming: RadioPriority,
): boolean {
  return tick >= busyUntilTick || active === 0 || incoming > active;
}

/** Green → amber → red as the hull bar drains (mirrors the pickup palette). */
function hullColor(c: number): string {
  if (c <= 0) return '#5a3a36';
  if (c < 0.25) return '#e8503a';
  if (c < 0.5) return '#e0a93a';
  return '#8fbf6a';
}

/**
 * Player-facing readout (the `ui/` layer): distance, speed, the single hull bar,
 * the gun's ammo, jump charges, scrap, and the live kill streak, plus the
 * wrecked panel and flavor-only Radio subtitle. Reads sim state and frame events,
 * and sends nothing back (docs/ARCHITECTURE.md → the prime directive).
 */
export class Hud {
  private readonly stats: HTMLDivElement;
  private readonly numbers: HTMLDivElement;
  private readonly hullFill: HTMLDivElement;
  private readonly ammo: HTMLDivElement;
  private readonly jumpPipRow: HTMLDivElement;
  private readonly jumpPips: HTMLDivElement[] = [];
  private readonly econ: HTMLDivElement;
  private readonly scrap: HTMLDivElement;
  private readonly combo: HTMLDivElement;
  private readonly multiplier: HTMLDivElement;
  private readonly dead: HTMLDivElement;
  private readonly deadDistance: HTMLDivElement;
  private readonly deadStats: HTMLDivElement;
  private readonly comboCallout: HTMLDivElement;
  private calloutAnimation: Animation | null = null;
  /** Tracks the edge into death so transient banners are cleared exactly once. */
  private deadShown = false;
  /** Highest streak tier already announced this streak; reset when the streak drops. */
  private lastComboTier = 0;
  private readonly biomeBanner: HTMLDivElement;
  private readonly actBanner: HTMLDivElement;
  private readonly radioDeck: RadioDeck;
  private readonly radioSubtitle: HTMLDivElement;
  private readonly radioText: HTMLSpanElement;
  private radioAnimation: Animation | null = null;
  private radioPriority: RadioPriority = 0;
  private radioBusyUntilTick = 0;
  /** The run-opening intro card (location title + DRIVE), shown while the app holds the sim. */
  private readonly introCard: HTMLDivElement;
  /** Whether the card is up (or fading out): makes `hideIntroCard` safe per frame. */
  private introCardShown = false;
  /** Last biome announced, so the banner only fires when the run crosses into a new one. */
  private lastBiomeName: string | null = null;
  private lastAct = -1;
  private reducedMotion = false;
  private accum = 0;
  private destroyed = false;

  constructor(seed: number) {
    this.radioDeck = new RadioDeck(seed);
    this.stats = document.createElement('div');
    this.stats.className = 'sdw-hud sdw-hud--stats';
    this.stats.style.cssText = panelCss('left:12px;bottom:12px');

    this.numbers = document.createElement('div');
    this.numbers.style.cssText = 'margin-bottom:6px;font-size:13px';
    this.stats.appendChild(this.numbers);

    // The hull: one bar, the only "health" in the game (docs/DESIGN.md → Pillar 2).
    const hullRow = document.createElement('div');
    hullRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:3px';
    const hullTag = document.createElement('span');
    hullTag.textContent = 'HULL';
    hullTag.style.cssText = 'width:34px;color:#9a9388';
    const hullTrack = document.createElement('div');
    hullTrack.style.cssText =
      'width:118px;height:9px;background:#241f1b;border-radius:3px;overflow:hidden';
    this.hullFill = document.createElement('div');
    this.hullFill.style.cssText = 'height:100%;width:100%;background:#8fbf6a';
    hullTrack.appendChild(this.hullFill);
    hullRow.append(hullTag, hullTrack);
    this.stats.appendChild(hullRow);

    // The gun's ammo — warm, the gun's read; an empty mag dims to "go mow".
    const ammoRow = document.createElement('div');
    ammoRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:5px';
    const ammoTag = document.createElement('span');
    ammoTag.textContent = 'AMMO';
    ammoTag.style.cssText = 'width:34px;color:#9a9388';
    this.ammo = document.createElement('div');
    this.ammo.className = 'sdw-hud__ammo';
    this.ammo.style.cssText = `font-size:13px;font-weight:700;color:${AMMO_COLOR}`;
    ammoRow.append(ammoTag, this.ammo);
    this.stats.appendChild(ammoRow);

    // Jump charges — a row of pips (cool, like the lift token). A jump spends
    // one; lift pickups refill them. Empty pips stay as dim sockets so the cap
    // is always legible (docs/DESIGN.md → Pillar 2: jump is a resource).
    const jumpRow = document.createElement('div');
    jumpRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:7px';
    const jumpTag = document.createElement('span');
    jumpTag.textContent = 'JMP';
    jumpTag.style.cssText = 'width:34px;color:#9a9388';
    this.jumpPipRow = document.createElement('div');
    this.jumpPipRow.style.cssText = 'display:flex;gap:4px';
    // Seed with the base cap; the row grows/shrinks to match the run's loadout
    // (Lift Tank raises the cap) the first time we see state — ensureJumpPips.
    this.ensureJumpPips(CAR_TUNING.jumpMaxCharges);
    jumpRow.append(jumpTag, this.jumpPipRow);
    this.stats.appendChild(jumpRow);
    document.body.appendChild(this.stats);

    // Scrap (cool — the currency) and the live kill streak (warm), top-right.
    this.econ = document.createElement('div');
    this.econ.className = 'sdw-hud sdw-hud--econ';
    this.econ.style.cssText = panelCss('right:12px;top:12px') + ';text-align:right';
    this.scrap = document.createElement('div');
    this.scrap.style.cssText = 'font-size:15px;color:#8fe6cf;letter-spacing:0.5px';
    this.combo = document.createElement('div');
    this.combo.style.cssText = 'margin-top:2px;font-weight:700;visibility:hidden';
    this.multiplier = document.createElement('div');
    this.multiplier.style.cssText = 'margin-top:4px;font-weight:800;color:#f0d28a';
    this.econ.append(this.scrap, this.multiplier, this.combo);
    document.body.appendChild(this.econ);

    this.dead = document.createElement('div');
    this.dead.className = 'sdw-dead';
    this.dead.style.cssText = [
      'position:fixed',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:10px',
      'font:600 14px/1.5 ui-monospace,Menlo,monospace',
      'color:#e8d9c4',
      'background:rgba(10,7,5,0.55)',
      'pointer-events:none',
      'z-index:20',
    ].join(';');
    const title = document.createElement('div');
    title.textContent = 'WRECKED';
    title.style.cssText = 'font-size:40px;letter-spacing:8px;color:#e8503a';
    this.deadDistance = document.createElement('div');
    this.deadDistance.style.cssText = 'font-size:20px;color:#e8d9c4';
    this.deadStats = document.createElement('div');
    this.deadStats.style.cssText = 'opacity:0.85;color:#cdbb95';
    const prompt = document.createElement('div');
    prompt.textContent = 'wreck report incoming';
    prompt.style.cssText = 'margin-top:6px;opacity:0.7';
    this.dead.append(title, this.deadDistance, this.deadStats, prompt);
    document.body.appendChild(this.dead);

    // The arcade kill-streak banner, centred above the car. Parked invisible until a
    // tier fires; the Web Animations pop drives its own fade, so it costs nothing in
    // the steady state and never needs per-frame work.
    this.comboCallout = document.createElement('div');
    this.comboCallout.className = 'sdw-combo-callout';
    this.comboCallout.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:28%',
      'transform:translateX(-50%) scale(0.6)',
      'opacity:0',
      'font:800 34px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:3px',
      'color:#e8d9c4',
      'text-shadow:0 2px 0 rgba(0,0,0,0.6)',
      'pointer-events:none',
      'white-space:nowrap',
      'z-index:15',
    ].join(';');
    document.body.appendChild(this.comboCallout);

    // The biome entry banner — a location title that slides in when the run crosses
    // into a new environment (the inspiration's changing scenery). Parked invisible;
    // the Web Animations slide drives its own fade.
    this.biomeBanner = document.createElement('div');
    this.biomeBanner.className = 'sdw-biome-banner';
    this.biomeBanner.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:14%',
      'transform:translateX(-50%)',
      'opacity:0',
      'font:700 18px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:6px',
      'color:#dfe7f0',
      'text-shadow:0 2px 6px rgba(0,0,0,0.7)',
      'pointer-events:none',
      'white-space:nowrap',
      'z-index:14',
    ].join(';');
    document.body.appendChild(this.biomeBanner);

    this.actBanner = document.createElement('div');
    this.actBanner.className = 'sdw-act-banner';
    this.actBanner.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:9%',
      'transform:translateX(-50%)',
      'opacity:0',
      'font:800 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:5px',
      'color:#f0d28a',
      'text-shadow:0 3px 8px rgba(0,0,0,0.8)',
      'pointer-events:none',
      'white-space:nowrap',
      'z-index:17',
    ].join(';');
    document.body.appendChild(this.actBanner);

    // Flavor-only Radio subtitle. It remains mounted and empty so its polite
    // live region can announce a new transmission without owning any gameplay cue.
    this.radioSubtitle = document.createElement('div');
    this.radioSubtitle.className = 'sdw-radio-subtitle';
    this.radioSubtitle.setAttribute('role', 'status');
    this.radioSubtitle.setAttribute('aria-live', 'polite');
    this.radioSubtitle.setAttribute('aria-atomic', 'true');
    this.radioSubtitle.setAttribute('aria-label', 'Radio transmission');
    this.radioSubtitle.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:calc(env(safe-area-inset-bottom) + 126px)',
      'transform:translateX(-50%)',
      'display:flex',
      'align-items:baseline',
      'justify-content:center',
      'gap:8px',
      'width:max-content',
      'max-width:calc(100vw - 32px)',
      'box-sizing:border-box',
      'padding:8px 12px',
      'opacity:0',
      'font:700 13px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#e8d9c4',
      'text-align:center',
      'text-wrap:balance',
      'background:rgba(8,11,10,0.82)',
      'border:1px solid rgba(143,230,207,0.48)',
      'border-radius:5px',
      'box-shadow:0 4px 18px rgba(0,0,0,0.5)',
      'pointer-events:none',
      'z-index:21',
    ].join(';');
    const radioTag = document.createElement('span');
    radioTag.textContent = 'RADIO //';
    radioTag.style.cssText = 'flex:0 0 auto;color:#8fe6cf;letter-spacing:1px';
    this.radioText = document.createElement('span');
    this.radioText.style.cssText = 'min-width:0';
    this.radioSubtitle.append(radioTag, this.radioText);
    document.body.appendChild(this.radioSubtitle);

    // The run-opening intro card: the current location title with a DRIVE prompt
    // under it, centred while the cinematic camera sweeps in. The app shows it when
    // a run begins and hides it when the sweep hands off to gameplay.
    this.introCard = document.createElement('div');
    this.introCard.className = 'sdw-intro-card';
    this.introCard.style.cssText = [
      'position:fixed',
      'left:50%',
      // High enough to float in the sky above the hood shot: clear of the car
      // and of any roof-mounted gun tiers or upgrade cargo, on any aspect.
      'top:22%',
      'transform:translateX(-50%)',
      'display:none',
      'text-align:center',
      'pointer-events:none',
      'white-space:nowrap',
      'z-index:16',
    ].join(';');
    document.body.appendChild(this.introCard);
  }

  /** Raise the intro card on a fresh run: the location title and a DRIVE prompt. */
  showIntroCard(location: string, actLabel = 'DRIVE'): void {
    const el = this.introCard;
    el.textContent = '';
    const title = document.createElement('div');
    title.textContent = location;
    title.style.cssText = [
      'font:700 30px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:8px',
      'color:#f1ead8',
      'text-shadow:0 3px 10px rgba(0,0,0,0.8)',
    ].join(';');
    const prompt = document.createElement('div');
    prompt.textContent = `${actLabel}  ·  DRIVE`;
    prompt.style.cssText = [
      'margin-top:14px',
      'font:700 15px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:10px',
      'color:#9fb4c8',
      'text-shadow:0 2px 6px rgba(0,0,0,0.7)',
    ].join(';');
    el.append(title, prompt);
    el.style.display = 'block';
    this.introCardShown = true;
    if (!this.reducedMotion) {
      el.animate(
        [
          { opacity: 0, transform: 'translateX(-50%) translateY(10px)' },
          { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
        ],
        { duration: 320, easing: 'ease-out' },
      );
    }
  }

  /**
   * One-time ready gate. The world is frozen until the player deliberately uses
   * a driving control, so reading this card never consumes the opening grace.
   */
  showReadyCard(): void {
    const el = this.introCard;
    el.textContent = '';
    const title = document.createElement('div');
    title.textContent = 'SURVIVOR DRIVE';
    title.style.cssText = [
      'font:800 30px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:7px',
      'color:#f1ead8',
      'text-shadow:0 3px 10px rgba(0,0,0,0.8)',
    ].join(';');
    const controls = document.createElement('div');
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    for (const [index, hint] of readyControlHints(coarsePointer).entries()) {
      if (index > 0) controls.appendChild(document.createElement('br'));
      const control = document.createElement('span');
      control.textContent = hint.control;
      control.style.color = hint.color;
      controls.append(control, ` ${hint.action}`);
    }
    controls.style.cssText = [
      'margin-top:18px',
      'font:700 14px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:2px',
      'color:#d8d2c4',
      'text-shadow:0 2px 6px rgba(0,0,0,0.8)',
    ].join(';');
    const prompt = document.createElement('div');
    prompt.textContent = 'USE A CONTROL TO DRIVE';
    prompt.style.cssText = [
      'margin-top:18px',
      'font:800 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:5px',
      'color:#8fe6cf',
      'text-shadow:0 2px 6px rgba(0,0,0,0.8)',
    ].join(';');
    el.append(title, controls, prompt);
    el.style.display = 'block';
    this.introCardShown = true;
  }

  /** Drop the intro card as the orbit takes over. Safe to call every frame. */
  hideIntroCard(): void {
    const el = this.introCard;
    if (!this.introCardShown) return;
    this.introCardShown = false;
    if (this.reducedMotion) {
      el.style.display = 'none';
      return;
    }
    const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 260,
      easing: 'ease-in',
    });
    anim.onfinish = () => {
      el.style.display = 'none';
    };
  }

  setReducedMotion(reduced: boolean): void {
    if (this.reducedMotion === reduced) return;
    this.reducedMotion = reduced;
    // Accessibility changes must stop movement immediately, but the Radio's
    // deterministic tick cooldown remains intact.
    this.clearTransientCallouts();
    this.clearRadioPresentation();
  }

  /** Reset every run-scoped HUD latch and transient before a fresh intro. */
  resetRun(): void {
    this.clearTransientCallouts();
    this.clearRadio();
    for (const animation of this.introCard.getAnimations()) animation.cancel();
    this.introCard.style.display = 'none';
    this.introCardShown = false;
    this.deadShown = false;
    this.lastAct = -1;
    this.lastBiomeName = null;
    this.lastComboTier = 0;
    this.combo.style.visibility = 'hidden';
    this.combo.textContent = '';
    this.accum = 0;
  }

  /** Remove every HUD node owned by this instance. Idempotent for app teardown. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const element of [
      this.stats,
      this.econ,
      this.dead,
      this.comboCallout,
      this.biomeBanner,
      this.actBanner,
      this.radioSubtitle,
      this.introCard,
    ]) {
      for (const animation of element.getAnimations()) animation.cancel();
      element.remove();
    }
    this.calloutAnimation = null;
    this.radioAnimation = null;
    this.radioPriority = 0;
    this.radioBusyUntilTick = 0;
  }

  /**
   * Per-tick frame events the HUD reacts to (the app forwards them alongside the
   * renderer's). Only the kill streak banner lives here; everything else the HUD
   * shows is read from state each frame.
   */
  handleEvent(event: FrameEvent, tick: number): void {
    if (event.type === 'nearMiss') {
      this.fireCallout('CLOSE CALL', '#8fe6cf');
      this.offerRadio('closeCall', 1, tick);
      return;
    }
    if (event.type === 'multiplierChanged') {
      if (event.multiplier > 1) this.fireCallout(`MULTIPLIER ×${event.multiplier}`, '#f0d28a');
      if (event.multiplier >= 3) this.offerRadio('highMultiplier', 1, tick);
      return;
    }
    if (event.type === 'ramped') {
      this.offerRadio('stunt', 1, tick);
      return;
    }
    if (event.type !== 'zombieMowed') return;
    // A streak's first kill arms the banners again from the bottom tier (the prior
    // streak lapsed or was wiped), independent of the throttled per-frame update.
    if (event.combo <= 1) this.lastComboTier = 0;
    const tier = comboTier(event.combo);
    // Fire only when the streak first reaches a new, higher tier, so each banner is
    // a fresh milestone rather than one per kill.
    if (tier > this.lastComboTier) {
      this.lastComboTier = tier;
      const t = COMBO_TIERS[tier - 1];
      this.fireCallout(t.label, t.color);
    }
  }

  /** Pop the streak banner: a punchy scale-in that drifts up and fades on its own. */
  private fireCallout(label: string, color: string): void {
    const el = this.comboCallout;
    this.calloutAnimation?.cancel();
    this.calloutAnimation = null;
    el.textContent = label;
    el.style.color = color;
    const animation = this.reducedMotion
      ? el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], {
          duration: 800,
          easing: 'ease-out',
        })
      : el.animate(
          [
            { opacity: 0, transform: 'translateX(-50%) scale(0.6)' },
            { opacity: 1, transform: 'translateX(-50%) scale(1.18)', offset: 0.18 },
            { opacity: 1, transform: 'translateX(-50%) scale(1.0)', offset: 0.45 },
            { opacity: 0, transform: 'translateX(-50%) translateY(-30px) scale(1.0)' },
          ],
          { duration: 900, easing: 'ease-out' },
        );
    this.calloutAnimation = animation;
    animation.onfinish = () => {
      if (this.calloutAnimation !== animation) return;
      this.calloutAnimation = null;
      el.textContent = '';
    };
  }

  /** Cancel transient feedback when the wreck screen takes ownership of the UI. */
  private clearTransientCallouts(): void {
    this.calloutAnimation?.cancel();
    this.calloutAnimation = null;
    for (const element of [this.comboCallout, this.biomeBanner, this.actBanner]) {
      for (const animation of element.getAnimations()) animation.cancel();
      element.style.opacity = '0';
    }
    this.comboCallout.textContent = '';
    this.lastComboTier = 0;
  }

  /** Offer one subtitle under the Radio's anti-spam and priority policy. */
  private offerRadio(trigger: RadioTrigger, priority: RadioPriority, tick: number): boolean {
    this.expireRadioChannel(tick);
    if (!radioCanSpeakAt(tick, this.radioBusyUntilTick, this.radioPriority, priority)) return false;
    const bark = this.radioDeck.next(trigger);
    this.clearRadioPresentation();
    this.radioPriority = priority;
    this.radioBusyUntilTick = tick + radioDurationTicks(priority);
    this.radioText.textContent = bark.text;
    this.radioSubtitle.style.zIndex = priority === 3 ? '26' : '21';

    const durationMs = (radioDurationTicks(priority) * 1000) / 60;
    const animation = this.reducedMotion
      ? this.radioSubtitle.animate([{ opacity: 1 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }], {
          duration: durationMs,
          easing: 'linear',
        })
      : this.radioSubtitle.animate(
          [
            { opacity: 0, transform: 'translateX(-50%) translateY(8px)' },
            { opacity: 1, transform: 'translateX(-50%) translateY(0)', offset: 0.12 },
            { opacity: 1, transform: 'translateX(-50%) translateY(0)', offset: 0.82 },
            { opacity: 0, transform: 'translateX(-50%) translateY(-3px)' },
          ],
          { duration: durationMs, easing: 'ease-out' },
        );
    this.radioAnimation = animation;
    animation.onfinish = () => {
      if (this.radioAnimation !== animation) return;
      this.radioAnimation = null;
      this.radioText.textContent = '';
      this.radioSubtitle.style.opacity = '0';
      this.radioSubtitle.style.zIndex = '21';
    };
    return true;
  }

  private clearRadioPresentation(): void {
    const animation = this.radioAnimation;
    this.radioAnimation = null;
    animation?.cancel();
    this.radioText.textContent = '';
    this.radioSubtitle.style.opacity = '0';
    this.radioSubtitle.style.zIndex = '21';
  }

  private clearRadio(): void {
    this.clearRadioPresentation();
    this.radioPriority = 0;
    this.radioBusyUntilTick = 0;
  }

  private expireRadioChannel(tick: number): void {
    if (this.radioPriority === 0 || tick < this.radioBusyUntilTick) return;
    this.radioPriority = 0;
    this.radioBusyUntilTick = 0;
  }

  /** Slide the biome location title in, hold, then fade — a quiet scene-change cue. */
  private fireBiomeBanner(name: string): void {
    const el = this.biomeBanner;
    el.textContent = name;
    if (this.reducedMotion) {
      el.animate(
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 1, offset: 0.75 },
          { opacity: 0 },
        ],
        { duration: 2200, easing: 'ease-out' },
      );
      return;
    }
    el.animate(
      [
        { opacity: 0, transform: 'translateX(-50%) translateY(-12px)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(0)', offset: 0.14 },
        { opacity: 1, transform: 'translateX(-50%) translateY(0)', offset: 0.7 },
        { opacity: 0, transform: 'translateX(-50%) translateY(0)' },
      ],
      { duration: 2200, easing: 'ease-out' },
    );
  }

  private fireActBanner(index: number): void {
    const el = this.actBanner;
    el.textContent = `ACT ${index + 1} · ${ACT_NAMES[index].toUpperCase()}`;
    const keyframes: Keyframe[] = this.reducedMotion
      ? [{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: 'translateX(-50%) scale(0.9)' },
          { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.16 },
          { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.72 },
          { opacity: 0, transform: 'translateX(-50%) translateY(-12px)' },
        ];
    el.animate(keyframes, { duration: 2600, easing: 'ease-out' });
  }

  update(state: ReadonlyState): void {
    this.expireRadioChannel(state.tick);
    const enteredDeath = state.dead && !this.deadShown;
    const leftDeath = !state.dead && this.deadShown;
    this.deadShown = state.dead;
    if (leftDeath) this.clearRadio();
    if (enteredDeath) {
      this.clearTransientCallouts();
      this.offerRadio('death', 3, state.tick);
    }
    this.dead.style.display = state.dead ? 'flex' : 'none';
    this.econ.style.display = state.dead ? 'none' : 'block';
    if (state.dead) {
      // The seed of the death card: distance, what you killed, what you banked.
      this.deadDistance.textContent = `${Math.floor(state.distance)} m`;
      this.deadStats.textContent = `${state.zombiesMowed} zombies killed · ${state.scrap} scrap`;
      // Re-arm the biome banner so the next run announces its environments afresh.
      this.lastBiomeName = null;
      this.lastAct = -1;
      return;
    }

    this.accum += 1;
    if (this.accum < 4) return; // throttle DOM writes to ~15 Hz
    this.accum = 0;

    // Announce the biome the run crosses into (the inspiration's changing scenery).
    // The first observation arms silently, so spawn does not flash a banner.
    const biomeName = biomeAt(state.seed, state.distance).name;
    if (biomeName !== this.lastBiomeName) {
      if (this.lastBiomeName !== null) this.fireBiomeBanner(biomeName);
      this.lastBiomeName = biomeName;
    }
    const act = actAt(state.distance);
    if (this.lastAct === -1) this.lastAct = act;
    else if (act !== this.lastAct) {
      this.lastAct = act;
      this.fireActBanner(act);
      this.offerRadio('actTransition', 2, state.tick);
    }

    const kmh = Math.round(state.car.speed * 3.6);
    this.numbers.innerHTML =
      `<span style="color:#e8d9c4">${Math.floor(state.distance)}</span>` +
      `<span style="color:#9a9388"> m</span>` +
      `<span style="color:#9a9388">   ${kmh} km/h</span>`;

    this.scrap.textContent = `${state.scrap} scrap`;
    const charge = state.multiplierCharge;
    const maxed = state.multiplier >= ECONOMY_TUNING.multiplierMax;
    this.multiplier.textContent = maxed
      ? `MULTI ×${state.multiplier} · MAX`
      : `MULTI ×${state.multiplier} · ${charge}/${ECONOMY_TUNING.multiplierPointsPerLevel}`;
    this.applyCombo(state.combo);
    this.applyHull(state.car.health);
    this.applyAmmo(state.car.ammo, state.loadout.weaponLevel);
    // Match the socket count to this run's real cap — Lift Tank upgrades raise it
    // above the base (sim/collision.ts → jumpCap), and the row must show every
    // charge the player paid for.
    this.ensureJumpPips(CAR_TUNING.jumpMaxCharges + state.loadout.bonusJumpCharges);
    this.applyJumpCharges(state.car.jumpCharges);
  }

  /** The single hull bar — width and color track the one health value. */
  private applyHull(health: number): void {
    this.hullFill.style.width = `${Math.max(0, health) * 100}%`;
    this.hullFill.style.background = hullColor(health);
  }

  /**
   * Gun tier + ammo count. Warns warm-red as the mag runs low, then dims to a
   * "mow instead" cue when it's empty — so you feel the gun running out before it
   * clicks dry (docs/DESIGN.md → Juice: empty reads, not silence).
   */
  private applyAmmo(ammo: number, level: number): void {
    const tag = `Mk${level}`;
    if (ammo <= 0) {
      this.ammo.textContent = `${tag} · EMPTY · mow`;
      this.ammo.style.color = '#9a6a3a';
    } else {
      this.ammo.textContent = `${tag} · ${ammo}`;
      this.ammo.style.color = ammo <= 8 ? '#e8503a' : AMMO_COLOR;
    }
  }

  /** Grow or shrink the pip row to `cap` sockets (no-op once it matches). */
  private ensureJumpPips(cap: number): void {
    while (this.jumpPips.length < cap) {
      const pip = document.createElement('div');
      pip.className = 'sdw-hud__jump-pip';
      pip.style.cssText = 'width:12px;height:12px;border-radius:2px;background:#241f1b';
      this.jumpPipRow.appendChild(pip);
      this.jumpPips.push(pip);
    }
    while (this.jumpPips.length > cap) {
      const pip = this.jumpPips.pop();
      pip?.remove();
    }
  }

  /** Light a pip per charge in hand; the rest sit as dim empty sockets. */
  private applyJumpCharges(charges: number): void {
    for (let i = 0; i < this.jumpPips.length; i += 1) {
      this.jumpPips[i].style.background = i < charges ? JUMP_COLOR : '#241f1b';
    }
  }

  /** The kill streak: hidden below 2, then climbing in size and heat with the run. */
  private applyCombo(combo: number): void {
    // The streak dropped (lapsed or wiped by a crash): arm the banners to fire again
    // from the bottom tier the next time a streak builds.
    if (combo < 2) {
      this.lastComboTier = 0;
      this.combo.style.visibility = 'hidden';
      return;
    }
    this.combo.style.visibility = 'visible';
    this.combo.textContent = `×${combo}`;
    this.combo.style.fontSize = `${Math.min(15 + combo, 30)}px`;
    this.combo.style.color = combo >= 8 ? '#e8503a' : combo >= 4 ? '#e0a93a' : '#e8d9c4';
  }
}

function panelCss(position: string): string {
  return [
    'position:fixed',
    position,
    'padding:9px 11px',
    'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
    'color:#d8d2c4',
    'background:rgba(12,10,8,0.72)',
    'border:1px solid rgba(184,84,47,0.5)',
    'border-radius:6px',
    'pointer-events:none',
    'z-index:10',
  ].join(';');
}
