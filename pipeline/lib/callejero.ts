/** Lectura del callejero oficial (CSV de BA Data): una fila por tramo. */
import Papa from 'papaparse';
import { parse as parseWkt } from 'wellknown';
import type { LngLat } from '../../src/engine/geo';

export interface CallejeroRow {
  id: number;
  code: number;
  official: string;
  mapName: string;
  previous: string;
  /** Alturas: izquierda inicio, izquierda fin, derecha inicio, derecha fin (0 = sin altura). */
  heights: [number, number, number, number];
  type: string;
  direction: string;
  notes: string;
  hierarchy: string;
  rail: string;
  barrio: string;
  barrioEven: string;
  barrioOdd: string;
  /** Geometría tal como viene en el callejero. */
  line: LngLat[];
}

function int(value: string | undefined): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function parseCallejero(csv: string): CallejeroRow[] {
  // El CSV de BA Data empieza con la marca de orden de bytes (BOM).
  const parsed = Papa.parse<Record<string, string>>(
    csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv,
    {
      header: true,
      skipEmptyLines: true,
    },
  );
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(
      `El callejero no se pudo leer: ${first?.message ?? ''} (fila ${first?.row ?? '?'})`,
    );
  }
  return parsed.data.map((r) => {
    const geometry = parseWkt(r.geometry ?? '');
    if (geometry?.type !== 'LineString') {
      throw new Error(
        `Tramo ${r.id ?? '?'}: se esperaba un LINESTRING y vino ${geometry?.type ?? 'nada'}`,
      );
    }
    return {
      id: int(r.id),
      code: int(r.codigo),
      official: (r.nomoficial ?? '').trim(),
      mapName: (r.nom_mapa ?? '').trim(),
      previous: (r.nomanter ?? '').trim(),
      heights: [int(r.alt_izqini), int(r.alt_izqfin), int(r.alt_derini), int(r.alt_derfin)],
      type: (r.tipo_c ?? '').trim(),
      direction: (r.sentido ?? '').trim(),
      notes: (r.observa ?? '').trim(),
      hierarchy: (r.red_jerarq ?? '').trim(),
      rail: (r.tipo_ffcc ?? '').trim(),
      barrio: (r.barrio ?? '').trim(),
      barrioEven: (r.barrio_par ?? '').trim(),
      barrioOdd: (r.barrio_imp ?? '').trim(),
      line: geometry.coordinates.map(([lng = 0, lat = 0]) => [lng, lat] as const),
    };
  });
}

/** Altura mínima y máxima de un tramo, sin contar los ceros. */
export function heightRange(heights: readonly number[]): [number, number] | undefined {
  const values = heights.filter((h) => h > 0);
  if (values.length === 0) return undefined;
  return [Math.min(...values), Math.max(...values)];
}
