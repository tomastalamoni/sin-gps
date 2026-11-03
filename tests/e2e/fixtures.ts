import { test as base, expect, type Page } from '@playwright/test';

/** Todos los tests fallan si la página escribe errores en la consola o tira excepciones. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      await use(errors);
      expect(errors, 'errores en la consola').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Espera a que el mapa haya terminado de dibujarse, glyphs incluidos. */
export const MAP_READY = '[data-map-state="ready"]';

/** Todo lo que se toca mide 48 × 48 px o más (CLAUDE.md). */
export async function expectTouchTargets(page: Page): Promise<void> {
  const targets = await page.locator('a:visible, button:visible').all();
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    const box = await target.boundingBox();
    if (!box) continue;
    const name = (await target.getAttribute('aria-label')) ?? (await target.textContent()) ?? '';
    expect.soft(box.height, `alto de "${name}"`).toBeGreaterThanOrEqual(48);
    expect.soft(box.width, `ancho de "${name}"`).toBeGreaterThanOrEqual(48);
  }
}
