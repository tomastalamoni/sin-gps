/**
 * Formato de los archivos de public/data: el pipeline los escribe y la app los lee.
 * Las coordenadas van en millonésimas de grado (enteros), para que los archivos pesen poco.
 */
import type { LngLat } from './geo';

/** Sube cuando cambia el formato; la app rechaza datos de un formato que no conoce. */
export const DATA_FORMAT = 1;

/**
 * Sentido de circulación respecto de la geometría del tramo, que siempre va hacia donde crece
 * la numeración (o como está dibujado, si el tramo no tiene alturas).
 * F: a favor de la geometría · B: en contra · D: doble mano.
 */
export type Direction = 'F' | 'B' | 'D';

/** Estados de confianza de la sección 8. "Corregido por vos" vive solo en el celu. */
export type Confidence = 'confirmado' | 'sin-par' | 'en-duda' | 'inferida';

export const CONFIDENCE_BY_CODE = {
  c: 'confirmado',
  s: 'sin-par',
  d: 'en-duda',
  i: 'inferida',
} as const satisfies Record<string, Confidence>;

export type ConfidenceCode = keyof typeof CONFIDENCE_BY_CODE;

export function confidenceCode(confidence: Confidence): ConfidenceCode {
  const entry = Object.entries(CONFIDENCE_BY_CODE).find(([, value]) => value === confidence);
  return (entry?.[0] ?? 'd') as ConfidenceCode;
}

/** Nunca se pregunta por un tramo en duda o con orientación inferida. */
export function isAskableConfidence(confidence: Confidence): boolean {
  return confidence === 'confirmado' || confidence === 'sin-par';
}

/** Marcas de cada tramo, como bits. */
export const SegmentFlag = {
  /** Zona de borde: se maneja, pero nunca se pregunta ni es origen o destino. */
  border: 1,
  /** Avenida con calzadas separadas según OSM (dos manos únicas opuestas). */
  divided: 2,
  roundabout: 4,
  /** Sin nombre oficial: nunca se pregunta por su nombre. */
  noName: 8,
  /** Bajo un viaducto del tren: ahí las vías no son barrera. */
  underViaduct: 16,
  bridge: 32,
  tunnel: 64,
} as const;

/** Tipo de vía para el costo del router: c calle, a avenida, p pasaje. */
export type RoadKind = 'c' | 'a' | 'p';

export interface SegmentsFile {
  format: number;
  version: string;
  /** Código de calle de cada tramo. */
  street: number[];
  /** Nodo al comienzo y al final de la geometría. */
  from: number[];
  to: number[];
  /** Un carácter por tramo (ver Direction). */
  dir: string;
  /** Un carácter por tramo (ver CONFIDENCE_BY_CODE). */
  conf: string;
  /** Un carácter por tramo (ver RoadKind). */
  kind: string;
  /** De a 4 por tramo: izquierda inicio, izquierda fin, derecha inicio, derecha fin (0 = sin altura). */
  heights: number[];
  flags: number[];
  /** La otra calzada de la misma calle (calzadas separadas) o -1. */
  pair: number[];
  /** Por tramo: [lng0, lat0, dlng1, dlat1, …] en millonésimas de grado. */
  geometry: number[][];
}

export interface GraphFile {
  format: number;
  version: string;
  /** lng, lat de cada nodo, en millonésimas de grado. */
  nodes: number[];
  /** Nodos "fuera del área": la calle sigue, pero el juego termina ahí. */
  outside: number[];
  /** Nodos con semáforo (sin contar los peatonales). */
  signals: number[];
  /** De a 4: tramo de llegada, nodo, tramo de salida y tipo (0 prohibido, 1 obligatorio). */
  restrictions: number[];
  /** De a 2: tramo de llegada y nodo donde OSM marca un carril de giro a la izquierda. */
  leftTurnLanes: number[];
  /**
   * Nodos donde se tocan solo dos tramos de la misma calle pero llega otra que no está en el grafo
   * (peatonal, autopista): son esquinas reales, ahí el sentido sí puede cambiar.
   */
  junctions: number[];
}

export interface StreetCrossing {
  street: number;
  node: number;
  /** Altura aproximada de la calle en ese cruce (0 si no tiene alturas). */
  height: number;
}

