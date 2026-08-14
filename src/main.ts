import './styles/main.css';
import { Game } from './app/game';
import { loadRenderAssets } from './render';

let game: Game | null = null;
let disposed = false;

/**
 * Entry point. Picks a seed (from `?seed=` for shareable/repeatable runs, else
 * the wall clock — which is fine here, in the impure app layer) and starts the
 * loop. The same seed always produces the same road.
 */
function readSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (param !== null) {
    const parsed = Number.parseInt(param, 10);
    if (Number.isFinite(parsed)) return parsed >>> 0;
  }
  return Date.now() >>> 0;
}

async function boot(): Promise<void> {
  const bootCard = document.querySelector<HTMLElement>('#sdw-boot');
  const assets = await loadRenderAssets();
  if (disposed) {
    for (const geometry of Object.values(assets)) geometry?.dispose();
    return;
  }
  game = new Game(readSeed(), assets);
  game.start();
  bootCard?.remove();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposed = true;
    game?.destroy();
    game = null;
  });
}

void boot().catch((error: unknown) => {
  console.error('Survivor Drive failed to start.', error);
  const bootCard = document.querySelector<HTMLElement>('#sdw-boot');
  if (!bootCard) return;
  bootCard.dataset.state = 'error';
  const status = bootCard.querySelector<HTMLElement>('.sdw-boot__status');
  if (status) status.textContent = 'START FAILED · RELOAD TO TRY AGAIN';
});
