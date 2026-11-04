/**
 * Respaldo del progreso (sección 9): un archivo JSON que se puede importar en la misma versión de
 * los datos o en una más nueva, porque las tarjetas pasan por los archivos de cambios.
 */
import type { StudyCard } from '../engine/srs/cards';
import { reviveMemory, type MemoryRevlog } from '../engine/srs/scheduler';
import {
  db,
  type AppSettings,
  type ConfusionRow,
  type Database,
  type DayRow,
  type MetaRow,
  type OverrideRow,
  type ReviewRow,
} from './db';
import { CHANGED_KEY, migrateCards, syncCards, type DataUpdate } from './progress';

export const BACKUP_SCHEMA = 2;
const BACKUP_APP = 'sin-gps';
/** La sesión en curso no viaja: es de ese celu y de ese momento. */
const LOCAL_META = new Set(['session']);

export interface Backup {
  app: typeof BACKUP_APP;
  schema: number;
  exportedAt: string;
  dataVersion: string;
  cards: StudyCard[];
  reviews: ReviewRow[];
  confusions: ConfusionRow[];
  days: DayRow[];
  overrides: OverrideRow[];
  settings: AppSettings | undefined;
  meta: MetaRow[];
}

export async function buildBackup(
  dataVersion: string,
  now: Date,
  database: Database = db,
): Promise<Backup> {
  const [cards, reviews, confusions, days, overrides, settings, meta] = await Promise.all([
    database.cards.toArray(),
    database.reviews.toArray(),
    database.confusions.toArray(),
    database.days.toArray(),
    database.overrides.toArray(),
    database.settings.get('app'),
    database.meta.toArray(),
  ]);
  return {
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    exportedAt: now.toISOString(),
    dataVersion,
    cards,
    reviews,
    confusions,
    days,
    overrides,
    settings: settings?.value,
    meta: meta.filter((row) => !LOCAL_META.has(row.key)),
  };
}

function reviveRevlog(revlog: MemoryRevlog): MemoryRevlog {
  const date = (value: unknown) => (value == null ? value : new Date(value as string));
  return {
    ...revlog,
    dueAt: date(revlog.dueAt),
    lastReviewAt: date(revlog.lastReviewAt),
    reviewTime: date(revlog.reviewTime),
  } as MemoryRevlog;
}

/** Lee un archivo de respaldo. Tira un error con un texto para mostrar si no sirve. */
export function parseBackup(text: string): Backup {
  let parsed: Partial<Backup>;
  try {
    parsed = JSON.parse(text) as Partial<Backup>;
  } catch {
    throw new Error('Ese archivo no es un respaldo de Sin GPS.');
  }
  if (parsed.app !== BACKUP_APP || !Array.isArray(parsed.cards)) {
    throw new Error('Ese archivo no es un respaldo de Sin GPS.');
  }
  if ((parsed.schema ?? 0) > BACKUP_SCHEMA) {
    throw new Error('Ese respaldo es de una versión más nueva: actualizá la app primero.');
  }
  return {
    app: BACKUP_APP,
    schema: parsed.schema ?? BACKUP_SCHEMA,
    exportedAt: parsed.exportedAt ?? '',
    dataVersion: parsed.dataVersion ?? '',
    cards: parsed.cards.map((card) => ({
      ...card,
      memory: reviveMemory(card.memory as unknown as Record<string, unknown>),
    })),
    reviews: (parsed.reviews ?? []).map((row) => ({ ...row, revlog: reviveRevlog(row.revlog) })),
    confusions: parsed.confusions ?? [],
    days: parsed.days ?? [],
    overrides: parsed.overrides ?? [],
    settings: parsed.settings,
    meta: parsed.meta ?? [],
  };
}

/** Reemplaza todo el progreso por el del respaldo. Si no se puede, no toca nada. */
export async function restoreBackup(
  text: string,
  update: DataUpdate,
  database: Database = db,
): Promise<void> {
  const backup = parseBackup(text);
  const migrated = await migrateCards(backup.cards, backup.dataVersion, update);
  if (!migrated) {
    throw new Error('Ese respaldo es de otra versión de los datos: actualizá la app primero.');
  }
  const { cards, changed } = migrated;
  await database.transaction(
    'rw',
    [
      database.cards,
      database.reviews,
      database.confusions,
      database.days,
      database.overrides,
      database.settings,
      database.meta,
    ],
    async () => {
      await Promise.all([
        database.cards.clear(),
        database.reviews.clear(),
        database.confusions.clear(),
        database.days.clear(),
        database.overrides.clear(),
        database.settings.clear(),
        database.meta.clear(),
      ]);
      await database.cards.bulkPut(cards);
      await database.reviews.bulkPut(backup.reviews);
      await database.confusions.bulkPut(backup.confusions);
      await database.days.bulkPut(backup.days);
      await database.overrides.bulkPut(backup.overrides);
      if (backup.settings) await database.settings.put({ key: 'app', value: backup.settings });
      await database.meta.bulkPut(backup.meta);
      await database.meta.put({ key: 'dataVersion', value: update.version });
      if (changed.length > 0) {
        const waiting = backup.meta.find((row) => row.key === CHANGED_KEY)?.value;
        await database.meta.put({
          key: CHANGED_KEY,
          value: [...((waiting as typeof changed | undefined) ?? []), ...changed],
        });
      }
    },
  );
  await syncCards(update, database);
}
