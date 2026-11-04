/** Las fichas de las lecciones y el sentido que muestran, sobre los datos reales. */
import { describe, expect, it } from 'vitest';
import { angleDiff, bearingDeg, lineLengthM, pointAlong, type LngLat } from '../../src/engine/geo';
import type { CardId } from '../../src/engine/ids';
import { barrierCardsOf } from '../../src/engine/lessons';
import { createQuizContext, questionFor, type Learner } from '../../src/engine/quiz';
import { lessonSlides, travelLine } from '../../src/engine/quiz/lessons';
import { buildCurriculum } from '../../src/engine/srs/curriculum';
import { hasData, loadRealData } from './fixtures/real-data';

describe.skipIf(!hasData)('lecciones sobre los datos reales', () => {
  const data = loadRealData();
  const learner: Learner = {
    knownStreets: new Set(),
    knownLandmarks: new Set(),
    confusions: () => [],
    firmness: () => 0,
  };
  const ctx = createQuizContext(data, learner);
  const lessons = buildCurriculum(
    {
      graph: data.graph,
      streets: data.streets,
      landmarks: data.landmarks,
      barrios: data.barrios,
      rail: data.rail.lines,
      barrierCards: barrierCardsOf(data.barriers),
    },
    {},
  );

  /** Rumbo legal de una cuadra de mano única. */
  function legalBearing(t: number): number {
    const { geometry, dir } = data.graph.segment(t);
    const chord = bearingDeg(geometry[0] as LngLat, geometry[geometry.length - 1] as LngLat);
    return dir === 'B' ? (chord + 180) % 360 : chord;
  }

  const oneWay = data.streets.flatMap((street) =>
    street.stretches
      .filter((s) => s.askable && s.dir !== 'D' && !s.splitCarriageway)
      .map((stretch) => ({ street, stretch })),
  );

  it('todas las lecciones tienen al menos una ficha', () => {
    for (const lesson of lessons) {
      expect(lessonSlides(ctx, lesson).length, lesson.id).toBeGreaterThan(0);
    }
  });

  it('las fichas tienen título, texto y encuadre', () => {
    for (const lesson of lessons) {
      for (const slide of lessonSlides(ctx, lesson)) {
        expect(slide.title.trim(), lesson.id).not.toBe('');
        expect(slide.lines.length, lesson.id).toBeGreaterThan(0);
        expect(slide.frame[0][0], lesson.id).toBeLessThan(slide.frame[1][0]);
        expect(slide.frame[0][1], lesson.id).toBeLessThan(slide.frame[1][1]);
      }
    }
  });

  it('la ficha muestra el nombre de la calle que presenta', () => {
    for (const lesson of lessons) {
      if (lesson.kind !== 'calle') continue;
      expect(lessonSlides(ctx, lesson)[0]?.visibility.streets).toContain(lesson.street);
    }
  });

  it('la flecha animada va en el sentido en que se circula', () => {
    expect(oneWay.length).toBeGreaterThan(300);
    const wrong: string[] = [];
    for (const { stretch } of oneWay) {
      const line = travelLine(data.graph, stretch);
      if (!line) continue;
      const longest = [...stretch.segments].sort(
        (a, b) => (data.graph.lengths[b] ?? 0) - (data.graph.lengths[a] ?? 0),
      )[0] as number;
      const { geometry } = data.graph.segment(longest);
      const middle = pointAlong(geometry, lineLengthM(geometry) / 2);
      // El rumbo de la línea animada cerca de esa cuadra.
      const nearest = line.reduce(
        (best, point, i) => {
          const d = Math.hypot(point[0] - middle[0], point[1] - middle[1]);
          return d < best.d ? { d, i } : best;
        },
        { d: Infinity, i: 0 },
      );
      const from = line[Math.max(0, nearest.i - 1)] as LngLat;
      const to = line[Math.min(line.length - 1, nearest.i + 1)] as LngLat;
      if (Math.abs(angleDiff(bearingDeg(from, to), legalBearing(longest))) > 90) {
        wrong.push(stretch.id);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('en Sentidos, la flecha correcta apunta hacia donde se circula', () => {
    const wrong: string[] = [];
    for (const { stretch } of oneWay) {
      const question = questionFor(ctx, stretch.id as CardId, 3);
      if (question?.kind !== 'direction') continue;
      const arrow = question.arrows.find((a) => a.option === question.answer);
      const longest = [...stretch.segments].sort(
        (a, b) => (data.graph.lengths[b] ?? 0) - (data.graph.lengths[a] ?? 0),
      )[0] as number;
      if (!arrow || Math.abs(angleDiff(arrow.bearing, legalBearing(longest))) > 90) {
        wrong.push(stretch.id);
      }
    }
    expect(wrong).toEqual([]);
  });
});
