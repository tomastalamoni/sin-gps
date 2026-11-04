import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CardId } from '../../src/engine/ids';
import { createRandom } from '../../src/engine/random';
import {
  dueToday,
  newStudyCard,
  reviewCard,
  seedKnownCard,
  type StudyCard,
} from '../../src/engine/srs/cards';
import { addDays, dayOf, daysBetween } from '../../src/engine/srs/days';
import { DEFAULT_THRESHOLDS, gradeAnswer, type Interaction } from '../../src/engine/srs/grading';
import { isKnown, isStreetFirm, masteryOf } from '../../src/engine/srs/mastery';
import { createSrs, reviveMemory, type Grade, type Srs } from '../../src/engine/srs/scheduler';
import {
  buildSession,
  DAILY_REVIEW_CAP,
  SHORT_SESSION_ITEMS,
  type DueCard,
  type SessionInput,
} from '../../src/engine/srs/session';
import type { Lesson } from '../../src/engine/srs/curriculum';

const ID = 'N:1234' as CardId;
const START = new Date(2026, 10, 5, 12);

function at(days: number, hours = 12): Date {
  const date = new Date(2026, 10, 5, hours);
  date.setDate(date.getDate() + days);
  return date;
}

let srs: Srs;
beforeAll(async () => {
  srs = await createSrs();
});

describe('días de estudio', () => {
  it('cambian a medianoche, hora del celu', () => {
    expect(dayOf(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05');
    expect(dayOf(new Date(2026, 10, 6, 0, 1))).toBe('2026-11-06');
  });

  it('se suman y se restan pasando de mes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(daysBetween('2026-11-30', '2026-12-02')).toBe(2);
  });
});

describe('nota automática', () => {
  const answer = (elapsedMs: number, interaction: Interaction = 'choice') => ({
    correct: true,
    elapsedMs,
    interaction,
    previousFast: false,
    direction: false,
  });

  it('un error es Again, sea cual sea el tiempo', () => {
    expect(gradeAnswer({ ...answer(100), correct: false }).grade).toBe('again');
  });

  it('respeta los umbrales de cada modo', () => {
    for (const interaction of ['choice', 'tap'] as const) {
      const { fastMs, slowMs } = DEFAULT_THRESHOLDS[interaction];
      expect(gradeAnswer(answer(slowMs + 1, interaction)).grade).toBe('hard');
      expect(gradeAnswer(answer(slowMs, interaction)).grade).toBe('good');
      expect(gradeAnswer(answer(fastMs, interaction)).fast).toBe(false);
      expect(gradeAnswer(answer(fastMs - 1, interaction)).fast).toBe(true);
    }
  });

  it('con ayuda nunca pasa de Hard', () => {
    expect(gradeAnswer({ ...answer(100), helped: true }).grade).toBe('hard');
  });

  it('Easy pide dos respuestas rápidas seguidas y nunca llega a las de sentido', () => {
    expect(gradeAnswer(answer(100)).grade).toBe('good');
    expect(gradeAnswer({ ...answer(100), previousFast: true }).grade).toBe('easy');
    expect(gradeAnswer({ ...answer(100), previousFast: true, direction: true }).grade).toBe('good');
  });

  it('la nota nunca contradice el resultado', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.nat(30_000),
        fc.constantFrom<Interaction>('choice', 'tap'),
        fc.boolean(),
        fc.boolean(),
        (correct, elapsedMs, interaction, previousFast, direction) => {
          const { grade } = gradeAnswer({
            correct,
            elapsedMs,
            interaction,
            previousFast,
            direction,
          });
          expect(grade === 'again').toBe(!correct);
          if (direction) expect(grade).not.toBe('easy');
        },
      ),
    );
  });
});

