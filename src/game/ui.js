import { speedPips } from "./content.js";
import { getCheckpoints } from "./zones.js";

export function mountApp(app) {
  app.innerHTML = `
    <div class="shell">
      <div class="atmosphere"></div>
      <canvas class="scene"></canvas>

      <header class="hud topbar">
        <div class="brand">
          <span class="brand-kicker">Survivor's Drive reboot</span>
          <h1>Survivor Drive</h1>
        </div>
        <div class="topbar-right">
          <div class="status-strip">
            <div class="status-chip zone-chip" data-zone-chip>
              <span>Zone</span>
              <strong data-zone-name>Garage</strong>
              <small data-zone-checkpoint>Checkpoint 0.5 km</small>
            </div>
            <div class="status-chip event-chip" data-event-chip style="display:none;">
              <span>Event</span>
              <strong data-event-name>—</strong>
            </div>
            <div class="status-chip" data-biome-chip>
              <span>Route</span>
              <strong data-biome>Desert run</strong>
            </div>
            <div class="status-chip">
              <span>Weather</span>
              <strong data-weather>Clear</strong>
            </div>
            <div class="status-chip">
              <span>Cycle</span>
              <strong data-cycle>Day</strong>
            </div>
            <div class="status-chip objective-chip">
              <span>Objective</span>
              <strong data-objective>Reach the city gate</strong>
              <small data-objective-progress>0.0 km</small>
            </div>
          </div>
          <div class="zone-progress-bar" data-zone-progress-wrap>
            <div class="zone-progress-track">
              <div class="zone-progress-fill" data-zone-progress-fill></div>
              <div class="zone-progress-ticks" data-zone-ticks></div>
            </div>
            <div class="zone-progress-info">
              <span>Route progress</span>
              <strong data-zone-progress-text>0.0 / 7.2 km</strong>
            </div>
          </div>
          <div class="threat-bar" data-threat-wrap>
            <div class="threat-label-row">
              <span>Threat level</span>
              <strong data-zone-threat-text>0%</strong>
            </div>
            <div class="threat-track">
              <div class="threat-fill" data-zone-threat-fill></div>
            </div>
          </div>
        </div>
      </header>

      <aside class="hud stats-cluster">
        <div class="resource-bars">
          <div class="bar-container health">
             <div class="bar-label"><span>Hull integrity</span><strong data-health>100</strong></div>
             <div class="bar-bg"><div class="bar-fill" data-health-fill></div></div>
          </div>
          <div class="bar-container fuel">
             <div class="bar-label"><span>Bio-fuel reserve</span><strong data-fuel>100</strong></div>
             <div class="bar-bg"><div class="bar-fill" data-fuel-fill></div></div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><span>Ammo</span><strong data-ammo>0</strong></div>
          <div class="stat"><span>Jump</span><strong data-jumps>0</strong></div>
          <div class="stat"><span>Fire</span><strong data-fire>0</strong></div>
          <div class="stat"><span>Coins</span><strong data-coins>0</strong></div>
          <div class="stat"><span>Scrap</span><strong data-scrap>0</strong></div>
          <div class="stat"><span>Nitro</span><strong data-nitro>--</strong></div>
          <div class="stat"><span>Km</span><strong data-distance>0.0</strong></div>
        </div>
      </aside>

      <aside class="hud controls">
        <div class="controls-head">
          <span class="eyebrow">Drive model</span>
          <button class="ghost compact-toggle" type="button" data-ui-action="toggle-help">Controles</button>
        </div>
        <div class="controls-copy" data-help-copy>
          <p><kbd>A</kbd> / <kbd>←</kbd> gira a izquierda, <kbd>D</kbd> / <kbd>→</kbd> a derecha.</p>
          <p><kbd>W</kbd> acelera, <kbd>S</kbd> frena, <kbd>Space</kbd> salta, <kbd>F</kbd> usa fuego.</p>
          <p>La pista cambia de bioma y amenaza: vigila combustible, blindaje y municion.</p>
        </div>
      </aside>

      <section class="hud action-pad">
        <button class="action-btn utility" data-game-action="pause">Pause</button>
        <button class="action-btn jump" data-game-action="jump">
          <span>Jump</span>
          <strong data-action-stock="jump">1</strong>
        </button>
        <button class="action-btn fire" data-game-action="fire">
          <span>Fire</span>
          <strong data-action-stock="fire">1</strong>
        </button>
      </section>

      <section class="hud message" data-message></section>
      <div class="hud raider-warning" data-raider-warning style="display:none;">
        <span class="warning-arrow">▼</span>
        <strong>RAIDER APPROACHING</strong>
      </div>
      <div class="hud speed-bar" id="speed-bar"></div>

      <section class="panel panel-main active" data-screen="menu">
        <div class="panel-card hero">
          <span class="eyebrow">Highway Survival</span>
          <h2>De la autopista al distrito en ruinas.</h2>
          <p>
            Rehacemos en web el loop de da: menu, opciones, equipamiento, desierto, ciudad,
            recursos, pausa y progresion de run.
          </p>
          <div class="contract-grid">
            <article class="contract-card emphasis">
              <span class="eyebrow">Unico escenario</span>
              <h3>Highway to Ruins</h3>
              <p>Recorre el desierto hasta las afueras y atraviesa el distrito urbano en ruinas en una sola run.</p>
              <button data-action="start-desert">Jugar</button>
            </article>
          </div>
          <div class="actions compact">
            <button data-action="equipment" class="ghost">Equipamiento</button>
            <button data-action="options" class="ghost">Opciones</button>
          </div>
        </div>
      </section>

      <section class="panel" data-screen="equipment">
        <div class="panel-card split">
          <div>
            <span class="eyebrow">Garage</span>
            <h2>Configura tu maquina</h2>
            <p>Las piezas cambian conduccion, blindaje, autonomia, rol y el tipo de run que mejor soporta.</p>
          </div>
          <div class="equipment-grid">
            <label>
              Chasis
              <select data-equip="chassis"></select>
            </label>
            <label>
              Neumaticos
              <select data-equip="tires"></select>
            </label>
            <label>
              Modulo frontal
              <select data-equip="rig"></select>
            </label>
          </div>
          <div class="loadout" data-loadout></div>
          <div class="upgrade-hub">
            <div class="upgrade-head">
              <div>
                <span class="eyebrow">Upgrades</span>
                <h3>Mejoras permanentes</h3>
                <p>Gasta scrap del hangar para reforzar el coche en cada run.</p>
              </div>
              <div class="upgrade-bank">
                <span>Scrap disponible</span>
                <strong data-run-scrap-bank>0</strong>
              </div>
            </div>
            <div class="upgrade-stats" data-upgrade-stats></div>
            <div class="upgrade-grid" data-upgrades></div>
          </div>
          <div class="actions">
            <button data-action="start-desert">Jugar</button>
            <button data-action="menu" class="ghost">Volver</button>
          </div>
        </div>
      </section>

      <section class="panel" data-screen="options">
        <div class="panel-card split">
          <div>
            <span class="eyebrow">System</span>
            <h2>Opciones</h2>
            <p>Replica el menu de ajustes de da y añade escala de resolucion web para controlar coste de render.</p>
          </div>
          <div class="options-grid">
            <label>
              Volumen
              <input data-option="volume" type="range" min="0" max="100" step="1" />
              <small data-option-value="volume"></small>
            </label>
            <label>
              Calidad
              <select data-option="quality">
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </label>
            <label>
              Escala render
              <select data-option="resolutionScale">
                <option value="auto">Auto</option>
                <option value="performance">Performance</option>
                <option value="balanced">Balanced</option>
                <option value="quality">Quality</option>
              </select>
            </label>
            <label class="toggle">
              <input data-option="fullscreen" type="checkbox" />
              Pantalla completa
            </label>
            <label class="toggle">
              <input data-option="weatherFx" type="checkbox" />
              Clima dinamico
            </label>
            <label class="toggle">
              <input data-option="dayNight" type="checkbox" />
              Ciclo dia y noche
            </label>
          </div>
          <div class="actions">
            <button data-action="menu">Volver</button>
          </div>
        </div>
      </section>

      <section class="panel" data-screen="pause">
        <div class="panel-card compact">
          <span class="eyebrow">Pause</span>
          <h2>Motor en espera</h2>
          <p>La partida queda congelada y libera la vista; esto debe sentirse como una escena formal, no como overlay accidental.</p>
          <div class="actions">
            <button data-action="resume">Reanudar</button>
            <button data-action="restart" class="ghost">Reiniciar</button>
            <button data-action="menu" class="ghost">Menu</button>
          </div>
        </div>
      </section>

      <section class="panel" data-screen="gameover">
        <div class="panel-card compact">
          <span class="eyebrow">Run ended</span>
          <h2>Estado del convoy</h2>
          <p data-summary></p>
          <div class="actions">
            <button data-action="restart">Intentar otra vez</button>
            <button data-action="equipment" class="ghost">Cambiar equipo</button>
          </div>
        </div>
      </section>
    </div>
  `;

  const screens = new Map(
    [...app.querySelectorAll("[data-screen]")].map((node) => [node.dataset.screen, node]),
  );

  const hud = {
    coins: app.querySelector("[data-coins]"),
    scrap: app.querySelector("[data-scrap]"),
    nitro: app.querySelector("[data-nitro]"),
    ammo: app.querySelector("[data-ammo]"),
    jumps: app.querySelector("[data-jumps]"),
    fire: app.querySelector("[data-fire]"),
    health: app.querySelector("[data-health]"),
    healthFill: app.querySelector("[data-health-fill]"),
    fuel: app.querySelector("[data-fuel]"),
    fuelFill: app.querySelector("[data-fuel-fill]"),
    threat: app.querySelector("[data-threat]"),
    weather: app.querySelector("[data-weather]"),
    cycle: app.querySelector("[data-cycle]"),
    distance: app.querySelector("[data-distance]"),
    biome: app.querySelector("[data-biome]"),
    objective: app.querySelector("[data-objective]"),
    objectiveProgress: app.querySelector("[data-objective-progress]"),
    message: app.querySelector("[data-message]"),
    summary: app.querySelector("[data-summary]"),
    loadout: app.querySelector("[data-loadout]"),
    upgrades: app.querySelector("[data-upgrades]"),
    upgradeStats: app.querySelector("[data-upgrade-stats]"),
    runScrapBank: app.querySelector("[data-run-scrap-bank]"),
    jumpStock: app.querySelector('[data-action-stock="jump"]'),
    fireStock: app.querySelector('[data-action-stock="fire"]'),
    speedBar: app.querySelector("#speed-bar"),
    jumpButton: app.querySelector('[data-game-action="jump"]'),
    fireButton: app.querySelector('[data-game-action="fire"]'),
    pauseButton: app.querySelector('[data-game-action="pause"]'),
    helpCopy: app.querySelector("[data-help-copy]"),
    zoneName: app.querySelector("[data-zone-name]"),
    zoneCheckpoint: app.querySelector("[data-zone-checkpoint]"),
    zoneProgressFill: app.querySelector("[data-zone-progress-fill]"),
    zoneProgressText: app.querySelector("[data-zone-progress-text]"),
    zoneThreatText: app.querySelector("[data-zone-threat-text]"),
    zoneThreatFill: app.querySelector("[data-zone-threat-fill]"),
    zoneThreatWrap: app.querySelector("[data-threat-wrap]"),
    zoneProgressWrap: app.querySelector("[data-zone-progress-wrap]"),
    zoneChip: app.querySelector("[data-zone-chip]"),
    eventChip: app.querySelector("[data-event-chip]"),
    eventName: app.querySelector("[data-event-name]"),
    raiderWarning: app.querySelector("[data-raider-warning]"),
  };

  for (let i = 0; i < speedPips; i += 1) {
    const pip = document.createElement("div");
    pip.className = "speed-pip";
    hud.speedBar.appendChild(pip);
  }

  buildZoneTicks(hud);

  return {
    canvas: app.querySelector(".scene"),
    atmosphere: app.querySelector(".atmosphere"),
    screens,
    hud,
  };
}

