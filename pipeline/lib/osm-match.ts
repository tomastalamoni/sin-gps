/**
 * Cruce con OSM por superposición, no por cercanía (sección 8, paso 8): para cada tramo, las vías
 * de nombre parecido a menos de 30 m que entre todas cubren al menos el 60% del tramo.
 */
import type { Direction } from '../../src/engine/data';
import {
  angleDiff,
  bearingDeg,
  lineLengthM,
  pointAlong,
  projectOnLine,
  type LngLat,
} from '../../src/engine/geo';
import { nameSimilarity } from '../../src/engine/text';
import { TOLERANCES } from '../config';
import { GridIndex } from './grid';
import {
  isBusOnly,
  NON_ROAD_HIGHWAYS,
  osmNames,
  osmOneway,
  PEDESTRIAN_HIGHWAYS,
  type OsmWay,
} from './osm';
import type { MatchedWay, OsmMatch, WorkSegment } from './types';

const SAMPLE_STEP_M = 5;
const MIN_NAME_SIMILARITY = 0.5;
/** Entre las vías que cubren el tramo, las que están a esto de la más cercana son la misma calzada. */
const CARRIAGEWAY_SLACK_M = 8;
const MIN_WAY_COVERAGE = 0.2;

function samples(line: readonly LngLat[]): LngLat[] {
  const length = lineLengthM(line);
  const n = Math.max(3, Math.ceil(length / SAMPLE_STEP_M));
  return Array.from({ length: n }, (_, i) => pointAlong(line, ((i + 0.5) / n) * length));
}

/** Vías de OSM separadas en dos índices: las de autos y las peatonales. */
export interface WayIndex {
  drivable: GridIndex<OsmWay>;
  pedestrian: GridIndex<OsmWay>;
}

/** Una calle peatonal o una escalera. Veredas y ciclovías no: suelen llevar el nombre de la avenida. */
const PEDESTRIAN_STREETS = new Set(['pedestrian', 'steps']);

export function buildWayIndex(ways: readonly OsmWay[]): WayIndex {
  const index: WayIndex = {
    drivable: new GridIndex<OsmWay>(),
    pedestrian: new GridIndex<OsmWay>(),
  };
  for (const way of ways) {
    const highway = way.tags.highway;
    if (!highway || NON_ROAD_HIGHWAYS.has(highway) || isBusOnly(way.tags)) continue;
    if (PEDESTRIAN_STREETS.has(highway)) index.pedestrian.add(way, way.line);
    else if (!PEDESTRIAN_HIGHWAYS.has(highway)) index.drivable.add(way, way.line);
  }
  return index;
}

function bearingAt(line: readonly LngLat[], alongM: number): number {
  const length = lineLengthM(line);
  const a = pointAlong(line, Math.max(0, alongM - 5));
  const b = pointAlong(line, Math.min(length, alongM + 5));
  return bearingDeg(a, b);
}

/**
 * Busca primero entre las vías de autos. Las peatonales se miran solo si no hubo par: así una
 * vereda o una ciclovía con el nombre de la avenida no tapa la calzada, pero una calle que se
 * peatonalizó sí se detecta.
 */
export function matchSegment(segment: WorkSegment, index: WayIndex): OsmMatch | undefined {
  return matchIn(segment, index.drivable) ?? matchIn(segment, index.pedestrian);
}

function matchIn(segment: WorkSegment, index: GridIndex<OsmWay>): OsmMatch | undefined {
  if (segment.noName) return undefined;
  const names = [segment.row.official, segment.row.mapName].filter(Boolean);
  const candidates = [...index.near(segment.line, TOLERANCES.osmMatchM)].filter((way) =>
    osmNames(way.tags).some((osmName) =>
      names.some((name) => nameSimilarity(name, osmName) >= MIN_NAME_SIMILARITY),
    ),
  );
  if (candidates.length === 0) return undefined;

  const points = samples(segment.line);
  const covered = new Uint8Array(points.length);
  const length = lineLengthM(segment.line);
  const segmentBearing = bearingAt(segment.line, length / 2);
  const middle = pointAlong(segment.line, length / 2);
  const matched: MatchedWay[] = [];
  for (const way of candidates) {
    let hits = 0;
    let total = 0;
    points.forEach((point, i) => {
      const d = projectOnLine(point, way.line).distanceM;
      if (d <= TOLERANCES.osmMatchM) {
        hits++;
        total += d;
        covered[i] = 1;
      }
    });
    if (hits === 0) continue;
    const wayBearing = bearingAt(way.line, projectOnLine(middle, way.line).alongM);
    const diff = Math.abs(angleDiff(segmentBearing, wayBearing));
    matched.push({
      way,
      coverage: hits / points.length,
      meanDistance: total / hits,
      aligned: diff < 90,
      parallel: diff < 30 || diff > 150,
    });
  }
  const coverage = covered.reduce((sum, c) => sum + c, 0) / points.length;
  if (coverage < TOLERANCES.osmMinCoverage || matched.length === 0) return undefined;
  const closest = Math.min(...matched.map((m) => m.meanDistance));
  const ways = matched.filter(
    (m) => m.coverage >= MIN_WAY_COVERAGE && m.meanDistance <= closest + CARRIAGEWAY_SLACK_M,
  );
  return { ways: ways.length > 0 ? ways : matched, all: matched, coverage };
}

/**
 * Doble mano según todas las calzadas de OSM: en avenidas anchas (centrales y laterales) la
 * calzada más cercana puede ser de una sola mano aunque la avenida tenga las dos.
 */
export function hasBothDirections(match: OsmMatch): boolean {
  const dirs = new Set(
    match.all
      .filter((m) => m.coverage >= 0.3)
      .map((m) => {
        const oneway = osmOneway(m.way.tags);
        if (oneway === null) return 'X';
        if (oneway === 0) return 'D';
        return (oneway === 1) === m.aligned ? 'F' : 'B';
      }),
  );
  return !dirs.has('X') && (dirs.has('D') || (dirs.has('F') && dirs.has('B')));
}

/** Rotondas de OSM: suelen no tener nombre, así que se cruzan solo por geometría. */
export function isOnRoundabout(segment: WorkSegment, roundabouts: GridIndex<OsmWay>): boolean {
  const points = samples(segment.line);
  for (const way of roundabouts.near(segment.line, 10)) {
    const near = points.filter((p) => projectOnLine(p, way.line).distanceM <= 10).length;
    if (near / points.length >= TOLERANCES.osmMinCoverage) return true;
  }
  return false;
}

export interface OsmDirection {
  /** Sentido según OSM respecto de la geometría del tramo; null si es reversible o alternado. */
  dir: Direction | null;
  /** Dos calzadas de mano única opuestas: doble mano confirmada y dividida. */
  divided: boolean;
}

export function osmDirection(match: OsmMatch): OsmDirection {
  const dirs = match.ways.map((m) => {
    const oneway = osmOneway(m.way.tags);
    if (oneway === null) return null;
    if (oneway === 0) return 'D' as const;
    return (oneway === 1) === m.aligned ? ('F' as const) : ('B' as const);
  });
  if (dirs.includes(null)) return { dir: null, divided: false };
  const set = new Set(dirs);
  if (set.has('F') && set.has('B')) return { dir: 'D', divided: true };
  if (set.size === 1) return { dir: dirs[0] ?? null, divided: false };
  // Calzadas que no coinciden: manda la que más cubre el tramo.
  const best = [...match.ways].sort((a, b) => b.coverage - a.coverage)[0];
  const index = best ? match.ways.indexOf(best) : 0;
  return { dir: dirs[index] ?? null, divided: false };
}
