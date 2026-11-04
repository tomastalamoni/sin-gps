import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, expectTouchTargets, MAP_READY, test } from './fixtures';

// Cargan el mapa más de una vez, y sin GPU tarda.
test.setTimeout(90_000);

interface Crossing {
  street: number;
  height: number;
}

interface Street {
  code: number;
  name: string;
  short: string;
  askable: boolean;
  importance: number;
  segments: number[];
  crossings: Crossing[];
}

// Todo sale de los datos: en los tests tampoco se escriben calles a mano.
const read = (name: string): unknown => JSON.parse(readFileSync(join('public/data', name), 'utf8'));
const { streets } = read('calles.json') as { streets: Street[] };
const segments = read('tramos.json') as { heights: number[]; geometry: number[][] };
const { landmarks } = read('hitos.json') as { landmarks: { name: string }[] };

const byImportance = streets.filter((s) => s.askable).sort((a, b) => b.importance - a.importance);
const street = byImportance[0] as Street;

function lineOf(t: number): [number, number][] {
  const encoded = segments.geometry[t] ?? [];
  const points: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    x += encoded[i] ?? 0;
    y += encoded[i + 1] ?? 0;
    points.push([x / 1e6, y / 1e6]);
  }
  return points;
}

/** Un punto en medio de la cuadra de dos puntos más larga de la calle. */
function middleOf(s: Street): [number, number] {
  const line = s.segments
    .map(lineOf)
    .filter((l) => l.length === 2)
    .sort((a, b) => {
      const size = (l: [number, number][]) =>
        Math.hypot((l[1]?.[0] ?? 0) - (l[0]?.[0] ?? 0), (l[1]?.[1] ?? 0) - (l[0]?.[1] ?? 0));
      return size(b) - size(a);
    })[0];
  if (!line) throw new Error(`${s.name} no tiene cuadras rectas`);
  const [[x0, y0], [x1, y1]] = line as [[number, number], [number, number]];
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

function heightOf(s: Street): number {
  for (const t of s.segments) {
    const [from = 0, to = 0] = segments.heights.slice(4 * t, 4 * t + 2);
    if (from > 0 && to - from >= 20) return from + 10;
  }
  throw new Error(`${s.name} no tiene alturas`);
}

function cornerOf(s: Street): string {
  const other = s.crossings
    .map((c) => streets.find((x) => x.code === c.street))
    .find((x) => x?.askable);
  if (!other) throw new Error(`${s.name} no tiene transversales`);
  return `${s.name} y ${other.name}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Mapa' }).click();
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });
});

test('tocar una calle abre su ficha', async ({ page }) => {
  const [lng, lat] = middleOf(street);
  await page.goto(`./#/mapa/${String(lng)},${String(lat)},17`);
  const map = page.getByRole('region', { name: 'Mapa de calles' });
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });

  const box = await map.boundingBox();
  if (!box) throw new Error('El mapa no tiene tamaño');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const sheet = page.getByRole('dialog', { name: street.name });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Sentido' })).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Ver en Street View' })).toHaveAttribute(
    'href',
    /google\.com\/maps/,
  );
  await expectTouchTargets(page);

  await sheet.getByRole('button', { name: 'Cerrar' }).click();
  await expect(sheet).toBeHidden();
});

test('busca una dirección y abre la ficha de la calle', async ({ page }) => {
  const height = heightOf(street);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const search = page.getByRole('dialog', { name: 'Buscar' });
  await search.getByRole('searchbox').fill(`${street.short} ${String(height)}`);
  await expectTouchTargets(page);
  await search
    .getByRole('button', { name: new RegExp(`${street.name} ${String(height)}`) })
    .click();

  const sheet = page.getByRole('dialog', { name: `${street.name} ${String(height)}` });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Transversales')).toBeVisible();
});

test('una búsqueda después de otra sigue moviendo el mapa', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  const search = page.getByRole('dialog', { name: 'Buscar' });
  await page.getByRole('button', { name: 'Buscar' }).click();
  await search.getByRole('searchbox').fill(`${street.short} ${String(heightOf(street))}`);
  await search
    .getByRole('button', { name: new RegExp(street.name) })
    .first()
    .click();
  await page
    .getByRole('dialog', { name: new RegExp(street.name) })
    .getByRole('button', { name: 'Cerrar' })
    .click();

  const other = byImportance[1] as Street;
  await page.getByRole('button', { name: 'Buscar' }).click();
  await search.getByRole('searchbox').fill(other.name);
  await search.getByRole('button', { name: other.name }).first().click();
  await expect(page.getByRole('dialog', { name: other.name })).toBeVisible();
  await page.waitForTimeout(800);
  expect(warnings.filter((w) => w.includes('cannot fit'))).toEqual([]);
});

test('busca una esquina', async ({ page }) => {
  const corner = cornerOf(street);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const search = page.getByRole('dialog', { name: 'Buscar' });
  await search.getByRole('searchbox').fill(corner);
  await search.getByRole('button', { name: corner }).first().click();

  const sheet = page.getByRole('dialog', { name: corner });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: street.name }).click();
  await expect(page.getByRole('dialog', { name: street.name })).toBeVisible();
});

test('busca un hito', async ({ page }) => {
  const landmark = landmarks[0]?.name ?? '';
  await page.getByRole('button', { name: 'Buscar' }).click();
  const search = page.getByRole('dialog', { name: 'Buscar' });
  await search.getByRole('searchbox').fill(landmark);
  await search.getByRole('button', { name: landmark }).first().click();
  await expect(page.getByRole('dialog', { name: landmark })).toBeVisible();
});

test('avisa cuando no encuentra nada', async ({ page }) => {
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('searchbox').fill('xqzxqz');
  await expect(page.getByText('No encontré nada')).toBeVisible();
});

test('las capas se prenden y se apagan', async ({ page }) => {
  await page.getByRole('button', { name: 'Capas' }).click();
  const panel = page.getByRole('dialog', { name: 'Capas' });
  await expectTouchTargets(page);
  const arrows = panel.getByRole('checkbox', { name: 'Flechas de sentido' });
  await expect(arrows).toBeChecked();
  await arrows.uncheck();
  await panel.getByRole('button', { name: 'Cerrar' }).click();
  await expect(panel).toBeHidden();

  // Sigue apagada al volver a la pestaña.
  await page.getByRole('link', { name: 'Inicio' }).click();
  await page.getByRole('link', { name: 'Mapa' }).click();
  await page.getByRole('button', { name: 'Capas' }).click();
  await expect(page.getByRole('checkbox', { name: 'Flechas de sentido' })).not.toBeChecked();
});

test('los créditos se ven en el mapa', async ({ page }) => {
  await expect(page.getByRole('link', { name: '© OpenStreetMap contributors' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Buenos Aires Data/ })).toBeVisible();
});
