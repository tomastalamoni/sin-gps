/**
 * Lista "Para verificar" (sección 6): los tramos en duda y sin par, los más usados primero.
 */
import { canCorrectDirection } from '../../engine/corrections';
import { SegmentFlag, type DirectionStretch, type StreetRecord } from '../../engine/data';
import type { AppData } from '../../lib/data';

export interface PendingStretch {
  street: StreetRecord;
  stretch: DirectionStretch;
}

function isPending(stretch: DirectionStretch, flags: readonly number[]): boolean {
  if (stretch.corrected || !canCorrectDirection(stretch)) return false;
  if (stretch.confidence !== 'en-duda' && stretch.confidence !== 'sin-par') return false;
  // La zona de borde no se pregunta: no hace falta verificarla.
  return stretch.segments.some((t) => ((flags[t] ?? 0) & SegmentFlag.border) === 0);
}

export function pendingStretches({ streets, segments }: AppData): PendingStretch[] {
  return streets
    .flatMap((street) =>
      street.stretches
        .filter((stretch) => isPending(stretch, segments.flags))
        .map((stretch) => ({ street, stretch })),
    )
    .sort(
      (a, b) =>
        b.street.importance - a.street.importance ||
        // A igual importancia, primero lo que sí se pregunta sin confirmar (sección 8).
        Number(b.stretch.confidence === 'sin-par') - Number(a.stretch.confidence === 'sin-par') ||
        a.stretch.id.localeCompare(b.stretch.id),
    );
}
