/**
 * Por calle (sección 8, paso 9): tramos de sentido homogéneo, dónde cambia el sentido y la
 * secuencia ordenada de transversales.
 *
 * Todo se ordena por la numeración. Un tramo con alturas ya tiene la geometría hacia donde crece.
 * Uno sin alturas que corre al lado de una cuadra va como ella; si no, sigue a su vecino (y así,
 * en cadena). Una pieza suelta va como la cuadra con alturas más cercana y, si la calle no tiene
 * ninguna, de oeste a este (o de sur a norte, si corre así). Si no queda claro, no se pregunta.
 *
 * Un tramo de sentido junta cuadras que se tocan, con el mismo sentido y que se preguntan igual:
 * no mezcla cuadras que se pueden preguntar con cuadras dudosas o de la zona de borde.
 */
import {
  isAskableConfidence,
  SegmentFlag,
  type Confidence,
  type Direction,
  type DirectionStretch,
  type StreetCrossing,
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
import { cardIds } from '../../src/engine/ids';
import type { GraphSegment } from '../05-graph';
import { confidenceRank, overlapLengthwise, sideBySide } from './network';

export interface StreetLayout {
  /** Tramos de la calle en el orden de la numeración (las calzadas de un grupo, juntas). */
  ordered: number[];
  stretches: DirectionStretch[];
  crossings: StreetCrossing[];
  /** Grupos de calzadas que se unieron por su numeración (ver groupCarriageways). */
  pairedByHeights: number;
  /** Cuadras con la misma numeración y sentidos opuestos que no se pudieron unir: no se preguntan. */
  conflicting: GraphSegment[];
}

/** Dos cruces con la misma calle a menos de esto son uno: las calzadas de una avenida. */
const SAME_CROSSING_M = 150;
/** Un tramo sin alturas corre al lado de una cuadra si su centro está a menos de esto de ella… */
const NEAR_HEIGHTS_M = 80;
/** …y con menos de esta diferencia de rumbo, en un sentido o en el otro. */
const ALONGSIDE_MAX_DEG = 45;
/** Una pieza suelta que forma entre 60° y 120° con la cuadra con alturas más cercana no se orienta. */
const AMBIGUOUS_MIN_DEG = 60;
/** Dos calzadas con la misma numeración se unen si están a menos de esto. */
const WIDE_PAIR_MAX_M = 150;
/** Si un tramo no quedó orientado, dos manos únicas son opuestas con esta diferencia de rumbo. */
const OPPOSITE_MIN_DEG = 150;
/** El sentido cambia en la punta de arriba del tramo: a menos de estos números del final. */
const TOP_END = 30;

/** Hacia dónde crece la numeración en un tramo: del nodo `start` al nodo `end`. */
interface Orientation {
  start: number;
  end: number;
  /** No quedó claro (una rama, una pieza suelta): el tramo no se pregunta. */
  ambiguous: boolean;
}

/** La cuadra con alturas más cercana a un punto. */
interface BlockMatch {
  block: GraphSegment;
  alongM: number;
  distanceM: number;
  /** El punto cae a lo largo de la cuadra, no antes ni después de ella. */
  beside: boolean;
}

/** Un tramo, o las calzadas de un grupo, que se preguntan juntas. */
interface Unit {
  segments: GraphSegment[];
  nodes: number[];
  split: boolean;
  dir: Direction;
  askable: boolean;
  /** Posiciones en la numeración donde empieza y termina. */
  low: number;
  high: number;
}

type Span = readonly [number, number];

function flip(dir: Direction): Direction {
  return dir === 'F' ? 'B' : dir === 'B' ? 'F' : 'D';
}

function startHeight(s: GraphSegment): number {
  const values = [s.heights[0], s.heights[2]].filter((h) => h > 0);
  return values.length > 0 ? Math.min(...values) : 0;
}

/** Altura de la esquina donde termina el tramo: la que sigue a la última de la cuadra. */
function endHeight(s: GraphSegment): number {
  const last = Math.max(s.heights[1], s.heights[3]);
  return last > 0 ? last + 1 : 0;
}

function isAskableSegment(s: GraphSegment): boolean {
  return isAskableConfidence(s.confidence ?? 'en-duda') && (s.flags & SegmentFlag.border) === 0;
}

function first(line: readonly LngLat[]): LngLat {
  return line[0] as LngLat;
}

function last(line: readonly LngLat[]): LngLat {
  return line[line.length - 1] as LngLat;
}

function middle(line: readonly LngLat[]): LngLat {
  return pointAlong(line, lineLengthM(line) / 2);
}

function chordBearing(s: GraphSegment): number {
  return bearingDeg(first(s.line), last(s.line));
}

function segmentsByNode(segments: readonly GraphSegment[]): Map<number, GraphSegment[]> {
  const byNode = new Map<number, GraphSegment[]>();
  for (const s of segments) {
    for (const n of new Set([s.from, s.to])) byNode.set(n, [...(byNode.get(n) ?? []), s]);
  }
  return byNode;
}

/** Los tramos de `among` conectados con `seed` por sus nodos. */
function pieceOf(seed: GraphSegment, among: readonly GraphSegment[]): GraphSegment[] {
  const byNode = segmentsByNode(among);
  const piece = new Set([seed]);
  const queue = [seed];
  for (let s = queue.pop(); s; s = queue.pop()) {
    for (const n of [s.from, s.to]) {
      for (const o of byNode.get(n) ?? []) {
        if (piece.has(o)) continue;
        piece.add(o);
        queue.push(o);
      }
    }
  }
  return among.filter((s) => piece.has(s));
}

function nearestBlock(point: LngLat, blocks: readonly GraphSegment[]): BlockMatch | undefined {
  let best: BlockMatch | undefined;
  for (const block of blocks) {
    const { alongM, distanceM: distance } = projectOnLine(point, block.line);
    if (best && distance >= best.distanceM) continue;
    const beside = alongM > 0.5 && alongM < lineLengthM(block.line) - 0.5;
    best = { block, alongM, distanceM: distance, beside };
  }
  return best;
}

/** Rumbo de la cuadra en ese punto: hacia donde crece la numeración. */
function blockBearing({ block, alongM }: BlockMatch): number {
  const length = lineLengthM(block.line);
  return bearingDeg(
    pointAlong(block.line, Math.max(0, alongM - 5)),
    pointAlong(block.line, Math.min(length, alongM + 5)),
  );
}

/** La numeración en ese punto de la cuadra; antes o después de ella, sigue contando por metro. */
function numberingAt(match: BlockMatch): number {
  const { block, alongM, distanceM: distance, beside } = match;
  const start = startHeight(block);
  const end = endHeight(block);
  if (beside) return start + ((end - start) * alongM) / lineLengthM(block.line);
  return alongM <= 0.5 ? start - distance : end + distance;
}

/** Los dos nodos más lejanos entre sí, aproximados: el más lejano de uno y el más lejano de ese. */
function farthestPair(nodes: readonly number[], at: (n: number) => LngLat): [number, number] {
  const farthest = (from: number) =>
    nodes.reduce((best, n) =>
      distanceM(at(from), at(n)) > distanceM(at(from), at(best)) ? n : best,
    );
  const a = farthest(nodes[0] as number);
  return [a, farthest(a)];
}

/** Ordena dos nodos de oeste a este o, si corren de norte a sur, de sur a norte. */
function westSouthFirst([a, b]: [number, number], at: (n: number) => LngLat): [number, number] {
  const [x1, y1] = at(a);
  const [x2, y2] = at(b);
  const eastWest = Math.abs(x2 - x1) * Math.cos((y1 * Math.PI) / 180) >= Math.abs(y2 - y1);
  return (eastWest ? x2 < x1 : y2 < y1) ? [b, a] : [a, b];
}

/** Metros de cada nodo a lo largo del eje que va de `from` a `to`. */
function alongAxis(
  nodes: readonly number[],
  at: (n: number) => LngLat,
  from: number,
  to: number,
): Map<number, number> {
  const axis = bearingDeg(at(from), at(to));
  return new Map(
    nodes.map((n) => {
      if (n === from) return [n, 0];
      const off = (angleDiff(axis, bearingDeg(at(from), at(n))) * Math.PI) / 180;
      return [n, distanceM(at(from), at(n)) * Math.cos(off)];
    }),
  );
}

/**
 * Hacia dónde crece la numeración en cada tramo y la posición de cada nodo en ella: la altura de la
 * esquina (`heights`) o, donde no hay alturas, la de la cuadra más cercana.
 */
function orientByNumbering(segments: readonly GraphSegment[]): {
  orientation: Map<GraphSegment, Orientation>;
  position: Map<number, number>;
  heights: Map<number, number>;
  at: (n: number) => LngLat;
} {
  const orientation = new Map<GraphSegment, Orientation>();
  const coords = new Map<number, LngLat>();
  for (const s of segments) {
    coords.set(s.from, first(s.line));
    coords.set(s.to, last(s.line));
  }
  const at = (n: number): LngLat => coords.get(n) ?? [0, 0];
  // La altura de una esquina es la menor que la toca: donde arranca una cuadra o donde termina otra.
  const heights = new Map<number, number>();
  const lower = (node: number, value: number) => {
    const current = heights.get(node);
    if (value > 0 && (current === undefined || value < current)) heights.set(node, value);
  };
  const withHeights = segments.filter((s) => s.range);
  for (const s of withHeights) {
    orientation.set(s, { start: s.from, end: s.to, ambiguous: false });
    lower(s.from, startHeight(s));
    lower(s.to, endHeight(s));
  }

  // Un tramo sin alturas que corre al lado de una cuadra (una calzada, la línea central de una
  // cuadra con dos calzadas) va como ella, aunque la toque en una esquina.
  for (const s of segments) {
    if (s.range) continue;
    const near = nearestBlock(middle(s.line), withHeights);
    if (!near?.beside || near.distanceM > NEAR_HEIGHTS_M) continue;
    const diff = Math.abs(angleDiff(chordBearing(s), blockBearing(near)));
    if (diff > ALONGSIDE_MAX_DEG && diff < 180 - ALONGSIDE_MAX_DEG) continue;
    orientation.set(s, {
      start: diff > 90 ? s.to : s.from,
      end: diff > 90 ? s.from : s.to,
      ambiguous: false,
    });
  }

  const byNode = segmentsByNode(segments);
  /** Hacia dónde crece la numeración al salir del nodo por otro tramo: +1, −1 o se contradice. */
  const flowAt = (node: number) => {
    const flows = new Set<number>();
    let ambiguous = false;
    for (const o of byNode.get(node) ?? []) {
      const known = orientation.get(o);
      if (!known) continue;
      if (known.end === node) flows.add(1);
      if (known.start === node) flows.add(-1);
      ambiguous ||= known.ambiguous;
    }
    if (flows.size === 0) return undefined;
    if (flows.size > 1) return 'conflict' as const;
    return { flow: flows.has(1) ? 1 : -1, ambiguous };
  };
  const orient = (s: GraphSegment, node: number, flow: number, ambiguous: boolean) => {
    const other = s.from === node ? s.to : s.from;
    orientation.set(
      s,
      flow > 0 ? { start: node, end: other, ambiguous } : { start: other, end: node, ambiguous },
    );
  };

  for (let left = segments.filter((s) => !orientation.has(s)); left.length > 0;) {
    let progress = false;
    for (const s of left) {
      const a = flowAt(s.from);
      const b = flowAt(s.to);
      const fromA = typeof a === 'object' ? a : undefined;
      const fromB = typeof b === 'object' ? b : undefined;
      // Sigue a su vecino solo si las dos puntas dicen lo mismo y ninguna es una esquina donde la
      // numeración llega y sigue por otro lado (ahí puede ser una rama).
      const unclear =
        a === 'conflict' ||
        b === 'conflict' ||
        (fromA !== undefined && fromB !== undefined && fromA.flow > 0 !== fromB.flow < 0);
      if (fromA) orient(s, s.from, fromA.flow, fromA.ambiguous || unclear);
      else if (fromB) orient(s, s.to, fromB.flow, fromB.ambiguous || unclear);
      else continue;
      progress = true;
    }
    left = left.filter((s) => !orientation.has(s));
    if (progress || left.length === 0) continue;

    // Una rama que sale de una esquina donde la numeración llega y sigue: no se sabe para dónde va.
    const branch = left.find((s) => flowAt(s.from) === 'conflict' || flowAt(s.to) === 'conflict');
    if (branch) {
      orient(branch, flowAt(branch.from) === 'conflict' ? branch.from : branch.to, 1, true);
      left = left.filter((s) => s !== branch);
      continue;
    }

    // Una pieza suelta: sus dos puntas más lejanas marcan para dónde corre.
    const piece = pieceOf(left[0] as GraphSegment, left);
    const nodes = [...new Set(piece.flatMap((s) => [s.from, s.to]))];
    const [e1, e2] = farthestPair(nodes, at);
    let start = westSouthFirst([e1, e2], at)[0];
    let ambiguous = false;
    const center: LngLat = [(at(e1)[0] + at(e2)[0]) / 2, (at(e1)[1] + at(e2)[1]) / 2];
    const near = nearestBlock(center, withHeights);
    if (near) {
      const diff = Math.abs(angleDiff(bearingDeg(at(e1), at(e2)), blockBearing(near)));
      start = diff > 90 ? e2 : e1;
      ambiguous = diff > AMBIGUOUS_MIN_DEG && diff < 180 - AMBIGUOUS_MIN_DEG;
    }
    const seed = piece.find((s) => s.from === start || s.to === start) as GraphSegment;
    orient(seed, start, 1, ambiguous);
    left = left.filter((s) => s !== seed);
  }

  // Posición de cada nodo: su altura, la de la cuadra más cercana o, si la calle no tiene alturas,
  // los metros a lo largo de la calle.
  const nodes = [...coords.keys()];
  const blocks = withHeights.filter((s) => startHeight(s) > 0 && endHeight(s) > 0);
  const position = new Map(heights);
  if (blocks.length > 0) {
    for (const node of nodes) {
      if (position.has(node)) continue;
      const near = nearestBlock(at(node), blocks);
      if (near) position.set(node, numberingAt(near));
    }
  } else {
    const [from, to] = westSouthFirst(farthestPair(nodes, at), at);
    for (const [node, metres] of alongAxis(nodes, at, from, to)) position.set(node, metres);
  }
  return { orientation, position, heights, at };
}

/** Los dos tramos, primero el más corto. */
function byLength(a: GraphSegment, b: GraphSegment): [GraphSegment, GraphSegment] {
  return lineLengthM(a.line) <= lineLengthM(b.line) ? [a, b] : [b, a];
}

/** Rumbo en que se circula por un tramo de mano única. */
function travelBearing(s: GraphSegment): number {
  return s.direction === 'B' ? (chordBearing(s) + 180) % 360 : chordBearing(s);
}

/** Lo que hace falta saber de cada tramo para compararlo con otro de la misma calle. */
interface Numbering {
  spanOf: (s: GraphSegment) => Span;
  /** Sentido respecto de la numeración, si quedó claro. */
  dirOf: (s: GraphSegment) => Direction | undefined;
}

/** Casi la misma numeración y a menos de 150 m: están a la misma altura de la calle. */
function sameStretchOfStreet(a: GraphSegment, b: GraphSegment, { spanOf }: Numbering): boolean {
  const [a0, a1] = spanOf(a);
  const [b0, b1] = spanOf(b);
  const overlap = Math.min(a1, b1) - Math.max(a0, b0);
  const shorter = Math.min(a1 - a0, b1 - b0);
  if (shorter <= 0 || overlap < shorter / 2) return false;
  const [near, far] = byLength(a, b);
  return projectOnLine(middle(near.line), far.line).distanceM <= WIDE_PAIR_MAX_M;
}

/** Dos manos únicas opuestas a la misma altura de la calle: una de cada lado. */
function facing(a: GraphSegment, b: GraphSegment, numbering: Numbering): boolean {
  const [dirA, dirB] = [numbering.dirOf(a), numbering.dirOf(b)];
  const opposite =
    dirA && dirB
      ? dirA !== dirB
      : Math.abs(angleDiff(travelBearing(a), travelBearing(b))) >= OPPOSITE_MIN_DEG;
  return opposite && sameStretchOfStreet(a, b, numbering);
}

/** Corren lado a lado, no una a continuación de la otra (como dos cuadras con números que se pisan). */
function runAlongside(a: GraphSegment, b: GraphSegment): boolean {
  const [near, far] = byLength(a, b);
  return sideBySide(far, near);
}

/**
 * Las calzadas de una avenida que se preguntan juntas: los pares de la sección 8, más las que ese
 * emparejado no unió porque están a más de 40 m (como Alem, con el Paseo del Bajo en el medio) o
 * porque sus cuadras no coinciden: sentidos opuestos, la misma numeración y lado a lado.
 * Preguntarlas por separado diría "mano única" donde la avenida es doble mano.
 */
function groupCarriageways(
  segments: readonly GraphSegment[],
  pairs: ReadonlyMap<GraphSegment, GraphSegment>,
  numbering: Numbering,
): { groups: GraphSegment[][]; pairedByHeights: number } {
  const root = new Map(segments.map((s) => [s, s]));
  const find = (s: GraphSegment): GraphSegment => {
    let r = s;
    for (let next = root.get(r); next && next !== r; next = root.get(r)) r = next;
    return r;
  };
  for (const s of segments) {
    const pair = pairs.get(s);
    if (pair && root.has(pair)) root.set(find(pair), find(s));
  }
  const oneWay = segments.filter((s) => s.direction !== 'D');
  oneWay.forEach((a, i) => {
    for (const b of oneWay.slice(i + 1)) {
      if (facing(a, b, numbering) && runAlongside(a, b)) root.set(find(b), find(a));
    }
  });
  const byRoot = new Map<GraphSegment, GraphSegment[]>();
  for (const s of segments) byRoot.set(find(s), [...(byRoot.get(find(s)) ?? []), s]);
  const groups = [...byRoot.values()];
  const isPlainPair = (g: readonly GraphSegment[]) =>
    g.length === 2 && pairs.get(g[0] as GraphSegment) === g[1];
  return {
    groups,
    pairedByHeights: groups.filter((g) => g.length > 1 && !isPlainPair(g)).length,
  };
}

/**
 * Cuadras de mano única que no se pueden preguntar porque dirían otra cosa que la calle a esa
 * altura: una lateral que corre al lado de una doble mano, o una que enfrenta a otra sin correr lado
 * a lado (una transición, un pedazo de rampa). Entre dos sueltas, la más corta, o las dos si son
 * parecidas.
 */
function findConflicts(
  segments: readonly GraphSegment[],
  grouped: ReadonlySet<GraphSegment>,
  numbering: Numbering,
): Set<GraphSegment> {
  const oneWay = segments.filter((s) => s.direction !== 'D');
  const twoWay = segments.filter((s) => s.direction === 'D');
  const lengthOf = (s: GraphSegment) => numbering.spanOf(s)[1] - numbering.spanOf(s)[0];
  return new Set(
    oneWay.filter((a) => {
      if (grouped.has(a) || !isAskableSegment(a)) return false;
      // A lo largo de una doble mano, a cualquier distancia: puede ser una línea pegada a la central.
      const lateral = twoWay.some((b) => {
        const [near, far] = byLength(a, b);
        return sameStretchOfStreet(a, b, numbering) && overlapLengthwise(far, near);
      });
      return (
        lateral ||
        oneWay.some(
          (b) =>
            a !== b && facing(a, b, numbering) && (grouped.has(b) || lengthOf(a) < 2 * lengthOf(b)),
        )
      );
    }),
  );
}

/**
 * Arma el layout de una calle. `index` da el índice de exportación de cada tramo y `streetsAt`,
 * las calles que llegan a cada nodo.
 */
export function layoutStreet(
  code: number,
  segments: readonly GraphSegment[],
  index: ReadonlyMap<GraphSegment, number>,
  pairs: ReadonlyMap<GraphSegment, GraphSegment>,
  streetsAt: (node: number) => number[],
  levelOf: (code: number) => number,
): StreetLayout {
  const indexOf = (s: GraphSegment) => {
    const i = index.get(s);
    if (i === undefined) throw new Error(`Calle ${code}: el tramo ${s.row.id} no está en el grafo`);
    return i;
  };
  const { orientation, position, heights, at } = orientByNumbering(segments);
  const positionOf = (n: number) => position.get(n) ?? 0;
  /** Sentido respecto de la numeración. */
  const dirOf = (s: GraphSegment): Direction =>
    orientation.get(s)?.start === s.to && s.from !== s.to ? flip(s.direction) : s.direction;
  const spanOf = (s: GraphSegment): Span => {
    if (s.range) return s.range;
    const ends = [positionOf(s.from), positionOf(s.to)];
    return [Math.min(...ends), Math.max(...ends)];
  };

  const numbering: Numbering = {
    spanOf,
    dirOf: (s) => (orientation.get(s)?.ambiguous ? undefined : dirOf(s)),
  };
  const { groups, pairedByHeights } = groupCarriageways(segments, pairs, numbering);
  const grouped = new Set(groups.filter((g) => g.length > 1).flat());
  const conflicting = findConflicts(segments, grouped, numbering);

  const firstIndex = (u: Unit) => Math.min(...u.segments.map(indexOf));
  const units = groups
    .map((members): Unit => {
      const positions = members.flatMap((m) => [positionOf(m.from), positionOf(m.to)]);
      const split = members.length > 1;
      const dir = split ? 'D' : dirOf(members[0] as GraphSegment);
      // Una doble mano tiene la misma respuesta en cualquier orientación.
      const clear = dir === 'D' || !orientation.get(members[0] as GraphSegment)?.ambiguous;
      return {
        segments: members,
        nodes: [...new Set(members.flatMap((m) => [m.from, m.to]))],
        split,
        dir,
        askable: clear && members.every((m) => isAskableSegment(m) && !conflicting.has(m)),
        low: Math.min(...positions),
        high: Math.max(...positions),
      };
    })
    .sort((a, b) => a.low - b.low || a.high - b.high || firstIndex(a) - firstIndex(b));

  // Tramos de sentido: unidades que se tocan, con el mismo sentido y que se preguntan igual.
  const root = units.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (root[r] !== r) r = root[r] ?? r;
    return r;
  };
  const key = (u: Unit) => `${u.dir}${u.split ? 's' : ''}${u.askable ? 'p' : ''}`;
  const unitsAt = new Map<number, number[]>();
  units.forEach((u, i) => {
    for (const n of u.nodes) unitsAt.set(n, [...(unitsAt.get(n) ?? []), i]);
  });
  for (const list of unitsAt.values()) {
    for (const i of list) {
      for (const j of list) {
        if (i >= j || key(units[i] as Unit) !== key(units[j] as Unit)) continue;
        const a = find(i);
        const b = find(j);
        if (a !== b) root[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }
  const merged = new Map<number, Unit[]>();
  units.forEach((u, i) => {
    const r = find(i);
    merged.set(r, [...(merged.get(r) ?? []), u]);
  });

  const stretches: DirectionStretch[] = [];
  const stretchNodes: Set<number>[] = [];
  const usedIds = new Set<string>();
  let noHeightCount = 0;
  for (const group of merged.values()) {
    const all = group.flatMap((u) => u.segments);
    const ranges = all.flatMap((s) => (s.range ? [s.range] : []));
    let range =
      ranges.length > 0
        ? `${Math.min(...ranges.map((r) => r[0]))}-${Math.max(...ranges.map((r) => r[1]))}`
        : `sa${++noHeightCount}`;
    const base = range;
    for (let suffix = 2; usedIds.has(range); suffix++) range = `${base}-v${suffix}`;
    usedIds.add(range);
    const confidence = all
      .map((s) => s.confidence ?? 'en-duda')
      .reduce<Confidence>(
        (worst, c) => (confidenceRank(c) < confidenceRank(worst) ? c : worst),
        'confirmado',
      );
    const head = group[0] as Unit;
    stretches.push({
      id: cardIds.direction(code, range),
      segments: all.map(indexOf),
      dir: head.dir,
      confidence,
      askable: head.askable,
      splitCarriageway: head.split,
    });
    stretchNodes.push(new Set(group.flatMap((u) => u.nodes)));
  }

  // Dónde cambia el sentido: en la punta de arriba del tramo, la calle más importante que cruza.
  // Solo si lo que sigue se puede preguntar: un tramo dudoso no alcanza para afirmarlo.
  stretches.forEach((stretch, k) => {
    const nodes = [...(stretchNodes[k] ?? [])];
    const top = Math.max(...nodes.map(positionOf));
    const end = nodes
      .filter((n) => positionOf(n) >= top - TOP_END)
      .sort((a, b) => positionOf(b) - positionOf(a))
      .find((n) =>
        stretches.some(
          (other, j) => other.askable && other.dir !== stretch.dir && stretchNodes[j]?.has(n),
        ),
      );
    if (end === undefined) return;
    const crossing = streetsAt(end)
      .filter((c) => c !== code)
      .sort((a, b) => levelOf(a) - levelOf(b))[0];
    if (crossing !== undefined) stretch.changesAt = crossing;
  });

  // Transversales en el orden de la numeración. A igual altura, en el orden de la calle. Las
  // calzadas de una avenida cuentan como un solo cruce.
  const nodes = [...new Set(segments.flatMap((s) => [s.from, s.to]))];
  const ends = [...nodes].sort((a, b) => positionOf(a) - positionOf(b));
  const along = alongAxis(nodes, at, ends[0] as number, ends[ends.length - 1] as number);
  nodes.sort(
    (a, b) => positionOf(a) - positionOf(b) || (along.get(a) ?? 0) - (along.get(b) ?? 0) || a - b,
  );
  const crossings: StreetCrossing[] = [];
  for (const node of nodes) {
    for (const street of streetsAt(node)) {
      if (street === code) continue;
      const repeated = crossings.some(
        (c) => c.street === street && distanceM(at(c.node), at(node)) <= SAME_CROSSING_M,
      );
      if (!repeated) crossings.push({ street, node, height: heights.get(node) ?? 0 });
    }
  }

  return {
    ordered: units.flatMap((u) => u.segments.map(indexOf)),
    stretches,
    crossings,
    pairedByHeights,
    conflicting: [...conflicting],
  };
}
