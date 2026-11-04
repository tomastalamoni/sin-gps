/** Cómo se interpreta un toque sobre el mapa (sección 4, "Tocar el mapa"). */
import { distanceM, type LngLat } from '../geo';
import type { TapPlaceQuestion } from './types';

/** Cuenta la calle más cercana al toque, dentro de este radio. */
export const TAP_RADIUS_PX = 14;
/** Si la segunda queda a menos de esto de la primera, hay que tocar de nuevo. */
const TAP_TIE_PX = 4;
/** Una cuadra porteña, para saber a qué zoom las paralelas se separan lo suficiente. */
const BLOCK_M = 100;
const MIN_PARALLEL_PX = 40;
/** Metros por píxel en el ecuador con zoom 0 (MapLibre usa teselas de 512 px). */
const METERS_PER_PX_AT_ZOOM_0 = 78_271.517;

export interface TapCandidate {
  street: number;
  distancePx: number;
}

export type TapResult =
  | { kind: 'street'; street: number }
  /** Quedó entre dos calles: no se califica. */
  | { kind: 'again' }
  | { kind: 'none' };

export function resolveTap(candidates: readonly TapCandidate[]): TapResult {
  const nearest = new Map<number, number>();
  for (const { street, distancePx } of candidates) {
    if (!(distancePx <= TAP_RADIUS_PX)) continue;
    nearest.set(street, Math.min(distancePx, nearest.get(street) ?? Infinity));
  }
  const [first, second] = [...nearest].sort((a, b) => a[1] - b[1]);
  if (!first) return { kind: 'none' };
  if (second && second[1] - first[1] < TAP_TIE_PX) return { kind: 'again' };
  return { kind: 'street', street: first[0] };
}

/** Solo se aceptan toques con un zoom en el que las paralelas quedan a 40 px o más. */
export function minAnswerZoom(lat: number): number {
  const metersPerPx = BLOCK_M / MIN_PARALLEL_PX;
  return Math.log2((METERS_PER_PX_AT_ZOOM_0 * Math.cos((lat * Math.PI) / 180)) / metersPerPx);
}

export function isPlaceHit(question: TapPlaceQuestion, point: LngLat): boolean {
  if (distanceM(point, question.point) <= question.radiusM) return true;
  if (!question.bbox) return false;
  const [west, south, east, north] = question.bbox;
  return point[0] >= west && point[0] <= east && point[1] >= south && point[1] <= north;
}
