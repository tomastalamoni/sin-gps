/**
 * Cruce de sentidos con OSM y la red alrededor de cada esquina (sección 8, paso 8):
 * estados de confianza, calzadas separadas, semáforos, restricciones de giro y carriles de giro.
 */
import type { Confidence } from '../../src/engine/data';
import { SegmentFlag } from '../../src/engine/data';
import {
  angleDiff,
  bearingDeg,
  distanceM,
  lineLengthM,
  pointAlong,
  projectOnLine,
  type LngLat,
} from '../../src/engine/geo';
import { edgeOf, RoadGraph, type GraphInput } from '../../src/engine/graph';
import { nameSimilarity } from '../../src/engine/text';
import {
  classifyExits,
  isLeftTurn,
  isRightTurn,
  turnOptions,
  type TurnKind,
} from '../../src/engine/turns';
import type { GraphSegment } from '../05-graph';
import { TOLERANCES } from '../config';
import { GridIndex } from './grid';
import { osmNames, type OsmNode, type OsmRelation, type OsmWay } from './osm';
import { hasBothDirections, osmDirection } from './osm-match';

/**
 * Estados de confianza (sección 8):
 * - confirmado: el callejero y OSM coinciden;
 * - sin par: no se encontró la vía en OSM;
 * - en duda: las fuentes no coinciden, o el sentido es reversible;
 * - inferida: mano única sin alturas ni vecinos que la orienten, y sin OSM.
 * Sin alturas, CRECIENTE no dice hacia dónde: si los dos dicen mano única, manda OSM.
 */
/** Un tramo sin alturas más corto que esto toma el sentido de OSM solo si un vecino lo confirma. */
const ADOPT_MIN_LENGTH_M = 20;

export function assignConfidence(segments: GraphSegment[]): {
  disagreements: GraphSegment[];
  /** Tramos sin alturas que tomaron el sentido de OSM. */
  adopted: GraphSegment[];
} {
  const disagreements: GraphSegment[] = [];
  const adopted: GraphSegment[] = [];
  for (const segment of segments) {
    if (!segment.osm) {
      const oriented = segment.orientation === 'vecinos';
      segment.confidence = segment.direction !== 'D' && !oriented ? 'inferida' : 'sin-par';
      continue;
    }
    const osm = osmDirection(segment.osm);
    if (osm.dir === null) {
      segment.confidence = 'en-duda';
      continue;
    }
    if (segment.orientation === 'sin-alturas' && segment.direction !== 'D' && osm.dir !== 'D') {
      // Las vías de OSM tienen que correr paralelas al tramo (puede ser más de una si OSM la
      // corta a lo largo): si no, el sentido puede venir de una vía que cruza.
      if (segment.osm.ways.every((m) => m.parallel)) {
        segment.direction = osm.dir;
        segment.confidence = 'confirmado';
        adopted.push(segment);
      } else {
        segment.confidence = 'inferida';
      }
      continue;
    }
    if (segment.direction === osm.dir) {
      segment.confidence = 'confirmado';
      if (osm.divided) segment.flags |= SegmentFlag.divided;
      continue;
    }
    if (segment.direction === 'D' && hasBothDirections(segment.osm)) {
      segment.confidence = 'confirmado';
      segment.flags |= SegmentFlag.divided;
      continue;
    }
    segment.confidence = 'en-duda';
    disagreements.push(segment);
  }
  return { disagreements, adopted };
}

function segmentsByNode(segments: readonly GraphSegment[]): Map<number, GraphSegment[]> {
  const byNode = new Map<number, GraphSegment[]>();
  for (const s of segments) {
    for (const n of new Set([s.from, s.to])) byNode.set(n, [...(byNode.get(n) ?? []), s]);
  }
  return byNode;
}

/** El tránsito de una mano única entra al nodo por este tramo. */
function entersAt(s: GraphSegment, node: number): boolean {
  return (s.to === node && s.direction === 'F') || (s.from === node && s.direction === 'B');
}

/** El otro tramo, si en el nodo se tocan solo dos tramos de la misma calle y no llega otra. */
function continuation(
  s: GraphSegment,
  node: number,
  byNode: ReadonlyMap<number, GraphSegment[]>,
  junctions: ReadonlySet<number>,
): GraphSegment | undefined {
  const list = byNode.get(node) ?? [];
  const other = list.find((o) => o !== s);
  if (list.length !== 2 || junctions.has(node) || other?.code !== s.code) return undefined;
  return other;
}

