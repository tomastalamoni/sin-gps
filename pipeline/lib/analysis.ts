/**
 * Análisis sobre el grafo con giros, con el mismo motor que usa la app: conectividad, trampas e
 * importancia de cada calle (sección 8, pasos 9 y 12).
 */
import { SegmentFlag } from '../../src/engine/data';
import { edgeComponents, segmentOf, type RoadGraph } from '../../src/engine/graph';
import { createRandom } from '../../src/engine/random';
import { pathFromTree, type Router } from '../../src/engine/router';
import type { TurnTable } from '../../src/engine/turns';

export interface Component {
  edges: number[];
  /** Se entra y no se sale: una trampa. */
  sink: boolean;
  /** Se sale y no se entra. */
  source: boolean;
  /** Ni se entra ni se sale: tramos sueltos, que el Navegante no usa. */
  island: boolean;
}

export interface Connectivity {
  /** Aristas legales fuera del borde que están en la componente principal, sobre el total. */
  ratio: number;
  inMain: Uint8Array;
  others: Component[];
}

function isBorder(graph: RoadGraph, edge: number): boolean {
  return (graph.segment(segmentOf(edge)).flags & SegmentFlag.border) !== 0;
}

/**
 * Componentes fuertemente conexas sobre las transiciones legales. Los nodos fuera del área se
 * unen por un nodo virtual: si salís del área, podés volver a entrar por cualquier otro borde.
 */
export function analyzeConnectivity(graph: RoadGraph, table: TurnTable): Connectivity {
  const virtual = graph.edgeCount;
  const leavingOutside: number[] = [];
  for (let edge = 0; edge < graph.edgeCount; edge++) {
    if (graph.isLegalEdge(edge) && graph.outside.has(graph.tail(edge))) leavingOutside.push(edge);
  }
  const participates = (edge: number) => edge === virtual || graph.isLegalEdge(edge);
  const next = (edge: number): number[] => {
    if (edge === virtual) return leavingOutside;
    const list = Array.from(table.next(edge));
    if (graph.outside.has(graph.head(edge))) list.push(virtual);
    return list;
  };
  const component = edgeComponents(graph.edgeCount + 1, participates, next);

  const sizes = new Map<number, number>();
  let total = 0;
  for (let edge = 0; edge < graph.edgeCount; edge++) {
    if (!graph.isLegalEdge(edge) || isBorder(graph, edge)) continue;
    total++;
    const c = component[edge] ?? -1;
    sizes.set(c, (sizes.get(c) ?? 0) + 1);
  }
  const main = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  const inMain = new Uint8Array(graph.edgeCount);
  const groups = new Map<number, number[]>();
  for (let edge = 0; edge < graph.edgeCount; edge++) {
    if (!graph.isLegalEdge(edge)) continue;
    const c = component[edge] ?? -1;
    if (c === main) inMain[edge] = 1;
    else {
      const list = groups.get(c);
      if (list) list.push(edge);
      else groups.set(c, [edge]);
    }
  }

  // Una sola pasada: qué componentes tienen alguna salida y cuáles alguna entrada.
  const hasExit = new Set<number>();
  const hasEntry = new Set<number>();
  for (let edge = 0; edge <= graph.edgeCount; edge++) {
    if (!participates(edge)) continue;
    const from = component[edge] ?? -1;
    for (const n of next(edge)) {
      const to = component[n] ?? -1;
      if (to === from) continue;
      hasExit.add(from);
      hasEntry.add(to);
    }
  }
  const others: Component[] = [...groups].map(([c, edges]) => ({
    edges,
    sink: hasEntry.has(c) && !hasExit.has(c),
    source: hasExit.has(c) && !hasEntry.has(c),
    island: !hasEntry.has(c) && !hasExit.has(c),
  }));
  others.sort((a, b) => b.edges.length - a.edges.length);
  return { ratio: total === 0 ? 0 : (sizes.get(main) ?? 0) / total, inMain, others };
}

/**
 * Importancia: en cuántas de N rutas al azar aparece cada calle, de 0 a 1. Se calculan árboles de
 * caminos mínimos desde orígenes al azar y se toman varios destinos de cada uno.
 */
export function computeImportance(
  graph: RoadGraph,
  router: Router,
  inMain: Uint8Array,
  routes: number,
  seed: number,
): Map<number, number> {
  const random = createRandom(seed);
  const candidates: number[] = [];
  for (let edge = 0; edge < graph.edgeCount; edge++) {
    if (inMain[edge] && !isBorder(graph, edge)) candidates.push(edge);
  }
  const counts = new Map<number, number>();
  if (candidates.length === 0) return counts;
  const origins = Math.max(1, Math.round(Math.sqrt(routes * 2)));
  const perOrigin = Math.ceil(routes / origins);
  for (let o = 0; o < origins; o++) {
    const tree = router.shortestTree(random.pick(candidates));
    for (let d = 0; d < perOrigin; d++) {
      const destination = random.pick(candidates);
      if (!Number.isFinite(tree.cost[destination] ?? Infinity)) continue;
      const streets = new Set(
        pathFromTree(tree.previous, destination).map((e) => graph.segment(segmentOf(e)).street),
      );
      for (const street of streets) counts.set(street, (counts.get(street) ?? 0) + 1);
    }
  }
  const max = Math.max(1, ...counts.values());
  return new Map(
    [...counts].map(([street, count]) => [street, Math.round((count / max) * 1000) / 1000]),
  );
}
