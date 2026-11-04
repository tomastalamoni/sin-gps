import type { LayerGroup } from '../../map/style';
import { BottomSheet } from '../../ui/BottomSheet';
import { useExplore } from './store';

const GROUPS: { group: LayerGroup; label: string }[] = [
  { group: 'names', label: 'Nombres de calles' },
  { group: 'arrows', label: 'Flechas de sentido' },
  { group: 'landmarks', label: 'Hitos' },
  { group: 'rail', label: 'Vías del tren' },
  { group: 'barrios', label: 'Límites de barrio' },
];

export function LayersPanel() {
  const layers = useExplore((state) => state.layers);
  const toggleLayer = useExplore((state) => state.toggleLayer);
  const openPanel = useExplore((state) => state.openPanel);

  return (
    <BottomSheet
      title="Capas"
      onClose={() => {
        openPanel(undefined);
      }}
    >
      <ul>
        {GROUPS.map(({ group, label }) => (
          <li key={group}>
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="size-6 accent-brand"
                checked={layers[group]}
                onChange={() => {
                  toggleLayer(group);
                }}
              />
              {label}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted">
        Las flechas punteadas con “?” son sentidos en duda: todavía no se preguntan.
      </p>
    </BottomSheet>
  );
}
