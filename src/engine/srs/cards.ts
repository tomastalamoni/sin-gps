/**
 * Lo que la app guarda de cada tarjeta: la tarjeta completa de ts-fsrs y lo que hace falta para el
 * dominio y para limitar las revisiones a una por día (sección 3).
 */
import type { CardId } from '../ids';
import { addDays, dayOf, daysBetween, type Day } from './days';
import type { Grade, MemoryCard, MemoryRevlog, Srs } from './scheduler';

export interface StudyCard {
  id: CardId;
  memory: MemoryCard;
  /** Desde este día la tarjeta está vencida. */
  dueDay: Day;
  createdDay: Day;
  /** El último día con una revisión. */
  lastDay?: Day;
  /** Días distintos en que se acertó. */
  correctDays: number;
  /** El intervalo más largo después del que se acertó, en días. */
  longestRecall: number;
  /** La última revisión fue correcta y rápida: dos seguidas dan "Easy". */
  lastFast: boolean;
  /** La variante que se preguntó la última vez, para alternar. */
  lastPrompt?: string;
  /** El dato quedó en duda: no se pregunta ni cuenta. */
  suspended?: boolean;
}

export function newStudyCard(srs: Srs, id: CardId, now: Date): StudyCard {
  const today = dayOf(now);
  return {
    id,
    memory: srs.newCard(id, now),
    dueDay: today,
    createdDay: today,
    correctDays: 0,
    longestRecall: 0,
    lastFast: false,
  };
}

export interface ReviewInput {
  grade: Grade;
  fast: boolean;
  now: Date;
  prompt?: string;
}

export interface ReviewOutcome {
  card: StudyCard;
  /** Sin revlog no hubo revisión: era otra respuesta del mismo día, que es práctica. */
  revlog?: MemoryRevlog;
}

/** El día siguiente, o más adelante si el scheduler lo dice: nunca dos revisiones en un día. */
function nextDueDay(memory: MemoryCard, today: Day): Day {
  const due = dayOf(memory.dueAt);
  return due > today ? due : addDays(today, 1);
}

/** La primera respuesta del día califica; las repeticiones de ese día son práctica. */
export function reviewCard(srs: Srs, card: StudyCard, input: ReviewInput): ReviewOutcome {
  const { grade, fast, now, prompt } = input;
  const today = dayOf(now);
  // Con `>=`, un reloj que retrocede tampoco regala otra revisión.
  if (card.lastDay !== undefined && card.lastDay >= today) return { card };

  const { memory, revlog } = srs.review(card.memory, grade, now);
  const correct = grade !== 'again';
  const interval = card.lastDay ? daysBetween(card.lastDay, today) : 0;
  return {
    card: {
      ...card,
      memory,
      dueDay: nextDueDay(memory, today),
      lastDay: today,
      correctDays: card.correctDays + (correct ? 1 : 0),
      longestRecall: correct ? Math.max(card.longestRecall, interval) : card.longestRecall,
      lastFast: correct && fast,
      ...(prompt ? { lastPrompt: prompt } : {}),
    },
    revlog,
  };
}

/** Un error sobre un dato que no estaba a la vista deja la tarjeta vencida hoy, sin calificarla. */
export function dueToday(card: StudyCard, now: Date): StudyCard {
  return { ...card, dueDay: dayOf(now) };
}

/**
 * Una calle sabida en el diagnóstico arranca cerca de 7 días hasta el 90%, nunca Firme. Se llega con
 * dos revisiones reales del scheduler (Hard y Good, separadas 2 días), sin inventar la memoria.
 */
export function seedKnownCard(srs: Srs, id: CardId, now: Date): StudyCard {
  const first = new Date(now);
  first.setDate(first.getDate() - 2);
  const start = newStudyCard(srs, id, first);
  const { memory: hard } = srs.review(start.memory, 'hard', first);
  const { memory } = srs.review(hard, 'good', now);
  const today = dayOf(now);
  return {
    ...start,
    memory,
    dueDay: nextDueDay(memory, today),
    createdDay: today,
    lastDay: today,
    correctDays: 2,
  };
}
