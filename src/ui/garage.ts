import {
  UPGRADE_FAMILIES,
  familyLevel,
  familyNextTier,
  upgradeDef,
  type UpgradeCategory,
  type UpgradeFamily,
  type UpgradeId,
} from '../content/upgrades';
import { CHASSIS, chassisDef, type ChassisId } from '../content/chassis';

/**
 * The garage — the between-runs screen where banked scrap buys permanent
 * upgrades, styled after the inspiration's full-screen garage (docs/DESIGN.md →
 * Upgrades render on the car model). It is a `ui/` DOM overlay built once and
 * toggled by `display`: the hero car turns on its 3D turntable dead centre, a CAR
 * INFO panel reads the build's stats, category tabs (UPGRADES · GUN · CAR ·
 * COLOR) switch the rack, and a row of levelled upgrade cards lines the
 * bottom. It reads no sim state and writes none — purchases and "drive" flow back
 * through callbacks.
 *
 * It doubles as the wreck screen: on death it leads with the run you just lost.
 */
export interface GarageCallbacks {
  onBuy(id: UpgradeId): void;
  /** Pick the chassis to drive (the CAR tab). */
  onSelectChassis(id: ChassisId): void;
  /** The primary button: drive the next run (wreck) or return to the run (pause). */
  onClose(): void;
}

/** The read-only snapshot the app hands the garage each time it opens or changes. */
export interface GarageView {
  mode: 'wreck' | 'pause';
  distance: number;
  zombiesMowed: number;
  runScrap: number;
  /** The death card's absurd run-title headline (wreck mode only). */
  runTitle: string;
  wallet: number;
  owned: ReadonlySet<UpgradeId>;
  chassis: ChassisId;
}

// The apocalypse-garage skin: grimy steel, warm orange headers, green LCD numbers.
const ORANGE = '#e89a3a';
const LCD = '#7dd86a';
const STEEL_EDGE = '#5a5046';
const DIM = '#8a7e6c';

/** A garage tab. `soon` tabs are placeholders for features still to land. */
interface Tab {
  readonly key: UpgradeCategory | 'car' | 'color';
  readonly label: string;
  readonly soon?: boolean;
  button: HTMLButtonElement;
}

/** One family card's built DOM plus the mutable buy target `sync` rewrites. */
interface Card {
  readonly family: UpgradeFamily;
  readonly root: HTMLDivElement;
  readonly badge: HTMLDivElement;
  readonly cost: HTMLDivElement;
  target: UpgradeId | null;
}

/** A CAR INFO stat bar tied to a family's level. */
interface StatBar {
  readonly fill: HTMLDivElement;
  readonly familyKey: string;
}

const STAT_DEFS: { label: string; key: string }[] = [
  { label: 'ARMOR', key: 'armor' },
  { label: 'HANDLING', key: 'tires' },
  { label: 'JUMP', key: 'jump' },
  { label: 'GUN', key: 'gun' },
  { label: 'REACH', key: 'magnet' },
];

const TAB_DEFS: { key: Tab['key']; label: string; soon?: boolean }[] = [
  { key: 'upgrade', label: 'UPGRADES' },
  { key: 'weapon', label: 'GUN' },
  { key: 'car', label: 'CAR' },
  { key: 'color', label: 'COLOR', soon: true },
];

export class Garage {
  private readonly root: HTMLDivElement;
  private readonly cb: GarageCallbacks;
  /** Container the app mounts the 3D car-preview canvas into (the centre stage). */
  readonly previewSlot: HTMLDivElement;

  private readonly title: HTMLDivElement;
  private readonly runTitleEl: HTMLDivElement;
  private readonly walletEl: HTMLDivElement;
  private readonly driveBtn: HTMLButtonElement;
  /** Right STATUS panel: the selected car's identity + the run result. */
  private readonly carNameEl: HTMLDivElement;
  private readonly carBlurbEl: HTMLDivElement;
  private readonly resultBox: HTMLDivElement;
  private readonly resultVals: Record<'dist' | 'kills' | 'scrap', HTMLDivElement>;
  private readonly bars: StatBar[] = [];
  private readonly cards: Card[] = [];
  private readonly tabs: Tab[] = [];
  private readonly placeholder: HTMLDivElement;
  private view: GarageView = {
    mode: 'wreck',
    distance: 0,
    zombiesMowed: 0,
    runScrap: 0,
    runTitle: '',
    wallet: 0,
    owned: new Set(),
    chassis: 'survivor',
  };
  private readonly chassisCards: { id: ChassisId; root: HTMLDivElement; badge: HTMLDivElement }[] = [];

