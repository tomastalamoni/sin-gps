/** Los barrios del área, a partir de public/data/barrios.json. */
import { distanceM, pointInPolygon, type LngLat } from './geo';

export interface BarrioInfo {
  /** ID de la tarjeta (Z:barrio). */
  id: string;
  /** Como viene en el callejero: así lo nombran las calles. */
  name: string;
  /** Como se muestra. */
  display: string;
  center: LngLat;
  bounds: [LngLat, LngLat];
  polygons: LngLat[][][];
}

interface BarrioProperties {
  id: string;
  name: string;
  display: string;
}

function polygonsOf(geometry: GeoJSON.Geometry): LngLat[][][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as unknown as LngLat[][]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as unknown as LngLat[][][];
  return [];
}

export function barrioInfos(barrios: GeoJSON.FeatureCollection): BarrioInfo[] {
  return barrios.features.map(({ geometry, properties }) => {
    const { id, name, display } = properties as BarrioProperties;
    const polygons = polygonsOf(geometry);
    const points = polygons.flatMap((rings) => rings[0] ?? []);
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    return {
      id,
      name,
      display,
      center: [(west + east) / 2, (south + north) / 2],
      bounds: [
        [west, south],
        [east, north],
      ],
      polygons,
    };
  });
}

export function barrioAt(point: LngLat, barrios: readonly BarrioInfo[]): BarrioInfo | undefined {
  return barrios.find((b) => b.polygons.some((rings) => pointInPolygon(point, rings)));
}

/** Los barrios, empezando por `from` y siguiendo por los más cercanos. */
export function barriosByDistance(
  from: BarrioInfo,
  barrios: readonly BarrioInfo[],
): readonly BarrioInfo[] {
  return [...barrios].sort(
    (a, b) =>
      distanceM(a.center, from.center) - distanceM(b.center, from.center) ||
      a.id.localeCompare(b.id),
  );
}
