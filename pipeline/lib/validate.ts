/**
 * Validaciones automáticas (sección 8). Las bloqueantes cortan el build: si fallan, no se escriben
 * los datos y la app sigue con la versión anterior.
 */
import { existsSync, readFileSync } from 'node:fs';
import { analyzeConnectivity, type Connectivity } from '../../src/engine/connectivity';
import { RoadGraph, type GraphInput } from '../../src/engine/graph';
import { TurnTable } from '../../src/engine/turns';
import type { GraphSegment } from '../05-graph';
import { VALIDATION } from '../config';
import { checkFacts, FACTS_FILE, type Fact, type FactsContext } from './facts';

export interface Check {
  name: string;
  blocking: boolean;
  passed: boolean;
  /** Todavía no se puede verificar (no cuenta como falla). */
  pending?: boolean;
  detail: string;
}

/** Un salto mayor que esto entre dos cuadras seguidas se lista como excepción. */
export const HEIGHT_BREAK_MAX = 20;

export interface HeightBreak {
  before: GraphSegment;
  after: GraphSegment;
}

/** El salto de numeración entre dos cuadras, vereda con vereda: alcanza con que empalme una. */
function heightGap(before: GraphSegment, after: GraphSegment): number | undefined {
  const [, leftEnd, , rightEnd] = before.heights;
  const [leftStart, , rightStart] = after.heights;
  const gaps = [
    [leftEnd, leftStart],
    [rightEnd, rightStart],
  ]
    .filter(([end = 0, start = 0]) => end > 0 && start > 0)
    .map(([end = 0, start = 0]) => Math.abs(start - end));
  return gaps.length > 0 ? Math.min(...gaps) : undefined;
}

/**
 * Empalme de alturas: donde termina una cuadra, la siguiente de la misma calle tiene que seguir la
 * numeración. Si en la esquina empiezan varias (dos calzadas), alcanza con que empalme una.
 */
export function findHeightBreaks(segments: readonly GraphSegment[]): HeightBreak[] {
  const starting = new Map<string, GraphSegment[]>();
  for (const s of segments) {
    if (!s.range) continue;
    const key = `${s.code}:${s.from}`;
    starting.set(key, [...(starting.get(key) ?? []), s]);
  }
  const breaks: HeightBreak[] = [];
  for (const before of segments) {
    if (!before.range) continue;
    const next = (starting.get(`${before.code}:${before.to}`) ?? [])
      .flatMap((after) => {
        const gap = heightGap(before, after);
        return gap === undefined ? [] : [{ after, gap }];
      })
      .sort((a, b) => a.gap - b.gap)[0];
    if (next && next.gap > HEIGHT_BREAK_MAX) breaks.push({ before, after: next.after });
  }
  return breaks;
}

export function checkStatus(check: Check): 'OK' | 'FALLA' | 'AVISO' | 'PENDIENTE' {
  if (check.pending) return 'PENDIENTE';
  if (check.passed) return 'OK';
  return check.blocking ? 'FALLA' : 'AVISO';
}

export interface MidBlockChange {
  node: number;
  segments: [number, number];
}

function flip(dir: string): string {
  return dir === 'F' ? 'B' : dir === 'B' ? 'F' : 'D';
}

/**
 * Cambio de sentido en medio de una cuadra: dos tramos de la misma calle que se tocan en un nodo
 * donde no llega ninguna otra calle y tienen sentidos distintos. No cuentan las esquinas reales
 * (llega una calle que no está en el grafo) ni las calzadas separadas que se juntan. Con
 * `includeDoubtful` en false tampoco cuentan los tramos en duda: ya están marcados, nunca se
 * preguntan y salen primeros en "Para verificar".
 */
export function findMidBlockChanges(
  input: GraphInput,
  junctions: ReadonlySet<number>,
  includeDoubtful = false,
): MidBlockChange[] {
  const incident = new Map<number, number[]>();
  input.segments.forEach((s, t) => {
    for (const n of new Set([s.from, s.to])) incident.set(n, [...(incident.get(n) ?? []), t]);
  });
  const out: MidBlockChange[] = [];
  for (const [node, list] of incident) {
    if (list.length !== 2 || junctions.has(node)) continue;
    const [ta, tb] = list as [number, number];
    const a = input.segments[ta];
    const b = input.segments[tb];
    if (!a || !b) continue;
    if (a.street !== b.street || a.pair >= 0 || b.pair >= 0) continue;
    if (!includeDoubtful && (a.doubtful || b.doubtful)) continue;
    const sameOrientation = (a.to === node) === (b.from === node);
    if (a.dir !== (sameOrientation ? b.dir : flip(b.dir))) out.push({ node, segments: [ta, tb] });
  }
  return out;
}

/**
 * Las validaciones de la sección 8. `osmMatch` (proporción de tramos con par en OSM) solo se
 * conoce al armar los datos: con los archivos ya exportados, ese chequeo no corre.
 */
export function runChecks(
  input: GraphInput,
  junctions: ReadonlySet<number>,
  connectivity?: Connectivity,
  osmMatch?: number,
): Check[] {
  const graph = new RoadGraph(input);
  const result = connectivity ?? analyzeConnectivity(graph, new TurnTable(graph));
  const traps = result.others.filter((c) => c.sink);
  const midBlock = findMidBlockChanges(input, junctions).length;
  const midBlockDoubtful = findMidBlockChanges(input, junctions, true).length - midBlock;
  const percent = (result.ratio * 100).toFixed(2);
  return [
    {
      name: 'Conectividad sobre el grafo con giros',
      blocking: true,
      passed: result.ratio >= VALIDATION.minConnectivity,
      detail: `${percent}% de las aristas (sin la zona de borde); el mínimo es ${VALIDATION.minConnectivity * 100}%`,
    },
    {
      name: 'Cambio de sentido en medio de una cuadra',
      blocking: true,
      passed: midBlock === 0,
      detail: `${midBlock} casos entre tramos confiables; tiene que haber cero (más ${midBlockDoubtful} con un tramo en duda, que no se pregunta)`,
    },
    {
      name: 'Trampas (grupos de aristas sin salida legal)',
      blocking: false,
      passed: traps.length === 0,
      detail: `${traps.length} trampas, listadas en el reporte`,
    },
    ...(osmMatch === undefined
      ? []
      : [
          {
            name: 'Cruce con OSM',
            blocking: true,
            passed: osmMatch >= VALIDATION.minOsmMatch,
            detail: `${(osmMatch * 100).toFixed(1)}% de los tramos tienen par; el mínimo es ${VALIDATION.minOsmMatch * 100}%`,
          },
        ]),
  ];
}

/** Los hechos que confirmó Tomás: mientras no estén cargados, queda pendiente. */
export function factsCheck(context: FactsContext): Check {
  const name = 'Hechos reales confirmados por Tomás';
  if (!existsSync(FACTS_FILE)) {
    return {
      name,
      blocking: false,
      passed: false,
      pending: true,
      detail: 'todavía no hay archivo',
    };
  }
  const facts = JSON.parse(readFileSync(FACTS_FILE, 'utf8')) as Fact[];
  const { total, failures } = checkFacts(facts, context);
  return {
    name,
    blocking: true,
    passed: failures.length === 0,
    detail: `${String(total - failures.length)} de ${String(total)}${failures.length > 0 ? `; ${failures.join('; ')}` : ''}`,
  };
}
