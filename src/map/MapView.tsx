import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import type { LngLat } from '../engine/geo';
import './map.css';
import type { Theme } from './style';

// MapLibre 6 necesita saber dónde quedó su worker después del build de Vite.
setWorkerUrl(workerUrl);

// Textos de los controles de MapLibre, que vienen en inglés (los leen los lectores de pantalla).
const MAP_LOCALE = {
  'Map.Title': 'Mapa',
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
  'NavigationControl.ResetBearing': 'Arrastrá para girar el mapa, tocá para volver al norte',
};

const DARK_SCHEME = '(prefers-color-scheme: dark)';

function themeOf(query: MediaQueryList): Theme {
  return query.matches ? 'dark' : 'light';
}

/** MapLibre 6 exige WebGL2: sin él, el mapa no se puede dibujar. */
function supportsWebGL2(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return gl !== null;
}

export interface MapCamera {
  center: LngLat;
  zoom: number;
}

interface MapViewProps {
  label: string;
  className?: string;
  camera: MapCamera;
  styleFor: (theme: Theme) => StyleSpecification;
  /** Se llama una vez, recién creado el mapa. Devuelve cómo limpiar lo que agregó. */
  onCreate?: (map: MapLibreMap, theme: () => Theme) => () => void;
}

export function MapView({ label, className, camera, styleFor, onCreate }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported] = useState(supportsWebGL2);
  const [ready, setReady] = useState(false);
  // El mapa se crea una sola vez: estos valores se leen en ese momento o al cambiar el tema.
  const props = useRef({ camera, styleFor, onCreate });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const darkScheme = window.matchMedia(DARK_SCHEME);
    const { camera: initial, styleFor: style, onCreate: create } = props.current;
    const map = new MapLibreMap({
      container,
      style: style(themeOf(darkScheme)),
      center: [...initial.center],
      zoom: initial.zoom,
      attributionControl: false,
      locale: MAP_LOCALE,
      // Girar y bajar el mapa llega con el Navegante.
      pitchWithRotate: false,
      maxPitch: 0,
    });
    map.addControl(new NavigationControl({ visualizePitch: false }), 'bottom-right');
    const cleanUp = create?.(map, () => themeOf(darkScheme));
    // "idle" llega cuando terminó de dibujar todo, glyphs incluidos.
    map.once('idle', () => {
      setReady(true);
    });

    const onSchemeChange = () => {
      map.setStyle(style(themeOf(darkScheme)));
    };
    darkScheme.addEventListener('change', onSchemeChange);

    return () => {
      darkScheme.removeEventListener('change', onSchemeChange);
      cleanUp?.();
      map.remove();
    };
  }, [supported]);

  if (!supported) {
    return (
      <div role="alert" className={`grid place-items-center p-6 text-center ${className ?? ''}`}>
        Este navegador no puede dibujar el mapa: le falta WebGL2.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={label}
      data-map-state={ready ? 'ready' : 'loading'}
      className={className}
    />
  );
}
