/**
 * Una pregunta declara todo lo que se ve en el mapa (sección 4): un test verifica que nunca se vea
 * la respuesta.
 */
import type { LngLat } from '../geo';
import type { CardId } from '../ids';
import type { Interaction } from '../srs/grading';

export type QuizMode =
  | 'name'
  | 'find'
  | 'direction'
  | 'barrio'
  | 'landmark-where'
  | 'landmark-what'
  | 'barrier-name'
  | 'rail-between'
  | 'rail-crosses'
  | 'rail-next';

export type Bounds = [LngLat, LngLat];

export interface Visibility {
  /** Calles con etiqueta visible. */
  streets: number[];
  /** Hitos con etiqueta visible. */
  landmarks: string[];
  /** Calles que no muestran flechas. */
  hiddenArrows: number[];
  barrioLabels: boolean;
  barrierLabels: boolean;
  /** Apagada durante las preguntas, para que el color no delate la calle nueva. */
  domain: false;
}

export interface Highlight {
  segments?: number[];
  /** Un barrio entero (Z:barrio). */
  barrio?: string;
  point?: LngLat;
  /** Líneas que no son calles: una autopista o un pedazo de vías. */
  lines?: LngLat[][];
}

export interface Option {
  id: string;
  label: string;
  detail?: string;
}

interface BaseQuestion {
  card: CardId;
  mode: QuizMode;
  /** Con la misma semilla sale la misma pregunta: así se reproduce cualquier error. */
  seed: number;
  interaction: Interaction;
  prompt: string;
  frame: Bounds;
  highlight: Highlight;
  visibility: Visibility;
  /** La línea que explica la respuesta, para el feedback. */
  explanation: string;
}

export interface ChoiceQuestion extends BaseQuestion {
  kind: 'choice';
  options: Option[];
  answer: string;
}

/** Sentidos: las dos flechas se dibujan sobre la calle. */
export interface DirectionQuestion extends BaseQuestion {
  kind: 'direction';
  options: Option[];
  answer: string;
  arrows: { option: string; point: LngLat; bearing: number }[];
}

export interface TapStreetQuestion extends BaseQuestion {
  kind: 'tap-street';
  street: number;
}

export interface TapPlaceQuestion extends BaseQuestion {
  kind: 'tap-place';
  point: LngLat;
  radiusM: number;
  /** Si el lugar ocupa una superficie, tocar adentro también es acertar. */
  bbox?: [number, number, number, number];
}

export type Question = ChoiceQuestion | DirectionQuestion | TapStreetQuestion | TapPlaceQuestion;
