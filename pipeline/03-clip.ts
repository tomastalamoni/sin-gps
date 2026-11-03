/**
 * Paso 3 · Recortar: entran los tramos de los barrios activos (por `barrio`, `barrio_par` o
 * `barrio_imp`, así entran las avenidas límite) más una zona de borde de 400 m que se puede
 * manejar pero nunca se pregunta. Se excluyen los privados, los peatonales y el Barrio 31.
 */
import {
  bbox as turfBbox,
  booleanIntersects,
  buffer,
  featureCollection,
  lineString,
  union,
} from '@turf/turf';
import { BORDER_ZONE_M } from './config';
import { activeBarrioFeatures, isActiveBarrio } from './lib/area';
import type { CallejeroRow } from './lib/callejero';
import type { Zone } from './lib/types';

/** Valores que lista la sección 8 del plan; cualquier otro va al reporte. */
export const PLAN_VALUES = {
  sentido: ['CRECIENTE', 'DECRECIENTE', 'DOBLE', 'PJE. PRIVADO'],
  tipo: ['CALLE', 'AVENIDA', 'PASAJE'],
  jerarquia: [
    'VÍA TRONCAL',
    'VÍA DISTRIBUIDORA PRINCIPAL',
    'VÍA DISTRIBUIDORA COMPLEMENTARIA',
    'VÍA LOCAL',
  ],
} as const;

/** Tipos de vía con acceso restringido: barrera en el mapa, fuera del grafo. */
export const RESTRICTED_TYPES = new Set([
  'AUTOPISTA',
  'SUBIDA AUTOPISTA',
  'BAJADA AUTOPISTA',
  'ENLACE AUTOPISTA',
]);
const PEDESTRIAN_TYPES = new Set(['SENDERO', 'CALLE PEATONAL', 'PASAJE PEATONAL']);
const PRIVATE_TYPES = new Set(['PASAJE PARTICULAR', 'CALLE PASAJE PARTICULAR']);
const MOTOR_DIRECTIONS = new Set(['CRECIENTE', 'DECRECIENTE', 'DOBLE']);
/** El Barrio 31 queda fuera del mapa (decisión del 3/11/2026): su sentido figura "por defecto". */
const BARRIO_31 = /barrio\s*31/i;

export type ExclusionReason = 'privado' | 'peatonal' | 'barrio-31' | 'sin-sentido' | 'sin-tipo';

export interface ClippedRow {
  row: CallejeroRow;
  zone: Zone;
  restricted: boolean;
}

export interface ClipResult {
  kept: ClippedRow[];
  excluded: Map<ExclusionReason, CallejeroRow[]>;
  /** Valores que no están en la sección 8, con cuántos tramos del área y el borde los tienen. */
  unlistedValues: { field: string; value: string; count: number; treatment: string }[];
  zone: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  area: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

function exclusionOf(row: CallejeroRow): ExclusionReason | undefined {
  if (BARRIO_31.test(row.notes)) return 'barrio-31';
  if (row.direction === 'PJE. PRIVADO' || PRIVATE_TYPES.has(row.type)) return 'privado';
  if (row.direction === 'PEATONAL' || PEDESTRIAN_TYPES.has(row.type)) return 'peatonal';
  if (!MOTOR_DIRECTIONS.has(row.direction)) return 'sin-sentido';
  if (!row.type) return 'sin-tipo';
  return undefined;
}

const TREATMENT: Record<string, string> = {
  PEATONAL: 'no se maneja: queda fuera',
  SENDERO: 'peatonal: queda fuera',
  'CALLE PEATONAL': 'peatonal: queda fuera',
  'PASAJE PEATONAL': 'peatonal: queda fuera',
  'PASAJE PARTICULAR': 'privado: queda fuera',
  'CALLE PASAJE PARTICULAR': 'privado: queda fuera',
  AUTOPISTA: 'acceso restringido: barrera, fuera del grafo',
  'SUBIDA AUTOPISTA': 'acceso restringido: barrera, fuera del grafo',
  'BAJADA AUTOPISTA': 'acceso restringido: barrera, fuera del grafo',
  'ENLACE AUTOPISTA': 'acceso restringido: barrera, fuera del grafo',
  PUENTE: 'tramo de su calle',
  TÚNEL: 'tramo de su calle',
  BOULEVARD: 'como avenida',
  'PASAJE PÚBLICO': 'como pasaje',
};

export function clip(
  rows: readonly CallejeroRow[],
  barrios: GeoJSON.FeatureCollection,
): ClipResult {
  const features = activeBarrioFeatures(barrios);
  const merged = features.length > 1 ? union(featureCollection(features)) : features[0];
  if (!merged) throw new Error('No se pudo armar el área de los barrios activos');
  const area = merged;
  const zone = buffer(area, BORDER_ZONE_M, { units: 'meters' }) as GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon
  >;
  const [zw, zs, ze, zn] = turfBbox(zone);

  const kept: ClippedRow[] = [];
  const excluded = new Map<ExclusionReason, CallejeroRow[]>();
  const unlisted = new Map<string, { field: string; value: string; count: number }>();
  const note = (field: string, value: string, listed: readonly string[]) => {
    if (listed.includes(value)) return;
    const key = `${field}:${value}`;
    const entry = unlisted.get(key);
    if (entry) entry.count++;
    else unlisted.set(key, { field, value, count: 1 });
  };

  for (const row of rows) {
    const inArea = [row.barrio, row.barrioEven, row.barrioOdd].some(isActiveBarrio);
    let zoneOf: 'area' | 'border' | undefined = inArea ? 'area' : undefined;
    if (!zoneOf) {
      const inBox = row.line.some(([lng, lat]) => lng >= zw && lng <= ze && lat >= zs && lat <= zn);
      if (inBox && booleanIntersects(lineString(row.line.map(([lng, lat]) => [lng, lat])), zone))
        zoneOf = 'border';
    }
    if (!zoneOf) continue;

    note('sentido', row.direction, PLAN_VALUES.sentido);
    note('tipo_c', row.type, PLAN_VALUES.tipo);
    note('red_jerarq', row.hierarchy, PLAN_VALUES.jerarquia);

    const reason = exclusionOf(row);
    if (reason) {
      const list = excluded.get(reason);
      if (list) list.push(row);
      else excluded.set(reason, [row]);
      continue;
    }
    kept.push({ row, zone: zoneOf, restricted: RESTRICTED_TYPES.has(row.type) });
  }

  return {
    kept,
    excluded,
    unlistedValues: [...unlisted.values()]
      .sort((a, b) => b.count - a.count)
      .map((v) => ({
        ...v,
        treatment:
          TREATMENT[v.value] ?? (v.value ? 'se trata como calle común' : 'sin valor: queda fuera'),
      })),
    zone,
    area,
  };
}