function buildZoneTicks(hud) {
  const ticksContainer = hud.zoneProgressFill?.parentElement?.querySelector("[data-zone-ticks]");
  if (!ticksContainer) return;
  const checkpoints = getCheckpoints().filter((c) => c.isCheckpoint);
  const totalDistance = 7.2;
  for (const cp of checkpoints) {
    const tick = document.createElement("div");
    tick.className = "zone-tick";
    tick.style.left = `${(cp.distance / totalDistance) * 100}%`;
    tick.title = cp.zoneName;
    ticksContainer.appendChild(tick);
  }
  const endTick = document.createElement("div");
  endTick.className = "zone-tick zone-tick-end";
  endTick.style.left = "100%";
  endTick.title = "Refuge";
  ticksContainer.appendChild(endTick);
}

/**
 * updateZoneHud — renders zone/checkpoint HUD data.
 *
 * @param {Object} hud  - HUD element references from mountApp()
 * @param {Object} data
 * @param {string} data.zoneName       - Name of the current zone (e.g. "Garage")
 * @param {string} data.zoneLabel      - Short label (e.g. "Zona de Salida")
 * @param {number} data.distanceKm     - Current distance in km
 * @param {number} data.nextCheckpointKm - Distance to next checkpoint (null if none)
 * @param {string} data.nextCheckpointLabel - Label for next checkpoint (e.g. "Broken Hwy")
 * @param {number} data.threatLevel    - Threat level 0-100
 * @param {number} data.totalDistance  - Total route distance in km (default 7.2)
 */
