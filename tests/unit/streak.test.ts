import { describe, expect, it } from 'vitest';
import { activeDays, computeStreak } from '../../src/engine/srs/streak';

// El 2 de noviembre de 2026 es lunes.
const MONDAY = '2026-11-02';

describe('racha', () => {
  it('sin días cumplidos, no hay racha', () => {
    expect(computeStreak([], MONDAY)).toEqual({
      current: 0,
      best: 0,
      today: false,
      jokerLeft: true,
    });
  });

  it('cuenta los días seguidos hasta hoy', () => {
    const result = computeStreak(['2026-11-02', '2026-11-03', '2026-11-04'], '2026-11-04');
    expect(result).toMatchObject({ current: 3, today: true });
  });

  it('hoy todavía se puede cumplir: no corta la racha', () => {
    const result = computeStreak(['2026-11-02', '2026-11-03'], '2026-11-04');
    expect(result).toMatchObject({ current: 2, today: false, jokerLeft: true });
  });

  it('un día perdido gasta el comodín de la semana', () => {
    const result = computeStreak(['2026-11-02', '2026-11-04'], '2026-11-04');
    expect(result).toMatchObject({ current: 3, jokerLeft: false });
  });

  it('dos días perdidos en la misma semana cortan la racha, pero guardan la mejor', () => {
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-07'];
    const result = computeStreak(days, '2026-11-07');
    expect(result.current).toBe(1);
    expect(result.best).toBe(4);
  });

  it('el comodín se renueva el lunes', () => {
    const days = ['2026-11-06', '2026-11-08', '2026-11-10'];
    const result = computeStreak(days, '2026-11-10');
    expect(result.current).toBe(5);
    expect(result.jokerLeft).toBe(false);
  });
});

describe('días activos', () => {
  it('cuenta solo los de la ventana', () => {
    const days = ['2026-10-20', '2026-11-01', '2026-11-05', '2026-11-07'];
    expect(activeDays(days, '2026-11-07', 7)).toBe(3);
  });
});
