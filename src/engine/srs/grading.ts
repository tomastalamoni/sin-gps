/** La nota se pone sola, según acierto y tiempo (sección 3). */
import type { Grade } from './scheduler';

/** Cómo se responde: los umbrales son por modo, porque tocar el mapa lleva más tiempo. */
export type Interaction = 'choice' | 'tap';

export interface Thresholds {
  /** Menos que esto es rápido. */
  fastMs: number;
  /** Más que esto es lento. */
  slowMs: number;
}

export const DEFAULT_THRESHOLDS: Readonly<Record<Interaction, Thresholds>> = {
  choice: { fastMs: 2500, slowMs: 8000 },
  tap: { fastMs: 4000, slowMs: 12_000 },
};

export interface AnswerInput {
  correct: boolean;
  elapsedMs: number;
  interaction: Interaction;
  /** Usó una pista o miró el mapa. */
  helped?: boolean;
  /** La revisión anterior también fue correcta y rápida. */
  previousFast: boolean;
  /** Las tarjetas de sentido nunca llegan a Easy. */
  direction: boolean;
}

export function gradeAnswer(
  answer: AnswerInput,
  thresholds: Readonly<Record<Interaction, Thresholds>> = DEFAULT_THRESHOLDS,
): { grade: Grade; fast: boolean } {
  const { fastMs, slowMs } = thresholds[answer.interaction];
  if (!answer.correct) return { grade: 'again', fast: false };
  if (answer.helped === true || answer.elapsedMs > slowMs) return { grade: 'hard', fast: false };
  const fast = answer.elapsedMs < fastMs;
  const easy = fast && answer.previousFast && !answer.direction;
  return { grade: easy ? 'easy' : 'good', fast };
}
