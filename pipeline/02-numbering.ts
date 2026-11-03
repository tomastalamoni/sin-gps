/**
 * Paso 2 · Calcular sobre el callejero completo, antes de recortar: hacia dónde crece la
 * numeración de cada tramo y dónde arranca la de cada calle.
 *
 * Orientación: la hipótesis es que la geometría va de la altura inicial a la final. Se confirma
 * con los vecinos: la cuadra anterior en numeración tiene que tocar el comienzo del tramo y la
 * siguiente, su final. Si los vecinos dicen lo contrario, el tramo está dibujado al revés.
 */
import { distanceM, type LngLat } from '../src/engine/geo';
import { TOLERANCES } from './config';
import { heightRange, type CallejeroRow } from './lib/callejero';
import { GridIndex } from './lib/grid';

export type OrientationSource = 'vecinos' | 'hipotesis' | 'sin-alturas';

export interface Orientation {
  /** La geometría está dibujada al revés de la numeración. */
  reversed: boolean;
  source: OrientationSource;
}

export interface Numbering {
  start: number;
  end: number;
  startPoint: LngLat;
  /** Códigos y nombres oficiales de las calles que cruzan donde arranca la numeración. */
  startCross: number[];
  startCrossNames: string[];
}

/** Dos cuadras son consecutivas si sus alturas se siguen con un salto de hasta esto. */
const MAX_HEIGHT_GAP = 200;

interface Ranged {
  row: CallejeroRow;
  min: number;
  max: number;
  first: LngLat;
  last: LngLat;
}

function touches(point: LngLat, other: Ranged): boolean {
  return (
    Math.min(distanceM(point, other.first), distanceM(point, other.last)) < TOLERANCES.orientTouchM
  );
}

function endpointGap(a: Ranged, b: Ranged): number {
  return Math.min(
    distanceM(a.first, b.first),
    distanceM(a.first, b.last),
    distanceM(a.last, b.first),
    distanceM(a.last, b.last),
  );
}

/** La cuadra vecina en numeración más cercana en el plano (para no confundir calzadas paralelas). */
function neighbor(segment: Ranged, candidates: Ranged[]): Ranged | undefined {
  return candidates.sort((a, b) => endpointGap(segment, a) - endpointGap(segment, b))[0];
}

export function orientRows(rows: readonly CallejeroRow[]): Map<number, Orientation> {
  const result = new Map<number, Orientation>();
  const byCode = new Map<number, Ranged[]>();
  for (const row of rows) {
    const range = heightRange(row.heights);
    if (!range) {
      result.set(row.id, { reversed: false, source: 'sin-alturas' });
      continue;
    }
    const ranged: Ranged = {
      row,
      min: range[0],
      max: range[1],
      first: row.line[0] as LngLat,
      last: row.line[row.line.length - 1] as LngLat,
    };
    const list = byCode.get(row.code);
    if (list) list.push(ranged);
    else byCode.set(row.code, [ranged]);
  }

  for (const segments of byCode.values()) {
    for (const segment of segments) {
      const previous = neighbor(
        segment,
        segments.filter(
          (o) => o !== segment && o.max < segment.min && segment.min - o.max <= MAX_HEIGHT_GAP,
        ),
      );
      const next = neighbor(
        segment,
        segments.filter(
          (o) => o !== segment && o.min > segment.max && o.min - segment.max <= MAX_HEIGHT_GAP,
        ),
      );
      const forward =
        (previous !== undefined && touches(segment.first, previous)) ||
        (next !== undefined && touches(segment.last, next));
      const backward =
        (previous !== undefined && touches(segment.last, previous)) ||
        (next !== undefined && touches(segment.first, next));
      if (forward !== backward)
        result.set(segment.row.id, { reversed: backward, source: 'vecinos' });
      else result.set(segment.row.id, { reversed: false, source: 'hipotesis' });
    }
  }
  return result;
}

/** Dónde arranca y termina la numeración de cada calle, con las calles que cruzan al comienzo. */
export function computeNumbering(
  rows: readonly CallejeroRow[],
  orientation: ReadonlyMap<number, Orientation>,
): Map<number, Numbering> {
  const endpoints = new GridIndex<CallejeroRow>();
  for (const row of rows) {
    endpoints.add(row, [row.line[0] as LngLat]);
    endpoints.add(row, [row.line[row.line.length - 1] as LngLat]);
  }

  const best = new Map<number, { row: CallejeroRow; start: number; end: number }>();
  for (const row of rows) {
    const range = heightRange(row.heights);
    if (!range) continue;
    const current = best.get(row.code);
    if (!current) best.set(row.code, { row, start: range[0], end: range[1] });
    else {
      if (range[0] < current.start) Object.assign(current, { row, start: range[0] });
      current.end = Math.max(current.end, range[1]);
    }
  }

  const result = new Map<number, Numbering>();
  for (const [code, { row, start, end }] of best) {
    const reversed = orientation.get(row.id)?.reversed ?? false;
    const startPoint = (reversed ? row.line[row.line.length - 1] : row.line[0]) as LngLat;
    const crossing = [...endpoints.near([startPoint], TOLERANCES.orientTouchM)].filter(
      (other) =>
        other.code !== code &&
        Math.min(
          distanceM(startPoint, other.line[0] as LngLat),
          distanceM(startPoint, other.line[other.line.length - 1] as LngLat),
        ) < TOLERANCES.orientTouchM,
    );
    const crossCodes = [...new Set(crossing.map((r) => r.code))];
    result.set(code, {
      start,
      end,
      startPoint,
      startCross: crossCodes,
      startCrossNames: crossCodes.map((c) => crossing.find((r) => r.code === c)?.official ?? ''),
    });
  }
  return result;
}
