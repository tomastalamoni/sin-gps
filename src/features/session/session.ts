/**
 * Una sesión en curso. Se guarda después de cada ítem: si se cierra la app, al volver sigue donde
 * estaba, mientras sea el mismo día.
 */
import type { CardId } from '../../engine/ids';
import { cardCatalog } from '../../engine/lessons';
import type { QuizData } from '../../engine/quiz';
import { createRandom } from '../../engine/random';
import { buildCurriculum, type Lesson } from '../../engine/srs/curriculum';
import { dayOf, type Day } from '../../engine/srs/days';
import { planSession, todaySummary, type StudyState } from '../../engine/srs/planner';
import { estimateMinutes, type SessionItem, type SessionKind } from '../../engine/srs/session';
import type { AppData } from '../../lib/data';
import type { StudyData } from '../../lib/study';
import { db } from '../../storage/db';

export interface SessionStats {
  answered: number;
  correct: number;
  /** Lecciones que se hicieron. */
  lessons: number;
  /** Tarjetas erradas: vuelven mañana. */
  missed: CardId[];
}

export interface ActiveSession {
  day: Day;
  kind: SessionKind;
  /** Semilla de la sesión: cada pregunta le suma su número de ítem. */
  seed: number;
  items: SessionItem[];
  index: number;
  stats: SessionStats;
}

const SESSION_KEY = 'session';
const LAST_SEED_KEY = 'ultimaSemilla';

export function quizData(data: AppData): QuizData {
  return {
    graph: data.graph,
    streets: data.streets,
    landmarks: data.landmarks,
    barrios: data.barrioList,
    barriosFile: data.barrios,
    barriers: data.barriers,
    rail: data.rail,
  };
}

export function curriculumOf(data: AppData, study: StudyData): Lesson[] {
  const { base, active, focus, priority } = study.settings;
  return buildCurriculum(
    {
      graph: data.graph,
      streets: data.streets,
      landmarks: data.landmarks,
      barrios: data.barrioList,
      rail: data.rail.lines,
      barrierCards: data.barrierCards,
    },
    { base, active, focus, priority },
  );
}

export function stateOf(data: AppData, study: StudyData, now: Date): StudyState {
  const today = study.days.get(dayOf(now));
  const catalog = cardCatalog(
    data.streets,
    data.landmarks,
    data.barrioList,
    data.rail.lines,
    data.barrierCards,
  );
  return {
    // Una tarjeta que estos datos ya no tienen no se puede preguntar: no cuenta para hoy.
    cards: new Map([...study.cards].filter(([id]) => catalog.has(id))),
    seen: new Set(study.settings.seen),
    reviewedToday: (today?.reviews ?? 0) - (today?.fresh ?? 0),
    lessonsToday: today?.lessons ?? 0,
  };
}

export interface TodayPlan {
  due: number;
  lessons: number;
  minutes: number;
}

/** Lo que falta hoy, para el botón de Inicio. */
export function todayPlan(data: AppData, study: StudyData, now: Date): TodayPlan {
  const { due, lessons } = todaySummary({
    state: stateOf(data, study, now),
    lessons: curriculumOf(data, study),
    streets: data.streets,
    newPerDay: study.settings.newPerDay,
    srs: study.srs,
    now,
  });
  return { due, lessons, minutes: estimateMinutes(due, lessons, data.load.seconds) };
}

export async function startSession(
  kind: SessionKind,
  data: AppData,
  study: StudyData,
  now: Date,
): Promise<ActiveSession | undefined> {
  const seed = now.getTime() % 2_147_483_647;
  const { items } = planSession({
    kind,
    state: stateOf(data, study, now),
    lessons: curriculumOf(data, study),
    streets: data.streets,
    newPerDay: study.settings.newPerDay,
    srs: study.srs,
    now,
    random: createRandom(seed),
  });
  if (items.length === 0) return undefined;
  const session: ActiveSession = {
    day: dayOf(now),
    kind,
    seed,
    items,
    index: 0,
    stats: { answered: 0, correct: 0, lessons: 0, missed: [] },
  };
  await db.meta.bulkPut([
    { key: SESSION_KEY, value: session },
    { key: LAST_SEED_KEY, value: seed },
  ]);
  return session;
}

/** La sesión que quedó a medias hoy. La de un día anterior ya no sirve: se arma otra. */
export async function readSession(now: Date): Promise<ActiveSession | undefined> {
  const row = await db.meta.get(SESSION_KEY);
  const session = row?.value as ActiveSession | undefined;
  return session?.day === dayOf(now) ? session : undefined;
}

export async function saveSession(session: ActiveSession): Promise<void> {
  await db.meta.put({ key: SESSION_KEY, value: session });
}

export async function clearSession(): Promise<void> {
  await db.meta.delete(SESSION_KEY);
}
