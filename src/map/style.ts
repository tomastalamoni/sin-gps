import type { StyleSpecification } from 'maplibre-gl';
import { glyphsUrl } from '../lib/urls';
import { TEST_MAP_CENTER } from './config';

export type Theme = 'light' | 'dark';

// Cada fuente es una carpeta de public/fonts (ver scripts/fetch-glyphs.ts).
const FONT_REGULAR = 'noto-sans-regular';
const FONT_MEDIUM = 'noto-sans-medium';

const PALETTE = {
  light: {
    land: '#f1f5f4',
    area: '#cfe8df',
    areaOutline: '#7fb8a4',
    line: '#94a3b8',
    point: '#0f766e',
    text: '#0f172a',
    halo: '#ffffff',
  },
  dark: {
    land: '#0f1729',
    area: '#123a33',
    areaOutline: '#2f7f6d',
    line: '#64748b',
    point: '#2dd4bf',
    text: '#e2e8f0',
    halo: '#0b1220',
  },
} as const;

// Textos de prueba: usan los dos rangos de glyphs incluidos (tildes y ñ; comillas y guiones).
const AREA_LABEL = 'Área de prueba';
const LINE_LABEL = 'Línea de prueba – ñandú';
const POINT_LABEL = 'Prueba de texto: ñ á é í ó ú ü ¿ ¡ “ ” –';

function sampleFeatures(): GeoJSON.FeatureCollection {
  const [lng, lat] = TEST_MAP_CENTER;
  const d = 0.004;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { label: AREA_LABEL },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [lng - d, lat + d * 0.4],
              [lng - d * 0.2, lat + d * 0.4],
              [lng - d * 0.2, lat + d * 1.2],
              [lng - d, lat + d * 1.2],
              [lng - d, lat + d * 0.4],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { label: LINE_LABEL },
        geometry: {
          type: 'LineString',
          // Lejos del punto: si las etiquetas se pisan, MapLibre oculta una.
          coordinates: [
            [lng - d * 1.5, lat - d * 2.2],
            [lng + d * 1.5, lat - d * 1.6],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { label: POINT_LABEL },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      },
    ],
  };
}

/** Estilo del mapa de prueba: solo datos propios, sin tiles de terceros. */
export function testStyle(theme: Theme): StyleSpecification {
  const colors = PALETTE[theme];
  const textPaint = {
    'text-color': colors.text,
    'text-halo-color': colors.halo,
    'text-halo-width': 2,
  };
  return {
    version: 8,
    glyphs: glyphsUrl(),
    sources: { sample: { type: 'geojson', data: sampleFeatures() } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': colors.land } },
      {
        id: 'sample-area',
        type: 'fill',
        source: 'sample',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': colors.area, 'fill-outline-color': colors.areaOutline },
      },
      {
        id: 'sample-line',
        type: 'line',
        source: 'sample',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': colors.line, 'line-width': 8 },
      },
      {
        id: 'sample-point',
        type: 'circle',
        source: 'sample',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': colors.point,
          'circle-radius': 7,
          'circle-stroke-color': colors.halo,
          'circle-stroke-width': 2,
        },
      },
      {
        id: 'sample-area-label',
        type: 'symbol',
        source: 'sample',
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { 'text-field': ['get', 'label'], 'text-font': [FONT_REGULAR], 'text-size': 14 },
        paint: textPaint,
      },
      {
        id: 'sample-line-label',
        type: 'symbol',
        source: 'sample',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'label'],
          'text-font': [FONT_MEDIUM],
          'text-size': 15,
          // Arriba de la línea, para que no se crucen.
          'text-offset': [0, -1.1],
        },
        paint: textPaint,
      },
      {
        id: 'sample-point-label',
        type: 'symbol',
        source: 'sample',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': [FONT_REGULAR],
          'text-size': 16,
          'text-anchor': 'top',
          'text-offset': [0, 1],
          'text-max-width': 12,
        },
        paint: textPaint,
      },
    ],
  };
}
