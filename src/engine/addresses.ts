/**
 * Buscador y geocodificación sin internet (sección 9): calles, direcciones ("Cabildo 2400"),
 * esquinas ("Santa Fe y Scalabrini Ortiz") e hitos. Tolera tildes, abreviaturas y alturas que no
 * existen, y encuentra la esquina aunque esté formada por varios nodos.
 */
import type { LandmarkRecord, StreetRecord } from './data';
import { lineLengthM, pointAlong, type LngLat } from './geo';
import type { RoadGraph } from './graph';
import { significantWords } from './text';

/** Una altura sobre una cuadra. */
export interface Address {
  street: number;
  segment: number;
  height: number;
  point: LngLat;
  /** La altura está dentro de la cuadra; si no, es la cuadra más cercana. */
  exact: boolean;
}

export interface Corner {
  streets: [number, number];
  nodes: number[];
  point: LngLat;
}

export type SearchResult =
  | { kind: 'street'; street: number; label: string }
  | ({ kind: 'address'; label: string } & Address)
  | ({ kind: 'corner'; label: string } & Corner)
  | { kind: 'landmark'; id: string; point: LngLat; label: string };

/** Nodos a menos de esto son la misma esquina: una avenida con calzadas separadas. */
const SAME_CORNER_M = 150;
/** Si dos calles no comparten un nodo, se acepta la esquina con nodos a menos de esto. */
const NEAR_CORNER_M = 40;
/** Cuántas calles por nombre se prueban para armar una dirección o una esquina. */
const CANDIDATES = 3;
const MIN_QUERY_LENGTH = 2;
/** El puntaje de un nombre completo (ver matchScore). */
const EXACT_SCORE = 3;

const CORNER_SEPARATOR = /\s+(?:y|e|esq\.?|esquina|con)\s+|\s*[&/]\s*/gi;
const ADDRESS = /^(.*?)\s*(?:\bal\s+)?(\d{1,5})$/i;

interface Entry {
  words: string[];
  /** El nombre de uso, no un alias o un nombre anterior. */
  primary: boolean;
}

interface Named {
  entries: Entry[];
  importance: number;
  label: string;
}

/** Para buscar, la ñ cuenta como n: "nunez" encuentra Núñez. */
function searchWords(text: string): string[] {
  return significantWords(text).map((word) => word.replaceAll('ñ', 'n'));
}

