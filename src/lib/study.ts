/**
 * El progreso en memoria: se lee una vez de la base local y se mantiene al día con cada respuesta.
 * Las pantallas leen de acá, así nada espera a la base en medio de una sesión.
 */
import { use, useSyncExternalStore } from 'react';
import type { StudyCard } from '../engine/srs/cards';
import { createSrs, FSRS_MODEL, type Srs } from '../engine/srs/scheduler';
import { db, type AppSettings, type DayRow } from '../storage/db';
import { confusionsByStreet, readSettings } from '../storage/progress';
import { loadData } from './data';

export interface StudyData {
  srs: Srs;
  settings: AppSettings;
  cards: ReadonlyMap<string, StudyCard>;
  confusions: ReadonlyMap<number, readonly number[]>;
  days: ReadonlyMap<string, DayRow>;
}

/** Los parámetros de FSRS van en la base (sección 3): una versión nueva de la librería no los cambia. */
const FSRS_KEY = 'fsrs';

async function readStudy(): Promise<StudyData> {
  // Los datos van primero: al cargarlos se aplican los archivos de cambios a las tarjetas.
  await loadData();
  const [settings, cards, confusions, days] = await Promise.all([
    readSettings(),
    db.cards.toArray(),
    db.confusions.toArray(),
    db.days.toArray(),
  ]);
  const stored = (await db.meta.get(FSRS_KEY))?.value as { weights: number[] } | undefined;
  const srs = await createSrs(settings.retention, stored?.weights);
  if (!stored) {
    await db.meta.put({ key: FSRS_KEY, value: { model: FSRS_MODEL, weights: srs.weights } });
  }
  return {
    srs,
    settings,
    cards: new Map(cards.map((card) => [card.id, card])),
    confusions: confusionsByStreet(confusions),
    days: new Map(days.map((day) => [day.day, day])),
  };
}

let loading: Promise<StudyData> | undefined;
let current: StudyData | undefined;
const listeners = new Set<() => void>();

export function loadStudy(): Promise<StudyData> {
  loading ??= readStudy().then((study) => {
    current = study;
    return study;
  });
  return loading;
}

/** Vuelve a leer todo: después de una sesión, de un ajuste o de importar un respaldo. */
export async function refreshStudy(): Promise<StudyData> {
  current = await readStudy();
  loading = Promise.resolve(current);
  for (const listener of listeners) listener();
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** El progreso, suspendiendo el componente mientras se carga. */
export function useStudy(): StudyData {
  const first = use(loadStudy());
  return useSyncExternalStore(subscribe, () => current ?? first);
}
