import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * The prime directive (docs/ARCHITECTURE.md) is enforced here, not by convention:
 * `src/sim/` and `src/content/` are pure, deterministic, renderer-agnostic
 * TypeScript. An import of three.js — or of any impure layer — inside them is a
 * lint error, and so is reaching for `Date`, `Math.random`, or the DOM.
 */
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // The pure core: sim/ and content/ may not see the renderer, the DOM, or wall-clock time.
  {
    files: ['src/sim/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*', 'node:*'],
              message:
                'sim/ and content/ must stay renderer-agnostic and browser/Node independent (docs/ARCHITECTURE.md).',
            },
            {
              group: [
                '**/render/**',
                '**/audio/**',
                '**/ui/**',
                '**/input/**',
                '**/app/**',
              ],
              message:
                'sim/ and content/ are the pure core — they must not import from impure layers.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'No wall-clock time in the sim — determinism. Advance via dt.' },
        { name: 'document', message: 'No DOM in the pure core.' },
        { name: 'window', message: 'No window in the pure core.' },
        { name: 'performance', message: 'No wall-clock time in the sim — determinism.' },
        { name: 'crypto', message: 'No ambient randomness in the sim — use src/sim/rng.ts.' },
        { name: 'setTimeout', message: 'No wall-clock timers in the fixed-timestep core.' },
        { name: 'setInterval', message: 'No wall-clock timers in the fixed-timestep core.' },
        { name: 'requestAnimationFrame', message: 'Animation scheduling belongs in app/render.' },
        { name: 'fetch', message: 'No network access in the pure core.' },
        { name: 'localStorage', message: 'Persistence belongs in app/.' },
        { name: 'navigator', message: 'Platform state must not enter deterministic simulation.' },
        { name: 'AudioContext', message: 'Audio belongs in the impure audio layer.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG (src/sim/rng.ts), never Math.random, in the pure core.',
        },
      ],
    },
  },

  // Config files and tests run in Node.
  {
    files: ['*.config.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
