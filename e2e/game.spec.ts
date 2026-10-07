import { expect, test, type Page } from '@playwright/test';

// Fail any test that logs a console error or throws.
test.beforeEach(async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e)));
  testInfo.attach('problems', { body: '' });
  (page as Page & { problems: string[] }).problems = problems;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { problems: string[] }).problems).toEqual([]);
});

const overlay = (page: Page) => page.locator('#overlay');

/** The game, exposed by ?debug. */
type Debug = {
  zeno: {
    state: string;
    onGround: boolean;
    duckHeld: boolean;
    instantCharge: number;
    instantLeft: number;
    events: { onInstant(charge: number, active: boolean): void };
  };
};
const decimal = (page: Page) => page.locator('#decimal');

test('loads the title screen with fonts and a painted canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Zeno');
  await expect(overlay(page)).toContainText('Catch the tortoise');
  await expect(page.locator('#fraction')).toHaveText('0');
  expect(await page.evaluate(() => document.fonts.check('700 16px Cinzel'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('16px Silkscreen'))).toBe(true);

  // The sky should be painted clay orange.
  const [r, g, b, a] = await page.evaluate(() => {
    const c = document.getElementById('screen') as HTMLCanvasElement;
    return [...c.getContext('2d')!.getImageData(Math.floor(c.width * 0.2), Math.floor(c.height * 0.3), 1, 1).data];
  });
  expect(a).toBe(255);
  expect(r).toBeGreaterThan(180);
  expect(g).toBeGreaterThan(80);
  expect(b).toBeLessThan(90);
});

test('hides the touch zones with a mouse', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only');
  await page.goto('/');
  await expect(page.locator('.zones')).toBeHidden();
});

for (const size of [
  { width: 915, height: 412 }, // phone, landscape
  { width: 390, height: 844 }, // phone, portrait
  { width: 1366, height: 650 }, // short laptop
  { width: 1920, height: 1080 },
]) {
  test(`the whole game band fits on a ${size.width}×${size.height} screen`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    const box = await page.locator('#stage').boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    expect(box!.width).toBeGreaterThan(size.width * 0.5);
  });
}

