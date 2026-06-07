import type { ProgressionState, RunState, Upgrades } from '../game/types';
import { formatMeters } from '../game/scoring';
import { getUpgradeCost, canPurchaseUpgrade } from '../game/upgrades';

export type UiCallbacks = {
  onStart: () => void;
  onRestart: () => void;
  onUpgrade: (key: keyof Upgrades) => void;
};

export class Hud {
  private readonly root: HTMLElement;
  private readonly callbacks: UiCallbacks;
  private lastScreen = '';

  constructor(root: HTMLElement, callbacks: UiCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.addEventListener('click', (event) => this.handleClick(event));
  }

  render(run: RunState, progression: ProgressionState): void {
    const screenKey = `${run.status}:${progression.totalScrap}:${JSON.stringify(progression.upgrades)}`;

    if (screenKey !== this.lastScreen) {
      this.root.innerHTML = `
        <div class="hud-top">
          <div>
            <span>Distance</span>
            <strong data-hud="distance">${formatMeters(run.distanceM)}</strong>
          </div>
          <div>
            <span>Armor</span>
            <strong data-hud="health">${Math.ceil(run.health)}</strong>
            <div class="meter armor-meter"><i data-meter="health" style="width: ${getPercent(run.health, run.maxHealth)}%"></i></div>
          </div>
          <div>
            <span>Ammo</span>
            <strong data-hud="ammo">${run.ammo}</strong>
          </div>
          <div>
            <span>Jumps</span>
            <strong data-hud="jumps">${run.jumpCharges}</strong>
          </div>
          <div>
            <span>Scrap</span>
            <strong data-hud="scrap">${run.scrap}</strong>
          </div>
        </div>
        ${this.renderOverlay(run, progression)}
        <div class="touch-help">
          <span>Left / right</span>
          <span>Jump</span>
          <span>Shoot</span>
        </div>
      `;
      this.lastScreen = screenKey;
      return;
    }

    this.updateText('distance', formatMeters(run.distanceM));
    this.updateText('health', String(Math.ceil(run.health)));
    this.updateText('ammo', String(run.ammo));
    this.updateText('jumps', String(run.jumpCharges));
    this.updateText('scrap', String(run.scrap));
    this.updateMeter('health', getPercent(run.health, run.maxHealth));
  }

  invalidate(): void {
    this.lastScreen = '';
  }

  private renderOverlay(run: RunState, progression: ProgressionState): string {
    if (run.status === 'running') {
      return '';
    }

    if (run.status === 'ended') {
      return `
        <section class="overlay panel">
          <h1>Run ended</h1>
          <p>${formatMeters(run.distanceM)} reached. ${run.scrap} scrap recovered.</p>
          <button class="primary" data-action="restart">Repair and return to garage</button>
        </section>
      `;
    }

    return `
      <section class="garage panel">
        <div>
          <h1>Survivor Drive</h1>
          <p>Drive the broken highway, collect scrap, and make the car survive one more run.</p>
        </div>
        <dl class="garage-stats">
          <div><dt>Total scrap</dt><dd>${progression.totalScrap}</dd></div>
          <div><dt>Best distance</dt><dd>${formatMeters(progression.bestDistanceM)}</dd></div>
        </dl>
        <div class="upgrade-grid">
          ${this.renderUpgrade(progression, 'armor', 'Armor', 'More health and softer crashes.')}
          ${this.renderUpgrade(progression, 'chassis', 'Chassis', 'More total health for longer runs.')}
          ${this.renderUpgrade(progression, 'tires', 'Tires', 'Sharper lateral response.')}
          ${this.renderUpgrade(progression, 'weapon', 'Weapon', 'More starting ammo and faster recovery later.')}
        </div>
        <button class="primary" data-action="start">Start run</button>
      </section>
    `;
  }

  private renderUpgrade(
    progression: ProgressionState,
    key: keyof Upgrades,
    label: string,
    description: string
  ): string {
    const level = progression.upgrades[key];
    const cost = getUpgradeCost(progression.upgrades, key);
    const disabled = !canPurchaseUpgrade(progression, key);

    return `
      <article class="upgrade">
        <div>
          <h2>${label}</h2>
          <p>${description}</p>
        </div>
        <button data-action="upgrade" data-upgrade="${key}" ${disabled ? 'disabled' : ''}>
          L${level} · ${cost}
        </button>
      </article>
    `;
  }

  private handleClick(event: Event): void {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>('button[data-action]');

    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === 'start') {
      this.callbacks.onStart();
    }

    if (action === 'restart') {
      this.callbacks.onRestart();
    }

    if (action === 'upgrade') {
      const upgrade = button.dataset.upgrade as keyof Upgrades | undefined;

      if (upgrade) {
        this.callbacks.onUpgrade(upgrade);
      }
    }
  }

  private updateText(key: string, value: string): void {
    const element = this.root.querySelector(`[data-hud="${key}"]`);

    if (element) {
      element.textContent = value;
    }
  }

  private updateMeter(key: string, percent: number): void {
    const element = this.root.querySelector<HTMLElement>(`[data-meter="${key}"]`);

    if (element) {
      element.style.width = `${percent}%`;
    }
  }
}

function getPercent(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / max) * 100));
}