describe('repetición espaciada', () => {
  const answerOn = (card: StudyCard, grade: Grade, now: Date, fast = false) =>
    reviewCard(srs, card, { grade, fast, now });

  it('guarda la ID tipada dentro de la tarjeta de ts-fsrs', () => {
    expect(newStudyCard(srs, ID, START).memory.cardId).toBe(ID);
  });

  it('una tarjeta recibe como máximo una revisión por día', () => {
    const first = answerOn(newStudyCard(srs, ID, START), 'good', START);
    expect(first.revlog).toBeDefined();
    const second = answerOn(first.card, 'again', at(0, 18));
    expect(second.revlog).toBeUndefined();
    expect(second.card).toEqual(first.card);
  });

  it('un reloj que retrocede no regala otra revisión', () => {
    const { card } = answerOn(newStudyCard(srs, ID, START), 'good', at(3));
    const earlier = answerOn(card, 'again', at(2));
    expect(earlier.revlog).toBeUndefined();
    expect(earlier.card).toEqual(card);
  });

  it('una respuesta mala vuelve al día siguiente, aunque FSRS la pida en segundos', () => {
    const { card } = answerOn(newStudyCard(srs, ID, START), 'again', START);
    expect(card.dueDay).toBe('2026-11-06');
  });

  it('nunca vence el mismo día de la revisión, sea cual sea la nota', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<Grade>('again', 'hard', 'good', 'easy'), {
          minLength: 1,
          maxLength: 12,
        }),
        (grades) => {
          let card = newStudyCard(srs, ID, START);
          let now = START;
          for (const grade of grades) {
            card = reviewCard(srs, card, { grade, fast: false, now }).card;
            expect(card.dueDay > dayOf(now)).toBe(true);
            const days = daysBetween(dayOf(now), card.dueDay);
            now = new Date(now);
            now.setDate(now.getDate() + days);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('guardar, recargar y recalcular da la misma próxima fecha', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<Grade>('again', 'hard', 'good', 'easy'), {
          minLength: 1,
          maxLength: 8,
        }),
        (grades) => {
          let card = newStudyCard(srs, ID, START);
          grades.forEach((grade, i) => {
            card = reviewCard(srs, card, { grade, fast: false, now: at(i * 3) }).card;
          });
          const stored = JSON.parse(JSON.stringify(card.memory)) as Record<string, unknown>;
          const now = at(grades.length * 3 + 1);
          const direct = srs.review(card.memory, 'good', now).memory;
          const reloaded = srs.review(reviveMemory(stored), 'good', now).memory;
          expect(reloaded.dueAt.getTime()).toBe(direct.dueAt.getTime());
        },
      ),
      { numRuns: 30 },
    );
  });

  it('los días hasta el 90% salen del scheduler y crecen con cada acierto', () => {
    let card = newStudyCard(srs, ID, START);
    expect(srs.daysTo90(card.memory)).toBe(0);
    card = answerOn(card, 'good', START).card;
    const after1 = srs.daysTo90(card.memory);
    card = answerOn(card, 'good', at(5)).card;
    expect(after1).toBeGreaterThan(1);
    expect(srs.daysTo90(card.memory)).toBeGreaterThan(after1);
  });

  it('la probabilidad de acordarse baja con el tiempo', () => {
    const { card } = answerOn(newStudyCard(srs, ID, START), 'good', START);
    expect(srs.recall(card.memory, at(1))).toBeGreaterThan(srs.recall(card.memory, at(30)));
  });

  it('un error con el dato oculto deja la tarjeta vencida hoy, sin calificarla', () => {
    const { card } = answerOn(newStudyCard(srs, ID, START), 'good', START);
    const due = dueToday(card, at(2));
    expect(due.dueDay).toBe(dayOf(at(2)));
    expect(due.memory).toEqual(card.memory);
  });

  it('lo sabido en el diagnóstico arranca cerca de 7 días, nunca Firme', () => {
    const card = seedKnownCard(srs, ID, START);
    const days = srs.daysTo90(card.memory);
    expect(days).toBeGreaterThan(5);
    expect(days).toBeLessThan(9);
    expect(masteryOf(card, days)).toBe('en-progreso');
  });
});

describe('estados de dominio', () => {
  const card = (correctDays: number, longestRecall: number) =>
    ({ correctDays, longestRecall }) as StudyCard;

  it('sigue aprendiendo hasta acertar en dos días distintos', () => {
    expect(masteryOf(card(1, 0), 90)).toBe('aprendiendo');
    expect(masteryOf(card(2, 0), 90)).not.toBe('aprendiendo');
  });

  it('marca los bordes de Débil, En progreso y Firme', () => {
    expect(masteryOf(card(2, 0), 2.9)).toBe('debil');
    expect(masteryOf(card(2, 0), 3)).toBe('en-progreso');
    expect(masteryOf(card(5, 13), 40)).toBe('en-progreso');
    expect(masteryOf(card(5, 14), 20.9)).toBe('en-progreso');
    expect(masteryOf(card(5, 14), 21)).toBe('firme');
  });

  it('las etiquetas aparecen desde En progreso', () => {
    expect(isKnown('aprendiendo')).toBe(false);
    expect(isKnown('debil')).toBe(false);
    expect(isKnown('en-progreso')).toBe(true);
    expect(isKnown('firme')).toBe(true);
    expect(isKnown(undefined)).toBe(false);
  });

  it('una calle Firme pide nombre firme y dos tercios de sus sentidos', () => {
    expect(isStreetFirm('firme', [])).toBe(true);
    expect(isStreetFirm('firme', ['firme', 'firme', 'debil'])).toBe(true);
    expect(isStreetFirm('firme', ['firme', 'debil', 'debil'])).toBe(false);
    expect(isStreetFirm('en-progreso', ['firme'])).toBe(false);
  });
});

