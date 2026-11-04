import { create } from 'zustand';
import type { LngLat } from '../../engine/geo';
import type { MapCamera } from '../../map/MapView';
import type { LayerGroup } from '../../map/style';

export type Selection =
  | { kind: 'street'; street: number; point?: LngLat; title?: string }
  | { kind: 'corner'; streets: [number, number]; point: LngLat; title: string }
  | { kind: 'landmark'; id: string; point: LngLat; title: string };

export type CameraRequest = { center: LngLat; zoom: number } | { bounds: [LngLat, LngLat] };

export type Panel = 'search' | 'layers';

interface ExploreState {
  layers: Record<LayerGroup, boolean>;
  panel: Panel | undefined;
  selection: Selection | undefined;
  /** Adónde tiene que ir el mapa. Cambia con cada pedido, aunque sea al mismo lugar. */
  cameraRequest: CameraRequest | undefined;
  /** Dónde quedó el mapa: al volver a la pestaña sigue ahí. */
  camera: MapCamera | undefined;
  toggleLayer: (group: LayerGroup) => void;
  openPanel: (panel: Panel | undefined) => void;
  select: (selection: Selection | undefined, camera?: CameraRequest) => void;
  rememberCamera: (camera: MapCamera) => void;
}

export const useExplore = create<ExploreState>((set) => ({
  layers: { names: true, arrows: true, landmarks: true, rail: true, barrios: true },
  panel: undefined,
  selection: undefined,
  cameraRequest: undefined,
  camera: undefined,
  toggleLayer: (group) => {
    set((state) => ({ layers: { ...state.layers, [group]: !state.layers[group] } }));
  },
  openPanel: (panel) => {
    set({ panel });
  },
  select: (selection, camera) => {
    set({ selection, panel: undefined, ...(camera ? { cameraRequest: camera } : {}) });
  },
  rememberCamera: (camera) => {
    set({ camera });
  },
}));
