import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { LngLat } from '../../engine/geo';
import type { AppData } from '../../lib/data';
import { addIcons } from '../../map/icons';
import { arrowFeatures, labelFeatures, streetFeatures } from '../../map/sources';
import { MapView, type MapCamera } from '../../map/MapView';
import {
  LANDMARKS_LAYER,
  LAYER_GROUPS,
  mapStyle,
  PALETTE,
  PIN_SOURCE,
  SELECTED_LAYER,
  SOURCE,
  STREETS_TOUCH_LAYER,
  type LayerGroup,
  type Theme,
} from '../../map/style';
import { nearestSegment } from '../../engine/describe';
import { useExplore, type CameraRequest, type Selection } from './store';

/** Radio del toque sobre un hito, en píxeles. */
const LANDMARK_TOUCH_PX = 14;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Un tap sobre la calle no deja marca: el pin es para lo que se buscó. */
function pinPoint(selection: Selection | undefined): LngLat | undefined {
  return selection?.kind === 'street' && !selection.title ? undefined : selection?.point;
}

function setSourceData(map: MapLibreMap, id: string, data: GeoJSON.GeoJSON): void {
  const source = map.getSource(id);
  if (source?.type === 'geojson') {
    (source as unknown as { setData: (value: GeoJSON.GeoJSON) => void }).setData(data);
  }
}

function applyState(map: MapLibreMap): void {
  const { layers, selection } = useExplore.getState();
  for (const group of Object.keys(LAYER_GROUPS) as LayerGroup[]) {
    for (const id of LAYER_GROUPS[group]) {
      map.setLayoutProperty(id, 'visibility', layers[group] ? 'visible' : 'none');
    }
  }
  const street = selection?.kind === 'street' ? selection.street : -1;
  map.setFilter(SELECTED_LAYER, ['==', ['get', 'street'], street]);
  const point = pinPoint(selection);
  setSourceData(map, PIN_SOURCE, {
    type: 'FeatureCollection',
    features: point
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [...point] } }]
      : [],
  });
}

function moveCamera(map: MapLibreMap, request: CameraRequest): void {
  const duration = window.matchMedia(REDUCED_MOTION).matches ? 0 : 500;
  // La ficha tapa la parte de abajo del mapa.
  const height = map.getContainer().clientHeight;
  if ('bounds' in request) {
    const [southWest, northEast] = request.bounds;
    const padding = { top: 48, left: 32, right: 56, bottom: Math.round(height * 0.5) };
    map.fitBounds([[...southWest], [...northEast]], { padding, maxZoom: 16, duration });
  } else {
    // Con `offset` y no `padding`: el padding de easeTo queda pegado al mapa y se suma al próximo.
    const offset: [number, number] = [0, -Math.round(height * 0.25)];
    map.easeTo({ center: [...request.center], zoom: request.zoom, offset, duration });
  }
}

interface ExploreMapProps {
  data: AppData;
  camera: MapCamera;
  className?: string;
}

export function ExploreMap({ data, camera, className }: ExploreMapProps) {
  // Las correcciones cambian los datos sin volver a crear el mapa.
  const dataRef = useRef(data);
  const mapRef = useRef<MapLibreMap | undefined>(undefined);
  const styleFor = useCallback((theme: Theme) => mapStyle(theme, dataRef.current), []);

  useEffect(() => {
    if (dataRef.current === data) return;
    dataRef.current = data;
    const map = mapRef.current;
    if (!map?.getLayer(SELECTED_LAYER)) return;
    setSourceData(map, SOURCE.streets, streetFeatures(data));
    setSourceData(map, SOURCE.arrows, arrowFeatures(data));
    setSourceData(map, SOURCE.labels, labelFeatures(data));
  }, [data]);

  const onCreate = useMemo(
    () => (map: MapLibreMap, theme: () => Theme) => {
      mapRef.current = map;
      const onStyle = () => {
        const colors = PALETTE[theme()];
        addIcons(map, colors);
        applyState(map);
      };
      const onClick = (event: MapMouseEvent) => {
        const { x, y } = event.point;
        const { select } = useExplore.getState();
        const near = LANDMARK_TOUCH_PX;
        const landmark = map.queryRenderedFeatures(
          [
            [x - near, y - near],
            [x + near, y + near],
          ],
          { layers: [LANDMARKS_LAYER] },
        )[0];
        if (landmark) {
          const id = (landmark.properties as { id: string }).id;
          const record = dataRef.current.landmarks.find((l) => l.id === id);
          if (record) {
            select({
              kind: 'landmark',
              id,
              point: [record.lng, record.lat],
              title: record.name,
            });
            return;
          }
        }
        const touched = map
          .queryRenderedFeatures(event.point, { layers: [STREETS_TOUCH_LAYER] })
          .map((feature) => (feature.properties as { segment: number }).segment);
        const point: LngLat = [event.lngLat.lng, event.lngLat.lat];
        const { graph } = dataRef.current;
        const segment = nearestSegment(graph, point, touched);
        select(
          segment === undefined
            ? undefined
            : { kind: 'street', street: graph.segment(segment).street, point },
        );
      };
      const onMoveEnd = () => {
        const { lng, lat } = map.getCenter();
        useExplore.getState().rememberCamera({ center: [lng, lat], zoom: map.getZoom() });
      };
      map.on('style.load', onStyle);
      map.on('click', onClick);
      map.on('moveend', onMoveEnd);
      const unsubscribe = useExplore.subscribe((state, previous) => {
        // Hasta que cargue el estilo no hay capas: lo aplica onStyle.
        if (map.getLayer(SELECTED_LAYER)) applyState(map);
        if (state.cameraRequest && state.cameraRequest !== previous.cameraRequest)
          moveCamera(map, state.cameraRequest);
      });
      return () => {
        mapRef.current = undefined;
        unsubscribe();
      };
    },
    [],
  );

  return (
    <MapView
      label="Mapa de calles"
      className={className}
      camera={camera}
      styleFor={styleFor}
      onCreate={onCreate}
    />
  );
}
