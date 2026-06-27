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
import { PAINTS, paintDef, type PaintId } from '../content/paint';

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
  /** Pick the paint job (the COLOR tab). */
  onSelectPaint(id: PaintId): void;
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
  paint: PaintId;
}

// The apocalypse-garage skin: grimy steel, warm orange headers, green LCD numbers.
const ORANGE = '#e89a3a';
const LCD = '#7dd86a';
const RED_LCD = '#e8503a'; // unaffordable cost readout (the inspiration's red price)
const STEEL_EDGE = '#525a64'; // cool gunmetal edge
const DIM = '#8a8f98';

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
  { key: 'color', label: 'COLOR' },
];

/** The resting line under the rack per tab, replaced while a card is hovered. */
const DETAIL_HINT: Record<Tab['key'], string> = {
  upgrade: 'Hover an upgrade to see what it does.',
  weapon: 'Hover a gun tier to see what it does.',
  car: 'Hover a chassis to compare how it drives.',
  color: 'Pick a paint job for your car.',
};

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
    paint: 'factory',
  };
  private readonly chassisCards: { id: ChassisId; root: HTMLDivElement; badge: HTMLDivElement }[] = [];
  private readonly paintCards: { id: PaintId; root: HTMLDivElement; badge: HTMLDivElement }[] = [];
  private readonly detailName: HTMLDivElement;
  private readonly detailBlurb: HTMLDivElement;
  /** The currently selected tab, so the detail strip knows its resting hint. */
  private activeTab: Tab['key'] = 'upgrade';

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
      'color:#e4e7ec',
      'z-index:25',
    ].join(';');

    // Top bar: scrap (left), mode title (centre), DRIVE (right).
    const top = document.createElement('div');
    top.className = 'sdw-garage__top';
    top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px';
    const walletPlate = plate('min-width:150px');
    walletPlate.classList.add('sdw-garage__wallet');
    walletPlate.append(label('SCRAP'));
    const walletRow = document.createElement('div');
    walletRow.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%';
    this.walletEl = lcd('0');
    this.walletEl.style.flex = '1';
    walletRow.append(this.walletEl, coin());
    walletPlate.append(walletRow);
    this.title = document.createElement('div');
    this.title.className = 'sdw-garage__title';
    this.title.style.cssText = `flex:1;text-align:center;font-size:27px;letter-spacing:9px;font-weight:800;color:${ORANGE};text-shadow:0 0 18px #e89a3a55,0 2px 2px #000a`;
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
    this.carBlurbEl.style.cssText = 'font-size:11px;font-weight:400;font-style:italic;color:#9aa0a8;line-height:1.35';
    info.append(this.carNameEl, this.carBlurbEl, divider());
    for (const s of STAT_DEFS) info.append(this.buildStatRow(s));
    info.append(this.buildStatLegend());

    this.previewSlot = document.createElement('div');
    this.previewSlot.className = 'sdw-garage__preview';
    this.previewSlot.style.cssText = 'flex:1;min-width:0;position:relative';

    const status = plate('width:212px;gap:8px');
    status.classList.add('sdw-garage__status');
    status.append(label('RUN'));
    this.runTitleEl = document.createElement('div');
    this.runTitleEl.style.cssText =
      'font-size:14px;font-style:italic;font-weight:700;color:#e4e7ec;line-height:1.4';
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
    // One fixed-width control deck so the panel keeps a steady frame across every
    // tab (the rack used to shrink to a narrow island on UPGRADES and balloon on
    // COLOR). The cards spread across it, wrapping when a tab holds many; the
    // detail line lives inside the same panel rather than floating beneath it.
    const rack = document.createElement('div');
    rack.className = 'sdw-garage__rack';
    rack.style.cssText = [
      'width:min(810px,94vw)',
      'display:flex',
      'flex-direction:column',
      'padding:12px 20px 11px',
      'background:linear-gradient(180deg,#2b3139,#15181d)',
      `border:1px solid ${STEEL_EDGE}`,
      'border-top-color:#5d6775',
      'border-radius:10px',
      'box-shadow:inset 0 2px 6px #0008, inset 0 1px 0 #ffffff14, 0 6px 20px #000a',
    ].join(';');

    const cardsRow = document.createElement('div');
    cardsRow.className = 'sdw-garage__cards';
    cardsRow.style.cssText = [
      'display:flex',
      'flex-wrap:wrap',
      'gap:12px 14px',
      'justify-content:space-evenly',
      'align-items:center',
      'min-height:118px',
      'width:100%',
    ].join(';');
    for (const fam of UPGRADE_FAMILIES) cardsRow.append(this.buildFamilyCard(fam));
    for (const ch of CHASSIS) cardsRow.append(this.buildChassisCard(ch));
    for (const p of PAINTS) cardsRow.append(this.buildPaintCard(p));
    this.placeholder = document.createElement('div');
    this.placeholder.style.cssText = `display:none;color:${DIM};font-size:14px;letter-spacing:2px`;
    this.placeholder.textContent = 'COMING SOON';
    cardsRow.append(this.placeholder);

    // The detail strip: what the hovered card does, so a purchase is never a guess
    // (the inspiration's upgrade descriptions). It sits on a hairline inside the deck.
    const detail = document.createElement('div');
    detail.className = 'sdw-garage__detail';
    detail.style.cssText =
      'min-height:30px;margin-top:9px;padding-top:8px;border-top:1px solid #ffffff12;text-align:center;display:flex;flex-direction:column;gap:2px;justify-content:center';
    this.detailName = document.createElement('div');
    this.detailName.style.cssText = `font-size:12px;font-weight:800;letter-spacing:1px;color:${ORANGE}`;
    this.detailBlurb = document.createElement('div');
    this.detailBlurb.style.cssText = 'font-size:11px;font-weight:400;color:#9aa0a8;line-height:1.35';
    detail.append(this.detailName, this.detailBlurb);

    rack.append(cardsRow, detail);
    rack.addEventListener('mouseleave', () => this.resetDetail());
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

  /** Switch the active category tab — filters which cards show in the rack. */
  private setTab(key: Tab['key']): void {
    this.activeTab = key;
    for (const tab of this.tabs) tab.button.style.cssText = tabCss(tab.key === key, tab.soon);
    const soon = this.tabs.find((t) => t.key === key)?.soon ?? false;
    for (const card of this.cards) card.root.style.display = card.family.category === key ? 'flex' : 'none';
    for (const cc of this.chassisCards) cc.root.style.display = key === 'car' ? 'flex' : 'none';
    for (const pc of this.paintCards) pc.root.style.display = key === 'color' ? 'flex' : 'none';
    this.placeholder.style.display = soon ? 'block' : 'none';
    this.resetDetail();
  }

  // Builders

  /**
   * A CAR INFO stat row, styled after the inspiration: the track is the orange
   * MAX rail, and a green CURRENT fill overlays it from the left, so what you own
   * vs. the ceiling reads at a glance (the CURRENT / MAX legend below explains it).
   */
  private buildStatRow(def: { label: string; key: string }): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'width:100%';
    const tag = document.createElement('div');
    tag.textContent = def.label;
    tag.style.cssText = 'font-size:10px;letter-spacing:1px;color:#c4cad2;margin-bottom:3px;text-shadow:0 1px 0 #000';
    const track = document.createElement('div');
    track.className = 'sdw-garage__bar';
    // The track itself is the MAX rail (orange); the green fill is CURRENT.
    track.style.cssText =
      'position:relative;width:100%;height:13px;background:linear-gradient(90deg,#b9542a,#e07a3a);border:1px solid #000;border-radius:3px;overflow:hidden;box-shadow:inset 0 1px 3px #000c';
    const fill = document.createElement('div');
    fill.className = 'sdw-garage__bar-fill';
    fill.style.cssText = `height:100%;width:0%;background:linear-gradient(90deg,#5e9a32,${LCD});transition:width .25s ease`;
    track.append(fill);
    row.append(tag, track);
    this.bars.push({ fill, familyKey: def.key });
    return row;
  }

  /** The CURRENT (green) / MAX (orange) key under the CAR INFO bars. */
  private buildStatLegend(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:14px;margin-top:5px';
    const item = (color: string, text: string): HTMLDivElement => {
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:9px;letter-spacing:1px;color:#9aa0a8';
      const chip = document.createElement('span');
      chip.style.cssText = `width:9px;height:9px;border-radius:2px;border:1px solid #000;background:${color};box-shadow:0 0 5px ${color}66`;
      const cap = document.createElement('span');
      cap.textContent = text;
      el.append(chip, cap);
      return el;
    };
    wrap.append(item(LCD, 'CURRENT'), item('#e07a3a', 'MAX'));
    return wrap;
  }

  /**
   * One upgrade family as a metal tile (the inspiration's UPGRADES tab): an icon
   * and a green/red LCD level badge across the top, the family name, and a coin
   * cost on its own LCD plate at the foot — green when affordable, red when not.
   */
  private buildFamilyCard(fam: UpgradeFamily): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'sdw-garage-card';
    root.style.cssText = cardCss();

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%';
    const icon = document.createElement('div');
    icon.textContent = fam.glyph;
    icon.style.cssText = `font-size:23px;line-height:1;color:${ORANGE};text-shadow:0 0 12px #e89a3a55`;
    const badge = document.createElement('div');
    badge.className = 'sdw-garage-card__badge';
    head.append(icon, badge);

    const nm = document.createElement('div');
    nm.textContent = fam.label;
    nm.style.cssText = 'font-size:11px;letter-spacing:1px;color:#c4cad2;margin:5px 0 7px';

    const costPlate = document.createElement('div');
    costPlate.className = 'sdw-garage-card__cost';
    const cost = document.createElement('div');
    cost.style.cssText = `font:800 12px/1 ui-monospace,Menlo,monospace;color:${LCD}`;
    costPlate.append(cost, coin());
    root.append(head, nm, costPlate);

    const card: Card = { family: fam, root, badge, cost, target: null };
    root.addEventListener('click', () => {
      if (card.target) this.cb.onBuy(card.target);
    });
    root.addEventListener('mouseenter', () => this.showFamilyDetail(fam));
    this.cards.push(card);
    return root;
  }

  private buildChassisCard(ch: { id: ChassisId; name: string }): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'sdw-garage-chassis-card';
    root.style.cssText = chassisCss();
    root.style.display = 'none'; // shown only on the CAR tab
    const badge = document.createElement('div');
    badge.style.cssText = `font-size:10px;font-weight:800;letter-spacing:1px;color:${LCD}`;
    const nm = document.createElement('div');
    nm.textContent = ch.name;
    nm.style.cssText = 'font-size:12px;color:#e4e7ec;text-align:center';
    root.append(badge, nm);
    root.addEventListener('click', () => this.cb.onSelectChassis(ch.id));
    root.addEventListener('mouseenter', () => this.showChassisDetail(ch.id));
    this.chassisCards.push({ id: ch.id, root, badge });
    return root;
  }

  /** A paint swatch: a color chip over its name, with a SELECT/SELECTED badge. */
  private buildPaintCard(p: { id: PaintId; name: string; body: number | null }): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'sdw-garage-paint-card';
    root.style.cssText = chassisCss();
    root.style.display = 'none'; // shown only on the COLOR tab
    const chip = document.createElement('div');
    // The factory job has no single color, so show it as a split steel swatch.
    const swatch = p.body === null ? 'linear-gradient(135deg,#7f2d1e 50%,#2b2e3a 50%)' : `#${p.body.toString(16).padStart(6, '0')}`;
    chip.style.cssText = `width:30px;height:18px;border-radius:4px;border:1px solid #000;box-shadow:inset 0 1px 0 #ffffff22;background:${swatch}`;
    const badge = document.createElement('div');
    badge.style.cssText = `font-size:9px;font-weight:800;letter-spacing:1px;color:${LCD}`;
    const nm = document.createElement('div');
    nm.textContent = p.name;
    nm.style.cssText = 'font-size:11px;color:#e4e7ec;text-align:center;line-height:1.1';
    root.append(badge, chip, nm);
    root.addEventListener('click', () => this.cb.onSelectPaint(p.id));
    root.addEventListener('mouseenter', () => this.showPaintDetail(p.id));
    this.paintCards.push({ id: p.id, root, badge });
    return root;
  }

  // Detail strip

  /** Write the hovered upgrade's next-tier name + blurb (or its maxed state). */
  private showFamilyDetail(fam: UpgradeFamily): void {
    const next = familyNextTier(fam, this.view.owned);
    if (!next) {
      this.detailName.textContent = `${fam.label} — Maxed`;
      this.detailName.style.color = '#8fbf6a';
      this.detailBlurb.textContent = 'Every tier installed.';
      return;
    }
    const def = upgradeDef(next);
    this.detailName.textContent = def.name;
    this.detailName.style.color = ORANGE;
    this.detailBlurb.textContent = `${def.blurb}  (${def.cost} scrap)`;
  }

  private showChassisDetail(id: ChassisId): void {
    const c = chassisDef(id);
    this.detailName.textContent = c.name;
    this.detailName.style.color = ORANGE;
    this.detailBlurb.textContent = c.blurb;
  }

  private showPaintDetail(id: PaintId): void {
    const p = paintDef(id);
    this.detailName.textContent = p.name;
    this.detailName.style.color = ORANGE;
    this.detailBlurb.textContent =
      p.body === null ? 'The factory coat — each car keeps its own color.' : 'A fresh coat of paint. Cosmetic only.';
  }

  /** The resting detail line for the active tab, shown when nothing is hovered. */
  private resetDetail(): void {
    this.detailName.textContent = '';
    this.detailBlurb.textContent = DETAIL_HINT[this.activeTab] ?? '';
  }

  // Sync

  private sync(): void {
    const v = this.view;
    const wreck = v.mode === 'wreck';
    this.title.textContent = wreck ? 'WRECKED' : 'GARAGE';
    this.title.style.color = wreck ? '#e8503a' : ORANGE;
    this.title.style.textShadow = wreck
      ? '0 0 22px #e8503a66,0 2px 2px #000a'
      : '0 0 18px #e89a3a55,0 2px 2px #000a';
    this.driveBtn.textContent = wreck ? 'PLAY AGAIN' : 'RESUME';
    this.walletEl.textContent = `${v.wallet}`;

    // Left panel: the selected car's identity.
    const car = chassisDef(v.chassis);
    this.carNameEl.textContent = car.name;
    this.carBlurbEl.textContent = car.blurb;

    // Right panel: the death card on a wreck, a hint while paused.
    this.runTitleEl.textContent = wreck ? `“${v.runTitle}”` : 'Spend scrap below, then DRIVE.';
    this.runTitleEl.style.fontStyle = wreck ? 'italic' : 'normal';
    this.runTitleEl.style.color = wreck ? '#e4e7ec' : DIM;
    this.resultBox.style.display = wreck ? 'flex' : 'none';
    if (wreck) {
      this.resultVals.dist.textContent = `${Math.floor(v.distance)} M`;
      this.resultVals.kills.textContent = `${v.zombiesMowed}`;
      this.resultVals.scrap.textContent = `+${v.runScrap}`;
    }

    for (const bar of this.bars) {
      const fam = UPGRADE_FAMILIES.find((f) => f.key === bar.familyKey);
      const frac = fam ? familyLevel(fam, v.owned) / fam.tiers.length : 0;
      // Green CURRENT fill over the orange MAX rail (the inspiration's car-info bars).
      bar.fill.style.width = `${Math.round(frac * 100)}%`;
    }

    for (const card of this.cards) this.syncCard(card, v);

    for (const cc of this.chassisCards) {
      const sel = cc.id === v.chassis;
      cardHighlight(cc.root, sel);
      cc.badge.textContent = sel ? 'SELECTED' : 'SELECT';
      cc.badge.style.color = sel ? '#8fbf6a' : LCD;
    }

    for (const pc of this.paintCards) {
      const sel = pc.id === v.paint;
      cardHighlight(pc.root, sel);
      pc.badge.textContent = sel ? 'SELECTED' : 'SELECT';
      pc.badge.style.color = sel ? '#8fbf6a' : LCD;
    }
  }

  private syncCard(card: Card, v: GarageView): void {
    const level = familyLevel(card.family, v.owned);
    const total = card.family.tiers.length;
    card.badge.textContent = `${level}/${total}`;
    const coinEl = card.cost.nextElementSibling as HTMLElement | null;
    const next = familyNextTier(card.family, v.owned);
    if (!next) {
      card.target = null;
      card.cost.textContent = 'MAX';
      card.badge.style.color = '#8fbf6a';
      card.cost.style.color = '#8fbf6a';
      if (coinEl) coinEl.style.display = 'none';
      cardHighlight(card.root, false);
      card.root.classList.add('is-max');
      return;
    }
    card.root.classList.remove('is-max');
    const cost = upgradeDef(next).cost;
    const afford = v.wallet >= cost;
    card.target = afford ? next : null;
    card.cost.textContent = `${cost}`;
    // Green LCD when affordable, red when it is out of reach (the inspiration).
    card.badge.style.color = afford ? LCD : RED_LCD;
    card.cost.style.color = afford ? LCD : RED_LCD;
    if (coinEl) coinEl.style.display = '';
    cardHighlight(card.root, afford);
  }
}

