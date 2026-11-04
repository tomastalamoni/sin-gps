import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, MAP_READY, test } from './fixtures';

interface Street {
  code: number;
  name: string;
  askable: boolean;
  importance: number;
  barrios: string[];
  stretches: { id: string; askable: boolean; dir: string; segments: number[] }[];
}

const { streets } = JSON.parse(readFileSync('public/data/calles.json', 'utf8')) as {
  streets: Street[];
};
const { lines } = JSON.parse(readFileSync('public/data/vias.json', 'utf8')) as {
  lines: { stretches: { id: string }[] }[];
};

// Una calle importante de mano única, para ver una lección con su sentido.
const street = [...streets]
  .filter((s) => s.askable && s.stretches.some((x) => x.askable && x.dir !== 'D'))
  .sort((a, b) => b.importance - a.importance)[0] as Street;
const stretch = street.stretches.find((x) => x.askable && x.dir !== 'D') as Street['stretches'][0];
const railCard = lines.flatMap((l) => l.stretches)[0]?.id ?? '';

test.skip(Boolean(process.env.CI), 'Las capturas son para la revisión visual local');
test.setTimeout(150_000);

/** Deja lista una sesión con los ítems que se quieren ver. */
async function seedSession(page: Page, items: unknown[]): Promise<void> {
  await page.evaluate(async (list) => {
    const open = indexedDB.open('sin-gps');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => {
        resolve(open.result);
      };
      open.onerror = () => {
        reject(new Error('No abrió la base'));
      };
    });
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const tx = database.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({
      key: 'session',
      value: {
        day,
        kind: 'short',
        seed: 7,
        items: list,
        index: 0,
        stats: { answered: 0, correct: 0, lessons: 0, missed: [] },
      },
    });
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    database.close();
  }, items);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`capturas de la sesión en modo ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
    page,
  }, testInfo) => {
    const prefix = `test-results/capturas/sesion-${testInfo.project.name}-${colorScheme}`;
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true });
    });

    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${prefix}-bienvenida.png` });
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Seguir' }).click();
    await page.screenshot({ path: `${prefix}-seguridad.png` });
    await page.getByRole('button', { name: 'Entendido' }).click();
    await page.screenshot({ path: `${prefix}-barrio.png` });
    await page.getByRole('list').getByRole('button').nth(4).click();
    await page.screenshot({ path: `${prefix}-calles.png` });
    await page.getByRole('button', { name: /^4 calles/ }).click();

    await expect(page.getByRole('heading', { name: 'El río manda' })).toBeVisible();
    await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${prefix}-rumbos.png` });
    await page.getByRole('button', { name: 'Seguir' }).click();
    await page.getByRole('button', { name: 'Seguir' }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${prefix}-leccion-barrio.png` });
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Seguir' }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${prefix}-pregunta-barrio.png` });
    await page.locator('section ul button').first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${prefix}-resultado.png` });

    // Una lección de calle, con sus dos preguntas, y una de cruces.
    await seedSession(page, [
      {
        type: 'lesson',
        lesson: {
          kind: 'calle',
          id: `L:calle:${String(street.code)}`,
          street: street.code,
          cards: [`N:${String(street.code)}`, stretch.id],
          barrios: street.barrios,
        },
      },
      { type: 'review', card: `N:${String(street.code)}` },
      { type: 'review', card: stretch.id },
      { type: 'practice', card: `N:${String(street.code)}` },
      { type: 'review', card: railCard },
    ]);
    await page.reload();
    await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${prefix}-leccion-calle.png` });
    await page.getByRole('button', { name: 'Seguir' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${prefix}-encontrala.png` });
    const box = await page.locator(MAP_READY).boundingBox();
    if (!box) throw new Error('Sin mapa');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${prefix}-encontrala-acercada.png` });
    for (const offset of [0, 8, 16, 24, 32, 40, 48, 56]) {
      if (await page.getByRole('button', { name: 'Seguir' }).isVisible()) break;
      await page.mouse.click(box.x + box.width / 2 + offset, box.y + box.height / 2 + offset);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${prefix}-encontrala-resultado.png` });
    await page.getByRole('button', { name: 'Seguir' }).click();
    await expect(page.locator('[data-scene="question-2"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${prefix}-sentido.png` });
    await page.locator('section ul button').nth(2).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${prefix}-sentido-resultado.png` });
    await page.getByRole('button', { name: 'Seguir' }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${prefix}-practica.png` });
  });
}
