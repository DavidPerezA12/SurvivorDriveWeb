import { createSim, step, FIXED_DT, type SimState } from '../sim';
import { GameView, CarPreview, type RenderSnapshot } from '../render';
import { PlayerInput } from '../input/playerInput';
import { Hud } from '../ui/hud';
import { DebugOverlay } from '../ui/debugOverlay';
import { Menu } from '../ui/menu';
import { Garage, type GarageView } from '../ui/garage';
import { SaveStore } from './save';
import { qualityPixelCap, reducedMotion, type Settings } from './settings';
import { isGlobalUpgrade, upgradeDef, upgradePrereq, type UpgradeId } from '../content/upgrades';
import { runLoadout, type ChassisId } from '../content/chassis';
import { runTitle } from '../content/runTitles';

/** Beyond this many catch-up ticks in one frame, pause rather than spiral. */
const MAX_CATCHUP = 5;
/** A tab regaining focus can report a huge gap; clamp it so we never spiral. */
const MAX_FRAME_S = 0.25;

/**
 * Composition root. Wires the pure sim to the impure views and runs the
 * standard fixed-timestep loop: accumulate real time, advance the sim in whole
 * 60 Hz ticks, render the leftover as an interpolation `alpha`
 * (docs/ARCHITECTURE.md → Game loop).
 *
 * Wall-clock time lives here, never in the sim. `performance.now()` feeds the
 * accumulator and never reaches a tick.
 *
 * Pausing stops the rAF loop outright rather than gating the body: an open
 * menu then costs zero CPU/GPU and allocates nothing (the WebGL canvas keeps
 * its last frame under the overlay). Player settings load from `SaveStore` at
 * startup, apply to the impure layers here, and persist on every change.
 *
 * (Audio is intentionally not wired: the engine-sound layer exists in
 * `src/audio/` but is disabled for now. The volume setting persists but is
 * inert until it lands.)
 */
export class Game {
  private readonly seed: number;
  private state: SimState;
  private readonly view: GameView;
  private readonly input: PlayerInput;
  private readonly hud: Hud;
  private readonly overlay: DebugOverlay;
  private readonly save: SaveStore;
  private readonly menu: Menu;
  private readonly garage: Garage;
  private readonly carPreview: CarPreview;
  private running = false;
  private raf = 0;
  /** Latches the wreck handling (bank scrap, open garage) to once per run. */
  private wreckHandled = false;
  /** Whether the open garage is the wreck screen (drives again) or a pause visit (resumes). */
  private garageMode: 'wreck' | 'pause' = 'wreck';
  /** The chassis selected in the garage's CAR tab (shown in the preview). */
  private selectedChassis: ChassisId = 'survivor';
  /** The just-ended run's result, frozen for the garage to display across buys. */
  private lastRun = { distance: 0, zombiesMowed: 0, runScrap: 0, title: '' };

  /** Reused snapshot of the pre-step state for interpolation. Never realloc'd. */
  private readonly prev: RenderSnapshot = {
    distance: 0,
    carLateralX: 0,
    carLateralVel: 0,
    carHeight: 0,
  };

  private accumulator = 0;
  private last = 0;

