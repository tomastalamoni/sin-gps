/** El orden de estudio sobre los datos reales (sección 3). */
import { describe, expect, it } from 'vitest';
import { type CardId, cardIds } from '../../src/engine/ids';
import { barrierCardsOf } from '../../src/engine/lessons';
import {
  buildCurriculum,
  pendingDirections,
  pendingLessons,
  type CurriculumData,
} from '../../src/engine/srs/curriculum';
import { hasData, loadRealData } from './fixtures/real-data';

describe.skipIf(!hasData)('currículo sobre los datos reales', () => {
  const data = loadRealData();
  const barrierCards = barrierCardsOf(data.barriers);
  const curriculum: CurriculumData = {
    graph: data.graph,
    streets: data.streets,
    landmarks: data.landmarks,
    barrios: data.barrios,
    rail: data.rail.lines,
    barrierCards,
  };
  const palermo = data.barrios.find((b) => b.display === 'Palermo')?.id;
  const lessons = buildCurriculum(curriculum, { base: palermo });

  it('arranca por el río y los rumbos, y sigue por el nivel 0', () => {
    expect(lessons[0]?.kind).toBe('rumbos');
    const firstStreet = lessons.findIndex((l) => l.kind === 'calle');
    const orientation = lessons.slice(0, firstStreet).map((l) => l.kind);
    expect(orientation).toContain('barrios');
    expect(orientation).toContain('hitos');
    expect(orientation).toContain('autopistas');
  });

  it('los barrios empiezan por el barrio base', () => {
    const first = lessons.find((l) => l.kind === 'barrios');
    expect(first?.cards[0]).toBe(palermo);
  });

  it('no repite lecciones ni tarjetas', () => {
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
    const cards = lessons.flatMap((l) => l.cards);
    expect(new Set(cards).size).toBe(cards.length);
  });

  it('cubre todas las calles que se pueden preguntar', () => {
    const covered = new Set(lessons.flatMap((l) => (l.kind === 'calle' ? [l.street] : [])));
    const expected = data.streets.filter((s) => s.askable && s.barrios.length > 0);
    expect(expected.filter((s) => !covered.has(s.code)).map((s) => s.name)).toEqual([]);
  });

  it('cubre todos los barrios, los hitos del área y los cruces', () => {
    const cards = new Set(lessons.flatMap((l) => l.cards));
    for (const barrio of data.barrios) expect(cards.has(barrio.id as CardId)).toBe(true);
    for (const stretch of data.rail.lines.flatMap((l) => l.stretches)) {
      expect(cards.has(stretch.id as CardId), stretch.id).toBe(true);
    }
    const missing = data.landmarks.filter((l) => !cards.has(l.id as CardId));
    expect(missing.length).toBeLessThan(data.landmarks.length * 0.1);
  });

  it('el esqueleto va antes que las calles de barrio, por importancia', () => {
    const levels = lessons.flatMap((l) => {
      if (l.kind !== 'calle') return [];
      const street = data.streets.find((s) => s.code === l.street);
      return street ? [street.level] : [];
    });
    const lastSkeleton = levels.lastIndexOf(2);
    expect(levels.slice(0, lastSkeleton).every((level) => level <= 2)).toBe(true);
  });

  it('las calles locales arrancan por el barrio base', () => {
    const local = lessons.find((l) => {
      if (l.kind !== 'calle') return false;
      return (data.streets.find((s) => s.code === l.street)?.level ?? 0) > 2;
    });
    expect(local?.barrios).toContain('Palermo');
  });

  it('una calle adelantada va primero', () => {
    const street = data.streets.filter((s) => s.askable).at(-1);
    if (!street) throw new Error('Sin calles');
    const moved = buildCurriculum(curriculum, { base: palermo, priority: [street.code] });
    expect(moved[0]?.id).toBe(`L:calle:${street.code}`);
  });

  it('el foco adelanta un barrio sin perder el resto', () => {
    const focus = data.barrios.find((b) => b.display === 'Coghlan');
    const moved = buildCurriculum(curriculum, { base: palermo, focus: focus?.id });
    expect(moved[0]?.barrios).toContain('Coghlan');
    expect(moved).toHaveLength(lessons.length);
  });

  it('los barrios activos recortan lo que se enseña', () => {
    const active = data.barrios.filter((b) => b.display === 'Coghlan').map((b) => b.id);
    const few = buildCurriculum(curriculum, { active });
    expect(few.filter((l) => l.kind === 'barrios')).toHaveLength(1);
    expect(few.length).toBeLessThan(lessons.length);
  });

  it('una lección deja de estar pendiente cuando existen sus tarjetas', () => {
    const street = lessons.find((l) => l.kind === 'calle');
    if (street?.kind !== 'calle') throw new Error('Sin calles');
    const known = new Set<string>([cardIds.name(street.street)]);
    expect(pendingLessons(lessons, known, new Set())).not.toContain(street);
    const group = lessons.find((l) => l.kind === 'barrios');
    const part = new Set<string>([group?.cards[0] ?? '']);
    expect(pendingLessons(lessons, part, new Set())).toContain(group);
    expect(pendingLessons(lessons, new Set(), new Set(['L:rumbos']))[0]?.kind).not.toBe('rumbos');
  });

  it('los otros tramos de una calle entran de a uno', () => {
    const street = data.streets.find(
      (s) => s.askable && s.stretches.filter((x) => x.askable).length >= 3,
    );
    if (!street) throw new Error('Sin calles con varios tramos');
    const [first, second] = street.stretches.filter((s) => s.askable);
    const old = { createdDay: '2026-11-01' };
    const cards = new Map<string, { createdDay: string }>([
      [cardIds.name(street.code), old],
      [first?.id ?? '', old],
    ]);
    expect(pendingDirections(data.streets, cards, '2026-11-05')).toEqual([second?.id]);

    // Un tramo por día: si hoy ya estrenó uno, el siguiente espera.
    cards.set(first?.id ?? '', { createdDay: '2026-11-05' });
    expect(pendingDirections(data.streets, cards, '2026-11-05')).toEqual([]);
  });
});