/** Las formas de escribir un nombre: con apóstrofo o sin él, como "O'Higgins" y "ohiggins". */
function entriesOf(name: string, primary: boolean): Entry[] {
  const joined = name.replace(/['’]/g, '');
  const names = joined === name ? [name] : [name, joined];
  return names.map((text) => ({ words: searchWords(text), primary }));
}

/** 0 si no coincide. Primero el nombre completo, después las palabras enteras y las que empiezan. */
function matchScore(query: readonly string[], entry: Entry): number {
  const free = [...entry.words];
  let whole = 0;
  for (const word of query) {
    let at = free.indexOf(word);
    if (at >= 0) whole++;
    else at = free.findIndex((candidate) => candidate.startsWith(word));
    if (at < 0) return 0;
    free.splice(at, 1);
  }
  const base = whole < query.length ? 1 : free.length > 0 ? 2 : 3;
  return base + (entry.primary ? 0.5 : 0);
}

function bestScore(query: readonly string[], item: Named): number {
  return Math.max(0, ...item.entries.map((entry) => matchScore(query, entry)));
}

function ranked<T extends Named>(query: readonly string[], items: readonly T[]) {
  return items
    .map((item) => ({ item, score: bestScore(query, item) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.item.importance - a.item.importance ||
        a.item.label.localeCompare(b.item.label, 'es'),
    );
}

export class AddressBook {
  private readonly graph: RoadGraph;
  private readonly heights: readonly number[];
  private readonly byCode: ReadonlyMap<number, StreetRecord>;
  private readonly streets: (Named & { record: StreetRecord })[];
  private readonly landmarks: (Named & { record: LandmarkRecord })[];

  constructor(
    graph: RoadGraph,
    heights: readonly number[],
    streets: readonly StreetRecord[],
    landmarks: readonly LandmarkRecord[],
  ) {
    this.graph = graph;
    this.heights = heights;
    this.byCode = new Map(streets.map((s) => [s.code, s]));
    this.streets = streets.map((record) => ({
      record,
      label: record.name,
      importance: record.importance,
      entries: [
        ...entriesOf(record.name, true),
        ...entriesOf(record.short, true),
        ...[record.official, record.previous, ...record.aliases].flatMap((name) =>
          name ? entriesOf(name, false) : [],
        ),
      ],
    }));
    this.landmarks = landmarks.map((record) => ({
      record,
      label: record.name,
      importance: 0,
      entries: entriesOf(record.name, true),
    }));
  }

  private findStreets(text: string): StreetRecord[] {
    const words = searchWords(text);
    if (words.length === 0) return [];
    return ranked(words, this.streets).map((x) => x.item.record);
  }

  /** Las alturas de un lado de la cuadra (0 izquierda, 2 derecha) o de toda, si `side` no tiene. */
  private rangeOf(segment: number, side?: 0 | 2): [number, number] | undefined {
    const [l0 = 0, l1 = 0, r0 = 0, r1 = 0] = this.heights.slice(4 * segment, 4 * segment + 4);
    const own = side === undefined ? [] : side === 0 ? [l0, l1] : [r0, r1];
    const values = (own.some((h) => h > 0) ? own : [l0, l1, r0, r1]).filter((h) => h > 0);
    return values.length > 0 ? [Math.min(...values), Math.max(...values)] : undefined;
  }

  /** El punto de una altura: pares a la izquierda, impares a la derecha. */
  locate(street: number, height: number): Address | undefined {
    const side = height % 2 === 0 ? 0 : 2;
    let best: { segment: number; range: [number, number]; gap: number } | undefined;
    for (const segment of this.byCode.get(street)?.segments ?? []) {
      const range = this.rangeOf(segment, side);
      if (!range) continue;
      const gap = Math.max(range[0] - height, height - range[1], 0);
      if (!best || gap < best.gap) best = { segment, range, gap };
    }
    if (!best) return undefined;
    const [from, to] = best.range;
    const ratio = to > from ? Math.min(1, Math.max(0, (height - from) / (to - from))) : 0.5;
    // La geometría va hacia donde crece la numeración.
    const line = this.graph.segment(best.segment).geometry;
    return {
      street,
      segment: best.segment,
      height,
      point: pointAlong(line, ratio * lineLengthM(line)),
      exact: best.gap === 0,
    };
  }

  /** La altura más cercana a un punto, en las cuadras con alturas a menos de `radiusM`. */
  reverse(point: LngLat, radiusM = 50): Address | undefined {
    const nearest = this.graph.nearestSegments(point, radiusM).find((x) => this.rangeOf(x.segment));
    if (!nearest) return undefined;
    const [from, to] = this.rangeOf(nearest.segment) as [number, number];
    const line = this.graph.segment(nearest.segment).geometry;
    const ratio = nearest.alongM / Math.max(lineLengthM(line), 1);
    return {
      street: this.graph.segment(nearest.segment).street,
      segment: nearest.segment,
      height: Math.round(from + (to - from) * ratio),
      point: pointAlong(line, nearest.alongM),
      exact: true,
    };
  }

  private nodesOf(street: number): Set<number> {
    const nodes = new Set<number>();
    for (const t of this.byCode.get(street)?.segments ?? []) {
      const segment = this.graph.segment(t);
      nodes.add(segment.from);
      nodes.add(segment.to);
    }
    return nodes;
  }

  /** Las esquinas de dos calles: puede haber más de una si se cruzan dos veces. */
  corners(a: number, b: number): Corner[] {
    const nodesA = this.nodesOf(a);
    const nodesB = this.nodesOf(b);
    let shared = [...nodesA].filter((n) => nodesB.has(n));
    if (shared.length === 0) {
      let closest: { nodes: number[]; distance: number } | undefined;
      for (const x of nodesA) {
        for (const y of nodesB) {
          const distance = this.graph.nodeDistance(x, y);
          if (distance <= NEAR_CORNER_M && (!closest || distance < closest.distance))
            closest = { nodes: [x, y], distance };
        }
      }
      shared = closest?.nodes ?? [];
    }
    const clusters: number[][] = [];
    for (const node of shared) {
      const cluster = clusters.find((c) =>
        c.some((other) => this.graph.nodeDistance(node, other) <= SAME_CORNER_M),
      );
      if (cluster) cluster.push(node);
      else clusters.push([node]);
    }
    return clusters.map((nodes) => {
      const points = nodes.map((n) => this.graph.node(n));
      const sum = points.reduce<LngLat>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
      return {
        streets: [a, b],
        nodes,
        point: [sum[0] / points.length, sum[1] / points.length],
      };
    });
  }

  private searchAddresses(query: string): SearchResult[] {
    const match = ADDRESS.exec(query);
    if (!match?.[1]) return [];
    const height = Number(match[2]);
    return this.findStreets(match[1])
      .slice(0, CANDIDATES)
      .flatMap((street) => {
        const address = this.locate(street.code, height);
        return address
          ? [{ kind: 'address' as const, label: `${street.name} ${height}`, ...address }]
          : [];
      });
  }

  private searchCorners(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    for (const separator of query.matchAll(CORNER_SEPARATOR)) {
      const left = query.slice(0, separator.index);
      const right = query.slice(separator.index + separator[0].length);
      for (const a of this.findStreets(left).slice(0, CANDIDATES)) {
        for (const b of this.findStreets(right).slice(0, CANDIDATES)) {
          if (a.code === b.code) continue;
          for (const corner of this.corners(a.code, b.code)) {
            results.push({ kind: 'corner', label: `${a.name} y ${b.name}`, ...corner });
          }
        }
      }
    }
    return results;
  }

  /** Primero lo que la consulta pide de forma más precisa: una dirección o una esquina. */
  search(query: string, limit = 8): SearchResult[] {
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH) return [];
    const words = searchWords(text);
    const named: { score: number; result: SearchResult }[] =
      words.length === 0
        ? []
        : [
            ...ranked(words, this.streets).map(({ item, score }) => ({
              score: score + item.importance / 2,
              result: { kind: 'street' as const, street: item.record.code, label: item.label },
            })),
            ...ranked(words, this.landmarks).map(({ item, score }) => ({
              score,
              result: {
                kind: 'landmark' as const,
                id: item.record.id,
                point: [item.record.lng, item.record.lat] as LngLat,
                label: item.label,
              },
            })),
          ];
    named.sort((a, b) => b.score - a.score);
    // El nombre completo va primero: "11 de Septiembre de 1888" es una calle, no una altura.
    const exact = named.filter((x) => x.score >= EXACT_SCORE).map((x) => x.result);
    const others = named.filter((x) => x.score < EXACT_SCORE).map((x) => x.result);
    return [...exact, ...this.searchAddresses(text), ...this.searchCorners(text), ...others].slice(
      0,
      limit,
    );
  }
}
