/** Hitos y barrios (sección 4.9) y autopistas como barreras (nivel 0). */
import { barrioAt, barriosByDistance, type BarrioInfo } from '../barrios';
import type { LandmarkRecord } from '../data';
import { distanceM, type LngLat } from '../geo';
import type { CardId } from '../ids';
import type { Random } from '../random';
import {
  boundsOf,
  CONTEXT_M,
  expanded,
  shuffled,
  visibilityFor,
  type QuizContext,
} from './context';
import type { ChoiceQuestion, Option, TapPlaceQuestion } from './types';

const OPTIONS = 4;
/** Es acierto a menos de esto del hito. */
const LANDMARK_HIT_M = 150;
/** Sin barrio, el mapa muestra esto alrededor del hito. */
const LANDMARK_FRAME_M = 1500;

function pointOf(landmark: LandmarkRecord): LngLat {
  return [landmark.lng, landmark.lat];
}

export function barrioQuestion(
  ctx: QuizContext,
  barrio: BarrioInfo,
  seed: number,
  random: Random,
): ChoiceQuestion {
  const options = shuffled(barriosByDistance(barrio, ctx.barrios).slice(0, OPTIONS), random);
  return {
    kind: 'choice',
    card: barrio.id as CardId,
    mode: 'barrio',
    seed,
    interaction: 'choice',
    prompt: '¿Qué barrio es esta zona?',
    frame: expanded(barrio.bounds, CONTEXT_M),
    highlight: { barrio: barrio.id },
    options: options.map((b) => ({ id: b.id, label: b.display })),
    answer: barrio.id,
    visibility: visibilityFor(ctx, {
      names: options.map((b) => b.display),
      streets: [],
      barrioLabels: false,
    }),
    explanation: `Es ${barrio.display}.`,
  };
}

/** Los hitos más cercanos de la misma categoría, sin nombres repetidos. */
function landmarkDistractors(ctx: QuizContext, landmark: LandmarkRecord): LandmarkRecord[] {
  const here = pointOf(landmark);
  const byDistance = [...ctx.landmarks]
    .filter((l) => l.id !== landmark.id && l.name !== landmark.name)
    .sort((a, b) => distanceM(here, pointOf(a)) - distanceM(here, pointOf(b)));
  const sameKind = byDistance.filter((l) => l.category === landmark.category);
  const chosen: LandmarkRecord[] = [];
  for (const candidate of [...sameKind, ...byDistance]) {
    if (chosen.length === OPTIONS - 1) break;
    if (!chosen.some((l) => l.name === candidate.name)) chosen.push(candidate);
  }
  return chosen;
}

export function landmarkWhatQuestion(
  ctx: QuizContext,
  landmark: LandmarkRecord,
  seed: number,
  random: Random,
): ChoiceQuestion {
  const options = shuffled([landmark, ...landmarkDistractors(ctx, landmark)], random);
  const point = pointOf(landmark);
  return {
    kind: 'choice',
    card: landmark.id as CardId,
    mode: 'landmark-what',
    seed,
    interaction: 'choice',
    prompt: '¿Qué es esto?',
    frame: expanded(boundsOf([point]), CONTEXT_M),
    highlight: { point },
    options: options.map((l): Option => ({ id: l.id, label: l.name })),
    answer: landmark.id,
    visibility: visibilityFor(ctx, { names: options.map((l) => l.name), streets: [] }),
    explanation: `Es ${landmark.name}.`,
  };
}

export function landmarkWhereQuestion(
  ctx: QuizContext,
  landmark: LandmarkRecord,
  seed: number,
): TapPlaceQuestion {
  const point = pointOf(landmark);
  const barrio = barrioAt(point, ctx.barrios);
  return {
    kind: 'tap-place',
    card: landmark.id as CardId,
    mode: 'landmark-where',
    seed,
    interaction: 'tap',
    prompt: `¿Dónde queda ${landmark.name}?`,
    frame: barrio ? expanded(barrio.bounds, 100) : expanded(boundsOf([point]), LANDMARK_FRAME_M),
    highlight: barrio ? { barrio: barrio.id } : {},
    point,
    radiusM: LANDMARK_HIT_M,
    ...(landmark.bbox ? { bbox: landmark.bbox } : {}),
    visibility: visibilityFor(ctx, { names: [landmark.name], streets: [] }),
    explanation: `Acá está ${landmark.name}.`,
  };
}

export function barrierNameQuestion(
  ctx: QuizContext,
  card: CardId,
  seed: number,
  random: Random,
): ChoiceQuestion | undefined {
  const barrier = ctx.barrierById.get(card);
  if (!barrier) return undefined;
  const names = new Set(
    ctx.barriers.features.map((f) => (f.properties as { name?: string }).name ?? ''),
  );
  names.delete(barrier.name);
  const others = shuffled([...names].sort(), random).slice(0, OPTIONS - 1);
  const options = shuffled([barrier.name, ...others], random);
  return {
    kind: 'choice',
    card,
    mode: 'barrier-name',
    seed,
    interaction: 'choice',
    prompt: '¿Cómo se llama esta autopista?',
    frame: expanded(boundsOf(barrier.lines.flat()), CONTEXT_M),
    highlight: { lines: barrier.lines },
    options: options.map((name) => ({ id: name, label: name })),
    answer: barrier.name,
    visibility: visibilityFor(ctx, { names: options, streets: [], barrierLabels: false }),
    explanation: `Es ${barrier.name}.`,
  };
}
