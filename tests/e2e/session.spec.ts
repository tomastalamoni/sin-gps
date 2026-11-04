import type { Page } from '@playwright/test';
import { expect, MAP_READY, test } from './fixtures';

// Con el mapa cargado dos veces y sin GPU, una sesión lleva su tiempo.
test.setTimeout(120_000);

/** La app abierta desde el ícono: en el navegador solo se muestra cómo instalarla. */
async function asInstalled(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
  });
}

async function completeOnboarding(page: Page): Promise<void> {
  await page.goto('./');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Seguir' }).click();
  await page.getByRole('button', { name: 'Entendido' }).click();
  await page.getByRole('list').getByRole('button').first().click();
  await page.getByRole('button', { name: /^4 calles/ }).click();
}

const SUMMARY = /Listo por ahora/;

/** Responde lo que aparezca hasta terminar la sesión: elige la primera opción o toca el mapa. */
async function playUntilSummary(page: Page, maxSteps = 60): Promise<void> {
  const summary = page.getByRole('heading', { name: SUMMARY });
  for (let step = 0; step < maxSteps; step++) {
    if (await summary.isVisible()) return;
    const next = page.getByRole('button', { name: 'Seguir', exact: true });
    if (await next.isVisible()) {
      await next.click({ timeout: 3000 }).catch(() => undefined);
      continue;
    }
    const option = page.locator('section ul button').first();
    if (await option.isVisible()) {
      await option.click({ timeout: 3000 }).catch(() => undefined);
      continue;
    }
    const map = page.locator(MAP_READY);
    if (await map.isVisible()) {
      const box = await map.boundingBox();
      if (box) {
        const x = box.x + box.width * (0.3 + 0.05 * (step % 8));
        const y = box.y + box.height * (0.3 + 0.05 * (step % 6));
        await page.mouse.click(x, y);
      }
    }
    await page.waitForTimeout(300);
  }
  throw new Error('La sesión no terminó');
}

test('en el navegador solo muestra cómo instalarla', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Instalala en el celu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeHidden();
});

test('primer uso completo: del ícono a la primera lección', async ({ page }) => {
  await asInstalled(page);
  await completeOnboarding(page);
  await expect(page.getByRole('heading', { name: 'El río manda' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden();
  await playUntilSummary(page);
  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await expect(page.getByRole('heading', { name: /Repaso del día|Por hoy/ })).toBeVisible();
});

test('al terminar una sesión se puede seguir con la próxima', async ({ page }) => {
  await asInstalled(page);
  await completeOnboarding(page);
  await playUntilSummary(page);
  await page.getByRole('button', { name: /^Seguir: faltan/ }).click();
  await expect(page.getByRole('heading', { name: SUMMARY })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
});

test('el primer uso no vuelve a aparecer después de recargar', async ({ page }) => {
  await asInstalled(page);
  await completeOnboarding(page);
  await expect(page.getByRole('heading', { name: 'El río manda' })).toBeVisible();
  await page.goto('./');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Seguir donde estabas' })).toBeVisible({
    timeout: 30_000,
  });
});

test('una sesión cortada sigue donde estaba', async ({ page }) => {
  await asInstalled(page);
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Seguir' }).click();
  await page.getByRole('button', { name: 'Seguir' }).click();
  // Terminó la lección de rumbos: va por la de barrios.
  await expect(page.getByText(/^Barrios/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^Barrios/)).toBeVisible();
});

test('lo respondido sigue ahí al volver a abrir', async ({ page }) => {
  await asInstalled(page);
  await completeOnboarding(page);
  await playUntilSummary(page);
  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await expect(page.getByText('Meta de hoy')).toBeVisible();
  const before = await page
    .getByRole('progressbar', { name: 'Meta de hoy' })
    .getAttribute('aria-valuenow');
  await page.reload();
  await expect(page.getByRole('progressbar', { name: 'Meta de hoy' })).toHaveAttribute(
    'aria-valuenow',
    before ?? '',
  );
  expect(Number(before)).toBeGreaterThan(0);
});

test('al día siguiente vuelven los repasos', async ({ page }) => {
  await asInstalled(page);
  await page.clock.install({ time: new Date('2026-11-05T12:00:00-03:00') });
  await completeOnboarding(page);
  await page.clock.resume();
  await playUntilSummary(page);
  await page.getByRole('button', { name: 'Volver al inicio' }).click();

  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00-03:00'));
  await page.reload();
  await expect(page.getByText(/repasos?/)).toBeVisible();
});
