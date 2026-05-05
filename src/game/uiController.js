import { initAudio, updateAudioVolume } from "./audio.js";
import { rebuildCarAppearance } from "./car.js";
import { applyKeyToInput } from "./input.js";
import { GameRoute } from "./routes.js";
import { applyLoadout } from "./simulation.js";
import { upgradeCatalog, getUpgradeCost } from "./content.js";

export function setupUIController({
  state,
  world,
  hud,
  equipmentCatalog,
  saveState,
  applyOptions,
  syncFullscreen,
  isPlaying,
  setRoute,
  startRun,
  endRunToMenu,
  resumeRun,
  pauseRun,
  tryJump,
  useFire,
  flashMessage,
  setupTouchControls,
}) {
  populateEquipmentSelectors(state, equipmentCatalog);
  hydrateOptionsUI(state);
  updateLoadoutUI({ state, hud, equipmentCatalog });
  populateUpgradesUI({ state, hud, equipmentCatalog, saveState, flashMessage });

  document.addEventListener("click", (event) => {
    const uiAction = event.target.closest("[data-ui-action]");
    if (uiAction?.dataset.uiAction === "toggle-help") {
      document.body.dataset.help =
        document.body.dataset.help === "expanded" ? "collapsed" : "expanded";
      return;
    }

    const button = event.target.closest("[data-action]");
    if (!button) return;

    initAudio(world);
    const action = button.dataset.action;

    if (action === "start-desert") {
      startRun("desert");
    } else if (action === "start-city") {
      startRun("city");
    } else if (action === "equipment") {
      setRoute(GameRoute.EQUIPMENT);
      updateLoadoutUI({ state, hud, equipmentCatalog });
      populateUpgradesUI({ state, hud, equipmentCatalog, saveState, flashMessage });
    } else if (action === "options") {
      setRoute(GameRoute.OPTIONS);
    } else if (action === "menu") {
      endRunToMenu();
    } else if (action === "resume") {
      resumeRun();
    } else if (action === "restart") {
      startRun(world.run?.biome ?? "desert", true);
    }
  });

  document.querySelectorAll("[data-equip]").forEach((select) => {
    select.addEventListener("change", () => {
      state.equipment[select.dataset.equip] = select.value;
      saveState();
      rebuildCarAppearance(world, state, equipmentCatalog);
      updateLoadoutUI({ state, hud, equipmentCatalog });
      updateUpgradeStatsUI({ state, hud, equipmentCatalog });
      flashMessage("Equipamiento actualizado");
    });
  });

  const volumeInput = document.querySelector('[data-option="volume"]');
  volumeInput.addEventListener("input", () => {
    state.options.volume = Number(volumeInput.value);
    document.querySelector('[data-option-value="volume"]').textContent =
      `${state.options.volume}%`;
    updateAudioVolume(state, world);
    saveState();
  });

  const qualityInput = document.querySelector('[data-option="quality"]');
  qualityInput.addEventListener("change", () => {
    state.options.quality = qualityInput.value;
    applyOptions();
    saveState();
  });

  const resolutionScaleInput = document.querySelector(
    '[data-option="resolutionScale"]',
  );
  resolutionScaleInput.addEventListener("change", () => {
    state.options.resolutionScale = resolutionScaleInput.value;
    applyOptions();
    saveState();
  });

  const fullscreenInput = document.querySelector('[data-option="fullscreen"]');
  fullscreenInput.addEventListener("change", async () => {
    state.options.fullscreen = fullscreenInput.checked;
    await syncFullscreen();
    saveState();
  });

  const weatherFxInput = document.querySelector('[data-option="weatherFx"]');
  weatherFxInput.addEventListener("change", () => {
    state.options.weatherFx = weatherFxInput.checked;
    saveState();
  });

  const dayNightInput = document.querySelector('[data-option="dayNight"]');
  dayNightInput.addEventListener("change", () => {
    state.options.dayNight = dayNightInput.checked;
    saveState();
  });

  document.querySelectorAll("[data-game-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isPlaying()) return;
      const action = button.dataset.gameAction;
      if (action === "jump") tryJump();
      if (action === "fire") useFire();
      if (action === "pause") pauseRun();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;

    applyKeyToInput(world.input, event, true);

    if (event.code === "Escape") {
      if (isPlaying()) pauseRun();
      else if (world.route === GameRoute.PAUSE) resumeRun();
    }

    if (!isPlaying()) return;

    if (event.code === "Space") {
      event.preventDefault();
      tryJump();
    }
    if (event.code === "KeyF") useFire();
  });

  window.addEventListener("keyup", (event) => {
    if (isPlaying() && event.code === "Space") event.preventDefault();
    applyKeyToInput(world.input, event, false);
  });

  setupTouchControls(world);
}

