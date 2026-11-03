import { describe, expect, it } from 'vitest';
import { computeNumbering, orientRows } from '../../pipeline/02-numbering';
import { clip } from '../../pipeline/03-clip';
import { orient } from '../../pipeline/04-orient';
import { buildGraph, type GraphSegment } from '../../pipeline/05-graph';
import { enrich } from '../../pipeline/07-osm-enrich';
import { findCarriagewayPairs } from '../../pipeline/lib/network';
import { applyCorrections, type Correction } from '../../pipeline/lib/overrides';
import { findHeightBreaks, runChecks } from '../../pipeline/lib/validate';
import { edgeOf, segmentOf } from '../../src/engine/graph';
import { turnOptions } from '../../src/engine/turns';
import * as mini from './fixtures/mini-barrio';
import { at, makeSegment } from './fixtures/segments';

function runPipeline() {
  const rows = mini.callejero();
  const barrios = mini.barrios();
  const osm = mini.osm();
  const orientation = orientRows(rows);
  const numbering = computeNumbering(rows, orientation);
  const clipped = clip(rows, barrios);
  const segments = orient(clipped.kept, orientation);
  const graph = buildGraph(segments, osm.ways, clipped.zone, rows);
  const model = enrich(
    graph,
    numbering,
    {
      highways: osm.ways,
      nodes: [osm.signal],
      restrictions: [osm.restriction],
      viaNodes: osm.viaNodes,
      rail: [],
      areaWays: [],
      areaRelations: [],
      coast: [],
      landmarks: [],
    },
    barrios,
    clipped.area,
    { names: {}, landmarks: {}, corrections: [] },
  );
  return { rows, orientation, numbering, graph, model };
}

describe('pipeline sobre un barrio sintético', () => {
  const { orientation, numbering, graph, model } = runPipeline();
  const segmentsOf = (code: number) => model.segments.filter((s) => s.code === code);

  it('detecta la cuadra dibujada al revés con sus vecinas', () => {
    expect(orientation.get(mini.REVERSED_ROW_ID)).toEqual({ reversed: true, source: 'vecinos' });
    const reversed = model.segments.find((s) => s.row.id === mini.REVERSED_ROW_ID);
    // Ya orientada, la geometría va hacia donde crece la numeración (de oeste a este).
    expect(reversed?.line[0]?.[0]).toBeLessThan(reversed?.line[1]?.[0] ?? 0);
  });

  it('calcula dónde arranca la numeración de cada calle', () => {
    expect(numbering.get(101)?.start).toBe(1000);
    expect(numbering.get(101)?.startCross).toContain(200);
  });

  it('parte la cuadra donde termina la calle en T', () => {
    expect(graph.stats.tSplits).toBe(1);
    expect(segmentsOf(103)).toHaveLength(4);
  });

  it('confirma con OSM y marca en duda donde no coinciden', () => {
    expect(segmentsOf(102).every((s) => s.confidence === 'en-duda')).toBe(true);
    for (const code of [100, 101, 103, 200, 201]) {
      expect(
        segmentsOf(code).every((s) => s.confidence === 'confirmado'),
        String(code),
      ).toBe(true);
    }
  });

  it('empareja las calzadas separadas y las pregunta como doble mano', () => {
    expect(model.report.pairs).toBe(3);
    const split = model.streets.find((s) => s.code === mini.SPLIT_AVENUE);
    expect(split?.stretches.every((st) => st.splitCarriageway && st.dir === 'D')).toBe(true);
  });

  it('ubica el semáforo y la restricción de giro en sus esquinas', () => {
    expect(model.report.signals).toBe(1);
    expect(model.report.restrictions.mapped).toBe(1);
    // Por BETA hacia el oeste, en la esquina con DOS no se puede doblar a la izquierda.
    const beta = model.segments.findIndex((s) => s.code === 101 && s.range?.[0] === 1100);
    const options = turnOptions(model.graph, edgeOf(beta, true));
    const left = options.find((o) => model.graph.segment(segmentOf(o.edge)).street === 201);
    expect(left?.kind).toBe('izquierda');
    expect(left?.legality).toEqual({ status: 'ilegal', reason: 'giro-prohibido' });
  });

  it('arma nombres, niveles y tarjetas de sentido', () => {
    const alfa = model.streets.find((s) => s.code === 100);
    expect(alfa?.name).toBe('Av. Alfa');
    expect(alfa?.level).toBe(2);
    const beta = model.streets.find((s) => s.code === 101);
    expect(beta?.stretches).toHaveLength(1);
    expect(beta?.stretches[0]?.id).toBe('S:101:1000-1299');
    expect(beta?.stretches[0]?.dir).toBe('B');
  });

  it('no encuentra cambios de sentido en medio de una cuadra', () => {
    const checks = runChecks(model.graphInput, graph.junctions, model.report.connectivity);
    expect(checks.find((c) => c.name.startsWith('Cambio de sentido'))?.passed).toBe(true);
  });
});

