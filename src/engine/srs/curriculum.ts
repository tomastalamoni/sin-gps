/**
 * Qué se enseña después (sección 3): primero la orientación y el esqueleto de avenidas, después
 * barrio por barrio, empezando por el barrio base. Dentro de cada nivel manda la importancia, y las
 * lecciones seguidas salen de la misma zona.
 */
import { barrioAt, barriosByDistance, type BarrioInfo } from '../barrios';
import type { DirectionStretch, LandmarkRecord, RailLine, StreetRecord } from '../data';
import { distanceM, lineLengthM, pointAlong, type LngLat } from '../geo';
import type { RoadGraph } from '../graph';
import { cardIds, isCardId, type CardId } from '../ids';

export type Lesson =
  /** El río y los rumbos: no tiene tarjetas. */
  | { kind: 'rumbos'; id: string; cards: []; barrios: [] }
  | { kind: 'barrios'; id: string; cards: CardId[]; barrios: string[] }
  | { kind: 'hitos'; id: string; cards: CardId[]; barrios: string[] }
  | { kind: 'autopistas'; id: string; cards: CardId[]; barrios: [] }
  | { kind: 'vias'; id: string; line: string; cards: CardId[]; barrios: [] }
  | { kind: 'calle'; id: string; street: number; cards: CardId[]; barrios: string[] };

export interface CurriculumData {
  graph: RoadGraph;
  streets: readonly StreetRecord[];
  landmarks: readonly LandmarkRecord[];
  barrios: readonly BarrioInfo[];
  rail: readonly RailLine[];
  /** Las tarjetas de autopista (B:autopista:nombre). */
  barrierCards: readonly CardId[];
}

export interface StudyPlan {
  /** Barrio base (Z:barrio). */
  base?: string | undefined;
  /** Barrios activos (Z:barrio). Sin lista, los nueve. */
  active?: readonly string[] | undefined;
  /** "Esta semana, solo Palermo" (Z:barrio): va adelante sin romper el orden del resto. */
  focus?: string | undefined;
  /** Calles adelantadas con "Estudiar ahora", en orden. */
  priority?: readonly number[] | undefined;
}

const BARRIOS_PER_LESSON = 3;
const LANDMARKS_PER_LESSON = 3;
const STRETCHES_PER_LESSON = 3;
/** Una lección de vías cada tantas calles del esqueleto. */
const RAIL_EVERY = 4;
/** Una lección de hitos cada tantas calles de un barrio. */
const LANDMARKS_EVERY = 5;
/** Las lecciones de un mismo día salen de la misma zona. */
const LESSONS_PER_DAY_GROUP = 4;
/** Cuánta importancia vale un kilómetro de distancia al armar cada grupo. */
const IMPORTANCE_PER_KM = 0.05;
const SKELETON_LEVEL = 2;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** El punto medio de la cuadra más larga de la calle. */
function streetCenter(graph: RoadGraph, street: StreetRecord): LngLat | undefined {
  const longest = [...street.segments].sort(
    (a, b) => (graph.lengths[b] ?? 0) - (graph.lengths[a] ?? 0),
  )[0];
  if (longest === undefined) return undefined;
  const line = graph.segment(longest).geometry;
  return pointAlong(line, lineLengthM(line) / 2);
}

/** El tramo de sentido que se pregunta en la lección: el más largo que se puede preguntar. */
export function mainStretch(graph: RoadGraph, street: StreetRecord): DirectionStretch | undefined {
  const lengthOf = (s: DirectionStretch) =>
    s.segments.reduce((sum, t) => sum + (graph.lengths[t] ?? 0), 0);
  return street.stretches
    .filter((s) => s.askable)
    .sort((a, b) => lengthOf(b) - lengthOf(a) || a.id.localeCompare(b.id))[0];
}

