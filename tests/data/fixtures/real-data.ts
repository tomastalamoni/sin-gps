/** Los datos reales de public/data, armados como en la app: para los tests que los recorren. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { barrioInfos } from '../../../src/engine/barrios';
import type {
  GraphFile,
  LandmarksFile,
  PatternsFile,
  RailFile,
  SegmentsFile,
  StreetsFile,
} from '../../../src/engine/data';
import { RoadGraph } from '../../../src/engine/graph';
import { graphInputFromFiles } from '../../../src/engine/load';
import type { QuizData } from '../../../src/engine/quiz';

const DIR = 'public/data';

export const hasData = existsSync(join(DIR, 'tramos.json'));

export function read(name: string): unknown {
  return JSON.parse(readFileSync(join(DIR, name), 'utf8'));
}

export function loadRealData(): QuizData & { patterns: PatternsFile['patterns'] } {
  const segments = read('tramos.json') as SegmentsFile;
  const barriosFile = read('barrios.json') as GeoJSON.FeatureCollection;
  return {
    graph: new RoadGraph(graphInputFromFiles(segments, read('grafo.json') as GraphFile)),
    streets: (read('calles.json') as StreetsFile).streets,
    landmarks: (read('hitos.json') as LandmarksFile).landmarks,
    barrios: barrioInfos(barriosFile),
    barriosFile,
    barriers: read('barreras.json') as GeoJSON.FeatureCollection,
    rail: read('vias.json') as RailFile,
    patterns: (read('patrones.json') as PatternsFile).patterns,
  };
}
