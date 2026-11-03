/**
 * Paso 4 y 5 · Orientar cada tramo hacia donde crece la numeración y traducir el sentido:
 * CRECIENTE se circula hacia donde crecen las alturas, DECRECIENTE al revés y DOBLE en ambos.
 * Los tramos sin alturas se dejan como vienen; su sentido se confirma con OSM en el paso 7.
 */
import type { Direction, RoadKind } from '../src/engine/data';
import { SegmentFlag } from '../src/engine/data';
import { reverseLine } from '../src/engine/geo';
import type { Orientation } from './02-numbering';
import type { ClippedRow } from './03-clip';
import { heightRange } from './lib/callejero';
import type { WorkSegment } from './lib/types';

const DIRECTIONS: Record<string, Direction> = { CRECIENTE: 'F', DECRECIENTE: 'B', DOBLE: 'D' };

/** Nombres que no son oficiales: se manejan, pero nunca se pregunta por ellos. */
const NO_NAME = /sin nombre oficial|\(no oficial\)/i;

function kindOf(type: string): RoadKind {
  if (type === 'AVENIDA' || type === 'BOULEVARD') return 'a';
  if (type.startsWith('PASAJE')) return 'p';
  return 'c';
}

export function orient(
  rows: readonly ClippedRow[],
  orientation: ReadonlyMap<number, Orientation>,
): WorkSegment[] {
  return rows.map(({ row, zone, restricted }) => {
    const o = orientation.get(row.id) ?? { reversed: false, source: 'sin-alturas' as const };
    const direction = DIRECTIONS[row.direction];
    if (!direction) throw new Error(`Tramo ${row.id}: sentido desconocido "${row.direction}"`);
    const noName = !row.official || NO_NAME.test(row.official);
    return {
      row,
      code: row.code,
      line: o.reversed ? reverseLine(row.line) : [...row.line],
      heights: row.heights,
      range: heightRange(row.heights),
      orientation: o.source,
      reversed: o.reversed,
      direction,
      zone,
      restricted,
      noName,
      kind: kindOf(row.type),
      flags: (zone === 'border' ? SegmentFlag.border : 0) | (noName ? SegmentFlag.noName : 0),
    };
  });
}
