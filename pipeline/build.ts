/**
 * Corre el pipeline completo (pasos 2 a 13) con las fuentes ya bajadas y escribe public/data.
 * Si falla una validación bloqueante, no escribe nada: la app sigue con la versión anterior y el
 * reporte queda en pipeline/raw/reporte-ultimo.md.
 * Uso: npm run data:build
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AddressBook } from '../src/engine/addresses';
import type { LandmarksFile, SegmentsFile, StreetsFile } from '../src/engine/data';
import type { LngLat } from '../src/engine/geo';
import { computeNumbering, orientRows } from './02-numbering';
import { clip } from './03-clip';
import { orient } from './04-orient';
import { buildGraph } from './05-graph';
import type { NameOverride } from './06-names';
import { enrich } from './07-osm-enrich';
import { exportData } from './08-export';
import { OUT_DIR, RAW_DIR } from './config';
import { parseCallejero } from './lib/callejero';
import type { DataSnapshot } from './lib/changes';
import type { LandmarkOverride } from './lib/landmarks';
import { featuresOf, loadOsm, nodesOf, relationsOf, waysOf } from './lib/osm';
import type { OverridesFile } from './lib/overrides';
import { latestRaw, readManifest } from './lib/raw';
import { checkStatus, factsCheck, runChecks } from './lib/validate';

async function readRaw(name: string, ext: string): Promise<{ text: string; date: string }> {
  const raw = await latestRaw(name, ext);
  if (!raw) throw new Error(`Falta ${name}: corré npm run data:download`);
  return { text: await readFile(raw.path, 'utf8'), date: raw.date };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/** Lee un archivo de datos tal como está en el último commit, o undefined si no está. */
function published(name: string): unknown {
  try {
    const text = execFileSync('git', ['show', `HEAD:${OUT_DIR}/${name}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Los datos publicados: el archivo de cambios se calcula contra el último commit, no contra un
 * build anterior que nunca llegó a los celulares.
 */
function previousSnapshot(): DataSnapshot | undefined {
  const streets = published('calles.json') as StreetsFile | undefined;
  const segments = published('tramos.json') as SegmentsFile | undefined;
  const landmarks = published('hitos.json') as LandmarksFile | undefined;
  const barrios = published('barrios.json') as GeoJSON.FeatureCollection | undefined;
  if (!streets || !segments || !landmarks || !barrios) return undefined;
  return {
    version: streets.version,
    streets: streets.streets,
    segments,
    landmarks: landmarks.landmarks,
    barrios: barrios.features.map((f) => String(f.properties?.id)),
  };
}

function step<T>(label: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  console.log(`  ${label} (${((performance.now() - start) / 1000).toFixed(1)} s)`);
  return result;
}

async function main(): Promise<void> {
  console.log('Pipeline de datos');
  const callejero = await readRaw('callejero', 'csv');
  const rows = parseCallejero(callejero.text);
  const barrios = JSON.parse(
    (await readRaw('barrios', 'geojson')).text,
  ) as GeoJSON.FeatureCollection;
  const highways = waysOf(await loadOsm('osm-highways'));
  const restrictionElements = await loadOsm('osm-restrictions');
  const areaElements = await loadOsm('osm-areas');
  const osm = {
    highways,
    nodes: nodesOf(await loadOsm('osm-nodes')),
    restrictions: relationsOf(restrictionElements),
    viaNodes: new Map<number, LngLat>(nodesOf(restrictionElements).map((n) => [n.id, n.point])),
    rail: waysOf(await loadOsm('osm-rail')),
    areaWays: waysOf(areaElements),
    areaRelations: relationsOf(areaElements),
    coast: waysOf(await loadOsm('osm-coast')),
    landmarks: featuresOf(await loadOsm('osm-landmarks')),
  };
  const overrides = {
    names: await readJson<Record<string, NameOverride>>('pipeline/nombres-override.json'),
    landmarks: await readJson<Record<string, LandmarkOverride>>('pipeline/hitos-override.json'),
    corrections: (await readJson<OverridesFile>('pipeline/overrides.json')).correcciones,
  };
  console.log(`  callejero: ${rows.length} tramos · OSM: ${highways.length} vías`);

  const orientation = step('orientación', () => orientRows(rows));
  const numbering = step('numeración', () => computeNumbering(rows, orientation));
  const clipped = step('recorte', () => clip(rows, barrios));
  const segments = step('sentidos', () => orient(clipped.kept, orientation));
  const graph = step('grafo y cruce con OSM', () =>
    buildGraph(segments, highways, clipped.zone, rows),
  );
  const model = step('enriquecimiento', () =>
    enrich(graph, numbering, osm, barrios, clipped.area, overrides),
  );
  const checks = step('validaciones', () => [
    ...runChecks(
      model.graphInput,
      graph.junctions,
      model.report.connectivity,
      graph.segments.filter((s) => s.osm).length / graph.segments.length,
    ),
    factsCheck({
      graph: model.graph,
      streets: model.streets,
      addresses: new AddressBook(
        model.graph,
        model.segments.flatMap((s) => s.heights),
        model.streets,
        model.landmarks,
      ),
      rail: model.rail,
      barrios: model.barrios,
    }),
  ]);

  const previous = previousSnapshot();
  const result = exportData({
    model,
    build: graph,
    clip: clipped,
    numbering,
    sourceDate: callejero.date,
    manifest: await readManifest(),
    checks,
    ...(previous ? { previous } : {}),
  });

  for (const c of checks) console.log(`  ${checkStatus(c).padEnd(9)} ${c.name}: ${c.detail}`);
  const failed = checks.filter((c) => c.blocking && !c.passed);
  if (failed.length > 0) {
    const path = join(RAW_DIR, 'reporte-ultimo.md');
    await writeFile(path, result.report, 'utf8');
    console.error(
      `\nNo se escribieron los datos: fallan ${failed.length} validaciones bloqueantes. Reporte en ${path}`,
    );
    process.exitCode = 1;
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });
  // Los archivos de cambios sin commitear son de builds anteriores que no se publicaron.
  const tracked = execFileSync('git', ['ls-files', OUT_DIR], { encoding: 'utf8' }).split('\n');
  for (const name of await readdir(OUT_DIR)) {
    if (name.startsWith('cambios-') && !tracked.includes(`${OUT_DIR}/${name}`))
      await rm(join(OUT_DIR, name));
  }
  let total = 0;
  for (const [name, text] of result.files) {
    await writeFile(join(OUT_DIR, name), text, 'utf8');
    total += Buffer.byteLength(text);
  }
  console.log(`\nDatos ${result.version} en ${OUT_DIR}: ${(total / 1024).toFixed(0)} KB`);
}

await main();
