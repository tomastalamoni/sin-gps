import { Link } from 'wouter';
import { isAppleMobile, isStandalone } from '../../lib/platform';
import { usePwaState, type OfflineStatus } from '../../lib/pwa';
import { assetUrl } from '../../lib/urls';
import { Credits } from '../../ui/Credits';

export function HomeScreen() {
  const { offline } = usePwaState();
  const installed = isStandalone();
  const apple = isAppleMobile(navigator.userAgent, navigator.maxTouchPoints);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="pt-4">
        <img
          src={assetUrl('logo.svg')}
          alt=""
          width={56}
          height={56}
          className="size-14 rounded-2xl"
        />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Sin GPS</h1>
        <p className="mt-2 text-lg text-muted">
          Aprendé las calles, sentidos y alturas del norte de CABA para manejar sin GPS.
        </p>
      </header>

      <section aria-label="Estado de la app" className="mt-8 space-y-3">
        <OfflineNotice status={offline} />
        {!installed && <InstallHint apple={apple} />}
      </section>

      <div className="mt-auto pt-8">
        <Link
          href="/prueba-mapa"
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand px-6 text-lg font-semibold text-on-brand active:opacity-80"
        >
          Ver mapa de prueba
        </Link>
        <footer className="mt-4 text-center text-sm text-muted">
          <Credits />
          <p>
            Versión {__APP_VERSION__} · {__COMMIT__}
          </p>
        </footer>
      </div>
    </main>
  );
}

const OFFLINE_TEXT: Record<OfflineStatus, string> = {
  preparing: 'Preparando para usar sin internet…',
  ready: 'Lista para usar sin internet',
  failed: 'No se pudo guardar para usar sin internet.',
  unsupported: 'Este navegador no puede guardarla para usar sin internet.',
};

const OFFLINE_TONE: Record<OfflineStatus, string> = {
  preparing: 'text-muted',
  ready: 'text-ok',
  failed: 'text-warn',
  unsupported: 'text-warn',
};

function OfflineNotice({ status }: { status: OfflineStatus }) {
  // Un solo contenedor "status" para todos los estados: así el lector de pantalla anuncia el cambio.
  return (
    <div
      role="status"
      className={`rounded-2xl bg-surface p-4 ring-1 ring-line ${OFFLINE_TONE[status]}`}
    >
      <p className="flex items-center gap-3 font-medium">
        {status === 'ready' ? (
          <CheckIcon />
        ) : status === 'preparing' ? (
          <ClockIcon />
        ) : (
          <AlertIcon />
        )}
        {OFFLINE_TEXT[status]}
      </p>
      {status === 'failed' && (
        <button
          type="button"
          className="mt-3 min-h-12 w-full rounded-xl bg-brand px-4 font-semibold text-on-brand active:opacity-80"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

function InstallHint({ apple }: { apple: boolean }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="font-semibold">Instalala en el celu</h2>
      <p className="mt-1 text-muted">
        {apple
          ? 'En Safari, tocá Compartir y después “Agregar a inicio”. La primera vez abrila desde el ícono con internet, así se guarda completa.'
          : 'Abrí el menú del navegador y elegí “Instalar app” o “Agregar a la pantalla principal”.'}
      </p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}
