import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, MAP_READY, test } from './fixtures';

// Lo que hay en dist/ y no va al precache: el service worker, su runtime y las pantallas de carga
// del iPhone, que iOS baja al instalar la app.
const NOT_PRECACHED = [/^sw\.js$/, /^workbox-[\w-]+\.js$/, /^apple-splash-.+\.png$/];

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
}

test('guarda todo para usar sin internet y anda en modo avión', async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Falta baseURL en playwright.config.ts');
  const basePath = new URL(baseURL).pathname;

  await page.goto('./');
  await expect(page.getByText('Lista para usar sin internet')).toBeVisible({ timeout: 30_000 });

  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });
  const cached = new Set(
    cachedUrls.map((url) => decodeURIComponent(new URL(url).pathname).slice(basePath.length)),
  );

  const expected = filesUnder('dist').filter((file) => !NOT_PRECACHED.some((re) => re.test(file)));
  expect(expected.length).toBeGreaterThan(0);
  expect(
    expected.filter((file) => !cached.has(file)),
    'archivos del build que faltan en el precache',
  ).toEqual([]);

  // El plan lo pide explícitamente para los datos y los glyphs.
  for (const dir of ['data', 'fonts']) {
    const missing = filesUnder(join('public', dir)).filter((file) => !cached.has(`${dir}/${file}`));
    expect(missing, `archivos de public/${dir} que faltan en el precache`).toEqual([]);
  }

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Sin GPS' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver mapa de prueba' }).click();
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });
});

// En el iPhone, al volver a tocar el ícono la app suele seguir en memoria y no se recarga:
// la misma página que hizo la instalación tiene que poder abrir el mapa sin internet.
test('sin recargar, el mapa abre sin internet apenas dice "Lista"', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByText('Lista para usar sin internet')).toBeVisible({ timeout: 30_000 });

  await context.setOffline(true);
  await page.getByRole('link', { name: 'Ver mapa de prueba' }).click();
  await expect(page.locator(MAP_READY)).toBeVisible({ timeout: 30_000 });
});

test('si la primera instalación falla, lo dice y deja reintentar', async ({ page, context }) => {
  // Si un solo archivo del precache no llega, la instalación del service worker falla entera.
  await context.route('**/fonts/noto-sans-medium/0-255.pbf', (route) => route.abort());

  await page.goto('./');
  await expect(page.getByText('No se pudo guardar para usar sin internet.')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});
