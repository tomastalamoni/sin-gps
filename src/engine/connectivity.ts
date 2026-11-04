/**
 * Conectividad sobre el grafo con giros: qué aristas forman la red principal y dónde hay trampas.
 * La usan el pipeline para validar y la app para revisar una corrección local.
 */
import { SegmentFlag } from './data';
import { edgeComponents, segmentOf, type RoadGraph } from './graph';
import type { TurnTable } from './turns';

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

export function isBorder(graph: RoadGraph, edge: number): boolean {
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

/** Las aristas de las trampas: se entra y no se sale. */
export function trapEdges(connectivity: Connectivity): Set<number> {
  return new Set(connectivity.others.filter((c) => c.sink).flatMap((c) => c.edges));
}
