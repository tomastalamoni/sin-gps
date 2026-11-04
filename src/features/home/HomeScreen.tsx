import { lazy, Suspense, useRef } from 'react';
import { useLocation } from 'wouter';
import { isAppleMobile, isStandalone } from '../../lib/platform';
import { usePwaState, type OfflineStatus } from '../../lib/pwa';
import { assetUrl } from '../../lib/urls';
import { Credits } from '../../ui/Credits';
import { ErrorBoundary } from '../../ui/ErrorBoundary';

// Lee los datos: se carga aparte para que el inicio abra enseguida.
const VerifyLink = lazy(() =>
  import('../verify/VerifyLink').then((m) => ({ default: m.VerifyLink })),
);

/** Cinco toques seguidos en la versión abren el diagnóstico (sección 10). */
const DIAGNOSTICS_TAPS = 5;
const TAP_WINDOW_MS = 3000;

function VersionButton() {
  const [, navigate] = useLocation();
  const taps = useRef<number[]>([]);
  return (
    <button
      type="button"
      className="min-h-12 px-3"
      onClick={(event) => {
        const recent = taps.current.filter((t) => event.timeStamp - t < TAP_WINDOW_MS);
        taps.current = [...recent, event.timeStamp];
        if (taps.current.length >= DIAGNOSTICS_TAPS) navigate('/diagnostico');
      }}
    >
      Versión {__APP_VERSION__} · {__COMMIT__}
    </button>
  );
}

export function HomeScreen() {
  const { offline } = usePwaState();
  const installed = isStandalone();
  const apple = isAppleMobile(navigator.userAgent, navigator.maxTouchPoints);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4">
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
        <ErrorBoundary silent>
          <Suspense fallback={null}>
            <VerifyLink />
          </Suspense>
        </ErrorBoundary>
      </section>

      <footer className="mt-auto pt-8 text-center text-sm text-muted">
        <Credits />
        <VersionButton />
      </footer>
    </div>
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