test('does not scroll sideways', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('Space starts a run and the gap starts closing', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Space');
    await expect(overlay(page)).toBeHidden();
    await expect(decimal(page)).not.toHaveText('0.0000');
  });

  test('P pauses and Space resumes', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyP');
    await expect(overlay(page)).toContainText('Paused');
    const frozen = await decimal(page).textContent();
    await page.waitForTimeout(500);
    await expect(decimal(page)).toHaveText(frozen!);
    await page.keyboard.press('Space');
    await expect(overlay(page)).toBeHidden();
    await expect(decimal(page)).not.toHaveText(frozen!);
  });

  test('losing focus pauses the run', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Space');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(overlay(page)).toContainText('Paused');
  });

  test('crashing shows the result, saves the best and allows a restart', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Space');
    // No input: Achilles runs into the first obstacle.
    await expect(overlay(page)).toContainText('The tortoise wins', { timeout: 10_000 });
    await expect(overlay(page)).toContainText(/Gap closed 0\.\d{4}/);
    const best = await page.evaluate(() => Number(localStorage.getItem('zeno.best')));
    expect(best).toBeGreaterThan(0);
    await expect(page.locator('#best')).not.toHaveText('0');

    // The vase has to finish breaking before a restart is accepted.
    await page.waitForTimeout(1100);
    await page.keyboard.press('Space');
    await expect(overlay(page)).toBeHidden();

    await page.reload();
    await expect(page.locator('#best')).toHaveText(/^0\.\d{4}/);
  });

  test('Shift does nothing until Instant is charged, then stops time', async ({ page }) => {
    await page.goto('/?debug');
    await page.keyboard.press('Space');
    const button = page.locator('#instant');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('ShiftLeft');
    expect(await page.evaluate(() => (window as unknown as Debug).zeno.instantLeft)).toBe(0);

    await page.evaluate(() => {
      const z = (window as unknown as Debug).zeno;
      z.instantCharge = 1;
      z.events.onInstant(1, false);
    });
    await expect(button).toHaveClass(/ready/);
    await expect(button).toHaveAttribute('aria-disabled', 'false');
    await page.keyboard.press('ShiftLeft');
    await expect(button).toHaveClass(/active/);
    expect(await page.evaluate(() => (window as unknown as Debug).zeno.instantLeft)).toBeGreaterThan(0);
    await expect(button).not.toHaveClass(/active/, { timeout: 3000 });
  });

  test('with reduced motion, the vase cracks but does not fly apart', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.keyboard.press('Space');
    await expect(overlay(page)).toContainText('The tortoise wins', { timeout: 10_000 });
    await expect(page.locator('#overlay .card')).not.toHaveClass(/after-shatter/);
    await expect(page.locator('#overlay .card')).toBeVisible();
  });

  test('M mutes, and the choice survives a reload', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('#mute');
    await expect(button).toHaveText('Sound on');
    await page.keyboard.press('KeyM');
    await expect(button).toHaveText('Sound off');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(button).toHaveText('Sound off');
    await button.click();
    await expect(button).toHaveText('Sound on');
    // The button gives focus back so Space still jumps instead of re-toggling.
    await page.keyboard.press('Space');
    await expect(button).toHaveText('Sound on');
    await expect(overlay(page)).toBeHidden();
  });
});

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  /** Dispatches a touch pointer event at a fraction of the stage's width. */
  async function touch(page: Page, type: 'pointerdown' | 'pointerup', xFraction: number, pointerId = 1) {
    await page.evaluate(
      ([type, xFraction, pointerId]) => {
        const stage = document.getElementById('stage')!;
        const r = stage.getBoundingClientRect();
        stage.dispatchEvent(
          new PointerEvent(type as string, {
            bubbles: true,
            cancelable: true,
            pointerType: 'touch',
            pointerId: pointerId as number,
            clientX: r.left + r.width * (xFraction as number),
            clientY: r.top + r.height / 2,
          }),
        );
      },
      [type, xFraction, pointerId] as const,
    );
  }

  const player = (page: Page) =>
    page.evaluate(() => {
      const z = (window as unknown as Debug).zeno;
      return { state: z.state, onGround: z.onGround, duckHeld: z.duckHeld };
    });

  test('holding the left side ducks without jumping; the right side jumps', async ({ page }) => {
    await page.goto('/?debug');
    await touch(page, 'pointerdown', 0.1); // any tap starts the run
    await touch(page, 'pointerup', 0.1);
    expect((await player(page)).state).toBe('running');

    await touch(page, 'pointerdown', 0.1);
    expect(await player(page)).toMatchObject({ onGround: true, duckHeld: true });
    await touch(page, 'pointerup', 0.1);
    expect(await player(page)).toMatchObject({ duckHeld: false });

    await touch(page, 'pointerdown', 0.8, 2);
    expect(await player(page)).toMatchObject({ onGround: false });
    await touch(page, 'pointerup', 0.8, 2);
  });

  test('the Instant button stops time without making Achilles jump', async ({ page }) => {
    await page.goto('/?debug');
    await page.locator('#stage').tap();
    await page.evaluate(() => {
      const z = (window as unknown as Debug).zeno;
      z.instantCharge = 1;
      z.events.onInstant(1, false);
    });
    await page.locator('#instant').tap();
    const z = await page.evaluate(() => {
      const z = (window as unknown as Debug).zeno;
      return { instantLeft: z.instantLeft, onGround: z.onGround };
    });
    expect(z.instantLeft).toBeGreaterThan(0);
    expect(z.onGround).toBe(true);
  });

  test('shows the touch zones', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.zone-duck')).toBeVisible();
    await expect(page.locator('.zone-jump')).toBeVisible();
  });

  test('shows touch instructions and starts on tap', async ({ page }) => {
    await page.goto('/');
    await expect(overlay(page)).toContainText('Tap to run');
    await expect(overlay(page)).toContainText('hold the left side to duck');
    await expect(page.locator('.hint')).toBeHidden();
    await page.locator('#stage').tap();
    await expect(overlay(page)).toBeHidden();
    await expect(decimal(page)).not.toHaveText('0.0000');
  });
});
