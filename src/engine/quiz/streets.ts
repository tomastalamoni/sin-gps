/** Preguntas de calles: ¿Cómo se llama?, Encontrala y Sentidos (sección 4). */
import { numberingBearing } from '../corrections';
import type { DirectionStretch, StreetCrossing, StreetRecord } from '../data';
import { lineLengthM, pointAlong, type LngLat } from '../geo';
import { cardIds, type CardId } from '../ids';
import type { Random } from '../random';
import { riverBearingAt, rumboOf, type Rumbo } from '../rumbos';
import {
  expanded,
  frameOfSegments,
  inArea,
  namesOf,
  shuffled,
  streetDistractors,
  streetWindow,
  visibilityFor,
  withPairs,
  type QuizContext,
} from './context';
import type { ChoiceQuestion, DirectionQuestion, Option, TapStreetQuestion } from './types';

export function streetOption(street: StreetRecord): Option {
  return { id: `street:${street.code}`, label: street.name };
}

export function streetOfOption(id: string): number | undefined {
  const code = /^street:(\d+)$/.exec(id)?.[1];
  return code === undefined ? undefined : Number(code);
}

/** Las preguntas de nombre tienen 4 opciones. */
const NAME_OPTIONS = 4;
/** Sentidos muestra el tramo entero o una ventana de 3 a 5 cuadras. */
const MIN_WINDOW = 3;
const MAX_WINDOW = 5;
/** Las calles de este nivel o más importantes sirven de referencia: "hacia Av. Cabildo". */
const REFERENCE_LEVEL = 3;

export function nameQuestion(
  ctx: QuizContext,
  street: StreetRecord,
  seed: number,
  random: Random,
): ChoiceQuestion {
  const card = cardIds.name(street.code);
  const firmness = ctx.learner.firmness(card);
  const segments = streetWindow(ctx, street, firmness, random);
  const options = shuffled(
    [street, ...streetDistractors(ctx, street, NAME_OPTIONS - 1, firmness, random)],
    random,
  );
  return {
    kind: 'choice',
    card,
    mode: 'name',
    seed,
    interaction: 'choice',
    prompt: '¿Cómo se llama esta calle?',
    frame: frameOfSegments(ctx.graph, segments),
    highlight: { segments },
    options: options.map(streetOption),
    answer: streetOption(street).id,
    visibility: visibilityFor(ctx, {
      names: options.flatMap(namesOf),
      streets: options.map((s) => s.code),
    }),
    explanation: `Es ${street.name}.`,
  };
}

export function findQuestion(
  ctx: QuizContext,
  street: StreetRecord,
  seed: number,
  random: Random,
): TapStreetQuestion {
  const own = ctx.barrios.filter((b) => street.barrios.includes(b.name));
  const barrio = own.length > 0 ? random.pick(own) : undefined;
  const segments = street.segments.filter((t) => inArea(ctx.graph, t));
  return {
    kind: 'tap-street',
    card: cardIds.name(street.code),
    mode: 'find',
    seed,
    interaction: 'tap',
    prompt: `Encontrá ${street.name}`,
    frame: barrio ? expanded(barrio.bounds, 100) : frameOfSegments(ctx.graph, segments),
    highlight: barrio ? { barrio: barrio.id } : {},
    street: street.code,
    visibility: visibilityFor(ctx, { names: namesOf(street), streets: [street.code] }),
    explanation: `Acá está ${street.name}.`,
  };
}

function ownNodes(ctx: QuizContext, segments: readonly number[]): Set<number> {
  return new Set(
    segments.flatMap((t) => {
      const { from, to } = ctx.graph.segment(t);
      return [from, to];
    }),
  );
}

/** Los cruces de la calle, hacia arriba y hacia abajo de la ventana. */
function crossingsAround(
  street: StreetRecord,
  nodes: ReadonlySet<number>,
): { up: StreetCrossing[]; down: StreetCrossing[] } {
  const indexes = street.crossings.flatMap((c, i) => (nodes.has(c.node) ? [i] : []));
  if (indexes.length === 0) return { up: [], down: [] };
  const low = Math.min(...indexes);
  const high = Math.max(...indexes);
  return {
    up: street.crossings.slice(high + 1),
    down: street.crossings.slice(0, low).reverse(),
  };
}

