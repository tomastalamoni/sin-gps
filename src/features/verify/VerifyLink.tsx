import { useMemo } from 'react';
import { Link } from 'wouter';
import { useData } from '../../lib/data';
import { pendingStretches } from './list';

/** Aviso del inicio. Se carga aparte para no demorar la primera pantalla. */
export function VerifyLink() {
  const data = useData();
  const count = useMemo(() => pendingStretches(data).length, [data]);
  if (count === 0) return null;
  return (
    <Link
      href="/verificar"
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-surface p-4 font-medium ring-1 ring-line active:opacity-70"
    >
      Para verificar
      <span className="text-muted">
        {count} {count === 1 ? 'tramo' : 'tramos'}
      </span>
    </Link>
  );
}
