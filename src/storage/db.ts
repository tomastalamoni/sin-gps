/**
 * Base local (sección 9). Cada cambio de esquema es una versión nueva de esta lista, con su
 * migración y su test: el progreso nunca se pierde al actualizar la app.
 */
import { Dexie, type Table } from 'dexie';
import type { TrackPoint } from '../engine/corrections';
import type { Direction } from '../engine/data';
import type { CardId } from '../engine/ids';
import type { QuizMode } from '../engine/quiz/types';
import type { StudyCard } from '../engine/srs/cards';
import type { Day } from '../engine/srs/days';
import { DEFAULT_RETENTION, type Grade, type MemoryRevlog } from '../engine/srs/scheduler';

export interface MetaRow {
  key: string;
  value: unknown;
}

export type ReportKind = 'sentido' | 'nombre' | 'falta-calle' | 'otro';

/** Una corrección o un reporte hecho en el celu (sección 6, "Reportes de datos"). */
export interface OverrideRow {
  id?: number;
  kind: ReportKind;
  createdAt: string;
  /** La versión de los datos con la que se hizo. */
  dataVersion: string;
  street?: number;
  /** La tarjeta de sentido corregida. */
  stretch?: string;
  /** El sentido correcto, respecto de la numeración. */
  dir?: Direction;
  /** Por dónde se circula en cada cuadra: encuentra el tramo aunque cambie su ID. */
  track?: TrackPoint[];
  /** El nombre correcto. */
  name?: string;
  note?: string;
  /** Dónde estaba mirando: lng, lat. */
  point?: [number, number];
}

/** Cada revisión: lo que devuelve ts-fsrs, más el tiempo de respuesta y el modo (sección 9). */
export interface ReviewRow {
  id?: number;
  card: CardId;
  day: Day;
  grade: Grade;
  correct: boolean;
  elapsedMs: number;
  mode: QuizMode;
  /** La semilla de la pregunta: alcanza para reproducirla. */
  seed: number;
  revlog: MemoryRevlog;
}

/** Un par de calles confundidas. */
export interface ConfusionRow {
  /** "menor-mayor": el par no tiene orden. */
  pair: string;
  a: number;
  b: number;
  count: number;
  lastDay: Day;
}

/** Lo que pasó cada día: alcanza para la meta, la racha y las estadísticas. */
export interface DayRow {
  day: Day;
  /** Respuestas que calificaron una tarjeta. */
  reviews: number;
  /** De esas, las que estrenaron una tarjeta: no cuentan para el tope de repasos. */
  fresh?: number;
  correct: number;
  lessons: number;
  /** Tiempo respondiendo, en milisegundos. */
  ms: number;
}

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface AppSettings {
  /** Ya pasó por el primer uso. */
  onboarded: boolean;
  /** Barrio base (Z:barrio). */
  base?: string;
  /** Barrios activos (Z:barrio). Sin lista, los nueve. */
  active?: string[];
  /** Foco: un barrio que va adelante (Z:barrio). */
  focus?: string;
  newPerDay: number;
  retention: number;
  /** Calles adelantadas con "Estudiar ahora". */
  priority: number[];
  /** Lecciones sin tarjetas que ya se vieron. */
  seen: string[];
  theme: ThemeSetting;
  /** Tamaño del texto: 1 es el normal. */
  textScale: number;
  reduceMotion: boolean;
  sound: boolean;
  vibration: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  onboarded: false,
  newPerDay: 4,
  retention: DEFAULT_RETENTION,
  priority: [],
  seen: [],
  theme: 'system',
  textScale: 1,
  reduceMotion: false,
  sound: true,
  vibration: true,
};

export interface SettingsRow {
  key: 'app';
  value: AppSettings;
}

const DATABASE_NAME = 'sin-gps';

export class Database extends Dexie {
  declare overrides: Table<OverrideRow, number>;
  declare meta: Table<MetaRow, string>;
  declare cards: Table<StudyCard, string>;
  declare reviews: Table<ReviewRow, number>;
  declare confusions: Table<ConfusionRow, string>;
  declare days: Table<DayRow, string>;
  declare settings: Table<SettingsRow, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({ overrides: '++id, street, stretch', meta: 'key' });
    // Solo suma tablas: lo que ya había queda como estaba.
    this.version(2).stores({
      cards: 'id, dueDay',
      reviews: '++id, card, day',
      confusions: 'pair, a, b',
      days: 'day',
      settings: 'key',
    });
  }
}

export const db = new Database();

/** Pide que el navegador no borre la base si le falta lugar. Si no se puede, sigue igual. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage.persist();
  } catch {
    // Navegadores viejos no lo tienen: el respaldo exportado cubre ese caso.
  }
}
