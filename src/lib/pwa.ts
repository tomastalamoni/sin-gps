import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { isStandalone } from './platform';

/**
 * Todo el ciclo de vida de la PWA en un solo lugar: el service worker, si la app ya anda sin
 * internet y si hay una versión nueva esperando.
 */
export type OfflineStatus = 'preparing' | 'ready' | 'failed' | 'unsupported';

export interface PwaState {
  offline: OfflineStatus;
  updateAvailable: boolean;
}

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let state: PwaState = { offline: 'preparing', updateAvailable: false };
const listeners = new Set<() => void>();
let updateServiceWorker: (() => Promise<void>) | undefined;

function setState(patch: Partial<PwaState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribe, () => state);
}

/**
 * Registra el service worker. Se llama una sola vez, al arrancar.
 *
 * "Lista para usar sin internet" quiere decir que el service worker ya controla esta página:
 * Workbox lo activa recién cuando guardó todo el precache (si falla un archivo, no se activa), y
 * con clientsClaim toma la página apenas se activa, sin esperar a que se recargue.
 */
export function startPwa(): void {
  if (!('serviceWorker' in navigator)) {
    setState({ offline: 'unsupported' });
    return;
  }

  const serviceWorker = navigator.serviceWorker;
  const markReadyIfControlled = () => {
    if (serviceWorker.controller) setState({ offline: 'ready' });
  };
  markReadyIfControlled();
  serviceWorker.addEventListener('controllerchange', markReadyIfControlled);

  updateServiceWorker = registerSW({
    onNeedRefresh() {
      setState({ updateAvailable: true });
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      watchFirstInstall(registration);
      const check = () => {
        // Sin internet no hay nada que buscar, y si la búsqueda falla se reintenta más tarde.
        if (navigator.onLine) registration.update().catch(() => undefined);
      };
      setInterval(check, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
    onRegisterError(error: unknown) {
      console.error('No se pudo registrar el service worker', error);
      setState({ offline: 'failed' });
    },
  });

  // Lo que importa guardar vive en la app instalada; en una pestaña del navegador no hace falta.
  if (isStandalone()) void requestPersistentStorage();
}

/**
 * Si la primera instalación falla (por ejemplo, se cortó internet a mitad del precache), el
 * navegador descarta el service worker. Sin esto, la app diría "preparando" para siempre.
 */
function watchFirstInstall(registration: ServiceWorkerRegistration): void {
  const worker = registration.installing;
  if (!worker || registration.active) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'redundant' && !registration.active) setState({ offline: 'failed' });
  });
}

/** Pasa a la versión nueva y recarga. Solo cuando lo pide el usuario, nunca en medio de algo. */
export function applyUpdate(): void {
  // workbox-window recarga solo si la página arrancó controlada; cuando la app se instaló en esta
  // misma sesión no es así, y quedaría corriendo el código viejo con el service worker nuevo.
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      window.location.reload();
    },
    { once: true },
  );
  void updateServiceWorker?.();
}

export function dismissUpdate(): void {
  setState({ updateAvailable: false });
}

/** Pide que el navegador no borre lo guardado: el precache y, más adelante, el progreso. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || !('persist' in navigator.storage)) return false;
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
