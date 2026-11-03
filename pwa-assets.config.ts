/**
 * Íconos de la PWA y pantallas de carga del iPhone, generados desde public/logo.svg.
 * Uso: npm run icons. Los PNG van a git y los <link> que imprime se copian a index.html.
 */
import {
  createAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

const BRAND = '#0f766e';
const PAGE_LIGHT = '#f8fafc';
const PAGE_DARK = '#0b1220';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // El iPhone y Android recortan el ícono con su propia forma: necesitan fondo lleno.
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: BRAND } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: BRAND } },
    // iPhones con iOS actual. El generador hace también las horizontales; quedan sin uso.
    appleSplashScreens: createAppleSplashScreens(
      {
        padding: 0.35,
        resizeOptions: { background: PAGE_LIGHT, fit: 'contain' },
        darkResizeOptions: { background: PAGE_DARK, fit: 'contain' },
        linkMediaOptions: { log: true, addMediaScreen: true, basePath: '/', xhtml: false },
        png: { compressionLevel: 9, quality: 60 },
      },
      [
        'iPhone 17 Pro Max',
        'iPhone 17 Pro',
        'iPhone Air',
        'iPhone 17',
        'iPhone 16 Pro Max',
        'iPhone 16 Pro',
        'iPhone 16 Plus',
        'iPhone 16',
        'iPhone 16e',
        'iPhone 15 Pro Max',
        'iPhone 15 Pro',
        'iPhone 15 Plus',
        'iPhone 15',
        'iPhone 14 Pro Max',
        'iPhone 14 Pro',
        'iPhone 14 Plus',
        'iPhone 14',
        'iPhone 13 Pro Max',
        'iPhone 13 Pro',
        'iPhone 13',
        'iPhone 13 mini',
        'iPhone 12 Pro Max',
        'iPhone 12 Pro',
        'iPhone 12',
        'iPhone 12 mini',
        'iPhone 11 Pro Max',
        'iPhone 11 Pro',
        'iPhone 11',
        'iPhone SE 4.7"',
      ],
    ),
  },
  images: ['public/logo.svg'],
});
