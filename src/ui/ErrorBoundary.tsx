import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'wouter';

interface Props {
  children: ReactNode;
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
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 text-center">
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
      </main>
    );
  }
}
