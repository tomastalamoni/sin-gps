/**
 * Simulación con semilla (sección 10): un alumno virtual usa el motor real durante 180 días. Si los
 * minutos se alejan de public/data/carga.json, hay que volver a correr npm run data:load.
 */
import { describe, expect, it } from 'vitest';
import type { LoadFile } from '../../src/engine/data';
import { barrierCardsOf } from '../../src/engine/lessons';
import { buildCurriculum } from '../../src/engine/srs/curriculum';
import { computeLoad } from '../../src/engine/srs/load';
import { createSrs } from '../../src/engine/srs/scheduler';
import { simulate } from '../../src/engine/srs/simulation';
import { hasData, loadRealData, read } from '../data/fixtures/real-data';

describe.skipIf(!hasData)('simulación de carga', () => {
  const data = loadRealData();
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

  it('con la misma semilla da lo mismo', async () => {
    const srs = await createSrs();
    const run = () =>
      simulate({ srs, lessons, streets: data.streets, newPerDay: 4, days: 30, seed: 3 });
    expect(run()).toEqual(run());
  });

  it('coincide con carga.json', async () => {
    const stored = read('carga.json') as LoadFile;
    const load = computeLoad(await createSrs(), lessons, data.streets);
    expect(load.seconds).toEqual(stored.seconds);
    load.options.forEach((option, i) => {
      expect(Math.abs(option.minutes - (stored.options[i]?.minutes ?? 0))).toBeLessThan(1);
    });
  }, 60_000);

  it('más calles nuevas por día piden más tiempo en los primeros meses', async () => {
    const srs = await createSrs();
    const first = (newPerDay: number) =>
      simulate({ srs, lessons, streets: data.streets, newPerDay, days: 60, seed: 3 }).minutes;
    expect(first(2)).toBeLessThan(first(4));
    expect(first(4)).toBeLessThan(first(8));
  }, 60_000);

  it('el tope diario de repasos se respeta', async () => {
    const result = simulate({
      srs: await createSrs(),
      lessons,
      streets: data.streets,
      newPerDay: 8,
      days: 90,
      seed: 5,
    });
    const reviews = result.days.map((d) => d.reviews - d.lessons * 2);
    expect(Math.max(...reviews)).toBeLessThanOrEqual(150 + 8);
  }, 60_000);

  it('con el ritmo por defecto se llega a ver todo el mapa en el período', async () => {
    const result = simulate({
      srs: await createSrs(),
      lessons,
      streets: data.streets,
      newPerDay: 4,
      days: 180,
      seed: 5,
    });
    expect(result.lessons).toBe(lessons.length);
    expect(result.accuracy).toBeGreaterThan(0.6);
  }, 60_000);
});
