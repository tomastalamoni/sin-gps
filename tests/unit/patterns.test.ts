import { describe, expect, it } from 'vitest';
import type { Direction, DirectionStretch, StreetRecord } from '../../src/engine/data';
import type { LngLat } from '../../src/engine/geo';
import { RoadGraph, type SegmentInput } from '../../src/engine/graph';
import { detectPatterns } from '../../src/engine/patterns';

const FIRST_COLUMN = 10;
const FIRST_ROW = 20;
const at = (x: number, y: number): LngLat => [-58.45 + x / 91_800, -34.58 + y / 111_000];

function street(
  code: number,
  stretches: DirectionStretch[],
  crossings: StreetRecord['crossings'],
): StreetRecord {
  return {
    code,
    official: String(code),
    name: String(code),
    short: String(code),
    aliases: [],
    type: 'CALLE',
    hierarchy: 'VÍA LOCAL',
    level: 4,
    barrios: ['Palermo'],
    askable: true,
    importance: code / 100,
    segments: stretches.flatMap((s) => s.segments),
    crossings,
    stretches,
  };
}

/**
 * Filas oeste-este de doble mano (calles 20, 21…) que cruzan columnas sur-norte (calles 10, 11…) a
 * 100 m. Cada columna tiene un sentido: F hacia el norte, B hacia el sur, D doble mano.
 */
function grid(columns: Direction[], options: { rows?: number; doubtful?: number[] } = {}) {
  const rows = options.rows ?? 3;
  const nodes: LngLat[] = [];
  for (let r = 0; r < rows; r++) {
    columns.forEach((_, c) => nodes.push(at(c * 100, r * 100)));
  }
  const nodeAt = (r: number, c: number) => r * columns.length + c;
  const segments: SegmentInput[] = [];
  const add = (code: number, from: number, to: number, dir: Direction) => {
    segments.push({
      street: code,
      from,
      to,
      dir,
      doubtful: false,
      kind: 'c',
      flags: 0,
      pair: -1,
      geometry: [nodes[from] as LngLat, nodes[to] as LngLat],
    });
    return segments.length - 1;
  };
  const stretchOf = (code: number, list: number[], dir: Direction): DirectionStretch => ({
    id: `S:${code}:1-999`,
    segments: list,
    dir,
    confidence: 'confirmado',
    askable: !options.doubtful?.includes(code),
    splitCarriageway: false,
  });

  const streets: StreetRecord[] = [];
  columns.forEach((dir, c) => {
    const list: number[] = [];
    const code = FIRST_COLUMN + c;
    for (let r = 0; r + 1 < rows; r++) list.push(add(code, nodeAt(r, c), nodeAt(r + 1, c), dir));
    streets.push(street(code, [stretchOf(code, list, dir)], []));
  });
  for (let r = 0; r < rows; r++) {
    const list: number[] = [];
    const code = FIRST_ROW + r;
    for (let c = 0; c + 1 < columns.length; c++) {
      list.push(add(code, nodeAt(r, c), nodeAt(r, c + 1), 'D'));
    }
    const crossings = columns.map((_, c) => ({
      street: FIRST_COLUMN + c,
      node: nodeAt(r, c),
      height: 100 * (c + 1),
    }));
    streets.push(street(code, [stretchOf(code, list, 'D')], crossings));
  }
  return { graph: new RoadGraph({ nodes, segments }), streets };
}

describe('detectPatterns', () => {
  it('encuentra las paralelas que alternan sentido', () => {
    const { graph, streets } = grid(['F', 'B', 'F', 'B', 'F', 'B']);
    const patterns = detectPatterns(graph, streets);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.streets).toEqual([10, 11, 12, 13, 14, 15]);
    expect(patterns[0]?.bearings).toEqual([0, 180, 0, 180, 0, 180]);
    // La transversal más importante describe el patrón, y se cumple a lo largo de las tres.
    expect(patterns[0]?.along).toEqual([22, 21, 20]);
    expect(patterns[0]?.nodes).toEqual([12, 13, 14, 15, 16, 17]);
  });

  it('una doble mano corta la secuencia', () => {
    const { graph, streets } = grid(['F', 'B', 'D', 'B', 'F', 'B']);
    expect(detectPatterns(graph, streets)).toEqual([]);
  });

  it('dos paralelas seguidas con el mismo sentido cortan la secuencia', () => {
    const { graph, streets } = grid(['F', 'B', 'F', 'F', 'B', 'F']);
    expect(detectPatterns(graph, streets)).toEqual([]);
  });

  it('un tramo que no se puede preguntar no entra en una regla', () => {
    const { graph, streets } = grid(['F', 'B', 'F', 'B', 'F', 'B'], { doubtful: [12] });
    expect(detectPatterns(graph, streets)).toEqual([]);
  });

  it('una sola transversal no alcanza', () => {
    const { graph, streets } = grid(['F', 'B', 'F', 'B', 'F', 'B'], { rows: 2 });
    const onlyOne = streets.map((s) => (s.code === FIRST_ROW ? { ...s, crossings: [] } : s));
    expect(detectPatterns(graph, onlyOne)).toEqual([]);
  });

  it('se queda con lo que se cumple en dos transversales, aunque una siga más', () => {
    const { graph, streets } = grid(['F', 'B', 'F', 'B', 'F', 'B'], { rows: 2 });
    // La primera fila ve seis paralelas; la segunda, solo las primeras cuatro.
    const shorter = streets.map((s) =>
      s.code === FIRST_ROW + 1 ? { ...s, crossings: s.crossings.slice(0, 4) } : s,
    );
    const patterns = detectPatterns(graph, shorter);
    expect(patterns.map((p) => p.streets)).toEqual([[10, 11, 12, 13]]);
  });
});