  constructor(cb: GarageCallbacks) {
    this.cb = cb;

    this.root = document.createElement('div');
    this.root.className = 'sdw-garage';
    this.root.style.cssText = [
      'position:fixed',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'padding:16px 22px 18px',
      'gap:10px',
      'font:600 13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#e8d9c4',
      'background:radial-gradient(120% 90% at 50% 34%, #322c26 0%, #1a1714 55%, #0b0908 100%)',
      'z-index:25',
    ].join(';');

    // Top bar: scrap (left), mode title (centre), DRIVE (right).
    const top = document.createElement('div');
    top.className = 'sdw-garage__top';
    top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px';
    const walletPlate = plate('min-width:150px');
    walletPlate.classList.add('sdw-garage__wallet');
    walletPlate.append(label('SCRAP'));
    this.walletEl = lcd('0');
    walletPlate.append(this.walletEl);
    this.title = document.createElement('div');
    this.title.className = 'sdw-garage__title';
    this.title.style.cssText = `flex:1;text-align:center;font-size:26px;letter-spacing:8px;font-weight:800;color:${ORANGE}`;
    this.driveBtn = metalButton('DRIVE', true);
    this.driveBtn.classList.add('sdw-garage__drive');
    this.driveBtn.addEventListener('click', () => this.cb.onClose());
    top.append(walletPlate, this.title, this.driveBtn);

    // Middle: CAR INFO (left), car turntable (centre), RUN status (right).
    const middle = document.createElement('div');
    middle.className = 'sdw-garage__middle';
    middle.style.cssText = 'flex:1;display:flex;align-items:stretch;gap:16px;min-height:0';

    const info = plate('width:212px;gap:9px');
    info.classList.add('sdw-garage__info');
    info.append(label('CAR INFO'));
    this.carNameEl = document.createElement('div');
    this.carNameEl.style.cssText = `font-size:17px;font-weight:800;letter-spacing:1px;color:${ORANGE}`;
    this.carBlurbEl = document.createElement('div');
    this.carBlurbEl.style.cssText = 'font-size:11px;font-weight:400;font-style:italic;color:#a99e8a;line-height:1.35';
    info.append(this.carNameEl, this.carBlurbEl, divider());
    for (const s of STAT_DEFS) info.append(this.buildStatRow(s));

    this.previewSlot = document.createElement('div');
    this.previewSlot.className = 'sdw-garage__preview';
    this.previewSlot.style.cssText = 'flex:1;min-width:0;position:relative';

    const status = plate('width:212px;gap:8px');
    status.classList.add('sdw-garage__status');
    status.append(label('RUN'));
    this.runTitleEl = document.createElement('div');
    this.runTitleEl.style.cssText =
      'font-size:14px;font-style:italic;font-weight:700;color:#e8d9c4;line-height:1.4';
    status.append(this.runTitleEl);
    this.resultBox = document.createElement('div');
    this.resultBox.style.cssText = 'display:flex;flex-direction:column;gap:7px;width:100%;margin-top:2px';
    const dist = resultRow('DISTANCE');
    const kills = resultRow('ZOMBIES');
    const scrap = resultRow('SCRAP');
    this.resultVals = { dist: dist.value, kills: kills.value, scrap: scrap.value };
    this.resultBox.append(divider(), dist.row, kills.row, scrap.row);
    status.append(this.resultBox);
    middle.append(info, this.previewSlot, status);

    // Bottom: tabs and card rack, grouped as one control surface.
    const bottom = document.createElement('div');
    bottom.className = 'sdw-garage__bottom';
    bottom.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:0',
    ].join(';');
    const tabBar = document.createElement('div');
    tabBar.className = 'sdw-garage__tabs';
    tabBar.style.cssText = 'display:flex;gap:4px;align-self:center';
    for (const def of TAB_DEFS) {
      const button = tabButton(def.label, def.soon);
      const tab: Tab = { ...def, button };
      button.addEventListener('click', () => {
        if (!def.soon) this.setTab(def.key);
      });
      this.tabs.push(tab);
      tabBar.append(button);
    }
    const rack = document.createElement('div');
    rack.className = 'sdw-garage__rack';
    rack.style.cssText = [
      'min-height:120px',
      'display:flex',
      'gap:10px',
      'justify-content:center',
      'align-items:center',
      'padding:12px 18px',
      'background:linear-gradient(180deg,#2c2722,#1b1713)',
      `border:1px solid ${STEEL_EDGE}`,
      'border-radius:10px',
      'box-shadow:inset 0 1px 0 #ffffff10, 0 4px 16px #0009',
    ].join(';');
    for (const fam of UPGRADE_FAMILIES) rack.append(this.buildFamilyCard(fam));
    for (const ch of CHASSIS) rack.append(this.buildChassisCard(ch));
    this.placeholder = document.createElement('div');
    this.placeholder.style.cssText = `display:none;color:${DIM};font-size:14px;letter-spacing:2px`;
    this.placeholder.textContent = 'COMING SOON';
    rack.append(this.placeholder);
    bottom.append(tabBar, rack);

