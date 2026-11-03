/**
 * Vías del tren y sus cruces (sección 4.10 y paso 9). Los cruces salen de OSM (puente, túnel o paso
 * a nivel) y el campo tipo_ffcc del callejero queda como fuente secundaria. Bajo un viaducto, las
 * vías no son barrera.
 */
import { lineIntersect, lineString, simplify } from '@turf/turf';
import { encodeLine, SegmentFlag, type RailCrossing, type RailLine } from '../../src/engine/data';
import { distanceM, type LngLat } from '../../src/engine/geo';
import { slugify } from '../../src/engine/ids';
import { normalizeName } from '../../src/engine/text';
import type { GraphSegment } from '../05-graph';
import { GridIndex } from './grid';
import { osmLayer, type OsmNode, type OsmWay } from './osm';

const LEVEL_CROSSING_M = 25;
const DEDUPE_M = 30;

const KNOWN_LINES = [
  'Mitre',
  'San Martín',
  'Belgrano',
  'Belgrano Norte',
  'Belgrano Sur',
  'Urquiza',
  'Roca',
  'Sarmiento',
];

/**
 * "FC Mitre" y "Mitre" son la misma línea. Lo que no es una línea (playas, empalmes, puentes con
 * nombre propio) queda sin nombre: se dibuja, pero no se le cuentan cruces.
 */
function lineName(raw: string | undefined): string | undefined {
  const bare = (raw ?? '').replace(/^(fc|f\.c\.|ferrocarril)\s+/i, '').trim();
  const known = KNOWN_LINES.find((line) => normalizeName(line) === normalizeName(bare));
  return known ? `FC ${known}` : undefined;
}

function fromCallejero(rail: string): RailCrossing['kind'] | undefined {
  if (/elevado/i.test(rail)) return 'viaducto';
  if (/hundido|puente vehicular/i.test(rail)) return 'puente';
  if (/t[uú]nel/i.test(rail)) return 'tunel';
  if (/paso a nivel/i.test(rail)) return 'nivel';
  return undefined;
}

export interface RailBuild {
  lines: RailLine[];
  /** Vías sin nombre (playas de maniobras): solo para dibujar. */
  unnamed: number[][];
  crossings: number;
}

export function buildRail(
  railWays: readonly OsmWay[],
  osmNodes: readonly OsmNode[],
  segments: readonly GraphSegment[],
): RailBuild {
  const levelCrossings = new GridIndex<LngLat>();
  for (const node of osmNodes) {
    if (node.tags.railway === 'level_crossing') levelCrossings.add(node.point, [node.point]);
  }
  const railIndex = new GridIndex<OsmWay>();
  for (const way of railWays) railIndex.add(way, way.line);

  const groups = new Map<string, { names: string[]; ways: OsmWay[]; crossings: RailCrossing[] }>();
  const unnamed: number[][] = [];
  for (const way of railWays) {
    const name = lineName(way.tags.name);
    const simplified = simplify(lineString(way.line.map(([lng, lat]) => [lng, lat])), {
      tolerance: 0.00002,
    }).geometry.coordinates.map(([lng = 0, lat = 0]): LngLat => [lng, lat]);
    if (!name) {
      unnamed.push(encodeLine(simplified));
      continue;
    }
    const key = slugify(name);
    const group = groups.get(key) ?? { names: [], ways: [], crossings: [] };
    group.names.push(name);

    group.ways.push({ ...way, line: simplified });
    groups.set(key, group);
  }

  let crossings = 0;
  for (const segment of segments) {
    for (const way of railIndex.near(segment.line, 0)) {
      const name = lineName(way.tags.name);
      if (!name) continue;
      const group = groups.get(slugify(name));
      if (!group) continue;
      const hits = lineIntersect(
        lineString(segment.line.map(([lng, lat]) => [lng, lat])),
        lineString(way.line.map(([lng, lat]) => [lng, lat])),
      ).features;
      for (const hit of hits) {
        const [lng = 0, lat = 0] = hit.geometry.coordinates;
        const point: LngLat = [lng, lat];
        const railLayer = osmLayer(way.tags);
        const railBridge = way.tags.bridge && way.tags.bridge !== 'no';
        let kind: RailCrossing['kind'];
        if (segment.layer < 0 && railLayer >= 0) kind = 'tunel';
        else if (railBridge || railLayer > segment.layer) kind = 'viaducto';
        else if (segment.layer > railLayer) kind = 'puente';
        else {
          const nearLevel = [...levelCrossings.near([point], LEVEL_CROSSING_M)].some(
            (p) => distanceM(p, point) <= LEVEL_CROSSING_M,
          );
          kind = nearLevel ? 'nivel' : (fromCallejero(segment.row.rail) ?? 'nivel');
        }
        if (kind === 'viaducto') segment.flags |= SegmentFlag.underViaduct;
        const duplicate = group.crossings.some(
          (c) => c.street === segment.code && distanceM([c.lng, c.lat], point) < DEDUPE_M,
        );
        if (duplicate) continue;
        group.crossings.push({
          street: segment.code,
          kind,
          lng: Math.round(lng * 1e6) / 1e6,
          lat: Math.round(lat * 1e6) / 1e6,
        });
        crossings++;
      }
    }
  }

  const lines: RailLine[] = [...groups.entries()].map(([slug, group]) => ({
    slug,
    name: [...group.names].sort((a, b) => b.length - a.length)[0] ?? slug,
    geometry: group.ways.map((w) => encodeLine(w.line)),
    crossings: group.crossings,
  }));
  return { lines, unnamed, crossings };
}
