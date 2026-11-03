import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LngLat } from '../../src/engine/geo';
import {
  edgeComponents,
  edgeOf,
  RoadGraph,
  segmentOf,
  type GraphInput,
} from '../../src/engine/graph';
import { Router } from '../../src/engine/router';
import { TurnTable, turnOptions } from '../../src/engine/turns';
import { gridNode, makeGrid, segmentBetween } from './fixtures/grid';

/** Una esquina en cruz: llega desde el sur por la calle 1 y salen el norte (1), el este y el oeste (2). */
function crossroads(
  options: { arrivingDir?: 'F' | 'D'; signal?: boolean; pair?: number } = {},
): GraphInput {
  const center: LngLat = [-58.45, -34.58];
  const nodes: LngLat[] = [
    center,
    [center[0], center[1] - 0.0009],
    [center[0], center[1] + 0.0009],
    [center[0] + 0.0011, center[1]],
    [center[0] - 0.0011, center[1]],
  ];
  const segment = (street: number, from: number, to: number, dir: 'F' | 'B' | 'D') => ({
    street,
    from,
    to,
    dir,
    doubtful: false,
    kind: 'c' as const,
    flags: 0,
    pair: -1,
    geometry: [nodes[from] as LngLat, nodes[to] as LngLat],
  });
  return {
    nodes,
    segments: [
      { ...segment(1, 1, 0, options.arrivingDir ?? 'F'), pair: options.pair ?? -1 },
      segment(1, 0, 2, 'D'),
      segment(2, 0, 3, 'F'),
      segment(2, 4, 0, 'F'),
    ],
    signals: options.signal ? [0] : [],
  };
}

describe('turnOptions', () => {
  it('clasifica seguir, izquierda y derecha y marca la contramano', () => {
    const graph = new RoadGraph(crossroads());
    const options = turnOptions(graph, edgeOf(0, false));
    const byKind = Object.fromEntries(options.map((o) => [o.kind, o]));
    expect(byKind.seguir?.edge).toBe(edgeOf(1, false));
    expect(byKind.derecha?.edge).toBe(edgeOf(2, false));
    expect(byKind.derecha?.legality.status).toBe('legal');
    expect(byKind.izquierda?.edge).toBe(edgeOf(3, true));
    expect(byKind.izquierda?.legality).toEqual({ status: 'ilegal', reason: 'contramano' });
    expect(options.some((o) => o.kind === 'vuelta-en-u')).toBe(false);
  });

  it('prohíbe la izquierda desde doble mano con semáforo, salvo con calzadas separadas', () => {
    const twoWay = crossroads({ arrivingDir: 'D', signal: true });
    twoWay.segments = twoWay.segments.map((s, i) => (i === 3 ? { ...s, dir: 'D' as const } : s));
    const left = (input: GraphInput) =>
      turnOptions(new RoadGraph(input), edgeOf(0, false)).find((o) => o.kind === 'izquierda')
        ?.legality;
    expect(left(twoWay)).toEqual({ status: 'ilegal', reason: 'izquierda-con-semaforo' });
    expect(left({ ...twoWay, signals: [] })?.status).toBe('legal');
    const divided = {
      ...twoWay,
      segments: twoWay.segments.map((s, i) => (i === 0 ? { ...s, pair: 99 } : s)),
    };
    expect(left(divided)).toEqual({ status: 'condicional', reason: 'calzadas-separadas' });
    expect(left({ ...twoWay, leftTurnLanes: [0, 0] })).toEqual({
      status: 'condicional',
      reason: 'carril-de-giro',
    });
  });

  it('respeta las restricciones de giro de OSM', () => {
    const forbidden = new RoadGraph({ ...crossroads(), restrictions: [0, 0, 2, 0] });
    expect(
      turnOptions(forbidden, edgeOf(0, false)).find((o) => o.kind === 'derecha')?.legality,
    ).toEqual({
      status: 'ilegal',
      reason: 'giro-prohibido',
    });
    const onlyRight = new RoadGraph({ ...crossroads(), restrictions: [0, 0, 2, 1] });
    expect(
      turnOptions(onlyRight, edgeOf(0, false)).find((o) => o.kind === 'seguir')?.legality.status,
    ).toBe('ilegal');
  });

  it('ofrece la vuelta en U solo en una calle sin salida', () => {
    const graph = new RoadGraph(crossroads({ arrivingDir: 'D' }));
    expect(turnOptions(graph, edgeOf(1, false)).map((o) => o.kind)).toEqual(['vuelta-en-u']);
  });

  it('pasar a la otra calzada de la avenida es una vuelta en U', () => {
    // Donde termina el bulevar: llega la calzada norte (0), sale la sur (1), sigue una sola (2) y
    // otra rama de la misma calle se abre hacia el sureste (3).
    const center: LngLat = [-58.45, -34.58];
    const nodes: LngLat[] = [
      center,
      [center[0] - 0.0001, center[1] - 0.0009],
      [center[0] + 0.0001, center[1] - 0.0009],
      [center[0], center[1] + 0.0009],
      [center[0] + 0.0004, center[1] - 0.0012],
    ];
    const segment = (from: number, to: number, dir: 'F' | 'D', pair: number) => ({
      street: 5,
      from,
      to,
      dir,
      doubtful: false,
      kind: 'a' as const,
      flags: 0,
      pair,
      geometry: [nodes[from] as LngLat, nodes[to] as LngLat],
    });
    const input: GraphInput = {
      nodes,
      segments: [
        segment(1, 0, 'F', 1),
        segment(0, 2, 'F', 0),
        segment(0, 3, 'D', -1),
        segment(0, 4, 'D', -1),
      ],
    };
    const kinds = (extra: Partial<GraphInput>) =>
      turnOptions(new RoadGraph({ ...input, ...extra }), edgeOf(0, false)).map((o) => [
        o.edge,
        o.kind,
      ]);
    const regular = [
      [edgeOf(2, false), 'seguir'],
      [edgeOf(3, false), 'cerrada-derecha'],
    ];
    // Con una salida legal no se ofrece, aunque OSM no las marque como par; la rama que se
    // aleja sí es una salida.
    expect(kinds({})).toEqual(regular);
    const unpaired = input.segments.map((s) => ({ ...s, pair: -1 }));
    expect(kinds({ segments: unpaired })).toEqual(regular);
    // En el borde del área sí, salvo que OSM la prohíba.
    expect(kinds({ outside: [0] })).toContainEqual([edgeOf(1, false), 'vuelta-en-u']);
    expect(kinds({ outside: [0], restrictions: [0, 0, 1, 0] })).toEqual(regular);
  });
});

