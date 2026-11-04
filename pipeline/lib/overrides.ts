/**
 * Correcciones de Tomás (pipeline/overrides.json): se aplican al final del pipeline, con fecha y
 * nota. Cuando una versión nueva del callejero ya trae el mismo valor, la corrección sobra y el
 * reporte lo avisa.
 */
import type { Direction } from '../../src/engine/data';
import {
  angleDiff,
  bearingDeg,
  lineLengthM,
  pointAlong,
  projectOnLine,
} from '../../src/engine/geo';
import type { GraphSegment } from '../05-graph';
import { sideBySide } from './network';

/** Un punto exportado por la app corrige la cuadra de esa calle a menos de esto. */
const POINT_MATCH_M = 15;

export interface Correction {
  fecha: string;
  codigo: number;
  /** Alturas a corregir, para una corrección escrita a mano. */
  desde?: number;
  hasta?: number;
  sentido: 'CRECIENTE' | 'DECRECIENTE' | 'DOBLE';
  /**
   * Las que exporta la app: cada cuadra con un punto y el rumbo en que se circula (sin rumbo, doble
   * mano). Identifican la cuadra aunque no tenga alturas o las alturas se pisen con otra.
   */
  tramos?: { punto: [number, number]; rumbo?: number }[];
  nota?: string;
}

export interface OverridesFile {
  correcciones: Correction[];
}

const DIRECTIONS: Record<Correction['sentido'], Direction> = {
  CRECIENTE: 'F',
  DECRECIENTE: 'B',
  DOBLE: 'D',
};

export interface CorrectionsResult {
  applied: Correction[];
  /** Ya coincidían con el callejero: se pueden borrar de overrides.json. */
  redundant: Correction[];
  unmatched: Correction[];
  /** No se aplican porque no queda claro a qué tramo se refieren. */
  refused: { correction: Correction; reason: string }[];
}

/**
 * Dos tramos que corren lado a lado, o que unen las mismas dos esquinas, son las dos calzadas de
 * una avenida: una corrección por alturas no dice a cuál apunta. Dos cuadras seguidas van una a
 * continuación de la otra, aunque sus números se pisen.
 */
function hasTwoCarriageways(targets: readonly GraphSegment[]): boolean {
  return targets.some((a, i) =>
    targets.slice(i + 1).some((b) => {
      const sameEnds = (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
      return sameEnds || (sideBySide(a, b) && sideBySide(b, a));
    }),
  );
}

/** Cada punto corrige la cuadra de esa calle que pasa por ahí. */
function applyByPoints(
  segments: readonly GraphSegment[],
  correction: Correction,
  track: NonNullable<Correction['tramos']>,
  result: CorrectionsResult,
): void {
  const own = segments.filter((s) => s.code === correction.codigo);
  const changes: { segment: GraphSegment; direction: Direction }[] = [];
  for (const { punto, rumbo } of track) {
    const nearest = own
      .map((segment) => ({ segment, ...projectOnLine(punto, segment.line) }))
      .sort((a, b) => a.distanceM - b.distanceM)[0];
    if (!nearest || nearest.distanceM > POINT_MATCH_M) {
      result.unmatched.push(correction);
      return;
    }
    const { segment, alongM } = nearest;
    let direction: Direction = 'D';
    if (rumbo !== undefined) {
      const length = lineLengthM(segment.line);
      const bearing = bearingDeg(
        pointAlong(segment.line, Math.max(0, alongM - 5)),
        pointAlong(segment.line, Math.min(length, alongM + 5)),
      );
      direction = Math.abs(angleDiff(bearing, rumbo)) <= 90 ? 'F' : 'B';
    }
    changes.push({ segment, direction });
  }
  if (changes.every((c) => c.segment.direction === c.direction && isConfirmed(c.segment))) {
    result.redundant.push(correction);
    return;
  }
  for (const { segment, direction } of changes) {
    segment.direction = direction;
    segment.confidence = 'confirmado';
  }
  result.applied.push(correction);
}

function isConfirmed(segment: GraphSegment): boolean {
  return segment.confidence === 'confirmado';
}

export function applyCorrections(
  segments: readonly GraphSegment[],
  corrections: readonly Correction[],
): CorrectionsResult {
  const result: CorrectionsResult = { applied: [], redundant: [], unmatched: [], refused: [] };
  for (const correction of corrections) {
    if (correction.tramos) {
      applyByPoints(segments, correction, correction.tramos, result);
      continue;
    }
    const { desde = 0, hasta = 0 } = correction;
    const targets = segments.filter(
      (s) => s.code === correction.codigo && s.range && s.range[0] <= hasta && s.range[1] >= desde,
    );
    if (targets.length === 0) {
      result.unmatched.push(correction);
      continue;
    }
    if (hasTwoCarriageways(targets)) {
      result.refused.push({ correction, reason: 'en esas alturas hay dos calzadas' });
      continue;
    }
    // CRECIENTE y DECRECIENTE se traducen con la geometría: tiene que estar orientada con las
    // cuadras vecinas, no por hipótesis. DOBLE no depende de la orientación.
    if (correction.sentido !== 'DOBLE' && targets.some((s) => s.orientation !== 'vecinos')) {
      result.refused.push({ correction, reason: 'la cuadra no se pudo orientar con sus vecinas' });
      continue;
    }
    const direction = DIRECTIONS[correction.sentido];
    if (targets.every((s) => s.direction === direction && s.confidence === 'confirmado')) {
      result.redundant.push(correction);
      continue;
    }
    for (const s of targets) {
      s.direction = direction;
      s.confidence = 'confirmado';
    }
    result.applied.push(correction);
  }
  return result;
}
