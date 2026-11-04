import { describe, expect, it } from 'vitest';
import { analyzeConnectivity, trapEdges } from '../../src/engine/connectivity';
import { applyCorrections, numberingBearing, trackOf } from '../../src/engine/corrections';
import type { DirectionStretch, SegmentsFile, StreetRecord } from '../../src/engine/data';
import { RoadGraph, type GraphInput } from '../../src/engine/graph';
import { TurnTable } from '../../src/engine/turns';
import { makeGrid } from './fixtures/grid';

function street(stretches: StreetRecord['stretches']): StreetRecord {
  return {
    code: 1,
    official: 'ALFA',
    name: 'Alfa',
    short: 'Alfa',
    aliases: [],
    type: 'CALLE',
    hierarchy: 'VÍA LOCAL',
    level: 4,
    barrios: ['Palermo'],
    askable: true,
    importance: 0.1,
    segments: [0, 1, 2],
    crossings: [],
    stretches,
  };
}

const segments: SegmentsFile = {
  format: 1,
  version: 'v1',
  street: [1, 1, 1],
  from: [0, 1, 2],
  to: [1, 2, 3],
  // La tercera cuadra no tiene alturas y está dibujada al revés: su sentido queda contrario.
  dir: 'FFB',
  conf: 'ddd',
  kind: 'ccc',
  heights: [],
  flags: [0, 0, 0],
  pair: [-1, -1, -1],
  geometry: [[], [], []],
};

const stretch: DirectionStretch = {
  id: 'S:1:1000-1199',
  segments: [0, 1, 2],
  dir: 'F',
  confidence: 'en-duda',
  askable: false,
  splitCarriageway: false,
  against: [2],
};

describe('correcciones locales', () => {
  it('da vuelta el tramo, también el dibujado al revés, y lo deja confiable', () => {
    const data = applyCorrections(
      segments,
      [street([{ ...stretch }])],
      [{ street: 1, stretch: stretch.id, dir: 'B' }],
    );
    expect(data.segments.dir).toBe('BBF');
    expect(data.segments.conf).toBe('ccc');
    expect(data.streets[0]?.stretches[0]).toMatchObject({
      dir: 'B',
      confidence: 'confirmado',
      askable: true,
      corrected: true,
    });
  });

  it('una doble mano pasa a mano única respetando las cuadras dibujadas al revés', () => {
    const twoWay: DirectionStretch = { ...stretch, dir: 'D' };
    const data = applyCorrections(
      { ...segments, dir: 'DDD' },
      [street([twoWay])],
      [{ street: 1, stretch: stretch.id, dir: 'F' }],
    );
    expect(data.segments.dir).toBe('FFB');
  });

  it('dice por dónde se circula en cada cuadra, medido en la geometría', () => {
    const line = (x0: number, x1: number): readonly [number, number][] => [
      [-58.45 + x0 / 1000, -34.58],
      [-58.45 + x1 / 1000, -34.58],
    ];
    const road = (from: number, to: number, geometry: readonly (readonly [number, number])[]) => ({
      street: 1,
      from,
      to,
      dir: 'D' as const,
      doubtful: false,
      kind: 'c' as const,
      flags: 0,
      pair: -1,
      geometry,
    });
    const graph = new RoadGraph({
      nodes: [
        line(0, 1)[0] as [number, number],
        line(0, 1)[1] as [number, number],
        [-58.448, -34.58],
      ],
      segments: [road(0, 1, line(0, 1)), road(2, 1, line(2, 1))],
    });
    const track: DirectionStretch = { ...stretch, segments: [0, 1], against: [1] };
    // Hacia el este, las dos: la segunda está dibujada hacia el oeste.
    expect(trackOf(graph, track, 'F').map((p) => p.bearing)).toEqual([90, 90]);
    expect(trackOf(graph, track, 'B').map((p) => p.bearing)).toEqual([270, 270]);
    expect(trackOf(graph, track, 'D').map((p) => p.bearing)).toEqual([undefined, undefined]);
    expect(numberingBearing(graph, track)).toBeCloseTo(90, 0);
  });

  it('una doble mano no tiene orientación', () => {
    const data = applyCorrections(
      segments,
      [street([{ ...stretch }])],
      [{ street: 1, stretch: stretch.id, dir: 'D' }],
    );
    expect(data.segments.dir).toBe('DDD');
  });

  it('no toca los datos originales', () => {
    const original = street([{ ...stretch }]);
    applyCorrections(segments, [original], [{ street: 1, stretch: stretch.id, dir: 'B' }]);
    expect(segments.dir).toBe('FFB');
    expect(original.stretches[0]?.dir).toBe('F');
  });

  it('un tramo de la zona de borde se corrige, pero no se pregunta', () => {
    const border = { ...segments, flags: [1, 0, 0] };
    const data = applyCorrections(
      border,
      [street([{ ...stretch }])],
      [{ street: 1, stretch: stretch.id, dir: 'B' }],
    );
    expect(data.streets[0]?.stretches[0]?.askable).toBe(false);
  });

  it('dos calzadas no se corrigen por alturas', () => {
    const split: DirectionStretch = { ...stretch, dir: 'D', splitCarriageway: true };
    const data = applyCorrections(
      segments,
      [street([split])],
      [{ street: 1, stretch: split.id, dir: 'F' }],
    );
    expect(data.segments.dir).toBe('FFB');
    expect(data.streets[0]?.stretches[0]?.corrected).toBeUndefined();
  });

  it('avisa de las correcciones que ya no apuntan a nada', () => {
    const data = applyCorrections(
      segments,
      [street([{ ...stretch }])],
      [{ street: 1, stretch: 'S:1:9000-9099', dir: 'B' }],
    );
    expect(data.orphans).toHaveLength(1);
    expect(data.segments.dir).toBe('FFB');
  });

  it('corrige el nombre', () => {
    const data = applyCorrections(
      segments,
      [street([{ ...stretch }])],
      [],
      [{ street: 1, name: 'Beta' }],
    );
    expect(data.streets[0]?.name).toBe('Beta');
  });
});

describe('conectividad', () => {
  function trapInput(): GraphInput {
    // Una cuadrícula de doble mano con una calle sin salida de mano única que entra y no sale.
    const grid = makeGrid({ rows: 3, cols: 3, seed: 1, twoWay: true });
    const nodes = [...grid.nodes, [-58.44, -34.57] as const];
    const last = nodes.length - 1;
    return {
      ...grid,
      nodes,
      segments: [
        ...grid.segments,
        {
          street: 9,
          from: 0,
          to: last,
          dir: 'F',
          doubtful: false,
          kind: 'c',
          flags: 0,
          pair: -1,
          geometry: [
            nodes[0] as readonly [number, number],
            nodes[last] as readonly [number, number],
          ],
        },
      ],
    };
  }

  it('reconoce una trampa: se entra y no se sale', () => {
    const graph = new RoadGraph(trapInput());
    const connectivity = analyzeConnectivity(graph, new TurnTable(graph));
    expect(trapEdges(connectivity).size).toBe(1);
    expect(connectivity.ratio).toBeLessThan(1);
  });

  it('una red sin mano única no tiene trampas', () => {
    const graph = new RoadGraph(makeGrid({ rows: 3, cols: 3, seed: 1, twoWay: true }));
    const connectivity = analyzeConnectivity(graph, new TurnTable(graph));
    expect(trapEdges(connectivity).size).toBe(0);
  });
});
