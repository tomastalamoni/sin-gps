/**
 * Valida los datos ya exportados en public/data, leyéndolos igual que la app. Corre en la CI.
 * Uso: npm run data:validate
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphFile, SegmentsFile } from '../src/engine/data';
import { graphInputFromFiles } from '../src/engine/load';
import { OUT_DIR } from './config';
import { checkStatus, runChecks } from './lib/validate';

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(OUT_DIR, name), 'utf8')) as T;
}

const segments = await readJson<SegmentsFile>('tramos.json');
const graph = await readJson<GraphFile>('grafo.json');
const checks = runChecks(graphInputFromFiles(segments, graph), new Set(graph.junctions));
console.log(`Datos ${segments.version}`);
for (const c of checks) console.log(`  ${checkStatus(c).padEnd(9)} ${c.name}: ${c.detail}`);
const failed = checks.filter((c) => c.blocking && !c.passed);
if (failed.length > 0) {
  console.error(`Fallan ${failed.length} validaciones bloqueantes.`);
  process.exitCode = 1;
}
