/**
 * Valida los datos ya exportados en public/data, leyéndolos igual que la app. Corre en la CI.
 * Uso: npm run data:validate
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AddressBook } from '../src/engine/addresses';
import type {
  GraphFile,
  LandmarksFile,
  RailFile,
  SegmentsFile,
  StreetsFile,
} from '../src/engine/data';
import { RoadGraph } from '../src/engine/graph';
import { graphInputFromFiles } from '../src/engine/load';
import { OUT_DIR } from './config';
import { checkStatus, factsCheck, runChecks } from './lib/validate';

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(OUT_DIR, name), 'utf8')) as T;
}

const segments = await readJson<SegmentsFile>('tramos.json');
const graph = await readJson<GraphFile>('grafo.json');
const { streets } = await readJson<StreetsFile>('calles.json');
const { landmarks } = await readJson<LandmarksFile>('hitos.json');
const input = graphInputFromFiles(segments, graph);
const roadGraph = new RoadGraph(input);
const checks = [
  ...runChecks(input, new Set(graph.junctions)),
  factsCheck({
    graph: roadGraph,
    streets,
    addresses: new AddressBook(roadGraph, segments.heights, streets, landmarks),
    rail: await readJson<RailFile>('vias.json'),
    barrios: await readJson<GeoJSON.FeatureCollection>('barrios.json'),
  }),
];
console.log(`Datos ${segments.version}`);
for (const c of checks) console.log(`  ${checkStatus(c).padEnd(9)} ${c.name}: ${c.detail}`);
const failed = checks.filter((c) => c.blocking && !c.passed);
if (failed.length > 0) {
  console.error(`Fallan ${failed.length} validaciones bloqueantes.`);
  process.exitCode = 1;
}
