/**
 * Las fichas de cada lección (sección 3): lo único "para mirar" antes de preguntar. Cada ficha dice
 * qué se muestra en el mapa, igual que una pregunta.
 */
import { directionText } from '../describe';
import type { DirectionStretch, RailCrossing, StreetRecord } from '../data';
import { reverseLine, type LngLat } from '../geo';
import type { RoadGraph } from '../graph';
import { mainStretch, type Lesson } from '../srs/curriculum';
import {
  boundsOf,
  CONTEXT_M,
  expanded,
  frameOfSegments,
  inArea,
  type QuizContext,
} from './context';
import type { Bounds, Highlight, Visibility } from './types';

export interface LessonSlide {
  title: string;
  lines: string[];
  frame: Bounds;
  highlight: Highlight;
  visibility: Visibility;
  /** Por dónde se circula: se anima el sentido. */
  flow?: LngLat[];
}

/** Cuántas avenidas se nombran en la ficha de una calle. */
const CROSSINGS_SHOWN = 6;
/** Las calles de este nivel o más importantes son las avenidas que cruza. */
const AVENUE_LEVEL = 2;

const KIND_TEXT: Record<RailCrossing['kind'], string> = {
  nivel: 'a nivel',
  viaducto: 'por abajo',
  tunel: 'por abajo',
  puente: 'por arriba',
};

/** Lo que se ve en una ficha: lo que ya se sabe, más lo que se está presentando. */
function shown(ctx: QuizContext, streets: readonly number[] = []): Visibility {
  const { learner } = ctx;
  return {
    streets: [...new Set([...learner.knownStreets, ...streets])],
    landmarks: [...learner.knownLandmarks],
    hiddenArrows: [],
    barrioLabels: true,
    barrierLabels: true,
    domain: false,
  };
}

/** La línea por la que se circula en un tramo de mano única, de punta a punta. */
export function travelLine(graph: RoadGraph, stretch: DirectionStretch): LngLat[] | undefined {
  if (stretch.dir === 'D') return undefined;
  const forward = stretch.segments.flatMap((t) => {
    const { geometry } = graph.segment(t);
    return stretch.against?.includes(t) ? reverseLine(geometry) : [...geometry];
  });
  return stretch.dir === 'F' ? forward : reverseLine(forward);
}

function barrioNames(ctx: QuizContext, street: StreetRecord): string {
  return ctx.barrios
    .filter((b) => street.barrios.includes(b.name))
    .map((b) => b.display)
    .join(', ');
}

/** Las avenidas que cruza, en orden y sin repetir. */
function avenuesCrossed(ctx: QuizContext, street: StreetRecord): StreetRecord[] {
  const codes = [...new Set(street.crossings.map((c) => c.street))];
  return codes.flatMap((code) => {
    const other = ctx.streetByCode.get(code);
    return other && other.level <= AVENUE_LEVEL ? [other] : [];
  });
}

/** Hasta `count` elementos repartidos a lo largo de la lista: una calle larga cruza mucho. */
function spread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from(
    { length: count },
    (_, i) => items[Math.floor((i * (items.length - 1)) / (count - 1))] as T,
  );
}

function streetSlide(ctx: QuizContext, street: StreetRecord): LessonSlide {
  const segments = street.segments.filter((t) => inArea(ctx.graph, t));
  const main = mainStretch(ctx.graph, street);
  const avenues = spread(avenuesCrossed(ctx, street), CROSSINGS_SHOWN);
  const flow = main && travelLine(ctx.graph, main);
  return {
    title: street.name,
    lines: [
      ...(main ? [directionText(ctx.graph, ctx.barriosFile, main)] : []),
      ...(avenues.length > 0 ? [`Cruza ${avenues.map((a) => a.name).join(', ')}.`] : []),
      `Barrios: ${barrioNames(ctx, street)}.`,
      ...(street.previous ? [`Antes se llamaba ${street.previous}.`] : []),
    ],
    frame: frameOfSegments(ctx.graph, segments),
    highlight: { segments },
    visibility: shown(ctx, [street.code, ...avenues.map((a) => a.code)]),
    ...(flow ? { flow } : {}),
  };
}