    this.root.append(top, middle, bottom);
    document.body.appendChild(this.root);
    this.setTab('upgrade');
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  show(view: GarageView): void {
    this.view = view;
    this.sync();
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  /** Switch the active category tab — filters which family cards show. */
  private setTab(key: Tab['key']): void {
    for (const tab of this.tabs) tab.button.style.cssText = tabCss(tab.key === key, tab.soon);
    const soon = this.tabs.find((t) => t.key === key)?.soon ?? false;
    for (const card of this.cards) card.root.style.display = card.family.category === key ? 'flex' : 'none';
    for (const cc of this.chassisCards) cc.root.style.display = key === 'car' ? 'flex' : 'none';
    this.placeholder.style.display = soon ? 'block' : 'none';
  }

  // Builders

  private buildStatRow(def: { label: string; key: string }): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'width:100%';
    const tag = document.createElement('div');
    tag.textContent = def.label;
    tag.style.cssText = 'font-size:10px;letter-spacing:1px;color:#b6a98f;margin-bottom:3px';
    const track = document.createElement('div');
    track.style.cssText =
      'width:100%;height:11px;background:#100d0b;border:1px solid #000;border-radius:3px;overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText = `height:100%;width:0%;background:linear-gradient(90deg,#6aa83a,${LCD});transition:width .2s`;
    track.append(fill);
    row.append(tag, track);
    this.bars.push({ fill, familyKey: def.key });
    return row;
  }

  private buildFamilyCard(fam: UpgradeFamily): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'sdw-garage-card';
    root.style.cssText = cardCss(false);
    const badge = document.createElement('div');
    badge.style.cssText = `align-self:flex-end;font-size:11px;font-weight:800;color:${LCD}`;
    const icon = document.createElement('div');
    icon.textContent = fam.glyph;
    icon.style.cssText = `font-size:26px;line-height:1;color:${ORANGE};margin:2px 0`;
    const nm = document.createElement('div');
    nm.textContent = fam.label;
    nm.style.cssText = 'font-size:11px;letter-spacing:1px;color:#cdbb95';
    const cost = document.createElement('div');
    cost.style.cssText = `font-size:12px;font-weight:800;color:${LCD}`;
    root.append(badge, icon, nm, cost);

