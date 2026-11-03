/**
 * Correcciones de Tomás (pipeline/overrides.json): se aplican al final del pipeline, con fecha y
 * nota. Cuando una versión nueva del callejero ya trae el mismo valor, la corrección sobra y el
 * reporte lo avisa.
 */
import type { Direction } from '../../src/engine/data';
import type { GraphSegment } from '../05-graph';
import { sideBySide } from './network';

export interface Correction {
  fecha: string;
  codigo: number;
  desde: number;
  hasta: number;
  sentido: 'CRECIENTE' | 'DECRECIENTE' | 'DOBLE';
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

export function applyCorrections(
  segments: readonly GraphSegment[],
  corrections: readonly Correction[],
): CorrectionsResult {
  const result: CorrectionsResult = { applied: [], redundant: [], unmatched: [], refused: [] };
  for (const correction of corrections) {
    const targets = segments.filter(
      (s) =>
        s.code === correction.codigo &&
        s.range &&
        s.range[0] <= correction.hasta &&
        s.range[1] >= correction.desde,
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
