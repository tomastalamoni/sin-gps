const linkClass = 'inline-flex min-h-12 items-center underline underline-offset-2';

/** Créditos de los datos, siempre visibles (sección 8 del plan). */
export function Credits({ className = '' }: { className?: string }) {
  return (
    <p className={`flex flex-wrap justify-center gap-x-4 ${className}`}>
      <a
        className={linkClass}
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap contributors
      </a>
      <a
        className={linkClass}
        href="https://data.buenosaires.gob.ar/"
        target="_blank"
        rel="noreferrer"
      >
        Datos: Buenos Aires Data (GCBA)
      </a>
    </p>
  );
}
