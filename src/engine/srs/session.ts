/**
 * Arma una sesión (sección 3): las vencidas por riesgo de olvido, las lecciones del día y el regreso
 * de lo nuevo. Se alternan calles y modos, siempre que las preguntas lo permitan.
 */
import type { CardId } from '../ids';
import type { Random } from '../random';
import type { Lesson } from './curriculum';

export type SessionKind = 'short' | 'long';

export type SessionItem =
  | { type: 'lesson'; lesson: Lesson }
  /** Una tarjeta que se califica. */
  | { type: 'review'; card: CardId }
  /** Vuelve unos ítems después de la lección, sin calificar. */
  | { type: 'practice'; card: CardId };

export interface DueCard {
  id: CardId;
  /** Probabilidad de acordarse hoy: lo que más riesgo corre va primero. */
  recall: number;
}

export interface SessionInput {
  kind: SessionKind;
  due: readonly DueCard[];
  /** Revisiones que ya se hicieron hoy. */
  reviewedToday: number;
  /** Lecciones pendientes, en orden. */
  lessons: readonly Lesson[];
  /** Lecciones que ya se hicieron hoy. */
  lessonsToday: number;
  newPerDay: number;
  /** Tarjetas de sentido por estrenar, de las calles ya estudiadas. */
  newDirections: readonly CardId[];
  random: Random;
}

export interface SessionPlan {
  items: SessionItem[];
  /** Las vencidas superan el tope: hoy no entran calles nuevas. */
  behind: boolean;
}

export const SHORT_SESSION_ITEMS = 20;
export const DAILY_REVIEW_CAP = 150;
/** Lecciones por sesión corta. */
const SHORT_SESSION_LESSONS = 1;
/** Tarjetas de sentido por estrenar en una sesión corta. */
const SHORT_SESSION_DIRECTIONS = 2;
/** Cuántos ítems después vuelve la calle nueva. */
const RETURN_AFTER_ITEMS = 5;
/** La lección entra después de calentar con un tercio de las vencidas. */
const LESSON_AT = 1 / 3;

function groupOf(card: CardId): string {
  const [kind = '', code = ''] = card.split(':');
  return kind === 'N' || kind === 'S' ? code : card;
}

function kindOf(card: CardId): string {
  return card.slice(0, 1);
}

/** Toma de a uno, prefiriendo otra calle y otro tipo de pregunta que el ítem anterior. */
function interleave(cards: readonly CardId[]): CardId[] {
  const pending = [...cards];
  const out: CardId[] = [];
  while (pending.length > 0) {
    const last = out[out.length - 1];
    const differs = (c: CardId) => !last || groupOf(c) !== groupOf(last);
    const best = pending.findIndex((c) => differs(c) && (!last || kindOf(c) !== kindOf(last)));
    const pick = best >= 0 ? best : Math.max(pending.findIndex(differs), 0);
    out.push(pending.splice(pick, 1)[0] as CardId);
  }
  return out;
}

/** Una lección sin tarjetas no gasta cupo: entra junto con la siguiente. */
function pickLessons(lessons: readonly Lesson[], count: number): Lesson[] {
  const chosen: Lesson[] = [];
  let left = count;
  for (const lesson of lessons) {
    if (left === 0) break;
    chosen.push(lesson);
    if (lesson.cards.length > 0) left--;
  }
  return chosen;
}

/** Los ítems de una lección: la ficha y la primera pregunta de cada tarjeta. */
function lessonItems(lesson: Lesson): SessionItem[] {
  return [
    { type: 'lesson', lesson },
    ...lesson.cards.map((card): SessionItem => ({ type: 'review', card })),
  ];
}

/** Después de cada lección, la calle vuelve unos ítems más adelante. */
function withReturns(items: readonly SessionItem[]): SessionItem[] {
  const out = [...items];
  for (let i = out.length - 1; i >= 0; i--) {
    const item = out[i];
    if (item?.type !== 'lesson' || item.lesson.kind !== 'calle') continue;
    const card = item.lesson.cards[0];
    if (!card) continue;
    const at = Math.min(out.length, i + item.lesson.cards.length + 1 + RETURN_AFTER_ITEMS);
    out.splice(at, 0, { type: 'practice', card });
  }
  return out;
}

export function buildSession(input: SessionInput): SessionPlan {
  const { kind, due, reviewedToday, lessons, lessonsToday, newPerDay, newDirections } = input;
  const room = Math.max(0, DAILY_REVIEW_CAP - reviewedToday);
  const behind = due.length > room;
  const byRisk = [...due].sort((a, b) => a.recall - b.recall || a.id.localeCompare(b.id));

  const short = kind === 'short';
  const allowed = behind ? 0 : Math.max(0, newPerDay - lessonsToday);
  const chosenLessons = pickLessons(
    lessons,
    short ? Math.min(allowed, SHORT_SESSION_LESSONS) : allowed,
  );
  const lessonCount = chosenLessons.reduce((n, l) => n + 1 + l.cards.length, 0);

  const reviewRoom = short ? Math.max(0, SHORT_SESSION_ITEMS - lessonCount) : Infinity;
  const reviews = byRisk.slice(0, Math.min(room, reviewRoom)).map((c) => c.id);
  // Las tarjetas por estrenar también son repasos: entran en lo que queda del tope.
  const directionRoom = Math.max(0, Math.min(room, reviewRoom) - reviews.length);
  const directions = behind
    ? []
    : newDirections.slice(0, Math.min(directionRoom, short ? SHORT_SESSION_DIRECTIONS : Infinity));
  const mixed = interleave([...reviews, ...directions]);

  const items: SessionItem[] = mixed.map((card) => ({ type: 'review', card }));
  const at = Math.floor(items.length * LESSON_AT);
  items.splice(at, 0, ...chosenLessons.flatMap(lessonItems));
  return { items: withReturns(items), behind };
}

/** Minutos que se estiman para un conjunto de ítems, con los segundos de la simulación. */
export function estimateMinutes(
  items: number,
  lessons: number,
  seconds: { perItem: number; perLesson: number },
): number {
  return Math.max(1, Math.round((items * seconds.perItem + lessons * seconds.perLesson) / 60));
}
