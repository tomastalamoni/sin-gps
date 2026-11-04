import { expect, expectTouchTargets, MAP_READY, test } from './fixtures';

test('el mapa se dibuja con los glyphs locales', async ({ page }) => {
  const glyphs = new Set<string>();
  const notGlyphs: string[] = [];
  page.on('response', (response) => {
    const match = /\/fonts\/([^/]+)\/(\d+-\d+)\.pbf$/.exec(new URL(response.url()).pathname);
    if (!match || !response.ok()) return;
    // vite preview responde 200 con index.html si el archivo no existe: hay que mirar el tipo.
    if ((response.headers()['content-type'] ?? '').includes('text/html')) notGlyphs.push(match[0]);
    else glyphs.add(`${match[1] ?? ''}/${match[2] ?? ''}`);
  });

  await page.goto('./');
  await page.getByRole('link', { name: 'Mapa' }).click();
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });

  expect(notGlyphs, 'glyphs que llegaron como HTML').toEqual([]);
  expect([...glyphs].sort()).toContain('noto-sans-medium/0-255');

  await expectTouchTargets(page);

  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sin GPS' })).toBeVisible();
});
