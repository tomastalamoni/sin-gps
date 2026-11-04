import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// En GitHub Pages la app vive en /<repo>/; en local, en la raíz.
const base = process.env.BASE_PATH ?? '/';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/** Commit corto para mostrar en la app: el de la CI o el del repo local. */
function shortCommit(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'local';
  }
}

const PAGE_LIGHT = '#f8fafc';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __COMMIT__: JSON.stringify(shortCommit()),
  },
  // MapLibre crea su worker como módulo.
  worker: { format: 'es' },
  // MapLibre pesa 1 MB por sí solo; va en su propio chunk y se carga recién en el mapa.
  build: { chunkSizeWarningLimit: 1100 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // Los íconos ya entran por globPatterns; así no quedan repetidos en el precache.
      includeManifestIcons: false,
      manifest: {
        id: base,
        name: 'Sin GPS',
        short_name: 'Sin GPS',
        description:
          'Aprendé las calles, sentidos y alturas del norte de CABA para manejar sin GPS.',
        lang: 'es-AR',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: PAGE_LIGHT,
        theme_color: PAGE_LIGHT,
        categories: ['education', 'navigation'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Todo lo que la app necesita sin internet: código, datos, glyphs, íconos y licencias.
        // El manifiesto (webmanifest) lo agrega el plugin por su cuenta.
        globPatterns: ['**/*.{js,mjs,css,html,json,pbf,png,svg,ico,txt,md}'],
        // Las pantallas de carga las baja el iPhone al instalar la app; después no se piden.
        globIgnores: ['**/apple-splash-*.png'],
        // Workbox saltea sin fallar lo que supera este tamaño: un test e2e controla que no falte nada.
        maximumFileSizeToCacheInBytes: 1024 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Al instalarse por primera vez, el service worker toma la página abierta. Sin esto, la app
        // que sigue en memoria en el iPhone pediría el mapa a la red aunque ya esté todo guardado.
        // Las actualizaciones siguen esperando a que el usuario toque "Actualizar".
        clientsClaim: true,
      },
    }),
  ],
});
