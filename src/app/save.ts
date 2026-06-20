import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings';
import { UPGRADES, isGlobalUpgrade, type UpgradeId } from '../content/upgrades';
import { CHASSIS, type ChassisId } from '../content/chassis';

/**
 * Versioned localStorage persistence (docs/ARCHITECTURE.md → Persistence). The
 * save is tiny, so localStorage — not IndexedDB — is the right tool. Writes are
 * debounced and wrapped in try/catch: a quota error or a locked-down private
 * window must degrade to an in-memory session, never crash the game.
 *
 * The payload carries settings plus the garage's meta-progression: the banked
 * scrap wallet, the **selected chassis**, the **global** upgrades (jump charges,
 * the gun — shared across every car), and the **per-chassis** upgrades (armor,
 * tires, jump arc, magnet — bought and tracked separately on each car). New
 * fields are added backward-compatibly and an old flat `upgrades` list migrates
 * forward by routing each id to global or to the Survivor's per-chassis bucket.
 */
const SCHEMA_VERSION = 1;
const STORAGE_KEY = `sdw.save.v${SCHEMA_VERSION}`;
const WRITE_DEBOUNCE_MS = 400;

export interface SaveData {
  schemaVersion: number;
  settings: Settings;
  /** Banked scrap the garage spends — survivor savings between runs. */
  wallet: number;
  /** The chassis currently selected to drive. */
  chassis: ChassisId;
  /** Owned global upgrades (jump charges, the gun) — applied on every chassis. */
  globalUpgrades: UpgradeId[];
  /** Owned per-chassis upgrades, keyed by chassis id (armor, tires, jump, magnet). */
  chassisUpgrades: Partial<Record<ChassisId, UpgradeId[]>>;
}

const UPGRADE_IDS: ReadonlySet<UpgradeId> = new Set(UPGRADES.map((u) => u.id));
const CHASSIS_IDS: ReadonlySet<ChassisId> = new Set(CHASSIS.map((c) => c.id));

function freshSave(): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    wallet: 0,
    chassis: 'survivor',
    globalUpgrades: [],
    chassisUpgrades: {},
  };
}

function normalizeWallet(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

function normalizeChassis(raw: unknown): ChassisId {
  return typeof raw === 'string' && CHASSIS_IDS.has(raw as ChassisId) ? (raw as ChassisId) : 'survivor';
}

/** Keep only known upgrade ids, optionally filtered by scope, de-duplicated. */
function cleanIds(raw: unknown, want?: 'global' | 'chassis'): UpgradeId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<UpgradeId>();
  for (const id of raw) {
    if (typeof id !== 'string' || !UPGRADE_IDS.has(id as UpgradeId)) continue;
    const u = id as UpgradeId;
    if (want && (isGlobalUpgrade(u) ? 'global' : 'chassis') !== want) continue;
    seen.add(u);
  }
  return [...seen];
}

function normalizeChassisUpgrades(raw: unknown): Partial<Record<ChassisId, UpgradeId[]>> {
  const out: Partial<Record<ChassisId, UpgradeId[]>> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    if (CHASSIS_IDS.has(key as ChassisId)) out[key as ChassisId] = cleanIds(list, 'chassis');
  }
  return out;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    const probe = '__sdw_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Parse and validate a stored blob into `SaveData`, never throwing. */
export function loadSave(store: KeyValueStore | null): SaveData {
  if (!store) return freshSave();
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw === null) return freshSave();
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    let globalUpgrades = cleanIds(parsed.globalUpgrades, 'global');
    let chassisUpgrades = normalizeChassisUpgrades(parsed.chassisUpgrades);
    // Migrate an old flat `upgrades: UpgradeId[]` into the split buckets.
    if (parsed.globalUpgrades === undefined && Array.isArray(parsed.upgrades)) {
      globalUpgrades = cleanIds(parsed.upgrades, 'global');
      chassisUpgrades = { survivor: cleanIds(parsed.upgrades, 'chassis') };
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      settings: normalizeSettings(parsed.settings),
      wallet: normalizeWallet(parsed.wallet),
      chassis: normalizeChassis(parsed.chassis),
      globalUpgrades,
      chassisUpgrades,
    };
  } catch {
    return freshSave();
  }
}

/**
 * The live, debounced save handle the app owns: the current `SaveData` in memory,
 * flushed to storage a beat after the last mutation.
 */
export class SaveStore {
  private readonly store: KeyValueStore | null;
  private data: SaveData;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(store: KeyValueStore | null = defaultStore()) {
    this.store = store;
    this.data = loadSave(store);
  }

  get settings(): Settings {
    return this.data.settings;
  }

  get wallet(): number {
    return this.data.wallet;
  }

  /** The chassis selected to drive. */
  get chassis(): ChassisId {
    return this.data.chassis;
  }

  /** The owned global upgrades (a fresh copy). */
  globalUpgrades(): UpgradeId[] {
    return [...this.data.globalUpgrades];
  }

  /** The owned per-chassis upgrades for one car (a fresh copy). */
  chassisUpgrades(id: ChassisId): UpgradeId[] {
    return [...(this.data.chassisUpgrades[id] ?? [])];
  }

  setSettings(settings: Settings): void {
    this.data = { ...this.data, settings };
    this.schedule();
  }

  /** Bank a run's scrap into the wallet. */
  bankScrap(amount: number): void {
    this.data = { ...this.data, wallet: Math.max(0, this.data.wallet + Math.floor(amount)) };
    this.schedule();
  }

  /** Select the chassis to drive. */
  setChassis(id: ChassisId): void {
    this.data = { ...this.data, chassis: id };
    this.schedule();
  }

  /** Spend `cost` and add a global upgrade (jump charges, gun). */
  buyGlobal(id: UpgradeId, cost: number): void {
    this.data = {
      ...this.data,
      wallet: Math.max(0, this.data.wallet - cost),
      globalUpgrades: [...this.data.globalUpgrades, id],
    };
    this.schedule();
  }

  /** Spend `cost` and add a per-chassis upgrade to one car (armor, tires, …). */
  buyChassis(chassis: ChassisId, id: UpgradeId, cost: number): void {
    const list = [...(this.data.chassisUpgrades[chassis] ?? []), id];
    this.data = {
      ...this.data,
      wallet: Math.max(0, this.data.wallet - cost),
      chassisUpgrades: { ...this.data.chassisUpgrades, [chassis]: list },
    };
    this.schedule();
  }

  private schedule(): void {
    if (!this.store) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, WRITE_DEBOUNCE_MS);
  }

  /** Write immediately (e.g. on pagehide). Silent on failure. */
  flush(): void {
    if (!this.store) return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Quota or denied — keep running on the in-memory copy.
    }
  }
}
