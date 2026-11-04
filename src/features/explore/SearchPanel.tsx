import { useDeferredValue, useId, useMemo, useState } from 'react';
import type { SearchResult } from '../../engine/addresses';
import type { AppData } from '../../lib/data';
import { BottomSheet } from '../../ui/BottomSheet';
import { boundsOfStreet } from './describe';
import { useExplore } from './store';

const KIND_TEXT: Record<SearchResult['kind'], string> = {
  street: 'Calle',
  address: 'Dirección',
  corner: 'Esquina',
  landmark: 'Hito',
};

/** Cuánto se acerca el mapa a una dirección, una esquina o un hito. */
const POINT_ZOOM = 16.5;

function detailOf(result: SearchResult): string {
  if (result.kind === 'address' && !result.exact) return 'Altura aproximada';
  return KIND_TEXT[result.kind];
}

export function SearchPanel({ data }: { data: AppData }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => data.addresses.search(deferredQuery), [data, deferredQuery]);
  const select = useExplore((state) => state.select);
  const openPanel = useExplore((state) => state.openPanel);
  const inputId = useId();

  const choose = (result: SearchResult) => {
    if (result.kind === 'street') {
      const street = data.streetByCode.get(result.street);
      if (!street) return;
      select(
        { kind: 'street', street: result.street },
        { bounds: boundsOfStreet(data.graph, street.segments) },
      );
      return;
    }
    const camera = { center: result.point, zoom: POINT_ZOOM };
    if (result.kind === 'address') {
      const { street, point, label } = result;
      select({ kind: 'street', street, point, title: label }, camera);
    } else if (result.kind === 'corner') {
      const { streets, point, label } = result;
      select({ kind: 'corner', streets, point, title: label }, camera);
    } else {
      const { id, point, label } = result;
      select({ kind: 'landmark', id, point, title: label }, camera);
    }
  };

  return (
    <BottomSheet
      title="Buscar"
      full
      onClose={() => {
        openPanel(undefined);
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) choose(results[0]);
        }}
      >
        <label htmlFor={inputId} className="block font-medium">
          Calle, dirección, esquina o hito
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          placeholder="Ej.: una calle y su altura"
          autoComplete="off"
          enterKeyHint="search"
          autoFocus
          className="mt-1 min-h-12 w-full rounded-xl bg-page px-3 text-base ring-1 ring-line"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </form>
      {results.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {results.map((result, i) => (
            <li key={`${result.kind}-${result.label}-${String(i)}`}>
              <button
                type="button"
                className="flex min-h-14 w-full flex-col justify-center py-1 text-left"
                onClick={() => {
                  choose(result);
                }}
              >
                <span className="font-medium">{result.label}</span>
                <span className="text-sm text-muted">{detailOf(result)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        deferredQuery.trim().length >= 2 && (
          <p role="status" className="mt-4 text-muted">
            No encontré nada. Probá con otra forma de escribirlo.
          </p>
        )
      )}
    </BottomSheet>
  );
}
