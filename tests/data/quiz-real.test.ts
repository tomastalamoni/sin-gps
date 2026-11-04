/**
 * Las preguntas sobre los datos reales (sección 10): en todas la respuesta está entre las opciones,
 * no hay opciones repetidas, nunca se ve la respuesta y nunca se pregunta por un dato dudoso.
 */
import { describe, expect, it } from 'vitest';
import { isAskableConfidence } from '../../src/engine/data';
import { type CardId, cardIds, isCardId } from '../../src/engine/ids';
import {
  createQuizContext,
  questionFor,
  streetOfOption,
  type Learner,
  type Question,
} from '../../src/engine/quiz';
import { labelContains, namesOf, type QuizContext } from '../../src/engine/quiz/context';
import { hasData, loadRealData } from './fixtures/real-data';

const SEEDS = [1, 42];

/** Las variantes de cada tarjeta: la anterior decide qué se pregunta ahora. */
function variants(card: CardId): (string | undefined)[] {
  if (card.startsWith('N:')) return [undefined, 'name'];
  if (card.startsWith('H:')) return [undefined, 'landmark-what'];
  if (card.startsWith('B:')) return ['rail-between', 'rail-crosses', 'rail-next'];
  return [undefined];
}

describe.skipIf(!hasData)('preguntas sobre los datos reales', () => {
  const data = loadRealData();
  const askable = data.streets.filter((s) => s.askable);
  // El peor caso: se sabe todo, así que todas las etiquetas podrían delatar la respuesta.
  const learner: Learner = {
    knownStreets: new Set(data.streets.map((s) => s.code)),
    knownLandmarks: new Set(data.landmarks.map((l) => l.id)),
    confusions: () => [],
    firmness: () => 0.5,
  };
  const ctx = createQuizContext(data, learner);

  const allCards: CardId[] = [
    ...askable.map((s) => cardIds.name(s.code)),
    ...askable.flatMap((s) => s.stretches.filter((x) => x.askable).map((x) => x.id as CardId)),
    ...data.landmarks.map((l) => l.id as CardId),
    ...data.barrios.map((b) => b.id as CardId),
    ...data.rail.lines.flatMap((l) => l.stretches.map((s) => s.id as CardId)),
    ...ctx.barrierById.keys().map((id) => id as CardId),
  ];

  /** Todas las preguntas de todas las tarjetas, con cada variante y varias semillas. */
  const questions: Question[] = allCards.flatMap((card) =>
    SEEDS.flatMap((seed) =>
      variants(card).flatMap((last) => questionFor(ctx, card, seed, last) ?? []),
    ),
  );

  function optionNames(c: QuizContext, question: Question): string[] {
    if (question.kind === 'tap-street') {
      const street = c.streetByCode.get(question.street);
      return street ? namesOf(street) : [];
    }
    if (question.kind === 'tap-place' || question.kind === 'direction') return [];
    if (question.mode === 'rail-crosses') return [];
    return question.options.flatMap((option) => {
      const code = streetOfOption(option.id);
      const street = code === undefined ? undefined : c.streetByCode.get(code);
      return street ? namesOf(street) : [option.label];
    });
  }

  it('todas las tarjetas tienen ID válida y dan una pregunta', () => {
    for (const card of allCards) {
      expect(isCardId(card), card).toBe(true);
      expect(questionFor(ctx, card, 1), card).toBeDefined();
    }
  });

  it('la respuesta está entre las opciones, sin opciones repetidas', () => {
    for (const q of questions) {
      if (q.kind !== 'choice' && q.kind !== 'direction') continue;
      const ids = q.options.map((o) => o.id);
      const labels = q.options.map((o) => o.label);
      expect(ids, q.card).toContain(q.answer);
      expect(new Set(ids).size, q.card).toBe(ids.length);
      expect(new Set(labels).size, `${q.card}: ${labels.join(' | ')}`).toBe(labels.length);
    }
  });

  it('las preguntas de nombre tienen 4 opciones y las de sentido, 3', () => {
    for (const q of questions) {
      if (q.mode === 'name') expect(q.kind === 'choice' && q.options.length).toBe(4);
      if (q.kind === 'direction') expect(q.options.map((o) => o.id)).toEqual(['F', 'B', 'D']);
    }
  });

  it('ninguna etiqueta visible contiene una opción', () => {
    const leaks: string[] = [];
    for (const q of questions) {
      const names = optionNames(ctx, q);
      const labels = [
        ...q.visibility.streets.map((code) => ctx.streetByCode.get(code)?.name ?? ''),
        ...q.visibility.landmarks.map((id) => ctx.landmarkById.get(id)?.name ?? ''),
      ];
      for (const label of labels) {
        for (const name of names) {
          if (labelContains(label, name)) leaks.push(`${q.card}: ${label} contiene ${name}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  }, 60_000);

  it('las etiquetas de barrios y barreras tampoco delatan nada', () => {
    const leaks: string[] = [];
    for (const q of questions) {
      const names = optionNames(ctx, q);
      if (q.visibility.barrierLabels) {
        for (const label of ctx.barrierNames) {
          for (const name of names) {
            if (labelContains(label, name)) leaks.push(`${q.card}: ${label} contiene ${name}`);
          }
        }
      }
      if (q.visibility.barrioLabels) {
        for (const { display } of data.barrios) {
          for (const name of names) {
            if (labelContains(display, name)) leaks.push(`${q.card}: ${display} contiene ${name}`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  }, 60_000);

  it('una calle que no cruza no cruza en ningún lado de la línea', () => {
    for (const line of data.rail.lines) {
      const crossing = new Set(line.crossings.map((c) => c.street));
      for (const stretch of line.stretches) {
        for (const closed of stretch.closed) expect(crossing.has(closed.street)).toBe(false);
      }
    }
  });

  it('una pregunta de cruce siempre resalta la calle, cruce o no', () => {
    for (const q of questions) {
      if (q.mode === 'rail-crosses')
        expect(q.highlight.segments?.length, q.card).toBeGreaterThan(0);
    }
  });

  it('las preguntas de cruces con calles para elegir tienen 4 opciones', () => {
    for (const q of questions) {
      if (q.kind === 'choice' && (q.mode === 'rail-between' || q.mode === 'rail-next')) {
        expect(q.options, q.card).toHaveLength(4);
      }
    }
  });

  it('las calles preguntadas no muestran su etiqueta', () => {
    for (const q of questions) {
      if (q.mode === 'find' && q.kind === 'tap-street') {
        expect(q.visibility.streets).not.toContain(q.street);
      }
      if (q.mode === 'name' && q.kind === 'choice') {
        for (const option of q.options) {
          expect(q.visibility.streets).not.toContain(streetOfOption(option.id));
        }
      }
    }
  });

  it('en Sentidos no se ven las flechas de la calle preguntada', () => {
    for (const q of questions) {
      if (q.kind !== 'direction') continue;
      const entry = ctx.stretchById.get(q.card);
      expect(q.visibility.hiddenArrows, q.card).toContain(entry?.street.code);
    }
  });

  it('la capa de dominio se apaga en todas las preguntas', () => {
    for (const q of questions) expect(q.visibility.domain).toBe(false);
  });

  it('nunca pregunta por un tramo dudoso', () => {
    for (const street of data.streets) {
      for (const stretch of street.stretches) {
        const question = questionFor(ctx, stretch.id as CardId, 1);
        if (!stretch.askable) expect(question, stretch.id).toBeUndefined();
        else expect(isAskableConfidence(stretch.confidence), stretch.id).toBe(true);
      }
    }
  });

  it('en Sentidos la respuesta coincide con los datos', () => {
    for (const q of questions) {
      if (q.kind !== 'direction') continue;
      expect(q.answer).toBe(ctx.stretchById.get(q.card)?.stretch.dir);
      expect(q.arrows).toHaveLength(2);
    }
  });

  it('un cruce sin confirmar nunca es la respuesta', () => {
    const unconfirmed = new Set(
      data.rail.lines.flatMap((l) => l.crossings.filter((c) => c.unconfirmed).map((c) => c.street)),
    );
    for (const q of questions) {
      if (q.mode !== 'rail-between' && q.mode !== 'rail-next') continue;
      if (q.kind === 'choice') {
        const code = streetOfOption(q.answer);
        if (code !== undefined && unconfirmed.has(code)) {
          const entry = ctx.railById.get(q.card);
          const confirmedHere = entry?.line.crossings.some(
            (c) => c.street === code && !c.unconfirmed,
          );
          expect(confirmedHere, q.card).toBe(true);
        }
      }
    }
  });

  it('la misma semilla da la misma pregunta', () => {
    for (const card of allCards.slice(0, 200)) {
      expect(questionFor(ctx, card, 5)).toEqual(questionFor(ctx, card, 5));
    }
  });

  it('el encuadre deja ver la cuadra preguntada', () => {
    for (const q of questions) {
      const [[west, south], [east, north]] = q.frame;
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
    }
  });

  it('genera una pregunta en menos de 30 ms', () => {
    const start = performance.now();
    let count = 0;
    for (const card of allCards) {
      questionFor(ctx, card, 99);
      count++;
    }
    expect((performance.now() - start) / count).toBeLessThan(30);
  });
});
