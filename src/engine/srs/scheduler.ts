/**
 * Envoltorio de ts-fsrs (sección 3): nada fuera de este archivo toca la librería. Se fija FSRS-7 de
 * forma explícita y sin los pasos de aprendizaje internos: la app repasa una vez por día.
 */
import {
  DefaultScheduler,
  Rating,
  type DefaultSchedulerCard,
  type DefaultSchedulerRevlog,
} from 'ts-fsrs';
import type { CardId } from '../ids';

export type MemoryCard = DefaultSchedulerCard;
export type MemoryRevlog = DefaultSchedulerRevlog;

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export const FSRS_MODEL = 'FSRS-7';
export const DEFAULT_RETENTION = 0.9;
/** El dominio se mide siempre al 90%, aunque cambie la retención deseada (sección 3). */
const MASTERY_RETENTION = 0.9;

const MS_PER_DAY = 86_400_000;

const RATINGS = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const;

export interface Srs {
  readonly retention: number;
  /** Los pesos del modelo: se guardan en la base para no depender de los de la librería. */
  readonly weights: readonly number[];
  newCard(id: CardId, now: Date): MemoryCard;
  review(card: MemoryCard, grade: Grade, now: Date): { memory: MemoryCard; revlog: MemoryRevlog };
  /** Días hasta que la probabilidad de acordarse baje al 90%, según el scheduler. */
  daysTo90(card: MemoryCard): number;
  /** Probabilidad de acordarse en ese momento, de 0 a 1. */
  recall(card: MemoryCard, now: Date): number;
}

export async function createSrs(
  retention = DEFAULT_RETENTION,
  weights?: readonly number[],
): Promise<Srs> {
  const scheduler = await DefaultScheduler({
    version: FSRS_MODEL,
    ...(weights ? { weights } : {}),
    desiredRetention: retention,
    enableShortTerm: false,
    learningSteps: [],
    relearningSteps: [],
    enableFuzz: false,
  });
  return {
    retention,
    weights: scheduler.config.weights,
    newCard: (id, now) => scheduler.newCard({ now, cardId: id }),
    review(card, grade, now) {
      // Si el reloj del celu retrocedió, el scheduler rechazaría la revisión.
      const last = card.lastReviewAt;
      const at = last && now < last ? last : now;
      const { card: memory, revlog } = scheduler.review({ card, grade: RATINGS[grade], now: at });
      return { memory, revlog };
    },
    daysTo90: (card) =>
      card.reps === 0 ? 0 : scheduler.model.nextInterval(card, MASTERY_RETENTION),
    recall(card, now) {
      if (card.reps === 0 || !card.lastReviewAt) return 0;
      const elapsed = (now.getTime() - card.lastReviewAt.getTime()) / MS_PER_DAY;
      return scheduler.model.forgettingCurve(card, Math.max(0, elapsed));
    },
  };
}

/** Vuelve a armar una tarjeta que pasó por JSON: el scheduler exige fechas de verdad. */
export function reviveMemory(card: Record<string, unknown>): MemoryCard {
  const date = (value: unknown) => (value == null ? value : new Date(value as string));
  return { ...card, dueAt: date(card.dueAt), lastReviewAt: date(card.lastReviewAt) } as MemoryCard;
}
