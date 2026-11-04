/**
 * Guardar un reporte: corrige el dato en el celu al instante, con un chequeo local de trampas
 * (sección 6), y lo deja listo para exportar.
 */
import { analyzeConnectivity, trapEdges } from '../../engine/connectivity';
import { numberingBearing, trackOf } from '../../engine/corrections';
import type { Direction, DirectionStretch, StreetRecord } from '../../engine/data';
import { angleDiff, bearingDeg, distanceM, type LngLat } from '../../engine/geo';
import type { RoadGraph } from '../../engine/graph';
import { TurnTable } from '../../engine/turns';
import { refreshData, type AppData } from '../../lib/data';
import { db, type OverrideRow, type ReportKind } from '../../storage/db';

function trapsOf(graph: RoadGraph): Set<number> {
  return trapEdges(analyzeConnectivity(graph, new TurnTable(graph)));
}

/** Cuántas aristas nuevas quedaron sin salida legal. */
function newTraps(before: RoadGraph, after: RoadGraph): number {
  const known = trapsOf(before);
  return [...trapsOf(after)].filter((edge) => !known.has(edge)).length;
}

function baseRow(data: AppData, kind: ReportKind): OverrideRow {
  return { kind, createdAt: new Date().toISOString(), dataVersion: data.meta.version };
}

function point(place: LngLat | undefined): Pick<OverrideRow, 'point'> {
  return place ? { point: [place[0], place[1]] } : {};
}

export interface DirectionReport {
  street: number;
  stretch: string;
  dir: Direction;
  note?: string;
  place?: LngLat;
}

/** Corrige el sentido de un tramo. Devuelve cuántas aristas nuevas quedaron sin salida. */
export async function correctDirection(data: AppData, report: DirectionReport): Promise<number> {
  const { street, stretch, dir, note, place } = report;
  const record = data.streetByCode.get(street)?.stretches.find((s) => s.id === stretch);
  const row: OverrideRow = {
    ...baseRow(data, 'sentido'),
    street,
    stretch,
    dir,
    ...(record ? { track: trackOf(data.graph, record, dir) } : {}),
    ...(note ? { note } : {}),
    ...point(place),
  };
  // Una sola fila por tramo, aunque lleguen dos toques juntos.
  await db.transaction('rw', db.overrides, async () => {
    await db.overrides.where('stretch').equals(stretch).delete();
    await db.overrides.add(row);
  });
  const updated = await refreshData();
  return newTraps(data.graph, updated.graph);
}

export async function correctName(
  data: AppData,
  street: number,
  name: string,
  note?: string,
): Promise<void> {
  await db.overrides.filter((row) => row.kind === 'nombre' && row.street === street).delete();
  await db.overrides.add({
    ...baseRow(data, 'nombre'),
    street,
    name,
    ...(note ? { note } : {}),
  });
  await refreshData();
}

/** Lo que no se puede corregir solo: una calle que falta u otra cosa. */
export async function saveNote(
  data: AppData,
  kind: 'falta-calle' | 'otro',
  note: string,
  street: number | undefined,
  place: LngLat | undefined,
): Promise<void> {
  await db.overrides.add({
    ...baseRow(data, kind),
    note,
    ...(street === undefined ? {} : { street }),
    ...point(place),
  });
  await refreshData();
}

export interface DirectionOption {
  dir: Direction;
  label: string;
}

/** Las respuestas posibles para un tramo: "va hacia tal lado". */
export function directionOptions(
  graph: RoadGraph,
  street: StreetRecord,
  stretch: DirectionStretch,
  nameOf: (code: number) => string | undefined,
): DirectionOption[] {
  const nodes = new Set(
    stretch.segments.flatMap((t) => [graph.segment(t).from, graph.segment(t).to]),
  );
  // La transversal de cada punta se elige por la geometría: hacia dónde crece la numeración en
  // este tramo, midiendo cuánto avanza cada una en ese rumbo.
  const forward = numberingBearing(graph, stretch);
  const inside = street.crossings.filter((c) => nodes.has(c.node));
  const origin = inside[0];
  const ahead = (node: number): number => {
    if (forward === undefined || origin === undefined || node === origin.node) return 0;
    const from = graph.node(origin.node);
    const to = graph.node(node);
    const off = (angleDiff(forward, bearingDeg(from, to)) * Math.PI) / 180;
    return distanceM(from, to) * Math.cos(off);
  };
  const ordered = [...inside].sort((a, b) => ahead(a.node) - ahead(b.node));
  const low = nameOf(ordered[0]?.street ?? -1);
  const high = nameOf(ordered[ordered.length - 1]?.street ?? -1);
  const named = low !== undefined && high !== undefined && low !== high;
  return [
    { dir: 'F', label: named ? `Va hacia ${high}` : 'Va hacia donde crece la numeración' },
    { dir: 'B', label: named ? `Va hacia ${low}` : 'Va hacia donde baja la numeración' },
    { dir: 'D', label: 'Es doble mano' },
  ];
}

const SENTIDOS: Record<Direction, string> = {
  F: 'CRECIENTE',
  B: 'DECRECIENTE',
  D: 'DOBLE',
};

/**
 * El archivo para pipeline/overrides.json: cada corrección de sentido va con los puntos y rumbos de
 * sus cuadras, así el pipeline la aplica sin depender de las alturas ni de las IDs. El resto va como
 * reporte para mirarlo a mano.
 */
export function buildOverridesFile(rows: readonly OverrideRow[]): {
  correcciones: unknown[];
  reportes: unknown[];
} {
  const correcciones: unknown[] = [];
  const reportes: unknown[] = [];
  for (const row of rows) {
    const fecha = row.createdAt.slice(0, 10);
    if (row.kind === 'sentido' && row.dir && row.street !== undefined && row.track) {
      correcciones.push({
        fecha,
        codigo: row.street,
        sentido: SENTIDOS[row.dir],
        tramos: row.track.map(({ point: punto, bearing: rumbo }) => ({ punto, rumbo })),
        ...(row.note ? { nota: row.note } : {}),
      });
    } else {
      reportes.push({
        fecha,
        tipo: row.kind,
        calle: row.street,
        tramo: row.stretch,
        sentido: row.dir && SENTIDOS[row.dir],
        nombre: row.name,
        nota: row.note,
        punto: row.point,
        datos: row.dataVersion,
      });
    }
  }
  return { correcciones, reportes };
}