describe('router', () => {
  it('no dobla a la izquierda desde la avenida con semáforos: busca otra salida', () => {
    const input = makeGrid({ rows: 4, cols: 4, seed: 7, twoWay: true });
    const graph = new RoadGraph(input);
    const router = new Router(graph, new TurnTable(graph));
    // Va por la avenida (fila 0) hacia el este y el destino queda al norte: todas las salidas al
    // norte son izquierdas con semáforo, así que tiene que dar la vuelta al final y doblar a la derecha.
    const start = segmentBetween(input, gridNode(4, 0, 0), gridNode(4, 0, 1));
    const target = segmentBetween(input, gridNode(4, 3, 2), gridNode(4, 3, 3));
    const route = router.route(edgeOf(start, false), new Set([target]));
    expect(route).toBeDefined();
    expect(segmentOf(route?.edges.at(-1) ?? -1)).toBe(target);
    const kinds = (route?.edges ?? []).slice(1).map((edge, i) => {
      const previous = route?.edges[i] as number;
      return turnOptions(graph, previous).find((o) => o.edge === edge)?.kind;
    });
    expect(kinds).toContain('vuelta-en-u');
    expect(kinds).not.toContain('izquierda');
  });

  it('nunca usa una maniobra ilegal y su costo coincide con Dijkstra', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (seed, a, b) => {
          const input = makeGrid({ rows: 5, cols: 5, seed });
          const graph = new RoadGraph(input);
          const router = new Router(graph, new TurnTable(graph));
          const legalEdges = Array.from({ length: graph.edgeCount }, (_, e) => e).filter((e) =>
            graph.isLegalEdge(e),
          );
          const start = legalEdges[a % legalEdges.length] as number;
          const target = new Set([b % graph.segmentCount]);
          const astar = router.route(start, target);
          const dijkstra = router.route(start, target, false);
          expect(astar === undefined).toBe(dijkstra === undefined);
          if (!astar || !dijkstra) return;
          expect(astar.cost).toBeCloseTo(dijkstra.cost, 6);
          for (let i = 1; i < astar.edges.length; i++) {
            const option = turnOptions(graph, astar.edges[i - 1] as number).find(
              (o) => o.edge === astar.edges[i],
            );
            expect(option?.legality.status).toBe('legal');
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('edgeComponents', () => {
  it('detecta una trampa: una cuadra a la que se entra y de la que no se sale', () => {
    const input = crossroads({ arrivingDir: 'D' });
    // Sin salida y de mano única hacia el fondo: se entra y no se puede volver.
    input.segments = input.segments.map((s, i) => (i === 1 ? { ...s, dir: 'F' as const } : s));
    const graph = new RoadGraph(input);
    const table = new TurnTable(graph);
    const components = edgeComponents(
      graph.edgeCount,
      (e) => graph.isLegalEdge(e),
      (e) => table.next(e),
    );
    const trap = components[edgeOf(1, false)];
    const others = [edgeOf(0, false), edgeOf(0, true)].map((e) => components[e]);
    expect(others.every((c) => c !== trap)).toBe(true);
  });
});
