/**
 * Grafo de calles (sección 9). Cada tramo une dos nodos y se puede recorrer en dos sentidos: la
 * arista 2·t va a favor de la geometría del tramo t y la 2·t+1 en contra. Que una arista sea legal
 * depende del sentido del tramo; el resto de las reglas de giro están en turns.ts.
 */
import type { Direction, RoadKind } from './data';
import { bearingDeg, distanceM, lineLengthM, pointAlong, projectOnLine, type LngLat } from './geo';

/** Metros que se miran al salir o llegar a una esquina para medir el ángulo (sección 5). */
export const BEARING_LOOK_M = 20;

export interface SegmentInput {
  street: number;
  from: number;
  to: number;
  dir: Direction;
  /** En duda o con orientación inferida: se maneja en los dos sentidos y el router lo encarece. */
  doubtful: boolean;
  kind: RoadKind;
  flags: number;
  /** La otra calzada de la misma calle, o -1. */
  pair: number;
  geometry: readonly LngLat[];
}

export interface GraphInput {
  nodes: readonly LngLat[];
  segments: readonly SegmentInput[];
  outside?: Iterable<number>;
  signals?: Iterable<number>;
  /** De a 4: tramo de llegada, nodo, tramo de salida y tipo (0 prohibido, 1 obligatorio). */
  restrictions?: readonly number[];
  /** De a 2: tramo de llegada y nodo con carril de giro a la izquierda. */
  leftTurnLanes?: readonly number[];
}

export function edgeOf(segment: number, backward: boolean): number {
  return segment * 2 + (backward ? 1 : 0);
}

export function segmentOf(edge: number): number {
  return edge >> 1;
}

export function isBackward(edge: number): boolean {
  return (edge & 1) === 1;
}

export function reverseEdge(edge: number): number {
  return edge ^ 1;
}

const GRID_DEG = 0.001;

export class RoadGraph {
  readonly nodes: readonly LngLat[];
  readonly segments: readonly SegmentInput[];
  readonly lengths: Float64Array;
  readonly outside: ReadonlySet<number>;
  readonly signals: ReadonlySet<number>;
  /** Rumbo al salir y al llegar de cada arista, medido en sus primeros/últimos 20 m. */
  private readonly startBearings: Float64Array;
  private readonly endBearings: Float64Array;
  private readonly incidentStart: Int32Array;
  private readonly incidentList: Int32Array;
  private readonly forbidden = new Set<string>();
  private readonly mandatory = new Map<string, number>();
  private readonly leftLanes = new Set<string>();
  private readonly grid = new Map<string, number[]>();

