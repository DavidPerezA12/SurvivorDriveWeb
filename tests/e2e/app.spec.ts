import { devices, expect, test as base, type Locator, type Page } from '@playwright/test';

const RUN_URL = '/?seed=424242';
const APP_ORIGIN = 'http://127.0.0.1:4173';
const PHONE = devices['Pixel 7'];

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

      await use(errors);

      expect(errors, 'the app emitted browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

async function bootGame(page: Page): Promise<void> {
  await page.goto(RUN_URL, { waitUntil: 'domcontentloaded' });
  await waitForGame(page);
}

async function waitForGame(page: Page): Promise<void> {
  await expect(page.locator('#sdw-boot')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('canvas').first()).toBeVisible();
}

async function distanceMetres(page: Page): Promise<number> {
  const text = await page.locator('.sdw-hud--stats').innerText();
  const match = text.match(/^(\d+)\s+m/);
  if (!match) throw new Error(`distance missing from HUD: ${text}`);
  return Number(match[1]);
}

function resultValue(root: Locator, label: string): Locator {
  return root.getByText(label, { exact: true }).locator('..').locator('div').nth(1);
}

async function beginRun(page: Page): Promise<void> {
  const readyPrompt = page.getByText('USE A CONTROL TO DRIVE', { exact: true });
  if (!(await readyPrompt.isVisible())) return;

  // Keep the control held until an animation frame consumes it. A fast key press
  // can otherwise complete between frames and correctly leave the ready gate up.
  await page.keyboard.down('f');
  await expect(readyPrompt).toBeHidden();
  await page.keyboard.up('f');
}

test.describe('desktop smoke and menus', () => {
  test('loads the production build and removes the boot screen', async ({ page }) => {
    await bootGame(page);

    await expect(page).toHaveTitle('Survivor Drive');
    await expect(page.locator('.sdw-boot[data-state="error"]')).toHaveCount(0);
    await expect(page.locator('body > canvas')).toHaveCount(1);
    await expect(page.locator('.sdw-hud')).toHaveCount(2);
    await expect(page.locator('.sdw-touch-controls')).toHaveCount(1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForGame(page);
    await expect(page.locator('body > canvas')).toHaveCount(1);
    await expect(page.locator('.sdw-hud')).toHaveCount(2);
    await expect(page.locator('.sdw-touch-controls')).toHaveCount(1);
  });

  test('the first visit stays at zero until input and then advances', async ({ page }) => {
    await bootGame(page);
    const readyPrompt = page.getByText('USE A CONTROL TO DRIVE', { exact: true });
    await expect(readyPrompt).toBeVisible();
    await expect.poll(() => distanceMetres(page)).toBe(0);

    // This wait is the behavior under test: wall-clock time alone must not move
    // the simulation while the one-time ready gate is visible.
    await page.waitForTimeout(750);
    await expect.poll(() => distanceMetres(page)).toBe(0);

    await beginRun(page);
    await expect.poll(() => distanceMetres(page), { timeout: 5_000 }).toBeGreaterThan(0);
  });

  test('pause, settings, and garage work with keyboard and buttons', async ({ page }) => {
    await bootGame(page);
    await beginRun(page);

    await page.keyboard.press('Escape');
    const pause = page.getByRole('dialog', { name: 'Pause menu' });
    await expect(pause).toBeVisible();
    await expect(pause.getByRole('button', { name: 'Resume' })).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(pause.getByRole('button', { name: 'Settings' })).toBeFocused();

    await pause.getByRole('button', { name: 'Settings' }).click();
    await expect(pause.getByText('SETTINGS', { exact: true })).toBeVisible();
    const firstSetting = pause
      .getByRole('group', { name: 'Graphics' })
      .getByRole('button', { name: 'Low' });
    await expect(firstSetting).toBeFocused();

    await pause
      .getByRole('group', { name: 'Reduced motion' })
      .getByRole('button', { name: 'On' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');

    await pause.getByRole('button', { name: 'Back' }).click();

    await pause.getByRole('button', { name: 'Garage' }).click();
    const garage = page.getByRole('dialog', { name: 'Garage' });
    const resumeRun = garage.getByRole('button', { name: 'Resume the current run' });
    await expect(garage).toBeVisible();
    await expect(resumeRun).toBeFocused();
    await expect(garage.locator('.sdw-garage__lcd').first()).toHaveCSS('animation-name', 'none');
    await expect(garage.locator('.sdw-garage__bar-fill').first()).toHaveCSS(
      'transition-duration',
      '0s',
    );
    await page.keyboard.press('Shift+Tab');
    await expect
      .poll(() => garage.evaluate((root) => root.contains(document.activeElement)))
      .toBe(true);

    await resumeRun.click();
    await expect(garage).toBeHidden();
    await expect(pause).toBeHidden();
  });

  test('losing window focus pauses an active run once', async ({ page }) => {
    await bootGame(page);
    await beginRun(page);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const pause = page.getByRole('dialog', { name: 'Pause menu' });
    await expect(pause).toBeVisible();
    await expect(pause.getByRole('button', { name: 'Resume' })).toBeFocused();

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(pause).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Pause menu' })).toHaveCount(1);
  });

  test('stays within the render budget after the debug-overlay warmup', async ({ page }) => {
    await bootGame(page);
    await beginRun(page);

    await page.keyboard.press('Escape');
    const pause = page.getByRole('dialog', { name: 'Pause menu' });
    await pause.getByRole('button', { name: 'Settings' }).click();
    await pause
      .getByRole('group', { name: 'Debug overlay' })
      .getByRole('button', { name: 'On' })
      .click();
    await pause.getByRole('button', { name: 'Back' }).click();
    await pause.getByRole('button', { name: 'Resume' }).click();

    const overlay = page.locator('.sdw-debug-overlay');
    await expect(overlay).toBeVisible();
    await expect.poll(() => overlay.innerText(), { timeout: 10_000 }).toMatch(/draws\s+\d+/);

    const readout = await overlay.innerText();
    const budget = readout.match(/draws\s+(\d+)\s+tris\s+(\d+)k/);
    expect(budget, `unexpected debug readout: ${readout}`).not.toBeNull();
    expect(Number(budget?.[1])).toBeLessThanOrEqual(150);
    expect(Number(budget?.[2])).toBeLessThanOrEqual(200);
  });

  test('seed 424242 reaches a complete wreck report and retries the same road', async ({
    context,
    page,
  }) => {
    test.setTimeout(60_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: APP_ORIGIN,
    });
    await bootGame(page);
    await beginRun(page);

    const garage = page.getByRole('dialog', { name: 'Garage' });
    await expect(garage.getByText('WRECKED', { exact: true })).toBeVisible({ timeout: 45_000 });
    const radio = page.locator('.sdw-radio-subtitle');
    const radioText = radio.locator('span').last();
    await expect(radio).toBeVisible();
    await expect(radio).toHaveCSS('z-index', '26');
    await expect(radioText).not.toHaveText('');

    const status = garage.locator('.sdw-garage__status');
    await expect(resultValue(status, 'ACT')).toHaveText('OUTBREAK');
    await expect(resultValue(status, 'SEED')).toHaveText('424242');
    await expect(resultValue(status, 'PEAK MULTI')).toHaveText(/×\d+/);
    await expect(resultValue(status, 'BEST')).toHaveText('NEW RECORD');

    const copy = status.locator('button');
    await expect(copy).toHaveText('COPY RUN LINK');
    await copy.click();
    await expect(copy).toHaveText('COPIED');
    const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(copiedUrl).searchParams.get('seed')).toBe('424242');

    await garage.getByRole('button', { name: 'Play again with the selected build' }).click();
    await expect(garage).toBeHidden();
    expect(new URL(page.url()).searchParams.get('seed')).toBe('424242');
    await expect
      .poll(async () => ({
        text: (await radioText.textContent())?.trim() ?? '',
        zIndex: await radio.evaluate((element) => getComputedStyle(element).zIndex),
      }))
      .toEqual({ text: '', zIndex: '21' });
  });
});

test.describe('mobile controls', () => {
  test.use({
    viewport: PHONE.viewport,
    userAgent: PHONE.userAgent,
    deviceScaleFactor: PHONE.deviceScaleFactor,
    isMobile: PHONE.isMobile,
    hasTouch: PHONE.hasTouch,
  });

  test('shows usable touch controls in a phone viewport', async ({ page }) => {
    await bootGame(page);

    const touchControls = page.locator('.sdw-touch-controls');
    await expect(touchControls).toHaveAttribute('data-active', 'true');
    for (const name of ['Pause', 'Steer left', 'Steer right', 'Jump', 'Fire gun']) {
      await expect(touchControls.getByRole('button', { name })).toBeVisible();
    }

    const readyPrompt = page.getByText('USE A CONTROL TO DRIVE', { exact: true });
    await expect(readyPrompt).toBeVisible();
    const fire = touchControls.getByRole('button', { name: 'Fire gun' });
    const box = await fire.boundingBox();
    expect(box).not.toBeNull();
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        {
          x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
          y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
        },
      ],
    });
    try {
      await expect(readyPrompt).toBeHidden();
    } finally {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    }

    await touchControls.getByRole('button', { name: 'Pause' }).tap();
    await expect(page.getByRole('dialog', { name: 'Pause menu' })).toBeVisible();
    await expect(touchControls).toHaveAttribute('aria-hidden', 'true');
  });
});
