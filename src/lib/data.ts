/**
 * Los datos de public/data, cargados una sola vez y con las correcciones del celu aplicadas. El
 * service worker los sirve sin internet.
 */
import { use, useSyncExternalStore } from 'react';
import { AddressBook } from '../engine/addresses';
import { barrioInfos, type BarrioInfo } from '../engine/barrios';
import { applyCorrections } from '../engine/corrections';
import {
  type ChangesFile,
  type GraphFile,
  type LandmarkRecord,
  type LandmarksFile,
  type LoadFile,
  type MetaFile,
  type RailFile,
  type SegmentsFile,
  type StreetRecord,
  type StreetsFile,
} from '../engine/data';
import { RoadGraph } from '../engine/graph';
import type { CardId } from '../engine/ids';
import { barrierCardsOf } from '../engine/lessons';
import { checkFormat, graphInputFromFiles } from '../engine/load';
import { db, type OverrideRow } from '../storage/db';
import { syncCards } from '../storage/progress';
import { logError } from './errors';
import { assetUrl } from './urls';

export interface AppData {
  segments: SegmentsFile;
  graph: RoadGraph;
  streets: StreetRecord[];
  streetByCode: ReadonlyMap<number, StreetRecord>;
  landmarks: LandmarkRecord[];
  rail: RailFile;
  background: GeoJSON.FeatureCollection;
  barriers: GeoJSON.FeatureCollection;
  barrios: GeoJSON.FeatureCollection;
  barrioList: BarrioInfo[];
  /** Las tarjetas de autopista. */
  barrierCards: CardId[];
  /** Cuánto tiempo por día pide cada opción de calles nuevas. */
  load: LoadFile;
  meta: MetaFile;
  addresses: AddressBook;
  overrides: OverrideRow[];
  /** Correcciones que ya no apuntan a ningún tramo: no se aplican. */
  orphans: number;
}

interface Files {
  segments: SegmentsFile;
  graph: GraphFile;
  streets: StreetsFile;
  landmarks: LandmarksFile;
  rail: RailFile;
  background: GeoJSON.FeatureCollection;
  barriers: GeoJSON.FeatureCollection;
  barrios: GeoJSON.FeatureCollection;
  load: LoadFile;
  meta: MetaFile;
}

/** Hasta dónde se busca la cuadra de un tramo corregido cuya ID cambió. */
const RELINK_MAX_M = 15;

async function fetchJson<T>(name: string): Promise<T> {
  const response = await fetch(assetUrl(`data/${name}`));
  if (!response.ok) throw new Error(`No se pudo cargar ${name} (${response.status})`);
  return (await response.json()) as T;
}

async function fetchFiles(): Promise<Files> {
  const [segments, graph, streets, landmarks, rail, background, barriers, barrios, load, meta] =
    await Promise.all([
      fetchJson<SegmentsFile>('tramos.json'),
      fetchJson<GraphFile>('grafo.json'),
      fetchJson<StreetsFile>('calles.json'),
      fetchJson<LandmarksFile>('hitos.json'),
      fetchJson<RailFile>('vias.json'),
      fetchJson<GeoJSON.FeatureCollection>('fondo.json'),
      fetchJson<GeoJSON.FeatureCollection>('barreras.json'),
      fetchJson<GeoJSON.FeatureCollection>('barrios.json'),
      fetchJson<LoadFile>('carga.json'),
      fetchJson<MetaFile>('meta.json'),
    ]);
  checkFormat(streets, 'calles.json');
  checkFormat(landmarks, 'hitos.json');
  checkFormat(rail, 'vias.json');
  return { segments, graph, streets, landmarks, rail, background, barriers, barrios, load, meta };
}

function assemble(files: Files, overrides: OverrideRow[]): AppData {
  const directions = overrides.flatMap(({ street, stretch, dir }) =>
    street !== undefined && stretch && dir ? [{ street, stretch, dir }] : [],
  );
  const names = overrides.flatMap(({ street, name }) =>
    street !== undefined && name ? [{ street, name }] : [],
  );
  const { segments, streets, orphans } = applyCorrections(
    files.segments,
    files.streets.streets,
    directions,
    names,
  );
  const graph = new RoadGraph(graphInputFromFiles(segments, files.graph));
  const { landmarks } = files.landmarks;
  return {
    segments,
    graph,
    streets,
    streetByCode: new Map(streets.map((s) => [s.code, s])),
    landmarks,
    rail: files.rail,
    background: files.background,
    barriers: files.barriers,
    barrios: files.barrios,
    barrioList: barrioInfos(files.barrios),
    barrierCards: barrierCardsOf(files.barriers),
    load: files.load,
    meta: files.meta,
    addresses: new AddressBook(graph, segments.heights, streets, landmarks),
    overrides,
    orphans: orphans.length,
  };
}