  constructor(input: GraphInput) {
    this.nodes = input.nodes;
    this.segments = input.segments;
    this.outside = new Set(input.outside);
    this.signals = new Set(input.signals);

    const count = input.segments.length;
    this.lengths = new Float64Array(count);
    this.startBearings = new Float64Array(count * 2);
    this.endBearings = new Float64Array(count * 2);
    const degree = new Int32Array(input.nodes.length + 1);

    input.segments.forEach((segment, t) => {
      const line = segment.geometry;
      const length = lineLengthM(line);
      this.lengths[t] = length;
      const look = Math.min(BEARING_LOOK_M, length);
      const first = line[0] as LngLat;
      const last = line[line.length - 1] as LngLat;
      const forwardStart = bearingDeg(first, pointAlong(line, look));
      const forwardEnd = bearingDeg(pointAlong(line, length - look), last);
      this.startBearings[t * 2] = forwardStart;
      this.endBearings[t * 2] = forwardEnd;
      this.startBearings[t * 2 + 1] = (forwardEnd + 180) % 360;
      this.endBearings[t * 2 + 1] = (forwardStart + 180) % 360;
      degree[segment.from + 1] = (degree[segment.from + 1] ?? 0) + 1;
      if (segment.to !== segment.from) degree[segment.to + 1] = (degree[segment.to + 1] ?? 0) + 1;
      this.indexSegment(t, line);
    });

    for (let n = 1; n < degree.length; n++) degree[n] = (degree[n] ?? 0) + (degree[n - 1] ?? 0);
    this.incidentStart = degree;
    this.incidentList = new Int32Array(degree[degree.length - 1] ?? 0);
    const fill = degree.slice(0, -1);
    input.segments.forEach((segment, t) => {
      this.incidentList[fill[segment.from] ?? 0] = t;
      fill[segment.from] = (fill[segment.from] ?? 0) + 1;
      if (segment.to !== segment.from) {
        this.incidentList[fill[segment.to] ?? 0] = t;
        fill[segment.to] = (fill[segment.to] ?? 0) + 1;
      }
    });

    const restrictions = input.restrictions ?? [];
    for (let i = 0; i + 3 < restrictions.length; i += 4) {
      const [from, node, to, type] = restrictions.slice(i, i + 4) as [
        number,
        number,
        number,
        number,
      ];
      if (type === 1) this.mandatory.set(`${from}:${node}`, to);
      else this.forbidden.add(`${from}:${node}:${to}`);
    }
    const lanes = input.leftTurnLanes ?? [];
    for (let i = 0; i + 1 < lanes.length; i += 2) this.leftLanes.add(`${lanes[i]}:${lanes[i + 1]}`);
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  get segmentCount(): number {
    return this.segments.length;
  }

  get edgeCount(): number {
    return this.segments.length * 2;
  }

  segment(t: number): SegmentInput {
    const segment = this.segments[t];
    if (!segment) throw new Error(`No existe el tramo ${t}`);
    return segment;
  }

  node(n: number): LngLat {
    const node = this.nodes[n];
    if (!node) throw new Error(`No existe el nodo ${n}`);
    return node;
  }

  /** Nodo donde empieza la arista. */
  tail(edge: number): number {
    const segment = this.segment(segmentOf(edge));
    return isBackward(edge) ? segment.to : segment.from;
  }

  /** Nodo donde termina la arista. */
  head(edge: number): number {
    const segment = this.segment(segmentOf(edge));
    return isBackward(edge) ? segment.from : segment.to;
  }

  /** ¿Se puede circular por esta arista? Contramano no; un tramo en duda, en los dos sentidos. */
  isLegalEdge(edge: number): boolean {
    const segment = this.segment(segmentOf(edge));
    if (segment.doubtful || segment.dir === 'D') return true;
    return segment.dir === (isBackward(edge) ? 'B' : 'F');
  }

  edgeLength(edge: number): number {
    return this.lengths[segmentOf(edge)] ?? 0;
  }

  /** Geometría en el sentido en que se recorre la arista. */
  edgeGeometry(edge: number): LngLat[] {
    const line = this.segment(segmentOf(edge)).geometry;
    return isBackward(edge) ? [...line].reverse() : [...line];
  }

  /** Rumbo al salir de la cola de la arista. */
  startBearing(edge: number): number {
    return this.startBearings[edge] ?? 0;
  }

  /** Rumbo al llegar a la cabeza de la arista. */
  endBearing(edge: number): number {
    return this.endBearings[edge] ?? 0;
  }

  /** Tramos que tocan un nodo. */
  incidentSegments(node: number): Int32Array {
    return this.incidentList.subarray(
      this.incidentStart[node] ?? 0,
      this.incidentStart[node + 1] ?? 0,
    );
  }

  degree(node: number): number {
    return (this.incidentStart[node + 1] ?? 0) - (this.incidentStart[node] ?? 0);
  }

  /** Todas las aristas que salen de un nodo, sean legales o no. */
  edgesLeaving(node: number): number[] {
    const out: number[] = [];
    for (const t of this.incidentSegments(node)) {
      const segment = this.segment(t);
      if (segment.from === node) out.push(edgeOf(t, false));
      if (segment.to === node) out.push(edgeOf(t, true));
    }
    return out;
  }

  isForbiddenTurn(fromSegment: number, node: number, toSegment: number): boolean {
    if (this.forbidden.has(`${fromSegment}:${node}:${toSegment}`)) return true;
    const only = this.mandatory.get(`${fromSegment}:${node}`);
    return only !== undefined && only !== toSegment;
  }

  hasLeftTurnLane(fromSegment: number, node: number): boolean {
    return this.leftLanes.has(`${fromSegment}:${node}`);
  }

  private indexSegment(t: number, line: readonly LngLat[]): void {
    let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lng, lat] of line) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
    for (let x = Math.floor(west / GRID_DEG); x <= Math.floor(east / GRID_DEG); x++) {
      for (let y = Math.floor(south / GRID_DEG); y <= Math.floor(north / GRID_DEG); y++) {
        const key = `${x}:${y}`;
        const cell = this.grid.get(key);
        if (cell) cell.push(t);
        else this.grid.set(key, [t]);
      }
    }
  }

  /** Tramos cuyo recuadro cae a menos de `radiusM` del punto (candidatos, sin ordenar). */
  segmentsNear(point: LngLat, radiusM: number): number[] {
    const dLat = radiusM / 110_574;
    const dLng = radiusM / (111_320 * Math.cos((point[1] * Math.PI) / 180));
    const found = new Set<number>();
    for (
      let x = Math.floor((point[0] - dLng) / GRID_DEG);
      x <= Math.floor((point[0] + dLng) / GRID_DEG);
      x++
    ) {
      for (
        let y = Math.floor((point[1] - dLat) / GRID_DEG);
        y <= Math.floor((point[1] + dLat) / GRID_DEG);
        y++
      ) {
        for (const t of this.grid.get(`${x}:${y}`) ?? []) found.add(t);
      }
    }
    return [...found];
  }

  /** Los tramos a menos de `maxM` del punto, del más cercano al más lejano. */
  nearestSegments(
    point: LngLat,
    maxM: number,
  ): { segment: number; distanceM: number; alongM: number }[] {
    return this.segmentsNear(point, maxM)
      .map((segment) => {
        const projection = projectOnLine(point, this.segment(segment).geometry);
        return { segment, distanceM: projection.distanceM, alongM: projection.alongM };
      })
      .filter((x) => x.distanceM <= maxM)
      .sort((a, b) => a.distanceM - b.distanceM);
  }

  /** Distancia en línea recta entre dos nodos. */
  nodeDistance(a: number, b: number): number {
    return distanceM(this.node(a), this.node(b));
  }
}

