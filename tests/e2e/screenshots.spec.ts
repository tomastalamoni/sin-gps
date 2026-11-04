import { readFileSync } from 'node:fs';
import { expect, MAP_READY, test } from './fixtures';

const { streets } = JSON.parse(readFileSync('public/data/calles.json', 'utf8')) as {
  streets: { name: string; askable: boolean; importance: number }[];
};
const { center } = JSON.parse(readFileSync('public/data/meta.json', 'utf8')) as {
  center: [number, number];
};
// La calle más importante, para mostrar su ficha.
const street = {
  ...[...streets].filter((s) => s.askable).sort((a, b) => b.importance - a.importance)[0],
  name:
    [...streets].filter((s) => s.askable).sort((a, b) => b.importance - a.importance)[0]?.name ??
    '',
  point: center,
};

// Capturas para la revisión visual al cerrar cada fase. Quedan en test-results/capturas.
test.skip(Boolean(process.env.CI), 'Las capturas son para la revisión visual local');
// Recorre varias pantallas y sin GPU el mapa tarda en dibujar.
test.setTimeout(90_000);

for (const colorScheme of ['light', 'dark'] as const) {
  test(`capturas en modo ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
    page,
  }, testInfo) => {
    const prefix = `test-results/capturas/${testInfo.project.name}-${colorScheme}`;
    await page.emulateMedia({ colorScheme });

    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${prefix}-inicio.png` });

    await page.getByRole('link', { name: 'Mapa' }).click();
    await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${prefix}-mapa.png` });

    // Acercado, con flechas y nombres, y con la ficha de la calle más importante.
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('searchbox').fill(street.name);
    await page.screenshot({ path: `${prefix}-buscador.png` });
    await page.getByRole('dialog', { name: 'Buscar' }).getByRole('button').nth(1).click();
    await expect(page.getByRole('dialog', { name: street.name })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${prefix}-ficha.png` });
    await page.getByRole('button', { name: 'Reportar un error' }).click();
    await page.screenshot({ path: `${prefix}-reporte.png` });
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    const [lng, lat] = street.point;
    await page.goto(`./#/mapa/${String(lng)},${String(lat)},16`);
    await page.waitForTimeout(500);
    await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${prefix}-mapa-cerca.png` });

    await page.goto('./#/verificar');
    await expect(page.getByRole('heading', { level: 1, name: 'Para verificar' })).toBeVisible();
    await page.screenshot({ path: `${prefix}-verificar.png` });
  });
}
