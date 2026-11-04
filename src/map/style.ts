/**
 * Estilo del mapa, con las capas en el orden de la sección 9. Solo datos propios, sin tiles de
 * terceros.
 */
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { AppData } from '../lib/data';
import { glyphsUrl } from '../lib/urls';
import { ARROW_ICON, DOUBTFUL_ARROW_ICON, QUIZ_ARROW_ICON } from './icons';
import {
  arrowFeatures,
  labelFeatures,
  landmarkFeatures,
  railFeatures,
  streetFeatures,
} from './sources';

export type Theme = 'light' | 'dark';

export type LayerGroup = 'names' | 'arrows' | 'landmarks' | 'rail' | 'barrios';

// Cada fuente es una carpeta de public/fonts (ver scripts/fetch-glyphs.ts).
const FONT_REGULAR = 'noto-sans-regular';
const FONT_MEDIUM = 'noto-sans-medium';

export const PALETTE = {
  light: {
    land: '#f4f2ee',
    water: '#a9d3ea',
    park: '#cfe8c9',
    street: '#ffffff',
    casing: '#c3c9d3',
    avenue: '#ffeab0',
    avenueCasing: '#dcb45a',
    barrier: '#f2a766',
    barrierCasing: '#b4632a',
    rail: '#7c8493',
    barrio: '#8e6bb0',
    text: '#1f2937',
    halo: '#ffffff',
    arrow: '#334155',
    doubtful: '#b45309',
    selected: '#0f766e',
    landmark: '#6d28d9',
    pin: '#dc2626',
    good: '#15803d',
    bad: '#b91c1c',
  },
  dark: {
    land: '#0f1729',
    water: '#12324f',
    park: '#14382f',
    street: '#3a4a60',
    casing: '#1b2536',
    avenue: '#6b5a2e',
    avenueCasing: '#2c2614',
    barrier: '#8f5a2c',
    barrierCasing: '#3d2612',
    rail: '#8894a8',
    barrio: '#b79ad6',
    text: '#e2e8f0',
    halo: '#0b1220',
    arrow: '#cbd5e1',
    doubtful: '#fbbf24',
    selected: '#2dd4bf',
    landmark: '#c4b5fd',
    pin: '#f87171',
    good: '#4ade80',
    bad: '#f87171',
  },
} as const;

export const SOURCE = {
  background: 'background',
  barrios: 'barrios',
  rail: 'rail',
  barriers: 'barriers',
  streets: 'streets',
  arrows: 'arrows',
  labels: 'labels',
  landmarks: 'landmarks',
  pin: 'pin',
  quiz: 'quiz',
  flow: 'flow',
} as const;

export const PIN_SOURCE = SOURCE.pin;
export const STREETS_TOUCH_LAYER = 'streets-touch';
export const LANDMARKS_LAYER = 'landmarks-dot';
export const SELECTED_LAYER = 'street-selected';
export const BARRIERS_LAYER = 'barriers';
export const QUIZ_ARROWS_LAYER = 'quiz-arrows';
/** Etiquetas de calles, con los niveles de cada capa. */
export const LABEL_LEVELS: Readonly<Record<string, readonly number[]>> = {
  'labels-main': [1, 2],
  'labels-secondary': [3],
  'labels-local': [4],
  'labels-minor': [5],
};

/** Las capas que se prenden y apagan juntas. */
export const LAYER_GROUPS: Record<LayerGroup, readonly string[]> = {
  names: ['labels-main', 'labels-secondary', 'labels-local', 'labels-minor', 'barriers-label'],
  arrows: ['arrows', 'arrows-doubtful'],
  landmarks: [LANDMARKS_LAYER, 'landmarks-label'],
  rail: ['rail-line', 'rail-ties'],
  barrios: ['barrios-line', 'barrios-label'],
};

const LEVEL: ExpressionSpecification = ['get', 'level'];
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Ancho de la calle según su nivel: 1 troncales … 5 pasajes. */
function widthByLevel(extra: number): ExpressionSpecification {
  const at = (widths: [number, number, number, number, number]): ExpressionSpecification => [
    'match',
    LEVEL,
    1,
    widths[0] + extra,
    2,
    widths[1] + extra,
    3,
    widths[2] + extra,
    4,
    widths[3] + extra,
    widths[4] + extra,
  ];
  return [
    'interpolate',
    ['exponential', 1.6],
    ['zoom'],
    11,
    at([2.5, 2, 1.2, 0.6, 0.4]),
    14,
    at([6, 5, 3.5, 2.2, 1.5]),
    18,
    at([26, 22, 17, 13, 9]),
  ];
}

