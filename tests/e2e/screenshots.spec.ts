import { expect, MAP_READY, test } from './fixtures';

// Capturas para la revisión visual al cerrar cada fase. Quedan en test-results/capturas.
test.skip(Boolean(process.env.CI), 'Las capturas son para la revisión visual local');

for (const colorScheme of ['light', 'dark'] as const) {
  test(`capturas en modo ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
    page,
  }, testInfo) => {
    const prefix = `test-results/capturas/${testInfo.project.name}-${colorScheme}`;
    await page.emulateMedia({ colorScheme });

    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${prefix}-inicio.png` });

    await page.getByRole('link', { name: 'Ver mapa de prueba' }).click();
    await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${prefix}-mapa.png` });
  });
}
