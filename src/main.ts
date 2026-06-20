import './styles/main.css';
import { Game } from './app/game';

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

new Game(readSeed()).start();