/**
 * Una versión nueva de los datos que ya trae el valor corregido, y confirmado, deja de necesitar la
 * corrección local (sección 6): esa fila se borra sola. Un tramo sin par sigue sin confirmar: la
 * corrección queda, o volvería a la lista "Para verificar".
 */
export function outdatedOverrides(
  rows: readonly OverrideRow[],
  streets: readonly StreetRecord[],
  version: string,
): number[] {
  const byCode = new Map(streets.map((s) => [s.code, s]));
  return rows.flatMap((row) => {
    if (row.id === undefined || row.dataVersion === version || row.street === undefined) return [];
    const street = byCode.get(row.street);
    const stretch = street?.stretches.find((s) => s.id === row.stretch);
    const sameDirection =
      row.kind === 'sentido' && stretch?.dir === row.dir && stretch?.confidence === 'confirmado';
    const sameName = row.kind === 'nombre' && street?.name === row.name;
    return sameDirection || sameName ? [row.id] : [];
  });
}

/**
 * Una versión nueva puede cambiarle la ID a un tramo corregido: con los puntos guardados se vuelve
 * a encontrar. Devuelve las filas que cambiaron.
 */
export function relinkOverrides(
  rows: readonly OverrideRow[],
  streets: readonly StreetRecord[],
  graph: RoadGraph,
): OverrideRow[] {
  const known = new Set(streets.flatMap((s) => s.stretches.map((st) => st.id)));
  const byCode = new Map(streets.map((s) => [s.code, s]));
  return rows.flatMap((row) => {
    const first = row.track?.[0];
    if (!row.stretch || known.has(row.stretch) || !first) return [];
    const street = byCode.get(row.street ?? -1);
    const near = graph
      .nearestSegments(first.point, RELINK_MAX_M)
      .find((x) => street?.segments.includes(x.segment));
    const stretch = street?.stretches.find((s) => near && s.segments.includes(near.segment));
    return stretch ? [{ ...row, stretch: stretch.id }] : [];
  });
}

async function readOverrides(files: Files): Promise<OverrideRow[]> {
  const rows = await db.overrides.toArray();
  const { streets, version } = files.streets;
  const outdated = outdatedOverrides(rows, streets, version);
  if (outdated.length > 0) await db.overrides.bulkDelete(outdated);
  const kept = rows.filter((row) => row.id === undefined || !outdated.includes(row.id));
  if (kept.every((row) => !row.stretch || row.dataVersion === version)) return kept;
  const graph = new RoadGraph(graphInputFromFiles(files.segments, files.graph));
  const moved = relinkOverrides(kept, streets, graph);
  if (moved.length > 0) await db.overrides.bulkPut(moved);
  return db.overrides.toArray();
}

let files: Files | undefined;
let loading: Promise<AppData> | undefined;
let current: AppData | undefined;
const listeners = new Set<() => void>();

export function loadData(): Promise<AppData> {
  // Un fallo queda guardado a propósito: `use()` vuelve a pedir la promesa en cada render y con una
  // nueva nunca terminaría. Reintentar es recargar la app.
  loading ??= (async () => {
    const loaded = await fetchFiles();
    files = loaded;
    current = assemble(loaded, await readOverrides(loaded));
    // Sin esto la app sigue andando: se reintenta la próxima vez que abra.
    await syncCards({
      version: loaded.meta.version,
      files: loaded.meta.changes,
      fetchChanges: (file) => fetchJson<ChangesFile>(file),
      streets: current.streets,
    }).catch((error: unknown) => logError(error, 'actualizar tarjetas'));
    return current;
  })();
  return loading;
}

/** Vuelve a aplicar las correcciones después de guardar una. */
export async function refreshData(): Promise<AppData> {
  await loadData();
  if (!files) throw new Error('Los datos todavía no se cargaron');
  current = assemble(files, await db.overrides.toArray());
  for (const listener of listeners) listener();
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Los datos, suspendiendo el componente mientras se cargan. */
export function useData(): AppData {
  const first = use(loadData());
  return useSyncExternalStore(subscribe, () => current ?? first);
}
