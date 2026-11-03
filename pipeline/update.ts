/**
 * Actualización semestral (sección 8): vuelve a bajar todo, regenera los datos y el archivo de
 * cambios, y muestra qué sentidos cambiaron.
 * Uso: npm run data:update
 */
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR } from './config';
import type { ChangesFile } from './lib/changes';

function run(script: string, ...args: string[]): void {
  execFileSync(process.execPath, ['--import', 'tsx', script, ...args], { stdio: 'inherit' });
}

const before = new Set(await readdir(OUT_DIR).catch(() => []));
run('pipeline/01-download.ts', '--refresh');
run('pipeline/build.ts');

const created = (await readdir(OUT_DIR)).filter((f) => f.startsWith('cambios-') && !before.has(f));
if (created.length === 0) {
  console.log('\nLos datos no cambiaron.');
} else {
  for (const file of created) {
    const changes = JSON.parse(await readFile(join(OUT_DIR, file), 'utf8')) as ChangesFile;
    console.log(
      `\n${file}: ${changes.reset.length} tarjetas se reinician, ${changes.added.length} nuevas`,
    );
    for (const c of changes.directionChanges) {
      const note = c.askable ? '' : ' (por ahora no se pregunta)';
      console.log(`  Cambió el sentido: calle ${c.street} (${c.id}) ${c.from} → ${c.to}${note}`);
    }
    for (const r of changes.renamed) console.log(`  Cambió el nombre: ${r.from} → ${r.to}`);
  }
}