    const card: Card = { family: fam, root, badge, cost, target: null };
    root.addEventListener('click', () => {
      if (card.target) this.cb.onBuy(card.target);
    });
    this.cards.push(card);
    return root;
  }

  private buildChassisCard(ch: { id: ChassisId; name: string }): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'sdw-garage-chassis-card';
    root.style.cssText = chassisCss(false);
    root.style.display = 'none'; // shown only on the CAR tab
    const badge = document.createElement('div');
    badge.style.cssText = `font-size:10px;font-weight:800;letter-spacing:1px;color:${LCD}`;
    const nm = document.createElement('div');
    nm.textContent = ch.name;
    nm.style.cssText = 'font-size:12px;color:#e8d9c4;text-align:center';
    root.append(badge, nm);
    root.addEventListener('click', () => this.cb.onSelectChassis(ch.id));
    this.chassisCards.push({ id: ch.id, root, badge });
    return root;
  }

  // Sync

  private sync(): void {
    const v = this.view;
    const wreck = v.mode === 'wreck';
    this.title.textContent = wreck ? 'WRECKED' : 'GARAGE';
    this.title.style.color = wreck ? '#e8503a' : ORANGE;
    this.driveBtn.textContent = wreck ? 'PLAY AGAIN' : 'RESUME';
    this.walletEl.textContent = `${v.wallet}`;

    // Left panel: the selected car's identity.
    const car = chassisDef(v.chassis);
    this.carNameEl.textContent = car.name;
    this.carBlurbEl.textContent = car.blurb;

    // Right panel: the death card on a wreck, a hint while paused.
    this.runTitleEl.textContent = wreck ? `“${v.runTitle}”` : 'Spend scrap below, then DRIVE.';
    this.runTitleEl.style.fontStyle = wreck ? 'italic' : 'normal';
    this.runTitleEl.style.color = wreck ? '#e8d9c4' : DIM;
    this.resultBox.style.display = wreck ? 'flex' : 'none';
    if (wreck) {
      this.resultVals.dist.textContent = `${Math.floor(v.distance)} M`;
      this.resultVals.kills.textContent = `${v.zombiesMowed}`;
      this.resultVals.scrap.textContent = `+${v.runScrap}`;
    }

    for (const bar of this.bars) {
      const fam = UPGRADE_FAMILIES.find((f) => f.key === bar.familyKey);
      const frac = fam ? familyLevel(fam, v.owned) / fam.tiers.length : 0;
      bar.fill.style.width = `${Math.round((0.08 + 0.92 * frac) * 100)}%`;
    }

    for (const card of this.cards) this.syncCard(card, v);

    for (const cc of this.chassisCards) {
      const sel = cc.id === v.chassis;
      cardHighlight(cc.root, sel);
      cc.badge.textContent = sel ? 'SELECTED' : 'SELECT';
      cc.badge.style.color = sel ? '#8fbf6a' : LCD;
    }
  }

  private syncCard(card: Card, v: GarageView): void {
    const level = familyLevel(card.family, v.owned);
    const total = card.family.tiers.length;
    card.badge.textContent = `${level}/${total}`;
    const next = familyNextTier(card.family, v.owned);
    if (!next) {
      card.target = null;
      card.cost.textContent = 'MAX';
      card.badge.style.color = '#8fbf6a';
      card.cost.style.color = '#8fbf6a';
      cardHighlight(card.root, false);
      return;
    }
    const cost = upgradeDef(next).cost;
    const afford = v.wallet >= cost;
    card.target = afford ? next : null;
    card.cost.textContent = `${cost}`;
    card.badge.style.color = LCD;
    card.cost.style.color = afford ? LCD : DIM;
    cardHighlight(card.root, afford);
  }
}

/** A thin steel divider line. */
function divider(): HTMLDivElement {
  const d = document.createElement('div');
  d.style.cssText = `width:100%;height:1px;background:${STEEL_EDGE};opacity:0.6;margin:1px 0`;
  return d;
}

/** A labelled result row (caption left, green LCD value right) for the RUN panel. */
function resultRow(name: string): { row: HTMLDivElement; value: HTMLDivElement } {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;width:100%';
  const tag = document.createElement('div');
  tag.textContent = name;
  tag.style.cssText = 'font-size:10px;letter-spacing:1px;color:#b6a98f';
  const value = document.createElement('div');
  value.style.cssText = `font:800 15px/1 ui-monospace,Menlo,monospace;color:${LCD};text-shadow:0 0 6px #7dd86a44`;
  row.append(tag, value);
  return { row, value };
}

