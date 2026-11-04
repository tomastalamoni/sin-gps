/**
 * Meta del día y racha (sección 6). La meta es terminar las vencidas. La racha tiene un comodín por
 * semana y perderla no borra nada.
 */
import { addDays, daysBetween, type Day } from './days';

export interface StreakResult {
  /** Días seguidos con la meta cumplida, contando los salvados por el comodín. */
  current: number;
  best: number;
  /** Ya se cumplió la meta de hoy. */
  today: boolean;
  /** Queda el comodín de esta semana. */
  jokerLeft: boolean;
}

/** La semana empieza el lunes: el comodín se renueva ese día. */
function weekOf(day: Day): Day {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const weekday = (new Date(year, month - 1, date).getDay() + 6) % 7;
  return addDays(day, -weekday);
}

export function computeStreak(goalDays: Iterable<Day>, today: Day): StreakResult {
  const met = new Set(goalDays);
  const sorted = [...met].sort();

  // De la primera meta cumplida hasta hoy, usando un comodín por semana.
  let run = 0;
  let best = 0;
  let jokerWeek: Day | undefined;
  const first = sorted[0];
  if (first !== undefined) {
    for (let day = first; day <= today; day = addDays(day, 1)) {
      if (met.has(day)) {
        run++;
        best = Math.max(best, run);
      } else if (day === today) {
        // Hoy todavía se puede cumplir: no corta nada.
      } else if (weekOf(day) !== jokerWeek) {
        jokerWeek = weekOf(day);
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
  }
  return {
    current: run,
    best,
    today: met.has(today),
    jokerLeft: jokerWeek !== weekOf(today),
  };
}

/** Días de actividad en los últimos `window` días, para las estadísticas. */
export function activeDays(days: Iterable<Day>, today: Day, window: number): number {
  return [...days].filter((day) => {
    const ago = daysBetween(day, today);
    return ago >= 0 && ago < window;
  }).length;
}
