/**
 * Lo que comparten los generadores de preguntas: los datos, lo que ya sabe quien juega, las ventanas
 * de cuadras, el encuadre, la visibilidad y los distractores.
 */
import type { BarrioInfo } from '../barrios';
import {
  SegmentFlag,
  type DirectionStretch,
  type LandmarkRecord,
  type RailFile,
  type RailLine,
  type RailStretch,
  type StreetRecord,
} from '../data';
import { angleDiff, bearingDeg, lineLengthM, pointAlong, type LngLat } from '../geo';
import type { RoadGraph } from '../graph';
import type { CardId } from '../ids';
import type { Random } from '../random';
import { nameSimilarity, significantWords } from '../text';
import type { Bounds, Visibility } from './types';

export interface QuizData {
  graph: RoadGraph;
  streets: readonly StreetRecord[];
  landmarks: readonly LandmarkRecord[];
  barrios: readonly BarrioInfo[];
  /** barrios.json, para los rumbos. */
  barriosFile: GeoJSON.FeatureCollection;
  barriers: GeoJSON.FeatureCollection;
  rail: Pick<RailFile, 'lines' | 'terminal'>;
}

/** Lo que el jugador ya sabe: de acá salen las etiquetas visibles y los distractores. */
export interface Learner {
  /** Calles con la tarjeta de nombre En progreso o mejor, y anclas ya presentadas. */
  knownStreets: ReadonlySet<number>;
  /** Hitos ya presentados. */
  knownLandmarks: ReadonlySet<string>;
  /** Calles con las que confundió a esta. */
  confusions(street: number): readonly number[];
  /** Qué tan firme está una tarjeta, de 0 a 1. */
  firmness(card: CardId): number;
  /** "Sin ayudas": ninguna etiqueta. */
  noLabels?: boolean;
}

interface Neighbor {
  street: StreetRecord;
  distanceM: number;
  parallel: boolean;
}

export interface RailEntry {
  line: RailLine;
  stretch: RailStretch;
}

export interface QuizContext extends QuizData {
  learner: Learner;
  streetByCode: ReadonlyMap<number, StreetRecord>;
  stretchById: ReadonlyMap<string, { street: StreetRecord; stretch: DirectionStretch }>;
  landmarkById: ReadonlyMap<string, LandmarkRecord>;
  barrioById: ReadonlyMap<string, BarrioInfo>;
  railById: ReadonlyMap<string, RailEntry>;
  /** El trazado y el nombre de cada autopista con tarjeta. */
  barrierById: ReadonlyMap<string, { name: string; lines: LngLat[][] }>;
  /** Los nombres de todas las barreras, con tarjeta o sin ella. */
  barrierNames: readonly string[];
  neighbors(street: StreetRecord): readonly Neighbor[];
}

/** Hasta dónde se buscan calles vecinas para los distractores. */
const NEIGHBOR_M = 400;
/** Cuántas cuadras de cada calle se miran para buscar vecinas. */
const NEIGHBOR_SAMPLES = 10;
/** Dos calles son paralelas si sus rumbos difieren menos que esto. */
const PARALLEL_DEG = 25;
/** Al menos 3 cuadras de contexto alrededor de lo preguntado. */
export const CONTEXT_M = 300;
/** Una calle larga se muestra en una ventana de 5 cuadras. */
export const WINDOW_BLOCKS = 5;

function barrierEntries(barriers: GeoJSON.FeatureCollection) {
  const entries = new Map<string, { name: string; lines: LngLat[][] }>();
  for (const { properties, geometry } of barriers.features) {
    const { card, name } = (properties ?? {}) as { card?: string; name?: string };
    if (!card || geometry.type !== 'LineString') continue;
    const entry = entries.get(card) ?? { name: name ?? '', lines: [] };
    entry.lines.push(geometry.coordinates as unknown as LngLat[]);
    entries.set(card, entry);
  }
  return entries;
}

function segmentBearing(graph: RoadGraph, t: number): number {
  const line = graph.segment(t).geometry;
  return bearingDeg(line[0] as LngLat, line[line.length - 1] as LngLat);
}

export function inArea(graph: RoadGraph, t: number): boolean {
  return (graph.segment(t).flags & SegmentFlag.border) === 0;
}

