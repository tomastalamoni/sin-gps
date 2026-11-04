/** Cruces de vías (sección 4.10). Un cruce que OSM no confirma nunca se pregunta. */
import type { RailCrossing, RailLine, StreetRecord } from '../data';
import { distanceM, type LngLat } from '../geo';
import type { CardId } from '../ids';
import type { Random } from '../random';
import {
  boundsOf,
  CONTEXT_M,
  expanded,
  inArea,
  namesOf,
  shuffled,
  visibilityFor,
  type QuizContext,
  type RailEntry,
} from './context';
import { streetOption } from './streets';
import type { ChoiceQuestion, Option, QuizMode } from './types';

const OPTIONS = 4;
/** Lo que se resalta de una calle alrededor de las vías. */
const STREET_AROUND_M = 300;

const HOW: Record<RailCrossing['kind'], string> = {
  nivel: 'level',
  viaducto: 'under',
  tunel: 'under',
  puente: 'over',
};

const HOW_OPTIONS: Option[] = [
  { id: 'level', label: 'A nivel' },
  { id: 'under', label: 'Por abajo' },
  { id: 'over', label: 'Por arriba' },
  { id: 'none', label: 'No cruza' },
];

const HOW_TEXT: Record<string, string> = {
  level: 'las cruza a nivel',
  under: 'pasa por abajo de las vías',
  over: 'pasa por arriba de las vías',
  none: 'no cruza las vías',
};

function pointOf(crossing: RailCrossing): LngLat {
  return [crossing.lng, crossing.lat];
}

/** Las calles que cruzan en el tramo, con un cruce confirmado. */
function confirmedInside({ line, stretch }: RailEntry): RailCrossing[] {
  return stretch.crossings.flatMap((i) => {
    const crossing = line.crossings[i];
    return crossing && !crossing.unconfirmed ? [crossing] : [];
  });
}

/** Dónde está una calle límite del tramo sobre el ramal. */
function anchorPoint(line: RailLine, branch: number, street: number): LngLat | undefined {
  const crossings = line.branches[branch]?.crossings ?? [];
  const index = crossings.find((i) => line.crossings[i]?.street === street);
  const crossing = index === undefined ? undefined : line.crossings[index];
  return crossing ? pointOf(crossing) : undefined;
}

function frameOfEntry(entry: RailEntry) {
  const { line, stretch } = entry;
  const points = [
    anchorPoint(line, stretch.branch, stretch.from),
    anchorPoint(line, stretch.branch, stretch.to),
    ...confirmedInside(entry).map(pointOf),
  ].filter((p): p is LngLat => p !== undefined);
  return points.length > 0 ? expanded(boundsOf(points), CONTEXT_M) : undefined;
}

function streetAround(ctx: QuizContext, street: StreetRecord, center: LngLat): number[] {
  return street.segments.filter((t) => {
    if (!inArea(ctx.graph, t)) return false;
    return ctx.graph
      .segment(t)
      .geometry.some((p: LngLat) => distanceM(p, center) <= STREET_AROUND_M);
  });
}

function named(ctx: QuizContext, code: number): StreetRecord | undefined {
  const street = ctx.streetByCode.get(code);
  return street?.askable ? street : undefined;
}

function betweenQuestion(
  ctx: QuizContext,
  entry: RailEntry,
  seed: number,
  random: Random,
): ChoiceQuestion | undefined {
  const { line, stretch } = entry;
  const frame = frameOfEntry(entry);
  const from = named(ctx, stretch.from);
  const to = named(ctx, stretch.to);
  const closed = stretch.closed.flatMap((c) => named(ctx, c.street) ?? []);
  const inside = confirmedInside(entry).flatMap((c) => named(ctx, c.street) ?? []);
  if (!frame || !from || !to || inside.length === 0 || closed.length < OPTIONS - 1) {
    return undefined;
  }

  const correct = random.pick(inside);
  const options = shuffled([correct, ...shuffled(closed, random).slice(0, OPTIONS - 1)], random);
  return {
    kind: 'choice',
    card: stretch.id as CardId,
    mode: 'rail-between',
    seed,
    interaction: 'choice',
    prompt: `¿Por dónde se cruzan las vías del ${line.name} entre ${from.name} y ${to.name}?`,
    frame,
    highlight: {},
    options: options.map(streetOption),
    answer: streetOption(correct).id,
    visibility: visibilityFor(ctx, {
      names: options.flatMap(namesOf),
      streets: options.map((s) => s.code),
      show: [from.code, to.code],
    }),
    explanation: `Se cruzan por ${correct.name}.`,
  };
}

