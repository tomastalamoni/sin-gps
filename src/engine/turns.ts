/**
 * Giros (sección 5): dada la arista por la que llegás a una esquina, las salidas físicas con su
 * ángulo, su clase y su legalidad.
 */
import { SegmentFlag } from './data';
import { angleDiff, pointAlong, projectOnLine } from './geo';
import { reverseEdge, segmentOf, type RoadGraph } from './graph';

export type TurnKind =
  | 'seguir'
  | 'izquierda'
  | 'derecha'
  | 'leve-izquierda'
  | 'leve-derecha'
  | 'cerrada-izquierda'
  | 'cerrada-derecha'
  | 'vuelta-en-u';

export type Legality =
  | { status: 'legal'; doubtful: boolean }
  | { status: 'ilegal'; reason: 'contramano' | 'giro-prohibido' | 'izquierda-con-semaforo' }
  | { status: 'condicional'; reason: 'calzadas-separadas' | 'carril-de-giro' };

export interface TurnOption {
  /** Arista de salida, aunque sea contramano. */
  edge: number;
  /** Desvío respecto del frente del auto, en (-180, 180]: positivo es a la derecha. */
  angle: number;
  kind: TurnKind;
  legality: Legality;
}

/** "Seguir" es la misma calle si se desvía menos de esto… */
const SAME_STREET_MAX_DEG = 45;
/** …o, si no hay continuación, la salida que se desvía menos de esto. */
const STRAIGHT_MAX_DEG = 30;
const SLIGHT_MAX_DEG = 60;
const SHARP_MIN_DEG = 120;
/**
 * Volver por la misma calle casi en contra, corriendo al lado de la cuadra por la que llegaste, es
 * una vuelta en U (la otra calzada). Se mide cada 10 m: una calle que se abre en Y se aleja.
 */
const U_TURN_MIN_DEG = 150;
const U_TURN_MAX_GAP_M = 30;
const U_TURN_STEP_M = 10;

export function isLeftTurn(kind: TurnKind): boolean {
  return kind === 'izquierda' || kind === 'leve-izquierda' || kind === 'cerrada-izquierda';
}

export function isRightTurn(kind: TurnKind): boolean {
  return kind === 'derecha' || kind === 'leve-derecha' || kind === 'cerrada-derecha';
}

function sideKind(angle: number): TurnKind {
  const magnitude = Math.abs(angle);
  const right = angle > 0;
  if (magnitude < SLIGHT_MAX_DEG) return right ? 'leve-derecha' : 'leve-izquierda';
  if (magnitude > SHARP_MIN_DEG) return right ? 'cerrada-derecha' : 'cerrada-izquierda';
  return right ? 'derecha' : 'izquierda';
}

/** ¿La calle por la que llegás es de doble sentido? Una calzada de una avenida dividida también cuenta. */
function arrivesOnTwoWay(graph: RoadGraph, arriving: number): boolean {
  const segment = graph.segment(segmentOf(arriving));
  return segment.dir === 'D' || segment.pair >= 0 || (segment.flags & SegmentFlag.divided) !== 0;
}

function hasSeparatedCarriageways(graph: RoadGraph, arriving: number): boolean {
  const segment = graph.segment(segmentOf(arriving));
  return segment.pair >= 0 || (segment.flags & SegmentFlag.divided) !== 0;
}

function legalityOf(graph: RoadGraph, arriving: number, exit: number, kind: TurnKind): Legality {
  const node = graph.head(arriving);
  const fromSegment = segmentOf(arriving);
  const toSegment = segmentOf(exit);
  if (!graph.isLegalEdge(exit)) return { status: 'ilegal', reason: 'contramano' };
  if (graph.isForbiddenTurn(fromSegment, node, toSegment)) {
    return { status: 'ilegal', reason: 'giro-prohibido' };
  }
  if (isLeftTurn(kind) && graph.signals.has(node) && arrivesOnTwoWay(graph, arriving)) {
    // Ley 5760: sin flecha de giro no se dobla a la izquierda desde una arteria de doble mano con
    // semáforo. La Disposición 1826/2008 lo permite con bulevar: queda como condicional.
    if (hasSeparatedCarriageways(graph, arriving)) {
      return { status: 'condicional', reason: 'calzadas-separadas' };
    }
    if (graph.hasLeftTurnLane(fromSegment, node))
      return { status: 'condicional', reason: 'carril-de-giro' };
    return { status: 'ilegal', reason: 'izquierda-con-semaforo' };
  }
  return { status: 'legal', doubtful: graph.segment(toSegment).doubtful };
}

/** La misma cuadra al revés, la otra calzada de la avenida o una salida que vuelve pegada a ella. */
function isUTurn(graph: RoadGraph, arriving: number, exit: number, angle: number): boolean {
  if (exit === reverseEdge(arriving)) return true;
  const from = graph.segment(segmentOf(arriving));
  if (from.pair === segmentOf(exit)) return true;
  if (graph.segment(segmentOf(exit)).street !== from.street) return false;
  if (Math.abs(angle) < U_TURN_MIN_DEG) return false;
  const line = graph.edgeGeometry(exit);
  const exitLength = graph.edgeLength(exit);
  const reach = Math.min(exitLength, Math.max(graph.edgeLength(arriving), 3 * U_TURN_STEP_M));
  for (let d = U_TURN_STEP_M; d - U_TURN_STEP_M < reach; d += U_TURN_STEP_M) {
    const probe = pointAlong(line, Math.min(d, reach));
    if (projectOnLine(probe, from.geometry).distanceM > U_TURN_MAX_GAP_M) return false;
  }
  return true;
}