/**
 * Un tramo que tomó el sentido de OSM tiene que seguir al vecino de la misma calle con alturas y
 * sentido confirmado: si los dos entran (o salen) por el mismo nodo, queda en duda. Uno corto,
 * donde el rumbo y el cruce con OSM son menos firmes, además necesita que un vecino lo confirme;
 * si no, queda con orientación inferida.
 */
export function checkAdoptedByContinuity(
  adopted: readonly GraphSegment[],
  segments: readonly GraphSegment[],
  junctions: ReadonlySet<number>,
): { doubtful: GraphSegment[]; unconfirmed: GraphSegment[] } {
  const byNode = segmentsByNode(segments);
  const doubtful: GraphSegment[] = [];
  const unconfirmed: GraphSegment[] = [];
  for (const s of adopted) {
    let agrees = false;
    let disagrees = false;
    for (const node of [s.from, s.to]) {
      const other = continuation(s, node, byNode, junctions);
      if (!other?.range || other.confidence !== 'confirmado' || other.direction === 'D') continue;
      if (entersAt(other, node) === entersAt(s, node)) disagrees = true;
      else agrees = true;
    }
    if (disagrees) {
      s.confidence = 'en-duda';
      doubtful.push(s);
    } else if (!agrees && lineLengthM(s.line) < ADOPT_MIN_LENGTH_M) {
      s.confidence = 'inferida';
      unconfirmed.push(s);
    }
  }
  return { doubtful, unconfirmed };
}

/**
 * Continuidad: en un nodo donde se tocan solo dos tramos de la misma calle (no llega otra calle),
 * una calle de mano única no cambia de sentido. Un tramo con orientación inferida se alinea con
 * su vecino ya orientado. Sigue siendo "inferida": nunca se pregunta, solo queda coherente para
 * manejar.
 */
export function alignInferredByContinuity(
  segments: GraphSegment[],
  junctions: ReadonlySet<number>,
): number {
  const byNode = segmentsByNode(segments);
  const settled = new Set(segments.filter((s) => s.confidence !== 'inferida'));
  let aligned = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (const s of segments) {
      if (settled.has(s) || s.direction === 'D') continue;
      for (const node of [s.from, s.to]) {
        const other = continuation(s, node, byNode, junctions);
        if (!other || !settled.has(other) || other.direction === 'D') continue;
        const direction = (s.from === node) === entersAt(other, node) ? 'F' : 'B';
        if (s.direction !== direction) aligned++;
        s.direction = direction;
        settled.add(s);
        changed = true;
        break;
      }
    }
  }
  return aligned;
}