function computeNeighbors(
  data: QuizData,
  byCode: ReadonlyMap<number, StreetRecord>,
  street: StreetRecord,
): Neighbor[] {
  const { graph } = data;
  const own = street.segments.filter((t) => inArea(graph, t));
  const step = Math.max(1, Math.floor(own.length / NEIGHBOR_SAMPLES));
  const best = new Map<number, Neighbor>();
  for (let i = 0; i < own.length; i += step) {
    const t = own[i] as number;
    const line = graph.segment(t).geometry;
    const middle = pointAlong(line, lineLengthM(line) / 2);
    const bearing = segmentBearing(graph, t);
    for (const near of graph.nearestSegments(middle, NEIGHBOR_M)) {
      const code = graph.segment(near.segment).street;
      const other = byCode.get(code);
      if (!other || code === street.code || !other.askable) continue;
      const known = best.get(code);
      if (known && known.distanceM <= near.distanceM) continue;
      const offset = Math.abs(angleDiff(bearing, segmentBearing(graph, near.segment)));
      const parallel = Math.min(offset, 180 - offset) < PARALLEL_DEG;
      best.set(code, { street: other, distanceM: near.distanceM, parallel });
    }
  }
  return [...best.values()].sort(
    (a, b) => a.distanceM - b.distanceM || a.street.code - b.street.code,
  );
}

export function createQuizContext(data: QuizData, learner: Learner): QuizContext {
  const streetByCode = new Map(data.streets.map((s) => [s.code, s]));
  const memo = new Map<number, Neighbor[]>();
  return {
    ...data,
    learner,
    streetByCode,
    stretchById: new Map(
      data.streets.flatMap((street) =>
        street.stretches.map((stretch) => [stretch.id, { street, stretch }] as const),
      ),
    ),
    landmarkById: new Map(data.landmarks.map((l) => [l.id, l])),
    barrioById: new Map(data.barrios.map((b) => [b.id, b])),
    railById: new Map(
      data.rail.lines.flatMap((line) =>
        line.stretches.map((stretch) => [stretch.id, { line, stretch }] as const),
      ),
    ),
    barrierById: barrierEntries(data.barriers),
    barrierNames: [
      ...new Set(
        data.barriers.features.flatMap((f) => {
          const { name } = (f.properties ?? {}) as { name?: string };
          return name ? [name] : [];
        }),
      ),
    ],
    neighbors(street) {
      const known = memo.get(street.code);
      if (known) return known;
      const found = computeNeighbors(data, streetByCode, street);
      memo.set(street.code, found);
      return found;
    },
  };
}

export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** El nombre, el corto y los alias: nada de eso puede quedar a la vista. */
export function namesOf(street: StreetRecord): string[] {
  return [street.name, street.short, ...street.aliases];
}

const wordsMemo = new Map<string, ReadonlySet<string>>();

/** Las palabras de un nombre: son pocos nombres y se comparan muchas veces. */
function wordsOf(text: string): ReadonlySet<string> {
  const known = wordsMemo.get(text);
  if (known) return known;
  const words = new Set(significantWords(text));
  wordsMemo.set(text, words);
  return words;
}

/** ¿La etiqueta contiene ese nombre? "Plaza Italia" contiene "Italia". */
export function labelContains(label: string, name: string): boolean {
  const words = wordsOf(name);
  if (words.size === 0) return false;
  const inLabel = wordsOf(label);
  return [...words].every((word) => inLabel.has(word));
}

export interface HideSpec {
  /** Nombres que no pueden aparecer en ninguna etiqueta. */
  names: readonly string[];
  /** Calles sin etiqueta. */
  streets: readonly number[];
  /** Calles sin flechas. */
  arrows?: readonly number[];
  /** Calles con etiqueta aunque no se sepan: el enunciado las nombra. */
  show?: readonly number[];
  barrioLabels?: boolean;
  barrierLabels?: boolean;
}

