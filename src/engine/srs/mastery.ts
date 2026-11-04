/** Estados de dominio (sección 3), medidos con los días hasta el 90% del scheduler. */
import type { StudyCard } from './cards';

export type Mastery = 'aprendiendo' | 'debil' | 'en-progreso' | 'firme';

/** Hasta acertar en dos días distintos, la tarjeta sigue aprendiéndose. */
const LEARNED_AFTER_DAYS = 2;
const WEAK_BELOW_DAYS = 3;
const FIRM_FROM_DAYS = 21;
/** Firme pide además un acierto después de un intervalo así de largo. */
const FIRM_RECALL_DAYS = 14;

export function masteryOf(card: StudyCard, daysTo90: number): Mastery {
  if (card.correctDays < LEARNED_AFTER_DAYS) return 'aprendiendo';
  if (daysTo90 < WEAK_BELOW_DAYS) return 'debil';
  if (daysTo90 >= FIRM_FROM_DAYS && card.longestRecall >= FIRM_RECALL_DAYS) return 'firme';
  return 'en-progreso';
}

/** Las etiquetas del mapa muestran lo que ya vas sabiendo: En progreso o mejor. */
export function isKnown(mastery: Mastery | undefined): boolean {
  return mastery === 'en-progreso' || mastery === 'firme';
}

/**
 * Calle Firme: su tarjeta de nombre está Firme y también al menos dos tercios de sus tarjetas de
 * sentido en ese barrio.
 */
export function isStreetFirm(name: Mastery | undefined, directions: readonly Mastery[]): boolean {
  if (name !== 'firme') return false;
  const firm = directions.filter((m) => m === 'firme').length;
  return firm * 3 >= directions.length * 2;
}