describe('sesiones', () => {
  const dueCards = (count: number): DueCard[] =>
    Array.from({ length: count }, (_, i) => ({ id: `N:${i + 1}` as CardId, recall: 1 - i / 1000 }));
  const lessons = (count: number): Lesson[] =>
    Array.from({ length: count }, (_, i) => ({
      kind: 'calle',
      id: `L:calle:${5000 + i}`,
      street: 5000 + i,
      cards: [`N:${5000 + i}` as CardId, `S:${5000 + i}:1-100` as CardId],
      barrios: [],
    }));
  const input = (patch: Partial<SessionInput> = {}): SessionInput => ({
    kind: 'short',
    due: dueCards(50),
    reviewedToday: 0,
    lessons: lessons(10),
    lessonsToday: 0,
    newPerDay: 4,
    newDirections: [],
    random: createRandom(1),
    ...patch,
  });
  const reviews = (plan: ReturnType<typeof buildSession>) =>
    plan.items.filter((i) => i.type === 'review').map((i) => i.card);

  it('la corta tiene unos 20 ítems y una lección', () => {
    const plan = buildSession(input());
    expect(plan.items.filter((i) => i.type === 'lesson')).toHaveLength(1);
    expect(plan.items.length).toBeLessThanOrEqual(SHORT_SESSION_ITEMS + 2);
    expect(plan.items.length).toBeGreaterThanOrEqual(SHORT_SESSION_ITEMS - 2);
  });

  it('primero va lo que más riesgo corre', () => {
    const due = dueCards(30);
    const riskiest = due[29] as DueCard;
    const plan = buildSession(input({ due }));
    expect(reviews(plan)).toContain(riskiest.id);
    expect(reviews(plan)).not.toContain((due[0] as DueCard).id);
  });

  it('la larga trae todo lo vencido y las lecciones del día', () => {
    const plan = buildSession(input({ kind: 'long', due: dueCards(60), lessonsToday: 1 }));
    expect(plan.items.filter((i) => i.type === 'lesson')).toHaveLength(3);
    expect(reviews(plan).filter((c) => Number(c.slice(2)) <= 60)).toHaveLength(60);
  });

  it('no pasa del cupo de calles nuevas del día', () => {
    const plan = buildSession(input({ kind: 'long', lessonsToday: 4 }));
    expect(plan.items.filter((i) => i.type === 'lesson')).toHaveLength(0);
  });

  it('con atraso no entran calles nuevas y se respeta el tope de repasos', () => {
    const plan = buildSession(input({ kind: 'long', due: dueCards(DAILY_REVIEW_CAP + 10) }));
    expect(plan.behind).toBe(true);
    expect(plan.items.filter((i) => i.type === 'lesson')).toHaveLength(0);
    expect(reviews(plan)).toHaveLength(DAILY_REVIEW_CAP);
  });

  it('cuenta las revisiones que ya se hicieron hoy', () => {
    const plan = buildSession(input({ kind: 'long', due: dueCards(50), reviewedToday: 120 }));
    expect(plan.behind).toBe(true);
    expect(reviews(plan)).toHaveLength(30);
  });

  it('la calle nueva vuelve unos ítems después, sin calificar', () => {
    const plan = buildSession(input({ due: dueCards(30) }));
    const lesson = plan.items.findIndex((i) => i.type === 'lesson');
    const again = plan.items.findIndex((i) => i.type === 'practice');
    expect(again).toBeGreaterThan(lesson + 2);
  });

  it('evita repetir la misma calle en ítems seguidos', () => {
    const due: DueCard[] = [
      { id: 'N:1', recall: 0.1 },
      { id: 'S:1:1-100', recall: 0.2 },
      { id: 'S:1:101-200', recall: 0.3 },
      { id: 'N:2', recall: 0.4 },
      { id: 'N:3', recall: 0.5 },
    ];
    const cards = reviews(buildSession(input({ due, lessons: [] })));
    expect(cards.slice(0, 2).map((c) => c.split(':')[1])).not.toEqual(['1', '1']);
  });

  it('las tarjetas de sentido por estrenar entran de a poco', () => {
    const newDirections = ['S:9:1-100', 'S:8:1-100', 'S:7:1-100'] as CardId[];
    const plan = buildSession(input({ due: [], lessons: [], newDirections }));
    expect(reviews(plan)).toHaveLength(2);
  });
});
