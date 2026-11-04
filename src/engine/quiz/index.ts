/**
 * Una pregunta para una tarjeta. Con la misma semilla sale la misma pregunta, así cualquier error se
 * puede reproducir. Nunca se pregunta por un dato dudoso (sección 4): sin dato confiable no hay
 * pregunta.
 */
import type { CardId } from '../ids';
import { createRandom } from '../random';
import type { QuizContext } from './context';
import {
  barrierNameQuestion,
  barrioQuestion,
  landmarkWhatQuestion,
  landmarkWhereQuestion,
} from './places';
import { railQuestion } from './rail';
import { directionQuestion, findQuestion, nameQuestion } from './streets';
import type { Question } from './types';

export function questionFor(
  ctx: QuizContext,
  card: CardId,
  seed: number,
  lastPrompt?: string,
): Question | undefined {
  const random = createRandom(seed);
  const [kind = '', rest = ''] = card.split(/:(.*)/);

  switch (kind) {
    case 'N': {
      const street = ctx.streetByCode.get(Number(rest));
      if (!street?.askable) return undefined;
      return lastPrompt === 'name'
        ? findQuestion(ctx, street, seed, random)
        : nameQuestion(ctx, street, seed, random);
    }
    case 'S': {
      const entry = ctx.stretchById.get(card);
      if (!entry) return undefined;
      return directionQuestion(ctx, entry.street, entry.stretch, seed, random);
    }
    case 'H': {
      const landmark = ctx.landmarkById.get(card);
      if (!landmark) return undefined;
      return lastPrompt === 'landmark-what'
        ? landmarkWhereQuestion(ctx, landmark, seed)
        : landmarkWhatQuestion(ctx, landmark, seed, random);
    }
    case 'Z': {
      const barrio = ctx.barrioById.get(card);
      return barrio && barrioQuestion(ctx, barrio, seed, random);
    }
    case 'B': {
      const entry = ctx.railById.get(card);
      if (entry) return railQuestion(ctx, entry, seed, random, lastPrompt);
      return barrierNameQuestion(ctx, card, seed, random);
    }
    default:
      return undefined;
  }
}

export { createQuizContext, type Learner, type QuizContext, type QuizData } from './context';
export { streetOfOption } from './streets';
export type * from './types';
