/** Corre la simulación para cada opción de calles nuevas: de acá sale public/data/carga.json. */
import type { LoadFile, StreetRecord } from '../data';
import type { Lesson } from './curriculum';
import type { Srs } from './scheduler';
import { SIMULATED_SECONDS, simulate } from './simulation';

export const LOAD_SEED = 20_261_104;
export const LOAD_DAYS = 180;
export const NEW_PER_DAY_OPTIONS = [2, 4, 6, 8] as const;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeLoad(
  srs: Srs,
  lessons: readonly Lesson[],
  streets: readonly StreetRecord[],
): LoadFile {
  return {
    seed: LOAD_SEED,
    days: LOAD_DAYS,
    seconds: SIMULATED_SECONDS,
    options: NEW_PER_DAY_OPTIONS.map((newPerDay) => {
      const { minutes, peakMinutes } = simulate({
        srs,
        lessons,
        streets,
        newPerDay,
        days: LOAD_DAYS,
        seed: LOAD_SEED,
      });
      return { newPerDay, minutes: round(minutes), peakMinutes: round(peakMinutes) };
    }),
  };
}