  constructor(seed: number) {
    this.seed = seed;
    this.save = new SaveStore();
    this.selectedChassis = this.save.chassis;
    // A returning player starts in their chosen car, already wearing what they bought.
    this.state = createSim(seed, runLoadout(this.selectedChassis, this.effectiveOwned()));
    this.view = new GameView(seed);
    this.input = new PlayerInput({ onPause: () => this.pause() });
    this.hud = new Hud();
    this.overlay = new DebugOverlay();
    this.menu = new Menu(this.save.settings, {
      onResume: () => this.resume(),
      onRestart: () => {
        this.reset();
        this.resume();
      },
      onGarage: () => this.openGarageFromPause(),
      onSettingsChange: (s) => this.onSettingsChange(s),
    });
    this.garage = new Garage({
      onBuy: (id) => this.buyUpgrade(id),
      onSelectChassis: (id) => this.selectChassis(id),
      onClose: () => (this.garageMode === 'wreck' ? this.driveAgain() : this.exitGarageToGame()),
    });
    // The 3D car preview lives in the garage panel — built once, spun only while open.
    this.carPreview = new CarPreview();
    this.garage.previewSlot.appendChild(this.carPreview.element);
    this.applySettings(this.save.settings);
    this.dressCar();
    this.snapshot();

    // Returning to a backgrounded tab reports one huge frame; reset the clock so
    // the loop resumes cleanly instead of catching up across the whole gap.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.last = performance.now();
    });

    window.addEventListener('resize', () => this.resizeGaragePreview());

    // Esc owns the pause menu: open it, step back out of settings, or resume.
    // The death screen keeps its own R-to-restart flow, so pausing is disabled
    // while wrecked.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.state.dead) return;
      e.preventDefault();
      // A garage opened from pause closes straight back to the run.
      if (this.garage.isOpen()) this.exitGarageToGame();
      else if (!this.menu.isOpen()) this.pause();
      else if (this.menu.inSettings()) this.menu.showRoot();
      else this.resume();
    });

    // Last-chance flush so a setting changed seconds before a close survives.
    window.addEventListener('pagehide', () => this.save.flush());
  }

  start(): void {
    this.running = true;
    this.input.setTouchVisible(true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Stop the loop and raise the pause menu (zero cost while up). */
  private pause(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.setTouchVisible(false);
    this.menu.show();
  }

  /** Hide the menu and restart the loop, resetting the clock and input. */
  private resume(): void {
    if (this.running) return;
    this.menu.hide();
    this.input.reset();
    this.input.setTouchVisible(true);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Persist and apply a settings change from the menu. */
  private onSettingsChange(settings: Settings): void {
    this.save.setSettings(settings);
    this.applySettings(settings);
  }

  /** Push settings into the impure layers. Never called per frame. */
  private applySettings(settings: Settings): void {
    this.view.applySettings(
      reducedMotion(settings.motion),
      settings.shake,
      qualityPixelCap(settings.quality),
    );
    this.overlay.setVisible(settings.debugOverlay);
    // settings.volume is persisted but inert until the audio layer is wired.
  }

  /** Capture the dynamic scalars render interpolates from. No allocation. */
  private snapshot(): void {
    this.prev.distance = this.state.distance;
    this.prev.carLateralX = this.state.car.lateralX;
    this.prev.carLateralVel = this.state.car.lateralVel;
    this.prev.carHeight = this.state.car.height;
  }

  /**
   * Restart the run on the same seed, "drive the same apocalypse" again, now
   * wearing whatever the garage has installed. The loadout is read fresh, so a
   * purchase made on the wreck screen takes effect the instant you drive.
   */
  private reset(): void {
    this.selectedChassis = this.save.chassis;
    this.state = createSim(this.seed, runLoadout(this.selectedChassis, this.effectiveOwned()));
    this.accumulator = 0;
    this.wreckHandled = false;
    this.garage.hide();
    this.carPreview.stop();
    this.dressCar();
    this.input.reset();
    this.snapshot();
  }

  /** The owned upgrades that apply to the selected chassis: global ∪ that car's per-chassis set. */
  private effectiveOwned(): Set<UpgradeId> {
    return new Set<UpgradeId>([
      ...this.save.globalUpgrades(),
      ...this.save.chassisUpgrades(this.selectedChassis),
    ]);
  }

  /** Re-dress the driven car for the selected chassis and its owned upgrades. */
  private dressCar(): void {
    this.view.setChassis(this.selectedChassis);
    this.view.setLoadout(this.effectiveOwned());
  }

  /** First tick of a wreck: bank the run's scrap and raise the garage. Once per run. */
  private handleWreck(): void {
    this.wreckHandled = true;
    this.garageMode = 'wreck';
    this.lastRun = {
      distance: this.state.distance,
      zombiesMowed: this.state.zombiesMowed,
      runScrap: this.state.scrap,
      // The death card: an absurd, attributable headline composed from the run
      // seed, the blocker that killed the car, and the run's tally. Deterministic
      // per seed+cause, so it is frozen here and reused across garage buys.
      title: runTitle(this.seed, this.state.deathCause ?? 'attrition', {
        distance: this.state.distance,
        zombiesKilled: this.state.zombiesMowed,
        scrap: this.state.scrap,
      }),
    };
    this.save.bankScrap(this.state.scrap);
    this.openGarage();
  }

  /** Open the garage from the pause menu, a between-runs visit rather than a wreck. */
  private openGarageFromPause(): void {
    this.garageMode = 'pause';
    this.menu.hide();
    this.openGarage();
  }

  /** Show the garage and spin up the live car preview with the owned build. */
  private openGarage(): void {
    this.input.setTouchVisible(false);
    this.garage.show(this.garageView());
    this.resizeGaragePreview();
    this.carPreview.setChassis(this.selectedChassis);
    this.carPreview.setLoadout(this.effectiveOwned());
    this.carPreview.start();
  }

  /** Keep the garage turntable matched to its responsive slot, including rotation. */
  private resizeGaragePreview(): void {
    if (!this.garage.isOpen()) return;
    const slot = this.garage.previewSlot;
    this.carPreview.resize(slot.clientWidth, slot.clientHeight);
  }

  /** Pick the chassis in the CAR tab; persists and updates the live preview + its upgrades. */
  private selectChassis(id: ChassisId): void {
    this.selectedChassis = id;
    this.save.setChassis(id);
    this.carPreview.setChassis(id);
    this.carPreview.setLoadout(this.effectiveOwned());
    this.garage.show(this.garageView());
  }

  /** Leave a pause-opened garage and resume the run in progress. */
  private exitGarageToGame(): void {
    this.garage.hide();
    this.carPreview.stop();
    this.resume();
  }

  /** Compose the garage's read-only view from the frozen run result and the save. */
  private garageView(): GarageView {
    return {
      mode: this.garageMode,
      distance: this.lastRun.distance,
      zombiesMowed: this.lastRun.zombiesMowed,
      runScrap: this.lastRun.runScrap,
      runTitle: this.lastRun.title,
      wallet: this.save.wallet,
      owned: this.effectiveOwned(),
      chassis: this.selectedChassis,
    };
  }

  /**
   * Buy an upgrade if affordable, not already owned, and its prerequisite (the
   * gun tier below it) is installed, then refresh the garage. The prereq guard
   * keeps the weapon level climbing in order even if a stale UI offers it.
   */
  private buyUpgrade(id: UpgradeId): void {
    const owned = this.effectiveOwned();
    if (owned.has(id)) return;
    const prereq = upgradePrereq(id);
    if (prereq !== null && !owned.has(prereq)) return;
    const cost = upgradeDef(id).cost;
    if (this.save.wallet < cost) return;
    // Global upgrades (jump charges, gun) ride every car; the rest stick to the
    // chassis they were bought for (docs/DESIGN.md → chassis classes).
    if (isGlobalUpgrade(id)) this.save.buyGlobal(id, cost);
    else this.save.buyChassis(this.selectedChassis, id, cost);
    this.openGarage();
  }

  /** Leave the garage and start the next run with the (possibly new) loadout. */
  private driveAgain(): void {
    this.reset();
    this.input.setTouchVisible(true);
  }

  private readonly frame = (now: number): void => {
    const frameMs = now - this.last;
    this.last = now;

    // The wreck flow: bank scrap and raise the garage once, then R (or the
    // garage's Drive button) starts the next run wearing the new loadout.
    if (this.state.dead) {
      if (!this.wreckHandled) this.handleWreck();
      if (this.input.takeRestart()) this.driveAgain();
    }

    this.accumulator += Math.min(frameMs / 1000, MAX_FRAME_S);

    let ticks = 0;
    while (this.accumulator >= FIXED_DT && ticks < MAX_CATCHUP) {
      // Snapshot the state we are leaving, so render can interpolate prev → curr.
      this.snapshot();

      step(this.state, this.input.takeIntent());
      for (const event of this.state.events) this.view.handleEvent(event);

      this.accumulator -= FIXED_DT;
      ticks += 1;
    }
    // Drop the backlog instead of spiraling if we hit the catch-up ceiling.
    if (ticks === MAX_CATCHUP) this.accumulator = 0;

    const alpha = this.accumulator / FIXED_DT;
    const dt = frameMs / 1000;
    this.view.render(this.prev, this.state, alpha, dt);
    this.hud.update(this.state);
    this.overlay.update(frameMs, this.view.stats());

    // Reschedule only while running — pausing cancels the loop entirely.
    if (this.running) this.raf = requestAnimationFrame(this.frame);
  };
}