/** La próxima avenida en esa dirección, contada desde el final de la ventana. */
function referenceStreet(
  ctx: QuizContext,
  ahead: readonly StreetCrossing[],
): StreetRecord | undefined {
  const named = ahead.flatMap((c) => {
    const other = ctx.streetByCode.get(c.street);
    return other?.askable ? [other] : [];
  });
  return named.find((s) => s.level <= REFERENCE_LEVEL) ?? named[0];
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Cada flecha lleva dos referencias: la próxima avenida y el rumbo. */
function directionLabel(
  reference: StreetRecord | undefined,
  rumbo: Rumbo | undefined,
  numbering: string,
): Omit<Option, 'id'> {
  if (reference) return { label: `Hacia ${reference.name}`, ...(rumbo ? { detail: rumbo } : {}) };
  return { label: rumbo ? upperFirst(rumbo) : numbering };
}

/** Las puntas de la ventana, según hacia dónde crece la numeración. */
function ends(ctx: QuizContext, segments: readonly number[], forward: number) {
  const rad = (forward * Math.PI) / 180;
  const points = segments.flatMap((t) => [...ctx.graph.segment(t).geometry]);
  const along = (p: LngLat) => p[0] * Math.sin(rad) * 0.82 + p[1] * Math.cos(rad);
  const sorted = [...points].sort((a, b) => along(a) - along(b));
  return { low: sorted[0] as LngLat, high: sorted[sorted.length - 1] as LngLat };
}

export function directionQuestion(
  ctx: QuizContext,
  street: StreetRecord,
  stretch: DirectionStretch,
  seed: number,
  random: Random,
): DirectionQuestion | undefined {
  const forward = numberingBearing(ctx.graph, stretch);
  if (forward === undefined || !stretch.askable) return undefined;

  const size = MIN_WINDOW + random.int(MAX_WINDOW - MIN_WINDOW + 1);
  // Con calzadas separadas, una ventana podría mostrar una sola: siempre va el tramo entero.
  const whole = random.next() < 0.5 || stretch.segments.length <= size || stretch.splitCarriageway;
  const start = whole ? 0 : random.int(stretch.segments.length - size + 1);
  const own = whole ? stretch.segments : stretch.segments.slice(start, start + size);
  const segments = withPairs(ctx.graph, own);

  const { up, down } = crossingsAround(street, ownNodes(ctx, segments));
  const middleLine = ctx.graph.segment(own[Math.floor(own.length / 2)] as number).geometry;
  const middle = pointAlong(middleLine, lineLengthM(middleLine) / 2);
  const river = riverBearingAt(middle, ctx.barriosFile);
  const rumbo = (bearing: number) =>
    river === undefined ? undefined : rumboOf(bearing % 360, river);
  const high = directionLabel(
    referenceStreet(ctx, up),
    rumbo(forward),
    'Hacia donde crece la numeración',
  );
  const low = directionLabel(
    referenceStreet(ctx, down),
    rumbo(forward + 180),
    'Hacia donde baja la numeración',
  );
  // Una calle en U puede tener la misma referencia en las dos puntas.
  if (high.label === low.label) {
    high.label = 'Hacia donde crece la numeración';
    low.label = 'Hacia donde baja la numeración';
  }
  const point = ends(ctx, segments, forward);

  const options: Option[] = [
    { ...high, id: 'F' },
    { ...low, id: 'B' },
    { id: 'D', label: 'Doble mano' },
  ];
  const chosen = options.find((o) => o.id === stretch.dir) as Option;
  const explanation =
    stretch.dir === 'D'
      ? stretch.splitCarriageway
        ? 'Es doble mano, con calzadas separadas.'
        : 'Es doble mano.'
      : `Va ${lowerFirst(chosen.label)}${chosen.detail ? `, ${chosen.detail}` : ''}.`;
  return {
    kind: 'direction',
    card: stretch.id as CardId,
    mode: 'direction',
    seed,
    interaction: 'choice',
    prompt: `¿Hacia dónde va ${street.name}?`,
    frame: frameOfSegments(ctx.graph, segments),
    highlight: { segments },
    options,
    answer: stretch.dir,
    arrows: [
      { option: 'F', point: point.high, bearing: forward },
      { option: 'B', point: point.low, bearing: (forward + 180) % 360 },
    ],
    visibility: visibilityFor(ctx, {
      names: [],
      streets: [],
      arrows: [street.code],
      show: [street.code],
    }),
    explanation,
  };
}
