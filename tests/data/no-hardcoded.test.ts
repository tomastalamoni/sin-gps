/**
 * Guardia de CLAUDE.md: ningún nombre de calle o hito de public/data aparece escrito en src/.
 * Los comentarios no cuentan: los ejemplos del plan ("Cabildo 2400") explican el código.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LandmarksFile, StreetsFile } from '../../src/engine/data';

const DIR = 'public/data';
const read = (name: string): unknown => JSON.parse(readFileSync(join(DIR, name), 'utf8'));

/** Palabras comunes que también son nombres de calle: en el código son texto, no datos. */
const COMMON_WORDS = new Set(['Plaza', 'Calle', 'Mapa', 'Inicio']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');
}

describe.skipIf(!existsSync(join(DIR, 'calles.json')))('nombres en el código', () => {
  const { streets } = read('calles.json') as StreetsFile;
  const { landmarks } = read('hitos.json') as LandmarksFile;
  const names = new Set(
    [...streets.flatMap((s) => [s.name, s.short]), ...landmarks.map((l) => l.name)].filter(
      (name) => name.length >= 5 && !COMMON_WORDS.has(name),
    ),
  );

  it('ningún nombre de calle ni de hito está escrito a mano en src/', () => {
    const found: string[] = [];
    for (const file of sourceFiles('src')) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const name of names) {
        if (!source.includes(name)) continue;
        const pattern = new RegExp(`(^|[^\\p{L}])${RegExp.escape(name)}($|[^\\p{L}])`, 'u');
        if (pattern.test(source)) found.push(`${file}: ${name}`);
      }
    }
    expect(found).toEqual([]);
  });
});
