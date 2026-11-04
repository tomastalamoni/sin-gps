/**
 * Base local (sección 9). Cada cambio de esquema es una versión nueva de esta lista, con su
 * migración y su test: el progreso nunca se pierde al actualizar la app.
 */
import { Dexie, type Table } from 'dexie';
import type { TrackPoint } from '../engine/corrections';
import type { Direction } from '../engine/data';

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

const DATABASE_NAME = 'sin-gps';

export class Database extends Dexie {
  declare overrides: Table<OverrideRow, number>;
  declare meta: Table<MetaRow, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({ overrides: '++id, street, stretch', meta: 'key' });
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