function colorByLevel(avenue: string, street: string): ExpressionSpecification {
  return ['case', ['<=', LEVEL, 2], avenue, street];
}

export function mapStyle(theme: Theme, data: AppData): StyleSpecification {
  const colors = PALETTE[theme];
  const text = {
    'text-color': colors.text,
    'text-halo-color': colors.halo,
    'text-halo-width': 1.5,
  };

  const labelLayer = (
    id: string,
    minzoom: number,
    levels: number[],
    size: number,
    font = FONT_REGULAR,
  ): LayerSpecification => ({
    id,
    type: 'symbol',
    source: SOURCE.labels,
    minzoom,
    filter: ['in', LEVEL, ['literal', levels]],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 320,
      'text-field': ['get', 'name'],
      'text-font': [font],
      'text-size': size,
      'text-max-angle': 35,
      'text-padding': 4,
    },
    paint: text,
  });

  const layers: LayerSpecification[] = [
    { id: 'land', type: 'background', paint: { 'background-color': colors.land } },
    {
      id: 'water',
      type: 'fill',
      source: SOURCE.background,
      filter: ['==', ['get', 'kind'], 'agua'],
      paint: { 'fill-color': colors.water },
    },
    {
      id: 'parks',
      type: 'fill',
      source: SOURCE.background,
      filter: ['==', ['get', 'kind'], 'parque'],
      paint: { 'fill-color': colors.park },
    },
    {
      id: 'rail-line',
      type: 'line',
      source: SOURCE.rail,
      paint: { 'line-color': colors.rail, 'line-width': 2 },
    },
    {
      id: 'rail-ties',
      type: 'line',
      source: SOURCE.rail,
      minzoom: 13,
      paint: { 'line-color': colors.rail, 'line-width': 5, 'line-dasharray': [0.3, 3] },
    },
    {
      id: 'barrios-line',
      type: 'line',
      source: SOURCE.barrios,
      paint: { 'line-color': colors.barrio, 'line-width': 1.5, 'line-dasharray': [3, 2] },
    },
    {
      id: 'barriers-casing',
      type: 'line',
      source: SOURCE.barriers,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors.barrierCasing,
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 3.5, 18, 30],
      },
    },
    {
      id: BARRIERS_LAYER,
      type: 'line',
      source: SOURCE.barriers,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors.barrier,
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 2.5, 18, 27],
      },
    },
    {
      id: 'streets-casing',
      type: 'line',
      source: SOURCE.streets,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colorByLevel(colors.avenueCasing, colors.casing),
        'line-width': widthByLevel(1.5),
      },
    },
    {
      id: 'streets',
      type: 'line',
      source: SOURCE.streets,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colorByLevel(colors.avenue, colors.street),
        'line-width': widthByLevel(0),
      },
    },
    {
      id: SELECTED_LAYER,
      type: 'line',
      source: SOURCE.streets,
      filter: ['==', ['get', 'street'], -1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.selected, 'line-width': widthByLevel(2) },
    },
    {
      id: 'quiz-area',
      type: 'fill',
      source: SOURCE.quiz,
      filter: ['==', ['get', 'role'], 'area'],
      paint: { 'fill-color': colors.selected, 'fill-opacity': 0.14 },
    },
    {
      id: 'quiz-area-line',
      type: 'line',
      source: SOURCE.quiz,
      filter: ['==', ['get', 'role'], 'area'],
      paint: { 'line-color': colors.selected, 'line-width': 2.5 },
    },
    {
      id: 'quiz-line-casing',
      type: 'line',
      source: SOURCE.quiz,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors.halo,
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 6, 14, 10, 18, 30],
      },
    },
    {
      id: 'quiz-line',
      type: 'line',
      source: SOURCE.quiz,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': [
          'match',
          ['get', 'role'],
          'good',
          colors.good,
          'bad',
          colors.bad,
          colors.selected,
        ],
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 3.5, 14, 6, 18, 22],
      },
    },
    {
      id: 'arrows',
      type: 'symbol',
      source: SOURCE.arrows,
      minzoom: 14,
      filter: ['==', ['get', 'doubtful'], false],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 110,
        'icon-image': ARROW_ICON,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.55, 18, 1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map',
      },
    },
    {
      id: 'arrows-doubtful',
      type: 'symbol',
      source: SOURCE.arrows,
      minzoom: 14,
      filter: ['==', ['get', 'doubtful'], true],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 110,
        'icon-image': DOUBTFUL_ARROW_ICON,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.65, 18, 1.1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map',
      },
    },
    {
      id: LANDMARKS_LAYER,
      type: 'circle',
      source: SOURCE.landmarks,
      minzoom: 13,
      paint: {
        'circle-color': colors.landmark,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 7],
        'circle-stroke-color': colors.halo,
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: 'barrios-label',
      type: 'symbol',
      source: SOURCE.barrios,
      maxzoom: 14,
      layout: {
        'text-field': ['get', 'display'],
        'text-font': [FONT_MEDIUM],
        'text-size': 15,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
      },
      paint: { ...text, 'text-color': colors.barrio },
    },
    {
      id: 'barriers-label',
      type: 'symbol',
      source: SOURCE.barriers,
      minzoom: 13,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 420,
        'text-field': ['get', 'name'],
        'text-font': [FONT_MEDIUM],
        'text-size': 12,
      },
      paint: text,
    },
    labelLayer('labels-main', 12, [1, 2], 13, FONT_MEDIUM),
    labelLayer('labels-secondary', 13.5, [3], 12.5, FONT_MEDIUM),
    labelLayer('labels-local', 14.5, [4], 12),
    labelLayer('labels-minor', 15.5, [5], 11.5),
    {
      id: 'landmarks-label',
      type: 'symbol',
      source: SOURCE.landmarks,
      minzoom: 14,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': [FONT_REGULAR],
        'text-size': 12,
        'text-anchor': 'top',
        'text-offset': [0, 0.7],
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: { ...text, 'text-color': colors.landmark },
    },
    {
      id: 'quiz-point',
      type: 'circle',
      source: SOURCE.quiz,
      filter: ['==', ['get', 'role'], 'point'],
      paint: {
        'circle-color': colors.selected,
        'circle-radius': 11,
        'circle-stroke-color': colors.halo,
        'circle-stroke-width': 3,
      },
    },
    {
      id: QUIZ_ARROWS_LAYER,
      type: 'symbol',
      source: SOURCE.quiz,
      filter: ['==', ['get', 'role'], 'arrow'],
      layout: {
        'icon-image': QUIZ_ARROW_ICON,
        'icon-size': 1.5,
        'icon-rotate': ['get', 'rotate'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    {
      id: 'quiz-flow',
      type: 'symbol',
      source: SOURCE.flow,
      layout: {
        'icon-image': QUIZ_ARROW_ICON,
        'icon-size': 1.1,
        'icon-rotate': ['get', 'rotate'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    {
      id: 'pin',
      type: 'circle',
      source: SOURCE.pin,
      paint: {
        'circle-color': colors.pin,
        'circle-radius': 9,
        'circle-stroke-color': colors.halo,
        'circle-stroke-width': 3,
      },
    },
    // Invisible y ancha: las calles finas se tocan sin puntería (sección 9).
    {
      id: STREETS_TOUCH_LAYER,
      type: 'line',
      source: SOURCE.streets,
      paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 28 },
    },
  ];

  return {
    version: 8,
    glyphs: glyphsUrl(),
    sources: {
      [SOURCE.background]: { type: 'geojson', data: data.background },
      [SOURCE.barrios]: { type: 'geojson', data: data.barrios },
      [SOURCE.rail]: { type: 'geojson', data: railFeatures(data) },
      [SOURCE.barriers]: { type: 'geojson', data: data.barriers },
      [SOURCE.streets]: { type: 'geojson', data: streetFeatures(data) },
      [SOURCE.arrows]: { type: 'geojson', data: arrowFeatures(data) },
      [SOURCE.labels]: { type: 'geojson', data: labelFeatures(data) },
      [SOURCE.landmarks]: { type: 'geojson', data: landmarkFeatures(data) },
      [SOURCE.pin]: { type: 'geojson', data: EMPTY },
      [SOURCE.quiz]: { type: 'geojson', data: EMPTY },
      [SOURCE.flow]: { type: 'geojson', data: EMPTY },
    },
    layers,
  };
}
