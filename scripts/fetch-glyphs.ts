/**
 * Baja los glyphs (PBF) con los que MapLibre escribe las etiquetas del mapa sin internet.
 *
 * Origen: protomaps/basemaps-assets, fijado a un commit. Son de Noto Sans, con licencia
 * SIL Open Font License 1.1, que se copia a public/fonts/OFL.txt.
 * Cada archivo se verifica con su SHA-256: si el origen cambia, el script falla.
 *
 * Uso: npm run fonts
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const COMMIT = '028c18f713baecad011301ff7a69acc39bcc2ae7';
const SOURCE = `https://raw.githubusercontent.com/protomaps/basemaps-assets/${COMMIT}/fonts`;
const OUT_DIR = 'public/fonts';

interface GlyphFile {
  /** Ruta en el repositorio de origen, sin codificar. */
  source: string;
  /** Ruta dentro de public/fonts. Va sin espacios para que coincida tal cual con el precache. */
  target: string;
  sha256: string;
}

// Rangos: 0-255 es latín básico y Latin-1 (tildes, ñ, ü, ¿, ¡); 8192-8447, comillas y guiones
// tipográficos. Si una etiqueta usa un carácter fuera de estos rangos, MapLibre pide otro archivo.
const FILES: GlyphFile[] = [
  {
    source: 'Noto Sans Regular/0-255.pbf',
    target: 'noto-sans-regular/0-255.pbf',
    sha256: '62c6d49b15fa836eb6aa45e259c7ca6762f44b011b09e47776efbe4a6db1b397',
  },
  {
    source: 'Noto Sans Regular/8192-8447.pbf',
    target: 'noto-sans-regular/8192-8447.pbf',
    sha256: '8ea977a587352fe31b4159ffdbc9a40be79056f2472017c742ea1e4a931864b9',
  },
  {
    source: 'Noto Sans Medium/0-255.pbf',
    target: 'noto-sans-medium/0-255.pbf',
    sha256: 'ba2f0118dd024e3041b158e5f9eb49bc0a658019f53f458e9f5c0b8efcd79b91',
  },
  {
    source: 'Noto Sans Medium/8192-8447.pbf',
    target: 'noto-sans-medium/8192-8447.pbf',
    sha256: 'cc38e4956207f0edba1aaf749b61e8f6f1678ef1ad443d32ee285b21d0eb67aa',
  },
  {
    source: 'OFL.txt',
    target: 'OFL.txt',
    sha256: '7713cfc8e3c36d5ec4aa3d6cffe7500a1b3310f8a86d914b8ea09c2a9dee7c2d',
  },
];

async function download(file: GlyphFile): Promise<void> {
  const url = `${SOURCE}/${file.source.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo bajar ${url}: HTTP ${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== file.sha256) {
    throw new Error(`SHA-256 distinto en ${file.source}: esperaba ${file.sha256}, llegó ${hash}`);
  }

  const path = join(OUT_DIR, file.target);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  console.log(`${path} (${bytes.byteLength} bytes)`);
}

for (const file of FILES) await download(file);
