/**
 * Ruta óptima (sección 5): A* sobre estados "llegando por tal arista", para respetar sentidos,
 * restricciones y penalizaciones de giro. Nunca usa una maniobra ilegal ni un giro condicional.
 */
import { segmentOf, type RoadGraph } from './graph';
import type { TurnTable } from './turns';

/** Valores iniciales de la sección 5; se pueden ajustar. */
export const ROUTE_COST = {
  avenue: 0.85,
  street: 1,
  passage: 1.2,
  /** Los tramos en duda se pueden usar, pero cuestan cinco veces más. */
  doubtful: 5,
  /** La heurística es la distancia en línea recta por el factor más barato: nunca sobreestima. */
  heuristic: 0.85,
} as const;

export interface Route {
  /** Aristas recorridas, desde la de partida hasta la que entra al destino. */
  edges: number[];
  cost: number;
}

/** Cola de prioridad mínima (heap binario) de aristas. */
class MinHeap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.keys[parent] ?? 0) <= key) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { item: number; key: number } | undefined {
    const top = this.items[0];
    const key = this.keys[0];
    if (top === undefined || key === undefined) return undefined;
    const lastItem = this.items.pop() as number;
    const lastKey = this.keys.pop() as number;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && (this.keys[l] ?? 0) < (this.keys[smallest] ?? 0)) smallest = l;
        if (r < this.items.length && (this.keys[r] ?? 0) < (this.keys[smallest] ?? 0)) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return { item: top, key };
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b] as number, this.items[a] as number];
    [this.keys[a], this.keys[b]] = [this.keys[b] as number, this.keys[a] as number];
  }
}

export class Router {
  readonly graph: RoadGraph;
  readonly turns: TurnTable;
  private readonly costs: Float64Array;

  constructor(graph: RoadGraph, turns: TurnTable) {
    this.graph = graph;
    this.turns = turns;
    this.costs = new Float64Array(graph.edgeCount);
    for (let edge = 0; edge < graph.edgeCount; edge++) {
      const segment = graph.segment(segmentOf(edge));
      const factor =
        segment.kind === 'a'
          ? ROUTE_COST.avenue
          : segment.kind === 'p'
            ? ROUTE_COST.passage
            : ROUTE_COST.street;
      this.costs[edge] =
        graph.edgeLength(edge) * factor * (segment.doubtful ? ROUTE_COST.doubtful : 1);
    }
  }

  /** Costo de recorrer una arista, sin el giro. */
  edgeCost(edge: number): number {
    return this.costs[edge] ?? Infinity;
  }

  /**
   * Mejor ruta desde que el auto llega al final de `start` hasta que recorre algún tramo de
   * `targets`. Con `heuristic` en false es Dijkstra, que sirve para verificar al A*.
   */
  route(start: number, targets: ReadonlySet<number>, heuristic = true): Route | undefined {
    if (targets.has(segmentOf(start))) return { edges: [start], cost: 0 };
    const targetNodes = [...targets].flatMap((t) => [
      this.graph.segment(t).from,
      this.graph.segment(t).to,
    ]);
    const h = (edge: number) => {
      if (!heuristic) return 0;
      const node = this.graph.head(edge);
      let best = Infinity;
      for (const target of targetNodes)
        best = Math.min(best, this.graph.nodeDistance(node, target));
      return best * ROUTE_COST.heuristic;
    };

    const g = new Map<number, number>([[start, 0]]);
    const previous = new Map<number, number>();
    const closed = new Set<number>();
    const open = new MinHeap();
    open.push(start, h(start));

    while (open.size > 0) {
      const { item: edge } = open.pop() as { item: number; key: number };
      if (closed.has(edge)) continue;
      closed.add(edge);
      const cost = g.get(edge) ?? Infinity;
      if (edge !== start && targets.has(segmentOf(edge))) {
        const edges = [edge];
        let current = edge;
        while (current !== start) {
          current = previous.get(current) as number;
          edges.push(current);
        }
        return { edges: edges.reverse(), cost };
      }
      const next = this.turns.next(edge);
      const penalties = this.turns.nextPenalties(edge);
      for (let i = 0; i < next.length; i++) {
        const to = next[i] as number;
        if (closed.has(to)) continue;
        const candidate = cost + (penalties[i] ?? 0) + this.edgeCost(to);
        if (candidate < (g.get(to) ?? Infinity)) {
          g.set(to, candidate);
          previous.set(to, edge);
          open.push(to, candidate + h(to));
        }
      }
    }
    return undefined;
  }

  /**
   * Árbol de caminos mínimos desde `start` a todas las aristas alcanzables (Dijkstra completo).
   * Sirve para calcular muchas rutas desde un mismo origen.
   */
  shortestTree(start: number): { cost: Float64Array; previous: Int32Array } {
    const cost = new Float64Array(this.graph.edgeCount).fill(Infinity);
    const previous = new Int32Array(this.graph.edgeCount).fill(-1);
    const closed = new Uint8Array(this.graph.edgeCount);
    const open = new MinHeap();
    cost[start] = 0;
    open.push(start, 0);
    while (open.size > 0) {
      const { item: edge, key } = open.pop() as { item: number; key: number };
      if (closed[edge]) continue;
      closed[edge] = 1;
      const next = this.turns.next(edge);
      const penalties = this.turns.nextPenalties(edge);
      for (let i = 0; i < next.length; i++) {
        const to = next[i] as number;
        const candidate = key + (penalties[i] ?? 0) + this.edgeCost(to);
        if (candidate < (cost[to] ?? Infinity)) {
          cost[to] = candidate;
          previous[to] = edge;
          open.push(to, candidate);
        }
      }
    }
    return { cost, previous };
  }
}

/** Reconstruye el camino hasta `edge` en un árbol de shortestTree. */
export function pathFromTree(previous: Int32Array, edge: number): number[] {
  const path = [edge];
  let current = previous[edge] ?? -1;
  while (current !== -1) {
    path.push(current);
    current = previous[current] ?? -1;
  }
  return path.reverse();
}