function populateEquipmentSelectors(state, equipmentCatalog) {
  for (const [key, items] of Object.entries(equipmentCatalog)) {
    const select = document.querySelector(`[data-equip="${key}"]`);
    select.innerHTML = items
      .map((item) => `<option value="${item.id}">${item.name}</option>`)
      .join("");
    select.value = state.equipment[key];
  }
}

function hydrateOptionsUI(state) {
  document.querySelector('[data-option="volume"]').value = state.options.volume;
  document.querySelector('[data-option-value="volume"]').textContent =
    `${state.options.volume}%`;
  document.querySelector('[data-option="quality"]').value =
    state.options.quality;
  document.querySelector('[data-option="resolutionScale"]').value =
    state.options.resolutionScale ?? "auto";
  document.querySelector('[data-option="fullscreen"]').checked =
    state.options.fullscreen;
  document.querySelector('[data-option="weatherFx"]').checked =
    state.options.weatherFx;
  document.querySelector('[data-option="dayNight"]').checked =
    state.options.dayNight;
}

function updateLoadoutUI({ state, hud, equipmentCatalog }) {
  const { selected, merged } = applyLoadout(state.equipment, equipmentCatalog, state.upgrades);
  hud.loadout.innerHTML = `
    <article>
      <h3>${selected.chassis.name}</h3>
      <p>${selected.chassis.description}</p>
      <p class="meta">Rol: ${selected.chassis.role}</p>
    </article>
    <article>
      <h3>${selected.tires.name}</h3>
      <p>${selected.tires.description}</p>
    </article>
    <article>
      <h3>${selected.rig.name}</h3>
      <p>${selected.rig.description}</p>
    </article>
    <article class="stats-card">
      <h3>Resumen</h3>
      <p>Velocidad x${merged.speed.toFixed(2)}</p>
      <p>Manejo x${merged.handling.toFixed(2)}</p>
      <p>Blindaje x${merged.armor.toFixed(2)}</p>
      <p>Autonomia x${merged.reserve.toFixed(2)}</p>
      <p>Eficiencia x${merged.efficiency.toFixed(2)}</p>
      <p>Municion x${merged.ammoCap.toFixed(2)}</p>
    </article>
  `;
}

function populateUpgradesUI({ state, hud, equipmentCatalog, saveState, flashMessage }) {
  if (!hud.upgrades) return;
  updateUpgradeStatsUI({ state, hud, equipmentCatalog });
  hud.upgrades.innerHTML = Object.values(upgradeCatalog)
    .map((upgrade) => {
      const level = state.upgrades?.[upgrade.id] ?? 0;
      const cost = getUpgradeCost(upgrade.id, level);
      const isMax = level >= upgrade.maxLevel;
      const costLabel = isMax ? "MAX" : `${cost ?? "—"} scrap`;
      return `
        <article class="upgrade-card" data-upgrade-card>
          <div>
            <h3>${upgrade.name}</h3>
            <p>${upgrade.description}</p>
          </div>
          <div class="upgrade-meta">
            <span>Lv ${level} / ${upgrade.maxLevel}</span>
            <strong>${costLabel}</strong>
          </div>
          <button class="ghost" data-upgrade-action="${upgrade.id}" ${isMax ? "disabled" : ""}>Mejorar</button>
        </article>
      `;
    })
    .join("");

  hud.upgrades.querySelectorAll("[data-upgrade-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const upgradeId = button.dataset.upgradeAction;
      const current = state.upgrades?.[upgradeId] ?? 0;
      const upgrade = upgradeCatalog[upgradeId];
      if (!upgrade || current >= upgrade.maxLevel) return;
      const cost = getUpgradeCost(upgradeId, current);
      if (cost == null) return;
      if ((state.progression.scrapBank ?? 0) < cost) {
        flashMessage("No tienes suficiente scrap");
        return;
      }
      state.progression.scrapBank -= cost;
      state.upgrades[upgradeId] = current + 1;
      saveState();
      updateUpgradeStatsUI({ state, hud, equipmentCatalog });
      populateUpgradesUI({ state, hud, equipmentCatalog, saveState, flashMessage });
      flashMessage(`Upgrade ${upgrade.name} +1`);
    });
  });
}

function updateUpgradeStatsUI({ state, hud, equipmentCatalog }) {
  if (!hud.runScrapBank) return;
  hud.runScrapBank.textContent = state.progression.scrapBank ?? 0;
  if (hud.upgradeStats) {
    const { merged } = applyLoadout(state.equipment, equipmentCatalog, state.upgrades);
    hud.upgradeStats.innerHTML = `
      <div><span>Velocidad</span><strong>x${merged.speed.toFixed(2)}</strong></div>
      <div><span>Manejo</span><strong>x${merged.handling.toFixed(2)}</strong></div>
      <div><span>Blindaje</span><strong>x${merged.armor.toFixed(2)}</strong></div>
      <div><span>Reserva</span><strong>x${merged.reserve.toFixed(2)}</strong></div>
      <div><span>Municion</span><strong>x${merged.ammoCap.toFixed(2)}</strong></div>
    `;
  }
}
