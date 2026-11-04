/**
 * Un alumno virtual con semilla (sección 10): usa el mismo motor que la app durante varios meses y
 * mide cuánto tiempo por día pide cada opción de calles nuevas.
 */
import type { StreetRecord } from '../data';
import type { CardId } from '../ids';
import { createRandom, type Random } from '../random';
import { newStudyCard, reviewCard, type StudyCard } from './cards';
import type { Lesson } from './curriculum';
import { gradeAnswer, type Interaction } from './grading';
import { planSession } from './planner';
import type { Srs } from './scheduler';

export interface SimulationInput {
  srs: Srs;
  lessons: readonly Lesson[];
  streets: readonly StreetRecord[];
  newPerDay: number;
  days: number;
  seed: number;
}

export interface SimulatedDay {
  reviews: number;
  lessons: number;
  seconds: number;
  correct: number;
}

export interface SimulationResult {
  newPerDay: number;
  days: SimulatedDay[];
  /** Minutos por día mientras se aprenden calles nuevas, que es lo que se elige. */
  minutes: number;
  /** El día más cargado, para no prometer de menos. */
  peakMinutes: number;
  reviewsPerDay: number;
  /** Lecciones que se llegaron a hacer. */
  lessons: number;
  /** Aciertos sobre el total. */
  accuracy: number;
}

/** Segundos de un ítem, con la lectura del feedback, y de la ficha de una lección. */
export const SIMULATED_SECONDS = { perItem: 8, perLesson: 40 } as const;
/** Después de ver la ficha, la primera respuesta se acierta casi siempre. */
const FIRST_ANSWER_RECALL = 0.8;
const MS_PER_DAY = 86_400_000;
/** Con esto, uno de cada diez aciertos es lento. */
const ANSWER_SPREAD = 0.65;

/** Un tiempo de respuesta log-normal: la mayoría cerca de la mediana y algunos mucho más lentos. */
function answerMs(random: Random, correct: boolean, interaction: Interaction): number {
  const median = (correct ? 3500 : 6500) * (interaction === 'tap' ? 1.5 : 1);
  const u = Math.max(random.next(), Number.EPSILON);
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random.next());
  return median * Math.exp(ANSWER_SPREAD * normal);
}

/** Las de nombre y las de hitos alternan elegir y tocar el mapa. */
function interactionOf(id: CardId, reps: number): Interaction {
  return (id.startsWith('N:') || id.startsWith('H:')) && reps % 2 === 0 ? 'tap' : 'choice';
}

function isDirection(id: CardId): boolean {
  return id.startsWith('S:');
}

export function simulate(input: SimulationInput): SimulationResult {
  const { srs, lessons, streets, newPerDay, days, seed } = input;
  const random = createRandom(seed);
  const cards = new Map<string, StudyCard>();
  const seen = new Set<string>();
  const log: SimulatedDay[] = [];
  const start = new Date(2026, 0, 1, 12).getTime();

  for (let day = 0; day < days; day++) {
    const now = new Date(start + day * MS_PER_DAY);
    const today: SimulatedDay = { reviews: 0, lessons: 0, seconds: 0, correct: 0 };
    const { items } = planSession({
      kind: 'long',
      state: { cards, seen, reviewedToday: 0, lessonsToday: 0 },
      lessons,
      streets,
      newPerDay,
      srs,
      now,
      random,
    });
    for (const item of items) {
      if (item.type === 'lesson') {
        today.lessons++;
        today.seconds += SIMULATED_SECONDS.perLesson;
        if (item.lesson.cards.length === 0) seen.add(item.lesson.id);
        continue;
      }
      today.seconds += SIMULATED_SECONDS.perItem;
      if (item.type === 'practice') continue;

      const known = cards.get(item.card);
      const card = known ?? newStudyCard(srs, item.card, now);
      const recall = known ? srs.recall(card.memory, now) : FIRST_ANSWER_RECALL;
      const correct = random.next() < recall;
      const interaction = interactionOf(item.card, card.memory.reps);
      const { grade, fast } = gradeAnswer({
        correct,
        elapsedMs: answerMs(random, correct, interaction),
        interaction,
        previousFast: card.lastFast,
        direction: isDirection(item.card),
      });
      cards.set(item.card, reviewCard(srs, card, { grade, fast, now }).card);
      today.reviews++;
      if (correct) today.correct++;
    }
    log.push(today);
  }

  const total = (pick: (d: SimulatedDay) => number) => log.reduce((sum, d) => sum + pick(d), 0);
  const reviews = total((d) => d.reviews);
  const learning = log.filter((d) => d.lessons > 0);
  return {
    newPerDay,
    days: log,
    minutes: learning.reduce((sum, d) => sum + d.seconds, 0) / 60 / Math.max(1, learning.length),
    peakMinutes: Math.max(...log.map((d) => d.seconds)) / 60,
    reviewsPerDay: reviews / log.length,
    lessons: total((d) => d.lessons),
    accuracy: reviews === 0 ? 0 : total((d) => d.correct) / reviews,
  };
}
