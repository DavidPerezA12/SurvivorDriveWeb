import { biomeCatalog, speedPips } from "./content.js";

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
        <div class="status-strip">
          <div class="status-chip" data-biome-chip>
            <span>Route</span>
            <strong data-biome>Desert run</strong>
          </div>
          <div class="status-chip objective-chip">
            <span>Objective</span>
            <strong data-objective>Reach the city gate</strong>
            <small data-objective-progress>0.0 km</small>
          </div>
        </div>
      </header>

      <aside class="hud stats-cluster">
        <div class="stats">
          <div class="stat"><span>Coins</span><strong data-coins>0</strong></div>
          <div class="stat"><span>Ammo</span><strong data-ammo>0</strong></div>
          <div class="stat"><span>Jump</span><strong data-jumps>0</strong></div>
          <div class="stat"><span>Fire</span><strong data-fire>0</strong></div>
          <div class="stat"><span>Hull</span><strong data-health>100</strong></div>
          <div class="stat"><span>Threat</span><strong data-threat>0%</strong></div>
          <div class="stat"><span>Weather</span><strong data-weather>Clear</strong></div>
          <div class="stat"><span>Cycle</span><strong data-cycle>Day</strong></div>
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
              <span class="eyebrow">Primary route</span>
              <h3>Wasteland Highway</h3>
              <p>Run larga desde desierto hasta la entrada de la ciudad. Desbloquea el tramo urbano.</p>
              <button data-action="start-desert">Jugar desierto</button>
            </article>
            <article class="contract-card" data-city-card>
              <span class="eyebrow">Second scene</span>
              <h3>Ruined District</h3>
              <p data-city-copy>Desbloquea el acceso urbano alcanzando la puerta de la ciudad.</p>
              <button data-action="start-city" data-city-button disabled>Distrito city</button>
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
          <div class="actions">
            <button data-action="start-desert">Salir al desierto</button>
            <button data-action="start-city" data-city-button-inline class="ghost" disabled>Distrito city</button>
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
    ammo: app.querySelector("[data-ammo]"),
    jumps: app.querySelector("[data-jumps]"),
    fire: app.querySelector("[data-fire]"),
    health: app.querySelector("[data-health]"),
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
    jumpStock: app.querySelector('[data-action-stock="jump"]'),
    fireStock: app.querySelector('[data-action-stock="fire"]'),
    speedBar: app.querySelector("#speed-bar"),
    cityButtons: [...app.querySelectorAll("[data-city-button], [data-city-button-inline]")],
    cityCopy: app.querySelector("[data-city-copy]"),
    helpCopy: app.querySelector("[data-help-copy]"),
  };

  for (let i = 0; i < speedPips; i += 1) {
    const pip = document.createElement("div");
    pip.className = "speed-pip";
    hud.speedBar.appendChild(pip);
  }

  return {
    canvas: app.querySelector(".scene"),
    atmosphere: app.querySelector(".atmosphere"),
    screens,
    hud,
  };
}

export function updateCityAccessUI(hud, unlocked) {
  for (const button of hud.cityButtons) {
    button.disabled = !unlocked;
  }
  hud.cityCopy.textContent = unlocked
    ? "Acceso urbano activo. Puedes arrancar directamente en el distrito."
    : "Desbloquea el acceso urbano alcanzando la puerta de la ciudad.";
}