function streetLesson(graph: RoadGraph, street: StreetRecord): Lesson {
  const main = mainStretch(graph, street);
  return {
    kind: 'calle',
    id: `L:calle:${street.code}`,
    street: street.code,
    cards: [cardIds.name(street.code), ...(main ? [main.id as CardId] : [])],
    barrios: street.barrios,
  };
}

/** Ordena por importancia, pero arma cada grupo con calles cercanas a la que lo encabeza. */
function byImportanceAndZone(graph: RoadGraph, streets: readonly StreetRecord[]): StreetRecord[] {
  const sorted = [...streets].sort((a, b) => b.importance - a.importance || a.code - b.code);
  const centers = new Map(sorted.map((s) => [s.code, streetCenter(graph, s)]));
  const out: StreetRecord[] = [];
  const pending = [...sorted];
  while (pending.length > 0) {
    const head = pending.shift() as StreetRecord;
    out.push(head);
    const center = centers.get(head.code);
    if (!center) continue;
    const score = (s: StreetRecord) => {
      const other = centers.get(s.code);
      return other ? s.importance - (IMPORTANCE_PER_KM * distanceM(center, other)) / 1000 : -1;
    };
    const near = [...pending]
      .sort((a, b) => score(b) - score(a) || a.code - b.code)
      .slice(0, LESSONS_PER_DAY_GROUP - 1);
    for (const street of near) {
      pending.splice(pending.indexOf(street), 1);
      out.push(street);
    }
  }
  return out;
}

/** Intercala una lección de `extra` cada `every` de `main`. */
function interleave<T>(main: readonly T[], extra: readonly T[], every: number): T[] {
  const out: T[] = [];
  const pending = [...extra];
  main.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % every === 0 && pending.length > 0) out.push(pending.shift() as T);
  });
  return [...out, ...pending];
}

function landmarkLessons(
  prefix: string,
  landmarks: readonly LandmarkRecord[],
  barrio: string | undefined,
): Lesson[] {
  return chunks(landmarks, LANDMARKS_PER_LESSON).map((group, i) => ({
    kind: 'hitos',
    id: `L:hitos:${prefix}:${i + 1}`,
    cards: group.map((l) => l.id as CardId),
    barrios: barrio ? [barrio] : [],
  }));
}

function railLessons(rail: readonly RailLine[]): Lesson[] {
  return rail.flatMap((line) =>
    chunks(line.stretches, STRETCHES_PER_LESSON).map((group, i) => ({
      kind: 'vias' as const,
      id: `L:vias:${line.slug}:${i + 1}`,
      line: line.slug,
      cards: group.map((s) => s.id as CardId),
      barrios: [] as [],
    })),
  );
}