export interface DirectionStretch {
  /** ID de la tarjeta de sentido (S:código:alturas). */
  id: string;
  segments: number[];
  /** Respecto de la numeración: F hacia donde crece, B al revés, D doble mano. */
  dir: Direction;
  /** El estado de confianza más débil de sus tramos. */
  confidence: Confidence;
  /** Se puede preguntar: todos sus tramos son confiables y están fuera de la zona de borde. */
  askable: boolean;
  /** Se pregunta junto con la otra calzada como "doble mano (calzadas separadas)". */
  splitCarriageway: boolean;
  /** Código de la calle donde termina el tramo porque cambia el sentido. */
  changesAt?: number;
}

export interface StreetRecord {
  code: number;
  official: string;
  name: string;
  short: string;
  aliases: string[];
  previous?: string;
  type: string;
  hierarchy: string;
  /** Nivel del currículo (sección 3): 1 troncales … 5 pasajes. */
  level: number;
  barrios: string[];
  /** Se puede preguntar por su nombre. */
  askable: boolean;
  /** Cuánto se usa en rutas simuladas, de 0 a 1. */
  importance: number;
  /** Tramos de la calle dentro del área y el borde, en el orden de la numeración. */
  segments: number[];
  /** Dónde arranca la numeración, calculado con el callejero completo. */
  numbering?: {
    start: number;
    end: number;
    /** Calles que cruzan donde arranca. */
    startCross: number[];
    /** Nombres de esas calles, por si quedan fuera del área. */
    startCrossNames: string[];
    startInArea: boolean;
  };
  crossings: StreetCrossing[];
  stretches: DirectionStretch[];
}

export interface StreetsFile {
  format: number;
  version: string;
  streets: StreetRecord[];
}

/** Paralelas vecinas que alternan sentido: cada una va al revés que la anterior. */
export interface DirectionPattern {
  /** Las paralelas, en orden. */
  streets: number[];
  /** Las transversales a lo largo de las que se cumple, la que la describe primero. */
  along: number[];
  /** La esquina de cada paralela con la primera transversal. */
  nodes: number[];
  /** Rumbo en que se circula por cada paralela en esa esquina, en grados. */
  bearings: number[];
}

export interface PatternsFile {
  format: number;
  version: string;
  patterns: DirectionPattern[];
}

export interface LandmarkRecord {
  id: string;
  slug: string;
  name: string;
  category: string;
  lng: number;
  lat: number;
  /** Tramos manejables a menos de 150 m: sin acceso, no es destino del Navegante. */
  access: number[];
}

export interface LandmarksFile {
  format: number;
  version: string;
  landmarks: LandmarkRecord[];
}

export interface RailCrossing {
  street: number;
  kind: 'nivel' | 'puente' | 'tunel' | 'viaducto';
  lng: number;
  lat: number;
}

export interface RailLine {
  slug: string;
  name: string;
  geometry: number[][];
  crossings: RailCrossing[];
}

export interface RailFile {
  format: number;
  version: string;
  lines: RailLine[];
}

export interface MetaFile {
  format: number;
  version: string;
  generatedAt: string;
  sources: { name: string; url: string; downloadedAt: string; license: string }[];
  /** Oeste, sur, este, norte del área. */
  bbox: [number, number, number, number];
  center: LngLat;
  counts: Record<string, number>;
  /** Peso de cada archivo, en bytes. */
  files: Record<string, number>;
}

const SCALE = 1e6;

export function encodeCoord(value: number): number {
  return Math.round(value * SCALE);
}

/** Codifica una línea: el primer punto entero y los siguientes como diferencias. */
export function encodeLine(line: readonly LngLat[]): number[] {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  for (const [lng, lat] of line) {
    const x = encodeCoord(lng);
    const y = encodeCoord(lat);
    out.push(x - px, y - py);
    px = x;
    py = y;
  }
  return out;
}

export function decodeLine(encoded: readonly number[]): LngLat[] {
  const out: LngLat[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    x += encoded[i] ?? 0;
    y += encoded[i + 1] ?? 0;
    out.push([x / SCALE, y / SCALE]);
  }
  return out;
}
