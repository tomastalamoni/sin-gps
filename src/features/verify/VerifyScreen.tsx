import { useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import type { Direction } from '../../engine/data';
import { useData, type AppData } from '../../lib/data';
import { shareOrDownload } from '../../lib/files';
import {
  CONFIDENCE_TEXT,
  pointOfStreet,
  stretchHeights,
  streetViewUrl,
} from '../../engine/describe';
import { buildOverridesFile, correctDirection, directionOptions } from '../report/actions';
import { pendingStretches, type PendingStretch } from './list';

const PAGE = 20;
/** Después de responder la lista se corre: un segundo toque no tiene que caer en otro tramo. */
const ANSWER_PAUSE_MS = 600;

const buttonClass =
  'flex min-h-12 flex-1 items-center justify-center rounded-xl px-3 text-center font-medium ring-1 ring-line active:opacity-70';

function PendingItem({
  data,
  item,
  onAnswer,
}: {
  data: AppData;
  item: PendingStretch;
  onAnswer: (item: PendingStretch, dir: Direction) => void;
}) {
  const { street, stretch } = item;
  const point = pointOfStreet(data.graph, stretch.segments);
  const options = directionOptions(
    data.graph,
    street,
    stretch,
    (code) => data.streetByCode.get(code)?.name,
  );
  return (
    <li className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="font-semibold">{street.name}</h2>
      <p className="text-muted">{stretchHeights(stretch)}</p>
      <p className="text-sm text-warn">{CONFIDENCE_TEXT[stretch.confidence]}</p>
      {point && (
        <div className="mt-2 flex gap-2">
          <a className={buttonClass} href={streetViewUrl(point)} target="_blank" rel="noreferrer">
            Street View
          </a>
          <Link className={buttonClass} href={`/mapa/${String(point[0])},${String(point[1])},17`}>
            Ver en el mapa
          </Link>
        </div>
      )}
      <p className="mt-3 font-medium">Lo vi:</p>
      <ul className="mt-1 space-y-2">
        {options.map((option) => (
          <li key={option.dir}>
            <button
              type="button"
              className={`${buttonClass} w-full`}
              onClick={() => {
                onAnswer(item, option.dir);
              }}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function VerifyScreen() {
  const data = useData();
  const items = useMemo(() => pendingStretches(data), [data]);
  const [visible, setVisible] = useState(PAGE);
  const [message, setMessage] = useState('');
  const answering = useRef(false);

  const answer = async ({ street, stretch }: PendingStretch, dir: Direction) => {
    if (answering.current) return;
    answering.current = true;
    try {
      const traps = await correctDirection(data, {
        street: street.code,
        stretch: stretch.id,
        dir,
      });
      setMessage(
        traps > 0
          ? `${street.name}: corregido, pero quedan cuadras sin salida. Revisalo si podés.`
          : `${street.name}: corregido en tu celu.`,
      );
    } catch {
      setMessage(`${street.name}: no se pudo guardar. Probá de nuevo.`);
    }
    setTimeout(() => {
      answering.current = false;
    }, ANSWER_PAUSE_MS);
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
      <h1 className="text-2xl font-bold">Para verificar</h1>
      <p className="mt-1 text-muted">
        {items.length === 0
          ? 'No quedan tramos por verificar.'
          : `Tramos en duda o sin confirmar: ${String(items.length)}. Primero los más usados.`}
      </p>
      <div role="status" className="mt-2 min-h-6 font-medium text-ok">
        {message}
      </div>

      <section aria-label="Mis reportes" className="mt-2">
        <button
          type="button"
          disabled={data.overrides.length === 0}
          className={`${buttonClass} w-full disabled:opacity-50`}
          onClick={() => {
            const text = JSON.stringify(buildOverridesFile(data.overrides), null, 2);
            void shareOrDownload(`sin-gps-reportes-${data.meta.version}.json`, text);
          }}
        >
          Exportar mis reportes ({data.overrides.length})
        </button>
      </section>

      <ul className="mt-4 space-y-3">
        {items.slice(0, visible).map((item) => (
          <PendingItem
            key={item.stretch.id}
            data={data}
            item={item}
            onAnswer={(pending, dir) => {
              void answer(pending, dir);
            }}
          />
        ))}
      </ul>
      {visible < items.length && (
        <button
          type="button"
          className={`${buttonClass} mt-3 w-full`}
          onClick={() => {
            setVisible((count) => count + PAGE);
          }}
        >
          Ver más
        </button>
      )}
    </div>
  );
}
