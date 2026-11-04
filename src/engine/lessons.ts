/** Lo que hace falta para armar las lecciones a partir de los archivos de datos. */
import type { BarrioInfo } from './barrios';
import type { LandmarkRecord, RailLine, StreetRecord } from './data';
import { cardIds, isCardId, type CardId } from './ids';

/** Las tarjetas de autopista, de barreras.json. */
export function barrierCardsOf(barriers: GeoJSON.FeatureCollection): CardId[] {
  return [
    ...new Set(
      barriers.features.flatMap(({ properties }) => {
        const card = (properties as { card?: string } | null)?.card;
        return card && isCardId(card) ? [card] : [];
      }),
    ),
  ];
}

/** Todas las tarjetas que existen en estos datos. */
export function cardCatalog(
  streets: readonly StreetRecord[],
  landmarks: readonly LandmarkRecord[],
  barrios: readonly BarrioInfo[],
  rail: readonly RailLine[],
  barrierCards: readonly CardId[],
): Set<string> {
  return new Set<string>([
    ...streets.filter((s) => s.askable).map((s) => cardIds.name(s.code)),
    ...streets.flatMap((s) => s.stretches.map((stretch) => stretch.id)),
    ...landmarks.map((l) => l.id),
    ...barrios.map((b) => b.id),
    ...rail.flatMap((line) => line.stretches.map((s) => s.id)),
    ...barrierCards,
  ]);
}