/** A small embossed coin disc — the scrap-cost marker on LCD readouts. */
function coin(): HTMLSpanElement {
  const c = document.createElement('span');
  c.className = 'sdw-garage-coin';
  return c;
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
  tag.style.cssText = 'font-size:10px;letter-spacing:1px;color:#9aa0a8';
  const value = document.createElement('div');
  value.style.cssText = `font:800 15px/1 ui-monospace,Menlo,monospace;color:${LCD};text-shadow:0 0 6px #7dd86a44`;
  row.append(tag, value);
  return { row, value };
}

/**
 * Toggle a card's live/selected glow via the `is-active` class — the CSS owns the
 * border, shadow, and (for affordable upgrades) the pulse. Never touches `display`
 * (the tab owns that).
 */
function cardHighlight(el: HTMLElement, live: boolean): void {
  el.classList.toggle('is-active', live);
}

// Skin helpers

function plate(extra = ''): HTMLDivElement {
  const p = document.createElement('div');
  p.className = 'sdw-garage-plate';
  // Surface (gradient, border, shadow, rivets) lives in CSS; this is layout only.
  p.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:flex-start',
    'padding:10px 13px',
    'border-radius:7px',
    extra,
  ].join(';');
  return p;
}

function label(text: string): HTMLDivElement {
  const l = document.createElement('div');
  l.textContent = text;
  // Gold embossed header on a hairline rule (the inspiration's panel captions).
  l.style.cssText = `font-size:11px;font-weight:800;letter-spacing:2px;color:#f0c14b;text-shadow:0 1px 1px #000,0 -1px 0 #00000088;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e89a3a33;align-self:stretch`;
  return l;
}

