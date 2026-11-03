import { expect, expectTouchTargets, MAP_READY, test } from './fixtures';

test('el mapa de prueba se dibuja con los glyphs locales', async ({ page }) => {
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
  await page.getByRole('link', { name: 'Ver mapa de prueba' }).click();
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });

  expect(notGlyphs, 'glyphs que llegaron como HTML').toEqual([]);
  expect([...glyphs].sort()).toEqual([
    'noto-sans-medium/0-255',
    'noto-sans-medium/8192-8447',
    'noto-sans-regular/0-255',
    'noto-sans-regular/8192-8447',
  ]);

  await expectTouchTargets(page);

  await page.getByRole('link', { name: 'Volver' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sin GPS' })).toBeVisible();
});