export function visibilityFor(ctx: QuizContext, hide: HideSpec): Visibility {
  const { learner } = ctx;
  const leaks = (label: string) => hide.names.some((name) => labelContains(label, name));
  const known = learner.noLabels
    ? []
    : [...new Set([...learner.knownStreets, ...(hide.show ?? [])])];
  const streets = known.filter((code) => {
    const street = ctx.streetByCode.get(code);
    return street && !hide.streets.includes(code) && !leaks(street.name) && !leaks(street.short);
  });
  const landmarks = learner.noLabels
    ? []
    : [...learner.knownLandmarks].filter((id) => {
        const landmark = ctx.landmarkById.get(id);
        return landmark !== undefined && !leaks(landmark.name);
      });
  return {
    streets,
    landmarks,
    hiddenArrows: [...(hide.arrows ?? [])],
    // Una barrera o un barrio pueden llamarse igual que una calle: su etiqueta también delata.
    barrioLabels:
      !learner.noLabels &&
      (hide.barrioLabels ?? true) &&
      !ctx.barrios.some((b) => leaks(b.display)),
    barrierLabels:
      !learner.noLabels &&
      (hide.barrierLabels ?? true) &&
      !ctx.barrierNames.some((name) => leaks(name)),
    domain: false,
  };
}

export function boundsOf(points: readonly LngLat[]): Bounds {
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export function expanded([[west, south], [east, north]]: Bounds, meters: number): Bounds {
  const dLat = meters / 110_574;
  const dLng = meters / (111_320 * Math.cos((((south + north) / 2) * Math.PI) / 180));
  return [
    [west - dLng, south - dLat],
    [east + dLng, north + dLat],
  ];
}

export function frameOfSegments(graph: RoadGraph, segments: readonly number[]): Bounds {
  return expanded(boundsOf(segments.flatMap((t) => [...graph.segment(t).geometry])), CONTEXT_M);
}

/** Una cuadra y su otra calzada, si la tiene. */
export function withPairs(graph: RoadGraph, segments: readonly number[]): number[] {
  const out = new Set(segments);
  for (const t of segments) {
    const { pair } = graph.segment(t);
    if (pair >= 0) out.add(pair);
  }
  return [...out];
}

/**
 * Lo que se resalta de una calle: completa o, si es larga, una ventana de 5 cuadras. A medida que la
 * tarjeta se afirma hay más ventanas, porque manejando solo se ve un pedazo.
 */
export function streetWindow(
  ctx: QuizContext,
  street: StreetRecord,
  firmness: number,
  random: Random,
): number[] {
  const own = street.segments.filter((t) => inArea(ctx.graph, t));
  const local = random.next() < 0.3 + 0.7 * firmness;
  if (own.length <= WINDOW_BLOCKS * 2 || !local) return own;
  const start = random.int(own.length - WINDOW_BLOCKS + 1);
  return withPairs(ctx.graph, own.slice(start, start + WINDOW_BLOCKS));
}

/**
 * Los distractores salen de calles cercanas, paralelas o de nombre parecido. Cuanto más firme está
 * la tarjeta, más parecidos son. Si hay una confusión registrada, entra siempre.
 */
export function streetDistractors(
  ctx: QuizContext,
  street: StreetRecord,
  count: number,
  firmness: number,
  random: Random,
): StreetRecord[] {
  const chosen: StreetRecord[] = [];
  const add = (candidate: StreetRecord | undefined) => {
    if (!candidate?.askable || chosen.length >= count || candidate.code === street.code) return;
    const taken = [street, ...chosen];
    if (taken.some((s) => s.name === candidate.name)) return;
    chosen.push(candidate);
  };
  for (const code of ctx.learner.confusions(street.code)) add(ctx.streetByCode.get(code));

  const closeness = (n: Neighbor) =>
    nameSimilarity(street.name, n.street.name) * 2 +
    (n.parallel ? 1 : 0) +
    (1 - n.distanceM / NEIGHBOR_M);
  const ranked = ctx
    .neighbors(street)
    .map((n) => ({ n, score: firmness * closeness(n) + (1 - firmness) * random.next() * 3 }))
    .sort((a, b) => b.score - a.score || a.n.street.code - b.n.street.code);
  for (const { n } of ranked) add(n.street);

  // Una calle aislada puede no tener vecinas: se completa con las de su nivel.
  const sameLevel = ctx.streets.filter((s) => s.level === street.level);
  for (const candidate of shuffled(sameLevel, random)) add(candidate);
  for (const candidate of shuffled(ctx.streets, random)) add(candidate);
  return chosen;
}
