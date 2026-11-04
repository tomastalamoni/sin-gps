/** Del estado de las tarjetas a la sesión de hoy: lo usan la app y la simulación. */
import type { StreetRecord } from '../data';
import { cardIds, type CardId } from '../ids';
import type { Learner } from '../quiz/context';
import type { Random } from '../random';
import type { StudyCard } from './cards';
import { pendingDirections, pendingLessons, type Lesson } from './curriculum';
import { dayOf } from './days';
import { isKnown, masteryOf, type Mastery } from './mastery';
import type { Srs } from './scheduler';
import {
  buildSession,
  DAILY_REVIEW_CAP,
  type DueCard,
  type SessionKind,
  type SessionPlan,
} from './session';

export interface StudyState {
  cards: ReadonlyMap<string, StudyCard>;
  /** Lecciones sin tarjetas que ya se vieron. */
  seen: ReadonlySet<string>;
  reviewedToday: number;
  lessonsToday: number;
}

/** Hasta este nivel, una calle ya presentada es un ancla: su nombre queda a la vista. */
const ANCHOR_LEVEL = 2;
/** Con estos días hasta el 90%, una tarjeta se considera del todo firme para los distractores. */
const FIRM_DAYS = 21;

export function dueCards(cards: Iterable<StudyCard>, srs: Srs, now: Date): DueCard[] {
  const today = dayOf(now);
  return [...cards].flatMap((card) => {
    if (card.suspended || card.dueDay > today) return [];
    if (card.lastDay !== undefined && card.lastDay >= today) return [];
    return [{ id: card.id, recall: srs.recall(card.memory, now) }];
  });
}

export interface PlanInput {
  kind: SessionKind;
  state: StudyState;
  lessons: readonly Lesson[];
  streets: readonly StreetRecord[];
  newPerDay: number;
  srs: Srs;
  now: Date;
  random: Random;
}

export function planSession(input: PlanInput): SessionPlan {
  const { kind, state, lessons, streets, newPerDay, srs, now, random } = input;
  const known = new Set(state.cards.keys());
  return buildSession({
    kind,
    due: dueCards(state.cards.values(), srs, now),
    reviewedToday: state.reviewedToday,
    lessons: pendingLessons(lessons, known, state.seen),
    lessonsToday: state.lessonsToday,
    newPerDay,
    newDirections: pendingDirections(streets, state.cards, dayOf(now)),
    random,
  });
}

/** Lo que falta hoy, para el botón de Inicio. */
export function todaySummary(input: Omit<PlanInput, 'kind' | 'random'>): {
  due: number;
  lessons: number;
} {
  const { state, lessons, newPerDay, srs, now } = input;
  const known = new Set(state.cards.keys());
  const due = dueCards(state.cards.values(), srs, now).length;
  // Las mismas cuentas que `buildSession`: con atraso no entran calles nuevas.
  const room = Math.max(0, DAILY_REVIEW_CAP - state.reviewedToday);
  const allowed = due > room ? 0 : Math.max(0, newPerDay - state.lessonsToday);
  return {
    due: Math.min(due, room),
    lessons: Math.min(allowed, pendingLessons(lessons, known, state.seen).length),
  };
}

export function masteryOfCard(card: StudyCard | undefined, srs: Srs): Mastery | undefined {
  return card && masteryOf(card, srs.daysTo90(card.memory));
}

/** Lo que el jugador ya sabe, para las etiquetas y los distractores de las preguntas. */
export function learnerOf(
  cards: ReadonlyMap<string, StudyCard>,
  streets: readonly StreetRecord[],
  confusions: ReadonlyMap<number, readonly number[]>,
  srs: Srs,
): Learner {
  const knownStreets = streets.flatMap((street) => {
    const card = cards.get(cardIds.name(street.code));
    if (!card) return [];
    const anchor = street.level <= ANCHOR_LEVEL;
    return anchor || isKnown(masteryOfCard(card, srs)) ? [street.code] : [];
  });
  return {
    knownStreets: new Set(knownStreets),
    knownLandmarks: new Set([...cards.keys()].filter((id) => id.startsWith('H:'))),
    confusions: (street) => confusions.get(street) ?? [],
    firmness(id: CardId) {
      const card = cards.get(id);
      return card ? Math.min(1, srs.daysTo90(card.memory) / FIRM_DAYS) : 0;
    },
  };
}
