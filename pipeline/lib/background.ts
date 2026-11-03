/**
 * Fondo del mapa (sección 9, capa 1): agua, parques y el río, más el eje del río de cada barrio
 * para los rumbos porteños (sección 8, paso 9).
 */
import {
  area as turfArea,
  bbox as turfBbox,
  bboxClip,
  centroid,
  lineString,
  polygon,
  simplify,
} from '@turf/turf';
import { bearingDeg, distanceM, projectOnLine, type LngLat } from '../../src/engine/geo';
import type { BBox } from './area';
import type { OsmRelation, OsmWay } from './osm';

const MIN_AREA_M2 = 500;

function samePoint(a: LngLat | undefined, b: LngLat | undefined): boolean {
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1];
}

/** Une líneas por sus extremos hasta formar anillos cerrados (miembros de una multipolígono). */
export function assembleRings(lines: readonly LngLat[][]): LngLat[][] {
  const pending = lines.filter((l) => l.length >= 2).map((l) => [...l]);
  const rings: LngLat[][] = [];
  while (pending.length > 0) {
    let ring = pending.shift() as LngLat[];
    let extended = true;
    while (!samePoint(ring[0], ring[ring.length - 1]) && extended) {
      extended = false;
      for (let i = 0; i < pending.length; i++) {
        const line = pending[i] as LngLat[];
        const end = ring[ring.length - 1];
        if (samePoint(end, line[0])) ring = [...ring, ...line.slice(1)];
        else if (samePoint(end, line[line.length - 1]))
          ring = [...ring, ...[...line].reverse().slice(1)];
        else continue;
        pending.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (samePoint(ring[0], ring[ring.length - 1]) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function round(line: readonly LngLat[]): number[][] {
  return line.map(([lng, lat]) => [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]);
}

function toFeature(
  ring: LngLat[],
  kind: string,
  name?: string,
): GeoJSON.Feature<GeoJSON.Polygon> | undefined {
  const poly = polygon([round(ring)]);
  if (turfArea(poly) < MIN_AREA_M2) return undefined;
  const simplified = simplify(poly, { tolerance: 0.00001 });
  simplified.properties = { kind, ...(name ? { name } : {}) };
  return simplified;
}

/** Une los tramos de costa en cadenas continuas. */
export function coastChains(coast: readonly OsmWay[]): LngLat[][] {
  const pending = coast.map((w) => [...w.line]);
  const chains: LngLat[][] = [];
  while (pending.length > 0) {
    let chain = pending.shift() as LngLat[];
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < pending.length; i++) {
        const line = pending[i] as LngLat[];
        if (samePoint(chain[chain.length - 1], line[0])) chain = [...chain, ...line.slice(1)];
        else if (samePoint(line[line.length - 1], chain[0])) chain = [...line, ...chain.slice(1)];
        else continue;
        pending.splice(i, 1);
        extended = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

/** Posición sobre el perímetro del recuadro, en sentido horario desde la esquina noroeste. */
function perimeterPosition([w, s, e, n]: BBox, [x, y]: LngLat): number {
  const width = e - w;
  const height = n - s;
  const eps = 1e-9;
  if (Math.abs(y - n) < eps) return x - w;
  if (Math.abs(x - e) < eps) return width + (n - y);
  if (Math.abs(y - s) < eps) return width + height + (e - x);
  return 2 * width + height + (y - s);
}

/**
 * El río: en OSM la costa deja la tierra a la izquierda y el agua a la derecha. Cada tramo de costa
 * que cruza el recuadro se cierra por el borde en sentido horario, del lado del agua.
 */
export function riverPolygons(
  chains: readonly LngLat[][],
  box: BBox,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const [w, s, e, n] = box;
  const corners: [number, LngLat][] = [
    [0, [w, n]],
    [e - w, [e, n]],
    [e - w + (n - s), [e, s]],
    [2 * (e - w) + (n - s), [w, s]],
  ];
  const perimeter = 2 * (e - w + (n - s));
  const out: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const chain of chains) {
    if (chain.length < 2) continue;
    const clipped = bboxClip(lineString(chain.map(([lng, lat]) => [lng, lat])), box).geometry;
    const pieces = clipped.type === 'LineString' ? [clipped.coordinates] : clipped.coordinates;
    for (const raw of pieces) {
      const piece = raw.map(([lng = 0, lat = 0]) => [lng, lat] as LngLat);
      if (piece.length < 2) continue;
      const start = piece[0] as LngLat;
      const end = piece[piece.length - 1] as LngLat;
      const onEdge = (p: LngLat) =>
        [Math.abs(p[0] - w), Math.abs(p[0] - e), Math.abs(p[1] - s), Math.abs(p[1] - n)].some(
          (d) => d < 1e-9,
        );
      if (!onEdge(start) || !onEdge(end)) continue;
      const from = perimeterPosition(box, end);
      const to = perimeterPosition(box, start);
      const walk = (to - from + perimeter) % perimeter;
      const ring: LngLat[] = [...piece];
      for (const [position, corner] of [
        ...corners,
        ...corners.map(([p, c]) => [p + perimeter, c] as [number, LngLat]),
      ]) {
        const offset = position - from;
        if (offset > 0 && offset < walk) ring.push(corner);
      }
      ring.push(start);
      const feature = toFeature(ring, 'agua', 'Río de la Plata');
      if (feature) out.push(feature);
    }
  }
  return out;
}

export function areaPolygons(
  ways: readonly OsmWay[],
  relations: readonly OsmRelation[],
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const kindOf = (tags: Record<string, string>) =>
    tags.natural === 'water' ? 'agua' : tags.leisure ? 'parque' : undefined;
  const out: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const way of ways) {
    const kind = kindOf(way.tags);
    if (!kind || !samePoint(way.line[0], way.line[way.line.length - 1])) continue;
    const feature = toFeature(way.line, kind, way.tags.name);
    if (feature) out.push(feature);
  }
  for (const relation of relations) {
    const kind = kindOf(relation.tags);
    if (!kind) continue;
    const outer = relation.members
      .filter((m) => m.role !== 'inner' && m.line)
      .map((m) => m.line as LngLat[]);
    for (const ring of assembleRings(outer)) {
      const feature = toFeature(ring, kind, relation.tags.name);
      if (feature) out.push(feature);
    }
  }
  return out;
}

/**
 * Eje del río de cada barrio: la dirección general de la costa cercana (las dársenas del puerto se
 * compensan al promediar), girada 90° hacia el agua. En OSM la costa deja el agua a la derecha.
 */
export function riverBearing(
  barrio: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  chains: readonly LngLat[][],
): number {
  const [lng = 0, lat = 0] = centroid(barrio).geometry.coordinates;
  const center: LngLat = [lng, lat];
  for (const radius of [6000, 12_000, 25_000]) {
    let x = 0;
    let y = 0;
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1] as LngLat;
        const b = chain[i] as LngLat;
        if (projectOnLine(center, [a, b]).distanceM > radius) continue;
        const length = distanceM(a, b);
        const bearing = (bearingDeg(a, b) * Math.PI) / 180;
        x += Math.sin(bearing) * length;
        y += Math.cos(bearing) * length;
      }
    }
    if (x !== 0 || y !== 0) {
      const coast = (Math.atan2(x, y) * 180) / Math.PI;
      return Math.round((coast + 90 + 360) % 360);
    }
  }
  return 0;
}

export function featureBbox(feature: GeoJSON.Feature): BBox {
  const [w = 0, s = 0, e = 0, n = 0] = turfBbox(feature);
  return [w, s, e, n];
}
