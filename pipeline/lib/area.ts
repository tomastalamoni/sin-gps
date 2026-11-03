import { ACTIVE_BARRIOS } from '../config';

export type BBox = [west: number, south: number, east: number, north: number];

const ACTIVE = new Set<string>(ACTIVE_BARRIOS);

export function isActiveBarrio(name: string): boolean {
  return ACTIVE.has(name);
}

/** Polígonos de los barrios activos, tal como vienen del GeoJSON de BA Data. */
export function activeBarrioFeatures(
  barrios: GeoJSON.FeatureCollection,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] {
  return barrios.features.filter(
    (f): f is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> =>
      (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
      isActiveBarrio(String(f.properties?.nombre ?? '')),
  );
}

function* positions(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): Generator<GeoJSON.Position> {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) yield* ring;
}

/** Recuadro de los barrios activos, agrandado `marginM` metros para cada lado. */
export function areaBbox(barrios: GeoJSON.FeatureCollection, marginM: number): BBox {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of activeBarrioFeatures(barrios)) {
    for (const [lon = 0, lat = 0] of positions(feature.geometry)) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  if (!Number.isFinite(west)) throw new Error('No encontré los barrios activos en el GeoJSON');
  const dLat = marginM / 110_540;
  const dLon = marginM / (111_320 * Math.cos((((south + north) / 2) * Math.PI) / 180));
  return [west - dLon, south - dLat, east + dLon, north + dLat];
}
