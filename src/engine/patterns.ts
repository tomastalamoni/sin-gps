/**
 * Patrones de sentido (sección 8, paso 9): grupos de paralelas que alternan sentido, para
 * enseñarlos como regla. Se buscan recorriendo en orden las transversales de cada calle: una mano
 * única cruza hacia un lado, la siguiente hacia el otro. Cuenta solo lo que se puede preguntar:
 * una regla nunca se apoya en un tramo dudoso.
 */
import type { DirectionPattern, StreetCrossing, StreetRecord } from './data';
import { angleDiff, bearingDeg } from './geo';
import { edgeOf, type RoadGraph } from './graph';

/** Una regla empieza a valer con cuatro paralelas seguidas… */
const MIN_STREETS = 4;
/** …que alternan a lo largo de dos transversales: en una sola puede ser casualidad. */
const MIN_TRANSVERSALS = 2;
/** Una paralela cruza la transversal entre estos ángulos. */
const MIN_CROSSING_DEG = 60;
const MAX_CROSSING_DEG = 120;
/** Más lejos que esto, dos cruces seguidos ya no son paralelas vecinas. */
const MAX_GAP_M = 250;

interface Passage {
  street: number;
  node: number;
  /** Rumbo en que se circula al pasar por la esquina. */
  bearing: number;
  /** Cruza hacia la derecha de la transversal. */
  right: boolean;
}

interface Run {
  along: StreetRecord;
  passages: Passage[];
}

function travelBearing(graph: RoadGraph, segment: number, node: number): number {
  const edge = edgeOf(segment, graph.segment(segment).dir === 'B');
  return graph.head(edge) === node ? graph.endBearing(edge) : graph.startBearing(edge);
}

/** Cómo pasa la calle por la esquina, si es una mano única confiable que cruza la transversal. */
function passageAt(
  graph: RoadGraph,
  oneWay: ReadonlySet<number>,
  crossing: StreetCrossing,
  heading: number,
): Passage | undefined {
  const own = [...graph.incidentSegments(crossing.node)].filter(
    (t) => graph.segment(t).street === crossing.street,
  );
  if (own.length === 0 || own.some((t) => !oneWay.has(t))) return undefined;
  const bearings = own.map((t) => travelBearing(graph, t, crossing.node));
  const angles = bearings.map((b) => angleDiff(heading, b));
  const right = (angles[0] ?? 0) > 0;
  const crosses = angles.every((a) => {
    const size = Math.abs(a);
    return a > 0 === right && size >= MIN_CROSSING_DEG && size <= MAX_CROSSING_DEG;
  });
  if (!crosses) return undefined;
  return { street: crossing.street, node: crossing.node, bearing: bearings[0] ?? 0, right };
}

/** Las secuencias que alternan a lo largo de una calle, de cuatro paralelas o más. */
function runsAlong(graph: RoadGraph, oneWay: ReadonlySet<number>, along: StreetRecord): Run[] {
  const runs: Run[] = [];
  let passages: Passage[] = [];
  const close = () => {
    if (passages.length >= MIN_STREETS) runs.push({ along, passages });
    passages = [];
  };
  along.crossings.forEach((crossing, i) => {
    // El rumbo de la calle en esa esquina, de la transversal anterior a la siguiente.
    const before = along.crossings[Math.max(i - 1, 0)] as StreetCrossing;
    const after = along.crossings[Math.min(i + 1, along.crossings.length - 1)] as StreetCrossing;
    const heading = bearingDeg(graph.node(before.node), graph.node(after.node));
    const passage = passageAt(graph, oneWay, crossing, heading);
    if (!passage) {
      close();
      return;
    }
    const previous = passages.at(-1);
    const continues =
      previous !== undefined &&
      previous.right !== passage.right &&
      graph.nodeDistance(previous.node, passage.node) <= MAX_GAP_M;
    if (!continues) close();
    passages.push(passage);
  });
  close();
  return runs;
}

/** La misma secuencia da la misma clave, se la recorra para un lado o para el otro. */
function keyOf(streets: readonly number[]): string {
  const forward = streets.join(',');
  const backward = [...streets].reverse().join(',');
  return forward < backward ? forward : backward;
}

function contains(longer: readonly number[], shorter: readonly number[]): boolean {
  const text = `,${longer.join(',')},`;
  return (
    text.includes(`,${shorter.join(',')},`) ||
    text.includes(`,${[...shorter].reverse().join(',')},`)
  );
}

function windowsOf(streets: readonly number[]): string[] {
  const keys: string[] = [];
  for (let i = 0; i + MIN_STREETS <= streets.length; i++) {
    keys.push(keyOf(streets.slice(i, i + MIN_STREETS)));
  }
  return keys;
}

/** Los grupos de paralelas que alternan, los más grandes primero. */
export function detectPatterns(
  graph: RoadGraph,
  streets: readonly StreetRecord[],
): DirectionPattern[] {
  const oneWay = new Set(
    streets.flatMap((street) =>
      street.stretches.filter((s) => s.askable && s.dir !== 'D').flatMap((s) => s.segments),
    ),
  );
  const runs = streets.flatMap((street) => runsAlong(graph, oneWay, street));

  // Por cuántas transversales se cumple cada grupo de cuatro paralelas seguidas.
  const support = new Map<string, Set<StreetRecord>>();
  for (const { along, passages } of runs) {
    for (const key of windowsOf(passages.map((p) => p.street))) {
      support.set(key, (support.get(key) ?? new Set<StreetRecord>()).add(along));
    }
  }

  // En cada secuencia, los pedazos hechos de grupos que se cumplen en dos transversales o más. Si
  // el mismo pedazo sale de varias calles, se describe con la más importante.
  const candidates = new Map<string, Run>();
  const add = (run: Run) => {
    const key = keyOf(run.passages.map((p) => p.street));
    const known = candidates.get(key);
    if (!known || run.along.importance > known.along.importance) candidates.set(key, run);
  };
  for (const { along, passages } of runs) {
    const windows = windowsOf(passages.map((p) => p.street));
    let start = -1;
    windows.forEach((key, i) => {
      const holds = (support.get(key)?.size ?? 0) >= MIN_TRANSVERSALS;
      if (holds && start < 0) start = i;
      if (!holds && start >= 0) {
        add({ along, passages: passages.slice(start, i - 1 + MIN_STREETS) });
        start = -1;
      }
    });
    if (start >= 0) add({ along, passages: passages.slice(start) });
  }

  // Sin los que están contenidos en uno más largo.
  const ordered = [...candidates.entries()]
    .sort((a, b) => b[1].passages.length - a[1].passages.length || a[0].localeCompare(b[0]))
    .map(([, run]) => ({ run, streets: run.passages.map((p) => p.street) }));
  const kept = ordered.filter(
    (c, i) => !ordered.slice(0, i).some((longer) => contains(longer.streets, c.streets)),
  );

  return kept
    .map(({ run, streets: parallels }) => {
      const others = new Set(windowsOf(parallels).flatMap((key) => [...(support.get(key) ?? [])]));
      others.delete(run.along);
      const along = [
        run.along,
        ...[...others].sort((a, b) => b.importance - a.importance || a.code - b.code),
      ];
      return {
        streets: parallels,
        nodes: run.passages.map((p) => p.node),
        bearings: run.passages.map((p) => Math.round(p.bearing) % 360),
        along: along.map((s) => s.code),
      };
    })
    .sort(
      (a, b) =>
        b.streets.length * b.along.length - a.streets.length * a.along.length ||
        keyOf(a.streets).localeCompare(keyOf(b.streets)),
    );
}
