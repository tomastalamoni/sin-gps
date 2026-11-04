import { readFileSync } from 'node:fs';
import { expect, expectTouchTargets, MAP_READY, test } from './fixtures';

// Cargan el mapa más de una vez, y sin GPU tarda.
test.setTimeout(90_000);

interface Stretch {
  id: string;
  confidence: string;
  splitCarriageway: boolean;
}

interface Street {
  name: string;
  askable: boolean;
  importance: number;
  stretches: Stretch[];
}

// El tramo en duda de la calle más importante: lo elige el dato, no el test.
const { streets } = JSON.parse(readFileSync('public/data/calles.json', 'utf8')) as {
  streets: Street[];
};
const { version } = JSON.parse(readFileSync('public/data/meta.json', 'utf8')) as {
  version: string;
};
const candidates = streets
  .filter((s) => s.askable)
  .sort((a, b) => b.importance - a.importance)
  .flatMap((street) =>
    street.stretches
      .filter((s) => s.confidence === 'en-duda' && !s.splitCarriageway && /:\d+-\d+$/.test(s.id))
      .map((stretch) => ({ street, stretch })),
  );
const target = candidates[0];
if (!target) throw new Error('No hay tramos en duda');
const [, from, to] = /:(\d+)-(\d+)$/.exec(target.stretch.id) ?? [];
const heights = `${from ?? ''} a ${to ?? ''}`;

async function openStreet(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Buscar' }).click();
  const search = page.getByRole('dialog', { name: 'Buscar' });
  await search.getByRole('searchbox').fill(target?.street.name ?? '');
  await search
    .getByRole('button', { name: target?.street.name ?? '' })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: target?.street.name ?? '' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('un sentido reportado queda corregido después de recargar', async ({ page }) => {
  await page.goto('./#/mapa');
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });

  const sheet = await openStreet(page);
  await sheet.getByRole('button', { name: 'Reportar un error' }).click();

  const report = page.getByRole('dialog', { name: 'Reportar un error' });
  await expect(report.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  await report.getByRole('combobox', { name: 'Tramo' }).selectOption({ label: heights });
  await report.getByRole('radio', { name: 'Es doble mano' }).check();
  await expectTouchTargets(page);
  await report.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog', { name: 'Reporte guardado' })).toBeVisible({
    timeout: 20_000,
  });

  await page.reload();
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });
  const again = await openStreet(page);
  const item = again.getByRole('listitem').filter({ hasText: heights }).first();
  await expect(item).toContainText('Doble mano');
  await expect(item).toContainText('Corregido por vos');
});

test('un reporte de otra cosa pide una nota', async ({ page }) => {
  await page.goto('./#/mapa');
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });
  const sheet = await openStreet(page);
  await sheet.getByRole('button', { name: 'Reportar un error' }).click();
  const report = page.getByRole('dialog', { name: 'Reportar un error' });
  await report.getByRole('radio', { name: 'Otra cosa' }).check();
  await expect(report.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  await report.getByRole('textbox', { name: 'Contame qué viste' }).fill('Hay obras');
  await report.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog', { name: 'Reporte guardado' })).toBeVisible();
});

test('la lista para verificar corrige un tramo y lo saca de la lista', async ({ page }) => {
  await page.goto('./');
  await page.goto('./#/verificar');
  await expect(page.getByRole('heading', { level: 1, name: 'Para verificar' })).toBeVisible();

  const summary = page.getByText(/Tramos en duda o sin confirmar: \d+/);
  const before = Number(/\d+/.exec((await summary.textContent()) ?? '')?.[0]);
  await expectTouchTargets(page);
  await expect(page.getByRole('button', { name: /Exportar mis reportes \(0\)/ })).toBeDisabled();

  const first = page.getByRole('listitem').filter({ hasText: 'Lo vi:' }).first();
  await expect(first.getByRole('link', { name: 'Street View' })).toHaveAttribute(
    'href',
    /google\.com\/maps/,
  );
  await first.getByRole('button', { name: 'Es doble mano' }).click();
  await expect(page.getByText(/corregido/)).toBeVisible({ timeout: 20_000 });
  await expect(summary).toHaveText(new RegExp(`: ${String(before - 1)}\\.`));
  await expect(page.getByRole('button', { name: /Exportar mis reportes \(1\)/ })).toBeEnabled();
});

test('un doble toque en la lista responde un solo tramo', async ({ page }) => {
  await page.goto('./#/verificar');
  const summary = page.getByText(/Tramos en duda o sin confirmar: \d+/);
  await expect(summary).toBeVisible({ timeout: 20_000 });
  const before = Number(/\d+/.exec((await summary.textContent()) ?? '')?.[0]);
  const first = page.getByRole('listitem').filter({ hasText: 'Lo vi:' }).first();
  await first.getByRole('button', { name: 'Es doble mano' }).dblclick();
  await expect(page.getByText(/corregido/)).toBeVisible({ timeout: 20_000 });
  await expect(summary).toHaveText(new RegExp(`: ${String(before - 1)}\\.`));
  await expect(page.getByRole('button', { name: /Exportar mis reportes \(1\)/ })).toBeEnabled();
});

test('se puede reportar aunque el tramo tocado tenga calzadas separadas', async ({ page }) => {
  const split = streets
    .filter((s) => s.askable)
    .sort((a, b) => b.importance - a.importance)
    .find(
      (s) =>
        s.stretches.some((st) => st.splitCarriageway && /:\d+-\d+$/.test(st.id)) &&
        s.stretches.some((st) => !st.splitCarriageway),
    );
  if (!split) throw new Error('No hay calles con calzadas separadas');
  const stretch = split.stretches.find((st) => st.splitCarriageway && /:\d+-\d+$/.test(st.id));
  const height = Number(/:(\d+)-/.exec(stretch?.id ?? '')?.[1]) + 10;

  await page.goto('./#/mapa');
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Buscar' }).click();
  const search = page.getByRole('dialog', { name: 'Buscar' });
  await search.getByRole('searchbox').fill(`${split.name} ${String(height)}`);
  await search
    .getByRole('button', { name: new RegExp(String(height)) })
    .first()
    .click();
  await page.getByRole('button', { name: 'Reportar un error' }).click();

  const report = page.getByRole('dialog', { name: 'Reportar un error' });
  await report.getByRole('radio', { name: 'Es doble mano' }).check();
  await expect(report.getByRole('button', { name: 'Guardar' })).toBeEnabled();
});

test('si los datos no cargan, avisa y el inicio sigue andando', async ({ page, consoleErrors }) => {
  await page.route('**/data/calles.json', (route) => route.fulfill({ status: 500 }));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Sin GPS' })).toBeVisible();
  await page.getByRole('link', { name: 'Mapa' }).click();
  await expect(page.getByRole('heading', { name: 'Algo salió mal' })).toBeVisible();
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sin GPS' })).toBeVisible();
  // Acá los errores son esperados: se limpian cuando ya no queda nada por cargar.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  consoleErrors.length = 0;
});

test('la versión abre el diagnóstico con cinco toques', async ({ page }) => {
  await page.goto('./');
  const button = page.getByRole('button', { name: /^Versión/ });
  for (let i = 0; i < 5; i++) await button.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Diagnóstico' })).toBeVisible();
  await expect(page.getByText(version)).toBeVisible();
  await expect(page.getByText('No hubo errores.')).toBeVisible();
});
