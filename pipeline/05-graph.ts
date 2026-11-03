/**
 * Paso 6 · Armar el grafo:
 * - los nodos son los extremos de tramos que coinciden (1 m); si el extremo de un tramo cae a
 *   menos de 1 m del medio de otro, ese otro se parte ahí;
 * - nunca se crean nodos donde dos líneas solo se cruzan, ni se parten tramos que OSM pone en
 *   distinto nivel (puente, túnel o layer);
 * - las vías de acceso restringido quedan afuera del grafo, como barreras;
 * - se marcan las rotondas.
 */
import { booleanPointInPolygon, point } from '@turf/turf';
import { SegmentFlag } from '../src/engine/data';
import { distanceM, lineLengthM, projectOnLine, type LngLat } from '../src/engine/geo';
import { TOLERANCES } from './config';
import type { CallejeroRow } from './lib/callejero';
import { GridIndex } from './lib/grid';
import { isPrivateAccess, osmLayer, PEDESTRIAN_HIGHWAYS, type OsmWay } from './lib/osm';
import { buildWayIndex, isOnRoundabout, matchSegment } from './lib/osm-match';
import type { WorkSegment } from './lib/types';

/** Un tramo del grafo: un WorkSegment (o un pedazo, si se partió) con sus dos nodos. */
export interface GraphSegment extends WorkSegment {
  from: number;
  to: number;
  layer: number;
}

export interface GraphBuild {
  segments: GraphSegment[];
  nodes: LngLat[];
  outside: Set<number>;
  /**
   * Esquinas reales: nodos que en el callejero completo toca otra calle, aunque esa calle no esté
   * en el grafo (peatonal, autopista, fuera del área). Ahí sí puede cambiar el sentido.
   */
  junctions: Set<number>;
  /** Autopistas y ramas: se dibujan y se enseñan como barreras. */
  barriers: WorkSegment[];
  stats: {
    tSplits: number;
    tSplitsSkippedByLayer: number;
    mixedLayerNodes: number;
    osmPedestrian: WorkSegment[];
    osmPrivate: WorkSegment[];
    osmMotorway: number;
    matched: number;
  };
}

const MOTORWAYS = new Set(['motorway', 'motorway_link']);