describe('calzadas separadas', () => {
  const segment = makeSegment;

  it('empareja dos calzadas lado a lado con sentidos opuestos', () => {
    const north = segment(0, 1, [at(0, 20), at(100, 20)], 'F');
    const south = segment(2, 3, [at(0, 0), at(100, 0)], 'B');
    expect(findCarriagewayPairs([north, south]).get(north)).toBe(south);
  });

  it('no empareja dos cuadras seguidas que cambian de sentido', () => {
    const first = segment(0, 1, [at(0, 0), at(30, 0)], 'F');
    const second = segment(1, 2, [at(30, 0), at(60, 0)], 'B');
    expect(findCarriagewayPairs([first, second]).size).toBe(0);
  });

  it('no empareja tramos encimados ni corridos a lo largo', () => {
    const base = segment(0, 1, [at(0, 0), at(60, 0)], 'F');
    const overlapped = segment(2, 3, [at(0, 2), at(60, 2)], 'B');
    expect(findCarriagewayPairs([base, overlapped]).size).toBe(0);
    // A 36 m de centro a centro, pero se superponen solo 25 de sus 60 m.
    const shifted = segment(2, 3, [at(35, 10), at(95, 10)], 'B');
    expect(findCarriagewayPairs([base, shifted]).size).toBe(0);
  });

  it('avisa cuando dos cuadras seguidas no empalman, vereda con vereda', () => {
    const block = (from: number, to: number, heights: GraphSegment['heights']) =>
      segment(from, to, [at(from * 100, 0), at(to * 100, 0)], 'F', {
        heights,
        range: [Math.min(...heights.filter((h) => h > 0)), Math.max(...heights)],
      });
    const first = block(0, 1, [1000, 1098, 1001, 1099]);
    // Empalma por una vereda aunque la otra termine antes: los rangos se pisan, pero sigue.
    const second = block(1, 2, [1100, 1198, 1063, 1099]);
    const third = block(2, 3, [1500, 1598, 1501, 1599]);
    const breaks = findHeightBreaks([first, second, third]);
    expect(breaks.map((b) => [b.before, b.after])).toEqual([[second, third]]);
  });

  it('una corrección no elige entre dos calzadas, pero sí corrige cuadras que se pisan', () => {
    const correction = (sentido: Correction['sentido']): Correction => ({
      fecha: '2026-11-03',
      codigo: 300,
      desde: 1000,
      hasta: 1099,
      sentido,
    });
    const heights = { range: [1000, 1099] as [number, number] };
    const north = segment(0, 1, [at(0, 20), at(100, 20)], 'F', heights);
    const south = segment(2, 3, [at(0, 0), at(100, 0)], 'B', heights);
    expect(applyCorrections([north, south], [correction('DOBLE')]).refused).toHaveLength(1);
    // También si las calzadas se juntan en una esquina.
    const joined = segment(0, 4, [at(0, 20), at(100, 0)], 'B', heights);
    expect(applyCorrections([north, joined], [correction('DOBLE')]).refused).toHaveLength(1);
    // Dos cuadras seguidas con números que se pisan (1000-1099 y 1050-1150) sí se corrigen.
    const first = segment(0, 1, [at(0, 0), at(100, 0)], 'F', heights);
    const second = segment(1, 2, [at(100, 0), at(200, 0)], 'F', { range: [1050, 1150] });
    const result = applyCorrections([first, second], [correction('DECRECIENTE')]);
    expect(result.applied).toHaveLength(1);
    expect([first.direction, second.direction]).toEqual(['B', 'B']);
  });

  it('DOBLE no depende de cómo se orientó la cuadra; CRECIENTE sí', () => {
    const guessed = () =>
      segment(0, 1, [at(0, 0), at(100, 0)], 'F', {
        range: [1000, 1099],
        orientation: 'hipotesis',
      });
    const twoWay = guessed();
    const result = applyCorrections(
      [twoWay],
      [{ fecha: '2026-11-03', codigo: 300, desde: 1000, hasta: 1099, sentido: 'DOBLE' }],
    );
    expect(result.applied).toHaveLength(1);
    expect(twoWay.direction).toBe('D');
    const oneWay = applyCorrections(
      [guessed()],
      [{ fecha: '2026-11-03', codigo: 300, desde: 1000, hasta: 1099, sentido: 'CRECIENTE' }],
    );
    expect(oneWay.refused).toHaveLength(1);
  });
});