function crossesQuestion(
  ctx: QuizContext,
  entry: RailEntry,
  seed: number,
  random: Random,
): ChoiceQuestion | undefined {
  const { line, stretch } = entry;
  const frame = frameOfEntry(entry);
  const crossing = confirmedInside(entry).flatMap((c) => {
    const street = named(ctx, c.street);
    return street ? [{ street, how: HOW[c.kind], center: pointOf(c) }] : [];
  });
  const closed = stretch.closed.flatMap((c) => {
    const street = named(ctx, c.street);
    return street ? [{ street, how: 'none', center: [c.lng, c.lat] satisfies LngLat }] : [];
  });
  const candidates = [...crossing, ...closed];
  if (!frame || candidates.length === 0) return undefined;

  const { street, how, center } = random.pick(candidates);
  const segments = streetAround(ctx, street, center);
  return {
    kind: 'choice',
    card: stretch.id as CardId,
    mode: 'rail-crosses',
    seed,
    interaction: 'choice',
    prompt: `¿${street.name} cruza las vías del ${line.name}?`,
    frame,
    highlight: { segments },
    options: HOW_OPTIONS,
    answer: how,
    visibility: visibilityFor(ctx, { names: [], streets: [], show: [street.code] }),
    explanation: `${street.name} ${HOW_TEXT[how] ?? ''}.`,
  };
}

function nextQuestion(
  ctx: QuizContext,
  entry: RailEntry,
  seed: number,
  random: Random,
): ChoiceQuestion | undefined {
  const { line, stretch } = entry;
  const usable = (line.branches[stretch.branch]?.crossings ?? []).flatMap((i) => {
    const crossing = line.crossings[i];
    const street = crossing && !crossing.unconfirmed ? named(ctx, crossing.street) : undefined;
    return crossing && street ? [{ crossing, street }] : [];
  });
  const at = usable.findIndex((x) => x.street.code === stretch.to);
  const here = usable[at];
  const next = usable[at - 1];
  if (!here || !next) return undefined;

  const others = usable.filter((x) => x !== here && x !== next);
  const distractors = shuffled(others, random)
    .sort(
      (a, b) =>
        distanceM(pointOf(a.crossing), pointOf(here.crossing)) -
        distanceM(pointOf(b.crossing), pointOf(here.crossing)),
    )
    .slice(0, OPTIONS - 1)
    .map((x) => x.street);
  const options = shuffled([next.street, ...distractors], random);
  return {
    kind: 'choice',
    card: stretch.id as CardId,
    mode: 'rail-next',
    seed,
    interaction: 'choice',
    prompt: `Por las vías del ${line.name}, yendo hacia ${ctx.rail.terminal}: ¿cuál es el próximo cruce después de ${here.street.name}?`,
    frame: expanded(boundsOf([pointOf(here.crossing), pointOf(next.crossing)]), CONTEXT_M),
    highlight: { point: pointOf(here.crossing) },
    options: options.map(streetOption),
    answer: streetOption(next.street).id,
    visibility: visibilityFor(ctx, {
      names: options.flatMap(namesOf),
      streets: options.map((s) => s.code),
      show: [here.street.code],
    }),
    explanation: `El próximo cruce es ${next.street.name}.`,
  };
}

const VARIANTS: readonly QuizMode[] = ['rail-between', 'rail-crosses', 'rail-next'];

/** Alterna las variantes de la tarjeta: la última que se preguntó queda para el final. */
export function railQuestion(
  ctx: QuizContext,
  entry: RailEntry,
  seed: number,
  random: Random,
  last: string | undefined,
): ChoiceQuestion | undefined {
  const order = shuffled(VARIANTS, random).sort((a, b) => Number(a === last) - Number(b === last));
  for (const mode of order) {
    const question =
      mode === 'rail-between'
        ? betweenQuestion(ctx, entry, seed, random)
        : mode === 'rail-crosses'
          ? crossesQuestion(ctx, entry, seed, random)
          : nextQuestion(ctx, entry, seed, random);
    if (question) return question;
  }
  return undefined;
}