function lcd(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'sdw-garage__lcd';
  el.textContent = text;
  el.style.cssText = [
    'min-width:96px',
    'padding:5px 9px',
    'font:800 21px/1 ui-monospace,Menlo,monospace',
    `color:${LCD}`,
    'text-shadow:0 0 9px #7dd86a88',
    'background:linear-gradient(180deg,#0a1108,#060a05)',
    'border:1px solid #000',
    'border-radius:4px',
    'box-shadow:inset 0 0 10px #000c, inset 0 1px 0 #ffffff10',
    'text-align:right',
  ].join(';');
  return el;
}

function metalButton(text: string, big = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  // Hover / press / glow live in CSS (.sdw-garage__drive); this is the resting skin.
  b.style.cssText = [
    'appearance:none',
    'cursor:pointer',
    big ? 'padding:14px 28px' : 'padding:9px 16px',
    `font:800 ${big ? 18 : 13}px/1 ui-monospace,Menlo,monospace`,
    'letter-spacing:2px',
    'color:#1c1207',
    'background:linear-gradient(180deg,#f2ad48,#c87f24)',
    'border:1px solid #f4c068',
    'border-radius:8px',
    'box-shadow:inset 0 1px 0 #ffffff55, 0 3px 12px #0009, 0 0 14px #e89a3a30',
  ].join(';');
  return b;
}

