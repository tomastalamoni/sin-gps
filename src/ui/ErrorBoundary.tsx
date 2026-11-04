import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'wouter';
import { logError } from '../lib/errors';

interface Props {
  children: ReactNode;
  /** Algo accesorio: si falla, desaparece sin tapar el resto de la pantalla. */
  silent?: boolean;
}

interface State {
  failed: boolean;
}

/**
 * Si una pantalla falla (por ejemplo, no se pudo cargar el mapa), muestra cómo seguir en vez de
 * dejar la app en blanco: instalada en el iPhone no hay botón para recargar.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Falló una pantalla', error, info.componentStack);
    void logError(error, 'pantalla');
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null;
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 px-5 text-center">
        <h1 className="text-2xl font-bold">Algo salió mal</h1>
        <p className="text-muted">Probá de nuevo. Si sigue pasando, volvé al inicio.</p>
        <button
          type="button"
          className="min-h-14 rounded-2xl bg-brand px-6 text-lg font-semibold text-on-brand active:opacity-80"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reintentar
        </button>
        <Link href="/" className="flex min-h-12 items-center justify-center text-muted underline">
          Volver al inicio
        </Link>
      </div>
    );
  }
}
