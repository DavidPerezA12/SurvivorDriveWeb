import type { ReadonlyState } from '../sim';
import { CAR_TUNING } from '../content/tuning';

/** Cool electric blue of the lift pickup — jump fuel reads cool, like its token. */
const JUMP_COLOR = '#4fb6ff';
/** Warm amber of the ammo readout — the gun's signature, distinct from cool loot. */
const AMMO_COLOR = '#e0a93a';

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
 * wrecked panel. Reads sim state, sends nothing back — the one exception is
 * surfacing the restart prompt, which the input layer turns into an actual reset
 * (docs/ARCHITECTURE.md → the prime directive).
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
  private readonly dead: HTMLDivElement;
  private readonly deadDistance: HTMLDivElement;
  private readonly deadStats: HTMLDivElement;
  private accum = 0;

  constructor() {
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
    this.econ.append(this.scrap, this.combo);
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
    prompt.textContent = 'press R to drive again';
    prompt.style.cssText = 'margin-top:6px;opacity:0.7';
    this.dead.append(title, this.deadDistance, this.deadStats, prompt);
    document.body.appendChild(this.dead);
  }

  update(state: ReadonlyState): void {
    this.dead.style.display = state.dead ? 'flex' : 'none';
    this.econ.style.display = state.dead ? 'none' : 'block';
    if (state.dead) {
      // The seed of the death card: distance, what you killed, what you banked.
      this.deadDistance.textContent = `${Math.floor(state.distance)} m`;
      this.deadStats.textContent = `${state.zombiesMowed} zombies killed · ${state.scrap} scrap`;
      return;
    }

    this.accum += 1;
    if (this.accum < 4) return; // throttle DOM writes to ~15 Hz
    this.accum = 0;

    const kmh = Math.round(state.car.speed * 3.6);
    this.numbers.innerHTML =
      `<span style="color:#e8d9c4">${Math.floor(state.distance)}</span>` +
      `<span style="color:#9a9388"> m</span>` +
      `<span style="color:#9a9388">   ${kmh} km/h</span>`;

    this.scrap.textContent = `${state.scrap} scrap`;
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

  /** Grow or shrink the pip row to `cap` sockets (cheap no-op once it matches). */
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
    if (combo < 2) {
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
