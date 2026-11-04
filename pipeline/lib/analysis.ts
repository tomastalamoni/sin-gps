/**
 * Importancia de cada calle (sección 8, paso 9), con el mismo motor que usa la app.
 */
import { isBorder } from '../../src/engine/connectivity';
import { segmentOf, type RoadGraph } from '../../src/engine/graph';
import { createRandom } from '../../src/engine/random';
import { pathFromTree, type Router } from '../../src/engine/router';

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