/** Update only a card's border + glow for its state — never its `display` (the tab owns that). */
function cardHighlight(el: HTMLElement, live: boolean): void {
  el.style.border = `1px solid ${live ? ORANGE : STEEL_EDGE}`;
  el.style.boxShadow = `inset 0 1px 0 #ffffff12, 0 3px 10px #0009${live ? ', 0 0 12px #e89a3a40' : ''}`;
}

// Skin helpers

function plate(extra = ''): HTMLDivElement {
  const p = document.createElement('div');
  p.className = 'sdw-garage-plate';
  p.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:flex-start',
    'padding:9px 12px',
    'background:linear-gradient(180deg,#39332d,#211d19)',
    `border:1px solid ${STEEL_EDGE}`,
    'border-radius:7px',
    'box-shadow:inset 0 1px 0 #ffffff14, 0 4px 14px #0009',
    extra,
  ].join(';');
  return p;
}

function label(text: string): HTMLDivElement {
  const l = document.createElement('div');
  l.textContent = text;
  l.style.cssText = `font-size:11px;font-weight:800;letter-spacing:2px;color:${ORANGE};margin-bottom:5px`;
  return l;
}

function lcd(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = [
    'min-width:96px',
    'padding:4px 8px',
    'font:800 20px/1 ui-monospace,Menlo,monospace',
    `color:${LCD}`,
    'text-shadow:0 0 7px #7dd86a66',
    'background:#0c120b',
    'border:1px solid #000',
    'border-radius:3px',
    'text-align:right',
  ].join(';');
  return el;
}

function metalButton(text: string, big = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = [
    'appearance:none',
    'cursor:pointer',
    big ? 'padding:14px 26px' : 'padding:9px 16px',
    `font:800 ${big ? 18 : 13}px/1 ui-monospace,Menlo,monospace`,
    'letter-spacing:2px',
    `color:${ORANGE}`,
    'background:linear-gradient(180deg,#4a443c,#2a2620)',
    `border:1px solid ${STEEL_EDGE}`,
    'border-radius:8px',
    'box-shadow:inset 0 1px 0 #ffffff1f, 0 3px 10px #0009',
  ].join(';');
  b.addEventListener('mouseenter', () => (b.style.filter = 'brightness(1.18)'));
  b.addEventListener('mouseleave', () => (b.style.filter = 'none'));
  return b;
}

function tabButton(text: string, soon = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = soon ? `${text} ·` : text;
  b.style.cssText = tabCss(false, soon);
  return b;
}

function tabCss(activeTab: boolean, soon = false): string {
  return [
    'appearance:none',
    soon ? 'cursor:default' : 'cursor:pointer',
    'padding:7px 16px',
    'font:800 12px/1 ui-monospace,Menlo,monospace',
    'letter-spacing:2px',
    `color:${activeTab ? '#1a120c' : soon ? DIM : '#cdbb95'}`,
    `background:${activeTab ? ORANGE : 'linear-gradient(180deg,#37312b,#221e1a)'}`,
    `border:1px solid ${activeTab ? ORANGE : STEEL_EDGE}`,
    'border-radius:7px 7px 0 0',
  ].join(';');
}

function chassisCss(selected: boolean): string {
  return [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:5px',
    'width:120px',
    'height:62px',
    'padding:6px',
    'cursor:pointer',
    'background:linear-gradient(180deg,#39332d,#1f1b17)',
    `border:1px solid ${selected ? ORANGE : STEEL_EDGE}`,
    'border-radius:8px',
    `box-shadow:inset 0 1px 0 #ffffff12, 0 3px 10px #0009${selected ? ', 0 0 12px #e89a3a40' : ''}`,
  ].join(';');
}

function cardCss(live: boolean): string {
  return [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:2px',
    'width:96px',
    'padding:8px 6px',
    'cursor:pointer',
    'background:linear-gradient(180deg,#39332d,#1f1b17)',
    `border:1px solid ${live ? ORANGE : STEEL_EDGE}`,
    'border-radius:8px',
    `box-shadow:inset 0 1px 0 #ffffff12, 0 3px 10px #0009${live ? ', 0 0 12px #e89a3a40' : ''}`,
  ].join(';');
}