/**
 * Componentes fuertemente conexas sobre las aristas, con las transiciones que da `next`
 * (Tarjan iterativo). Devuelve la componente de cada arista (-1 si no participa).
 */
export function edgeComponents(
  edgeCount: number,
  participates: (edge: number) => boolean,
  next: (edge: number) => Iterable<number>,
): Int32Array {
  const index = new Int32Array(edgeCount).fill(-1);
  const low = new Int32Array(edgeCount);
  const component = new Int32Array(edgeCount).fill(-1);
  const onStack = new Uint8Array(edgeCount);
  const stack: number[] = [];
  let counter = 0;
  let components = 0;

  for (let root = 0; root < edgeCount; root++) {
    if (!participates(root) || index[root] !== -1) continue;
    const work: { edge: number; successors: Iterator<number> }[] = [];
    const visit = (edge: number) => {
      index[edge] = counter;
      low[edge] = counter;
      counter++;
      stack.push(edge);
      onStack[edge] = 1;
      work.push({ edge, successors: next(edge)[Symbol.iterator]() });
    };
    visit(root);
    while (work.length > 0) {
      const frame = work[work.length - 1] as { edge: number; successors: Iterator<number> };
      const step = frame.successors.next();
      if (!step.done) {
        const w = step.value;
        if (!participates(w)) continue;
        if (index[w] === -1) visit(w);
        else if (onStack[w]) low[frame.edge] = Math.min(low[frame.edge] ?? 0, index[w] ?? 0);
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low[parent.edge] = Math.min(low[parent.edge] ?? 0, low[frame.edge] ?? 0);
      if (low[frame.edge] === index[frame.edge]) {
        let w: number;
        do {
          w = stack.pop() as number;
          onStack[w] = 0;
          component[w] = components;
        } while (w !== frame.edge);
        components++;
      }
    }
  }
  return component;
}
