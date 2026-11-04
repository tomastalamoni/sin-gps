import { expect, expectTouchTargets, test } from './fixtures';

test('el inicio muestra la app, el estado sin internet y los créditos', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { level: 1, name: 'Sin GPS' })).toBeVisible();
  await expect(page.getByText(/para usar sin internet/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mapa' })).toBeVisible();
  await expect(page.getByRole('link', { name: '© OpenStreetMap contributors' })).toHaveAttribute(
    'href',
    'https://www.openstreetmap.org/copyright',
  );
  await expect(page.getByRole('link', { name: 'Datos: Buenos Aires Data (GCBA)' })).toBeVisible();
});

test('no hay scroll horizontal, ni con el texto al 200%', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  for (const fontSize of ['100%', '200%']) {
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, fontSize);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `desborde con el texto al ${fontSize}`).toBeLessThanOrEqual(0);
  }
});

test('todo lo que se toca en el inicio mide 48 × 48 px o más', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectTouchTargets(page);
});
