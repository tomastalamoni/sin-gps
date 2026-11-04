import { useMemo } from 'react';
import { useParams } from 'wouter';
import { useData, type AppData } from '../../lib/data';
import type { MapCamera } from '../../map/MapView';
import { Credits } from '../../ui/Credits';
import { ExploreMap } from './ExploreMap';
import { LayersPanel } from './LayersPanel';
import { SearchPanel } from './SearchPanel';
import { SelectionSheet } from './StreetSheet';
import { useExplore } from './store';

const INITIAL_ZOOM = 12.5;

/** La ruta puede traer el encuadre: #/mapa/lng,lat,zoom. */
function cameraFromRoute(view: string | undefined): MapCamera | undefined {
  const [lng, lat, zoom] = (view ?? '').split(',').map(Number);
  if (lng === undefined || lat === undefined || zoom === undefined) return undefined;
  if ([lng, lat, zoom].some(Number.isNaN)) return undefined;
  return { center: [lng, lat], zoom };
}

function initialCamera(data: AppData, view: string | undefined): MapCamera {
  return (
    cameraFromRoute(view) ??
    useExplore.getState().camera ?? { center: data.meta.center, zoom: INITIAL_ZOOM }
  );
}

export function ExploreScreen() {
  const data = useData();
  const { view } = useParams<{ view?: string }>();
  const camera = useMemo(() => initialCamera(data, view), [data, view]);
  const panel = useExplore((state) => state.panel);
  const openPanel = useExplore((state) => state.openPanel);

  return (
    <div className="relative flex h-full flex-col">
      <h1 className="sr-only">Mapa</h1>
      {/* El mapa se recrea si la ruta trae otro encuadre. */}
      <ExploreMap key={view} data={data} camera={camera} className="min-h-0 flex-1" />
      <div className="pointer-events-none absolute inset-x-0 top-0 pt-[env(safe-area-inset-top)]">
        <Credits
          compact
          className="pointer-events-auto mx-auto w-fit rounded-b-lg bg-surface/85 px-2 text-muted"
        />
      </div>
      <div className="flex gap-2 border-t border-line bg-surface p-2">
        <button
          type="button"
          className="flex min-h-12 flex-1 items-center gap-2 rounded-xl bg-page px-3 text-left text-muted ring-1 ring-line"
          onClick={() => {
            openPanel('search');
          }}
        >
          <SearchIcon />
          Buscar
        </button>
        <button
          type="button"
          className="flex min-h-12 items-center gap-2 rounded-xl px-3 font-medium ring-1 ring-line"
          onClick={() => {
            openPanel('layers');
          }}
        >
          <LayersIcon />
          Capas
        </button>
      </div>
      <SelectionSheet data={data} />
      {panel === 'search' && <SearchPanel data={data} />}
      {panel === 'layers' && <LayersPanel />}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3 9 5-9 5-9-5 9-5z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}
