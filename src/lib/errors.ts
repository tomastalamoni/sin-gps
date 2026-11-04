/**
 * Registro de errores en el celu (sección 10). No hay telemetría: nada sale del teléfono salvo que
 * se exporte a mano desde el diagnóstico.
 */
import { db } from '../storage/db';

export interface LoggedError {
  at: string;
  where: string;
  message: string;
  stack?: string;
}

const KEY = 'errores';
const MAX_ERRORS = 50;

export async function recentErrors(): Promise<LoggedError[]> {
  const row = await db.meta.get(KEY);
  return (row?.value as LoggedError[] | undefined) ?? [];
}

export async function logError(error: unknown, where: string): Promise<void> {
  const entry: LoggedError = {
    at: new Date().toISOString(),
    where,
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
  };
  try {
    const errors = await recentErrors();
    await db.meta.put({ key: KEY, value: [entry, ...errors].slice(0, MAX_ERRORS) });
  } catch {
    // Si no se puede guardar el error, no hay mucho más para hacer: que no genere otro.
  }
}

/** Registra también lo que no atrapa nadie. */
export function startErrorLog(): void {
  window.addEventListener('error', (event) => {
    void logError(event.error ?? event.message, 'ventana');
  });
  window.addEventListener('unhandledrejection', (event) => {
    void logError(event.reason, 'promesa');
  });
}
