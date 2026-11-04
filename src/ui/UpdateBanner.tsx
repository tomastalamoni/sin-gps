import { useLocation } from 'wouter';
import { applyUpdate, dismissUpdate, usePwaState } from '../lib/pwa';

/**
 * Aviso de versión nueva. La app nunca se actualiza sola: decide el usuario, así nunca se
 * recarga en medio de una sesión.
 */
export function UpdateBanner() {
  const { updateAvailable } = usePwaState();
  const [location] = useLocation();
  // Nunca se actualiza en medio de una sesión (sección 7): el aviso espera a que termine.
  const show = updateAvailable && location !== '/sesion';

  // La región "status" queda siempre montada: los lectores de pantalla anuncian lo que aparece
  // adentro, pero no una región que llega ya con contenido.
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      {show && (
        <div className="pointer-events-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-2xl bg-surface p-4 shadow-lg ring-1 ring-line">
            <p className="min-w-40 flex-1 font-medium">Hay una versión nueva.</p>
            <button
              type="button"
              className="min-h-12 rounded-xl px-4 text-muted"
              onClick={dismissUpdate}
            >
              Más tarde
            </button>
            <button
              type="button"
              className="min-h-12 rounded-xl bg-brand px-5 font-semibold text-on-brand"
              onClick={applyUpdate}
            >
              Actualizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
