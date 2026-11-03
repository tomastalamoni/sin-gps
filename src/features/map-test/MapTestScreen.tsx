import { Link } from 'wouter';
import { MapView } from '../../map/MapView';
import { Credits } from '../../ui/Credits';

/** Prueba de la Fase 0: MapLibre con glyphs locales y sin tiles de terceros. */
export function MapTestScreen() {
  return (
    <main className="flex h-dvh flex-col">
      <MapView className="min-h-0 flex-1" label="Mapa de prueba" />
      <nav
        aria-label="Navegación"
        className="border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <Link
          href="/"
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-on-brand active:opacity-80"
        >
          Volver
        </Link>
        <Credits className="text-xs text-muted" />
      </nav>
    </main>
  );
}
