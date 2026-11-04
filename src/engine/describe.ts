/**
 * Textos de la ficha de calle, a partir de los datos.
 */
import type { Confidence, DirectionStretch } from './data';
import { bearingDeg, lineLengthM, pointAlong, type LngLat } from './geo';
import type { RoadGraph } from './graph';
import { riverBearingAt, rumboOf } from './rumbos';

export const CONFIDENCE_TEXT: Record<Confidence, string> = {
  confirmado: 'Confirmado',
  'sin-par': 'Sin confirmar: no está en OSM',
  'en-duda': 'En duda: las fuentes no coinciden',
  inferida: 'Orientación inferida',
};

export function trustText(stretch: DirectionStretch): string {
  return stretch.corrected ? 'Corregido por vos' : CONFIDENCE_TEXT[stretch.confidence];
}

/** "AVENIDA" → "Avenida", "VÍA LOCAL" → "Vía local". */
export function sentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase('es');
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
}

/** Las alturas de un tramo de sentido, que están en su ID. */
export function stretchHeights(stretch: DirectionStretch): string {
  const match = /:(\d+)-(\d+)/.exec(stretch.id);
  return match ? `${match[1] ?? ''} a ${match[2] ?? ''}` : 'Sin alturas';
}

/** El rumbo en que se circula por un tramo de sentido, medido en su cuadra más larga. */
function travelOf(graph: RoadGraph, stretch: DirectionStretch) {
  const longest = [...stretch.segments].sort(
    (a, b) => (graph.lengths[b] ?? 0) - (graph.lengths[a] ?? 0),
  )[0];
  if (longest === undefined) return undefined;
  const segment = graph.segment(longest);
  if (segment.dir === 'D') return undefined;
  const line = segment.geometry;
  const bearing = bearingDeg(line[0] as LngLat, line[line.length - 1] as LngLat);
  return {
    bearing: segment.dir === 'B' ? (bearing + 180) % 360 : bearing,
    middle: pointAlong(line, lineLengthM(line) / 2),
  };
}

export function directionText(
  graph: RoadGraph,
  barrios: GeoJSON.FeatureCollection,
  stretch: DirectionStretch,
): string {
  if (stretch.dir === 'D') {
    return stretch.splitCarriageway ? 'Doble mano, con calzadas separadas' : 'Doble mano';
  }
  const travel = travelOf(graph, stretch);
  const river = travel && riverBearingAt(travel.middle, barrios);
  const rumbo = travel && river !== undefined ? rumboOf(travel.bearing, river) : undefined;
  if (rumbo) return `Mano única ${rumbo}`;
  if (!/:\d+-\d+/.test(stretch.id)) return 'Mano única';
  return stretch.dir === 'F'
    ? 'Mano única, hacia donde crece la numeración'
    : 'Mano única, hacia donde baja la numeración';
}

/** Un punto de la calle para abrir Street View: el medio de su cuadra más larga. */
export function pointOfStreet(graph: RoadGraph, segments: readonly number[]): LngLat | undefined {
  const longest = [...segments].sort(
    (a, b) => (graph.lengths[b] ?? 0) - (graph.lengths[a] ?? 0),
  )[0];
  if (longest === undefined) return undefined;
  const line = graph.segment(longest).geometry;
  return pointAlong(line, lineLengthM(line) / 2);
}

/** El recuadro de una calle, para encuadrarla en el mapa. */
export function boundsOfStreet(graph: RoadGraph, segments: readonly number[]): [LngLat, LngLat] {
  const points = segments.flatMap((t) => [...graph.segment(t).geometry]);
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** El tramo de la calle más cercano a un toque, entre los que tocó. */
export function nearestSegment(
  graph: RoadGraph,
  point: LngLat,
  segments: readonly number[],
): number | undefined {
  const nearby = graph.nearestSegments(point, 200);
  return nearby.find((x) => segments.includes(x.segment))?.segment;
}

/** Abre Street View en un punto (la app de Google Maps, si está instalada). */
export function streetViewUrl([lng, lat]: LngLat): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