export function updateZoneHud(hud, data = {}) {
  const {
    zoneName = "—",
    zoneLabel = "",
    distanceKm = 0,
    nextCheckpointKm = null,
    nextCheckpointLabel = "",
    threatLevel = 0,
    totalDistance = 7.2,
  } = data;

  if (hud.zoneName) {
    hud.zoneName.textContent = zoneLabel || zoneName;
  }

  if (hud.zoneCheckpoint) {
    if (nextCheckpointKm != null) {
      const remaining = (nextCheckpointKm - distanceKm).toFixed(1);
      hud.zoneCheckpoint.textContent = `Next: ${nextCheckpointLabel} (${remaining} km)`;
    } else {
      hud.zoneCheckpoint.textContent = "Final stretch";
    }
  }

  if (hud.zoneProgressFill) {
    const progress = Math.min(100, (distanceKm / totalDistance) * 100);
    hud.zoneProgressFill.style.width = `${progress}%`;
  }

  if (hud.zoneProgressText) {
    hud.zoneProgressText.textContent = `${distanceKm.toFixed(1)} / ${totalDistance.toFixed(1)} km`;
  }

  if (hud.zoneThreatFill) {
    hud.zoneThreatFill.style.width = `${Math.min(100, threatLevel)}%`;
  }

  if (hud.zoneThreatText) {
    hud.zoneThreatText.textContent = `${Math.round(threatLevel)}%`;
  }

  const threatClass = threatLevel > 70 ? "danger" : threatLevel > 40 ? "warning" : "";
  if (hud.zoneThreatWrap) {
    hud.zoneThreatWrap.className = hud.zoneThreatWrap.className
      .replace(/\b(danger|warning)\b/g, "")
      .trim();
    if (threatClass) {
      hud.zoneThreatWrap.classList.add(threatClass);
    }
  }
}
