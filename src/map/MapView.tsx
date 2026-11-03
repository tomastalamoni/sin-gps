import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import { TEST_MAP_CENTER, TEST_MAP_ZOOM } from './config';
import './map.css';
import { testStyle, type Theme } from './style';

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

interface MapViewProps {
  label: string;
  className?: string;
}

export function MapView({ label, className }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported] = useState(supportsWebGL2);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const darkScheme = window.matchMedia(DARK_SCHEME);
    const map = new MapLibreMap({
      container,
      style: testStyle(themeOf(darkScheme)),
      center: TEST_MAP_CENTER,
      zoom: TEST_MAP_ZOOM,
      attributionControl: false,
      locale: MAP_LOCALE,
    });
    map.addControl(new NavigationControl({ visualizePitch: false }), 'bottom-right');
    // "idle" llega cuando terminó de dibujar todo, glyphs incluidos.
    map.once('idle', () => {
      setReady(true);
    });

    const onSchemeChange = () => {
      map.setStyle(testStyle(themeOf(darkScheme)));
    };
    darkScheme.addEventListener('change', onSchemeChange);

    return () => {
      darkScheme.removeEventListener('change', onSchemeChange);
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
