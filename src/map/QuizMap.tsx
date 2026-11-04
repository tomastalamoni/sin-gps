/**
 * El mapa de las preguntas y las lecciones: uno solo para toda la sesión. Cada escena dice qué se
 * ve; el mapa se mueve suave de una a otra, sin volver a crearse.
 */
import type {
  ExpressionSpecification,
  FilterSpecification,
  Map as MapLibreMap,
  MapMouseEvent,
} from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lineLengthM, bearingDeg, pointAlong, type LngLat } from '../engine/geo';
import type { Bounds, Highlight, Visibility } from '../engine/quiz/types';
import type { TapCandidate } from '../engine/quiz/tap';
import { TAP_RADIUS_PX } from '../engine/quiz/tap';
import type { AppData } from '../lib/data';
import { addIcons } from './icons';
import { MapView, type MapCamera } from './MapView';
import {
  BARRIERS_LAYER,
  LABEL_LEVELS,
  LANDMARKS_LAYER,
  mapStyle,
  PALETTE,
  QUIZ_ARROWS_LAYER,
  SOURCE,
  STREETS_TOUCH_LAYER,
  type Theme,
} from './style';

export interface SceneArrow {
  option: string;
  point: LngLat;
  bearing: number;
}

export interface MapScene {
  /** Cambia cuando cambia lo que se muestra: una escena nueva mueve la cámara. */
  id: string;
  frame: Bounds;
  highlight: Highlight;
  visibility: Visibility;
  arrows?: readonly SceneArrow[];
  /** La línea a animar: el sentido de circulación. */
  flow?: readonly LngLat[];
  /** Resultado que se pinta sobre la pregunta. */
  good?: Highlight;
  bad?: Highlight;
  /** Por debajo de este zoom, un toque acerca el mapa en vez de responder (sección 4). */
  minTapZoom?: number;
}

export interface MapTap {
  lngLat: LngLat;
  zoom: number;
  candidates: TapCandidate[];
  /** La flecha que tocó, si tocó una. */
  arrow?: string;
  /** El toque solo acercó el mapa: todavía no responde. */
  zoomedIn?: boolean;
}

interface QuizMapProps {
  data: AppData;
  scene: MapScene;
  className?: string;
  onTap?: (tap: MapTap) => void;
  /** La escena terminó de dibujarse: recién ahí arranca el reloj. */
  onReady?: (sceneId: string) => void;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const CAMERA_MS = 450;
const FRAME_PADDING = 28;
const MAX_ZOOM = 16.5;
/** Cuánto tarda la flecha en recorrer la línea. */
const FLOW_MS = 2400;
const ARROW_TOUCH_PX = 28;
/** Cuánto late la respuesta correcta en el mapa. */
const PULSE_MS = 1400;
const PULSE_BEATS = 3;
/** Un poco más que el zoom mínimo, para que el toque siguiente no quede justo en el borde. */
const TAP_ZOOM_MARGIN = 0.3;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function reducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

function setSourceData(map: MapLibreMap, id: string, data: GeoJSON.GeoJSON): void {
  const source = map.getSource(id);
  if (source?.type === 'geojson') {
    (source as unknown as { setData: (value: GeoJSON.GeoJSON) => void }).setData(data);
  }
}

function lineFeature(line: readonly LngLat[], role: string): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { role },
    geometry: { type: 'LineString', coordinates: line.map((p) => [...p]) },
  };
}

function highlightFeatures(data: AppData, highlight: Highlight, role: string): GeoJSON.Feature[] {
  const segments = (highlight.segments ?? []).map((t) =>
    lineFeature(data.graph.segment(t).geometry, role),
  );
  const lines = (highlight.lines ?? []).map((line) => lineFeature(line, role));
  const barrio = data.barrioList.find((b) => b.id === highlight.barrio);
  const area: GeoJSON.Feature[] = (barrio?.polygons ?? []).map((rings) => ({
    type: 'Feature',
    properties: { role: 'area' },
    geometry: { type: 'Polygon', coordinates: rings.map((r) => r.map((p) => [...p])) },
  }));
  const point: GeoJSON.Feature[] = highlight.point
    ? [
        {
          type: 'Feature',
          properties: { role: 'point' },
          geometry: { type: 'Point', coordinates: [...highlight.point] },
        },
      ]
    : [];
  return [...area, ...segments, ...lines, ...point];
}

