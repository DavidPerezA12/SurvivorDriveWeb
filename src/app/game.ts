import { createSim, step, FIXED_DT, NO_INTENT, type SimState } from '../sim';
import { GameView, CarPreview, type RenderAssets, type RenderSnapshot } from '../render';
import { PlayerInput } from '../input/playerInput';
import { Hud } from '../ui/hud';
import { DebugOverlay } from '../ui/debugOverlay';
import { Menu } from '../ui/menu';
import { Garage, type GarageView } from '../ui/garage';
import { SaveStore } from './save';
import { qualityPixelCap, reducedMotion, type Settings } from './settings';
import { isGlobalUpgrade, upgradeDef, upgradePrereq, type UpgradeId } from '../content/upgrades';
import { chassisDef, runLoadout, type ChassisId } from '../content/chassis';
import { paintBody, type PaintId } from '../content/paint';
import { runTitle } from '../content/runTitles';
import { biomeAt } from '../content/biomes';
import { INTRO_TUNING } from '../content/tuning';
import { ACT_NAMES, actAt } from '../content/acts';

/** Beyond this many catch-up ticks in one frame, pause rather than spiral. */
const MAX_CATCHUP = 5;
/** A tab regaining focus can report a huge gap; clamp it so we never spiral. */
const MAX_FRAME_S = 0.25;
/** Time the frozen wreck stays visible before the garage recap replaces it. */
const DEATH_BEAT_S = 0.95;
const REDUCED_DEATH_BEAT_S = 0.2;

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
  /** First visit only: the sim stays frozen until a real driving input arrives. */
  private readyActive = false;
  /** Render-only wreck tableau progress; the sim is already frozen. */
  private deathElapsed = 0;
  private deathBeatActive = false;
  /** Whether the open garage is the wreck screen (drives again) or a pause visit (resumes). */
  private garageMode: 'wreck' | 'pause' = 'wreck';
  /** The chassis selected in the garage's CAR tab (shown in the preview). */
  private selectedChassis: ChassisId = 'survivor';
  /** The paint selected in the garage's COLOR tab (shown in the preview). */
  private selectedPaint: PaintId = 'factory';
  /** The just-ended run's result, frozen for the garage to display across buys. */
  private lastRun = {
    distance: 0,
    zombiesMowed: 0,
    runScrap: 0,
    title: '',
    act: ACT_NAMES[0] as string,
    peakMultiplier: 1,
    isBest: false,
  };

  /** Reused snapshot of the pre-step state for interpolation. Never realloc'd. */
  private readonly prev: RenderSnapshot = {
    distance: 0,
    carLateralX: 0,
    carLateralVel: 0,
    carHeight: 0,
  };

  private accumulator = 0;
  private last = 0;
  /** Run-opening cinematic: while active the camera plays the intro over the moving world. */
  private introActive = false;
  /** Sim ticks stepped so far in the current intro (drives the camera and ends it). */
  private introTicks = 0;
  /** Tracks the OS preference while the setting is `auto`. */
  private readonly motionQuery: MediaQueryList | null;
  private destroyed = false;

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      // A hidden tab may never receive keyup/pagehide (especially when a mobile
      // OS kills it). Drop held controls and persist immediately before it goes.
      this.input.reset();
      this.save.flush();
      if (this.running && !this.readyActive && !this.state.dead) this.pause();
    } else {
      this.last = performance.now();
    }
  };

  private readonly onWindowBlur = (): void => {
    this.input.reset();
    if (this.running && !this.readyActive && !this.state.dead) this.pause();
  };

  private readonly onMotionPreferenceChange = (): void => {
    if (this.save.settings.motion === 'auto') this.applySettings(this.save.settings);
  };

  private readonly onResize = (): void => this.resizeGaragePreview();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if ((event.key === 'r' || event.key === 'R') && this.state.dead && this.garage.isOpen()) {
      if (event.repeat) return;
      event.preventDefault();
      this.driveAgain();
      return;
    }
    if (event.key !== 'Escape' || this.state.dead) return;
    event.preventDefault();
    // A garage opened from pause closes straight back to the run.
    if (this.garage.isOpen()) this.exitGarageToGame();
    else if (!this.menu.isOpen()) this.pause();
    else if (this.menu.inSettings()) this.menu.showRoot();
    else this.resume();
  };

  private readonly onPageHide = (): void => this.save.flush();

  constructor(seed: number, renderAssets: RenderAssets) {
    this.seed = seed;
    this.save = new SaveStore();
    this.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    this.selectedChassis = this.save.chassis;
    this.selectedPaint = this.save.paint;
    // A returning player starts in their chosen car, already wearing what they bought.
    this.state = createSim(seed, runLoadout(this.selectedChassis, this.effectiveOwned()));
    this.view = new GameView(seed, renderAssets);
    this.input = new PlayerInput({ onPause: () => this.pause() });
    this.hud = new Hud(seed);
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
      onSelectPaint: (id) => this.selectPaint(id),
      onClose: () => (this.garageMode === 'wreck' ? this.driveAgain() : this.exitGarageToGame()),
      onNewApocalypse: () => this.newApocalypse(),
      onCopyRunLink: () => this.copyRunLink(),
    });
    // The 3D car preview lives in the garage panel — built once, spun only while open.
    this.carPreview = new CarPreview();
    this.garage.previewSlot.appendChild(this.carPreview.element);
    this.applySettings(this.save.settings);
    this.dressCar();
    this.snapshot();

    // Returning to a backgrounded tab reports one huge frame; reset the clock so
    // the loop resumes cleanly instead of catching up across the whole gap.
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.motionQuery?.addEventListener('change', this.onMotionPreferenceChange);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onWindowBlur);

    // Esc owns the pause menu: open it, step back out of settings, or resume.
    // The death screen keeps its own R-to-restart flow, so pausing is disabled
    // while wrecked.
    window.addEventListener('keydown', this.onKeyDown);

    // Last-chance flush so a setting changed seconds before a close survives.
    window.addEventListener('pagehide', this.onPageHide);
  }

  start(): void {
    if (this.destroyed) return;
    this.input.setTouchVisible(true);
    if (this.save.tutorialSeen) this.beginIntro();
    else {
      this.readyActive = true;
      this.hud.showReadyCard();
    }
    this.startLoop();
  }

  /** Start the main frame loop with a fresh clock, without changing overlays. */
  private startLoop(): void {
    if (this.destroyed || this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Stop the main frame loop without opening the pause menu. */
  private stopLoop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Open the run-opening cinematic: raise the location card; the sim keeps running. */
  private beginIntro(): void {
    this.introActive = true;
    this.introTicks = 0;
    // The location the run opens in (distance 0), the title on the intro card.
    this.hud.showIntroCard(biomeAt(this.seed, 0).name, `ACT 1 · ${ACT_NAMES[0]}`);
  }

  /** Hand the cinematic off to gameplay: drop the card, hand control back to the player. */
  private endIntro(): void {
    this.introActive = false;
    this.hud.hideIntroCard();
  }

  /**
   * Intro camera progress from the fraction `p` (0→1) of the intro elapsed: `dolly`
   * 0→1 over the opening beat (the backward pull off the hood, card reading), then
   * `settle` 0→1 over the orbit to the chase pose.
   */
  private introPose(p: number): { dolly: number; settle: number } {
    const f = INTRO_TUNING.dollyFrac;
    const dolly = Math.min(p / f, 1);
    const settle = p <= f ? 0 : Math.min((p - f) / (1 - f), 1);
    return { dolly, settle };
  }

  /** Stop the loop and raise the pause menu (zero cost while up). */
  private pause(): void {
    if (!this.running) return;
    this.stopLoop();
    this.input.setTouchVisible(false);
    this.menu.show();
  }

  /** Hide the menu and restart the loop, resetting the clock and input. */
  private resume(): void {
    if (this.running) return;
    this.menu.hide();
    this.input.reset();
    this.input.setTouchVisible(true);
    this.startLoop();
  }

  /** Persist and apply a settings change from the menu. */
  private onSettingsChange(settings: Settings): void {
    this.save.setSettings(settings);
    this.applySettings(settings);
  }

  /** Push settings into the impure layers. Never called per frame. */
  private applySettings(settings: Settings): void {
    const motionReduced = reducedMotion(settings.motion);
    this.view.applySettings(motionReduced, settings.shake, qualityPixelCap(settings.quality));
    this.hud.setReducedMotion(motionReduced);
    this.carPreview.setReducedMotion(motionReduced);
    this.overlay.setVisible(settings.debugOverlay);
    document.documentElement.dataset.reducedMotion = String(motionReduced);
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
    this.selectedPaint = this.save.paint;
    this.state = createSim(this.seed, runLoadout(this.selectedChassis, this.effectiveOwned()));
    this.accumulator = 0;
    this.wreckHandled = false;
    this.readyActive = false;
    this.deathElapsed = 0;
    this.deathBeatActive = false;
    this.garage.hide();
    this.carPreview.stop();
    this.dressCar();
    this.input.reset();
    this.snapshot();
    this.hud.resetRun();
    // Every fresh run opens with the cinematic, not just the first.
    this.beginIntro();
  }

  /** The owned upgrades that apply to the selected chassis: global ∪ that car's per-chassis set. */
  private effectiveOwned(): Set<UpgradeId> {
    return new Set<UpgradeId>([
      ...this.save.globalUpgrades(),
      ...this.save.chassisUpgrades(this.selectedChassis),
    ]);
  }

  /** Re-dress the driven car for the selected chassis, paint, and owned upgrades. */
  private dressCar(): void {
    this.view.setChassis(this.selectedChassis);
    this.view.setPaint(paintBody(this.selectedPaint) ?? undefined);
    this.view.setLoadout(this.effectiveOwned());
  }

  /** First tick of a wreck: bank the run's scrap and raise the garage. Once per run. */
  private handleWreck(): void {
    this.wreckHandled = true;
    this.garageMode = 'wreck';
    const act = ACT_NAMES[actAt(this.state.distance)];
    const title = runTitle(this.seed, this.state.deathCause ?? 'attrition', {
      distance: this.state.distance,
      zombiesKilled: this.state.zombiesMowed,
      scrap: this.state.scrap,
    });
    const isBest = this.save.recordRun({
      distance: this.state.distance,
      zombiesMowed: this.state.zombiesMowed,
      scrap: this.state.scrap,
      seed: this.seed,
      title,
      act,
      peakMultiplier: this.state.peakMultiplier,
    });
    this.lastRun = {
      distance: this.state.distance,
      zombiesMowed: this.state.zombiesMowed,
      runScrap: this.state.scrap,
      // The death card: an absurd, attributable headline composed from the run
      // seed, the blocker that killed the car, and the run's tally. Deterministic
      // per seed+cause, so it is frozen here and reused across garage buys.
      title,
      act,
      peakMultiplier: this.state.peakMultiplier,
      isBest,
    };
    this.save.bankScrap(this.state.scrap);
    // The garage owns the screen now. Stop the world loop before starting the
    // preview turntable so the dead run cannot coast behind the overlay, drift
    // away from its frozen result, or compete for a second WebGL frame loop.
    this.stopLoop();
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
    this.carPreview.setPaint(paintBody(this.selectedPaint) ?? undefined);
    this.carPreview.setLoadout(this.effectiveOwned());
    this.carPreview.start();
  }

  /** Keep the garage turntable matched to its responsive slot, including rotation. */
  private resizeGaragePreview(): void {
    if (!this.garage.isOpen()) return;
    const slot = this.garage.previewSlot;
    this.carPreview.resize(slot.clientWidth, slot.clientHeight);
  }

  /**
   * Pick a chassis in the CAR tab. An owned car selects and persists. A locked
   * car previews on the turntable first (no spend), and a second click while
   * affordable buys it with banked scrap — the inspiration's garage, browse then
   * buy. An unaffordable car stays a preview.
   */
  private selectChassis(id: ChassisId): void {
    if (!this.save.ownsChassis(id) && this.selectedChassis === id) {
      const price = chassisDef(id).price;
      if (this.save.wallet >= price) this.save.buyCar(id, price);
    }
    if (this.save.ownsChassis(id)) this.save.setChassis(id);
    this.selectedChassis = id;
    this.carPreview.setChassis(id);
    this.carPreview.setLoadout(this.effectiveOwned());
    this.garage.show(this.garageView());
  }

  /** Pick the paint in the COLOR tab; persists and repaints the live preview. */
  private selectPaint(id: PaintId): void {
    this.selectedPaint = id;
    this.save.setPaint(id);
    this.carPreview.setPaint(paintBody(id) ?? undefined);
    this.garage.show(this.garageView());
  }

  /** Leave a pause-opened garage and resume the run in progress. */
  private exitGarageToGame(): void {
    // Drop a locked-car preview: only an owned selection survives the garage.
    this.selectedChassis = this.save.chassis;
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
      seed: this.seed,
      act: this.lastRun.act,
      peakMultiplier: this.lastRun.peakMultiplier,
      bestDistance: this.save.bestRun?.distance ?? this.lastRun.distance,
      isBest: this.lastRun.isBest,
      wallet: this.save.wallet,
      owned: this.effectiveOwned(),
      chassis: this.selectedChassis,
      ownedCars: new Set(this.save.ownedChassis()),
      paint: this.selectedPaint,
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
    this.startLoop();
  }

  /** Reload on a fresh seed while keeping every local garage unlock and record. */
  private newApocalypse(): void {
    this.save.flush();
    let next = Date.now() >>> 0;
    try {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      next = random[0];
    } catch {
      // Date-based fallback still belongs safely in this impure app boundary.
    }
    if (next === this.seed) next = (next + 1) >>> 0;
    const url = new URL(window.location.href);
    url.searchParams.set('seed', `${next}`);
    window.location.assign(url.toString());
  }

  /** Copy a stable URL for replaying the current deterministic apocalypse. */
  private async copyRunLink(): Promise<boolean> {
    const clipboard = navigator.clipboard;
    if (!clipboard) return false;
    const url = new URL(window.location.href);
    url.searchParams.set('seed', `${this.seed}`);
    try {
      await clipboard.writeText(url.toString());
      return true;
    } catch {
      return false;
    }
  }

  /** Draw the frozen lethal tick long enough for the hit and cause to register. */
  private renderDeath(frameMs: number): void {
    if (!this.deathBeatActive) {
      this.deathBeatActive = true;
      this.deathElapsed = 0;
      this.accumulator = 0;
      this.input.reset();
    }
    this.deathElapsed += Math.min(frameMs / 1000, MAX_FRAME_S);
    const duration = reducedMotion(this.save.settings.motion) ? REDUCED_DEATH_BEAT_S : DEATH_BEAT_S;
    const progress = Math.min(this.deathElapsed / duration, 1);
    this.view.render(this.prev, this.state, 1, frameMs / 1000, null, progress);
    this.hud.update(this.state);
    this.overlay.update(frameMs, this.view.stats());
    if (progress >= 1) {
      if (!this.wreckHandled) this.handleWreck();
      return;
    }
    if (this.running) this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const frameMs = now - this.last;
    this.last = now;

    // The first visit starts on a deliberate ready gate: the road and grace
    // period are frozen until the player proves they have found a control.
    if (this.readyActive) {
      const intent = this.input.takeIntent();
      if (intent.steer !== 0 || intent.jump || intent.fire) {
        this.readyActive = false;
        this.save.markTutorialSeen();
        this.input.reset();
        this.accumulator = 0;
        this.beginIntro();
      }
      this.view.render(this.prev, this.state, 0, frameMs / 1000);
      this.hud.update(this.state);
      this.overlay.update(frameMs, this.view.stats());
      if (this.running) this.raf = requestAnimationFrame(this.frame);
      return;
    }

    if (this.state.dead) {
      this.renderDeath(frameMs);
      return;
    }

    // The run-opening cinematic: the sim runs (the car drives at cruising speed, so the
    // world scrolls and the roadside streams past — real motion) while the camera plays
    // its dolly-and-orbit over it, for the fixed `INTRO_TUNING.ticks` inside the
    // spawn-free grace chunks (the pairing `tests/intro.test.ts` holds). The intro plays
    // out in full — it is not skippable — but input is still drained so a key held
    // through it does not leak a buffered move into the first gameplay tick.
    if (this.introActive) {
      this.input.takeIntent();
      this.accumulator += Math.min(frameMs / 1000, MAX_FRAME_S);
      let ticks = 0;
      while (
        this.accumulator >= FIXED_DT &&
        this.introTicks < INTRO_TUNING.ticks &&
        ticks < MAX_CATCHUP
      ) {
        this.snapshot();
        step(this.state, NO_INTENT);
        for (const event of this.state.events) {
          this.view.handleEvent(event);
          this.hud.handleEvent(event, this.state.tick);
        }
        this.accumulator -= FIXED_DT;
        this.introTicks += 1;
        ticks += 1;
      }
      // The cinematic obeys the same anti-spiral rule as gameplay. A stalled
      // frame may lengthen the intro in wall-clock time, but never creates a
      // second long frame or an interpolation alpha above one.
      if (ticks === MAX_CATCHUP) this.accumulator = 0;
      const alpha = Math.min(this.accumulator / FIXED_DT, 1);
      const p = Math.min((this.introTicks + alpha) / INTRO_TUNING.ticks, 1);
      const pose = this.introPose(p);
      // The card belongs to the hood shot: fade it out as the orbit takes over.
      if (pose.settle > 0) this.hud.hideIntroCard();
      this.view.render(this.prev, this.state, alpha, frameMs / 1000, pose);
      this.hud.update(this.state);
      this.overlay.update(frameMs, this.view.stats());
      if (this.introTicks >= INTRO_TUNING.ticks) this.endIntro();
      if (this.running) this.raf = requestAnimationFrame(this.frame);
      return;
    }

    this.accumulator += Math.min(frameMs / 1000, MAX_FRAME_S);

    let ticks = 0;
    while (this.accumulator >= FIXED_DT && ticks < MAX_CATCHUP) {
      // Snapshot the state we are leaving, so render can interpolate prev → curr.
      this.snapshot();

      step(this.state, this.input.takeIntent());
      for (const event of this.state.events) {
        this.view.handleEvent(event);
        this.hud.handleEvent(event, this.state.tick);
      }

      this.accumulator -= FIXED_DT;
      ticks += 1;
      // Death freezes the authoritative result on the exact lethal tick. Never
      // let catch-up batching add dead-coast distance or alter the run title.
      if (this.state.dead) break;
    }
    // Drop the backlog instead of spiraling if we hit the catch-up ceiling.
    if (ticks === MAX_CATCHUP) this.accumulator = 0;

    if (this.state.dead) {
      this.renderDeath(frameMs);
      return;
    }

    const alpha = this.accumulator / FIXED_DT;
    const dt = frameMs / 1000;
    this.view.render(this.prev, this.state, alpha, dt);
    this.hud.update(this.state);
    this.overlay.update(frameMs, this.view.stats());

    // Reschedule only while running — pausing cancels the loop entirely.
    if (this.running) this.raf = requestAnimationFrame(this.frame);
  };

  /** Tear down every global listener, DOM surface, animation loop, and renderer we own. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopLoop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.motionQuery?.removeEventListener('change', this.onMotionPreferenceChange);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pagehide', this.onPageHide);
    this.save.flush();
    this.carPreview.destroy();
    this.view.destroy();
    this.input.destroy();
    this.hud.destroy();
    this.overlay.destroy();
    this.menu.destroy();
    this.garage.destroy();
  }
}
