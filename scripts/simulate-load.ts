/**
 * Calcula los minutos diarios de cada opción de calles nuevas y escribe public/data/carga.json.
 * Uso: npm run data:load (después de data:build: depende de cuántas tarjetas hay).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { barrioInfos } from '../src/engine/barrios';
import type {
  GraphFile,
  LandmarksFile,
  RailFile,
  SegmentsFile,
  StreetsFile,
} from '../src/engine/data';
import { RoadGraph } from '../src/engine/graph';
import { barrierCardsOf } from '../src/engine/lessons';
import { graphInputFromFiles } from '../src/engine/load';
import { buildCurriculum } from '../src/engine/srs/curriculum';
import { computeLoad } from '../src/engine/srs/load';
import { createSrs } from '../src/engine/srs/scheduler';

const DIR = 'public/data';

async function read<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(DIR, name), 'utf8')) as T;
}

const segments = await read<SegmentsFile>('tramos.json');
const graph = new RoadGraph(graphInputFromFiles(segments, await read<GraphFile>('grafo.json')));
const { streets } = await read<StreetsFile>('calles.json');
const { landmarks } = await read<LandmarksFile>('hitos.json');
const { lines } = await read<RailFile>('vias.json');
const barriers = await read<GeoJSON.FeatureCollection>('barreras.json');
const barrios = barrioInfos(await read<GeoJSON.FeatureCollection>('barrios.json'));

const lessons = buildCurriculum(
  { graph, streets, landmarks, barrios, rail: lines, barrierCards: barrierCardsOf(barriers) },
  {},
);
const load = computeLoad(await createSrs(), lessons, streets);
await writeFile(join(DIR, 'carga.json'), `${JSON.stringify(load)}\n`, 'utf8');
for (const { newPerDay, minutes, peakMinutes } of load.options) {
  console.log(`${newPerDay} calles por día: ${minutes} min, ${peakMinutes} min el día más cargado`);
}