function sceneFeatures(data: AppData, scene: MapScene): GeoJSON.FeatureCollection {
  const arrows = (scene.arrows ?? []).map((arrow): GeoJSON.Feature => ({
    type: 'Feature',
    // Las flechas del ícono miran hacia la derecha.
    properties: { role: 'arrow', option: arrow.option, rotate: arrow.bearing - 90 },
    geometry: { type: 'Point', coordinates: [...arrow.point] },
  }));
  return {
    type: 'FeatureCollection',
    features: [
      ...highlightFeatures(data, scene.highlight, 'target'),
      ...highlightFeatures(data, scene.bad ?? {}, 'bad'),
      ...highlightFeatures(data, scene.good ?? {}, 'good'),
      ...arrows,
    ],
  };
}

function hasNumber(property: string, values: readonly (number | string)[]) {
  return ['in', ['get', property], ['literal', values]] as unknown as ExpressionSpecification;
}

function applyVisibility(map: MapLibreMap, { streets, landmarks, ...rest }: Visibility): void {
  for (const [id, levels] of Object.entries(LABEL_LEVELS)) {
    map.setFilter(id, ['all', hasNumber('level', levels), hasNumber('street', streets)]);
  }
  const hidden = hasNumber('street', rest.hiddenArrows);
  map.setFilter('arrows', [
    'all',
    ['==', ['get', 'doubtful'], false],
    ['!', hidden],
  ] as FilterSpecification);
  // Lo dudoso no se pregunta: en una sesión solo distrae.
  map.setLayoutProperty('arrows-doubtful', 'visibility', 'none');
  const landmark = hasNumber('id', landmarks);
  map.setFilter(LANDMARKS_LAYER, landmark);
  map.setFilter('landmarks-label', landmark);
  map.setLayoutProperty('barrios-label', 'visibility', rest.barrioLabels ? 'visible' : 'none');
  map.setLayoutProperty('barriers-label', 'visibility', rest.barrierLabels ? 'visible' : 'none');
}

/** Distancia en píxeles de un punto de la pantalla a una línea del mapa. */
function distancePx(map: MapLibreMap, x: number, y: number, line: readonly LngLat[]): number {
  let best = Infinity;
  const points = line.map(([lng, lat]) => map.project([lng, lat]));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t =
      length2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / length2));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.y + dy * t - y));
  }
  return best;
}

function tapOf(map: MapLibreMap, data: AppData, event: MapMouseEvent): MapTap {
  const { x, y } = event.point;
  const box = (px: number): [[number, number], [number, number]] => [
    [x - px, y - px],
    [x + px, y + px],
  ];
  const arrow = map.queryRenderedFeatures(box(ARROW_TOUCH_PX), { layers: [QUIZ_ARROWS_LAYER] })[0];
  const near = TAP_RADIUS_PX + 2;
  const candidates = map
    .queryRenderedFeatures(box(near), { layers: [STREETS_TOUCH_LAYER, BARRIERS_LAYER] })
    .flatMap((feature): TapCandidate[] => {
      const { street, segment } = feature.properties as { street?: number; segment?: number };
      if (street === undefined) return [];
      const line =
        segment !== undefined
          ? data.graph.segment(segment).geometry
          : feature.geometry.type === 'LineString'
            ? (feature.geometry.coordinates as unknown as LngLat[])
            : [];
      return [{ street, distancePx: distancePx(map, x, y, line) }];
    });
  const option = (arrow?.properties as { option?: string } | undefined)?.option;
  return {
    lngLat: [event.lngLat.lng, event.lngLat.lat],
    zoom: map.getZoom(),
    candidates,
    ...(option ? { arrow: option } : {}),
  };
}