function majorityLayer(segment: WorkSegment): number {
  const layers = (segment.osm?.ways ?? []).map((m) => osmLayer(m.way.tags));
  if (layers.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const layer of layers) counts.set(layer, (counts.get(layer) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** Corta una línea en las distancias dadas (en metros desde el comienzo). */
export function cutLine(line: readonly LngLat[], cuts: readonly number[]): LngLat[][] {
  const pieces: LngLat[][] = [];
  let current: LngLat[] = [line[0] as LngLat];
  let walked = 0;
  let next = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as LngLat;
    const b = line[i] as LngLat;
    const step = distanceM(a, b);
    while (next < cuts.length && (cuts[next] ?? Infinity) < walked + step) {
      const t = ((cuts[next] ?? 0) - walked) / step;
      const p: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      current.push(p);
      pieces.push(current);
      current = [p];
      next++;
    }
    current.push(b);
    walked += step;
  }
  pieces.push(current);
  return pieces.filter((piece) => lineLengthM(piece) > 0.05);
}

function interpolateHeights(
  heights: readonly number[],
  t0: number,
  t1: number,
): [number, number, number, number] {
  const at = (from: number, to: number, t: number) =>
    from > 0 && to > 0 ? Math.round(from + (to - from) * t) : 0;
  const [lf = 0, lt = 0, rf = 0, rt = 0] = heights;
  return [at(lf, lt, t0), at(lf, lt, t1), at(rf, rt, t0), at(rf, rt, t1)];
}

export function buildGraph(
  segments: readonly WorkSegment[],
  osmWays: readonly OsmWay[],
  zone: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  allRows: readonly CallejeroRow[],
): GraphBuild {
  const stats: GraphBuild['stats'] = {
    tSplits: 0,
    tSplitsSkippedByLayer: 0,
    mixedLayerNodes: 0,
    osmPedestrian: [],
    osmPrivate: [],
    osmMotorway: 0,
    matched: 0,
  };

  // Cruce geométrico con OSM: nivel, peatonales, privadas, autopistas y rotondas.
  const wayIndex = buildWayIndex(osmWays);
  const roundabouts = new GridIndex<OsmWay>();
  for (const way of osmWays) {
    if (way.tags.junction === 'roundabout' || way.tags.junction === 'circular')
      roundabouts.add(way, way.line);
  }
  const drivable: WorkSegment[] = [];
  const barriers: WorkSegment[] = [];
  for (const segment of segments) {
    const match = matchSegment(segment, wayIndex);
    if (match) {
      segment.osm = match;
      stats.matched++;
    }
    const ways = match?.ways.map((m) => m.way) ?? [];
    // Las autopistas del callejero son barrera siempre, diga lo que diga OSM sobre su acceso.
    if (segment.restricted) {
      barriers.push(segment);
      continue;
    }
    if (ways.length > 0 && ways.every((w) => PEDESTRIAN_HIGHWAYS.has(w.tags.highway ?? ''))) {
      stats.osmPedestrian.push(segment);
      continue;
    }
    if (ways.length > 0 && ways.every((w) => isPrivateAccess(w.tags))) {
      stats.osmPrivate.push(segment);
      continue;
    }
    // Una colectora corre pegada a la autopista y se cruza con ella por el nombre, pero es una calle.
    const collector = segment.row.official.startsWith('COLECTORA');
    if (!collector && ways.length > 0 && ways.every((w) => MOTORWAYS.has(w.tags.highway ?? ''))) {
      segment.restricted = true;
      stats.osmMotorway++;
    }
    if (isOnRoundabout(segment, roundabouts)) segment.flags |= SegmentFlag.roundabout;
    if (segment.restricted) barriers.push(segment);
    else drivable.push(segment);
  }

  // Uniones en T: el extremo de un tramo sobre el medio de otro lo parte, si están al mismo nivel.
  const layers = new Map(drivable.map((s) => [s, majorityLayer(s)]));
  const index = new GridIndex<WorkSegment>();
  for (const segment of drivable) index.add(segment, segment.line);
  const cuts = new Map<WorkSegment, number[]>();
  for (const owner of drivable) {
    for (const end of [owner.line[0] as LngLat, owner.line[owner.line.length - 1] as LngLat]) {
      for (const other of index.near([end], TOLERANCES.nodeM)) {
        if (other === owner) continue;
        const projection = projectOnLine(end, other.line);
        const length = lineLengthM(other.line);
        if (projection.distanceM > TOLERANCES.nodeM) continue;
        if (projection.alongM <= TOLERANCES.nodeM || projection.alongM >= length - TOLERANCES.nodeM)
          continue;
        if (layers.get(owner) !== layers.get(other)) {
          stats.tSplitsSkippedByLayer++;
          continue;
        }
        const list = cuts.get(other);
        if (list) list.push(projection.alongM);
        else cuts.set(other, [projection.alongM]);
      }
    }
  }

  const pieces: (WorkSegment & { layer: number })[] = [];
  for (const segment of drivable) {
    const layer = layers.get(segment) ?? 0;
    const list = [...new Set((cuts.get(segment) ?? []).map((c) => Math.round(c * 100) / 100))].sort(
      (a, b) => a - b,
    );
    if (list.length === 0) {
      pieces.push({ ...segment, layer });
      continue;
    }
    stats.tSplits += list.length;
    const total = lineLengthM(segment.line);
    let walked = 0;
    for (const line of cutLine(segment.line, list)) {
      const length = lineLengthM(line);
      const heights = interpolateHeights(
        segment.heights,
        walked / total,
        (walked + length) / total,
      );
      walked += length;
      const values = heights.filter((h) => h > 0);
      pieces.push({
        ...segment,
        line,
        heights,
        range: values.length > 0 ? [Math.min(...values), Math.max(...values)] : undefined,
        layer,
      });
    }
  }

  // Nodos: extremos a menos de 1 m son el mismo nodo.
  const nodes: LngLat[] = [];
  const nodeLayers: Set<number>[] = [];
  const nodeIndex = new GridIndex<number>();
  const nodeFor = (p: LngLat, layer: number): number => {
    for (const candidate of nodeIndex.near([p], TOLERANCES.nodeM)) {
      if (distanceM(nodes[candidate] as LngLat, p) <= TOLERANCES.nodeM) {
        nodeLayers[candidate]?.add(layer);
        return candidate;
      }
    }
    nodes.push(p);
    nodeLayers.push(new Set([layer]));
    nodeIndex.add(nodes.length - 1, [p]);
    return nodes.length - 1;
  };
  const graphSegments: GraphSegment[] = pieces.map((piece) => ({
    ...piece,
    from: nodeFor(piece.line[0] as LngLat, piece.layer),
    to: nodeFor(piece.line[piece.line.length - 1] as LngLat, piece.layer),
  }));
  stats.mixedLayerNodes = nodeLayers.filter((set) => set.size > 1).length;

  const outside = new Set<number>();
  nodes.forEach((p, n) => {
    if (!booleanPointInPolygon(point([p[0], p[1]]), zone)) outside.add(n);
  });

  for (const segment of graphSegments) {
    if (segment.layer > 0) segment.flags |= SegmentFlag.bridge;
    if (segment.layer < 0) segment.flags |= SegmentFlag.tunnel;
  }

  const endpoints = new GridIndex<CallejeroRow>();
  for (const row of allRows) {
    endpoints.add(row, [row.line[0] as LngLat]);
    endpoints.add(row, [row.line[row.line.length - 1] as LngLat]);
  }
  // Esquina real: la toca otra calle, o un tramo que no está en el grafo (por ejemplo, la General
  // Paz, cuya autopista y colectoras comparten código).
  const inGraph = new Set(pieces.map((p) => p.row.id));
  const junctions = new Set<number>();
  nodes.forEach((p, n) => {
    const codes = new Set<number>();
    let outsider = false;
    for (const row of endpoints.near([p], TOLERANCES.nodeM)) {
      const ends = [row.line[0] as LngLat, row.line[row.line.length - 1] as LngLat];
      if (!ends.some((e) => distanceM(e, p) <= TOLERANCES.nodeM)) continue;
      codes.add(row.code);
      if (!inGraph.has(row.id)) outsider = true;
    }
    if (codes.size > 1 || outsider) junctions.add(n);
  });

  return {
    segments: graphSegments.filter((s) => s.from !== s.to),
    nodes,
    outside,
    junctions,
    barriers,
    stats,
  };
}
