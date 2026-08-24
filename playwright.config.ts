import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const port = 4173;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // WebGL budget checks need an uncontended renderer. Parallel browser workers
  // can throttle requestAnimationFrame and leave the overlay in its warmup phase.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: '/tmp/survivor-drive-playwright-results',
  use: {
    baseURL: `http://${host}:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: process.env.CI
      ? `npm run preview -- --host ${host} --port ${port}`
      : `npm run build && npm run preview -- --host ${host} --port ${port}`,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
