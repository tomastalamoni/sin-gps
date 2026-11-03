import type { Direction } from '../../../src/engine/data';
import type { LngLat } from '../../../src/engine/geo';
import type { GraphInput, SegmentInput } from '../../../src/engine/graph';
import { createRandom } from '../../../src/engine/random';

export interface GridOptions {
  rows: number;
  cols: number;
  seed: number;
  /** Todas las calles de doble mano (la avenida con semáforos sigue igual). */
  twoWay?: boolean;
}

const ORIGIN: LngLat = [-58.45, -34.58];
/** Unos 100 m entre esquinas. */
const STEP_LAT = 0.0009;
const STEP_LNG = 0.0011;

export function gridNode(cols: number, row: number, col: number): number {
  return row * cols + col;
}

/**
 * Cuadrícula sintética: filas oeste-este (calles 1000 + fila) y columnas sur-norte (calles
 * 2000 + columna). La fila 0 es una avenida de doble mano con semáforos; el resto de las cuadras
 * tiene un sentido al azar según la semilla.
 */
export function makeGrid({ rows, cols, seed, twoWay = false }: GridOptions): GraphInput {
  const random = createRandom(seed);
  const nodes: LngLat[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      nodes.push([ORIGIN[0] + col * STEP_LNG, ORIGIN[1] + row * STEP_LAT]);
    }
  }
  const segments: SegmentInput[] = [];
  const pickDir = (): Direction => (twoWay ? 'D' : random.pick<Direction>(['F', 'B', 'D']));
  const add = (street: number, from: number, to: number, dir: Direction, kind: 'a' | 'c') => {
    segments.push({
      street,
      from,
      to,
      dir,
      doubtful: false,
      kind,
      flags: 0,
      pair: -1,
      geometry: [nodes[from] as LngLat, nodes[to] as LngLat],
    });
  };
  for (let row = 0; row < rows; row++) {
    const rowDir = pickDir();
    for (let col = 0; col + 1 < cols; col++) {
      const avenue = row === 0;
      add(
        1000 + row,
        gridNode(cols, row, col),
        gridNode(cols, row, col + 1),
        avenue ? 'D' : rowDir,
        avenue ? 'a' : 'c',
      );
    }
  }
  for (let col = 0; col < cols; col++) {
    const colDir = pickDir();
    for (let row = 0; row + 1 < rows; row++) {
      add(2000 + col, gridNode(cols, row, col), gridNode(cols, row + 1, col), colDir, 'c');
    }
  }
  const signals = Array.from({ length: cols }, (_, col) => gridNode(cols, 0, col));
  return { nodes, segments, signals };
}

/** Busca el tramo que une dos nodos. */
export function segmentBetween(input: GraphInput, a: number, b: number): number {
  const index = input.segments.findIndex(
    (s) => (s.from === a && s.to === b) || (s.from === b && s.to === a),
  );
  if (index === -1) throw new Error(`No hay tramo entre ${a} y ${b}`);
  return index;
}
