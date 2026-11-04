/**
 * Rumbos porteños (sección 8, paso 9): cada barrio tiene un eje fijo hacia el río y cada sentido cae
 * en uno de cuatro sectores de 90°. Cerca del borde de un sector no se muestra rumbo: "hacia el río"
 * tiene que ser evidente.
 */
import { angleDiff, pointInPolygon, type LngLat } from './geo';

export type Rumbo = 'hacia el río' | 'hacia el centro' | 'hacia el oeste' | 'hacia General Paz';

/** A menos de esto del borde de un sector, no se muestra rumbo. */
const BORDER_DEG = 10;

/** El eje del río del barrio donde cae el punto, si cae en alguno. */
export function riverBearingAt(
  point: LngLat,
  barrios: GeoJSON.FeatureCollection,
): number | undefined {
  for (const { geometry, properties } of barrios.features) {
    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : [];
    if (polygons.some((rings) => pointInPolygon(point, rings as unknown as LngLat[][]))) {
      return (properties as { riverBearing: number }).riverBearing;
    }
  }
  return undefined;
}

/** El sector de un rumbo en grados, según el eje del río del barrio. */
export function rumboOf(bearing: number, riverBearing: number): Rumbo | undefined {
  const off = angleDiff(riverBearing, bearing);
  const size = Math.abs(off);
  // Los bordes están a 45° y a 135° del río.
  if (Math.abs(size - 45) < BORDER_DEG || Math.abs(size - 135) < BORDER_DEG) return undefined;
  if (size < 45) return 'hacia el río';
  if (size > 135) return 'hacia el oeste';
  // Con el río al noreste, el centro queda a su derecha y General Paz a su izquierda.
  return off > 0 ? 'hacia el centro' : 'hacia General Paz';
}