export interface Exit {
  edge: number;
  angle: number;
  kind: TurnKind;
}

/**
 * Todas las salidas físicas de la esquina con su ángulo y su clase, también las vueltas en U que
 * no se ofrecen (para validar restricciones de giro).
 */
export function classifyExits(graph: RoadGraph, arriving: number): Exit[] {
  const node = graph.head(arriving);
  const heading = graph.endBearing(arriving);
  const street = graph.segment(segmentOf(arriving)).street;

  const all = graph
    .edgesLeaving(node)
    .map((edge) => ({ edge, angle: angleDiff(heading, graph.startBearing(edge)) }));
  const uTurns = new Set(
    all.filter((x) => isUTurn(graph, arriving, x.edge, x.angle)).map((x) => x.edge),
  );
  const exits = all.filter((x) => !uTurns.has(x.edge));

  const sameStreet = exits
    .filter(
      (x) =>
        graph.segment(segmentOf(x.edge)).street === street &&
        Math.abs(x.angle) < SAME_STREET_MAX_DEG,
    )
    .sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle));
  const straight =
    sameStreet[0] ??
    exits
      .filter((x) => Math.abs(x.angle) < STRAIGHT_MAX_DEG)
      .sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle))[0];

  return all.map(({ edge, angle }) => {
    if (uTurns.has(edge)) {
      return { edge, angle: edge === reverseEdge(arriving) ? 180 : angle, kind: 'vuelta-en-u' };
    }
    return { edge, angle, kind: edge === straight?.edge ? 'seguir' : sideKind(angle) };
  });
}

/** Las salidas al llegar a una esquina por `arriving`, con su ángulo, clase y legalidad. */
export function turnOptions(graph: RoadGraph, arriving: number): TurnOption[] {
  const node = graph.head(arriving);
  const exits = classifyExits(graph, arriving);
  const options: TurnOption[] = exits
    .filter((x) => x.kind !== 'vuelta-en-u')
    .map((x) => ({ ...x, legality: legalityOf(graph, arriving, x.edge, x.kind) }));

  // La vuelta en U, también a la otra calzada, solo se ofrece en calles sin salida, en el borde del
  // área o cuando no queda ninguna salida legal (casi siempre, un error de datos).
  const noLegalExit = !options.some((o) => o.legality.status === 'legal');
  if (graph.degree(node) === 1 || graph.outside.has(node) || noLegalExit) {
    for (const x of exits) {
      if (x.kind !== 'vuelta-en-u') continue;
      const legality = legalityOf(graph, arriving, x.edge, x.kind);
      if (legality.status === 'legal') options.push({ ...x, legality });
    }
  }
  return options;
}

/** Penalización de giro en metros (sección 5). */
export const TURN_PENALTY_M = { left: 40, right: 15, uTurn: 80 } as const;

export function turnPenalty(kind: TurnKind): number {
  if (kind === 'vuelta-en-u') return TURN_PENALTY_M.uTurn;
  if (isLeftTurn(kind)) return TURN_PENALTY_M.left;
  if (isRightTurn(kind)) return TURN_PENALTY_M.right;
  return 0;
}

/**
 * Tabla de transiciones legales de cada arista, calculada una vez. Los giros condicionales no
 * entran: la ruta óptima los evita (sección 5).
 */
export class TurnTable {
  readonly graph: RoadGraph;
  private readonly start: Int32Array;
  private readonly targets: Int32Array;
  private readonly penalties: Float64Array;

  constructor(graph: RoadGraph) {
    this.graph = graph;
    const start = new Int32Array(graph.edgeCount + 1);
    const targets: number[] = [];
    const penalties: number[] = [];
    for (let edge = 0; edge < graph.edgeCount; edge++) {
      start[edge] = targets.length;
      if (!graph.isLegalEdge(edge)) continue;
      for (const option of turnOptions(graph, edge)) {
        if (option.legality.status !== 'legal') continue;
        targets.push(option.edge);
        penalties.push(turnPenalty(option.kind));
      }
    }
    start[graph.edgeCount] = targets.length;
    this.start = start;
    this.targets = Int32Array.from(targets);
    this.penalties = Float64Array.from(penalties);
  }

  /** Aristas a las que se puede pasar legalmente desde `edge`. */
  next(edge: number): Int32Array {
    return this.targets.subarray(this.start[edge] ?? 0, this.start[edge + 1] ?? 0);
  }

  /** Penalizaciones de giro, alineadas con next(edge). */
  nextPenalties(edge: number): Float64Array {
    return this.penalties.subarray(this.start[edge] ?? 0, this.start[edge + 1] ?? 0);
  }
}
