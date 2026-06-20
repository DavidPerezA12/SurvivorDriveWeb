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
              group: ['three', 'three/*'],
              message:
                'sim/ and content/ must stay renderer-agnostic — no three.js here (docs/ARCHITECTURE.md).',
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