export function QuizMap({ data, scene, className, onTap, onReady }: QuizMapProps) {
  const mapRef = useRef<MapLibreMap | undefined>(undefined);
  const dataRef = useRef(data);
  const sceneRef = useRef(scene);
  const onTapRef = useRef(onTap);
  const onReadyRef = useRef(onReady);
  const shownRef = useRef<string | undefined>(undefined);
  const flowRef = useRef<number | undefined>(undefined);
  const pulseRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    onTapRef.current = onTap;
    onReadyRef.current = onReady;
  });

  const stopFlow = useCallback(() => {
    if (flowRef.current !== undefined) cancelAnimationFrame(flowRef.current);
    flowRef.current = undefined;
    const map = mapRef.current;
    if (map?.getSource(SOURCE.flow)) setSourceData(map, SOURCE.flow, EMPTY);
  }, []);

  const startFlow = useCallback((line: readonly LngLat[]) => {
    const map = mapRef.current;
    if (!map || line.length < 2) return;
    const length = lineLengthM(line);
    const draw = (along: number) => {
      const point = pointAlong(line, along);
      const ahead = pointAlong(line, Math.min(length, along + 8));
      const rotate = bearingDeg(point, ahead) - 90;
      setSourceData(map, SOURCE.flow, {
        type: 'Feature',
        properties: { rotate },
        geometry: { type: 'Point', coordinates: [...point] },
      });
    };
    if (reducedMotion()) {
      draw(length / 2);
      return;
    }
    const start = performance.now();
    const frame = (now: number) => {
      draw((((now - start) % FLOW_MS) / FLOW_MS) * length);
      flowRef.current = requestAnimationFrame(frame);
    };
    flowRef.current = requestAnimationFrame(frame);
  }, []);

  /** La respuesta correcta late un momento, para que se vea dónde estaba. */
  const pulse = useCallback(() => {
    const map = mapRef.current;
    if (!map || reducedMotion()) return;
    if (pulseRef.current !== undefined) cancelAnimationFrame(pulseRef.current);
    const start = performance.now();
    const frame = (now: number) => {
      const progress = (now - start) / PULSE_MS;
      const done = progress >= 1 || !map.getLayer('quiz-line');
      if (map.getLayer('quiz-line')) {
        const opacity = done
          ? 1
          : 0.35 + 0.65 * Math.abs(Math.cos(progress * Math.PI * PULSE_BEATS));
        map.setPaintProperty('quiz-line', 'line-opacity', opacity);
      }
      pulseRef.current = done ? undefined : requestAnimationFrame(frame);
    };
    pulseRef.current = requestAnimationFrame(frame);
  }, []);

  const show = useCallback(
    (next: MapScene, moveCamera: boolean) => {
      const map = mapRef.current;
      if (!map?.getLayer(QUIZ_ARROWS_LAYER)) return;
      applyVisibility(map, next.visibility);
      setSourceData(map, SOURCE.quiz, sceneFeatures(dataRef.current, next));
      stopFlow();
      if (next.flow) startFlow(next.flow);
      if (next.good) pulse();
      if (moveCamera) {
        const [southWest, northEast] = next.frame;
        map.fitBounds([[...southWest], [...northEast]], {
          padding: FRAME_PADDING,
          maxZoom: MAX_ZOOM,
          duration: reducedMotion() ? 0 : CAMERA_MS,
        });
      }
      map.once('idle', () => {
        map.getContainer().dataset.scene = next.id;
        onReadyRef.current?.(next.id);
      });
    },
    [pulse, startFlow, stopFlow],
  );

  useEffect(() => {
    sceneRef.current = scene;
    const moved = shownRef.current !== scene.id;
    shownRef.current = scene.id;
    show(scene, moved);
  }, [scene, show]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const styleFor = useCallback((theme: Theme) => mapStyle(theme, dataRef.current), []);

  const onCreate = useMemo(
    () => (map: MapLibreMap, theme: () => Theme) => {
      mapRef.current = map;
      const onStyle = () => {
        addIcons(map, PALETTE[theme()]);
        show(sceneRef.current, true);
      };
      const onClick = (event: MapMouseEvent) => {
        const tap = tapOf(map, dataRef.current, event);
        const { minTapZoom } = sceneRef.current;
        if (minTapZoom !== undefined && tap.zoom < minTapZoom) {
          map.easeTo({
            center: [...tap.lngLat],
            zoom: minTapZoom + TAP_ZOOM_MARGIN,
            duration: reducedMotion() ? 0 : CAMERA_MS,
          });
          onTapRef.current?.({ ...tap, zoomedIn: true });
          return;
        }
        onTapRef.current?.(tap);
      };
      map.on('style.load', onStyle);
      map.on('click', onClick);
      // El panel de abajo cambia de alto entre preguntas.
      const observer = new ResizeObserver(() => {
        map.resize();
      });
      observer.observe(map.getContainer());
      return () => {
        observer.disconnect();
        stopFlow();
        mapRef.current = undefined;
      };
    },
    [show, stopFlow],
  );

  // La cámara inicial se lee una sola vez: después la mueve cada escena.
  const [camera] = useState<MapCamera>(() => {
    const [[west, south], [east, north]] = scene.frame;
    return { center: [(west + east) / 2, (south + north) / 2], zoom: 13 };
  });

  return (
    <MapView
      label="Mapa de la pregunta"
      className={className}
      camera={camera}
      styleFor={styleFor}
      onCreate={onCreate}
      fixedNorth
    />
  );
}