function midpoint(line: readonly LngLat[]): LngLat {
  const a = line[0] as LngLat;
  const b = line[line.length - 1] as LngLat;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Dos calzadas corren lado a lado: separadas al menos 5 m y superpuestas en la mitad del más corto. */
const PAIR_MIN_OFFSET_M = 5;
const PAIR_MIN_OVERLAP = 0.5;

export function sideBySide(a: GraphSegment, b: GraphSegment): boolean {
  if (projectOnLine(midpoint(b.line), a.line).distanceM < PAIR_MIN_OFFSET_M) return false;
  return overlapLengthwise(a, b);
}

/** `b` corre a lo largo de `a`, no a continuación: se superponen en la mitad del más corto. */
export function overlapLengthwise(a: GraphSegment, b: GraphSegment): boolean {
  const ends = [b.line[0], b.line[b.line.length - 1]].map(
    (p) => projectOnLine(p as LngLat, a.line).alongM,
  );
  const lengthA = lineLengthM(a.line);
  const overlap = Math.min(Math.max(...ends), lengthA) - Math.max(Math.min(...ends), 0);
  return overlap >= PAIR_MIN_OVERLAP * Math.min(lengthA, lineLengthM(b.line));
}

/**
 * Calzadas separadas del callejero: dos tramos de la misma calle, de mano única y opuestos, a
 * menos de 40 m, paralelos y lado a lado (no uno a continuación del otro). Se preguntan juntos
 * como "doble mano (calzadas separadas)".
 */
export function findCarriagewayPairs(
  segments: readonly GraphSegment[],
): Map<GraphSegment, GraphSegment> {
  const pairs = new Map<GraphSegment, GraphSegment>();
  const index = new GridIndex<GraphSegment>();
  for (const s of segments) if (s.direction !== 'D') index.add(s, [midpoint(s.line)]);
  for (const s of segments) {
    if (s.direction === 'D' || pairs.has(s)) continue;
    const m = midpoint(s.line);
    const bearing = bearingDeg(s.line[0] as LngLat, s.line[s.line.length - 1] as LngLat);
    let best: { other: GraphSegment; d: number } | undefined;
    for (const other of index.near([m], TOLERANCES.splitCarriagewayM)) {
      if (other === s || other.code !== s.code || other.direction === 'D' || pairs.has(other))
        continue;
      const otherBearing = bearingDeg(
        other.line[0] as LngLat,
        other.line[other.line.length - 1] as LngLat,
      );
      const diff = Math.abs(angleDiff(bearing, otherBearing));
      // Las dos geometrías van hacia donde crece la numeración: paralelas, con sentidos opuestos.
      const parallel = diff < 30 || diff > 150;
      const opposite =
        diff < 30 ? other.direction !== s.direction : other.direction === s.direction;
      const d = distanceM(m, midpoint(other.line));
      if (!parallel || !opposite || d > TOLERANCES.splitCarriagewayM) continue;
      if (!sideBySide(s, other) || !sideBySide(other, s)) continue;
      if (!best || d < best.d) best = { other, d };
    }
    if (best) {
      pairs.set(s, best.other);
      pairs.set(best.other, s);
    }
  }
  return pairs;
}

/** Semáforos de OSM sin contar los peatonales, asignados a la esquina más cercana a menos de 25 m. */
export function assignSignals(nodes: readonly LngLat[], osmNodes: readonly OsmNode[]): Set<number> {
  const index = new GridIndex<number>();
  nodes.forEach((p, n) => {
    index.add(n, [p]);
  });
  const signals = new Set<number>();
  for (const node of osmNodes) {
    if (node.tags.highway !== 'traffic_signals') continue;
    if (node.tags.crossing && node.tags.crossing !== 'no') continue;
    let best: { n: number; d: number } | undefined;
    for (const n of index.near([node.point], TOLERANCES.signalM)) {
      const d = distanceM(node.point, nodes[n] as LngLat);
      if (d <= TOLERANCES.signalM && (!best || d < best.d)) best = { n, d };
    }
    if (best) signals.add(best.n);
  }
  return signals;
}

export interface RestrictionCandidate {
  id: number;
  from: number;
  node: number;
  to: number;
  /** Valor de la etiqueta restriction, por ejemplo no_left_turn. */
  kind: string;
  /** Los dos tramos se reconocieron por la vía de OSM, sin recurrir al rumbo. */
  direct: boolean;
}

export interface MappedRestrictions {
  /** De a 4: tramo de llegada, nodo, tramo de salida y tipo (0 prohibido, 1 obligatorio). */
  restrictions: number[];
  mapped: number;
  skipped: { id: number; reason: string }[];
}

const BEARING_LOOK_M = 15;
const MAX_BEARING_DIFF = 35;

/** Rumbos con los que una línea sale de un punto (dos, si el punto cae en el medio de la línea). */
function bearingsAway(line: readonly LngLat[], from: LngLat): number[] {
  let nearest = 0;
  line.forEach((p, i) => {
    if (distanceM(p, from) < distanceM(line[nearest] as LngLat, from)) nearest = i;
  });
  const out: number[] = [];
  const anchor = line[nearest] as LngLat;
  if (nearest < line.length - 1) out.push(bearingDeg(anchor, line[nearest + 1] as LngLat));
  if (nearest > 0) out.push(bearingDeg(anchor, line[nearest - 1] as LngLat));
  return out;
}

/**
 * Restricciones de giro de OSM llevadas a esquinas y tramos del grafo. Las condicionales o con
 * excepciones se ignoran. El resultado se valida después con validateRestrictions.
 */
export function mapRestrictions(
  relations: readonly OsmRelation[],
  viaNodes: ReadonlyMap<number, LngLat>,
  segments: readonly GraphSegment[],
  nodes: readonly LngLat[],
  incident: ReadonlyMap<number, number[]>,
  waysById: ReadonlyMap<number, OsmWay>,
): { candidates: RestrictionCandidate[]; skipped: { id: number; reason: string }[] } {
  const index = new GridIndex<number>();
  nodes.forEach((p, n) => {
    index.add(n, [p]);
  });
  const result = {
    candidates: [] as RestrictionCandidate[],
    skipped: [] as { id: number; reason: string }[],
  };
  const usesWay = (t: number, wayId: number) =>
    segments[t]?.osm?.ways.some((m) => m.way.id === wayId) ?? false;

  // OSM parte las vías distinto que el callejero: si no hay cruce directo, se busca el tramo de la
  // esquina que sale con el mismo rumbo que la vía y tiene un nombre parecido.
  const identify = (around: readonly number[], wayId: number, node: number): number | undefined => {
    const direct = around.filter((t) => usesWay(t, wayId));
    if (direct.length === 1) return direct[0];
    // Si la vía sigue de largo por la esquina, no se sabe de qué lado viene: se descarta.
    if (direct.length > 1) return undefined;
    const way = waysById.get(wayId);
    const corner = nodes[node];
    if (!way || !corner) return undefined;
    const wayBearings = bearingsAway(way.line, corner);
    let best: { t: number; diff: number } | undefined;
    for (const t of around) {
      const s = segments[t];
      if (!s) continue;
      const names = osmNames(way.tags);
      if (names.length > 0 && !names.some((n) => nameSimilarity(s.row.official, n) >= 0.5))
        continue;
      const line = s.from === node ? s.line : [...s.line].reverse();
      const segmentBearing = bearingDeg(line[0] as LngLat, pointAlong(line, BEARING_LOOK_M));
      const diff = Math.min(...wayBearings.map((b) => Math.abs(angleDiff(b, segmentBearing))));
      if (diff <= MAX_BEARING_DIFF && (!best || diff < best.diff)) best = { t, diff };
    }
    return best?.t;
  };

  for (const relation of relations) {
    const kind = relation.tags.restriction;
    if (
      !kind ||
      relation.tags.except ||
      Object.keys(relation.tags).some((k) => k.includes('conditional'))
    ) {
      result.skipped.push({ id: relation.id, reason: 'condicional, con excepciones o sin tipo' });
      continue;
    }
    const from = relation.members.find((m) => m.role === 'from' && m.type === 'way');
    const to = relation.members.find((m) => m.role === 'to' && m.type === 'way');
    const via = relation.members.find((m) => m.role === 'via');
    if (!from || !to || via?.type !== 'node') {
      result.skipped.push({ id: relation.id, reason: 'la esquina no es un nodo' });
      continue;
    }
    const point = viaNodes.get(via.ref);
    if (!point) {
      result.skipped.push({ id: relation.id, reason: 'nodo via sin coordenadas' });
      continue;
    }
    const node = [...index.near([point], TOLERANCES.restrictionViaM)]
      .map((n) => ({ n, d: distanceM(point, nodes[n] as LngLat) }))
      .filter((x) => x.d <= TOLERANCES.restrictionViaM)
      .sort((a, b) => a.d - b.d)[0]?.n;
    if (node === undefined) {
      result.skipped.push({ id: relation.id, reason: 'fuera del grafo' });
      continue;
    }
    const around = incident.get(node) ?? [];
    const fromSegment = identify(around, from.ref, node);
    const toSegment = identify(around, to.ref, node);
    if (fromSegment === undefined || toSegment === undefined) {
      result.skipped.push({ id: relation.id, reason: 'no se reconocen los tramos' });
      continue;
    }
    result.candidates.push({
      id: relation.id,
      from: fromSegment,
      node,
      to: toSegment,
      kind,
      direct: usesWay(fromSegment, from.ref) && usesWay(toSegment, to.ref),
    });
  }
  return result;
}

function expectedTurn(kind: string, turn: TurnKind): boolean {
  if (kind.endsWith('left_turn')) return isLeftTurn(turn);
  if (kind.endsWith('right_turn')) return isRightTurn(turn);
  if (kind.endsWith('straight_on')) return turn === 'seguir';
  if (kind.endsWith('u_turn')) return turn === 'vuelta-en-u';
  return false;
}

/**
 * Valida cada restricción contra un grafo sin restricciones:
 * - un "only_*" mal ubicado bloquea todas las demás salidas, así que exige reconocer los dos
 *   tramos por su vía de OSM;
 * - el giro tiene que coincidir con la geometría (un no_left_turn tiene que ser una izquierda);
 * - si las restricciones dejan una llegada sin ninguna salida legal, se descartan: casi siempre es
 *   un error de mapeo.
 */
export function validateRestrictions(
  candidates: readonly RestrictionCandidate[],
  base: GraphInput,
): MappedRestrictions {
  const graph = new RoadGraph(base);
  const result: MappedRestrictions = { restrictions: [], mapped: 0, skipped: [] };
  const arriving = (segment: number, node: number) =>
    edgeOf(segment, graph.segment(segment).to !== node);
  const leaving = (segment: number, node: number) =>
    edgeOf(segment, graph.segment(segment).from !== node);

  const accepted: RestrictionCandidate[] = [];
  for (const c of candidates) {
    if (c.kind.startsWith('only_') && !c.direct) {
      result.skipped.push({ id: c.id, reason: 'obligatoria sin reconocer las vías de OSM' });
      continue;
    }
    const arrival = arriving(c.from, c.node);
    if (!graph.isLegalEdge(arrival)) {
      result.skipped.push({ id: c.id, reason: 'no se puede llegar por ese tramo' });
      continue;
    }
    // Con todas las salidas: una vuelta en U a la otra calzada no se ofrece, pero existe.
    const turn =
      c.from === c.to
        ? 'vuelta-en-u'
        : classifyExits(graph, arrival).find((o) => o.edge === leaving(c.to, c.node))?.kind;
    if (!turn || !expectedTurn(c.kind, turn)) {
      result.skipped.push({ id: c.id, reason: 'el giro no coincide con la geometría' });
      continue;
    }
    accepted.push(c);
  }

  // Dos obligatorias distintas para la misma llegada se contradicen.
  const groups = new Map<string, RestrictionCandidate[]>();
  for (const c of accepted)
    groups.set(`${c.from}:${c.node}`, [...(groups.get(`${c.from}:${c.node}`) ?? []), c]);
  const toNumbers = (list: readonly RestrictionCandidate[]) =>
    list.flatMap((c) => [c.from, c.node, c.to, c.kind.startsWith('only_') ? 1 : 0]);
  const withRestrictions = new RoadGraph({ ...base, restrictions: toNumbers(accepted) });
  const legalExits = (g: RoadGraph, edge: number) =>
    turnOptions(g, edge).filter((o) => o.kind !== 'vuelta-en-u' && o.legality.status === 'legal')
      .length;

  for (const list of groups.values()) {
    const first = list[0] as RestrictionCandidate;
    const mandatory = new Set(list.filter((c) => c.kind.startsWith('only_')).map((c) => c.to));
    const edge = arriving(first.from, first.node);
    let reason: string | undefined;
    if (mandatory.size > 1) reason = 'obligatorias que se contradicen';
    else if (legalExits(withRestrictions, edge) === 0 && legalExits(graph, edge) > 0)
      reason = 'dejaba la esquina sin salida';
    if (reason) {
      for (const c of list) result.skipped.push({ id: c.id, reason });
      continue;
    }
    result.restrictions.push(...toNumbers(list));
    result.mapped += list.length;
  }
  return result;
}

/** Carriles de giro a la izquierda de OSM (turn:lanes) en la esquina donde termina cada vía. */
export function leftTurnLanes(
  segments: readonly GraphSegment[],
  nodes: readonly LngLat[],
): number[] {
  const out: number[] = [];
  const hasLeft = (value: string | undefined) => /(^|[|;])(slight_)?left/.test(value ?? '');
  segments.forEach((segment, t) => {
    for (const match of segment.osm?.ways ?? []) {
      const way: OsmWay = match.way;
      const forward = hasLeft(way.tags['turn:lanes']) || hasLeft(way.tags['turn:lanes:forward']);
      const backward = hasLeft(way.tags['turn:lanes:backward']);
      const ends: LngLat[] = [];
      if (forward) ends.push(way.line[way.line.length - 1] as LngLat);
      if (backward) ends.push(way.line[0] as LngLat);
      for (const end of ends) {
        for (const node of [segment.from, segment.to]) {
          if (distanceM(end, nodes[node] as LngLat) <= TOLERANCES.restrictionViaM)
            out.push(t, node);
        }
      }
    }
  });
  return out;
}

export function confidenceRank(confidence: Confidence): number {
  return { 'en-duda': 0, inferida: 1, 'sin-par': 2, confirmado: 3 }[confidence];
}
