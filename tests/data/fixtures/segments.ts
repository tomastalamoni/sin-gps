import type { GraphSegment } from '../../../pipeline/05-graph';
import type { Direction } from '../../../src/engine/data';
import type { LngLat } from '../../../src/engine/geo';
import { callejero } from './mini-barrio';

const row = callejero()[0];
if (!row) throw new Error('El barrio sintético no tiene tramos');

/** Un punto a tantos metros al este y al norte de una esquina de referencia. */
export const at = (eastM: number, northM: number): LngLat => [
  -58.45 + eastM / 91_800,
  -34.58 + northM / 111_000,
];

/** Un tramo sintético de la calle 300, confirmado, con la geometría en el orden de `line`. */
export function makeSegment(
  from: number,
  to: number,
  line: LngLat[],
  direction: Direction,
  extra: Partial<GraphSegment> = {},
): GraphSegment {
  return {
    row: row as GraphSegment['row'],
    code: 300,
    line,
    heights: [0, 0, 0, 0],
    range: undefined,
    orientation: 'vecinos',
    reversed: false,
    direction,
    zone: 'area',
    restricted: false,
    noName: false,
    kind: 'a',
    flags: 0,
    from,
    to,
    layer: 0,
    confidence: 'confirmado',
    ...extra,
  };
}

/** Una cuadra de oeste a este, a `y` metros al norte, con alturas que crecen hacia el este. */
export function makeBlock(
  from: number,
  to: number,
  x0: number,
  x1: number,
  range: [number, number],
  direction: Direction = 'F',
  y = 0,
): GraphSegment {
  return makeSegment(from, to, [at(x0, y), at(x1, y)], direction, {
    range,
    heights: [range[0], range[1], range[0] + 1, range[1]],
  });
}
