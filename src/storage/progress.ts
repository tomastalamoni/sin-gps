/**
 * El progreso en la base local. Cada respuesta se guarda enseguida, tarjeta y revisión juntas: si
 * se corta la app, no se pierde nada (sección 7).
 */
import { applyChanges, changesPath, suspendDoubtful } from '../engine/changes';
import type { ChangesFile, StreetRecord } from '../engine/data';
import type { CardId } from '../engine/ids';
import type { QuizMode } from '../engine/quiz/types';
import { newStudyCard, reviewCard, type StudyCard } from '../engine/srs/cards';
import { dayOf, type Day } from '../engine/srs/days';
import { gradeAnswer, type Interaction } from '../engine/srs/grading';
import type { Grade, Srs } from '../engine/srs/scheduler';
import {
  db,
  DEFAULT_SETTINGS,
  type AppSettings,
  type ConfusionRow,
  type Database,
  type DayRow,
} from './db';

export interface AnswerInput {
  card: CardId;
  mode: QuizMode;
  seed: number;
  interaction: Interaction;
  correct: boolean;
  elapsedMs: number;
  helped?: boolean;
  /** Las dos calles que se confundieron. */
  confused?: [number, number];
  now: Date;
}

export interface SavedAnswer {
  card: StudyCard;
  /** Sin nota, era otra respuesta del mismo día: práctica. */
  grade?: Grade;
}

function emptyDay(day: Day): DayRow {
  return { day, reviews: 0, fresh: 0, correct: 0, lessons: 0, ms: 0 };
}

function pairOf(a: number, b: number): Pick<ConfusionRow, 'pair' | 'a' | 'b'> {
  const [low, high] = a < b ? [a, b] : [b, a];
  return { pair: `${low}-${high}`, a: low, b: high };
}

export async function saveAnswer(
  srs: Srs,
  input: AnswerInput,
  database: Database = db,
): Promise<SavedAnswer> {
  const { card: id, correct, elapsedMs, interaction, helped, now, mode, seed, confused } = input;
  const today = dayOf(now);
  return database.transaction(
    'rw',
    [database.cards, database.reviews, database.days, database.confusions],
    async () => {
      const card = (await database.cards.get(id)) ?? newStudyCard(srs, id, now);
      const { grade, fast } = gradeAnswer({
        correct,
        elapsedMs,
        interaction,
        previousFast: card.lastFast,
        direction: id.startsWith('S:'),
        ...(helped ? { helped } : {}),
      });
      const outcome = reviewCard(srs, card, { grade, fast, now, prompt: mode });
      await database.cards.put(outcome.card);

      const row = (await database.days.get(today)) ?? emptyDay(today);
      const graded = outcome.revlog !== undefined;
      await database.days.put({
        ...row,
        reviews: row.reviews + (graded ? 1 : 0),
        fresh: (row.fresh ?? 0) + (graded && card.memory.reps === 0 ? 1 : 0),
        correct: row.correct + (graded && correct ? 1 : 0),
        ms: row.ms + elapsedMs,
      });
      if (outcome.revlog) {
        await database.reviews.add({
          card: id,
          day: today,
          grade,
          correct,
          elapsedMs,
          mode,
          seed,
          revlog: outcome.revlog,
        });
      }
      if (confused) {
        const pair = pairOf(confused[0], confused[1]);
        const known = await database.confusions.get(pair.pair);
        await database.confusions.put({
          ...pair,
          count: (known?.count ?? 0) + 1,
          lastDay: today,
        });
      }
      return { card: outcome.card, ...(graded ? { grade } : {}) };
    },
  );
}

/** Suma una lección al día. */
export async function noteLesson(now: Date, database: Database = db): Promise<void> {
  const today = dayOf(now);
  await database.transaction('rw', database.days, async () => {
    const row = (await database.days.get(today)) ?? emptyDay(today);
    await database.days.put({ ...row, lessons: row.lessons + 1 });
  });
}

export async function readSettings(database: Database = db): Promise<AppSettings> {
  const row = await database.settings.get('app');
  return { ...DEFAULT_SETTINGS, ...row?.value };
}

export async function updateSettings(
  patch: Partial<AppSettings>,
  database: Database = db,
): Promise<AppSettings> {
  return database.transaction('rw', database.settings, async () => {
    const value = { ...(await readSettings(database)), ...patch };
    await database.settings.put({ key: 'app', value });
    return value;
  });
}

/** Las calles confundidas con cada calle, de la más confundida a la menos. */
export function confusionsByStreet(rows: readonly ConfusionRow[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const { a, b } of [...rows].sort((x, y) => y.count - x.count)) {
    out.set(a, [...(out.get(a) ?? []), b]);
    out.set(b, [...(out.get(b) ?? []), a]);
  }
  return out;
}

const DATA_VERSION_KEY = 'dataVersion';
/** Sentidos que cambiaron en una versión nueva: esperan su lección "cambió". */
export const CHANGED_KEY = 'changedDirections';

export interface DataUpdate {
  version: string;
  files: readonly string[];
  fetchChanges(file: string): Promise<ChangesFile>;
  streets: readonly StreetRecord[];
}

/** Lleva las tarjetas de una versión a otra. Sin archivos que las unan, devuelve undefined. */
export async function migrateCards(
  cards: readonly StudyCard[],
  from: string,
  update: Pick<DataUpdate, 'version' | 'files' | 'fetchChanges'>,
): Promise<{ cards: StudyCard[]; changed: ChangesFile['directionChanges'] } | undefined> {
  const path = changesPath(from, update.version, update.files);
  if (!path) return undefined;
  let current = [...cards];
  const changed: ChangesFile['directionChanges'] = [];
  for (const file of path) {
    const result = applyChanges(current, await update.fetchChanges(file));
    current = result.cards;
    changed.push(...result.changed);
  }
  return { cards: current, changed };
}

/**
 * Al cargar una versión nueva de los datos: aplica los archivos de cambios y suspende las tarjetas
 * de los tramos que quedaron dudosos. Lo que se baja se hace antes de abrir la transacción.
 */
export async function syncCards(update: DataUpdate, database: Database = db): Promise<void> {
  const stored = (await database.meta.get(DATA_VERSION_KEY))?.value as string | undefined;
  const before = await database.cards.toArray();
  const migrated =
    stored === undefined || stored === update.version
      ? { cards: before, changed: [] }
      : await migrateCards(before, stored, update);
  // Sin camino la versión no avanza: se vuelve a intentar con los archivos que lleguen después.
  const { cards, changed } = migrated ?? { cards: before, changed: [] };
  const version = migrated ? update.version : stored;
  const next = suspendDoubtful(cards, update.streets);

  const unchanged = stored === version && next.every((card, i) => card === before[i]);
  if (unchanged) return;
  await database.transaction('rw', [database.cards, database.meta], async () => {
    await database.cards.clear();
    await database.cards.bulkPut(next);
    await database.meta.put({ key: DATA_VERSION_KEY, value: version });
    if (changed.length > 0) {
      const waiting = (await database.meta.get(CHANGED_KEY))?.value as typeof changed | undefined;
      await database.meta.put({ key: CHANGED_KEY, value: [...(waiting ?? []), ...changed] });
    }
  });
}

/** Un dato corregido reinicia su tarjeta (sección 6). */
export async function resetCard(id: string, database: Database = db): Promise<void> {
  await database.cards.delete(id);
}
