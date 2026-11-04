/**
 * Días de estudio. El día cambia a medianoche, hora del celu. Se guardan como texto (AAAA-MM-DD):
 * comparar dos días es comparar dos textos.
 */
export type Day = string;

const MS_PER_DAY = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dayOf(date: Date): Day {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parse(day: Day): Date {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

export function addDays(day: Day, days: number): Day {
  const date = parse(day);
  date.setDate(date.getDate() + days);
  return dayOf(date);
}

/** Días enteros de `from` a `to`. Se redondea para no depender del cambio de hora. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / MS_PER_DAY);
}
