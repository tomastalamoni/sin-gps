import { lazy, Suspense } from 'react';
import { Redirect, Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { HomeScreen } from './features/home/HomeScreen';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { UpdateBanner } from './ui/UpdateBanner';

// El mapa se carga aparte: MapLibre pesa y el inicio tiene que abrir rápido.
const MapTestScreen = lazy(() =>
  import('./features/map-test/MapTestScreen').then((m) => ({ default: m.MapTestScreen })),
);

export function App() {
  return (
    <Router hook={useHashLocation}>
      <Screens />
      <UpdateBanner />
    </Router>
  );
}

function Screens() {
  // Con la ruta como key, cambiar de pantalla deja atrás un error anterior.
  const [location] = useLocation();
  return (
    <ErrorBoundary key={location}>
      <Switch>
        <Route path="/">
          <HomeScreen />
        </Route>
        <Route path="/prueba-mapa">
          <Suspense fallback={<LoadingScreen />}>
            <MapTestScreen />
          </Suspense>
        </Route>
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
    </ErrorBoundary>
  );
}

function LoadingScreen() {
  return (
    <p role="status" className="grid min-h-dvh place-items-center text-muted">
      Cargando…
    </p>
  );
}
