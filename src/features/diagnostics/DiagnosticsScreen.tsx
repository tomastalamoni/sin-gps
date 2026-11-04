import { useEffect, useState } from 'react';
import { useData } from '../../lib/data';
import { recentErrors, type LoggedError } from '../../lib/errors';
import { shareOrDownload } from '../../lib/files';
import { db } from '../../storage/db';

/** Pantalla oculta (sección 10): se llega tocando cinco veces la versión en el inicio. */
export function DiagnosticsScreen() {
  const data = useData();
  const [errors, setErrors] = useState<LoggedError[]>([]);
  const [seed, setSeed] = useState<unknown>();

  useEffect(() => {
    void recentErrors().then(setErrors);
    void db.meta.get('ultimaSemilla').then((row) => {
      setSeed(row?.value);
    });
  }, []);

  const rows: [string, string][] = [
    ['App', `${__APP_VERSION__} · ${__COMMIT__}`],
    ['Datos', data.meta.version],
    ...Object.entries(data.meta.counts).map(([key, value]): [string, string] => [
      key,
      String(value),
    ]),
    ['Reportes en el celu', String(data.overrides.length)],
    ['Correcciones sin tramo', String(data.orphans)],
    ['Última semilla', seed === undefined ? 'Todavía ninguna' : JSON.stringify(seed)],
  ];

  return (
    <div className="mx-auto max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
      <h1 className="text-2xl font-bold">Diagnóstico</h1>
      <dl className="mt-3 divide-y divide-line">
        {rows.map(([name, value]) => (
          <div key={name} className="flex justify-between gap-4 py-2">
            <dt className="text-muted">{name}</dt>
            <dd className="text-right font-medium break-all">{value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-5 text-xl font-bold">Errores recientes ({errors.length})</h2>
      {errors.length === 0 ? (
        <p className="mt-1 text-muted">No hubo errores.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {errors.map((error) => (
            <li key={`${error.at}-${error.message}`} className="rounded-xl p-3 ring-1 ring-line">
              <p className="text-sm text-muted">
                {error.at} · {error.where}
              </p>
              <p className="break-words">{error.message}</p>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={errors.length === 0}
        className="mt-3 min-h-12 w-full rounded-xl font-medium ring-1 ring-line disabled:opacity-50"
        onClick={() => {
          void shareOrDownload('sin-gps-errores.json', JSON.stringify(errors, null, 2));
        }}
      >
        Exportar errores
      </button>
    </div>
  );
}
