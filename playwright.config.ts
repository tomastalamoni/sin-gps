import { defineConfig, devices } from '@playwright/test';

// La misma base que en GitHub Pages: así los tests detectan URLs que no respetan BASE_URL.
const BASE_PATH = '/sin-gps/';
const PORT = 4173;
const isCI = Boolean(process.env.CI);

// MapLibre exige WebGL2. Las máquinas de la CI no tienen GPU, así que Chromium lo emula con
// SwiftShader; donde hay GPU, este flag no cambia nada.
const launchOptions = { args: ['--enable-unsafe-swiftshader'] };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'celu-390',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, launchOptions },
    },
    {
      name: 'celu-360',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 }, launchOptions },
    },
    // Aproximación a Safari del iPhone: solo verifica que el inicio cargue sin errores.
    {
      name: 'safari-390',
      use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } },
      testMatch: /home\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    env: { BASE_PATH },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