/** Todas las lecciones, en orden. Las que ya se hicieron se descartan con `pendingLessons`. */
export function buildCurriculum(data: CurriculumData, plan: StudyPlan): Lesson[] {
  const { graph, streets, landmarks, rail, barrierCards } = data;
  const active = plan.active ? new Set(plan.active) : undefined;
  const barrios = data.barrios.filter((b) => !active || active.has(b.id));
  const base = barrios.find((b) => b.id === plan.base) ?? barrios[0];
  const ordered = base ? barriosByDistance(base, barrios) : barrios;
  const names = new Set(ordered.map((b) => b.name));

  const inBarrios = streets.filter((s) => s.askable && s.barrios.some((b) => names.has(b)));
  const landmarkBarrio = new Map(
    landmarks.map((l) => [l.id, barrioAt([l.lng, l.lat], ordered)?.name]),
  );
  const rank = (name: string | undefined) => ordered.findIndex((b) => b.name === name);
  const usable = landmarks.filter((l) => landmarkBarrio.get(l.id) !== undefined);
  const major = usable
    .filter((l) => l.major)
    .sort(
      (a, b) =>
        rank(landmarkBarrio.get(a.id)) - rank(landmarkBarrio.get(b.id)) || a.id.localeCompare(b.id),
    );

  const orientation: Lesson[] = [
    { kind: 'rumbos', id: 'L:rumbos', cards: [], barrios: [] },
    ...chunks(ordered, BARRIOS_PER_LESSON).map((group, i): Lesson => ({
      kind: 'barrios',
      id: `L:barrios:${i + 1}`,
      cards: group.map((b) => b.id as CardId),
      barrios: group.map((b) => b.name),
    })),
    ...landmarkLessons('mayores', major, undefined),
    ...(barrierCards.length > 0
      ? [
          {
            kind: 'autopistas',
            id: 'L:autopistas',
            cards: [...barrierCards],
            barrios: [],
          } satisfies Lesson,
        ]
      : []),
  ];

  const skeletonStreets = inBarrios.filter((s) => s.level <= SKELETON_LEVEL);
  const levels = [...new Set(skeletonStreets.map((s) => s.level))].sort((a, b) => a - b);
  const skeleton = interleave(
    levels.flatMap((level) =>
      byImportanceAndZone(
        graph,
        skeletonStreets.filter((s) => s.level === level),
      ).map((s) => streetLesson(graph, s)),
    ),
    railLessons(rail),
    RAIL_EVERY,
  );

  const taken = new Set(skeletonStreets.map((s) => s.code));
  const local = ordered.flatMap((barrio) => {
    const own = inBarrios.filter((s) => !taken.has(s.code) && s.barrios.includes(barrio.name));
    for (const s of own) taken.add(s.code);
    const lessons = [3, 4, 5].flatMap((level) =>
      byImportanceAndZone(
        graph,
        own.filter((s) => s.level === level),
      ).map((s) => streetLesson(graph, s)),
    );
    const others = usable.filter((l) => !l.major && landmarkBarrio.get(l.id) === barrio.name);
    return interleave(
      lessons,
      landmarkLessons(barrio.id.slice(2), others, barrio.name),
      LANDMARKS_EVERY,
    );
  });

  const all = [...orientation, ...skeleton, ...local];
  const priority = plan.priority ?? [];
  const first = priority.flatMap((code) => {
    const lesson = all.find((l) => l.kind === 'calle' && l.street === code);
    return lesson ? [lesson] : [];
  });
  const focus = data.barrios.find((b) => b.id === plan.focus)?.name;
  const inFocus = (l: Lesson) => focus !== undefined && l.barrios.some((b) => b === focus);
  const rest = all.filter((l) => !first.includes(l));
  return [...first, ...rest.filter(inFocus), ...rest.filter((l) => !inFocus(l))];
}

/** Las lecciones que faltan: una lección está hecha cuando existen todas sus tarjetas. */
export function pendingLessons(
  lessons: readonly Lesson[],
  known: ReadonlySet<string>,
  seen: ReadonlySet<string>,
): Lesson[] {
  return lessons.filter((lesson) => {
    // Los otros tramos de una calle entran después, con `pendingDirections`.
    if (lesson.kind === 'calle') return !known.has(lesson.cards[0] ?? '');
    if (lesson.cards.length === 0) return !seen.has(lesson.id);
    return lesson.cards.some((c) => !known.has(c));
  });
}

/**
 * Las tarjetas de sentido que faltan estrenar, de las calles ya estudiadas: la lección pregunta un
 * solo tramo y los otros entran de a uno, en días siguientes.
 */
export function pendingDirections(
  streets: readonly StreetRecord[],
  cards: ReadonlyMap<string, { createdDay: string }>,
  today: string,
): CardId[] {
  return [...streets]
    .sort((a, b) => b.importance - a.importance || a.code - b.code)
    .flatMap((street) => {
      const name = cards.get(cardIds.name(street.code));
      if (!name || name.createdDay === today) return [];
      const usedToday = street.stretches.some((s) => cards.get(s.id)?.createdDay === today);
      if (usedToday) return [];
      const next = street.stretches.find((s) => s.askable && !cards.has(s.id));
      return next && isCardId(next.id) ? [next.id] : [];
    });
}