function tabButton(text: string, soon = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = soon ? `${text} ·` : text;
  b.style.cssText = tabCss(false, soon);
  return b;
}

function tabCss(activeTab: boolean, soon = false): string {
  // Gold embossed lettering on brushed steel; the active tab lifts onto the rack.
  return [
    'appearance:none',
    soon ? 'cursor:default' : 'cursor:pointer',
    'padding:9px 20px',
    'font:800 13px/1 ui-monospace,Menlo,monospace',
    'letter-spacing:2px',
    `color:${activeTab ? '#3a2607' : soon ? DIM : '#f0c14b'}`,
    activeTab ? 'text-shadow:0 1px 0 #ffffff66' : 'text-shadow:0 1px 1px #000,0 -1px 0 #00000088',
    `background:${activeTab ? 'linear-gradient(180deg,#f4b652,#d98f2c)' : 'linear-gradient(180deg,#474f59,#262b31)'}`,
    `border:1px solid ${activeTab ? '#f6c878' : '#69737f'}`,
    'border-top-color:' + (activeTab ? '#ffe0a0' : '#8a94a1'),
    'border-bottom:none',
    'border-radius:8px 8px 0 0',
    activeTab
      ? 'box-shadow:0 -3px 12px #e89a3a55, inset 0 1px 0 #ffffff77'
      : 'box-shadow:inset 0 1px 0 #ffffff1a, inset 0 -3px 5px #0006',
    activeTab ? 'transform:translateY(1px)' : '',
  ].join(';');
}

// Border, shadow, hover, and active glow live in CSS; these return layout + the
// brushed-steel resting fill only.
function chassisCss(): string {
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
    'background:linear-gradient(160deg,#4c545f 0%,#363c44 46%,#252a30 100%)',
    'border-radius:8px',
  ].join(';');
}

function cardCss(): string {
  return [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:2px',
    'width:96px',
    'padding:9px 6px',
    'cursor:pointer',
    'background:linear-gradient(160deg,#4e5660 0%,#373d45 46%,#262b31 100%)',
    'border-radius:8px',
  ].join(';');
}
