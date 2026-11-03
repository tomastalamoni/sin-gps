/**
 * Pruebas sobre los datos reales de public/data, leídos igual que la app (sección 10).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeChanges, isEmptyChanges } from '../../pipeline/lib/changes';
import { runChecks } from '../../pipeline/lib/validate';
import {
  decodeLine,
  isAskableConfidence,
  SegmentFlag,
  type DirectionStretch,
  type GraphFile,
  type LandmarksFile,
  type PatternsFile,
  type SegmentsFile,
  type StreetsFile,
} from '../../src/engine/data';
import {
  angleDiff,
  bearingDeg,
  distanceM,
  lineLengthM,
  pointAlong,
  projectOnLine,
  type LngLat,
} from '../../src/engine/geo';
import { RoadGraph } from '../../src/engine/graph';
import { isCardId } from '../../src/engine/ids';
import { graphInputFromFiles, segmentConfidence } from '../../src/engine/load';
import { createRandom } from '../../src/engine/random';
import { Router } from '../../src/engine/router';
import { TurnTable, turnOptions } from '../../src/engine/turns';

const DIR = 'public/data';
const hasData = existsSync(join(DIR, 'tramos.json'));
const read = (name: string): unknown => JSON.parse(readFileSync(join(DIR, name), 'utf8'));

describe.skipIf(!hasData)('datos reales', () => {
  const segments = read('tramos.json') as SegmentsFile;
  const graphFile = read('grafo.json') as GraphFile;
  const streets = read('calles.json') as StreetsFile;
  const landmarks = read('hitos.json') as LandmarksFile;
  const patterns = read('patrones.json') as PatternsFile;
  const input = graphInputFromFiles(segments, graphFile);
  const graph = new RoadGraph(input);
  const table = new TurnTable(graph);

  it('todos los archivos son de la misma versión', () => {
    const versions = new Set([
      segments.version,
      graphFile.version,
      streets.version,
      landmarks.version,
      patterns.version,
    ]);
    expect(versions.size).toBe(1);
  });

  it('pasa las validaciones bloqueantes', () => {
    const checks = runChecks(input, new Set(graphFile.junctions));
    for (const check of checks.filter((c) => c.blocking))
      expect(check.passed, check.detail).toBe(true);
  });

  it('las IDs de las tarjetas son válidas y no se repiten', () => {
    const ids = [
      ...streets.streets.filter((s) => s.askable).map((s) => `N:${s.code}`),
      ...streets.streets.flatMap((s) => s.stretches.map((st) => st.id)),
      ...landmarks.landmarks.map((l) => l.id),
    ];
    for (const id of ids) expect(isCardId(id), id).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('un tramo de sentido con algún tramo dudoso queda como dudoso: nunca se pregunta', () => {
    for (const street of streets.streets) {
      for (const stretch of street.stretches) {
        const doubtful = stretch.segments.some(
          (t) => !isAskableConfidence(segmentConfidence(segments, t)),
        );
        if (doubtful) {
          expect(isAskableConfidence(stretch.confidence), stretch.id).toBe(false);
          expect(stretch.askable, stretch.id).toBe(false);
        }
      }
    }
  });

  it('cada tramo con alturas tiene el mismo sentido que su tarjeta', () => {
    const wrong: string[] = [];
    for (const street of streets.streets) {
      for (const stretch of street.stretches) {
        if (stretch.splitCarriageway) continue;
        for (const t of stretch.segments) {
          const hasHeights = segments.heights.slice(4 * t, 4 * t + 4).some((h) => h > 0);
          if (hasHeights && segments.dir[t] !== stretch.dir)
            wrong.push(`${stretch.id} (tramo ${t})`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('un tramo de sentido que se pregunta no tiene tramos dudosos ni de la zona de borde', () => {
    const wrong: string[] = [];
    for (const street of streets.streets) {
      for (const stretch of street.stretches) {
        if (!stretch.askable) continue;
        const bad = stretch.segments.some(
          (t) =>
            ((segments.flags[t] ?? 0) & SegmentFlag.border) !== 0 ||
            !isAskableConfidence(segmentConfidence(segments, t)),
        );
        if (bad || !isAskableConfidence(stretch.confidence)) wrong.push(stretch.id);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('calles e hitos apuntan a tramos, nodos y calles que existen', () => {
    const segmentCount = segments.street.length;
    const nodeCount = graphFile.nodes.length / 2;
    const codes = new Set(streets.streets.map((s) => s.code));
    const valid = (i: number, n: number) => Number.isInteger(i) && i >= 0 && i < n;
    const wrong: string[] = [];
    for (const street of streets.streets) {
      const own = [...street.segments, ...street.stretches.flatMap((st) => st.segments)];
      for (const t of own) {
        if (!valid(t, segmentCount) || segments.street[t] !== street.code)
          wrong.push(`calle ${street.code}: tramo ${t}`);
      }
      for (const c of street.crossings) {
        if (!valid(c.node, nodeCount) || !codes.has(c.street))
          wrong.push(`calle ${street.code}: cruce ${c.street} en ${c.node}`);
      }
    }
    for (const landmark of landmarks.landmarks) {
      for (const t of landmark.access)
        if (!valid(t, segmentCount)) wrong.push(`${landmark.id}: tramo ${t}`);
    }
    expect(wrong).toEqual([]);
  });

  it('las transversales siguen la numeración de la calle', () => {
    const wrong: string[] = [];
    for (const street of streets.streets) {
      const heights = street.crossings.map((c) => c.height).filter((h) => h > 0);
      if (heights.some((h, i) => i > 0 && h < (heights[i - 1] ?? 0)))
        wrong.push(`${street.name}: ${heights.join(', ')}`);
    }
    expect(wrong).toEqual([]);
  });

  it('dos tramos de sentido que se tocan y se preguntan igual son uno solo', () => {
    const wrong: string[] = [];
    for (const street of streets.streets) {
      const nodesOf = (stretch: DirectionStretch) =>
        new Set(stretch.segments.flatMap((t) => [segments.from[t], segments.to[t]]));
      const keyOf = (s: DirectionStretch) => `${s.dir}${s.splitCarriageway}${s.askable}`;
      street.stretches.forEach((a, i) => {
        const nodes = nodesOf(a);
        for (const b of street.stretches.slice(i + 1)) {
          if (keyOf(a) !== keyOf(b)) continue;
          if ([...nodesOf(b)].some((n) => nodes.has(n))) wrong.push(`${a.id} y ${b.id}`);
        }
      });
    }
    expect(wrong).toEqual([]);
  });

  it('un tramo sin alturas va como la cuadra con alturas más cercana', () => {
    const flip = (d: string) => (d === 'F' ? 'B' : d === 'B' ? 'F' : 'D');
    const hasHeights = (t: number) => segments.heights.slice(4 * t, 4 * t + 4).some((h) => h > 0);
    const lineOf = (t: number) => decodeLine(segments.geometry[t] ?? []);
    const wrong: string[] = [];
    let checked = 0;
    for (const street of streets.streets) {
      const blocks = street.segments.filter(hasHeights).map(lineOf);
      for (const stretch of street.stretches) {
        if (!stretch.askable || stretch.dir === 'D') continue;
        for (const t of stretch.segments.filter((x) => !hasHeights(x))) {
          const line = lineOf(t);
          const middle = pointAlong(line, lineLengthM(line) / 2);
          const nearest = blocks
            .map((block) => ({ block, ...projectOnLine(middle, block) }))
            .sort((a, b) => a.distanceM - b.distanceM)[0];
          if (!nearest || nearest.distanceM > 80) continue;
          const from = pointAlong(nearest.block, Math.max(0, nearest.alongM - 5));
          const to = pointAlong(
            nearest.block,
            Math.min(lineLengthM(nearest.block), nearest.alongM + 5),
          );
          const chord = bearingDeg(line[0] as LngLat, line[line.length - 1] as LngLat);
          const diff = Math.abs(angleDiff(bearingDeg(from, to), chord));
          // Solo los casos claros: una curva o un conector no dicen nada.
          if (diff > 30 && diff < 150) continue;
          checked++;
          const dir = segments.dir[t] ?? 'D';
          if ((diff < 90 ? dir : flip(dir)) !== stretch.dir)
            wrong.push(`${stretch.id} (tramo ${t})`);
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(wrong).toEqual([]);
  });

  it('una calle no repite una transversal a menos de 150 m', () => {
    const point = (n: number): LngLat => [
      (graphFile.nodes[2 * n] ?? 0) / 1e6,
      (graphFile.nodes[2 * n + 1] ?? 0) / 1e6,
    ];
    const wrong: string[] = [];
    for (const street of streets.streets) {
      street.crossings.forEach((a, i) => {
        for (const b of street.crossings.slice(i + 1)) {
          if (a.street === b.street && distanceM(point(a.node), point(b.node)) <= 150)
            wrong.push(`${street.name}: ${a.street}`);
        }
      });
    }
    expect(wrong).toEqual([]);
  });

  it('comparar una versión consigo misma no da cambios', () => {
    const snapshot = {
      version: segments.version,
      streets: streets.streets,
      segments,
      landmarks: landmarks.landmarks,
      barrios: [],
    };
    expect(isEmptyChanges(computeChanges(snapshot, { ...snapshot, version: 'otra' }))).toBe(true);
  });

  it('una tarjeta de mano única no se contradice con otra de las mismas alturas', () => {
    const rangeOf = (id: string) => /:(\d+)-(\d+)/.exec(id)?.slice(1).map(Number);
    const nodesOf = (s: DirectionStretch) =>
      s.segments.flatMap((t) => [segments.from[t], segments.to[t]]);
    const touching = (a: DirectionStretch, b: DirectionStretch) =>
      nodesOf(a).some((n) => nodesOf(b).includes(n));
    const wrong: string[] = [];
    for (const street of streets.streets) {
      const asked = street.stretches.filter((s) => s.askable && rangeOf(s.id));
      for (const a of asked.filter((s) => s.dir !== 'D')) {
        for (const b of asked) {
          // Contradice otra mano única al revés, o una doble mano.
          if (b === a || b.dir === a.dir) continue;
          const [a0 = 0, a1 = 0] = rangeOf(a.id) ?? [];
          const [b0 = 0, b1 = 0] = rangeOf(b.id) ?? [];
          const overlap = Math.min(a1, b1) - Math.max(a0, b0);
          const shorter = Math.min(a1 - a0, b1 - b0);
          if (shorter <= 0 || overlap < shorter / 2) continue;
          // Dos tramos seguidos pueden pisarse en los números: no es lo mismo que correr juntos.
          const inside = (a0 >= b0 && a1 <= b1) || (b0 >= a0 && b1 <= a1);
          if (inside || !touching(a, b)) wrong.push(`${a.id} y ${b.id}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('los patrones de sentido alternan y usan solo tramos que se preguntan', () => {
    const askable = new Set(
      streets.streets.flatMap((s) =>
        s.stretches.filter((st) => st.askable && st.dir !== 'D').flatMap((st) => st.segments),
      ),
    );
    const wrong: string[] = [];
    expect(patterns.patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns.patterns) {
      const label = pattern.streets.join(',');
      if (pattern.streets.length < 4 || pattern.along.length < 2) wrong.push(`${label}: chico`);
      pattern.streets.forEach((street, i) => {
        const node = pattern.nodes[i] as number;
        const own = [...graph.incidentSegments(node)].filter(
          (t) => graph.segment(t).street === street,
        );
        if (own.length === 0 || own.some((t) => !askable.has(t))) wrong.push(`${label}: ${street}`);
        if (i === 0) return;
        const turn = angleDiff(pattern.bearings[i - 1] ?? 0, pattern.bearings[i] ?? 0);
        if (Math.abs(turn) < 90) wrong.push(`${label}: ${street} no alterna`);
      });
    }
    expect(wrong).toEqual([]);
  });

  it('el router nunca usa una maniobra ilegal y su costo coincide con Dijkstra (1.000 pares)', () => {
    const router = new Router(graph, table);
    const random = createRandom(20_261_103);
    const legalEdges = Array.from({ length: graph.edgeCount }, (_, e) => e).filter((e) =>
      graph.isLegalEdge(e),
    );
    let total = 0;
    let found = 0;
    for (let i = 0; i < 1000; i++) {
      const start = random.pick(legalEdges);
      const target = new Set([random.int(graph.segmentCount)]);
      const t0 = performance.now();
      const astar = router.route(start, target);
      total += performance.now() - t0;
      const dijkstra = router.route(start, target, false);
      expect(astar === undefined).toBe(dijkstra === undefined);
      if (!astar || !dijkstra) continue;
      found++;
      expect(astar.cost).toBeCloseTo(dijkstra.cost, 4);
      for (let k = 1; k < astar.edges.length; k++) {
        const option = turnOptions(graph, astar.edges[k - 1] as number).find(
          (o) => o.edge === astar.edges[k],
        );
        expect(option?.legality.status).toBe('legal');
      }
    }
    expect(found).toBeGreaterThan(900);
    // Objetivo de la sección 7: calcular una ruta en menos de 50 ms.
    expect(total / 1000).toBeLessThan(50);
  }, 180_000);

  it('los datos pesan menos de 2,5 MB', () => {
    const total = [
      'tramos.json',
      'grafo.json',
      'calles.json',
      'patrones.json',
      'hitos.json',
      'vias.json',
      'barreras.json',
      'fondo.json',
      'barrios.json',
    ]
      .map((name) => statSync(join(DIR, name)).size)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(2.5 * 1024 * 1024);
  });
});
