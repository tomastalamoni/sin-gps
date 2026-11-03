import { expect, test } from './fixtures';

interface ManifestIcon {
  src: string;
  sizes: string;
  purpose?: string;
}

test('el manifiesto describe una app instalable bajo la base del deploy', async ({
  request,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Falta baseURL en playwright.config.ts');
  const basePath = new URL(baseURL).pathname;

  const response = await request.get('manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Record<string, unknown> & { icons: ManifestIcon[] };

  expect(manifest).toMatchObject({
    name: 'Sin GPS',
    lang: 'es-AR',
    display: 'standalone',
    orientation: 'portrait',
    id: basePath,
    start_url: basePath,
    scope: basePath,
  });
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  // vite preview responde 200 con index.html si el archivo no existe: hay que mirar el tipo.
  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.headers()['content-type'], icon.src).toBe('image/png');
  }
});

test('el HTML enlaza el ícono y las pantallas de carga del iPhone', async ({ page, request }) => {
  await page.goto('./');
  const hrefs = await page
    .locator('link[rel="apple-touch-icon"], link[rel="apple-touch-startup-image"]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));

  expect(hrefs.length).toBeGreaterThan(1);
  for (const href of hrefs) {
    expect((await request.get(href)).headers()['content-type'], href).toBe('image/png');
  }
});