function railSlides(ctx: QuizContext, lesson: Extract<Lesson, { kind: 'vias' }>): LessonSlide[] {
  return lesson.cards.flatMap((card) => {
    const entry = ctx.railById.get(card);
    if (!entry) return [];
    const { line, stretch } = entry;
    const from = ctx.streetByCode.get(stretch.from);
    const to = ctx.streetByCode.get(stretch.to);
    const crossings = stretch.crossings.flatMap((i) => {
      const crossing = line.crossings[i];
      if (!crossing || crossing.unconfirmed) return [];
      const street = ctx.streetByCode.get(crossing.street);
      return street ? [{ street, crossing }] : [];
    });
    const closed = stretch.closed.flatMap((c) => ctx.streetByCode.get(c.street) ?? []);
    const points = line.crossings
      .filter((c) => [stretch.from, stretch.to].includes(c.street))
      .map((c): LngLat => [c.lng, c.lat]);
    const around = [...points, ...crossings.map((c): LngLat => [c.crossing.lng, c.crossing.lat])];
    if (around.length === 0) return [];
    return [
      {
        title: `${line.name}: ${from?.short ?? ''} a ${to?.short ?? ''}`,
        lines: [
          crossings.length > 0
            ? `Se cruza por ${crossings.map((c) => `${c.street.name} (${KIND_TEXT[c.crossing.kind]})`).join(', ')}.`
            : 'Entre estas dos avenidas no hay otro cruce.',
          ...(closed.length > 0 ? [`No cruzan: ${closed.map((s) => s.name).join(', ')}.`] : []),
        ],
        frame: expanded(boundsOf(around), CONTEXT_M),
        highlight: {},
        visibility: shown(ctx, [
          stretch.from,
          stretch.to,
          ...crossings.map((c) => c.street.code),
          ...closed.map((s) => s.code),
        ]),
      },
    ];
  });
}

/** La primera lección: el río y los cuatro rumbos, con todo el mapa a la vista. */
function rumbosSlides(ctx: QuizContext): LessonSlide[] {
  const all = ctx.barrios.flatMap((b) => b.bounds);
  const frame = boundsOf(all);
  const visibility = shown(ctx);
  return [
    {
      title: 'El río manda',
      lines: [
        'En Buenos Aires la gente se orienta con el río, no con los puntos cardinales.',
        'En este mapa el río queda arriba y a la derecha.',
      ],
      frame,
      highlight: {},
      visibility,
    },
    {
      title: 'Cuatro rumbos',
      lines: [
        'Hacia el río y hacia el oeste: las calles que van o vienen de la costa.',
        'Hacia el centro y hacia General Paz: las que corren paralelas al río.',
        'Con estos cuatro rumbos te vas a ubicar en todas las preguntas.',
      ],
      frame,
      highlight: {},
      visibility,
    },
  ];
}

export function lessonSlides(ctx: QuizContext, lesson: Lesson): LessonSlide[] {
  switch (lesson.kind) {
    case 'rumbos':
      return rumbosSlides(ctx);
    case 'calle': {
      const street = ctx.streetByCode.get(lesson.street);
      return street ? [streetSlide(ctx, street)] : [];
    }
    case 'barrios':
      return lesson.cards.flatMap((card) => {
        const barrio = ctx.barrioById.get(card);
        if (!barrio) return [];
        return [
          {
            title: barrio.display,
            lines: ['Mirá dónde queda y qué barrios tiene al lado.'],
            frame: expanded(barrio.bounds, CONTEXT_M),
            highlight: { barrio: barrio.id },
            visibility: shown(ctx),
          },
        ];
      });
    case 'hitos':
      return lesson.cards.flatMap((card) => {
        const landmark = ctx.landmarkById.get(card);
        if (!landmark) return [];
        const point: LngLat = [landmark.lng, landmark.lat];
        return [
          {
            title: landmark.name,
            lines: ['Te va a servir de referencia para ubicarte.'],
            frame: expanded(boundsOf([point]), CONTEXT_M * 2),
            highlight: { point },
            visibility: shown(ctx),
          },
        ];
      });
    case 'autopistas':
      return lesson.cards.flatMap((card) => {
        const barrier = ctx.barrierById.get(card);
        if (!barrier) return [];
        return [
          {
            title: barrier.name,
            lines: ['Es una barrera: solo se cruza por algunos puntos.'],
            frame: expanded(boundsOf(barrier.lines.flat()), CONTEXT_M),
            highlight: { lines: barrier.lines },
            visibility: shown(ctx),
          },
        ];
      });
    case 'vias':
      return railSlides(ctx, lesson);
  }
}
