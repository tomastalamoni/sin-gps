/**
 * Correcciones de datos hechas en el celu (sección 6, "Reportes de datos"). Se aplican sobre los
 * archivos ya cargados: el dato corregido pasa a ser confiable y se puede preguntar.
 */
import {
  SegmentFlag,
  type Direction,
  type DirectionStretch,
  type SegmentsFile,
  type StreetRecord,
} from './data';
import { bearingDeg, lineLengthM, pointAlong, type LngLat } from './geo';
import type { RoadGraph } from './graph';

export interface TrackPoint {
  point: LngLat;
  /** Rumbo en que se circula; sin rumbo, es doble mano. */
  bearing?: number;
}

export interface DirectionCorrection {
  street: number;
  /** La tarjeta de sentido corregida. */
  stretch: string;
  /** Respecto de la numeración, como el `dir` del tramo de sentido. */
  dir: Direction;
}

export interface NameCorrection {
  street: number;
  name: string;
}

export interface CorrectedData {
  segments: SegmentsFile;
  streets: StreetRecord[];
  /** Las correcciones que ya no apuntan a nada: la tarjeta desapareció en esta versión. */
  orphans: DirectionCorrection[];
}

function flip(dir: Direction): Direction {
  return dir === 'F' ? 'B' : dir === 'B' ? 'F' : 'D';
}

/** El sentido de un tramo respecto de su geometría, dado el del tramo de sentido. */
function segmentDirection(stretch: DirectionStretch, t: number, dir: Direction): Direction {
  return stretch.against?.includes(t) ? flip(dir) : dir;
}

/** Hacia dónde crece la numeración en el tramo de sentido, medido en su cuadra más larga. */
export function numberingBearing(graph: RoadGraph, stretch: DirectionStretch): number | undefined {
  const longest = [...stretch.segments].sort(
    (a, b) => (graph.lengths[b] ?? 0) - (graph.lengths[a] ?? 0),
  )[0];
  if (longest === undefined) return undefined;
  const line = graph.segment(longest).geometry;
  const bearing = bearingDeg(line[0] as LngLat, line[line.length - 1] as LngLat);
  return stretch.against?.includes(longest) ? (bearing + 180) % 360 : bearing;
}

/**
 * Por dónde se circula en cada cuadra de un tramo con ese sentido: un punto y su rumbo, sin rumbo
 * si es doble mano. Sirve para reencontrar el tramo aunque cambien sus alturas o su ID.
 */
export function trackOf(graph: RoadGraph, stretch: DirectionStretch, dir: Direction): TrackPoint[] {
  return stretch.segments.map((t) => {
    const line = graph.segment(t).geometry;
    const point = pointAlong(line, lineLengthM(line) / 2);
    const own = segmentDirection(stretch, t, dir);
    if (own === 'D') return { point };
    const bearing = bearingDeg(line[0] as LngLat, line[line.length - 1] as LngLat);
    return { point, bearing: Math.round(own === 'B' ? (bearing + 180) % 360 : bearing) };
  });
}

/** Dos calzadas no se corrigen por alturas: cada una tiene su sentido (sección 8). */
export function canCorrectDirection(stretch: DirectionStretch): boolean {
  return !stretch.splitCarriageway;
}

function correctStretch(
  stretch: DirectionStretch,
  dir: Direction,
  segments: { dir: string[]; conf: string[]; flags: readonly number[] },
): DirectionStretch {
  for (const t of stretch.segments) {
    segments.dir[t] = segmentDirection(stretch, t, dir);
    segments.conf[t] = 'c';
  }
  const inArea = stretch.segments.every(
    (t) => ((segments.flags[t] ?? 0) & SegmentFlag.border) === 0,
  );
  return { ...stretch, dir, confidence: 'confirmado', askable: inArea, corrected: true };
}

/** Los datos con las correcciones aplicadas. No toca los originales. */
export function applyCorrections(
  segments: SegmentsFile,
  streets: readonly StreetRecord[],
  directions: readonly DirectionCorrection[],
  names: readonly NameCorrection[] = [],
): CorrectedData {
  const editable = {
    dir: Array.from(segments.dir),
    conf: Array.from(segments.conf),
    flags: segments.flags,
  };
  const orphans: DirectionCorrection[] = [];
  const byStreet = new Map<number, DirectionCorrection[]>();
  for (const correction of directions) {
    byStreet.set(correction.street, [...(byStreet.get(correction.street) ?? []), correction]);
  }
  const renamed = new Map(names.map((n) => [n.street, n.name]));
  const corrected = streets.map((street) => {
    const own = byStreet.get(street.code) ?? [];
    const name = renamed.get(street.code);
    if (own.length === 0 && name === undefined) return street;
    const stretches = street.stretches.map((stretch) => {
      const correction = own.find((c) => c.stretch === stretch.id);
      return correction && canCorrectDirection(stretch)
        ? correctStretch(stretch, correction.dir, editable)
        : stretch;
    });
    return { ...street, stretches, name: name ?? street.name };
  });
  const known = new Set(streets.flatMap((s) => s.stretches.map((st) => st.id)));
  for (const correction of directions) if (!known.has(correction.stretch)) orphans.push(correction);
  return {
    segments: { ...segments, dir: editable.dir.join(''), conf: editable.conf.join('') },
    streets: corrected,
    orphans,
  };
}
