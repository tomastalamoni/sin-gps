import type { Confidence, Direction, RoadKind } from '../../src/engine/data';
import type { LngLat } from '../../src/engine/geo';
import type { OrientationSource } from '../02-numbering';
import type { CallejeroRow } from './callejero';
import type { OsmWay } from './osm';

export type Zone = 'area' | 'border';

/** Un tramo del callejero mientras pasa por el pipeline. */
export interface WorkSegment {
  row: CallejeroRow;
  code: number;
  /** Geometría orientada hacia donde crece la numeración (o como vino, si no hay alturas). */
  line: LngLat[];
  /** Alturas: izquierda inicio, izquierda fin, derecha inicio, derecha fin. */
  heights: [number, number, number, number];
  range: [number, number] | undefined;
  orientation: OrientationSource;
  reversed: boolean;
  /** Sentido respecto de `line`. */
  direction: Direction;
  zone: Zone;
  /** Autopista: se dibuja y se enseña como barrera, pero no entra al grafo. */
  restricted: boolean;
  noName: boolean;
  kind: RoadKind;
  flags: number;
  osm?: OsmMatch;
  confidence?: Confidence;
}

export interface MatchedWay {
  way: OsmWay;
  /** Proporción del tramo a menos de 30 m de la vía. */
  coverage: number;
  /** Distancia media del tramo a la vía. */
  meanDistance: number;
  /** La vía va en el mismo sentido que la geometría del tramo. */
  aligned: boolean;
  /** La vía corre paralela al tramo (menos de 30° de diferencia, en un sentido o en el otro). */
  parallel: boolean;
}

export interface OsmMatch {
  /** Las vías más cercanas que cubren el tramo (una calzada, o las dos si es una avenida dividida). */
  ways: MatchedWay[];
  /** Todas las vías con nombre parecido a menos de 30 m, también las calzadas más lejanas. */
  all: MatchedWay[];
  coverage: number;
}
